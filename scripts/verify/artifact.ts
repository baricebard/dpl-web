import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadDeploymentArtifact } from '../deploy/artifact.ts'
import type { ArtifactBundle } from '../../tools/verify/engine.ts'

/** Reuse the deployment tool's artifact/build-info/source/version checks; never compile implicitly. */
export function loadVerificationArtifact(): ArtifactBundle {
  try {
    const loaded = loadDeploymentArtifact()
    const root = resolve(import.meta.dirname, '../..')
    const artifact = JSON.parse(readFileSync(resolve(root, 'artifacts/contracts/TeachingToken.sol/TeachingToken.json'), 'utf8'))
    const output = JSON.parse(readFileSync(resolve(root, `artifacts/build-info/${artifact.buildInfoId}.output.json`), 'utf8'))
    const compiled = output.output.contracts['project/contracts/TeachingToken.sol'].TeachingToken
    if (Object.keys(compiled.evm.deployedBytecode.immutableReferences ?? {}).length || Object.keys(compiled.evm.deployedBytecode.linkReferences ?? {}).length) throw new Error('不支援尚未解析的 runtime immutable/link references')
    return { available: true, deployedBytecode: loaded.deployedBytecode, provenance: loaded.provenance,
      sourcePaths: Object.keys(JSON.parse(readFileSync(resolve(root, `artifacts/build-info/${artifact.buildInfoId}.json`), 'utf8')).input.sources) }
  } catch (error) {
    return { available: false, error: `${error instanceof Error ? error.message : String(error)}。請依本機指南還原原始產物，或以鎖定版本執行 npm ci、npm run contracts:compile。` }
  }
}
