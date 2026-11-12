import type { ModuleDefinition } from '../../config/modules'
import { ModuleIcon } from './ModuleIcon'

export function ModuleCard({ module, index }: { module: ModuleDefinition; index: number }) {
  return (
    <article className="module-card" aria-labelledby={`${module.id}-title`}>
      <div className="card-top">
        <span className={`module-icon icon-${module.id}`}><ModuleIcon id={module.id} /></span>
        <span className="module-number">MODULE / {String(index + 1).padStart(2, '0')}</span>
      </div>
      <h3 id={`${module.id}-title`}>{module.name}</h3>
      <p className="card-title">{module.title}</p>
      <p className="card-description">{module.description}</p>
      <p className="card-topic">{module.topic}</p>
      {module.id === 'wallet' ? <a className="module-entry module-entry-active" href="#wallet" aria-label="Wallet：開啟錢包介面"><span><span className="status-dot" />開啟錢包介面</span><span aria-hidden="true">↗</span></a> : module.id === 'faucet' ? <a className="module-entry module-entry-active" href="#faucet" aria-label="Faucet：開啟領取指引"><span><span className="status-dot" />開啟領取指引</span><span aria-hidden="true">↗</span></a> : module.id === 'token' ? <a className="module-entry module-entry-active" href="#token" aria-label="Token：開啟代幣介面"><span><span className="status-dot" />開啟代幣介面</span><span aria-hidden="true">↗</span></a> : module.id === 'exchange' ? <a className="module-entry module-entry-active" href="#exchange" aria-label="Exchange：開啟交換介面"><span><span className="status-dot" />開啟交換介面</span><span aria-hidden="true">↗</span></a> : module.id === 'liquidity' ? <a className="module-entry module-entry-active" href="#liquidity" aria-label="Liquidity：開啟 AMM 與流動性介面"><span><span className="status-dot" />開啟 AMM 與流動性介面</span><span aria-hidden="true">↗</span></a> : <a className="module-entry module-entry-active" href="#portfolio" aria-label="Portfolio：開啟投資組合"><span><span className="status-dot" />開啟投資組合</span><span aria-hidden="true">↗</span></a>}
    </article>
  )
}
