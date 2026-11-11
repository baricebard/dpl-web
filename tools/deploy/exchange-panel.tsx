import { useState, useSyncExternalStore } from 'react'
import { formatEther, formatUnits } from 'viem'
import { assertLocal, DEPLOYER } from './config.ts'
import { EXCHANGE_ARGS, RESERVES, type ReserveId } from './exchange-config.ts'
import { JOURNAL_KEY, type DeploymentArtifact, type DeploymentTool } from './engine.ts'
import type { FundingTool } from './funding.ts'

export function ExchangePanel({ tool, funding, artifact }: { tool: DeploymentTool; funding: FundingTool; artifact: DeploymentArtifact }) {
  const state = useSyncExternalStore(tool.subscribe, tool.getSnapshot)
  const funds = useSyncExternalStore(funding.subscribe, funding.getSnapshot)
  const [error, setError] = useState(''), [ack, setAck] = useState(false)
  const [fundAck, setFundAck] = useState<ReserveId>(), [hash, setHash] = useState('')
  const [fundHashes, setFundHashes] = useState<Record<number, string>>({})
  const busy = state.busy || funds.busy
  const r = state.records.exchange, p = state.prepared.exchange, f = funds.prepared
  async function run(action: () => Promise<void>) {
    setError(''); setAck(false); setFundAck(undefined)
    try {
      assertLocal()
      if (!navigator.locks) throw new Error('瀏覽器缺少 Web Locks；請使用最新版 Chrome／Edge')
      await navigator.locks.request(JOURNAL_KEY, { ifAvailable: true }, async lock => {
        if (!lock) throw new Error('另一分頁正在處理部署／注入，請勿重複操作')
        await action()
      })
    } catch (e) { setError(e instanceof Error ? e.message : '操作失敗；請查詢原交易') }
  }
  function download() {
    const data = { deployment: JSON.parse(tool.exportRecord()), funding: JSON.parse(funding.exportRecord()) }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = 'dpl-exchange-deployment-funding.json'; link.click(); URL.revokeObjectURL(url)
  }
  return <section aria-label="DPL Exchange 部署及庫存">
    <h2>DPL Exchange — DPLFixedExchange</h2>
    <p>既有三種 ERC-20 已部署，本任務只部署 Exchange。下方保留的 ERC-20 舊工具不需操作。</p>
    <p>Ethereum Sepolia／Chain ID 11155111；部署者與管理員：{DEPLOYER}</p>
    <ol>{['dplt', 'assetA', 'assetB', 'administrator'].map((name, i) => <li key={name}>{name}: {EXCHANGE_ARGS[i]}</li>)}</ol>
    <p>Contract Creation（無 to）／ETH Value = 0 Wei</p>
    <details><summary>Exchange Hardhat 編譯產物來源</summary><pre>{JSON.stringify(artifact.provenance, null, 2)}</pre></details>
    <button disabled={busy} onClick={() => void run(tool.connect)}>連接／核對 Exchange 教師錢包</button>
    <p>錢包：{state.connected ? '指定教師帳號與 Sepolia 已確認' : '尚未確認／已失效'}</p>
    <p role="alert">{error}</p>
    <p>Exchange 狀態：<span role="status">{r.status}</span>。{r.message}</p>
    {r.hash && <p>Transaction Hash：{r.hash}</p>}
    {r.contractAddress && <p>Contract Address：{r.contractAddress}；Block：{r.blockNumber}；Receipt：{r.receiptStatus}；部署時間：{r.deployedAt}</p>}
    <button disabled={busy || !state.connected || !!r.attempted} onClick={() => void run(() => tool.prepare('exchange'))}>準備部署 DPL Exchange</button>
    {p && <div>
      <p>部署前摘要：DPLFixedExchange；帳號 {DEPLOYER}；Chain ID 11155111；Constructor 如上；Value 0 Wei。</p>
      <p>Gas 預估含 20% 餘裕：{p.gas.toString()}；Gas Price：{p.gasPrice.toString()} Wei；費用上限 {formatEther(p.gas * p.gasPrice)} Sepolia ETH；5 分鐘有效。</p>
      <label><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />我已核對帳號、網路、四個 Constructor、Gas 及 Value 0，確認部署 Exchange。</label>
      <button disabled={busy || !state.connected || !ack} onClick={() => { if (ack) void run(() => tool.confirm('exchange')) }}>確認部署 DPL Exchange（請求 MetaMask）</button>
    </div>}
    {r.attempted && <div>
      {!r.hash && <label>Exchange 原交易 Hash<input value={hash} onChange={e => setHash(e.target.value)} /></label>}
      <button disabled={busy} onClick={() => void run(() => tool.reconcile('exchange', hash))}>查詢 Exchange 原交易（不重送）</button>
    </div>}
    <h3>教師初始交換庫存（逐筆 transfer）</h3>
    <p>只接受已通過必要鏈上檢查的 Exchange。重新整理後先查詢原部署 Hash；不提供手填收款地址。</p>
    <p>owner()：{funds.owner ?? '未驗證'}；paused()：{funds.paused === undefined ? '未驗證' : String(funds.paused)}</p>
    <button disabled={busy || r.status !== '成功'} onClick={() => void run(funding.refresh)}>查詢 owner／paused／三種 reserveOf</button>
    {RESERVES.map(token => {
      const current = funds.balances[token.id]
      return <div key={token.id}>
        <h4>{token.id}</h4>
        <p>目標：{formatUnits(token.target, 18)}；目前庫存：{current === undefined ? '未驗證（停止注入）' : formatUnits(current, 18)}；待補差額：{current === undefined ? '未驗證' : formatUnits(current < token.target ? token.target - current : 0n, 18)}</p>
        <button disabled={busy || r.status !== '成功' || current === undefined || current >= token.target} onClick={() => void run(() => funding.prepare(token.id))}>準備注入 {token.id}</button>
      </div>
    })}
    {f && <div>
      <p>本筆代幣：{f.token}；數量：{formatUnits(f.amount, 18)}；收款 Exchange：{f.address}；ETH Value：0 Wei。</p>
      <p>Gas 預估含 20% 餘裕：{f.gas.toString()}；Gas Price：{f.gasPrice.toString()} Wei；費用上限：{formatEther(f.gas * f.gasPrice)} Sepolia ETH；5 分鐘有效。</p>
      <label><input type="checkbox" checked={fundAck === f.token} onChange={e => setFundAck(e.target.checked ? f.token : undefined)} />我已核對本筆代幣、數量、收款 Exchange 與 Gas。</label>
      <button disabled={busy || fundAck !== f.token} onClick={() => { if (fundAck === f.token) void run(funding.confirm) }}>確認注入 {f.token}（請求 MetaMask）</button>
    </div>}
    {funds.attempts.map((a, i) => <div key={i}>
      <p>{a.token} 注入 {formatUnits(BigInt(a.amount), 18)} → {a.address}：{a.status}；{a.hash ?? 'Hash 未知'}；{a.message}</p>
      {!a.hash && <label>注入原 Hash<input value={fundHashes[i] ?? ''} onChange={e => setFundHashes({ ...fundHashes, [i]: e.target.value })} /></label>}
      <button disabled={busy} onClick={() => void run(() => funding.reconcile(i, fundHashes[i]))}>查詢第 {i + 1} 筆注入原交易及 reserveOf（不重送）</button>
    </div>)}
    <button onClick={download}>匯出 Exchange 部署與注入公開 JSON</button>
    <p>未知結果先查原 Hash 與 reserveOf，禁止重送。勿刪除 localStorage 或更換 origin／瀏覽器繞過鎖；不支援跨電腦協調。所有交易必須親自於 MetaMask 核准。</p>
  </section>
}
