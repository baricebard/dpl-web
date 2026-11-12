import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { formatEther, formatUnits } from 'viem'
import { amm, ammTokens } from '../../../config/amm'
import { useWallet } from '../../wallet'
import { createAmmStore } from '../services/ammStore'
import { parseAmount, percentLP, ratio, share, slippageBps, swapMetrics } from '../services/ammMath'
import { AmmResult } from './AmmResult'
import type { AmmInput, AmmKind, AmmOperation } from '../types'

const operationNames = { swap: '交換', add: '提供流動性', remove: '移除流動性' }
const labels = { swap: '交換代幣（AMM Swap）', add: '提供流動性（Add Liquidity）', remove: '移除流動性（Remove Liquidity）', approveDPLT: '授權 DPLT', approveA: '授權 DPLT-A' }
const units = (amount: bigint) => formatUnits(amount, 18)
export function LiquidityPanel() {
  const wallet = useWallet()
  const { address, chainId, captureTransactionSession } = wallet
  const summaryRef = useRef<HTMLDivElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const [store] = useState(() => createAmmStore())
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [operation, setOperation] = useState<AmmOperation>('swap')
  const [pendingKind, setPendingKind] = useState<AmmKind>('swap')
  const [tokenIndex, setTokenIndex] = useState<0 | 1>(0)
  const [amount, setAmount] = useState('')
  const [slippage, setSlippage] = useState('0.5')
  const [expired, setExpired] = useState(false)
  const [cooldown, setCooldown] = useState(false)
  const [recoveryHash, setRecoveryHash] = useState('')
  useEffect(() => {
    store.invalidate(true)
    if (address && chainId === amm.chainId) {
      try { void store.refresh(captureTransactionSession()) } catch (error) { store.reject(error) }
    }
  }, [address, chainId, captureTransactionSession, store])
  useEffect(() => {
    if (!state.preview) return
    const timer = setTimeout(() => setExpired(true), Math.max(0, state.preview.createdAt + amm.summaryTtl - Date.now()))
    return () => clearTimeout(timer)
  }, [state.preview])
  useEffect(() => {
    if (!cooldown) return
    const timer = setTimeout(() => setCooldown(false), 30_000)
    return () => clearTimeout(timer)
  }, [cooldown])
  useEffect(() => {
    if (state.busy) return
    const target = state.summary ? summaryRef.current : ['success', 'failed', 'unknown'].includes(state.status) ? resultRef.current : null
    target?.focus()
  }, [state.summary, state.status, state.busy])
  const ready = wallet.canTransact
  const snapshot = ready && state.snapshot?.session.isCurrent() ? state.snapshot : undefined
  const preview = ready && !expired && state.preview?.session.isCurrent() ? state.preview : undefined
  const summary = ready && !expired && state.summary?.session.isCurrent() ? state.summary : undefined
  const locked = state.busy || ['unknown', 'submitted', 'confirming', 'awaiting-wallet'].includes(state.status)
  const change = () => { setExpired(false); store.invalidate() }
  const input: AmmInput = { operation, tokenIndex, amount, slippage }
  let validation: string | undefined
  try { if (amount) parseAmount(amount); slippageBps(slippage) } catch (error) { validation = error instanceof Error ? error.message : '輸入不合法。' }
  const run = (kind?: AmmKind) => {
    setExpired(false)
    setPendingKind(kind ?? operation)
    try {
      const session = captureTransactionSession()
      if (kind) void store.prepare(kind, session, input)
      else void store.preview(session, input)
    } catch (error) { store.reject(error) }
  }
  const required = preview ? operation === 'swap' ? (tokenIndex === 0 ? [preview.amount, 0n] : [0n, preview.amount]) : operation === 'add' ? preview.desired : [0n, 0n] : [0n, 0n]
  const enough = !!snapshot && required.every((value, i) => snapshot.allowances[i] >= value)
  const metrics = preview && operation === 'swap' ? swapMetrics(preview.amount, preview.amountOut, preview.snapshot.reserves[tokenIndex], preview.snapshot.reserves[1 - tokenIndex]) : undefined
  const tx = state.transaction
  const approval = tx?.kind.startsWith('approve')
  const activeKind = state.status === 'validating' || state.status === 'failed' ? pendingKind : tx?.kind ?? operation
  const action = activeKind === 'approveDPLT' || activeKind === 'approveA' ? labels[activeKind] : operationNames[activeKind]
  const statusText = {
    idle: '請依步驟完成操作', validating: `正在檢查${action}條件`,
    'awaiting-wallet': `等待 MetaMask 確認：${action}`, submitted: `${action}交易已送出`,
    confirming: `正在確認${action}交易結果`, failed: `${action}失敗`, unknown: `${action}交易結果待確認`,
    success: approval ? `授權完成，但尚未${operationNames[operation]}` : `${operationNames[operation]}成功`,
  }[state.status]
  const steps = operation === 'swap' ? ['設定交換', '授權代幣', '確認交換', '交換結果']
    : operation === 'add' ? ['輸入提供數量', '查看兩種數量與 LP 估算', '授權兩種代幣', '確認提供流動性', '等待鏈上注資', '提供流動性結果']
      : ['查看 LP 持有量與份額', '選擇移除比例或數量', '查看預計取回量', '確認移除流動性', '等待鏈上移除', '移除流動性結果']
  const currentStep = state.status === 'success' && !approval ? steps.length - 1
    : locked && !approval ? steps.length - 2 : summary && !summary.kind.startsWith('approve') ? (operation === 'swap' ? 2 : 3)
      : preview ? (operation === 'swap' ? enough ? 2 : 1 : operation === 'add' ? enough ? 3 : 2 : 3) : 0
  const approvalAmount = (kind: AmmKind) => {
    if (!summary) return ''
    return units(summary.input.operation === 'add' ? summary.desired[kind === 'approveDPLT' ? 0 : 1] : summary.amount)
  }
  return <section id="liquidity" className="wallet-panel exchange-panel amm-panel" aria-labelledby="amm-heading">
    <p className="eyebrow">LIQUIDITY / CONSTANT PRODUCT AMM</p>
    <h2 id="amm-heading">DPL AMM 流動性實驗室</h2>
    <p>觀察 DPLT／DPLT-A 池的即時比例、交換與 LP 權益。僅限 Ethereum Sepolia / 11155111，教學代幣不具真實金融價值。</p>
    <p className="wallet-address">Pool：{amm.address}</p>
    {!address ? <p>請先至 <a href="#wallet">Wallet 連接 MetaMask</a>。</p> : <p className="wallet-address">目前帳號：{address}；{ready ? 'Ethereum Sepolia' : '目前非 Sepolia，已停用交易。'}</p>}
    <div className="amm-tabs" role="group" aria-label="AMM 操作">{(['swap', 'add', 'remove'] as const).map(op => <button key={op} className={`wallet-button ${operation !== op ? 'secondary' : ''}`} disabled={locked} aria-pressed={operation === op} onClick={() => { setOperation(op); setPendingKind(op); setAmount(''); change() }}>{labels[op]}</button>)}</div>
    <div className="amm-workflow">
    <h3>{labels[operation]}</h3>
    <p>{operation === 'swap' ? '用一種代幣換取另一種代幣。授權只允許 Pool 使用代幣，確認交換才會交換。' : operation === 'add' ? '依池中比例同時投入兩種代幣，取得代表池中份額的 DPL-LP。兩筆授權完成後仍須確認提供流動性。' : '銷毀自己持有的 DPL-LP，按份額取回兩種代幣，不需要 LP 授權。'}</p>
    <ol className="amm-steps" aria-label={`${operationNames[operation]}步驟`}>{steps.map((step, i) => <li key={step} aria-current={i === currentStep ? 'step' : undefined}>{i + 1}. {step}</li>)}</ol>
    {operation === 'remove' && <p>目前持有 LP：{snapshot ? `${units(snapshot.lp)} DPL-LP；池中份額 ${share(snapshot.lp, snapshot.supply)}%` : '尚未確認'}</p>}
    <h4>1. {steps[0]}</h4>
    <div className="token-form">
      {operation !== 'remove' && <><label htmlFor="amm-token">{operation === 'swap' ? '支付代幣' : '希望提供的代幣'}</label><select id="amm-token" value={tokenIndex} disabled={locked} onChange={event => { setTokenIndex(event.target.value === '0' ? 0 : 1); setAmount(''); change() }}>{ammTokens.map((token, i) => <option key={token.id} value={i}>{token.symbol}</option>)}</select></>}
      <label htmlFor="amm-amount">{operation === 'swap' ? '支付數量 / You Pay' : operation === 'add' ? '希望提供數量' : '移除 LP 數量'}</label>
      <input id="amm-amount" inputMode="decimal" autoComplete="off" value={amount} disabled={locked} onChange={event => { setAmount(event.target.value); change() }} />
      <p data-testid="amm-input-balance">錢包餘額：{snapshot ? `${units(operation === 'remove' ? snapshot.lp : snapshot.balances[tokenIndex])} ${operation === 'remove' ? 'DPL-LP' : ammTokens[tokenIndex].symbol}` : '尚未確認'}</p>
      {operation === 'remove' ? <div>{([25, 50, 75, 100] as const).map(percent => <button key={percent} className="wallet-button secondary" disabled={!snapshot || locked} onClick={() => { if (snapshot) { setAmount(percentLP(snapshot.lp, percent)); change() } }}>{percent}%</button>)}</div> : <button className="wallet-button secondary" disabled={!snapshot || locked} onClick={() => { if (snapshot) { setAmount(units(snapshot.balances[tokenIndex])); change() } }}>Max</button>}
      <label htmlFor="amm-slippage">滑價容忍度 / Slippage Tolerance（%）</label>
      <div>{['0.1', '0.5', '1.0'].map(value => <button key={value} className="wallet-button secondary" disabled={locked} onClick={() => { setSlippage(value); change() }}>{value}%</button>)}</div>
      <input id="amm-slippage" inputMode="decimal" value={slippage} disabled={locked} onChange={event => { setSlippage(event.target.value); change() }} aria-describedby="amm-slippage-note" />
      <p id="amm-slippage-note">可自訂 0% 至 5%。Slippage 是允許實際執行相對報價的最大不利偏差；Price Impact 是交易沿 AMM 曲線造成的價格影響，兩者不同。</p>
    </div>
    {validation && <p role="alert">{validation}</p>}
    <button className="wallet-button" disabled={!ready || locked || !amount || !!validation} onClick={() => run()}>{operation === 'swap' ? '查詢交換報價' : operation === 'add' ? '計算提供流動性' : '計算移除流動性'}</button>
    {operation === 'swap' && <button className="wallet-button secondary" disabled={locked} onClick={() => { setTokenIndex(tokenIndex === 0 ? 1 : 0); setAmount(''); change() }}>交換方向 ⇄</button>}
    <button className="wallet-button secondary" disabled={!ready || locked || state.loading || cooldown} onClick={() => { change(); try { void store.refresh(captureTransactionSession(), true); setCooldown(true) } catch (error) { store.reject(error) } }}>重新查詢池與餘額</button>
    <p className="wallet-note">手動更新間隔 30 秒，無背景輪詢。報價與摘要有效 2 分鐘；deadline 約 10 分鐘。Gas 在檢查各筆摘要後顯示。</p>
    {state.loading && <p role="status">正在查詢池與餘額…</p>}
    {state.error && <p className="wallet-warning" role="alert">{state.error}</p>}
    {expired && <p className="wallet-warning" role="alert">報價／摘要已過期，請重新查詢。</p>}
    {preview && <div className="gas-guide" data-testid="amm-preview">
      <h3>{operation === 'swap' ? 'You Receive / 合約正式報價' : '前端教學估算（非實際執行結果）'}</h3>
      {operation === 'swap' && metrics ? <>
        <p data-testid="amm-output">{units(preview.amountOut)} {ammTokens[1 - tokenIndex].symbol}</p>
        <p>輸出資產儲備：{units(preview.snapshot.reserves[1 - tokenIndex])} {ammTokens[1 - tokenIndex].symbol}</p>
        <dl><dt>交易前即時價格</dt><dd>{metrics.before}</dd><dt>預期平均成交價格（含費用）</dt><dd>{metrics.average}</dd><dt>交易後預估價格</dt><dd>{metrics.after}（上述價格單位：{ammTokens[1 - tokenIndex].symbol} / {ammTokens[tokenIndex].symbol}）</dd>
          <dt>AMM Fee 0.3%</dt><dd>{formatUnits(preview.feeNumerator, 21)} {ammTokens[tokenIndex].symbol}（精確理論費用；全部輸入留池）</dd>
          <dt>Price Impact（曲線，不含費用）</dt><dd>{metrics.impact}%；整數捨入另有極小影響</dd><dt>Slippage Tolerance</dt><dd>{slippage}%</dd>
          <dt>Minimum Received / 最低收到量</dt><dd>{units(preview.minAmountOut)} {ammTokens[1 - tokenIndex].symbol}</dd></dl>
        <details><summary>固定匯率 Exchange 比較</summary>
        {preview.fixed?.amountOut !== undefined ? <><p>相同輸入合約 quote()：{units(preview.fixed.amountOut)} {ammTokens[1 - tokenIndex].symbol}</p><p>AMM − Fixed：{units(preview.amountOut - preview.fixed.amountOut)} {ammTokens[1 - tokenIndex].symbol}</p></> : <p>固定匯率比較無法使用：{preview.fixed?.error ?? '請重新查詢合約報價以取得比較。'}</p>}
        <p>AMM Fee 與 Price Impact 如上。兩種機制獨立；比較不會切換交易路徑。<a href="#exchange">前往固定匯率 Exchange</a></p></details>
      </> : <>
        {operation === 'add' && <p>預計實際使用（desired 上限）：{units(preview.amounts[0])}（{units(preview.desired[0])}）DPLT / {units(preview.amounts[1])}（{units(preview.desired[1])}）DPLT-A</p>}
        {operation === 'remove' && <p>預期取回：{units(preview.amounts[0])} DPLT / {units(preview.amounts[1])} DPLT-A</p>}
        <p>最低接受兩種數量：{units(preview.minima[0])} DPLT / {units(preview.minima[1])} DPLT-A</p>
        {operation === 'add' && <><p>預計取得 LP：{units(preview.liquidity)}；最低取得 LP：{units(preview.minLiquidity)}</p><p>本次新增 LP 份額：{share(preview.liquidity, preview.snapshot.supply + preview.liquidity)}%；預計帳號總份額：{share(preview.snapshot.lp + preview.liquidity, preview.snapshot.supply + preview.liquidity)}%</p></>}
        {operation === 'remove' && <p>只銷毀自己的 LP，不需 approve LP；永久鎖定的 1000 LP 最小單位無法移除。</p>}
      </>}
    </div>}
    {preview && <div className="amm-authorization" data-testid="amm-authorization">
      <h4>{operation === 'swap' ? '2. 授權代幣' : operation === 'add' ? '3. 授權兩種代幣' : 'LP 授權'}</h4>
      <p>授權不會完成{operationNames[operation]}。每筆授權都需先查看摘要、再親自確認 MetaMask。</p>
      {operation === 'remove' ? <p>移除自己的 LP 不需授權，可直接查看移除摘要。</p> : (['approveDPLT', 'approveA'] as const).map((kind, i) => required[i] > 0n && <div key={kind}>
        <p>{ammTokens[i].symbol}：目前已授權 {snapshot ? units(snapshot.allowances[i]) : '尚未確認'}；需要 {units(required[i])}</p>
        {snapshot && snapshot.allowances[i] >= required[i] ? <p className="amm-authorized">已授權，可進行{operationNames[operation]}</p>
          : <button className="wallet-button secondary" disabled={!ready || locked || !snapshot} onClick={() => run(kind)}>授權 {units(required[i])} {ammTokens[i].symbol}</button>}
      </div>)}
    </div>}
    <div className="amm-confirmation">
    <h4>{operation === 'swap' ? '3' : '4'}. 確認{operationNames[operation]}</h4>
    {preview && enough && !summary && <p className="amm-next">下一步：{operation === 'remove' ? '查看移除摘要' : '授權已足夠，請查看摘要'}，核對後按「確認{operationNames[operation]}」。不會自動送出。</p>}
    <button className="wallet-button" disabled={!ready || locked || !preview || !snapshot || !enough} onClick={() => run(operation)}>{operation === 'swap' ? '查看交換摘要' : operation === 'add' ? '查看注資摘要' : '查看移除摘要'}</button>
    {summary && <div className="gas-guide token-summary" data-testid="amm-summary" ref={summaryRef} tabIndex={-1} role="region" aria-label="本筆交易摘要">
      <h3>{summary.kind.startsWith('approve') ? '代幣授權摘要' : `${operationNames[operation]}交易摘要`}</h3>
      <details><summary>核對帳號、網路與合約地址</summary><dl><dt>原始帳號 / 網路</dt><dd>{summary.session.address} / Sepolia 11155111</dd><dt>Pool / spender</dt><dd>{amm.address}</dd><dt>交易目標 / ETH Value</dt><dd>{summary.to} / 0 wei</dd></dl></details>
      <p>網路：Ethereum Sepolia（11155111）</p>
      <dl><dt>本次操作</dt><dd>{summary.kind.startsWith('approve') ? `${units(summary.input.operation === 'add' ? summary.desired[summary.kind === 'approveDPLT' ? 0 : 1] : summary.amount)} ${summary.kind === 'approveDPLT' ? 'DPLT' : 'DPLT-A'} 精確授權（覆寫額度）` : `${units(summary.amount)} ${summary.input.operation === 'remove' ? 'DPL-LP' : ammTokens[summary.input.tokenIndex].symbol}`}</dd>
        {!summary.kind.startsWith('approve') && (summary.input.operation === 'swap' ? <><dt>預期收到 / 最低收到</dt><dd>{units(summary.amountOut)} / {units(summary.minAmountOut)} {ammTokens[1 - summary.input.tokenIndex].symbol}</dd></> : <><dt>預期兩種數量 / 最低兩種數量</dt><dd>{summary.amounts.map(units).join(' / ')}；最低 {summary.minima.map(units).join(' / ')}（DPLT / DPLT-A）</dd><dt>LP 預估 / 最低 LP</dt><dd>{units(summary.liquidity)} / {units(summary.minLiquidity)}</dd></>)}
        {!summary.kind.startsWith('approve') && <><dt>滑價容忍度 / 交易期限</dt><dd>{summary.input.slippage}% / {new Date(Number(summary.deadline) * 1000).toLocaleString('zh-TW')}</dd></>}<dt>Estimated Gas（各含 20% 緩衝）</dt><dd>{summary.gas.toString()} gas × {summary.gasPrice.toString()} wei；上限 {formatEther(summary.gas * summary.gasPrice)} Sepolia ETH</dd></dl>
      <p>{summary.kind.startsWith('approve') ? '本筆只授權 Pool 使用指定數量，不會交換代幣或取得 LP。授權後仍須另行確認真正的交易。' : '請核對數量、最低量與 Gas，再按下方確認按鈕並親自核准 MetaMask。實際結果由 Receipt 事件確認。'}</p>
      <button className="wallet-button" disabled={locked || !ready} onClick={() => void store.confirm(summary)}>{summary.kind.startsWith('approve') ? `確認授權 ${approvalAmount(summary.kind)} ${summary.kind === 'approveDPLT' ? 'DPLT' : 'DPLT-A'}` : `確認${operationNames[operation]}`}</button>
    </div>}
    </div>
    <div className="token-transaction" data-testid="amm-status" ref={resultRef} tabIndex={-1} role="region" aria-label={`${operationNames[operation]}進度與結果`} aria-live="polite"><h3>{operationNames[operation]}進度與結果</h3><p>狀態：<strong>{statusText}</strong></p><p role={state.status === 'failed' || state.status === 'unknown' ? 'alert' : 'status'}>{state.message}</p>
      {tx && <><p>{labels[tx.kind]}；原始帳號：{tx.account}；原始 Chain ID：{tx.chainId}</p><p>鏈上收據：{tx.receiptStatus === 'success' ? '已確認' : tx.receiptStatus === 'reverted' ? '執行失敗' : '尚未確認'}</p>
        {tx.originalHash && <><p className="wallet-address">原始 Hash：<a href={`https://sepolia.etherscan.io/tx/${tx.originalHash}`} target="_blank" rel="noopener noreferrer">{tx.originalHash}</a></p><button className="wallet-button secondary" disabled={state.busy} onClick={() => void store.track()}>查詢原交易</button></>}
        {state.status === 'success' && !approval && <AmmResult tx={tx} />}
        {state.status === 'success' && approval && <p className="amm-next">{snapshot ? '已重新讀取授權額度，請依上方授權狀態繼續。' : '授權額度尚未確認，請重新查詢池與餘額，再查看報價。'}尚未{operationNames[operation]}，仍須另行確認真正的交易。</p>}
        {state.status === 'unknown' && !tx.originalHash && <div className="token-form"><label htmlFor="amm-recover">從 MetaMask 活動補回原交易 Hash</label><input id="amm-recover" value={recoveryHash} onChange={event => setRecoveryHash(event.target.value)} /><button className="wallet-button secondary" disabled={state.busy} onClick={() => void store.recover(recoveryHash)}>核對原交易 Hash</button></div>}
      </>}
    </div>
    </div>
    {snapshot && <div className="exchange-info" data-testid="amm-pool">
      {snapshot.supply === 0n && <p role="alert">尚未提供初始流動性；本頁不提供初始化。</p>}
      <p>Pool 儲備：{units(snapshot.reserves[0])} DPLT / {units(snapshot.reserves[1])} DPLT-A</p>
      <p>目前比例：1 DPLT = {ratio(snapshot.reserves[1], snapshot.reserves[0])} DPLT-A</p>
      {ammTokens.map((token, i) => <p key={token.id}>{token.symbol} 餘額：{units(snapshot.balances[i])}；allowance：{units(snapshot.allowances[i])}</p>)}
      <p data-testid="amm-lp">持有 LP：{units(snapshot.lp)} DPL-LP；總供給：{units(snapshot.supply)}；池中份額：{share(snapshot.lp, snapshot.supply)}%</p>
      <p>LP 對應資產：{snapshot.supply ? units(snapshot.lp * snapshot.reserves[0] / snapshot.supply) : '尚未確認'} DPLT / {snapshot.supply ? units(snapshot.lp * snapshot.reserves[1] / snapshot.supply) : '尚未確認'} DPLT-A</p>
      <p>Sepolia ETH：{formatEther(snapshot.ethBalance)}；查詢區塊：{snapshot.blockNumber.toString()}；<time dateTime={new Date(snapshot.updatedAt).toISOString()}>{new Date(snapshot.updatedAt).toLocaleString('zh-TW')}</time></p>
    </div>}
    {!!state.history.length && <details><summary>本頁較早交易</summary>{state.history.map((record, i) => <p className="wallet-address" key={i}>{labels[record.kind]} / {record.account} / {record.chainId} / {record.originalHash ?? '未取得 Hash'}</p>)}</details>}
    <aside className="gas-guide"><h3>LP 與 AMM 小教室</h3>
      <p>流動性提供者 LP 同時提供兩種資產，維持池內比例，讓其他人交換。DPL-LP Token 代表池中份額：持有 LP ÷ totalSupply；對應資產按此比例向下取整。</p>
      <p>輸入的 0.3% 手續費留在池內，反映在 LP 對資產的權益；這不保證獲利。交換會改變池內比例，因此移除時可能取得與注入時不同的兩種數量。</p>
      <p>無常損失（Impermanent Loss）是相較於單純持有原資產，因相對價格改變而產生的價值差異；尚未提領也承受此差異，費用不一定足以彌補。</p>
      <p>請使用 addLiquidity，不要直接 transfer 到 Pool；直接轉帳是不可撤回的捐贈，不會取得 LP。移除不需 LP approve，不能動用他人的 LP 或永久鎖定份額。</p>
      <p>approve、swap、addLiquidity 各需獨立確認與 Gas；若兩資產皆未授權，注資可能需要三筆交易。授權可能在操作失敗後仍存在，可至 Sepolia 代幣合約核對 spender 後手動 approve(spender, 0) 撤銷，亦需 Gas。</p>
      <p>交易未知時保存原 Hash，手動查詢，不自動重送或追蹤替換交易。帳號／網路切換使未送出摘要失效；請拒絕仍開啟的錢包請求。紀錄僅保存於本頁記憶體，重新整理前請先保存 Hash。</p>
    </aside>
  </section>
}
