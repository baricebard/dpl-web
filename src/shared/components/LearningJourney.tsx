import { modules, type ModuleId } from '../../config/modules'
import { lessons } from '../../config/lessons'

export function LearningNav({ current }: { current: ModuleId }) {
  return <nav className="learning-nav" aria-label={`${current} 六階段學習導覽`}>
    <ol>{modules.map((module, index) => <li key={module.id}><a href={`#${module.id}`} aria-current={current === module.id ? 'step' : undefined}>{index + 1}. {module.name}</a></li>)}</ol>
  </nav>
}

export function LearningIntro({ moduleId }: { moduleId: ModuleId }) {
  const lesson = lessons[moduleId]
  return <div className="learning-intro">
    <LearningNav current={moduleId} />
    <h3>這一關要學什麼？</h3><p>{lesson.goal}</p>
    <p><strong>你將完成什麼？</strong> {lesson.task}</p>
    <details><summary>操作步驟與預期結果</summary>
      <ol>{lesson.steps.map(step => <li key={step}>{step}</li>)}</ol>
      <p><strong>操作結果如何判讀？</strong> {lesson.result}</p>
      <p>以上為預期結果，實際狀態請以下方查詢或交易結果為準。</p>
    </details>
    <p className="wallet-note">可以自由切換單元。沒有錢包也能閱讀教材、觀察教師展示；此導覽只標示所在單元，不記錄完成進度。<a href="#classroom-help">遇到問題？查看課堂操作協助</a></p>
  </div>
}

export function LearningOutro({ moduleId }: { moduleId: ModuleId }) {
  const index = modules.findIndex(module => module.id === moduleId)
  const next = modules[index + 1]
  return <aside className="learning-outro" aria-label={`${moduleId} 學習整理`}>
    <h3>你學到了什麼？</h3><ul>{lessons[moduleId].takeaways.map(point => <li key={point}>{point}</li>)}</ul>
    <p>自我檢核：能否用自己的話解釋上述概念？可搭配教師展示回答，觀看教材不代表完成鏈上交易。</p>
    {next ? <a className="primary-link" href={`#${next.id}`}>下一個單元：{next.name} →</a> : <a className="primary-link" href="#modules">回顧六個單元，說明你的資產配置 →</a>}
  </aside>
}

const help = [
  ['未安裝 MetaMask／尚未連接', '到 Wallet 依官方連結安裝擴充功能並解鎖，按連接並核對帳號。無法安裝時可閱讀各單元教材並觀察教師操作；手機跨 App 連接尚未支援。'],
  ['錯誤網路', '到 Wallet 切換 Ethereum Sepolia（11155111），在 MetaMask 核對後確認；不要在其他網路送出教學交易。'],
  ['Sepolia ETH 不足', '先到 Faucet 閱讀測試 Gas 取得指引；DPLT 不能支付 Gas。不要購買主網資產或測試幣。'],
  ['教學代幣不足', '先查詢最新餘額，再降低數量或請教師依課前安排協助。平台沒有內建發幣或 Mint 功能。'],
  ['ERC-20 授權不足', '在 Exchange／Liquidity 檢查指定合約與本次數量，再確認 approve。授權成功後仍需獨立確認交換或注資；Token 轉帳與移除自己的 LP 不需 approve。'],
  ['使用者拒絕 MetaMask', '拒絕是可選的操作。先閱讀畫面結果並核對 MetaMask 活動；確認未送出且沒有未知交易後，修正輸入再自行操作。'],
  ['RPC 查詢失敗', '讀取失敗不代表餘額為零。等待畫面冷卻後手動重新查詢，勿連續重按；全班可分組錯開查詢，暫時改觀察教師或教材。'],
  ['Faucet 暫時不可用', '資格、庫存及等待時間由外部服務決定，不保證即時成功。告知教師並改用觀察方式，不購買資產以通過資格。'],
  ['交易已送出但尚未確認', '保存原交易 Hash／Etherscan 連結，等待鏈上結果。Hash 不等於成功，approve 成功也不等於 swap 成功。'],
  ['交易狀態未知', '不要重送或重新整理以繞過狀態。先查 MetaMask 活動及原 Hash，再用模組的原交易查詢功能核對，必要時請教師協助；網站不自動重送。'],
]
export function ClassroomHelp() {
  return <section id="classroom-help" className="wallet-panel classroom-help" aria-labelledby="classroom-help-title">
    <h2 id="classroom-help-title">課堂操作協助</h2>
    <p>30 人可分組操作並錯開查詢。不能使用錢包時，閱讀教材並觀看教師展示，練習預測資產變化及判讀結果；不會產生模擬餘額或完成標記。</p>
    <details><summary>常見問題與下一步</summary><dl>{help.map(([title, body]) => <div key={title}><dt>{title}</dt><dd>{body}</dd></div>)}</dl></details>
    <a href="#wallet">前往 Wallet 檢查帳號與網路 →</a>
  </section>
}
