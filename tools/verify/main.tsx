import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import artifact from 'virtual:verification-artifact'
import { sepoliaRpc } from '../../src/config/rpc.ts'
import { readPublicRpc } from './client.ts'
import { parseRecord, type DeploymentRecord } from './record.ts'
import { serialize, verifyDeployment, type Check, type VerificationResult } from './engine.ts'
import './style.css'

if (!import.meta.env.DEV || !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) throw new Error('驗證工具僅限 localhost 開發模式')

function Checks({ checks }: { checks: Check[] }) {
  return <ul>{checks.map((check, i) => <li key={i}>
    <strong>{check.status}：{check.name}</strong>
    {check.reason && <p>{check.reason}</p>}
    <details><summary>預期、實際值與查詢時間</summary><pre>{serialize(check)}</pre></details>
  </li>)}</ul>
}
function App() {
  const [record, setRecord] = useState<DeploymentRecord>()
  const [result, setResult] = useState<VerificationResult>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const fileGeneration = useRef(0)
  async function load(file: File | undefined) {
    const generation = ++fileGeneration.current
    setRecord(undefined); setResult(undefined); setError('')
    if (!file) return
    try {
      if (file.size > 128 * 1024) throw new Error('部署紀錄上限為 128 KiB')
      const parsed = parseRecord(await file.text())
      if (generation === fileGeneration.current) setRecord(parsed)
    } catch (e) { if (generation === fileGeneration.current) setError(e instanceof Error ? e.message : 'JSON 無法讀取') }
  }
  async function verify() {
    if (!record || lock.current) return
    lock.current = true; setBusy(true); setResult(undefined); setError('')
    try { setResult(await verifyDeployment(record, artifact, readPublicRpc)) }
    catch (e) { setError(e instanceof Error ? e.message : '驗證未完成，不能標記通過') }
    finally { lock.current = false; setBusy(false) }
  }
  function download() {
    if (!result) return
    const url = URL.createObjectURL(new Blob([serialize(result)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = 'dpl-sepolia-verification-result.json'; a.click()
    URL.revokeObjectURL(url)
  }
  return <main>
    <h1>DPL 本機唯讀部署驗證</h1>
    <p>匯入公開部署紀錄後，按「執行唯讀驗證」。不需安裝或連接 MetaMask，沒有簽署或發送交易功能。</p>
    <p>Ethereum Sepolia（11155111）；RPC：{sepoliaRpc.url}。每次由瀏覽器直接查詢，沒有雲端 RPC 轉送或自動輪詢。</p>
    <label htmlFor="record">公開部署紀錄 JSON（dpl-sepolia-deployment-record.json，最多 128 KiB）</label>
    <input id="record" type="file" accept=".json,application/json" disabled={busy} onChange={e => { void load(e.target.files?.[0]) }} />
    <p role="alert">{error}</p>
    <p>編譯產物：{artifact.available ? '已載入並核對本機 artifact／build-info／來源；仍需比對鏈上 runtime' : `尚未驗證：${artifact.error}`}</p>
    <p>缺少產物時仍可查詢鏈上資料；runtime 完整比對會標示尚未驗證。請先依 docs/10-local-readonly-verifier.md 編譯或還原封存，再重啟工具。</p>
    <details><summary>本機編譯產物與版本證據</summary><pre>{serialize(artifact)}</pre></details>
    <button disabled={!record || busy} onClick={() => { void verify() }}>{busy ? '查詢中，請稍候' : '執行唯讀驗證'}</button>
    <button disabled={!result || busy} onClick={download}>匯出 JSON 驗證結果</button>
    <p role="status">本輪狀態：{busy ? '查詢中；前輪結果已清除' : result?.status ?? '尚未驗證'}</p>
    {record && <>
      <p>初始持有人：{record.initialHolder}；輸入檔 SHA-256：{record.sourceSha256}</p>
      {record.tokens.map(token => {
        const verified = result?.tokens.find(t => t.id === token.id)
        return <section key={token.id} aria-label={token.symbol}>
          <h2>{token.symbol}：{verified?.status ?? '尚未驗證'}</h2>
          <p>{token.name} — {token.address}</p>
          <p>部署 Hash：{token.hash}</p>
          {verified && <Checks checks={verified.checks} />}
        </section>
      })}
    </>}
    {result && <>
      <section><h2>共用檢查</h2><Checks checks={result.checks} /></section>
      <p>查詢時間：{result.startedAt} ～ {result.finishedAt}（UTC）</p>
      <p>教師目前餘額可能因後續轉帳而改變，不要求等於初始供給。本輪未查完整後續轉帳歷史。</p>
      <p>「通過」只適用本輪列出的唯讀檢查，不表示完成 Etherscan 原始碼驗證、管理權限審計或 finality 驗收；不自動啟用 Task 06。</p>
      <details><summary>實際 RPC 請求、回傳證據與錯誤</summary><pre>{serialize(result.evidence)}</pre></details>
    </>}
  </main>
}
createRoot(document.getElementById('root')!).render(<App />)
