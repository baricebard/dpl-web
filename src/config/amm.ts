import { getAddress, parseAbi } from 'viem'
import { tokens } from './tokens'

// Task 08C 使用者提供的 Sepolia 部署紀錄；ABI 摘自 Task 08A DPLAMMPool.sol。
export const amm = {
  address: getAddress('0x58841DBfDBa420B52fedbEe07AC9414E74E382F2'),
  chainId: 11155111 as const,
  sourceCommit: '5074077757ab5d7a7b904d2b91d4d7b00c8db6fe',
  summaryTtl: 120_000,
  maxReserve: (1n << 112n) - 1n,
}
export const ammTokens = [tokens[0], tokens[1]] as const
export const ammAbi = parseAbi([
  'function dplt() view returns (address)',
  'function assetA() view returns (address)',
  'function initialProvider() view returns (address)',
  'function getReserves() view returns (uint256 reserveDPLT, uint256 reserveDPLTA)',
  'function quoteSwap(address tokenIn, uint256 amountIn) view returns (address tokenOut, uint256 amountOut)',
  'function swap(address tokenIn, uint256 amountIn, uint256 minAmountOut, uint256 deadline) returns (uint256 amountOut)',
  'function addLiquidity(uint256 amountDPLTDesired, uint256 amountDPLTADesired, uint256 amountDPLTMin, uint256 amountDPLTAMin, uint256 minLiquidity, uint256 deadline) returns (uint256 amountDPLT, uint256 amountDPLTA, uint256 liquidity)',
  'function removeLiquidity(uint256 liquidity, uint256 amountDPLTMin, uint256 amountDPLTAMin, uint256 deadline) returns (uint256 amountDPLT, uint256 amountDPLTA)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'event Swap(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)',
  'event AddLiquidity(address indexed provider, uint256 amountDPLT, uint256 amountDPLTA, uint256 liquidity)',
  'event RemoveLiquidity(address indexed provider, uint256 amountDPLT, uint256 amountDPLTA, uint256 liquidity)',
  'error UnsupportedToken(address token)', 'error InvalidAmount()', 'error UninitializedPool()',
  'error InsufficientReserve()', 'error ZeroOutput()', 'error ReserveLimitExceeded()',
  'error ExpiredDeadline()', 'error InsufficientMinimumAmount()', 'error InsufficientLiquidity()',
  'error UnexpectedTokenBalance()',
])
