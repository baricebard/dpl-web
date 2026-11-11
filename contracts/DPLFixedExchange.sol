// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Inventory-backed teaching exchange for three standard 18-decimal assets.
/// @dev Rates and token identities are immutable; no fee, mint, oracle or AMM.
contract DPLFixedExchange is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable dplt;
    address public immutable assetA;
    address public immutable assetB;

    error InvalidToken(address token);
    error DuplicateToken();
    error UnsupportedToken(address token);
    error SameToken();
    error InvalidAmount();
    error ZeroOutput();
    error InsufficientReserve(address token, uint256 available, uint256 required);
    error AmountExceedsLimit(address token, uint256 amount);
    error InsufficientOutputAmount(uint256 amountOut, uint256 minAmountOut);
    error InvalidRecipient();

    event Swap(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);
    event ReserveWithdrawn(address indexed token, address indexed recipient, uint256 amount);

    constructor(address dplt_, address assetA_, address assetB_, address administrator) Ownable(administrator) {
        if (dplt_ == assetA_ || dplt_ == assetB_ || assetA_ == assetB_) revert DuplicateToken();
        _validateToken(dplt_);
        _validateToken(assetA_);
        _validateToken(assetB_);
        dplt = dplt_;
        assetA = assetA_;
        assetB = assetB_;
    }

    /// @notice Exact base-unit output, rounded down; includes the per-swap input limit.
    /// @dev A quote does not guarantee reserve availability or an unpaused exchange.
    function quote(address tokenIn, address tokenOut, uint256 amountIn) public view returns (uint256 amountOut) {
        _requireSupported(tokenIn);
        _requireSupported(tokenOut);
        if (tokenIn == tokenOut) revert SameToken();
        if (amountIn == 0) revert InvalidAmount();
        // B * 9 <= 600e18, compared via floor division to avoid overflow and
        // reject even one base unit above the exact rational boundary.
        uint256 maxInput = tokenIn == dplt ? 10 ether : tokenIn == assetA ? 300 ether : uint256(600 ether) / 9;
        if (amountIn > maxInput) revert AmountExceedsLimit(tokenIn, amountIn);
        // The input cap also bounds every multiplication well below uint256 max.
        if (tokenIn == dplt) amountOut = tokenOut == assetA ? amountIn * 30 : amountIn * 20 / 3;
        else if (tokenIn == assetA) amountOut = tokenOut == dplt ? amountIn / 30 : amountIn * 2 / 9;
        else amountOut = tokenOut == assetA ? amountIn * 9 / 2 : amountIn * 3 / 20;
        if (amountOut == 0) revert ZeroOutput();
    }

    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut) external whenNotPaused nonReentrant returns (uint256 amountOut) {
        amountOut = quote(tokenIn, tokenOut, amountIn);
        if (amountOut < minAmountOut) revert InsufficientOutputAmount(amountOut, minAmountOut);
        _requireReserve(tokenOut, amountOut);
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);
        emit Swap(msg.sender, tokenIn, tokenOut, amountIn, amountOut);
    }

    function reserveOf(address token) public view returns (uint256) {
        _requireSupported(token);
        return IERC20(token).balanceOf(address(this));
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /// @notice Withdraws only exchange-owned reserves, including while paused.
    function withdrawReserve(address token, uint256 amount, address recipient) external onlyOwner nonReentrant {
        _requireSupported(token);
        if (recipient == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();
        _requireReserve(token, amount);
        IERC20(token).safeTransfer(recipient, amount);
        emit ReserveWithdrawn(token, recipient, amount);
    }

    function _requireSupported(address token) private view {
        if (token != dplt && token != assetA && token != assetB) revert UnsupportedToken(token);
    }

    function _requireReserve(address token, uint256 amount) private view {
        uint256 available = IERC20(token).balanceOf(address(this));
        if (available < amount) revert InsufficientReserve(token, available, amount);
    }

    function _validateToken(address token) private view {
        if (token == address(0) || token.code.length == 0) revert InvalidToken(token);
        // Reject accidental non-ERC20 and differently scaled contracts early.
        // This is a sanity check, not certification of arbitrary token behavior.
        try IERC20Metadata(token).decimals() returns (uint8 decimals_) {
            if (decimals_ != 18) revert InvalidToken(token);
        } catch { revert InvalidToken(token); }
    }
}
