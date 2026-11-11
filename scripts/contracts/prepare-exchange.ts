import { readFileSync } from 'node:fs'
import { prepareExchangePlan } from './exchange-spec.ts'

// Offline only. The plan file contains public parameters, never secrets.
const config = JSON.parse(readFileSync(new URL('../../docs/12-fixed-exchange-plan.json', import.meta.url), 'utf8'))
console.log(JSON.stringify(prepareExchangePlan(config.chainId, config.dplt, config.assetA, config.assetB, config.administrator), null, 2))
