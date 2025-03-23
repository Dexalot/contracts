#![allow(unexpected_cfgs)]
//! Dexalot: A Cross-Chain Decentralized Exchange Protocol
//!
//! This program implements a decentralized exchange that enables cross-chain trading functionality
//! through LayerZero protocol integration.

mod consts;
mod cpi_utils;
mod errors;
mod events;
mod instructions;
mod map_utils;
mod state;
mod xfer;
mod test_utils;

use crate::xfer::XFERSolana;
use anchor_lang::prelude::*;
use anchor_lang::{declare_id, program};
use instructions::*;
use state::GlobalConfig;

declare_id!("EzNZw3u9WzFHPNKnrPzvN4Rju3eBvTEWve8YdqiYVqrC");

#[program]
pub mod dexalot {

    use super::*;

    /// Initializes the Dexalot program with core settings
    /// Can be called only by admins
    ///
    /// # Arguments
    /// * `ctx` - The context containing the accounts
    /// * `params` - Initialization parameters including chain IDs and swap signer
    pub fn initialize(mut ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        instructions::initialize(&mut ctx, &params)
    }

    /// Initializes the program's vault accounts for token storage
    /// Can be called only by admins
    ///
    /// Creates and initializes vaults for:
    /// - SPL token storage
    /// - SPL User funds storage
    pub fn initialize_vaults(ctx: Context<InitializeVaults>) -> Result<()> {
        instructions::initialize_vaults(&ctx)
    }

    /// Create an account where the remote pair address is stored
    /// Can be called only by admins
    ///
    /// # Arguments
    /// * `ctx` - Context containing the accounts
    /// * `params` - Remote chain parameters including chain ID and address
    pub fn set_remote(mut ctx: Context<SetRemote>, params: SetRemoteParams) -> Result<()> {
        instructions::set_remote(&mut ctx, &params)
    }

    /// Handles incoming LayerZero messages for cross-chain operations
    ///
    /// Processes:
    /// - Cross-chain trades
    /// - Token withdrawals
    ///
    /// # Arguments
    /// * `ctx` - Context containing the accounts
    /// * `params` - LayerZero message parameters
    pub fn lz_receive(mut ctx: Context<LzReceive>, params: LzReceiveParams) -> Result<()> {
        instructions::lz_receive(&mut ctx, &params)
    }

    /// Gets required accounts for calling lz_receive
    ///
    /// Returns a list of accounts needed for calling the lz_receive by the LayerZero program
    pub fn lz_receive_types(
        ctx: Context<LzReceiveTypes>,
        params: LzReceiveParams,
    ) -> Result<Vec<LzAccount>> {
        instructions::lz_receive_types(&ctx, &params)
    }

    /// Adds a new token to dexalot
    /// Can be called only by admins
    ///
    /// # Arguments
    /// * `ctx` - Context containing the accounts
    /// * `params` - Token parameters including address and symbol
    ///
    /// # Errors
    /// Returns error if:
    /// - Token already exists
    /// - Token list is full
    /// - Caller is not admin
    pub fn add_token<'info>(
        mut ctx: Context<'_, '_, 'info, 'info, AddToken<'info>>,
        params: AddTokenParams,
    ) -> Result<()> {
        instructions::add_token(&mut ctx, &params)
    }

    /// Removes a token from dexalot
    ///
    /// Can only be called when program is paused.
    /// Can only be called by an admin.
    pub fn remove_token<'info>(
        ctx: Context<'_, '_, 'info, 'info, RemoveToken<'info>>,
        params: RemoveTokenParams,
    ) -> Result<()> {
        instructions::remove_token(&ctx, &params)
    }

    /// Processes SPL token deposits into dexalot
    /// Funds a are deposited in SPL User Funds vault
    ///
    /// Validates deposit permissions and transfers tokens to SPL User Funds vault
    pub fn deposit(mut ctx: Context<Deposit>, params: DepositParams) -> Result<()> {
        instructions::deposit(&mut ctx, &params)
    }

    /// Processes native SOL deposits into dexalot
    /// Funds are deposited in SOL vault
    ///
    /// Validates deposit permissions and transfers SOL to SOL vault
    pub fn deposit_native(
        mut ctx: Context<DepositNative>,
        params: DepositNativeParams,
    ) -> Result<()> {
        instructions::deposit_native(&mut ctx, &params)
    }

    /// Processes airdrop deposits
    /// to refill the Airdrop SOL Vault
    ///
    /// # Arguments
    /// * `ctx` - Context containing the accounts
    /// * `params` - Airdrop deposit parameters
    pub fn deposit_airdrop(
        mut ctx: Context<DepositAirdrop>,
        params: DepositAirdropParams,
    ) -> Result<()> {
        instructions::deposit_airdrop(&mut ctx, &params)
    }

    /// Sets the default chain ID for cross-chain operations
    /// Can be called only by admins
    ///
    /// # Arguments
    /// * `ctx` - Context containing the accounts
    /// * `params` - Default chain ID parameters
    pub fn set_default_chain(
        mut ctx: Context<WriteConfig>,
        params: SetDefaultChainId,
    ) -> Result<()> {
        instructions::set_default_chain(&mut ctx, &params)
    }

    /// Sets the paused state of the program
    /// Can be called only by admins
    ///
    /// # Arguments
    /// * `ctx` - Context containing the accounts
    /// * `pause` - Boolean indicating whether to pause the program
    pub fn set_paused(mut ctx: Context<WriteConfig>, pause: bool) -> Result<()> {
        instructions::set_paused(&mut ctx, pause)
    }

    /// Creates an Associated Token Account (ATA) for a user
    /// and initializes the user solana keypair itself
    /// when the user is new to Solana and doesn't have an ATA
    ///
    /// # Arguments
    /// * `ctx` - Context containing the accounts
    pub fn create_ata(ctx: Context<CreateATA>) -> Result<()> {
        instructions::create_ata(&ctx)
    }

    /// Initializes the user solana keypair
    /// when the user is new to Solana
    ///
    /// # Arguments
    /// * `ctx` - Context containing the accounts
    pub fn create_account(ctx: Context<CreateAccount>) -> Result<()> {
        instructions::create_account(&ctx)
    }

    /// Bans an account from using dexalot
    /// Can be called only by admins
    ///
    /// # Arguments
    /// * `ctx` - Context containing the accounts
    /// * `params` - Ban parameters including the account to ban
    pub fn ban_account(mut ctx: Context<BanAccount>, params: BanAccountParams) -> Result<()> {
        instructions::ban_account(&mut ctx, &params)
    }

    /// Removes a ban from an account
    ///
    /// # Arguments
    /// * `ctx` - Context containing the accounts
    /// * `params` - Unban parameters including the account to unban
    pub fn unban_account(ctx: Context<UnbanAccount>, params: UnbanAccountParams) -> Result<()> {
        instructions::unban_account(&ctx, &params)
    }

    /// Sets the airdrop amount for the program
    ///
    /// # Arguments
    /// * `ctx` - Context containing the accounts
    /// * `params` - Airdrop amount parameters
    pub fn set_airdrop_amount(
        mut ctx: Context<WriteConfig>,
        params: SetAirdropParams,
    ) -> Result<()> {
        instructions::set_airdrop(&mut ctx, &params)
    }

    /// Adds a new admin to the program
    /// Can be called only by admins
    ///
    /// # Arguments
    /// * `ctx` - Context containing the accounts
    /// * `params` - Admin parameters including the account to add
    pub fn add_admin(ctx: Context<AddAdmin>, params: AdminParams) -> Result<()> {
        instructions::add_admin(&ctx, &params)
    }

    /// Removes an admin from the program
    /// Can be called only by admins
    ///
    /// # Arguments
    /// * `ctx` - Context containing the accounts
    /// * `params` - Admin parameters including the account to remove
    pub fn remove_admin(ctx: Context<RemoveAdmin>, params: AdminParams) -> Result<()> {
        instructions::remove_admin(&ctx, &params)
    }

    /// Sets whether deposits are allowed in the program
    /// Can be called only by admins
    ///
    /// # Arguments
    /// * `ctx` - Context containing the accounts
    /// * `allow_deposit` - Boolean indicating whether to allow deposits
    pub fn set_allow_deposit(mut ctx: Context<WriteConfig>, allow_deposit: bool) -> Result<()> {
        instructions::set_allow_deposit(&mut ctx, allow_deposit)
    }

    /// Sets whether native token deposits are restricted
    /// Can be called only by admins
    ///
    /// # Arguments
    /// * `ctx` - Context containing the accounts
    /// * `native_deposits_restricted` - Boolean indicating whether to restrict native deposits
    pub fn set_native_deposits_restricted(
        mut ctx: Context<WriteConfig>,
        native_deposits_restricted: bool,
    ) -> Result<()> {
        instructions::set_native_deposits_restricted(&mut ctx, native_deposits_restricted)
    }

    /// Sets the swap signer for the program
    /// Can be called only by admins
    ///
    /// # Arguments
    /// * `ctx` - Context containing the accounts
    /// * `params` - Swap signer parameters
    pub fn set_swap_signer(
        mut ctx: Context<WriteConfig>,
        params: SetSlapSignerParams,
    ) -> Result<()> {
        instructions::set_swap_signer(&mut ctx, &params)
    }

    /// Executes a token swap
    /// Can be simple swap or partial swap
    ///
    /// # Arguments
    /// * `ctx` - Context containing the accounts
    /// * `params` - Swap parameters including tokens and amounts
    pub fn swap(ctx: Context<Swap>, params: SwapParams) -> Result<()> {
        instructions::swap(&ctx, &params)
    }

    /// Executes a cross-chain token swap
    /// XFER message is sent to the destination chain
    ///
    /// # Arguments
    /// * `ctx` - Context containing the accounts
    /// * `params` - Cross-chain swap parameters
    pub fn cross_swap(mut ctx: Context<CrossSwap>, params: CrossSwapParams) -> Result<()> {
        instructions::cross_swap(&mut ctx, &params)
    }

    /// Removes a swap from the queue
    /// Can be called only by rebalancers
    /// Tries to re-execute a cc swap that wasn't executed due to insufficient liquidity
    ///
    /// # Arguments
    /// * `ctx` - Context containing the accounts
    /// * `params` - Parameters for removing the swap
    pub fn remove_from_swap_queue(
        ctx: Context<RemoveFromSwapQueue>,
        params: RemoveFromSwapQueueParams,
    ) -> Result<()> {
        instructions::remove_from_swap_queue(&ctx, &params)
    }

    /// Adds a rebalancer to the program
    /// Can be called only by admins
    ///
    /// # Arguments
    /// * `ctx` - Context containing the accounts
    /// * `params` - Rebalancer parameters
    pub fn add_rebalancer(ctx: Context<AddRebalancer>, params: RebalancerParams) -> Result<()> {
        instructions::add_rebalancer(&ctx, &params)
    }

    /// Removes a rebalancer from the program
    /// Can be called only by admins
    ///
    /// # Arguments
    /// * `ctx` - Context containing the accounts
    /// * `params` - Rebalancer parameters
    pub fn remove_rebalancer(
        ctx: Context<RemoveRebalancer>,
        params: RebalancerParams,
    ) -> Result<()> {
        instructions::remove_rebalancer(&ctx, &params)
    }

    /// Marks a swap as completed
    /// Can be called only by rebalancers
    ///
    /// # Arguments
    /// * `ctx` - Context containing the accounts
    /// * `params` - Swap expiry parameters
    pub fn update_swap_expiry(
        ctx: Context<UpdateSwapExpiry>,
        params: UpdateSwapExpiryParams,
    ) -> Result<()> {
        instructions::update_swap_expiry(&ctx, &params)
    }

    /// Claims SPL token balance from the program's SPL vault
    /// Can be called only by rebalancers
    ///
    /// # Arguments
    /// * `ctx` - Context containing the accounts
    /// * `params` - Claim parameters
    pub fn claim_spl_balance(
        ctx: Context<ClaimSplBalance>,
        params: ClaimSplBalanceParams,
    ) -> Result<()> {
        instructions::claim_spl_balance(&ctx, &params)
    }

    /// Claims native token balance from the program's SOL vault
    /// Can be called only by rebalancers
    ///
    /// # Arguments
    /// * `ctx` - Context containing the accounts
    /// * `params` - Claim parameters
    pub fn claim_native_balance(
        ctx: Context<ClaimNativeBalance>,
        params: ClaimNativeBalanceParams,
    ) -> Result<()> {
        instructions::claim_native_balance(&ctx, &params)
    }

    /// Retrieves the global configuration of the program
    /// Can be called only by admins
    ///
    /// # Arguments
    /// * `ctx` - Context containing the accounts
    ///
    /// # Returns
    /// The global configuration state
    pub fn get_global_config(ctx: Context<GetGlobalConfig>) -> Result<GlobalConfig> {
        instructions::get_global_config(&ctx)
    }

    /// Funds the SOL vault
    /// Can be called only by rebalancers
    ///
    /// # Arguments
    /// * `ctx` - Context containing the accounts
    /// * `params` - Funding parameters
    pub fn fund_sol(ctx: Context<FundSol>, params: FundSolParams) -> Result<()> {
        instructions::fund_sol(&ctx, &params)
    }

    /// Funds the SPL token vault
    /// Can only be called by a rebalancer.
    ///
    /// # Arguments
    /// * `ctx` - Context containing the accounts
    /// * `params` - Funding parameters
    pub fn fund_spl(ctx: Context<FundSpl>, params: FundSplParams) -> Result<()> {
        instructions::fund_spl(&ctx, &params)
    }
}
