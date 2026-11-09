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
      {module.id === 'wallet' ? <a className="module-entry module-entry-active" href="#wallet" aria-label="Wallet：開啟錢包介面"><span><span className="status-dot" />開啟錢包介面</span><span aria-hidden="true">↗</span></a> : <button className="module-entry" type="button" disabled aria-label={`${module.name}：尚未開放`}>
        <span><span className="status-dot" />尚未開放</span>
        <span aria-hidden="true">↗</span>
      </button>}
    </article>
  )
}
