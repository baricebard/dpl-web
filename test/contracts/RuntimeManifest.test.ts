import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { it } from 'node:test'

const root = process.cwd()
const artifactPath = 'artifacts/contracts/TeachingToken.sol/TeachingToken.json'
const manifestPath = 'src/config/teachingTokenRuntime.ts'
function fixture(run: (directory: string) => void) {
  const directory = mkdtempSync(join(tmpdir(), 'dpl-manifest-test-'))
  try {
    // 自有暫存 Git checkout，只有 Node 依賴重用；不寫入原工作樹的產物或 manifest。
    execFileSync('git', ['clone', '--shared', '--no-checkout', root, directory], { stdio: 'pipe' })
    for (const path of ['contracts/TeachingToken.sol', 'hardhat.config.ts', 'package.json', 'package-lock.json', 'scripts/contracts/runtime-manifest.ts', manifestPath, 'artifacts']) {
      mkdirSync(dirname(join(directory, path)), { recursive: true })
      cpSync(join(root, path), join(directory, path), { recursive: true })
    }
    symlinkSync(join(root, 'node_modules'), join(directory, 'node_modules'), 'dir')
    run(directory)
  } finally { rmSync(directory, { recursive: true, force: true }) }
}
const check = (cwd: string) => execFileSync(process.execPath, ['scripts/contracts/runtime-manifest.ts', '--check'], { cwd, encoding: 'utf8', stdio: 'pipe' })

it('runtime manifest accepts a relocated Hardhat build-info ID with identical compiler input and runtime', () => fixture(directory => {
  const artifact = JSON.parse(readFileSync(join(directory, artifactPath), 'utf8'))
  const original = join(directory, `artifacts/build-info/${artifact.buildInfoId}.json`)
  const build = JSON.parse(readFileSync(original, 'utf8'))
  const relocated = `${artifact.buildInfoId}-other-installation`
  artifact.buildInfoId = relocated
  build.id = relocated
  writeFileSync(join(directory, artifactPath), JSON.stringify(artifact))
  writeFileSync(join(directory, `artifacts/build-info/${relocated}.json`), JSON.stringify(build))
  rmSync(original)
  assert.match(check(directory), /Runtime manifest verified/)
}))

it('runtime manifest rejects an artifact whose metadata-only bytes differ from the recompiled runtime', () => fixture(directory => {
  const artifact = JSON.parse(readFileSync(join(directory, artifactPath), 'utf8'))
  const runtime: string = artifact.deployedBytecode
  artifact.deployedBytecode = runtime.slice(0, -6) + (runtime.slice(-6, -4) === '00' ? '01' : '00') + runtime.slice(-4)
  writeFileSync(join(directory, artifactPath), JSON.stringify(artifact))
  assert.throws(() => check(directory), /Recompiled runtime differs from Hardhat artifact \(including metadata\)/)
}))

it('runtime manifest still rejects a mismatched artifact/build-info reference', () => fixture(directory => {
  const artifact = JSON.parse(readFileSync(join(directory, artifactPath), 'utf8'))
  const path = join(directory, `artifacts/build-info/${artifact.buildInfoId}.json`)
  const build = JSON.parse(readFileSync(path, 'utf8'))
  build.id = 'unrelated-build'
  writeFileSync(path, JSON.stringify(build))
  assert.throws(() => check(directory), /Artifact build-info reference mismatch/)
}))

it('runtime manifest still rejects a modified committed runtime fingerprint', () => fixture(directory => {
  const path = join(directory, manifestPath)
  const original = readFileSync(path, 'utf8')
  const changed = original.replace(/("runtimeKeccak256": "0x)[\da-f]/, '$1f')
  assert.notEqual(changed, original)
  writeFileSync(path, changed)
  assert.throws(() => check(directory), /Runtime manifest is stale or modified/)
}))

it('runtime manifest allows local tool npm scripts without changing pinned compilation inputs', () => fixture(directory => {
  const path = join(directory, 'package.json')
  const pkg = JSON.parse(readFileSync(path, 'utf8'))
  pkg.scripts['integration:test-only'] = 'node --version'
  writeFileSync(path, JSON.stringify(pkg))
  assert.match(check(directory), /Runtime manifest verified/)
}))

it('runtime manifest still rejects compiler dependency changes in package.json', () => fixture(directory => {
  const path = join(directory, 'package.json')
  const pkg = JSON.parse(readFileSync(path, 'utf8'))
  pkg.devDependencies.solc = '0.8.37'
  writeFileSync(path, JSON.stringify(pkg))
  assert.throws(() => check(directory), /package.json devDependencies differs from pinned toolchain/)
}))
