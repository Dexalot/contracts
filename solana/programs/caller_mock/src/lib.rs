mod errors;
mod uitls;
mod xfer;
use crate::xfer::{Tx, XFERSolana};
use anchor_lang::{
    prelude::*,
    solana_program::{instruction::Instruction, program::invoke},
};
use uitls::*;
declare_id!("8F8sMLA7as3v2KQvQruDWvZtvaz8bXvv6iUCNYTdQv3H");

#[program]
pub mod caller_mock {
    use super::*;

    pub fn call_dexalot<'info>(
        mut ctx: Context<'_, '_, '_, 'info, CallDexalot<'info>>,
        params: CallDexalotParams,
    ) -> Result<()> {
        call_dexalot_internal(&mut ctx, &params)
    }
}

#[derive(Accounts)]
pub struct CallDexalot<'info> {
    /// CHECK:
    pub dexalot_program: UncheckedAccount<'info>,
    /// CHECK:
    #[account(mut)]
    pub portfolio: UncheckedAccount<'info>,
    /// CHECK: Used to set the program as authority for the associated token account
    #[account()]
    pub token_vault: UncheckedAccount<'info>,
    /// CHECK: the sol vault
    #[account(mut)]
    pub sol_vault: UncheckedAccount<'info>,
    /// CHECK: ata or solvault
    #[account(mut)]
    pub from: UncheckedAccount<'info>,
    /// CHECK: ata or trader
    #[account(mut)]
    pub to: UncheckedAccount<'info>,
    /// CHECK:
    #[account()]
    pub token_program: UncheckedAccount<'info>,
    /// CHECK:
    #[account()]
    pub associated_token_program: UncheckedAccount<'info>,
    /// CHECK:
    #[account()]
    pub token_list: UncheckedAccount<'info>,
    /// CHECK: the trader account
    #[account(mut)]
    pub trader: UncheckedAccount<'info>,
    /// CHECK:
    #[account(mut)]
    pub airdrop_vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    /// CHECK: the token mint account
    #[account(mut)]
    pub token_mint: UncheckedAccount<'info>,
    /// CHECK: when calling the instruction
    #[account(mut)]
    pub swap_queue_entry: UncheckedAccount<'info>,
}

#[derive(Clone, AnchorDeserialize, AnchorSerialize)]
pub struct CallDexalotParams {
    sender: Pubkey,
    token_mint: Pubkey,
    transaction_type: Tx,
    nonce: [u8; 12],
    trader: Pubkey,
    quantity: u64,
    timestamp: u32,
    src_eid: u32,
}

pub fn call_dexalot_internal<'info>(
    ctx: &mut Context<'_, '_, '_, 'info, CallDexalot<'info>>,
    params: &CallDexalotParams,
) -> Result<()> {
    let xfer = XFERSolana::new(
        params.transaction_type.clone(),
        params.trader,
        params.token_mint,
        params.quantity,
        params.timestamp,
        nonce_to_custom_data(params.nonce),
        0,
    );

    let message = xfer.pack_xfer_message()?;

    let lz_receive_params = LzReceiveParams {
        src_eid: params.src_eid,
        sender: params.sender.key().to_bytes(),
        nonce: 0,
        guid: [0; 32],
        message: message,
        extra_data: vec![],
    };

    let call_dexalot_cpi_data = create_instruction_data(&lz_receive_params, "lz_receive")?;
    let call_dexalot_accounts = ctx.accounts.to_account_infos();
    let all_accounts = [call_dexalot_accounts, ctx.remaining_accounts.to_vec()].concat();

    let call_dexalot_accounts_metas: Vec<AccountMeta> = all_accounts
        .iter()
        .skip(1) // an account is skipped because it's dexalot program account
        .map(|account| AccountMeta {
            pubkey: *account.key,
            is_signer: account.is_signer,
            is_writable: account.is_writable,
        })
        .collect();
    // Invoke CPI quote
    invoke(
        &Instruction {
            program_id: ctx.accounts.dexalot_program.key(),
            accounts: call_dexalot_accounts_metas,
            data: call_dexalot_cpi_data,
        },
        &all_accounts,
    )?;
    Ok(())
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct LzReceiveParams {
    pub src_eid: u32,
    pub sender: [u8; 32],
    pub nonce: u64,
    pub guid: [u8; 32],
    pub message: Vec<u8>,
    pub extra_data: Vec<u8>,
}
