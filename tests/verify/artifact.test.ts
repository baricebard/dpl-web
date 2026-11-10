import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, renameSync, readFileSync, writeFileSync } from 'node:fs'
import { loadVerificationArtifact } from '../../scripts/verify/artifact.ts'

test('loader checks actual Hardhat output, missing artifact and tampered runtime', () => {
  const path = 'artifacts/contracts/TeachingToken.sol/TeachingToken.json'
  assert(existsSync(path))
  assert.equal(loadVerificationArtifact().available, true)
  renameSync(path, path + '.verify-test-backup')
  try {
    const missing = loadVerificationArtifact()
    assert.equal(missing.available, false); assert.match(missing.error!, /compile/)
  } finally { renameSync(path + '.verify-test-backup', path) }
  const raw = readFileSync(path, 'utf8')
  try {
    const changed = JSON.parse(raw); changed.deployedBytecode = '0x6000'
    writeFileSync(path, JSON.stringify(changed))
    const invalid = loadVerificationArtifact()
    assert.equal(invalid.available, false); assert.match(invalid.error!, /differ/)
  } finally { writeFileSync(path, raw) }
})
