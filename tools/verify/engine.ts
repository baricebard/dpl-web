import { decodeEventLog, decodeFunctionResult, encodeFunctionData, isHex, keccak256, parseAbi, toHex, zeroAddress, type Hex } from 'viem'
import { INITIAL_SUPPLY, SEPOLIA_CHAIN_ID } from '../../scripts/contracts/spec.ts'
import { hash, object, type DeploymentRecord, type Provenance, type VerificationToken } from './record.ts'

export const READ_METHODS = ['eth_chainId', 'eth_getBlockByNumber', 'eth_getTransactionReceipt', 'eth_getCode', 'eth_call'] as const
export type ReadMethod = typeof READ_METHODS[number]
export type ReadRpc = (method: ReadMethod, params: readonly unknown[]) => Promise<unknown>
export type Status = '通過' | '失敗' | '尚未驗證'
export interface ArtifactBundle { available: boolean; error?: string; deployedBytecode?: Hex; provenance?: Provenance; sourcePaths?: string[] }
export interface Evidence { id: number; method: ReadMethod; params: readonly unknown[]; startedAt: string; finishedAt: string; result?: unknown; error?: string }
export interface Check { name: string; status: Status; expected: unknown; actual?: unknown; reason?: string; evidenceIds: number[]; checkedAt: string }
export interface TokenResult { id: string; address: string; status: Status; checks: Check[] }
export interface VerificationResult {
  schemaVersion: 1; scope: 'localhost-readonly-deployment-check'; startedAt: string; finishedAt: string
  sourceRecord: DeploymentRecord; localArtifact: ArtifactBundle; status: Status; task06Ready: false
  notChecked: string[]; checks: Check[]; tokens: TokenResult[]; evidence: Evidence[]
}
export const abi = parseAbi([
  'function name() view returns (string)', 'function symbol() view returns (string)',
  'function decimals() view returns (uint8)', 'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
])
class Mismatch extends Error {}
const same = (a: unknown, b: unknown) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase()
const now = () => new Date().toISOString()
export const serialize = (value: unknown) => JSON.stringify(value, (_, v: unknown) => typeof v === 'bigint' ? v.toString() : v, 2)
export function aggregate(checks: { status: Status }[]): Status {
  return checks.some(c => c.status === '失敗') ? '失敗' : !checks.length || checks.some(c => c.status === '尚未驗證') ? '尚未驗證' : '通過'
}
function quantity(value: unknown): bigint {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value)) throw new Error('RPC 回傳無效 hex quantity')
  return BigInt(value)
}
function bytecode(value: unknown): Hex {
  if (typeof value !== 'string' || !isHex(value) || value.length % 2 !== 0) throw new Error('RPC 回傳無效 bytecode')
  return value
}
function codeSummary(code: Hex) { return { lengthBytes: (code.length - 2) / 2, keccak256: keccak256(code) } }
export function compareRuntime(actual: Hex, expected: Hex) {
  const equal = same(actual, expected)
  let firstDifferentByte: number | null = null
  if (!equal) {
    let i = 2
    while (i < Math.min(actual.length, expected.length) && actual.slice(i, i + 2).toLowerCase() === expected.slice(i, i + 2).toLowerCase()) i += 2
    firstDifferentByte = (i - 2) / 2
  }
  return { equal, actual: codeSummary(actual), expected: codeSummary(expected), firstDifferentByte,
    note: '完整 runtime 包含 metadata；未刪除或忽略任何 byte。差異可能來自版本、來源路徑、來源換行或 metadata，不能僅由差異位置推斷原因。' }
}

/** Pure read orchestration. The injected boundary accepts only five read methods. */
export async function verifyDeployment(record: DeploymentRecord, artifact: ArtifactBundle, rpc: ReadRpc): Promise<VerificationResult> {
  const evidence: Evidence[] = []
  const result: VerificationResult = { schemaVersion: 1, scope: 'localhost-readonly-deployment-check', startedAt: now(), finishedAt: '',
    sourceRecord: record, localArtifact: artifact, status: '尚未驗證', task06Ready: false,
    notChecked: ['Etherscan exact/similar verification', '完整管理權限審計', '完整後續 Transfer 歷史', 'finality／確認數策略'],
    checks: [], tokens: record.tokens.map(t => ({ id: t.id, address: t.address, status: '尚未驗證', checks: [] })), evidence }
  async function read(method: ReadMethod, params: readonly unknown[]) {
    if (!(READ_METHODS as readonly string[]).includes(method)) throw new Error('非唯讀 RPC 方法遭拒絕')
    const e: Evidence = { id: evidence.length + 1, method, params, startedAt: now(), finishedAt: '' }
    evidence.push(e)
    try { e.result = await rpc(method, params); return e.result }
    catch (error) { e.error = error instanceof Error ? error.message : String(error); throw error }
    finally { e.finishedAt = now() }
  }
  async function check<T>(checks: Check[], name: string, expected: unknown, work: () => Promise<T> | T, validate?: (actual: T) => boolean) {
    const c: Check = { name, expected, status: '尚未驗證', evidenceIds: [], checkedAt: now() }
    const start = evidence.length
    checks.push(c)
    try {
      const actual = await work(); c.actual = actual
      if (validate && !validate(actual)) throw new Mismatch('實際回傳值不符合預期，詳見 actual／expected 與 RPC 證據')
      c.status = '通過'
      return actual
    } catch (error) {
      c.status = error instanceof Mismatch ? '失敗' : '尚未驗證'
      c.reason = error instanceof Error ? error.message : String(error)
      return undefined
    } finally { c.checkedAt = now(); c.evidenceIds = evidence.slice(start).map(e => e.id) }
  }
  const skip = (checks: Check[], name: string, reason: string) => checks.push({ name, expected: '需前置查詢成功', status: '尚未驗證', reason, evidenceIds: [], checkedAt: now() })
  const distinct = new Set(record.tokens.map(t => t.address.toLowerCase())).size === 3
  await check(result.checks, '三個地址不同', true, () => distinct, value => value)
  const chain = await check(result.checks, 'RPC Chain ID', SEPOLIA_CHAIN_ID.toString(), async () => quantity(await read('eth_chainId', [])).toString(), value => value === SEPOLIA_CHAIN_ID.toString())
  if (chain !== SEPOLIA_CHAIN_ID.toString()) {
    for (const token of result.tokens) skip(token.checks, '合約驗證', 'RPC chain ID 尚未確認為 Sepolia，停止後續查詢')
    return finish()
  }
  const snapshot = await check(result.checks, '固定目前查詢區塊', '非空的最新區塊 number/hash', async () => {
    const b = object(await read('eth_getBlockByNumber', ['latest', false]))
    return { number: toHex(quantity(b.number)), hash: hash(b.hash), timestamp: quantity(b.timestamp).toString() }
  })
  await check(result.checks, '本機編譯產物與設定', 'Hardhat artifact/build-info 一致；compiler/OZ/optimizer/EVM 符合紀錄', () => {
    if (!artifact.available || !artifact.deployedBytecode || !artifact.provenance) throw new Error(artifact.error || '缺少本機 Hardhat 產物，請依指南編譯或還原封存')
    bytecode(artifact.deployedBytecode)
    const p = artifact.provenance, expected = record.provenance
    return { compiler: p.compiler, openZeppelin: p.openZeppelin, settings: p.settings,
      configurationMatches: p.compiler === expected.compiler && p.openZeppelin === expected.openZeppelin && p.settings.evmVersion === expected.settings.evmVersion && p.settings.optimizer.enabled === expected.settings.optimizer.enabled && p.settings.optimizer.runs === expected.settings.optimizer.runs,
      hashesMatchOriginalRecord: p.artifactSha256 === expected.artifactSha256 && p.inputSha256 === expected.inputSha256 && p.lockfileSha256 === expected.lockfileSha256,
      original: expected, local: p,
      note: '雜湊差異會如實保留；重建產物不是原封存。最終 runtime 仍須完整逐 byte 相同，ABI 相同不足以通過。' }
  }, value => value.configurationMatches)

  for (let i = 0; i < record.tokens.length; i++) {
    const token = record.tokens[i], checks = result.tokens[i].checks
    await verifyToken(token, checks)
  }
  if (snapshot) await check(result.checks, '查詢區塊未被重組', snapshot.hash, async () => hash(object(await read('eth_getBlockByNumber', [snapshot.number, false])).hash), value => same(value, snapshot.hash))
  await check(result.checks, '結束時 RPC Chain ID', SEPOLIA_CHAIN_ID.toString(), async () => quantity(await read('eth_chainId', [])).toString(), value => value === SEPOLIA_CHAIN_ID.toString())
  return finish()

  function finish() {
    for (const t of result.tokens) t.status = aggregate([...result.checks, ...t.checks])
    result.status = aggregate([...result.checks, ...result.tokens]); result.finishedAt = now()
    return result
  }
  async function verifyToken(token: VerificationToken, checks: Check[]) {
    const receipt = await check(checks, '部署 Receipt', token.hash, async () => {
      const raw = await read('eth_getTransactionReceipt', [token.hash])
      if (raw === null) throw new Error('Receipt 尚不存在／尚未可查，不代表部署失敗')
      const r = object(raw)
      quantity(r.blockNumber); hash(r.blockHash); hash(r.transactionHash)
      return r
    })
    if (receipt) {
      await check(checks, 'Receipt 交易與部署者', { hash: token.hash, from: record.deployer, to: null }, () => ({ hash: receipt.transactionHash, from: receipt.from, to: receipt.to }), value => same(value.hash, token.hash) && same(value.from, record.deployer) && value.to === null)
      await check(checks, 'Receipt status', '0x1', () => { quantity(receipt.status); return receipt.status }, value => value === '0x1')
      await check(checks, 'Receipt contractAddress', token.address, () => receipt.contractAddress, value => same(value, token.address))
      await check(checks, '部署區塊與紀錄／canonical block 一致', { number: token.reportedBlockNumber, hash: token.reportedBlockHash }, async () => {
        const block = object(await read('eth_getBlockByNumber', [receipt.blockNumber, false]))
        return { number: quantity(receipt.blockNumber).toString(), receiptHash: receipt.blockHash, canonicalHash: hash(block.hash) }
      }, value => value.number === token.reportedBlockNumber && same(value.receiptHash, token.reportedBlockHash) && same(value.receiptHash, value.canonicalHash) && (!snapshot || BigInt(value.number) <= BigInt(snapshot.number)))
      await check(checks, '部署 Transfer mint 事件', { from: zeroAddress, to: record.initialHolder, value: INITIAL_SUPPLY.toString() }, () => {
        if (!Array.isArray(receipt.logs)) throw new Error('Receipt logs 格式無效')
        return receipt.logs.map(object).filter(log => same(log.address, token.address)).flatMap(log => {
          try {
            const decoded = decodeEventLog({ abi, data: log.data as Hex, topics: log.topics as [Hex, ...Hex[]], strict: true })
            return [{ eventName: decoded.eventName, ...decoded.args }]
          } catch { return [] }
        })
      }, events => events.length === 1 && same(events[0].from, zeroAddress) && same(events[0].to, record.initialHolder) && events[0].value === INITIAL_SUPPLY)
      await runtime(checks, token, receipt.blockNumber, '部署區塊 Runtime')
    } else skip(checks, '部署事件／部署 Runtime／Receipt 欄位', '無可用 receipt，不能採用 JSON 的 success 作證據')
    if (!snapshot) { skip(checks, '目前 Bytecode／metadata／持有人餘額', '無可用的固定目前區塊'); return }
    await runtime(checks, token, snapshot.number, '目前 Runtime')
    for (const [functionName, expected] of [['name', token.name], ['symbol', token.symbol], ['decimals', 18], ['totalSupply', INITIAL_SUPPLY]] as const) {
      await check(checks, `${functionName}()`, expected, async () => {
        const data = encodeFunctionData({ abi, functionName })
        const raw = bytecode(await read('eth_call', [{ to: token.address, data }, snapshot.number]))
        return decodeFunctionResult({ abi, functionName, data: raw })
      }, value => value === expected)
    }
    await check(checks, '教師目前 balanceOf()（不要求等於初始供給）', { holder: record.initialHolder, snapshot: snapshot.number, rule: '僅讀取非負整數；後續轉帳可改變餘額' }, async () => {
      const data = encodeFunctionData({ abi, functionName: 'balanceOf', args: [record.initialHolder] })
      const raw = bytecode(await read('eth_call', [{ to: token.address, data }, snapshot.number]))
      return decodeFunctionResult({ abi, functionName: 'balanceOf', data: raw })
    })
  }
  async function runtime(checks: Check[], token: VerificationToken, block: unknown, name: string) {
    const code = await check(checks, `${name} 非空`, '非空 runtime bytecode', async () => bytecode(await read('eth_getCode', [token.address, block])), value => value !== '0x')
    await check(checks, `${name} 完整比對`, artifact.deployedBytecode ? codeSummary(artifact.deployedBytecode) : '缺少編譯產物', () => {
      if (!code || code === '0x') throw new Error('沒有可比對的鏈上 runtime')
      if (!artifact.available || !artifact.deployedBytecode) throw new Error(artifact.error || '缺少編譯產物')
      return compareRuntime(code, artifact.deployedBytecode)
    }, value => value.equal)
  }
}
