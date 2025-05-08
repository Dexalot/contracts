use crate::consts::{
    ADMIN_SEED, PORTFOLIO_SEED, SPL_USER_FUNDS_VAULT_SEED, SPL_VAULT_SEED, TOKEN_DETAILS_SEED,
};
use crate::errors::DexalotError;
use crate::events::ParameterUpdatedEvent;
use crate::state::{Admin, Portfolio, TokenDetails};
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

pub fn add_token<'info>(
    ctx: &mut Context<'_, '_, 'info, 'info, AddToken<'info>>,
    params: &AddTokenParams,
) -> Result<()> {
    // Validate that the signer is an admin.
    let admin = &ctx.accounts.admin;
    require_keys_eq!(
        *admin.owner,
        *ctx.program_id,
        DexalotError::UnauthorizedSigner
    );

    // Populate the token details account.
    let token_details = &mut ctx.accounts.token_details;

    token_details.decimals = params.decimals;
    token_details.token_address = params.token_address;
    token_details.symbol = params.symbol;

    emit!(ParameterUpdatedEvent {
        pair: params.symbol,
        parameter: "P-ADDTOKEN".to_owned(),
        old_value: 0,
        new_value: 1
    });

    msg!("Token added successfully");

    Ok(())
}

// Remove a token from the system:
// - Validates caller is admin
// - Removes token from TokenList
// - Closes TokenDetails PDA
pub fn remove_token<'info>(
    ctx: &Context<'_, '_, 'info, 'info, RemoveToken<'info>>,
    params: &RemoveTokenParams,
) -> Result<()> {
    // Check the program is paused
    let global_config = &ctx.accounts.portfolio.global_config;
    require!(global_config.program_paused, DexalotError::ProgramNotPaused);

    let token_mint = params.token_address;

    emit!(ParameterUpdatedEvent {
        pair: token_mint.to_bytes(),
        parameter: "P-REMOVETOKEN".to_owned(),
        old_value: 1,
        new_value: 0
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(params: AddTokenParams)]
pub struct AddToken<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Confirm there is an admin account
    /// CHECK: Used to check if authority/signer is admin
    #[account(
        seeds = [ADMIN_SEED, authority.key().as_ref()],
        bump
    )]
    pub admin: AccountInfo<'info>,

    /// CHECK: Used to set the authority for the associated token account
    #[account(
        seeds = [SPL_VAULT_SEED],
        bump,
    )]
    pub spl_vault: AccountInfo<'info>,
    /// CHECK: Used to set the authority for the associated token account
    #[account(
        seeds = [SPL_USER_FUNDS_VAULT_SEED],
        bump,
    )]
    pub spl_user_funds_vault: AccountInfo<'info>,
    #[account(
        init,
        payer = authority,
        space = TokenDetails::LEN,
        seeds = [TOKEN_DETAILS_SEED, params.token_address.as_ref()],
        bump
    )]
    pub token_details: Box<Account<'info, TokenDetails>>,
    /// The token mint for the supported token
    pub token_mint: Box<Account<'info, Mint>>,
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = token_mint,
        associated_token::authority = spl_vault,
    )]
    pub spl_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = token_mint,
        associated_token::authority = spl_user_funds_vault,
    )]
    pub spl_user_funds_token_account: Box<Account<'info, TokenAccount>>,
    /// Programs & Sysvars
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Clone, AnchorDeserialize, AnchorSerialize)]
pub struct AddTokenParams {
    symbol: [u8; 32],
    token_address: Pubkey,
    decimals: u8,
}

#[derive(Clone, AnchorDeserialize, AnchorSerialize)]
pub struct RemoveTokenParams {
    token_address: Pubkey,
}

#[derive(Accounts)]
#[instruction(params: RemoveTokenParams)]
pub struct RemoveToken<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    // Verify that user is an admin by checking their PDA.
    #[account(
        seeds = [ADMIN_SEED, authority.key().as_ref()],
        bump
    )]
    pub admin: Account<'info, Admin>,

    #[account(
        seeds = [PORTFOLIO_SEED],
        bump = portfolio.bump
    )]
    pub portfolio: Account<'info, Portfolio>,

    // Close the token_details account. This requires that:
    // - token_details matches the symbol being removed (you can add a constraint to check this)
    // - The close attribute sends lamports back to receiver when this account is closed.
    #[account(
        mut,
        close = receiver,
        seeds = [TOKEN_DETAILS_SEED, params.token_address.as_ref()],
        bump
    )]
    pub token_details: Account<'info, TokenDetails>,

    #[account(mut)]
    pub receiver: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{Admin, Portfolio, TokenDetails};
    use crate::test_utils::create_account_info;
    use anchor_lang::solana_program::program_pack::Pack;
    use anchor_lang::{system_program, Discriminator};
    use anchor_spl::token::spl_token;
    use spl_token::state::{Account as SplTokenAccount, AccountState};

    #[test]
    fn test_add_token_success() -> Result<()> {
        let program_id = crate::id();
        let generic_pubkey = Pubkey::new_unique();

        let admin_key = Pubkey::new_unique();
        let mut admin_lamports = 100;
        let mut admin_data = vec![0u8; 100];
        let admin_account = create_account_info(
            &admin_key,
            true,
            true,
            &mut admin_lamports,
            &mut admin_data,
            &program_id,
            false,
            None,
        );

        let token_details_key = Pubkey::new_unique();
        let mut token_details_lamports = 100;
        let mut token_details_data = vec![0u8; TokenDetails::LEN];
        let token_details_account = create_account_info(
            &token_details_key,
            false,
            true,
            &mut token_details_lamports,
            &mut token_details_data,
            &program_id,
            false,
            Some(TokenDetails::discriminator()),
        );

        let mut generic_lamports = 100;
        let mut generic_data = vec![0u8; 100];
        let generic_account = create_account_info(
            &generic_pubkey,
            false,
            false,
            &mut generic_lamports,
            &mut generic_data,
            &program_id,
            false,
            None,
        );

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
            None,
        );
        let system_program = Program::try_from(&system_program_ai)?;

        let mut tp_lamports = 100;
        let mut tp_data = vec![0u8; 10];
        let token_program_info = create_account_info(
            &anchor_spl::token::ID,
            false,
            false,
            &mut tp_lamports,
            &mut tp_data,
            &anchor_spl::token::ID,
            true,
            None,
        );
        let token_program = Program::try_from(&token_program_info)?;

        let mut a_tp_lamports = 100;
        let mut a_tp_data = vec![0u8; 10];
        let associated_token_id = AssociatedToken::id();
        let a_token_program_info = create_account_info(
            &associated_token_id,
            false,
            false,
            &mut a_tp_lamports,
            &mut a_tp_data,
            &anchor_spl::token::ID,
            true,
            None,
        );

        let mut mint_lamports = 100;
        let mut mint_data = vec![0u8; Mint::LEN];
        let mint_default = Mint::default();
        spl_token::state::Mint::pack_into_slice(&mint_default, &mut mint_data);
        // setting initialized to true so that it passes the check
        mint_data[45] = 1;
        let mint_info = create_account_info(
            &generic_pubkey,
            false,
            false,
            &mut mint_lamports,
            &mut mint_data,
            &anchor_spl::token::ID,
            true,
            None,
        );

        let associated_token_program = Program::try_from(&a_token_program_info)?;
        let admin_clone = admin_account.clone();
        let authority = Signer::try_from(&admin_clone)?;
        let mut spl_generic_clone = generic_account.clone();
        spl_generic_clone.owner = &anchor_spl::token::ID;
        let mut spl_user_funds_generic_clone = generic_account.clone();
        spl_user_funds_generic_clone.owner = &anchor_spl::token::ID;

        let mut default_token_account = SplTokenAccount::default();
        default_token_account.state = AccountState::Initialized;
        let mut default_token_data = vec![0u8; spl_token::state::Account::LEN];
        let mut default_token_lamports = 100;
        spl_token::state::Account::pack_into_slice(&default_token_account, &mut default_token_data);
        let spl_token_info = create_account_info(
            &generic_pubkey,
            false,
            false,
            &mut default_token_lamports,
            &mut default_token_data,
            &anchor_spl::token::ID,
            true,
            None,
        );
        let spl_token_account: Account<TokenAccount> = Account::try_from(&spl_token_info)?;

        let mut add_token_accounts = AddToken {
            authority,
            admin: admin_account.clone(),
            spl_vault: generic_account.clone(),
            spl_user_funds_vault: generic_account.clone(),
            token_details: Box::new(Account::try_from(&token_details_account)?),
            token_mint: Box::new(Account::try_from(&mint_info)?),
            spl_token_account: Box::new(spl_token_account.clone()),
            spl_user_funds_token_account: Box::new(spl_token_account),
            system_program,
            token_program,
            associated_token_program,
        };

        let dummy_token_address = Pubkey::new_unique();
        let mut dummy_symbol = [0u8; 32];
        let symbol_bytes = b"TEST";
        dummy_symbol[..symbol_bytes.len()].copy_from_slice(symbol_bytes);
        let params = AddTokenParams {
            decimals: 6,
            token_address: dummy_token_address,
            symbol: dummy_symbol,
        };

        let mut ctx = Context {
            program_id: &program_id,
            accounts: &mut add_token_accounts,
            remaining_accounts: &[],
            bumps: AddTokenBumps::default(),
        };

        let result = add_token(&mut ctx, &params);
        assert!(result.is_ok());
        Ok(())
    }

    #[test]
    fn test_remove_token_success() -> Result<()> {
        let program_id = crate::id();
        let sys_key = system_program::ID;
        let token_mint = Pubkey::new_unique();

        let authority_key = Pubkey::new_unique();
        let mut authority_lamports = 100;
        let mut authority_data = vec![0u8; Admin::LEN];
        let authority_account_info = create_account_info(
            &authority_key,
            true,
            true,
            &mut authority_lamports,
            &mut authority_data,
            &program_id,
            false,
            Some(Admin::discriminator()),
        );
        let authority = Signer::try_from(&authority_account_info)?;

        let admin_key = Pubkey::new_unique();
        let mut admin_lamports = 100;
        let mut admin_data = vec![0u8; Admin::LEN];
        let admin_account = create_account_info(
            &admin_key,
            false,
            true,
            &mut admin_lamports,
            &mut admin_data,
            &program_id,
            false,
            Some(Admin::discriminator()),
        );

        let portfolio_key = Pubkey::new_unique();
        let mut portfolio_lamports = 100;
        let mut portfolio_data = vec![0u8; Portfolio::LEN];
        let mut portfolio_instance = Portfolio::default();
        portfolio_instance.global_config.program_paused = true;
        let portfolio_serialized = portfolio_instance.try_to_vec()?;
        portfolio_data[..portfolio_serialized.len()].copy_from_slice(&portfolio_serialized);
        let portfolio_account = create_account_info(
            &portfolio_key,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator()),
        );

        let token_details_key = Pubkey::new_unique();
        let mut token_details_lamports = 100;
        let mut token_details_data = vec![0u8; TokenDetails::LEN];
        let token_details_account = create_account_info(
            &token_details_key,
            false,
            true,
            &mut token_details_lamports,
            &mut token_details_data,
            &program_id,
            false,
            Some(TokenDetails::discriminator()),
        );

        let receiver_key = Pubkey::new_unique();
        let mut receiver_lamports = 0;
        let mut receiver_data = vec![];
        let receiver_account = create_account_info(
            &receiver_key,
            false,
            true,
            &mut receiver_lamports,
            &mut receiver_data,
            &sys_key,
            false,
            None,
        );

        let mut sys_lamports = 0;
        let mut sys_data = vec![];
        let system_program_info = create_account_info(
            &sys_key,
            false,
            false,
            &mut sys_lamports,
            &mut sys_data,
            &sys_key,
            true,
            None,
        );
        let system_program = Program::try_from(&system_program_info)?;

        let mut remove_token_accounts = RemoveToken {
            authority,
            admin: Account::try_from(&admin_account)?,
            portfolio: Account::try_from(&portfolio_account)?,
            token_details: Account::try_from(&token_details_account)?,
            receiver: SystemAccount::try_from(&receiver_account)?,
            system_program,
        };

        let ctx = Context {
            program_id: &program_id,
            accounts: &mut remove_token_accounts,
            remaining_accounts: &[],
            bumps: Default::default(),
        };

        let params = RemoveTokenParams {
            token_address: token_mint,
        };

        let result = remove_token(&ctx, &params);
        assert!(result.is_ok());

        Ok(())
    }

    #[test]
    fn test_add_token_negative_cases() -> Result<()> {
        let program_id = crate::id();
        let generic_pubkey = Pubkey::new_unique();

        let admin_key = Pubkey::new_unique();
        let mut admin_lamports = 100;
        let mut admin_data = vec![0u8; 100];
        let admin_account = create_account_info(
            &admin_key,
            true,
            true,
            &mut admin_lamports,
            &mut admin_data,
            &program_id,
            false,
            None,
        );

        let token_details_key = Pubkey::new_unique();
        let mut token_details_lamports = 100;
        let mut token_details_data = vec![0u8; TokenDetails::LEN];
        let token_details_account = create_account_info(
            &token_details_key,
            false,
            true,
            &mut token_details_lamports,
            &mut token_details_data,
            &program_id,
            false,
            Some(TokenDetails::discriminator()),
        );

        let mut generic_lamports = 100;
        let mut generic_data = vec![0u8; 100];
        let generic_account = create_account_info(
            &generic_pubkey,
            false,
            false,
            &mut generic_lamports,
            &mut generic_data,
            &program_id,
            false,
            None,
        );

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
            None,
        );
        let system_program = Program::try_from(&system_program_ai)?;

        let mut tp_lamports = 100;
        let mut tp_data = vec![0u8; 10];
        let token_program_info = create_account_info(
            &anchor_spl::token::ID,
            false,
            false,
            &mut tp_lamports,
            &mut tp_data,
            &anchor_spl::token::ID,
            true,
            None,
        );
        let token_program = Program::try_from(&token_program_info)?;

        let mut a_tp_lamports = 100;
        let mut a_tp_data = vec![0u8; 10];
        let associated_token_id = AssociatedToken::id();
        let a_token_program_info = create_account_info(
            &associated_token_id,
            false,
            false,
            &mut a_tp_lamports,
            &mut a_tp_data,
            &anchor_spl::token::ID,
            true,
            None,
        );

        let mut mint_lamports = 100;
        let mut mint_data = vec![0u8; Mint::LEN];
        let mint_default = Mint::default();
        spl_token::state::Mint::pack_into_slice(&mint_default, &mut mint_data);
        // setting initialized to true so that it passes the check
        mint_data[45] = 1;
        let mint_info = create_account_info(
            &generic_pubkey,
            false,
            false,
            &mut mint_lamports,
            &mut mint_data,
            &anchor_spl::token::ID,
            true,
            None,
        );

        let associated_token_program = Program::try_from(&a_token_program_info)?;
        let admin_clone = admin_account.clone();
        let authority = Signer::try_from(&admin_clone)?;
        let mut spl_generic_clone = generic_account.clone();
        spl_generic_clone.owner = &anchor_spl::token::ID;
        let mut spl_user_funds_generic_clone = generic_account.clone();
        spl_user_funds_generic_clone.owner = &anchor_spl::token::ID;

        let mut default_token_account = SplTokenAccount::default();
        default_token_account.state = AccountState::Initialized;
        let mut default_token_data = vec![0u8; spl_token::state::Account::LEN];
        let mut default_token_lamports = 100;
        spl_token::state::Account::pack_into_slice(&default_token_account, &mut default_token_data);
        let spl_token_info = create_account_info(
            &generic_pubkey,
            false,
            false,
            &mut default_token_lamports,
            &mut default_token_data,
            &anchor_spl::token::ID,
            true,
            None,
        );
        let spl_token_account: Account<TokenAccount> = Account::try_from(&spl_token_info)?;

        let mut add_token_accounts = AddToken {
            authority,
            admin: admin_account.clone(),
            spl_vault: generic_account.clone(),
            spl_user_funds_vault: generic_account.clone(),
            token_details: Box::new(Account::try_from(&token_details_account)?),
            token_mint: Box::new(Account::try_from(&mint_info)?),
            spl_token_account: Box::new(spl_token_account.clone()),
            spl_user_funds_token_account: Box::new(spl_token_account),
            system_program,
            token_program,
            associated_token_program,
        };

        let dummy_token_address = Pubkey::new_unique();
        let mut dummy_symbol = [0u8; 32];
        let symbol_bytes = b"TEST";
        dummy_symbol[..symbol_bytes.len()].copy_from_slice(symbol_bytes);

        let params = AddTokenParams {
            decimals: 6,
            token_address: dummy_token_address,
            symbol: dummy_symbol,
        };

        let not_admin = Pubkey::new_unique();
        let mut ctx = Context {
            program_id: &not_admin,
            accounts: &mut add_token_accounts,
            remaining_accounts: &[],
            bumps: AddTokenBumps::default(),
        };

        let result = add_token(&mut ctx, &params);
        assert_eq!(result.unwrap_err(), DexalotError::UnauthorizedSigner.into());

        Ok(())
    }
}
