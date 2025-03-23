use anchor_lang::prelude::*;

pub fn create_account(_ctx: &Context<CreateAccount>) -> Result<()> {
    Ok(())
}

#[derive(Accounts)]
pub struct CreateAccount<'info> {
    pub system_program: Program<'info, System>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: before calling
    #[account(init_if_needed, payer=payer, space = 0, owner = system_program.key())]
    user: AccountInfo<'info>,
}
