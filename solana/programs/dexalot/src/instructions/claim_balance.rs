use anchor_lang::{
    prelude::*,
    solana_program::{program::invoke_signed, system_instruction},
};
use anchor_spl::token::{spl_token, Mint, Token, TokenAccount};

use crate::{
    consts::{
        ADMIN_SEED, AIRDROP_VAULT_SEED, NATIVE_VAULT_MIN_THRESHOLD, PORTFOLIO_SEED,
        REBALANCER_SEED, SOL_VAULT_SEED, SPL_VAULT_SEED,
    },
    errors::DexalotError,
    state::Portfolio,
};

#[derive(Accounts, Clone)]
pub struct ClaimSplBalance<'info> {
    pub authority: Signer<'info>,
    /// CHECK: the rebalancer
    #[account(
            seeds = [REBALANCER_SEED, authority.key().as_ref()],
            bump
        )]
    pub rebalancer: AccountInfo<'info>,
    /// CHECK: spl vault address
    #[account(
        seeds = [SPL_VAULT_SEED],
        bump,
    )]
    pub spl_vault: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        constraint = from.key() == anchor_spl::associated_token::get_associated_token_address(
            spl_vault.key,
            &mint.key(),
        ) @ DexalotError::InvalidDestinationOwner,
    )]
    pub from: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = to.key() == anchor_spl::associated_token::get_associated_token_address(
            &authority.key(),
            &mint.key(),
        ) @ DexalotError::InvalidDestinationOwner,
    )]
    pub to: Account<'info, TokenAccount>,
    #[account(
        seeds = [PORTFOLIO_SEED],
        bump = portfolio.bump
    )]
    pub portfolio: Account<'info, Portfolio>,
}

#[derive(Clone, AnchorDeserialize, AnchorSerialize)]
pub struct ClaimSplBalanceParams {
    pub token_address: Pubkey,
    pub amount: u64,
}

pub fn claim_spl_balance(
    ctx: &Context<ClaimSplBalance>,
    params: &ClaimSplBalanceParams,
) -> Result<()> {
    let token_program = &ctx.accounts.token_program;
    let from = &ctx.accounts.from;
    let to = &ctx.accounts.to;
    let spl_vault = &ctx.accounts.spl_vault;
    let rebalancer = &ctx.accounts.rebalancer;
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
        from.amount >= params.amount,
        DexalotError::NotEnoughSplTokenBalance
    );

    let ix = spl_token::instruction::transfer(
        &token_program.key(),
        &from.key(),
        &to.key(),
        &spl_vault.key(),
        &[],
        params.amount,
    )?;

    let bump = &[ctx.bumps.spl_vault];
    let seeds: &[&[u8]] = &[SPL_VAULT_SEED.as_ref(), bump];
    let signer_seeds = &[&seeds[..]];

    // Transfer the tokens from the portfolio to the user
    if cfg!(not(test)) {
        invoke_signed(
            &ix,
            &[
                from.to_account_info(),
                to.to_account_info(),
                spl_vault.to_account_info(),
                token_program.to_account_info(),
            ],
            signer_seeds,
        )?;
    }
    Ok(())
}

#[derive(Accounts)]
pub struct ClaimNativeBalance<'info> {
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
    pub system_program: Program<'info, System>,
    #[account(
        seeds = [PORTFOLIO_SEED],
        bump = portfolio.bump
    )]
    pub portfolio: Account<'info, Portfolio>,
}

#[derive(Clone, AnchorDeserialize, AnchorSerialize)]
pub struct ClaimNativeBalanceParams {
    pub amount: u64,
}

pub fn claim_native_balance(
    ctx: &Context<ClaimNativeBalance>,
    params: &ClaimNativeBalanceParams,
) -> Result<()> {
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
        sol_vault.lamports() >= params.amount + NATIVE_VAULT_MIN_THRESHOLD,
        DexalotError::NotEnoughNativeBalance
    );

    let bump = &[ctx.bumps.sol_vault];
    let seeds: &[&[u8]] = &[SOL_VAULT_SEED.as_ref(), bump];
    let signer_seeds = &[&seeds[..]];

    // Transfer the native SOL from the program to the user
    let ix = system_instruction::transfer(&sol_vault.key(), &authority.key(), params.amount);
    if cfg!(not(test)) {
        invoke_signed(
            &ix,
            &[
                sol_vault.to_account_info().clone(),
                authority.to_account_info().clone(),
                system_program.to_account_info().clone(),
            ],
            signer_seeds, // sign with the PDA
        )?;
    }
    Ok(())
}

#[derive(Accounts, Clone)]
pub struct ClaimAirdropBalance<'info> {
    pub authority: Signer<'info>,
    /// CHECK: the admin pda
    #[account(
        seeds = [ADMIN_SEED, authority.key().as_ref()],
        bump)]
    pub admin: AccountInfo<'info>,
    /// CHECK: the airdrop vault
    #[account(
        mut,
        seeds = [AIRDROP_VAULT_SEED],
        bump,
    )]
    pub airdrop_vault: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    #[account(
        seeds = [PORTFOLIO_SEED],
        bump = portfolio.bump
    )]
    pub portfolio: Account<'info, Portfolio>,
}

#[derive(Clone, AnchorDeserialize, AnchorSerialize)]
pub struct ClaimAirdropBalanceParams {
    pub amount: u64,
}

pub fn claim_airdrop_balance(
    ctx: &Context<ClaimAirdropBalance>,
    params: &ClaimAirdropBalanceParams,
) -> Result<()> {
    let authority = &ctx.accounts.authority;
    let airdrop_vault = &ctx.accounts.airdrop_vault;
    let admin = &ctx.accounts.admin;
    let system_program = &ctx.accounts.system_program;
    let global_config = &ctx.accounts.portfolio.global_config;

    // Check the program is not paused
    require!(!global_config.program_paused, DexalotError::ProgramPaused);

    // check admin
    require!(
        admin.owner == ctx.program_id,
        DexalotError::UnauthorizedSigner
    );
    // check balance
    require!(
        airdrop_vault.lamports() >= params.amount,
        DexalotError::NotEnoughNativeBalance
    );

    let bump = &[ctx.bumps.airdrop_vault];
    let seeds: &[&[u8]] = &[AIRDROP_VAULT_SEED, bump];
    let signer_seeds = &[&seeds[..]];

    // Transfer the native SOL from the program to the user
    let ix = system_instruction::transfer(&airdrop_vault.key(), &authority.key(), params.amount);
    if cfg!(not(test)) {
        invoke_signed(
            &ix,
            &[
                airdrop_vault.to_account_info().clone(),
                authority.to_account_info().clone(),
                system_program.to_account_info().clone(),
            ],
            signer_seeds, // sign with the PDA
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_utils::create_account_info;
    use anchor_lang::{
        solana_program::{program_pack::Pack, system_program},
        Discriminator,
    };
    use anchor_spl::token::{self, Mint, Token, TokenAccount};
    use spl_token::state::AccountState;

    #[test]
    fn test_claim_spl_balance_success() -> Result<()> {
        let program_id = crate::id();
        let generic_pubkey = Pubkey::new_unique();

        let authority_key = Pubkey::new_unique();
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

        let rebalancer_key = Pubkey::new_unique();
        let mut rebalancer_lamports = 100;
        let mut rebalancer_data = vec![0u8; 10];
        let rebalancer_info = create_account_info(
            &rebalancer_key,
            false,
            true,
            &mut rebalancer_lamports,
            &mut rebalancer_data,
            &program_id,
            false,
            None,
        );

        let spl_vault_key = Pubkey::new_unique();
        let mut spl_vault_lamports = 100;
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

        let mut token_prog_lamports = 100;
        let mut token_prog_data = vec![0u8; 10];
        let token_prog_info = create_account_info(
            &token::ID,
            false,
            false,
            &mut token_prog_lamports,
            &mut token_prog_data,
            &token::ID,
            true,
            None,
        );
        let token_program = Program::<Token>::try_from(&token_prog_info)?;

        let mut mint_lamports = 100;
        let mut mint_data = vec![0u8; Mint::LEN];
        let mint_default = Mint::default();
        spl_token::state::Mint::pack_into_slice(&mint_default, &mut mint_data);
        // setting initialized to true so that it passes the check
        mint_data[45] = 1;
        let mint_info = create_account_info(
            &generic_pubkey,
            false,
            false,
            &mut mint_lamports,
            &mut mint_data,
            &token::ID,
            true,
            None,
        );
        let mint_account = Account::<Mint>::try_from(&mint_info)?;

        let mut default_token_account = spl_token::state::Account::default();
        default_token_account.state = AccountState::Initialized;
        default_token_account.amount = 1000;
        let mut default_token_data = vec![0u8; spl_token::state::Account::LEN];
        let mut default_token_lamports = 100;
        spl_token::state::Account::pack_into_slice(&default_token_account, &mut default_token_data);
        let spl_token_info = create_account_info(
            &generic_pubkey,
            false,
            false,
            &mut default_token_lamports,
            &mut default_token_data,
            &token::ID,
            true,
            None,
        );
        let spl_token_account: Account<TokenAccount> = Account::try_from(&spl_token_info)?;

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

        let mut accounts = ClaimSplBalance {
            authority: Signer::try_from(&authority_info)?,
            rebalancer: rebalancer_info.clone(),
            spl_vault: spl_vault_info.clone(),
            token_program,
            mint: mint_account,
            from: spl_token_account.clone(),
            to: spl_token_account,
            portfolio: portfolio_account,
        };

        let params = ClaimSplBalanceParams {
            token_address: generic_pubkey,
            amount: 500,
        };

        let ctx = Context {
            accounts: &mut accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: ClaimSplBalanceBumps::default(),
        };

        let result = claim_spl_balance(&ctx, &params);
        assert!(result.is_ok());
        Ok(())
    }

    #[test]
    fn test_claim_spl_balance_negative_cases() -> Result<()> {
        let program_id = crate::id();
        let generic_pubkey = Pubkey::new_unique();

        let authority_key = Pubkey::new_unique();
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

        let rebalancer_key = Pubkey::new_unique();
        let mut rebalancer_lamports = 100;
        let mut rebalancer_data = vec![0u8; 10];
        let mut rebalancer_info = create_account_info(
            &rebalancer_key,
            false,
            true,
            &mut rebalancer_lamports,
            &mut rebalancer_data,
            &program_id,
            false,
            None,
        );

        let spl_vault_key = Pubkey::new_unique();
        let mut spl_vault_lamports = 100;
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

        let mut token_prog_lamports = 100;
        let mut token_prog_data = vec![0u8; 10];
        let token_prog_info = create_account_info(
            &token::ID,
            false,
            false,
            &mut token_prog_lamports,
            &mut token_prog_data,
            &token::ID,
            true,
            None,
        );
        let token_program = Program::<Token>::try_from(&token_prog_info)?;

        let mut mint_lamports = 100;
        let mut mint_data = vec![0u8; Mint::LEN];
        let mint_default = Mint::default();
        spl_token::state::Mint::pack_into_slice(&mint_default, &mut mint_data);
        // setting initialized to true so that it passes the check
        mint_data[45] = 1;
        let mint_info = create_account_info(
            &generic_pubkey,
            false,
            false,
            &mut mint_lamports,
            &mut mint_data,
            &token::ID,
            true,
            None,
        );
        let mint_account = Account::<Mint>::try_from(&mint_info)?;

        let mut default_token_account = spl_token::state::Account::default();
        default_token_account.state = AccountState::Initialized;
        default_token_account.amount = 1000;
        let mut default_token_data = vec![0u8; spl_token::state::Account::LEN];
        let mut default_token_lamports = 100;
        spl_token::state::Account::pack_into_slice(&default_token_account, &mut default_token_data);
        let spl_token_info = create_account_info(
            &generic_pubkey,
            false,
            false,
            &mut default_token_lamports,
            &mut default_token_data,
            &token::ID,
            true,
            None,
        );
        let spl_token_account: Account<TokenAccount> = Account::try_from(&spl_token_info)?;

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

        let accounts = ClaimSplBalance {
            authority: Signer::try_from(&authority_info)?,
            rebalancer: rebalancer_info.clone(),
            spl_vault: spl_vault_info.clone(),
            token_program,
            mint: mint_account,
            from: spl_token_account.clone(),
            to: spl_token_account,
            portfolio: portfolio_account,
        };

        let params = ClaimSplBalanceParams {
            token_address: generic_pubkey,
            amount: 5000,
        };

        let ctx = Context {
            accounts: &mut accounts.clone(),
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: ClaimSplBalanceBumps::default(),
        };

        let result = claim_spl_balance(&ctx, &params);
        assert_eq!(
            result.unwrap_err(),
            DexalotError::NotEnoughSplTokenBalance.into()
        );

        rebalancer_info.owner = &generic_pubkey;
        ctx.accounts.rebalancer = rebalancer_info;

        let result = claim_spl_balance(&ctx, &params);
        assert_eq!(result.unwrap_err(), DexalotError::UnauthorizedSigner.into());
        Ok(())
    }

    #[test]
    fn test_claim_native_balance_success() -> Result<()> {
        let program_id = crate::id();

        let authority_key = Pubkey::new_unique();
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

        let rebalancer_key = Pubkey::new_unique();
        let mut rebalancer_lamports = 100;
        let mut rebalancer_data = vec![0u8; 10];
        let rebalancer_info = create_account_info(
            &rebalancer_key,
            false,
            true,
            &mut rebalancer_lamports,
            &mut rebalancer_data,
            &program_id,
            false,
            None,
        );

        let sol_vault_key = Pubkey::new_unique();
        let mut sol_vault_lamports = 100 + NATIVE_VAULT_MIN_THRESHOLD;
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

        let mut sys_prog_lamports = 100;
        let mut sys_prog_data = vec![0u8; 10];
        let system_prog_info = create_account_info(
            &system_program::ID,
            false,
            false,
            &mut sys_prog_lamports,
            &mut sys_prog_data,
            &system_program::ID,
            true,
            None,
        );
        let system_program = Program::<System>::try_from(&system_prog_info)?;

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

        let mut accounts = ClaimNativeBalance {
            authority: Signer::try_from(&authority_info)?,
            rebalancer: rebalancer_info.clone(),
            sol_vault: sol_vault_info.clone(),
            system_program,
            portfolio: portfolio_account
        };

        let params = ClaimNativeBalanceParams { amount: 50 };

        let ctx = Context {
            accounts: &mut accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: ClaimNativeBalanceBumps::default(),
        };

        let result = claim_native_balance(&ctx, &params);
        assert!(result.is_ok());
        Ok(())
    }

    #[test]
    fn test_claim_native_balance_negative_cases() -> Result<()> {
        let program_id = crate::id();
        let generic_pubkey = Pubkey::new_unique();

        let authority_key = Pubkey::new_unique();
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

        let rebalancer_key = Pubkey::new_unique();
        let mut rebalancer_lamports = 100;
        let mut rebalancer_data = vec![0u8; 10];
        let mut rebalancer_info = create_account_info(
            &rebalancer_key,
            false,
            true,
            &mut rebalancer_lamports,
            &mut rebalancer_data,
            &program_id,
            false,
            None,
        );

        let sol_vault_key = Pubkey::new_unique();
        let mut sol_vault_lamports = 100 + NATIVE_VAULT_MIN_THRESHOLD;
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

        let mut sys_prog_lamports = 100;
        let mut sys_prog_data = vec![0u8; 10];
        let system_prog_info = create_account_info(
            &system_program::ID,
            false,
            false,
            &mut sys_prog_lamports,
            &mut sys_prog_data,
            &system_program::ID,
            true,
            None,
        );
        let system_program = Program::<System>::try_from(&system_prog_info)?;

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

        let mut accounts = ClaimNativeBalance {
            authority: Signer::try_from(&authority_info)?,
            rebalancer: rebalancer_info.clone(),
            sol_vault: sol_vault_info.clone(),
            system_program,
            portfolio: portfolio_account
        };

        let params = ClaimNativeBalanceParams { amount: 5000 };

        let ctx = Context {
            accounts: &mut accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: ClaimNativeBalanceBumps::default(),
        };

        let result = claim_native_balance(&ctx, &params);
        assert_eq!(
            result.unwrap_err(),
            DexalotError::NotEnoughNativeBalance.into()
        );

        rebalancer_info.owner = &generic_pubkey;
        ctx.accounts.rebalancer = rebalancer_info;

        let result = claim_native_balance(&ctx, &params);
        assert_eq!(result.unwrap_err(), DexalotError::UnauthorizedSigner.into());
        Ok(())
    }

    #[test]
    fn test_claim_airdrop_balance_success() -> Result<()> {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let mut authority_lamports = 100;
        let mut authority_data = vec![0u8; 100];
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
        let admin_key = Pubkey::new_unique();
        let mut admin_lamports = 100;
        let mut admin_data = vec![0u8; 100];
        let admin_info = create_account_info(
            &admin_key,
            false,
            false,
            &mut admin_lamports,
            &mut admin_data,
            &program_id,
            false,
            None,
        );
        let airdrop_vault_key = Pubkey::new_unique();
        let mut airdrop_vault_lamports = 1000;
        let mut airdrop_vault_data = vec![0u8; 100];
        let airdrop_vault_info = create_account_info(
            &airdrop_vault_key,
            false,
            true,
            &mut airdrop_vault_lamports,
            &mut airdrop_vault_data,
            &program_id,
            false,
            None,
        );
        let system_program_id = system_program::ID;
        let mut system_data = vec![0u8; 100];
        let mut system_lamports = 100;
        let system_info = create_account_info(
            &system_program_id,
            false,
            false,
            &mut system_lamports,
            &mut system_data,
            &system_program_id,
            true,
            None,
        );

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

        let mut accounts = ClaimAirdropBalance {
            authority: Signer::try_from(&authority_info)?,
            admin: admin_info,
            airdrop_vault: airdrop_vault_info,
            system_program: Program::try_from(&system_info)?,
            portfolio: portfolio_account
        };
        let params = ClaimAirdropBalanceParams { amount: 500 };
        let ctx = Context {
            accounts: &mut accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: ClaimAirdropBalanceBumps::default(),
        };
        let result = claim_airdrop_balance(&ctx, &params);
        assert!(result.is_ok());
        Ok(())
    }

    #[test]
    fn test_claim_airdrop_balance_negative_cases() -> Result<()> {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let mut authority_lamports = 100;
        let mut authority_data = vec![0u8; 100];
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
        let admin_key = Pubkey::new_unique();
        let mut admin_lamports = 100;
        let mut admin_data = vec![0u8; 100];
        let mut admin_info = create_account_info(
            &admin_key,
            false,
            false,
            &mut admin_lamports,
            &mut admin_data,
            &program_id,
            false,
            None,
        );
        let airdrop_vault_key = Pubkey::new_unique();
        let mut airdrop_vault_lamports = 1000;
        let mut airdrop_vault_data = vec![0u8; 100];
        let airdrop_vault_info = create_account_info(
            &airdrop_vault_key,
            false,
            true,
            &mut airdrop_vault_lamports,
            &mut airdrop_vault_data,
            &program_id,
            false,
            None,
        );
        let system_program_id = system_program::ID;
        let mut system_data = vec![0u8; 100];
        let mut system_lamports = 100;
        let system_info = create_account_info(
            &system_program_id,
            false,
            false,
            &mut system_lamports,
            &mut system_data,
            &system_program_id,
            true,
            None,
        );

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

        let admin_clone = admin_info.clone();
        let mut accounts = ClaimAirdropBalance {
            authority: Signer::try_from(&authority_info)?,
            admin: admin_clone,
            airdrop_vault: airdrop_vault_info,
            system_program: Program::try_from(&system_info)?,
            portfolio: portfolio_account
        };
        let params = ClaimAirdropBalanceParams { amount: 5000 };
        let mut ctx = Context {
            accounts: &mut accounts.clone(),
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: ClaimAirdropBalanceBumps::default(),
        };

        let result = claim_airdrop_balance(&ctx, &params);
        assert_eq!(
            result.unwrap_err(),
            DexalotError::NotEnoughNativeBalance.into()
        );

        admin_info.owner = &admin_key;
        accounts.admin = admin_info;
        ctx.accounts = &mut accounts;

        let result = claim_airdrop_balance(&ctx, &params);
        assert_eq!(result.unwrap_err(), DexalotError::UnauthorizedSigner.into());
        Ok(())
    }
}
