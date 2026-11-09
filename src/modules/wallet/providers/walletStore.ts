import { getAddress, isAddress, numberToHex } from 'viem'
import { sepolia } from 'viem/chains'
import type { WalletProvider } from '../../../lib/web3/provider'
import type { WalletState } from '../types'

const initial: WalletState = {
  address: null, chainId: null, connectionStatus: 'unavailable',
  isSepolia: false, canTransact: false, isBusy: false, error: null,
}
const addressOf = (value: unknown) => Array.isArray(value) && typeof value[0] === 'string' && isAddress(value[0]) ? getAddress(value[0]) : null
const chainOf = (value: unknown) => {
  if (typeof value !== 'string' || !/^0x[\da-f]+$/i.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}
function errorMessage(error: unknown, switching = false): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
  if (code === 4001) return switching ? '已拒絕切換網路，可在準備好後重試。' : '已拒絕連接錢包，可在準備好後重試。'
  if (code === -32002) return '錢包已有請求進行中，請開啟 MetaMask 完成或取消。'
  if (code === 4100) return '錢包尚未授權或未解鎖，請開啟 MetaMask 解鎖後重新連接。'
  if (code === 4900 || code === 4901) return '錢包連線中斷，請確認 MetaMask 與網路後重新連接。'
  if (code === 4902) return 'MetaMask 尚未啟用 Sepolia。請在錢包設定開啟「顯示測試網路」，選擇 Sepolia 後重試。'
  return switching ? '切換 Sepolia 失敗，請在 MetaMask 手動選擇 Sepolia 後重試。' : '無法讀取錢包，請確認 MetaMask 已解鎖後重試。'
}

export function createWalletStore() {
  let state = initial
  let provider: WalletProvider | undefined
  let detach: (() => void) | undefined
  let accountRevision = 0
  let chainRevision = 0
  let session = 0
  let active = false
  let pending = false
  const listeners = new Set<() => void>()
  function update(patch: Partial<WalletState>) {
    state = { ...state, ...patch }
    state.isSepolia = state.chainId === sepolia.id
    state.canTransact = state.connectionStatus === 'connected' && !!state.address && state.isSepolia && !state.isBusy
    listeners.forEach(listener => listener())
  }
  async function refresh(target: WalletProvider, token: number) {
    const accountVersion = accountRevision
    const chainVersion = chainRevision
    const [accounts, chain] = await Promise.all([
      target.request({ method: 'eth_accounts' }), target.request({ method: 'eth_chainId' }),
    ])
    if (!active || session !== token) return
    const address = accountRevision === accountVersion ? addressOf(accounts) : state.address
    update({ address, chainId: chainRevision === chainVersion ? chainOf(chain) : state.chainId, connectionStatus: address ? 'connected' : 'disconnected' })
  }
  async function run(switching: boolean) {
    if (!provider || pending) return
    const target = provider
    const token = session
    pending = true
    active = true
    update({ isBusy: true, error: null, ...(!switching ? { connectionStatus: 'connecting' as const } : {}) })
    try {
      if (switching) {
        // No add-chain fallback: this phase has no independent RPC configuration.
        await target.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: numberToHex(sepolia.id) }] })
      } else {
        const accounts = await target.request({ method: 'eth_requestAccounts' })
        if (!addressOf(accounts)) throw { code: 4100 }
      }
      await refresh(target, token)
      if (session === token && active && switching && state.chainId !== sepolia.id) {
        update({ error: '錢包未切換至 Sepolia，請確認 MetaMask 中的目前網路。' })
      }
    } catch (error) {
      if (session === token && active) {
        update({ error: errorMessage(error, switching), ...(!switching ? { address: null, chainId: null, connectionStatus: 'disconnected' as const } : {}) })
      }
    } finally {
      pending = false
      if (session === token) update({ isBusy: false })
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    attach(target: WalletProvider) {
      detach?.()
      provider = target
      active = true
      const token = ++session
      update({ ...initial, connectionStatus: 'disconnected' })
      const accountsChanged = (accounts: unknown) => {
        if (!active) return
        accountRevision++
        const address = addressOf(accounts)
        update({ address, connectionStatus: address ? 'connected' : 'disconnected', error: null })
      }
      const chainChanged = (chain: unknown) => {
        if (!active) return
        chainRevision++
        update({ chainId: chainOf(chain), error: null })
      }
      const disconnected = () => {
        session++
        accountRevision++
        chainRevision++
        active = false
        update({ address: null, chainId: null, connectionStatus: 'disconnected', isBusy: false, error: '錢包連線中斷，請確認 MetaMask 後重新連接。' })
      }
      target.on('accountsChanged', accountsChanged)
      target.on('chainChanged', chainChanged)
      target.on('disconnect', disconnected)
      detach = () => {
        target.removeListener('accountsChanged', accountsChanged)
        target.removeListener('chainChanged', chainChanged)
        target.removeListener('disconnect', disconnected)
      }
      void refresh(target, token).catch(error => {
        if (active && session === token) update({ error: errorMessage(error) })
      })
    },
    connect: () => run(false),
    switchToSepolia: () => run(true),
    disconnect() {
      session++
      accountRevision++
      chainRevision++
      active = false
      update({ address: null, chainId: null, connectionStatus: provider ? 'disconnected' : 'unavailable', isBusy: false, error: null })
    },
    destroy() {
      detach?.()
      active = false
      session++
      provider = undefined
      update({ ...initial })
    },
  }
}
