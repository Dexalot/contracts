// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.30;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin-v5/utils/structs/EnumerableSet.sol";

import "../interfaces/IOmniVaultShare.sol";
import "../interfaces/IOmniVault.sol";
import "../interfaces/IPortfolioSub.sol";
import "../interfaces/IPortfolio.sol";

/**
 * @title OmniVault
 * @notice A decentralized vault contract that supports multiple tokens, allowing users to deposit and withdraw assets.
 *         Integrates with an OmniTrader contract for asset management and trading.
 */
contract OmniVault is
    IOmniVault,
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    bytes32 public constant VERSION = bytes32("1.0.0");
    uint256 public constant RECLAIM_DELAY = 24 hours;

    // Vault Specific Details
    uint256 public vaultId;
    string public vaultName;
    address public vaultProposer;
    uint256 public initialVaultDeposit;

    // Connected Vault Contracts
    address public omniVaultExecutor;
    IOmniVaultShare public omniVaultShareToken;
    IPortfolioSub public portfolio;

    // bytes32 array of all ERC20 tokens traded on DEXALOT
    EnumerableSet.Bytes32Set internal tokenList;
    mapping(bytes32 => AssetInfo) public assetInfo;

    // No. transfer requests made per user (max 2^64)
    mapping(address => uint64) public userNonce;
    // Pending/claimable transfer requests
    mapping(bytes32 => TransferRequest) public transferRequests;
    // New deposits restricted flag
    bool public restrictDeposits;

    bytes32 public rollingDepositHash;
    uint256 public currentBatchId;
    uint256 public batchStartTime;

    // Emitted on deposit/withdrawal requests
    event TransferRequestUpdate(
        bytes32 indexed requestId,
        uint256 indexed batchId,
        address indexed user,
        RequestStatus status,
        bytes32[] tokenSymbols,
        uint256[] amounts
    );

    event BatchSettled(uint256 indexed batchId, DepositFufillment[] _deposits, WithdrawalFufillment[] _withdrawals);
    event BatchUnwound(uint256 indexed batchId);

    modifier depositsEnabled() {
        require(!restrictDeposits, "OV-DANE-01");
        _;
    }

    modifier onlyUser(bytes32 _requestId) {
        address user = _getUserFromId(_requestId);
        require(user == msg.sender, "OV-OUCI-01");
        _;
    }

    /**
     * @notice Initializer for the Omnivault contract
     * @param _admin The admin address with DEFAULT_ADMIN_ROLE
     * @param _vaultProposer The address of the vault proposer
     * @param _vaultId The unique ID of the vault
     * @param _vaultName The name of the vault
     */
    function initialize(
        address _admin,
        address _vaultProposer,
        uint256 _vaultId,
        string calldata _vaultName
    ) public initializer {
        require(_admin != address(0), "OV-SAZ-01");
        require(_vaultProposer != address(0), "OV-SAZ-02");

        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        _setupRole(DEFAULT_ADMIN_ROLE, _admin);

        vaultProposer = _vaultProposer;
        vaultId = _vaultId;
        vaultName = _vaultName;
        // TODO: change should be true
        restrictDeposits = false;
    }

    /**
     * @notice Bulk settle deposit and withdrawal requests
     */
    function bulkSettleState(
        DepositFufillment[] calldata _deposits,
        WithdrawalFufillment[] calldata _withdrawals
    ) external nonReentrant whenNotPaused {
        address omniVaultExecutorAddress = omniVaultExecutor;
        IOmniVaultShare shareToken = omniVaultShareToken;
        uint256 curBatch = currentBatchId;
        int256[] memory _netAmounts = _getNetAmounts(_deposits, _withdrawals);
        _bulkSettleTokenTransfers(_netAmounts, omniVaultExecutorAddress);
        _bulkSettleDeposits(_deposits, shareToken);
        _bulkSettleWithdrawals(_withdrawals, shareToken);
        _resetBatch();
        emit BatchSettled(curBatch, _deposits, _withdrawals);
    }

    /**
     * @notice Request a deposit for one to multiple tokens
     * @param _symbols The token symbols to deposit
     * @param _amounts The amounts to deposit
     * @return requestId The generated deposit request ID
     */
    function requestDeposit(
        bytes32[] calldata _symbols,
        uint256[] calldata _amounts
    ) external nonReentrant whenNotPaused depositsEnabled returns (bytes32 requestId) {
        uint256 len = _symbols.length;
        require(len == _amounts.length && len > 0, "OV-IDAL-01");
        bytes32 prevSymbol = _symbols[0];
        for (uint256 i = 0; i < len; ++i) {
            bytes32 symbol = _symbols[i];
            require(i == 0 || symbol > prevSymbol, "OV-ISOS-01");
            uint256 amount = _amounts[i];

            AssetInfo memory details = assetInfo[symbol];
            require(details.tokenType == AssetType.BASE || details.tokenType == AssetType.QUOTE, "OV-ITNS-01");

            uint256 scaledAmount = amount / (10 ** details.precision);
            require(scaledAmount >= details.minPerDeposit && scaledAmount <= details.maxPerDeposit, "OV-IMPD-01");
            portfolio.transferTokenFrom(msg.sender, address(this), symbol, amount);
            prevSymbol = symbol;
        }

        requestId = _generateRequestId(msg.sender, userNonce[msg.sender]++);

        transferRequests[requestId] = TransferRequest({
            status: RequestStatus.DEPOSIT_REQUESTED,
            timestamp: uint32(block.timestamp),
            shares: uint208(0)
        });
        rollingDepositHash = keccak256(abi.encode(rollingDepositHash, requestId, _symbols, _amounts));
        emit TransferRequestUpdate(
            requestId,
            currentBatchId,
            msg.sender,
            RequestStatus.DEPOSIT_REQUESTED,
            _symbols,
            _amounts
        );
    }

    /**
     * @notice Request a withdrawal for a specific token
     * @param _shares The vault shares to withdraw
     * @return requestId The generated withdrawal request ID
     */
    function requestWithdrawal(uint208 _shares) external nonReentrant whenNotPaused returns (bytes32 requestId) {
        require(_shares > 0, "OV-ZEVS-01");

        requestId = _generateRequestId(msg.sender, userNonce[msg.sender]++);

        transferRequests[requestId] = TransferRequest({
            status: RequestStatus.WITHDRAWAL_REQUESTED,
            timestamp: uint32(block.timestamp),
            shares: _shares
        });

        bytes32[] memory symbolsArray = new bytes32[](1);
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

    function unwindBatch(DepositFufillment[] calldata _deposits) external nonReentrant {
        require(rollingDepositHash != 0, "");
        require(block.timestamp >= batchStartTime + RECLAIM_DELAY, "");

        bytes32 depositHash = 0;

        for (uint256 i = 0; i < _deposits.length; i++) {
            DepositFufillment calldata item = _deposits[i];
            depositHash = keccak256(abi.encode(depositHash, item.depositRequestId, item.symbols, item.amounts));

            require(transferRequests[item.depositRequestId].status == RequestStatus.DEPOSIT_REQUESTED, "");
        }
        require(depositHash == rollingDepositHash, "");

        for (uint256 i = 0; i < _deposits.length; i++) {
            DepositFufillment calldata item = _deposits[i];
            delete transferRequests[item.depositRequestId]; // Clear state
            // TODO: refund function
            uint256 len = item.symbols.length;
            address user = _getUserFromId(item.depositRequestId);
            for (uint256 j = 0; j < len; j++) {
                portfolio.transferToken(user, item.symbols[j], item.amounts[j]);
            }
        }

        emit BatchUnwound(currentBatchId);
        _resetBatch();
    }

    /**
     * @notice Initial deposit to set up the vault shares
     * @dev Can only be called by the admin on behalf of the vault proposer
     * @param _amounts The list of token amounts deposited
     * @param _shares The list of vault shares to mint for each token
     */
    function initialDeposit(
        bytes32[] calldata symbols,
        uint256[] calldata _amounts,
        uint208 _shares
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        // require(initialVaultDeposit == 0, "OV-IDON-01");
        // address proposer = vaultProposer;
        // uint256 len = _amounts.length;
        // require(len == _shares.length, "OV-IVAL-01");
        // IOmniVaultShare shareToken = omniVaultShareToken;
        // require(shareToken.totalSupply() == 0, "OV-TSNZ-01");
        // (uint256 totalVaultShares, uint64 nonce) = _emitInitialMint(len, proposer, _amounts, _shares);
        // userNonce[proposer] = nonce;
        // initialVaultDeposit = totalVaultShares;
        // restrictDeposits = false;
        // shareToken.mint(proposer, totalVaultShares);
    }

    function _emitInitialMint(
        uint256 _len,
        address _proposer,
        uint208[] calldata _amounts,
        uint256[] calldata _shares
    ) internal returns (uint256 totalVaultShares, uint64 nonce) {
        // for (uint8 i = 0; i < _len; ++i) {
        //     bytes32 requestId = _generateRequestId(_proposer, nonce++);
        //     emit TransferRequestUpdate(requestId, _proposer, RequestStatus.DEPOSIT_REQUESTED, i, uint256(_amounts[i]));
        //     emit TransferRequestUpdate(requestId, _proposer, RequestStatus.DEPOSIT_FULFILLED, i, uint256(_shares[i]));
        //     totalVaultShares += _shares[i];
        // }
    }

    /**
     * @notice Add details for a new supported token
     * @param _symbol The bytes32 symbol of the token to update
     * @param _asset The AssetInfo struct containing the token details
     */
    function addTokenDetails(bytes32 _symbol, AssetInfo calldata _asset) external onlyRole(DEFAULT_ADMIN_ROLE) {
        IPortfolio.TokenDetails memory tokenDetails = IPortfolio(address(portfolio)).getTokenDetails(_symbol);
        require(tokenDetails.symbol == _symbol, "symbol not found in portfolio");
        require(!tokenList.contains(_symbol), "symbol already exists");
        assetInfo[_symbol] = _asset;
        // tokenList.add(_symbol);
    }

    /**
     * @notice Update details for an existing supported token
     * @dev The token address cannot be changed
     * @param _symbol The bytes32 symbol of the token to update
     * @param _asset The AssetInfo struct containing the updated token details
     */
    function updateTokenDetails(bytes32 _symbol, AssetInfo calldata _asset) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(tokenList.contains(_symbol));
        AssetInfo memory existing = assetInfo[_symbol];
        require(existing.tokenType != AssetType.NONE, "OV-IVTA-01");
        assetInfo[_symbol] = _asset;
    }

    // remove token not sure how to handle??

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
     * @notice Set the restrict deposits flag
     * @param _restrict The new value for the restrict deposits flag
     */
    function setRestrictDeposits(bool _restrict) external onlyRole(DEFAULT_ADMIN_ROLE) {
        restrictDeposits = _restrict;
    }

    /**
     * @notice Set the OmniVaultExecutor contract address
     * @param _omniVaultExecutor The new OmniVaultExecutor contract address
     */
    function setOmniVaultExecutor(address _omniVaultExecutor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_omniVaultExecutor != address(0), "OV-SAZ-01");
        omniVaultExecutor = _omniVaultExecutor;
    }

    /**
     * @notice Set the OmniVaultShare token contract address
     * @param _token The new OmniVaultShare token contract address
     */
    function setOmniVaultShareToken(address _token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_token != address(0), "OV-SAZ-01");
        omniVaultShareToken = IOmniVaultShare(_token);
    }

    /**
     * @notice Set the PortfolioSub contract address
     * @param _portfolio The new PortfolioSub contract address
     */
    function setPortfolio(address _portfolio) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_portfolio != address(0), "OV-SAZ-01");
        portfolio = IPortfolioSub(_portfolio);
    }

    function _getNetAmounts(
        DepositFufillment[] calldata _deposits,
        WithdrawalFufillment[] calldata _withdrawals
    ) internal view returns (int256[] memory) {
        uint256 len = tokenList.length();
        int256[] memory _netAmounts = new int256[](len);
        for (uint256 i = 0; i < _deposits.length; i++) {
            uint8[] calldata indexes = _deposits[i].indexes;
            uint256[] calldata amounts = _deposits[i].amounts;
            for (uint256 j = 0; j < indexes.length; j++) {
                uint8 index = indexes[j];
                uint256 amount = amounts[j];
                _netAmounts[index] += int256(amount);
            }
        }
        for (uint256 i = 0; i < _withdrawals.length; i++) {
            uint8[] calldata indexes = _withdrawals[i].indexes;
            uint256[] calldata amounts = _withdrawals[i].amounts;
            for (uint256 j = 0; j < indexes.length; j++) {
                uint8 index = indexes[j];
                uint256 amount = amounts[j];
                _netAmounts[index] -= int256(amount);
            }
        }
        return _netAmounts;
    }

    function _bulkSettleTokenTransfers(int256[] memory _netAmounts, address _omniVaultExecutor) internal {
        uint256 len = tokenList.length();
        for (uint256 i = 0; i < len; i++) {
            bytes32 symbol = tokenList.at(i);
            int256 netAmount = _netAmounts[i];
            if (netAmount > 0) {
                // net deposit, transfer tokens to omniTrader
                portfolio.transferToken(_omniVaultExecutor, symbol, uint256(netAmount));
            } else if (netAmount < 0) {
                // net withdrawal, transfer tokens from omniTrader to omniVault
                portfolio.transferTokenFrom(_omniVaultExecutor, address(this), symbol, uint256(-netAmount));
            }
        }
    }

    /**
     * @notice Internal function to bulk settle deposit requests
     * @dev Mints vault shares to users and unlocks tokens in the vault
     * @param _shareToken The OmniVaultShare token contract
     */
    function _bulkSettleDeposits(DepositFufillment[] calldata _deposits, IOmniVaultShare _shareToken) internal {
        uint256 len = _deposits.length;
        bytes32 depositHash = bytes32(0);
        for (uint256 i = 0; i < len; i++) {
            bytes32 requestId = _deposits[i].depositRequestId;
            depositHash = keccak256(abi.encode(depositHash, requestId, _deposits[i].symbols, _deposits[i].amounts));
            TransferRequest memory dRequest = transferRequests[requestId];
            require(dRequest.status == RequestStatus.DEPOSIT_REQUESTED, "OV-DSNR-01");
            delete transferRequests[requestId];

            if (_deposits[i].depositShares != 0) {
                address owner = _getUserFromId(requestId);
                _shareToken.mint(owner, _deposits[i].depositShares);
                // emit TransferRequestUpdate(
                //     requestId,
                //     curBatch,
                //     owner,
                //     RequestStatus.DEPOSIT_FULFILLED,
                //     _deposits[i].symbols,
                //     _deposits[i].amounts
                // );
                continue;
            }

            _refundDeposit(requestId, _deposits[i].symbols, _deposits[i].amounts);
        }
        require(depositHash == rollingDepositHash, "");
    }

    function _refundDeposit(bytes32 requestId, bytes32[] calldata symbols, uint256[] calldata amounts) internal {
        uint256 lenSymbols = symbols.length;
        address user = _getUserFromId(requestId);
        require(lenSymbols == amounts.length, "OV-RDLM-01");

        for (uint256 j = 0; j < lenSymbols; j++) {
            bytes32 symbol = symbols[j];
            uint256 amount = amounts[j];
            portfolio.transferToken(user, symbol, amount);
        }
        emit TransferRequestUpdate(requestId, currentBatchId, user, RequestStatus.DEPOSIT_CLAIMED, symbols, amounts);
    }

    function _resetBatch() internal {
        rollingDepositHash = 0;
        batchStartTime = block.timestamp;
        currentBatchId++;
    }

    /**
     * @notice Internal function to bulk settle withdrawal requests
     * @dev Burns vault shares from users and locks claimable tokens in the vault
     * @param _shareToken The OmniVaultShare token contract
     */
    function _bulkSettleWithdrawals(
        WithdrawalFufillment[] calldata _withdrawals,
        IOmniVaultShare _shareToken
    ) internal {
        uint256 len = _withdrawals.length;
        for (uint256 i = 0; i < len; i++) {
            bytes32 requestId = _withdrawals[i].withdrawalRequestId;
            TransferRequest memory wRequest = transferRequests[requestId];
            require(wRequest.status == RequestStatus.WITHDRAWAL_REQUESTED, "OV-WSNR-01");
            _shareToken.burn(wRequest.shares);
            delete transferRequests[requestId];

            address owner = _getUserFromId(requestId);
            uint256 lenSymbols = _withdrawals[i].symbols.length;
            require(lenSymbols == _withdrawals[i].amounts.length, "");
            for (uint8 j = 0; j < lenSymbols; j++) {
                bytes32 symbol = _withdrawals[i].symbols[j];
                uint256 amount = _withdrawals[i].amounts[j];
                portfolio.transferToken(owner, symbol, amount);
            }
        }
    }

    /**
     * @notice Internal function to generate a unique request ID
     * @param user The address of the user making the request
     * @param nonce The user's current nonce for requests
     * @return The generated unique request ID
     */
    function _generateRequestId(address user, uint256 nonce) internal view returns (bytes32) {
        return bytes32((uint256(uint160(user)) << 96) | (uint256(uint32(block.chainid)) << 64) | nonce);
    }

    /**
     * @notice Internal function to extract the user address from a request ID
     * @param requestId The request ID to extract the user from
     * @return The extracted user address
     */
    function _getUserFromId(bytes32 requestId) internal pure returns (address) {
        return address(uint160(uint256(requestId) >> 96));
    }

    receive() external payable {}
}
