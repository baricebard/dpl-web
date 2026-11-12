import { useState, useSyncExternalStore } from 'react'
import { formatEther, formatUnits } from 'viem'
import { assertLocal, DEPLOYER } from './config.ts'
import { AMM_ARGS, AMM_TOKENS, LP_LOCKED, LP_TEACHER, LP_TOTAL } from './amm-config.ts'
import { JOURNAL_KEY, type DeploymentArtifact, type DeploymentTool } from './engine.ts'
import type { AMMLiquidityTool } from './amm-liquidity.ts'

export function AMMPanel({ tool, liquidity, artifact }: { tool: DeploymentTool; liquidity: AMMLiquidityTool; artifact: DeploymentArtifact }) {
  const d = useSyncExternalStore(tool.subscribe, tool.getSnapshot)
  const l = useSyncExternalStore(liquidity.subscribe, liquidity.getSnapshot)
  const [error, setError] = useState(''), [ack, setAck] = useState(false), [hash, setHash] = useState('')
  const [hashes, setHashes] = useState<Record<number, string>>({})
  const busy = d.busy || l.busy, r = d.records.amm, p = d.prepared.amm, q = l.prepared, s = l.state
  async function run(action: () => Promise<void>) {
    setAck(false); setError('')
    try {
      assertLocal()
      if (!navigator.locks) throw new Error('請使用支援 Web Locks 的最新版 Chrome／Edge')
      await navigator.locks.request(JOURNAL_KEY, { ifAvailable: true }, async lock => {
        if (!lock) throw new Error('另一分頁正在操作；請勿重複送出')
        await action()
      })
    } catch (e) { setError(e instanceof Error ? e.message : '操作失敗，請保留紀錄並查詢原 Hash') }
  }
  function download() {
    const data = { deployment: JSON.parse(tool.exportRecord()), liquidity: JSON.parse(liquidity.exportRecord()) }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = 'dpl-amm-deployment-liquidity.json'; a.click(); URL.revokeObjectURL(url)
  }
  return <section id="amm" aria-label="DPL AMM 部署與首次注資">
    <h2>DPL AMM Pool — Deployment &amp; Initial Liquidity</h2>
    <p>DPLAMMPool 地址由實際部署 Receipt 取得。既有 ERC-20 與 Fixed Exchange 已部署，請勿操作舊部署按鈕。</p>
    <p>教師 MetaMask：{DEPLOYER}；Ethereum Sepolia Chain ID 11155111。</p>
    <ol>{['dplt', 'assetA', 'initialProvider'].map((name, i) => <li key={name}>{name}：{AMM_ARGS[i]}</li>)}</ol>
    <p>Contract Creation（無 to），ETH Value = 0 Wei。</p>
    <details><summary>AMM 編譯器與來源 Commit</summary><pre>{JSON.stringify(artifact.provenance, null, 2)}</pre></details>
    <button disabled={busy} onClick={() => void run(tool.connect)}>連接／核對 AMM 教師 MetaMask</button>
    <p>錢包：{d.connected ? '指定教師與 Sepolia 已確認' : '尚未確認／已失效'}</p>
    <p role="alert">{error}</p>
    <p>部署狀態：<span role="status">{r.status}</span>；{r.message}</p>
    {r.hash && <p>部署 Transaction Hash：{r.hash}</p>}
    {r.contractAddress && <p>Pool Contract Address：{r.contractAddress}；Receipt {r.receiptStatus}；Block {r.blockNumber}；部署時間 {r.deployedAt}</p>}
    <button disabled={busy || !d.connected || !!r.attempted} onClick={() => void run(() => tool.prepare('amm'))}>準備部署 DPLAMMPool</button>
    {p && <div>
      <p>部署摘要：DPLAMMPool；教師、三個 Constructor、11155111 如上；Contract Creation；Value 0。</p>
      <p>Gas 含 20% 餘裕 {p.gas.toString()}；Gas Price {p.gasPrice.toString()} Wei；費用上限 {formatEther(p.gas * p.gasPrice)} Sepolia ETH；5 分鐘有效。</p>
      <label><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />我已核對本筆部署完整摘要。</label>
      <button disabled={busy || !ack} onClick={() => { if (ack) void run(() => tool.confirm('amm')) }}>確認部署 DPLAMMPool（請求 MetaMask）</button>
    </div>}
    {r.attempted && <div>
      {!r.hash && <label>部署原 Hash<input value={hash} onChange={e => setHash(e.target.value)} /></label>}
      <button disabled={busy} onClick={() => void run(() => tool.reconcile('amm', hash))}>Reconcile AMM 部署原交易</button>
    </div>}
    <h3>首次授權與流動性</h3>
    <p>100 DPLT + 3000 DPLT-A；初始價格 1 DPLT = 30 DPLT-A（1:30）。approve 成功不代表已注資，禁止直接 transfer 至 Pool。</p>
    <p>預計發行 LP {formatUnits(LP_TOTAL, 18)}（{LP_TOTAL.toString()} 最小單位）；教師取得 {formatUnits(LP_TEACHER, 18)}（{LP_TEACHER.toString()}）；永久鎖定 {LP_LOCKED.toString()} 個 LP 最小單位。</p>
    <button disabled={busy || !r.hash} onClick={() => void run(liquidity.refresh)}>查詢 Pool／教師餘額及 allowance</button>
    {s && <div>
      <p>Pool：{s.pool}；查詢時間：{s.checkedAt}</p>
      <p>totalSupply {s.supply.toString()}；教師 LP {s.teacherLP.toString()}；鎖定 LP {s.lockedLP.toString()}（最小單位）</p>
      {AMM_TOKENS.map((t, i) => <p key={t.symbol}>{t.symbol}：reserve {formatUnits(s.reserves[i], 18)}；Pool 實際 balanceOf {formatUnits(s.actual[i], 18)}；教師餘額 {formatUnits(s.teacher[i], 18)}；allowance {formatUnits(s.allowances[i], 18)}；spender {s.pool}</p>)}
      {s.initialized ? <p>首次流動性已建立；首次初始化操作已關閉。{s.immediateExpected ? '目前 LP 與儲備符合初始預期。' : '目前數值可能反映後續交易；請結合原始 Receipt 與 AddLiquidity 事件核對。'}</p> : s.actual.some(v => v !== 0n) ? <p role="alert">Pool 已收到捐贈，初始化價格可能受影響；停止首次注資，交由教師人工處理。</p> : <>
        {AMM_TOKENS.map((t, i) => <button key={t.symbol} disabled={busy || s.allowances[i] >= t.amount} onClick={() => void run(() => liquidity.prepare(i === 0 ? 'approveDPLT' : 'approveA'))}>準備 approve {i === 0 ? '100 DPLT' : '3000 DPLT-A'}</button>)}
        <button disabled={busy || s.allowances.some((v, i) => v < AMM_TOKENS[i].amount)} onClick={() => void run(() => liquidity.prepare('addLiquidity'))}>準備首次 addLiquidity</button>
      </>}
    </div>}
    {q && <div>
      <p>本筆 {q.operation}；教師 {DEPLOYER}；Chain ID 11155111；Value 0；Pool／spender {q.pool}；交易目標 {q.to}。</p>
      <p>{q.operation === 'approveDPLT' ? '精確授權 100 DPLT' : q.operation === 'approveA' ? '精確授權 3000 DPLT-A' : `addLiquidity：100 DPLT、3000 DPLT-A；兩項 min 等於 desired；minLiquidity ${LP_TEACHER}；Deadline ${q.expires}（${new Date(Number(q.expires) * 1000).toISOString()}）`}</p>
      <p>Gas 含 20% 餘裕 {q.gas.toString()}；Gas Price {q.gasPrice.toString()} Wei；費用上限 {formatEther(q.gas * q.gasPrice)} Sepolia ETH。</p>
      <label><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />我已核對本筆代幣、金額、Pool、Gas 與完整摘要。</label>
      <button disabled={busy || !ack} onClick={() => { if (ack) void run(liquidity.confirm) }}>確認 {q.operation}（請求 MetaMask）</button>
    </div>}
    {l.attempts.map((a, i) => <div key={i}>
      <p>{a.operation}：{a.status}；Hash {a.hash ?? '尚未取得，請查 MetaMask 活動'}；Receipt {a.receiptStatus}；Block {a.blockNumber}；{a.message}</p>
      {!a.hash && a.status !== 'rejected' && <label>本筆原 Hash<input value={hashes[i] ?? ''} onChange={e => setHashes({ ...hashes, [i]: e.target.value })} /></label>}
      {a.status !== 'rejected' && <button disabled={busy} onClick={() => void run(() => liquidity.reconcile(i, hashes[i]))}>Reconcile {a.operation} #{i + 1}</button>}
    </div>)}
    <button onClick={download}>匯出 AMM 公開部署與流動性 JSON</button>
    <p>未知交易禁止重送。保留原 Hash 與 localStorage，不以重新整理、清除紀錄或切換分頁重試。首次注資亦受鏈上狀態檢查約束。</p>
  </section>
}
