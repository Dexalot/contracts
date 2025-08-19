use crate::consts::{
    ADMIN_SEED, AIRDROP_VAULT_SEED, BANNED_ACCOUNT_SEED, ENDPOINT_QUOTE, ENDPOINT_SEND,
    GAS_OPTIONS, PORTFOLIO_SEED, QUOTE_REMAINING_ACCOUNTS_COUNT, REMOTE_SEED, SOL_NATIVE_SYMBOL,
    SOL_USER_FUNDS_VAULT_SEED, SPL_USER_FUNDS_VAULT_SEED, TOKEN_DETAILS_SEED,
};
use crate::cpi_utils::{
    create_instruction_data, EndpointQuoteParams, EndpointSendParams, MessagingFee,
};
use crate::xfer::{Tx, XFER};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_instruction;
use anchor_lang::solana_program::{
    instruction::Instruction,
    program::{get_return_data, invoke, invoke_signed},
};
use anchor_spl::token::{self, Token, TokenAccount, Transfer as SplTransfer};

use crate::errors::DexalotError;
use crate::events::{
    PortfolioUpdatedEvent, SolTransfer, SolTransferTransactions, SolTransferTypes,
};
use crate::state::{Portfolio, Remote, TokenDetails};

/// Deposits token amount into the portfolio program
/// Sends a cross-chain message to the Dexalot L1 contract to update the user's balance
pub fn deposit(ctx: &mut Context<Deposit>, params: &DepositParams) -> Result<()> {
    let user = &ctx.accounts.user;
    let from = &ctx.accounts.from;
    let to = &ctx.accounts.to;
    let token_program = &ctx.accounts.token_program;
    let banned_account = &ctx.accounts.banned_account;
    let program_id = &ctx.program_id;
    let remote = &ctx.accounts.remote;
    let global_config = &ctx.accounts.portfolio.global_config;
    let token_details = &ctx.accounts.token_details;
    let portfolio = &ctx.accounts.portfolio;

    require_keys_eq!(
        ctx.accounts.endpoint_program.key(),
        portfolio.endpoint,
        DexalotError::InvalidLZProgram
    );

    require!(
        banned_account.owner != *program_id,
        DexalotError::AccountBanned
    );

    // Check the program is not paused
    require!(!global_config.program_paused, DexalotError::ProgramPaused);

    // Check if deposits are allowed
    require!(global_config.allow_deposit, DexalotError::DepositsPaused);

    // Validate the amount is not greater than the user's balance
    require!(
        from.amount >= params.amount,
        DexalotError::NotEnoughSplTokenBalance
    );

    // Transfer tokens from taker to initializer
    let cpi_accounts = SplTransfer {
        from: from.to_account_info().clone(),
        to: to.to_account_info().clone(),
        authority: user.to_account_info().clone(),
    };
    let cpi_program = token_program.to_account_info();

    token::transfer(CpiContext::new(cpi_program, cpi_accounts), params.amount)?;

    emit!(PortfolioUpdatedEvent {
        transaction: Tx::Deposit,
        wallet: from.key(),
        token_mint: token_details.token_address,
        quantity: params.amount,
        wallet_other: params.trader,
    });

    //Create and send cross-chain message
    let xfer = XFER::new(
        Tx::Deposit,
        params.trader,
        token_details.symbol,
        params.amount,
        if cfg!(not(test)) {
            Clock::get()?.unix_timestamp as u32
        } else {
            123
        },
        [0; 18],
        global_config.out_nonce,
    );
    let message = xfer.pack_xfer_message()?;

    // Call Quote
    let quote_params = EndpointQuoteParams {
        sender: ctx.accounts.portfolio.key(),
        dst_eid: global_config.default_chain_id,
        receiver: remote.address,
        message: message.clone(),
        pay_in_lz_token: false,
        options: GAS_OPTIONS.to_vec(),
    };

    let quote_cpi_data = create_instruction_data(&quote_params, ENDPOINT_QUOTE)?;
    let quote_remaining_accounts = &ctx.remaining_accounts[0..QUOTE_REMAINING_ACCOUNTS_COUNT];
    let quote_accounts_metas: Vec<AccountMeta> = quote_remaining_accounts
        .iter()
        .skip(1) // an account is skipped because we don't use layerzero cpi utils so it's not needed
        .map(|account| AccountMeta {
            pubkey: *account.key,
            is_signer: account.is_signer,
            is_writable: false,
        })
        .collect();

    // Invoke CPI quote
    let fee = if cfg!(not(test)) {
        invoke(
            &Instruction {
                program_id: ctx.accounts.endpoint_program.key(),
                accounts: quote_accounts_metas,
                data: quote_cpi_data,
            },
            quote_remaining_accounts,
        )?;
        let quote_return_data = get_return_data().ok_or(DexalotError::LzQuoteError)?;
        MessagingFee::try_from_slice(&quote_return_data.1)?
    } else {
        MessagingFee::default()
    };

    require!(fee.lz_token_fee == 0, DexalotError::PositiveLzTokenFee);

    // Validate the user has enough LZ bridge fee
    require!(
        user.lamports() >= fee.native_fee,
        DexalotError::NotEnoughNativeBalance
    );

    let system_program = &ctx.accounts.system_program;

    // Transfer the SOL from the user to the native vault
    let ix = system_instruction::transfer(&user.key(), &portfolio.key(), fee.native_fee);
    if cfg!(not(test)) {
        invoke(
            &ix,
            &[
                user.to_account_info(),
                portfolio.to_account_info(),
                system_program.to_account_info(),
            ],
        )?;
    }

    // Call Send
    let send_remaining_accounts = &ctx.remaining_accounts[QUOTE_REMAINING_ACCOUNTS_COUNT..];
    let send_params = EndpointSendParams {
        dst_eid: global_config.default_chain_id,
        receiver: remote.address,
        message,
        options: GAS_OPTIONS.to_vec(),
        native_fee: fee.native_fee,
        lz_token_fee: 0,
    };

    let send_seeds: &[&[&[u8]]] = &[&[PORTFOLIO_SEED, &[ctx.accounts.portfolio.bump]]];

    let send_cpi_data = create_instruction_data(&send_params, ENDPOINT_SEND)?;

    let portfolio_key = ctx.accounts.portfolio.key();
    let send_accounts_metas: Vec<AccountMeta> = send_remaining_accounts
        .iter()
        .skip(1) // an account is skipped because we don't use layerzero cpi utils so it's not needed
        .map(|account| AccountMeta {
            pubkey: *account.key,
            is_signer: account.key() == portfolio_key || account.is_signer,
            is_writable: account.is_writable,
        })
        .collect();

    // Invoke CPI send
    if cfg!(not(test)) {
        invoke_signed(
            &Instruction {
                program_id: ctx.accounts.endpoint_program.key(),
                accounts: send_accounts_metas,
                data: send_cpi_data,
            },
            send_remaining_accounts,
            send_seeds,
        )?;
    }

    // update nonce counter
    ctx.accounts.portfolio.global_config.out_nonce += 1;

    Ok(())
}

/// Deposits SOL into the portfolio program from the sender's account
pub fn deposit_native(
    ctx: &mut Context<DepositNative>,
    params: &DepositNativeParams,
) -> Result<()> {
    let program_id = &ctx.program_id;
    let banned_account = &ctx.accounts.banned_account;
    let global_config = &ctx.accounts.portfolio.global_config;
    let remote = &ctx.accounts.remote;
    let amount = params.amount;
    let portfolio = &ctx.accounts.portfolio;

    require_keys_eq!(
        ctx.accounts.endpoint_program.key(),
        portfolio.endpoint,
        DexalotError::InvalidLZProgram
    );
    require!(
        banned_account.owner != *program_id,
        DexalotError::AccountBanned
    );
    // Check the program is not paused
    require!(!global_config.program_paused, DexalotError::ProgramPaused);
    // Check if deposits are allowed
    require!(global_config.allow_deposit, DexalotError::DepositsPaused);
    // Check if native deposit is allowed
    require!(
        !global_config.native_deposits_restricted,
        DexalotError::NativeDepositNotAllowed
    );

    // Transfer amount from user to program
    let from = &ctx.accounts.user;
    let to = &ctx.accounts.sol_vault;
    let system_program = &ctx.accounts.system_program;

    // Validate the user has enough SOL
    require!(
        from.lamports() >= amount,
        DexalotError::NotEnoughNativeBalance
    );

    // Transfer the SOL from the user to the native vault
    let ix = system_instruction::transfer(&from.key(), &to.key(), amount);
    if cfg!(not(test)) {
        invoke(
            &ix,
            &[
                from.to_account_info(),
                to.to_account_info(),
                system_program.to_account_info(),
            ],
        )?;
    }

    emit!(PortfolioUpdatedEvent {
        transaction: Tx::Deposit,
        wallet: from.key(),
        token_mint: Pubkey::default(),
        quantity: amount,
        wallet_other: params.trader,
    });

    let mut native_symbol = [0; 32];
    native_symbol[0..3].copy_from_slice(SOL_NATIVE_SYMBOL);
    // Creates and packs xfer message
    let xfer = XFER::new(
        Tx::Deposit,
        params.trader,
        native_symbol,
        amount,
        if cfg!(not(test)) {
            Clock::get()?.unix_timestamp as u32
        } else {
            123
        },
        [0; 18],
        global_config.out_nonce,
    );

    let message = xfer.pack_xfer_message()?;

    // Call Quote
    let quote_params = EndpointQuoteParams {
        sender: ctx.accounts.portfolio.key(),
        dst_eid: global_config.default_chain_id,
        receiver: remote.address,
        message: message.clone(),
        pay_in_lz_token: false,
        options: GAS_OPTIONS.to_vec(),
    };

    let quote_cpi_data = create_instruction_data(&quote_params, ENDPOINT_QUOTE)?;
    let quote_remaining_accounts = &ctx.remaining_accounts[0..QUOTE_REMAINING_ACCOUNTS_COUNT];
    let quote_accounts_metas: Vec<AccountMeta> = quote_remaining_accounts
        .iter()
        .skip(1) // an account is skipped because we don't use layerzero cpi utils so it's not needed
        .map(|account| AccountMeta {
            pubkey: *account.key,
            is_signer: account.is_signer,
            is_writable: false,
        })
        .collect();

    // Invoke CPI quote
    let fee = if cfg!(not(test)) {
        invoke(
            &Instruction {
                program_id: ctx.accounts.endpoint_program.key(),
                accounts: quote_accounts_metas,
                data: quote_cpi_data,
            },
            quote_remaining_accounts,
        )?;
        let quote_return_data = get_return_data().ok_or(DexalotError::LzQuoteError)?;
        MessagingFee::try_from_slice(&quote_return_data.1)?
    } else {
        MessagingFee::default()
    };

    require!(fee.lz_token_fee == 0, DexalotError::PositiveLzTokenFee);

    // Validate the user has enough LZ bridge fee
    require!(
        from.lamports() >= fee.native_fee,
        DexalotError::NotEnoughNativeBalance
    );

    // Transfer the SOL from the user to the native vault
    let ix = system_instruction::transfer(&from.key(), &portfolio.key(), fee.native_fee);
    if cfg!(not(test)) {
        invoke(
            &ix,
            &[
                from.to_account_info(),
                portfolio.to_account_info(),
                system_program.to_account_info(),
            ],
        )?;
    }

    // Call Send
    let send_remaining_accounts = &ctx.remaining_accounts[QUOTE_REMAINING_ACCOUNTS_COUNT..];
    let send_params = EndpointSendParams {
        dst_eid: global_config.default_chain_id,
        receiver: remote.address,
        message,
        options: GAS_OPTIONS.to_vec(),
        native_fee: fee.native_fee,
        lz_token_fee: 0,
    };

    let send_seeds: &[&[&[u8]]] = &[&[PORTFOLIO_SEED, &[ctx.accounts.portfolio.bump]]];

    let send_cpi_data = create_instruction_data(&send_params, ENDPOINT_SEND)?;

    let portfolio_key = ctx.accounts.portfolio.key();
    let send_accounts_metas: Vec<AccountMeta> = send_remaining_accounts
        .iter()
        .skip(1) // an account is skipped because we don't use layerzero cpi utils so it's not needed
        .map(|account| AccountMeta {
            pubkey: *account.key,
            is_signer: account.key() == portfolio_key || account.is_signer,
            is_writable: account.is_writable,
        })
        .collect();

    // Invoke CPI send
    if cfg!(not(test)) {
        invoke_signed(
            &Instruction {
                program_id: ctx.accounts.endpoint_program.key(),
                accounts: send_accounts_metas,
                data: send_cpi_data,
            },
            send_remaining_accounts,
            send_seeds,
        )?;
    }
    // update nonce counter
    ctx.accounts.portfolio.global_config.out_nonce += 1;
    Ok(())
}

#[derive(Clone, AnchorDeserialize, AnchorSerialize)]
pub struct DepositNativeParams {
    pub amount: u64,
    pub trader: [u8; 32],
}

/// Deposits SOL into the portfolio program airdrop vault from the sender's account
pub fn deposit_airdrop(
    ctx: &mut Context<DepositAirdrop>,
    params: &DepositAirdropParams,
) -> Result<()> {
    let global_config = &mut ctx.accounts.portfolio.global_config;

    // Check the program is not paused
    require!(!global_config.program_paused, DexalotError::ProgramPaused);
    // Check if native deposit is allowed
    require!(
        !global_config.native_deposits_restricted,
        DexalotError::NativeDepositNotAllowed
    );
    require!(global_config.allow_deposit, DexalotError::DepositsPaused);

    // Transfer amount from user to program
    let from = &ctx.accounts.authority;
    let to = &ctx.accounts.airdrop_vault;
    let system_program = &ctx.accounts.system_program;

    // Validate the user has enough SOL
    require!(
        from.lamports() >= params.amount,
        DexalotError::NotEnoughNativeBalance
    );

    // Transfer the SOL from the user to the native vault
    let ix = system_instruction::transfer(&from.key(), &to.key(), params.amount);
    invoke(
        &ix,
        &[
            from.to_account_info(),
            to.to_account_info(),
            system_program.to_account_info(),
        ],
    )?;

    emit!(SolTransfer {
        amount: params.amount,
        transaction: SolTransferTransactions::Deposit,
        transfer_type: SolTransferTypes::Funding,
    });

    Ok(())
}

#[derive(Accounts, Clone)]
#[instruction(token_mint: Pubkey)]
pub struct Deposit<'info> {
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [PORTFOLIO_SEED],
        bump= portfolio.bump,
    )]
    pub portfolio: Account<'info, Portfolio>,

    // TODO: Potentially use AccountInfo instead of Account
    // Because Solana will return a system error if the account is not found
    // And we can't use the custom error code "P-ETNS-01"
    #[account(
        seeds = [TOKEN_DETAILS_SEED, token_mint.as_ref()],
        bump,
        constraint = from.mint == token_details.token_address @ DexalotError::InvalidMint
    )]
    pub token_details: Account<'info, TokenDetails>,
    /// CHECK: Used to set the program as authority for the associated token account
    #[account(
        seeds = [SPL_USER_FUNDS_VAULT_SEED],
        bump,
    )]
    pub spl_user_funds_vault: AccountInfo<'info>,

    #[account(
        mut,
        constraint = from.owner == user.key() @ DexalotError::InvalidTokenOwner,
        constraint = from.mint == token_details.token_address @ DexalotError::InvalidMint
    )]
    pub from: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = to.key() == anchor_spl::associated_token::get_associated_token_address(
            spl_user_funds_vault.key,
            &token_details.token_address,
        ) @ DexalotError::InvalidDestinationOwner,
        constraint = &to.owner == spl_user_funds_vault.key @ DexalotError::InvalidDestinationOwner,
        constraint = to.mint == token_details.token_address @ DexalotError::InvalidMint
    )]
    pub to: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    ///CHECK
    #[account(
        seeds = [BANNED_ACCOUNT_SEED, user.key().as_ref()],
        bump,
    )]
    pub banned_account: AccountInfo<'info>,

    #[account(
        seeds = [
            REMOTE_SEED,
            &portfolio.global_config.default_chain_id.to_be_bytes()
        ],
        bump = remote.bump
    )]
    pub remote: Account<'info, Remote>,
    /// CHECK: the endpoint program
    pub endpoint_program: AccountInfo<'info>,
    /// The program that can transfer lamports.
    pub system_program: Program<'info, System>,
}

#[derive(Clone, AnchorDeserialize, AnchorSerialize)]
pub struct DepositParams {
    token_mint: Pubkey,
    amount: u64,
    trader: [u8; 32],
}

#[derive(Accounts, Clone)]
pub struct DepositNative<'info> {
    /// The user calling the function and paying the lamports.
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [PORTFOLIO_SEED],
        bump= portfolio.bump,
    )]
    pub portfolio: Account<'info, Portfolio>,

    /// The vault account that will hold the deposited SOL.
    #[account(mut, seeds = [SOL_USER_FUNDS_VAULT_SEED], bump)]
    pub sol_vault: SystemAccount<'info>,

    /// The program that can transfer lamports.
    pub system_program: Program<'info, System>,

    #[account(
        seeds = [
            REMOTE_SEED,
            &portfolio.global_config.default_chain_id.to_be_bytes()
        ],
        bump = remote.bump
    )]
    pub remote: Account<'info, Remote>,

    ///CHECK
    #[account(
        seeds = [BANNED_ACCOUNT_SEED, user.key().as_ref()],
        bump,
    )]
    pub banned_account: AccountInfo<'info>,
    /// CHECK: the endpoint program
    pub endpoint_program: AccountInfo<'info>,
}

#[derive(Accounts, Clone)]
pub struct DepositAirdrop<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [PORTFOLIO_SEED],
        bump= portfolio.bump,
    )]
    pub portfolio: Account<'info, Portfolio>,

    /// The vault account that will hold the deposited SOL.
    #[account(mut, seeds = [AIRDROP_VAULT_SEED], bump)]
    pub airdrop_vault: SystemAccount<'info>,

    /// The program that can transfer lamports.
    pub system_program: Program<'info, System>,

    /// Confirm there is an admin account
    /// CHECK: Used to check if authority/signer is admin
    #[account(
        seeds = [ADMIN_SEED, authority.key().as_ref()],
        bump
    )]
    pub admin: AccountInfo<'info>,
}

#[derive(Clone, AnchorDeserialize, AnchorSerialize)]
pub struct DepositAirdropParams {
    amount: u64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::consts::UNUSED_ADDRESS_PUBLIC_KEY;
    use crate::state::{GlobalConfig, Portfolio, Remote, TokenDetails};
    use crate::test_utils::{create_account_info, create_dummy_account};
    use anchor_lang::solana_program::program_pack::Pack;
    use anchor_lang::{system_program, Discriminator};
    use anchor_spl::token::spl_token::state::AccountState;
    use anchor_spl::token::{spl_token, TokenAccount};

    #[test]
    fn test_deposit_success() -> Result<()> {
        let program_id = crate::id();
        let generic_pubkey = Pubkey::new_unique();

        let user_key = Pubkey::new_unique();
        let portfolio_key = Pubkey::new_unique();
        let remote_key = Pubkey::new_unique();
        let banned_account_key = Pubkey::new_unique();
        let endpoint_program_key = Pubkey::new_unique();

        let mut user_lamports = 100;
        let mut user_data = vec![0u8; 10];
        let user_info = create_account_info(
            &user_key,
            true,
            true,
            &mut user_lamports,
            &mut user_data,
            &program_id,
            false,
            None,
        );

        let mut generic_lamports = 100;
        let mut generic_data = vec![0u8; 10];
        let generic_info = create_account_info(
            &generic_pubkey,
            false,
            false,
            &mut generic_lamports,
            &mut generic_data,
            &program_id,
            false,
            None,
        );

        let hex_str = UNUSED_ADDRESS_PUBLIC_KEY;
        let bytes = hex::decode(hex_str).unwrap();
        let address: [u8; 20] = bytes.try_into().unwrap();
        let gc = GlobalConfig {
            allow_deposit: true,
            program_paused: false,
            native_deposits_restricted: false,
            default_chain_id: 0,
            airdrop_amount: 0,
            swap_signer: address,
            out_nonce: 0,
        };
        let portfolio = Portfolio {
            global_config: gc,
            endpoint: endpoint_program_key,
            bump: 0,
        };
        let mut portfolio_data = portfolio.try_to_vec()?;
        let mut portfolio_lamports = 100;
        let portfolio_info = create_account_info(
            &portfolio_key,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator()),
        );
        let portfolio_account = Account::<Portfolio>::try_from(&portfolio_info)?;

        let mut remote_lamports = 100;
        let mut remote_data = vec![0u8; Remote::SIZE];
        let remote_info = create_account_info(
            &remote_key,
            false,
            true,
            &mut remote_lamports,
            &mut remote_data,
            &program_id,
            false,
            Some(Remote::discriminator()),
        );
        let remote_account = Account::<Remote>::try_from(&remote_info)?;

        let mut banned_lamports = 100;
        let mut banned_data = vec![0u8; 10];
        let banned_owner = Pubkey::new_unique();
        let banned_info = create_account_info(
            &banned_account_key,
            false,
            false,
            &mut banned_lamports,
            &mut banned_data,
            &banned_owner,
            false,
            None,
        );

        let mut ep_lamports = 100;
        let mut ep_data = vec![0u8; 10];
        let endpoint_program_info = create_account_info(
            &endpoint_program_key,
            false,
            false,
            &mut ep_lamports,
            &mut ep_data,
            &endpoint_program_key,
            true,
            None,
        );

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
            None,
        );
        let token_program = Program::<Token>::try_from(&token_program_info)?;

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

        let mut default_token_account = spl_token::state::Account::default();
        default_token_account.state = AccountState::Initialized;
        default_token_account.amount = 1000;
        let mut default_token_data = vec![0u8; spl_token::state::Account::LEN];
        let mut default_token_lamports = 100;
        spl_token::state::Account::pack_into_slice(&default_token_account, &mut default_token_data);
        let spl_token_info = create_account_info(
            &generic_pubkey,
            false,
            false,
            &mut default_token_lamports,
            &mut default_token_data,
            &token::ID,
            true,
            None,
        );
        let spl_token_account: Account<TokenAccount> = Account::try_from(&spl_token_info)?;

        let mut sp_lamports = 100;
        let mut sp_data = vec![0u8; 10];
        let system_program_info = create_account_info(
            &system_program::ID,
            false,
            false,
            &mut sp_lamports,
            &mut sp_data,
            &system_program::ID,
            true,
            None,
        );
        let system_program = Program::try_from(&system_program_info)?;

        let mut deposit_accounts = Deposit {
            user: Signer::try_from(&user_info)?,
            portfolio: portfolio_account,
            token_details: Account::try_from(&token_details_account)?,
            spl_user_funds_vault: generic_info,
            from: spl_token_account.clone(),
            to: spl_token_account,
            remote: remote_account,
            banned_account: banned_info,
            endpoint_program: endpoint_program_info,
            token_program,
            system_program: system_program.clone(),
        };

        let deposit_params = DepositParams {
            token_mint: Default::default(),
            amount: 50,
            trader: [0u8; 32],
        };

        let program_id_static: &'static Pubkey = Box::leak(Box::new(crate::id()));
        let remaining_accounts: Vec<AccountInfo<'static>> = (0..QUOTE_REMAINING_ACCOUNTS_COUNT)
            .map(|_| create_dummy_account(program_id_static))
            .collect();

        let mut ctx = Context {
            accounts: &mut deposit_accounts,
            remaining_accounts: remaining_accounts.as_slice(),
            program_id: &program_id,
            bumps: DepositBumps::default(),
        };

        let result = deposit(&mut ctx, &deposit_params);
        assert!(result.is_ok());
        Ok(())
    }

    #[test]
    fn test_deposit_negative_cases() -> Result<()> {
        let program_id = crate::id();
        let generic_pubkey = Pubkey::new_unique();

        let user_key = Pubkey::new_unique();
        let portfolio_key = Pubkey::new_unique();
        let remote_key = Pubkey::new_unique();
        let banned_account_key = Pubkey::new_unique();
        let endpoint_program_key = Pubkey::new_unique();

        let mut user_lamports = 100;
        let mut user_data = vec![0u8; 10];
        let user_info = create_account_info(
            &user_key,
            true,
            true,
            &mut user_lamports,
            &mut user_data,
            &program_id,
            false,
            None,
        );

        let mut generic_lamports = 100;
        let mut generic_data = vec![0u8; 10];
        let generic_info = create_account_info(
            &generic_pubkey,
            false,
            false,
            &mut generic_lamports,
            &mut generic_data,
            &program_id,
            false,
            None,
        );

        let hex_str = UNUSED_ADDRESS_PUBLIC_KEY;
        let bytes = hex::decode(hex_str).unwrap();
        let address: [u8; 20] = bytes.try_into().unwrap();
        let mut gc = GlobalConfig {
            allow_deposit: true,
            program_paused: false,
            native_deposits_restricted: false,
            default_chain_id: 0,
            airdrop_amount: 0,
            swap_signer: address,
            out_nonce: 0,
        };
        let portfolio = Portfolio {
            global_config: gc.clone(),
            endpoint: endpoint_program_key,
            bump: 0,
        };
        let mut portfolio_data = portfolio.try_to_vec()?;
        let mut portfolio_lamports = 100;
        let portfolio_info = create_account_info(
            &portfolio_key,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator()),
        );
        let portfolio_account = Account::<Portfolio>::try_from(&portfolio_info)?;

        let mut remote_lamports = 100;
        let mut remote_data = vec![0u8; Remote::SIZE];
        let remote_info = create_account_info(
            &remote_key,
            false,
            true,
            &mut remote_lamports,
            &mut remote_data,
            &program_id,
            false,
            Some(Remote::discriminator()),
        );
        let remote_account = Account::<Remote>::try_from(&remote_info)?;

        let mut banned_lamports = 100;
        let mut banned_data = vec![0u8; 10];
        let banned_owner = Pubkey::new_unique();
        let mut banned_info = create_account_info(
            &banned_account_key,
            false,
            false,
            &mut banned_lamports,
            &mut banned_data,
            &banned_owner,
            false,
            None,
        );

        let mut ep_lamports = 100;
        let mut ep_data = vec![0u8; 10];
        let endpoint_program_info = create_account_info(
            &endpoint_program_key,
            false,
            false,
            &mut ep_lamports,
            &mut ep_data,
            &endpoint_program_key,
            true,
            None,
        );

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
            None,
        );
        let token_program = Program::<Token>::try_from(&token_program_info)?;

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

        let mut default_token_account = spl_token::state::Account::default();
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
            &token::ID,
            true,
            None,
        );
        let spl_token_account: Account<TokenAccount> = Account::try_from(&spl_token_info)?;

        let mut sp_lamports = 100;
        let mut sp_data = vec![0u8; 10];
        let system_program_info = create_account_info(
            &system_program::ID,
            false,
            false,
            &mut sp_lamports,
            &mut sp_data,
            &system_program::ID,
            true,
            None,
        );
        let system_program = Program::try_from(&system_program_info)?;

        let mut deposit_accounts = Deposit {
            user: Signer::try_from(&user_info)?,
            portfolio: portfolio_account,
            token_details: Account::try_from(&token_details_account)?,
            spl_user_funds_vault: generic_info,
            from: spl_token_account.clone(),
            to: spl_token_account,
            remote: remote_account,
            banned_account: banned_info.clone(),
            endpoint_program: endpoint_program_info,
            token_program,
            system_program: system_program.clone(),
        };

        let deposit_params = DepositParams {
            token_mint: Default::default(),
            amount: 50,
            trader: [0u8; 32],
        };

        let program_id_static: &'static Pubkey = Box::leak(Box::new(crate::id()));
        let remaining_accounts: Vec<AccountInfo<'static>> = (0..QUOTE_REMAINING_ACCOUNTS_COUNT)
            .map(|_| create_dummy_account(program_id_static))
            .collect();

        let mut ctx = Context {
            accounts: &mut deposit_accounts.clone(),
            remaining_accounts: remaining_accounts.as_slice(),
            program_id: &program_id,
            bumps: DepositBumps::default(),
        };

        let result = deposit(&mut ctx, &deposit_params);
        assert_eq!(
            result.unwrap_err(),
            DexalotError::NotEnoughSplTokenBalance.into()
        );

        gc.allow_deposit = false;
        let portfolio = Portfolio {
            global_config: gc.clone(),
            endpoint: endpoint_program_key,
            bump: 0,
        };
        let mut portfolio_data = portfolio.try_to_vec()?;
        let mut portfolio_lamports = 100;
        let portfolio_info = create_account_info(
            &portfolio_key,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator()),
        );
        let portfolio_account = Account::<Portfolio>::try_from(&portfolio_info)?;

        deposit_accounts.portfolio = portfolio_account;
        let mut new_accounts = deposit_accounts.clone();
        ctx.accounts = &mut new_accounts;

        let result = deposit(&mut ctx, &deposit_params);
        assert_eq!(result.unwrap_err(), DexalotError::DepositsPaused.into());

        gc.program_paused = true;
        let portfolio = Portfolio {
            global_config: gc,
            endpoint: endpoint_program_key,
            bump: 0,
        };
        let mut portfolio_data = portfolio.try_to_vec()?;
        let mut portfolio_lamports = 100;
        let portfolio_info = create_account_info(
            &portfolio_key,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator()),
        );
        let portfolio_account = Account::<Portfolio>::try_from(&portfolio_info)?;

        deposit_accounts.portfolio = portfolio_account;
        let mut new_accounts = deposit_accounts.clone();
        ctx.accounts = &mut new_accounts;

        let result = deposit(&mut ctx, &deposit_params);
        assert_eq!(result.unwrap_err(), DexalotError::ProgramPaused.into());

        banned_info.owner = &program_id;
        deposit_accounts.banned_account = banned_info;
        let mut new_accounts = deposit_accounts.clone();
        ctx.accounts = &mut new_accounts;

        let result = deposit(&mut ctx, &deposit_params);
        assert_eq!(result.unwrap_err(), DexalotError::AccountBanned.into());
        Ok(())
    }

    #[test]
    fn test_deposit_native_success() -> Result<()> {
        let program_id = crate::id();

        let user_key = Pubkey::new_unique();
        let portfolio_key = Pubkey::new_unique();
        let sol_vault_key = Pubkey::new_unique();
        let remote_key = Pubkey::new_unique();
        let banned_account_key = Pubkey::new_unique();
        let endpoint_program_key = Pubkey::new_unique();

        let mut user_lamports = 100;
        let mut user_data = vec![0u8; 10];
        let user_info = create_account_info(
            &user_key,
            true,
            true,
            &mut user_lamports,
            &mut user_data,
            &program_id,
            false,
            None,
        );

        let hex_str = UNUSED_ADDRESS_PUBLIC_KEY;
        let bytes = hex::decode(hex_str).unwrap();
        let address: [u8; 20] = bytes.try_into().unwrap();
        let gc = GlobalConfig {
            allow_deposit: true,
            program_paused: false,
            native_deposits_restricted: false,
            default_chain_id: 0,
            airdrop_amount: 0,
            swap_signer: address,
            out_nonce: 0,
        };
        let portfolio = Portfolio {
            global_config: gc,
            endpoint: endpoint_program_key,
            bump: 0,
        };
        let mut portfolio_data = portfolio.try_to_vec()?;
        let mut portfolio_lamports = 100;
        let portfolio_info = create_account_info(
            &portfolio_key,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator()),
        );
        let portfolio_account = Account::<Portfolio>::try_from(&portfolio_info)?;

        let mut sol_vault_lamports = 500;
        let mut sol_vault_data = vec![0u8; 10];
        let sol_vault_info = create_account_info(
            &sol_vault_key,
            false,
            true,
            &mut sol_vault_lamports,
            &mut sol_vault_data,
            &system_program::ID,
            false,
            None,
        );
        let sol_vault = SystemAccount::try_from(&sol_vault_info)?;

        let mut remote_lamports = 100;
        let mut remote_data = vec![0u8; Remote::SIZE];
        let remote_info = create_account_info(
            &remote_key,
            false,
            true,
            &mut remote_lamports,
            &mut remote_data,
            &program_id,
            false,
            Some(Remote::discriminator()),
        );
        let remote_account = Account::<Remote>::try_from(&remote_info)?;

        let mut banned_lamports = 100;
        let mut banned_data = vec![0u8; 10];
        let banned_owner = Pubkey::new_unique();
        let banned_info = create_account_info(
            &banned_account_key,
            false,
            false,
            &mut banned_lamports,
            &mut banned_data,
            &banned_owner,
            false,
            None,
        );

        let mut ep_lamports = 100;
        let mut ep_data = vec![0u8; 10];
        let endpoint_program_info = create_account_info(
            &endpoint_program_key,
            false,
            false,
            &mut ep_lamports,
            &mut ep_data,
            &endpoint_program_key,
            true,
            None,
        );

        let mut sp_lamports = 100;
        let mut sp_data = vec![0u8; 10];
        let system_program_info = create_account_info(
            &system_program::ID,
            false,
            false,
            &mut sp_lamports,
            &mut sp_data,
            &system_program::ID,
            true,
            None,
        );
        let system_program = Program::try_from(&system_program_info)?;

        let mut deposit_native_accounts = DepositNative {
            user: Signer::try_from(&user_info)?,
            portfolio: portfolio_account,
            sol_vault,
            system_program: system_program.clone(),
            remote: remote_account,
            banned_account: banned_info,
            endpoint_program: endpoint_program_info,
        };

        let deposit_native_params = DepositNativeParams {
            amount: 50,
            trader: [0u8; 32],
        };

        let program_id_static: &'static Pubkey = Box::leak(Box::new(crate::id()));
        let remaining_accounts: Vec<AccountInfo<'static>> = (0..QUOTE_REMAINING_ACCOUNTS_COUNT)
            .map(|_| create_dummy_account(program_id_static))
            .collect();

        let mut ctx = Context {
            accounts: &mut deposit_native_accounts,
            remaining_accounts: remaining_accounts.as_slice(),
            program_id: &program_id,
            bumps: DepositNativeBumps::default(),
        };

        let result = deposit_native(&mut ctx, &deposit_native_params);
        assert!(result.is_ok());
        Ok(())
    }

    #[test]
    fn test_deposit_native_negative_cases() -> Result<()> {
        let program_id = crate::id();

        let user_key = Pubkey::new_unique();
        let portfolio_key = Pubkey::new_unique();
        let sol_vault_key = Pubkey::new_unique();
        let remote_key = Pubkey::new_unique();
        let banned_account_key = Pubkey::new_unique();
        let endpoint_program_key = Pubkey::new_unique();

        let mut user_lamports = 100;
        let mut user_data = vec![0u8; 10];
        let user_info = create_account_info(
            &user_key,
            true,
            true,
            &mut user_lamports,
            &mut user_data,
            &program_id,
            false,
            None,
        );

        let hex_str = UNUSED_ADDRESS_PUBLIC_KEY;
        let bytes = hex::decode(hex_str).unwrap();
        let address: [u8; 20] = bytes.try_into().unwrap();
        let mut gc = GlobalConfig {
            allow_deposit: true,
            program_paused: false,
            native_deposits_restricted: false,
            default_chain_id: 0,
            airdrop_amount: 0,
            swap_signer: address,
            out_nonce: 0,
        };
        let portfolio = Portfolio {
            global_config: gc.clone(),
            endpoint: endpoint_program_key,
            bump: 0,
        };
        let mut portfolio_data = portfolio.try_to_vec()?;
        let mut portfolio_lamports = 100;
        let portfolio_info = create_account_info(
            &portfolio_key,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator()),
        );
        let portfolio_account = Account::<Portfolio>::try_from(&portfolio_info)?;

        let mut sol_vault_lamports = 500;
        let mut sol_vault_data = vec![0u8; 10];
        let sol_vault_info = create_account_info(
            &sol_vault_key,
            false,
            true,
            &mut sol_vault_lamports,
            &mut sol_vault_data,
            &system_program::ID,
            false,
            None,
        );
        let sol_vault = SystemAccount::try_from(&sol_vault_info)?;

        let mut remote_lamports = 100;
        let mut remote_data = vec![0u8; Remote::SIZE];
        let remote_info = create_account_info(
            &remote_key,
            false,
            true,
            &mut remote_lamports,
            &mut remote_data,
            &program_id,
            false,
            Some(Remote::discriminator()),
        );
        let remote_account = Account::<Remote>::try_from(&remote_info)?;

        let mut banned_lamports = 100;
        let mut banned_data = vec![0u8; 10];
        let banned_owner = Pubkey::new_unique();
        let mut banned_info = create_account_info(
            &banned_account_key,
            false,
            false,
            &mut banned_lamports,
            &mut banned_data,
            &banned_owner,
            false,
            None,
        );

        let mut ep_lamports = 100;
        let mut ep_data = vec![0u8; 10];
        let endpoint_program_info = create_account_info(
            &endpoint_program_key,
            false,
            false,
            &mut ep_lamports,
            &mut ep_data,
            &endpoint_program_key,
            true,
            None,
        );

        let mut sp_lamports = 100;
        let mut sp_data = vec![0u8; 10];
        let system_program_info = create_account_info(
            &system_program::ID,
            false,
            false,
            &mut sp_lamports,
            &mut sp_data,
            &system_program::ID,
            true,
            None,
        );
        let system_program = Program::try_from(&system_program_info)?;

        let mut deposit_native_accounts = DepositNative {
            user: Signer::try_from(&user_info)?,
            portfolio: portfolio_account,
            sol_vault,
            system_program: system_program.clone(),
            remote: remote_account,
            banned_account: banned_info.clone(),
            endpoint_program: endpoint_program_info,
        };

        let deposit_native_params = DepositNativeParams {
            amount: 5000,
            trader: [0u8; 32],
        };

        let program_id_static: &'static Pubkey = Box::leak(Box::new(crate::id()));
        let remaining_accounts: Vec<AccountInfo> = (0..QUOTE_REMAINING_ACCOUNTS_COUNT)
            .map(|_| create_dummy_account(&program_id_static))
            .collect();

        let mut ctx = Context {
            accounts: &mut deposit_native_accounts.clone(),
            remaining_accounts: remaining_accounts.as_slice(),
            program_id: &program_id,
            bumps: DepositNativeBumps::default(),
        };

        let result = deposit_native(&mut ctx, &deposit_native_params);
        assert_eq!(
            result.unwrap_err(),
            DexalotError::NotEnoughNativeBalance.into()
        );

        gc.native_deposits_restricted = true;
        let portfolio = Portfolio {
            global_config: gc.clone(),
            endpoint: endpoint_program_key,
            bump: 0,
        };
        let mut portfolio_data = portfolio.try_to_vec()?;
        let mut portfolio_lamports = 100;
        let portfolio_info = create_account_info(
            &portfolio_key,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator()),
        );
        let portfolio_account = Account::<Portfolio>::try_from(&portfolio_info)?;

        deposit_native_accounts.portfolio = portfolio_account;
        let mut new_accounts = deposit_native_accounts.clone();
        ctx.accounts = &mut new_accounts;

        let result = deposit_native(&mut ctx, &deposit_native_params);
        assert_eq!(
            result.unwrap_err(),
            DexalotError::NativeDepositNotAllowed.into()
        );

        gc.allow_deposit = false;
        let portfolio = Portfolio {
            global_config: gc.clone(),
            endpoint: endpoint_program_key,
            bump: 0,
        };
        let mut portfolio_data = portfolio.try_to_vec()?;
        let mut portfolio_lamports = 100;
        let portfolio_info = create_account_info(
            &portfolio_key,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator()),
        );
        let portfolio_account = Account::<Portfolio>::try_from(&portfolio_info)?;

        deposit_native_accounts.portfolio = portfolio_account;
        let mut new_accounts = deposit_native_accounts.clone();
        ctx.accounts = &mut new_accounts;

        let result = deposit_native(&mut ctx, &deposit_native_params);
        assert_eq!(result.unwrap_err(), DexalotError::DepositsPaused.into());

        gc.program_paused = true;
        let portfolio = Portfolio {
            global_config: gc,
            endpoint: endpoint_program_key,
            bump: 0,
        };
        let mut portfolio_data = portfolio.try_to_vec()?;
        let mut portfolio_lamports = 100;
        let portfolio_info = create_account_info(
            &portfolio_key,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator()),
        );
        let portfolio_account = Account::<Portfolio>::try_from(&portfolio_info)?;

        deposit_native_accounts.portfolio = portfolio_account;
        let mut new_accounts = deposit_native_accounts.clone();
        ctx.accounts = &mut new_accounts;

        let result = deposit_native(&mut ctx, &deposit_native_params);
        assert_eq!(result.unwrap_err(), DexalotError::ProgramPaused.into());

        banned_info.owner = &program_id;
        deposit_native_accounts.banned_account = banned_info;
        let mut new_accounts = deposit_native_accounts.clone();
        ctx.accounts = &mut new_accounts;

        let result = deposit_native(&mut ctx, &deposit_native_params);
        assert_eq!(result.unwrap_err(), DexalotError::AccountBanned.into());
        Ok(())
    }

    #[test]
    fn test_deposit_airdrop_success() -> Result<()> {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let portfolio_key = Pubkey::new_unique();
        let airdrop_vault_key = Pubkey::new_unique();
        let endpoint_key = Pubkey::new_unique();

        let mut authority_lamports = 1000;
        let mut authority_data = vec![0u8; 10];
        let authority_info = create_account_info(
            &authority_key,
            true,
            true,
            &mut authority_lamports,
            &mut authority_data,
            &program_id,
            false,
            None,
        );

        let gc = GlobalConfig {
            allow_deposit: true,
            program_paused: false,
            native_deposits_restricted: false,
            default_chain_id: 0,
            airdrop_amount: 0,
            swap_signer: [0_u8;20],
            out_nonce: 0,
        };
        let portfolio = Portfolio {
            global_config: gc,
            endpoint: endpoint_key,
            bump: 0,
        };
        let mut portfolio_data = portfolio.try_to_vec()?;

        let mut portfolio_lamports = 100;

        let portfolio_info = create_account_info(
            &portfolio_key,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator()),
        );
        let portfolio_account = Account::<Portfolio>::try_from(&portfolio_info)?;

        let mut av_lamports = 500;
        let mut av_data = vec![0u8; 10];
        let airdrop_vault_info = create_account_info(
            &airdrop_vault_key,
            false,
            true,
            &mut av_lamports,
            &mut av_data,
            &system_program::ID,
            false,
            None,
        );
        let airdrop_vault = SystemAccount::try_from(&airdrop_vault_info)?;

        let mut sp_lamports = 100;
        let mut sp_data = vec![0u8; 10];
        let system_program_info = create_account_info(
            &system_program::ID,
            false,
            false,
            &mut sp_lamports,
            &mut sp_data,
            &system_program::ID,
            true,
            None,
        );
        let system_program = Program::try_from(&system_program_info)?;

        let admin_pda =
            Pubkey::find_program_address(&[ADMIN_SEED, authority_key.as_ref()], &program_id).0;
        let mut admin_lamports = 100;
        let mut admin_data = vec![0u8; 10];
        let admin_info = create_account_info(
            &admin_pda,
            false,
            true,
            &mut admin_lamports,
            &mut admin_data,
            &program_id,
            false,
            None,
        );

        let mut deposit_airdrop_accounts = DepositAirdrop {
            authority: Signer::try_from(&authority_info)?,
            portfolio: portfolio_account,
            airdrop_vault,
            system_program,
            admin: admin_info,
        };

        let deposit_airdrop_params = DepositAirdropParams { amount: 50 };

        let mut ctx = Context {
            accounts: &mut deposit_airdrop_accounts,
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: DepositAirdropBumps::default(),
        };

        let result = deposit_airdrop(&mut ctx, &deposit_airdrop_params);
        assert!(result.is_ok());
        Ok(())
    }

    #[test]
    fn test_deposit_airdrop_negative_cases() -> Result<()> {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let portfolio_key = Pubkey::new_unique();
        let airdrop_vault_key = Pubkey::new_unique();

        let mut authority_lamports = 1000;
        let mut authority_data = vec![0u8; 10];
        let authority_info = create_account_info(
            &authority_key,
            true,
            true,
            &mut authority_lamports,
            &mut authority_data,
            &program_id,
            false,
            None,
        );

        let hex_str = UNUSED_ADDRESS_PUBLIC_KEY;
        let bytes = hex::decode(hex_str).unwrap();
        let address: [u8; 20] = bytes.try_into().unwrap();
        let mut gc = GlobalConfig {
            allow_deposit: true,
            program_paused: false,
            native_deposits_restricted: false,
            default_chain_id: 0,
            airdrop_amount: 0,
            swap_signer: address,
            out_nonce: 0,
        };
        let portfolio = Portfolio {
            global_config: gc.clone(),
            endpoint: Pubkey::default(),
            bump: 0,
        };
        let mut portfolio_data = portfolio.try_to_vec()?;
        let mut portfolio_lamports = 100;
        let portfolio_info = create_account_info(
            &portfolio_key,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator()),
        );
        let portfolio_account = Account::<Portfolio>::try_from(&portfolio_info)?;

        let mut av_lamports = 500;
        let mut av_data = vec![0u8; 10];
        let airdrop_vault_info = create_account_info(
            &airdrop_vault_key,
            false,
            true,
            &mut av_lamports,
            &mut av_data,
            &system_program::ID,
            false,
            None,
        );
        let airdrop_vault = SystemAccount::try_from(&airdrop_vault_info)?;

        let mut sp_lamports = 100;
        let mut sp_data = vec![0u8; 10];
        let system_program_info = create_account_info(
            &system_program::ID,
            false,
            false,
            &mut sp_lamports,
            &mut sp_data,
            &system_program::ID,
            true,
            None,
        );
        let system_program = Program::try_from(&system_program_info)?;

        let admin_pda =
            Pubkey::find_program_address(&[ADMIN_SEED, authority_key.as_ref()], &program_id).0;
        let mut admin_lamports = 100;
        let mut admin_data = vec![0u8; 10];
        let admin_info = create_account_info(
            &admin_pda,
            false,
            true,
            &mut admin_lamports,
            &mut admin_data,
            &program_id,
            false,
            None,
        );

        let mut deposit_airdrop_accounts = DepositAirdrop {
            authority: Signer::try_from(&authority_info)?,
            portfolio: portfolio_account,
            airdrop_vault,
            system_program,
            admin: admin_info,
        };

        let deposit_airdrop_params = DepositAirdropParams { amount: 5000 };

        let mut ctx = Context {
            accounts: &mut deposit_airdrop_accounts.clone(),
            remaining_accounts: &[],
            program_id: &program_id,
            bumps: DepositAirdropBumps::default(),
        };

        let result = deposit_airdrop(&mut ctx, &deposit_airdrop_params);
        assert_eq!(
            result.unwrap_err(),
            DexalotError::NotEnoughNativeBalance.into()
        );

        gc.native_deposits_restricted = true;
        let portfolio = Portfolio {
            global_config: gc.clone(),
            endpoint: Pubkey::default(),
            bump: 0,
        };
        let mut portfolio_data = portfolio.try_to_vec()?;
        let mut portfolio_lamports = 100;
        let portfolio_info = create_account_info(
            &portfolio_key,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator()),
        );
        let portfolio_account = Account::<Portfolio>::try_from(&portfolio_info)?;

        deposit_airdrop_accounts.portfolio = portfolio_account;
        let mut new_accounts = deposit_airdrop_accounts.clone();
        ctx.accounts = &mut new_accounts;

        let result = deposit_airdrop(&mut ctx, &deposit_airdrop_params);
        assert_eq!(
            result.unwrap_err(),
            DexalotError::NativeDepositNotAllowed.into()
        );

        gc.program_paused = true;
        let portfolio = Portfolio {
            global_config: gc,
            endpoint: Pubkey::default(),
            bump: 0,
        };
        let mut portfolio_data = portfolio.try_to_vec()?;
        let mut portfolio_lamports = 100;
        let portfolio_info = create_account_info(
            &portfolio_key,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator()),
        );
        let portfolio_account = Account::<Portfolio>::try_from(&portfolio_info)?;

        deposit_airdrop_accounts.portfolio = portfolio_account;
        let mut new_accounts = deposit_airdrop_accounts.clone();
        ctx.accounts = &mut new_accounts;

        let result = deposit_airdrop(&mut ctx, &deposit_airdrop_params);
        assert_eq!(result.unwrap_err(), DexalotError::ProgramPaused.into());
        Ok(())
    }
}
