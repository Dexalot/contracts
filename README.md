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

Install hardhat packages

```sh
yarn install
```

Install foundry packages, if foundry not installed please view installation steps [here](https://book.getfoundry.sh/getting-started/installation)

```sh
forge install
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
npx hardhat  test ./test/TestAirdrop.ts
npx hardhat  test ./test/TestAuction.ts
npx hardhat  test ./test/TestAuctionPerfectMatch.ts
npx hardhat  test ./test/TestBannedAccounts.ts
npx hardhat  test ./test/TestBytes32LinkedListLibrary.ts
npx hardhat  test ./test/TestDexalot.ts
npx hardhat  test ./test/TestDexalotToken.ts
npx hardhat  test ./test/TestExchangeMain.ts
npx hardhat  test ./test/TestExchangeShared.ts
npx hardhat  test ./test/TestExchangeSub.ts
npx hardhat  test ./test/TestGasStation.ts
npx hardhat  test ./test/TestGetNBook.ts
npx hardhat  test ./test/TestIncentiveDistributor.ts
npx hardhat  test ./test/TestLzApp.ts
npx hardhat  test ./test/TestLzDestroyAndRecoverFunds.ts
npx hardhat  test ./test/TestMockToken.ts
npx hardhat  test ./test/TestMulticall2.ts
npx hardhat  test ./test/TestMainnetRFQ.ts
npx hardhat  test ./test/TestOrderBooks.ts
npx hardhat  test ./test/TestPortfolioBridgeMain.ts
npx hardhat  test ./test/TestPortfolioBridgeSub.ts
npx hardhat  test ./test/TestPortfolioInteractions.ts
npx hardhat  test ./test/TestPortfolioMain.ts
npx hardhat  test ./test/TestPortfolioMinter.ts
npx hardhat  test ./test/TestPortfolioShared.ts
npx hardhat  test ./test/TestPortfolioSub.ts
npx hardhat  test ./test/TestRBTLibrary.ts
npx hardhat  test ./test/TestTokenVestingCloneable.ts
npx hardhat  test ./test/TestTokenVestingCloneFactory.ts
npx hardhat  test ./test/TestTradePairs.ts
npx hardhat  test ./test/TestUtilsLibrary.ts
npx hardhat  test ./test/TestInventoryManager.ts
npx hardhat  test ./test/TestMainnetRFQ.ts
npx hardhat  test ./test/TestMultiChain.ts
npx hardhat  test ./test/TestPBMainToPBMain.ts
npx hardhat  test ./test/TestPortfolioSubHelper.ts
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
