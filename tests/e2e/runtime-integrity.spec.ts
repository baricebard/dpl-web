import { expect, test } from '@playwright/test'
import { teachingTokenRuntime } from '../../src/config/teachingTokenRuntime'
import { matchesRuntime } from '../../src/lib/web3/runtimeIntegrity'
import { runtime, wrongMetadata, wrongRuntime } from '../helpers/tokenRuntime'

test('完整 runtime 指紋涵蓋 executable code 與 Solidity metadata，僅忽略 hex 大小寫', () => {
  expect(matchesRuntime(runtime, teachingTokenRuntime)).toBe(true)
  expect(matchesRuntime(`0x${runtime.slice(2).toUpperCase()}`, teachingTokenRuntime)).toBe(true)
  for (const code of [undefined, null, '0x', '0x123', '0xzz', runtime.slice(0, -2), wrongRuntime, wrongMetadata]) expect(matchesRuntime(code, teachingTokenRuntime)).toBe(false)
  // Metadata-only 變更不影響長度，也不改 executable code，仍必須拒絕。
  const metadataBytes = parseInt(runtime.slice(-4), 16) + 2
  expect(wrongMetadata.length).toBe(runtime.length)
  expect(wrongMetadata.slice(0, -(metadataBytes * 2))).toBe(runtime.slice(0, -(metadataBytes * 2)))
})
