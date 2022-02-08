
const fs = require("fs")
require('dotenv').config({path: './.env'});
const { ethers } = require("hardhat")

const Utils = require('./utils.js')

const deployment_mode = process.env?.DEPLOYMENT_MODE || "dev-local"

async function main() {
  const signers = await ethers.getSigners()
  accounts = []
  for (var i=0; i<signers.length; i++) {
    accounts.push(signers[i].address)
  }
  const deploymentAccount = accounts[0]
  console.log("Deployment Account:", deploymentAccount)

  const DexalotToken = await ethers.getContractFactory("DexalotToken")

  var deptoken
  deptoken = await  DexalotToken.deploy()
  await deptoken.deployed()

  const decimals_str = Utils.bnToStr(await deptoken.decimals())

  console.log("Deploying ERC20 Dexalot Token")
  console.log("Name = ", await deptoken.name())
  console.log("Symbol = ", await deptoken.symbol())
  console.log("Decimals =", decimals_str)
  console.log("Address = ", deptoken.address)
  console.log("Total Supply", Utils.formatUnits(await deptoken.totalSupply(), parseInt(decimals_str)))

  fs.writeFileSync(`./scripts/${deployment_mode}-DexalotToken.json`,
                   JSON.stringify({"address": deptoken.address}, 0, 4),
                   "utf8",
                   function(err) {
    if (err) {
        console.log(err);
    }
  })

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => {
    console.log("ERC20 Dexalot Token deployed.")
    process.exit(0)
  })
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
