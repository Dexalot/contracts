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
     * @param   writer  Address of the eoa that is allowed to update the merkle root.
     */
    function initialize(address writer) public initializer {
        __AccessControl_init();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(WRITER_ROLE, writer);
    }

    /**
     * @notice  Set the merkle root of the balance merkle tree.
     * @param   asset  Asset for which the merkle root is set.
     * @param   root  Merkle root of the balance merkle tree.
     * @param   ipfsLink  IPFS link to the merkle tree.
     * @param   timestamp  Timestamp of the construction.
     */
    function setBalances(
        bytes32 asset,
        bytes32 root,
        string memory ipfsLink,
        uint256 timestamp
    ) public onlyRole(WRITER_ROLE) {
        balances[asset] = BalanceTree(timestamp, root, ipfsLink);
    }

    /**
     * @notice  Set the merkle roots of the balance merkle trees.
     * @param   assets  Assets for which the merkle roots are set.
     * @param   roots  Merkle roots of the balance merkle trees.
     * @param   ipfsLinks  IPFS links to the merkle trees.
     * @param   timestamp  Timestamp of the construction.
     */
    function setBatchBalances(
        bytes32[] calldata assets,
        bytes32[] calldata roots,
        string[] calldata ipfsLinks,
        uint256 timestamp
    ) public onlyRole(WRITER_ROLE) {
        uint256 aLength = assets.length;
        for (uint256 i = 0; i < aLength; ) {
            balances[assets[i]] = BalanceTree(timestamp, roots[i], ipfsLinks[i]);
            unchecked {
                i++;
            }
        }
    }
}
