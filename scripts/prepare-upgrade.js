// scripts/prepare_upgrade.js

// Implementations deployed on 12/3/2021
// Exchange implementation: 0x80768783d18aD5c9dE46d2cDE398fb0c193d5885     - v1.1.0
// Portfolio implementation: 0xaC0F301b3F7e1d48553535089BB2C201760DE0d4    - v1.1.0
// TradePairs implementation: 0x625B7d76f69095907Fc3B467C0C3be07d1987BA1   - v1.1.0
// OrderBooks implementation: 0x9Cf797Df135AA671E97d1B713CDAEeA9FCA9170e   - v1.1.0

// Implementations deployed on 02/22/2022
// Exchange implementation:    0x2F44515DC357e64edAc8cf0480B2A6eB626d1979     - v1.2.5
// Portfolio implementation:   0x0bc1c72a169d8a5a564D787A46521496a008e8eF     - v1.2.1
// TradePairs implementation:  0xa61008D3F38AE02325AE13D7d6B67ceBD02d18F4     - v1.2.8
// OrderBooks implementation:  0x38D9f113290eC7B90961beA854D7F2c1535a32fd     - v1.2.1

//=================================================================================

// Proxies deployed on 12/3/2021
// Exchange proxy: 0x12E2b3236D338651F7Ee2222e9756B4222694323
// Portfolio proxy: 0x6F8205cf222dD4C6615991C7F604F366526B5C6E
// TradePairs proxy: 0x1D34b421A5eDE3e300d3b8BCF3BE5c6f45971E20
// OrderBooks proxy: 0x3Ece76F7AdD934Fb8a35c9C371C4D545e299669A

async function main() {
  const signers = await ethers.getSigners()
  accounts = []
  for (var i=0; i<signers.length; i++) {
    accounts.push(signers[i].address)
  }
  const deploymentAccount = accounts[0]
  console.log("Deployment Account:", deploymentAccount)

  // pick the proxy address for the contract to be updated
  const contractName = ""
  const proxyAddress = ""
  console.log(`${contractName} proxy at ${proxyAddress}`)
  const contractNewVersion = await ethers.getContractFactory(contractName)
  console.log("Preparing upgrade...")
  const upgradedContractAddress = await upgrades.prepareUpgrade(proxyAddress, contractNewVersion)
  console.log(`${contractName} prepared for upgrade with new implementation at ${upgradedContractAddress}`)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
