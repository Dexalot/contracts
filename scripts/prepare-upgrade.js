// scripts/prepare_upgrade.js

// Proxy addresses
// Exchange proxy deployed at GET FROM DEPLOYMENT LOG
// Portfolio proxy deployed at GET FROM DEPLOYMENT LOG
// OrderBooks proxy deployed at GET FROM DEPLOYMENT LOG
// TradePairs proxy deployed at GET FROM DEPLOYMENT LOG

async function main() {
  const signers = await ethers.getSigners()
  accounts = []
  for (var i=0; i<signers.length; i++) {
    accounts.push(signers[i].address)
  }
  const deploymentAccount = accounts[0]
  console.log("Deployment Account:", deploymentAccount)

  // pick the proxy address for the contract to be updated
  const contractName = "SELECT FROM THE FOUR CONTRACTS"
  const proxyAddress = "GET FROM DEPLOYMENT LOG"
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
