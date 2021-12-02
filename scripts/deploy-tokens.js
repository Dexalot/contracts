
const fs = require("fs")
const { ethers } = require("hardhat")

const Utils = require('./utils.js')

const MINTAMOUNT = '500000'


async function main() {
  const signers = await ethers.getSigners()
  accounts = []
  for (var i=0; i<signers.length; i++) {
    accounts.push(signers[i].address)
  }
  const deploymentAccount = accounts[0]
  console.log("Deployment Account:", deploymentAccount)

  const MockToken = await ethers.getContractFactory("MockToken")

  // add ERC20 Tokens
  // DEVELOPMENT CODE START
  // add mock tokens from the dev-tokens.json file and write dev-tokensWithAddress.json for dev-deploy.js to use
  // it will be replaced by code to add actual ERC20 tokens for PRODUCTION
  // ************
  const tokens = require("./dev-tokens.json")

  let tokensWithAddress = []

  for (const token of tokens)  {
    if (!token.isnative) {
      var deptoken
      deptoken = await  MockToken.deploy(token.name, token.symbol, token.evmdecimals)
      await deptoken.deployed()
      console.log("New ERC20 Token = ", await deptoken.name(), "(", await deptoken.symbol(), ",",
                  Utils.bnToStr(await deptoken.decimals()), ") at ", deptoken.address)
      token.address = deptoken.address

      for (i=0; i<accounts.length; i++) {
        account = accounts[i]
        console.log("balance of ", account, " before minting ", token.symbol, parseFloat(Utils.formatUnits((await deptoken.balanceOf(account)), token.evmdecimals)).toFixed(1))
        mintAmount = MINTAMOUNT - parseFloat(Utils.formatUnits((await deptoken.balanceOf(account)), token.evmdecimals))
        mintAmount = mintAmount<0 ? 0 : mintAmount
        if (mintAmount>0 && token.name.substring(0,4) === "Mock") {
          const tx = await deptoken.mint(account, Utils.parseUnits(mintAmount.toFixed(1), token.evmdecimals))
          if (i === accounts.length-1) {
            await tx.wait()
          }
        }
      }
      for (i=0; i<accounts.length; i++) {
        account = accounts[i]
        console.log("balance of ", account, " after minting", token.symbol, Utils.formatUnits((await deptoken.balanceOf(account)), token.evmdecimals))
      }
    }
    tokensWithAddress.push(token)
  }

  fs.writeFileSync("./scripts/dev-tokensWithAddress.json", JSON.stringify(tokensWithAddress, 0, 4), "utf8", function(err) {
    if (err) {
        console.log(err);
    }
  })

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => {
    console.log("Token deployment and minting finished.")
    process.exit(0)
  })
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
