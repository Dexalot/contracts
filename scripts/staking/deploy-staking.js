const fs = require("fs")
require('dotenv').config({ path: '../.env' })
const { ethers, upgrades } = require("hardhat")

const Utils = require('../utils.js')

const deployment_mode = process.env?.DEPLOYMENT_MODE || "dev-local"
const dexalotToken = require(`../${deployment_mode}-DexalotToken.json`)


async function main() {
    const signers = await ethers.getSigners()
    accounts = []
    for (var i = 0; i < signers.length; i++) {
        accounts.push(signers[i].address)
    }
    const deploymentWallet = signers[0]

    const Staking = await ethers.getContractFactory("Staking")

    console.log("Deployment account:", deploymentWallet.address)

    const deployedStaking = await Staking.deploy(dexalotToken.address, dexalotToken.address)
    await deployedStaking.deployed();

    console.log("Staking Contract Address = ", deployedStaking.address)
}

main()
    .then(() => {
        console.log("Dexalot Staking contract has been deployed.")

        //console.log("Saving artifacts for frontend")

        //filename = "./artifacts/contracts/token/Staking.sol/Staking.json"
        //data = Utils.readFile(filename, false)
        //Utils.saveFile("../token-vesting-app/src/artifacts/contracts/DexalotToken.json", JSON.stringify({abi: data.abi } , null, 2))

        process.exit(0)
    })
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
