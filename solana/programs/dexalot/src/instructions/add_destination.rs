use anchor_lang::prelude::*;

use crate::{
    consts::{ADMIN_SEED, CCTRADE_ALLOWED_DEST_SEED},
    errors::DexalotError,
    state::AllowedDestinationEntry,
};

#[derive(Clone, AnchorDeserialize, AnchorSerialize)]
pub struct AddDestinationParams {
    pub eid: u32,
    pub token_address: Pubkey,
}

#[derive(Accounts)]
#[instruction(params: AddDestinationParams)]
pub struct AddDestination<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
    #[account(
        init_if_needed,
        payer = payer,
        space = AllowedDestinationEntry::LEN,
        seeds = [CCTRADE_ALLOWED_DEST_SEED, &params.eid.to_be_bytes(), &params.token_address.to_bytes()],
        bump
    )]
    pub destination_entry: Account<'info, AllowedDestinationEntry>,
    /// CHECK: the admin pda
    #[account(
            seeds = [ADMIN_SEED, payer.key().as_ref()],
            bump)]
    pub admin: AccountInfo<'info>,
}

pub fn add_destination(
    ctx: &Context<AddDestination>,
    _params: &AddDestinationParams,
) -> Result<()> {
    let admin = &ctx.accounts.admin;
    require!(
        admin.owner == ctx.program_id,
        DexalotError::UnauthorizedSigner
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use anchor_lang::Discriminator;
    use super::*;
    use anchor_lang::solana_program::system_program;
    use crate::{
        state::AllowedDestinationEntry,
        test_utils::create_account_info,
    };

    #[test]
    fn test_add_destination_success() -> Result<()> {
        let program_id = crate::id();
        let payer_key = Pubkey::new_unique();
        let mut payer_data = vec![0u8; 100];
        let mut payer_lamports = 100;
        let payer_info = create_account_info(
            &payer_key,
            true,
            true,
            &mut payer_lamports,
            &mut payer_data,
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
        let dest_space = AllowedDestinationEntry::LEN;
        let mut dest_data = vec![0u8; dest_space];
        let mut dest_lamports = 100;
        let dest_key = Pubkey::new_unique();
        let dest_info = create_account_info(
            &dest_key,
            false,
            true,
            &mut dest_lamports,
            &mut dest_data,
            &program_id,
            false,
            Some(AllowedDestinationEntry::discriminator()),
        );
        let admin_key = Pubkey::new_unique();
        let mut admin_data = vec![0u8; 100];
        let mut admin_lamports = 100;
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
        let mut add_dest_accounts = AddDestination {
            payer: Signer::try_from(&payer_info)?,
            system_program: Program::try_from(&system_info)?,
            destination_entry: Account::try_from(&dest_info)?,
            admin: admin_info,
        };
        let add_params = AddDestinationParams {
            eid: 42,
            token_address: Pubkey::new_unique(),
        };
        let ctx = Context {
            accounts: &mut add_dest_accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: AddDestinationBumps::default(),
        };
        let result = add_destination(&ctx, &add_params);
        assert!(result.is_ok());
        Ok(())
    }

    #[test]
    fn test_add_destination_fail_wrong_admin() -> Result<()> {
        let program_id = crate::id();
        let payer_key = Pubkey::new_unique();
        let mut payer_data = vec![0u8; 100];
        let mut payer_lamports = 100;
        let payer_info = create_account_info(
            &payer_key,
            true,
            true,
            &mut payer_lamports,
            &mut payer_data,
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
        let dest_space = AllowedDestinationEntry::LEN;
        let mut dest_data = vec![0u8; dest_space];
        let mut dest_lamports = 100;
        let dest_key = Pubkey::new_unique();
        let dest_info = create_account_info(
            &dest_key,
            false,
            true,
            &mut dest_lamports,
            &mut dest_data,
            &program_id,
            false,
            Some(AllowedDestinationEntry::discriminator()),
        );
        let admin_key = Pubkey::new_unique();
        let mut admin_data = vec![0u8; 100];
        let mut admin_lamports = 100;
        let admin_info = create_account_info(
            &admin_key,
            false,
            false,
            &mut admin_lamports,
            &mut admin_data,
            &admin_key,
            false,
            None,
        );
        let mut add_dest_accounts = AddDestination {
            payer: Signer::try_from(&payer_info)?,
            system_program: Program::try_from(&system_info)?,
            destination_entry: Account::try_from(&dest_info)?,
            admin: admin_info,
        };
        let add_params = AddDestinationParams {
            eid: 42,
            token_address: Pubkey::new_unique(),
        };
        let ctx = Context {
            accounts: &mut add_dest_accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: AddDestinationBumps::default(),
        };
        let result = add_destination(&ctx, &add_params);
        assert_eq!(result.unwrap_err(), DexalotError::UnauthorizedSigner.into());
        Ok(())
    }
}
