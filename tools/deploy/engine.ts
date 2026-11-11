import {
  createPublicClient, custom, encodeDeployData, getAddress, isAddress, isHash,
  keccak256, numberToHex, type Abi, type Hex, type TransactionReceipt,
} from 'viem'
import { sepolia } from 'viem/chains'
import type { WalletProvider } from '../../src/lib/web3/provider.ts'
import { constructorArgs, DEPLOYER, INITIAL_SUPPLY, SEPOLIA_CHAIN_ID, TOKENS, type TokenId } from './config.ts'

import { EXCHANGE_ARGS } from './exchange-config.ts'

export type DeploymentId = TokenId | 'exchange'
export interface DeploymentArtifact {
  abi: Abi; bytecode: Hex; deployedBytecode: Hex
  provenance: { commit: string; compiler: string; openZeppelin: string; [key: string]: unknown }
}
export type Status = '尚未部署' | '等待使用者確認' | '等待 MetaMask 簽署' | '已送出交易' | '等待 Receipt' | '成功' | '失敗' | '結果未知'
class DeploymentCheckError extends Error {}

export interface RecordEntry {
  receiptStatus?: 'success' | 'reverted'
  status: Status; hash?: Hex; contractAddress?: string; blockNumber?: string; blockHash?: Hex
  gasUsed?: string; effectiveGasPrice?: string; checkedAt?: string; deployedAt?: string; message?: string
  // Any attempt locks this token permanently, except explicit wallet rejection (4001).
  attempted?: boolean
  provenance?: DeploymentArtifact['provenance']; deploymentDataHash?: Hex
}
interface Prepared { data: Hex; gas: bigint; gasPrice: bigint; balance: bigint; revision: number; at: number }
export const JOURNAL_KEY = `dpl-sepolia-deployment-v1:${DEPLOYER}`
export interface Journal { read(): string | null; write(value: string): void }
const empty = (): Record<DeploymentId, RecordEntry> => Object.fromEntries([...TOKENS, { id: 'exchange' }].map(t => [t.id, { status: '尚未部署' }])) as Record<DeploymentId, RecordEntry>
const json = (value: unknown) => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2)
const statuses: Status[] = ['尚未部署', '等待使用者確認', '等待 MetaMask 簽署', '已送出交易', '等待 Receipt', '成功', '失敗', '結果未知']
export function rejected(error: unknown): boolean {
  if (typeof error !== 'object' || !error) return false
  if ('code' in error && error.code === 4001) return true
  return 'cause' in error && rejected(error.cause)
}
export function deadline<T>(operation: Promise<T>, milliseconds = 12000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('RPC timeout')), milliseconds)
    operation.then(v => { clearTimeout(timer); resolve(v) }, e => { clearTimeout(timer); reject(e) })
  })
}

export function createDeploymentTool(provider: WalletProvider, artifact: DeploymentArtifact, journal: Journal, receiptTimeout = 60000, mode: 'tokens' | 'exchange' = 'tokens') {
  // This transport has no HTTP endpoint, signer, automatic send retry or fallback wallet.
  const client = createPublicClient({ chain: sepolia, transport: custom({ request: args => deadline(provider.request(args)) }, { retryCount: 0 }) })
  const items = mode === 'exchange' ? [{ id: 'exchange' as const }] : TOKENS
  const argsFor = (id: DeploymentId) => {
    if (!items.some(t => t.id === id)) throw new DeploymentCheckError('部署種類不符')
    return id === 'exchange' ? EXCHANGE_ARGS : constructorArgs(id)
  }
  let records = empty()
  let prepared: Partial<Record<DeploymentId, Prepared>> = {}
  let revision = 0
  let busy = false
  let connected = false
  let balance: bigint | undefined
  const listeners = new Set<() => void>()
  let snapshot = { records, busy, connected, balance, prepared }
  function notify() {
    snapshot = { records: { ...records }, busy, connected, balance, prepared: { ...prepared } }
    listeners.forEach(listener => listener())
  }
  function readJournal(restoring = false) {
    const raw = journal.read()
    if (!raw) return empty()
    const stored = JSON.parse(raw)
    if (stored.chainId !== SEPOLIA_CHAIN_ID || stored.deployer !== DEPLOYER || stored.version !== 1 || (stored.mode ?? 'tokens') !== mode) throw new DeploymentCheckError('部署紀錄不相容；請先人工核對，勿清除後重送')
    const result = empty()
    for (const { id } of items) {
      const r = stored.records[id] as RecordEntry
      if (!r || !statuses.includes(r.status) || (r.hash && !isHash(r.hash)) || (r.contractAddress && !isAddress(r.contractAddress))) throw new DeploymentCheckError('部署紀錄損壞，停止部署')
      if ((r.attempted !== undefined && typeof r.attempted !== 'boolean') || (r.hash && !r.attempted) || (['等待 MetaMask 簽署', '已送出交易', '等待 Receipt', '成功', '結果未知'].includes(r.status) && !r.attempted)) throw new DeploymentCheckError('部署紀錄狀態不一致，停止部署')
      result[id] = { ...r }
      if (r.attempted && ((restoring && mode === 'exchange' && r.status === '成功') || !['成功', '失敗'].includes(r.status))) result[id].status = '結果未知'
      if (!r.attempted) result[id].status = '尚未部署'
    }
    return result
  }
  records = readJournal(true) // Fail closed if storage is corrupted/unavailable.
  function persist() {
    journal.write(json({ version: 1, chainId: SEPOLIA_CHAIN_ID, deployer: DEPLOYER, mode, records }))
  }
  function set(id: DeploymentId, patch: Partial<RecordEntry>) {
    records = { ...records, [id]: { ...records[id], ...patch } }
    persist(); notify()
  }
  function invalidate() { revision++; prepared = {}; connected = false; balance = undefined; notify() }
  provider.on('accountsChanged', invalidate)
  provider.on('chainChanged', invalidate)
  provider.on('disconnect', invalidate)
  async function identity() {
    const [accounts, chain] = await Promise.all([
      deadline(provider.request({ method: 'eth_accounts' })), deadline(provider.request({ method: 'eth_chainId' })),
    ])
    if (!Array.isArray(accounts) || typeof accounts[0] !== 'string' || !isAddress(accounts[0]) || getAddress(accounts[0]) !== DEPLOYER) throw new DeploymentCheckError('MetaMask 當前帳號必須等於指定部署者；不會改用其他帳號')
    if (typeof chain !== 'string' || !/^0x[\da-f]+$/i.test(chain) || Number(chain) !== SEPOLIA_CHAIN_ID) throw new DeploymentCheckError('網路必須為 Ethereum Sepolia 11155111')
  }
  async function connect() {
    if (busy) return
    busy = true; notify()
    try {
      await deadline(provider.request({ method: 'eth_requestAccounts' }), 120000)
      await identity()
      balance = await client.getBalance({ address: DEPLOYER })
      connected = true
    } finally { busy = false; notify() }
  }
  const dataFor = (id: DeploymentId) => encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode, args: argsFor(id) })
  async function estimate(id: DeploymentId) {
    await identity()
    const data = dataFor(id)
    const [estimate, gasPrice, eth] = await Promise.all([
      client.estimateGas({ account: DEPLOYER, data, value: 0n }), client.getGasPrice(), client.getBalance({ address: DEPLOYER }),
    ])
    // Explicit gas and legacy gasPrice cap the transaction fee; 20% gas margin.
    const gas = (estimate * 120n + 99n) / 100n
    if (gasPrice <= 0n || gas <= 0n || eth < gas * gasPrice) throw new DeploymentCheckError('Sepolia ETH 不足以支付預估 Gas 費用')
    balance = eth
    return { data, gas, gasPrice, balance: eth, revision, at: Date.now() }
  }
  async function prepare(id: DeploymentId) {
    if (busy) return
    records = readJournal()
    if (records[id].attempted) throw new DeploymentCheckError('此代幣已有部署嘗試；僅可查詢原交易')
    busy = true; const version = revision; notify()
    try {
      if (!connected) throw new DeploymentCheckError('請先明確連接並確認 MetaMask')
      const p = await estimate(id)
      if (version !== revision) throw new DeploymentCheckError('帳號或網路已變更，請重新連接及準備')
      prepared = { [id]: p } // Only one independent confirmation at a time.
      set(id, { status: '等待使用者確認', message: undefined })
    } catch (error) {
      set(id, { status: '失敗', message: error instanceof DeploymentCheckError ? error.message : '準備失敗，請確認 MetaMask／RPC；未送出交易' })
      throw error
    } finally { busy = false; notify() }
  }
  async function verifyReceipt(id: DeploymentId, hash: Hex, receipt: TransactionReceipt) {
    if (receipt.transactionHash.toLowerCase() !== hash.toLowerCase() || getAddress(receipt.from) !== DEPLOYER || receipt.to !== null) throw new DeploymentCheckError('Receipt 交易身分不符')
    const tx = await client.getTransaction({ hash })
    if (tx.to !== null || getAddress(tx.from) !== DEPLOYER || tx.value !== 0n || tx.input !== dataFor(id)) throw new DeploymentCheckError('鏈上交易參數不符')
    const details = { receiptStatus: receipt.status, blockNumber: receipt.blockNumber.toString(), blockHash: receipt.blockHash, gasUsed: receipt.gasUsed.toString(), effectiveGasPrice: receipt.effectiveGasPrice.toString(), checkedAt: new Date().toISOString() }
    if (receipt.status === 'reverted') { set(id, { ...details, status: '失敗', message: 'Receipt revert；不自動重送' }); return }
    if (!receipt.contractAddress || !isAddress(receipt.contractAddress)) throw new DeploymentCheckError('缺少 contractAddress')
    const address = getAddress(receipt.contractAddress)
    if (id === 'exchange') {
      // Latest-state checks only: no archive RPC, bytecode or metadata audit.
      const code = await client.getCode({ address })
      if (!code || code === '0x') throw new DeploymentCheckError('Exchange 地址沒有合約')
      const read = (functionName: string, args?: readonly unknown[]) => client.readContract({ address, abi: artifact.abi, functionName, args })
      const values = await Promise.all(['dplt', 'assetA', 'assetB', 'owner', 'paused'].map(name => read(name)))
      if (values.slice(0, 4).some((v, i) => typeof v !== 'string' || getAddress(v) !== EXCHANGE_ARGS[i]) || values[4] !== false) throw new DeploymentCheckError('Exchange Token／owner／paused 未驗證')
      const pairs = [[0, 1, 30n * 10n ** 18n], [0, 2, 20n * 10n ** 18n / 3n], [1, 0, 10n ** 18n / 30n], [1, 2, 2n * 10n ** 18n / 9n], [2, 0, 3n * 10n ** 18n / 20n], [2, 1, 9n * 10n ** 18n / 2n]] as const
      for (const [i, j, expected] of pairs) {
        if (await read('quote', [EXCHANGE_ARGS[i], EXCHANGE_ARGS[j], 10n ** 18n]) !== expected) throw new DeploymentCheckError('固定匯率未驗證')
      }
      await identity()
      const block = await client.getBlock({ blockNumber: receipt.blockNumber })
      set(id, { ...details, status: '成功', contractAddress: address, deployedAt: new Date(Number(block.timestamp) * 1000).toISOString(), message: '必要鏈上檢查通過；不代表最終性' })
      return
    }
    const code = await client.getCode({ address, blockNumber: receipt.blockNumber })
    if (!code || code.toLowerCase() !== artifact.deployedBytecode.toLowerCase()) throw new DeploymentCheckError('鏈上 runtime bytecode 不符')
    const read = (functionName: string, args?: readonly unknown[]) => client.readContract({ address, abi: artifact.abi, functionName, args, blockNumber: receipt.blockNumber })
    const [name, symbol, decimals, supply, holderBalance] = await Promise.all([
      read('name'), read('symbol'), read('decimals'), read('totalSupply'), read('balanceOf', [DEPLOYER]),
    ])
    const args = constructorArgs(id)
    if (name !== args[0] || symbol !== args[1] || decimals !== 18 || supply !== INITIAL_SUPPLY || holderBalance !== INITIAL_SUPPLY) throw new DeploymentCheckError('部署後 metadata／供給／持有人餘額不符')
    await identity()
    set(id, { ...details, status: '成功', contractAddress: address, message: 'Receipt、code 與部署區塊狀態已核對；仍須後續確認及 Etherscan 驗證' })
  }
  async function track(id: DeploymentId, hash: Hex) {
    try {
      await identity()
      set(id, { status: '等待 Receipt' })
      const receipt = await client.waitForTransactionReceipt({ hash, timeout: receiptTimeout, pollingInterval: 1000, retryCount: 0, checkReplacement: false })
      await verifyReceipt(id, hash, receipt)
    } catch {
      set(id, { status: '結果未知', message: '未驗證：Receipt／鏈上核對未完成，請查詢原 Hash；禁止重新送出' })
    }
  }
  async function confirm(id: DeploymentId) {
    if (busy) return
    const p = prepared[id]
    records = readJournal() // Cross-tab guard; UI also holds a Web Lock.
    if (!p || records[id].attempted) throw new DeploymentCheckError('請重新準備；已有交易時禁止重送')
    busy = true; notify()
    let submitted = false
    try {
      if (!connected || p.revision !== revision || Date.now() - p.at > 300000) throw new DeploymentCheckError('確認已過期，請重新準備')
      const version = revision
      const fresh = await estimate(id)
      if (fresh.data !== p.data || fresh.gas > p.gas || fresh.gasPrice > p.gasPrice) throw new DeploymentCheckError('Gas 或交易資料已變更，請重新準備確認')
      // Last asynchronous check before the actual EIP-1193 request.
      await identity()
      if (version !== revision) throw new DeploymentCheckError('錢包已變更，請重新準備')
      const tx = { from: DEPLOYER, chainId: numberToHex(SEPOLIA_CHAIN_ID), data: dataFor(id), value: '0x0', gas: numberToHex(p.gas), gasPrice: numberToHex(p.gasPrice) }
      if ('to' in tx || tx.value !== '0x0' || tx.data !== p.data || argsFor(id)[id === 'exchange' ? 3 : 2] !== DEPLOYER) throw new DeploymentCheckError('Contract creation invariant failed')
      // Durable write BEFORE send: crashes, reloads and uncertain send errors never permit a retry.
      set(id, { status: '等待 MetaMask 簽署', attempted: true, message: undefined, provenance: artifact.provenance, deploymentDataHash: keccak256(tx.data) })
      submitted = true
      prepared = {}
      const hash = await deadline(provider.request({ method: 'eth_sendTransaction', params: [tx] }), 120000)
      if (typeof hash !== 'string' || !isHash(hash)) throw new DeploymentCheckError('Invalid transaction hash')
      set(id, { status: '已送出交易', hash })
      await track(id, hash)
    } catch (error) {
      const denied = submitted && rejected(error)
      set(id, {
        status: submitted && !denied ? '結果未知' : '失敗', attempted: submitted && !denied,
        message: denied ? '使用者拒絕簽署，未送出交易，可重新準備' : submitted ? '送出結果未知；先查 MetaMask 活動，禁止重送' : error instanceof DeploymentCheckError ? error.message : '預檢失敗，未送出交易',
      })
    } finally { busy = false; notify() }
  }
  async function reconcile(id: DeploymentId, suppliedHash?: string) {
    if (busy) return
    records = readJournal()
    const hash = records[id].hash ?? suppliedHash
    if (!records[id].attempted || !hash || !isHash(hash)) throw new DeploymentCheckError('請提供原交易的有效 Hash')
    busy = true; notify()
    try {
      await identity()
      const tx = await client.getTransaction({ hash })
      if (tx.to !== null || getAddress(tx.from) !== DEPLOYER || tx.value !== 0n || tx.input !== dataFor(id)) throw new DeploymentCheckError('原交易與此代幣部署參數不符')
      set(id, { hash })
      await track(id, hash)
    } finally { busy = false; notify() }
  }
  notify()
  return {
    connect, prepare, confirm, reconcile, getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    exportRecord: () => json({ version: 1, chainId: SEPOLIA_CHAIN_ID, deployer: DEPLOYER, initialHolder: DEPLOYER, mode, exchange: mode === 'exchange' ? { contract: 'DPLFixedExchange', constructorArgs: EXCHANGE_ARGS } : undefined, tokens: mode === 'tokens' ? TOKENS.map(t => ({ ...t, constructorArgs: constructorArgs(t.id), deploymentDataHash: keccak256(dataFor(t.id)) })) : undefined, provenance: artifact.provenance, records }),
    destroy() { provider.removeListener('accountsChanged', invalidate); provider.removeListener('chainChanged', invalidate); provider.removeListener('disconnect', invalidate); listeners.clear() },
  }
}
export type DeploymentTool = ReturnType<typeof createDeploymentTool>
