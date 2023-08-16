# Dexalot Smart Contracts

## *Please read the entire README before running any commands.*

## Set up the development environment

- Install the latest version of VS Code
- Install the latest version of git version control
- Install Node.js version 18.16.0
## Get the code

```sh
git clone https://github.com/Dexalot/contracts.git
```

## Project setup

```sh
yarn install
```

## Hardhat Environment Tests

### Compile and start the Hardhat environment on Terminal 1

This script creates a Hardhat Development blockchain that you can interact with.

```sh
yarn hh-start-clean
```

### Run the individual tests on the Hardhat environment on Terminal 2

The `run_tests.sh` script runs one or more tests fitting a pattern on the Hardhat Development blockchain.  You need to have a running ```yarn hh-start-clean``` process first. You can use it as follows from the project's root folder:

```sh
./test/run_test.sh            [run each test with pauses or all in one go]
./test/run_test.sh Portfolio  [run all tests with a Portfolio prefix]
```

The above commands would work in a unix-like shell environment.  On other platforms you can call individual tests as below:

```sh
npx hardhat test test/<TEST_FILE_NAME>.ts

Example:
npx hardhat test test/TestAirdrop.ts
```

Available tests are as follows:

```sh
TestAirdrop.ts
TestAuction.ts
TestAuctionPerfectMatch.ts
TestBannedAccounts.ts
TestBytes32LinkedListLibrary.ts
TestDexalot.ts
TestDexalotToken.ts
TestExchangeMain.ts
TestExchangeShared.ts
TestExchangeSub.ts
TestGasStation.ts
TestGetNBook.ts
TestIncentiveDistributor.ts
TestLzApp.ts
TestLzDestroyAndRecoverFunds.ts
TestMockToken.ts
TestMulticall2.ts
TestMainnetRFQ.ts
TestOrderBooks.ts
TestPortfolioBridgeMain.ts
TestPortfolioBridgeSub.ts
TestPortfolioInteractions.ts
TestPortfolioMain.ts
TestPortfolioMinter.ts
TestPortfolioShared.ts
TestPortfolioSub.ts
TestRBTLibrary.ts
TestStaking.ts
TestTokenVestingCloneable.ts
TestTokenVestingCloneFactory.ts
TestTradePairs.ts
TestUtilsLibrary.ts
```

The scripts `TestDexalot.ts`, `TestAuction.ts` and `TestGetNBook.ts` run a set of simulated trades to test the whole system.  Before running any simulator a second time you need to stop a running ```yarn hh-start-clean``` script and rerun ```yarn hh-start-clean``` to reset all the counters.

### Solidity Coverage

The hardhat environment has the solidity-coverage plugin installed during the initial `yarn install` command.

You can run it as below to get a Solidity coverage report.

```sh
yarn hh-coverage
```

Please note the full coverage run will take 10-20 minutes depending on the speed of your computer.

### Documentation

Dexalot team built a documentation site to serve the developer community.  Please visit at
[Dexalot Knowledge Hub @ https://docs.dexalot.com](https://docs.dexalot.com) to
learn more about the novel dual-chain app.

Happy Trading! \
\
Dexalot \
Own Your Trade
