// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.26;

import "./DexalotTokenOFT.sol";

contract DexalotTokenOFTMinter is DexalotTokenOFT {
    constructor(
        string memory _name,
        string memory _symbol,
        address _lzEndpoint,
        address _delegate,
        address _treasury
    ) DexalotTokenOFT(_name, _symbol, _lzEndpoint, _delegate) {
        // Mint total global supply 1 billion to treasury
        _mint(_treasury, 1_000_000_000 * 10 ** decimals());
    }
}
