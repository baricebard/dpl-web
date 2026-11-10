import { createPublicClient, http } from 'viem'
import { prepareSepoliaPlan } from './spec.ts'

// Validate public inputs before contacting RPC. No wallet client or signing.
prepareSepoliaPlan(Number(process.env.TOKEN_CHAIN_ID), process.env.TEACHER_ADDRESS ?? '')
const url = process.env.SEPOLIA_RPC_URL
if (!url || new URL(url).protocol !== 'https:') throw new Error('An HTTPS Sepolia RPC URL is required')
const client = createPublicClient({ transport: http(url, { retryCount: 0, timeout: 8000 }) })
const chainId = await client.getChainId()
const plan = prepareSepoliaPlan(chainId, process.env.TEACHER_ADDRESS ?? '')
console.log(JSON.stringify(plan, (_, value: unknown) => typeof value === 'bigint' ? value.toString() : value, 2))
