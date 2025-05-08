// Anchor
pub const ANCHOR_DISCRIMINATOR: usize = 8;
pub const SOLANA_CHAIN_ID: u32 = 40168;
pub const NATIVE_VAULT_MIN_THRESHOLD: u64 = 900_000; // Rent-exempt minimum 0.000890880 SOL

// Seeds
pub const PORTFOLIO_SEED: &[u8] = b"Pfl";
pub const SOL_VAULT_SEED: &[u8] = b"Solv";
pub const SOL_USER_FUNDS_VAULT_SEED: &[u8] = b"Soufv";
pub const SPL_VAULT_SEED: &[u8] = b"Splv";
pub const SPL_USER_FUNDS_VAULT_SEED: &[u8] = b"Sufv";
pub const AIRDROP_VAULT_SEED: &[u8] = b"Adv";
pub const REMOTE_SEED: &[u8] = b"Remote";
pub const ADMIN_SEED: &[u8] = b"Admin";
pub const REBALANCER_SEED: &[u8] = b"Rebalancer";
pub const BANNED_ACCOUNT_SEED: &[u8] = b"Banned";
pub const TOKEN_DETAILS_SEED: &[u8] = b"TokenDetails";
pub const CCTRADE_ALLOWED_DEST_SEED: &[u8] = b"Cads";
// Portfolio
pub const DEFAULT_AIRDROP_AMOUNT: u64 = 10000; // two spl tranfers in lamports
pub const SOL_NATIVE_SYMBOL: &[u8; 3] = b"SOL";
// XFER
pub const XFER_SIZE: usize = 104;

// Layerzero
pub const GAS_OPTIONS: [u8; 22] = [
    0, 3, 1, 0, 17, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 26, 128,
];
pub const ENDPOINT_ID: &str = "76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6";
pub const REGISTER_OAPP: &str = "register_oapp";
pub const ENDPOINT_SEND: &str = "send";
pub const ENDPOINT_QUOTE: &str = "quote";
pub const ENDPOINT_CLEAR: &str = "clear";
pub const CLEAR_MIN_ACCOUNTS_LEN: usize = 8;
pub const ENDPOINT_SEED: &[u8] = b"Endpoint";
pub const NONCE_SEED: &[u8] = b"Nonce";
pub const PAYLOAD_HASH_SEED: &[u8] = b"PayloadHash";
pub const OAPP_SEED: &[u8] = b"OApp";
pub const EVENT_SEED: &[u8] = b"__event_authority";
pub const QUOTE_REMAINING_ACCOUNTS_COUNT: usize = 18;

// MainnetRFQ
pub const COMPLETED_SWAPS_SEED: &[u8] = b"CompletedSwaps";
pub const PENDING_SWAPS_SEED: &[u8] = b"PendingSwaps";
pub const ORDER_TYPE: &[u8] = b"Order(maker_asset: Pubkey, taker_asset: Pubkey, taker: Pubkey, maker_amount: u64, taker_amount: u64, expiry: u128, dest_trader: Pubkey, nonce: u128)";
pub const CROSS_SWAP_TYPE: &[u8] = b"XChainSwap(taker: Pubkey, dest_trader: Pubkey, maker_symbol: [u8; 32], maker_asset: Pubkey, taker_asset: Pubkey, maker_amount: u64, taker_amount: u64, nonce: u128, expiry: u128, dest_chaind_id: u64)";

// Test consts
pub const UNUSED_ADDRESS_PUBLIC_KEY: &str = "9fF9Ba5F6d119313e065D4cA68727b7Df60063aA";
pub const UNUSED_ADDRESS_PRIVATE_KEY: &str =
    "cb1ef6bc04022530f2fc0c702cff22c2fcf654dc35873c423ee6cfeeb5e715f8";
