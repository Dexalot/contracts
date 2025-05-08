use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::consts::SPL_VAULT_SEED;

pub fn create_ata(_ctx: &Context<CreateATA>) -> Result<()> {
    Ok(())
}

#[derive(Accounts)]
pub struct CreateATA<'info> {
    pub system_program: Program<'info, System>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub mint: Account<'info, Mint>,
    /// CHECK: before calling
    #[account(init_if_needed, payer=payer, space = 0, owner = system_program.key())]
    user: AccountInfo<'info>,
    /// CHECK: the spl_vault
    #[account(
        seeds = [SPL_VAULT_SEED],
        bump,
    )]
    pub spl_vault: AccountInfo<'info>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = spl_vault
    )]
    pub portfolio_ata: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = user
    )]
    pub user_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}
