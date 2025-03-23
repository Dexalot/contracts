use crate::consts::{ADMIN_SEED, BANNED_ACCOUNT_SEED};
use crate::errors::DexalotError;
use crate::events::BanStatusChangedEvent;
use crate::state::{BanReason, BannedAccount};
use anchor_lang::prelude::*;

pub fn ban_account(ctx: &mut Context<BanAccount>, params: &BanAccountParams) -> Result<()> {
    let admin = &ctx.accounts.admin;

    // CHECK: Verify that user is an admin by checking their PDA.
    require!(
        admin.owner == ctx.program_id,
        DexalotError::UnauthorizedSigner
    );

    let banned_account = &mut ctx.accounts.banned_account;
    banned_account.reason = params.reason;

    emit!(BanStatusChangedEvent {
        account: params.account,
        reason: params.reason,
        banned: true,
    });

    Ok(())
}

#[derive(Clone, AnchorDeserialize, AnchorSerialize)]
pub struct BanAccountParams {
    account: Pubkey,
    reason: BanReason,
}

pub fn unban_account(ctx: &Context<UnbanAccount>, params: &UnbanAccountParams) -> Result<()> {
    let admin = &ctx.accounts.admin;

    // CHECK: Verify that user is an admin by checking their PDA.
    require!(
        admin.owner == ctx.program_id,
        DexalotError::UnauthorizedSigner
    );

    emit!(BanStatusChangedEvent {
        account: params.account,
        reason: BanReason::NotBanned,
        banned: false,
    });

    Ok(())
}

#[derive(Clone, AnchorDeserialize, AnchorSerialize)]
pub struct UnbanAccountParams {
    account: Pubkey,
}

#[derive(Accounts)]
#[instruction(account: Pubkey, reason: BanReason)]
pub struct BanAccount<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Validate that the authority is an admin by checking the admin PDA.
    #[account(
        seeds = [ADMIN_SEED, authority.key().as_ref()],
        bump
    )]
    pub admin: AccountInfo<'info>,

    /// Create or update the BannedAccount PDA derived from the `account` pubkey provided.
    /// The seeds ensure uniqueness per banned user pubkey.
    /// If `reason` is `NotBanned`, you could allow closing or just updating.
    #[account(
        init,
        payer = authority,
        space = BannedAccount::LEN,
        seeds = [BANNED_ACCOUNT_SEED, account.as_ref()],
        bump
    )]
    pub banned_account: Account<'info, BannedAccount>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(account: Pubkey)]
pub struct UnbanAccount<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Validate that the authority is an admin by checking the admin PDA.
    #[account(
        seeds = [ADMIN_SEED, authority.key().as_ref()],
        bump
    )]
    pub admin: AccountInfo<'info>,

    // The banned account for this user. We use `close` to return lamports to `receiver`.
    #[account(
        mut,
        close = receiver,
        seeds = [BANNED_ACCOUNT_SEED, account.as_ref()],
        bump
    )]
    pub banned_account: Account<'info, BannedAccount>,

    #[account(mut)]
    pub receiver: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::{system_program, Discriminator};
    use crate::test_utils::create_account_info;

    #[test]
    fn test_ban_account_success() {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let admin_key = Pubkey::new_unique();
        let system_program_key = system_program::ID;
        let banned_account_key = Pubkey::new_unique();
        let mut authority_lamports = 100;
        let mut admin_lamports = 100;
        let mut system_program_lamports = 100;
        let mut banned_accounts_lamports = 100;
        let mut authority_data = vec![0u8; 100];
        let mut admin_data = vec![0u8; 10];
        let mut system_program_data = vec![0u8; 10];
        let mut banned_account_data = vec![0u8; 100];

        let authority = create_account_info(
            &authority_key,
            true,
            false,
            &mut authority_lamports,
            &mut authority_data,
            &program_id,
            false,
            None
        );
        let admin_account = create_account_info(
            &admin_key,
            true,
            false,
            &mut admin_lamports,
            &mut admin_data,
            &program_id,
            false,
            None
        );
        let banned_account = create_account_info(
            &banned_account_key,
            false,
            false,
            &mut banned_accounts_lamports,
            &mut banned_account_data,
            &program_id,
            false,
            Some(BannedAccount::discriminator())
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

        let mut accounts = BanAccount {
            authority: Signer::try_from(&authority).unwrap(),
            admin: admin_account,
            banned_account: Account::try_from(&banned_account).unwrap(),
            system_program: Program::try_from(&system_program).unwrap(),
        };

        let mut ctx = Context {
            accounts: &mut accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: BanAccountBumps::default(),
        };

        let params = BanAccountParams {
            account: banned_account_key,
            reason: BanReason::Abuse,
        };

        let result = ban_account(&mut ctx, &params);
        assert!(result.is_ok());
    }

    #[test]
    fn test_unban_account_success() {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let admin_key = Pubkey::new_unique();
        let banned_account_key = Pubkey::new_unique();
        let receiver_key = Pubkey::new_unique();
        let system_program_key = system_program::ID;

        let mut authority_lamports = 100;
        let mut admin_lamports = 100;
        let mut banned_lamports = 100;
        let mut receiver_lamports = 100;
        let mut system_program_lamports = 100;

        let mut authority_data = vec![0u8; 100];
        let mut admin_data = vec![0u8; 10];
        let mut banned_data = vec![0u8; 100];
        let mut receiver_data = vec![0u8; 10];
        let mut system_program_data = vec![0u8; 10];

        let authority = create_account_info(
            &authority_key,
            true,
            false,
            &mut authority_lamports,
            &mut authority_data,
            &program_id,
            false,
            None
        );
        let admin = create_account_info(
            &admin_key,
            false,
            false,
            &mut admin_lamports,
            &mut admin_data,
            &program_id,
            false,
            None
        );
        let banned_account_info = create_account_info(
            &banned_account_key,
            false,
            true,
            &mut banned_lamports,
            &mut banned_data,
            &program_id,
            false,
            Some(BannedAccount::discriminator())
        );
        let receiver = create_account_info(
            &receiver_key,
            false,
            true,
            &mut receiver_lamports,
            &mut receiver_data,
            &system_program_key,
            false,
            None)
            ;
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

        let banned_account = Account::<BannedAccount>::try_from(&banned_account_info).unwrap();
        let receiver_account = SystemAccount::try_from(&receiver).unwrap();

        let mut unban_accounts = UnbanAccount {
            authority: Signer::try_from(&authority).unwrap(),
            admin,
            banned_account,
            receiver: receiver_account,
            system_program: Program::try_from(&system_program).unwrap(),
        };

        let ctx = Context {
            accounts: &mut unban_accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: UnbanAccountBumps::default(),
        };

        let params = UnbanAccountParams {
            account: banned_account_key,
        };

        let result = unban_account(&ctx, &params);
        assert!(result.is_ok());
    }
}

