// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.30;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";

import "../library/TokenLibrary.sol";
import "../interfaces/IOmniVault.sol";
import "../interfaces/IOmniVaultCreator.sol";

/**
 * @title OmniVaultCreator
 * @notice This contract facilitates the creation of OmniVaults by allowing users to
 *         request vault creation, deposit required tokens and fees, and manage the
 *         lifecycle of vault creation requests. Deployment of contracts is handled
 *         off-chain by Dexalot admins upon acceptance of requests.
 */
contract OmniVaultCreator is IOmniVaultCreator, Initializable, AccessControlUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    bytes32 public constant VERSION = bytes32("1.0.1");
    string public constant RISK_DISCLOSURE =
        "I acknowledge that I have read and understood the risks associated with creating and funding this vault.";

    // Delay period after which a proposer can reclaim their funds if not created
    uint256 public reclaimDelay;
    // Fee amount required for vault creation
    uint256 public feeAmount;
    // Token used to pay the vault creation fee
    address public feeToken;
    // Total collected fees available for withdrawal by admin
    uint256 public collectedFees;
    // Mapping from request ID to new vault request
    mapping(bytes32 => VaultRequest) public vaultRequests;
    // Mapping from vault proposer to whether they have acknowledged the risk disclosure
    mapping(address => bool) public hasAcknowledgedRisk;

    /**
     * @notice Initializes the contract.
     * @param _admin The address for the DEFAULT_ADMIN_ROLE.
     */
    function initialize(address _admin) public initializer {
        require(_admin != address(0), "VC-SAZ-01");
        __AccessControl_init();
        __ReentrancyGuard_init();

        _setupRole(DEFAULT_ADMIN_ROLE, _admin);
        reclaimDelay = 7 days;
        feeAmount = 100 * 1e6;
    }

    /**
     * @notice Requests the creation of a new pair vault, deposits base + quote tokens into escrow
     *         as well as the required fee.
     * @dev Funds are taken from the chain and addresses at index 0 in the arrays.
     * @param baseTokens The array of base token addresses for each chain.
     * @param quoteTokens The array of quote token addresses for each chain.
     * @param chainIds The array of chain IDs for the vault.
     * @param baseAmount The amount of base token to deposit for the vault.
     * @param quoteAmount The amount of quote token to deposit for the vault.
     * @return requestId The ID of the vault creation request.
     */
    function openPairVault(
        address[] calldata baseTokens,
        address[] calldata quoteTokens,
        uint32[] calldata chainIds,
        uint208 baseAmount,
        uint208 quoteAmount
    ) external payable nonReentrant returns (bytes32 requestId) {
        require(baseTokens.length == quoteTokens.length && chainIds.length == baseTokens.length, "VC-IVAL-01");
        require(chainIds[0] == block.chainid, "VC-IVCI-01");
        address[] memory _tokens = new address[](2);
        uint208[] memory _amounts = new uint208[](2);
        _tokens[0] = baseTokens[0];
        _tokens[1] = quoteTokens[0];
        _amounts[0] = baseAmount;
        _amounts[1] = quoteAmount;
        requestId = _requestVaultCreation(_tokens, _amounts);

        emit PairVault(requestId, baseTokens, quoteTokens, chainIds);
    }

    /**
     * @notice Allows the proposer to reclaim their deposited funds if the vault
     *         request is still pending after the reclaim delay or has been rejected.
     * @param _requestId The ID of the vault creation request to reclaim.
     */
    function reclaimRequest(bytes32 _requestId) external nonReentrant {
        VaultRequest memory request = vaultRequests[_requestId];
        address proposer = request.proposer;

        require(proposer == msg.sender, "VC-SNEP-01");
        require(
            (request.status == VaultRequestStatus.PENDING && block.timestamp > request.timestamp + reclaimDelay) ||
                request.status == VaultRequestStatus.REJECTED,
            "VC-IVRS-01"
        );

        uint256 len = request.tokens.length;
        for (uint256 i = 0; i < len; i++) {
            address _token = request.tokens[i];
            uint256 _amount = uint256(request.amounts[i]);
            TokenLibrary.sendToken(_token, proposer, _amount);
        }

        if (request.feeCollected > 0) {
            collectedFees -= request.feeCollected;
            TokenLibrary.sendToken(feeToken, proposer, request.feeCollected);
        }

        delete vaultRequests[_requestId];

        emit VaultCreationUpdate(_requestId, VaultRequestStatus.RECLAIMED);
    }

    /**
     * @notice Accepts a vault creation request, transfers the deposited funds to the
     *         new vault's OmniTrader, and mints the initial shares to the proposer.
     * @param _requestId The ID of the vault creation request to accept.
     * @param _omniVaultAddress The address of the newly created OmniVault contract.
     */
    function acceptAndFundVault(
        bytes32 _requestId,
        address _omniVaultAddress
    ) external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_omniVaultAddress != address(0), "VC-SAZ-01");
        VaultRequest memory request = vaultRequests[_requestId];
        require(request.proposer != address(0), "VC-SNEP-01");
        require(request.status == VaultRequestStatus.PENDING, "VC-IVRS-01");
        uint256 len = request.tokens.length;

        address _omniTraderAddress = IOmniVault(_omniVaultAddress).omniVaultExecutor();

        for (uint256 i = 0; i < len; i++) {
            address _token = request.tokens[i];
            uint256 _amount = uint256(request.amounts[i]);
            TokenLibrary.sendToken(_token, _omniTraderAddress, _amount);
        }

        collectedFees += request.feeCollected;

        delete vaultRequests[_requestId];

        emit VaultCreationUpdate(_requestId, VaultRequestStatus.ACCEPTED);
    }

    /**
     * @notice Acknowledges the risk disclosure for vault creation.
     * @param signature The signature of the risk disclosure message.
     */
    function acknowledgeRiskDisclosure(bytes calldata signature) external {
        require(!hasAcknowledgedRisk[msg.sender], "VC-RDAA-01");

        _verifyRiskDisclosure(signature);

        hasAcknowledgedRisk[msg.sender] = true;
        emit RiskAcknowledged(msg.sender);
    }

    /**
     * @notice Rejects a vault creation request.
     * @param _requestId The ID of the vault creation request to reject.
     */
    function rejectVaultRequest(bytes32 _requestId) external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        VaultRequest storage request = vaultRequests[_requestId];
        require(request.status == VaultRequestStatus.PENDING, "VC-IVRS-01");

        request.status = VaultRequestStatus.REJECTED;

        emit VaultCreationUpdate(_requestId, VaultRequestStatus.REJECTED);
    }

    /**
     * @notice Sets the token used to pay the vault creation fee.
     * @param _feeToken The address of the new fee token.
     */
    function setFeeToken(address _feeToken) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_feeToken != address(0), "VC-SAZ-01");
        address oldFeeToken = feeToken;
        feeToken = _feeToken;

        emit FeeTokenUpdated(_feeToken, oldFeeToken);
    }

    /**
     * @notice Sets the fee amount required for vault creation.
     * @param _feeAmount The new fee amount.
     */
    function setFeeAmount(uint64 _feeAmount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint64 oldFeeAmount = uint64(feeAmount);
        feeAmount = _feeAmount;

        emit FeeUpdated(_feeAmount, oldFeeAmount);
    }

    /**
     * @notice Sets the reclaim delay period.
     * @param _newDelay The new reclaim delay in seconds.
     */
    function setReclaimDelay(uint256 _newDelay) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 oldDelay = reclaimDelay;
        reclaimDelay = _newDelay;
        emit ReclaimDelayUpdated(_newDelay, oldDelay);
    }

    /**
     * @notice Withdraws the collected fees to the admin.
     */
    function withdrawCollectedFees() external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 amount = collectedFees;
        collectedFees = 0;
        TokenLibrary.sendToken(feeToken, msg.sender, amount);
    }

    /**
     * @notice Internal function to handle vault creation requests.
     * @param _tokens The array of token addresses to deposit.
     * @param _amounts The array of token amounts to deposit.
     * @return requestId The ID of the vault creation request.
     */
    function _requestVaultCreation(
        address[] memory _tokens,
        uint208[] memory _amounts
    ) internal returns (bytes32 requestId) {
        uint256 len = _tokens.length;
        require(len == _amounts.length, "VC-IVAL-01");
        require(hasAcknowledgedRisk[msg.sender], "VC-RDNS-01");

        uint256 feeAmt = feeAmount;
        address feeTokenAddress;
        if (feeAmt > 0) {
            feeTokenAddress = feeToken;
            TokenLibrary.receiveToken(feeTokenAddress, msg.sender, feeAmt);
        }

        for (uint256 i = 0; i < len; i++) {
            address _token = _tokens[i];
            uint256 _amount = uint256(_amounts[i]);

            TokenLibrary.receiveToken(_token, msg.sender, _amount);
        }

        requestId = keccak256(abi.encodePacked(msg.sender, block.chainid, block.timestamp));

        vaultRequests[requestId] = VaultRequest({
            proposer: msg.sender,
            status: VaultRequestStatus.PENDING,
            tokens: _tokens,
            amounts: _amounts,
            timestamp: uint32(block.timestamp),
            feeCollected: uint64(feeAmt)
        });

        emit VaultCreationRequest(
            requestId,
            msg.sender,
            VaultRequestStatus.PENDING,
            feeTokenAddress,
            feeAmt,
            _tokens,
            _amounts
        );
        return requestId;
    }

    /**
     * @notice Internal function to verify the risk disclosure signature.
     * @param signature The signature provided by the proposer.
     */
    function _verifyRiskDisclosure(bytes memory signature) internal view {
        bytes32 ethSignedHash = ECDSAUpgradeable.toEthSignedMessageHash(bytes(RISK_DISCLOSURE));
        address signer = ECDSAUpgradeable.recover(ethSignedHash, signature);

        require(signer == msg.sender, "VC-IRDS-01");
    }
}
