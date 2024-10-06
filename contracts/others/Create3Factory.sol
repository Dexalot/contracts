// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import "@openzeppelin/contracts/access/Ownable.sol";
import "solmate/src/utils/CREATE3.sol";

contract Create3Factory is Ownable {
    constructor(address _owner) {
        transferOwnership(_owner);
    }

    function deploy(bytes32 _salt, bytes memory _creationCode) external payable onlyOwner returns (address deployed) {
        bytes32 salt = keccak256(abi.encodePacked(msg.sender, _salt));
        deployed = CREATE3.deploy(salt, _creationCode, msg.value);
    }

    function getDeployedAddress(address _deployer, bytes32 _salt) external view returns (address) {
        bytes32 salt = keccak256(abi.encodePacked(_deployer, _salt));
        return CREATE3.getDeployed(salt);
    }
}
