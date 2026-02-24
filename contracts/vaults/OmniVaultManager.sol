// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.30;

import "@openzeppelin-upgradeable-v5/access/AccessControlUpgradeable.sol";
import "@openzeppelin-upgradeable-v5/utils/PausableUpgradeable.sol";
import "@openzeppelin-v5/utils/ReentrancyGuardTransient.sol";
import "@openzeppelin-v5/utils/structs/EnumerableSet.sol";
import "@openzeppelin-v5/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin-v5/token/ERC20/IERC20.sol";

import "../interfaces/IOmniVaultShare.sol";
import "../interfaces/IOmniVaultExecutorSub.sol";
import "../interfaces/IOmniVaultManager.sol";
import "../interfaces/IPortfolioSub.sol";
import "../interfaces/IPortfolio.sol";

/**
 * @title OmniVaultManager
 * @notice The OmniVaultManager contract manages multiple OmniVaults, allowing users to request deposits and withdrawals
 *         of various tokens. It handles the registration of new vaults, processes deposit and withdrawal requests in batches,
 *         and maintains the state of each vault. The contract also supports pausing and unpausing operations for security and maintenance.
 *         It interacts with the PortfolioSub contract for token transfers and with OmniVaultExecutor contracts for executing
 *         asset dispatches.
 */
contract OmniVaultManager is
    IOmniVaultManager,
    Initializable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardTransient
{
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    bytes32 public constant VERSION = bytes32("1.1.0");
    uint256 public constant RECLAIM_DELAY = 24 hours;
    bytes32 public constant SETTLER_ROLE = keccak256("SETTLER_ROLE");
    uint256 public constant MAX_PENDING_REQUESTS = 500;
    uint256 public constant MAX_VAULT_PENDING_REQUESTS = 50;
    uint256 public constant MAX_USER_PENDING_REQUESTS = 5;
    uint256 public constant MIN_SHARE_MINT = 1000e18; // Minimum shares to mint on first deposit to prevent dust issues

    uint256 public vaultIndex;
    mapping(uint256 => VaultDetails) public vaultDetails;

    // Connected Contracts
    IPortfolioSub public portfolio;

    // bytes32 array of all ERC20 tokens traded on DEXALOT
    EnumerableSet.Bytes32Set internal tokenList;
    uint16 public tokenIndex;
    mapping(uint16 => AssetInfo) public assetInfo;

    // No. transfer requests made per user (max 2^80)
    mapping(address => uint80) public userNonce;
    // Pending/claimable transfer requests
    mapping(bytes32 => TransferRequest) public transferRequests;

    bytes32 public rollingDepositHash;
    bytes32 public rollingWithdrawalHash;
    uint256 public currentBatchId;
    uint256 public batchStartTime;
    uint256 public pendingRequestCount;

    mapping(uint256 => BatchState) public completedBatches;
    mapping(uint256 => RequestLimit) public vaultRequestLimits;
    mapping(address => RequestLimit) public userRequestLimits;

    // Emitted on deposit/withdrawal requests
    event TransferRequestUpdate(
        bytes32 indexed requestId,
        uint256 indexed batchId,
        address indexed user,
        RequestStatus status,
        uint16[] tokenIds,
        uint256[] amounts
    );

    event TransferBatchUpdate(
        uint256 indexed batchId,
        bool success,
        DepositFufillment[] deposits,
        WithdrawalFufillment[] withdrawals
    );

    /**
     * @notice Initializer for the OmniVaultManager contract
     * @param _admin The admin address with DEFAULT_ADMIN_ROLE
     */
    function initialize(address _admin, address _settler) public initializer {
        require(_admin != address(0), "VM-SAZ-01");

        __AccessControl_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(SETTLER_ROLE, _settler);
        batchStartTime = block.timestamp;
    }

    /**
     * @notice Bulk settle deposit and withdrawal requests
     */
    function bulkSettleState(
        uint256[] calldata _prices,
        VaultState[] calldata _vaults,
        DepositFufillment[] calldata _deposits,
        WithdrawalFufillment[] calldata _withdrawals
    ) external nonReentrant whenNotPaused onlyRole(SETTLER_ROLE) {
        uint256 prevBatchId = currentBatchId - 1;
        BatchState storage batch = completedBatches[prevBatchId];
        require(batch.status == BatchStatus.FINALIZED, "VM-BSST-01");
        require(keccak256(abi.encode(_prices, _vaults)) == batch.stateHash, "VM-BSST-02");
        _loadStateToTransient(_prices, _vaults);
        _bulkSettleDeposits(_deposits, batch.depositHash);
        _bulkSettleWithdrawals(_withdrawals, batch.withdrawalHash);
        batch.status = BatchStatus.SETTLED;
        emit TransferBatchUpdate(prevBatchId, true, _deposits, _withdrawals);
    }

    function finalizeBatch(uint256[] calldata _prices, VaultState[] calldata _vaults) external onlyRole(SETTLER_ROLE) {
        uint256 batchId = currentBatchId;
        BatchState storage batch = completedBatches[batchId];
        require(batch.status == BatchStatus.NONE, "VM-BSST-01");
        require(batchId == 0 || completedBatches[batchId - 1].status == BatchStatus.SETTLED, "VM-PBF-01");

        // index in price array corresponds to tokenId, set to 0 if not used in batch
        require(_prices.length == tokenIndex, "VM-IVAL-01");

        // Locks the prices + vault balances at finalization time for settlement verification,
        // ensures the batch cannot be manipulated after finalization
        batch.stateHash = keccak256(abi.encode(_prices, _vaults));

        batch.finalizedAt = uint32(block.timestamp);
        batch.status = BatchStatus.FINALIZED;
        batch.withdrawalHash = rollingWithdrawalHash;
        batch.depositHash = rollingDepositHash;

        _resetBatch();

        // TODO: add event for finalisation
    }

    /**
     * @notice Request a deposit for one to multiple tokens
     * @param _tokens The token IDs to deposit
     * @param _amounts The amounts to deposit
     * @return requestId The generated deposit request ID
     */
    function requestDeposit(
        uint256 _vaultId,
        uint16[] calldata _tokens,
        uint256[] calldata _amounts
    ) external nonReentrant whenNotPaused returns (bytes32 requestId) {
        address executor = vaultDetails[_vaultId].executor;
        VaultStatus status = vaultDetails[_vaultId].status;
        require(status == VaultStatus.ACTIVE, "VM-VSAC-01");
        require(pendingRequestCount < MAX_PENDING_REQUESTS, "VM-PRCL-01");
        _verifyAndIncrementRequestLimits(msg.sender, _vaultId);
        _depositTokens(_tokens, _amounts, vaultDetails[_vaultId].tokens, executor);

        requestId = _generateRequestId(_vaultId, msg.sender, userNonce[msg.sender]++);
        pendingRequestCount++;

        transferRequests[requestId] = TransferRequest({
            status: RequestStatus.DEPOSIT_REQUESTED,
            timestamp: uint32(block.timestamp),
            shares: uint208(0)
        });
        rollingDepositHash = keccak256(abi.encode(rollingDepositHash, requestId, _tokens, _amounts));
        emit TransferRequestUpdate(
            requestId,
            currentBatchId,
            msg.sender,
            RequestStatus.DEPOSIT_REQUESTED,
            _tokens,
            _amounts
        );
    }

    /**
     * @notice Request a withdrawal for a given vault shares
     * @param _vaultId The ID of the vault
     * @param _shares The vault shares to withdraw
     * @return requestId The generated withdrawal request ID
     */
    function requestWithdrawal(
        uint256 _vaultId,
        uint208 _shares
    ) external nonReentrant whenNotPaused returns (bytes32 requestId) {
        require(_shares > 0, "VM-ZEVS-01");
        address shareTokenAddress = vaultDetails[_vaultId].shareToken;
        VaultStatus status = vaultDetails[_vaultId].status;
        require(status == VaultStatus.ACTIVE || status == VaultStatus.PAUSED, "VM-VSAP-01");
        require(pendingRequestCount < MAX_PENDING_REQUESTS, "VM-PRCL-01");
        _verifyAndIncrementRequestLimits(msg.sender, _vaultId);

        IERC20(shareTokenAddress).safeTransferFrom(msg.sender, address(this), uint256(_shares));

        requestId = _generateRequestId(_vaultId, msg.sender, userNonce[msg.sender]++);
        pendingRequestCount++;
        transferRequests[requestId] = TransferRequest({
            status: RequestStatus.WITHDRAWAL_REQUESTED,
            timestamp: uint32(block.timestamp),
            shares: _shares
        });
        rollingWithdrawalHash = keccak256(abi.encode(rollingWithdrawalHash, requestId, _shares));

        uint16[] memory symbolsArray = new uint16[](0);
        uint256[] memory sharesArray = new uint256[](1);
        sharesArray[0] = uint256(_shares);

        emit TransferRequestUpdate(
            requestId,
            currentBatchId,
            msg.sender,
            RequestStatus.WITHDRAWAL_REQUESTED,
            symbolsArray,
            sharesArray
        );
    }

    /**
     * @notice Unwind a batch of unsettled deposit and withdrawal requests after the reclaim delay
     * @param _deposits The deposit fulfillments to unwind
     * @param _withdrawals The withdrawal fulfillments to unwind
     */
    function unwindBatch(
        DepositFufillment[] calldata _deposits,
        WithdrawalFufillment[] calldata _withdrawals
    ) external nonReentrant {
        require(block.timestamp >= batchStartTime + RECLAIM_DELAY, "VM-RCNP-01");

        bytes32 depositHash = 0;

        for (uint256 i = 0; i < _deposits.length; i++) {
            DepositFufillment calldata item = _deposits[i];
            depositHash = keccak256(abi.encode(depositHash, item.depositRequestId, item.tokenIds, item.amounts));
            require(transferRequests[item.depositRequestId].status == RequestStatus.DEPOSIT_REQUESTED, "VM-ADRP-01");
            delete transferRequests[item.depositRequestId]; // Clear state
            _refundDeposit(item.depositRequestId, item.tokenIds, item.amounts);
        }
        require(depositHash == rollingDepositHash, "VM-DHMR-01");

        bytes32 withdrawalHash = 0;

        for (uint256 i = 0; i < _withdrawals.length; i++) {
            WithdrawalFufillment calldata item = _withdrawals[i];
            TransferRequest memory wRequest = transferRequests[item.withdrawalRequestId];
            withdrawalHash = keccak256(abi.encode(withdrawalHash, item.withdrawalRequestId, wRequest.shares));
            require(
                transferRequests[item.withdrawalRequestId].status == RequestStatus.WITHDRAWAL_REQUESTED,
                "VM-AWRP-01"
            );
            uint256 shares = uint256(wRequest.shares);
            delete transferRequests[item.withdrawalRequestId]; // Clear state

            (uint16 vaultId, address user, ) = _decodeRequestId(item.withdrawalRequestId);
            IERC20(vaultDetails[vaultId].shareToken).safeTransfer(user, shares);
        }

        require(withdrawalHash == rollingWithdrawalHash, "VM-WHMR-01");

        emit TransferBatchUpdate(currentBatchId, false, _deposits, _withdrawals);
        _resetBatch();
    }

    /**
     * @notice Registers a new vault with initial deposit
     * @dev Deposit transfer occurs directly to executor contract on mainnet.
     * Tokens + amounts are only required for correct TransferRequest event emission.
     * @param _vaultId The unique ID of the vault
     * @param _vaultDetails The details of the vault
     * @param _tokens The list of token IDs being deposited
     * @param _amounts The list of token amounts being deposited
     * @param _shares The amount of vault shares to mint for the proposer
     */
    function registerVault(
        uint16 _vaultId,
        VaultDetails calldata _vaultDetails,
        uint16[] calldata _tokens,
        uint256[] calldata _amounts,
        uint208 _shares
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_vaultId == vaultIndex, "VM-RNVI-01");
        // To prevent inflation attack
        require(_shares > MIN_SHARE_MINT, "VM-ZEVS-01");
        vaultIndex++;

        vaultDetails[_vaultId] = _vaultDetails;
        IOmniVaultShare(_vaultDetails.shareToken).mint(_vaultId, _vaultDetails.proposer, _shares);
        emit TransferRequestUpdate(
            bytes32(0),
            0,
            _vaultDetails.proposer,
            RequestStatus.DEPOSIT_REQUESTED,
            _tokens,
            _amounts
        );
        uint256[] memory sharesArray = new uint256[](1);
        sharesArray[0] = uint256(_shares);
        emit TransferRequestUpdate(
            bytes32(0),
            0,
            _vaultDetails.proposer,
            RequestStatus.DEPOSIT_SUCCESS,
            new uint16[](0),
            sharesArray
        );
    }

    /**
     * @notice Pause a vault, disabling deposits
     * @param _vaultId The ID of the vault to pause
     */
    function pauseVault(uint256 _vaultId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        VaultDetails storage vaultDetail = vaultDetails[_vaultId];
        require(vaultDetail.status == VaultStatus.ACTIVE, "VM-VINA-01");
        vaultDetail.status = VaultStatus.PAUSED;
    }

    /**
     * @notice Unpause a vault, enabling deposits
     * @param _vaultId The ID of the vault to unpause
     */
    function unpauseVault(uint256 _vaultId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        VaultDetails storage vaultDetail = vaultDetails[_vaultId];
        require(vaultDetail.status == VaultStatus.PAUSED, "VM-VINP-01");
        vaultDetail.status = VaultStatus.ACTIVE;
    }

    /**
     * @notice Update details for an existing vault
     * @param _vaultId The ID of the vault to update
     * @param _vaultDetails The updated vault details
     */
    function updateVaultDetails(
        uint256 _vaultId,
        VaultDetails calldata _vaultDetails
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        VaultDetails storage vaultDetail = vaultDetails[_vaultId];
        require(vaultDetail.status == VaultStatus.PAUSED, "VM-VINP-01");
        if (_vaultDetails.shareToken != vaultDetail.shareToken || _vaultDetails.executor != vaultDetail.executor) {
            require(rollingDepositHash == 0 && rollingWithdrawalHash == 0, "VM-PTNU-01");
        }
        vaultDetails[_vaultId] = _vaultDetails;
    }

    /**
     * @notice Add details for a new supported token
     * @param _asset The AssetInfo struct containing the token details
     */
    function addTokenDetails(AssetInfo calldata _asset) external onlyRole(DEFAULT_ADMIN_ROLE) {
        IPortfolio.TokenDetails memory tokenDetails = IPortfolio(address(portfolio)).getTokenDetails(_asset.symbol);
        require(_asset.symbol != bytes32(0) && tokenDetails.symbol == _asset.symbol, "VM-TSIP-01");
        require(!tokenList.contains(_asset.symbol), "VM-TSNM-01");
        assetInfo[tokenIndex++] = _asset;
        tokenList.add(_asset.symbol);
    }

    /**
     * @notice Update details for an existing supported token
     * @dev The token address cannot be changed
     * @param _tokenId The ID of the token to update
     * @param _asset The AssetInfo struct containing the updated token details
     */
    function updateTokenDetails(uint16 _tokenId, AssetInfo calldata _asset) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(tokenList.contains(_asset.symbol), "VM-TSIM-01");
        AssetInfo memory existing = assetInfo[_tokenId];
        require(existing.symbol == _asset.symbol, "VM-TSIM-02");
        assetInfo[_tokenId] = _asset;
    }

    /**
     * @notice Pause the contract, disabling deposits and withdrawals
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause the contract, enabling deposits and withdrawals
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @notice Set the PortfolioSub contract address
     * @param _portfolio The new PortfolioSub contract address
     */
    function setPortfolio(address _portfolio) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_portfolio != address(0), "VM-SAZ-01");
        portfolio = IPortfolioSub(_portfolio);
    }

    /**
     * @notice Withdraw ALOT from OmniVaultManager gas tank to owner
     * @param amount The amount of ALOT to withdraw to owner
     */
    function withdrawGas(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(address(this).balance >= amount, "VM-AGCB-01");
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "VM-WTFR-01");
    }

    /**
     * @notice Receive native ALOT, ensures auto gas tank fill logic holds
     */
    receive() external payable {}

    /**
     * @notice Get details of a specific vault
     * @param _vaultId The ID of the vault
     * @return The VaultDetails struct containing the vault's details
     */
    function getVaultDetails(uint256 _vaultId) external view returns (VaultDetails memory) {
        return vaultDetails[_vaultId];
    }

    /**
     * @notice Get details of a specific transfer request
     * @param _requestId The ID of the transfer request
     * @return The TransferRequest struct containing the request's details
     */
    function getTransferRequest(bytes32 _requestId) external view returns (TransferRequest memory) {
        return transferRequests[_requestId];
    }

    function _verifyAndIncrementRequestLimits(address _user, uint256 _vaultId) internal {
        uint248 batchId = uint248(currentBatchId);
        RequestLimit storage vaultLimit = vaultRequestLimits[_vaultId];

        if (vaultLimit.lastBatchId < batchId) {
            vaultLimit.lastBatchId = batchId;
            vaultLimit.pendingCount = 1;
        } else {
            require(vaultLimit.pendingCount < MAX_VAULT_PENDING_REQUESTS, "VM-VPRL-01");
            vaultLimit.pendingCount++;
        }

        RequestLimit storage userLimit = userRequestLimits[_user];

        if (userLimit.lastBatchId < batchId) {
            userLimit.lastBatchId = batchId;
            userLimit.pendingCount = 1;
        } else {
            require(userLimit.pendingCount < MAX_USER_PENDING_REQUESTS, "VM-UPRL-01");
            userLimit.pendingCount++;
        }
    }

    /**
     * @notice Internal function to bulk settle deposit requests
     * @dev Mints vault shares to users and unlocks tokens in the vault
     */
    function _bulkSettleDeposits(DepositFufillment[] calldata _deposits, bytes32 _rollingDepositHash) internal {
        uint256 len = _deposits.length;
        bytes32 depositHash = bytes32(0);
        for (uint256 i = 0; i < len; i++) {
            bytes32 requestId = _deposits[i].depositRequestId;
            (uint16 vaultId, address user, ) = _decodeRequestId(requestId);
            depositHash = keccak256(abi.encode(depositHash, requestId, _deposits[i].tokenIds, _deposits[i].amounts));

            TransferRequest memory dRequest = transferRequests[requestId];
            require(dRequest.status == RequestStatus.DEPOSIT_REQUESTED, "VM-ADRP-01");
            delete transferRequests[requestId];

            if (!_deposits[i].process) {
                _refundDeposit(requestId, _deposits[i].tokenIds, _deposits[i].amounts);
                continue;
            }

            uint256 userDepositUsd = 0;
            for (uint256 j = 0; j < _deposits[i].tokenIds.length; j++) {
                userDepositUsd += (_deposits[i].amounts[j] * _tloadPrice(_deposits[i].tokenIds[j])) / 1e18;
            }

            uint256 totalShares = _tloadVaultTotalShares(vaultId);
            uint256 sharesToMint = (userDepositUsd * totalShares) / _tloadVaultUSD(vaultId);

            if (totalShares == 0) {
                sharesToMint = userDepositUsd;
            }

            IOmniVaultShare(_tloadShareToken(vaultId)).mint(vaultId, user, sharesToMint);
        }
        require(depositHash == _rollingDepositHash, "VM-DHMR-01");
    }

    /**
     * @notice Internal function to refund a deposit request
     * @param requestId The ID of the deposit request
     * @param tokenIds The token IDs to refund
     * @param amounts The amounts to refund
     */
    function _refundDeposit(bytes32 requestId, uint16[] calldata tokenIds, uint256[] calldata amounts) internal {
        uint256 len = tokenIds.length;
        (uint16 vaultId, address user, ) = _decodeRequestId(requestId);
        require(len == amounts.length, "VM-IVAL-01");
        address executor = vaultDetails[vaultId].executor;

        bytes32[] memory symbols = new bytes32[](len);
        for (uint256 i = 0; i < len; i++) {
            symbols[i] = assetInfo[tokenIds[i]].symbol;
        }
        IOmniVaultExecutorSub(executor).dispatchAssets(user, symbols, amounts);
        emit TransferRequestUpdate(requestId, currentBatchId, user, RequestStatus.DEPOSIT_FAILED, tokenIds, amounts);
    }

    /**
     * @notice Internal function to bulk settle withdrawal requests
     * @dev Burns vault shares from users and dispatches tokens to them
     * @param _withdrawals The array of withdrawal fulfillments
     */
    function _bulkSettleWithdrawals(
        WithdrawalFufillment[] calldata _withdrawals,
        bytes32 _rollingWithdrawalHash
    ) internal {
        bytes32 withdrawalHash = bytes32(0);
        uint256 len = _withdrawals.length;
        for (uint256 i = 0; i < len; i++) {
            WithdrawalFufillment calldata item = _withdrawals[i];
            TransferRequest memory wRequest = transferRequests[item.withdrawalRequestId];
            require(wRequest.status == RequestStatus.WITHDRAWAL_REQUESTED, "VM-AWRP-01");

            uint256 vaultShares = uint256(wRequest.shares);
            (uint16 vaultId, address user, ) = _decodeRequestId(item.withdrawalRequestId);
            withdrawalHash = keccak256(abi.encode(withdrawalHash, item.withdrawalRequestId, vaultShares));
            delete transferRequests[item.withdrawalRequestId];

            IOmniVaultShare shareToken = IOmniVaultShare(_tloadShareToken(vaultId));

            if (!item.process) {
                IERC20(address(shareToken)).safeTransfer(user, vaultShares);
                continue;
            }
            uint16[] memory tokenIds = _tloadVaultTokenIds(vaultId);
            bytes32[] memory symbols = new bytes32[](tokenIds.length);
            uint256[] memory amounts = new uint256[](tokenIds.length);
            for (uint256 j = 0; j < tokenIds.length; j++) {
                uint16 tid = tokenIds[j];
                symbols[j] = assetInfo[tid].symbol;
                amounts[j] = (vaultShares * _tloadBalance(vaultId, tid)) / _tloadVaultTotalShares(vaultId);
            }

            shareToken.burn(vaultId, vaultShares);
            IOmniVaultExecutorSub(_tloadVaultExecutor(vaultId)).dispatchAssets(user, symbols, amounts);
        }
        require(withdrawalHash == _rollingWithdrawalHash, "VM-WHMR-01");
    }

    /**
     * @notice Internal function to reset the batch state
     */
    function _resetBatch() internal {
        rollingDepositHash = 0;
        rollingWithdrawalHash = 0;
        pendingRequestCount = 0;
        batchStartTime = block.timestamp;
        currentBatchId++;
    }

    /**
     * @notice Internal function to deposit tokens into the vault
     * @param _tokenIds The token IDs to deposit
     * @param _amounts The amounts to deposit
     * @param _vaultTokens The list of token IDs supported by the vault
     * @param _executor The executor address to transfer tokens to
     */
    function _depositTokens(
        uint16[] calldata _tokenIds,
        uint256[] calldata _amounts,
        uint16[] memory _vaultTokens,
        address _executor
    ) internal {
        uint256 len = _tokenIds.length;
        require(len == _amounts.length, "VM-IVAL-01");
        bytes32[] memory symbols = new bytes32[](len);
        for (uint256 i = 0; i < len; i++) {
            uint16 tokenId = _tokenIds[i];
            uint256 amount = _amounts[i];

            require(_tokenExistsInVault(tokenId, _vaultTokens), "VM-TIIV-01");
            AssetInfo memory asset = assetInfo[tokenId];
            require(asset.symbol != bytes32(0), "VM-TSIM-01");
            uint256 scaledAmount = amount / (10 ** asset.precision);
            require(scaledAmount >= asset.minPerDeposit && scaledAmount <= asset.maxPerDeposit, "VM-ODLR-01");
            symbols[i] = asset.symbol;
        }
        portfolio.bulkTransferTokens(msg.sender, _executor, symbols, _amounts);
    }

    /**
     * @notice Internal function to check if a token exists in the vault's supported tokens
     * @param _tokenId The token ID to check
     * @param _tokens The list of token IDs supported by the vault
     * @return True if the token exists in the vault, false otherwise
     */
    function _tokenExistsInVault(uint16 _tokenId, uint16[] memory _tokens) internal pure returns (bool) {
        uint256 len = _tokens.length;
        for (uint256 i = 0; i < len; i++) {
            if (_tokens[i] == _tokenId) {
                return true;
            }
        }
        return false;
    }

    /**
     * @notice Internal function to generate a unique request ID
     * @param _vaultId The ID of the vault
     * @param _user The address of the user making the request
     * @param _nonce The user's current nonce for requests
     * @return The generated unique request ID
     */
    function _generateRequestId(uint256 _vaultId, address _user, uint256 _nonce) internal pure returns (bytes32) {
        return bytes32(((uint256(uint16(_vaultId)) << 240) | (uint256(uint160(_user)) << 80)) | _nonce);
    }

    /**
     * @notice Internal function to extract the request info from a request ID
     * @param _requestId The request ID to extract the info from
     * @return vaultId The extracted vault ID
     * @return user The extracted user address
     * @return nonce The extracted nonce
     */
    function _decodeRequestId(bytes32 _requestId) internal pure returns (uint16 vaultId, address user, uint80 nonce) {
        uint256 id = uint256(_requestId);
        vaultId = uint16(id >> 240);
        user = address(uint160(id >> 80));
        nonce = uint80(id);
    }

    function _loadStateToTransient(uint256[] calldata _prices, VaultState[] calldata _vaults) internal {
        uint16 pricesLen = uint16(_prices.length);
        for (uint16 i = 0; i < pricesLen; i++) {
            _tstorePrice(i, _prices[i]);
        }
        uint256 vaultsLen = _vaults.length;
        for (uint256 v = 0; v < vaultsLen; v++) {
            uint256 vaultId = _vaults[v].vaultId;

            VaultDetails storage details = vaultDetails[vaultId];
            // address shareToken = details.shareToken;
            // address executor = details.executor;
            uint256 vaultTotalUsd = 0;
            uint256 tokensLen = _vaults[v].tokenIds.length;
            for (uint256 t = 0; t < tokensLen; t++) {
                uint256 balance = _vaults[v].balances[t];
                uint16 tokenId = _vaults[v].tokenIds[t];

                _tstoreBalance(vaultId, tokenId, balance);
                vaultTotalUsd += (balance * _tloadPrice(tokenId)) / 1e18;
            }

            address shareToken = details.shareToken;

            _tstoreVaultCtx(vaultId, vaultTotalUsd, IERC20(shareToken).totalSupply(), shareToken, details.executor);
            _tstoreVaultTokenIds(vaultId, _vaults[v].tokenIds);
        }
    }

    function _tstorePrice(uint16 _tokenId, uint256 _price) internal {
        bytes32 slot = keccak256(abi.encode("PRICE", _tokenId));
        assembly {
            tstore(slot, _price)
        }
    }

    function _tloadPrice(uint16 _tokenId) internal view returns (uint256 price) {
        bytes32 slot = keccak256(abi.encode("PRICE", _tokenId));
        assembly {
            price := tload(slot)
        }
    }

    function _tstoreBalance(uint256 _vaultId, uint16 _tokenId, uint256 _bal) internal {
        bytes32 slot = keccak256(abi.encode("BAL", _vaultId, _tokenId));
        assembly {
            tstore(slot, _bal)
        }
    }

    function _tloadBalance(uint256 _vaultId, uint16 _tokenId) internal view returns (uint256 bal) {
        bytes32 slot = keccak256(abi.encode("BAL", _vaultId, _tokenId));
        assembly {
            bal := tload(slot)
        }
    }

    function _tstoreVaultCtx(
        uint256 _vid,
        uint256 _usd,
        uint256 _totalShares,
        address _shareToken,
        address _exec
    ) internal {
        bytes32 base = keccak256(abi.encode("VAULT", _vid));
        assembly {
            tstore(base, _usd)
            tstore(add(base, 32), _totalShares)
            tstore(add(base, 64), _shareToken)
            tstore(add(base, 96), _exec)
        }
    }

    function _tstoreVaultTokenIds(uint256 _vid, uint16[] calldata _tids) internal {
        bytes32 base = keccak256(abi.encode("TIDS", _vid));
        uint256 len = _tids.length;
        assembly {
            tstore(base, len)
        } // Store length at index 0

        for (uint256 i = 0; i < len; i++) {
            uint16 tid = _tids[i];
            assembly {
                tstore(add(base, add(mul(i, 32), 32)), tid)
            }
        }
    }

    function _tloadVaultTokenIds(uint256 _vid) internal view returns (uint16[] memory tids) {
        bytes32 base = keccak256(abi.encode("TIDS", _vid));
        uint256 len;
        assembly {
            len := tload(base)
        }

        tids = new uint16[](len);
        for (uint256 i = 0; i < len; i++) {
            uint256 tid;
            assembly {
                tid := tload(add(base, add(mul(i, 32), 32)))
            }
            tids[i] = uint16(tid);
        }
    }

    // Helper getters for specific Metadata fields
    function _tloadVaultUSD(uint256 _vid) internal view returns (uint256 usd) {
        bytes32 base = keccak256(abi.encode("VAULT", _vid));
        assembly {
            usd := tload(base)
        }
    }

    function _tloadVaultTotalShares(uint256 _vid) internal view returns (uint256 totalShares) {
        bytes32 base = keccak256(abi.encode("VAULT", _vid));
        assembly {
            totalShares := tload(add(base, 32))
        }
    }

    function _tloadShareToken(uint256 _vid) internal view returns (address st) {
        bytes32 base = keccak256(abi.encode("VAULT", _vid));
        assembly {
            st := tload(add(base, 64))
        }
    }

    function _tloadVaultExecutor(uint256 _vid) internal view returns (address exec) {
        bytes32 base = keccak256(abi.encode("VAULT", _vid));
        assembly {
            exec := tload(add(base, 96))
        }
    }
}
