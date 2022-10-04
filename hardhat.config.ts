
import "@nomiclabs/hardhat-waffle"
import "@nomiclabs/hardhat-etherscan"
import '@nomiclabs/hardhat-ethers'
import '@openzeppelin/hardhat-upgrades'
import '@typechain/hardhat'
import 'hardhat-contract-sizer'
import 'solidity-coverage'
import { HardhatUserConfig } from "hardhat/types";
import "./tasks/print_accounts";

/**
 * @type import('hardhat/config').HardhatUserConfig
 */

const config: HardhatUserConfig = {
  solidity: {
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
        count: 20
      }
    },
  },
}

module.exports = config
