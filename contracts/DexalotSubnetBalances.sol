// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

/**
 * @title   Balance merkle storage contract to reflect subnet balances
 * @notice  This contract is used to store the merkle root of the balance merkle tree
 * that is constructed from the balances of the subnets. The merkle root is updated
 * regularly by a cron job.
 * @dev     This contract is only used to store the merkle root. The merkle tree is
 * stored in IPFS.
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract DexalotSubnetBalances is Initializable, AccessControlUpgradeable {
    bytes32 public constant WRITER_ROLE = keccak256("WRITER_ROLE");

    struct BalanceTree {
        uint256 timestamp;
        bytes32 root;
        string ipfs;
    }

    // Balance trees for assets.
    mapping(bytes32 => BalanceTree) public balances;

    /**
     * @notice  Initialize the upgradeable contract.
     * @param   _writer  Address of the eoa that is allowed to update the merkle root.
     */
    function initialize(address _writer) public initializer {
        __AccessControl_init();
        // admin account that can call inherited grantRole and revokeRole functions from OpenZeppelin AccessControl
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        // admin account that updates the balances
        _setupRole(WRITER_ROLE, _writer);
    }

    /**
     * @notice  Set the merkle root of the balance merkle tree.
     * @param   _asset  Asset for which the merkle root is set.
     * @param   _root  Merkle root of the balance merkle tree.
     * @param   _ipfsLink  IPFS link to the merkle tree.
     * @param   _timestamp  Timestamp of the construction.
     */
    function setBalances(
        bytes32 _asset,
        bytes32 _root,
        string memory _ipfsLink,
        uint256 _timestamp
    ) public onlyRole(WRITER_ROLE) {
        balances[_asset] = BalanceTree(_timestamp, _root, _ipfsLink);
    }

    /**
     * @notice  Set the merkle roots of the balance merkle trees.
     * @param   _assets  Assets for which the merkle roots are set.
     * @param   _roots  Merkle roots of the balance merkle trees.
     * @param   _ipfsLinks  IPFS links to the merkle trees.
     * @param   _timestamp  Timestamp of the construction.
     */
    function setBatchBalances(
        bytes32[] calldata _assets,
        bytes32[] calldata _roots,
        string[] calldata _ipfsLinks,
        uint256 _timestamp
    ) public onlyRole(WRITER_ROLE) {
        uint256 aLength = _assets.length;
        for (uint256 i = 0; i < aLength; ) {
            balances[_assets[i]] = BalanceTree(_timestamp, _roots[i], _ipfsLinks[i]);
            unchecked {
                i++;
            }
        }
    }
}
