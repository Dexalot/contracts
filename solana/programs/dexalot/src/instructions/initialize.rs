use crate::consts::{ADMIN_SEED, DEFAULT_AIRDROP_AMOUNT, PORTFOLIO_SEED, REGISTER_OAPP};
use crate::cpi_utils::{create_instruction_data, RegisterOAppParams};
use crate::state::{Admin, Portfolio};
use anchor_lang::solana_program::instruction::Instruction;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::{
    prelude::*, solana_program::pubkey::Pubkey, Accounts, AnchorDeserialize, AnchorSerialize, Key,
};

pub fn initialize(ctx: &mut Context<Initialize>, params: &InitializeParams) -> Result<()> {
    let portfolio = &mut ctx.accounts.portfolio;

    // init portfolio
    portfolio.bump = ctx.bumps.portfolio;
    portfolio.endpoint = ctx.accounts.endpoint_program.key();
    // init global config
    portfolio.global_config.default_chain_id = params.default_chain_id;
    portfolio.global_config.allow_deposit = true;
    portfolio.global_config.program_paused = false;
    portfolio.global_config.native_deposits_restricted = false;
    portfolio.global_config.airdrop_amount = DEFAULT_AIRDROP_AMOUNT;
    portfolio.global_config.swap_signer = params.swap_signer;
    portfolio.global_config.out_nonce = 0;

    // prepare CPI
    let register_params = RegisterOAppParams {
        delegate: ctx.accounts.authority.key(),
    };

    let seeds: &[&[&[u8]]] = &[&[PORTFOLIO_SEED, &[ctx.accounts.portfolio.bump]]];
    let cpi_data = create_instruction_data(&register_params, REGISTER_OAPP)?;

    let portfolio_key = ctx.accounts.portfolio.key();
    let accounts_metas: Vec<AccountMeta> = ctx
        .remaining_accounts
        .iter()
        .skip(1) // an account is skipped because we don't use layerzero cpi utils so it's not needed
        .map(|account| AccountMeta {
            pubkey: *account.key,
            is_signer: account.key() == portfolio_key || account.is_signer,
            is_writable: account.is_writable,
        })
        .collect();

    // Invoke CPI
    if cfg!(not(test)) {
        invoke_signed(
            &Instruction {
                program_id: ctx.accounts.endpoint_program.key(),
                accounts: accounts_metas,
                data: cpi_data,
            },
            ctx.remaining_accounts,
            seeds,
        )?;
    }
    Ok(())
}

#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct InitializeParams {
    pub default_chain_id: u32,
    pub swap_signer: [u8; 20],
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = Portfolio::LEN,
        seeds = [PORTFOLIO_SEED],
        bump
    )]
    pub portfolio: Box<Account<'info, Portfolio>>,
    #[account(
        init,
        payer = authority,
        space = Admin::LEN,
        seeds = [ADMIN_SEED, authority.key().as_ref()],
        bump
    )]
    pub admin: Box<Account<'info, Admin>>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
    /// CHECK: endpoint program,
    pub endpoint_program: AccountInfo<'info>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::consts::QUOTE_REMAINING_ACCOUNTS_COUNT;
    use crate::test_utils::{create_account_info, create_dummy_account};
    use anchor_lang::solana_program::system_program;
    use anchor_lang::Discriminator;

    #[test]
    fn test_initialize_success() -> Result<()> {
        let program_id = crate::id();
        let authority_key = Pubkey::new_unique();
        let portfolio_key = Pubkey::new_unique();
        let admin_key = Pubkey::new_unique();
        let endpoint_program_key = Pubkey::new_unique();

        // Create an authority account.
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

        let mut portfolio_data = vec![0u8; Portfolio::LEN];
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

        let mut admin_data = vec![0u8; Admin::LEN];
        let mut admin_lamports = 100;
        let admin_info = create_account_info(
            &admin_key,
            false,
            true,
            &mut admin_lamports,
            &mut admin_data,
            &program_id,
            false,
            Some(Admin::discriminator()),
        );
        let admin_account = Box::new(Account::<Admin>::try_from(&admin_info)?);

        let mut system_program_lamports = 100;
        let mut system_program_data = vec![0u8; 10];
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

        let mut endpoint_program_lamports = 100;
        let mut endpoint_program_data = vec![0u8; 10];
        let endpoint_program_info = create_account_info(
            &endpoint_program_key,
            false,
            false,
            &mut endpoint_program_lamports,
            &mut endpoint_program_data,
            &endpoint_program_key,
            false,
            None,
        );

        let mut init_accounts = Initialize {
            portfolio: Box::new(portfolio_account),
            admin: admin_account,
            authority: Signer::try_from(&authority_info)?,
            system_program: system_program.clone(),
            endpoint_program: endpoint_program_info,
        };

        let program_id_static: &'static Pubkey = Box::leak(Box::new(crate::id()));
        let remaining_accounts: Vec<AccountInfo<'static>> = (0..QUOTE_REMAINING_ACCOUNTS_COUNT)
            .map(|_| create_dummy_account(program_id_static))
            .collect();

        let mut ctx = Context {
            accounts: &mut init_accounts,
            remaining_accounts: remaining_accounts.as_slice(),
            program_id: &program_id,
            bumps: InitializeBumps::default(),
        };

        let swap_signer: [u8; 20] = [1u8; 20];
        let params = InitializeParams {
            default_chain_id: 2,
            swap_signer,
        };

        let result = initialize(&mut ctx, &params);
        assert!(result.is_ok());

        let portfolio = &ctx.accounts.portfolio;
        assert_eq!(portfolio.bump, 255);
        assert_eq!(
            portfolio.global_config.default_chain_id,
            params.default_chain_id
        );
        assert!(portfolio.global_config.allow_deposit);
        assert!(!portfolio.global_config.program_paused);
        assert!(!portfolio.global_config.native_deposits_restricted);
        assert_eq!(
            portfolio.global_config.airdrop_amount,
            DEFAULT_AIRDROP_AMOUNT
        );
        assert_eq!(portfolio.global_config.swap_signer, params.swap_signer);
        assert_eq!(portfolio.global_config.out_nonce, 0);

        Ok(())
    }
}
