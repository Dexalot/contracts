use crate::consts::ANCHOR_DISCRIMINATOR;
use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace, Default)]
pub struct Portfolio {
    pub global_config: GlobalConfig,
    pub endpoint: Pubkey,
    pub bump: u8,
}

impl Portfolio {
    pub const LEN: usize = ANCHOR_DISCRIMINATOR + Portfolio::INIT_SPACE; // DISCRIMINATOR + sum of each field's len
}

#[account]
#[derive(InitSpace)]
pub struct Remote {
    pub address: [u8; 32],
    pub bump: u8,
}

impl Remote {
    pub const SIZE: usize = ANCHOR_DISCRIMINATOR + Self::INIT_SPACE;
}

#[derive(InitSpace, AnchorDeserialize, AnchorSerialize, Clone, Default, Debug)]
pub struct GlobalConfig {
    pub allow_deposit: bool,
    pub program_paused: bool,
    pub native_deposits_restricted: bool,
    pub default_chain_id: u32, // Dexalot L1
    pub airdrop_amount: u64,
    // ETH address
    pub swap_signer: [u8; 20],
    pub out_nonce: u64,
}

impl GlobalConfig {
    pub const LEN: usize = ANCHOR_DISCRIMINATOR + // discriminator
        GlobalConfig::INIT_SPACE;
}

#[account]
#[derive(InitSpace)]
pub struct Admin {}

impl Admin {
    pub const LEN: usize = ANCHOR_DISCRIMINATOR + Admin::INIT_SPACE; // discriminator_admin (u8)
}

#[account]
#[derive(InitSpace)]
pub struct Rebalancer {}

impl Rebalancer {
    pub const LEN: usize = ANCHOR_DISCRIMINATOR + Rebalancer::INIT_SPACE; // discriminator_admin (u8)
}

#[account]
#[derive(InitSpace)]
pub struct BannedAccount {
    pub reason: BanReason,
}

impl BannedAccount {
    pub const LEN: usize = ANCHOR_DISCRIMINATOR + // discriminator
        BanReason::INIT_SPACE; // reason (BanReason)
}

#[derive(
    AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, PartialEq, InitSpace, Default,
)]
pub enum BanReason {
    #[default]
    NotBanned,
    Ofac,
    Abuse,
    Terms,
}

#[account]
#[derive(Default, InitSpace)]
pub struct TokenDetails {
    pub decimals: u8,
    pub symbol: [u8; 32],
    pub token_address: Pubkey,
}

impl TokenDetails {
    pub const LEN: usize = ANCHOR_DISCRIMINATOR + TokenDetails::INIT_SPACE;
}

#[account]
#[derive(InitSpace, Debug)]
pub struct CompletedSwapsEntry {}

impl CompletedSwapsEntry {
    pub const LEN: usize = ANCHOR_DISCRIMINATOR + CompletedSwapsEntry::INIT_SPACE;
}

#[account]
#[derive(InitSpace, Debug)]
pub struct AllowedDestinationEntry {}

impl AllowedDestinationEntry {
    pub const LEN: usize = ANCHOR_DISCRIMINATOR + AllowedDestinationEntry::INIT_SPACE;
}
