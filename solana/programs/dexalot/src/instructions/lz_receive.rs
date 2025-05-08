use std::str::FromStr;

use crate::{
    consts::{
        AIRDROP_VAULT_SEED, CLEAR_MIN_ACCOUNTS_LEN, ENDPOINT_CLEAR, ENDPOINT_ID,
        NATIVE_VAULT_MIN_THRESHOLD, PENDING_SWAPS_SEED, PORTFOLIO_SEED, SOL_USER_FUNDS_VAULT_SEED,
        SOL_VAULT_SEED, SPL_USER_FUNDS_VAULT_SEED, SPL_VAULT_SEED, TOKEN_LIST_PAGE_1_SEED,
        TOKEN_LIST_SEED,
    },
    cpi_utils::{create_instruction_data, ClearParams},
    errors::DexalotError,
    events::{SolTransfer, SolTransferTransactions},
    state::{Portfolio, TokenList},
    xfer::Tx,
    *,
};
use anchor_lang::{
    prelude::*,
    solana_program::{instruction::Instruction, program::invoke_signed, system_instruction},
};
use anchor_spl::{
    associated_token::{
        spl_associated_token_account::instruction::create_associated_token_account, AssociatedToken,
    },
    token::Token,
};

#[derive(Accounts, Clone)]
#[instruction(params: LzReceiveParams)]
pub struct LzReceive<'info> {
    #[account(seeds = [PORTFOLIO_SEED], bump = portfolio.bump)]
    pub portfolio: Account<'info, Portfolio>,
    /// CHECK: Used to set the program as authority for the associated token account
    #[account(
        seeds = [if XFERSolana::unpack_xfer_message(&params.message)?.transaction == Tx::CCTrade{SPL_VAULT_SEED}else{SPL_USER_FUNDS_VAULT_SEED}],
        bump,
    )]
    pub token_vault: AccountInfo<'info>,
    /// CHECK: the sol vault
    #[account(
        mut,
        seeds = [if XFERSolana::unpack_xfer_message(&params.message)?.transaction == Tx::CCTrade{SOL_VAULT_SEED}else{SOL_USER_FUNDS_VAULT_SEED}],
        bump,
    )]
    pub native_vault: AccountInfo<'info>,
    /// CHECK: ata or solvault
    #[account(mut)]
    pub from: AccountInfo<'info>,
    /// CHECK: ata or trader
    #[account(mut)]
    pub to: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    #[account(
        seeds = [TOKEN_LIST_SEED, TOKEN_LIST_PAGE_1_SEED.as_ref()],
        bump
    )]
    pub token_list: Account<'info, TokenList>,
    /// CHECK: the trader account
    #[account(mut)]
    pub trader: AccountInfo<'info>,
    #[account(mut, seeds = [AIRDROP_VAULT_SEED], bump)]
    pub airdrop_vault: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
    /// CHECK: token mint or default pubkey
    pub token_mint: AccountInfo<'info>,
    /// CHECK: when calling the instruction
    #[account(mut,
        seeds = [
            PENDING_SWAPS_SEED,
            &generate_map_entry_key(custom_data_to_nonce(XFERSolana::unpack_xfer_message(&params.message)?.custom_data),
            XFERSolana::unpack_xfer_message(&params.message)?.trader)?], bump
        )]
    pub swap_queue_entry: AccountInfo<'info>,
}

pub fn lz_receive(ctx: &mut Context<LzReceive>, params: &LzReceiveParams) -> Result<()> {
    let global_config = &ctx.accounts.portfolio.global_config;
    let airdrop_vault = &ctx.accounts.airdrop_vault;
    let system_program = &ctx.accounts.system_program;
    let trader = &ctx.accounts.trader;
    let swap_queue_entry = &ctx.accounts.swap_queue_entry;
    let native_vault = &ctx.accounts.native_vault;

    // check if program is paused
    require!(
        !global_config.program_paused,
        DexalotError::ProgramPaused
    );

    let accounts_metas: Vec<AccountMeta> = ctx.remaining_accounts[0..CLEAR_MIN_ACCOUNTS_LEN]
        .iter()
        .skip(1) // an account is skipped because we don't use layerzero cpi utils so it's not needed
        .map(|account| AccountMeta {
            pubkey: *account.key,
            is_signer: account.key() == ctx.accounts.portfolio.key() || account.is_signer,
            is_writable: account.is_writable,
        })
        .collect();

    let seeds: &[&[&[u8]]] = &[&[PORTFOLIO_SEED, &[ctx.accounts.portfolio.bump]]];

    let clear_params = ClearParams {
        receiver: ctx.accounts.portfolio.key(),
        src_eid: params.src_eid,
        sender: params.sender,
        nonce: params.nonce,
        guid: params.guid,
        message: params.message.clone(),
    };

    let cpi_data = create_instruction_data(&clear_params, ENDPOINT_CLEAR)?;

    // Invoke Layerzero program
    if cfg!(not(test)) {
        invoke_signed(
            &Instruction {
                program_id: Pubkey::from_str(ENDPOINT_ID).unwrap(), // we provide the correct publickey
                accounts: accounts_metas,
                data: cpi_data,
            },
            ctx.remaining_accounts,
            seeds,
        )?;
    }
    // Decode xfer
    let xfer = XFERSolana::unpack_xfer_message(params.message.as_slice())?;

    // check if token is supported
    let token_list = &ctx.accounts.token_list;

    let is_native_withdraw = xfer.token_mint == Pubkey::default();

    // Check if token is supported
    if !is_native_withdraw {
        require!(
            token_list.tokens.contains(&xfer.token_mint),
            DexalotError::TokenNotSupported
        );
    }

    // Start airdrop
    let should_airdrop = (xfer.custom_data[0] & 0x80) != 0; // check if the most significant bit is 1
    let airdrop_vault_seeds: &[&[&[u8]]] = &[&[AIRDROP_VAULT_SEED, &[ctx.bumps.airdrop_vault]]];

    if should_airdrop {
        require!(
            airdrop_vault.lamports() >= global_config.airdrop_amount + NATIVE_VAULT_MIN_THRESHOLD,
            DexalotError::NotEnoughNativeBalance
        );

        let ix = system_instruction::transfer(
            &airdrop_vault.key(),
            &xfer.trader,
            global_config.airdrop_amount,
        );

        if cfg!(not(test)) {
            invoke_signed(
                &ix,
                &[
                    airdrop_vault.to_account_info(),
                    trader.to_account_info(),
                    system_program.to_account_info(),
                ],
                airdrop_vault_seeds,
            )?;
        }

        emit!(SolTransfer {
            amount: global_config.airdrop_amount,
            transaction: SolTransferTransactions::Withdraw,
            transfer_type: events::SolTransferTypes::Airdrop
        });
    }

    // xfer checks
    require!(
        xfer.quantity > 0u64,
        DexalotError::ZeroTokenQuantity
    );
    require!(
        xfer.trader != Pubkey::default(),
        DexalotError::InvalidTrader
    );

    if is_native_withdraw {
        // Start native withdraw
        process_xfer_payload_native(
            &xfer,
            ctx.bumps.native_vault,
            native_vault,
            trader,
            swap_queue_entry,
            system_program,
            airdrop_vault,
            ctx.bumps.airdrop_vault,
            false,
        )?;
    } else {
        let from = &ctx.accounts.from;
        let to = &ctx.accounts.to;
        let token_program = &ctx.accounts.token_program;
        let token_vault = &ctx.accounts.token_vault;

        let trader = &ctx.accounts.trader;
        let token_mint = &ctx.accounts.token_mint;
        let associated_token_program = &ctx.accounts.associated_token_program;

        // Create ATA if needed
        let create_ata_accounts = CreateATA::new(
            to.clone(),
            airdrop_vault.to_account_info(),
            trader.clone(),
            token_mint.clone(),
            token_program.to_account_info(),
            associated_token_program.to_account_info(),
            system_program.to_account_info(),
        );
        create_ata_if_needed(create_ata_accounts, airdrop_vault_seeds)?;

        let token_vault_seeds = if xfer.transaction == Tx::CCTrade {
            SPL_VAULT_SEED
        } else {
            SPL_USER_FUNDS_VAULT_SEED
        };

        process_xfer_payload_spl(
            &xfer,
            ctx.bumps.token_vault,
            token_vault_seeds,
            token_vault,
            ctx.bumps.airdrop_vault,
            &airdrop_vault,
            from,
            to,
            token_program,
            swap_queue_entry,
            system_program,
            false,
        )?;
    }

    Ok(())
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct LzReceiveParams {
    pub src_eid: u32,
    pub sender: [u8; 32],
    pub nonce: u64,
    pub guid: [u8; 32],
    pub message: Vec<u8>,
    pub extra_data: Vec<u8>,
}

fn create_ata_if_needed<'info>(
    accounts: CreateATA<'info>,
    airdrop_vault_seeds: &[&[&[u8]]],
) -> Result<()> {
    if !accounts.associated_token_account.data_is_empty() {
        return Ok(());
    }
    let ix = create_associated_token_account(
        &accounts.airdrop_vault.key(),
        &accounts.trader.key(),
        &accounts.token_mint.key(),
        &accounts.token_program.key(),
    );

    if cfg!(not(test)) {
        invoke_signed(
            &ix,
            &[
                accounts.associated_token_account,
                accounts.airdrop_vault,
                accounts.trader,
                accounts.token_mint,
                accounts.token_program,
                accounts.associated_token_program,
                accounts.system_program,
            ],
            airdrop_vault_seeds,
        )?;
    }
    Ok(())
}

struct CreateATA<'info> {
    associated_token_account: AccountInfo<'info>,
    airdrop_vault: AccountInfo<'info>,
    trader: AccountInfo<'info>,
    token_mint: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    associated_token_program: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
}

impl<'info> CreateATA<'info> {
    fn new(
        associated_token_account: AccountInfo<'info>,
        airdrop_vault: AccountInfo<'info>,
        trader: AccountInfo<'info>,
        token_mint: AccountInfo<'info>,
        token_program: AccountInfo<'info>,
        associated_token_program: AccountInfo<'info>,
        system_program: AccountInfo<'info>,
    ) -> Self {
        Self {
            associated_token_account,
            airdrop_vault,
            trader,
            token_mint,
            token_program,
            associated_token_program,
            system_program,
        }
    }
}

#[cfg(test)]
mod tests {
    use anchor_lang::Discriminator;
    use super::*;
    use anchor_lang::solana_program::{system_program, pubkey::Pubkey};
    use anchor_lang::solana_program::program_pack::Pack;
    use anchor_spl::token::{spl_token, Token};
    use anchor_spl::associated_token::AssociatedToken;
    use anchor_spl::token::spl_token::state::AccountState;
    use crate::state::{GlobalConfig, Portfolio, TokenList};
    use crate::test_utils::{create_account_info, create_dummy_account};
    use crate::xfer::XChainMsgType;

    #[test]
    fn test_lz_receive_success() -> Result<()> {
        let program_id = id();
        let generic_key = Pubkey::new_unique();

        let gc = GlobalConfig {
            allow_deposit: true,
            program_paused: false,
            native_deposits_restricted: false,
            default_chain_id: 1,
            airdrop_amount: 0,
            swap_signer: [0; 20],
            out_nonce: 0,
        };
        let portfolio = Portfolio {
            global_config: gc,
            endpoint: Pubkey::default(),
            bump: 1,
        };
        let mut portfolio_data = portfolio.try_to_vec()?;
        let mut portfolio_lamports = 100;
        let portfolio_info = create_account_info(
            &generic_key,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator()),
        );
        let portfolio_account = Account::<Portfolio>::try_from(&portfolio_info)?;

        let token_list = TokenList { next_page: None, tokens: vec![generic_key] };
        let mut token_list_data = token_list.try_to_vec()?;
        let mut token_list_lamports = 100;
        let token_list_info = create_account_info(
            &generic_key,
            false,
            true,
            &mut token_list_lamports,
            &mut token_list_data,
            &program_id,
            false,
            Some(TokenList::discriminator()),
        );
        let token_list_account = Account::<TokenList>::try_from(&token_list_info)?;

        let mut default_token_account = spl_token::state::Account::default();
        default_token_account.state = AccountState::Initialized;
        let mut default_token_data = vec![0u8; spl_token::state::Account::LEN];
        let mut default_token_lamports = 100;
        spl_token::state::Account::pack_into_slice(&default_token_account, &mut default_token_data);
        let spl_token_info = create_account_info(
            &generic_key,
            false,
            false,
            &mut default_token_lamports,
            &mut default_token_data,
            &anchor_spl::token::ID,
            true,
            None
        );

        let mut to_data = vec![];
        let mut to_lamports = 100;
        let to_info = create_account_info(
            &generic_key,
            false,
            false,
            &mut to_lamports,
            &mut to_data,
            &program_id,
            false,
            None,
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
            None,
        );
        let mut native_vault_data = vec![0u8; 100];
        let mut native_vault_lamports = 500;
        let native_vault_info = create_account_info(
            &generic_key,
            false,
            true,
            &mut native_vault_lamports,
            &mut native_vault_data,
            &system_program::ID,
            false,
            None,
        );
        let mut token_program_data = vec![0u8; 100];
        let mut token_program_lamports = 100;
        let token_program_info = create_account_info(
            &anchor_spl::token::ID,
            false,
            false,
            &mut token_program_lamports,
            &mut token_program_data,
            &anchor_spl::token::ID,
            true,
            None,
        );
        let token_program = Program::<Token>::try_from(&token_program_info)?;
        let mut associated_token_data = vec![0u8; 100];
        let mut associated_token_lamports = 100;
        let associated_token_program_info = create_account_info(
            &anchor_spl::associated_token::ID,
            false,
            false,
            &mut associated_token_lamports,
            &mut associated_token_data,
            &anchor_spl::associated_token::ID,
            true,
            None,
        );
        let associated_token_program =
            Program::<AssociatedToken>::try_from(&associated_token_program_info)?;
        let mut airdrop_vault_data = vec![0u8; 100];
        let mut airdrop_vault_lamports = 1000 + NATIVE_VAULT_MIN_THRESHOLD;
        let airdrop_vault_info = create_account_info(
            &generic_key,
            false,
            true,
            &mut airdrop_vault_lamports,
            &mut airdrop_vault_data,
            &system_program::ID,
            false,
            None,
        );
        let airdrop_vault = SystemAccount::try_from(&airdrop_vault_info)?;
        let mut system_program_data = vec![0u8; 100];
        let mut system_program_lamports = 100;
        let system_program_info = create_account_info(
            &system_program::ID,
            false,
            false,
            &mut system_program_lamports,
            &mut system_program_data,
            &system_program::ID,
            true,
            None,
        );
        let system_program = Program::<System>::try_from(&system_program_info)?;

        let xfer = XFERSolana {
            nonce: 0,
            transaction: Tx::IxferRec,
            token_mint: generic_key,
            quantity: 1,
            trader: generic_key.clone(),
            custom_data: [255u8; 18],
            timestamp: 0,
            message_type: XChainMsgType::XFER,
        };

        let message = xfer._pack_xfer_message()?;

        let params = LzReceiveParams {
            src_eid: 1,
            sender: [0u8; 32],
            nonce: 1,
            guid: [0u8; 32],
            message,
            extra_data: vec![],
        };

        let program_id_static: &'static Pubkey = Box::leak(Box::new(id()));
        let remaining_accounts: Vec<AccountInfo> = (0..CLEAR_MIN_ACCOUNTS_LEN)
            .map(|_| create_dummy_account(&program_id_static))
            .collect();

        let mut lz_receive_accounts = LzReceive {
            portfolio: portfolio_account,
            token_vault: generic_info.clone(),
            native_vault: native_vault_info,
            from: spl_token_info,
            to: to_info,
            token_program,
            associated_token_program,
            token_list: token_list_account,
            trader: generic_info.clone(),
            airdrop_vault,
            system_program,
            token_mint: generic_info.clone(),
            swap_queue_entry: generic_info,
        };

        let mut ctx = Context {
            accounts: &mut lz_receive_accounts,
            remaining_accounts: remaining_accounts.as_slice(),
            program_id: &program_id,
            bumps: LzReceiveBumps::default(),
        };

        let result = lz_receive(&mut ctx, &params);
        assert!(result.is_ok());
        Ok(())
    }

    #[test]
    fn test_lz_receive_success_no_ata() -> Result<()> {
        let program_id = id();
        let generic_key = Pubkey::new_unique();

        let gc = GlobalConfig {
            allow_deposit: true,
            program_paused: false,
            native_deposits_restricted: false,
            default_chain_id: 1,
            airdrop_amount: 0,
            swap_signer: [0; 20],
            out_nonce: 0,
        };
        let portfolio = Portfolio {
            global_config: gc,
            endpoint: Pubkey::default(),
            bump: 1,
        };
        let mut portfolio_data = portfolio.try_to_vec()?;
        let mut portfolio_lamports = 100;
        let portfolio_info = create_account_info(
            &generic_key,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator()),
        );
        let portfolio_account = Account::<Portfolio>::try_from(&portfolio_info)?;

        let token_list = TokenList { next_page: None, tokens: vec![generic_key] };
        let mut token_list_data = token_list.try_to_vec()?;
        let mut token_list_lamports = 100;
        let token_list_info = create_account_info(
            &generic_key,
            false,
            true,
            &mut token_list_lamports,
            &mut token_list_data,
            &program_id,
            false,
            Some(TokenList::discriminator()),
        );
        let token_list_account = Account::<TokenList>::try_from(&token_list_info)?;

        let mut default_token_account = spl_token::state::Account::default();
        default_token_account.state = AccountState::Initialized;
        default_token_account.amount = 2;
        let mut default_token_data = vec![0u8; spl_token::state::Account::LEN];
        let mut default_token_lamports = 100;
        spl_token::state::Account::pack_into_slice(&default_token_account, &mut default_token_data);
        let spl_token_info = create_account_info(
            &generic_key,
            false,
            false,
            &mut default_token_lamports,
            &mut default_token_data,
            &anchor_spl::token::ID,
            true,
            None
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
            None,
        );
        let mut native_vault_data = vec![0u8; 100];
        let mut native_vault_lamports = 500;
        let native_vault_info = create_account_info(
            &generic_key,
            false,
            true,
            &mut native_vault_lamports,
            &mut native_vault_data,
            &system_program::ID,
            false,
            None,
        );
        let mut token_program_data = vec![0u8; 100];
        let mut token_program_lamports = 100;
        let token_program_info = create_account_info(
            &anchor_spl::token::ID,
            false,
            false,
            &mut token_program_lamports,
            &mut token_program_data,
            &anchor_spl::token::ID,
            true,
            None,
        );
        let token_program = Program::<Token>::try_from(&token_program_info)?;
        let mut associated_token_data = vec![0u8; 100];
        let mut associated_token_lamports = 100;
        let associated_token_program_info = create_account_info(
            &anchor_spl::associated_token::ID,
            false,
            false,
            &mut associated_token_lamports,
            &mut associated_token_data,
            &anchor_spl::associated_token::ID,
            true,
            None,
        );
        let associated_token_program =
            Program::<AssociatedToken>::try_from(&associated_token_program_info)?;
        let mut airdrop_vault_data = vec![0u8; 100];
        let mut airdrop_vault_lamports = 1000 + NATIVE_VAULT_MIN_THRESHOLD;
        let airdrop_vault_info = create_account_info(
            &generic_key,
            false,
            true,
            &mut airdrop_vault_lamports,
            &mut airdrop_vault_data,
            &system_program::ID,
            false,
            None,
        );
        let airdrop_vault = SystemAccount::try_from(&airdrop_vault_info)?;
        let mut system_program_data = vec![0u8; 100];
        let mut system_program_lamports = 100;
        let system_program_info = create_account_info(
            &system_program::ID,
            false,
            false,
            &mut system_program_lamports,
            &mut system_program_data,
            &system_program::ID,
            true,
            None,
        );
        let system_program = Program::<System>::try_from(&system_program_info)?;

        let xfer = XFERSolana {
            nonce: 0,
            transaction: Tx::CCTrade,
            token_mint: generic_key,
            quantity: 1,
            trader: generic_key.clone(),
            custom_data: [1u8; 18],
            timestamp: 0,
            message_type: XChainMsgType::XFER,
        };

        let message = xfer._pack_xfer_message()?;

        let params = LzReceiveParams {
            src_eid: 1,
            sender: [0u8; 32],
            nonce: 1,
            guid: [0u8; 32],
            message,
            extra_data: vec![],
        };

        let program_id_static: &'static Pubkey = Box::leak(Box::new(id()));
        let remaining_accounts: Vec<AccountInfo> = (0..CLEAR_MIN_ACCOUNTS_LEN)
            .map(|_| create_dummy_account(&program_id_static))
            .collect();

        let mut lz_receive_accounts = LzReceive {
            portfolio: portfolio_account,
            token_vault: generic_info.clone(),
            native_vault: native_vault_info,
            from: spl_token_info,
            to: generic_info.clone(),
            token_program,
            associated_token_program,
            token_list: token_list_account,
            trader: generic_info.clone(),
            airdrop_vault,
            system_program,
            token_mint: generic_info.clone(),
            swap_queue_entry: generic_info,
        };

        let mut ctx = Context {
            accounts: &mut lz_receive_accounts,
            remaining_accounts: remaining_accounts.as_slice(),
            program_id: &program_id,
            bumps: LzReceiveBumps::default(),
        };

        let result = lz_receive(&mut ctx, &params);
        assert!(result.is_ok());
        Ok(())
    }

    #[test]
    fn test_lz_receive_native_success() -> Result<()> {
        let program_id = id();
        let generic_key = Pubkey::new_unique();

        let gc = GlobalConfig {
            allow_deposit: true,
            program_paused: false,
            native_deposits_restricted: false,
            default_chain_id: 1,
            airdrop_amount: 0,
            swap_signer: [0; 20],
            out_nonce: 0,
        };
        let portfolio = Portfolio {
            global_config: gc,
            endpoint: Pubkey::default(),
            bump: 1,
        };
        let mut portfolio_data = portfolio.try_to_vec()?;
        let mut portfolio_lamports = 100;
        let portfolio_info = create_account_info(
            &generic_key,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator()),
        );
        let portfolio_account = Account::<Portfolio>::try_from(&portfolio_info)?;

        let token_list = TokenList { next_page: None, tokens: vec![generic_key] };
        let mut token_list_data = token_list.try_to_vec()?;
        let mut token_list_lamports = 100;
        let token_list_info = create_account_info(
            &generic_key,
            false,
            true,
            &mut token_list_lamports,
            &mut token_list_data,
            &program_id,
            false,
            Some(TokenList::discriminator()),
        );
        let token_list_account = Account::<TokenList>::try_from(&token_list_info)?;

        let mut default_token_account = spl_token::state::Account::default();
        default_token_account.state = AccountState::Initialized;
        let mut default_token_data = vec![0u8; spl_token::state::Account::LEN];
        let mut default_token_lamports = 100;
        spl_token::state::Account::pack_into_slice(&default_token_account, &mut default_token_data);
        let spl_token_info = create_account_info(
            &generic_key,
            false,
            false,
            &mut default_token_lamports,
            &mut default_token_data,
            &anchor_spl::token::ID,
            true,
            None
        );

        let mut to_data = vec![];
        let mut to_lamports = 100;
        let to_info = create_account_info(
            &generic_key,
            false,
            false,
            &mut to_lamports,
            &mut to_data,
            &program_id,
            false,
            None,
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
            None,
        );
        let mut native_vault_data = vec![0u8; 100];
        let mut native_vault_lamports = 500 + NATIVE_VAULT_MIN_THRESHOLD;
        let native_vault_info = create_account_info(
            &generic_key,
            false,
            true,
            &mut native_vault_lamports,
            &mut native_vault_data,
            &system_program::ID,
            false,
            None,
        );
        let mut token_program_data = vec![0u8; 100];
        let mut token_program_lamports = 100;
        let token_program_info = create_account_info(
            &anchor_spl::token::ID,
            false,
            false,
            &mut token_program_lamports,
            &mut token_program_data,
            &anchor_spl::token::ID,
            true,
            None,
        );
        let token_program = Program::<Token>::try_from(&token_program_info)?;
        let mut associated_token_data = vec![0u8; 100];
        let mut associated_token_lamports = 100;
        let associated_token_program_info = create_account_info(
            &anchor_spl::associated_token::ID,
            false,
            false,
            &mut associated_token_lamports,
            &mut associated_token_data,
            &anchor_spl::associated_token::ID,
            true,
            None,
        );
        let associated_token_program =
            Program::<AssociatedToken>::try_from(&associated_token_program_info)?;
        let mut airdrop_vault_data = vec![0u8; 100];
        let mut airdrop_vault_lamports = 1000 + NATIVE_VAULT_MIN_THRESHOLD;
        let airdrop_vault_info = create_account_info(
            &generic_key,
            false,
            true,
            &mut airdrop_vault_lamports,
            &mut airdrop_vault_data,
            &system_program::ID,
            false,
            None,
        );
        let airdrop_vault = SystemAccount::try_from(&airdrop_vault_info)?;
        let mut system_program_data = vec![0u8; 100];
        let mut system_program_lamports = 100;
        let system_program_info = create_account_info(
            &system_program::ID,
            false,
            false,
            &mut system_program_lamports,
            &mut system_program_data,
            &system_program::ID,
            true,
            None,
        );
        let system_program = Program::<System>::try_from(&system_program_info)?;

        let xfer = XFERSolana {
            nonce: 0,
            transaction: Tx::IxferRec,
            token_mint: Pubkey::default(),
            quantity: 1,
            trader: generic_key.clone(),
            custom_data: [255u8; 18],
            timestamp: 0,
            message_type: XChainMsgType::XFER,
        };

        let message = xfer._pack_xfer_message()?;

        let params = LzReceiveParams {
            src_eid: 1,
            sender: [0u8; 32],
            nonce: 1,
            guid: [0u8; 32],
            message,
            extra_data: vec![],
        };

        let program_id_static: &'static Pubkey = Box::leak(Box::new(id()));
        let remaining_accounts: Vec<AccountInfo> = (0..CLEAR_MIN_ACCOUNTS_LEN)
            .map(|_| create_dummy_account(&program_id_static))
            .collect();

        let mut lz_receive_accounts = LzReceive {
            portfolio: portfolio_account,
            token_vault: generic_info.clone(),
            native_vault: native_vault_info,
            from: spl_token_info,
            to: to_info,
            token_program,
            associated_token_program,
            token_list: token_list_account,
            trader: generic_info.clone(),
            airdrop_vault,
            system_program,
            token_mint: generic_info.clone(),
            swap_queue_entry: generic_info,
        };

        let mut ctx = Context {
            accounts: &mut lz_receive_accounts,
            remaining_accounts: remaining_accounts.as_slice(),
            program_id: &program_id,
            bumps: LzReceiveBumps::default(),
        };

        let result = lz_receive(&mut ctx, &params);
        assert!(result.is_ok());
        Ok(())
    }

    #[test]
    fn test_lz_receive_negative_cases() -> Result<()> {
        let program_id = id();
        let generic_key = Pubkey::new_unique();

        let gc = GlobalConfig {
            allow_deposit: true,
            program_paused: false,
            native_deposits_restricted: false,
            default_chain_id: 1,
            airdrop_amount: 0,
            swap_signer: [0; 20],
            out_nonce: 0,
        };
        let portfolio = Portfolio {
            global_config: gc,
            endpoint: Pubkey::default(),
            bump: 1,
        };
        let mut portfolio_data = portfolio.try_to_vec()?;
        let mut portfolio_lamports = 100;
        let portfolio_info = create_account_info(
            &generic_key,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator()),
        );
        let portfolio_account = Account::<Portfolio>::try_from(&portfolio_info)?;

        let token_list = TokenList { next_page: None, tokens: vec![generic_key] };
        let mut token_list_data = token_list.try_to_vec()?;
        let mut token_list_lamports = 100;
        let token_list_info = create_account_info(
            &generic_key,
            false,
            true,
            &mut token_list_lamports,
            &mut token_list_data,
            &program_id,
            false,
            Some(TokenList::discriminator()),
        );
        let token_list_account = Account::<TokenList>::try_from(&token_list_info)?;

        let mut default_token_account = spl_token::state::Account::default();
        default_token_account.state = AccountState::Initialized;
        default_token_account.amount = 2;
        let mut default_token_data = vec![0u8; spl_token::state::Account::LEN];
        let mut default_token_lamports = 100;
        spl_token::state::Account::pack_into_slice(&default_token_account, &mut default_token_data);
        let spl_token_info = create_account_info(
            &generic_key,
            false,
            false,
            &mut default_token_lamports,
            &mut default_token_data,
            &anchor_spl::token::ID,
            true,
            None
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
            None,
        );
        let mut native_vault_data = vec![0u8; 100];
        let mut native_vault_lamports = 500;
        let native_vault_info = create_account_info(
            &generic_key,
            false,
            true,
            &mut native_vault_lamports,
            &mut native_vault_data,
            &system_program::ID,
            false,
            None,
        );
        let mut token_program_data = vec![0u8; 100];
        let mut token_program_lamports = 100;
        let token_program_info = create_account_info(
            &anchor_spl::token::ID,
            false,
            false,
            &mut token_program_lamports,
            &mut token_program_data,
            &anchor_spl::token::ID,
            true,
            None,
        );
        let token_program = Program::<Token>::try_from(&token_program_info)?;
        let mut associated_token_data = vec![0u8; 100];
        let mut associated_token_lamports = 100;
        let associated_token_program_info = create_account_info(
            &anchor_spl::associated_token::ID,
            false,
            false,
            &mut associated_token_lamports,
            &mut associated_token_data,
            &anchor_spl::associated_token::ID,
            true,
            None,
        );
        let associated_token_program =
            Program::<AssociatedToken>::try_from(&associated_token_program_info)?;
        let mut airdrop_vault_data = vec![0u8; 100];
        let mut airdrop_vault_lamports = 1000 + NATIVE_VAULT_MIN_THRESHOLD;
        let airdrop_vault_info = create_account_info(
            &generic_key,
            false,
            true,
            &mut airdrop_vault_lamports,
            &mut airdrop_vault_data,
            &system_program::ID,
            false,
            None,
        );
        let mut airdrop_vault = SystemAccount::try_from(&airdrop_vault_info)?;
        let mut system_program_data = vec![0u8; 100];
        let mut system_program_lamports = 100;
        let system_program_info = create_account_info(
            &system_program::ID,
            false,
            false,
            &mut system_program_lamports,
            &mut system_program_data,
            &system_program::ID,
            true,
            None,
        );
        let system_program = Program::<System>::try_from(&system_program_info)?;

        let mut xfer = XFERSolana {
            nonce: 0,
            transaction: Tx::CCTrade,
            token_mint: generic_key,
            quantity: 1,
            trader: Pubkey::default(),
            custom_data: [255u8; 18],
            timestamp: 0,
            message_type: XChainMsgType::XFER,
        };

        let mut message = xfer._pack_xfer_message()?;

        let mut params = LzReceiveParams {
            src_eid: 1,
            sender: [0u8; 32],
            nonce: 1,
            guid: [0u8; 32],
            message,
            extra_data: vec![],
        };

        let program_id_static: &'static Pubkey = Box::leak(Box::new(id()));
        let remaining_accounts: Vec<AccountInfo> = (0..CLEAR_MIN_ACCOUNTS_LEN)
            .map(|_| create_dummy_account(&program_id_static))
            .collect();

        let mut lz_receive_accounts = LzReceive {
            portfolio: portfolio_account,
            token_vault: generic_info.clone(),
            native_vault: native_vault_info,
            from: spl_token_info,
            to: generic_info.clone(),
            token_program,
            associated_token_program,
            token_list: token_list_account,
            trader: generic_info.clone(),
            airdrop_vault,
            system_program,
            token_mint: generic_info.clone(),
            swap_queue_entry: generic_info,
        };

        let mut ctx = Context {
            accounts: &mut lz_receive_accounts.clone(),
            remaining_accounts: remaining_accounts.as_slice(),
            program_id: &program_id,
            bumps: LzReceiveBumps::default(),
        };

        let result = lz_receive(&mut ctx, &params);
        assert_eq!(result.unwrap_err(), DexalotError::InvalidTrader.into());

        xfer.quantity = 0;
        message = xfer._pack_xfer_message()?;
        params.message = message;

        let result = lz_receive(&mut ctx, &params);
        assert_eq!(result.unwrap_err(), DexalotError::ZeroTokenQuantity.into());

        let mut airdrop_vault_lamports = 1000;
        let mut airdrop_vault_data = vec![0u8; 100];
        let airdrop_vault_info = create_account_info(
            &generic_key,
            false,
            true,
            &mut airdrop_vault_lamports,
            &mut airdrop_vault_data,
            &system_program::ID,
            false,
            None,
        );
        airdrop_vault = SystemAccount::try_from(&airdrop_vault_info)?;
        lz_receive_accounts.airdrop_vault = airdrop_vault;
        let mut lz_receive_accounts2 = lz_receive_accounts.clone();
        ctx.accounts = &mut lz_receive_accounts2;

        let result = lz_receive(&mut ctx, &params);
        assert_eq!(result.unwrap_err(), DexalotError::NotEnoughNativeBalance.into());

        let token_list = TokenList { next_page: None, tokens: vec![] };
        let mut token_list_data = token_list.try_to_vec()?;
        let mut token_list_lamports = 100;
        let token_list_info = create_account_info(
            &generic_key,
            false,
            true,
            &mut token_list_lamports,
            &mut token_list_data,
            &program_id,
            false,
            Some(TokenList::discriminator()),
        );
        let token_list_account = Account::<TokenList>::try_from(&token_list_info)?;
        lz_receive_accounts.token_list = token_list_account;
        let mut lz_receive_accounts3 = lz_receive_accounts.clone();
        ctx.accounts = &mut lz_receive_accounts3;

        let result = lz_receive(&mut ctx, &params);
        assert_eq!(result.unwrap_err(), DexalotError::TokenNotSupported.into());

        let gc = GlobalConfig {
            allow_deposit: true,
            program_paused: true,
            native_deposits_restricted: false,
            default_chain_id: 1,
            airdrop_amount: 0,
            swap_signer: [0; 20],
            out_nonce: 0,
        };
        let portfolio = Portfolio {
            global_config: gc,
            endpoint: Pubkey::default(),
            bump: 1,
        };
        let mut portfolio_data = portfolio.try_to_vec()?;
        let mut portfolio_lamports = 100;
        let portfolio_info = create_account_info(
            &generic_key,
            false,
            true,
            &mut portfolio_lamports,
            &mut portfolio_data,
            &program_id,
            false,
            Some(Portfolio::discriminator()),
        );
        let portfolio_account = Account::<Portfolio>::try_from(&portfolio_info)?;

        let mut accounts = lz_receive_accounts.clone();
        accounts.portfolio = portfolio_account;
        ctx.accounts = &mut accounts;

        let result = lz_receive(&mut ctx, &params);
        assert_eq!(result.unwrap_err(), DexalotError::ProgramPaused.into());
        Ok(())
    }
}
