// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@layerzerolabs/oft-evm/contracts/OFTAdapter.sol";

contract AlotOFTAdapter is Ownable, OFTAdapter {
    constructor(address _token, address _lzEndpoint, address _owner) OFTAdapter(_token, _lzEndpoint, _owner) {
        _transferOwnership(_owner);
    }
}
