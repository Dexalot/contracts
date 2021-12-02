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
This script runs tests for the Protfolio contract on the Hardhat Development blockchain.  You need to have a running ```yarn hh-start-clean``` process first.
```
yarn hh-test-prtf
```

### Run the trading simulation tests on the Hardhat environment on Terminal 2
This script runs a set of simulated trades to test the whole system.  Before running the simulator a second time you need to stop a running ```yarn hh-start-clean``` script and rerun ```yarn hh-start-clean``` to reset all the counters.
```
yarn hh-test-dex
```

### Deploy mock tokens and exchange on the Hardhat environment on Terminal 2
Hardhat development environement creates pre-funded accounts when you run ```yarn hh-start-clean```.  After you run that script just deploy your tokens with ```yarn hh-mint``` and then deploy Dexalot smart contracts via ```yarn hh-deploy```.  Here is the list of commands.
```
yarn hh-mint
yarn hh-deploy
```

## Avalanche Platform Deployment

### Customize configuration
No .env files needed for hardhat test environment.

For local avash, cloud avash, testnet fuji or production mainnet deployments create an .env file with the below information.  Please see ```.env.example```.

```
FUNDER_KEY= [a whale account that exists only on development networks for testing, see .env.example]
DEPLOYMENT_ACCOUNT_KEY=
DEPLOYMENT_ACCOUNT_ADDRESS=
EXCHANGE_SAFE_ADDRESS=
FOUNDATION_SAFE_ADDRESS=
CHAIN_INSTANCE=
CHAIN_ID=
DEPLOYMENT_MODE=dev or prod [selector for *-pairs.json and *-tokensWithAddress.json]
API_KEY=your snowtrace api key for fuji or production deployments
```

Please note that the required information above includes your private key and account number. The account identified by this private key will deploy the contracts on the chosen platform. You will need sufficient gas tokens in this account to deploy the contracts.

*** IMPORTANT NOTES ***

- Your private key should not be shared with anyone. If someone gains access to your private key, they will have full access to that account including all assets within it.

- Deploying contracts incurs gas fees. Therefore, deploying these sets of contracts on Avalanche mainnet will require a minimum of about 3.5 AVAX at a gas price of 25 nAVAX. If the gas price is higher the cost of deployment will increase. Please do your deployment experiments on test and development networks first to avoid paying network fees.

- For the production mainnet, the EXCHANGE_SAFE_ADDRESS defaults to a 3 out of 4 multisig in ```.env.example```. This multisig will administer the operational parameters in the early days of Dexalot and will be able to take corrective action in case of unforeseen events that may be detrimental to the exchange and community.

- Please refer to dexalot.com for further information about Dexalot.

### Deploy Contracts

For deployments you need to have corresponding sections defined in the networks section of ```hardhat.config.js``` in addition to the ```.env``` file mentioned above.  Please see ```.env.example``` for creating the ```.env``` file.  The default values for ```hardhat.config.js``` are already entered but the local and cloud development deployments can be customized further.

For local and cloud avash deployments you need to have a running avah 5 node network running that you can interact with.  Please follow instructions on avash project on Ava Labs' GitHub repo to get it up and running.

Please note that an account needs AVAX balance to be able to deploy contracts.

#### Local avash deployment
There is a whale account built into avalanche development networks to fund other accounts.  Using this account please first fund your deployment account with AVAX running ```yarn av-fund-local```.  Then, you need to deploy tokens via ```yarn av-mint-local``` that can be used by Dexalot smart contracts.  Finally, deploy Dexalot smart contracts by running ```yarn av-deploy-local```.  Here is the list of commands.
```
yarn av-fund-local
yarn av-mint-local
yarn av-deploy-local
```

#### Cloud avash deployment
There is a whale account built into avalanche development networks to fund other accounts.  Using this account please first fund your deployment account with AVAX running ```yarn av-fund-dev```.  Then, you need to deploy tokens via ```yarn av-mint-dev``` that can be used by Dexalot smart contracts.  Finally, deploy Dexalot smart contracts by running ```yarn av-deploy-dev```.  Here is the list of commands.
```
yarn av-fund-dev
yarn av-mint-dev
yarn av-deploy-dev
```

#### Fuji deployment
Use Fuji faucet to fund your account that will deploy contracts.  Adjust ```prod-pair.json``` and ```prod-tokensWithAddress.json``` files with relevant information selecting deployed tokens from Fuji testnet. Deploy Dexalot smart contracts by running ```yarn av-deploy-fuji```.
```
yarn av-deploy-fuji
```

#### Production deployment
Make sure your deployment account has enough AVAX balance.  Adjust ```prod-pair.json``` and ```prod-tokensWithAddress.json``` files with relevant information selecting deployed tokens from production mainnet. Deploy Dexalot smart contracts by running ```yarn av-deploy-prod```.
```
yarn av-deploy-prod
```

### Final Tasks For Mainnet Production Deployments

Dexalot will depend on its community to deploy its contracts.  The deployed contracts will be verified with respect to the source code as well as ownerships and operational parameters.  If all checks are satisfactory, a valid deployed set of contracts will be called official.  If you decide to deploy these contracts on the mainnet please follow the steps below to be considered for the official contracts deployment.

- Copy & paste all console messages to a file called ```prod-deployment.log```.
- Zip the ```.openzeppelin``` folder.
- Zip the ```artifacts``` folder.
- Email ```prod-deployment.log```, ```artifacts.zip``` and ```.openzeppelin.zip``` to ```support@dexalot.com```.

<br>
Happy Trading!<br><br>
Dexalot<br>
Own Your Trade
