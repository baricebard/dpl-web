import { LearningIntro, LearningOutro } from '../../../shared/components/LearningJourney'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { formatUnits } from 'viem'
import { tokens } from '../../../config/tokens'
import { displayEther } from '../../../lib/web3/display'
import { useWallet } from '../../wallet'
import { createPortfolioStore } from '../services/portfolioStore'
import { percent, portfolioValues, spotPrice } from '../services/portfolioService'

function amount(value: bigint | undefined, positive = false) {
  if (value === undefined) return '不可計算'
  if (value === 0n && positive) return '< 0.000000000000000001'
  return displayEther(value)
}
const categories = ['錢包 DPLT', '錢包 DPLT-A', '錢包 DPLT-B', 'LP 底層 DPLT', 'LP 底層 DPLT-A']
export function PortfolioPanel() {
  const wallet = useWallet()
  const address = wallet.isSepolia ? wallet.address : null
  // 換帳號／鏈即使用新 store；舊請求只能更新已卸載的 store。
  const store = useMemo(() => createPortfolioStore(address), [address])
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  useEffect(() => { void store.refresh() }, [store])
  const s = state.data, v = s ? portfolioValues(s) : undefined
  const spot = s?.reserves.value && (s.supply.value ?? 0n) > 0n ? spotPrice(s.reserves.value) : undefined
  const failed = state.error || (s && [s.lp, s.supply, s.reserves, s.eth, ...s.balances].some(r => r.error))
  const quantity = (value: bigint | undefined) => value === undefined ? (state.loading ? '查詢中' : s || state.error ? '查詢失敗' : '尚未查詢') : amount(value)
  return <section id="portfolio" className="portfolio-panel" aria-labelledby="portfolio-heading">
    <p className="eyebrow">PORTFOLIO / READ ONLY</p>
    <h2 id="portfolio-heading">我的教學總資產</h2>
    <LearningIntro moduleId="portfolio" />
    <p>僅讀取目前資產，不要求簽署或管理資產。DPLT 教學參考價值，不代表真實貨幣價值。</p>
    <p className="portfolio-total" data-testid="portfolio-total">{amount(v?.total, (v?.amounts.some(a => a !== undefined && a > 0n) || (s?.lp.value ?? 0n) > 0n))} DPLT</p>
    <p className="portfolio-address">目前帳號：{wallet.address ?? '尚未連接'} · 目標網路：Ethereum Sepolia（11155111）</p>
    {!wallet.address ? <p>請先至 <a href="#wallet">Wallet 連接錢包</a>。</p> : !wallet.isSepolia ? <p role="alert">請切換至 Ethereum Sepolia，舊網路資料已清除。</p> : null}
    <p>最後更新時間：{s ? new Date(s.updatedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }) + '（台北時間）' : '尚無成功快照'}。數值僅代表查詢時點，無背景自動更新。</p>
    {s && <details><summary>查看快照區塊</summary><p>資料區塊 #{s.blockNumber.toString()}。</p></details>}
    <button type="button" onClick={() => void store.refresh()} disabled={!address || state.loading || state.retryAt > 0}>手動重新整理</button>
    <p>更新後冷卻 30 秒，期間重按不發出 RPC 請求。{state.loading ? '查詢中，已清除前次資料。' : '請核對最後更新時間。'}</p>
    {failed && <p role="alert">{state.error ?? '部分資料查詢失敗；相關估值與配置不可計算，失敗不代表資產歸零。'}</p>}
    <h3>資產列表</h3>
    <div className="portfolio-assets">
      {tokens.map((token, i) => <article className="portfolio-asset" key={token.id} data-testid={`portfolio-token-${i}`}>
        <h4>{token.symbol}</h4><p>{token.name}</p>
        <p>數量：{quantity(s?.balances[i].value)}</p>
        <p>教學參考價：{['1', '1/30', '3/20'][i]} DPLT</p>
        <p>DPLT 等值：{amount(v?.values[i], (s?.balances[i].value ?? 0n) > 0n)}</p>
        <p>資產配置：{v?.total === undefined ? '不可計算' : percent(v.values[i]!, v.total!) + '%'}</p>
      </article>)}
      <article className="portfolio-asset"><h4>DPL-LP</h4><p>DPL AMM Liquidity Provider Token</p><p>數量：{quantity(s?.lp.value)}</p><p>參考價：依底層權益計算，無固定面額價格。</p><p>DPLT 等值：{v?.underlying ? amount(v.values[3]! + v.values[4]!, (s?.lp.value ?? 0n) > 0n) : '不可計算'}</p><p>資產配置（底層合計）：{v?.total === undefined ? '不可計算' : percent(v.values[3]! + v.values[4]!, v.total) + '%'}。已列入 LP 底層兩項分類，不另加總。</p></article>
    </div>
    <h3>LP 權益</h3>
    <div data-testid="portfolio-lp">
      <p>LP 持有量：{quantity(s?.lp.value)} DPL-LP</p>
      <p>池中份額：{v?.underlying && s?.lp.value !== undefined && s.supply.value !== undefined ? percent(s!.lp.value!, s!.supply.value!) + '%' : '不可計算'}</p>
      <p>對應 DPLT：{amount(v?.underlying?.[0])}</p><p>對應 DPLT-A：{amount(v?.underlying?.[1])}</p>
      <p>LP 教學估值：{v?.underlying ? amount(v.values[3]! + v.values[4]!, (s?.lp.value ?? 0n) > 0n) : '不可計算'} DPLT</p>
      {s && !v?.underlying && <p>LP 資料缺失、查詢失敗或鏈上數據矛盾，無法拆解權益。</p>}
    </div>
    <h3>資產配置</h3>
    <p>依直接持有與 LP 底層權益分成五類，LP Token 不重複計值。百分比向下取至 0.01%，合計可能略低於 100%。全零估值時顯示 0%，不代表每類占有比例。</p>
    <div data-testid="portfolio-allocation">{v?.total !== undefined ? categories.map((label, i) => <div className="portfolio-allocation" key={label}>
      <span>{label}：{percent(v.values[i]!, v.total!)}%</span><div className="portfolio-track"><div style={{ width: percent(v.values[i]!, v.total!) + '%' }} /></div>
    </div>) : <p>資料不足，配置不可計算。</p>}</div>
    <h3>固定參考價格與 AMM 價格比較</h3>
    <p>固定參考價：1 DPLT = 30 DPLT-A；1 DPLT = 20/3 DPLT-B。</p>
    <div data-testid="portfolio-spot">{spot ? <><p>AMM 現貨價：1 DPLT = {amount(spot.price, true)} DPLT-A</p><p>相對固定參考價差距：{spot.difference < 0n ? '-' : spot.difference > 0n ? '+' : ''}{spot.deviation === 0n && spot.difference !== 0n ? '< 0.01' : `${spot.deviation / 100n}.${(spot.deviation % 100n).toString().padStart(2, '0')}`}%</p></> : <p>AMM 現貨價及差距不可計算：池為空、儲備為零、尚未查詢或查詢失敗。</p>}</div>
    <p>AMM 現貨價 = reserveDPLTA / reserveDPLT，是池內儲備比例，隨儲備變化，不代表外部市場價格。實際成交受到手續費與價格衝擊影響。兩價不同不代表有可保證獲利的套利機會。AMM 價格只供比較，不作本頁估值來源。</p>
    <h3>Sepolia ETH / Gas</h3><p data-testid="portfolio-eth">{quantity(s?.eth.value)} Sepolia ETH</p><p>僅供測試網 Gas 使用，獨立呈現，不納入 DPLT 教學總估值。</p>
    {s && <details><summary>精確鏈上數值與捨入方式</summary><p>所有查詢指定相同區塊編號；RPC 不支援時顯示失敗，不降級為 latest。區塊編號快照仍可能受到鏈重組影響。</p><p>全部資產為 18 decimals；LP 權益 = floor(LP × reserve / totalSupply)。A 的最小單位 / 30、B 的最小單位 × 3 / 20 逐項向下取整後加總。非零但低於顯示精度時以小額標示；小於 1 DPLT 最小單位的參考價值亦標示小額。</p>
      <pre>{JSON.stringify(s, (_, value: unknown) => typeof value === 'bigint' ? value.toString() : value, 2)}</pre>
      <p>精確 DPLT 等值：{v?.values.map(value => value === undefined ? '不可計算' : formatUnits(value, 18)).join(' / ')}；總額：{v?.total === undefined ? '不可計算' : formatUnits(v.total, 18)}</p>
    </details>}
    <LearningOutro moduleId="portfolio" />
  </section>
}
