# Dexalot Smart Contracts

## *Please read the entire README before running any commands.*

<br>

## Set up the development environment
- Install the latest version of VS Code
- Install the latest version of git version control
- Install Node.js version 14.17.1

## Get the code
```
git clone https://github.com/Dexalot/contracts.git
```

## Project setup
```
yarn install
```

## Hardhat Environment Deployment

### Compile and start the Hardhat environment on Terminal 1
This script creates a Hardhat Development blockchain that you can interact with.
```
yarn hh-start-clean
```

### Run the Portfolio tests on the Hardhat environment on Terminal 2
These scripts run tests for the each contract on the Hardhat Development blockchain.  You need to have a running ```yarn hh-start-clean``` process first.
```
yarn hh-test-portfolio
yarn hh-test-orderbooks
yarn hh-test-tradepairs
yarn hh-test-exchange
yarn hh-test-airdrop
yarn hh-test-vesting
```

### Run the trading simulation tests on the Hardhat environment on Terminal 2
These scripts run a set of simulated trades to test the whole system.  Before running any simulator a second time you need to stop a running ```yarn hh-start-clean``` script and rerun ```yarn hh-start-clean``` to reset all the counters.
```
yarn hh-test-dex
yarn hh-test-getNBook
yarn hh-test-auction
```

### Deploy mock tokens, Dexalot token and exchange on the Hardhat environment on Terminal 2
Hardhat development environement creates pre-funded accounts when you run ```yarn hh-start-clean```.  After you run that script just deploy your tokens with ```yarn hh-mint``` and ```yarn hh-deploy-dexalot-token```. Then, deploy Dexalot smart contracts via ```yarn hh-deploy```.  Here is the list of commands.
```
yarn hh-mint
yarn hh-deploy-dexalot-token
yarn hh-deploy
```

Happy Trading!<br><br>
Dexalot<br>
Own Your Trade
