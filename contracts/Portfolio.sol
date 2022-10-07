// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "./library/UtilsLibrary.sol";
import "./interfaces/IPortfolio.sol";
import "./interfaces/ITradePairs.sol";
import "./interfaces/IPortfolioBridge.sol";
import "./interfaces/layerZero/ILayerZeroEndpoint.sol";

/**
 * @title Abstract contract to be inherited in PortfolioMain and PortfolioSub
 * @notice Dexalot lives in a dual chain environment. Avalanche Mainnet C-Chain (mainnet) and Avalanche
 * supported Dexalot Subnet (subnet). Dexalot’s contracts don’t bridge any coins or tokens
 * between these two chains, but rather lock them in the PortfolioMain contract in the
 * mainnet and then communicate the users’ holdings to its smart contracts in the subnet for
 * trading purposes. Dexalot is bridge agnostic. You will be able to deposit with one bridge and
 * withdraw with another. Having said that, LayerZero is the sole bridge provider at the start.
 * More bridges can be added in the future as needed.
 * Because of this novel architecture, a subnet wallet can only house ALOT token and nothing
 * else. That's why the subnet wallet is referred to as the “Gas Tank”. All assets will be
 * handled inside the PortfolioSub smart contract in the subnet.
 * PortfolioBridge and PortfolioBridgeSub are bridge aggregators in charge of sending/receiving messages
 * via generic messaging using ative bridge transports.
 * @dev This contract contains shared logic for PortfolioMain and PortfolioSub.
 * It is perfectly sufficient for your trading application to interface with only the Dexalot Subnet
 * and use Dexalot frontend to perform deposit/withdraw operations manually for cross chain bridging.
 * If your trading application has a business need to deposit/withdraw more often, then your app
 * will need to integrate with the PortfolioMain contract in the mainnet as well to fully automate
 * your flow.
 * ExchangeSub needs to have DEFAULT_ADMIN_ROLE on this contract.
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

abstract contract Portfolio is
    Initializable,
    AccessControlEnumerableUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    IPortfolio
{
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.Bytes32Set;
    // denominator for rate calculations
    uint256 public constant TENK = 10000;
    // boolean to control deposit functionality
    bool public allowDeposit;
    uint32 internal chainId;
    // bytes32 array of all ERC20 tokens traded on DEXALOT
    EnumerableSetUpgradeable.Bytes32Set internal tokenList;
    // contract address that we trust to perform limited functions like deposit DD symbol
    mapping(address => bool) public trustedContracts;
    // contract address to integrator organization name
    mapping(address => string) public trustedContractToIntegrator;
    // used to swap gas fees during bridge operation, set each token per alot
    mapping(bytes32 => uint256) internal bridgeSwapAmount;
    mapping(bytes32 => uint256) public bridgeFee;
    IPortfolioBridge public portfolioBridge;

    bytes32 public constant PBRIDGE_ROLE = keccak256("PORTFOLIO_BRIDGE_ROLE");
    // bytes32 variable to hold native token of ALOT or AVAX
    bytes32 public native;

    mapping(bytes32 => TokenDetails) public tokenDetailsMap; //// key is symbol

    bytes32 public constant PORTFOLIO_BRIDGE_ROLE = keccak256("PORTFOLIO_BRIDGE_ROLE");
    event ParameterUpdated(bytes32 indexed pair, string _param, uint256 _oldValue, uint256 _newValue);
    event AddressSet(string indexed name, string actionName, address oldAddress, address newAddress);
    event RoleUpdated(string indexed name, string actionName, bytes32 updatedRole, address updatedAddress);

    /**
     * @notice  initializer function for Upgradeable Portfolio
     * @dev     Grants admin role to msg.sender
     * @param   _native  Native token of the network. AVAX in mainnet, ALOT in subnet.
     */
    function initialize(bytes32 _native, uint32 _chainId) public virtual onlyInitializing {
        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();

        // intitialize the admins
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender); // set deployment account to have DEFAULT_ADMIN_ROLE
        allowDeposit = true;
        native = _native;
        chainId = _chainId;
        addTokenInternal(_native, address(0), _chainId, 18, ITradePairs.AuctionMode.OFF);
    }

    /**
     * @notice  Sets the portfolio bridge contract address
     * @dev     Only callable by admin
     * @param   _portfolioBridge  New portfolio bridge contract address
     */
    function setPortfolioBridge(address _portfolioBridge) external onlyRole(DEFAULT_ADMIN_ROLE) {
        //Can't have multiple portfoliobridge using the same portfolio
        if (hasRole(PORTFOLIO_BRIDGE_ROLE, address(portfolioBridge)))
            super.revokeRole(PORTFOLIO_BRIDGE_ROLE, address(portfolioBridge));
        portfolioBridge = IPortfolioBridge(_portfolioBridge);
        grantRole(PORTFOLIO_BRIDGE_ROLE, _portfolioBridge);
        emit AddressSet("PORTFOLIO", "SET-PORTFOLIOBRIDGE", _portfolioBridge, _portfolioBridge);
    }

    /**
     * @notice  Enables or disables a bridge provider
     * @dev     Only callable by admin
     * @param   _bridge  Enum value of the bridge provider
     * @param   _enable  True to enable, false to disable
     */
    function enableBridgeProvider(IPortfolioBridge.BridgeProvider _bridge, bool _enable) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "P-OACC-01");
        portfolioBridge.enableBridgeProvider(_bridge, _enable);
        emit ParameterUpdated(bytes32("Portfolio"), "P-BRIDGE-ENABLE", _enable ? 0 : 1, uint256(_bridge));
    }

    /**
     * @notice  Clears the blocking message in the LZ bridge, if any
     * @dev     Force resume receive action is destructive
     * should be used only when the bridge is stuck and message is already recovered. \
     * It is only callable by admin.
     * @param   _srcChainId  LZ Chain ID of the source chain
     * @param   _srcAddress  Remote contract address concatenated with the local contract address, 40 bytes.
     */
    function lzForceResumeReceive(uint16 _srcChainId, bytes calldata _srcAddress)
        external
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        ILayerZeroEndpoint(address(portfolioBridge)).forceResumeReceive(_srcChainId, _srcAddress);
    }

    /**
     * @notice  Retries the stuck message in the LZ bridge, if any
     * @dev     Only callable by admin
     * @param   _srcChainId  LZ Chain ID of the source chain
     * @param   _srcAddress  Remote contract address concatenated with the local contract address, 40 bytes.
     * @param   _payload  Payload of the stucked message
     */
    function lzRetryPayload(
        uint16 _srcChainId,
        bytes calldata _srcAddress,
        bytes calldata _payload
    ) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        ILayerZeroEndpoint(address(portfolioBridge)).retryPayload(_srcChainId, _srcAddress, _payload);
    }

    // helper functions
    /**
     * @notice  Parses XFER message coming from the bridge
     * @param   _payload  Payload passed from the bridge
     * @return  address  Address of the trader
     * @return  bytes32  Symbol of the token
     * @return  uint256  Amount of the token
     */
    function getXFer(bytes calldata _payload)
        internal
        view
        returns (
            address,
            bytes32,
            uint256
        )
    {
        (IPortfolioBridge.XChainMsgType xchainMsgType, bytes memory msgdata) = portfolioBridge.unpackMessage(_payload);
        XFER memory xfer;
        if (xchainMsgType == IPortfolioBridge.XChainMsgType.XFER) {
            xfer = portfolioBridge.getXFerMessage(msgdata);
        }

        return (xfer.trader, xfer.symbol, xfer.quantity);
    }

    /**
     * @notice  Recovers the stuck message in the LZ bridge, if any
     * @dev     Implemented in the child contract, as the logic differs.
     * @param   _payload  Payload of the stucked message
     */
    function lzRecoverPayload(bytes calldata _payload) external virtual;

    /**
     * @notice  Processes the XFER message coming from the bridge
     * @dev     Implemented in the child contract, as the logic differs.
     * @param   _trader  Address of the trader
     * @param   _symbol  Symbol of the token
     * @param   _quantity  Amount of the token
     * @param   _transaction  Transaction type Enum
     */
    function processXFerPayload(
        address _trader,
        bytes32 _symbol,
        uint256 _quantity,
        IPortfolio.Tx _transaction
    ) external virtual override;

    /**
     * @notice  Revoke access control role wrapper
     * @dev     Only callable by admin. Can't revoke itself's role, can't remove the only admin.
     * @param   _role  Role to be revoked
     * @param   _address  Address to be revoked
     */
    function revokeRole(bytes32 _role, address _address)
        public
        override(AccessControlUpgradeable, IAccessControlUpgradeable)
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        // We need to have at least one admin in DEFAULT_ADMIN_ROLE
        if (_role == DEFAULT_ADMIN_ROLE) {
            require(getRoleMemberCount(_role) > 1, "P-ALOA-01");
        } else if (_role == PORTFOLIO_BRIDGE_ROLE) {
            // We need to have at least one  in PORTFOLIO_BRIDGE_ROLE
            require(getRoleMemberCount(_role) > 1, "P-ALOA-02");
        }

        super.revokeRole(_role, _address);
        emit RoleUpdated("PORTFOLIO", "REMOVE-ROLE", _role, _address);
    }

    /**
     * @notice  Returns the native token of the chain
     * @return  bytes32  Symbol of the native token
     */
    function getNative() external view override returns (bytes32) {
        return native;
    }

    /**
     * @notice  Returns the native token of the chain
     * @return  bytes32  Symbol of the native token
     */
    function getChainId() external view override returns (uint32) {
        return chainId;
    }

    /**
     * @notice  Pauses the portfolioBridge AND the contract
     * @dev     Only callable by admin
     */
    function pause() external override {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "P-OACC-01");
        _pause();
        portfolioBridge.pause();
    }

    /**
     * @notice  Unpauses portfolioBridge AND the contract
     * @dev     Only callable by admin
     */
    function unpause() external override {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "P-OACC-01");
        _unpause();
        portfolioBridge.unpause();
    }

    /**
     * @notice  (Dis)allows the deposit functionality only
     * @dev     Only callable by admin
     * @param   _pause  True to allow, false to disallow
     */
    function pauseDeposit(bool _pause) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        allowDeposit = !_pause;
    }

    /**
     * @notice  Sets the bridge provider fee for the given token
     * @param   _symbol  Symbol of the token
     * @param   _fee  Fee to be set
     */
    function setBridgeFee(bytes32 _symbol, uint256 _fee) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit ParameterUpdated(_symbol, "P-SET-BRIDGEFEE", bridgeFee[_symbol], _fee);
        bridgeFee[_symbol] = _fee;
    }

    /**
     * @notice  Adds the given contract to trusted contracts in order to provide excluded functionality
     * @dev     Only callable by admin
     * @param   _contract  Address of the contract to be added
     * @param   _organization  Organization of the contract to be added
     */
    function addTrustedContract(address _contract, string calldata _organization)
        external
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        trustedContracts[_contract] = true;
        trustedContractToIntegrator[_contract] = _organization;
        emit AddressSet(_organization, "P-ADD-TRUSTEDCONTRACT", _contract, _contract);
    }

    /**
     * @param   _contract  Address of the contract
     * @return  bool  True if the contract is trusted
     */
    function isTrustedContract(address _contract) external view override returns (bool) {
        return trustedContracts[_contract];
    }

    /**
     * @notice  Removes the given contract from trusted contracts
     * @dev     Only callable by admin
     * @param   _contract  Address of the contract to be removed
     */
    function removeTrustedContract(address _contract) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        trustedContracts[_contract] = false;
        emit AddressSet(trustedContractToIntegrator[_contract], "P-REMOVE-TRUSTED-CONTRACT", _contract, _contract);
    }

    /**
     * @notice  Returns the bridge swap amount for the given token
     * @param   _symbol  Symbol of the token
     * @return  uint256  Bridge swap amount
     */
    function getBridgeSwapAmount(bytes32 _symbol) external view returns (uint256) {
        return bridgeSwapAmount[_symbol];
    }

    /**
     * @notice  Sets the bridge swap amount for the given token
     * @dev     Always set it to equivalent of 1 ALOT. Only callable by admin.
     * @param   _symbol  Symbol of the token
     * @param   _amount  Amount of token to be set
     */
    function setBridgeSwapAmount(bytes32 _symbol, uint256 _amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 _oldAmount = bridgeSwapAmount[_symbol];
        bridgeSwapAmount[_symbol] = _amount; // per ALOT
        emit ParameterUpdated(_symbol, "P-SET-BRIDGESWAPAMOUNT", _oldAmount, _amount);
    }

    /**
     * @notice  Function to add IERC20 token to the portfolio
     * @dev     Implemented in the child contract, as the logic differs.
     * @param   _symbol  Symbol of the token
     * @param   _tokenaddress  Address of the token
     * @param   _srcChainId  Source Chain Id
     * @param   _decimals  Decimals of the token
     * @param   _mode  Starting auction mode of the token
     */
    function addIERC20(
        bytes32 _symbol,
        address _tokenaddress,
        uint32 _srcChainId,
        uint8 _decimals,
        ITradePairs.AuctionMode _mode
    ) internal virtual;

    /**
     * @notice  Function to remove IERC20 token from the portfolio
     * @dev     Implemented in the child contract, as the logic differs.
     * @param   _symbol  Symbol of the token
     */
    function removeIERC20(bytes32 _symbol) internal virtual;

    /**
     * @notice  Frontend function to get the IERC20 token
     * @param   _symbol  Symbol of the token
     * @return  IERC20Upgradeable  IERC20 token
     */
    function getToken(bytes32 _symbol) external view virtual returns (IERC20Upgradeable);

    /**
     * @notice  Adds the given token to the portfolio
     * @dev     Only callable by admin.
     * We don't allow tokens with the same symbols but different addresses.
     * Native symbol is also added by default with 0 address.
     * @param   _symbol  Symbol of the token
     * @param   _tokenAddress  Address of the token
     * @param   _srcChainId  Source Chain id
     * @param   _decimals  Decimals of the token
     * @param   _mode  Starting auction mode of the token
     */
    function addToken(
        bytes32 _symbol,
        address _tokenAddress,
        uint32 _srcChainId,
        uint8 _decimals,
        ITradePairs.AuctionMode _mode
    ) public virtual override onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_symbol != native || (_symbol == native && _tokenAddress != address(0))) {
            addTokenInternal(_symbol, _tokenAddress, _srcChainId, _decimals, _mode);
        }
    }

    /**
     * @notice  Actual private function that implements the token addition
     * @param   _symbol  Symbol of the token
     * @param   _tokenAddress  Address of the token
     * @param   _srcChainId  Source Chain id
     * @param   _decimals  Decimals of the token
     * @param   _mode  Starting auction mode of the token
     */
    function addTokenInternal(
        bytes32 _symbol,
        address _tokenAddress,
        uint32 _srcChainId,
        uint8 _decimals,
        ITradePairs.AuctionMode _mode
    ) private {
        require(!tokenList.contains(_symbol), "P-TAEX-01");
        require(_decimals > 0, "P-CNAT-01");

        TokenDetails storage tokenDetails = tokenDetailsMap[_symbol];
        tokenDetails.auctionMode = ITradePairs.AuctionMode.OFF;
        tokenDetails.decimals = _decimals;
        tokenDetails.tokenAddress = _tokenAddress;
        tokenDetails.srcChainId = chainId; // always add with the chain id of the Portfolio
        tokenDetails.symbol = _symbol;
        tokenDetails.symbolId = getIdForToken(_symbol);

        addIERC20(_symbol, _tokenAddress, _srcChainId, _decimals, _mode);
        //add to the list by symbol
        tokenList.add(_symbol);
        if (_symbol != native || (_symbol == native && _tokenAddress != address(0))) {
            //Adding to portfolioBridge with the proper mainnet address and srcChainId
            portfolioBridge.addToken(_symbol, _tokenAddress, _srcChainId, _decimals, _mode);
        }
        emit ParameterUpdated(_symbol, "P-ADDTOKEN", _decimals, uint256(_mode));
    }

    /**
     * @notice  Removes the given token from the portfolio
     * @dev     Only callable by admin and portfolio should be paused. Makes sure there are no
     * in-flight deposit/withdraw messages
     * @param   _symbol  Symbol of the token
     */
    function removeToken(bytes32 _symbol) public virtual override whenPaused onlyRole(DEFAULT_ADMIN_ROLE) {
        // removeIERC20 makes sanity checks before removal
        removeIERC20(_symbol);
        if (_symbol != native) {
            tokenList.remove(_symbol);
            portfolioBridge.removeToken(_symbol, chainId);
            delete (tokenDetailsMap[_symbol]);
            emit ParameterUpdated(_symbol, "P-REMOVETOKEN", 0, 0);
        }
    }

    /**
     * @notice  Frontend function to get all the tokens in the portfolio
     * @return  bytes32[]  Array of symbols of the tokens
     */
    function getTokenList() external view returns (bytes32[] memory) {
        bytes32[] memory tokens = new bytes32[](tokenList.length());
        for (uint256 i = 0; i < tokenList.length(); i++) {
            tokens[i] = tokenList.at(i);
        }
        return tokens;
    }

    /**
     * @notice  Returns the token details.
     * @dev     Subnet does not have any ERC20s, hence the tokenAddress is token's mainnet address.
     * See the TokenDetails struct in IPortfolio for the full type information of the return variable.
     * @param   _symbol  Symbol of the token. Identical to mainnet
     * @return  TokenDetails decimals (Identical to mainnet), tokenAddress (Token address at the mainnet)
     */
    function getTokenDetails(bytes32 _symbol) external view override returns (TokenDetails memory) {
        return tokenDetailsMap[_symbol];
    }

    function getIdForToken(bytes32 _symbol) internal view returns (bytes32 symbolId) {
        symbolId = UtilsLibrary.getIdForToken(_symbol, chainId);
    }

    /**
     * @dev we revert transaction if a non-existing function is called
     */
    fallback() external payable {
        revert("P-NFUN-01");
    }

    /**
     * @notice Receive function for direct send of native tokens
     * @dev we process it as a deposit with the default bridge
     */
    receive() external payable {
        this.depositNative{value: msg.value}(payable(msg.sender), portfolioBridge.getDefaultBridgeProvider());
    }

    /**
     * @notice  Checks if the deposit is valid
     * @param   _quantity  Amount to be deposited
     */
    function depositTokenChecks(uint256 _quantity) internal virtual {
        require(allowDeposit, "P-ETDP-01");
        require(_quantity > 0, "P-ZETD-01");
    }

    /**
     * @notice  Updates the transfer fee rate
     * @param   _rate  New transfer fee rate
     * @param   _rateType  Enum for transfer type
     */
    function updateTransferFeeRate(uint256 _rate, Tx _rateType) external virtual override;

    /**
     * @notice  Sets the auction mode for the token
     * @dev     Implemented in the child contract, as the logic differs.
     * @param   _symbol  Symbol of the token
     * @param   _mode  New auction mode to be set
     */
    function setAuctionMode(bytes32 _symbol, ITradePairs.AuctionMode _mode) external virtual override;

    /**
     * @dev     Implemented in the child contract, as the logic differs.
     * @param   _from  Address of the depositor
     * @param   _bridge  Enum for bridge type
     */
    function depositNative(address payable _from, IPortfolioBridge.BridgeProvider _bridge)
        external
        payable
        virtual
        override;

    /**
     * @dev     Implemented in the child contract, as the logic differs.
     * @param   _to  Address of the withdrawer
     * @param   _quantity  Amount to be withdrawn
     */
    function withdrawNative(address payable _to, uint256 _quantity) external virtual override;

    /**
     * @dev     Implemented in the child contract, as the logic differs.
     * @param   _from  Address of the depositor
     * @param   _symbol  Symbol of the token
     * @param   _quantity  Amount to be deposited
     * @param   _bridge  Enum for bridge type
     */
    function depositToken(
        address _from,
        bytes32 _symbol,
        uint256 _quantity,
        IPortfolioBridge.BridgeProvider _bridge
    ) external virtual override;

    /**
     * @dev     Implemented in the child contract, as the logic differs.
     * @param   _from  Address of the depositor
     * @param   _symbol  Symbol of the token
     * @param   _quantity  Amount to be deposited
     */
    function depositTokenFromContract(
        address _from,
        bytes32 _symbol,
        uint256 _quantity
    ) external virtual override;

    /**
     * @dev     Implemented in the child contract, as the logic differs.
     * @param   _to  Address of the withdrawer
     * @param   _symbol  Symbol of the token
     * @param   _quantity  Amount to be withdrawn
     * @param   _bridge  Enum for bridge type
     */
    function withdrawToken(
        address _to,
        bytes32 _symbol,
        uint256 _quantity,
        IPortfolioBridge.BridgeProvider _bridge
    ) external virtual override;

    /**
     * @dev     Implemented in the child contract, as the logic differs.
     * @param   _transaction  Enum for transaction type
     * @param   _trader  Address of the trader
     * @param   _symbol  Symbol of the token
     * @param   _amount  Amount to be adjusted
     */
    function adjustAvailable(
        Tx _transaction,
        address _trader,
        bytes32 _symbol,
        uint256 _amount
    ) external virtual override;

    /**
     * @dev     Implemented in the child contract, as the logic differs.
     * @param   _makerSide  Side of the maker
     * @param   _makerAddr  Address of the maker
     * @param   _takerAddr  Address of the taker
     * @param   _baseSymbol  Symbol of the base token
     * @param   _quoteSymbol  Symbol of the quote token
     * @param   _baseAmount  Amount of base token
     * @param   _quoteAmount  Amount of quote token
     * @param   _makerfeeCharged  Fee charged to the maker
     * @param   _takerfeeCharged  Fee charged to the taker
     */
    function addExecution(
        ITradePairs.Side _makerSide,
        address _makerAddr,
        address _takerAddr,
        bytes32 _baseSymbol,
        bytes32 _quoteSymbol,
        uint256 _baseAmount,
        uint256 _quoteAmount,
        uint256 _makerfeeCharged,
        uint256 _takerfeeCharged
    ) external virtual override;
}
