use super::*;
use crate::consts::{ENDPOINT_SEND, PORTFOLIO_SEED};
use crate::cpi_utils::{
    create_instruction_data, EndpointQuoteParams, EndpointSendParams, MessagingFee,
};
use crate::xfer::XFER;
use crate::{
    consts::{
        COMPLETED_SWAPS_SEED, CROSS_SWAP_TYPE, ENDPOINT_QUOTE, GAS_OPTIONS,
        QUOTE_REMAINING_ACCOUNTS_COUNT,
    },
    errors::DexalotError,
    events::SwapExecuted,
    map_utils::{create_entry, entry_exists},
    state::CompletedSwapsEntry,
    xfer::Tx,
};
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::{
    prelude::*,
    solana_program::{
        instruction::Instruction,
        program::{get_return_data, invoke},
    },
};

#[derive(Clone, AnchorDeserialize, AnchorSerialize)]
pub struct XChainSwap {
    pub taker: Pubkey,
    pub dest_trader: Pubkey,
    pub maker_symbol: [u8; 32],
    pub maker_asset: Pubkey,
    pub taker_asset: Pubkey,
    pub maker_amount: u64,
    pub taker_amount: u64,
    pub nonce: [u8; 12],
    pub expiry: u128,
    pub dest_chain_id: u32,
}

impl XChainSwap {
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(CROSS_SWAP_TYPE);
        bytes.extend_from_slice(&self.taker.to_bytes());
        bytes.extend_from_slice(&self.dest_trader.to_bytes());
        bytes.extend_from_slice(&self.maker_symbol);
        bytes.extend_from_slice(&self.maker_asset.to_bytes());
        bytes.extend_from_slice(&self.taker_asset.to_bytes());
        bytes.extend_from_slice(&self.maker_amount.to_be_bytes());
        bytes.extend_from_slice(&self.taker_amount.to_be_bytes());
        bytes.extend_from_slice(&self.nonce);
        bytes.extend_from_slice(&self.expiry.to_be_bytes());
        bytes.extend_from_slice(&self.dest_chain_id.to_be_bytes());

        bytes
    }

    pub fn validate_cross_swap(
        &self,
        ctx: &Context<CrossSwap>,
        signature_bytes: &[u8],
    ) -> Result<()> {
        let clock = &ctx.accounts.clock;
        let sender = &ctx.accounts.sender;
        let completed_swaps_entry = &ctx.accounts.completed_swaps_entry;
        let system_program = &ctx.accounts.system_program;
        let global_config = &ctx.accounts.portfolio.global_config;

        let current_time = clock.unix_timestamp as u128;
        require!(current_time <= self.expiry, DexalotError::OrderExpired);

        let message = self.to_bytes();

        require!(
            verify_signature(global_config, &message, signature_bytes)?,
            DexalotError::InvalidSigner
        );

        require!(
            !entry_exists(completed_swaps_entry),
            DexalotError::OrderAlreadyCompleted
        );

        let entry_data = CompletedSwapsEntry {};
        let base_map_seed = COMPLETED_SWAPS_SEED;
        let entry_map_seed = &generate_map_entry_key(self.nonce, self.dest_trader)?;

        // update completed swaps map
        create_entry::<CompletedSwapsEntry>(
            sender,
            completed_swaps_entry,
            &entry_data,
            CompletedSwapsEntry::LEN,
            base_map_seed,
            entry_map_seed,
            ctx.program_id,
            system_program,
            None,
        )?;
        Ok(())
    }

    pub fn execute_cross_swap(&self, ctx: &Context<CrossSwap>) -> Result<()> {
        let swap_data = SwapData {
            dest_trader: self.dest_trader,
            taker: self.taker,
            nonce: self.nonce,
            src_asset: self.taker_asset,
            dest_asset: self.maker_asset,
            dest_chain_id: self.dest_chain_id,
            src_amount: self.taker_amount,
            dest_amount: self.maker_amount,
        };

        let take_funds_accounts = TakeFunds::from_cross_swap_context(ctx);

        take_funds(&take_funds_accounts, &swap_data, false)?;

        emit!(SwapExecuted {
            taker: self.taker,
            dest_trader: self.dest_trader,
            src_asset: self.taker_asset,
            dest_asset: self.maker_asset,
            src_amount: self.taker_amount,
            dest_amount: self.maker_amount,
            dest_chain_id: self.dest_chain_id,
            nonce: hex::encode(self.nonce)
        });

        Ok(())
    }

    pub fn send_cross_chain_trade(&self, ctx: &mut Context<CrossSwap>) -> Result<()> {
        let portfolio = &ctx.accounts.portfolio;
        let remote = &ctx.accounts.remote;
        let endpoint_program = &ctx.accounts.endpoint_program;
        let out_nonce = portfolio.global_config.out_nonce;

        let xfer = XFER::new(
            Tx::CCTrade,
            self.dest_trader.to_bytes(),
            self.maker_symbol,
            self.maker_amount,
            self.expiry as u32,
            nonce_to_custom_data(self.nonce),
            out_nonce,
        );

        let message = xfer.pack_xfer_message()?;

        // Call Quote
        let quote_params = EndpointQuoteParams {
            sender: portfolio.key(),
            dst_eid: self.dest_chain_id as u32,
            receiver: remote.address,
            message: message.clone(),
            pay_in_lz_token: false,
            options: GAS_OPTIONS.to_vec(),
        };

        let quote_cpi_data = create_instruction_data(&quote_params, ENDPOINT_QUOTE)?;
        let quote_remaining_accounts = &ctx.remaining_accounts[0..QUOTE_REMAINING_ACCOUNTS_COUNT];
        let quote_accounts_metas: Vec<AccountMeta> = quote_remaining_accounts
            .iter()
            .skip(1) // an account is skipped because we don't use layerzero cpi utils so it's not needed
            .map(|account| AccountMeta {
                pubkey: *account.key,
                is_signer: account.is_signer,
                is_writable: false,
            })
            .collect();

        // Invoke CPI quote
        let fee = if cfg!(not(test)) {
            invoke(
                &Instruction {
                    program_id: endpoint_program.key(),
                    accounts: quote_accounts_metas,
                    data: quote_cpi_data,
                },
                quote_remaining_accounts,
            )?;
            let quote_return_data = get_return_data().ok_or(DexalotError::LzQuoteError)?;
            MessagingFee::try_from_slice(&quote_return_data.1)?
        } else {
            MessagingFee::default()
        };

        require!(fee.lz_token_fee == 0, DexalotError::PositiveLzTokenFee);

        // Call Send
        let send_remaining_accounts = &ctx.remaining_accounts[QUOTE_REMAINING_ACCOUNTS_COUNT..];
        let send_params = EndpointSendParams {
            dst_eid: self.dest_chain_id as u32,
            receiver: remote.address,
            message,
            options: GAS_OPTIONS.to_vec(),
            native_fee: fee.native_fee,
            lz_token_fee: 0,
        };

        let send_seeds: &[&[&[u8]]] = &[&[PORTFOLIO_SEED, &[ctx.accounts.portfolio.bump]]];

        let send_cpi_data = create_instruction_data(&send_params, ENDPOINT_SEND)?;

        let portfolio_key = ctx.accounts.portfolio.key();
        let send_accounts_metas: Vec<AccountMeta> = send_remaining_accounts
            .iter()
            .skip(1) // an account is skipped because we don't use layerzero cpi utils so it's not needed
            .map(|account| AccountMeta {
                pubkey: *account.key,
                is_signer: account.key() == portfolio_key || account.is_signer,
                is_writable: account.is_writable,
            })
            .collect();

        // Invoke CPI send
        if cfg!(not(test)) {
            invoke_signed(
                &Instruction {
                    program_id: endpoint_program.key(),
                    accounts: send_accounts_metas,
                    data: send_cpi_data,
                },
                send_remaining_accounts,
                send_seeds,
            )?;
        }

        // update out_nonce counter
        ctx.accounts.portfolio.global_config.out_nonce += 1;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::consts::UNUSED_ADDRESS_PUBLIC_KEY;
    use crate::state::{AllowedDestinationEntry, GlobalConfig, Portfolio, Remote};
    use crate::test_utils::{create_account_info, create_dummy_account, generate_valid_signature};
    use anchor_lang::{system_program, Discriminator};
    use anchor_spl::token::Token;
    use bincode::serialize;
    use solana_program::clock::{Clock, UnixTimestamp};

    #[test]
    fn test_to_bytes() {
        let swap = XChainSwap {
            taker: Pubkey::new_unique(),
            dest_trader: Pubkey::new_unique(),
            maker_symbol: [1u8; 32],
            maker_asset: Pubkey::new_unique(),
            taker_asset: Pubkey::new_unique(),
            maker_amount: 1_000,
            taker_amount: 2_000,
            nonce: [2u8; 12],
            expiry: 1_600_000_000,
            dest_chain_id: 42,
        };
        let mut expected = Vec::new();
        expected.extend_from_slice(CROSS_SWAP_TYPE);
        expected.extend_from_slice(&swap.taker.to_bytes());
        expected.extend_from_slice(&swap.dest_trader.to_bytes());
        expected.extend_from_slice(&swap.maker_symbol);
        expected.extend_from_slice(&swap.maker_asset.to_bytes());
        expected.extend_from_slice(&swap.taker_asset.to_bytes());
        expected.extend_from_slice(&swap.maker_amount.to_be_bytes());
        expected.extend_from_slice(&swap.taker_amount.to_be_bytes());
        expected.extend_from_slice(&swap.nonce);
        expected.extend_from_slice(&swap.expiry.to_be_bytes());
        expected.extend_from_slice(&swap.dest_chain_id.to_be_bytes());
        assert_eq!(swap.to_bytes(), expected);
    }

    #[test]
    fn test_validate_cross_swap_order_success() -> Result<()> {
        let program_id = crate::id();
        let generic_pubkey = Pubkey::new_unique();

        let swap = XChainSwap {
            taker: Pubkey::new_unique(),
            dest_trader: Pubkey::new_unique(),
            maker_symbol: [1u8; 32],
            maker_asset: Pubkey::new_unique(),
            taker_asset: Pubkey::new_unique(),
            maker_amount: 1_000,
            taker_amount: 2_000,
            nonce: [2u8; 12],
            expiry: 1_000,
            dest_chain_id: 42,
        };

        let mut sender_lamports = 0;
        let mut sender_data = vec![0u8; 100];
        let sender_account = create_account_info(
            &generic_pubkey,
            true,
            false,
            &mut sender_lamports,
            &mut sender_data,
            &program_id,
            false,
            None,
        );

        let mut generic_lamports = 100;
        let mut generic_data = vec![0u8; 100];
        let generic_account = create_account_info(
            &generic_pubkey,
            false,
            false,
            &mut generic_lamports,
            &mut generic_data,
            &program_id,
            false,
            None,
        );

        let mut generic_lamports2 = 100;
        let mut generic_data2 = vec![];
        let base_map_seed = COMPLETED_SWAPS_SEED;
        let entry_map_seed = &generate_map_entry_key(swap.nonce, swap.dest_trader)?;

        let (pda, _bump) =
            Pubkey::find_program_address(&[base_map_seed, entry_map_seed], &program_id);
        let generic_account2 = create_account_info(
            &pda,
            false,
            true,
            &mut generic_lamports2,
            &mut generic_data2,
            &program_id,
            false,
            None,
        );

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
            endpoint: Pubkey::default(),
            bump: 0,
        };
        let mut portfolio_data = portfolio.try_to_vec()?;
        let mut portfolio_lamports = 100;
        let portfolio_account = create_account_info(
            &generic_pubkey,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator()),
        );

        let mut clock = Clock::default();
        clock.unix_timestamp = UnixTimestamp::from(123);
        let mut clock_data = serialize(&clock).unwrap();
        let mut clock_lamports = 100;
        let clock_pubkey = Pubkey::try_from("SysvarC1ock11111111111111111111111111111111").unwrap();
        let clock_account = create_account_info(
            &clock_pubkey,
            false,
            false,
            &mut clock_lamports,
            &mut clock_data,
            &program_id,
            false,
            None,
        );

        let mut sp_lamports = 100;
        let mut sp_data = vec![0u8; 10];
        let system_program_info = create_account_info(
            &system_program::ID,
            false,
            false,
            &mut sp_lamports,
            &mut sp_data,
            &system_program::ID,
            true,
            None,
        );
        let system_program = Program::try_from(&system_program_info)?;

        let mut sol_vault_lamports = 500;
        let mut sol_vault_data = vec![0u8; 10];
        let sol_vault_info = create_account_info(
            &generic_pubkey,
            false,
            true,
            &mut sol_vault_lamports,
            &mut sol_vault_data,
            &system_program::ID,
            false,
            None,
        );
        let sol_vault = SystemAccount::try_from(&sol_vault_info)?;

        let mut remote_lamports = 100;
        let mut remote_data = vec![0u8; Remote::SIZE];
        let remote_info = create_account_info(
            &generic_pubkey,
            false,
            false,
            &mut remote_lamports,
            &mut remote_data,
            &program_id,
            false,
            Some(Remote::discriminator()),
        );
        let remote_account = Account::<Remote>::try_from(&remote_info)?;

        let mut destination_entry_data = vec![0u8; AllowedDestinationEntry::LEN];
        let mut destination_entry_lamports = 100;
        let destination_entry_account = create_account_info(
            &generic_pubkey,
            false,
            false,
            &mut destination_entry_lamports,
            &mut destination_entry_data,
            &program_id,
            false,
            Some(AllowedDestinationEntry::discriminator()),
        );

        let mut token_program_lamports = 100;
        let mut token_program_data = vec![0u8; 10];
        let token_program_info = create_account_info(
            &anchor_spl::token::ID,
            false,
            false,
            &mut token_program_lamports,
            &mut token_program_data,
            &anchor_spl::token::ID,
            true,
            None,
        );
        let token_program = Program::<Token>::try_from(&token_program_info)?;

        let mut accounts = CrossSwap {
            clock: Sysvar::from_account_info(&clock_account)?,
            sender: Signer::try_from(&sender_account)?,
            taker: generic_account.clone(),
            dest_trader: generic_account.clone(),
            completed_swaps_entry: generic_account2,
            system_program,
            portfolio: Account::try_from(&portfolio_account)?,
            spl_vault: generic_account.clone(),
            sol_vault,
            src_token_mint: generic_account.clone(),
            taker_src_asset_ata: generic_account.clone(),
            spl_vault_src_asset_ata: generic_account.clone(),
            token_program,
            remote: remote_account,
            endpoint_program: generic_account,
            destination_entry: destination_entry_account,
        };

        let program_id_static: &'static Pubkey = Box::leak(Box::new(crate::id()));
        let remaining_accounts: Vec<AccountInfo<'static>> = (0..QUOTE_REMAINING_ACCOUNTS_COUNT)
            .map(|_| create_dummy_account(program_id_static))
            .collect();

        let ctx = Context {
            accounts: &mut accounts,
            remaining_accounts: remaining_accounts.as_slice(),
            program_id: &program_id,
            bumps: CrossSwapBumps::default(),
        };
        let signature_bytes = generate_valid_signature(&swap.to_bytes());

        let result = swap.validate_cross_swap(&ctx, &signature_bytes);

        assert!(result.is_ok());

        Ok(())
    }

    #[test]
    fn test_validate_cross_swap_order_negative_cases() -> Result<()> {
        let program_id = crate::id();
        let generic_pubkey = Pubkey::new_unique();

        let swap = XChainSwap {
            taker: Pubkey::new_unique(),
            dest_trader: Pubkey::new_unique(),
            maker_symbol: [1u8; 32],
            maker_asset: Pubkey::new_unique(),
            taker_asset: Pubkey::new_unique(),
            maker_amount: 1_000,
            taker_amount: 2_000,
            nonce: [2u8; 12],
            expiry: 1_000,
            dest_chain_id: 42,
        };

        let mut sender_lamports = 0;
        let mut sender_data = vec![0u8; 100];
        let sender_account = create_account_info(
            &generic_pubkey,
            true,
            false,
            &mut sender_lamports,
            &mut sender_data,
            &program_id,
            false,
            None,
        );

        let mut generic_lamports = 100;
        let mut generic_data = vec![0u8; 100];
        let generic_account = create_account_info(
            &generic_pubkey,
            false,
            false,
            &mut generic_lamports,
            &mut generic_data,
            &program_id,
            false,
            None,
        );

        let mut generic_lamports2 = 100;
        let mut generic_data2 = vec![0u8; 100];
        let base_map_seed = COMPLETED_SWAPS_SEED;
        let entry_map_seed = &generate_map_entry_key(swap.nonce, swap.dest_trader)?;

        let (pda, _bump) =
            Pubkey::find_program_address(&[base_map_seed, entry_map_seed], &program_id);
        let generic_account2 = create_account_info(
            &pda,
            false,
            true,
            &mut generic_lamports2,
            &mut generic_data2,
            &program_id,
            false,
            None,
        );

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
            endpoint: Pubkey::default(),
            bump: 0,
        };
        let mut portfolio_data = portfolio.try_to_vec()?;
        let mut portfolio_lamports = 100;
        let portfolio_account = create_account_info(
            &generic_pubkey,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator()),
        );

        let mut clock = Clock::default();
        clock.unix_timestamp = UnixTimestamp::from(123);
        let mut clock_data = serialize(&clock).unwrap();
        let mut clock_lamports = 100;
        let clock_pubkey = Pubkey::try_from("SysvarC1ock11111111111111111111111111111111").unwrap();
        let clock_account = create_account_info(
            &clock_pubkey,
            false,
            false,
            &mut clock_lamports,
            &mut clock_data,
            &program_id,
            false,
            None,
        );

        let mut sp_lamports = 100;
        let mut sp_data = vec![0u8; 10];
        let system_program_info = create_account_info(
            &system_program::ID,
            false,
            false,
            &mut sp_lamports,
            &mut sp_data,
            &system_program::ID,
            true,
            None,
        );
        let system_program = Program::try_from(&system_program_info)?;

        let mut sol_vault_lamports = 500;
        let mut sol_vault_data = vec![0u8; 10];
        let sol_vault_info = create_account_info(
            &generic_pubkey,
            false,
            true,
            &mut sol_vault_lamports,
            &mut sol_vault_data,
            &system_program::ID,
            false,
            None,
        );
        let sol_vault = SystemAccount::try_from(&sol_vault_info)?;

        let mut remote_lamports = 100;
        let mut remote_data = vec![0u8; Remote::SIZE];
        let remote_info = create_account_info(
            &generic_pubkey,
            false,
            false,
            &mut remote_lamports,
            &mut remote_data,
            &program_id,
            false,
            Some(Remote::discriminator()),
        );
        let remote_account = Account::<Remote>::try_from(&remote_info)?;

        let mut destination_entry_data = vec![0u8; AllowedDestinationEntry::LEN];
        let mut destination_entry_lamports = 100;
        let destination_entry_account = create_account_info(
            &generic_pubkey,
            false,
            false,
            &mut destination_entry_lamports,
            &mut destination_entry_data,
            &program_id,
            false,
            Some(AllowedDestinationEntry::discriminator()),
        );

        let mut token_program_lamports = 100;
        let mut token_program_data = vec![0u8; 10];
        let token_program_info = create_account_info(
            &anchor_spl::token::ID,
            false,
            false,
            &mut token_program_lamports,
            &mut token_program_data,
            &anchor_spl::token::ID,
            true,
            None,
        );
        let token_program = Program::<Token>::try_from(&token_program_info)?;

        let mut accounts = CrossSwap {
            clock: Sysvar::from_account_info(&clock_account)?,
            sender: Signer::try_from(&sender_account)?,
            taker: generic_account.clone(),
            dest_trader: generic_account.clone(),
            completed_swaps_entry: generic_account2,
            system_program,
            portfolio: Account::try_from(&portfolio_account)?,
            spl_vault: generic_account.clone(),
            sol_vault,
            src_token_mint: generic_account.clone(),
            taker_src_asset_ata: generic_account.clone(),
            spl_vault_src_asset_ata: generic_account.clone(),
            token_program,
            remote: remote_account,
            endpoint_program: generic_account,
            destination_entry: destination_entry_account,
        };

        let program_id_static: &'static Pubkey = Box::leak(Box::new(crate::id()));
        let remaining_accounts: Vec<AccountInfo<'static>> = (0..QUOTE_REMAINING_ACCOUNTS_COUNT)
            .map(|_| create_dummy_account(program_id_static))
            .collect();

        let mut ctx = Context {
            accounts: &mut accounts.clone(),
            remaining_accounts: remaining_accounts.as_slice(),
            program_id: &program_id,
            bumps: CrossSwapBumps::default(),
        };
        let signature_bytes = generate_valid_signature(&swap.to_bytes());

        let result = swap.validate_cross_swap(&ctx, &signature_bytes);

        assert_eq!(
            result.unwrap_err(),
            DexalotError::OrderAlreadyCompleted.into()
        );

        let wrong_signature = generate_valid_signature(b"wrong");

        let result = swap.validate_cross_swap(&ctx, &wrong_signature);

        assert_eq!(result.unwrap_err(), DexalotError::InvalidSigner.into());

        accounts.clock.unix_timestamp = UnixTimestamp::from(1234);
        ctx.accounts = &mut accounts;

        let result = swap.validate_cross_swap(&ctx, &signature_bytes);

        assert_eq!(result.unwrap_err(), DexalotError::OrderExpired.into());
        Ok(())
    }

    #[test]
    fn test_execute_cross_swap_success() -> Result<()> {
        let program_id = crate::id();
        let generic_pubkey = Pubkey::new_unique();

        let swap = XChainSwap {
            taker: Pubkey::new_unique(),
            dest_trader: Pubkey::new_unique(),
            maker_symbol: [1u8; 32],
            maker_asset: Pubkey::new_unique(),
            taker_asset: Pubkey::new_unique(),
            maker_amount: 1_000,
            taker_amount: 2_000,
            nonce: [2u8; 12],
            expiry: 10_000,
            dest_chain_id: 42,
        };

        let mut sender_lamports = 0;
        let mut sender_data = vec![0u8; 100];
        let sender_account = create_account_info(
            &generic_pubkey,
            true,
            false,
            &mut sender_lamports,
            &mut sender_data,
            &program_id,
            false,
            None,
        );

        let mut generic_lamports = 100;
        let mut generic_data = vec![0u8; 100];
        let generic_account = create_account_info(
            &generic_pubkey,
            false,
            false,
            &mut generic_lamports,
            &mut generic_data,
            &program_id,
            false,
            None,
        );

        let mut portfolio_data = vec![0u8; Portfolio::LEN];
        let mut portfolio_lamports = 100;
        let portfolio_account = create_account_info(
            &generic_pubkey,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator()),
        );

        let clock = Clock::default();
        let mut clock_data = serialize(&clock).unwrap();
        let mut clock_lamports = 100;
        let clock_pubkey = Pubkey::try_from("SysvarC1ock11111111111111111111111111111111").unwrap();
        let clock_account = create_account_info(
            &clock_pubkey,
            false,
            false,
            &mut clock_lamports,
            &mut clock_data,
            &program_id,
            false,
            None,
        );

        let mut sp_lamports = 100;
        let mut sp_data = vec![0u8; 10];
        let system_program_info = create_account_info(
            &system_program::ID,
            false,
            false,
            &mut sp_lamports,
            &mut sp_data,
            &system_program::ID,
            true,
            None,
        );
        let system_program = Program::try_from(&system_program_info)?;

        let mut sol_vault_lamports = 500;
        let mut sol_vault_data = vec![0u8; 10];
        let sol_vault_info = create_account_info(
            &generic_pubkey,
            false,
            true,
            &mut sol_vault_lamports,
            &mut sol_vault_data,
            &system_program::ID,
            false,
            None,
        );
        let sol_vault = SystemAccount::try_from(&sol_vault_info)?;

        let mut remote_lamports = 100;
        let mut remote_data = vec![0u8; Remote::SIZE];
        let remote_info = create_account_info(
            &generic_pubkey,
            false,
            false,
            &mut remote_lamports,
            &mut remote_data,
            &program_id,
            false,
            Some(Remote::discriminator()),
        );
        let remote_account = Account::<Remote>::try_from(&remote_info)?;

        let mut destination_entry_data = vec![0u8; AllowedDestinationEntry::LEN];
        let mut destination_entry_lamports = 100;
        let destination_entry_account = create_account_info(
            &generic_pubkey,
            false,
            false,
            &mut destination_entry_lamports,
            &mut destination_entry_data,
            &program_id,
            false,
            Some(AllowedDestinationEntry::discriminator()),
        );

        let mut token_program_lamports = 100;
        let mut token_program_data = vec![0u8; 10];
        let token_program_info = create_account_info(
            &anchor_spl::token::ID,
            false,
            false,
            &mut token_program_lamports,
            &mut token_program_data,
            &anchor_spl::token::ID,
            true,
            None,
        );
        let token_program = Program::<Token>::try_from(&token_program_info)?;

        let mut accounts = CrossSwap {
            clock: Sysvar::from_account_info(&clock_account)?,
            sender: Signer::try_from(&sender_account)?,
            taker: generic_account.clone(),
            dest_trader: generic_account.clone(),
            completed_swaps_entry: generic_account.clone(),
            system_program,
            portfolio: Account::try_from(&portfolio_account)?,
            spl_vault: generic_account.clone(),
            sol_vault,
            src_token_mint: generic_account.clone(),
            taker_src_asset_ata: generic_account.clone(),
            spl_vault_src_asset_ata: generic_account.clone(),
            token_program,
            remote: remote_account,
            endpoint_program: generic_account,
            destination_entry: destination_entry_account,
        };

        let program_id_static: &'static Pubkey = Box::leak(Box::new(crate::id()));
        let remaining_accounts: Vec<AccountInfo<'static>> = (0..QUOTE_REMAINING_ACCOUNTS_COUNT)
            .map(|_| create_dummy_account(program_id_static))
            .collect();

        let ctx = Context {
            accounts: &mut accounts,
            remaining_accounts: remaining_accounts.as_slice(),
            program_id: &program_id,
            bumps: CrossSwapBumps::default(),
        };

        let result = swap.execute_cross_swap(&ctx);

        assert!(result.is_ok());
        Ok(())
    }

    #[test]
    fn test_send_cross_chain_trade_success() -> Result<()> {
        let program_id = crate::id();
        let generic_pubkey = Pubkey::new_unique();

        let swap = XChainSwap {
            taker: Pubkey::new_unique(),
            dest_trader: Pubkey::new_unique(),
            maker_symbol: [1u8; 32],
            maker_asset: Pubkey::new_unique(),
            taker_asset: Pubkey::new_unique(),
            maker_amount: 1_000,
            taker_amount: 2_000,
            nonce: [2u8; 12],
            expiry: 10_000,
            dest_chain_id: 42,
        };

        let mut sender_lamports = 0;
        let mut sender_data = vec![0u8; 100];
        let sender_account = create_account_info(
            &generic_pubkey,
            true,
            false,
            &mut sender_lamports,
            &mut sender_data,
            &program_id,
            false,
            None,
        );

        let mut generic_lamports = 100;
        let mut generic_data = vec![0u8; 100];
        let generic_account = create_account_info(
            &generic_pubkey,
            false,
            false,
            &mut generic_lamports,
            &mut generic_data,
            &program_id,
            false,
            None,
        );

        let mut portfolio_data = vec![0u8; Portfolio::LEN];
        let mut portfolio_lamports = 100;
        let portfolio_account = create_account_info(
            &generic_pubkey,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator()),
        );

        let clock = Clock::default();
        let mut clock_data = serialize(&clock).unwrap();
        let mut clock_lamports = 100;
        let clock_pubkey = Pubkey::try_from("SysvarC1ock11111111111111111111111111111111").unwrap();
        let clock_account = create_account_info(
            &clock_pubkey,
            false,
            false,
            &mut clock_lamports,
            &mut clock_data,
            &program_id,
            false,
            None,
        );

        let mut sp_lamports = 100;
        let mut sp_data = vec![0u8; 10];
        let system_program_info = create_account_info(
            &system_program::ID,
            false,
            false,
            &mut sp_lamports,
            &mut sp_data,
            &system_program::ID,
            true,
            None,
        );
        let system_program = Program::try_from(&system_program_info)?;

        let mut sol_vault_lamports = 500;
        let mut sol_vault_data = vec![0u8; 10];
        let sol_vault_info = create_account_info(
            &generic_pubkey,
            false,
            true,
            &mut sol_vault_lamports,
            &mut sol_vault_data,
            &system_program::ID,
            false,
            None,
        );
        let sol_vault = SystemAccount::try_from(&sol_vault_info)?;

        let mut remote_lamports = 100;
        let mut remote_data = vec![0u8; Remote::SIZE];
        let remote_info = create_account_info(
            &generic_pubkey,
            false,
            false,
            &mut remote_lamports,
            &mut remote_data,
            &program_id,
            false,
            Some(Remote::discriminator()),
        );
        let remote_account = Account::<Remote>::try_from(&remote_info)?;

        let mut destination_entry_data = vec![0u8; AllowedDestinationEntry::LEN];
        let mut destination_entry_lamports = 100;
        let destination_entry_account = create_account_info(
            &generic_pubkey,
            false,
            false,
            &mut destination_entry_lamports,
            &mut destination_entry_data,
            &program_id,
            false,
            Some(AllowedDestinationEntry::discriminator()),
        );

        let mut token_program_lamports = 100;
        let mut token_program_data = vec![0u8; 10];
        let token_program_info = create_account_info(
            &anchor_spl::token::ID,
            false,
            false,
            &mut token_program_lamports,
            &mut token_program_data,
            &anchor_spl::token::ID,
            true,
            None,
        );
        let token_program = Program::<Token>::try_from(&token_program_info)?;

        let mut accounts = CrossSwap {
            clock: Sysvar::from_account_info(&clock_account)?,
            sender: Signer::try_from(&sender_account)?,
            taker: generic_account.clone(),
            dest_trader: generic_account.clone(),
            completed_swaps_entry: generic_account.clone(),
            system_program,
            portfolio: Account::try_from(&portfolio_account)?,
            spl_vault: generic_account.clone(),
            sol_vault,
            src_token_mint: generic_account.clone(),
            taker_src_asset_ata: generic_account.clone(),
            spl_vault_src_asset_ata: generic_account.clone(),
            token_program,
            remote: remote_account,
            endpoint_program: generic_account,
            destination_entry: destination_entry_account,
        };

        let program_id_static: &'static Pubkey = Box::leak(Box::new(crate::id()));
        let remaining_accounts: Vec<AccountInfo<'static>> = (0..QUOTE_REMAINING_ACCOUNTS_COUNT)
            .map(|_| create_dummy_account(program_id_static))
            .collect();

        let mut ctx = Context {
            accounts: &mut accounts,
            remaining_accounts: remaining_accounts.as_slice(),
            program_id: &program_id,
            bumps: CrossSwapBumps::default(),
        };
        let result = swap.send_cross_chain_trade(&mut ctx);

        assert!(result.is_ok());

        Ok(())
    }
}
