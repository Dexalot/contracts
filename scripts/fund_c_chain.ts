
import { ethers } from "ethers"

require('dotenv').config({path: './.env'});

const funderKey = process.env.FUNDER_KEY
const ip: string = process.env.CHAIN_INSTANCE
const networkID: number = parseInt(process.env.CHAIN_ID)
const FUND_AMT = '1000000'

const provider = new ethers.providers.JsonRpcProvider(ip, networkID);

let funderWallet = new ethers.Wallet(funderKey, provider)


async function main(){
  let funderAddress = await funderWallet.getAddress()
  const balanceFunder = await provider.getBalance(funderAddress)
  console.log(`Balance of funder account ${funderAddress}: ${ethers.utils.formatEther(balanceFunder)} AVAX`)

  let nonce = await funderWallet.getTransactionCount()

  const accounts = [];
  accounts.push(process.env.DEPLOYMENT_ACCOUNT_ADDRESS)

  for(var i=0;i<accounts.length;i++){
    let acct = accounts[i];
    console.log(`Sending ${FUND_AMT} AVAX to account ${acct}`)

    let weiAmt = ethers.utils.parseEther(FUND_AMT)
    const params = {
      to: acct,
      value: weiAmt,
      gasLimit: 21000,
      gasPrice: 225000000000,
      nonce: nonce++
    }
    let receipt = await funderWallet.sendTransaction(params)
    console.log("Tx Hash: " + receipt.hash)
  }
}

provider.ready.then(net => {
  main();
})
