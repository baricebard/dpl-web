import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
const forbidden = ['eth_sendTransaction', 'encodeDeployData', 'dpl-sepolia-deployment-v1', 'DPL 本機 Sepolia 部署工具', 'C6EdF1cBb0aC65d7DefF5CDadA1721C90951ea02', 'teaching-artifact', 'tools/deploy', '608060405234801561000f575f5ffd5b50604051610b53']
function check(dir: string) {
  for (const file of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, file.name)
    if (file.isDirectory()) check(path)
    else {
      const content = readFileSync(path, 'utf8')
      for (const marker of forbidden) assert(!content.includes(marker), `Deployment code leaked into production: ${path} (${marker})`)
    }
  }
}
check('dist')
console.log('Production output contains no deployment entry, transaction sender, or TeachingToken bytecode')
