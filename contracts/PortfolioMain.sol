// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";

import "./Portfolio.sol";
import "./interfaces/ITradePairs.sol";
import "./interfaces/IPortfolioMain.sol";
import "./interfaces/IBannedAccounts.sol";
import "./interfaces/IWrappedToken.sol";

/**
 * @title Mainnet Portfolio
 * @dev This contract is the gateway for deposits to the Dexalot L1(subnet).
 * It also processes withdrawal messages received from Dexalot L1 and releases the funds
 * to the requester's wallet
 * ExchangeMain needs to have DEFAULT_ADMIN_ROLE on PortfolioMain.
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

contract PortfolioMain is Portfolio, IPortfolioMain {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.Bytes32Set;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // version
    bytes32 public constant VERSION = bytes32("2.6.0");

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
    bool public nativeDepositsRestricted;
    bytes32 public wrappedNative;

    /**
     * @notice  Initializes the PortfolioMain contract
     * @param   _native  Symbol of the native token
     * @param   _chainId  Current chainId of the Portfolio
     */
    function initialize(bytes32 _native, uint32 _chainId) public override initializer {
        Portfolio.initialize(_native, _chainId);
        minDepositMultiplier = 19; // 19/10 1.9 times
        // Always Add native with 0 Bridge Fee and 0.01 gasSwapRatio (1 AVAX for 1 ALOT)
        // This value will be adjusted periodically
        TokenDetails memory details = TokenDetails(
            18,
            address(0),
            ITradePairs.AuctionMode.OFF, // Auction Mode is ignored as it is irrelevant in the Mainnet
            _chainId,
            18,
            native,
            bytes32(0),
            native,
            false
        );
        addTokenInternal(details, 0, 1 * 10 ** 16);
    }

    /**
     * @notice  Receive function to receive native tokens
     * @dev     If sender is the wrappedNative token, do not process as a deposit
     *          since it is a withdrawal from the wrappedNative token
     */
    function handleReceive() internal override {
        if (wrappedNative != 0 && msg.sender == address(tokenMap[wrappedNative])) return;
        super.handleReceive();
    }

    /**
     * @notice  Adds the given token to the portfolio
     * @dev     Only callable by admin.
     * We don't allow tokens with the same symbols but different addresses.
     * Native symbol is also added by default with 0 address.
     * @param   _symbol  Symbol of the token
     * @param   _tokenAddress  Address of the token
     * @param   _decimals  Decimals of the token
     * @param   _fee  Bridge Fee
     * @param   _gasSwapRatio  Amount of token to swap per ALOT

     */
    function addToken(
        bytes32 _symbol,
        address _tokenAddress,
        uint8 _decimals,
        uint8 _l1Decimals,
        uint256 _fee,
        uint256 _gasSwapRatio
    ) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        TokenDetails memory details = TokenDetails(
            _decimals,
            _tokenAddress,
            // Auction Mode is ignored as it is irrelevant in the Mainnet
            ITradePairs.AuctionMode.OFF,
            //always add with the chain id of the Portfolio
            chainId,
            _l1Decimals,
            _symbol, //symbol
            bytes32(0), //symbolId
            _symbol, //sourceChainSymbol, it is always equal to symbol for PortfolioMain
            false
        );

        addTokenInternal(details, _fee, _gasSwapRatio);
        if (_symbol == native) {
            nativeDepositsRestricted = false;
        }
    }

    /**
     * @notice  Internal function that implements the token addition
     * @dev     The token tis not added o the PortfolioBridgeMain unlike in the Dexalot L1(subnet)
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
     * @param   _details  Token Details
     * @param   _fee  Bridge Fee
     * @param   _gasSwapRatio  Amount of token to swap per ALOT
     */
    function addTokenInternal(TokenDetails memory _details, uint256 _fee, uint256 _gasSwapRatio) internal override {
        super.addTokenInternal(_details, _fee, _gasSwapRatio);
        // Tokens can't be used to swap gas by default
        setBridgeParamInternal(_details.symbol, _fee, _gasSwapRatio, _details.symbol == bytes32("ALOT") ? true : false);
        if (_details.symbol != native) {
            require(_details.tokenAddress != address(0), "P-ZADDR-01");
            IERC20MetadataUpgradeable assetIERC20 = IERC20MetadataUpgradeable(_details.tokenAddress);
            require(UtilsLibrary.stringToBytes32(assetIERC20.symbol()) == _details.symbol, "P-TSDM-01");
            require(assetIERC20.decimals() == _details.decimals, "P-TDDM-01");
            tokenMap[_details.symbol] = IERC20MetadataUpgradeable(_details.tokenAddress);
        }
    }

    /**
     * @notice  Removes the given token from the portfolio. Native token removal is allowed if only the wrapped
     * version of the token needs to be supported.
     * @dev     Only callable by admin and portfolio should be paused. Makes sure there are no
     * in-flight deposit/withdraw messages
     * @param   _symbol  Symbol of the token
     */
    function removeToken(bytes32 _symbol, uint32) public virtual override onlyRole(DEFAULT_ADMIN_ROLE) {
        TokenDetails memory tokenDetails = tokenDetailsMap[_symbol];
        if (tokenDetails.symbol != bytes32(0)) {
            require(
                _symbol == native ? address(this).balance == 0 : tokenMap[_symbol].balanceOf(address(this)) == 0,
                "P-NZBL-01"
            );
            // If native is removed, native deposits gets restricted by default
            if (_symbol == native) {
                nativeDepositsRestricted = true;
            } else {
                // Native doesn't exist in tokenMap as it is not an ERC20
                delete (tokenMap[_symbol]);
            }
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
        TokenDetails memory tokenDetails = tokenDetailsMap[nativeDepositsRestricted ? wrappedNative : native];
        uint256 quantity = UtilsLibrary.truncateQuantity(msg.value, tokenDetails.decimals, tokenDetails.l1Decimals);

        if (nativeDepositsRestricted) {
            if (wrappedNative == bytes32(0)) {
                revert("P-NDNS-01");
            }
            IWrappedToken wrappedToken = IWrappedToken(address(tokenMap[wrappedNative]));
            wrappedToken.deposit{value: quantity}();
        }

        // refund the extra amount
        if (msg.value - quantity > 0) {
            // solhint-disable-next-line avoid-low-level-calls
            (bool success, ) = _from.call{value: msg.value - quantity}("");
            require(success, "P-NQTR-01");
        }
        deposit(_from, tokenDetails.symbol, quantity, _bridge, tokenDetails.decimals, tokenDetails.l1Decimals);
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

        // Truncate quantity if l1Decimals < decimals
        TokenDetails memory tokenDetails = tokenDetailsMap[_symbol];
        _quantity = UtilsLibrary.truncateQuantity(_quantity, tokenDetails.decimals, tokenDetails.l1Decimals);

        tokenMap[_symbol].safeTransferFrom(_from, address(this), _quantity);
        deposit(_from, _symbol, _quantity, _bridge, tokenDetails.decimals, tokenDetails.l1Decimals);
    }

    function deposit(
        address _from,
        bytes32 _symbol,
        uint256 _quantity,
        IPortfolioBridge.BridgeProvider _bridge,
        uint8 _fromDecimals,
        uint8 _toDecimals
    ) private {
        require(allowDeposit, "P-NTDP-01");
        require(_quantity > this.getMinDepositAmount(_symbol), "P-DUTH-01");
        require(!bannedAccounts.isBanned(_from), "P-BANA-01");
        BridgeParams memory bridgeParam = bridgeParams[_symbol];
        if (bridgeParam.fee > 0) {
            bridgeFeeCollected[_symbol] = bridgeFeeCollected[_symbol] + bridgeParam.fee;
        }
        emitPortfolioEvent(_from, _symbol, _quantity, bridgeParam.fee, Tx.DEPOSIT);

        // Nonce to be assigned in PBridge
        portfolioBridge.sendXChainMessage(
            portfolioBridge.getDefaultDestinationChain(),
            _bridge,
            XFER(
                0,
                Tx.DEPOSIT,
                UtilsLibrary.addressToBytes32(_from),
                _symbol,
                scaleQuantity(_quantity - bridgeParam.fee, _fromDecimals, _toDecimals),
                block.timestamp,
                bytes18(0)
            ),
            _from
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
     * token in their Dexalot L1(subnet) portfolio after the swap. gasSwapRatio will be updated daily with an offchain app with
     * the current market pricesexcept for ALOT which is always 1 to 1. Daily update is sufficient as it is multiplied
     * by 1.9 to calculate the min deposit Amount.
     * _usedForGasSwap  not used in the mainnet
     */
    function setBridgeParamInternal(bytes32 _symbol, uint256 _fee, uint256 _gasSwapRatio, bool) internal override {
        require(_gasSwapRatio > 0, "P-GSRO-01");

        TokenDetails memory token = tokenDetailsMap[_symbol];
        // Ensure fee is correctly scaled if l1Decimals < decimals
        if (token.l1Decimals < token.decimals) {
            require(_fee % 10 ** (token.decimals - token.l1Decimals) == 0, "P-SBPD-01");
        }
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
     * @dev     WITHDRAW message is the only message that can be sent to portfolioMain.
     * Even when the contract is paused, this method is allowed for the messages that
     * are in flight to complete properly. Pause for upgrade, then wait to make sure no messages are in
     * flight then upgrade
     * @param   _xfer  Transfer message
     */
    function processXFerPayload(
        IPortfolio.XFER calldata _xfer
    ) external override nonReentrant onlyRole(PORTFOLIO_BRIDGE_ROLE) {
        if (_xfer.transaction == Tx.WITHDRAW) {
            address trader = UtilsLibrary.bytes32ToAddress(_xfer.trader);
            require(trader != address(0), "P-ZADDR-02");
            require(_xfer.quantity > 0, "P-ZETD-01");
            TokenDetails memory tokenDetails = tokenDetailsMap[_xfer.symbol];
            uint256 quantity = scaleQuantity(_xfer.quantity, tokenDetails.l1Decimals, tokenDetails.decimals);

            bool unwrapToken = processOptions(_xfer);

            if (_xfer.symbol == native || unwrapToken) {
                //Withdraw native
                // solhint-disable-next-line avoid-low-level-calls
                (bool success, ) = trader.call{value: quantity}("");
                require(success, "P-WNFA-01");
            } else {
                //Withdraw Token
                //We don't check the AuctionMode of the token in the mainnet. If Dexalot L1(subnet) allows the message to be sent
                //Then the token is no longer is auction
                tokenMap[_xfer.symbol].safeTransfer(trader, quantity);
            }
            emitPortfolioEvent(trader, _xfer.symbol, quantity, 0, _xfer.transaction);
        } else {
            revert("P-PTNS-02");
        }
    }

    function processOptions(IPortfolio.XFER calldata _xfer) private returns (bool unwrapToken) {
        if (_xfer.customdata[0] == 0) {
            return false;
        }

        unwrapToken =
            UtilsLibrary.isOptionSet(_xfer.customdata[0], uint8(Options.UNWRAP)) &&
            _xfer.symbol == wrappedNative;

        if (unwrapToken) {
            IWrappedToken wrappedToken = IWrappedToken(address(tokenMap[wrappedNative]));
            wrappedToken.withdraw(_xfer.quantity);
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
     * @notice Set the wrapped native token address
     * @dev Only callable by admin
     * @param _wrappedNative Address of the wrapped native token
     */
    function setWrappedNative(bytes32 _wrappedNative) external onlyRole(DEFAULT_ADMIN_ROLE) {
        wrappedNative = _wrappedNative;
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
        emit PortfolioUpdated(transaction, _trader, _symbol, _quantity, _feeCharged, 0, 0, _trader);
    }

    function scaleQuantity(uint256 _quantity, uint8 _fromDecimals, uint8 _toDecimals) private pure returns (uint256) {
        if (_fromDecimals == _toDecimals) {
            return _quantity;
        }
        if (_fromDecimals > _toDecimals) {
            return _quantity / (10 ** (_fromDecimals - _toDecimals));
        }
        return _quantity * (10 ** (_toDecimals - _fromDecimals));
    }
}
