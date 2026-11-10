import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

// 學生 Token 的 transfer/RPC 方法與公開地址是正式功能；禁止的是本機工具與其產物。
const forbidden = ['dpl-sepolia-deployment-v1', 'DPL 本機 Sepolia 部署工具', 'teaching-artifact', 'tools/deploy',
  'DPL 本機唯讀部署驗證', 'verification-artifact', 'tools/verify', 'localhost-readonly-deployment-check',
  'hh3-artifact-1', 'pragma solidity 0.8.38']
export function checkProduction(directory = 'dist') {
  const artifact = JSON.parse(readFileSync('artifacts/contracts/TeachingToken.sol/TeachingToken.json', 'utf8'))
  const bytecodes = [artifact.bytecode, artifact.deployedBytecode].map((code: string) => {
    assert.match(code, /^0x(?:[\da-f]{2})+$/i)
    return code.slice(2).toLowerCase()
  })
  function check(dir: string) {
    for (const file of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, file.name)
      if (file.isDirectory()) check(path)
      else {
        const content = readFileSync(path, 'utf8')
        for (const marker of forbidden) assert(!content.includes(marker), `Local tool leaked into production: ${path} (${marker})`)
        for (const code of bytecodes) assert(!content.toLowerCase().includes(code), `Full TeachingToken bytecode leaked into production: ${path}`)
      }
    }
  }
  check(directory)
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  checkProduction()
  console.log('Production output contains no local deployment/verifier entry, artifact, source or complete TeachingToken bytecode')
}
