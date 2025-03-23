use anchor_lang::prelude::*;

#[error_code]
#[derive(AnchorSerialize, AnchorDeserialize, PartialEq)]
pub enum AnchorError {
    #[msg("XFER error occurred")]
    XFERError,
}
