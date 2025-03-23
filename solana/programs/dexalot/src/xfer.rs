use anchor_lang::prelude::*;

use crate::{consts::XFER_SIZE, errors::DexalotError};

/// Rust equivalent of Dexalot's XFER Solidity struct
/// The specific type mappings are left as comments next to the struct
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
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

    pub fn _pack_xfer_message(&self) -> Result<Vec<u8>> {
        let mut slot0 = [0u8; 32]; // 18 (custom_data) | 4 (timestamp) | 8 (nonce)  | 1 (Tx) | 1 (XChainMsgType)
        let mut slot1 = [0u8; 32]; // 32 (trader)
        let mut slot2 = [0u8; 32]; // 32 (token_mint)
        let mut slot3 = [0u8; 8]; // 8 (quantity)

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

    pub fn unpack_xfer_message(payload: &[u8]) -> Result<XFERSolana> {
        if payload.len() != XFER_SIZE {
            return err!(DexalotError::XFERError);
        }

        let mut slot0 = [0u8; 32];
        slot0.copy_from_slice(&payload[0..32]);
        let mut slot1 = [0u8; 32];
        slot1.copy_from_slice(&payload[32..64]);
        let mut slot2 = [0u8; 32];
        slot2.copy_from_slice(&payload[64..96]);
        let mut slot3 = [0u8; 8];
        slot3.copy_from_slice(&payload[96..104]);

        let mut custom_data = [0u8; 18];
        custom_data.copy_from_slice(&slot0[..18]);
        let timestamp = u32::from_be_bytes(
            slot0[18..22]
                .try_into()
                .map_err(|_| DexalotError::XFERError)?,
        );
        let nonce = u64::from_be_bytes(
            slot0[22..30]
                .try_into()
                .map_err(|_| DexalotError::XFERError)?,
        );
        let transaction = Tx::try_from(slot0[30])?;
        let message_type = XChainMsgType::try_from(slot0[31])?;

        let trader = Pubkey::new_from_array(slot1);
        let token_mint = Pubkey::new_from_array(slot2);
        let quantity = u64::from_be_bytes(slot3);

        Ok(XFERSolana {
            nonce,
            transaction,
            trader,
            token_mint,
            quantity,
            timestamp,
            custom_data,
            message_type,
        })
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
#[repr(u8)]
pub enum Tx {
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
            _ => err!(DexalotError::XFERError),
        }
    }
}

#[repr(u8)]
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum XChainMsgType {
    XFER,
}

impl TryFrom<u8> for XChainMsgType {
    type Error = Error;

    fn try_from(value: u8) -> std::result::Result<Self, Self::Error> {
        match value {
            0 => Ok(XChainMsgType::XFER),
            _ => err!(DexalotError::XFERError),
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct XFER {
    pub custom_data: [u8; 18],
    pub timestamp: u32,
    pub nonce: u64,
    pub transaction: Tx,
    pub message_type: XChainMsgType,
    pub trader: [u8; 32],
    pub symbol: [u8; 32],
    pub quantity: u64,
}

impl XFER {
    pub fn new(
        transaction: Tx,
        trader: [u8; 32],
        symbol: [u8; 32],
        quantity: u64,
        timestamp: u32,
        custom_data: [u8; 18],
        nonce: u64,
    ) -> Self {
        Self {
            custom_data,
            timestamp,
            nonce,
            transaction,
            message_type: XChainMsgType::XFER,
            trader,
            symbol,
            quantity,
        }
    }

    pub fn pack_xfer_message(&self) -> Result<Vec<u8>> {
        let mut slot0 = [0u8; 32]; // 18 (custom_data) | 4 (timestamp) | 8 (nonce)  | 1 (Tx) | 1 (XChainMsgType)
        let mut slot1 = [0u8; 32]; // 32 (trader)
        let mut slot2 = [0u8; 32]; // 32 (symbol)
        let mut slot3 = [0u8; 32]; // 32 (quantity)

        slot0[0..18].copy_from_slice(&self.custom_data);
        slot0[18..22].copy_from_slice(&self.timestamp.to_be_bytes());
        slot0[22..30].copy_from_slice(&self.nonce.to_be_bytes());
        slot0[30] = self.transaction.clone() as u8;
        slot0[31] = self.message_type.clone() as u8;

        slot1.copy_from_slice(&self.trader);
        slot2.copy_from_slice(&self.symbol);

        let quantity_bytes32 = pad_u64_to_32_bytes(self.quantity);
        slot3.copy_from_slice(&quantity_bytes32);

        Ok([
            slot0.to_vec(),
            slot1.to_vec(),
            slot2.to_vec(),
            slot3.to_vec(),
        ]
        .concat())
    }
}

fn pad_u64_to_32_bytes(n: u64) -> [u8; 32] {
    let mut padded = [0u8; 32]; // Create a 32-byte array filled with zeros
    let bytes = n.to_be_bytes(); // Convert u64 to big-endian byte array (8 bytes)
    padded[32 - bytes.len()..].copy_from_slice(&bytes); // Copy u64 bytes to the end
    padded
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pack_xfer_message() {
        let transaction = Tx::Deposit;
        let trader = Pubkey::new_unique();
        let token_mint = Pubkey::default();
        let quantity = 40u64;
        let timestamp = 1627545600;
        let custom_data = [0u8; 18];
        let xfer = XFERSolana::new(
            transaction,
            trader,
            token_mint,
            quantity,
            timestamp,
            custom_data,
            0,
        );

        let packed_message = xfer._pack_xfer_message().unwrap();
        assert_eq!(packed_message.len(), XFER_SIZE);
    }

    #[test]
    fn test_pack_unpack_xfer_message() {
        let transaction = Tx::Deposit;
        let trader = Pubkey::new_unique();
        let token_mint = Pubkey::default();
        let quantity = 40u64;
        let timestamp = 1627545600;
        let custom_data = [0u8; 18];
        let xfer = XFERSolana::new(
            transaction,
            trader,
            token_mint,
            quantity,
            timestamp,
            custom_data,
            0,
        );

        let packed_message = xfer._pack_xfer_message().unwrap();
        let unpacked_xfer = XFERSolana::unpack_xfer_message(&packed_message).unwrap();

        assert_eq!(xfer.custom_data, unpacked_xfer.custom_data);
        assert_eq!(xfer.transaction, unpacked_xfer.transaction);
        assert_eq!(xfer.trader, unpacked_xfer.trader);
        assert_eq!(xfer.quantity, unpacked_xfer.quantity);
        assert_eq!(xfer.timestamp, unpacked_xfer.timestamp);
        assert_eq!(xfer.message_type, unpacked_xfer.message_type);
        assert_eq!(xfer.token_mint, unpacked_xfer.token_mint); // Most important assertion as we are checking the unpacked symbol with the original pre-padding symbol
        assert_eq!(xfer.nonce, unpacked_xfer.nonce);
    }

    #[test]
    fn test_pack_unpack_xfer_message_wrong_length() {
        let result = XFERSolana::unpack_xfer_message(&[0u8; 100]);
        assert_eq!(result.unwrap_err(), DexalotError::XFERError.into());
    }

    #[test]
    fn test_tx_try_from_variants() {
        assert_eq!(Tx::try_from(0).unwrap(), Tx::Withdraw);
        assert_eq!(Tx::try_from(1).unwrap(), Tx::Deposit);
        assert_eq!(Tx::try_from(2).unwrap(), Tx::Execution);
        assert_eq!(Tx::try_from(3).unwrap(), Tx::IncreaseAvail);
        assert_eq!(Tx::try_from(4).unwrap(), Tx::DecreaseAvail);
        assert_eq!(Tx::try_from(5).unwrap(), Tx::IxferSent);
        assert_eq!(Tx::try_from(6).unwrap(), Tx::IxferRec);
        assert_eq!(Tx::try_from(7).unwrap(), Tx::RecoverFunds);
        assert_eq!(Tx::try_from(8).unwrap(), Tx::AddGas);
        assert_eq!(Tx::try_from(9).unwrap(), Tx::RemoveGas);
        assert_eq!(Tx::try_from(10).unwrap(), Tx::AutoFill);
        assert_eq!(Tx::try_from(11).unwrap(), Tx::CCTrade);
        assert_eq!(Tx::try_from(12).unwrap(), Tx::ConvertFrom);
        assert_eq!(Tx::try_from(13).unwrap(), Tx::ConvertTo);
        assert!(Tx::try_from(255).is_err());
    }
}
