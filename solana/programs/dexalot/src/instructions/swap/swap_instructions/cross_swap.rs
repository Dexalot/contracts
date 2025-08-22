use crate::{
    consts::{
        CCTRADE_ALLOWED_DEST_SEED, COMPLETED_SWAPS_SEED, PORTFOLIO_SEED, REMOTE_SEED,
        SOL_VAULT_SEED, SPL_VAULT_SEED,
    },
    errors::DexalotError,
    map_utils::entry_exists,
    state::{Portfolio, Remote},
};

use super::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Token;

pub fn cross_swap(ctx: &mut Context<CrossSwap>, params: &CrossSwapParams) -> Result<()> {
    let portfolio = &ctx.accounts.portfolio;
    require_keys_eq!(
        ctx.accounts.endpoint_program.key(),
        portfolio.endpoint,
        DexalotError::InvalidLZProgram
    );

    let global_config = &ctx.accounts.portfolio.global_config;
    require!(!global_config.program_paused, DexalotError::ProgramPaused);

    let destination_entry = &ctx.accounts.destination_entry;
    require!(
        entry_exists(destination_entry),
        DexalotError::DestinationNotAllowed
    );

    check_atas(&ctx)?;
    let order = params.order.clone();

    order.validate_cross_swap(ctx, &params.signature)?;

    order.execute_cross_swap(ctx)?;

    order.send_cross_chain_trade(ctx)?;

    Ok(())
}

#[derive(Accounts, Clone)]
#[instruction(params: CrossSwapParams)]
pub struct CrossSwap<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,
    /// CHECK: it corresponds to the order
    #[account(mut, constraint = taker.key() == params.order.taker @ DexalotError::InvalidTaker)]
    pub taker: AccountInfo<'info>,
    /// CHECK: it corresponds to the order
    #[account(mut, constraint = dest_trader.key() == params.order.dest_trader)]
    pub dest_trader: AccountInfo<'info>,
    /// CHECK: when calling the instruction
    #[account(mut, seeds = [COMPLETED_SWAPS_SEED, &generate_map_entry_key(params.order.nonce, params.order.dest_trader)?], bump)]
    pub completed_swaps_entry: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    /// Sysvar for accessing block time
    pub clock: Sysvar<'info, Clock>,
    #[account(
        mut,
        seeds = [PORTFOLIO_SEED], bump = portfolio.bump
    )]
    pub portfolio: Account<'info, Portfolio>,
    /// CHECK: when calling instruction
    #[account(
        seeds = [SPL_VAULT_SEED],
        bump,
    )]
    pub spl_vault: AccountInfo<'info>,
    #[account(mut, seeds = [SOL_VAULT_SEED], bump)]
    pub sol_vault: SystemAccount<'info>,
    /// CHECK: token mint against order
    #[account(constraint = src_token_mint.key() == params.order.taker_asset)]
    pub src_token_mint: AccountInfo<'info>,
    /// CHECK: ATA or Zero PublicKey
    #[account(mut)]
    pub taker_src_asset_ata: AccountInfo<'info>,
    /// CHECK: ATA or Zero PublicKey
    #[account(mut)]
    pub spl_vault_src_asset_ata: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
    #[account(
        seeds = [
            REMOTE_SEED,
            &params.order.dest_chain_id.to_be_bytes()
        ],
        bump = remote.bump
    )]
    pub remote: Account<'info, Remote>,
    /// CHECK: the endpoint program
    pub endpoint_program: AccountInfo<'info>,
    /// CHECK: destination entry
    #[account(
        seeds = [CCTRADE_ALLOWED_DEST_SEED, &params.order.dest_chain_id.to_be_bytes(), &params.order.maker_asset.to_bytes()],
        bump
    )]
    pub destination_entry: AccountInfo<'info>,
}

#[derive(Clone, AnchorDeserialize, AnchorSerialize)]
pub struct CrossSwapParams {
    pub order: XChainSwap,
    pub signature: Vec<u8>,
}

fn check_atas(ctx: &Context<CrossSwap>) -> Result<()> {
    let taker = &ctx.accounts.taker;
    let spl_vault = &ctx.accounts.spl_vault;
    let taker_src_asset_ata = &ctx.accounts.taker_src_asset_ata;
    let spl_vault_src_asset_ata = &ctx.accounts.spl_vault_src_asset_ata;
    let src_token_mint = &ctx.accounts.src_token_mint;

    // Check ATAs for taker
    check_ata_account(taker_src_asset_ata, taker.key, src_token_mint.key, false)?;

    // Check ATAs spl vault
    check_ata_account(
        spl_vault_src_asset_ata,
        spl_vault.key,
        src_token_mint.key,
        true,
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::consts::{
        COMPLETED_SWAPS_SEED, QUOTE_REMAINING_ACCOUNTS_COUNT, UNUSED_ADDRESS_PUBLIC_KEY,
    };
    use crate::state::{AllowedDestinationEntry, GlobalConfig, Portfolio, Remote};
    use crate::test_utils::{create_account_info, create_dummy_account, generate_valid_signature};
    use anchor_lang::solana_program::{clock::Clock, system_program};
    use anchor_lang::Discriminator;
    use anchor_spl::token::spl_token;
    use bincode::serialize;
    use std::str::FromStr;

    #[test]
    fn test_cross_swap_success() -> Result<()> {
        let program_id = crate::id();
        let generic_key = Pubkey::new_unique();

        let order = XChainSwap {
            taker: Pubkey::new_unique(),
            dest_trader: Pubkey::new_unique(),
            maker_symbol: [1u8; 32],
            maker_asset: Pubkey::new_unique(),
            taker_asset: Pubkey::new_unique(),
            maker_amount: 1000,
            taker_amount: 2000,
            nonce: [1u8; 12],
            expiry: 2000,
            dest_chain_id: 42,
        };

        let hex_str = UNUSED_ADDRESS_PUBLIC_KEY;
        let bytes = hex::decode(hex_str).unwrap();
        let address: [u8; 20] = bytes.try_into().unwrap();
        let gc = GlobalConfig {
            allow_deposit: false,
            program_paused: false,
            native_deposits_restricted: false,
            default_chain_id: 0,
            airdrop_amount: 0,
            swap_signer: address,
            out_nonce: 0,
        };

        let mut clock = Clock::default();
        clock.unix_timestamp = 1000;
        let mut clock_data = serialize(&clock).unwrap();
        let mut clock_lamports = 100;
        let clock_pubkey = Pubkey::from_str("SysvarC1ock11111111111111111111111111111111").unwrap();
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
        let base_map_seed = COMPLETED_SWAPS_SEED;
        let entry_map_seed = generate_map_entry_key(order.nonce, order.dest_trader).unwrap();
        let (pda, _bump) =
            Pubkey::find_program_address(&[base_map_seed, &entry_map_seed], &program_id);
        let mut cs_data = vec![];
        let mut cs_lamports = 100;
        let completed_swaps_account = create_account_info(
            &pda,
            false,
            true,
            &mut cs_lamports,
            &mut cs_data,
            &program_id,
            false,
            None,
        );
        let mut sp_data = vec![0u8; 10];
        let mut sp_lamports = 100;
        let system_program_account = create_account_info(
            &system_program::ID,
            false,
            false,
            &mut sp_lamports,
            &mut sp_data,
            &system_program::ID,
            true,
            None,
        );
        let sender_key = order.taker;
        let mut sender_lamports = 1000;
        let mut sender_data = vec![0u8; 10];
        let sender_account = create_account_info(
            &sender_key,
            true,
            false,
            &mut sender_lamports,
            &mut sender_data,
            &system_program::ID,
            false,
            None,
        );

        let mut taker_lamports = 100;
        let mut taker_data = vec![0u8; 10];
        let taker_account = create_account_info(
            &order.taker,
            false,
            true,
            &mut taker_lamports,
            &mut taker_data,
            &program_id,
            false,
            None,
        );

        let mut generic_lamports = 100;
        let mut generic_data = vec![0u8; 100];
        let generic_account = create_account_info(
            &generic_key,
            false,
            true,
            &mut generic_lamports,
            &mut generic_data,
            &program_id,
            false,
            None,
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
            None,
        );
        let sol_vault = SystemAccount::try_from(&sol_vault_info)?;

        let mut token_program_lamports = 100;
        let mut token_program_data = vec![0u8; 100];
        let token_program_account = create_account_info(
            &spl_token::ID,
            false,
            false,
            &mut token_program_lamports,
            &mut token_program_data,
            &spl_token::ID,
            true,
            None,
        );
        let token_program = Program::try_from(&token_program_account)?;

        let mut remote_data = vec![0u8; Remote::SIZE];
        let mut remote_lamports = 100;
        let remote_account = create_account_info(
            &generic_key,
            false,
            true,
            &mut remote_lamports,
            &mut remote_data,
            &program_id,
            false,
            Some(Remote::discriminator()),
        );
        let remote = Account::<Remote>::try_from(&remote_account)?;

        let mut destination_entry_data = vec![0u8; AllowedDestinationEntry::LEN];
        let mut destination_entry_lamports = 100;
        let destination_entry_account = create_account_info(
            &generic_key,
            false,
            false,
            &mut destination_entry_lamports,
            &mut destination_entry_data,
            &program_id,
            false,
            Some(AllowedDestinationEntry::discriminator()),
        );

        let mut ep_lamports = 100;
        let mut ep_data = vec![0u8; 10];
        let endpoint_program_account = create_account_info(
            &generic_key,
            false,
            false,
            &mut ep_lamports,
            &mut ep_data,
            &program_id,
            true,
            None,
        );
        let portfolio = Portfolio {
            global_config: gc,
            endpoint: generic_key,
            bump: 0,
        };
        let mut portfolio_data = portfolio.try_to_vec().unwrap();
        let mut portfolio_lamports = 100;
        let portfolio_account = create_account_info(
            &generic_key,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator()),
        );

        let program_id_static: &'static Pubkey = Box::leak(Box::new(crate::id()));
        let remaining_accounts: Vec<AccountInfo<'static>> = (0..QUOTE_REMAINING_ACCOUNTS_COUNT)
            .map(|_| create_dummy_account(program_id_static))
            .collect();

        let mut ctx = Context {
            accounts: &mut CrossSwap {
                sender: Signer::try_from(&sender_account)?,
                taker: taker_account,
                dest_trader: generic_account.clone(),
                completed_swaps_entry: completed_swaps_account,
                system_program: Program::try_from(&system_program_account)?,
                clock: Sysvar::from_account_info(&clock_account)?,
                portfolio: Account::try_from(&portfolio_account)?,
                spl_vault: generic_account.clone(),
                sol_vault,
                src_token_mint: generic_account.clone(),
                taker_src_asset_ata: generic_account.clone(),
                spl_vault_src_asset_ata: generic_account.clone(),
                token_program,
                remote,
                endpoint_program: endpoint_program_account,
                destination_entry: destination_entry_account,
            },
            remaining_accounts: &remaining_accounts,
            program_id: &program_id,
            bumps: CrossSwapBumps::default(),
        };
        let params = CrossSwapParams {
            order: order.clone(),
            signature: generate_valid_signature(&order.to_bytes()).into(),
        };

        let res = cross_swap(&mut ctx, &params);
        assert!(res.is_ok());
        Ok(())
    }

    #[test]
    fn test_cross_swap_negative_cases() -> Result<()> {
        let program_id = crate::id();
        let generic_key = Pubkey::new_unique();

        let order = XChainSwap {
            taker: Pubkey::new_unique(),
            dest_trader: Pubkey::new_unique(),
            maker_symbol: [1u8; 32],
            maker_asset: Pubkey::new_unique(),
            taker_asset: Pubkey::new_unique(),
            maker_amount: 1000,
            taker_amount: 2000,
            nonce: [1u8; 12],
            expiry: 2000,
            dest_chain_id: 42,
        };

        let hex_str = UNUSED_ADDRESS_PUBLIC_KEY;
        let bytes = hex::decode(hex_str).unwrap();
        let address: [u8; 20] = bytes.try_into().unwrap();
        let mut gc = GlobalConfig {
            allow_deposit: false,
            program_paused: false,
            native_deposits_restricted: false,
            default_chain_id: 0,
            airdrop_amount: 0,
            swap_signer: address,
            out_nonce: 0,
        };

        let mut clock = Clock::default();
        clock.unix_timestamp = 1000;
        let mut clock_data = serialize(&clock).unwrap();
        let mut clock_lamports = 100;
        let clock_pubkey = Pubkey::from_str("SysvarC1ock11111111111111111111111111111111").unwrap();
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
        let base_map_seed = COMPLETED_SWAPS_SEED;
        let entry_map_seed = generate_map_entry_key(order.nonce, order.dest_trader).unwrap();
        let (pda, _bump) =
            Pubkey::find_program_address(&[base_map_seed, &entry_map_seed], &program_id);
        let mut cs_data = vec![];
        let mut cs_lamports = 100;
        let completed_swaps_account = create_account_info(
            &pda,
            false,
            true,
            &mut cs_lamports,
            &mut cs_data,
            &program_id,
            false,
            None,
        );
        let mut sp_data = vec![0u8; 10];
        let mut sp_lamports = 100;
        let system_program_account = create_account_info(
            &system_program::ID,
            false,
            false,
            &mut sp_lamports,
            &mut sp_data,
            &system_program::ID,
            true,
            None,
        );
        let sender_key = order.taker;
        let mut sender_lamports = 1000;
        let mut sender_data = vec![0u8; 10];
        let sender_account = create_account_info(
            &sender_key,
            true,
            false,
            &mut sender_lamports,
            &mut sender_data,
            &system_program::ID,
            false,
            None,
        );

        let mut taker_lamports = 100;
        let mut taker_data = vec![0u8; 10];
        let taker_account = create_account_info(
            &generic_key,
            false,
            true,
            &mut taker_lamports,
            &mut taker_data,
            &program_id,
            false,
            None,
        );

        let mut generic_lamports = 100;
        let mut generic_data = vec![0u8; 100];
        let generic_account = create_account_info(
            &generic_key,
            false,
            true,
            &mut generic_lamports,
            &mut generic_data,
            &program_id,
            false,
            None,
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
            None,
        );
        let sol_vault = SystemAccount::try_from(&sol_vault_info)?;

        let mut token_program_lamports = 100;
        let mut token_program_data = vec![0u8; 100];
        let token_program_account = create_account_info(
            &spl_token::ID,
            false,
            false,
            &mut token_program_lamports,
            &mut token_program_data,
            &spl_token::ID,
            true,
            None,
        );
        let token_program = Program::try_from(&token_program_account)?;

        let mut remote_data = vec![0u8; Remote::SIZE];
        let mut remote_lamports = 100;
        let remote_account = create_account_info(
            &generic_key,
            false,
            true,
            &mut remote_lamports,
            &mut remote_data,
            &program_id,
            false,
            Some(Remote::discriminator()),
        );
        let remote = Account::<Remote>::try_from(&remote_account)?;

        let mut destination_entry_data = vec![0u8; AllowedDestinationEntry::LEN];
        let mut destination_entry_lamports = 100;
        let destination_entry_account = create_account_info(
            &generic_key,
            false,
            false,
            &mut destination_entry_lamports,
            &mut destination_entry_data,
            &program_id,
            false,
            Some(AllowedDestinationEntry::discriminator()),
        );

        let mut ep_lamports = 100;
        let mut ep_data = vec![0u8; 10];

        let endpoint_key = Pubkey::new_unique();
        let endpoint_program_account = create_account_info(
            &endpoint_key,
            false,
            false,
            &mut ep_lamports,
            &mut ep_data,
            &program_id,
            true,
            None,
        );

        let portfolio = Portfolio {
            global_config: gc.clone(),
            endpoint: endpoint_key,
            bump: 0,
        };

        let mut portfolio_data = portfolio.try_to_vec().unwrap();
        let mut portfolio_lamports = 100;
        let portfolio_account = create_account_info(
            &generic_key,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator()),
        );
        let program_id_static: &'static Pubkey = Box::leak(Box::new(crate::id()));
        let remaining_accounts: Vec<AccountInfo<'static>> = (0..QUOTE_REMAINING_ACCOUNTS_COUNT)
            .map(|_| create_dummy_account(program_id_static))
            .collect();
        let portfolio_clone = portfolio_account.clone();

        let mut accounts = CrossSwap {
            sender: Signer::try_from(&sender_account)?,
            taker: taker_account,
            dest_trader: generic_account.clone(),
            completed_swaps_entry: completed_swaps_account,
            system_program: Program::try_from(&system_program_account)?,
            clock: Sysvar::from_account_info(&clock_account)?,
            portfolio: Account::try_from(&portfolio_clone)?,
            spl_vault: generic_account.clone(),
            sol_vault,
            src_token_mint: generic_account.clone(),
            taker_src_asset_ata: generic_account.clone(),
            spl_vault_src_asset_ata: generic_account.clone(),
            token_program,
            remote,
            endpoint_program: endpoint_program_account,
            destination_entry: destination_entry_account,
        };
        let mut ctx = Context {
            accounts: &mut accounts.clone(),
            remaining_accounts: &remaining_accounts,
            program_id: &program_id,
            bumps: CrossSwapBumps::default(),
        };
        let params = CrossSwapParams {
            order: order.clone(),
            signature: generate_valid_signature(&order.to_bytes()).into(),
        };

        let res = cross_swap(&mut ctx, &params);
        assert_eq!(res.unwrap_err(), DexalotError::InvalidTaker.into());

        gc.program_paused = true;

        let portfolio = Portfolio {
            global_config: gc,
            endpoint: endpoint_key,
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
            Some(Portfolio::discriminator()),
        );
        accounts.portfolio = Account::try_from(&portfolio_account)?;
        ctx.accounts = &mut accounts;

        let res = cross_swap(&mut ctx, &params);
        assert_eq!(res.unwrap_err(), DexalotError::ProgramPaused.into());
        Ok(())
    }
}
