// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";

import "./Portfolio.sol";
import "./interfaces/ITradePairs.sol";
import "./interfaces/IPortfolioMain.sol";
import "./interfaces/IBannedAccounts.sol";

/**
 * @title Mainnet Portfolio
 * @dev This contract prevalidates the PortfolioSub checks and allows deposits to be sent to the subnet.
 * ExchangeMain needs to have DEFAULT_ADMIN_ROLE on PortfolioMain.
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract PortfolioMain is Portfolio, IPortfolioMain {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.Bytes32Set;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // version
    bytes32 public constant VERSION = bytes32("2.2.1");

    // bytes32 symbols to ERC20 token map
    mapping(bytes32 => IERC20Upgradeable) public tokenMap;

    // bytes32 symbols to amount of bridge fee collected
    mapping(bytes32 => uint256) public bridgeFeeCollected;
    // contract address that we trust to perform limited functions like deposit DD symbol
    mapping(address => bool) public trustedContracts;
    // contract address to integrator organization name
    mapping(address => string) public trustedContractToIntegrator;

    // banned accounts contract address set externally with setBannedAccounts as part of deployment
    IBannedAccounts internal bannedAccounts;
    uint8 public minDepositMultiplier;

    function initialize(bytes32 _native, uint32 _chainId) public override initializer {
        Portfolio.initialize(_native, _chainId);
        minDepositMultiplier = 19; // 19/10 1.9 times
        // Always Add native with 0 Bridge Fee and 0.01 gasSwapRatio (1 AVAX for 1 ALOT)
        // This value will be adjusted periodically
        addTokenInternal(native, address(0), _chainId, 18, ITradePairs.AuctionMode.OFF, 0, 1 * 10 ** 16);
    }

    /**
     * @notice  Internal function that implements the token addition
     * @dev     Unlike in the subnet it doesn't add the token to the PortfolioBridgeMain as it is redundant
     * Sample Token List in PortfolioMain: \
     * Symbol, SymbolId, Decimals, address, auction mode (43114: Avalanche C-ChainId) \
     * ALOT ALOT43114 18 0x5FbDB2315678afecb367f032d93F642f64180aa3 0 (Avalanche ALOT) \
     * AVAX AVAX43114 18 0x0000000000000000000000000000000000000000 0 (Avalanche Native AVAX) \
     * BTC.b BTC.b43114 8 0x59b670e9fA9D0A427751Af201D676719a970857b 0 \
     * DEG DEG43114 18 0x99bbA657f2BbC93c02D617f8bA121cB8Fc104Acf 2 \
     * LOST LOST43114 18 0x162A433068F51e18b7d13932F27e66a3f99E6890 0 \
     * SLIME SLIME43114 18 0x2B0d36FACD61B71CC05ab8F3D2355ec3631C0dd5 0 \
     * USDC USDC43114 6 0xD5ac451B0c50B9476107823Af206eD814a2e2580 0 \
     * USDt USDt43114 6 0x38a024C0b412B9d1db8BC398140D00F5Af3093D4 0 \
     * @param   _symbol  Symbol of the token
     * @param   _tokenAddress  Address of the token
     * @param   _srcChainId  Source Chain id
     * @param   _decimals  Decimals of the token
     * @param   _fee  Bridge Fee
     * @param   _gasSwapRatio  Amount of token to swap per ALOT
     */
    function addTokenInternal(
        bytes32 _symbol,
        address _tokenAddress,
        uint32 _srcChainId,
        uint8 _decimals,
        ITradePairs.AuctionMode, // not relevant in the mainnet
        uint256 _fee,
        uint256 _gasSwapRatio
    ) internal override {
        //In the mainnet sourceChain should be the same as the chainId specified in the contract
        require(_srcChainId == chainId, "P-SCEM-01");

        super.addTokenInternal(
            _symbol,
            _tokenAddress,
            _srcChainId,
            _decimals,
            ITradePairs.AuctionMode.OFF, // Auction Mode is ignored as it is irrelevant in the Mainnet
            _fee,
            _gasSwapRatio
        );
        // Tokens can't be used to swap gas by default
        setBridgeParamInternal(_symbol, _fee, _gasSwapRatio, _symbol == bytes32("ALOT") ? true : false);
        if (_symbol != native) {
            require(_tokenAddress != address(0), "P-ZADDR-01");
            IERC20MetadataUpgradeable assetIERC20 = IERC20MetadataUpgradeable(_tokenAddress);
            require(UtilsLibrary.stringToBytes32(assetIERC20.symbol()) == _symbol, "P-TSDM-01");
            require(assetIERC20.decimals() == _decimals, "P-TDDM-01");
            tokenMap[_symbol] = IERC20MetadataUpgradeable(_tokenAddress);
        }
    }

    /**
     * @notice  Removes the given token from the portfolio
     * @dev     Only callable by admin and portfolio should be paused. Makes sure there are no
     * in-flight deposit/withdraw messages
     * @param   _symbol  Symbol of the token
     */
    function removeToken(bytes32 _symbol, uint32) public virtual override onlyRole(DEFAULT_ADMIN_ROLE) {
        if (tokenList.contains(_symbol) && _symbol != native) {
            // Native doesn't exist in tokenMap as it is not an ERC20
            require(tokenMap[_symbol].balanceOf(address(this)) == 0, "P-NZBL-01");
            delete (tokenMap[_symbol]);
        }
        super.removeToken(_symbol, chainId); // Can only remove the local chain's tokens in the mainnet
    }

    /**
     * @notice  Frontend function to get the ERC20 token
     * @param   _symbol  symbol of the token
     * @return  IERC20Upgradeable  ERC20 token
     */
    function getToken(bytes32 _symbol) external view override returns (IERC20Upgradeable) {
        return tokenMap[_symbol];
    }

    /**
     * @param   _from  Address of the depositor
     * @param   _bridge  Enum for bridge type
     */
    function depositNative(
        address payable _from,
        IPortfolioBridge.BridgeProvider _bridge
    ) external payable override whenNotPaused nonReentrant {
        require(_from == msg.sender || msg.sender == address(this), "P-OOWN-02"); // calls made by super.receive()
        deposit(_from, native, msg.value, _bridge);
    }

    /**
     * @param   _from  Address of the depositor
     * @param   _symbol  Symbol of the token
     * @param   _quantity  Amount of token to deposit
     * @param   _bridge  Enum for bridge type
     */
    function depositToken(
        address _from,
        bytes32 _symbol,
        uint256 _quantity,
        IPortfolioBridge.BridgeProvider _bridge
    ) external whenNotPaused nonReentrant {
        require(
            _from == msg.sender ||
                msg.sender == address(this) || // allow calls made by depositTokenFromContract
                trustedContracts[msg.sender], // keeping it for backward compatibility
            "P-OODT-01"
        );
        require(tokenList.contains(_symbol), "P-ETNS-01");
        require(_quantity <= tokenMap[_symbol].balanceOf(_from), "P-NETD-01");

        tokenMap[_symbol].safeTransferFrom(_from, address(this), _quantity);
        deposit(_from, _symbol, _quantity, _bridge);
    }

    function deposit(
        address _from,
        bytes32 _symbol,
        uint256 _quantity,
        IPortfolioBridge.BridgeProvider _bridge
    ) private {
        require(allowDeposit, "P-NTDP-01");
        require(_quantity > this.getMinDepositAmount(_symbol), "P-DUTH-01");
        require(!bannedAccounts.isBanned(_from), "P-BANA-01");
        BridgeParams storage bridgeParam = bridgeParams[_symbol];
        bridgeFeeCollected[_symbol] += bridgeParam.fee;
        emitPortfolioEvent(_from, _symbol, _quantity, bridgeParam.fee, Tx.DEPOSIT);
        // Nonce to be assigned in PBridge
        portfolioBridge.sendXChainMessage(
            _bridge,
            XFER(0, Tx.DEPOSIT, _from, _symbol, _quantity - bridgeParam.fee, block.timestamp)
        );
    }

    /**
     * @notice  Sets the bridge provider fee & gasSwapRatio per ALOT for the given token and usedForGasSwap flag
     * @dev     Called by PortfolioSub.initialize() as well as setBridgeParam()
     * We can never set a token gasSwapRatio to 0 in the mainnet
     * @param   _symbol  Symbol of the token
     * @param   _fee  Fee to be set
     * @param   _gasSwapRatio  Amount of token to swap per ALOT. Used to control min deposit amount in the mainnet
     * Because we want users to deposit more than whats going to be swapped out for them to end up a portion of their
     * token in their subnet portfolio after the swap. gasSwapRatio will be updated daily with an offchain app with
     * the current market pricesexcept for ALOT which is always 1 to 1. Daily update is sufficient as it is multiplied
     * by 1.9 to calculate the min deposit Amount.
     * _usedForGasSwap  not used in the mainnet
     */
    function setBridgeParamInternal(bytes32 _symbol, uint256 _fee, uint256 _gasSwapRatio, bool) internal override {
        require(_gasSwapRatio > 0, "P-GSRO-01");
        super.setBridgeParamInternal(_symbol, _fee, _gasSwapRatio, false);
    }

    /**
     * @notice  Minimum Transaction Amount in deposits
     * @dev     The user has to have at least 1.9 as much for bridge fee (if set) + any potential gas token swap
     * For ALOT this will be 1.9 by default, so we are allowing 2 ALOT to be deposited easily
     * @param   _symbol  Symbol of the token
     * @return  uint256  Minimum DepositAmount
     */
    function getMinDepositAmount(bytes32 _symbol) external view returns (uint256) {
        BridgeParams storage bridgeParam = bridgeParams[_symbol];
        return ((bridgeParam.fee + bridgeParam.gasSwapRatio) * minDepositMultiplier) / 10;
    }

    /**
     * @notice  Sets the minimum deposit multiplier
     * @dev     The multiplier entered will always be divided by 10
     * @param   _minDepositMultiplier  multiplier for minimum deposits
     */
    function setMinDepositMultiplier(uint8 _minDepositMultiplier) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_minDepositMultiplier >= 10, "P-MDML-01"); // min 10 ==> 10/10
        emit ParameterUpdated(bytes32("PortfolioMain"), "P-MINDEP-MULT", minDepositMultiplier, _minDepositMultiplier);
        minDepositMultiplier = _minDepositMultiplier;
    }

    /**
     * @notice  List of Minimum Deposit Amounts
     * @dev     The user has to have at least 1.9 as much for bridge fee (if set) + any potential gas token swap
     * @return  bytes32[]  tokens uint256[] amounts  .
     */
    function getMinDepositAmounts() external view returns (bytes32[] memory, uint256[] memory) {
        bytes32[] memory tokens = new bytes32[](tokenList.length());
        uint256[] memory amounts = new uint256[](tokenList.length());

        for (uint256 i = 0; i < tokenList.length(); ++i) {
            BridgeParams storage bridgeParam = bridgeParams[tokenList.at(i)];
            tokens[i] = tokenList.at(i);
            amounts[i] = ((bridgeParam.fee + bridgeParam.gasSwapRatio) * minDepositMultiplier) / 10;
        }
        return (tokens, amounts);
    }

    /**
     * @notice  Adds the given contract to trusted contracts in order to provide excluded functionality
     * @dev     Only callable by admin
     * @param   _contract  Address of the contract to be added
     * @param   _organization  Organization of the contract to be added
     */
    function addTrustedContract(
        address _contract,
        string calldata _organization
    ) external override onlyRole(DEFAULT_ADMIN_ROLE) {
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
     * @notice  Allows deposits from trusted contracts
     * @dev     Used by Avalaunch for DD deposits and Vesting Contracts.
     * Keeping for backward compatibility instead of using ON_BEHALF_ROLE.
     * @param   _from  Address of the depositor
     * @param   _symbol  Symbol of the token
     * @param   _quantity  Amount of token to deposit
     */
    function depositTokenFromContract(address _from, bytes32 _symbol, uint256 _quantity) external override {
        require(trustedContracts[msg.sender], "P-AOTC-01"); // keeping it for backward compatibility
        this.depositToken(_from, _symbol, _quantity, portfolioBridge.getDefaultBridgeProvider());
    }

    /**
     * @notice  Sets banned accounts contract address
     * @param  _address  address of the banned accounts contract
     */
    function setBannedAccounts(address _address) external onlyRole(DEFAULT_ADMIN_ROLE) {
        bannedAccounts = IBannedAccounts(_address);
    }

    /**
     * @return  IBannedAccounts  banned accounts contract
     */
    function getBannedAccounts() external view returns (IBannedAccounts) {
        return bannedAccounts;
    }

    /**
     * @notice  Processes the message coming from the bridge
     * @dev     Only process WITHDRAW or RECOVERFUNDS messages as it is the only messages that can be sent to the
     * portfolio main. Even when the contract is paused, this method is allowed for the messages that
     * are in flight to complete properly. Pause for upgrade, then wait to make sure no messages are in
     * flight then upgrade
     * @param   _trader  Address of the trader
     * @param   _symbol  Symbol of the token in form of _symbol + chainId
     * @param   _quantity  Amount of token to be withdrawn
     * @param   _transaction  Transaction type
     */
    function processXFerPayload(
        address _trader,
        bytes32 _symbol,
        uint256 _quantity,
        Tx _transaction
    ) external override nonReentrant onlyRole(PORTFOLIO_BRIDGE_ROLE) {
        if (_transaction == Tx.WITHDRAW || _transaction == Tx.RECOVERFUNDS) {
            require(_trader != address(0), "P-ZADDR-02");
            require(_quantity > 0, "P-ZETD-01");
            if (_symbol == native) {
                //Withdraw native
                // solhint-disable-next-line avoid-low-level-calls
                (bool success, ) = _trader.call{value: _quantity}("");
                require(success, "P-WNFA-01");
            } else {
                //Withdraw Token
                //We don't check the AuctionMode of the token in the mainnet. If Subnet allows the message to be sent
                //Then the token is no longer is auction
                require(tokenList.contains(_symbol), "P-ETNS-02");
                tokenMap[_symbol].safeTransfer(_trader, _quantity);
            }
            emitPortfolioEvent(_trader, _symbol, _quantity, 0, _transaction);
        } else {
            revert("P-PTNS-01");
        }
    }

    /**
     * @notice  Allows the owner to withdraw the fees collected from the bridge
     * @dev     Collect fees to pay for the bridge as native token
     * @dev     Only the owner can call this function
     * @param   _symbols  Array of symbols of tokens to withdraw
     */
    function collectBridgeFees(bytes32[] calldata _symbols) external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i = 0; i < _symbols.length; ++i) {
            require(tokenList.contains(_symbols[i]), "P-ETNS-02");
            uint256 bcf = bridgeFeeCollected[_symbols[i]];
            if (bcf > 0) {
                bridgeFeeCollected[_symbols[i]] = 0;
                tokenMap[_symbols[i]].safeTransfer(msg.sender, bcf);
            }
        }
    }

    /**
     * @notice  Allows the owner to withdraw the fees collected in AVAX from the bridge
     * @dev     Collect fees to pay for the bridge as native token
     * @dev     Only the owner can call this function
     */
    function collectNativeBridgeFees() external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 bcf = bridgeFeeCollected[native];
        bridgeFeeCollected[native] = 0;
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = msg.sender.call{value: bcf}("");
        require(success, "P-CNFF-01");
    }

    /**
     * @notice  Wrapper for emit event
     * @param   _trader  Address of the trader
     * @param   _symbol  Symbol of the token
     * @param   _quantity  Amount of token used in the transaction
     * @param   _feeCharged  Fee charged for the transaction
     * @param   transaction  Transaction type
     */
    function emitPortfolioEvent(
        address _trader,
        bytes32 _symbol,
        uint256 _quantity,
        uint256 _feeCharged,
        Tx transaction
    ) private {
        emit PortfolioUpdated(transaction, _trader, _symbol, _quantity, _feeCharged, 0, 0);
    }
}
