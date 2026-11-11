import { createWalletClient, custom, decodeEventLog, formatUnits, isHash } from 'viem'
import { sepolia } from 'viem/chains'
import { exchange, exchangeAbi, exchangeSummaryTtl } from '../../../config/exchange'
import { tokens } from '../../../config/tokens'
import { sepoliaPublicClient } from '../../../lib/web3/publicClient'
import { assertSession } from '../../token'
import type { TokenClient } from '../../token'
import type { TransactionSession } from '../../wallet/types'
import type { ExchangeInput, ExchangeKind, ExchangeState, ExchangeSummary } from '../types'
import { exchangeError, prepareExchange, readExchangeQuote, readExchangeSnapshot } from './exchangeService'

export function createExchangeStore(client: TokenClient = sepoliaPublicClient) {
  let state: ExchangeState = { approve: { status: 'idle' }, swap: { status: 'idle' }, loading: false, busy: false, history: [] }
  let revision = 0
  let reading = 0
  const listeners = new Set<() => void>()
  const update = (patch: Partial<ExchangeState>) => { state = { ...state, ...patch }; listeners.forEach(listener => listener()) }
  const step = (kind: ExchangeKind, patch: Partial<ExchangeState['approve']>) => update({ [kind]: { ...state[kind], ...patch } })
  const unresolved = () => (['approve', 'swap'] as const).some(kind => ['unknown', 'submitted', 'confirming', 'awaiting-wallet'].includes(state[kind].status))
  async function refresh(session: TransactionSession, fresh = false) {
    if (state.loading) return
    const ticket = ++reading
    update({ loading: true, data: undefined, error: undefined })
    try {
      const data = await readExchangeSnapshot(session, client, fresh)
      if (ticket === reading && session.isCurrent()) update({ data })
    } catch (error) { if (ticket === reading) update({ data: undefined, error: '查詢失敗：' + exchangeError(error) }) }
    finally { if (ticket === reading) update({ loading: false }) }
  }
  async function track(kind: ExchangeKind, wait = false) {
    const record = state[kind].transaction
    if (state.busy || !record) return
    update({ busy: true })
    step(kind, { status: 'confirming', message: '查詢原交易 Receipt，不會重新發送。' })
    try {
      if (await client.getChainId() !== exchange.chainId) throw new Error('RPC 網路不符，結果未知。')
      if (wait) await client.waitForTransactionReceipt({ hash: record.hash, confirmations: 1, retryCount: 0, timeout: 60_000, pollingInterval: 8_000,
        onReplaced(replacement) {
          // 保留原始 Hash；僅在實際 calldata 仍相同時允許 repricing 成功。
          record.hash = replacement.transaction.hash
          step(kind, { transaction: { ...record } })
        },
      })
      const receipt = await client.getTransactionReceipt({ hash: record.hash })
      const [block, height, tx] = await Promise.all([
        client.getBlock({ blockNumber: receipt.blockNumber }), client.getBlockNumber({ cacheTime: 0 }), client.getTransaction({ hash: record.hash }),
      ])
      if (receipt.transactionHash.toLowerCase() !== record.hash.toLowerCase() || block.hash !== receipt.blockHash || height < receipt.blockNumber || tx.blockHash !== receipt.blockHash) throw new Error('Receipt 尚未確認或可能重組，結果未知。')
      if (tx.from.toLowerCase() !== record.account.toLowerCase() || tx.to?.toLowerCase() !== record.to.toLowerCase() || tx.input.toLowerCase() !== record.data.toLowerCase() || tx.value !== 0n) {
        step(kind, { status: 'failed', message: '實際交易不符合原摘要，可能已替換或取消。', transaction: { ...record, receiptStatus: receipt.status } }); return
      }
      if (receipt.status !== 'success') {
        step(kind, { status: 'failed', message: '交易失敗：Receipt status = reverted。', transaction: { ...record, receiptStatus: receipt.status } }); return
      }
      let received: bigint | undefined
      if (kind === 'swap') {
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() !== exchange.address.toLowerCase()) continue
          try {
            const event = decodeEventLog({ abi: exchangeAbi, eventName: 'Swap', data: log.data, topics: log.topics })
            if (event.args.sender.toLowerCase() === record.account.toLowerCase() && event.args.tokenIn.toLowerCase() === record.tokenIn.address.toLowerCase() && event.args.tokenOut.toLowerCase() === record.tokenOut.address.toLowerCase() && event.args.amountIn === record.amountIn && event.args.amountOut >= record.minAmountOut) received = event.args.amountOut
          } catch { /* 非 Swap log 不作為交換證據。 */ }
        }
        if (received === undefined) throw new Error('Receipt success 但無符合的 Swap 事件，結果未知。')
      }
      step(kind, { status: 'success', transaction: { ...record, receiptStatus: receipt.status, received }, message: kind === 'approve'
        ? 'approve Receipt success，至少 1 個區塊確認。授權成功不等於交換成功；請重新查 allowance 並另行確認 swap。'
        : 'Swap Success：Receipt success，至少 1 個區塊確認；不代表 Ethereum 最終確定性。' })
      // 使用原交易工作階段；切換後不把原帳號資料套用給新帳號。
      const session = lastSessions[kind]
      if (session?.isCurrent()) {
        await refresh(session, true)
        if (kind === 'approve' && state.data && state.data.allowances[tokens.indexOf(record.tokenIn)] < record.amountIn) update({ error: 'approve 已成功，但目前 allowance 仍不足；不能進入 swap。' })
      }
    } catch (error) { step(kind, { status: 'unknown', message: exchangeError(error) + ' 保留原 Hash，請手動查詢，不要重送。' }) }
    finally { update({ busy: false }) }
  }
  const lastSessions: Partial<Record<ExchangeKind, TransactionSession>> = {}
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    getSnapshot: () => state,
    refresh,
    invalidate(clearData = false) {
      revision++
      if (clearData) { reading++; update({ data: undefined, loading: false }) }
      update({ summary: undefined, quote: undefined, error: undefined })
    },
    reject(error: unknown) { update({ error: exchangeError(error) }) },
    async quote(session: TransactionSession, input: ExchangeInput) {
      if (state.busy || unresolved()) return
      const ticket = revision
      update({ busy: true, quote: undefined, summary: undefined, error: undefined })
      try {
        const [quote, data] = await Promise.all([readExchangeQuote(session, input, client), readExchangeSnapshot(session, client)])
        if (ticket === revision && session.isCurrent()) update({ quote, data })
      } catch (error) { if (ticket === revision) update({ data: undefined, quote: undefined, error: '報價查詢失敗：' + exchangeError(error) }) }
      finally { update({ busy: false }) }
    },
    async prepare(kind: ExchangeKind, session: TransactionSession, input: ExchangeInput) {
      if (state.busy || unresolved()) return
      const ticket = revision
      update({ busy: true, summary: undefined, error: undefined })
      step(kind, { status: 'validating', message: '正在檢查帳號、網路、報價、allowance、庫存、模擬與 Gas。' })
      try {
        const summary = await prepareExchange(kind, session, input, client)
        if (ticket !== revision || !session.isCurrent()) throw new Error('表單、帳號或網路已變動，請重新檢查。')
        update({ summary, quote: summary, data: summary.snapshot })
        step(kind, { status: 'idle', message: '請核對摘要，再明確確認本筆交易。' })
      } catch (error) { update({ data: undefined, quote: undefined }); step(kind, { status: 'failed', message: exchangeError(error) }) }
      finally { update({ busy: false }) }
    },
    async confirm(summary: ExchangeSummary) {
      if (state.busy || unresolved() || state.summary !== summary) return
      const ticket = revision
      const kind = summary.kind
      let requested = false
      update({ busy: true, summary: undefined, error: undefined })
      step(kind, { status: 'validating', message: '送出前重新核對所有條件。' })
      try {
        if (Date.now() - summary.createdAt > exchangeSummaryTtl) throw new Error('報價與摘要已過期，請重新確認。')
        const fresh = await prepareExchange(kind, summary.session, { tokenIn: summary.tokenIn.id, tokenOut: summary.tokenOut.id, amount: formatUnits(summary.amountIn, 18) }, client)
        if (fresh.amountOut !== summary.amountOut || fresh.data !== summary.data) throw new Error('報價已變動，請重新確認。')
        if (fresh.gas > summary.gas || fresh.gasPrice > summary.gasPrice || fresh.snapshot.ethBalance < summary.gas * summary.gasPrice) throw new Error('Gas 條件已變動，請重新確認。')
        await assertSession(summary.session)
        if (ticket !== revision || !summary.session.isCurrent()) throw new Error('摘要已失效，請重新確認。')
        const previous = state[kind].transaction
        if (previous) update({ history: [...state.history, previous] })
        step(kind, { status: 'awaiting-wallet', transaction: undefined, message: '請親自核准 MetaMask；若帳號或網路改變，請拒絕該請求。' })
        const wallet = createWalletClient({ chain: sepolia, transport: custom(summary.session.provider, { retryCount: 0 }) })
        lastSessions[kind] = summary.session
        requested = true
        const hash = await wallet.sendTransaction({ account: summary.session.address, chain: sepolia, to: summary.to, data: summary.data, value: 0n, gas: summary.gas, gasPrice: summary.gasPrice })
        if (!isHash(hash)) throw new Error('MetaMask 未回傳有效 Hash，請先查錢包活動。')
        step(kind, { status: 'submitted', transaction: {
          kind, account: summary.session.address, chainId: 11155111, tokenIn: summary.tokenIn, tokenOut: summary.tokenOut,
          amountIn: summary.amountIn, amountOut: summary.amountOut, minAmountOut: summary.amountOut, to: summary.to, data: summary.data, originalHash: hash, hash,
        }, message: '已取得 Hash，尚未成功。' })
      } catch (error) {
        update({ data: undefined, quote: undefined })
        const message = exchangeError(error)
        const unknown = requested && !message.includes('使用者拒絕')
        step(kind, { status: unknown ? 'unknown' : 'failed', message: message + (unknown ? ' 發送結果未知，請先查 MetaMask 活動；不得重送。' : '') })
      } finally { update({ busy: false }) }
      if (state[kind].status === 'submitted') await track(kind, true)
    },
    track: (kind: ExchangeKind) => track(kind),
  }
}
