import { getAddress, isAddress, isHash, sha256, stringToHex, type Address, type Hex } from 'viem'
import { INITIAL_SUPPLY, SEPOLIA_CHAIN_ID, TOKENS } from '../../scripts/contracts/spec.ts'

export type TokenId = typeof TOKENS[number]['id']
export interface Provenance {
  commit: string; compiler: string; openZeppelin: string
  artifactSha256: string; inputSha256: string; lockfileSha256: string; buildInfoId: string
  settings: { optimizer: { enabled: boolean; runs: number }; evmVersion: string; [key: string]: unknown }
}
export interface VerificationToken {
  id: TokenId; name: string; symbol: string; address: Address; hash: Hex
  reportedBlockNumber: string; reportedBlockHash: Hex
}
export interface DeploymentRecord {
  sourceSha256: Hex; chainId: number; initialHolder: Address; deployer: Address
  provenance: Provenance; tokens: VerificationToken[]
}
export const TEACHER = '0xC6EdF1cBb0aC65d7DefF5CDadA1721C90951ea02'
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('預期 JSON object')
  return value as Record<string, unknown>
}
function address(value: unknown): Address {
  if (typeof value !== 'string' || !isAddress(value) || /^0x0{40}$/i.test(value)) throw new Error('無效或零地址')
  return getAddress(value)
}
export function hash(value: unknown): Hex {
  if (typeof value !== 'string' || !isHash(value)) throw new Error('無效的 32-byte hash')
  return value
}
export function parseRecord(text: string): DeploymentRecord {
  if (new TextEncoder().encode(text).length > 128 * 1024) throw new Error('部署紀錄上限為 128 KiB')
  const raw = object(JSON.parse(text))
  if (raw.version !== 1 || raw.chainId !== SEPOLIA_CHAIN_ID) throw new Error('只接受 version 1、Sepolia 11155111 部署紀錄')
  const initialHolder = address(raw.initialHolder), deployer = address(raw.deployer)
  if (initialHolder !== TEACHER || deployer !== TEACHER) throw new Error('教師／部署者地址與本次規格不符')
  const records = object(raw.records)
  if (!Array.isArray(raw.tokens) || raw.tokens.length !== 3) throw new Error('必須包含三種代幣')
  const provenance = object(raw.provenance)
  for (const key of ['commit', 'compiler', 'openZeppelin', 'buildInfoId']) {
    if (typeof provenance[key] !== 'string' || !provenance[key]) throw new Error(`缺少 provenance.${key}`)
  }
  for (const key of ['artifactSha256', 'inputSha256', 'lockfileSha256']) {
    if (typeof provenance[key] !== 'string' || !/^[a-f0-9]{64}$/.test(provenance[key])) throw new Error(`無效的 ${key}`)
  }
  const settings = object(provenance.settings), optimizer = object(settings.optimizer)
  if (typeof optimizer.enabled !== 'boolean' || typeof optimizer.runs !== 'number' || typeof settings.evmVersion !== 'string') throw new Error('無效的 compiler settings')
  const selectedProvenance: Provenance = {
    commit: provenance.commit as string, compiler: provenance.compiler as string, openZeppelin: provenance.openZeppelin as string,
    artifactSha256: provenance.artifactSha256 as string, inputSha256: provenance.inputSha256 as string,
    lockfileSha256: provenance.lockfileSha256 as string, buildInfoId: provenance.buildInfoId as string,
    settings: { ...settings, optimizer: { ...optimizer, enabled: optimizer.enabled, runs: optimizer.runs }, evmVersion: settings.evmVersion },
  }
  const tokens = TOKENS.map(spec => {
    const matches = (raw.tokens as unknown[]).map(object).filter(t => t.id === spec.id)
    if (matches.length !== 1) throw new Error(`缺少或重複 ${spec.id}`)
    const token = matches[0], entry = object(records[spec.id])
    if (token.name !== spec.name || token.symbol !== spec.symbol) throw new Error(`${spec.id} 名稱／符號不符規格`)
    if (JSON.stringify(token.constructorArgs) !== JSON.stringify([spec.name, spec.symbol, initialHolder, INITIAL_SUPPLY.toString()])) throw new Error(`${spec.id} constructor 不符規格`)
    if (JSON.stringify(entry.provenance) !== JSON.stringify(raw.provenance)) throw new Error(`${spec.id} provenance 不一致`)
    if (typeof entry.blockNumber !== 'string' || !/^[1-9][0-9]*$/.test(entry.blockNumber)) throw new Error('無效的部署區塊')
    return { ...spec, address: address(entry.contractAddress), hash: hash(entry.hash), reportedBlockNumber: entry.blockNumber, reportedBlockHash: hash(entry.blockHash) }
  })
  return { sourceSha256: sha256(stringToHex(text)), chainId: SEPOLIA_CHAIN_ID, initialHolder, deployer, provenance: selectedProvenance, tokens }
}
