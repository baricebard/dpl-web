import { createWalletClient, custom, decodeEventLog, isHash } from 'viem'
import type { Hash } from 'viem'
import { sepolia } from 'viem/chains'
import { amm, ammAbi, ammTokens } from '../../../config/amm'
import { sepoliaPublicClient } from '../../../lib/web3/publicClient'
import { assertSession } from '../../token'
import type { TokenClient } from '../../token'
import type { TransactionSession } from '../../wallet/types'
import type { AmmInput, AmmKind, AmmState, AmmSummary, AmmTransaction } from '../types'
import { ammError, prepareAmm, previewAmm, readAmmSnapshot, validateDeadline } from './ammService'

function actualResult(record: AmmTransaction, logs: Awaited<ReturnType<TokenClient['getTransactionReceipt']>>['logs']) {
  const s = record.summary
  if (record.kind.startsWith('approve')) return undefined
  for (const log of logs) {
    if (log.address.toLowerCase() !== amm.address.toLowerCase()) continue
    try {
      const event = decodeEventLog({ abi: ammAbi, data: log.data, topics: log.topics })
      if (event.eventName === 'Swap' && record.kind === 'swap') {
        const a = event.args
        if (a.sender.toLowerCase() === record.account.toLowerCase() && a.tokenIn.toLowerCase() === ammTokens[s.input.tokenIndex].address.toLowerCase() && a.tokenOut.toLowerCase() === ammTokens[1 - s.input.tokenIndex].address.toLowerCase() && a.amountIn === s.amount && a.amountOut >= s.minAmountOut) return [a.amountOut]
      }
      if ((event.eventName === 'AddLiquidity' && record.kind === 'add') || (event.eventName === 'RemoveLiquidity' && record.kind === 'remove')) {
        const a = event.args
        if (a.provider.toLowerCase() !== record.account.toLowerCase() || a.amountDPLT < s.minima[0] || a.amountDPLTA < s.minima[1]) continue
        if (record.kind === 'add' && (a.liquidity < s.minLiquidity || a.amountDPLT > s.desired[0] || a.amountDPLTA > s.desired[1])) continue
        if (record.kind === 'remove' && a.liquidity !== s.amount) continue
        return [a.amountDPLT, a.amountDPLTA, a.liquidity]
      }
    } catch { /* 只採用可解碼且符合原摘要的事件。 */ }
  }
  throw new Error('Receipt success 但缺少符合摘要的 AMM 事件，結果未知。')
}

export function createAmmStore(client: TokenClient = sepoliaPublicClient) {
  let state: AmmState = { status: 'idle', busy: false, loading: false, history: [] }
  let revision = 0, reading = 0
  const listeners = new Set<() => void>()
  const update = (patch: Partial<AmmState>) => { state = { ...state, ...patch }; listeners.forEach(listener => listener()) }
  const unresolved = () => ['unknown', 'submitted', 'confirming', 'awaiting-wallet'].includes(state.status)
  async function refresh(session: TransactionSession, fresh = false) {
    if (state.loading) return
    const ticket = ++reading
    update({ loading: true, snapshot: undefined, error: undefined })
    try {
      const snapshot = await readAmmSnapshot(session, client, fresh)
      if (ticket === reading && session.isCurrent()) update({ snapshot })
    } catch (error) { if (ticket === reading) update({ error: '查詢失敗：' + ammError(error), snapshot: undefined }) }
    finally { if (ticket === reading) update({ loading: false }) }
  }
  async function track(wait = false, recoveredHash?: Hash) {
    const record = state.transaction
    const hash = record?.originalHash ?? recoveredHash
    if (state.busy || !record || !hash) return
    update({ busy: true, status: 'confirming', message: '正在查詢原交易，不會重送。' })
    try {
      if (await client.getChainId() !== amm.chainId) throw new Error('RPC 網路不符。')
      // 補回 Hash 也必須先核對原交易；拒絕任意 Hash 覆蓋紀錄。
      const tx = await client.getTransaction({ hash })
      if (tx.from.toLowerCase() !== record.account.toLowerCase() || tx.to?.toLowerCase() !== record.to.toLowerCase() || tx.input.toLowerCase() !== record.data.toLowerCase() || tx.value !== 0n) throw new Error('實際交易不符合原始帳號、目標或 calldata，請查 MetaMask 原交易。')
      record.originalHash = hash
      update({ transaction: { ...record } })
      if (wait) await client.waitForTransactionReceipt({ hash, confirmations: 1, retryCount: 0, timeout: 60_000, pollingInterval: 8_000 })
      const receipt = await client.getTransactionReceipt({ hash })
      const [block, height, minedTx] = await Promise.all([client.getBlock({ blockNumber: receipt.blockNumber }), client.getBlockNumber({ cacheTime: 0 }), client.getTransaction({ hash })])
      if (receipt.transactionHash.toLowerCase() !== hash.toLowerCase() || block.hash !== receipt.blockHash || height < receipt.blockNumber || minedTx.blockHash !== receipt.blockHash) throw new Error('Receipt 尚未確認或可能重組。')
      if (minedTx.from.toLowerCase() !== record.account.toLowerCase() || minedTx.to?.toLowerCase() !== record.to.toLowerCase() || minedTx.input.toLowerCase() !== record.data.toLowerCase() || minedTx.value !== 0n) throw new Error('已確認交易與原摘要不符。')
      if (receipt.status !== 'success') {
        update({ status: 'failed', transaction: { ...record, receiptStatus: receipt.status }, message: '交易失敗：Receipt reverted。可重新準備，仍需獨立確認。' }); return
      }
      const actual = actualResult(record, receipt.logs)
      update({ status: 'success', transaction: { ...record, receiptStatus: receipt.status, actual }, preview: undefined,
        message: 'Receipt success，至少 1 個區塊確認；不代表最終確定性。' + (record.kind.startsWith('approve') ? ' 授權成功不等於交換或注資成功，請另行準備下一筆交易。' : ' 實際成交結果以事件為準。') })
      if (record.summary.session.isCurrent()) {
        await refresh(record.summary.session, true)
        if (record.kind.startsWith('approve') && state.snapshot) {
          const i = record.kind === 'approveDPLT' ? 0 : 1
          const needed = record.summary.input.operation === 'add' ? record.summary.desired[i] : record.summary.amount
          if (state.snapshot.allowances[i] < needed) update({ error: '授權 Receipt 已成功，但目前 allowance 仍不足；請重新查詢。' })
        }
      }
    } catch (error) { update({ status: 'unknown', message: ammError(error) + ' 保留原交易資訊，請手動查詢，不要重送。' }) }
    finally { update({ busy: false }) }
  }
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    getSnapshot: () => state,
    invalidate(clear = false) {
      revision++
      if (clear) { reading++; update({ snapshot: undefined, loading: false }) }
      update({ summary: undefined, preview: undefined, error: undefined })
    },
    reject(error: unknown) { update({ error: ammError(error) }) },
    refresh,
    async preview(session: TransactionSession, input: AmmInput) {
      if (state.busy || unresolved()) return
      const ticket = revision
      update({ busy: true, preview: undefined, summary: undefined, error: undefined })
      try {
        const preview = await previewAmm(session, input, client)
        if (ticket === revision && session.isCurrent()) update({ preview, snapshot: preview.snapshot })
      } catch (error) { if (ticket === revision) update({ error: '報價／估算失敗：' + ammError(error), snapshot: undefined }) }
      finally { update({ busy: false }) }
    },
    async prepare(kind: AmmKind, session: TransactionSession, input: AmmInput) {
      if (state.busy || unresolved()) return
      const ticket = revision
      update({ busy: true, status: 'validating', summary: undefined, error: undefined, message: '正在核對餘額、allowance、模擬與 Gas。' })
      try {
        const summary = await prepareAmm(kind, session, input, client)
        if (ticket !== revision || !session.isCurrent()) throw new Error('表單、帳號或網路已變動，請重新準備。')
        update({ summary, preview: summary, snapshot: summary.snapshot, status: 'idle', message: '請核對摘要，再明確確認本筆交易。' })
      } catch (error) { update({ status: 'failed', message: ammError(error), snapshot: undefined, preview: undefined }) }
      finally { update({ busy: false }) }
    },
    async confirm(summary: AmmSummary) {
      if (state.busy || unresolved() || state.summary !== summary) return
      const ticket = revision
      let requested = false
      update({ busy: true, summary: undefined, status: 'validating', error: undefined })
      try {
        if (Date.now() - summary.createdAt > amm.summaryTtl) throw new Error('摘要已過期，請重新準備。')
        validateDeadline(summary.deadline)
        const fresh = await prepareAmm(summary.kind, summary.session, summary.input, client, summary.deadline, summary)
        if (fresh.data !== summary.data) throw new Error('所需數量已變動，請重新準備。')
        if (fresh.gas > summary.gas || fresh.gasPrice > summary.gasPrice || fresh.snapshot.ethBalance < summary.gas * summary.gasPrice) throw new Error('Gas 條件已變動，請重新準備。')
        await assertSession(summary.session); validateDeadline(summary.deadline)
        if (ticket !== revision || !summary.session.isCurrent()) throw new Error('摘要已失效，請重新準備。')
        if (state.transaction) update({ history: [...state.history, state.transaction] })
        const record: AmmTransaction = { kind: summary.kind, account: summary.session.address, chainId: 11155111, to: summary.to, data: summary.data, summary }
        update({ status: 'awaiting-wallet', transaction: record, message: '請親自確認 MetaMask。帳號或網路變更時，請拒絕未送出的請求。' })
        const wallet = createWalletClient({ chain: sepolia, transport: custom(summary.session.provider, { retryCount: 0 }) })
        requested = true
        const hash = await wallet.sendTransaction({ account: record.account, chain: sepolia, to: record.to, data: record.data, value: 0n, gas: summary.gas, gasPrice: summary.gasPrice })
        if (!isHash(hash)) throw new Error('錢包未回傳有效 Hash，請先查 MetaMask 活動。')
        update({ status: 'submitted', transaction: { ...record, originalHash: hash }, message: '已取得 Hash，尚未確認成功。' })
      } catch (error) {
        const message = ammError(error), unknown = requested && !message.includes('使用者拒絕')
        update({ status: unknown ? 'unknown' : 'failed', message: message + (unknown ? ' 發送結果未知，禁止重送；請先查 MetaMask 活動並補回原 Hash。' : ''), snapshot: undefined, preview: undefined })
      } finally { update({ busy: false }) }
      if (state.status === 'submitted') await track(true)
    },
    track: () => track(),
    recover(hash: string) {
      if (state.status !== 'unknown' || state.transaction?.originalHash) return
      if (!isHash(hash)) { update({ error: '請輸入有效的原交易 Hash。' }); return }
      return track(false, hash)
    },
  }
}
