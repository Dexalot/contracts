# Dexalot Solana Program

A Cross-Chain Decentralized Exchange Protocol built on Solana, enabling seamless trading across different blockchain networks through LayerZero integration.

## Architecture

The program is built using the Anchor framework and consists of several key components:

- **Core Program**: Main DEX functionality (`lib.rs`)
- **Instructions**: Modular instruction handlers for various operations
- **State Management**: Global configuration and account state handling
- **Cross-Chain Communication**: LayerZero integration for cross-chain messaging

## Prerequisites

- [Rust](https://www.rust-lang.org/tools/install)
- [Solana CLI](https://www.anchor-lang.com/docs/installation#install-the-solana-cli)
- [Anchor](https://www.anchor-lang.com/docs/installation#install-anchor-cli)

## Deployment

```bash
# Build the program
anchor build

# Sync keys
anchor keys sync

# Rebuild thte program with updated program id
anchor build

# Deploy the program to different networks
npm run deploy:devnet
npm run deploy:testnet
npm run deploy:mainnet
```

## Run SDK

```bash
# Install all node dependencies
npm install

cd sdk
npm install

# start sdk
npm start
```

## How to use SDK

### 1. Initialize section

1. **Initialize**: Initializes a newly deployed program
2. **Initialize vaults**: Initializes the SPL vaults for a newly deployed program
3. **Initialize Layerzero**: Call the LayerZero Endpoint program to configure message libraries
<hr/>

### 2. Global configuration section

_Only admin_

1.  **Set Default Chain EID**: Sets default chain EID to where xfer messages are sent
2.  **Set Airdrop Amount**: Sets the amount which will aidroped to a user if necessary
3.  **Pause Program**: Pauses the program (required when removing tokens from Dexalot)
4.  **Unpause Program**: Unpause the program
5.  **Enable Allow Deposit**: Enables deposits to the Dexalot program
6.  **Disable Allow Deposit**: Disables deposits to the Dexalot program
7.  **Enable Native Deposits**: Enables SOL deposits
8.  **Disable Native Desposits**: Disables SOL deposits
9.  **Set swap signer**: Set the address of the private key that signed the order hash
10. **Get global config**: Returns the Global configuration of the Dexalot programs
<hr/>

### 3. Layerzero section

1. **Set Remote**: Sets the remote OApp address (only admin)
2. **Get Remote**: Returns the remote OApp address
3. **Get Portfolio PDA**: Returns the Dexalot program Oapp address in base58
<hr/>

### 4. Wallet section

1. **Create Wallet**: Create a new solana keypair
2. **Set Wallet**: Sets the SDK wallet
3. **Create Wallet File from Secret Key**: Generates a wallet json file from a solana secret key
4. **Print Wallet Address**: Prints current SDK wallet address in base58
5. **Show Balance of active wallet**: Shows the balance of the curretn SDK wallet
6. **Airdrop SOL**: Request a devnet aidrop to the current SDK wallet
<hr/>

### 5. Account Management section

_Only admin_

1. **Add Admin**: Adds a new admin
2. **Remove Admin**: Removes an admin
3. **Ban Account**: Bans a public key from interacting with Dexalot program
4. **Unban Account**: Unbans a public key
5. **Add Rebalancer**: Adds a new rebalancer
6. **Remove Rebalancer**: Removes a rebalancer
<hr/>

### 6. SOL Vaults section

1. **Get SOL Vault Balance**: Returns the SOL balance of the Dexalot SOL vault
2. **Get SOL User Funds Vault Balance**: Returns the SOL balance of the Dexalot SOL User Funds vault
3. **Get Airdrop Vault Balance**: Returns the SOL balance dedicated for Airdrops from the Dexalot Airdrop vault
<hr/>

### 7. Token operations section

1.  **Create New Token**: Create a new token mint account and writes the address to a file
2.  **List supported Tokens**: Displays all tokens supported by the Dexalot program
3.  **Add Token**: Adds a token to the supported tokens list (only admin)
4.  **Get Token Details**: Displays the token mint address, decimals and token symbol
5.  **Remove Token**: Removes a token from the supported tokens list (only admin and program must paused)
6.  **Mint SPL Token**: Mints an SPL token to the current SDK wallet (only token authority)
7.  **Get SPL token balance of active wallet**: Returns the current SDK wallet balance for a specific SPL token
8.  **Get program SPL token balance**: Returns the Dexalot SPL Vault balance for a specific SPL token
9.  **Get program SPL token user funds balance**: Returns the Dexalot SPL User Funds Vault balance for a specific SPL token
10. **Check SPL token balance of pubkey**: Returns the balance for a specific SPL token of a provided public key
11. **Create account**: Creates a keypair account for new to Solana user
<hr/>

### 8. Deposits section

1. **Deposit SOL**: Deposits SOL to the Dexalot SOL vault and send a Deposit XFER message
2. **Deposit SPL token**: Deposits a SPL token to the Dexalot SPL User Funds vault and send a Deposit XFER message
3. **Deposit Airdrop**: Deposits SOL to the Dexalot Airdrop vault
<hr/>

### 9. Swaps section

1. **Simple swap**: Executes a SPL or SOL assets swap on Solana network
2. **Partial swap**: Executes a SPL or SOL assets swap with partial amount for the destination trader
3. **Cross swap**: Assets are taken from the taker and CCtrade XFER message is sent
4. **Remove from swap queue**: Re-executes a pending swap which wasn't executed beforehand due to insufficient liquidity (only rebalancer)
5. **Update swap expiry**: Marks a swap as completed (only rebalancer)
<hr/>

### 10. Claim balances section

_only rebalancer_

1. **Claim SPL balance**: Withdraws SPL funds from the SPL vault to the rebalancer
2. **Claim native balance**: Withdraws SOL funds from the SOL vault to the rebalancer
<hr/>

### 11. Fund program section

_only rebalancer_

1. **Fund SOL**: Funds SOL to the Dexalot SOL vault
2. **Fund SPL**: Funds SPL to the Dexalot SPL vault
<hr/>

### 12. Test Helper section

1. **Generate intergration tests remaining accounts**: Generates remaining accounts files needed for the integration tests
<hr/>

## Initialize the Dexalot program

1. Run **Intialize**
2. Run **Initialize vault**
3. Run **Initialize LayerZero**
4. Run **Set remote**

## Running Intergration tests

### Prerequisite:

Generate _Remaining accounts_ files via the SDK

```bash
# go to sdk folder
cd sdk
# start SDK
npm start
# select option 12: Test helper
# select option 1: Generate intergration tests remaining accounts
```

```bash
# in project root
anchor test
```

## Running Unit tests with coverage

You can run them with the coverage report in the terminal or 
with an interactive coverage report in a browser. The coverage ignores the mock programs
and the lib.rs file.

```bash
anchor run coverage
anchor run coverage-terminal
```