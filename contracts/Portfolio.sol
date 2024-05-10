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
 * PortfolioBridgeMain and PortfolioBridgeSub are bridge aggregators in charge of sending/receiving messages
 * via generic messaging using active bridge transports.
 * @dev This contract contains shared logic for PortfolioMain and PortfolioSub.
 * It is perfectly sufficient for your trading application to interface with only the Dexalot Subnet
 * and use Dexalot frontend to perform deposit/withdraw operations manually for cross chain bridging.
 * If your trading application has a business need to deposit/withdraw more often, then your app
 * will need to integrate with the PortfolioMain contract in the mainnet as well to fully automate
 * your flow.
 * Exchange needs to have DEFAULT_ADMIN_ROLE on this contract.
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
    // denominator for rate calculations. Changed it to 100K from 10K on May 2024 Release to support volume rebates
    // only used in PortfolioSub
    uint256 public constant TENK = 100000;
    // boolean to control deposit functionality
    bool public allowDeposit;

    // used to swap gas amount & bridge fees  during bridge operation
    mapping(bytes32 => BridgeParams) public bridgeParams; //Key symbol
    //mapping(bytes32 => uint256) public bridgeFee;
    IPortfolioBridge public portfolioBridge;

    // bytes32 variable to hold native token of the chain it is deployed to. ALOT or AVAX currently
    bytes32 public native;
    //chainid of the blockchain it is deployed to
    uint32 internal chainId;

    // bytes32 array of all ERC20 tokens traded on DEXALOT
    EnumerableSetUpgradeable.Bytes32Set internal tokenList;
    // key is symbol
    mapping(bytes32 => TokenDetails) public tokenDetailsMap;
    // key is symbolId (symbol + srcChainId)
    mapping(bytes32 => bytes32) public tokenDetailsMapById;

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

        // initialize the admins
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender); // set deployment account to have DEFAULT_ADMIN_ROLE
        allowDeposit = true;
        native = _native;
        chainId = _chainId;
    }

    /**
     * @notice  Sets the portfolio bridge contract address
     * @dev     Only callable by admin
     * @param   _portfolioBridge  New portfolio bridge contract address
     */
    function setPortfolioBridge(address _portfolioBridge) external onlyRole(DEFAULT_ADMIN_ROLE) {
        //Can't have multiple portfolioBridge using the same portfolio
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
    function enableBridgeProvider(
        IPortfolioBridge.BridgeProvider _bridge,
        bool _enable
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        portfolioBridge.enableBridgeProvider(_bridge, _enable);
        emit ParameterUpdated(bytes32("Portfolio"), "P-BRIDGE-ENABLE", _enable ? 0 : 1, uint256(_bridge));
    }

    /**
     * @notice  Revoke access control role wrapper
     * @dev     Only callable by admin. Can't revoke itself's role, can't remove the only admin.
     * @param   _role  Role to be revoked
     * @param   _address  Address to be revoked
     */
    function revokeRole(
        bytes32 _role,
        address _address
    ) public override(AccessControlUpgradeable, IAccessControlUpgradeable) onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_address != address(0), "P-OACC-02");
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
    function pause() external override onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
        if (!PausableUpgradeable(address(portfolioBridge)).paused()) {
            portfolioBridge.pause();
        }
    }

    /**
     * @notice  Unpauses portfolioBridge AND the contract
     * @dev     Only callable by admin
     */
    function unpause() external override onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
        if (PausableUpgradeable(address(portfolioBridge)).paused()) {
            portfolioBridge.unpause();
        }
    }

    /**
     * @notice  (Dis)allows the deposit functionality only
     * @dev     Only callable by admin
     * @param   _depositPause  True to allow, false to disallow
     */
    function pauseDeposit(bool _depositPause) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        allowDeposit = !_depositPause;
    }

    /**
     * @notice  Sets the bridge provider fee & gasSwapRatio per ALOT for the given token and usedForGasSwap flag
     * @dev     External function to be called by DEFAULT_ADMIN_ROLE or PORTFOLIO_BRIDGE_ROLE
     * @param   _symbol  Symbol of the token
     * @param   _fee  Fee to be set
     * @param   _gasSwapRatio  Amount of token to swap per ALOT. Always set it to equivalent of 1 ALOT.
     * @param   _usedForGasSwap  bool to control the list of tokens that can be used for gas swap. Mostly majors
     */
    function setBridgeParam(bytes32 _symbol, uint256 _fee, uint256 _gasSwapRatio, bool _usedForGasSwap) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender) || hasRole(PORTFOLIO_BRIDGE_ROLE, msg.sender), "P-OACC-01");
        setBridgeParamInternal(_symbol, _fee, _gasSwapRatio, _usedForGasSwap);
    }

    /**
     * @notice  Sets the bridge provider fee & gasSwapRatio per ALOT for the given token
     * @dev     Called by Portfolio.initialize() addTokenInternal
     * @param   _symbol  Symbol of the token
     * @param   _fee  Fee to be set
     * @param   _gasSwapRatio  Amount of token to swap per ALOT. Always set it to equivalent of 1 ALOT.
     * @param   _usedForGasSwap  bool to control the list of tokens that can be used for gas swap. Mostly majors
     */
    function setBridgeParamInternal(
        bytes32 _symbol,
        uint256 _fee,
        uint256 _gasSwapRatio,
        bool _usedForGasSwap
    ) internal virtual {
        emit ParameterUpdated(_symbol, "P-SET-BRIDGEPARAM", bridgeParams[_symbol].gasSwapRatio, _gasSwapRatio);
        BridgeParams storage bridgeParam = bridgeParams[_symbol];
        bridgeParam.fee = _fee;

        if (_symbol != bytes32("ALOT")) {
            bridgeParam.gasSwapRatio = _gasSwapRatio;
            bridgeParam.usedForGasSwap = _usedForGasSwap;
        } else if (_symbol == bytes32("ALOT") && bridgeParam.gasSwapRatio == 0) {
            // For ALOT gasSwapFee can only be set to 1 ( 1 to 1 ratio at all times) and can't be changed
            bridgeParam.gasSwapRatio = 1 * 10 ** 18;
            bridgeParam.usedForGasSwap = true;
        }
    }

    /**
     * @notice  Actual private function that implements the token addition
     * @param   _details  Token Details
     *  _fee  Bridge Fee (child implementation)
     *  _gasSwapRatio  Amount of token to swap per ALOT (child implementation)
     */
    function addTokenInternal(TokenDetails memory _details, uint256, uint256) internal virtual {
        require(!tokenList.contains(_details.symbol), "P-TAEX-01");
        require(_details.decimals > 0, "P-CNAT-01");

        TokenDetails storage tokenDetails = tokenDetailsMap[_details.symbol];
        tokenDetails.auctionMode = _details.auctionMode;
        tokenDetails.decimals = _details.decimals;
        tokenDetails.tokenAddress = _details.tokenAddress;
        tokenDetails.srcChainId = _details.srcChainId;
        tokenDetails.symbol = _details.symbol;
        bytes32 symbolId = UtilsLibrary.getIdForToken(_details.symbol, tokenDetails.srcChainId);
        tokenDetails.symbolId = symbolId;
        tokenDetails.isVirtual = _details.isVirtual;
        //sourceChainSymbol is always equal to symbol for Portfolios
        //It is needed specifically in PortfolioBridgeSub and can be different
        tokenDetails.sourceChainSymbol = _details.symbol;
        //add to the list by symbol
        tokenList.add(_details.symbol);
        //add to the list by symbolId
        tokenDetailsMapById[symbolId] = _details.symbol;
        emit ParameterUpdated(_details.symbol, "P-ADDTOKEN", _details.decimals, uint256(_details.auctionMode));
    }

    /**
     * @notice  Removes the given token from the portfolio
     * @dev     Only callable by admin and portfolio should be paused. Make sure there are no
     * in-flight deposit/withdraw messages.
     * @param   _symbol  Symbol of the token
     * @param   _srcChainId  Source Chain id. It is always the mainnet chainid for PortfolioMain
     */
    function removeToken(
        bytes32 _symbol,
        uint32 _srcChainId
    ) public virtual override whenPaused onlyRole(DEFAULT_ADMIN_ROLE) {
        tokenList.remove(_symbol);
        delete (tokenDetailsMap[_symbol]);
        bytes32 symbolId = UtilsLibrary.getIdForToken(_symbol, _srcChainId);
        delete (tokenDetailsMapById[symbolId]);
        delete (bridgeParams[_symbol]);
        emit ParameterUpdated(_symbol, "P-REMOVETOKEN", 0, 0);
    }

    /**
     * @notice  Frontend function to get all the tokens in the portfolio
     * @return  bytes32[]  Array of symbols of the tokens
     */
    function getTokenList() external view override returns (bytes32[] memory) {
        bytes32[] memory tokens = new bytes32[](tokenList.length());
        for (uint256 i = 0; i < tokenList.length(); ++i) {
            tokens[i] = tokenList.at(i);
        }
        return tokens;
    }

    /**
     * @notice  Returns the token details.
     * @dev     Subnet does not have any ERC20s, hence the tokenAddress is token's mainnet address.
     * See the TokenDetails struct in IPortfolio for the full type information of the return variable.
     * @param   _symbol  Symbol of the token. Identical to mainnet
     * @return  TokenDetails decimals : Identical both in the mainnet and the subnet
     * tokenAddress : Token address at the mainnet , zeroaddress at the subnet
     * symbolId : symbol + chainId
     * native coin : it will always have zeroaddress both in the mainnet and the subnet
     */
    function getTokenDetails(bytes32 _symbol) external view override returns (TokenDetails memory) {
        return tokenDetailsMap[_symbol];
    }

    /**
     * @notice  Returns the token details.
     * @param   _symbolId  symbolId of the token.
     * @return  TokenDetails  see getTokenDetails
     */
    function getTokenDetailsById(bytes32 _symbolId) external view override returns (TokenDetails memory) {
        return tokenDetailsMap[tokenDetailsMapById[_symbolId]];
    }

    /**
     * @notice  Returns the bridge fee for the given bridge provider, token,
     * destination chain and quantity
     * @dev    Calls the portfolioBridge contract to get the bridge fee which
     * in addition includes withdrawal fee for PortfolioSub but only bridge fee for PortfolioMain
     * @param   _bridge  Enum value of the bridge provider
     * @param   _dstChainListOrgChainId  Chain id of the destination chain
     * @param   _symbol  Symbol of the token
     * @param   _quantity  Quantity of the token
     * @return  bridgeFee  Bridge fee
     */
    function getBridgeFee(
        IPortfolioBridge.BridgeProvider _bridge,
        uint32 _dstChainListOrgChainId,
        bytes32 _symbol,
        uint256 _quantity
    ) external view returns (uint256 bridgeFee) {
        return portfolioBridge.getBridgeFee(_bridge, _dstChainListOrgChainId, _symbol, _quantity);
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
     * @notice  Processes the XFER message coming from the bridge
     * @dev     Overridden in the child contracts, as the logic differs.
     * @param   _xfer  Transfer message
     */
    function processXFerPayload(IPortfolio.XFER calldata _xfer) external virtual override;

    /**
     * @dev     Overridden in the child contracts, as the logic differs.
     * @param   _from  Address of the depositor
     * @param   _bridge  Enum for bridge type
     */
    function depositNative(
        address payable _from,
        IPortfolioBridge.BridgeProvider _bridge
    ) external payable virtual override;
}
