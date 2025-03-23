use anchor_lang::prelude::*;

use crate::state::MessagingFee;

#[derive(Accounts)]
#[instruction(params: QuoteParams)]
pub struct Quote<'info> {
    /// CHECK: assert this program in assert_send_library()
    pub send_library_program: UncheckedAccount<'info>,
    /// CHECK:
    #[account()]
    pub send_library_config: UncheckedAccount<'info>,
    /// CHECK:
    #[account()]
    pub default_send_library_config: UncheckedAccount<'info>,
    /// CHECK:
    /// The PDA signer to the send library when the endpoint calls the send library.
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
pub struct QuoteParams {
    pub sender: Pubkey,
    pub dst_eid: u32,
    pub receiver: [u8; 32],
    pub message: Vec<u8>,
    pub options: Vec<u8>,
    pub pay_in_lz_token: bool,
}

pub fn quote<'c: 'info, 'info>(
    _ctx: &Context<'_, '_, 'c, 'info, Quote<'info>>,
    _params: &QuoteParams,
) -> Result<MessagingFee> {
    Ok(MessagingFee::default())
}
