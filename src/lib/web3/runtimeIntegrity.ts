import { keccak256 } from 'viem'
import type { Hash, Hex } from 'viem'

// 雜湊全部 bytes（含末尾 Solidity CBOR metadata），不剝除或正規化 metadata。
export function matchesRuntime(code: unknown, expected: { runtimeKeccak256: Hash; runtimeSize: number }): code is Hex {
  return typeof code === 'string' && /^0x(?:[\da-f]{2})+$/i.test(code)
    && (code.length - 2) / 2 === expected.runtimeSize
    && keccak256(code as Hex) === expected.runtimeKeccak256
}
