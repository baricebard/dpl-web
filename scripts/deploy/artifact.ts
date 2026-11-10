import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '../..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

/** Read only Hardhat's existing output. Never compile in a browser or substitute bytecode. */
export function loadDeploymentArtifact() {
  const path = 'artifacts/contracts/TeachingToken.sol/TeachingToken.json'
  if (!existsSync(resolve(root, path))) throw new Error('Run npm run contracts:compile first')
  const artifact = JSON.parse(read(path))
  const infoPath = `artifacts/build-info/${artifact.buildInfoId}.json`
  const info = JSON.parse(read(infoPath))
  const output = JSON.parse(read(`artifacts/build-info/${artifact.buildInfoId}.output.json`))
  const compiled = output.output.contracts['project/contracts/TeachingToken.sol'].TeachingToken
  const solc = require('solc') as { version(): string }
  const oz = JSON.parse(read('node_modules/@openzeppelin/contracts/package.json')).version
  if (info.solcVersion !== '0.8.38' || solc.version() !== '0.8.38+commit.1835d247.Emscripten.clang' || oz !== '5.6.1') {
    throw new Error('Unexpected compiler or OpenZeppelin version')
  }
  for (const [name, source] of Object.entries(info.input.sources) as [string, { content: string }][]) {
    const localPath = name.startsWith('npm/') ? `node_modules/${name.slice(4).replace('@5.6.1/', '/')}` : name.replace(/^project\//, '')
    if (read(localPath) !== source.content) throw new Error(`Stale Hardhat source: ${name}`)
  }
  if (artifact.bytecode !== `0x${compiled.evm.bytecode.object}` || artifact.deployedBytecode !== `0x${compiled.evm.deployedBytecode.object}` || JSON.stringify(artifact.abi) !== JSON.stringify(compiled.abi)) {
    throw new Error('Artifact and build output differ')
  }
  if (!/^0x[0-9a-f]+$/i.test(artifact.bytecode) || Object.keys(artifact.linkReferences).length) throw new Error('Unsupported bytecode')
  // A clean source commit is necessary for a reproducible provenance record.
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  if (git('status', '--porcelain', '--', 'contracts', 'hardhat.config.ts', 'package-lock.json')) {
    throw new Error('Commit contract/config/dependency changes before using deployment tool')
  }
  const committedPackage = JSON.parse(git('show', 'HEAD:package.json'))
  const installedPackage = JSON.parse(read('package.json'))
  for (const field of ['dependencies', 'devDependencies', 'engines']) {
    if (JSON.stringify(committedPackage[field]) !== JSON.stringify(installedPackage[field])) throw new Error('Commit dependency changes before deployment')
  }
  const settings = info.input.settings
  if (!settings.optimizer.enabled || settings.optimizer.runs !== 200 || settings.evmVersion !== 'cancun') throw new Error('Unexpected compiler settings')
  return {
    abi: artifact.abi, bytecode: artifact.bytecode, deployedBytecode: artifact.deployedBytecode,
    provenance: {
      commit: git('rev-parse', 'HEAD'), compiler: solc.version(), openZeppelin: oz,
      lockfileSha256: sha256(read('package-lock.json')), artifactSha256: sha256(read(path)),
      inputSha256: sha256(JSON.stringify(info.input)), buildInfoId: artifact.buildInfoId, settings,
    },
  }
}
