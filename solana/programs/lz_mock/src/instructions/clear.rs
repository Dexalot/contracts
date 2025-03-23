use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: ClearParams)]
pub struct Clear<'info> {
    /// CHECK
    pub signer: UncheckedAccount<'info>,
    /// CHECK
    #[account()]
    pub oapp_registry: UncheckedAccount<'info>,
    /// CHECK
    #[account()]
    pub nonce: UncheckedAccount<'info>,
    /// CHECK
    #[account()]
    pub payload_hash: UncheckedAccount<'info>,
    /// CHECK
    #[account()]
    pub endpoint: UncheckedAccount<'info>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct ClearParams {
    pub receiver: Pubkey,
    pub src_eid: u32,
    pub sender: [u8; 32],
    pub nonce: u64,
    pub guid: [u8; 32],
    pub message: Vec<u8>,
}

pub fn clear(_ctx: &mut Context<Clear>, _params: &ClearParams) -> Result<[u8; 32]> {
    Ok([0; 32])
}
