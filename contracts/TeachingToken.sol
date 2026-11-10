// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Fixed-supply teaching asset; no administrative privileges or later minting.
contract TeachingToken is ERC20 {
    /// @param initialHolder Explicit recipient, independent of the deployer.
    /// @param initialSupply Supply in integer base units (18 decimals).
    constructor(
        string memory name_,
        string memory symbol_,
        address initialHolder,
        uint256 initialSupply
    ) ERC20(name_, symbol_) {
        // OpenZeppelin _mint rejects address(0) with ERC20InvalidReceiver.
        _mint(initialHolder, initialSupply);
    }
}
