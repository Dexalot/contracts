const fs = require("fs")
const { ethers } = require("hardhat")
require('dotenv').config({ path: '../.env' })

const Utils = require('../utils.js')

const deployment_mode = process.env?.DEPLOYMENT_MODE || "dev"
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

    const deployedStaking = await Staking.deploy(dexalotToken.address, dexalotToken.address, 86400 * 5)
    await deployedStaking.deployed();

    console.log("Deployment account:", deploymentWallet.address)
    console.log("Staking Contract Address:", deployedStaking.address)
    console.log("Rewards duration:", `${await deployedStaking.rewardsDuration()}`)
    console.log("Period finish:", `${await deployedStaking.periodFinish()}`)
}

main()
    .then(() => {
        console.log("Dexalot Staking contract has been deployed.")

        filename = "./artifacts/contracts/token/Staking.sol/Staking.json"
        data = Utils.readFile(filename, false)
        Utils.saveFile("../frontend/src/artifacts/contracts/Staking.json", JSON.stringify({abi: data.abi } , null, 2))

        filename = "./artifacts/contracts/token/DexalotToken.sol/DexalotToken.json"
        data = Utils.readFile(filename, false)
        Utils.saveFile("../frontend/src/artifacts/contracts/DexalotToken.json", JSON.stringify({abi: data.abi } , null, 2))

        process.exit(0)
    })
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
