// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Local adversarial fixture only, never a supported deployment asset.
contract AMMTestToken is ERC20 {
    bool public rejectTransfer;
    bool public shortTransfer;
    address public callbackTarget;
    bytes public callbackData;

    constructor(address holder) ERC20("AMM test only", "TEST") { _mint(holder, 1_000_000 ether); }
    function destroyBalance(address account) external { _burn(account, balanceOf(account)); }
    function setRejectTransfer(bool value) external { rejectTransfer = value; }
    function setShortTransfer(bool value) external { shortTransfer = value; }
    function setCallback(address target, bytes calldata data) external { callbackTarget = target; callbackData = data; }
    function transfer(address to, uint256 amount) public override returns (bool) {
        if (rejectTransfer) return false;
        bool result = super.transfer(to, shortTransfer && amount != 0 ? amount - 1 : amount);
        _callback();
        return result;
    }
    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        bool result = super.transferFrom(from, to, shortTransfer && amount != 0 ? amount - 1 : amount);
        _callback();
        return result;
    }
    function _callback() private {
        if (callbackTarget != address(0)) {
            (bool ok, bytes memory data) = callbackTarget.call(callbackData);
            if (!ok) assembly ("memory-safe") { revert(add(data, 32), mload(data)) }
        }
    }
}

/// @dev Constructor validation fixture with no ERC-20 metadata.
contract AMMNonToken {}
