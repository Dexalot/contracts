// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

/**
 * @title Interface of PortfolioMain
 */

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

interface IPortfolioMain {
    function addToken(
        bytes32 _symbol,
        address _tokenaddress,
        uint32 _srcChainId,
        uint8 _decimals,
        uint256 _fee,
        uint256 _gasSwapRatio,
        bool _isVirtual
    ) external;

    function depositTokenFromContract(address _from, bytes32 _symbol, uint256 _quantity) external;

    function addTrustedContract(address _contract, string calldata _organization) external;

    function isTrustedContract(address _contract) external view returns (bool);

    function removeTrustedContract(address _contract) external;

    function getToken(bytes32 _symbol) external view returns (IERC20Upgradeable);
}
