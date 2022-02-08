
const fs = require('fs');
require('dotenv').config({path: './.env'})
const { MerkleTree } = require('merkletreejs')
const keccak256 = require('keccak256');
const { ethers } = require('hardhat');

const UtilsAsync = require('../utils-async');

const deployment_mode = process.env?.DEPLOYMENT_MODE || "dev-local"

const dexalotToken = require(`../${deployment_mode}-DexalotToken.json`);

const fileBase = 'DD_Battle_TEST-001';
const snapshotCSV = `./scripts/airdrop/data/${fileBase}.csv`;

let snapshot = [];

async function deploy_airdrop() {
	let accounts = await ethers.getSigners();

	let userBalanceAndHashes = [];
	let userBalanceHashes = [];

	let snapshotList = await UtilsAsync.loadData(snapshotCSV);

	for (var i=0; i<snapshotList.length; i++) {
		let rec = snapshotList[i]
		var obj = {}
		obj['address'] = rec['address']
		obj['amount'] = rec['amount']
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
		`./scripts/airdrop/${deployment_mode}-hashes-${fileBase}.json`,
		JSON.stringify(userBalanceAndHashes, 0, 4),
		"utf-8",
		function (err) {
			if (err) return console.log(err);
		}
	);

	const root = merkleTree.getHexRoot();
	console.log('tree root:', root);

	const Airdrop = await ethers.getContractFactory("Airdrop");
	const airdropDeployed = await Airdrop.deploy(dexalotToken.address, root);
	await airdropDeployed.deployed();

	console.log("Address = ", airdropDeployed.address);

	fs.writeFileSync(`./scripts/airdrop/${deployment_mode}-airdrop.json`,
		JSON.stringify({ "address": airdropDeployed.address }, 0, 4),
		"utf8",
		function (err) {
			if (err) {
				console.log(err);
			}
		});
}

deploy_airdrop()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
