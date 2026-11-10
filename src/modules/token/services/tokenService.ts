import { BaseError, getAddress, isAddress, parseUnits, zeroAddress } from 'viem'
import type { Address } from 'viem'
import { teachingTokenRuntime } from '../../../config/teachingTokenRuntime'
import { matchesRuntime } from '../../../lib/web3/runtimeIntegrity'
import { teachingTokenAbi, tokens, tokenSupply } from '../../../config/tokens'
import type { TeachingToken } from '../../../config/tokens'
import { sepoliaPublicClient } from '../../../lib/web3/publicClient'
import { rpcFailure } from '../../../lib/web3/rpcError'
import type { TransactionSession } from '../../wallet/types'
import type { TransferInput, TransferSummary } from '../types'

export type TokenClient = Pick<typeof sepoliaPublicClient, 'getChainId' | 'getCode' | 'readContract' | 'getBalance' | 'simulateContract' | 'estimateContractGas' | 'getGasPrice' | 'waitForTransactionReceipt' | 'getTransactionReceipt' | 'getBlock' | 'getBlockNumber' | 'getTransaction'>
export function tokenError(error: unknown): string {
  const { timeout, rateLimited } = rpcFailure(error)
  const description = error instanceof BaseError ? error.walk().message : error instanceof Error ? error.message : String(error)
  if (/4001|rejected|denied/i.test(description) || (error && typeof error === 'object' && 'code' in error && error.code === 4001)) return '使用者拒絕 MetaMask 確認。'
  if (/insufficient funds|Gas 不足/i.test(description)) return 'Sepolia ETH Gas 不足，請先到 Faucet 準備資源。'
  if (/revert/i.test(description)) return '智能合約 Revert，已阻止送出，請確認代幣餘額與收款地址。'
  if (timeout || /timeout|timed out/i.test(description)) return 'RPC 逾時，結果未知；請查原交易，不要重新送出。'
  if (rateLimited || /429|rate limit|too many/i.test(description)) return 'RPC 限流，請至少等待 30 秒後手動查詢。'
  return error instanceof Error && !(error instanceof BaseError) ? error.message : 'RPC 查詢失敗，請稍後手動重試或依教材與教師示範操作。'
}
const chainChecks = new WeakMap<TokenClient, Promise<number>>()
async function checkChain(client: TokenClient) {
  let check = chainChecks.get(client)
  if (!check) { check = client.getChainId().finally(() => chainChecks.delete(client)); chainChecks.set(client, check) }
  return check
}
export async function verifyToken(token: TeachingToken, client: TokenClient = sepoliaPublicClient) {
  if (!tokens.some(item => item.id === token.id && item.address === token.address && item.chainId === token.chainId)) throw new Error('代幣合約不在公開設定中。')
  if (await checkChain(client) !== token.chainId) throw new Error('RPC 網路不符，已停用轉帳。')
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 })
  const code = await client.getCode({ address: token.address, blockNumber })
  if (!code || code === '0x') throw new Error('合約 Code 不存在，已停用此代幣轉帳。')
  if (!matchesRuntime(code, teachingTokenRuntime)) throw new Error('合約完整 Runtime Bytecode（含 Solidity Metadata）不符，已停用此代幣轉帳。')
  const read = (functionName: 'name' | 'symbol' | 'decimals' | 'totalSupply') => client.readContract({ address: token.address, abi: teachingTokenAbi, functionName, blockNumber })
  const [name, symbol, decimals, supply] = await Promise.all([read('name'), read('symbol'), read('decimals'), read('totalSupply')])
  if (name !== token.name || symbol !== token.symbol || decimals !== token.decimals || supply !== tokenSupply) throw new Error('合約 name／symbol／decimals／totalSupply 不符，已停用此代幣轉帳。')
}
export function validateTransfer(input: TransferInput, balance: bigint) {
  const token = tokens.find(token => token.id === input.tokenId)
  if (!token) throw new Error('請選擇已配置的教學代幣。')
  if (!isAddress(input.recipient) || getAddress(input.recipient) === zeroAddress) throw new Error('請輸入有效且非零的 Ethereum 收款地址。')
  if (!/^\d+(\.\d+)?$/.test(input.amount)) throw new Error('金額必須是正十進位數字，不接受負數、NaN 或科學記號。')
  if ((input.amount.split('.')[1]?.length ?? 0) > token.decimals) throw new Error('小數位數不可超過 18。')
  const amount = parseUnits(input.amount, token.decimals)
  if (amount <= 0n) throw new Error('金額必須大於零。')
  if (amount > balance) throw new Error('轉帳數量超過實際代幣餘額。')
  return { token, recipient: getAddress(input.recipient), amount }
}
export async function assertSession(session: TransactionSession) {
  if (!session.isCurrent()) throw new Error('帳號或網路已切換，請重新檢查摘要。')
  const [accounts, chain] = await Promise.all([session.provider.request({ method: 'eth_accounts' }), session.provider.request({ method: 'eth_chainId' })])
  if (!session.isCurrent() || !Array.isArray(accounts) || typeof accounts[0] !== 'string' || accounts[0].toLowerCase() !== session.address.toLowerCase() || chain !== '0xaa36a7') throw new Error('MetaMask 帳號或網路已切換，請重新檢查摘要。')
}
export async function prepareTransfer(session: TransactionSession, input: TransferInput, client: TokenClient = sepoliaPublicClient): Promise<TransferSummary> {
  validateTransfer(input, tokenSupply)
  await assertSession(session)
  const token = tokens.find(token => token.id === input.tokenId)
  if (!token) throw new Error('未知合約，已停用轉帳。')
  await verifyToken(token, client)
  await assertSession(session)
  const [balance, ethBalance] = await Promise.all([
    client.readContract({ address: token.address, abi: teachingTokenAbi, functionName: 'balanceOf', args: [session.address] }),
    client.getBalance({ address: session.address }),
  ])
  const { recipient, amount } = validateTransfer(input, balance)
  const request = { account: session.address, address: token.address, abi: teachingTokenAbi, functionName: 'transfer' as const, args: [recipient, amount] as const }
  const simulation = await client.simulateContract(request)
  if (simulation.result !== true) throw new Error('transfer 模擬未回傳 true，已停用轉帳。')
  const [estimate, price] = await Promise.all([client.estimateContractGas(request), client.getGasPrice()])
  const gas = (estimate * 120n + 99n) / 100n
  const gasPrice = (price * 120n + 99n) / 100n
  if (ethBalance < gas * gasPrice) throw new Error('Sepolia ETH Gas 不足。')
  await assertSession(session)
  return { session, token, recipient, amount, balance, ethBalance, gas, gasPrice, createdAt: Date.now() }
}
const pending = new Map<Address, ReturnType<typeof readBalances>>()
async function readBalances(address: Address) {
  const balances = await Promise.all(tokens.map(async token => {
    try {
      await verifyToken(token)
      const balance = await sepoliaPublicClient.readContract({ address: token.address, abi: teachingTokenAbi, functionName: 'balanceOf', args: [address] })
      return { token, balance }
    } catch (error) { return { token, error: tokenError(error) } }
  }))
  return { balances, updatedAt: Date.now() }
}
export function readTokenBalances(address: Address) {
  let request = pending.get(address)
  if (!request) {
    request = readBalances(address).finally(() => pending.delete(address))
    pending.set(address, request)
  }
  return request
}
