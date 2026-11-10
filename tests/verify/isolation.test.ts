import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'

for (const command of ['build', 'preview']) {
  test(`verification Vite configuration rejects ${command}`, () => {
    const child = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', command, '--config', 'tools/verify/vite.config.ts'], { encoding: 'utf8', timeout: 15000 })
    assert.equal(child.status, 1, child.error?.message)
    assert.match(child.stdout + child.stderr, /localhost development only; no build or preview/)
  })
}
