#![cfg(test)]
use anchor_lang::prelude::*;
use anchor_spl::token::spl_token;
use libsecp256k1::{sign, Message, SecretKey};
use solana_program::keccak::hash;
use crate::consts::UNUSED_ADDRESS_PRIVATE_KEY;
use spl_token::state::{Account as SplAccount, AccountState};
use anchor_lang::solana_program::program_option::COption;
use anchor_lang::solana_program::program_pack::Pack;

/// Creates an `AccountInfo` instance for testing purposes.
/// This helper is only compiled when running tests.
pub fn create_account_info<'a>(
    key: &'a Pubkey,
    is_signer: bool,
    is_writable: bool,
    lamports: &'a mut u64,
    data: &'a mut Vec<u8>,
    owner: &'a Pubkey,
    executable: bool,
    discriminator: Option<[u8; 8]>,
) -> AccountInfo<'a> {
    if let Some(disc) = discriminator {
        if data.len() < 8 || &data[..8] != disc.as_ref() {
            let mut new_data = disc.to_vec();
            new_data.extend_from_slice(&data);
            *data = new_data;
        }
    }
    AccountInfo::new(key, is_signer, is_writable, lamports, data, owner, executable, 0)
}

/// Handy function for initializing a bulk of account, mostly used for filling up remaining accounts
pub fn create_dummy_account(program_id: &'static Pubkey) -> AccountInfo<'static> {
    let key: &'static Pubkey = Box::leak(Box::new(Pubkey::new_unique()));
    let lamports: &'static mut u64 = Box::leak(Box::new(100));
    let data: &'static mut Vec<u8> = Box::leak(Box::new(vec![0u8; 10]));
    create_account_info(key, false, true, lamports, data, program_id, false, None)
}

/// Generates a valid signature only for the test consts public/private key combination
pub fn generate_valid_signature(message: &[u8]) -> [u8; 65] {
    let hash = hash(message);
    let msg = Message::parse_slice(&hash.0).expect("Message must be 32 bytes");

    let sk_bytes = hex::decode(UNUSED_ADDRESS_PRIVATE_KEY)
        .expect("Valid hex for secret key");
    let sk = SecretKey::parse_slice(&sk_bytes).expect("Secret key must be 32 bytes");

    let (signature, recid) = sign(&msg, &sk);
    let mut sig_bytes = [0u8; 65];
    sig_bytes[..64].copy_from_slice(&signature.serialize());
    sig_bytes[64] = recid.serialize();
    sig_bytes
}

/// Handy function for initializing Account<TokeAccount> as a byte[]
pub fn create_packed_token_account(
    mint: Pubkey,
    owner: Pubkey,
    amount: u64,
) -> Result<Vec<u8>> {
    let account_len = spl_token::state::Account::LEN;
    let mut data = vec![0u8; account_len];
    let token_account = SplAccount {
        mint,
        owner,
        amount,
        delegate: COption::None,
        state: AccountState::Initialized,
        is_native: COption::None,
        delegated_amount: 0,
        close_authority: COption::None,
    };
    SplAccount::pack(token_account, &mut data[..])?;
    Ok(data)
}