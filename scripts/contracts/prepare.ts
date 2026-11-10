import { prepareSepoliaPlan } from './spec.ts'

// Offline preparation only: never loads accounts or sends RPC requests.
const plan = prepareSepoliaPlan(Number(process.env.TOKEN_CHAIN_ID), process.env.TEACHER_ADDRESS ?? '')
console.log(JSON.stringify(plan, (_, value: unknown) => typeof value === 'bigint' ? value.toString() : value, 2))
