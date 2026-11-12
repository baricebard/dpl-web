import { transactionLabels } from '../../../config/transactionLabels'
import { LearningIntro, LearningOutro } from '../../../shared/components/LearningJourney'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { formatEther, formatUnits } from 'viem'
import { exchange, exchangeInputCaps, exchangeRates, exchangeSummaryTtl } from '../../../config/exchange'
import { tokens } from '../../../config/tokens'
import { useWallet } from '../../wallet'
import { maxExchangeInput, validateExchange } from '../services/exchangeService'
import { createExchangeStore } from '../services/exchangeStore'
import type { ExchangeKind } from '../types'

export function ExchangePanel() {
  const wallet = useWallet()
  const { address, chainId, captureTransactionSession } = wallet
  const [store] = useState(() => createExchangeStore())
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [tokenIn, setTokenIn] = useState(tokens[0].id)
  const [tokenOut, setTokenOut] = useState(tokens[1].id)
  const [amount, setAmount] = useState('')
  const [expired, setExpired] = useState(false)
  const [cooldown, setCooldown] = useState(false)
  useEffect(() => {
    store.invalidate(true)
    if (address && chainId === exchange.chainId) {
      try { void store.refresh(captureTransactionSession()) } catch (error) { store.reject(error) }
    }
  }, [address, chainId, captureTransactionSession, store])
  useEffect(() => {
    if (!state.quote) return
    const timer = setTimeout(() => setExpired(true), Math.max(0, state.quote.createdAt + exchangeSummaryTtl - Date.now()))
    return () => clearTimeout(timer)
  }, [state.quote])
  useEffect(() => {
    if (!cooldown) return
    const timer = setTimeout(() => setCooldown(false), 30_000)
    return () => clearTimeout(timer)
  }, [cooldown])
  const ready = wallet.canTransact
  const data = ready && state.data?.session.isCurrent() ? state.data : undefined
  const quote = ready && !expired && state.quote?.session.isCurrent() ? state.quote : undefined
  const summary = ready && !expired && state.summary?.session.isCurrent() ? state.summary : undefined
  const inIndex = tokens.findIndex(token => token.id === tokenIn)
  const outIndex = tokens.findIndex(token => token.id === tokenOut)
  const input = { tokenIn, tokenOut, amount }
  let validation: string | undefined
  try { validateExchange(input) } catch (error) { if (amount) validation = error instanceof Error ? error.message : '數量不合法。' }
  const locked = state.busy || ['approve', 'swap'].some(kind => state[kind as ExchangeKind].status === 'unknown')
  const allowanceEnough = !!quote && !!data && data.allowances[inIndex] >= quote.amountIn
  const change = () => { setExpired(false); store.invalidate() }
  const run = (action: 'quote' | ExchangeKind) => {
    setExpired(false)
    try {
      const session = captureTransactionSession()
      if (action === 'quote') void store.quote(session, input)
      else void store.prepare(action, session, input)
    } catch (error) { store.reject(error) }
  }
  return <section id="exchange" className="wallet-panel exchange-panel" aria-labelledby="exchange-heading">
    <p className="eyebrow">EXCHANGE / FIXED RATE</p>
    <h2 id="exchange-heading">DPL Exchange</h2>
    <LearningIntro moduleId="exchange" />
    <p>以教學固定匯率交換 DPLT（USD）、DPLT-A（TWD）與 DPLT-B（CNY）。僅限 Ethereum Sepolia / 11155111，不是真實外匯行情。</p>
    {!address ? <p>請先至 <a href="#wallet">Wallet 連接 MetaMask</a>。</p> : <><p className="wallet-address">目前帳號：{address}</p><p>{ready ? 'Ethereum Sepolia / 11155111' : '目前非 Sepolia，已停用交換並清除舊餘額。'}</p></>}
    <div className="exchange-grid token-form">
      <div className="exchange-side">
        <h3>支付 / You Pay</h3>
        <label htmlFor="exchange-in">支付代幣</label>
        <select id="exchange-in" value={tokenIn} disabled={locked} onChange={event => { const next = event.target.value; setTokenIn(next); if (next === tokenOut) setTokenOut(tokenIn); change() }}>{tokens.map(token => <option key={token.id} value={token.id}>{token.symbol}</option>)}</select>
        <label htmlFor="exchange-amount">支付數量</label>
        <input id="exchange-amount" inputMode="decimal" autoComplete="off" value={amount} disabled={locked} onChange={event => { setAmount(event.target.value); change() }} />
        <p data-testid="exchange-pay-balance">錢包餘額：{data ? `${formatUnits(data.balances[inIndex], 18)} ${tokens[inIndex].symbol}` : '尚未確認'}</p>
        <button className="wallet-button secondary" disabled={!data || locked} onClick={() => { if (data) { setAmount(maxExchangeInput(tokenIn, data.balances[inIndex])); change() } }}>Max</button>
        <p className="wallet-note">單筆上限 {formatUnits(exchangeInputCaps[inIndex], 18)} {tokens[inIndex].symbol}（10 DPLT 等值）。</p>
      </div>
      <div className="exchange-side">
        <h3>取得 / You Receive</h3>
        <label htmlFor="exchange-out">取得代幣</label>
        <select id="exchange-out" value={tokenOut} disabled={locked} onChange={event => { setTokenOut(event.target.value); change() }}>{tokens.map(token => <option key={token.id} value={token.id} disabled={token.id === tokenIn}>{token.symbol}</option>)}</select>
        <p className="exchange-output" data-testid="exchange-quote">{quote ? `${formatUnits(quote.amountOut, 18)} ${quote.tokenOut.symbol}` : '等待合約報價'}</p>
        <p data-testid="exchange-reserve">Exchange 庫存：{data ? `${formatUnits(data.reserves[outIndex], 18)} ${tokens[outIndex].symbol}` : '尚未確認'}</p>
        <button className="wallet-button secondary" disabled={locked} onClick={() => { setTokenIn(tokenOut); setTokenOut(tokenIn); setAmount(''); change() }}>互換方向 ⇄</button>
      </div>
    </div>
    {validation && <p role="alert">{validation}</p>}
    <div className="exchange-actions">
      <button className="wallet-button" disabled={!ready || locked || !!validation || !amount} onClick={() => run('quote')}>查詢合約報價</button>
      <button className="wallet-button secondary" disabled={!ready || locked || state.loading || cooldown} onClick={() => { try { void store.refresh(captureTransactionSession(), true); setCooldown(true) } catch (error) { store.reject(error) } }}>重新查詢餘額與庫存</button>
    </div>
    <p className="wallet-note">無背景輪詢，手動更新間隔 30 秒。報價與摘要有效 2 分鐘；變更輸入、帳號或網路後須重新確認。</p>
    {state.loading && <p role="status">正在查詢餘額、庫存與 allowance…</p>}
    {state.error && <p className="wallet-warning" role="alert">{state.error}</p>}
    {expired && <p className="wallet-warning" role="alert">報價已過期，請重新查詢與確認。</p>}
    {data && <>
      <div className="exchange-balances">{tokens.map((token, index) => <p key={token.id} data-testid={`exchange-balance-${token.symbol}`}>{token.symbol} 餘額：{formatUnits(data.balances[index], 18)}；庫存：{formatUnits(data.reserves[index], 18)}</p>)}</div>
      <p className="wallet-note">最後查詢：<time dateTime={new Date(data.updatedAt).toISOString()}>{new Date(data.updatedAt).toLocaleString('zh-TW')}</time></p>
      <p>Sepolia ETH：{formatEther(data.ethBalance)} ETH；Exchange：{data.paused ? '已暫停' : '未暫停'}。</p>
      <details><summary>查看精確授權額度（allowance）</summary><p>目前 allowance：{formatUnits(data.allowances[inIndex], 18)} {tokens[inIndex].symbol}。{allowanceEnough ? '授權已足夠，可跳過 approve。' : '不足時需先完成 approve。'}</p></details>
    </>}
    <dl className="exchange-info">
      <dt>教學固定匯率</dt><dd>1 {tokens[inIndex].symbol} = {exchangeRates[inIndex][outIndex]} {tokens[outIndex].symbol}</dd>
      <dt>預期收到 / minAmountOut</dt><dd>{quote ? `${formatUnits(quote.amountOut, 18)} ${quote.tokenOut.symbol}` : '尚未確認'}（以合約 quote() 為準，最小單位向下取整）</dd>
      <dt>交換手續費</dt><dd>0%；approve 與 swap 仍各需 Sepolia ETH Gas。</dd>
      <dt>庫存是否足夠</dt><dd>{quote && data ? data.reserves[outIndex] >= quote.amountOut ? '庫存足夠' : '庫存不足' : '尚未確認'}</dd>
      <dt>預估 Gas</dt><dd>{summary ? `${summary.gas} gas × ${summary.gasPrice} wei；費用上限 ${formatEther(summary.gas * summary.gasPrice)} Sepolia ETH` : '檢查本筆授權或交換摘要後顯示'}</dd>
    </dl>
    <button className="wallet-button" disabled={!ready || locked || !quote || !data || allowanceEnough || data.paused} onClick={() => run('approve')}>1. 檢查授權摘要</button>
    <button className="wallet-button" disabled={!ready || locked || !quote || !data || !allowanceEnough || data.paused} onClick={() => run('swap')}>2. 檢查交換摘要</button>
    {summary && <div className="gas-guide token-summary exchange-summary">
      <h3>{summary.kind === 'approve' ? '確認 ERC-20 approve 授權' : '確認 Swap 交換'}</h3>
      <dl><dt>原始帳號 / 網路</dt><dd>{summary.session.address} / Sepolia 11155111</dd>
        <dt>Exchange / 授權對象 spender</dt><dd>{exchange.address}</dd>
        <dt>支付代幣合約</dt><dd>{summary.tokenIn.address}</dd>
        <dt>{summary.kind === 'approve' ? '本次授權數量（覆寫既有額度）' : '支付數量'}</dt><dd>{formatUnits(summary.amountIn, 18)} {summary.tokenIn.symbol}</dd>
        <dt>既有 allowance</dt><dd>{formatUnits(summary.snapshot.allowances[tokens.indexOf(summary.tokenIn)], 18)} {summary.tokenIn.symbol}</dd>
        <dt>預期收到 / minAmountOut</dt><dd>{formatUnits(summary.amountOut, 18)} {summary.tokenOut.symbol}</dd>
        <dt>取得代幣合約</dt><dd>{summary.tokenOut.address}</dd>
        <dt>支付代幣餘額 / 取得代幣庫存</dt><dd>{formatUnits(summary.snapshot.balances[tokens.indexOf(summary.tokenIn)], 18)} {summary.tokenIn.symbol} / {formatUnits(summary.snapshot.reserves[tokens.indexOf(summary.tokenOut)], 18)} {summary.tokenOut.symbol}</dd>
        <dt>交換狀態 / 手續費</dt><dd>未暫停 / 0%</dd>
        <dt>Gas / Gas price（各含 20% 緩衝）</dt><dd>{summary.gas.toString()} / {summary.gasPrice.toString()} wei</dd>
        <dt>預估本筆費用上限</dt><dd>{formatEther(summary.gas * summary.gasPrice)} Sepolia ETH</dd>
      </dl>
      <p>{summary.kind === 'approve' ? '只授權本次需要的數量，不是無限授權。授權成功不等於交換成功；之後需另行確認 swap。' : '已重新讀取 quote、餘額、allowance、庫存、paused 並模擬 swap；實際交換由同一筆合約交易原子完成。'}</p>
      <button className="wallet-button" disabled={locked || !ready} onClick={() => void store.confirm(summary)}>{summary.kind === 'approve' ? '確認授權並開啟 MetaMask' : '確認交換並開啟 MetaMask'}</button>
    </div>}
    {(['approve', 'swap'] as const).map(kind => {
      const step = state[kind], tx = step.transaction
      return <div key={kind} className="token-transaction" data-testid={`exchange-${kind}-status`} aria-live="polite">
        <h3>{kind === 'approve' ? 'Approve 授權狀態' : step.status === 'success' ? '交換成功 / Swap Success' : 'Swap 交換狀態'}</h3>
        <p>狀態：<strong>{step.status === 'success' ? kind === 'approve' ? '授權已確認（此筆僅授權）' : '交換已確認成功' : transactionLabels[step.status]}</strong></p><p role={step.status === 'failed' || step.status === 'unknown' ? 'alert' : 'status'}>{step.message}</p>
        {tx && <><p>支付／授權：{formatUnits(tx.amountIn, 18)} {tx.tokenIn.symbol}</p>{kind === 'swap' && <p>取得：{tx.received === undefined ? '尚未確認' : `${formatUnits(tx.received, 18)} ${tx.tokenOut.symbol}`}</p>}
          <p className="wallet-address">原始帳號：{tx.account}</p><p>原始網路：Sepolia / {tx.chainId}</p>
          <p className="wallet-address">Exchange：{exchange.address}</p><p>實際 Receipt 狀態：{tx.receiptStatus ?? '尚未確認'}</p>
          <p className="wallet-address">原始 Hash：<a href={`https://sepolia.etherscan.io/tx/${tx.originalHash}`} target="_blank" rel="noopener noreferrer">{tx.originalHash}</a></p>
          {tx.hash !== tx.originalHash && <p className="wallet-address">替換 Hash：<a href={`https://sepolia.etherscan.io/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer">{tx.hash}</a></p>}
          <button className="wallet-button secondary" disabled={state.busy} onClick={() => void store.track(kind)}>查詢 {kind} 原交易</button></>}
        {kind === 'approve' && step.status === 'success' && <p className="wallet-warning">授權可能仍存在，即使尚未 swap 或 swap 失敗。可按「重新查詢餘額與庫存」查看目前 allowance；要撤銷時，可在 Sepolia Etherscan 的支付代幣合約 Write Contract 連接原帳號，核對 spender 為 {exchange.address}，手動呼叫 approve(spender, 0)。撤銷也是一筆需 Gas 的交易。</p>}
      </div>
    })}
    {!!state.history.length && <details><summary>本頁較早的交易</summary>{state.history.map((tx, index) => <p className="wallet-address" key={`${tx.originalHash}-${index}`}>{tx.kind} / Sepolia / {tx.account}：<a href={`https://sepolia.etherscan.io/tx/${tx.originalHash}`} target="_blank" rel="noopener noreferrer">{tx.originalHash}</a></p>)}</details>}
    <aside className="gas-guide"><h3>交換小教室</h3>
      <p>Swap 是用一種代幣交換另一種。這裡的固定匯率由合約設定，依教師庫存交換；AMM 則通常依池內資產比例與定價曲線產生價格。</p>
      <p>ERC-20 approve 允許指定 Exchange 在額度內使用支付代幣；swap 才扣除輸入並交付輸出。兩者是獨立交易，授權成功不等於交換成功，兩筆都需要 Sepolia ETH Gas。已有足夠授權時可略過 approve。</p>
      <p>Hash 不代表成功。Receipt success 且至少 1 個區塊確認仍可能重組。逾時或未知時保存原 Hash、查 MetaMask 活動並手動查詢，勿重送。切換帳號／網路後請拒絕尚開啟的錢包請求。重新整理會清除本頁交易紀錄，請先保存 Hash。</p>
    </aside>
    <LearningOutro moduleId="exchange" />
  </section>
}
