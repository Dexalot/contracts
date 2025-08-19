use anchor_lang::prelude::*;

use crate::consts::{ADMIN_SEED, REBALANCER_SEED};
use crate::errors::DexalotError;
use crate::events::{RoleGrantedEvent, RoleRevokedEvent};
use crate::state::{Admin, Rebalancer};

pub fn add_admin(_ctx: &Context<AddAdmin>, params: &AdminParams) -> Result<()> {
    require!(
        params.account != Pubkey::default(),
        DexalotError::ZeroAccount
    );

    emit!(RoleGrantedEvent {
        role: [0; 32], // 0 for admin
        account: params.account,
    });

    Ok(())
}

#[derive(Clone, AnchorDeserialize, AnchorSerialize)]
pub struct AdminParams {
    account: Pubkey,
}

pub fn remove_admin(ctx: &Context<RemoveAdmin>, params: &AdminParams) -> Result<()> {
    require!(
        params.account != Pubkey::default(),
        DexalotError::ZeroAccount
    );

    let admin = &ctx.accounts.admin;

    require!(
        admin.owner == ctx.program_id,
        DexalotError::UnauthorizedSigner
    );

    emit!(RoleRevokedEvent {
        role: [0; 32],
        admin: params.account,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(account: Pubkey)]
pub struct AddAdmin<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Verify that user is an admin by checking their PDA.
    #[account(
        seeds = [ADMIN_SEED, authority.key().as_ref()],
        bump
    )]
    pub admin: Account<'info, Admin>,

    #[account(
        init,
        payer = authority,
        space = Admin::LEN,
        seeds = [ADMIN_SEED, account.as_ref()],
        bump
    )]
    pub new_admin: Account<'info, Admin>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(account: Pubkey)]
pub struct RemoveAdmin<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Verify that user is an admin by checking their PDA.
    #[account(
        seeds = [ADMIN_SEED, authority.key().as_ref()],
        bump
    )]
    pub admin: AccountInfo<'info>,

    #[account(mut)]
    pub receiver: SystemAccount<'info>,

    #[account(
        mut,
        close = receiver, // Refund lamports to the receiver
        seeds = [ADMIN_SEED, account.as_ref()],
        bump
    )]
    pub admin_to_remove: Account<'info, Admin>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(account: Pubkey)]
pub struct AddRebalancer<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Verify that user is an admin by checking their PDA.
    #[account(
        seeds = [ADMIN_SEED, authority.key().as_ref()],
        bump
    )]
    pub admin: AccountInfo<'info>,

    #[account(
        init,
        payer = authority,
        space = Rebalancer::LEN,
        seeds = [REBALANCER_SEED, account.as_ref()],
        bump
    )]
    pub new_rebalancer: Account<'info, Rebalancer>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(account: Pubkey)]
pub struct RemoveRebalancer<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Verify that user is an admin by checking their PDA.
    #[account(
        seeds = [ADMIN_SEED, authority.key().as_ref()],
        bump
    )]
    pub admin: AccountInfo<'info>,

    #[account(mut)]
    pub receiver: SystemAccount<'info>,

    #[account(
        mut,
        close = receiver, // Refund lamports to the receiver
        seeds = [REBALANCER_SEED, account.as_ref()],
        bump
    )]
    pub rebalancer_to_remove: Account<'info, Rebalancer>,

    pub system_program: Program<'info, System>,
}

#[derive(Clone, AnchorDeserialize, AnchorSerialize)]
pub struct RebalancerParams {
    account: Pubkey,
}

pub fn add_rebalancer(ctx: &Context<AddRebalancer>, params: &RebalancerParams) -> Result<()> {
    require!(
        params.account != Pubkey::default(),
        DexalotError::ZeroAccount
    );
    let admin = &ctx.accounts.admin;

    //CHECK: Verify that user is an admin by checking their PDA.
    require!(
        admin.owner == ctx.program_id,
        DexalotError::UnauthorizedSigner
    );

    emit!(RoleGrantedEvent {
        role: [1; 32], // 1 for rebalancer
        account: params.account,
    });

    Ok(())
}

pub fn remove_rebalancer(ctx: &Context<RemoveRebalancer>, params: &RebalancerParams) -> Result<()> {
    require!(
        params.account != Pubkey::default(),
        DexalotError::ZeroAccount
    );
    let admin = &ctx.accounts.admin;

    require!(
        admin.owner == ctx.program_id,
        DexalotError::UnauthorizedSigner
    );

    emit!(RoleRevokedEvent {
        role: [1; 32], // 1 for rebalancer
        admin: params.account,
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use anchor_lang::{system_program, Discriminator};
    use super::*;
    use crate::test_utils::create_account_info;

    #[test]
    fn test_add_admin_success() -> Result<()> {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let new_admin_param = Pubkey::new_unique();
        let admin_pda_key = Pubkey::find_program_address(&[ADMIN_SEED, authority_key.as_ref()], &program_id).0;
        let new_admin_pda = Pubkey::find_program_address(&[ADMIN_SEED, new_admin_param.as_ref()], &program_id).0;

        let mut auth_lamports = 100;
        let mut auth_data = vec![0u8; 10];
        let authority_info = create_account_info(
            &authority_key,
            true,
            true,
            &mut auth_lamports,
            &mut auth_data,
            &program_id,
            false,
            None,
        );

        let mut admin_lamports = 100;
        let mut admin_data = vec![0u8; 10];
        let admin_info = create_account_info(
            &admin_pda_key,
            false,
            true,
            &mut admin_lamports,
            &mut admin_data,
            &program_id,
            false,
            None,
        );

        let mut new_admin_lamports = 0;
        let mut new_admin_data = vec![0u8; Admin::LEN];
        let new_admin_info = create_account_info(
            &new_admin_pda,
            false,
            true,
            &mut new_admin_lamports,
            &mut new_admin_data,
            &program_id,
            false,
            Some(Admin::discriminator())
        );

        let system_program_key = system_program::ID;
        let mut sp_lamports = 100;
        let mut sp_data = vec![0u8; 10];
        let system_program_info = create_account_info(
            &system_program_key,
            false,
            false,
            &mut sp_lamports,
            &mut sp_data,
            &system_program_key,
            true,
            None,
        );

        let mut add_admin_accounts = AddAdmin {
            authority: Signer::try_from(&authority_info)?,
            admin: Account::try_from(&admin_info)?,
            new_admin: Account::try_from(&new_admin_info)?,
            system_program: Program::try_from(&system_program_info)?,
        };

        let params = AdminParams {
            account: new_admin_param,
        };

        let mut ctx = Context {
            accounts: &mut add_admin_accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: AddAdminBumps::default(),
        };

        let result = add_admin(&mut ctx, &params);
        assert!(result.is_ok());
        Ok(())
    }

    #[test]
    fn test_add_admin_negative_cases() -> Result<()> {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let new_admin_param = Pubkey::new_unique();
        let admin_pda_key = Pubkey::find_program_address(&[ADMIN_SEED, authority_key.as_ref()], &program_id).0;
        let new_admin_pda = Pubkey::find_program_address(&[ADMIN_SEED, new_admin_param.as_ref()], &program_id).0;

        let mut auth_lamports = 100;
        let mut auth_data = vec![0u8; 10];
        let authority_info = create_account_info(
            &authority_key,
            true,
            true,
            &mut auth_lamports,
            &mut auth_data,
            &program_id,
            false,
            None,
        );

        let mut admin_lamports = 100;
        let mut admin_data = vec![0u8; 10];
        let admin_info = create_account_info(
            &admin_pda_key,
            false,
            true,
            &mut admin_lamports,
            &mut admin_data,
            &authority_key,
            false,
            None,
        );

        let mut new_admin_lamports = 0;
        let mut new_admin_data = vec![0u8; Admin::LEN];
        let new_admin_info = create_account_info(
            &new_admin_pda,
            false,
            true,
            &mut new_admin_lamports,
            &mut new_admin_data,
            &program_id,
            false,
            Some(Admin::discriminator())
        );

        let system_program_key = system_program::ID;
        let mut sp_lamports = 100;
        let mut sp_data = vec![0u8; 10];
        let system_program_info = create_account_info(
            &system_program_key,
            false,
            false,
            &mut sp_lamports,
            &mut sp_data,
            &system_program_key,
            true,
            None,
        );

        let mut add_admin_accounts = AddAdmin {
            authority: Signer::try_from(&authority_info)?,
            admin:  Account::try_from(&admin_info)?,
            new_admin: Account::try_from(&new_admin_info)?,
            system_program: Program::try_from(&system_program_info)?,
        };

        let mut params = AdminParams {
            account: new_admin_param,
        };

        let mut ctx = Context {
            accounts: &mut add_admin_accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: AddAdminBumps::default(),
        };

        let result = add_admin(&mut ctx, &params);
        assert_eq!(result.unwrap_err(), DexalotError::UnauthorizedSigner.into());

        params.account = Pubkey::default();

        let result = add_admin(&mut ctx, &params);
        assert_eq!(result.unwrap_err(), DexalotError::ZeroAccount.into());
        Ok(())
    }

    #[test]
    fn test_remove_admin_success() -> Result<()> {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let admin_to_remove_param = Pubkey::new_unique();
        let admin_pda_key = Pubkey::find_program_address(&[ADMIN_SEED, authority_key.as_ref()], &program_id).0;
        let admin_to_remove_pda = Pubkey::find_program_address(&[ADMIN_SEED, admin_to_remove_param.as_ref()], &program_id).0;

        let mut auth_lamports = 100;
        let mut auth_data = vec![0u8; 10];
        let authority_info = create_account_info(
            &authority_key,
            true,
            true,
            &mut auth_lamports,
            &mut auth_data,
            &program_id,
            false,
            None,
        );

        let mut admin_lamports = 100;
        let mut admin_data = vec![0u8; 10];
        let admin_info = create_account_info(
            &admin_pda_key,
            false,
            true,
            &mut admin_lamports,
            &mut admin_data,
            &program_id,
            false,
            None,
        );

        let mut remove_admin_lamports = 100;
        let mut remove_admin_data = vec![0u8; Admin::LEN];
        let admin_to_remove_info = create_account_info(
            &admin_to_remove_pda,
            false,
            true,
            &mut remove_admin_lamports,
            &mut remove_admin_data,
            &program_id,
            false,
            Some(Admin::discriminator())
        );

        let receiver_key = Pubkey::new_unique();
        let mut recv_lamports = 100;
        let mut recv_data = vec![0u8; 10];
        let receiver_info = create_account_info(
            &receiver_key,
            false,
            true,
            &mut recv_lamports,
            &mut recv_data,
            &system_program::ID,
            false,
            None,
        );

        let system_program_key = system_program::ID;
        let mut sp_lamports = 100;
        let mut sp_data = vec![0u8; 10];
        let system_program_info = create_account_info(
            &system_program_key,
            false,
            false,
            &mut sp_lamports,
            &mut sp_data,
            &system_program_key,
            true,
            None,
        );

        let mut remove_admin_accounts = RemoveAdmin {
            authority: Signer::try_from(&authority_info)?,
            admin: admin_info,
            receiver: SystemAccount::try_from(&receiver_info)?,
            admin_to_remove: Account::try_from(&admin_to_remove_info)?,
            system_program: Program::try_from(&system_program_info)?,
        };

        let params = AdminParams {
            account: admin_to_remove_param,
        };

        let ctx = Context {
            accounts: &mut remove_admin_accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: RemoveAdminBumps::default(),
        };

        let result = remove_admin(&ctx, &params);
        assert!(result.is_ok());
        Ok(())
    }

    #[test]
    fn test_remove_admin_negative_cases() -> Result<()> {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let admin_to_remove_param = Pubkey::new_unique();
        let admin_pda_key = Pubkey::find_program_address(&[ADMIN_SEED, authority_key.as_ref()], &program_id).0;
        let admin_to_remove_pda = Pubkey::find_program_address(&[ADMIN_SEED, admin_to_remove_param.as_ref()], &program_id).0;

        let mut auth_lamports = 100;
        let mut auth_data = vec![0u8; 10];
        let authority_info = create_account_info(
            &authority_key,
            true,
            true,
            &mut auth_lamports,
            &mut auth_data,
            &program_id,
            false,
            None,
        );

        let mut admin_lamports = 100;
        let mut admin_data = vec![0u8; 10];
        let admin_info = create_account_info(
            &admin_pda_key,
            false,
            true,
            &mut admin_lamports,
            &mut admin_data,
            &authority_key,
            false,
            None,
        );

        let mut remove_admin_lamports = 100;
        let mut remove_admin_data = vec![0u8; Admin::LEN];
        let admin_to_remove_info = create_account_info(
            &admin_to_remove_pda,
            false,
            true,
            &mut remove_admin_lamports,
            &mut remove_admin_data,
            &program_id,
            false,
            Some(Admin::discriminator())
        );

        let receiver_key = Pubkey::new_unique();
        let mut recv_lamports = 100;
        let mut recv_data = vec![0u8; 10];
        let receiver_info = create_account_info(
            &receiver_key,
            false,
            true,
            &mut recv_lamports,
            &mut recv_data,
            &system_program::ID,
            false,
            None,
        );

        let system_program_key = system_program::ID;
        let mut sp_lamports = 100;
        let mut sp_data = vec![0u8; 10];
        let system_program_info = create_account_info(
            &system_program_key,
            false,
            false,
            &mut sp_lamports,
            &mut sp_data,
            &system_program_key,
            true,
            None,
        );

        let mut remove_admin_accounts = RemoveAdmin {
            authority: Signer::try_from(&authority_info)?,
            admin: admin_info,
            receiver: SystemAccount::try_from(&receiver_info)?,
            admin_to_remove: Account::try_from(&admin_to_remove_info)?,
            system_program: Program::try_from(&system_program_info)?,
        };

        let mut params = AdminParams {
            account: admin_to_remove_param,
        };

        let ctx = Context {
            accounts: &mut remove_admin_accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: RemoveAdminBumps::default(),
        };

        let result = remove_admin(&ctx, &params);
        assert_eq!(result.unwrap_err(), DexalotError::UnauthorizedSigner.into());

        params.account = Pubkey::default();

        let result = remove_admin(&ctx, &params);
        assert_eq!(result.unwrap_err(), DexalotError::ZeroAccount.into());
        Ok(())
    }

    #[test]
    fn test_add_rebalancer_success() -> Result<()> {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let new_rebalancer_param = Pubkey::new_unique();
        let admin_pda_key = Pubkey::find_program_address(&[ADMIN_SEED, authority_key.as_ref()], &program_id).0;
        let new_rebalancer_pda = Pubkey::find_program_address(&[REBALANCER_SEED, new_rebalancer_param.as_ref()], &program_id).0;

        let mut auth_lamports = 100;
        let mut auth_data = vec![0u8; 10];
        let authority_info = create_account_info(
            &authority_key,
            true,
            true,
            &mut auth_lamports,
            &mut auth_data,
            &program_id,
            false,
            None,
        );

        let mut admin_lamports = 100;
        let mut admin_data = vec![0u8; 10];
        let admin_info = create_account_info(
            &admin_pda_key,
            false,
            true,
            &mut admin_lamports,
            &mut admin_data,
            &program_id,
            false,
            None,
        );

        let mut new_rebalancer_lamports = 0;
        let mut new_rebalancer_data = vec![0u8; Rebalancer::LEN];
        let new_rebalancer_info = create_account_info(
            &new_rebalancer_pda,
            false,
            true,
            &mut new_rebalancer_lamports,
            &mut new_rebalancer_data,
            &program_id,
            false,
            Some(Rebalancer::discriminator())
        );

        let system_program_key = system_program::ID;
        let mut sp_lamports = 100;
        let mut sp_data = vec![0u8; 10];
        let system_program_info = create_account_info(
            &system_program_key,
            false,
            false,
            &mut sp_lamports,
            &mut sp_data,
            &system_program_key,
            true,
            None,
        );

        let mut add_rebalancer_accounts = AddRebalancer {
            authority: Signer::try_from(&authority_info)?,
            admin: admin_info,
            new_rebalancer: Account::try_from(&new_rebalancer_info)?,
            system_program: Program::try_from(&system_program_info)?,
        };

        let params = RebalancerParams {
            account: new_rebalancer_param,
        };

        let mut ctx = Context {
            accounts: &mut add_rebalancer_accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: AddRebalancerBumps::default(),
        };

        let result = add_rebalancer(&mut ctx, &params);
        assert!(result.is_ok());
        Ok(())
    }

    #[test]
    fn test_add_rebalancer_negative_cases() -> Result<()> {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let new_rebalancer_param = Pubkey::new_unique();
        let admin_pda_key = Pubkey::find_program_address(&[ADMIN_SEED, authority_key.as_ref()], &program_id).0;
        let new_rebalancer_pda = Pubkey::find_program_address(&[REBALANCER_SEED, new_rebalancer_param.as_ref()], &program_id).0;

        let mut auth_lamports = 100;
        let mut auth_data = vec![0u8; 10];
        let authority_info = create_account_info(
            &authority_key,
            true,
            true,
            &mut auth_lamports,
            &mut auth_data,
            &program_id,
            false,
            None,
        );

        let mut admin_lamports = 100;
        let mut admin_data = vec![0u8; 10];
        let admin_info = create_account_info(
            &admin_pda_key,
            false,
            true,
            &mut admin_lamports,
            &mut admin_data,
            &authority_key,
            false,
            None,
        );

        let mut new_rebalancer_lamports = 0;
        let mut new_rebalancer_data = vec![0u8; Rebalancer::LEN];
        let new_rebalancer_info = create_account_info(
            &new_rebalancer_pda,
            false,
            true,
            &mut new_rebalancer_lamports,
            &mut new_rebalancer_data,
            &program_id,
            false,
            Some(Rebalancer::discriminator())
        );

        let system_program_key = system_program::ID;
        let mut sp_lamports = 100;
        let mut sp_data = vec![0u8; 10];
        let system_program_info = create_account_info(
            &system_program_key,
            false,
            false,
            &mut sp_lamports,
            &mut sp_data,
            &system_program_key,
            true,
            None,
        );

        let mut add_rebalancer_accounts = AddRebalancer {
            authority: Signer::try_from(&authority_info)?,
            admin: admin_info,
            new_rebalancer: Account::try_from(&new_rebalancer_info)?,
            system_program: Program::try_from(&system_program_info)?,
        };

        let mut params = RebalancerParams {
            account: new_rebalancer_param,
        };

        let ctx = Context {
            accounts: &mut add_rebalancer_accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: AddRebalancerBumps::default(),
        };

        let result = add_rebalancer(&ctx, &params);
        assert_eq!(result.unwrap_err(), DexalotError::UnauthorizedSigner.into());

        params.account = Pubkey::default();

        let result = add_rebalancer(&ctx, &params);
        assert_eq!(result.unwrap_err(), DexalotError::ZeroAccount.into());
        Ok(())
    }

    #[test]
    fn test_remove_rebalancer_success() -> Result<()> {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let rebalancer_to_remove_param = Pubkey::new_unique();
        let admin_pda_key = Pubkey::find_program_address(&[ADMIN_SEED, authority_key.as_ref()], &program_id).0;
        let rebalancer_to_remove_pda = Pubkey::find_program_address(&[REBALANCER_SEED, rebalancer_to_remove_param.as_ref()], &program_id).0;

        let mut auth_lamports = 100;
        let mut auth_data = vec![0u8; 10];
        let authority_info = create_account_info(
            &authority_key,
            true,
            true,
            &mut auth_lamports,
            &mut auth_data,
            &program_id,
            false,
            None,
        );

        let mut admin_lamports = 100;
        let mut admin_data = vec![0u8; 10];
        let admin_info = create_account_info(
            &admin_pda_key,
            false,
            true,
            &mut admin_lamports,
            &mut admin_data,
            &program_id,
            false,
            None,
        );

        let mut rebalancer_lamports = 100;
        let mut rebalancer_data = vec![0u8; Rebalancer::LEN];
        let rebalancer_info = create_account_info(
            &rebalancer_to_remove_pda,
            false,
            true,
            &mut rebalancer_lamports,
            &mut rebalancer_data,
            &program_id,
            false,
            Some(Rebalancer::discriminator())
        );

        let receiver_key = Pubkey::new_unique();
        let mut recv_lamports = 100;
        let mut recv_data = vec![0u8; 10];
        let receiver_info = create_account_info(
            &receiver_key,
            false,
            true,
            &mut recv_lamports,
            &mut recv_data,
            &system_program::ID,
            false,
            None,
        );

        let system_program_key = system_program::ID;
        let mut sp_lamports = 100;
        let mut sp_data = vec![0u8; 10];
        let system_program_info = create_account_info(
            &system_program_key,
            false,
            false,
            &mut sp_lamports,
            &mut sp_data,
            &system_program_key,
            true,
            None,
        );

        let mut remove_rebalancer_accounts = RemoveRebalancer {
            authority: Signer::try_from(&authority_info)?,
            admin: admin_info,
            receiver: SystemAccount::try_from(&receiver_info)?,
            rebalancer_to_remove: Account::try_from(&rebalancer_info)?,
            system_program: Program::try_from(&system_program_info)?,
        };

        let params = RebalancerParams {
            account: rebalancer_to_remove_param,
        };

        let ctx = Context {
            accounts: &mut remove_rebalancer_accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: RemoveRebalancerBumps::default(),
        };

        let result = remove_rebalancer(&ctx, &params);
        assert!(result.is_ok());
        Ok(())
    }

    #[test]
    fn test_remove_rebalancer_negative_cases() -> Result<()> {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let rebalancer_to_remove_param = Pubkey::new_unique();
        let admin_pda_key = Pubkey::find_program_address(&[ADMIN_SEED, authority_key.as_ref()], &program_id).0;
        let rebalancer_to_remove_pda = Pubkey::find_program_address(&[REBALANCER_SEED, rebalancer_to_remove_param.as_ref()], &program_id).0;

        let mut auth_lamports = 100;
        let mut auth_data = vec![0u8; 10];
        let authority_info = create_account_info(
            &authority_key,
            true,
            true,
            &mut auth_lamports,
            &mut auth_data,
            &program_id,
            false,
            None,
        );

        let mut admin_lamports = 100;
        let mut admin_data = vec![0u8; 10];
        let admin_info = create_account_info(
            &admin_pda_key,
            false,
            true,
            &mut admin_lamports,
            &mut admin_data,
            &authority_key,
            false,
            None,
        );

        let mut rebalancer_lamports = 100;
        let mut rebalancer_data = vec![0u8; Rebalancer::LEN];
        let rebalancer_info = create_account_info(
            &rebalancer_to_remove_pda,
            false,
            true,
            &mut rebalancer_lamports,
            &mut rebalancer_data,
            &program_id,
            false,
            Some(Rebalancer::discriminator())
        );

        let receiver_key = Pubkey::new_unique();
        let mut recv_lamports = 100;
        let mut recv_data = vec![0u8; 10];
        let receiver_info = create_account_info(
            &receiver_key,
            false,
            true,
            &mut recv_lamports,
            &mut recv_data,
            &system_program::ID,
            false,
            None,
        );

        let system_program_key = system_program::ID;
        let mut sp_lamports = 100;
        let mut sp_data = vec![0u8; 10];
        let system_program_info = create_account_info(
            &system_program_key,
            false,
            false,
            &mut sp_lamports,
            &mut sp_data,
            &system_program_key,
            true,
            None,
        );

        let mut remove_rebalancer_accounts = RemoveRebalancer {
            authority: Signer::try_from(&authority_info)?,
            admin: admin_info,
            receiver: SystemAccount::try_from(&receiver_info)?,
            rebalancer_to_remove: Account::try_from(&rebalancer_info)?,
            system_program: Program::try_from(&system_program_info)?,
        };

        let mut params = RebalancerParams {
            account: rebalancer_to_remove_param,
        };

        let ctx = Context {
            accounts: &mut remove_rebalancer_accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: RemoveRebalancerBumps::default(),
        };

        let result = remove_rebalancer(&ctx, &params);
        assert_eq!(result.unwrap_err(), DexalotError::UnauthorizedSigner.into());

        params.account = Pubkey::default();

        let result = remove_rebalancer(&ctx, &params);
        assert_eq!(result.unwrap_err(), DexalotError::ZeroAccount.into());
        Ok(())
    }
}
