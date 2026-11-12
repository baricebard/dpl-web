import { formatUnits } from 'viem'
import { ammTokens } from '../../../config/amm'
import { share } from '../services/ammMath'
import type { AmmTransaction } from '../types'

const units = (value: bigint) => formatUnits(value, 18)

export function AmmResult({ tx }: { tx: AmmTransaction }) {
  if (!tx.actual || tx.kind.startsWith('approve')) return null
  const { before, after, actual, summary } = tx
  return <div className="amm-result" data-testid="amm-result">
    <h4>實際資產變化</h4>
    {tx.kind === 'swap' ? <><p>支付 {units(summary.amount)} {ammTokens[summary.input.tokenIndex].symbol}</p><p>實際收到 {units(actual[0])} {ammTokens[1 - summary.input.tokenIndex].symbol}</p></>
      : <><p>{tx.kind === 'add' ? '實際投入' : '實際取回'} {units(actual[0])} DPLT</p><p>{tx.kind === 'add' ? '實際投入' : '實際取回'} {units(actual[1])} DPLT-A</p><p>{tx.kind === 'add' ? '實際取得' : '銷毀 LP'} {units(actual[2])} DPL-LP</p></>}
    {before && after ? <>
      <p>以下為送出前與確認後 RPC 快照；期間其他交易也可能影響餘額及儲備。</p>
      <dl>{ammTokens.map((token, i) => <div key={token.id}><dt>{token.symbol} 錢包餘額</dt><dd>{units(before.balances[i])} → {units(after.balances[i])}</dd></div>)}
        <dt>{tx.kind === 'remove' ? '剩餘 LP' : '更新後 LP 持有量'}</dt><dd>{units(before.lp)} → {units(after.lp)} DPL-LP</dd>
        <dt>池中份額</dt><dd>{share(before.lp, before.supply)}% → {share(after.lp, after.supply)}%</dd>
        {ammTokens.map((token, i) => <div key={token.id}><dt>Pool 儲備 {token.symbol}</dt><dd>{units(before.reserves[i])} → {units(after.reserves[i])}</dd></div>)}
      </dl><p>快照區塊：{before.blockNumber.toString()} → {after.blockNumber.toString()}</p>
    </> : <p role="status">尚無法確認前後餘額{after ? '' : '，請重新查詢原交易以更新結果。'}</p>}
    <p>實際數量來自已核對的 Receipt 事件，與報價估算可能不同。</p>
  </div>
}
