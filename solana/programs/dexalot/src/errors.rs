use anchor_lang::prelude::*;

#[error_code]
#[derive(AnchorSerialize, AnchorDeserialize, PartialEq)]
pub enum DexalotError {
    #[msg("RF-PTNS-01: Unsupported transaction")]
    UnsupportedTransaction,
    #[msg("RF-ZETD-01: Zero xfer amount")]
    ZeroXferAmount,
    #[msg("RF-IN-02: Order already completed")]
    OrderAlreadyCompleted,
    #[msg("RF-IMV-01: Insufficient balance")]
    NotEnoughNativeBalance,
    #[msg("RF-IS-01: Invalid signer")]
    InvalidSigner,
    #[msg("RF-QE-02: Order expired")]
    OrderExpired,
    #[msg("RF-IMS-01: Invalid aggregator flow")]
    InvalidAggregatorFlow,
    #[msg("Signer not authorized.")]
    UnauthorizedSigner,
    #[msg("LZ-RECEIVE-ERROR")]
    LzReceiveError,
    #[msg("Portofolio is paused.")]
    ProgramPaused,
    #[msg("P-ZETD-01: Zero token qunatity")]
    ZeroTokenQuantity,
    #[msg("Invalid trader")]
    InvalidTrader,
    #[msg("Map entry already is already created")]
    MapEntryAlreadyCreated,
    #[msg("Invalid PDA for map entry creation")]
    InvalidPDA,
    #[msg("Map entry doesn't exist")]
    MapEntryNonExistent,
    #[msg("Accounts not provided.")]
    AccountsNotProvided,
    #[msg("Portfolio must be paused.")]
    ProgramNotPaused,
    #[msg("P-BANA-01: Banned account.")]
    AccountBanned,
    #[msg("P-NTDP-01")]
    DepositsPaused,
    #[msg("P-ETNS-02: Token not supported.")]
    TokenNotSupported,
    #[msg("P-NETD-01: Not enough spl balance")]
    NotEnoughSplTokenBalance,
    #[msg("LZ quote error")]
    LzQuoteError,
    #[msg("Paying with Lz token is not permitted.")]
    PositiveLzTokenFee,
    #[msg("Invalid mint.")]
    InvalidMint,
    #[msg("Invalid destination owner.")]
    InvalidDestinationOwner,
    #[msg("Invalid taker")]
    InvalidTaker,
    #[msg("RF-SAZ-01: Zero account provided")]
    ZeroAccount,
    #[msg("P-OODT-01: Invalid token owner")]
    InvalidTokenOwner,
    #[msg("P-NDNS-01: Native deposits not allowed")]
    NativeDepositNotAllowed,
    #[msg("XFER error occurred")]
    XFERError,
    #[msg("Destination not allowed")]
    DestinationNotAllowed,
    #[msg("Invalid LZ endpoint program")]
    InvalidLZProgram,
    #[msg("Invalid LZ receive call")]
    InvalidLzReceiveCall
}
