
require('dotenv').config({path: './.env'});

require("@nomiclabs/hardhat-waffle")
require('@openzeppelin/hardhat-upgrades')
require('hardhat-contract-sizer')
require('solidity-coverage')

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
    runOnCompile: false,
    disambiguatePaths: false,
  },

  mocha: {
    timeout: 600000
  },

  networks: {
    hardhat: {
      gasPrice: 225000000000,
      chainId: 1337,
      accounts: {
        accountsBalance: '1000000000000000000000000',
        count: 10
      }
    },

  },

}
