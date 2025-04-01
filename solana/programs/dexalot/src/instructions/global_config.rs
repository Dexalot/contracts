use anchor_lang::prelude::*;

use crate::consts::{ADMIN_SEED, PORTFOLIO_SEED};
use crate::errors::DexalotError;
use crate::state::{GlobalConfig, Portfolio};

#[derive(Accounts)]
pub struct GetGlobalConfig<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [PORTFOLIO_SEED],
        bump,
    )]
    pub portfolio: Account<'info, Portfolio>,
    /// CHECK: the admin pda
    #[account(
    seeds = [ADMIN_SEED, authority.key().as_ref()],
    bump)]
    pub admin: AccountInfo<'info>,
}

pub fn get_global_config(ctx: &Context<GetGlobalConfig>) -> Result<GlobalConfig> {
    let admin = &ctx.accounts.admin;
    require!(
        admin.owner == ctx.program_id,
        DexalotError::UnauthorizedSigner
    );
    let global_config = &ctx.accounts.portfolio.global_config;

    Ok(global_config.clone())
}

pub fn set_allow_deposit(ctx: &mut Context<WriteConfig>, allow_deposit: bool) -> Result<()> {
    let admin = &ctx.accounts.admin;

    require!(
        admin.owner == ctx.program_id,
        DexalotError::UnauthorizedSigner
    );

    ctx.accounts.portfolio.global_config.allow_deposit = allow_deposit;

    Ok(())
}

pub fn set_paused(ctx: &mut Context<WriteConfig>, paused: bool) -> Result<()> {
    let admin = &ctx.accounts.admin;

    require!(
        admin.owner == ctx.program_id,
        DexalotError::UnauthorizedSigner
    );

    ctx.accounts.portfolio.global_config.program_paused = paused;

    Ok(())
}

pub fn set_native_deposits_restricted(
    ctx: &mut Context<WriteConfig>,
    native_deposits_restricted: bool,
) -> Result<()> {
    let admin = &ctx.accounts.admin;

    require!(
        admin.owner == ctx.program_id,
        DexalotError::UnauthorizedSigner
    );

    ctx.accounts
        .portfolio
        .global_config
        .native_deposits_restricted = native_deposits_restricted;

    Ok(())
}

pub fn set_default_chain(ctx: &mut Context<WriteConfig>, params: &SetDefaultChainId) -> Result<()> {
    let admin = &ctx.accounts.admin;
    require!(
        admin.owner == ctx.program_id,
        DexalotError::UnauthorizedSigner
    );

    ctx.accounts.portfolio.global_config.default_chain_id = params.chain_id;

    Ok(())
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct SetDefaultChainId {
    pub chain_id: u32,
}

pub fn set_airdrop(ctx: &mut Context<WriteConfig>, params: &SetAirdropParams) -> Result<()> {
    let admin = &ctx.accounts.admin;
    require!(
        admin.owner == ctx.program_id,
        DexalotError::UnauthorizedSigner
    );

    ctx.accounts.portfolio.global_config.airdrop_amount = params.amount;

    Ok(())
}

#[derive(Clone, AnchorDeserialize, AnchorSerialize)]
pub struct SetAirdropParams {
    amount: u64,
}

pub fn set_swap_signer(ctx: &mut Context<WriteConfig>, params: &SetSlapSignerParams) -> Result<()> {
    let admin = &ctx.accounts.admin;
    require!(
        admin.owner == ctx.program_id,
        DexalotError::UnauthorizedSigner
    );

    ctx.accounts.portfolio.global_config.swap_signer = params.swap_signer;

    Ok(())
}

#[derive(Clone, AnchorDeserialize, AnchorSerialize)]
pub struct SetSlapSignerParams {
    swap_signer: [u8; 20],
}

#[derive(Accounts)]
pub struct WriteConfig<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [PORTFOLIO_SEED],
        bump
    )]
    pub portfolio: Account<'info, Portfolio>,

    /// CHECK: Used to check if authority is admin
    #[account(
        seeds = [ADMIN_SEED, authority.key().as_ref()],
        bump
    )]
    pub admin: AccountInfo<'info>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::Discriminator;
    use crate::test_utils::create_account_info;

    #[test]
    fn test_set_allow_deposit_success() {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let admin_key = Pubkey::new_unique();
        let portfolio_key = Pubkey::new_unique();

        let mut authority_lamports = 100;
        let mut admin_lamports = 100;
        let mut portfolio_lamports = 100;

        let mut authority_data = vec![0u8; 100];
        let mut admin_data = vec![0u8; 10];
        let mut portfolio_data = vec![0u8; Portfolio::LEN];

        let authority = create_account_info(
            &authority_key,
            true,
            false,
            &mut authority_lamports,
            &mut authority_data,
            &program_id,
            false,
            None,
        );
        let admin = create_account_info(
            &admin_key,
            false,
            false,
            &mut admin_lamports,
            &mut admin_data,
            &program_id,
            false,
            None,
        );
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

        let mut accounts = WriteConfig {
            authority: Signer::try_from(&authority).unwrap(),
            portfolio: portfolio_account,
            admin,
        };

        let mut ctx = Context {
            accounts: &mut accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: WriteConfigBumps::default(),
        };

        let result = set_allow_deposit(&mut ctx, true);

        assert!(result.is_ok());
        assert!(ctx.accounts.portfolio.global_config.allow_deposit);
    }

    #[test]
    fn test_set_paused_success() {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let admin_key = Pubkey::new_unique();
        let portfolio_key = Pubkey::new_unique();

        let mut authority_lamports = 100;
        let mut admin_lamports = 100;
        let mut portfolio_lamports = 100;

        let mut authority_data = vec![0u8; 100];
        let mut admin_data = vec![0u8; 10];
        let mut portfolio_data = vec![0u8; Portfolio::LEN];

        let authority = create_account_info(
            &authority_key,
            true,
            false,
            &mut authority_lamports,
            &mut authority_data,
            &program_id,
            false,
            None,
        );
        let admin = create_account_info(
            &admin_key,
            false,
            false,
            &mut admin_lamports,
            &mut admin_data,
            &program_id,
            false,
            None,
        );
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

        let mut accounts = WriteConfig {
            authority: Signer::try_from(&authority).unwrap(),
            portfolio: portfolio_account,
            admin,
        };

        let mut ctx = Context {
            accounts: &mut accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: WriteConfigBumps::default(),
        };

        let result = set_paused(&mut ctx, true);

        assert!(result.is_ok());
        assert!(ctx.accounts.portfolio.global_config.program_paused);
    }

    #[test]
    fn test_set_native_deposits_restricted_success() {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let admin_key = Pubkey::new_unique();
        let portfolio_key = Pubkey::new_unique();

        let mut authority_lamports = 100;
        let mut admin_lamports = 100;
        let mut portfolio_lamports = 100;

        let mut authority_data = vec![0u8; 100];
        let mut admin_data = vec![0u8; 10];
        let mut portfolio_data = vec![0u8; Portfolio::LEN];

        let authority = create_account_info(
            &authority_key,
            true,
            false,
            &mut authority_lamports,
            &mut authority_data,
            &program_id,
            false,
            None,
        );
        let admin = create_account_info(
            &admin_key,
            false,
            false,
            &mut admin_lamports,
            &mut admin_data,
            &program_id,
            false,
            None,
        );
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

        let mut accounts = WriteConfig {
            authority: Signer::try_from(&authority).unwrap(),
            portfolio: portfolio_account,
            admin,
        };

        let mut ctx = Context {
            accounts: &mut accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: WriteConfigBumps::default(),
        };

        let result = set_native_deposits_restricted(&mut ctx, true);

        assert!(result.is_ok());
        assert!(ctx.accounts.portfolio.global_config.native_deposits_restricted);
    }

    #[test]
    fn test_set_default_chain_success() {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let admin_key = Pubkey::new_unique();
        let portfolio_key = Pubkey::new_unique();

        let mut authority_lamports = 100;
        let mut admin_lamports = 100;
        let mut portfolio_lamports = 100;

        let mut authority_data = vec![0u8; 100];
        let mut admin_data = vec![0u8; 10];
        let mut portfolio_data = vec![0u8; Portfolio::LEN];

        let authority = create_account_info(
            &authority_key,
            true,
            false,
            &mut authority_lamports,
            &mut authority_data,
            &program_id,
            false,
            None,
        );
        let admin = create_account_info(
            &admin_key,
            false,
            false,
            &mut admin_lamports,
            &mut admin_data,
            &program_id,
            false,
            None,
        );
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

        let mut accounts = WriteConfig {
            authority: Signer::try_from(&authority).unwrap(),
            portfolio: portfolio_account,
            admin,
        };

        let mut ctx = Context {
            accounts: &mut accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: WriteConfigBumps::default(),
        };

        let params = SetDefaultChainId { chain_id: 42 };

        let result = set_default_chain(&mut ctx, &params);

        assert!(result.is_ok());
        assert_eq!(ctx.accounts.portfolio.global_config.default_chain_id, 42);
    }

    #[test]
    fn test_set_airdrop_success() {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let admin_key = Pubkey::new_unique();
        let portfolio_key = Pubkey::new_unique();

        let mut authority_lamports = 100;
        let mut admin_lamports = 100;
        let mut portfolio_lamports = 100;

        let mut authority_data = vec![0u8; 100];
        let mut admin_data = vec![0u8; 10];
        let mut portfolio_data = vec![0u8; Portfolio::LEN];

        let authority = create_account_info(
            &authority_key,
            true,
            false,
            &mut authority_lamports,
            &mut authority_data,
            &program_id,
            false,
            None,
        );
        let admin = create_account_info(
            &admin_key,
            false,
            false,
            &mut admin_lamports,
            &mut admin_data,
            &program_id,
            false,
            None,
        );
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

        let mut accounts = WriteConfig {
            authority: Signer::try_from(&authority).unwrap(),
            portfolio: portfolio_account,
            admin,
        };

        let mut ctx = Context {
            accounts: &mut accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: WriteConfigBumps::default(),
        };

        let params = SetAirdropParams { amount: 1000 };

        let result = set_airdrop(&mut ctx, &params);

        assert!(result.is_ok());
        assert_eq!(ctx.accounts.portfolio.global_config.airdrop_amount, 1000);
    }

    #[test]
    fn test_get_global_config_success() {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let admin_key = Pubkey::new_unique();
        let portfolio_key = Pubkey::new_unique();

        let mut authority_lamports = 100;
        let mut admin_lamports = 100;
        let mut portfolio_lamports = 100;

        let mut authority_data = vec![0u8; 100];
        let mut admin_data = vec![0u8; 10];
        let mut portfolio_data = vec![0u8; Portfolio::LEN];

        let authority = create_account_info(
            &authority_key,
            true,
            false,
            &mut authority_lamports,
            &mut authority_data,
            &program_id,
            false,
            None,
        );
        let admin = create_account_info(
            &admin_key,
            false,
            false,
            &mut admin_lamports,
            &mut admin_data,
            &program_id,
            false,
            None,
        );
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

        let mut accounts = GetGlobalConfig {
            authority: Signer::try_from(&authority).unwrap(),
            portfolio: portfolio_account.clone(),
            admin,
        };

        let ctx = Context {
            accounts: &mut accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: GetGlobalConfigBumps::default(),
        };

        let result = get_global_config(&ctx);
        assert!(result.is_ok());
        let global_config = result.unwrap();
        assert_eq!(global_config.allow_deposit, portfolio_account.global_config.allow_deposit);
        assert_eq!(global_config.program_paused, portfolio_account.global_config.program_paused);
    }

    #[test]
    fn test_get_global_config_unauthorized() {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let admin_key = Pubkey::new_unique();
        let portfolio_key = Pubkey::new_unique();

        let wrong_owner = Pubkey::new_unique();
        let mut authority_lamports = 100;
        let mut admin_lamports = 100;
        let mut portfolio_lamports = 100;

        let mut authority_data = vec![0u8; 100];
        let mut admin_data = vec![0u8; 10];
        let mut portfolio_data = vec![0u8; Portfolio::LEN];

        let authority = create_account_info(
            &authority_key,
            true,
            false,
            &mut authority_lamports,
            &mut authority_data,
            &program_id,
            false,
            None,
        );
        let admin = create_account_info(
            &admin_key,
            false,
            false,
            &mut admin_lamports,
            &mut admin_data,
            &wrong_owner,
            false,
            None,
        );
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

        let mut accounts = GetGlobalConfig {
            authority: Signer::try_from(&authority).unwrap(),
            portfolio: portfolio_account,
            admin,
        };

        let ctx = Context {
            accounts: &mut accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: GetGlobalConfigBumps::default(),
        };

        let result = get_global_config(&ctx);
        assert_eq!(result.unwrap_err(), DexalotError::UnauthorizedSigner.into());
    }

    #[test]
    fn test_set_swap_signer_success() {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let admin_key = Pubkey::new_unique();
        let portfolio_key = Pubkey::new_unique();

        let mut authority_lamports = 100;
        let mut admin_lamports = 100;
        let mut portfolio_lamports = 100;

        let mut authority_data = vec![0u8; 100];
        let mut admin_data = vec![0u8; 10];
        let mut portfolio_data = vec![0u8; Portfolio::LEN];

        let authority = create_account_info(
            &authority_key,
            true,
            false,
            &mut authority_lamports,
            &mut authority_data,
            &program_id,
            false,
            None,
        );
        let admin = create_account_info(
            &admin_key,
            false,
            false,
            &mut admin_lamports,
            &mut admin_data,
            &program_id,
            false,
            None,
        );
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

        let mut accounts = WriteConfig {
            authority: Signer::try_from(&authority).unwrap(),
            portfolio: portfolio_account,
            admin,
        };

        let mut ctx = Context {
            accounts: &mut accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: WriteConfigBumps::default(),
        };

        let new_swap_signer: [u8; 20] = [1; 20];
        let params = SetSlapSignerParams { swap_signer: new_swap_signer };

        let result = set_swap_signer(&mut ctx, &params);
        assert!(result.is_ok());
        assert_eq!(ctx.accounts.portfolio.global_config.swap_signer, new_swap_signer);
    }

    #[test]
    fn test_set_swap_signer_unauthorized() {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let admin_key = Pubkey::new_unique();
        let portfolio_key = Pubkey::new_unique();

        let wrong_owner = Pubkey::new_unique();
        let mut authority_lamports = 100;
        let mut admin_lamports = 100;
        let mut portfolio_lamports = 100;

        let mut authority_data = vec![0u8; 100];
        let mut admin_data = vec![0u8; 10];
        let mut portfolio_data = vec![0u8; Portfolio::LEN];

        let authority = create_account_info(
            &authority_key,
            true,
            false,
            &mut authority_lamports,
            &mut authority_data,
            &program_id,
            false,
            None,
        );
        let admin = create_account_info(
            &admin_key,
            false,
            false,
            &mut admin_lamports,
            &mut admin_data,
            &wrong_owner,
            false,
            None,
        );
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

        let mut accounts = WriteConfig {
            authority: Signer::try_from(&authority).unwrap(),
            portfolio: portfolio_account,
            admin,
        };

        let mut ctx = Context {
            accounts: &mut accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: WriteConfigBumps::default(),
        };

        let new_swap_signer: [u8; 20] = [1; 20];
        let params = SetSlapSignerParams { swap_signer: new_swap_signer };

        let result = set_swap_signer(&mut ctx, &params);
        assert_eq!(result.unwrap_err(), DexalotError::UnauthorizedSigner.into());
    }

    #[test]
    fn test_set_allow_deposit_unauthorized() {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let admin_key = Pubkey::new_unique();
        let portfolio_key = Pubkey::new_unique();
        let wrong_owner = Pubkey::new_unique();
        let mut authority_lamports = 100;
        let mut admin_lamports = 100;
        let mut portfolio_lamports = 100;
        let mut authority_data = vec![0u8; 100];
        let mut admin_data = vec![0u8; 10];
        let mut portfolio_data = vec![0u8; Portfolio::LEN];
        let authority = create_account_info(
            &authority_key,
            true,
            false,
            &mut authority_lamports,
            &mut authority_data,
            &program_id,
            false,
            None,
        );
        let admin = create_account_info(
            &admin_key,
            false,
            false,
            &mut admin_lamports,
            &mut admin_data,
            &wrong_owner,
            false,
            None,
        );
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
        let mut accounts = WriteConfig {
            authority: Signer::try_from(&authority).unwrap(),
            portfolio: portfolio_account,
            admin,
        };
        let mut ctx = Context {
            accounts: &mut accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: WriteConfigBumps::default(),
        };
        let result = set_allow_deposit(&mut ctx, true);
        assert_eq!(result.unwrap_err(), DexalotError::UnauthorizedSigner.into());
    }

    #[test]
    fn test_set_paused_unauthorized() {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let admin_key = Pubkey::new_unique();
        let portfolio_key = Pubkey::new_unique();
        let wrong_owner = Pubkey::new_unique();
        let mut authority_lamports = 100;
        let mut admin_lamports = 100;
        let mut portfolio_lamports = 100;
        let mut authority_data = vec![0u8; 100];
        let mut admin_data = vec![0u8; 10];
        let mut portfolio_data = vec![0u8; Portfolio::LEN];
        let authority = create_account_info(
            &authority_key,
            true,
            false,
            &mut authority_lamports,
            &mut authority_data,
            &program_id,
            false,
            None,
        );
        let admin = create_account_info(
            &admin_key,
            false,
            false,
            &mut admin_lamports,
            &mut admin_data,
            &wrong_owner,
            false,
            None,
        );
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
        let mut accounts = WriteConfig {
            authority: Signer::try_from(&authority).unwrap(),
            portfolio: portfolio_account,
            admin,
        };
        let mut ctx = Context {
            accounts: &mut accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: WriteConfigBumps::default(),
        };
        let result = set_paused(&mut ctx, true);
        assert_eq!(result.unwrap_err(), DexalotError::UnauthorizedSigner.into());
    }

    #[test]
    fn test_set_native_deposits_restricted_unauthorized() {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let admin_key = Pubkey::new_unique();
        let portfolio_key = Pubkey::new_unique();
        let wrong_owner = Pubkey::new_unique();
        let mut authority_lamports = 100;
        let mut admin_lamports = 100;
        let mut portfolio_lamports = 100;
        let mut authority_data = vec![0u8; 100];
        let mut admin_data = vec![0u8; 10];
        let mut portfolio_data = vec![0u8; Portfolio::LEN];
        let authority = create_account_info(
            &authority_key,
            true,
            false,
            &mut authority_lamports,
            &mut authority_data,
            &program_id,
            false,
            None,
        );
        let admin = create_account_info(
            &admin_key,
            false,
            false,
            &mut admin_lamports,
            &mut admin_data,
            &wrong_owner,
            false,
            None,
        );
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
        let mut accounts = WriteConfig {
            authority: Signer::try_from(&authority).unwrap(),
            portfolio: portfolio_account,
            admin,
        };
        let mut ctx = Context {
            accounts: &mut accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: WriteConfigBumps::default(),
        };
        let result = set_native_deposits_restricted(&mut ctx, true);
        assert_eq!(result.unwrap_err(), DexalotError::UnauthorizedSigner.into());
    }

    #[test]
    fn test_set_default_chain_unauthorized() {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let admin_key = Pubkey::new_unique();
        let portfolio_key = Pubkey::new_unique();
        let wrong_owner = Pubkey::new_unique();
        let mut authority_lamports = 100;
        let mut admin_lamports = 100;
        let mut portfolio_lamports = 100;
        let mut authority_data = vec![0u8; 100];
        let mut admin_data = vec![0u8; 10];
        let mut portfolio_data = vec![0u8; Portfolio::LEN];
        let authority = create_account_info(
            &authority_key,
            true,
            false,
            &mut authority_lamports,
            &mut authority_data,
            &program_id,
            false,
            None,
        );
        let admin = create_account_info(
            &admin_key,
            false,
            false,
            &mut admin_lamports,
            &mut admin_data,
            &wrong_owner,
            false,
            None,
        );
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
        let mut accounts = WriteConfig {
            authority: Signer::try_from(&authority).unwrap(),
            portfolio: portfolio_account,
            admin,
        };
        let mut ctx = Context {
            accounts: &mut accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: WriteConfigBumps::default(),
        };
        let params = SetDefaultChainId { chain_id: 42 };
        let result = set_default_chain(&mut ctx, &params);
        assert_eq!(result.unwrap_err(), DexalotError::UnauthorizedSigner.into());
    }

    #[test]
    fn test_set_airdrop_unauthorized() {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let admin_key = Pubkey::new_unique();
        let portfolio_key = Pubkey::new_unique();
        let wrong_owner = Pubkey::new_unique();
        let mut authority_lamports = 100;
        let mut admin_lamports = 100;
        let mut portfolio_lamports = 100;
        let mut authority_data = vec![0u8; 100];
        let mut admin_data = vec![0u8; 10];
        let mut portfolio_data = vec![0u8; Portfolio::LEN];
        let authority = create_account_info(
            &authority_key,
            true,
            false,
            &mut authority_lamports,
            &mut authority_data,
            &program_id,
            false,
            None,
        );
        let admin = create_account_info(
            &admin_key,
            false,
            false,
            &mut admin_lamports,
            &mut admin_data,
            &wrong_owner,
            false,
            None,
        );
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
        let mut accounts = WriteConfig {
            authority: Signer::try_from(&authority).unwrap(),
            portfolio: portfolio_account,
            admin,
        };
        let mut ctx = Context {
            accounts: &mut accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: WriteConfigBumps::default(),
        };
        let params = SetAirdropParams { amount: 1000 };
        let result = set_airdrop(&mut ctx, &params);
        assert_eq!(result.unwrap_err(), DexalotError::UnauthorizedSigner.into());
    }
}
