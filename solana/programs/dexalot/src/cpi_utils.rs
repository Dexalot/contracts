use anchor_lang::prelude::*;
use sha2::{Digest, Sha256};

use crate::{
    consts::{
        ANCHOR_DISCRIMINATOR, ENDPOINT_SEED, EVENT_SEED, NONCE_SEED, OAPP_SEED, PAYLOAD_HASH_SEED,
    },
    instructions::LzAccount,
};

pub fn create_instruction_data<T>(params: &T, instruction_name: &str) -> Result<Vec<u8>>
where
    T: Clone + AnchorSerialize + AnchorDeserialize,
{
    const PREFIX: &str = "global:";
    let full_len = PREFIX.len() + instruction_name.len();
    let mut instruction_full_name = Vec::with_capacity(full_len);
    instruction_full_name.extend_from_slice(PREFIX.as_bytes());
    instruction_full_name.extend_from_slice(instruction_name.as_bytes());

    let hash = Sha256::new()
        .chain_update(&instruction_full_name)
        .finalize();
    let discriminator = &hash[..ANCHOR_DISCRIMINATOR];

    let serialized_data = params.try_to_vec()?;

    let mut instruction_data = Vec::with_capacity(ANCHOR_DISCRIMINATOR + serialized_data.len());
    instruction_data.extend_from_slice(discriminator);
    instruction_data.extend_from_slice(&serialized_data);

    Ok(instruction_data)
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize, Debug, PartialEq)]
pub struct EndpointSendParams {
    pub dst_eid: u32,
    pub receiver: [u8; 32],
    pub message: Vec<u8>,
    pub options: Vec<u8>,
    pub native_fee: u64,
    // Should always be 0
    pub lz_token_fee: u64,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize, Debug, PartialEq)]
pub struct RegisterOAppParams {
    pub delegate: Pubkey,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize, Debug, PartialEq)]
pub struct EndpointQuoteParams {
    pub sender: Pubkey,
    pub dst_eid: u32,
    pub receiver: [u8; 32],
    pub message: Vec<u8>,
    pub options: Vec<u8>,
    // Always false
    pub pay_in_lz_token: bool,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize, Default, Debug, PartialEq)]
pub struct MessagingFee {
    pub native_fee: u64,
    // Should always be 0
    pub lz_token_fee: u64,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize, Debug, PartialEq)]
pub struct ClearParams {
    pub receiver: Pubkey,
    pub src_eid: u32,
    pub sender: [u8; 32],
    pub nonce: u64,
    pub guid: [u8; 32],
    pub message: Vec<u8>,
}

#[inline(never)]
pub fn get_accounts_for_clear(
    endpoint_program: Pubkey,
    receiver: &Pubkey,
    src_eid: u32,
    sender: &[u8; 32],
    nonce: u64,
) -> Vec<LzAccount> {
    let (nonce_account, _) = Pubkey::find_program_address(
        &[
            NONCE_SEED,
            &receiver.to_bytes(),
            &src_eid.to_be_bytes(),
            sender,
        ],
        &endpoint_program,
    );

    let (payload_hash_account, _) = Pubkey::find_program_address(
        &[
            PAYLOAD_HASH_SEED,
            &receiver.to_bytes(),
            &src_eid.to_be_bytes(),
            sender,
            &nonce.to_be_bytes(),
        ],
        &endpoint_program,
    );

    let (oapp_registry_account, _) =
        Pubkey::find_program_address(&[OAPP_SEED, &receiver.to_bytes()], &endpoint_program);
    let (event_authority_account, _) =
        Pubkey::find_program_address(&[EVENT_SEED], &endpoint_program);
    let (endpoint_settings_account, _) =
        Pubkey::find_program_address(&[ENDPOINT_SEED], &endpoint_program);

    vec![
        LzAccount {
            pubkey: endpoint_program,
            is_signer: false,
            is_writable: false,
        },
        LzAccount {
            pubkey: *receiver,
            is_signer: false,
            is_writable: false,
        },
        LzAccount {
            pubkey: oapp_registry_account,
            is_signer: false,
            is_writable: false,
        },
        LzAccount {
            pubkey: nonce_account,
            is_signer: false,
            is_writable: true,
        },
        LzAccount {
            pubkey: payload_hash_account,
            is_signer: false,
            is_writable: true,
        },
        LzAccount {
            pubkey: endpoint_settings_account,
            is_signer: false,
            is_writable: true,
        },
        LzAccount {
            pubkey: event_authority_account,
            is_signer: false,
            is_writable: false,
        },
        LzAccount {
            pubkey: endpoint_program,
            is_signer: false,
            is_writable: false,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};

    const TEST_ANCHOR_DISCRIMINATOR: usize = 8;

    #[derive(Clone, AnchorSerialize, AnchorDeserialize, PartialEq, Debug)]
    struct TestParams {
        a: u8,
        b: u16,
    }

    #[test]
    fn test_create_instruction_data_success() {
        let params = TestParams { a: 42, b: 1337 };
        let instruction_name = "test_instruction";

        let result = create_instruction_data(&params, instruction_name).unwrap();

        let mut full_name = b"global:".to_vec();
        full_name.extend_from_slice(instruction_name.as_bytes());
        let hash = Sha256::new().chain_update(&full_name).finalize();
        let expected_discriminator = &hash[..TEST_ANCHOR_DISCRIMINATOR];

        let expected_serialized = params.try_to_vec().unwrap();

        let mut expected = Vec::with_capacity(TEST_ANCHOR_DISCRIMINATOR + expected_serialized.len());
        expected.extend_from_slice(expected_discriminator);
        expected.extend_from_slice(&expected_serialized);

        assert_eq!(result, expected);
    }

    #[test]
    fn test_get_accounts_for_clear() {
        let endpoint_program = Pubkey::new_unique();
        let receiver = Pubkey::new_unique();
        let src_eid: u32 = 1234;
        let sender: [u8; 32] = [1; 32];
        let nonce: u64 = 42;

        let accounts = get_accounts_for_clear(endpoint_program, &receiver, src_eid, &sender, nonce);

        assert_eq!(accounts.len(), 8);

        assert_eq!(accounts[0].pubkey, endpoint_program);
        assert!(!accounts[0].is_signer);
        assert!(!accounts[0].is_writable);

        assert_eq!(accounts[1].pubkey, receiver);
        assert!(!accounts[1].is_signer);
        assert!(!accounts[1].is_writable);

        assert!(!accounts[2].is_signer);
        assert!(!accounts[2].is_writable);

        assert!(accounts[3].is_writable);

        assert!(accounts[4].is_writable);

        assert!(accounts[5].is_writable);

        assert!(!accounts[6].is_writable);

        assert_eq!(accounts[7].pubkey, endpoint_program);
    }

    #[test]
    fn test_struct_serialization() {
        let send_params = EndpointSendParams {
            dst_eid: 1,
            receiver: [2; 32],
            message: vec![3, 4, 5],
            options: vec![6, 7],
            native_fee: 100,
            lz_token_fee: 0,
        };
        let serialized = send_params.try_to_vec().unwrap();
        let deserialized = EndpointSendParams::try_from_slice(&serialized).unwrap();
        assert_eq!(send_params, deserialized);

        let delegate = Pubkey::new_unique();
        let reg_params = RegisterOAppParams { delegate };
        let serialized = reg_params.try_to_vec().unwrap();
        let deserialized = RegisterOAppParams::try_from_slice(&serialized).unwrap();
        assert_eq!(reg_params, deserialized);

        let sender = Pubkey::new_unique();
        let quote_params = EndpointQuoteParams {
            sender,
            dst_eid: 2,
            receiver: [8; 32],
            message: vec![9, 10],
            options: vec![11],
            pay_in_lz_token: false,
        };
        let serialized = quote_params.try_to_vec().unwrap();
        let deserialized = EndpointQuoteParams::try_from_slice(&serialized).unwrap();
        assert_eq!(quote_params, deserialized);

        let fee = MessagingFee {
            native_fee: 50,
            lz_token_fee: 0,
        };
        let serialized = fee.try_to_vec().unwrap();
        let deserialized = MessagingFee::try_from_slice(&serialized).unwrap();
        assert_eq!(fee, deserialized);

        let clear_params = ClearParams {
            receiver: Pubkey::new_unique(),
            src_eid: 3,
            sender: [4; 32],
            nonce: 7,
            guid: [5; 32],
            message: vec![6, 7, 8],
        };
        let serialized = clear_params.try_to_vec().unwrap();
        let deserialized = ClearParams::try_from_slice(&serialized).unwrap();
        assert_eq!(clear_params, deserialized);
    }
}
