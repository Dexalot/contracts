use super::*;
use crate::{
    consts::{NATIVE_VAULT_MIN_THRESHOLD, SOL_USER_FUNDS_VAULT_SEED, SOL_VAULT_SEED},
    errors::DexalotError,
    events::XChainFinalized,
    instructions::{add_to_swap_queue, PendingSwap},
    xfer::{Tx, XFERSolana},
};
use anchor_lang::{
    prelude::*,
    solana_program::{program::invoke_signed, system_instruction},
};
use anchor_spl::token::{spl_token, Token, TokenAccount};

pub fn process_xfer_payload_native<'info>(
    xfer: &XFERSolana,
    sol_vault_bump: u8,
    sol_vault: &AccountInfo<'info>,
    trader: &AccountInfo<'info>,
    swap_queue_entry: &AccountInfo<'info>,
    system_program: &Program<'info, System>,
    airdrop_vault: &AccountInfo<'info>,
    airdrop_vault_bump: u8,
    is_remove: bool,
) -> Result<()> {
    let from = sol_vault;
    let to = trader;
    require!(
        xfer.quantity > 0,
        DexalotError::ZeroXferAmount
    );
    require!(
        xfer.trader == to.key(),
        DexalotError::UnauthorizedSigner
    );

    if !is_remove {
        if from.lamports() < xfer.quantity + NATIVE_VAULT_MIN_THRESHOLD {
            let pending_swap = PendingSwap {
                trader: xfer.trader,
                quantity: xfer.quantity,
                token_mint: Pubkey::default(), // native asset
            };
            add_to_swap_queue(
                airdrop_vault,
                swap_queue_entry,
                pending_swap,
                system_program,
                custom_data_to_nonce(xfer.custom_data),
                xfer.trader,
                airdrop_vault_bump,
            )?;
            return Ok(());
        }
    } else {
        require!(
            from.lamports() >= xfer.quantity + NATIVE_VAULT_MIN_THRESHOLD,
            DexalotError::NotEnoughNativeBalance
        );
    }

    let bump = &[sol_vault_bump];
    let seeds: &[&[u8]] = &[
        if xfer.transaction == Tx::CCTrade {
            SOL_VAULT_SEED
        } else {
            SOL_USER_FUNDS_VAULT_SEED
        },
        bump,
    ];
    let signer_seeds = &[&seeds[..]];

    // Transfer the native SOL from the program to the user
    let ix = system_instruction::transfer(&from.key(), &to.key(), xfer.quantity);
    if cfg!(not(test)){
        invoke_signed(
            &ix,
            &[
                from.to_account_info().clone(),
                to.to_account_info().clone(),
                system_program.to_account_info().clone(),
            ],
            signer_seeds, // sign with the PDA
        )?;
    }

    emit!(XChainFinalized {
        nonce: xfer.nonce,
        trader: xfer.trader,
        token_mint: xfer.token_mint,
        amount: xfer.quantity,
        timestamp: xfer.timestamp
    });
    Ok(())
}

pub fn process_xfer_payload_spl<'info>(
    xfer: &XFERSolana,
    token_vault_bump: u8,
    token_vault_seeds: &[u8],
    token_vault: &AccountInfo<'info>,
    airdrop_vault_bump: u8,
    airdrop_vault: &AccountInfo<'info>,
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    token_program: &Program<'info, Token>,
    swap_queue_entry: &AccountInfo<'info>,
    system_program: &Program<'info, System>,
    is_remove: bool, // flag is true when executed during remove from pending swap queue
) -> Result<()> {
    // Check if swap can be completed
    let from_ata_amount = {
        let mut data: &[u8] = &from.try_borrow_data()?;
        let cast_ata = TokenAccount::try_deserialize(&mut data)?;
        cast_ata.amount
    };

    if !is_remove {
        // we check the type of xfer message and if we have the amount
        if xfer.transaction == Tx::CCTrade && from_ata_amount < xfer.quantity {
            let pending_swap = PendingSwap {
                trader: xfer.trader,
                quantity: xfer.quantity,
                token_mint: xfer.token_mint,
            };
            add_to_swap_queue(
                airdrop_vault,
                swap_queue_entry,
                pending_swap,
                system_program,
                custom_data_to_nonce(xfer.custom_data),
                xfer.trader,
                airdrop_vault_bump,
            )?;
            return Ok(());
        }
    } else {
        require!(
            from_ata_amount >= xfer.quantity,
            DexalotError::NotEnoughSplTokenBalance
        );
    }

    let ix = spl_token::instruction::transfer(
        &token_program.key(),
        &from.key(),
        &to.key(),
        &token_vault.key(),
        &[],
        xfer.quantity,
    )?;
    let bump = &[token_vault_bump];
    let seeds: &[&[u8]] = &[token_vault_seeds, bump];
    let signer_seeds = &[&seeds[..]];

    // Transfer the tokens from dexalot to the user
    if cfg!(not(test)) {
        invoke_signed(
            &ix,
            &[
                from.to_account_info(),
                to.to_account_info(),
                token_vault.to_account_info(),
                token_program.to_account_info(),
            ],
            signer_seeds,
        )?;
    }

    emit!(XChainFinalized {
        nonce: xfer.nonce,
        trader: xfer.trader,
        token_mint: xfer.token_mint,
        amount: xfer.quantity,
        timestamp: xfer.timestamp
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::system_program;
    use crate::consts::PENDING_SWAPS_SEED;
    use crate::test_utils::{create_account_info, create_packed_token_account};
    use crate::xfer::XChainMsgType;

    #[test]
    fn test_process_xfer_payload_native_success() -> Result<()> {
        let program_id = crate::id();

        let trader_key = Pubkey::new_unique();
        let mut xfer = XFERSolana {
            quantity: 1000,
            trader: trader_key,
            token_mint: Pubkey::default(),
            nonce: 456,
            timestamp: 0,
            custom_data: [20; 18],
            transaction: Tx::CCTrade,
            message_type: XChainMsgType::XFER,
        };
        let base_map_seed = PENDING_SWAPS_SEED;
        let entry_map_seed = generate_map_entry_key(custom_data_to_nonce(xfer.custom_data), xfer.trader)?;
        let (pda, _bump) = Pubkey::find_program_address(&[base_map_seed, &entry_map_seed], &program_id);

        let sol_vault_key = Pubkey::new_unique();
        let mut sol_vault_lamports = 2000 + NATIVE_VAULT_MIN_THRESHOLD;
        let mut sol_vault_data = vec![0u8; 1];
        let sol_vault = create_account_info(
            &sol_vault_key,
            false,
            true,
            &mut sol_vault_lamports,
            &mut sol_vault_data,
            &program_id,
            false,
            None
        );

        let mut trader_lamports = 0;
        let mut trader_data = vec![0u8; 1];
        let trader = create_account_info(
            &trader_key,
            false,
            true,
            &mut trader_lamports,
            &mut trader_data,
            &program_id,
            false,
            None
        );

        let mut swap_queue_lamports = 0;
        let mut swap_queue_data = vec![];
        let swap_queue_entry = create_account_info(
            &pda,
            false,
            true,
            &mut swap_queue_lamports,
            &mut swap_queue_data,
            &program_id,
            false,
            None
        );

        let airdrop_vault_key = Pubkey::new_unique();
        let mut airdrop_vault_lamports = 0;
        let mut airdrop_vault_data = vec![10; 1];
        let airdrop_vault_info = create_account_info(
            &airdrop_vault_key,
            false,
            true,
            &mut airdrop_vault_lamports,
            &mut airdrop_vault_data,
            &program_id,
            false,
            None
        );

        let sys_key = system_program::ID;
        let mut sys_lamports = 0;
        let mut sys_data = vec![];
        let system_program_ai = create_account_info(
            &sys_key,
            false,
            false,
            &mut sys_lamports,
            &mut sys_data,
            &sys_key,
            true,
            None
        );

        let system_program = Program::try_from(&system_program_ai)?;

        let result = process_xfer_payload_native(
            &xfer,
            42,
            &sol_vault,
            &trader,
            &swap_queue_entry,
            &system_program,
            &airdrop_vault_info,
            42,
            false,
        );
        assert!(result.is_ok());

        xfer.transaction = Tx::CCTrade;
        let result = process_xfer_payload_native(
            &xfer,
            42,
            &sol_vault,
            &trader,
            &swap_queue_entry,
            &system_program,
            &airdrop_vault_info,
            42,
            true,
        );
        assert!(result.is_ok());
        Ok(())
    }

    #[test]
    fn test_process_xfer_payload_native_negative_cases() -> Result<()> {
        let program_id = crate::id();

        let trader_key = Pubkey::new_unique();
        let mut xfer = XFERSolana {
            quantity: 1000,
            trader: trader_key,
            token_mint: Pubkey::default(),
            nonce: 456,
            timestamp: 0,
            custom_data: [20; 18],
            transaction: Tx::CCTrade,
            message_type: XChainMsgType::XFER,
        };
        let base_map_seed = PENDING_SWAPS_SEED;
        let entry_map_seed = generate_map_entry_key(custom_data_to_nonce(xfer.custom_data), xfer.trader)?;
        let (pda, _bump) = Pubkey::find_program_address(&[base_map_seed, &entry_map_seed], &program_id);

        let sol_vault_key = Pubkey::new_unique();
        let mut sol_vault_lamports = 2000;
        let mut sol_vault_data = vec![0u8; 1];
        let sol_vault = create_account_info(
            &sol_vault_key,
            false,
            true,
            &mut sol_vault_lamports,
            &mut sol_vault_data,
            &program_id,
            false,
            None
        );

        let mut trader_lamports = 0;
        let mut trader_data = vec![0u8; 1];
        let mut trader = create_account_info(
            &trader_key,
            false,
            true,
            &mut trader_lamports,
            &mut trader_data,
            &program_id,
            false,
            None
        );

        let mut swap_queue_lamports = 0;
        let mut swap_queue_data = vec![];
        let swap_queue_entry = create_account_info(
            &pda,
            false,
            true,
            &mut swap_queue_lamports,
            &mut swap_queue_data,
            &program_id,
            false,
            None
        );

        let airdrop_vault_key = Pubkey::new_unique();
        let mut airdrop_vault_lamports = 0;
        let mut airdrop_vault_data = vec![10; 1];
        let airdrop_vault_info = create_account_info(
            &airdrop_vault_key,
            false,
            true,
            &mut airdrop_vault_lamports,
            &mut airdrop_vault_data,
            &program_id,
            false,
            None
        );

        let sys_key = system_program::ID;
        let mut sys_lamports = 0;
        let mut sys_data = vec![];
        let system_program_ai = create_account_info(
            &sys_key,
            false,
            false,
            &mut sys_lamports,
            &mut sys_data,
            &sys_key,
            true,
            None
        );

        let system_program = Program::try_from(&system_program_ai)?;

        let result = process_xfer_payload_native(
            &xfer,
            42,
            &sol_vault,
            &trader,
            &swap_queue_entry,
            &system_program,
            &airdrop_vault_info,
            42,
            true,
        );
        assert_eq!(result.unwrap_err(), DexalotError::NotEnoughNativeBalance.into());

        trader.key = &sys_key;

        let result = process_xfer_payload_native(
            &xfer,
            42,
            &sol_vault,
            &trader,
            &swap_queue_entry,
            &system_program,
            &airdrop_vault_info,
            42,
            true,
        );
        assert_eq!(result.unwrap_err(), DexalotError::UnauthorizedSigner.into());

        xfer.quantity = 0;

        let result = process_xfer_payload_native(
            &xfer,
            42,
            &sol_vault,
            &trader,
            &swap_queue_entry,
            &system_program,
            &airdrop_vault_info,
            42,
            true,
        );
        assert_eq!(result.unwrap_err(), DexalotError::ZeroXferAmount.into());
        Ok(())
    }

    #[test]
    fn test_process_xfer_payload_spl_success() -> Result<()> {
        let program_id = crate::id();
        let trader_key = Pubkey::new_unique();
        let token_mint = Pubkey::new_unique();
        let xfer = XFERSolana {
            quantity: 1000,
            trader: trader_key,
            token_mint,
            nonce: 789,
            timestamp: 0,
            custom_data: [30; 18],
            transaction: Tx::CCTrade,
            message_type: XChainMsgType::XFER,
        };

        let mut from_token_data = create_packed_token_account(token_mint, trader_key, 0)?;
        let from_key = Pubkey::new_unique();
        let mut from_lamports = 0;
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

        let to_key = Pubkey::new_unique();
        let mut to_lamports = 0;
        let mut to_data = vec![0u8; 1];
        let to = create_account_info(
            &to_key,
            false,
            true,
            &mut to_lamports,
            &mut to_data,
            &program_id,
            false,
            None,
        );

        let token_vault_key = Pubkey::new_unique();
        let mut token_vault_lamports = 0;
        let mut token_vault_data = vec![0u8; 1];
        let token_vault = create_account_info(
            &token_vault_key,
            false,
            true,
            &mut token_vault_lamports,
            &mut token_vault_data,
            &program_id,
            false,
            None,
        );

        let airdrop_vault_key = Pubkey::new_unique();
        let mut airdrop_vault_lamports = 0;
        let mut airdrop_vault_data = vec![10; 1];
        let airdrop_vault = create_account_info(
            &airdrop_vault_key,
            false,
            true,
            &mut airdrop_vault_lamports,
            &mut airdrop_vault_data,
            &program_id,
            false,
            None,
        );

        let base_map_seed = PENDING_SWAPS_SEED;
        let entry_map_seed = generate_map_entry_key(custom_data_to_nonce(xfer.custom_data), xfer.trader)?;
        let (pda, _bump) = Pubkey::find_program_address(&[base_map_seed, &entry_map_seed], &program_id);
        let mut swap_queue_lamports = 0;
        let mut swap_queue_data = vec![];
        let swap_queue_entry = create_account_info(
            &pda,
            false,
            true,
            &mut swap_queue_lamports,
            &mut swap_queue_data,
            &program_id,
            false,
            None,
        );

        let mut token_program_lamports = 0;
        let mut token_program_data = vec![];
        let token_program_ai = create_account_info(
            &anchor_spl::token::ID,
            false,
            false,
            &mut token_program_lamports,
            &mut token_program_data,
            &anchor_spl::token::ID,
            true,
            None,
        );
        let token_program = Program::try_from(&token_program_ai)?;

        let sys_key = system_program::ID;
        let mut sys_lamports = 0;
        let mut sys_data = vec![];
        let system_program_ai = create_account_info(
            &sys_key,
            false,
            false,
            &mut sys_lamports,
            &mut sys_data,
            &sys_key,
            true,
            None,
        );
        let system_program = Program::try_from(&system_program_ai)?;

        let token_vault_seeds: &[u8] = b"vault_seed";

        let result = process_xfer_payload_spl(
            &xfer,
            42,
            token_vault_seeds,
            &token_vault,
            42,
            &airdrop_vault,
            &from,
            &to,
            &token_program,
            &swap_queue_entry,
            &system_program,
            false,
        );
        assert!(result.is_ok());

        Ok(())
    }

    #[test]
    fn test_process_xfer_payload_spl_negative_cases() -> Result<()> {
        let program_id = crate::id();
        let trader_key = Pubkey::new_unique();
        let token_mint = Pubkey::new_unique();
        let xfer = XFERSolana {
            quantity: 1000,
            trader: trader_key,
            token_mint,
            nonce: 789,
            timestamp: 0,
            custom_data: [30; 18],
            transaction: Tx::CCTrade,
            message_type: XChainMsgType::XFER,
        };

        let mut from_token_data = create_packed_token_account(token_mint, trader_key, 0)?;
        let from_key = Pubkey::new_unique();
        let mut from_lamports = 0;
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

        let to_key = Pubkey::new_unique();
        let mut to_lamports = 0;
        let mut to_data = vec![0u8; 1];
        let to = create_account_info(
            &to_key,
            false,
            true,
            &mut to_lamports,
            &mut to_data,
            &program_id,
            false,
            None,
        );

        let token_vault_key = Pubkey::new_unique();
        let mut token_vault_lamports = 0;
        let mut token_vault_data = vec![0u8; 1];
        let token_vault = create_account_info(
            &token_vault_key,
            false,
            true,
            &mut token_vault_lamports,
            &mut token_vault_data,
            &program_id,
            false,
            None,
        );

        let airdrop_vault_key = Pubkey::new_unique();
        let mut airdrop_vault_lamports = 0;
        let mut airdrop_vault_data = vec![10; 1];
        let airdrop_vault = create_account_info(
            &airdrop_vault_key,
            false,
            true,
            &mut airdrop_vault_lamports,
            &mut airdrop_vault_data,
            &program_id,
            false,
            None,
        );

        let base_map_seed = PENDING_SWAPS_SEED;
        let entry_map_seed = generate_map_entry_key(custom_data_to_nonce(xfer.custom_data), xfer.trader)?;
        let (pda, _bump) = Pubkey::find_program_address(&[base_map_seed, &entry_map_seed], &program_id);
        let mut swap_queue_lamports = 0;
        let mut swap_queue_data = vec![];
        let swap_queue_entry = create_account_info(
            &pda,
            false,
            true,
            &mut swap_queue_lamports,
            &mut swap_queue_data,
            &program_id,
            false,
            None,
        );

        let mut token_program_lamports = 0;
        let mut token_program_data = vec![];
        let token_program_ai = create_account_info(
            &anchor_spl::token::ID,
            false,
            false,
            &mut token_program_lamports,
            &mut token_program_data,
            &anchor_spl::token::ID,
            true,
            None,
        );
        let token_program = Program::try_from(&token_program_ai)?;

        let sys_key = system_program::ID;
        let mut sys_lamports = 0;
        let mut sys_data = vec![];
        let system_program_ai = create_account_info(
            &sys_key,
            false,
            false,
            &mut sys_lamports,
            &mut sys_data,
            &sys_key,
            true,
            None,
        );
        let system_program = Program::try_from(&system_program_ai)?;

        let token_vault_seeds: &[u8] = b"vault_seed";

        let result = process_xfer_payload_spl(
            &xfer,
            42,
            token_vault_seeds,
            &token_vault,
            42,
            &airdrop_vault,
            &from,
            &to,
            &token_program,
            &swap_queue_entry,
            &system_program,
            true,
        );
        assert_eq!(result.unwrap_err(), DexalotError::NotEnoughSplTokenBalance.into());

        Ok(())
    }
}

