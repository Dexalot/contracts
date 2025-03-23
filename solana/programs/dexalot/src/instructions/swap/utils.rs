use crate::{
    consts::{NATIVE_VAULT_MIN_THRESHOLD, SOL_VAULT_SEED, SPL_VAULT_SEED},
    errors::DexalotError,
    state::GlobalConfig,
};

use super::*;
use anchor_lang::{
    prelude::*,
    solana_program::{
        keccak,
        program::{invoke, invoke_signed},
        secp256k1_recover::secp256k1_recover,
        system_instruction,
    },
};
use anchor_spl::{
    associated_token,
    token::{self, spl_token, Token, TokenAccount, Transfer as SplTransfer},
};
use sha3::{Digest, Keccak256};

#[derive(Clone, AnchorDeserialize, AnchorSerialize)]
pub struct SwapData {
    // originating user
    pub taker: Pubkey,
    // aggregator or destination user
    pub dest_trader: Pubkey,
    pub dest_chain_id: u64,
    pub src_asset: Pubkey,
    pub dest_asset: Pubkey,
    pub src_amount: u64,
    pub dest_amount: u64,
    pub nonce: [u8; 12],
}

pub struct TakeFunds<'info> {
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub dest_trader: AccountInfo<'info>,
    pub taker: AccountInfo<'info>,
    pub sol_vault: SystemAccount<'info>,
    pub dest_trader_src_asset_ata: AccountInfo<'info>,
    pub taker_src_asset_ata: AccountInfo<'info>,
    pub spl_vault_src_asset_ata: AccountInfo<'info>,
}
impl<'info> TakeFunds<'info> {
    pub fn from_swap_context(ctx: &Context<Swap<'info>>) -> Self {
        Self {
            token_program: ctx.accounts.token_program.clone(),
            system_program: ctx.accounts.system_program.clone(),
            dest_trader: ctx.accounts.dest_trader.clone(),
            taker: ctx.accounts.taker.clone(),
            sol_vault: ctx.accounts.sol_vault.clone(),
            dest_trader_src_asset_ata: ctx.accounts.dest_trader_src_asset_ata.clone(),
            taker_src_asset_ata: ctx.accounts.taker_src_asset_ata.clone(),
            spl_vault_src_asset_ata: ctx.accounts.spl_vault_src_asset_ata.clone(),
        }
    }

    pub fn from_cross_swap_context(ctx: &Context<CrossSwap<'info>>) -> Self {
        Self {
            token_program: ctx.accounts.token_program.clone(),
            system_program: ctx.accounts.system_program.clone(),
            dest_trader: ctx.accounts.dest_trader.clone(),
            taker: ctx.accounts.taker.clone(),
            sol_vault: ctx.accounts.sol_vault.clone(),
            dest_trader_src_asset_ata: ctx.accounts.taker_src_asset_ata.clone(), // this value is not used so I just pass taker_src_asset_ata
            taker_src_asset_ata: ctx.accounts.taker_src_asset_ata.clone(),
            spl_vault_src_asset_ata: ctx.accounts.spl_vault_src_asset_ata.clone(),
        }
    }
}

/// Takes funds from a user for a swap
///
/// # Arguments
/// * `take_funds_accounts` - Accounts involved in taking funds
/// * `swap_data` - Swap operation details
/// * `is_aggregator` - Whether the operation is through an aggregator
///
/// # Errors
/// Returns error if:
/// - Insufficient balance
/// - Invalid vault owner
/// - Transfer fails
pub fn take_funds<'info>(
    take_funds_accounts: &TakeFunds<'info>,
    swap_data: &SwapData,
    is_aggregator: bool,
) -> Result<()> {
    if swap_data.src_asset == Pubkey::default() {
        let from = if is_aggregator {
            &take_funds_accounts.dest_trader
        } else {
            &take_funds_accounts.taker
        };
        let to = &take_funds_accounts.sol_vault;
        require!(
            from.lamports() >= swap_data.src_amount,
            DexalotError::NotEnoughNativeBalance
        );

        // Transfer the SOL from the user to the native vault
        let ix = system_instruction::transfer(&from.key(), &to.key(), swap_data.src_amount);
        if cfg!(not(test)) {
            invoke(
                &ix,
                &[
                    from.to_account_info(),
                    to.to_account_info(),
                    take_funds_accounts.system_program.to_account_info(),
                ],
            )?;
        }
    } else {
        msg!("SPL swap");
        let from = if is_aggregator {
            &take_funds_accounts.dest_trader_src_asset_ata
        } else {
            &take_funds_accounts.taker_src_asset_ata
        };
        let to = &take_funds_accounts.spl_vault_src_asset_ata;

        let authority = if is_aggregator {
            &take_funds_accounts.dest_trader // Use dest_trader as authority when in aggregator flow
        } else {
            &take_funds_accounts.taker // Use taker as authority in normal flow
        };

        let cpi_accounts = SplTransfer {
            from: from.to_account_info(),
            to: to.to_account_info(),
            authority: authority.to_account_info(),
        };
        let cpi_program = take_funds_accounts.token_program.to_account_info();

        if cfg!(not(test)) {
            token::transfer(
                CpiContext::new(cpi_program, cpi_accounts),
                swap_data.src_amount,
            )?;
        }
    }

    Ok(())
}

/// Releases funds to the destination trader
///
/// # Arguments
/// * `ctx` - Swap context containing all accounts
/// * `swap_data` - Swap operation details
///
/// # Errors
/// Returns error if:
/// - Insufficient balance
/// - Invalid vault owner
/// - Transfer fails
pub fn release_funds(ctx: &Context<Swap>, swap_data: &SwapData) -> Result<()> {
    let system_program = &ctx.accounts.system_program;
    let token_program = &ctx.accounts.token_program;

    if swap_data.dest_asset == Pubkey::default() {
        let from = &ctx.accounts.sol_vault;
        let to = &ctx.accounts.dest_trader;

        require!(
            from.lamports() >= swap_data.dest_amount + NATIVE_VAULT_MIN_THRESHOLD,
            DexalotError::NotEnoughNativeBalance
        );

        let bump = &[ctx.bumps.sol_vault];
        let seeds: &[&[u8]] = &[SOL_VAULT_SEED.as_ref(), bump];
        let signer_seeds = &[&seeds[..]];

        // Transfer the native SOL from the program to the user
        let ix = system_instruction::transfer(&from.key(), &to.key(), swap_data.dest_amount);
        if cfg!(not(test)) {
            invoke_signed(
                &ix,
                &[
                    from.to_account_info().clone(),
                    to.to_account_info().clone(),
                    system_program.to_account_info().clone(),
                ],
                signer_seeds, // sign with the PDA
            )?;
        }
    } else {
        // transfer destAsset from spl_vault to destTrader for destAmount
        let from = &ctx.accounts.spl_vault_dest_asset_ata;
        let to = &ctx.accounts.dest_trader_dest_asset_ata;
        let spl_vault = &ctx.accounts.spl_vault;

        let ix = spl_token::instruction::transfer(
            &token_program.key(),
            &from.key(),
            &to.key(),
            &spl_vault.key(),
            &[],
            swap_data.dest_amount,
        )?;

        let bump = &[ctx.bumps.spl_vault];
        let seeds: &[&[u8]] = &[SPL_VAULT_SEED.as_ref(), bump];
        let signer_seeds = &[&seeds[..]];

        // Transfer the tokens from the portfolio to the user
        if cfg!(not(test)) {
            invoke_signed(
                &ix,
                &[
                    from.to_account_info(),
                    to.to_account_info(),
                    spl_vault.to_account_info(),
                    token_program.to_account_info(),
                ],
                signer_seeds,
            )?;
        }
    }
    Ok(())
}

/// Verifies a secp256k1 signature for swap authorization
///
/// # Arguments
/// * `global_config` - Program's global configuration
/// * `message` - Message that was signed
/// * `signature_bytes` - The signature to verify
///
/// # Returns
/// `true` if signature is valid, `false` otherwise
pub fn verify_signature(
    global_config: &GlobalConfig,
    message: &[u8],
    signature_bytes: &[u8],
) -> Result<bool> {
    let swap_signer = global_config.swap_signer.as_ref();
    let message_hash = {
        let mut hasher = keccak::Hasher::default();
        hasher.hash(message);
        hasher.result()
    };

    let recovered_pubkey =
        secp256k1_recover(&message_hash.0, signature_bytes[64], &signature_bytes[..64])
            .map_err(|_| ProgramError::InvalidArgument)?;

    let mut hasher = keccak::Hasher::default();
    hasher.hash(&recovered_pubkey.0);
    let address = &hasher.result().0[12..];

    if address != swap_signer {
        return Ok(false);
    }
    Ok(true)
}

/// Generates a unique key for map entries using keccak256
///
/// # Arguments
/// * `nonce` - Unique nonce for the entry
/// * `dest_trader` - Destination trader's public key
///
/// # Returns
/// 32-byte array representing the unique key
pub fn generate_map_entry_key(nonce: [u8; 12], dest_trader: Pubkey) -> Result<[u8; 32]> {
    let mut hasher: sha2::digest::core_api::CoreWrapper<sha3::Keccak256Core> = Keccak256::new();
    hasher.update(nonce);
    hasher.update(dest_trader.as_ref());
    Ok(hasher.finalize().into())
}

/// Validates an Associated Token Account
///
/// # Arguments
/// * `ata` - The ATA to check
/// * `expected_owner` - Expected owner of the ATA
/// * `expected_mint_account` - Expected mint of the ATA
/// * `check_ata_key` - Whether to verify the ATA address
///
/// # Errors
/// Returns error if:
/// - Invalid owner
/// - Invalid mint
/// - Invalid ATA address (if check_ata_key is true)
pub fn check_ata_account(
    ata: &AccountInfo,
    expected_owner: &Pubkey,
    expected_mint_account: &Pubkey,
    check_ata_key: bool,
) -> Result<()> {
    let mut data: &[u8] = &ata.try_borrow_data()?;
    let cast_ata = TokenAccount::try_deserialize(&mut data);

    if let Ok(cast_ata) = cast_ata {
        require_keys_eq!(
            cast_ata.owner,
            *expected_owner,
            DexalotError::InvalidTokenOwner
        );
        require_keys_eq!(
            cast_ata.mint,
            *expected_mint_account,
            DexalotError::InvalidMint
        );

        if check_ata_key {
            let expected_ata = associated_token::get_associated_token_address(
                expected_owner,
                expected_mint_account,
            );
            require_keys_eq!(
                ata.key(),
                expected_ata,
                DexalotError::InvalidDestinationOwner
            );
        }
    }
    Ok(())
}

pub fn custom_data_to_nonce(custom_data: [u8; 18]) -> [u8; 12] {
    let mut result = [0u8; 12];
    result.copy_from_slice(&custom_data[6..18]);
    result
}

pub fn nonce_to_custom_data(nonce: [u8; 12]) -> [u8; 18] {
    let mut custom_data = [0u8; 18];
    custom_data[6..].copy_from_slice(&nonce); // Copy 12 bytes to the end, leaving first 6 bytes as zeros
    custom_data
}

#[cfg(test)]
mod tests {
    use anchor_lang::Discriminator;
    use super::*;
    use anchor_lang::solana_program::system_program;
    use anchor_spl::associated_token;
    use bincode::serialize;
    use solana_program::clock::UnixTimestamp;
    use crate::consts::{COMPLETED_SWAPS_SEED, UNUSED_ADDRESS_PUBLIC_KEY};
    use crate::state::Portfolio;
    use crate::test_utils::{create_account_info, create_packed_token_account};

    #[test]
    fn test_generate_map_entry_key() -> Result<()> {
        let nonce = [1u8; 12];
        let dest_trader = Pubkey::new_unique();
        let key = generate_map_entry_key(nonce, dest_trader)?;
        assert_eq!(key.len(), 32);
        Ok(())
    }

    #[test]
    fn test_custom_data_conversion() {
        let nonce = [5u8; 12];
        let custom_data = nonce_to_custom_data(nonce);
        let recovered_nonce = custom_data_to_nonce(custom_data);
        assert_eq!(nonce, recovered_nonce);
    }

    #[test]
    fn test_check_ata_account_valid() -> Result<()> {
        let expected_mint = Pubkey::new_unique();

        let expected_ata = associated_token::get_associated_token_address(&token::ID, &expected_mint);
        let mut from_token_data = create_packed_token_account(expected_mint, token::ID, 15000)?;
        let mut from_lamports = 15000;
        let from = create_account_info(
            &expected_ata,
            false,
            true,
            &mut from_lamports,
            &mut from_token_data,
            &token::ID,
            false,
            None,
        );
        let result = check_ata_account(&from, &token::ID, &expected_mint, true);
        assert!(result.is_ok());
        Ok(())
    }

    #[test]
    fn test_check_ata_account_negative_cases() -> Result<()> {
        let expected_mint = Pubkey::new_unique();

        let mut from_token_data = create_packed_token_account(expected_mint, token::ID, 15000)?;
        let mut from_lamports = 15000;
        let from_key = Pubkey::new_unique();
        let from = create_account_info(
            &from_key,
            false,
            true,
            &mut from_lamports,
            &mut from_token_data,
            &token::ID,
            false,
            None,
        );

        let result = check_ata_account(&from, &token::ID, &expected_mint, true);
        assert_eq!(result.unwrap_err(), DexalotError::InvalidDestinationOwner.into());

        let result = check_ata_account(&from, &token::ID, &from_key, true);
        assert_eq!(result.unwrap_err(), DexalotError::InvalidMint.into());

        let result = check_ata_account(&from, &from_key, &from_key, true);
        assert_eq!(result.unwrap_err(), DexalotError::InvalidTokenOwner.into());
        Ok(())
    }

    #[test]
    fn test_release_funds_success_and_fail() -> Result<()> {
        let program_id = crate::id();
        let generic_key = Pubkey::new_unique();

        let hex_str = UNUSED_ADDRESS_PUBLIC_KEY;
        let bytes = hex::decode(hex_str).unwrap();
        let address: [u8; 20] = bytes.try_into().unwrap();
        let gc = GlobalConfig {
            allow_deposit: false,
            program_paused: false,
            native_deposits_restricted: false,
            src_chain_id: 0,
            default_chain_id: 0,
            airdrop_amount: 0,
            swap_signer: address,
            out_nonce: 0,
        };
        let portfolio = Portfolio {
            admin: Default::default(),
            global_config: gc,
            bump: 0,
        };
        let mut portfolio_data = portfolio.try_to_vec()?;
        let mut portfolio_lamports = 100;
        let portfolio_account = create_account_info(
            &generic_key,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator())
        );

        let mut clock = Clock::default();
        clock.unix_timestamp = UnixTimestamp::from(123);
        let mut clock_data = serialize(&clock).unwrap();
        let mut clock_lamports = 100;
        let clock_pubkey = Pubkey::try_from("SysvarC1ock11111111111111111111111111111111").unwrap();
        let clock_info = create_account_info(
            &clock_pubkey,
            false,
            false,
            &mut clock_lamports,
            &mut clock_data,
            &program_id,
            false,
            None
        );
        let order = Order {
            maker_asset: Pubkey::new_unique(),
            taker_asset: Pubkey::new_unique(),
            taker: Pubkey::new_unique(),
            maker_amount: 500,
            taker_amount: 1000,
            expiry: clock.unix_timestamp as u128 + 10_000,
            dest_trader: Pubkey::new_unique(),
            nonce: [0u8; 12],
        };

        let mut sender_lamports = 1000;
        let mut sender_data = vec![0u8; 10];
        let sender_info = AccountInfo::new(
            &order.taker,
            true,
            false,
            &mut sender_lamports,
            &mut sender_data,
            &system_program::ID,
            false,
            0,
        );

        let base_map_seed = COMPLETED_SWAPS_SEED;
        let entry_map_seed = generate_map_entry_key(order.nonce, order.dest_trader)?;
        let (pda, _bump) = Pubkey::find_program_address(&[base_map_seed, &entry_map_seed], &program_id);
        let mut cs_data = vec![];
        let mut cs_lamports = 100;
        let completed_swaps_info = AccountInfo::new(
            &pda,
            false,
            false,
            &mut cs_lamports,
            &mut cs_data,
            &system_program::ID,
            false,
            0,
        );

        let mut system_data = vec![0u8; 10];
        let mut system_lamports = 100;
        let system_program_info = AccountInfo::new(
            &system_program::ID,
            false,
            false,
            &mut system_lamports,
            &mut system_data,
            &system_program::ID,
            true,
            0,
        );

        let mut generic_data = vec![0u8; 100];
        let mut generic_lamports = 100;
        let generic_info = create_account_info(
            &generic_key,
            false,
            false,
            &mut generic_lamports,
            &mut generic_data,
            &program_id,
            false,
            None
        );

        let mut sol_vault_lamports = 500 + NATIVE_VAULT_MIN_THRESHOLD;
        let mut sol_vault_data = vec![0u8; 10];
        let sol_vault_info = create_account_info(
            &generic_key,
            false,
            true,
            &mut sol_vault_lamports,
            &mut sol_vault_data,
            &system_program::ID,
            false,
            None
        );
        let sol_vault = SystemAccount::try_from(&sol_vault_info)?;

        let mut token_program_lamports = 100;
        let mut token_program_data = vec![0u8; 10];
        let token_program_info = create_account_info(
            &token::ID,
            false,
            false,
            &mut token_program_lamports,
            &mut token_program_data,
            &token::ID,
            true,
            None
        );
        let token_program = Program::<Token>::try_from(&token_program_info)?;

        let mut swap_accounts = Swap {
            clock: Sysvar::from_account_info(&clock_info)?,
            sender: Signer::try_from(&sender_info)?,
            taker: generic_info.clone(),
            dest_trader: generic_info.clone(),
            completed_swaps_entry: completed_swaps_info.clone(),
            system_program: Program::try_from(&system_program_info)?,
            portfolio: Account::try_from(&portfolio_account)?,
            spl_vault: generic_info.clone(),
            sol_vault,
            src_token_mint: generic_info.clone(),
            dest_token_mint: generic_info.clone(),
            taker_dest_asset_ata: generic_info.clone(),
            taker_src_asset_ata: generic_info.clone(),
            dest_trader_dest_asset_ata: generic_info.clone(),
            dest_trader_src_asset_ata: generic_info.clone(),
            spl_vault_dest_asset_ata: generic_info.clone(),
            spl_vault_src_asset_ata: generic_info.clone(),
            token_program,
        };

        let ctx = Context {
            accounts: &mut swap_accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: SwapBumps::default(),
        };

        let mut data = SwapData {
            taker: Default::default(),
            dest_trader: Default::default(),
            dest_chain_id: 0,
            src_asset: Default::default(),
            dest_asset: Default::default(),
            src_amount: 0,
            dest_amount: 0,
            nonce: [1u8; 12],
        };

        let result = release_funds(&ctx, &data);
        assert!(result.is_ok());

        data.dest_amount = 20000;

        let result = release_funds(&ctx, &data);
        assert_eq!(result.unwrap_err(), DexalotError::NotEnoughNativeBalance.into());
        Ok(())
    }

    #[test]
    fn test_take_funds_success_and_fail() -> Result<()> {
        let program_id = crate::id();
        let generic_key = Pubkey::new_unique();

        let hex_str = UNUSED_ADDRESS_PUBLIC_KEY;
        let bytes = hex::decode(hex_str).unwrap();
        let address: [u8; 20] = bytes.try_into().unwrap();
        let gc = GlobalConfig {
            allow_deposit: false,
            program_paused: false,
            native_deposits_restricted: false,
            src_chain_id: 0,
            default_chain_id: 0,
            airdrop_amount: 0,
            swap_signer: address,
            out_nonce: 0,
        };
        let portfolio = Portfolio {
            admin: Default::default(),
            global_config: gc,
            bump: 0,
        };
        let mut portfolio_data = portfolio.try_to_vec()?;
        let mut portfolio_lamports = 100;
        let portfolio_account = create_account_info(
            &generic_key,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator())
        );

        let mut clock = Clock::default();
        clock.unix_timestamp = UnixTimestamp::from(123);
        let mut clock_data = serialize(&clock).unwrap();
        let mut clock_lamports = 100;
        let clock_pubkey = Pubkey::try_from("SysvarC1ock11111111111111111111111111111111").unwrap();
        let clock_info = create_account_info(
            &clock_pubkey,
            false,
            false,
            &mut clock_lamports,
            &mut clock_data,
            &program_id,
            false,
            None
        );
        let order = Order {
            maker_asset: Pubkey::new_unique(),
            taker_asset: Pubkey::new_unique(),
            taker: Pubkey::new_unique(),
            maker_amount: 500,
            taker_amount: 1000,
            expiry: clock.unix_timestamp as u128 + 10_000,
            dest_trader: Pubkey::new_unique(),
            nonce: [0u8; 12],
        };

        let mut sender_lamports = 1000;
        let mut sender_data = vec![0u8; 10];
        let sender_info = AccountInfo::new(
            &order.taker,
            true,
            false,
            &mut sender_lamports,
            &mut sender_data,
            &system_program::ID,
            false,
            0,
        );

        let base_map_seed = COMPLETED_SWAPS_SEED;
        let entry_map_seed = generate_map_entry_key(order.nonce, order.dest_trader)?;
        let (pda, _bump) = Pubkey::find_program_address(&[base_map_seed, &entry_map_seed], &program_id);
        let mut cs_data = vec![];
        let mut cs_lamports = 100;
        let completed_swaps_info = AccountInfo::new(
            &pda,
            false,
            false,
            &mut cs_lamports,
            &mut cs_data,
            &system_program::ID,
            false,
            0,
        );

        let mut system_data = vec![0u8; 10];
        let mut system_lamports = 100;
        let system_program_info = AccountInfo::new(
            &system_program::ID,
            false,
            false,
            &mut system_lamports,
            &mut system_data,
            &system_program::ID,
            true,
            0,
        );

        let mut generic_data = vec![0u8; 100];
        let mut generic_lamports = 100;
        let generic_info = create_account_info(
            &generic_key,
            false,
            false,
            &mut generic_lamports,
            &mut generic_data,
            &program_id,
            false,
            None
        );

        let mut sol_vault_lamports = 500 + NATIVE_VAULT_MIN_THRESHOLD;
        let mut sol_vault_data = vec![0u8; 10];
        let sol_vault_info = create_account_info(
            &generic_key,
            false,
            true,
            &mut sol_vault_lamports,
            &mut sol_vault_data,
            &system_program::ID,
            false,
            None
        );
        let sol_vault_info_clone = sol_vault_info.clone();
        let sol_vault = SystemAccount::try_from(&sol_vault_info_clone)?;

        let mut token_program_lamports = 100;
        let mut token_program_data = vec![0u8; 10];
        let token_program_info = create_account_info(
            &token::ID,
            false,
            false,
            &mut token_program_lamports,
            &mut token_program_data,
            &token::ID,
            true,
            None
        );
        let token_program = Program::<Token>::try_from(&token_program_info)?;

        let mut swap_accounts = Swap {
            clock: Sysvar::from_account_info(&clock_info)?,
            sender: Signer::try_from(&sender_info)?,
            taker: generic_info.clone(),
            dest_trader: generic_info.clone(),
            completed_swaps_entry: completed_swaps_info.clone(),
            system_program: Program::try_from(&system_program_info)?,
            portfolio: Account::try_from(&portfolio_account)?,
            spl_vault: generic_info.clone(),
            sol_vault: sol_vault.clone(),
            src_token_mint: generic_info.clone(),
            dest_token_mint: generic_info.clone(),
            taker_dest_asset_ata: generic_info.clone(),
            taker_src_asset_ata: generic_info.clone(),
            dest_trader_dest_asset_ata: generic_info.clone(),
            dest_trader_src_asset_ata: generic_info.clone(),
            spl_vault_dest_asset_ata: generic_info.clone(),
            spl_vault_src_asset_ata: generic_info.clone(),
            token_program,
        };

        let ctx = Context {
            accounts: &mut swap_accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: SwapBumps::default(),
        };

        let mut data = SwapData {
            taker: Default::default(),
            dest_trader: Default::default(),
            dest_chain_id: 0,
            src_asset: Default::default(),
            dest_asset: Default::default(),
            src_amount: 0,
            dest_amount: 0,
            nonce: [1u8; 12],
        };

        let take = TakeFunds::from_swap_context(&ctx);

        let result = take_funds(&take, &data, true);
        assert!(result.is_ok());

        data.src_amount = 20000;

        let result = take_funds(&take, &data, false);
        assert_eq!(result.unwrap_err(), DexalotError::NotEnoughNativeBalance.into());
        Ok(())
    }
}
