
require("@nomiclabs/hardhat-waffle")
require('@openzeppelin/hardhat-upgrades')
require('hardhat-contract-sizer')


module.exports = {
  solidity: {
    version: "0.8.4",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    disambiguatePaths: false,
  },

  mocha: {
    timeout: 60000
  },

  networks: {
    hardhat: {
      gasPrice: 225000000000,
      chainId: 1337,
      accounts: {
        accountsBalance: '1000000000000000000000000',
        count: 5
      }
    }
  }
}
