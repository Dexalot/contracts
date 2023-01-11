// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

/**
 * @title Interface of TradePairs
 */

// The code in this file is part of Dexalot project.
// Please see the LICENSE.txt file for licensing info.
// Copyright 2022 Dexalot.

interface ITradePairs {
    /**
     * @notice  Order is the data structure defining an order on Dexalot.
     * @dev     If there are multiple partial fills, the new partial fill `price * quantity`
     * is added to the current value in `totalamount`. Average execution price can be
     * quickly calculated by `totalamount / quantityfilled` regardless of the number of
     * partial fills at different prices \
     * `totalFee` is always in terms of received(incoming) currency. ie. if Buy ALOT/AVAX,
     * fee is paid in ALOT, if Sell ALOT/AVAX, fee is paid in AVAX
     * @param   id  unique order id assigned by the contract (immutable)
     * @param   clientOrderId  client order id given by the sender of the order as a reference (immutable)
     * @param   tradePairId  client order id given by the sender of the order as a reference (immutable)
     * @param   price  price of the order entered by the trader. (0 if market order) (immutable)
     * @param   totalamount  cumulative amount in quote currency: `price* quantityfilled`
     * @param   quantity  order quantity (immutable)
     * @param   quantityfilled  cumulative quantity filled
     * @param   totalfee cumulative fee paid for the order
     * @param   traderaddress`  traders’s wallet (immutable)
     * @param   side  Order side  See #Side (immutable)
     * @param   type1  Order Type1  See #Type1 (immutable)
     * @param   type2  Order Type2  See #Type2 (immutable)
     * @param   status  Order Status  See #Status
     */
    struct Order {
        bytes32 id;
        bytes32 clientOrderId;
        bytes32 tradePairId;
        uint256 price;
        uint256 totalAmount;
        uint256 quantity;
        uint256 quantityFilled;
        uint256 totalFee;
        address traderaddress;
        Side side;
        Type1 type1;
        Type2 type2;
        Status status;
    }

    /**
     * @notice  TradePair is the data structure defining a trading pair on Dexalot.
     * @param   baseSymbol  symbol of the base asset
     * @param   quoteSymbol  symbol of the quote asset
     * @param   buyBookId  buy book id for the trading pair
     * @param   sellBookId  sell book id for the trading pair
     * @param   minTradeAmount  minimum trade amount
     * @param   maxTradeAmount  maximum trade amount
     * @param   auctionPrice  price during an auction
     * @param   auctionMode  current auction mode of the trading pair
     * @param   makerRate fee rate for a maker order for the trading pair
     * @param   takerRate fee rate for taker order for the trading pair
     * @param   baseDecimals  evm decimals of the base asset
     * @param   baseDisplayDecimals  display decimals of the base Asset. Quantity increment
     * @param   quoteDecimals  evm decimals of the quote asset
     * @param   quoteDisplayDecimals  display decimals of the quote Asset. Price increment
     * @param   allowedSlippagePercent allowed slippage percentage for the trading pair
     * @param   addOrderPaused true/false pause state for adding orders on the trading pair
     * @param   pairPaused true/false pause state of the trading pair as a whole
     * @param   postOnly true/false  Post Only orders type2 = PO allowed when true
     */
    struct TradePair {
        bytes32 baseSymbol;
        bytes32 quoteSymbol;
        bytes32 buyBookId;
        bytes32 sellBookId;
        uint256 minTradeAmount;
        uint256 maxTradeAmount;
        uint256 auctionPrice;
        AuctionMode auctionMode;
        uint8 makerRate;
        uint8 takerRate;
        uint8 baseDecimals;
        uint8 baseDisplayDecimals;
        uint8 quoteDecimals;
        uint8 quoteDisplayDecimals;
        uint8 allowedSlippagePercent;
        bool addOrderPaused;
        bool pairPaused;
        bool postOnly;
    }

    function pause() external;

    function unpause() external;

    function pauseTradePair(bytes32 _tradePairId, bool _pairPause) external;

    function pauseAddOrder(bytes32 _tradePairId, bool _allowAddOrder) external;

    function postOnly(bytes32 _tradePairId, bool _postOnly) external;

    function addTradePair(
        bytes32 _tradePairId,
        bytes32 _baseSymbol,
        uint8 _baseDisplayDecimals,
        bytes32 _quoteSymbol,
        uint8 _quoteDisplayDecimals,
        uint256 _minTradeAmount,
        uint256 _maxTradeAmount,
        AuctionMode _mode
    ) external;

    function removeTradePair(bytes32 _tradePairId) external;

    function getTradePairs() external view returns (bytes32[] memory);

    function setMinTradeAmount(bytes32 _tradePairId, uint256 _minTradeAmount) external;

    function setMaxTradeAmount(bytes32 _tradePairId, uint256 _maxTradeAmount) external;

    function addOrderType(bytes32 _tradePairId, Type1 _type) external;

    function removeOrderType(bytes32 _tradePairId, Type1 _type) external;

    function setDisplayDecimals(bytes32 _tradePairId, uint8 _displayDecimals, bool _isBase) external;

    function getTradePair(bytes32 _tradePairId) external view returns (TradePair memory);

    function updateRate(bytes32 _tradePairId, uint8 _rate, RateType _rateType) external;

    function setAllowedSlippagePercent(bytes32 _tradePairId, uint8 _allowedSlippagePercent) external;

    function getNBook(
        bytes32 _tradePairId,
        Side _side,
        uint256 _nPrice,
        uint256 _nOrder,
        uint256 _lastPrice,
        bytes32 _lastOrder
    ) external view returns (uint256[] memory, uint256[] memory, uint256, bytes32);

    function getOrder(bytes32 _orderId) external view returns (Order memory);

    function getOrderByClientOrderId(address _trader, bytes32 _clientOrderId) external view returns (Order memory);

    function addOrder(
        address _trader,
        bytes32 _clientOrderId,
        bytes32 _tradePairId,
        uint256 _price,
        uint256 _quantity,
        Side _side,
        Type1 _type1,
        Type2 _type2
    ) external;

    function cancelOrder(bytes32 _orderId) external;

    function cancelAllOrders(bytes32[] memory _orderIds) external;

    function cancelReplaceOrder(bytes32 _orderId, bytes32 _clientOrderId, uint256 _price, uint256 _quantity) external;

    function setAuctionMode(bytes32 _tradePairId, AuctionMode _mode) external;

    function setAuctionPrice(bytes32 _tradePairId, uint256 _price) external;

    function unsolicitedCancel(bytes32 _tradePairId, bool _isBuyBook, uint256 _maxCount) external;

    function getBookId(bytes32 _tradePairId, Side _side) external view returns (bytes32);

    function matchAuctionOrder(bytes32 _takerOrderId, uint256 _maxNbrOfFills) external returns (uint256);

    function getOrderRemainingQuantity(bytes32 _orderId) external view returns (uint256);

    /**
     * @notice  Order Side
     * @dev     0: BUY    – BUY \
     * 1: SELL   – SELL
     */
    enum Side {
        BUY,
        SELL
    }

    /**
     * @notice  Order Type1
     * @dev     Type1 = LIMIT is always allowed. MARKET is enabled pair by pair basis based on liquidity. \
     * 0: MARKET – Order will immediately match with the best Bid/Ask  \
     * 1: LIMIT  – Order that may execute at limit price or better at the order entry. The remaining quantity
     * will be entered in the order book\
     * 2: STOP   –  For future use \
     * 3: STOPLIMIT  –  For future use \
     */
    enum Type1 {
        MARKET,
        LIMIT,
        STOP,
        STOPLIMIT
    }

    /**
     * @notice  Order Status
     * @dev     And order automatically gets the NEW status once it is committed to the blockchain \
     * 0: NEW      – Order is in the orderbook with no trades/executions \
     * 1: REJECTED – For future use \
     * 2: PARTIAL  – Order filled partially and it remains in the orderbook until FILLED/CANCELED \
     * 3: FILLED   – Order filled fully and removed from the orderbook \
     * 4: CANCELED – Order canceled and removed from the orderbook. PARTIAL before CANCELED is allowed \
     * 5: EXPIRED  – For future use \
     * 6: KILLED   – For future use
     */
    enum Status {
        NEW,
        REJECTED,
        PARTIAL,
        FILLED,
        CANCELED,
        EXPIRED,
        KILLED
    }
    /**
     * @notice  Rate Type
     * @dev     Maker Rates are typically lower than taker rates \
     * 0: MAKER   – MAKER \
     * 1: TAKER   – TAKER
     */
    enum RateType {
        MAKER,
        TAKER
    }

    /**
     * @notice  Order Type2 to be used in conjunction with when Type1= LIMIT
     * @dev     GTC is the default Type2 \
     * 0: GTC  – Good Till Cancel \
     * 1: FOK  – Fill or Kill. The order is required to get an immediate FILLED status or reverts with *T-FOKF-01*.
     * If reverted, no transaction is committed to the blockchain) \
     * 2: IOC  – Immediate or Cancel. The order is required to get either a FILLED status or a PARTIAL
     * status fallowed by an automatic CANCELED. If PARTIAL, the remaining will not go in the orderbook) \
     * 3: PO   – Post Only. The order is required to go in the orderbook without any fills or reverts with
     * T-T2PO-01. If reverted, no transaction is committed to the blockchain)
     */
    enum Type2 {
        GTC,
        FOK,
        IOC,
        PO
    }
    /**
     * @notice  Auction Mode of a token
     * @dev     Only the baseToken of a TradePair can be in an auction mode other than OFF
     * When a token is in auction, it can not be withdrawn or transfeered as a Protection againt rouge AMM Pools
     * popping up during auction and distorting the fair auction price. \
     * Auction tokens can only be deposited by the contracts in the addTrustedContracts list. They are currently
     * Avalaunch and Dexalot TokenVesting contracts. These contracts allow the deposits to Dexalot Discovery Auction
     * before TGE
     * ***Transitions ***
     * AUCTION_ADMIN enters the tradepair in PAUSED mode \
     * Changes it to OPEN at pre-announced auction start date/time \
     * Changes it to CLOSING at pre-announced Randomized Auction Closing Sequence date/time
     * ExchangeMain.flipCoin() are called for the randomization \
     * Changes it to MATCHING when the flipCoin condition is satisfied. And proceeds with setting the auction Price
     * and ExchangeSub.matchAuctionOrders until all the crossed orders are matched and removed from the orderbook \
     * Changes it to LIVETRADING if pre-announced token release date/time is NOT reached, so regular trading can start
     * without allowing tokens to be retrieved/transferred  \
     * Changes it to OFF when the pre-announced token release time is reached. Regular trading in effect and tokens
     * can be withdrawn or transferred \
     * 0: OFF  – Used for the Regular Listing of a token. Default \
     * 1: LIVETRADING  – Token is in auction. Live trading in effect but tokens can't be withdrawn or transferred \
     * 2: OPEN  – Ongoing auction. Orders can be entered/cancelled freely. Orders will not match. \
     * 3: CLOSING   – Randomized Auction Closing Sequence before the auction is closed, new orders/cancels allowed
     * but auction can close at any time \
     * 4: PAUSED   – Auction paused, no new orders/cancels allowed \
     * 5: MATCHING   – Auction closed. Final Auction Price is determined and set. No new orders/cancels allowed.
     * orders matching starts \
     * 6: RESTRICTED   – Functionality Reserved for future use \
     */
    enum AuctionMode {
        OFF,
        LIVETRADING,
        OPEN,
        CLOSING,
        PAUSED,
        MATCHING,
        RESTRICTED
    }

    event NewTradePair(
        uint8 version,
        bytes32 pair,
        uint8 basedisplaydecimals,
        uint8 quotedisplaydecimals,
        uint256 mintradeamount,
        uint256 maxtradeamount
    );

    /**
     * @notice  Emits a given order's latest state
     * @dev     If there are multiple partial fills, the new partial fill `price * quantity`
     * is added to the current value in `totalamount`. Average execution price can be
     * quickly calculated by `totalamount / quantityfilled` regardless of the number of
     * partial fills at different prices \
     * `totalfee` is always in terms of received(incoming) currency. ie. if Buy ALOT/AVAX,
     * fee is paid in ALOT, if Sell ALOT/AVAX , fee is paid in AVAX \
     * **Note**: The execution price will always be equal or better than the Order price.
     * @param   version  event version
     * @param   traderaddress  traders’s wallet (immutable)
     * @param   pair  traded pair. ie. ALOT/AVAX in bytes32 (immutable)
     * @param   orderId  unique order id assigned by the contract (immutable)
     * @param   clientOrderId  client order id given by the sender of the order as a reference (immutable)
     * @param   price  price of the order entered by the trader. (0 if market order) (immutable)
     * @param   totalamount  cumulative amount in quote currency: `price * quantityfilled`
     * @param   quantity  order quantity (immutable)
     * @param   side  Order Side  See #Side (immutable)
     * @param   type1  Order Type1  See #Type1 (immutable)
     * @param   type2  Order Type2  See #Type2 (immutable)
     * @param   status Order Status See #Status
     * @param   quantityfilled  cumulative quantity filled
     * @param   totalfee cumulative fee paid for the order
     */
    event OrderStatusChanged(
        uint8 version,
        address indexed traderaddress,
        bytes32 indexed pair,
        bytes32 orderId,
        bytes32 clientOrderId,
        uint256 price,
        uint256 totalamount,
        uint256 quantity,
        Side side,
        Type1 type1,
        Type2 type2,
        Status status,
        uint256 quantityfilled,
        uint256 totalfee
    );

    /**
     * @notice  Emits the Executed/Trade Event showing
     * @dev     The side of the taker order can be used to identify
     * the fee unit. If takerSide = 1, then the fee is paid by the maker in base
     * currency and the fee paid by the taker in quote currency. If takerSide = 0
     * then the fee is paid by the maker in quote currency and the fee is paid by
     * the taker in base currency
     * @param   version  event version
     * @param   pair  traded pair. ie. ALOT/AVAX in bytes32
     * @param   price  executed price
     * @param   quantity  executed quantity
     * @param   makerOrder  maker Order id
     * @param   takerOrder  taker Order id
     * @param   feeMaker  fee paid by maker
     * @param   feeTaker  fee paid by taker
     * @param   takerSide  Side of the taker order. 0 - BUY, 1- SELL
     * @param   execId  unique trade id (execution id) assigned by the contract
     * @param   addressMaker  maker traderaddress
     * @param   addressTaker  taker traderaddress
     */
    event Executed(
        uint8 version,
        bytes32 indexed pair,
        uint256 price,
        uint256 quantity,
        bytes32 makerOrder,
        bytes32 takerOrder,
        uint256 feeMaker,
        uint256 feeTaker,
        Side takerSide,
        uint256 execId,
        address indexed addressMaker,
        address indexed addressTaker
    );

    event ParameterUpdated(uint8 version, bytes32 indexed pair, string param, uint256 oldValue, uint256 newValue);
}
