use crate::{
    consts::{COMPLETED_SWAPS_SEED, ORDER_TYPE, SOLANA_CHAIN_ID},
    errors::DexalotError,
    events::SwapExecuted,
    map_utils::{create_entry, entry_exists},
    state::CompletedSwapsEntry,
};

use super::*;
use anchor_lang::prelude::*;

#[derive(Clone, AnchorDeserialize, AnchorSerialize)]
pub struct Order {
    pub maker_asset: Pubkey,
    pub taker_asset: Pubkey,
    pub taker: Pubkey, // origin
    pub maker_amount: u64,
    pub taker_amount: u64,
    pub expiry: u128,
    pub dest_trader: Pubkey, // dest
    pub nonce: [u8; 12],
}

impl Order {
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(ORDER_TYPE);
        bytes.extend_from_slice(&self.maker_asset.to_bytes());
        bytes.extend_from_slice(&self.taker_asset.to_bytes());
        bytes.extend_from_slice(&self.taker.to_bytes());
        bytes.extend_from_slice(&self.maker_amount.to_be_bytes());
        bytes.extend_from_slice(&self.taker_amount.to_be_bytes());
        bytes.extend_from_slice(&self.expiry.to_be_bytes());
        bytes.extend_from_slice(&self.dest_trader.to_bytes());
        bytes.extend_from_slice(&self.nonce);

        bytes
    }

    pub fn validate_order(
        &self,
        ctx: &Context<Swap>,
        signature_bytes: &[u8],
        is_aggregator: bool,
    ) -> Result<()> {
        let clock = &ctx.accounts.clock;
        let sender = &ctx.accounts.sender;
        let completed_swaps_entry = &ctx.accounts.completed_swaps_entry;
        let system_program = &ctx.accounts.system_program;
        let global_config = &ctx.accounts.portfolio.global_config;

        let current_time = clock.unix_timestamp as u128;
        require!(
            current_time <= self.expiry,
            DexalotError::OrderExpired
        );

        let message = self.to_bytes();

        require!(
            verify_signature(global_config, &message, signature_bytes)?,
            DexalotError::InvalidSigner
        );

        require!(
            self.taker == sender.key() || is_aggregator,
            DexalotError::InvalidAggregatorFlow
        );

        require!(
            !entry_exists(completed_swaps_entry),
            DexalotError::OrderAlreadyCompleted
        );

        let base_map_seed = COMPLETED_SWAPS_SEED;
        let entry_map_seed = &generate_map_entry_key(self.nonce, self.dest_trader)?;

        // update completed swaps map
        create_entry::<CompletedSwapsEntry>(
            sender,
            completed_swaps_entry,
            &CompletedSwapsEntry {},
            CompletedSwapsEntry::LEN,
            base_map_seed,
            entry_map_seed,
            ctx.program_id,
            system_program,
            None,
        )?;
        Ok(())
    }

    pub fn execute_order(&self, ctx: &Context<Swap>, is_aggregator: bool) -> Result<()> {
        let swap_data = SwapData {
            dest_trader: self.dest_trader,
            taker: self.taker,
            nonce: self.nonce,
            src_asset: self.taker_asset,
            dest_asset: self.maker_asset,
            dest_chain_id: SOLANA_CHAIN_ID,
            src_amount: self.taker_amount,
            dest_amount: self.maker_amount,
        };

        let take_funds_accounts = TakeFunds::from_swap_context(ctx);

        take_funds(&take_funds_accounts, &swap_data, is_aggregator)?;

        release_funds(ctx, &swap_data)?;

        emit!(SwapExecuted {
            taker: self.taker,
            dest_trader: self.dest_trader,
            src_asset: self.taker_asset,
            dest_asset: self.maker_asset,
            src_amount: self.taker_amount,
            dest_amount: self.maker_amount,
            dest_chain_id: SOLANA_CHAIN_ID,
            nonce: hex::encode(self.nonce)
        });

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use anchor_lang::Discriminator;
    use super::*;
    use anchor_lang::solana_program::{
        clock::Clock,
        system_program,
    };
    use anchor_spl::token;
    use anchor_spl::token::Token;
    use bincode::serialize;
    use solana_program::clock::UnixTimestamp;
    use crate::consts::UNUSED_ADDRESS_PUBLIC_KEY;
    use crate::state::{GlobalConfig, Portfolio};
    use crate::test_utils::{create_account_info, generate_valid_signature};

    #[test]
    fn test_validate_order_success() -> Result<()> {
        let program_id = crate::id();
        let generic_key = Pubkey::new_unique();

        let hex_str = UNUSED_ADDRESS_PUBLIC_KEY;
        let bytes = hex::decode(hex_str).unwrap();
        let address: [u8; 20] = bytes.try_into().unwrap();
        let gc = GlobalConfig {
            allow_deposit: false,
            program_paused: false,
            native_deposits_restricted: false,
            src_chain_id: 0,
            default_chain_id: 0,
            airdrop_amount: 0,
            swap_signer: address,
            out_nonce: 0,
        };
        let portfolio = Portfolio {
            admin: Default::default(),
            global_config: gc,
            bump: 0,
        };
        let mut portfolio_data = portfolio.try_to_vec()?;
        let mut portfolio_lamports = 100;
        let portfolio_account = create_account_info(
            &generic_key,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator())
        );

        let mut clock = Clock::default();
        clock.unix_timestamp = UnixTimestamp::from(123);
        let mut clock_data = serialize(&clock).unwrap();
        let mut clock_lamports = 100;
        let clock_pubkey = Pubkey::try_from("SysvarC1ock11111111111111111111111111111111").unwrap();
        let clock_info = create_account_info(
            &clock_pubkey,
            false,
            false,
            &mut clock_lamports,
            &mut clock_data,
            &program_id,
            false,
            None
        );
        let order = Order {
            maker_asset: Pubkey::new_unique(),
            taker_asset: Pubkey::new_unique(),
            taker: Pubkey::new_unique(),
            maker_amount: 500,
            taker_amount: 1000,
            expiry: clock.unix_timestamp as u128 + 10_000,
            dest_trader: Pubkey::new_unique(),
            nonce: [0u8; 12],
        };

        let mut sender_lamports = 1000;
        let mut sender_data = vec![0u8; 10];
        let sender_info = AccountInfo::new(
            &order.taker,
            true,
            false,
            &mut sender_lamports,
            &mut sender_data,
            &system_program::ID,
            false,
            0,
        );

        let base_map_seed = COMPLETED_SWAPS_SEED;
        let entry_map_seed = generate_map_entry_key(order.nonce, order.dest_trader)?;
        let (pda, _bump) = Pubkey::find_program_address(&[base_map_seed, &entry_map_seed], &program_id);
        let mut cs_data = vec![];
        let mut cs_lamports = 100;
        let completed_swaps_info = AccountInfo::new(
            &pda,
            false,
            false,
            &mut cs_lamports,
            &mut cs_data,
            &system_program::ID,
            false,
            0,
        );

        let mut system_data = vec![0u8; 10];
        let mut system_lamports = 100;
        let system_program_info = AccountInfo::new(
            &system_program::ID,
            false,
            false,
            &mut system_lamports,
            &mut system_data,
            &system_program::ID,
            true,
            0,
        );

        let mut generic_data = vec![0u8; 100];
        let mut generic_lamports = 100;
        let generic_info = create_account_info(
            &generic_key,
            false,
            false,
            &mut generic_lamports,
            &mut generic_data,
            &program_id,
            false,
            None
        );

        let mut sol_vault_lamports = 500;
        let mut sol_vault_data = vec![0u8; 10];
        let sol_vault_info = create_account_info(
            &generic_key,
            false,
            true,
            &mut sol_vault_lamports,
            &mut sol_vault_data,
            &system_program::ID,
            false,
            None
        );
        let sol_vault = SystemAccount::try_from(&sol_vault_info)?;

        let mut token_program_lamports = 100;
        let mut token_program_data = vec![0u8; 10];
        let token_program_info = create_account_info(
            &token::ID,
            false,
            false,
            &mut token_program_lamports,
            &mut token_program_data,
            &token::ID,
            true,
            None
        );
        let token_program = Program::<Token>::try_from(&token_program_info)?;

        let mut swap_accounts = Swap {
            clock: Sysvar::from_account_info(&clock_info)?,
            sender: Signer::try_from(&sender_info)?,
            taker: generic_info.clone(),
            dest_trader: generic_info.clone(),
            completed_swaps_entry: completed_swaps_info.clone(),
            system_program: Program::try_from(&system_program_info)?,
            portfolio: Account::try_from(&portfolio_account)?,
            spl_vault: generic_info.clone(),
            sol_vault,
            src_token_mint: generic_info.clone(),
            dest_token_mint: generic_info.clone(),
            taker_dest_asset_ata: generic_info.clone(),
            taker_src_asset_ata: generic_info.clone(),
            dest_trader_dest_asset_ata: generic_info.clone(),
            dest_trader_src_asset_ata: generic_info.clone(),
            spl_vault_dest_asset_ata: generic_info.clone(),
            spl_vault_src_asset_ata: generic_info.clone(),
            token_program,
        };

        let ctx = Context {
            accounts: &mut swap_accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: SwapBumps::default(),
        };

        let signature_bytes = generate_valid_signature(&order.to_bytes());

        let result = order.validate_order(&ctx, &signature_bytes, false);
        assert!(result.is_ok());
        Ok(())
    }

    #[test]
    fn test_validate_order_negative_cases() -> Result<()> {
        let program_id = crate::id();
        let generic_key = Pubkey::new_unique();

        let hex_str = UNUSED_ADDRESS_PUBLIC_KEY;
        let bytes = hex::decode(hex_str).unwrap();
        let address: [u8; 20] = bytes.try_into().unwrap();
        let gc = GlobalConfig {
            allow_deposit: false,
            program_paused: false,
            native_deposits_restricted: false,
            src_chain_id: 0,
            default_chain_id: 0,
            airdrop_amount: 0,
            swap_signer: address,
            out_nonce: 0,
        };
        let portfolio = Portfolio {
            admin: Default::default(),
            global_config: gc,
            bump: 0,
        };
        let mut portfolio_data = portfolio.try_to_vec()?;
        let mut portfolio_lamports = 100;
        let portfolio_account = create_account_info(
            &generic_key,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator())
        );

        let mut clock = Clock::default();
        clock.unix_timestamp = UnixTimestamp::from(123);
        let mut clock_data = serialize(&clock).unwrap();
        let mut clock_lamports = 100;
        let clock_pubkey = Pubkey::try_from("SysvarC1ock11111111111111111111111111111111").unwrap();
        let mut clock_info = create_account_info(
            &clock_pubkey,
            false,
            false,
            &mut clock_lamports,
            &mut clock_data,
            &program_id,
            false,
            None
        );
        let order = Order {
            maker_asset: Pubkey::new_unique(),
            taker_asset: Pubkey::new_unique(),
            taker: Pubkey::new_unique(),
            maker_amount: 500,
            taker_amount: 1000,
            expiry: clock.unix_timestamp as u128 + 10_000,
            dest_trader: Pubkey::new_unique(),
            nonce: [0u8; 12],
        };

        let mut sender_lamports = 1000;
        let mut sender_data = vec![0u8; 10];
        let mut sender_info = AccountInfo::new(
            &order.taker,
            true,
            false,
            &mut sender_lamports,
            &mut sender_data,
            &system_program::ID,
            false,
            0,
        );

        let base_map_seed = COMPLETED_SWAPS_SEED;
        let entry_map_seed = generate_map_entry_key(order.nonce, order.dest_trader)?;
        let (pda, _bump) = Pubkey::find_program_address(&[base_map_seed, &entry_map_seed], &program_id);
        let mut cs_data = vec![0u8; 10];
        let mut cs_lamports = 100;
        let completed_swaps_info = AccountInfo::new(
            &pda,
            false,
            false,
            &mut cs_lamports,
            &mut cs_data,
            &program_id,
            false,
            0,
        );

        let mut system_data = vec![0u8; 10];
        let mut system_lamports = 100;
        let system_program_info = AccountInfo::new(
            &system_program::ID,
            false,
            false,
            &mut system_lamports,
            &mut system_data,
            &system_program::ID,
            true,
            0,
        );

        let mut generic_data = vec![0u8; 100];
        let mut generic_lamports = 100;
        let generic_info = create_account_info(
            &generic_key,
            false,
            false,
            &mut generic_lamports,
            &mut generic_data,
            &program_id,
            false,
            None
        );

        let mut sol_vault_lamports = 500;
        let mut sol_vault_data = vec![0u8; 10];
        let sol_vault_info = create_account_info(
            &generic_key,
            false,
            true,
            &mut sol_vault_lamports,
            &mut sol_vault_data,
            &system_program::ID,
            false,
            None
        );
        let sol_vault = SystemAccount::try_from(&sol_vault_info)?;

        let mut token_program_lamports = 100;
        let mut token_program_data = vec![0u8; 10];
        let token_program_info = create_account_info(
            &token::ID,
            false,
            false,
            &mut token_program_lamports,
            &mut token_program_data,
            &token::ID,
            true,
            None
        );
        let token_program = Program::<Token>::try_from(&token_program_info)?;
        let sender_clone = sender_info.clone();
        let clock_clone = clock_info.clone();

        let mut swap_accounts = Swap {
            clock: Sysvar::from_account_info(&clock_clone)?,
            sender: Signer::try_from(&sender_clone)?,
            taker: generic_info.clone(),
            dest_trader: generic_info.clone(),
            completed_swaps_entry: completed_swaps_info,
            system_program: Program::try_from(&system_program_info)?,
            portfolio: Account::try_from(&portfolio_account)?,
            spl_vault: generic_info.clone(),
            sol_vault,
            src_token_mint: generic_info.clone(),
            dest_token_mint: generic_info.clone(),
            taker_dest_asset_ata: generic_info.clone(),
            taker_src_asset_ata: generic_info.clone(),
            dest_trader_dest_asset_ata: generic_info.clone(),
            dest_trader_src_asset_ata: generic_info.clone(),
            spl_vault_dest_asset_ata: generic_info.clone(),
            spl_vault_src_asset_ata: generic_info.clone(),
            token_program,
        };

        let mut ctx = Context {
            accounts: &mut swap_accounts.clone(),
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: SwapBumps::default(),
        };

        let signature_bytes = generate_valid_signature(&order.to_bytes());

        let result = order.validate_order(&ctx, &signature_bytes, false);
        assert_eq!(result.unwrap_err(), DexalotError::OrderAlreadyCompleted.into());

        sender_info.key = &generic_key;
        swap_accounts.sender = Signer::try_from(&sender_info)?;
        let mut accounts_clone = swap_accounts.clone();
        ctx.accounts = &mut accounts_clone;

        let result = order.validate_order(&ctx, &signature_bytes, false);
        assert_eq!(result.unwrap_err(), DexalotError::InvalidAggregatorFlow.into());

        let wrong_signature = generate_valid_signature(b"wrong");

        let result = order.validate_order(&ctx, &wrong_signature, false);
        assert_eq!(result.unwrap_err(), DexalotError::InvalidSigner.into());

        clock.unix_timestamp = UnixTimestamp::from(123000);
        let mut lamports = 100;
        let mut data = serialize(&clock).unwrap();
        clock_info = create_account_info(
            &clock_pubkey,
            false,
            false,
            &mut lamports,
            &mut data,
            &program_id,
            false,
            None
        );
        swap_accounts.clock = Sysvar::from_account_info(&clock_info)?;
        ctx.accounts = &mut swap_accounts;

        let result = order.validate_order(&ctx, &wrong_signature, false);
        assert_eq!(result.unwrap_err(), DexalotError::OrderExpired.into());
        Ok(())
    }

    #[test]
    fn test_execute_order_success() -> Result<()> {
        let program_id = crate::id();
        let generic_key = Pubkey::new_unique();

        let hex_str = UNUSED_ADDRESS_PUBLIC_KEY;
        let bytes = hex::decode(hex_str).unwrap();
        let address: [u8; 20] = bytes.try_into().unwrap();
        let gc = GlobalConfig {
            allow_deposit: false,
            program_paused: false,
            native_deposits_restricted: false,
            src_chain_id: 0,
            default_chain_id: 0,
            airdrop_amount: 0,
            swap_signer: address,
            out_nonce: 0,
        };
        let portfolio = Portfolio {
            admin: Default::default(),
            global_config: gc,
            bump: 0,
        };
        let mut portfolio_data = portfolio.try_to_vec()?;
        let mut portfolio_lamports = 100;
        let portfolio_account = create_account_info(
            &generic_key,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator())
        );

        let mut clock = Clock::default();
        clock.unix_timestamp = UnixTimestamp::from(123);
        let mut clock_data = serialize(&clock).unwrap();
        let mut clock_lamports = 100;
        let clock_pubkey = Pubkey::try_from("SysvarC1ock11111111111111111111111111111111").unwrap();
        let clock_info = create_account_info(
            &clock_pubkey,
            false,
            false,
            &mut clock_lamports,
            &mut clock_data,
            &program_id,
            false,
            None
        );
        let order = Order {
            maker_asset: Pubkey::new_unique(),
            taker_asset: Pubkey::new_unique(),
            taker: Pubkey::new_unique(),
            maker_amount: 500,
            taker_amount: 1000,
            expiry: clock.unix_timestamp as u128 + 10_000,
            dest_trader: Pubkey::new_unique(),
            nonce: [0u8; 12],
        };

        let mut sender_lamports = 1000;
        let mut sender_data = vec![0u8; 10];
        let sender_info = AccountInfo::new(
            &order.taker,
            true,
            false,
            &mut sender_lamports,
            &mut sender_data,
            &system_program::ID,
            false,
            0,
        );

        let base_map_seed = COMPLETED_SWAPS_SEED;
        let entry_map_seed = generate_map_entry_key(order.nonce, order.dest_trader)?;
        let (pda, _bump) = Pubkey::find_program_address(&[base_map_seed, &entry_map_seed], &program_id);
        let mut cs_data = vec![];
        let mut cs_lamports = 100;
        let completed_swaps_info = AccountInfo::new(
            &pda,
            false,
            false,
            &mut cs_lamports,
            &mut cs_data,
            &system_program::ID,
            false,
            0,
        );

        let mut system_data = vec![0u8; 10];
        let mut system_lamports = 100;
        let system_program_info = AccountInfo::new(
            &system_program::ID,
            false,
            false,
            &mut system_lamports,
            &mut system_data,
            &system_program::ID,
            true,
            0,
        );

        let mut generic_data = vec![0u8; 100];
        let mut generic_lamports = 100;
        let generic_info = create_account_info(
            &generic_key,
            false,
            false,
            &mut generic_lamports,
            &mut generic_data,
            &program_id,
            false,
            None
        );

        let mut sol_vault_lamports = 500;
        let mut sol_vault_data = vec![0u8; 10];
        let sol_vault_info = create_account_info(
            &generic_key,
            false,
            true,
            &mut sol_vault_lamports,
            &mut sol_vault_data,
            &system_program::ID,
            false,
            None
        );
        let sol_vault = SystemAccount::try_from(&sol_vault_info)?;

        let mut token_program_lamports = 100;
        let mut token_program_data = vec![0u8; 10];
        let token_program_info = create_account_info(
            &token::ID,
            false,
            false,
            &mut token_program_lamports,
            &mut token_program_data,
            &token::ID,
            true,
            None
        );
        let token_program = Program::<Token>::try_from(&token_program_info)?;

        let mut swap_accounts = Swap {
            clock: Sysvar::from_account_info(&clock_info)?,
            sender: Signer::try_from(&sender_info)?,
            taker: generic_info.clone(),
            dest_trader: generic_info.clone(),
            completed_swaps_entry: completed_swaps_info.clone(),
            system_program: Program::try_from(&system_program_info)?,
            portfolio: Account::try_from(&portfolio_account)?,
            spl_vault: generic_info.clone(),
            sol_vault,
            src_token_mint: generic_info.clone(),
            dest_token_mint: generic_info.clone(),
            taker_dest_asset_ata: generic_info.clone(),
            taker_src_asset_ata: generic_info.clone(),
            dest_trader_dest_asset_ata: generic_info.clone(),
            dest_trader_src_asset_ata: generic_info.clone(),
            spl_vault_dest_asset_ata: generic_info.clone(),
            spl_vault_src_asset_ata: generic_info.clone(),
            token_program,
        };

        let ctx = Context {
            accounts: &mut swap_accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: SwapBumps::default(),
        };

        let result = order.execute_order(&ctx, false);
        assert!(result.is_ok());
        Ok(())
    }
}

