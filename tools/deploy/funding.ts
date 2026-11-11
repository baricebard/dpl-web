import { createPublicClient, custom, encodeFunctionData, erc20Abi, getAddress, isAddress, isHash, numberToHex, type Hex } from 'viem'
import { sepolia } from 'viem/chains'
import type { WalletProvider } from '../../src/lib/web3/provider.ts'
import { DEPLOYER, SEPOLIA_CHAIN_ID } from './config.ts'
import { RESERVES, type ReserveId } from './exchange-config.ts'
import { deadline, rejected, type DeploymentArtifact, type DeploymentTool, type Journal, type Status } from './engine.ts'

export const FUNDING_KEY = `dpl-exchange-funding-v1:${DEPLOYER}`
type Attempt = {
  token: ReserveId; address: Hex; amount: string; data: Hex; status: Status; hash?: Hex
  rejected?: boolean; receiptStatus?: 'success' | 'reverted'; blockNumber?: string; checkedAt?: string; message?: string
}
type Prepared = { token: ReserveId; address: Hex; amount: bigint; data: Hex; gas: bigint; gasPrice: bigint; at: number; revision: number }
const json = (v: unknown) => JSON.stringify(v, (_, x) => typeof x === 'bigint' ? x.toString() : x, 2)

/** Uses the same provider, durable-before-send journal and UI Web Lock as deployment. */
export function createFundingTool(provider: WalletProvider, artifact: DeploymentArtifact, deployment: DeploymentTool, journal: Journal, receiptTimeout = 60000) {
  const client = createPublicClient({ chain: sepolia, transport: custom({ request: args => deadline(provider.request(args)) }, { retryCount: 0 }) })
  let attempts: Attempt[] = []
  let balances: Partial<Record<ReserveId, bigint>> = {}
  let prepared: Prepared | undefined
  let busy = false, revision = 0
  let owner: string | undefined, paused: boolean | undefined
  const listeners = new Set<() => void>()
  let snapshot = { attempts, balances, prepared, busy, owner, paused }
  function notify() { snapshot = { attempts: [...attempts], balances: { ...balances }, prepared, busy, owner, paused }; listeners.forEach(fn => fn()) }
  function readJournal(): Attempt[] {
    const raw = journal.read()
    if (!raw) return []
    const stored = JSON.parse(raw)
    if (stored.version !== 1 || stored.chainId !== SEPOLIA_CHAIN_ID || stored.deployer !== DEPLOYER || !Array.isArray(stored.attempts)) throw new Error('庫存紀錄不相容，停止操作')
    for (const a of stored.attempts as Attempt[]) {
      const token = RESERVES.find(t => t.id === a.token)
      if (!token || !isAddress(a.address) || !/^\d+$/.test(a.amount) || BigInt(a.amount) <= 0n || BigInt(a.amount) > token.target ||
          a.data !== encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [a.address, BigInt(a.amount)] }) ||
          !['等待 MetaMask 簽署', '已送出交易', '等待 Receipt', '成功', '失敗', '結果未知'].includes(a.status) ||
          (a.rejected === true && (a.hash !== undefined || a.receiptStatus !== undefined || a.status !== '失敗')) ||
          (a.hash !== undefined && !isHash(a.hash)) || (a.status === '成功' && (!a.hash || a.receiptStatus !== 'success')) ||
          (a.status === '失敗' && a.receiptStatus !== 'reverted' && a.rejected !== true)) throw new Error('庫存紀錄損壞，停止操作')
    }
    return stored.attempts
  }
  attempts = readJournal().map(a => ['成功', '失敗'].includes(a.status) ? a : { ...a, status: '結果未知' })
  function persist() { journal.write(json({ version: 1, chainId: SEPOLIA_CHAIN_ID, deployer: DEPLOYER, attempts })) }
  function patch(index: number, value: Partial<Attempt>) { attempts = attempts.map((a, i) => i === index ? { ...a, ...value } : a); persist(); notify() }
  function invalidate() { revision++; prepared = undefined; balances = {}; owner = undefined; paused = undefined; notify() }
  provider.on('accountsChanged', invalidate); provider.on('chainChanged', invalidate); provider.on('disconnect', invalidate)
  async function identity() {
    const [accounts, chain] = await Promise.all([deadline(provider.request({ method: 'eth_accounts' })), deadline(provider.request({ method: 'eth_chainId' }))])
    if (!Array.isArray(accounts) || typeof accounts[0] !== 'string' || !isAddress(accounts[0]) || getAddress(accounts[0]) !== DEPLOYER || Number(chain) !== SEPOLIA_CHAIN_ID) throw new Error('必須使用指定教師帳號及 Sepolia 11155111')
  }
  async function verifiedAddress() {
    await identity()
    if (deployment.getSnapshot().busy) throw new Error('部署查詢進行中')
    await deployment.reconcile('exchange')
    const record = deployment.getSnapshot().records.exchange
    if (record.status !== '成功' || !record.contractAddress || !isAddress(record.contractAddress)) throw new Error('Exchange 未驗證，停止注入')
    return getAddress(record.contractAddress)
  }
  async function reserves(address: Hex) {
    // Erase stale data before querying. Never interpret an RPC error as zero.
    const version = revision
    balances = {}; owner = undefined; paused = undefined; notify()
    const read = (functionName: string, args?: readonly unknown[]) => client.readContract({ address, abi: artifact.abi, functionName, args })
    const [o, p, ...values] = await Promise.all([read('owner'), read('paused'), ...RESERVES.map(t => read('reserveOf', [t.address]))])
    if (typeof o !== 'string' || getAddress(o) !== DEPLOYER || typeof p !== 'boolean' || values.some(v => typeof v !== 'bigint' || v < 0n)) throw new Error('庫存／管理權未驗證')
    await identity()
    if (version !== revision) throw new Error('錢包已變更，庫存未驗證')
    owner = o; paused = p
    balances = Object.fromEntries(RESERVES.map((t, i) => [t.id, values[i]]))
    notify()
  }
  const unresolved = (a: Attempt) => a.status !== '成功' && !(a.status === '失敗' && (a.receiptStatus === 'reverted' || a.rejected === true))
  async function refresh() {
    if (busy) return
    busy = true; prepared = undefined; notify()
    try { await reserves(await verifiedAddress()) } catch (e) { balances = {}; owner = undefined; paused = undefined; throw e } finally { busy = false; notify() }
  }
  async function estimate(tokenId: ReserveId): Promise<Prepared> {
    const address = await verifiedAddress()
    await reserves(address)
    const token = RESERVES.find(t => t.id === tokenId)!
    const amount = token.target - balances[tokenId]!
    if (amount <= 0n) throw new Error('庫存已達目標，不提供初始注入')
    const data = encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [address, amount] })
    const [estimate, gasPrice, eth, balance] = await Promise.all([
      client.estimateGas({ account: DEPLOYER, to: token.address, data, value: 0n }), client.getGasPrice(), client.getBalance({ address: DEPLOYER }),
      client.readContract({ address: token.address, abi: erc20Abi, functionName: 'balanceOf', args: [DEPLOYER] }),
    ])
    const gas = (estimate * 120n + 99n) / 100n
    if (gas <= 0n || gasPrice <= 0n || eth < gas * gasPrice || balance < amount) throw new Error('教師 ETH／代幣餘額不足')
    return { token: tokenId, address, amount, data, gas, gasPrice, at: Date.now(), revision }
  }
  async function prepare(token: ReserveId) {
    if (busy) return
    busy = true; prepared = undefined; balances = {}; owner = undefined; paused = undefined; const version = revision; notify()
    try {
      attempts = readJournal()
      if (attempts.some(unresolved)) throw new Error('先查詢未知交易原 Hash 及 reserveOf，禁止新注入')
      const p = await estimate(token)
      if (version !== revision) throw new Error('錢包已變更，請重新準備')
      prepared = p
    } finally { busy = false; notify() }
  }
  async function track(index: number, hash: Hex) {
    const a = attempts[index], token = RESERVES.find(t => t.id === a.token)!
    try {
      await identity()
      const original = await client.getTransaction({ hash })
      if (!original.to || getAddress(original.to) !== token.address || getAddress(original.from) !== DEPLOYER || original.input !== a.data || original.value !== 0n) throw new Error('原 Hash 與本筆注入不符')
      patch(index, { hash, status: '等待 Receipt' })
      const r = await client.waitForTransactionReceipt({ hash, timeout: receiptTimeout, pollingInterval: 1000, retryCount: 0, checkReplacement: false })
      const tx = await client.getTransaction({ hash })
      if (r.transactionHash.toLowerCase() !== hash.toLowerCase() || getAddress(r.from) !== DEPLOYER || !r.to || getAddress(r.to) !== token.address || getAddress(tx.from) !== DEPLOYER || !tx.to || getAddress(tx.to) !== token.address || tx.input !== a.data || tx.value !== 0n) throw new Error('注入交易身分不符')
      // Reconcile receipt AND reserves before allowing another operation, including reverted transfers.
      await reserves(await verifiedAddress())
      patch(index, { hash, status: r.status === 'success' ? '成功' : '失敗', receiptStatus: r.status, blockNumber: r.blockNumber.toString(), checkedAt: new Date().toISOString(), message: r.status === 'success' ? 'Receipt 與三種 reserveOf 已查詢' : '交易 revert；未注入，請重新查詢後準備' })
    } catch { balances = {}; patch(index, { status: '結果未知', message: '未驗證：請查原 Hash 與 reserveOf；不自動重送' }) }
  }
  async function confirm() {
    if (busy) return
    const p = prepared
    if (!p) throw new Error('請先準備並確認本筆注入')
    busy = true; prepared = undefined; let index = -1; let submitted = false; notify()
    try {
      attempts = readJournal()
      if (attempts.some(unresolved)) throw new Error('未知交易禁止新注入')
      if (p.revision !== revision || Date.now() - p.at > 300000) throw new Error('確認已失效')
      const version = revision, fresh = await estimate(p.token)
      if (fresh.data !== p.data || fresh.address !== p.address || fresh.gas > p.gas || fresh.gasPrice > p.gasPrice) throw new Error('庫存／Gas 已變更，請重新準備')
      await identity()
      if (version !== revision) throw new Error('錢包已變更')
      index = attempts.length
      attempts = [...attempts, { token: p.token, address: p.address, amount: p.amount.toString(), data: p.data, status: '等待 MetaMask 簽署' }]
      persist(); submitted = true; notify()
      const hash = await deadline(provider.request({ method: 'eth_sendTransaction', params: [{ from: DEPLOYER, to: RESERVES.find(t => t.id === p.token)!.address, chainId: numberToHex(SEPOLIA_CHAIN_ID), data: p.data, value: '0x0', gas: numberToHex(p.gas), gasPrice: numberToHex(p.gasPrice) }] }), 120000)
      if (typeof hash !== 'string' || !isHash(hash)) throw new Error('Invalid hash')
      patch(index, { hash, status: '已送出交易' })
      await track(index, hash)
    } catch (e) {
      if (submitted && rejected(e)) patch(index, { status: '失敗', rejected: true, message: '使用者拒絕簽署，未送出交易，可重新準備' })
      else if (submitted) patch(index, { status: '結果未知', message: '送出結果未知，先查 MetaMask 原 Hash，禁止重送' })
      throw e
    } finally { busy = false; notify() }
  }
  async function reconcile(index: number, suppliedHash?: string) {
    if (busy) return
    attempts = readJournal()
    const a = attempts[index], hash = a?.hash ?? suppliedHash
    if (!a || !hash || !isHash(hash)) throw new Error('請提供原 Hash')
    busy = true; prepared = undefined; notify()
    try { await track(index, hash) } finally { busy = false; notify() }
  }
  notify()
  return {
    refresh, prepare, confirm, reconcile, getSnapshot: () => snapshot,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } },
    exportRecord: () => json({ version: 1, chainId: SEPOLIA_CHAIN_ID, deployer: DEPLOYER, targets: RESERVES, attempts, reserves: balances, owner, paused, exportedAt: new Date().toISOString() }),
    destroy() { provider.removeListener('accountsChanged', invalidate); provider.removeListener('chainChanged', invalidate); provider.removeListener('disconnect', invalidate); listeners.clear() },
  }
}
export type FundingTool = ReturnType<typeof createFundingTool>
