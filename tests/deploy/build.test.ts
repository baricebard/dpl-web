import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

test('local deployment config refuses production build', () => {
  const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'tools/deploy/vite.config.ts'], { encoding: 'utf8' })
  assert.notEqual(result.status, 0)
  assert.match(result.stdout + result.stderr, /Local deployment tool cannot be built or previewed/)
})
