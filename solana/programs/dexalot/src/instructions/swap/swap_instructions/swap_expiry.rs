use anchor_lang::prelude::*;

use crate::{
    consts::{COMPLETED_SWAPS_SEED, REBALANCER_SEED},
    errors::DexalotError,
    instructions::generate_map_entry_key, state::CompletedSwapsEntry,
};

#[derive(Accounts)]
#[instruction(params: UpdateSwapExpiryParams)]
pub struct UpdateSwapExpiry<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: the completed swap entry in the map
    #[account(
        init_if_needed,
        payer = authority,
        space = CompletedSwapsEntry::LEN,
        seeds = [
            COMPLETED_SWAPS_SEED,
            &generate_map_entry_key(params.nonce, params.trader)?],
        bump
    )]
    pub completed_swap_entry: AccountInfo<'info>,
    /// CHECK: the rebalancer
    #[account(
        seeds = [REBALANCER_SEED, authority.key().as_ref()],
        bump
    )]
    pub rebalancer: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Clone, AnchorDeserialize, AnchorSerialize)]
pub struct UpdateSwapExpiryParams {
    pub nonce: [u8; 12],
    pub trader: Pubkey,
}

pub fn update_swap_expiry(
    ctx: &Context<UpdateSwapExpiry>,
    _params: &UpdateSwapExpiryParams,
) -> Result<()> {
    // check is rebalancer
    let rebalancer = &ctx.accounts.rebalancer;
    require!(
        rebalancer.owner == ctx.program_id,
        DexalotError::UnauthorizedSigner
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::solana_program::{pubkey::Pubkey, system_program};
    use crate::test_utils::create_account_info;

    #[test]
    fn test_update_swap_expiry_success() -> Result<()> {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let completed_swap_key = Pubkey::new_unique();
        let rebalancer_key = Pubkey::new_unique();
        let system_program_key = system_program::ID;

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

        let mut completed_swap_lamports = 100;
        let mut completed_swap_data = vec![0u8; CompletedSwapsEntry::LEN];
        let completed_swap_info = create_account_info(
            &completed_swap_key,
            false,
            true,
            &mut completed_swap_lamports,
            &mut completed_swap_data,
            &program_id,
            false,
            None,
        );

        let mut rebalancer_lamports = 100;
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

        let mut system_program_lamports = 100;
        let mut system_program_data = vec![0u8; 10];
        let system_program_info = create_account_info(
            &system_program_key,
            false,
            false,
            &mut system_program_lamports,
            &mut system_program_data,
            &system_program_key,
            true,
            None,
        );
        let system_program = Program::<System>::try_from(&system_program_info)?;


        let mut update_accounts = UpdateSwapExpiry {
            authority: Signer::try_from(&authority_info)?,
            completed_swap_entry: completed_swap_info,
            rebalancer: rebalancer_info,
            system_program,
        };

        let params = UpdateSwapExpiryParams {
            nonce: [0u8; 12],
            trader: Pubkey::new_unique(),
        };

        let ctx = Context {
            program_id: &program_id,
            accounts: &mut update_accounts,
            remaining_accounts: &[],
            bumps: UpdateSwapExpiryBumps::default(),
        };

        let result = update_swap_expiry(&ctx, &params);
        assert!(result.is_ok());
        Ok(())
    }

    #[test]
    fn test_update_swap_expiry_fail_unauthorized() -> Result<()> {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let completed_swap_key = Pubkey::new_unique();
        let rebalancer_key = Pubkey::new_unique();
        let system_program_key = system_program::ID;

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

        let mut completed_swap_lamports = 100;
        let mut completed_swap_data = vec![0u8; CompletedSwapsEntry::LEN];
        let completed_swap_info = create_account_info(
            &completed_swap_key,
            false,
            true,
            &mut completed_swap_lamports,
            &mut completed_swap_data,
            &program_id,
            false,
            None,
        );

        let mut rebalancer_lamports = 100;
        let mut rebalancer_data = vec![0u8; 10];
        let wrong_owner = Pubkey::new_unique();
        let rebalancer_info = create_account_info(
            &rebalancer_key,
            false,
            false,
            &mut rebalancer_lamports,
            &mut rebalancer_data,
            &wrong_owner,
            false,
            None,
        );

        let mut system_program_lamports = 100;
        let mut system_program_data = vec![0u8; 10];
        let system_program_info = create_account_info(
            &system_program_key,
            false,
            false,
            &mut system_program_lamports,
            &mut system_program_data,
            &system_program_key,
            true,
            None,
        );
        let system_program = Program::<System>::try_from(&system_program_info)?;

        let mut update_accounts = UpdateSwapExpiry {
            authority: Signer::try_from(&authority_info)?,
            completed_swap_entry: completed_swap_info,
            rebalancer: rebalancer_info,
            system_program,
        };

        let params = UpdateSwapExpiryParams {
            nonce: [0u8; 12],
            trader: Pubkey::new_unique(),
        };

        let ctx = Context {
            program_id: &program_id,
            accounts: &mut update_accounts,
            remaining_accounts: &[],
            bumps: UpdateSwapExpiryBumps::default(),
        };

        let result = update_swap_expiry(&ctx, &params);
        assert_eq!(result.unwrap_err(), DexalotError::UnauthorizedSigner.into());
        Ok(())
    }
}


