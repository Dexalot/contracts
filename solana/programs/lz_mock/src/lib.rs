mod instructions;
mod state;
use crate::state::MessagingFee;
use crate::state::MessagingReceipt;
use anchor_lang::prelude::*;
use instructions::*;
declare_id!("76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6");

#[program]
pub mod lz_mock {

    use super::*;

    pub fn register_oapp(ctx: Context<RegisterOApp>, params: RegisterOAppParams) -> Result<()> {
        instructions::register_oapp(ctx, params)
    }

    pub fn send<'c: 'info, 'info>(
        mut ctx: Context<'_, '_, 'c, 'info, Send<'info>>,
        params: SendParams,
    ) -> Result<MessagingReceipt> {
        instructions::send(&mut ctx, &params)
    }

    pub fn quote<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, Quote<'info>>,
        params: QuoteParams,
    ) -> Result<MessagingFee> {
        instructions::quote(&ctx, &params)
    }

    pub fn clear(mut ctx: Context<Clear>, params: ClearParams) -> Result<[u8; 32]> {
        instructions::clear(&mut ctx, &params)
    }
}
