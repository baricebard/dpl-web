import { readFileSync } from 'node:fs'
import type { Hex } from 'viem'

// 僅 Node 測試使用 Hardhat runtime fixture；正式前端不匯入 artifact。
const artifact = JSON.parse(readFileSync(new URL('../../artifacts/contracts/TeachingToken.sol/TeachingToken.json', import.meta.url), 'utf8'))
export const runtime = artifact.deployedBytecode as Hex
export const wrongRuntime = `0x${runtime.slice(2, 4) === '60' ? '61' : '60'}${runtime.slice(4)}` as Hex
// 最後 2 bytes 是 CBOR 長度；只變更前一 byte，保留 executable code 與總長度。
export const wrongMetadata = `${runtime.slice(0, -6)}${runtime.slice(-6, -4) === '00' ? '01' : '00'}${runtime.slice(-4)}` as Hex
