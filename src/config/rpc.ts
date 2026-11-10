// PublicNode 官網列有 Sepolia；本環境代理阻擋實測，CORS/鏈別/餘額待課前驗證。
// 不配置未驗證備援或保密 API Key。
export const sepoliaRpc = {
  url: 'https://ethereum-sepolia-rpc.publicnode.com',
  timeoutMs: 8_000,
  retryDelayMs: 1_000,
  refreshIntervalMs: 10_000,
  rateLimitCooldownMs: 30_000,
} as const
