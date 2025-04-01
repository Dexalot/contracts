use anchor_lang::prelude::*;

use crate::state::MessagingReceipt;

#[derive(Accounts)]
#[instruction(params: SendParams)]
pub struct Send<'info> {
    pub sender: Signer<'info>,
    /// CHECK: assert this program in assert_send_library()
    pub send_library_program: UncheckedAccount<'info>,
    /// CHECK:
    #[account()]
    pub send_library_config: UncheckedAccount<'info>,
    /// CHECK:
    #[account()]
    pub default_send_library_config: UncheckedAccount<'info>,
    /// The PDA signer to the send library when the endpoint calls the send library.
    ///  /// CHECK:
    #[account()]
    pub send_library_info: UncheckedAccount<'info>,
    /// CHECK:
    #[account()]
    pub endpoint: UncheckedAccount<'info>,
    /// CHECK:
    #[account()]
    pub nonce: UncheckedAccount<'info>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct SendParams {
    pub dst_eid: u32,
    pub receiver: [u8; 32],
    pub message: Vec<u8>,
    pub options: Vec<u8>,
    pub native_fee: u64,
    pub lz_token_fee: u64,
}

pub fn send<'c: 'info, 'info>(
    _ctx: &mut Context<'_, '_, 'c, 'info, Send<'info>>,
    _params: &SendParams,
) -> Result<MessagingReceipt> {
    Ok(MessagingReceipt::default())
}
