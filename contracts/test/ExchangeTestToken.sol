// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Local EDR adversarial fixture only; never a deployment-plan asset.
contract ExchangeTestToken is ERC20 {
    bool public rejectTransfer;
    address public callbackTarget;
    bytes public callbackData;
    uint8 private immutable scale;

    constructor(address holder, uint8 decimals_) ERC20("Test only", "TEST") {
        scale = decimals_;
        _mint(holder, 1_000_000 ether);
    }

    function decimals() public view override returns (uint8) { return scale; }
    function setRejectTransfer(bool value) external { rejectTransfer = value; }
    function setCallback(address target, bytes calldata data) external {
        callbackTarget = target;
        callbackData = data;
    }
    function transfer(address to, uint256 amount) public override returns (bool) {
        if (rejectTransfer) return false;
        return super.transfer(to, amount);
    }
    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        bool result = super.transferFrom(from, to, amount);
        if (callbackTarget != address(0)) {
            (bool ok, bytes memory data) = callbackTarget.call(callbackData);
            if (!ok) assembly ("memory-safe") { revert(add(data, 32), mload(data)) }
        }
        return result;
    }
}
