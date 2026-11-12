// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Single constant-product pool for two reviewed, standard 18-decimal teaching assets.
/// @dev Actual balances are reserves once initialized. Direct transfers are irrevocable donations,
/// never LP deposits. No owner, recovery, arbitrary mint, router or remote deployment logic.
contract DPLAMMPool is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable dplt;
    address public immutable assetA;
    address public immutable initialProvider;
    uint256 public constant MINIMUM_LIQUIDITY = 1000;
    address public constant LOCKED_LIQUIDITY_ADDRESS = address(0xdead);
    uint256 public constant MAX_RESERVE = type(uint112).max;
    uint256 public constant FEE_BPS = 30;

    error InvalidToken(address token);
    error DuplicateToken();
    error InvalidInitialProvider();
    error UnauthorizedInitialProvider(address caller);
    error UnsupportedToken(address token);
    error InvalidAmount();
    error UninitializedPool();
    error InsufficientReserve();
    error ZeroOutput();
    error ReserveLimitExceeded();
    error ExpiredDeadline();
    error InsufficientMinimumAmount();
    error InsufficientLiquidity();
    error UnexpectedTokenBalance();

    event Swap(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);
    event AddLiquidity(address indexed provider, uint256 amountDPLT, uint256 amountDPLTA, uint256 liquidity);
    event RemoveLiquidity(address indexed provider, uint256 amountDPLT, uint256 amountDPLTA, uint256 liquidity);
    event ReservesUpdated(uint256 reserveDPLT, uint256 reserveDPLTA);

    constructor(address dplt_, address assetA_, address initialProvider_) ERC20("DPL AMM Liquidity Provider Token", "DPL-LP") {
        if (initialProvider_ == address(0)) revert InvalidInitialProvider();
        initialProvider = initialProvider_;
        if (dplt_ == assetA_) revert DuplicateToken();
        _validateToken(dplt_);
        _validateToken(assetA_);
        dplt = dplt_;
        assetA = assetA_;
    }

    /// @notice Empty until the first successful deposit; afterwards includes all donations and fees.
    /// @dev Reads live balances, so donations need no privileged or asynchronous sync operation.
    function getReserves() public view returns (uint256 reserveDPLT, uint256 reserveDPLTA) {
        if (totalSupply() == 0) return (0, 0);
        return _balances();
    }

    /// @notice Exact floor(reserveOut * amountIn * 997 / (reserveIn * 1000 + amountIn * 997)).
    function quoteSwap(address tokenIn, uint256 amountIn) public view returns (address tokenOut, uint256 amountOut) {
        if (tokenIn != dplt && tokenIn != assetA) revert UnsupportedToken(tokenIn);
        if (amountIn == 0) revert InvalidAmount();
        (uint256 x, uint256 y) = getReserves();
        if (totalSupply() == 0) revert UninitializedPool();
        if (x == 0 || y == 0) revert InsufficientReserve();
        (uint256 reserveIn, uint256 reserveOut) = tokenIn == dplt ? (x, y) : (y, x);
        // Bound BEFORE multiplication. Intermediate numerator < 2^234, denominator < 2^123.
        if (amountIn > MAX_RESERVE - reserveIn) revert ReserveLimitExceeded();
        uint256 amountInWithFee = amountIn * 997;
        amountOut = reserveOut * amountInWithFee / (reserveIn * 1000 + amountInWithFee);
        if (amountOut == 0) revert ZeroOutput();
        tokenOut = tokenIn == dplt ? assetA : dplt;
    }

    function swap(address tokenIn, uint256 amountIn, uint256 minAmountOut, uint256 deadline)
        external nonReentrant returns (uint256 amountOut)
    {
        _checkDeadline(deadline);
        address tokenOut;
        (tokenOut, amountOut) = quoteSwap(tokenIn, amountIn);
        if (amountOut < minAmountOut) revert InsufficientMinimumAmount();
        (uint256 x, uint256 y) = getReserves();
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);
        _checkBalances(tokenIn == dplt ? x + amountIn : x - amountOut, tokenIn == dplt ? y - amountOut : y + amountIn);
        emit Swap(msg.sender, tokenIn, tokenOut, amountIn, amountOut);
    }

    function addLiquidity(
        uint256 amountDPLTDesired, uint256 amountDPLTADesired,
        uint256 amountDPLTMin, uint256 amountDPLTAMin,
        uint256 minLiquidity, uint256 deadline
    ) external nonReentrant returns (uint256 amountDPLT, uint256 amountDPLTA, uint256 liquidity) {
        _checkDeadline(deadline);
        if (amountDPLTDesired == 0 || amountDPLTADesired == 0) revert InvalidAmount();
        if (amountDPLTDesired > MAX_RESERVE || amountDPLTADesired > MAX_RESERVE) revert ReserveLimitExceeded();
        uint256 supply = totalSupply();
        // One-time on-chain gate; a reverted initialization leaves totalSupply at zero.
        if (supply == 0 && msg.sender != initialProvider) revert UnauthorizedInitialProvider(msg.sender);
        // Before initialization, donated balances do not establish a price or earn LP tokens.
        // They accrue to the initial provider and permanent lock only after successful initialization.
        (uint256 x, uint256 y) = _balances();
        amountDPLT = amountDPLTDesired;
        amountDPLTA = amountDPLTADesired;
        if (supply != 0) {
            if (x == 0 || y == 0) revert InsufficientReserve();
            uint256 optimalA = Math.mulDiv(amountDPLTDesired, y, x);
            if (optimalA <= amountDPLTADesired) amountDPLTA = optimalA;
            else amountDPLT = Math.mulDiv(amountDPLTADesired, x, y);
        }
        if (amountDPLT > MAX_RESERVE - x || amountDPLTA > MAX_RESERVE - y) revert ReserveLimitExceeded();
        if (amountDPLT < amountDPLTMin || amountDPLTA < amountDPLTAMin) revert InsufficientMinimumAmount();
        if (supply == 0) {
            uint256 root = Math.sqrt(amountDPLT * amountDPLTA);
            if (root <= MINIMUM_LIQUIDITY) revert InsufficientLiquidity();
            liquidity = root - MINIMUM_LIQUIDITY;
            _mint(LOCKED_LIQUIDITY_ADDRESS, MINIMUM_LIQUIDITY);
        } else {
            liquidity = Math.min(Math.mulDiv(amountDPLT, supply, x), Math.mulDiv(amountDPLTA, supply, y));
        }
        if (liquidity == 0 || liquidity < minLiquidity) revert InsufficientLiquidity();
        IERC20(dplt).safeTransferFrom(msg.sender, address(this), amountDPLT);
        IERC20(assetA).safeTransferFrom(msg.sender, address(this), amountDPLTA);
        _mint(msg.sender, liquidity);
        _checkBalances(x + amountDPLT, y + amountDPLTA);
        emit AddLiquidity(msg.sender, amountDPLT, amountDPLTA, liquidity);
    }

    /// @notice Burns only the caller's LP. No LP approval is required; transferred LP carries rights.
    function removeLiquidity(uint256 liquidity, uint256 amountDPLTMin, uint256 amountDPLTAMin, uint256 deadline)
        external nonReentrant returns (uint256 amountDPLT, uint256 amountDPLTA)
    {
        _checkDeadline(deadline);
        if (liquidity == 0) revert InvalidAmount();
        uint256 supply = totalSupply();
        if (supply == 0) revert UninitializedPool();
        (uint256 x, uint256 y) = getReserves();
        // Check before mulDiv so arbitrary uint256 inputs fail as balances, never arithmetic panics.
        if (liquidity > balanceOf(msg.sender)) revert ERC20InsufficientBalance(msg.sender, balanceOf(msg.sender), liquidity);
        amountDPLT = Math.mulDiv(liquidity, x, supply);
        amountDPLTA = Math.mulDiv(liquidity, y, supply);
        if (amountDPLT == 0 || amountDPLTA == 0) revert ZeroOutput();
        if (amountDPLT < amountDPLTMin || amountDPLTA < amountDPLTAMin) revert InsufficientMinimumAmount();
        _burn(msg.sender, liquidity);
        IERC20(dplt).safeTransfer(msg.sender, amountDPLT);
        IERC20(assetA).safeTransfer(msg.sender, amountDPLTA);
        _checkBalances(x - amountDPLT, y - amountDPLTA);
        emit RemoveLiquidity(msg.sender, amountDPLT, amountDPLTA, liquidity);
    }

    function _checkDeadline(uint256 deadline) private view {
        if (block.timestamp > deadline) revert ExpiredDeadline();
    }

    function _balances() private view returns (uint256 x, uint256 y) {
        x = IERC20(dplt).balanceOf(address(this));
        y = IERC20(assetA).balanceOf(address(this));
        if (x > MAX_RESERVE || y > MAX_RESERVE) revert ReserveLimitExceeded();
    }

    function _checkBalances(uint256 expectedX, uint256 expectedY) private {
        (uint256 x, uint256 y) = _balances();
        if (x != expectedX || y != expectedY) revert UnexpectedTokenBalance();
        emit ReservesUpdated(x, y);
    }

    function _validateToken(address token) private view {
        if (token == address(0) || token.code.length == 0) revert InvalidToken(token);
        try IERC20Metadata(token).decimals() returns (uint8 scale) {
            if (scale != 18) revert InvalidToken(token);
        } catch { revert InvalidToken(token); }
    }
}
