use anchor_lang::prelude::*;

use crate::errors::AnchorError;

/// Rust equivalent of Dexalot's XFER Solidity struct
/// The specific type mappings are left as comments next to the struct
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct XFERSolana {
    pub nonce: u64,                  // uint64 -> u64
    pub transaction: Tx,             // IPortfolio.Tx -> Tx (u8 repr)
    pub trader: Pubkey,              // address -> Pubkey
    pub token_mint: Pubkey,          // bytes32 -> [u8; 32]
    pub quantity: u64,               // uint64
    pub timestamp: u32,              // uint256 -> u32
    pub custom_data: [u8; 18],       // bytes18 -> [u8; 18]
    pub message_type: XChainMsgType, // IPortfolio.XChainMsgType -> XChainMsgType (u8 repr)
}

impl XFERSolana {
    pub fn new(
        transaction: Tx,
        trader: Pubkey,
        token_mint: Pubkey,
        quantity: u64,
        timestamp: u32,
        custom_data: [u8; 18],
        nonce: u64,
    ) -> Self {
        XFERSolana {
            nonce,
            transaction,
            trader,
            token_mint,
            quantity,
            timestamp,
            custom_data,
            message_type: XChainMsgType::XFER,
        }
    }

    pub fn pack_xfer_message(&self) -> Result<Vec<u8>> {
        let mut slot0 = [0u8; 32];
        let mut slot1 = [0u8; 32];
        let mut slot2 = [0u8; 32];
        let mut slot3 = [0u8; 8];

        slot0[0..18].copy_from_slice(&self.custom_data);
        slot0[18..22].copy_from_slice(&self.timestamp.to_be_bytes());
        slot0[22..30].copy_from_slice(&self.nonce.to_be_bytes());
        slot0[30] = self.transaction.clone() as u8;
        slot0[31] = self.message_type.clone() as u8;

        slot1.copy_from_slice(&self.trader.to_bytes());
        slot2.copy_from_slice(&self.token_mint.as_ref());
        slot3.copy_from_slice(&self.quantity.to_be_bytes());

        Ok([
            slot0.to_vec(),
            slot1.to_vec(),
            slot2.to_vec(),
            slot3.to_vec(),
        ]
        .concat())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Default)]
#[repr(u8)]
pub enum Tx {
    #[default]
    Withdraw,
    Deposit,
    Execution,
    IncreaseAvail,
    DecreaseAvail,
    IxferSent,    // Subnet Sent. I for Internal to Subnet
    IxferRec,     // Subnet Received. I for Internal to Subnet
    RecoverFunds, // Obsolete as of 2/1/2024 CD
    AddGas,
    RemoveGas,
    AutoFill,
    CCTrade, // Cross Chain Trade.
    ConvertFrom,
    ConvertTo,
}

impl TryFrom<u8> for Tx {
    type Error = Error;

    fn try_from(value: u8) -> std::result::Result<Self, Self::Error> {
        match value {
            0 => Ok(Tx::Withdraw),
            1 => Ok(Tx::Deposit),
            2 => Ok(Tx::Execution),
            3 => Ok(Tx::IncreaseAvail),
            4 => Ok(Tx::DecreaseAvail),
            5 => Ok(Tx::IxferSent),
            6 => Ok(Tx::IxferRec),
            7 => Ok(Tx::RecoverFunds),
            8 => Ok(Tx::AddGas),
            9 => Ok(Tx::RemoveGas),
            10 => Ok(Tx::AutoFill),
            11 => Ok(Tx::CCTrade),
            12 => Ok(Tx::ConvertFrom),
            13 => Ok(Tx::ConvertTo),
            _ => err!(AnchorError::XFERError),
        }
    }
}

#[repr(u8)]
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Default)]
pub enum XChainMsgType {
    #[default]
    XFER,
}

impl TryFrom<u8> for XChainMsgType {
    type Error = Error;

    fn try_from(value: u8) -> std::result::Result<Self, Self::Error> {
        match value {
            0 => Ok(XChainMsgType::XFER),
            _ => err!(AnchorError::XFERError),
        }
    }
}
