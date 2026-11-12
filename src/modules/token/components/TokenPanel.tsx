import { transactionLabels } from '../../../config/transactionLabels'
import { displayEther } from '../../../lib/web3/display'
import { LearningIntro, LearningOutro } from '../../../shared/components/LearningJourney'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { formatEther, formatUnits } from 'viem'
import { tokens } from '../../../config/tokens'
import { useSepoliaBalance } from '../../../shared/hooks/useSepoliaBalance'
import { useWallet } from '../../wallet'
import { useTokenBalances } from '../hooks/useTokenBalances'
import { createTransferStore } from '../services/transferStore'

export function TokenPanel() {
  const wallet = useWallet()
  const balances = useTokenBalances(wallet.address, wallet.chainId)
  const eth = useSepoliaBalance(wallet.address, wallet.chainId)
  const [store] = useState(() => createTransferStore())
  const transfer = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const refreshTokens = balances.refresh
  const refreshEth = eth.refresh
  useEffect(() => {
    if (transfer.status === 'success') { void refreshTokens(true); void refreshEth() }
  }, [transfer.status, refreshTokens, refreshEth])
  const [tokenId, setTokenId] = useState(tokens[0].id)
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [now, setNow] = useState(0)
  useEffect(() => {
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, balances.retryAt - Date.now()) + 10)
    return () => clearTimeout(timer)
  }, [balances.retryAt])
  const ready = wallet.canTransact
  const selected = balances.data?.balances.find(item => item.token.id === tokenId)
  const busy = ['validating', 'awaiting-wallet', 'submitted', 'confirming'].includes(transfer.status)
  const unknown = transfer.status === 'unknown'
  const summary = transfer.summary?.session.isCurrent() ? transfer.summary : undefined
  const tx = transfer.transaction
  return <section id="token" className="wallet-panel token-panel" aria-labelledby="token-panel-title">
    <p className="eyebrow">TOKEN / ERC-20</p><h2 id="token-panel-title">教學代幣與單筆轉帳</h2>
    <LearningIntro moduleId="token" />
    <p>僅限 Ethereum Sepolia（11155111）。三種代幣各固定供給 1,000,000、18 位小數，無公開 Mint 或特殊管理權限；由教師分發。ERC-20 transfer 無需 approve。</p>
    <p>錢包地址與交易公開可查。網站不要求私鑰或助記詞。</p>
    {!wallet.address ? <p>尚未連接錢包，請先至 <a href="#wallet">Wallet 連接 MetaMask</a>。仍可閱讀下方教材。</p> : <><p className="wallet-address">目前帳號：{wallet.address}</p><p>目前網路：{wallet.isSepolia ? 'Ethereum Sepolia' : '非 Sepolia，已停用轉帳並清除餘額'}（Chain ID {wallet.chainId ?? '未知'}）</p></>}
    <div className="token-balances" aria-live="polite">
      <article className="token-asset"><h3>Sepolia ETH / Gas</h3><p>{ready && eth.data ? `${displayEther(eth.data.wei)} Sepolia ETH` : ready && eth.status === 'loading' ? 'Gas 餘額查詢中…' : '尚無可顯示的 Gas 餘額'}</p>{ready && eth.data && <details><summary>精確 Gas 餘額與更新時間</summary><p>{formatEther(eth.data.wei)} Sepolia ETH；最後更新：{new Date(eth.data.updatedAt).toLocaleString('zh-TW')}</p></details>}{ready && eth.error && <p role="alert">{eth.error}</p>}</article>
      {tokens.map(token => {
        const item = ready ? balances.data?.balances.find(item => item.token.id === token.id) : undefined
        return <article className="token-asset" key={token.id}><h3>{token.symbol}</h3><p>{token.name}</p><p className="token-amount" data-testid={`balance-${token.symbol}`}>{item?.balance !== undefined ? `${displayEther(item.balance)} ${token.symbol}` : ready && balances.loading ? '查詢中…' : '尚無可顯示的餘額'}</p>{item?.error && <p role="alert">{item.error}</p>}<a href={token.explorerUrl} target="_blank" rel="noopener noreferrer">{token.symbol} Sepolia Etherscan ↗</a><details><summary>精確餘額與代幣合約</summary><p>完整餘額：{item?.balance === undefined ? '尚未確認' : formatUnits(item.balance, token.decimals)} {token.symbol}</p><p className="wallet-address">{token.address}</p></details>{item?.balance !== undefined && balances.data && <p>最後查詢：<time dateTime={new Date(balances.data.updatedAt).toISOString()}>{new Date(balances.data.updatedAt).toLocaleString('zh-TW')}</time></p>}</article>
      })}
    </div>

    <button className="wallet-button secondary" disabled={!ready || balances.loading || now < balances.retryAt || busy} onClick={() => { void balances.refresh(); void eth.refresh() }}>重新查詢代幣餘額</button>
    <p className="wallet-note">主要餘額截取至六位小數，精確數量可展開。無背景餘額輪詢，手動查詢間隔至少 30 秒；RPC 失敗時請稍候，或閱讀教材、觀看教師示範。餘額查詢失敗時暫停對應轉帳；送出前重新查餘額並檢查帳號、網路、Gas 與模擬結果。</p>
    <form className="token-form" onSubmit={event => { event.preventDefault(); if (ready && !busy && !unknown) { try { void store.prepare(wallet.captureTransactionSession(), { tokenId, recipient, amount }) } catch (error) { store.rejectPreparation(error) } } }}>
      <h3>1. 填寫轉帳</h3>
      <label htmlFor="token-choice">教學代幣</label><select id="token-choice" value={tokenId} disabled={busy || unknown} onChange={event => { setTokenId(event.target.value); store.invalidateSummary() }}>{tokens.map(token => <option key={token.id} value={token.id}>{token.symbol}</option>)}</select>
      <label htmlFor="token-recipient">接收者 Ethereum 地址</label><input id="token-recipient" autoComplete="off" spellCheck={false} value={recipient} disabled={busy || unknown} onChange={event => { setRecipient(event.target.value); store.invalidateSummary() }} />
      <label htmlFor="token-amount">轉帳數量</label><input id="token-amount" inputMode="decimal" autoComplete="off" value={amount} disabled={busy || unknown} onChange={event => { setAmount(event.target.value); store.invalidateSummary() }} />
      <p>可用代幣餘額：{ready && selected?.balance !== undefined ? `${formatUnits(selected.balance, 18)} ${selected.token.symbol}` : '尚未確認'}</p>
      {wallet.address?.toLowerCase() === recipient.toLowerCase() && <p className="wallet-warning">收款地址是自己，仍會消耗 Gas。</p>}
      <button className="wallet-button" disabled={!ready || busy || unknown || selected?.balance === undefined || !eth.data} type="submit">檢查轉帳摘要</button>
    </form>
    {summary && <div className="gas-guide token-summary"><h3>2. 核對完整摘要</h3><dl>
      <dt>網路 / Chain ID</dt><dd>Ethereum Sepolia / 11155111</dd><dt>原始帳號</dt><dd>{summary.session.address}</dd><dt>代幣 / 合約</dt><dd>{summary.token.symbol} / {summary.token.address}</dd><dt>收款地址</dt><dd>{summary.recipient}</dd><dt>轉帳數量</dt><dd>{formatUnits(summary.amount, 18)} {summary.token.symbol}</dd><dt>實際代幣餘額</dt><dd>{formatUnits(summary.balance, 18)}</dd><dt>Sepolia ETH 餘額</dt><dd>{formatEther(summary.ethBalance)} ETH</dd><dt>Gas 上限 / Gas price</dt><dd>{summary.gas.toString()} / {summary.gasPrice.toString()} wei</dd><dt>預估費用上限</dt><dd>{formatEther(summary.gas * summary.gasPrice)} Sepolia ETH</dd>
    </dl><p>估算含 20% Gas 與 Gas price 緩衝，實際費用與確認時間仍會變動；摘要 2 分鐘後過期。下一步由你親自在 MetaMask 核准。</p><button className="wallet-button" disabled={busy || !ready} onClick={() => void store.confirm(summary)}>確認並開啟 MetaMask</button></div>}
    {transfer.summary && !summary && <p className="wallet-warning">帳號或網路已切換，原確認摘要失效，請重新檢查。</p>}
    <div className="token-transaction" aria-live="polite"><h3>3. 交易結果</h3><p>狀態：<strong>{transactionLabels[transfer.status]}</strong></p>{transfer.message && <p role={transfer.status === 'failed' || unknown ? 'alert' : 'status'}>{transfer.message}</p>}
      {tx && <><p>原始網路：Ethereum Sepolia / {tx.chainId}</p><p className="wallet-address">原始帳號：{tx.account}</p><p>{formatUnits(tx.amount, 18)} {tx.token.symbol} → <span className="wallet-address">{tx.recipient}</span></p><p className="wallet-address">原始 Hash：<a href={`https://sepolia.etherscan.io/tx/${tx.originalHash}`} target="_blank" rel="noopener noreferrer">{tx.originalHash}</a></p>{tx.hash !== tx.originalHash && <p className="wallet-address">替換 Hash（{tx.replacement}）：<a href={`https://sepolia.etherscan.io/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer">{tx.hash}</a></p>}<button className="wallet-button secondary" disabled={busy} onClick={() => void store.track()}>重新查詢原交易狀態</button></>}
    </div>
    {!!transfer.previousTransactions?.length && <details><summary>本頁較早的交易 Hash</summary>{transfer.previousTransactions.map(record => <p className="wallet-address" key={record.originalHash}>Sepolia / {record.account}：<a href={`https://sepolia.etherscan.io/tx/${record.hash}`} target="_blank" rel="noopener noreferrer">{record.hash}</a></p>)}</details>}
    <aside className="gas-guide"><h3>轉帳教材</h3><p>選擇代幣 → 填寫收款地址及數量 → 核對餘額與 Gas → 查看摘要 → 親自核准 MetaMask → 查看 Receipt。Hash 只表示已送出，不代表成功。至少 1 個區塊確認仍可能遇到重組，不等於最終確定性。</p><p>遇到 RPC 逾時或未知結果，先查原 Hash 或 MetaMask 活動，勿重送。帳號／網路切換時，已廣播交易仍以原帳號和 Sepolia 追蹤；若錢包確認視窗仍開啟，請拒絕並重新檢查。重新整理會清除本頁記錄，請自行保存 Hash。</p></aside>
    <LearningOutro moduleId="token" />
  </section>
}
