use anchor_lang::prelude::*;

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct RegisterOAppParams {
    pub delegate: Pubkey,
}

#[derive(Accounts)]
#[instruction(params: RegisterOAppParams)]
pub struct RegisterOApp<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// The PDA of the OApp
    pub oapp: Signer<'info>,
    /// CHECK:
    pub oapp_registry: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn register_oapp(mut _ctx: Context<RegisterOApp>, _params: RegisterOAppParams) -> Result<()> {
    Ok(())
}
