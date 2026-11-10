import { getAddress, isAddress } from 'viem'
import type { Address } from 'viem'
import { sepoliaRpc } from '../../config/rpc'
import { sepoliaPublicClient } from './publicClient'

export interface BalanceSnapshot { wei: bigint; updatedAt: number }
export class BalanceReadError extends Error {
  constructor(message: string, readonly retryAt: number) { super(message) }
}

function failure(error: unknown) {
  let current = error
  let timeout = false
  let rateLimited = false
  let retryAfter = 0
  for (let depth = 0; current && typeof current === 'object' && depth < 12; depth++) {
    const item = current as { name?: string; status?: number; code?: number; message?: string; cause?: unknown; headers?: Headers }
    timeout ||= /timeout/i.test(item.name ?? '')
    rateLimited ||= item.status === 429 || item.code === 429 || item.code === -32005 || /rate limit|too many requests/i.test(item.message ?? '')
    const header = item.headers?.get('retry-after')
    if (header) {
      const seconds = Number(header)
      retryAfter = Math.max(retryAfter, Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now())
    }
    current = item.cause
  }
  return { timeout, rateLimited, retryAfter }
}

// 僅保存進行中請求，完成後移除；不持久保存學生地址／餘額。
const pending = new Map<Address, Promise<BalanceSnapshot>>()
let rateLimitUntil = 0
let chainCheck: Promise<void> | undefined
let chainCheckedAt = 0
async function verifyChain() {
  if (Date.now() - chainCheckedAt < 60_000) return
  chainCheck ??= sepoliaPublicClient.getChainId().then(chainId => {
    if (chainId !== 11155111) throw new Error('Unexpected RPC chain')
    chainCheckedAt = Date.now()
  }).finally(() => { chainCheck = undefined })
  await chainCheck
}

export function readSepoliaBalance(input: Address): Promise<BalanceSnapshot> {
  if (!isAddress(input)) return Promise.reject(new BalanceReadError('地址無效，請重新連接錢包。', Date.now()))
  const address = getAddress(input)
  const active = pending.get(address)
  if (active) return active
  if (Date.now() < rateLimitUntil) return Promise.reject(new BalanceReadError('RPC 請求過多，請稍候再重新查詢。', rateLimitUntil))
  const request = (async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        await verifyChain()
        const wei = await sepoliaPublicClient.getBalance({ address, blockTag: 'latest' })
        return { wei, updatedAt: Date.now() }
      } catch (error) {
        const { timeout, rateLimited, retryAfter } = failure(error)
        if (rateLimited) {
          rateLimitUntil = Date.now() + Math.max(sepoliaRpc.rateLimitCooldownMs, retryAfter || 0)
          throw new BalanceReadError('RPC 請求過多，請稍候再重新查詢。', rateLimitUntil)
        }
        // 每次讀取最多重試一次；不自動重試限流，亦不輪詢。
        if (attempt === 0) {
          await new Promise(resolve => setTimeout(resolve, sepoliaRpc.retryDelayMs))
          if (Date.now() < rateLimitUntil) throw new BalanceReadError('RPC 請求過多，請稍候再重新查詢。', rateLimitUntil)
          continue
        }
        throw new BalanceReadError(timeout ? '餘額查詢逾時，請確認網路後重試。' : '餘額查詢失敗，Sepolia RPC 暫時無法使用，請稍後重試。', Date.now() + sepoliaRpc.refreshIntervalMs)
      }
    }
  })().finally(() => { pending.delete(address) })
  pending.set(address, request)
  return request
}
