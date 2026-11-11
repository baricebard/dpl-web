import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

test('local deployment config refuses production build', () => {
  const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'tools/deploy/vite.config.ts'], { encoding: 'utf8' })
  assert.notEqual(result.status, 0)
  assert.match(result.stdout + result.stderr, /Local deployment tool cannot be built or previewed/)
})

test('Pages content scan allows student transfer identifiers but rejects local tools and full bytecodes', async () => {
  const { mkdtempSync, writeFileSync, rmSync, readFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { checkProduction } = await import('../../scripts/deploy/check-production.ts')
  const directory = mkdtempSync(join(tmpdir(), 'dpl-dist-guard-'))
  try {
    const file = join(directory, 'index.js')
    writeFileSync(file, 'eth_sendTransaction encodeDeployData 0x1e802B4E03EdC58B2789819fdF8bc0Ed77b58F3e')
    assert.doesNotThrow(() => checkProduction(directory))
    const artifact = JSON.parse(readFileSync('artifacts/contracts/TeachingToken.sol/TeachingToken.json', 'utf8'))
    const exchange = JSON.parse(readFileSync('artifacts/contracts/DPLFixedExchange.sol/DPLFixedExchange.json', 'utf8'))
    for (const content of ['DPL 本機 Sepolia 部署工具', 'DPL 本機唯讀部署驗證', 'teaching-artifact', 'verification-artifact', 'exchange-artifact', 'dpl-exchange-funding-v1', exchange.bytecode, exchange.deployedBytecode, artifact.bytecode, artifact.deployedBytecode]) {
      writeFileSync(file, content)
      assert.throws(() => checkProduction(directory), /leaked into production/)
    }
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('Pages module graph rejects imports of either local tool or a Hardhat artifact', async () => {
  const { build } = await import('vite')
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join, resolve } = await import('node:path')
  const directory = mkdtempSync(join(tmpdir(), 'dpl-graph-guard-'))
  try {
    const file = join(directory, 'entry.js')
    for (const module of ['tools/deploy/config.ts', 'tools/deploy/funding.ts', 'artifacts/contracts/DPLFixedExchange.sol/DPLFixedExchange.json', 'tools/verify/record.ts', 'artifacts/contracts/TeachingToken.sol/TeachingToken.json']) {
      writeFileSync(file, `import * as local from ${JSON.stringify(resolve(module))}; console.log(local);`)
      await assert.rejects(build({ configFile: resolve('vite.config.ts'), logLevel: 'silent', build: { write: false, rollupOptions: { input: file } } }), /Local deployment module cannot enter production/)
    }
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
