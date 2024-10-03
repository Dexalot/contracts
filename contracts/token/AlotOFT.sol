// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@layerzerolabs/oft-evm/contracts/OFT.sol";

contract AlotOFT is Ownable, OFT {
    constructor(
        string memory _name,
        string memory _symbol,
        address _lzEndpoint,
        address _delegate
    ) OFT(_name, _symbol, _lzEndpoint, _delegate) {
        _transferOwnership(_delegate);
    }
}
