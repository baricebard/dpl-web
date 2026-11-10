import { createWalletClient, custom, encodeFunctionData, formatUnits, isHash } from 'viem'
import { sepolia } from 'viem/chains'
import { teachingTokenAbi } from '../../../config/tokens'
import { sepoliaPublicClient } from '../../../lib/web3/publicClient'
import type { TransactionSession } from '../../wallet/types'
import type { TransactionRecord, TransferInput, TransferState, TransferSummary } from '../types'
import { assertSession, prepareTransfer, tokenError } from './tokenService'
import type { TokenClient } from './tokenService'

const dataFor = (summary: Pick<TransferSummary, 'recipient' | 'amount'>) => encodeFunctionData({ abi: teachingTokenAbi, functionName: 'transfer', args: [summary.recipient, summary.amount] })
export function createTransferStore(client: TokenClient = sepoliaPublicClient, onSuccess: () => void = () => {}) {
  let state: TransferState = { status: 'idle' }
  let busy = false
  let unresolved = false
  const listeners = new Set<() => void>()
  function update(patch: Partial<TransferState>) { state = { ...state, ...patch }; listeners.forEach(listener => listener()) }
  async function checkReceipt(record: TransactionRecord) {
    const receipt = await client.getTransactionReceipt({ hash: record.hash })
    const [block, height, tx] = await Promise.all([client.getBlock({ blockNumber: receipt.blockNumber }), client.getBlockNumber({ cacheTime: 0 }), client.getTransaction({ hash: record.hash })])
    if (receipt.transactionHash.toLowerCase() !== record.hash.toLowerCase() || block.hash !== receipt.blockHash || height < receipt.blockNumber || tx.blockHash !== receipt.blockHash) throw new Error('Receipt 可能重組或尚未確認，結果未知，請重新查詢。')
    if (receipt.status !== 'success') { unresolved = false; update({ status: 'failed', message: '交易失敗：Receipt status = reverted。' }); return }
    if (tx.from.toLowerCase() !== record.account.toLowerCase() || tx.to?.toLowerCase() !== record.token.address.toLowerCase() || tx.input.toLowerCase() !== dataFor(record).toLowerCase() || tx.value !== 0n) {
      unresolved = false
      update({ status: 'failed', message: '交易被替換或取消，實際交易不符合原轉帳，不能標示成功。' }); return
    }
    unresolved = false
    update({ status: 'success', message: 'Receipt 成功，至少 1 個區塊確認。這不代表 Ethereum 最終確定性；仍可重新查詢以檢查重組。' })
    onSuccess()
  }
  async function track(wait: boolean) {
    if (busy || !state.transaction) return
    busy = true
    update({ status: 'confirming', message: '等待鏈上結果；不會重新發送交易。' })
    try {
      if (await client.getChainId() !== 11155111) throw new Error('RPC 網路不符，結果未知。')
      if (wait) {
        await client.waitForTransactionReceipt({ hash: state.transaction!.hash, confirmations: 1, retryCount: 0, timeout: 60_000, pollingInterval: 8_000,
          onReplaced(replacement) {
            const previous = state.transaction!
            update({ transaction: { ...previous, hash: replacement.transaction.hash, replacement: replacement.reason }, message: `交易已替換：${replacement.reason}；重新核對實際交易。` })
          },
        })
      }
      await checkReceipt(state.transaction!)
    } catch (error) { unresolved = true; update({ status: 'unknown', message: tokenError(error) + ' 請使用原交易 Hash 手動查詢；不自動重送。' }) }
    finally { busy = false }
  }
  return {
    rejectPreparation(error: unknown) {
      if (!busy && !unresolved) update({ status: 'failed', summary: undefined, message: tokenError(error) })
    },
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    async prepare(session: TransactionSession, input: TransferInput) {
      if (busy || unresolved) return
      busy = true
      update({ status: 'validating', summary: undefined, message: '正在核對合約、餘額及模擬轉帳。' })
      try { update({ status: 'idle', summary: await prepareTransfer(session, input, client), message: '請核對完整摘要，再明確確認。' }) }
      catch (error) { update({ status: 'failed', message: tokenError(error) }) }
      finally { busy = false }
    },
    async confirm(summary: TransferSummary) {
      if (busy || unresolved || state.summary !== summary) return
      busy = true
      update({ status: 'validating', summary: undefined, message: '送出前重新確認帳號、網路、合約、餘額與 Gas。' })
      let requested = false
      try {
        if (Date.now() - summary.createdAt > 120_000) throw new Error('摘要已過期，請重新檢查。')
        const fresh = await prepareTransfer(summary.session, { tokenId: summary.token.id, recipient: summary.recipient, amount: formatUnits(summary.amount, summary.token.decimals) }, client)
        if (fresh.gas > summary.gas || fresh.gasPrice > summary.gasPrice || fresh.ethBalance < summary.gas * summary.gasPrice) throw new Error('Gas 條件已變動，請重新檢查摘要。')
        await assertSession(summary.session)
        update({ status: 'awaiting-wallet', previousTransactions: [...(state.previousTransactions ?? []), ...(state.transaction ? [state.transaction] : [])], transaction: undefined, message: '請親自於 MetaMask 核准；若切換帳號或網路，請拒絕該請求。' })
        const wallet = createWalletClient({ chain: sepolia, transport: custom(summary.session.provider, { retryCount: 0 }) })
        if (!summary.session.isCurrent()) throw new Error('帳號或網路已切換，已停止轉帳。')
        requested = true
        const hash = await wallet.writeContract({ chain: sepolia, account: summary.session.address, address: summary.token.address,
          abi: teachingTokenAbi, functionName: 'transfer', args: [summary.recipient, summary.amount], gas: summary.gas, gasPrice: summary.gasPrice })
        if (!isHash(hash)) throw new Error('錢包未回傳有效 Hash，請檢查 MetaMask 活動。')
        unresolved = true
        update({ status: 'submitted', transaction: { account: summary.session.address, chainId: 11155111, token: summary.token, recipient: summary.recipient, amount: summary.amount, originalHash: hash, hash },
          message: '已取得 Hash，不代表成功；保留原始帳號與鏈資訊。' })
      } catch (error) {
        const message = tokenError(error)
        unresolved = requested && !message.includes('使用者拒絕')
        update({ status: unresolved ? 'unknown' : 'failed', message: unresolved ? message + ' 發送結果未知，請先檢查 MetaMask 活動，不要重送。' : message })
      } finally { busy = false }
      if (state.status === 'submitted') await track(true)
    },
    invalidateSummary() { if (state.summary) update({ summary: undefined, message: '表單已變動，請重新檢查摘要。' }) },
    track: () => track(false),
  }
}
