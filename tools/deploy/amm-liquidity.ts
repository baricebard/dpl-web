import { createPublicClient, custom, decodeEventLog, encodeFunctionData, erc20Abi, getAddress, isAddress, isHash, numberToHex, type Hex } from 'viem'
import { sepolia } from 'viem/chains'
import type { WalletProvider } from '../../src/lib/web3/provider.ts'
import { DEPLOYER, SEPOLIA_CHAIN_ID } from './config.ts'
import { AMM_ARGS, AMM_TOKENS, LOCKED_ADDRESS, LP_LOCKED, LP_TEACHER, LP_TOTAL, liquidityArgs } from './amm-config.ts'
import { deadline, rejected, type DeploymentArtifact, type DeploymentTool, type Journal } from './engine.ts'

type Operation = 'approveDPLT' | 'approveA' | 'addLiquidity'
type Attempt = { operation: Operation; pool: Hex; to: Hex; data: Hex; expires?: string; hash?: Hex; status: 'unknown' | 'success' | 'reverted' | 'rejected'; receiptStatus?: string; blockNumber?: string; checkedAt?: string; eventVerified?: boolean; message?: string }
type Prepared = { operation: Operation; pool: Hex; to: Hex; data: Hex; expires?: bigint; gas: bigint; gasPrice: bigint; at: number; revision: number }
type PoolState = { pool: Hex; supply: bigint; reserves: readonly bigint[]; actual: bigint[]; teacher: bigint[]; allowances: bigint[]; teacherLP: bigint; lockedLP: bigint; initialized: boolean; immediateExpected: boolean; checkedAt: string }
const json = (v: unknown) => JSON.stringify(v, (_, x) => typeof x === 'bigint' ? x.toString() : x, 2)
const operations: Operation[] = ['approveDPLT', 'approveA', 'addLiquidity']

/** One explicit operation per confirmation. No transfer, automatic approve, retries or replacement. */
export function createAMMLiquidityTool(provider: WalletProvider, artifact: DeploymentArtifact, deployment: DeploymentTool, journal: Journal, receiptTimeout = 60000) {
  const client = createPublicClient({ chain: sepolia, transport: custom({ request: args => deadline(provider.request(args)) }, { retryCount: 0 }) })
  let busy = false, revision = 0
  let prepared: Prepared | undefined, state: PoolState | undefined
  const listeners = new Set<() => void>()
  function readJournal(): Attempt[] {
    const raw = journal.read()
    if (!raw) return []
    const stored = JSON.parse(raw)
    if (stored.version !== 1 || stored.chainId !== SEPOLIA_CHAIN_ID || stored.teacher !== DEPLOYER || !Array.isArray(stored.attempts)) throw new Error('AMM 紀錄不相容；停止操作')
    for (const a of stored.attempts as Attempt[]) {
      if (!operations.includes(a.operation) || !isAddress(a.pool) || !isAddress(a.to) || !['unknown', 'success', 'reverted', 'rejected'].includes(a.status) || (a.hash !== undefined && !isHash(a.hash)) ||
        (a.status === 'rejected' && (a.hash || a.receiptStatus)) || (['success', 'reverted'].includes(a.status) && (!a.hash || a.receiptStatus !== (a.status === 'success' ? 'success' : 'reverted')))) throw new Error('AMM 紀錄損壞；停止操作')
      const expected = transaction(a.operation, a.pool, a.expires === undefined ? undefined : BigInt(a.expires))
      if (expected.to !== a.to || expected.data !== a.data) throw new Error('AMM 紀錄參數不符')
    }
    return stored.attempts
  }
  function transaction(operation: Operation, pool: Hex, expires?: bigint) {
    if (operation === 'addLiquidity') {
      if (!expires || expires <= 0n) throw new Error('缺少 Deadline')
      return { to: pool, data: encodeFunctionData({ abi: artifact.abi, functionName: 'addLiquidity', args: liquidityArgs(expires) }) }
    }
    const token = AMM_TOKENS[operation === 'approveDPLT' ? 0 : 1]
    return { to: token.address, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [pool, token.amount] }) }
  }
  let attempts = readJournal()
  let snapshot = { busy, prepared, state, attempts }
  function notify() { snapshot = { busy, prepared, state, attempts: [...attempts] }; listeners.forEach(fn => fn()) }
  function persist() { journal.write(json({ version: 1, chainId: SEPOLIA_CHAIN_ID, teacher: DEPLOYER, attempts })) }
  function patch(index: number, patch: Partial<Attempt>) { attempts = attempts.map((a, i) => i === index ? { ...a, ...patch } : a); persist(); notify() }
  function invalidate() { revision++; prepared = undefined; state = undefined; notify() }
  for (const event of ['accountsChanged', 'chainChanged', 'disconnect'] as const) provider.on(event, invalidate)
  async function identity() {
    const [accounts, chain] = await Promise.all([deadline(provider.request({ method: 'eth_accounts' })), deadline(provider.request({ method: 'eth_chainId' }))])
    if (!Array.isArray(accounts) || typeof accounts[0] !== 'string' || !isAddress(accounts[0]) || getAddress(accounts[0]) !== DEPLOYER || Number(chain) !== SEPOLIA_CHAIN_ID) throw new Error('必須使用指定教師帳號及 Sepolia 11155111')
  }
  async function inspect(): Promise<PoolState> {
    state = undefined; notify()
    const version = revision
    await identity()
    if (deployment.getSnapshot().busy) throw new Error('部署查詢進行中')
    await deployment.reconcile('amm')
    const r = deployment.getSnapshot().records.amm
    if (r.status !== '成功' || !r.contractAddress || !isAddress(r.contractAddress)) throw new Error('Pool 尚未部署並驗證成功')
    const pool = getAddress(r.contractAddress)
    const read = (functionName: string, args?: readonly unknown[]) => client.readContract({ address: pool, abi: artifact.abi, functionName, args })
    const getters = await Promise.all(['dplt', 'assetA', 'initialProvider'].map(n => read(n)))
    if (getters.some((v, i) => typeof v !== 'string' || getAddress(v) !== AMM_ARGS[i])) throw new Error('Pool 參數不符')
    const [supply, reserves, teacherLP, lockedLP, actual, teacher, allowances] = await Promise.all([
      read('totalSupply') as Promise<bigint>, read('getReserves') as Promise<readonly bigint[]>, read('balanceOf', [DEPLOYER]) as Promise<bigint>, read('balanceOf', [LOCKED_ADDRESS]) as Promise<bigint>,
      Promise.all(AMM_TOKENS.map(t => client.readContract({ address: t.address, abi: erc20Abi, functionName: 'balanceOf', args: [pool] }))),
      Promise.all(AMM_TOKENS.map(t => client.readContract({ address: t.address, abi: erc20Abi, functionName: 'balanceOf', args: [DEPLOYER] }))),
      Promise.all(AMM_TOKENS.map(t => client.readContract({ address: t.address, abi: erc20Abi, functionName: 'allowance', args: [DEPLOYER, pool] }))),
    ])
    await identity()
    if (revision !== version) throw new Error('帳號或網路已變更')
    state = { pool, supply, reserves, actual, teacher, allowances, teacherLP, lockedLP, initialized: supply > 0n,
      immediateExpected: supply === LP_TOTAL && teacherLP === LP_TEACHER && lockedLP === LP_LOCKED && actual.every((v, i) => v === AMM_TOKENS[i].amount && v === reserves[i]), checkedAt: new Date().toISOString() }
    notify(); return state
  }
  function pristine(s: PoolState) {
    if (s.initialized) throw new Error('首次流動性已建立；禁止重複初始化')
    if (s.reserves.length !== 2 || s.reserves.some(v => v !== 0n)) throw new Error('Pool 儲備不為零')
    if (s.actual.some(v => v !== 0n)) throw new Error('Pool 已收到 Token 捐贈，初始化價格可能受影響；停止並交由教師人工處理')
  }
  async function estimate(operation: Operation, expires?: bigint): Promise<Prepared> {
    const s = await inspect(); pristine(s)
    if (operation !== 'addLiquidity') {
      const i = operation === 'approveDPLT' ? 0 : 1
      if (s.allowances[i] >= AMM_TOKENS[i].amount) throw new Error('allowance 已足夠，無需重新授權')
      // Reviewed TeachingToken is standard OpenZeppelin ERC20: exact approve replaces allowance.
    } else {
      if (s.teacher.some((v, i) => v < AMM_TOKENS[i].amount)) throw new Error('教師 Token 餘額不足')
      if (s.allowances.some((v, i) => v < AMM_TOKENS[i].amount)) throw new Error('allowance 不足，請分別 approve')
      const block = await client.getBlock()
      if (!expires || expires <= block.timestamp || expires <= BigInt(Math.floor(Date.now() / 1000))) throw new Error('Deadline 已過期，請重新準備')
      await client.simulateContract({ address: s.pool, abi: artifact.abi, functionName: 'addLiquidity', args: liquidityArgs(expires), account: DEPLOYER })
    }
    const tx = transaction(operation, s.pool, expires)
    const [estimate, gasPrice, eth] = await Promise.all([client.estimateGas({ account: DEPLOYER, ...tx, value: 0n }), client.getGasPrice(), client.getBalance({ address: DEPLOYER })])
    const gas = (estimate * 120n + 99n) / 100n
    if (gas <= 0n || gasPrice <= 0n || eth < gas * gasPrice) throw new Error('Sepolia ETH 不足以支付 Gas')
    return { operation, pool: s.pool, ...tx, expires, gas, gasPrice, at: Date.now(), revision }
  }
  function unresolved() { return attempts.some(a => a.status === 'unknown') }
  async function refresh() {
    if (busy) return
    busy = true; prepared = undefined; notify()
    try { await inspect() } finally { busy = false; notify() }
  }
  async function prepare(operation: Operation) {
    if (busy) return
    busy = true; prepared = undefined; const version = revision; notify()
    try {
      attempts = readJournal()
      if (unresolved()) throw new Error('結果未知；先查詢原交易 Hash，禁止重送')
      const expires = operation === 'addLiquidity' ? BigInt(Math.floor(Date.now() / 1000) + 600) : undefined
      const p = await estimate(operation, expires)
      if (version !== revision) throw new Error('帳號或網路已變更')
      prepared = p
    } finally { busy = false; notify() }
  }
  async function track(index: number, hash: Hex) {
    try {
      await identity()
      const a = attempts[index]
      const original = await client.getTransaction({ hash })
      if (!original.to || getAddress(original.to) !== a.to || getAddress(original.from) !== DEPLOYER || original.value !== 0n || original.input !== a.data) throw new Error('原交易參數不符')
      patch(index, { hash })
      const r = await client.waitForTransactionReceipt({ hash, confirmations: 1, timeout: receiptTimeout, pollingInterval: 1000, retryCount: 0, checkReplacement: false })
      if (r.transactionHash.toLowerCase() !== hash.toLowerCase() || getAddress(r.from) !== DEPLOYER || !r.to || getAddress(r.to) !== a.to) throw new Error('Receipt 身分不符')
      const s = await inspect()
      if (s.pool !== a.pool) throw new Error('Pool 不符')
      let eventVerified = false
      if (r.status === 'success' && a.operation === 'addLiquidity') {
        const events = r.logs.filter(log => getAddress(log.address) === a.pool).flatMap(log => {
          try { return [decodeEventLog({ abi: artifact.abi, data: log.data, topics: log.topics })] } catch { return [] }
        })
        eventVerified = events.some(e => {
          const args = e.args as { provider?: string; amountDPLT?: bigint; amountDPLTA?: bigint; liquidity?: bigint }
          return e.eventName === 'AddLiquidity' && args.provider && getAddress(args.provider) === DEPLOYER && args.amountDPLT === AMM_TOKENS[0].amount && args.amountDPLTA === AMM_TOKENS[1].amount && args.liquidity === LP_TEACHER
        }) === true
        const minted = events.filter(e => e.eventName === 'Transfer').map(e => e.args as unknown as { from: string; to: string; value: bigint })
        if (!eventVerified || !minted.some(e => BigInt(e.from) === 0n && getAddress(e.to) === DEPLOYER && e.value === LP_TEACHER) || !minted.some(e => BigInt(e.from) === 0n && getAddress(e.to) === LOCKED_ADDRESS && e.value === LP_LOCKED)) throw new Error('LP 鑄造／AddLiquidity 事件不符')
      }
      if (r.status === 'success' && a.operation !== 'addLiquidity') {
        const i = a.operation === 'approveDPLT' ? 0 : 1
        if (s.allowances[i] < AMM_TOKENS[i].amount) throw new Error('Receipt 成功但實際 allowance 不足；需人工核對')
      }
      patch(index, { status: r.status === 'success' ? 'success' : 'reverted', receiptStatus: r.status, blockNumber: r.blockNumber.toString(), checkedAt: new Date().toISOString(), eventVerified,
        message: r.status === 'reverted' ? 'Receipt revert；未完成' : a.operation !== 'addLiquidity' ? 'approve 成功且 allowance 足夠；尚未注資' : s.immediateExpected ? '首次注資、LP 與目前儲備均符合預期' : 'Receipt 與首次鑄造事件成功；目前餘額已變動，請核對後續交易／捐贈' })
    } catch { state = undefined; patch(index, { status: 'unknown', message: '結果未知；保留原 Hash，手動 Reconcile，禁止重送' }) }
  }
  async function confirm() {
    if (busy) return
    const p = prepared
    if (!p) throw new Error('請先準備並確認摘要')
    busy = true; prepared = undefined; let index = -1, submitted = false; notify()
    try {
      attempts = readJournal()
      if (unresolved()) throw new Error('結果未知；禁止重送')
      if (p.revision !== revision || Date.now() - p.at > 300000) throw new Error('摘要已失效')
      const version = revision, fresh = await estimate(p.operation, p.expires)
      if (fresh.data !== p.data || fresh.to !== p.to || fresh.pool !== p.pool || fresh.gas > p.gas || fresh.gasPrice > p.gasPrice) throw new Error('交易／Gas 已改變，請重新準備')
      await identity()
      if (version !== revision) throw new Error('帳號或網路已變更')
      if (p.expires && p.expires <= BigInt(Math.floor(Date.now() / 1000))) throw new Error('Deadline 已過期，請重新準備')
      index = attempts.length
      attempts = [...attempts, { operation: p.operation, pool: p.pool, to: p.to, data: p.data, expires: p.expires?.toString(), status: 'unknown' }]
      persist(); submitted = true; notify()
      const hash = await deadline(provider.request({ method: 'eth_sendTransaction', params: [{ from: DEPLOYER, to: p.to, data: p.data, chainId: numberToHex(SEPOLIA_CHAIN_ID), value: '0x0', gas: numberToHex(p.gas), gasPrice: numberToHex(p.gasPrice) }] }), 120000)
      if (typeof hash !== 'string' || !isHash(hash)) throw new Error('Invalid hash')
      patch(index, { hash }); await track(index, hash)
    } catch (e) {
      if (submitted && rejected(e)) patch(index, { status: 'rejected', message: '教師拒絕簽署；未送出，可重新準備' })
      else if (submitted) patch(index, { status: 'unknown', message: '送出結果未知；先查 MetaMask 原 Hash，禁止重送' })
      throw e
    } finally { busy = false; notify() }
  }
  async function reconcile(index: number, suppliedHash?: string) {
    if (busy) return
    attempts = readJournal()
    const a = attempts[index], hash = a?.hash ?? suppliedHash
    if (!a || !hash || !isHash(hash)) throw new Error('請提供原交易 Hash')
    busy = true; prepared = undefined; notify()
    try { await track(index, hash) } finally { busy = false; notify() }
  }
  return {
    refresh, prepare, confirm, reconcile, getSnapshot: () => snapshot,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } },
    exportRecord: () => json({ version: 1, chainId: SEPOLIA_CHAIN_ID, teacher: DEPLOYER, targets: AMM_TOKENS, expectedLP: { total: LP_TOTAL, teacher: LP_TEACHER, locked: LP_LOCKED }, attempts, state, exportedAt: new Date().toISOString() }),
    destroy() { for (const event of ['accountsChanged', 'chainChanged', 'disconnect'] as const) provider.removeListener(event, invalidate); listeners.clear() },
  }
}
export type AMMLiquidityTool = ReturnType<typeof createAMMLiquidityTool>
