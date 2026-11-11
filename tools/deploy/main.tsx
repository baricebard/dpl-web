import { useEffect, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { formatEther } from 'viem'
import artifact from 'virtual:teaching-artifact'
import exchangeArtifact from 'virtual:exchange-artifact'
import { ExchangePanel } from './exchange-panel'
import { createFundingTool, FUNDING_KEY, type FundingTool } from './funding'
import { discoverMetaMask } from '../../src/lib/web3/provider'
import { assertLocal, constructorArgs, DEPLOYER, TOKENS, type TokenId } from './config'
import { createDeploymentTool, JOURNAL_KEY, type DeploymentTool } from './engine'
import './style.css'

assertLocal()
function DeploymentPanel({ tool }: { tool: DeploymentTool }) {
  const state = useSyncExternalStore(tool.subscribe, tool.getSnapshot)
  const [error, setError] = useState('')
  const [ack, setAck] = useState<Partial<Record<TokenId, boolean>>>({})
  const [hashes, setHashes] = useState<Partial<Record<TokenId, string>>>({})
  async function run(action: () => Promise<void>) {
    setError('')
    try {
      assertLocal()
      if (!navigator.locks) throw new Error('瀏覽器缺少 Web Locks；請使用最新版 Chrome／Edge')
      await navigator.locks.request(JOURNAL_KEY, { ifAvailable: true }, async lock => {
        if (!lock) throw new Error('另一分頁正在處理部署，請勿重複操作')
        await action()
      })
    } catch (e) { setError(e instanceof Error ? e.message : '操作失敗，請核對錢包與原交易') }
  }
  function confirm(id: TokenId) {
    if (!ack[id]) return
    setAck({})
    void run(() => tool.confirm(id))
  }

  function download() {
    const url = URL.createObjectURL(new Blob([tool.exportRecord()], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = 'dpl-sepolia-deployment-record.json'; link.click()
    URL.revokeObjectURL(url)
  }
  return <>
    <button disabled={state.busy} onClick={() => { setAck({}); void run(tool.connect) }}>連接／重新核對 MetaMask 與餘額</button>
    <p>錢包核對：{state.connected ? '指定帳號與 Sepolia 已確認' : '尚未確認，請連接 MetaMask'}</p>
    <p>目前 Sepolia ETH 餘額：{state.balance === undefined ? '尚未查詢／已失效' : `${formatEther(state.balance)} Sepolia ETH（最近一次手動查詢）`}</p>
    <p role="alert">{error}</p>
    {TOKENS.map(token => {
      const r = state.records[token.id], p = state.prepared[token.id]
      return <section key={token.id} aria-labelledby={token.id}>
        <h2 id={token.id}>{token.symbol} — {token.name}</h2>
        <dl><dt>Constructor（依順序）</dt><dd><pre>{JSON.stringify(constructorArgs(token.id), (_, value) => typeof value === 'bigint' ? value.toString() : value, 2)}</pre></dd>
          <dt>Decimals／供給</dt><dd>18／1,000,000 tokens（1000000000000000000000000 基礎單位）</dd>
          <dt>交易目標／ETH Value</dt><dd>Contract Creation（無 to）／0 Wei</dd>
          <dt>狀態</dt><dd role="status">{r.status}</dd></dl>
        <p>{r.message}</p>
        {r.hash && <p>交易 Hash：<a target="_blank" rel="noreferrer" href={`https://sepolia.etherscan.io/tx/${r.hash}`}>{r.hash}</a></p>}
        {r.contractAddress && <p>合約地址：<a target="_blank" rel="noreferrer" href={`https://sepolia.etherscan.io/address/${r.contractAddress}`}>{r.contractAddress}</a></p>}
        <button disabled={state.busy || !state.connected || !!r.attempted} onClick={() => { setAck({}); void run(() => tool.prepare(token.id)) }}>準備部署 {token.symbol}</button>
        {p && <div>
          <p>Gas 預估（含 20% 餘裕）：{p.gas.toString()}；Gas Price：{p.gasPrice.toString()} Wei</p>
          <p>費用上限：{formatEther(p.gas * p.gasPrice)} Sepolia ETH。確認有效期 5 分鐘；費用增加須重新準備。</p>
          <label><input type="checkbox" checked={!!ack[token.id]} onChange={e => setAck({ [token.id]: e.target.checked })} />我已核對本筆 Constructor、指定地址、11155111、無 to、Value 0，確認部署這一種代幣。</label>
          <button disabled={state.busy || !state.connected || !ack[token.id]} onClick={() => confirm(token.id)}>確認部署 {token.symbol}（將請求 MetaMask）</button>
        </div>}
        {r.attempted && <div>
          {!r.hash && <label>原交易 Hash（由 MetaMask 活動複製，僅查詢）<input value={hashes[token.id] ?? ''} onChange={e => setHashes({ ...hashes, [token.id]: e.target.value })} /></label>}
          <button disabled={state.busy} onClick={() => void run(() => tool.reconcile(token.id, hashes[token.id]))}>查詢原交易 {token.symbol}（不重送）</button>
        </div>}
      </section>
    })}
    <button onClick={download}>匯出公開部署紀錄 JSON</button>
    <p>紀錄保存在此瀏覽器的 localStorage。不要清除紀錄、改用其他瀏覽器或無痕模式以重試未知交易。成功只表示目前 Receipt 及部署區塊核對通過，不代表最終性或 Etherscan 原始碼驗證。</p>
  </>
}
function App() {
  const [tool, setTool] = useState<DeploymentTool>()
  const [exchange, setExchange] = useState<DeploymentTool>()
  const [funding, setFunding] = useState<FundingTool>()
  const [error, setError] = useState('')
  useEffect(() => {
    let active: DeploymentTool | undefined
    let exchangeTool: DeploymentTool | undefined, fundingTool: FundingTool | undefined
    const stop = discoverMetaMask(provider => {
      try {
        active = createDeploymentTool(provider, artifact, { read: () => localStorage.getItem(JOURNAL_KEY), write: value => localStorage.setItem(JOURNAL_KEY, value) })
        const key = `${JOURNAL_KEY}:exchange`
        exchangeTool = createDeploymentTool(provider, exchangeArtifact, { read: () => localStorage.getItem(key), write: value => localStorage.setItem(key, value) }, 60000, 'exchange')
        fundingTool = createFundingTool(provider, exchangeArtifact, exchangeTool, { read: () => localStorage.getItem(FUNDING_KEY), write: value => localStorage.setItem(FUNDING_KEY, value) })
        setTool(active); setExchange(exchangeTool); setFunding(fundingTool)
      } catch { setError('無法安全讀取部署紀錄；請保留紀錄並人工核對，停止部署。') }
    })
    return () => { stop(); active?.destroy(); exchangeTool?.destroy(); fundingTool?.destroy() }
  }, [])
  return <main>
    <h1>DPL 本機 Sepolia 部署工具</h1>
    <p>只在教師自己的電腦使用。每筆需先準備、人工確認，再親自於 MetaMask 核准。不會自動連續部署。</p>
    <p>部署者及 initialHolder：<strong>{DEPLOYER}</strong></p>
    <p>Ethereum Sepolia：11155111。絕不輸入私鑰、助記詞或秘密。</p>
    <details><summary>Hardhat 編譯產物來源</summary><pre>{JSON.stringify(artifact.provenance, null, 2)}</pre></details>
    {error ? <p role="alert">{error}</p> : tool ? <DeploymentPanel tool={tool} /> : <p>等待辨識 MetaMask。請安裝並啟用官方擴充功能；本頁尚未要求連接。</p>}
    {exchange && funding && <ExchangePanel tool={exchange} funding={funding} artifact={exchangeArtifact} />}
  </main>
}
createRoot(document.getElementById('root')!).render(<App />)
