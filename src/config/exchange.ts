import { getAddress, parseAbi } from 'viem'

// Task 07C 使用者提供的部署／注入紀錄；ABI 摘自 PR #10 的 DPLFixedExchange.sol。
// 僅公開學生需要的介面，不匯入 Hardhat artifact、bytecode 或管理方法。
export const exchange = {
  address: getAddress('0xd0bc9E38a7fA59C9ee306Ef28D1Fa5B001957e3B'),
  administrator: getAddress('0xC6EdF1cBb0aC65d7DefF5CDadA1721C90951ea02'),
  chainId: 11155111 as const,
  sourceCommit: '5e3c6d74c7dae1d04f0fbdd89f197df9371c5a1f',
}
export const exchangeAbi = parseAbi([
  'function quote(address tokenIn, address tokenOut, uint256 amountIn) view returns (uint256 amountOut)',
  'function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut) returns (uint256 amountOut)',
  'function reserveOf(address token) view returns (uint256)',
  'function paused() view returns (bool)',
  'event Swap(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)',
  'error SameToken()', 'error InvalidAmount()', 'error ZeroOutput()',
  'error UnsupportedToken(address token)',
  'error AmountExceedsLimit(address token, uint256 amount)',
  'error InsufficientReserve(address token, uint256 available, uint256 required)',
  'error InsufficientOutputAmount(uint256 amountOut, uint256 minAmountOut)',
  'error EnforcedPause()',
])
export const exchangeInputCaps = [10n * 10n ** 18n, 300n * 10n ** 18n, 600n * 10n ** 18n / 9n] as const
// 顯示用有理數；可執行報價只讀合約 quote()。
export const exchangeRates = [['—', '30/1', '20/3'], ['1/30', '—', '2/9'], ['3/20', '9/2', '—']] as const
export const exchangeSummaryTtl = 120_000
