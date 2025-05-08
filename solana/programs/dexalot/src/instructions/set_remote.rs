use crate::{
    consts::{ADMIN_SEED, PORTFOLIO_SEED, REMOTE_SEED},
    errors::DexalotError,
    state::{Portfolio, Remote},
    *,
};

#[derive(Accounts)]
#[instruction(params: SetRemoteParams)]
pub struct SetRemote<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init_if_needed,
        payer = payer,
        space = Remote::SIZE,
        seeds = [REMOTE_SEED, &params.dst_eid.to_be_bytes()],
        bump
    )]
    pub remote: Account<'info, Remote>,
    #[account(seeds = [PORTFOLIO_SEED], bump = portfolio.bump)]
    pub portfolio: Account<'info, Portfolio>,
    /// CHECK: Verify that user is an admin by checking their PDA.
    #[account(
            seeds = [ADMIN_SEED, payer.key().as_ref()],
            bump
        )]
    pub admin: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

pub fn set_remote(ctx: &mut Context<SetRemote>, params: &SetRemoteParams) -> Result<()> {
    let admin = &ctx.accounts.admin;
    require!(
        admin.owner == ctx.program_id,
        DexalotError::UnauthorizedSigner
    );
    ctx.accounts.remote.address = params.remote;
    ctx.accounts.remote.bump = ctx.bumps.remote;
    Ok(())
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct SetRemoteParams {
    pub dst_eid: u32,
    pub remote: [u8; 32],
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::prelude::*;
    use anchor_lang::{system_program, Discriminator};
    use crate::test_utils::create_account_info;

    #[test]
    fn test_set_remote() {
        let program_id = id();
        let payer_key = Pubkey::new_unique();
        let portfolio_key = Pubkey::new_unique();
        let remote_key = Pubkey::new_unique();
        let admin_key = Pubkey::new_unique();
        let system_program_key = system_program::ID;
        let mut payer_lamports = 100;
        let mut portfolio_lamports = 100;
        let mut remote_lamports = 100;
        let mut admin_lamports = 100;
        let mut system_program_lamports = 100;
        let mut payer_data = vec![0u8; 100];
        let mut portfolio_data = vec![0u8; Portfolio::LEN];
        let mut remote_data = vec![0u8; 100];
        let mut admin_data = vec![0u8; 10];
        let mut system_program_data = vec![0u8; 10];

        let payer_account = create_account_info(
            &payer_key,
            true,
            false,
            &mut payer_lamports,
            &mut payer_data,
            &program_id,
            false,
            None
        );

        let admin_account = create_account_info(
            &admin_key,
            false,
            false,
            &mut admin_lamports,
            &mut admin_data,
            &program_id,
            false,
            None
        );

        let portfolio_account = create_account_info(
            &portfolio_key,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator())
        );

        let remote_account = create_account_info(
            &remote_key,
            false,
            true,
            &mut remote_lamports,
            &mut remote_data,
            &program_id,
            false,
            Some(Remote::discriminator())
        );

        let system_program = create_account_info(
            &system_program_key,
            false,
            false,
            &mut system_program_lamports,
            &mut system_program_data,
            &system_program_key,
            true,
            None
        );

        let mut accounts = SetRemote {
            payer: Signer::try_from(&payer_account).unwrap(),
            admin: admin_account,
            remote: Account::try_from(&remote_account).unwrap(),
            portfolio: Account::try_from(&portfolio_account).unwrap(),
            system_program: Program::try_from(&system_program).unwrap(),
        };

        let params = SetRemoteParams {
            dst_eid: 42,
            remote: [42; 32],
        };

        let mut ctx = Context {
            accounts: &mut accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: SetRemoteBumps::default(),
        };

        let result = set_remote(&mut ctx, &params);
        assert!(result.is_ok());
        assert_eq!(accounts.remote.address, [42; 32]);
        assert_eq!(accounts.remote.bump, 255);
    }
}
