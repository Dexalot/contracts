
require('dotenv').config({path: './.env'});

require("@nomiclabs/hardhat-waffle")
require("@nomiclabs/hardhat-etherscan")
require('@openzeppelin/hardhat-upgrades')
require('hardhat-contract-sizer')

const deploymentAccount = process.env.DEPLOYMENT_ACCOUNT_KEY
const chainInstance = process.env.CHAIN_INSTANCE

module.exports = {
  solidity: {
    version: "0.8.9",
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
    },

    avash_local: {
      url: chainInstance,
      gasPrice: 225000000000,
      chainId: 43112,
      accounts: [deploymentAccount]
    },

    avash_dev: {
      url: chainInstance,
      gasPrice: 225000000000,
      chainId: 43112,
      accounts: [deploymentAccount]
    },

    fuji: {
      url: chainInstance,
      gasPrice: 225000000000,
      chainId: 43113,
      accounts: [deploymentAccount]
    },

    prod: {
      url: chainInstance,
      gasPrice: 225000000000,
      chainId: 43114,
      accounts: [deploymentAccount]
    },

    subnet_local: {
      url: chainInstance,
      gasPrice: 225000000000,
      chainId: 43214,
      accounts: [deploymentAccount]
    }
  },

  etherscan: {
    apiKey:  process.env.API_KEY
  }
}
