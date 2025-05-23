use crate::errors::DexalotError;
use crate::xfer::Tx;
use crate::{
    consts::{
        AIRDROP_VAULT_SEED, ENDPOINT_ID, PENDING_SWAPS_SEED, PORTFOLIO_SEED,
        SOL_USER_FUNDS_VAULT_SEED, SOL_VAULT_SEED, SPL_USER_FUNDS_VAULT_SEED, SPL_VAULT_SEED,
        TOKEN_LIST_PAGE_1_SEED, TOKEN_LIST_SEED,
    },
    cpi_utils::get_accounts_for_clear,
    *,
};
use anchor_lang::solana_program::system_program;
use anchor_spl::{
    associated_token::{get_associated_token_address, ID as ASSOCIATED_TOKEN_PROGRAM_ID},
    token::spl_token::ID as TOKEN_PROGRAM_ID,
};
use std::str::FromStr;

/// LzReceiveTypes instruction provides a list of accounts that are used in the LzReceive
/// instruction. The list of accounts required by this LzReceiveTypes instruction can be found
/// from the specific PDA account that is generated by the LZ_RECEIVE_TYPES_SEED.
#[derive(Accounts)]
#[instruction(params: LzReceiveParams)]
pub struct LzReceiveTypes {
    // Must be empty as per new layerzero executor update
}

pub fn lz_receive_types(
    ctx: &Context<LzReceiveTypes>,
    params: &LzReceiveParams,
) -> Result<Vec<LzAccount>> {
    let portfolio_seeds = [PORTFOLIO_SEED];
    let (portfolio, _) = Pubkey::find_program_address(&portfolio_seeds, ctx.program_id);

    let spl_vault_seeds = [SPL_VAULT_SEED];
    let (spl_vault, _) = Pubkey::find_program_address(&spl_vault_seeds, ctx.program_id);

    let spl_user_funds_vault_seeds = [SPL_USER_FUNDS_VAULT_SEED];
    let (spl_user_funds_vault, _) =
        Pubkey::find_program_address(&spl_user_funds_vault_seeds, ctx.program_id);

    let sol_vault_seeds = [SOL_VAULT_SEED];
    let (sol_vault, _) = Pubkey::find_program_address(&sol_vault_seeds, ctx.program_id);

    let sol_user_funds_vault_seeds = [SOL_USER_FUNDS_VAULT_SEED];
    let (sol_user_funds_vault, _) =
        Pubkey::find_program_address(&sol_user_funds_vault_seeds, ctx.program_id);

    let token_list_seeds = [TOKEN_LIST_SEED, TOKEN_LIST_PAGE_1_SEED.as_ref()];
    let (token_list, _) = Pubkey::find_program_address(&token_list_seeds, ctx.program_id);

    let xfer_message = XFERSolana::unpack_xfer_message(&params.message)?;

    let token_mint_address = xfer_message.token_mint;

    let trader = xfer_message.trader;
    // we only accept CCTRADE and WITHDRAW
    require!(
        xfer_message.transaction == Tx::CCTrade || xfer_message.transaction == Tx::Withdraw,
        DexalotError::UnsupportedTransaction
    );

    let native_vault = if xfer_message.transaction == Tx::CCTrade {
        sol_vault
    } else {
        sol_user_funds_vault
    };

    let from = if token_mint_address == Pubkey::default() {
        if xfer_message.transaction == Tx::CCTrade {
            sol_vault
        } else {
            sol_user_funds_vault
        }
    } else {
        if xfer_message.transaction == Tx::CCTrade {
            get_associated_token_address(&spl_vault, &token_mint_address)
        } else {
            get_associated_token_address(&spl_user_funds_vault, &token_mint_address)
        }
    };

    let to = if token_mint_address == Pubkey::default() {
        trader
    } else {
        get_associated_token_address(&trader, &token_mint_address)
    };

    let airdrop_vault_seeds = [AIRDROP_VAULT_SEED];
    let (airdrop_vault, _) = Pubkey::find_program_address(&airdrop_vault_seeds, ctx.program_id);

    let pending_swap_entry_seeds = [
        PENDING_SWAPS_SEED,
        &generate_map_entry_key(
            custom_data_to_nonce(xfer_message.custom_data),
            xfer_message.trader,
        )?,
    ];
    let (pending_swaps_entry, _) =
        Pubkey::find_program_address(&pending_swap_entry_seeds, ctx.program_id);

    let token_vault = if xfer_message.transaction == Tx::CCTrade {
        spl_vault
    } else {
        spl_user_funds_vault
    };

    let mut accounts = vec![
        LzAccount {
            pubkey: portfolio,
            is_signer: false,
            is_writable: false,
        },
        LzAccount {
            pubkey: token_vault,
            is_signer: false,
            is_writable: false,
        },
        LzAccount {
            pubkey: native_vault,
            is_signer: false,
            is_writable: true,
        },
        LzAccount {
            pubkey: from,
            is_signer: false,
            is_writable: true,
        },
        LzAccount {
            pubkey: to,
            is_signer: false,
            is_writable: true,
        },
        LzAccount {
            pubkey: TOKEN_PROGRAM_ID,
            is_signer: false,
            is_writable: false,
        },
        LzAccount {
            pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
            is_signer: false,
            is_writable: false,
        },
        LzAccount {
            pubkey: token_list,
            is_signer: false,
            is_writable: false,
        },
        LzAccount {
            pubkey: trader,
            is_signer: false,
            is_writable: true,
        },
        LzAccount {
            pubkey: airdrop_vault,
            is_signer: false,
            is_writable: true,
        },
        LzAccount {
            pubkey: system_program::ID,
            is_signer: false,
            is_writable: false,
        },
        LzAccount {
            pubkey: token_mint_address,
            is_signer: false,
            is_writable: false,
        },
        LzAccount {
            pubkey: pending_swaps_entry,
            is_signer: false,
            is_writable: true,
        },
    ];
    let endpoint_id = Pubkey::from_str(ENDPOINT_ID).unwrap(); // we provide a correct hard-coded value

    let accounts_for_clear = get_accounts_for_clear(
        endpoint_id,
        &portfolio,
        params.src_eid,
        &params.sender,
        params.nonce,
    );
    accounts.extend(accounts_for_clear);

    Ok(accounts)
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize, Debug)]
pub struct LzAccount {
    pub pubkey: Pubkey,
    pub is_signer: bool,
    pub is_writable: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::consts::{
        PORTFOLIO_SEED, SOL_USER_FUNDS_VAULT_SEED, SOL_VAULT_SEED, SPL_USER_FUNDS_VAULT_SEED,
        SPL_VAULT_SEED,
    };
    use crate::errors::DexalotError;
    use crate::xfer::Tx;
    use anchor_lang::prelude::*;
    use anchor_lang::solana_program::pubkey::Pubkey;
    use anchor_spl::associated_token::get_associated_token_address;

    #[test]
    fn test_lz_receive_types_cctrade_default() -> Result<()> {
        let program_id = id();
        let trader = Pubkey::new_unique();
        let token_mint = Pubkey::default();
        let xfer = XFERSolana::new(Tx::CCTrade, trader, token_mint, 50, 123, [0u8; 18], 1);
        let params = create_params(xfer);
        let mut dummy_accounts = LzReceiveTypes {};
        let remaining_accounts: Vec<AccountInfo> = vec![];
        let ctx = Context {
            program_id: &program_id,
            accounts: &mut dummy_accounts,
            remaining_accounts: &remaining_accounts,
            bumps: LzReceiveTypesBumps::default(),
        };

        let accounts = lz_receive_types(&ctx, &params)?;

        let (expected_portfolio, _) = Pubkey::find_program_address(&[PORTFOLIO_SEED], &program_id);
        let (expected_spl_vault, _) = Pubkey::find_program_address(&[SPL_VAULT_SEED], &program_id);
        let (expected_sol_vault, _) = Pubkey::find_program_address(&[SOL_VAULT_SEED], &program_id);

        assert_eq!(accounts[0].pubkey, expected_portfolio);
        assert_eq!(accounts[1].pubkey, expected_spl_vault);
        assert_eq!(accounts[2].pubkey, expected_sol_vault);
        assert_eq!(accounts[3].pubkey, expected_sol_vault);
        assert_eq!(accounts[4].pubkey, trader);
        assert_eq!(accounts[11].pubkey, Pubkey::default());
        Ok(())
    }

    #[test]
    fn test_lz_receive_types_cctrade_nondefault() -> Result<()> {
        let program_id = id();
        let trader = Pubkey::new_unique();
        let token_mint = Pubkey::new_unique();
        let xfer = XFERSolana::new(Tx::CCTrade, trader, token_mint, 50, 123, [1u8; 18], 1);
        let params = create_params(xfer);
        let mut dummy_accounts = LzReceiveTypes {};
        let remaining_accounts: Vec<AccountInfo> = vec![];
        let ctx = Context {
            program_id: &program_id,
            accounts: &mut dummy_accounts,
            remaining_accounts: &remaining_accounts,
            bumps: LzReceiveTypesBumps::default(),
        };

        let accounts = lz_receive_types(&ctx, &params)?;

        let (expected_portfolio, _) = Pubkey::find_program_address(&[PORTFOLIO_SEED], &program_id);
        let (expected_spl_vault, _) = Pubkey::find_program_address(&[SPL_VAULT_SEED], &program_id);
        let (expected_sol_vault, _) = Pubkey::find_program_address(&[SOL_VAULT_SEED], &program_id);

        let expected_from = get_associated_token_address(&expected_spl_vault, &token_mint);
        let expected_to = get_associated_token_address(&trader, &token_mint);
        assert_eq!(accounts[0].pubkey, expected_portfolio);
        assert_eq!(accounts[1].pubkey, expected_spl_vault);
        assert_eq!(accounts[2].pubkey, expected_sol_vault);
        assert_eq!(accounts[3].pubkey, expected_from);
        assert_eq!(accounts[4].pubkey, expected_to);
        assert_eq!(accounts[11].pubkey, token_mint);
        Ok(())
    }

    #[test]
    fn test_lz_receive_types_withdraw_default() -> Result<()> {
        let program_id = id();
        let trader = Pubkey::new_unique();
        let token_mint = Pubkey::default();
        let xfer = XFERSolana::new(Tx::Withdraw, trader, token_mint, 75, 456, [2u8; 18], 1);
        let params = create_params(xfer);
        let mut dummy_accounts = LzReceiveTypes {};
        let remaining_accounts: Vec<AccountInfo> = vec![];
        let ctx = Context {
            program_id: &program_id,
            accounts: &mut dummy_accounts,
            remaining_accounts: &remaining_accounts,
            bumps: LzReceiveTypesBumps::default(),
        };

        let accounts = lz_receive_types(&ctx, &params)?;

        let (expected_portfolio, _) = Pubkey::find_program_address(&[PORTFOLIO_SEED], &program_id);
        let (expected_sol_user_vault, _) =
            Pubkey::find_program_address(&[SOL_USER_FUNDS_VAULT_SEED], &program_id);
        let (expected_spl_user_vault, _) =
            Pubkey::find_program_address(&[SPL_USER_FUNDS_VAULT_SEED], &program_id);

        assert_eq!(accounts[0].pubkey, expected_portfolio);
        assert_eq!(accounts[1].pubkey, expected_spl_user_vault);
        assert_eq!(accounts[2].pubkey, expected_sol_user_vault);
        assert_eq!(accounts[3].pubkey, expected_sol_user_vault);
        assert_eq!(accounts[4].pubkey, trader);
        assert_eq!(accounts[11].pubkey, Pubkey::default());
        Ok(())
    }

    #[test]
    fn test_lz_receive_types_withdraw_nondefault() -> Result<()> {
        let program_id = id();
        let trader = Pubkey::new_unique();
        let token_mint = Pubkey::new_unique();
        let xfer = XFERSolana::new(Tx::Withdraw, trader, token_mint, 75, 456, [3u8; 18], 1);
        let params = create_params(xfer);
        let mut dummy_accounts = LzReceiveTypes {};
        let remaining_accounts: Vec<AccountInfo> = vec![];
        let ctx = Context {
            program_id: &program_id,
            accounts: &mut dummy_accounts,
            remaining_accounts: &remaining_accounts,
            bumps: LzReceiveTypesBumps::default(),
        };

        let accounts = lz_receive_types(&ctx, &params)?;

        let (expected_portfolio, _) = Pubkey::find_program_address(&[PORTFOLIO_SEED], &program_id);
        let (expected_sol_user_vault, _) =
            Pubkey::find_program_address(&[SOL_USER_FUNDS_VAULT_SEED], &program_id);
        let (expected_spl_user_vault, _) =
            Pubkey::find_program_address(&[SPL_USER_FUNDS_VAULT_SEED], &program_id);

        let expected_from = get_associated_token_address(&expected_spl_user_vault, &token_mint);
        let expected_to = get_associated_token_address(&trader, &token_mint);
        assert_eq!(accounts[0].pubkey, expected_portfolio);
        assert_eq!(accounts[1].pubkey, expected_spl_user_vault);
        assert_eq!(accounts[2].pubkey, expected_sol_user_vault);
        assert_eq!(accounts[3].pubkey, expected_from);
        assert_eq!(accounts[4].pubkey, expected_to);
        assert_eq!(accounts[11].pubkey, token_mint);
        Ok(())
    }

    #[test]
    fn test_lz_receive_types_unsupported_transaction() {
        let program_id = id();
        let trader = Pubkey::new_unique();
        let token_mint = Pubkey::default();
        let xfer = XFERSolana::new(Tx::Deposit, trader, token_mint, 50, 123, [4u8; 18], 1);
        let params = create_params(xfer);
        let mut dummy_accounts = LzReceiveTypes {};
        let remaining_accounts: Vec<AccountInfo> = vec![];
        let ctx = Context {
            program_id: &program_id,
            accounts: &mut dummy_accounts,
            remaining_accounts: &remaining_accounts,
            bumps: LzReceiveTypesBumps::default(),
        };

        let result = lz_receive_types(&ctx, &params);
        assert_eq!(
            result.unwrap_err(),
            DexalotError::UnsupportedTransaction.into()
        );
    }

    fn create_params(xfer: XFERSolana) -> LzReceiveParams {
        let message = xfer._pack_xfer_message().unwrap();
        LzReceiveParams {
            src_eid: 10,
            sender: [1u8; 32],
            nonce: 1,
            guid: [0u8; 32],
            message,
            extra_data: vec![],
        }
    }
}
