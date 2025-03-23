use anchor_lang::prelude::*;
use sha2::{Digest, Sha256};

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
    let discriminator = &hash[..8];

    let serialized_data = params.try_to_vec()?;

    let mut instruction_data = Vec::with_capacity(8 + serialized_data.len());
    instruction_data.extend_from_slice(discriminator);
    instruction_data.extend_from_slice(&serialized_data);

    Ok(instruction_data)
}

pub fn nonce_to_custom_data(nonce: [u8; 12]) -> [u8; 18] {
    let mut custom_data = [0u8; 18];
    custom_data[6..].copy_from_slice(&nonce); // Copy 12 bytes to the end, leaving first 6 bytes as zeros
    custom_data
}
