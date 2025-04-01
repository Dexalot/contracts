use anchor_lang::prelude::*;

use crate::instructions::PendingSwap;
use crate::state::BanReason;
use crate::xfer::Tx;

// BannedAccount events
// event BanStatusChanged(address indexed account, BanReason reason, bool banned);
#[event]
pub struct BanStatusChangedEvent {
    pub account: Pubkey,
    pub reason: BanReason,
    pub banned: bool,
}

// Admin events
#[event]
pub struct RoleGrantedEvent {
    pub role: [u8; 32],
    pub account: Pubkey,
}

#[event]
pub struct RoleRevokedEvent {
    pub role: [u8; 32],
    pub admin: Pubkey,
}

// Portfolio events
#[event]
pub struct PortfolioUpdatedEvent {
    pub transaction: Tx,
    pub wallet: Pubkey,
    pub token_mint: Pubkey,
    pub quantity: u64,
    pub fee_charged: u64,
    pub total: u64,
    pub available: u64,
    pub wallet_other: Pubkey,
}

#[event]
pub struct ParameterUpdatedEvent {
    pub pair: [u8; 32],
    pub parameter: String,
    pub old_value: u64,
    pub new_value: u64,
}

#[event]
pub struct SwapExecuted {
    pub taker: Pubkey,
    pub dest_trader: Pubkey,
    pub src_asset: Pubkey,
    pub dest_asset: Pubkey,
    pub src_amount: u64,
    pub dest_amount: u64,
    pub dest_chain_id: u32,
    pub nonce: String,
}

#[event]
pub struct XChainFinalized {
    pub nonce: u64,
    pub trader: Pubkey,
    pub token_mint: Pubkey,
    pub amount: u64,
    pub timestamp: u32,
}

#[repr(u8)]
#[derive(Clone, AnchorDeserialize, AnchorSerialize)]
pub enum SwapQueueActions {
    Add,
    Remove,
}

#[event]
pub struct SwapQueueEvent {
    pub action: SwapQueueActions,
    pub nonce: String,
    pub trader: Pubkey,
    pub pending_swap: PendingSwap,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
#[repr(u8)]
pub enum SolTransferTransactions {
    Withdraw,
    Deposit,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
#[repr(u8)]
pub enum SolTransferTypes {
    Funding,
    Airdrop,
    PendingSwapCreation,
}

#[event]
pub struct SolTransfer {
    pub amount: u64,
    pub transaction: SolTransferTransactions,
    pub transfer_type: SolTransferTypes,
}
