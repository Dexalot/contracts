use crate::errors::DexalotError;
use anchor_lang::{
    prelude::*,
    solana_program::{
        program::invoke_signed, system_instruction, system_program::ID as SYSTEM_PREOGRAM_ID,
    },
    Discriminator,
};
use std::{fmt::Debug, io::Cursor};

/// Creates a new entry in a map-like data structure
///
/// # Arguments
/// * `payer` - Account that will pay for the storage
/// * `entry_info` - The account to store the entry in
/// * `entry_data` - The data to store
/// * `entry_size` - Size of the entry in bytes
/// * `base_map_seed` - Base seed for PDA derivation
/// * `entry_map_seed` - Entry-specific seed for PDA derivation
/// * `program_id` - Program ID owning the PDA
/// * `system_program` - System program for account creation
/// * `payer_seeds` - Optional seeds if payer is a PDA
///
/// # Errors
/// Returns error if:
/// - Entry already exists
/// - Invalid PDA
/// - Account creation fails
pub fn create_entry<'info, T>(
    payer: &AccountInfo<'info>,
    entry_info: &AccountInfo<'info>,
    entry_data: &T,
    entry_size: usize,
    base_map_seed: &[u8],
    entry_map_seed: &[u8],
    program_id: &Pubkey,
    system_program: &Program<'info, System>,
    payer_seeds: Option<&[&[u8]]>,
) -> Result<()>
where
    T: AnchorDeserialize + AnchorSerialize + Discriminator + Debug,
{
    require!(
        entry_info.data_is_empty(),
        DexalotError::MapEntryAlreadyCreated
    );
    let required_lamports = if cfg!(not(test)) {
        let rent = Rent::get()?;
        rent.minimum_balance(entry_size)
    } else {
        0
    };
    let entry_seeds = &[base_map_seed, entry_map_seed];

    let (pda, bump) = Pubkey::find_program_address(entry_seeds, program_id);
    require_keys_eq!(
        pda,
        *entry_info.key,
        DexalotError::InvalidPDA
    );

    let create_ix = system_instruction::create_account(
        &payer.key(),
        entry_info.key,
        required_lamports,
        entry_size as u64,
        program_id,
    );

    let complete_signer_seeds: &[&[u8]] = &[base_map_seed, entry_map_seed, &[bump]];
    let mut signers_seeds = vec![complete_signer_seeds];

    // add payer seeds
    if let Some(payer_seeds) = payer_seeds {
        signers_seeds.push(payer_seeds);
    }

    if cfg!(not(test)) {
        invoke_signed(
            &create_ix,
            &[
                payer.to_account_info(),
                entry_info.clone(),
                system_program.to_account_info(),
            ],
            &signers_seeds,
        )?;

        let mut data = entry_info.try_borrow_mut_data()?;
        let disc = T::discriminator();
        data[..8].copy_from_slice(&disc);

        let mut cursor = Cursor::new(&mut data[8..]);
        entry_data.serialize(&mut cursor)?;
    }
    Ok(())
}

/// Checks if an entry exists in the map
///
/// # Arguments
/// * `entry_info` - The account to check
///
/// # Returns
/// `true` if the entry exists and is owned by the program,
/// `false` otherwise
pub fn entry_exists<'info>(entry_info: &AccountInfo<'info>) -> bool {
    !entry_info.data_is_empty() && entry_info.owner != &SYSTEM_PREOGRAM_ID
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::solana_program::{pubkey::Pubkey, system_program};
    use crate::test_utils::create_account_info;

    #[derive(AnchorSerialize, AnchorDeserialize, Debug, PartialEq)]
    struct TestEntry {
        value: u64,
    }
    impl Discriminator for TestEntry {
        const DISCRIMINATOR: [u8; 8] = [1, 2, 3, 4, 5, 6, 7, 8];
    }

    #[test]
    fn test_create_entry() -> Result<()> {
        let program_id = crate::id();
        let base_map_seed = b"base";
        let entry_map_seed = b"entry";

        let (pda, _bump) = Pubkey::find_program_address(&[base_map_seed, entry_map_seed], &program_id);

        let payer_key = Pubkey::new_unique();
        let mut payer_lamports = 1000;
        let mut payer_data = vec![0u8; 50];
        let payer = create_account_info(&payer_key, true, true, &mut payer_lamports, &mut payer_data, &program_id, false, None);

        let mut entry_data_vec = vec![];
        let mut entry_lamports = 0;
        let entry_info = create_account_info(
            &pda,
            false,
            true,
            &mut entry_lamports,
            &mut entry_data_vec,
            &program_id,
            false,
            None);

        let sys_key = system_program::ID;
        let mut sys_lamports = 0;
        let mut sys_data = vec![];
        let system_program_ai = create_account_info(
            &sys_key,
            false,
            false,
            &mut sys_lamports,
            &mut sys_data,
            &sys_key,
            true,
            None
        );

        let system_program = Program::try_from(&system_program_ai)?;

        let test_entry = TestEntry { value: 42 };
        let result = create_entry(
            &payer,
            &entry_info,
            &test_entry,
            100,
            base_map_seed,
            entry_map_seed,
            &program_id,
            &system_program,
            Some(&[&[0u8; 10]]),
        );

        assert!(result.is_ok());
        Ok(())
    }

    #[test]
    fn test_create_entry_negative_cases() -> Result<()> {
        let program_id = crate::id();
        let base_map_seed = b"base";
        let entry_map_seed = b"entry";

        let payer_key = Pubkey::new_unique();
        let mut payer_lamports = 1000;
        let mut payer_data = vec![0u8; 50];
        let payer = create_account_info(&payer_key, true, true, &mut payer_lamports, &mut payer_data, &program_id, false, None);

        let mut entry_data_vec = vec![];
        let mut entry_lamports = 0;
        let entry_info = create_account_info(
            &program_id,
            false,
            true,
            &mut entry_lamports,
            &mut entry_data_vec,
            &program_id,
            false,
            None);

        let sys_key = system_program::ID;
        let mut sys_lamports = 0;
        let mut sys_data = vec![];
        let system_program_ai = create_account_info(
            &sys_key,
            false,
            false,
            &mut sys_lamports,
            &mut sys_data,
            &sys_key,
            true,
            None
        );

        let system_program = Program::try_from(&system_program_ai)?;

        let test_entry = TestEntry { value: 42 };
        let result = create_entry(
            &payer,
            &entry_info,
            &test_entry,
            100,
            base_map_seed,
            entry_map_seed,
            &program_id,
            &system_program,
            Some(&[&[0u8; 10]]),
        );

        assert_eq!(result.unwrap_err(), DexalotError::InvalidPDA.into());

        let mut entry_data_vec = vec![0u8; 100];
        let mut entry_lamports = 0;
        let entry_info = create_account_info(
            &program_id,
            false,
            true,
            &mut entry_lamports,
            &mut entry_data_vec,
            &program_id,
            false,
            None);
        let result = create_entry(
            &payer,
            &entry_info,
            &test_entry,
            100,
            base_map_seed,
            entry_map_seed,
            &program_id,
            &system_program,
            None,
        );

        assert_eq!(result.unwrap_err(), DexalotError::MapEntryAlreadyCreated.into());
        Ok(())
    }
}

