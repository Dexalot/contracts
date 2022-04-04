
const fs = require('fs');
require('dotenv').config({path: './.env'});
const { MerkleTree } = require('merkletreejs')
const keccak256 = require('keccak256');
const { ethers } = require('hardhat');

const UtilsAsync = require('../utils-async');

const deployment_mode = process.env?.DEPLOYMENT_MODE || "dev"
const contracts_details = require(`../${deployment_mode}-contracts.json`)
const dexalotToken = require(`../${deployment_mode}-DexalotToken.json`);

const fileBase = 'TST';
const snapshotCSV = `./scripts/airdrop/data/${fileBase}.csv`;

let snapshot = [];

async function main() {

	// FOR AMA
	// const start = parseInt((new Date('April 2, 2022 19:00:00').getTime() / 1000).toFixed(0))  // date and time is local
	// const start = 1648944000                    // 4/2/2022 7pm CST = 1648944000
	// const cliff = 2592000                       // unix time, 2592000 for 1 month to 5/2/2022 7pm CST = 1651536000
	// const duration = 5270400                    // unix time, 5270400 for 2 months to 6/2/2022 7pm CST = 1654214400
	// const firstReleasePercentage = 50           // percentage, 50 for 50%

	// FOR TST
	const start = 1649070000                    // 4/4/2022 6am CST = 1649070000
	const cliff = 21600                         // unix time, 21600 for 6 hours
	const duration = 86400                      // unix time, 86400 for 24 hours
	const firstReleasePercentage = 50           // percentage, 50 for 50%

	let userBalanceAndHashes = [];
	let userBalanceHashes = [];

	let snapshotList = await UtilsAsync.loadData(snapshotCSV);

	for (var i=0; i<snapshotList.length; i++) {
		let rec = snapshotList[i]
		var obj = {}
		obj['address'] = rec['address']
		obj['amount'] = `${Utils.parseUnits(rec['amount'], 18)}`
		snapshot.push(obj)
	}

	snapshot.forEach((item, index) => {
		let hash = ethers.utils.solidityKeccak256(['uint256', 'address', 'uint256'], [index, item.address, item.amount]);
		let balance = {
			address: item.address,
			balance: item.amount,
			hash: hash,
			proof: '',
			index: index,
		};

		userBalanceHashes.push(hash);
		userBalanceAndHashes.push(balance);
	});

	const merkleTree = new MerkleTree(userBalanceHashes, keccak256, {
		sortLeaves: true,
		sortPairs: true,
	});

	for (let ubh in userBalanceAndHashes) {
		userBalanceAndHashes[ubh].proof = merkleTree.getHexProof(userBalanceAndHashes[ubh].hash);
	}

	// save hashes of airdrops as a json file
	fs.writeFileSync(
		`./scripts/airdrop/data/${deployment_mode}-hashes-${fileBase}-airdrop.json`,
		JSON.stringify(userBalanceAndHashes, 0, 4),
		"utf-8",
		function (err) {
			if (err) return console.log(err);
		}
	);

	const root = merkleTree.getHexRoot();
	console.log('tree root:', root);

	const Airdrop = await ethers.getContractFactory("Airdrop");
	const airdrop = await Airdrop.deploy(dexalotToken.address, root, start, cliff, duration, firstReleasePercentage);
	await airdrop.deployed();

	console.log("Airdrop Contract Address = ", airdrop.address);
	console.log("Start = ", parseInt(await airdrop.start()))
	console.log("Cliff = ", parseInt(await airdrop.cliff()))
  	console.log("Duration = ", parseInt(await airdrop.duration()))
	console.log("Dexalot Token Address = ", dexalotToken.address)

	fs.writeFileSync(`./scripts/airdrop/${deployment_mode}-${fileBase}-airdrop.json`,
		JSON.stringify({ "address": airdrop.address }, 0, 4),
		"utf8",
		function (err) {
			if (err) {
				console.log(err);
			}
		});

	// transfer ownership of airdrop contract to token safe
	let tx = await airdrop.transferOwnership(contracts_details.TokenSafe)
	await tx.wait()
	console.log(`Airdrop ${airdrop.address} ownership transferred to Token Safe ${await airdrop.owner()} [${tx.hash}]`)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => {
    console.log()
    console.log(`${fileBase} airdrop contract deployed.`)
    process.exit(0)
  })
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
