use anchor_lang::prelude::*;
use anchor_spl::token::Token;

use crate::{
    consts::{
        ANCHOR_DISCRIMINATOR, PENDING_SWAPS_SEED, SOL_VAULT_SEED,
        SPL_VAULT_SEED, AIRDROP_VAULT_SEED
    },
    errors::DexalotError,
    events::{
        SolTransfer, SolTransferTransactions, SolTransferTypes, SwapQueueActions, SwapQueueEvent,
    },
    instructions::{
        generate_map_entry_key, nonce_to_custom_data, process_xfer_payload_native,
        process_xfer_payload_spl,
    },
    map_utils::create_entry,
    xfer::{Tx, XFERSolana},
};

#[derive(Accounts)]
#[instruction(params: RemoveFromSwapQueueParams)]
pub struct RemoveFromSwapQueue<'info> {
    /// CHECK: Used to set the program as authority for the associated token account
    #[account(
          constraint = spl_vault.owner == __program_id @ DexalotError::InvalidVaultOwner,
          seeds = [SPL_VAULT_SEED],
          bump,
      )]
    pub spl_vault: AccountInfo<'info>,
    /// CHECK: the sol vault
    #[account(
          mut,
          seeds = [SOL_VAULT_SEED],
          bump,
      )]
    pub sol_vault: AccountInfo<'info>,
    /// CHECK: ata or solvault
    #[account(mut)]
    pub from: AccountInfo<'info>,
    /// CHECK: ata or trader
    #[account(mut)]
    pub to: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
    /// CHECK: the trader account
    #[account(mut)]
    pub trader: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    /// CHECK: when calling the instruction
    #[account(mut,
        close = sol_vault,
          seeds = [
              PENDING_SWAPS_SEED,
              &generate_map_entry_key(params.nonce,
              params.dest_trader)?], bump
          )]
    pub swap_queue_entry: Account<'info, PendingSwap>,
    /// CHECK: the airdrop vault
    #[account(
            mut,
            seeds = [AIRDROP_VAULT_SEED],
            bump,
        )]
    pub airdrop_vault: AccountInfo<'info>,
}

#[derive(Clone, AnchorDeserialize, AnchorSerialize)]
pub struct RemoveFromSwapQueueParams {
    pub nonce: [u8; 12],
    pub dest_trader: Pubkey,
}

pub fn remove_from_swap_queue(
    ctx: &Context<RemoveFromSwapQueue>,
    params: &RemoveFromSwapQueueParams,
) -> Result<()> {
    let sol_vault = &ctx.accounts.sol_vault;
    let trader = &ctx.accounts.trader;
    let system_program = &ctx.accounts.system_program;
    let airdrop_vault = &ctx.accounts.airdrop_vault;
    let swap_queue_entry = &ctx.accounts.swap_queue_entry;

    let xfer = XFERSolana::new(
        Tx::CCTrade,
        swap_queue_entry.trader,
        swap_queue_entry.token_mint,
        swap_queue_entry.quantity,
        0, // not used
        nonce_to_custom_data(params.nonce),
        0, // not used
    );

    let is_native_withdraw = xfer.token_mint == Pubkey::default();

    if is_native_withdraw {
        // Start native withdraw

        process_xfer_payload_native(
            &xfer,
            ctx.bumps.sol_vault,
            sol_vault,
            trader,
            &swap_queue_entry.to_account_info(),
            system_program,
            airdrop_vault,
            ctx.bumps.airdrop_vault,
            true,
        )?;
    } else {
        let from = &ctx.accounts.from;
        let to = &ctx.accounts.to;
        let token_program = &ctx.accounts.token_program;
        let spl_vault = &ctx.accounts.spl_vault;

        process_xfer_payload_spl(
            &xfer,
            ctx.bumps.spl_vault,
            SPL_VAULT_SEED.as_ref(),
            spl_vault,
            ctx.bumps.sol_vault,
            sol_vault,
            from,
            to,
            token_program,
            &swap_queue_entry.to_account_info(),
            system_program,
            true,
        )?;
    }
    emit!(SwapQueueEvent {
        action: SwapQueueActions::Remove,
        nonce: hex::encode(params.nonce),
        trader: params.dest_trader,
        pending_swap: swap_queue_entry.clone().into_inner(),
    });
    Ok(())
}

pub fn add_to_swap_queue<'info>(
    airdrop_vault: &AccountInfo<'info>,
    entry_info: &AccountInfo<'info>,
    pending_swap: PendingSwap,
    system_program: &Program<'info, System>,
    nonce: [u8; 12],
    trader: Pubkey,
    airdrop_vault_bump: u8,
) -> Result<()> {
    let base_map_seed = PENDING_SWAPS_SEED;
    let entry_map_seed = &generate_map_entry_key(nonce, trader)?;
    let airdrop_vault_signer_seeds: &[&[u8]] = &[AIRDROP_VAULT_SEED, &[airdrop_vault_bump]];
    let payer_seeds = Some(airdrop_vault_signer_seeds);

    create_entry::<PendingSwap>(
        airdrop_vault,
        entry_info,
        &pending_swap,
        PendingSwap::LEN,
        base_map_seed,
        entry_map_seed,
        &crate::ID,
        system_program,
        payer_seeds,
    )?;

    let required_lamports = if cfg!(not(test)) {
        let rent = Rent::get()?;
        rent.minimum_balance(PendingSwap::LEN)
    } else {
        0
    };

    emit!(SolTransfer {
        amount: required_lamports,
        transaction: SolTransferTransactions::Withdraw,
        transfer_type: SolTransferTypes::PendingSwapCreation
    });

    emit!(SwapQueueEvent {
        action: SwapQueueActions::Add,
        nonce: hex::encode(nonce),
        trader,
        pending_swap
    });
    Ok(())
}

#[account]
#[derive(InitSpace, Debug)]
pub struct PendingSwap {
    pub trader: Pubkey,
    pub quantity: u64,
    pub token_mint: Pubkey,
}

impl PendingSwap {
    pub const LEN: usize = ANCHOR_DISCRIMINATOR + PendingSwap::INIT_SPACE;
}

#[cfg(test)]
mod tests {
    use anchor_lang::Discriminator;
    use super::*;
    use anchor_lang::solana_program::system_program;
    use crate::consts::{NATIVE_VAULT_MIN_THRESHOLD, PENDING_SWAPS_SEED};
    use crate::test_utils::{create_account_info, create_packed_token_account};

    #[test]
    fn test_remove_from_swap_queue_native_success() -> Result<()> {
        let program_id = crate::id();
        let generic_key = Pubkey::new_unique();

        let nonce = [1u8; 12];
        let dest_trader = Pubkey::new_unique();
        let pending_swap = PendingSwap {
            trader: generic_key,
            quantity: 1000,
            token_mint: Pubkey::default(),
        };
        let swap_queue_key = Pubkey::find_program_address(
            &[PENDING_SWAPS_SEED, &generate_map_entry_key(nonce, dest_trader)?],
            &program_id,
        ).0;
        let mut swap_queue_lamports = 100;
        let mut swap_queue_data = pending_swap.try_to_vec()?;
        let swap_queue_account = create_account_info(
            &swap_queue_key,
            false,
            true,
            &mut swap_queue_lamports,
            &mut swap_queue_data,
            &program_id,
            false,
            Some(PendingSwap::discriminator())
        );
        let swap_queue_entry: Account<PendingSwap> = Account::try_from(&swap_queue_account)?;

        let mut generic_lamports = 5000 + NATIVE_VAULT_MIN_THRESHOLD;
        let mut generic_data = vec![0u8; 1];
        let generic_info = create_account_info(
            &generic_key,
            false,
            true,
            &mut generic_lamports,
            &mut generic_data,
            &program_id,
            false,
            None
        );

        let mut airdrop_vault_lamports = 1000;
        let mut airdrop_vault_data = vec![10; 1];
        let airdrop_vault = create_account_info(
            &generic_key,
            false,
            true,
            &mut airdrop_vault_lamports,
            &mut airdrop_vault_data,
            &program_id,
            false,
            None
        );

        let mut token_lamports = 1000;
        let mut token_data = vec![0u8; 100];
        let token_info = create_account_info(
            &anchor_spl::token::ID,
            false,
            false,
            &mut token_lamports,
            &mut token_data,
            &anchor_spl::token::ID,
            true,
            None
        );
        let token_program = Program::try_from(&token_info)?;

        let mut system_lamports = 1000;
        let mut system_data = vec![0u8; 100];
        let system_info = create_account_info(
            &system_program::ID,
            false,
            false,
            &mut system_lamports,
            &mut system_data,
            &system_program::ID,
            true,
            None
        );
        let system_program = Program::try_from(&system_info)?;

        let params = RemoveFromSwapQueueParams { nonce, dest_trader };
        let mut accounts = RemoveFromSwapQueue {
            spl_vault: generic_info.clone(),
            sol_vault: generic_info.clone(),
            from: generic_info.clone(),
            to: generic_info.clone(),
            token_program,
            trader: generic_info.clone(),
            system_program,
            swap_queue_entry,
            airdrop_vault,
        };
        let ctx = Context {
            accounts: &mut accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: RemoveFromSwapQueueBumps::default()
        };
        let res = remove_from_swap_queue(&ctx, &params);
        assert!(res.is_ok());
        Ok(())
    }

    #[test]
    fn test_remove_from_swap_queue_spl_success() -> Result<()> {
        let program_id = crate::id();
        let generic_key = Pubkey::new_unique();

        let trader_key = Pubkey::new_unique();
        let nonce = [1u8; 12];
        let dest_trader = Pubkey::new_unique();
        let token_mint_address = Pubkey::new_unique();
        let pending_swap = PendingSwap {
            trader: generic_key,
            quantity: 1000,
            token_mint: token_mint_address,
        };
        let swap_queue_key = Pubkey::find_program_address(
            &[PENDING_SWAPS_SEED, &generate_map_entry_key(nonce, dest_trader)?],
            &program_id,
        ).0;
        let mut swap_queue_lamports = 100;
        let mut swap_queue_data = pending_swap.try_to_vec()?;
        let swap_queue_account = create_account_info(
            &swap_queue_key,
            false,
            true,
            &mut swap_queue_lamports,
            &mut swap_queue_data,
            &program_id,
            false,
            Some(PendingSwap::discriminator())
        );
        let swap_queue_entry: Account<PendingSwap> = Account::try_from(&swap_queue_account)?;

        let mut generic_lamports = 5000 + NATIVE_VAULT_MIN_THRESHOLD;
        let mut generic_data = vec![0u8; 1];
        let generic_info = create_account_info(
            &generic_key,
            false,
            true,
            &mut generic_lamports,
            &mut generic_data,
            &program_id,
            false,
            None
        );

        let mut airdrop_vault_lamports = 1000;
        let mut airdrop_vault_data = vec![10; 1];
        let airdrop_vault = create_account_info(
            &generic_key,
            false,
            true,
            &mut airdrop_vault_lamports,
            &mut airdrop_vault_data,
            &program_id,
            false,
            None
        );

        let mut token_lamports = 1000;
        let mut token_data = vec![0u8; 100];
        let token_info = create_account_info(
            &anchor_spl::token::ID,
            false,
            false,
            &mut token_lamports,
            &mut token_data,
            &anchor_spl::token::ID,
            true,
            None
        );
        let token_program = Program::try_from(&token_info)?;

        let mut system_lamports = 1000;
        let mut system_data = vec![0u8; 100];
        let system_info = create_account_info(
            &system_program::ID,
            false,
            false,
            &mut system_lamports,
            &mut system_data,
            &system_program::ID,
            true,
            None
        );
        let system_program = Program::try_from(&system_info)?;

        let mut from_token_data = create_packed_token_account(token_mint_address, trader_key, 15000)?;
        let from_key = Pubkey::new_unique();
        let mut from_lamports = 15000;
        let from = create_account_info(
            &from_key,
            false,
            true,
            &mut from_lamports,
            &mut from_token_data,
            &program_id,
            false,
            None,
        );

        let params = RemoveFromSwapQueueParams { nonce, dest_trader };
        let mut accounts = RemoveFromSwapQueue {
            spl_vault: generic_info.clone(),
            sol_vault: generic_info.clone(),
            from,
            to: generic_info.clone(),
            token_program,
            trader: generic_info.clone(),
            system_program,
            swap_queue_entry,
            airdrop_vault,
        };
        let ctx = Context {
            accounts: &mut accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: RemoveFromSwapQueueBumps::default()
        };
        let res = remove_from_swap_queue(&ctx, &params);
        assert!(res.is_ok());
        Ok(())
    }
}
