use anchor_lang::{
    prelude::*,
    solana_program::{program::invoke, system_instruction},
};
use anchor_spl::token::{self, Token, TokenAccount, Transfer as SplTransfer};

use crate::{
    consts::{PORTFOLIO_SEED, REBALANCER_SEED, SOL_VAULT_SEED, SPL_VAULT_SEED},
    errors::DexalotError,
    state::Portfolio,
};

#[derive(Accounts, Clone)]
pub struct FundSol<'info> {
    pub authority: Signer<'info>,
    /// CHECK: the rebalancer
    #[account(
            seeds = [REBALANCER_SEED, authority.key().as_ref()],
            bump
        )]
    pub rebalancer: AccountInfo<'info>,
    /// CHECK: the sol vault
    #[account(
            mut,
            seeds = [SOL_VAULT_SEED],
            bump,
        )]
    pub sol_vault: AccountInfo<'info>,
    #[account(
        seeds = [PORTFOLIO_SEED],
        bump = portfolio.bump
    )]
    pub portfolio: Account<'info, Portfolio>,
    pub system_program: Program<'info, System>,
}

#[derive(Clone, AnchorDeserialize, AnchorSerialize)]
pub struct FundSolParams {
    amount: u64,
}

pub fn fund_sol(ctx: &Context<FundSol>, params: &FundSolParams) -> Result<()> {
    let authority = &ctx.accounts.authority;
    let sol_vault = &ctx.accounts.sol_vault;
    let rebalancer = &ctx.accounts.rebalancer;
    let system_program = &ctx.accounts.system_program;
    let global_config = &ctx.accounts.portfolio.global_config;

    // Check the program is not paused
    require!(!global_config.program_paused, DexalotError::ProgramPaused);

    // check rebalancer
    require!(
        rebalancer.owner == ctx.program_id,
        DexalotError::UnauthorizedSigner
    );

    // check balance
    require!(
        authority.lamports() >= params.amount,
        DexalotError::NotEnoughNativeBalance
    );

    // Transfer the native SOL from the user to the program
    let ix = system_instruction::transfer(&authority.key(), &sol_vault.key(), params.amount);
    if cfg!(not(test)) {
        invoke(
            &ix,
            &[
                authority.to_account_info().clone(),
                sol_vault.to_account_info().clone(),
                system_program.to_account_info().clone(),
            ],
        )?;
    }
    Ok(())
}

#[derive(Accounts, Clone)]
#[instruction(params: FundSplParams)]
pub struct FundSpl<'info> {
    pub authority: Signer<'info>,
    /// CHECK: the rebalancer
    #[account(
            seeds = [REBALANCER_SEED, authority.key().as_ref()],
            bump
        )]
    pub rebalancer: AccountInfo<'info>,
    /// CHECK: the sol vault
    #[account(
            mut,
            seeds = [SPL_VAULT_SEED],
            bump,
        )]
    pub spl_vault: AccountInfo<'info>,
    #[account(
        mut,
        constraint = from.key() == anchor_spl::associated_token::get_associated_token_address(
            authority.key,
            &params.token_mint,
        ) @ DexalotError::InvalidDestinationOwner,
        constraint = from.owner == authority.key() @ DexalotError::InvalidTokenOwner,
        constraint = from.mint == params.token_mint @ DexalotError::InvalidMint
    )]
    pub from: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = to.key() == anchor_spl::associated_token::get_associated_token_address(
            spl_vault.key,
            &params.token_mint,
        ) @ DexalotError::InvalidDestinationOwner,
        constraint = &to.owner == spl_vault.key @ DexalotError::InvalidDestinationOwner,
        constraint = to.mint == params.token_mint @ DexalotError::InvalidMint
    )]
    pub to: Account<'info, TokenAccount>,
    #[account(
        seeds = [PORTFOLIO_SEED],
        bump = portfolio.bump
    )]
    pub portfolio: Account<'info, Portfolio>,
    pub token_program: Program<'info, Token>,
}

#[derive(Clone, AnchorDeserialize, AnchorSerialize)]
pub struct FundSplParams {
    token_mint: Pubkey,
    amount: u64,
}

pub fn fund_spl(ctx: &Context<FundSpl>, params: &FundSplParams) -> Result<()> {
    let authority = &ctx.accounts.authority;
    let rebalancer = &ctx.accounts.rebalancer;
    let token_program = &ctx.accounts.token_program;
    let from = &ctx.accounts.from;
    let to = &ctx.accounts.to;
    let global_config = &ctx.accounts.portfolio.global_config;

    // Check the program is not paused
    require!(!global_config.program_paused, DexalotError::ProgramPaused);

    // check rebalancer
    require!(
        rebalancer.owner == ctx.program_id,
        DexalotError::UnauthorizedSigner
    );

    require!(
        from.amount >= params.amount,
        DexalotError::NotEnoughSplTokenBalance
    );

    let cpi_accounts = SplTransfer {
        from: from.to_account_info().clone(),
        to: to.to_account_info().clone(),
        authority: authority.to_account_info(),
    };
    let cpi_program = token_program.to_account_info();

    if cfg!(not(test)) {
        token::transfer(CpiContext::new(cpi_program, cpi_accounts), params.amount)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::errors::DexalotError;
    use crate::test_utils::create_account_info;
    use anchor_lang::{
        solana_program::{program_pack::Pack, system_program},
        Discriminator,
    };
    use anchor_spl::token::spl_token;

    #[test]
    fn test_fund_sol_success() -> Result<()> {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let sol_vault_key = Pubkey::new_unique();
        let rebalancer_key = Pubkey::new_unique();
        let sys_prog_key = system_program::ID;

        let mut authority_lamports = 100;
        let mut authority_data = vec![0u8; 10];
        let authority_info = create_account_info(
            &authority_key,
            true,
            true,
            &mut authority_lamports,
            &mut authority_data,
            &program_id,
            false,
            None,
        );

        let mut sol_vault_lamports = 0;
        let mut sol_vault_data = vec![0u8; 10];
        let sol_vault_info = create_account_info(
            &sol_vault_key,
            false,
            true,
            &mut sol_vault_lamports,
            &mut sol_vault_data,
            &program_id,
            false,
            None,
        );

        let mut rebalancer_lamports = 0;
        let mut rebalancer_data = vec![0u8; 10];
        let rebalancer_info = create_account_info(
            &rebalancer_key,
            false,
            false,
            &mut rebalancer_lamports,
            &mut rebalancer_data,
            &program_id,
            false,
            None,
        );

        let mut sys_prog_lamports = 0;
        let mut sys_prog_data = vec![0u8; 10];
        let system_program_info = create_account_info(
            &sys_prog_key,
            false,
            false,
            &mut sys_prog_lamports,
            &mut sys_prog_data,
            &sys_prog_key,
            true,
            None,
        );
        let system_program_account = Program::<System>::try_from(&system_program_info)?;

        let portfolio_key = Pubkey::new_unique();
        let mut portfolio_lamports = 100;
        let mut portfolio_data = vec![0u8; Portfolio::LEN];

        let portfolio = create_account_info(
            &portfolio_key,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator()),
        );
        let portfolio_account = Account::<Portfolio>::try_from(&portfolio).unwrap();

        let mut accounts = FundSol {
            authority: Signer::try_from(&authority_info)?,
            rebalancer: rebalancer_info,
            sol_vault: sol_vault_info,
            portfolio: portfolio_account,
            system_program: system_program_account,
        };

        let ctx = Context {
            accounts: &mut accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: FundSolBumps::default(),
        };

        let params = FundSolParams { amount: 50 };
        let result = fund_sol(&ctx, &params);
        assert!(result.is_ok());
        Ok(())
    }

    #[test]
    fn test_fund_sol_negative_cases() -> Result<()> {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let sol_vault_key = Pubkey::new_unique();
        let rebalancer_key = Pubkey::new_unique();
        let sys_prog_key = system_program::ID;

        let mut authority_lamports = 100;
        let mut authority_data = vec![0u8; 10];
        let authority_info = create_account_info(
            &authority_key,
            true,
            true,
            &mut authority_lamports,
            &mut authority_data,
            &program_id,
            false,
            None,
        );

        let mut sol_vault_lamports = 0;
        let mut sol_vault_data = vec![0u8; 10];
        let sol_vault_info = create_account_info(
            &sol_vault_key,
            false,
            true,
            &mut sol_vault_lamports,
            &mut sol_vault_data,
            &program_id,
            false,
            None,
        );

        let mut rebalancer_lamports = 0;
        let mut rebalancer_data = vec![0u8; 10];
        let mut rebalancer_info = create_account_info(
            &rebalancer_key,
            false,
            false,
            &mut rebalancer_lamports,
            &mut rebalancer_data,
            &program_id,
            false,
            None,
        );

        let mut sys_prog_lamports = 0;
        let mut sys_prog_data = vec![0u8; 10];
        let system_program_info = create_account_info(
            &sys_prog_key,
            false,
            false,
            &mut sys_prog_lamports,
            &mut sys_prog_data,
            &sys_prog_key,
            true,
            None,
        );
        let system_program_account = Program::<System>::try_from(&system_program_info)?;

        let portfolio_key = Pubkey::new_unique();
        let mut portfolio_lamports = 100;
        let mut portfolio_data = vec![0u8; Portfolio::LEN];

        let portfolio = create_account_info(
            &portfolio_key,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator()),
        );
        let portfolio_account = Account::<Portfolio>::try_from(&portfolio).unwrap();

        let mut accounts = FundSol {
            authority: Signer::try_from(&authority_info)?,
            rebalancer: rebalancer_info.clone(),
            sol_vault: sol_vault_info,
            portfolio: portfolio_account,
            system_program: system_program_account,
        };

        let mut ctx = Context {
            accounts: &mut accounts.clone(),
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: FundSolBumps::default(),
        };

        let params = FundSolParams { amount: 5000 };
        let result = fund_sol(&ctx, &params);
        assert_eq!(
            result.unwrap_err(),
            DexalotError::NotEnoughNativeBalance.into()
        );

        rebalancer_info.owner = &authority_key;
        accounts.rebalancer = rebalancer_info;
        ctx.accounts = &mut accounts;

        let result = fund_sol(&ctx, &params);
        assert_eq!(result.unwrap_err(), DexalotError::UnauthorizedSigner.into());
        Ok(())
    }

    #[test]
    fn test_fund_spl_success() -> Result<()> {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let spl_vault_key = Pubkey::new_unique();
        let rebalancer_key = Pubkey::new_unique();
        let token_mint = Pubkey::new_unique();
        let token_program_key = token::ID;

        let mut authority_lamports = 100;
        let mut authority_data = vec![0u8; 10];
        let authority_info = create_account_info(
            &authority_key,
            true,
            true,
            &mut authority_lamports,
            &mut authority_data,
            &program_id,
            false,
            None,
        );

        let mut rebalancer_lamports = 0;
        let mut rebalancer_data = vec![0u8; 10];
        let rebalancer_info = create_account_info(
            &rebalancer_key,
            false,
            false,
            &mut rebalancer_lamports,
            &mut rebalancer_data,
            &program_id,
            false,
            None,
        );

        let mut spl_vault_lamports = 0;
        let mut spl_vault_data = vec![0u8; 10];
        let spl_vault_info = create_account_info(
            &spl_vault_key,
            false,
            true,
            &mut spl_vault_lamports,
            &mut spl_vault_data,
            &program_id,
            false,
            None,
        );

        let from_key =
            anchor_spl::associated_token::get_associated_token_address(&authority_key, &token_mint);
        let mut from_lamports = 100;
        let mut from_data = vec![0u8; spl_token::state::Account::LEN];
        let mut from_token = spl_token::state::Account::default();
        from_token.state = spl_token::state::AccountState::Initialized;
        from_token.amount = 1000;
        spl_token::state::Account::pack(from_token, &mut from_data).unwrap();
        let from_info = create_account_info(
            &from_key,
            false,
            true,
            &mut from_lamports,
            &mut from_data,
            &token_program_key,
            false,
            None,
        );
        let from_account = Account::<TokenAccount>::try_from(&from_info)?;

        let to_key =
            anchor_spl::associated_token::get_associated_token_address(&spl_vault_key, &token_mint);
        let mut to_lamports = 100;
        let mut to_data = vec![0u8; spl_token::state::Account::LEN];
        let mut to_token = spl_token::state::Account::default();
        to_token.state = spl_token::state::AccountState::Initialized;
        to_token.amount = 0;
        spl_token::state::Account::pack(to_token, &mut to_data)?;
        let to_info = create_account_info(
            &to_key,
            false,
            true,
            &mut to_lamports,
            &mut to_data,
            &token_program_key,
            false,
            None,
        );
        let to_account = Account::<TokenAccount>::try_from(&to_info)?;

        let mut token_prog_lamports = 0;
        let mut token_prog_data = vec![0u8; 10];
        let token_program_info = create_account_info(
            &token_program_key,
            false,
            false,
            &mut token_prog_lamports,
            &mut token_prog_data,
            &token_program_key,
            true,
            None,
        );
        let token_program_account = Program::<Token>::try_from(&token_program_info)?;

        let portfolio_key = Pubkey::new_unique();
        let mut portfolio_lamports = 100;
        let mut portfolio_data = vec![0u8; Portfolio::LEN];

        let portfolio = create_account_info(
            &portfolio_key,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator()),
        );
        let portfolio_account = Account::<Portfolio>::try_from(&portfolio).unwrap();

        let mut accounts = FundSpl {
            authority: Signer::try_from(&authority_info)?,
            rebalancer: rebalancer_info,
            spl_vault: spl_vault_info,
            from: from_account,
            to: to_account,
            portfolio: portfolio_account,
            token_program: token_program_account,
        };

        let ctx = Context {
            accounts: &mut accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: FundSplBumps::default(),
        };

        let params = FundSplParams {
            token_mint,
            amount: 500,
        };
        let result = fund_spl(&ctx, &params);
        assert!(result.is_ok());
        Ok(())
    }

    #[test]
    fn test_fund_spl_negative_cases() -> Result<()> {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let spl_vault_key = Pubkey::new_unique();
        let rebalancer_key = Pubkey::new_unique();
        let token_mint = Pubkey::new_unique();
        let token_program_key = token::ID;

        let mut authority_lamports = 100;
        let mut authority_data = vec![0u8; 10];
        let authority_info = create_account_info(
            &authority_key,
            true,
            true,
            &mut authority_lamports,
            &mut authority_data,
            &program_id,
            false,
            None,
        );

        let mut rebalancer_lamports = 0;
        let mut rebalancer_data = vec![0u8; 10];
        let mut rebalancer_info = create_account_info(
            &rebalancer_key,
            false,
            false,
            &mut rebalancer_lamports,
            &mut rebalancer_data,
            &program_id,
            false,
            None,
        );

        let mut spl_vault_lamports = 0;
        let mut spl_vault_data = vec![0u8; 10];
        let spl_vault_info = create_account_info(
            &spl_vault_key,
            false,
            true,
            &mut spl_vault_lamports,
            &mut spl_vault_data,
            &program_id,
            false,
            None,
        );

        let from_key =
            anchor_spl::associated_token::get_associated_token_address(&authority_key, &token_mint);
        let mut from_lamports = 100;
        let mut from_data = vec![0u8; spl_token::state::Account::LEN];
        let mut from_token = spl_token::state::Account::default();
        from_token.state = spl_token::state::AccountState::Initialized;
        from_token.amount = 1000;
        spl_token::state::Account::pack(from_token, &mut from_data).unwrap();
        let from_info = create_account_info(
            &from_key,
            false,
            true,
            &mut from_lamports,
            &mut from_data,
            &token_program_key,
            false,
            None,
        );
        let from_account = Account::<TokenAccount>::try_from(&from_info)?;

        let to_key =
            anchor_spl::associated_token::get_associated_token_address(&spl_vault_key, &token_mint);
        let mut to_lamports = 100;
        let mut to_data = vec![0u8; spl_token::state::Account::LEN];
        let mut to_token = spl_token::state::Account::default();
        to_token.state = spl_token::state::AccountState::Initialized;
        to_token.amount = 0;
        spl_token::state::Account::pack(to_token, &mut to_data).unwrap();
        let to_info = create_account_info(
            &to_key,
            false,
            true,
            &mut to_lamports,
            &mut to_data,
            &token_program_key,
            false,
            None,
        );
        let to_account = Account::<TokenAccount>::try_from(&to_info)?;

        let mut token_prog_lamports = 0;
        let mut token_prog_data = vec![0u8; 10];
        let token_program_info = create_account_info(
            &token_program_key,
            false,
            false,
            &mut token_prog_lamports,
            &mut token_prog_data,
            &token_program_key,
            true,
            None,
        );
        let token_program_account = Program::<Token>::try_from(&token_program_info)?;

        let portfolio_key = Pubkey::new_unique();
        let mut portfolio_lamports = 100;
        let mut portfolio_data = vec![0u8; Portfolio::LEN];

        let portfolio = create_account_info(
            &portfolio_key,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator()),
        );
        let portfolio_account = Account::<Portfolio>::try_from(&portfolio).unwrap();

        let mut accounts = FundSpl {
            authority: Signer::try_from(&authority_info)?,
            rebalancer: rebalancer_info.clone(),
            spl_vault: spl_vault_info,
            from: from_account,
            to: to_account,
            portfolio: portfolio_account,
            token_program: token_program_account,
        };

        let mut ctx = Context {
            accounts: &mut accounts.clone(),
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: FundSplBumps::default(),
        };

        let params = FundSplParams {
            token_mint,
            amount: 5000,
        };
        let result = fund_spl(&ctx, &params);
        assert_eq!(
            result.unwrap_err(),
            DexalotError::NotEnoughSplTokenBalance.into()
        );

        rebalancer_info.owner = &authority_key;
        accounts.rebalancer = rebalancer_info;
        ctx.accounts = &mut accounts;

        let result = fund_spl(&ctx, &params);
        assert_eq!(result.unwrap_err(), DexalotError::UnauthorizedSigner.into());
        Ok(())
    }
}
