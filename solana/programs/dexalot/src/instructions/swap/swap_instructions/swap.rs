use super::*;
use crate::{
    consts::{COMPLETED_SWAPS_SEED, PORTFOLIO_SEED, SOL_VAULT_SEED, SPL_VAULT_SEED},
    errors::DexalotError,
    state::Portfolio,
};
use anchor_lang::prelude::*;
use anchor_spl::token::Token;

#[derive(Accounts, Clone)]
#[instruction(params: SwapParams)]
pub struct Swap<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,
    /// CHECK: when calling the instruction
    #[account(mut)]
    pub taker: AccountInfo<'info>,
    #[account(mut)]
    /// CHECK: when calling the instruction
    pub dest_trader: AccountInfo<'info>,
    /// CHECK: when calling the instruction
    #[account(mut, seeds = [COMPLETED_SWAPS_SEED, &generate_map_entry_key(params.order.nonce, params.order.dest_trader)?], bump)]
    pub completed_swaps_entry: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    /// Sysvar for accessing block time
    pub clock: Sysvar<'info, Clock>,
    #[account(
        seeds = [PORTFOLIO_SEED], bump
    )]
    pub portfolio: Account<'info, Portfolio>,

    /// CHECK: when calling instruction
    #[account(
        constraint = spl_vault.owner == __program_id @ DexalotError::InvalidVaultOwner,
        seeds = [SPL_VAULT_SEED],
        bump,
    )]
    pub spl_vault: AccountInfo<'info>,
    #[account(mut, seeds = [SOL_VAULT_SEED], bump)]
    pub sol_vault: SystemAccount<'info>,
    /// CHECK: token mint or Zero PublicKey
    pub src_token_mint: AccountInfo<'info>,
    /// CHECK: token mint or Zero PublicKey
    pub dest_token_mint: AccountInfo<'info>,
    /// CHECK: ATA or Zero PublicKey
    #[account(mut)]
    pub taker_dest_asset_ata: AccountInfo<'info>,
    /// CHECK: ATA or Zero PublicKey
    #[account(mut)]
    pub taker_src_asset_ata: AccountInfo<'info>,

    /// CHECK: ATA or Zero PublicKey
    #[account(mut)]
    pub dest_trader_dest_asset_ata: AccountInfo<'info>,
    /// CHECK: ATA or Zero PublicKey
    #[account(mut)]
    pub dest_trader_src_asset_ata: AccountInfo<'info>,

    /// CHECK: ATA or Zero PublicKey
    #[account(mut)]
    pub spl_vault_dest_asset_ata: AccountInfo<'info>,
    /// CHECK: ATA or Zero PublicKey
    #[account(mut)]
    pub spl_vault_src_asset_ata: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Clone, AnchorDeserialize, AnchorSerialize)]
pub struct SwapParams {
    pub order: Order,
    pub signature: Vec<u8>,
    pub is_partial: bool,
    pub taker_amount: u64,
}

pub fn swap(ctx: &Context<Swap>, params: &SwapParams) -> Result<()> {
    let global_config = &ctx.accounts.portfolio.global_config;
    require!(
        !global_config.program_paused,
        DexalotError::ProgramPaused
    );

    check_atas(&ctx, &params)?;

    let mut order = params.order.clone();

    // modify maker amount if it's partial swap
    if params.is_partial {
        if params.taker_amount < order.taker_amount {
            // here we have rounding down
            // logic and code is as provided in: https://github.com/Dexalot/contracts/blob/d75dbce21bce6277929ee22f972e78d3ab546531/contracts/MainnetRFQ.sol#L248
            order.maker_amount = (order.maker_amount * params.taker_amount) / order.taker_amount;
        }
    }

    let is_aggregator = ctx.accounts.sender.key() == order.dest_trader;

    order.validate_order(&ctx, &params.signature, is_aggregator)?;
    order.execute_order(&ctx, is_aggregator)?;

    Ok(())
}

fn check_atas(ctx: &Context<Swap>, params: &SwapParams) -> Result<()> {
    let taker = &ctx.accounts.taker;
    let spl_vault = &ctx.accounts.spl_vault;
    let dest_trader = &ctx.accounts.dest_trader;

    let taker_dest_asset_ata = &ctx.accounts.taker_dest_asset_ata;
    let taker_src_asset_ata = &ctx.accounts.taker_src_asset_ata;

    let dest_trader_dest_asset_ata = &ctx.accounts.dest_trader_dest_asset_ata;
    let dest_trader_src_asset_ata = &ctx.accounts.dest_trader_src_asset_ata;

    let spl_vault_dest_asset_ata = &ctx.accounts.spl_vault_dest_asset_ata;
    let spl_vault_src_asset_ata = &ctx.accounts.spl_vault_src_asset_ata;

    let dest_token_mint = &ctx.accounts.dest_token_mint;
    let src_token_mint = &ctx.accounts.src_token_mint;

    // check if taker is correct
    require_keys_eq!(
        taker.key(),
        params.order.taker,
        DexalotError::InvalidTaker
    );

    // Check ATAs for taker
    check_ata_account(taker_dest_asset_ata, taker.key, dest_token_mint.key, false)?;
    check_ata_account(taker_src_asset_ata, taker.key, src_token_mint.key, false)?;

    // Check ATAs for dest trader
    check_ata_account(
        dest_trader_dest_asset_ata,
        dest_trader.key,
        dest_token_mint.key,
        false,
    )?;
    check_ata_account(
        dest_trader_src_asset_ata,
        dest_trader.key,
        src_token_mint.key,
        false,
    )?;

    // Check ATAs spl vault
    check_ata_account(
        spl_vault_dest_asset_ata,
        spl_vault.key,
        dest_token_mint.key,
        true,
    )?;
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
    use anchor_lang::solana_program::{clock::Clock, system_program};
    use crate::test_utils::{create_account_info, generate_valid_signature};
    use crate::consts::{COMPLETED_SWAPS_SEED, UNUSED_ADDRESS_PUBLIC_KEY};
    use crate::state::{GlobalConfig, Portfolio};
    use bincode::serialize;
    use std::str::FromStr;
    use anchor_lang::Discriminator;

    #[test]
    fn test_swap_success() -> Result<()> {
        let program_id = crate::id();
        let generic_key = Pubkey::new_unique();

        let order = Order {
            maker_asset: Pubkey::new_unique(),
            taker_asset: Pubkey::new_unique(),
            taker: Pubkey::new_unique(),
            maker_amount: 1000,
            taker_amount: 2000,
            expiry: 2000,
            dest_trader: Pubkey::new_unique(),
            nonce: [1u8; 12],
        };

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
            admin: Pubkey::default(),
            global_config: gc,
            endpoint: Pubkey::default(),
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
            Some(Portfolio::discriminator())
        );
        let mut clock = Clock::default();
        clock.unix_timestamp = 1000;
        let mut clock_data = serialize(&clock).unwrap();
        let mut clock_lamports = 100;
        let clock_pubkey = Pubkey::from_str("SysvarC1ock11111111111111111111111111111111").unwrap();
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
        let base_map_seed = COMPLETED_SWAPS_SEED;
        let entry_map_seed = generate_map_entry_key(order.nonce, order.dest_trader).unwrap();
        let (pda, _bump) = Pubkey::find_program_address(&[base_map_seed, &entry_map_seed], &program_id);
        let mut cs_data = vec![];
        let mut cs_lamports = 100;
        let completed_swaps_info = create_account_info(
            &pda,
            false,
            false,
            &mut cs_lamports,
            &mut cs_data,
            &program_id,
            false,
            None
        );

        let mut system_data = vec![0u8; 10];
        let mut system_lamports = 100;
        let system_program_info = create_account_info(
            &system_program::ID,
            false,
            false,
            &mut system_lamports,
            &mut system_data,
            &system_program::ID,
            true,
            None
        );

        let sender_key = order.taker;
        let mut sender_lamports = 1000;
        let mut sender_data = vec![0u8; 10];
        let sender_info = create_account_info(
            &sender_key,
            true,
            false,
            &mut sender_lamports,
            &mut sender_data,
            &system_program::ID,
            false,
            None
        );

        let mut taker_lamports = 1000;
        let mut taker_data = vec![0u8; 10];
        let taker_info = create_account_info(
            &order.taker,
            true,
            false,
            &mut taker_lamports,
            &mut taker_data,
            &program_id,
            false,
            None
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
            &anchor_spl::token::ID,
            false,
            false,
            &mut token_program_lamports,
            &mut token_program_data,
            &anchor_spl::token::ID,
            true,
            None
        );
        let token_program = Program::try_from(&token_program_info)?;

        let mut accounts = Swap {
            sender: Signer::try_from(&sender_info)?,
            taker: taker_info,
            dest_trader: generic_info.clone(),
            completed_swaps_entry: completed_swaps_info,
            system_program: Program::try_from(&system_program_info)?,
            clock: Sysvar::from_account_info(&clock_info)?,
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
            accounts: &mut accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: SwapBumps::default(),
        };

        // necessary in order to generate the right signature because it's based on order bytes
        // and swap() could change those bytes
        let mut order_clone = order.clone();
        order_clone.maker_amount = (order.maker_amount * 200) / order.taker_amount;
        let params = SwapParams {
            order: order.clone(),
            signature: generate_valid_signature(&order_clone.to_bytes()).into(),
            is_partial: true,
            taker_amount: 200,
        };

        let res = swap(&ctx, &params);
        assert!(res.is_ok());
        Ok(())
    }

    #[test]
    fn test_swap_negative_cases() -> Result<()> {
        let program_id = crate::id();
        let generic_key = Pubkey::new_unique();

        let order = Order {
            maker_asset: Pubkey::new_unique(),
            taker_asset: Pubkey::new_unique(),
            taker: Pubkey::new_unique(),
            maker_amount: 1000,
            taker_amount: 2000,
            expiry: 2000,
            dest_trader: Pubkey::new_unique(),
            nonce: [1u8; 12],
        };

        let hex_str = UNUSED_ADDRESS_PUBLIC_KEY;
        let bytes = hex::decode(hex_str).unwrap();
        let address: [u8; 20] = bytes.try_into().unwrap();
        let mut gc = GlobalConfig {
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
            admin: Pubkey::default(),
            global_config: gc.clone(),
            endpoint: Pubkey::default(),
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
        clock.unix_timestamp = 1000;
        let mut clock_data = serialize(&clock).unwrap();
        let mut clock_lamports = 100;
        let clock_pubkey = Pubkey::from_str("SysvarC1ock11111111111111111111111111111111").unwrap();
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
        let base_map_seed = COMPLETED_SWAPS_SEED;
        let entry_map_seed = generate_map_entry_key(order.nonce, order.dest_trader).unwrap();
        let (pda, _bump) = Pubkey::find_program_address(&[base_map_seed, &entry_map_seed], &program_id);
        let mut cs_data = vec![];
        let mut cs_lamports = 100;
        let completed_swaps_info = create_account_info(
            &pda,
            false,
            false,
            &mut cs_lamports,
            &mut cs_data,
            &program_id,
            false,
            None
        );

        let mut system_data = vec![0u8; 10];
        let mut system_lamports = 100;
        let system_program_info = create_account_info(
            &system_program::ID,
            false,
            false,
            &mut system_lamports,
            &mut system_data,
            &system_program::ID,
            true,
            None
        );

        let sender_key = order.taker;
        let mut sender_lamports = 1000;
        let mut sender_data = vec![0u8; 10];
        let sender_info = create_account_info(
            &sender_key,
            true,
            false,
            &mut sender_lamports,
            &mut sender_data,
            &system_program::ID,
            false,
            None
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
            &anchor_spl::token::ID,
            false,
            false,
            &mut token_program_lamports,
            &mut token_program_data,
            &anchor_spl::token::ID,
            true,
            None
        );
        let token_program = Program::try_from(&token_program_info)?;

        let mut accounts = Swap {
            sender: Signer::try_from(&sender_info)?,
            taker: generic_info.clone(),
            dest_trader: generic_info.clone(),
            completed_swaps_entry: completed_swaps_info,
            system_program: Program::try_from(&system_program_info)?,
            clock: Sysvar::from_account_info(&clock_info)?,
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
            accounts: &mut accounts.clone(),
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: SwapBumps::default(),
        };
        let params = SwapParams {
            order: order.clone(),
            signature: generate_valid_signature(&order.to_bytes()).into(),
            is_partial: true,
            taker_amount: 200,
        };

        let res = swap(&ctx, &params);
        assert_eq!(res.unwrap_err(), DexalotError::InvalidTaker.into());

        gc.program_paused = true;

        let portfolio = Portfolio {
            admin: Pubkey::default(),
            global_config: gc,
            endpoint: Pubkey::default(),
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
        accounts.portfolio = Account::try_from(&portfolio_account)?;
        ctx.accounts = &mut accounts;

        let res = swap(&ctx, &params);
        assert_eq!(res.unwrap_err(), DexalotError::ProgramPaused.into());
        Ok(())
    }
}

