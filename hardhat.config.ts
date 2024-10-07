
import "@nomiclabs/hardhat-waffle"
import '@nomiclabs/hardhat-ethers'
import '@openzeppelin/hardhat-upgrades'
import '@typechain/hardhat'
import 'solidity-coverage'
import "hardhat-deploy";
import '@layerzerolabs/toolbox-hardhat'
import '@nomicfoundation/hardhat-foundry'
import "./tasks/print_accounts";

/**
 * @type import('hardhat/config').HardhatUserConfig
 */

const config = {
  solidity: {
    compilers: [{
      version: "0.8.17",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        },

        outputSelection: {
          "*": {
            "*": [
              "storageLayout"
            ]
          }
        }
      }
    },
    {
      version: "0.8.26",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        },

        outputSelection: {
          "*": {
            "*": [
              "storageLayout"
            ]
          }
        }
      }
    },
    {
      version: "0.8.25",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        },

        outputSelection: {
          "*": {
            "*": [
              "storageLayout"
            ]
          }
        }
      }
    }
    ]
  },

  mocha: {
    timeout: 900000
  },

  networks: {
    hardhat: {
      gasPrice: 225000000000,
      chainId: 1337,
      accounts: {
        accountsBalance: '1000000000000000000000000',
        count: 20
      }
    },
  },
}

module.exports = config
