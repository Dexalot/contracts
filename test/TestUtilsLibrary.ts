/**
 * The test runner for Dexalot UtilsLibrary contract
 */

import Utils from './utils';
import BN from 'bignumber.js';
import type {
    UtilsLibraryMock,

} from '../typechain-types';

import { expect } from "chai";
import { ethers } from "hardhat";
import { ContractFactory } from 'ethers';


describe("UtilsLibrary via UtilsLibraryMock", function () {
    let UtilsLibraryMock: ContractFactory;
	let utilsLibraryMock: UtilsLibraryMock;

	before(async function () {
		UtilsLibraryMock = await ethers.getContractFactory("UtilsLibraryMock");
		utilsLibraryMock = await UtilsLibraryMock.deploy();
	});

	it('Should return isdecimalsOk correctly', async () => {
		expect(await utilsLibraryMock.decimalsOk(Utils.parseUnits("1.23", 18), 18, 2)).to.be.true;
		expect(await utilsLibraryMock.decimalsOk(Utils.parseUnits("1.234", 18), 18, 2)).to.be.false;
	});

	it('Should return getRemainingQuantity() correctly', async () => {
		expect(await utilsLibraryMock.getRemainingQuantity(
			Utils.parseUnits("1.23", 18), Utils.parseUnits("1.13", 18))
		).to.be.equal(Utils.parseUnits("0.1", 18))
	});



	it('Should return uint256ToAddress() addressToUint256() correctly', async () => {

		expect(await utilsLibraryMock.uint256ToAddress(0)).to.be.equal(ethers.constants.AddressZero);

		const addrAsUint =await utilsLibraryMock.addressToUint256("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
		expect(await utilsLibraryMock.uint256ToAddress(addrAsUint)).to.be.equal("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
	});

	it('Should return canCancel() correctly', async () => {
		// enum Status {
		// 	NEW,       // 0
		// 	REJECTED,  // 1
		// 	PARTIAL,   // 2
		// 	FILLED,    // 3
		// 	CANCELED,  // 4
		// 	EXPIRED,   // 5
		// 	KILLED     // 6
		// }
		// quantityFilled < _quantity
		expect(await utilsLibraryMock.canCancel(Utils.parseUnits("100", 18), Utils.parseUnits("10", 18), 0)).to.be.true;
		expect(await utilsLibraryMock.canCancel(Utils.parseUnits("100", 18), Utils.parseUnits("10", 18), 1)).to.be.false;
		expect(await utilsLibraryMock.canCancel(Utils.parseUnits("100", 18), Utils.parseUnits("10", 18), 2)).to.be.true;
		expect(await utilsLibraryMock.canCancel(Utils.parseUnits("100", 18), Utils.parseUnits("10", 18), 3)).to.be.false;
		expect(await utilsLibraryMock.canCancel(Utils.parseUnits("100", 18), Utils.parseUnits("10", 18), 4)).to.be.false;
		expect(await utilsLibraryMock.canCancel(Utils.parseUnits("100", 18), Utils.parseUnits("10", 18), 5)).to.be.false;
		expect(await utilsLibraryMock.canCancel(Utils.parseUnits("100", 18), Utils.parseUnits("10", 18), 6)).to.be.false;
		// quantityFilled > _quantity
		expect(await utilsLibraryMock.canCancel(Utils.parseUnits("10", 18), Utils.parseUnits("108", 18), 0)).to.be.false;
		expect(await utilsLibraryMock.canCancel(Utils.parseUnits("10", 18), Utils.parseUnits("108", 18), 1)).to.be.false;
		expect(await utilsLibraryMock.canCancel(Utils.parseUnits("10", 18), Utils.parseUnits("108", 18), 2)).to.be.false;
		expect(await utilsLibraryMock.canCancel(Utils.parseUnits("10", 18), Utils.parseUnits("108", 18), 3)).to.be.false;
		expect(await utilsLibraryMock.canCancel(Utils.parseUnits("10", 18), Utils.parseUnits("108", 18), 4)).to.be.false;
		expect(await utilsLibraryMock.canCancel(Utils.parseUnits("10", 18), Utils.parseUnits("180", 18), 5)).to.be.false;
		expect(await utilsLibraryMock.canCancel(Utils.parseUnits("10", 18), Utils.parseUnits("180", 18), 6)).to.be.false;
	});

	it('Should return floor() correctly', async () => {
		// 1.634 USDT - token decimals 6, displayDecimals = 3
		expect(await utilsLibraryMock.floor(Utils.parseUnits("1.634", 6), 3)).to.be.equal(Utils.parseUnits("1.634", 6));
		expect(await utilsLibraryMock.floor(Utils.parseUnits("1.634", 6), 4)).to.be.equal(Utils.parseUnits("1.630", 6));
		expect(await utilsLibraryMock.floor(Utils.parseUnits("1.634", 6), 5)).to.be.equal(Utils.parseUnits("1.600", 6));
		expect(await utilsLibraryMock.floor(Utils.parseUnits("1.634", 6), 6)).to.be.equal(Utils.parseUnits("1.000", 6));
		// 1.63 AVAX - token decimals 18, displayDecimals = 2
		expect(await utilsLibraryMock.floor(Utils.parseUnits("1.63", 18), 16)).to.be.equal(Utils.parseUnits("1.63", 18));
		expect(await utilsLibraryMock.floor(Utils.parseUnits("1.63", 18), 17)).to.be.equal(Utils.parseUnits("1.60", 18));
		expect(await utilsLibraryMock.floor(Utils.parseUnits("1.63", 18), 18)).to.be.equal(Utils.parseUnits("1.00", 18));
		// 1.634 AVAX - token decimals 18, displayDecimals = 3
		expect(await utilsLibraryMock.floor(Utils.parseUnits("1.634", 18), 15)).to.be.equal(Utils.parseUnits("1.634", 18));
		expect(await utilsLibraryMock.floor(Utils.parseUnits("1.634", 18), 16)).to.be.equal(Utils.parseUnits("1.630", 18));
		expect(await utilsLibraryMock.floor(Utils.parseUnits("1.634", 18), 17)).to.be.equal(Utils.parseUnits("1.600", 18));
		expect(await utilsLibraryMock.floor(Utils.parseUnits("1.634", 18), 18)).to.be.equal(Utils.parseUnits("1.000", 18));
	});

	it('Should return getFee() correctly', async () => {

		// _m= (_tradePair.baseDecimals - _tradePair.baseDisplayDecimals)
		//ETH/USDC     ETH baseDecimals= 18, baseDisplayDecimals = 5   (_m=13)  USDC -. quoteDecimals= 6, quoteDisplayDecimals = 1  (_m=5)
		//AVAX/USDC    AVAX baseDecimals= 18, baseDisplayDecimals = 3  (_m=15)  USDC -. quoteDecimals= 6, quoteDisplayDecimals = 3  (_m=3)
		//ARB/USDC     ARB baseDecimals= 18, baseDisplayDecimals = 2   (_m=16)  USDC -. quoteDecimals= 6, quoteDisplayDecimals = 4  (_m=2)
		//ARENA/AVAX   ARENA baseDecimals= 18, baseDisplayDecimals = 0 (_m=18)  AVAX -. quoteDecimals= 18, quoteDisplayDecimals = 8 (_m=10)
		//BTC/USDC     BTC baseDecimals= 8, baseDisplayDecimals = 6    (_m=2)   USDC -. quoteDecimals= 6, quoteDisplayDecimals = 1  (_m=5)
		//COQ/AVAX     COQ baseDecimals= 18, baseDisplayDecimals = 0   (_m=18)  AVAX -. quoteDecimals= 18, quoteDisplayDecimals = 11 (_m=7)


		//getFee(uint256 _amount, uint256 _rate, uint256 _m) _rate is in 1 per 1000 NOT bps
		// 10 bps rate (0.1%) should be passed as 100

		//USDC 10bps rate on 100 = 0.1
		expect(await utilsLibraryMock.getFee(Utils.parseUnits("100", 6), 100)).to.be.equal(Utils.parseUnits("0.1", 6));

		let td = 6;
		let bps = 12;
		let amount = 5;

		let calculatedFee = BN(amount).times(bps).div(10000);
		// console.log(bps, "bps on $", amount, "USDC. Actual Fee:", calculatedFee.toString())

		expect(await utilsLibraryMock.getFee(Utils.parseUnits(amount.toString(), td), bps * 10)).to.be.equal(Utils.parseUnits(calculatedFee.toString(), 6));

		bps = 10
		amount = 1;

		calculatedFee = BN(amount).times(bps).div(10000);
		// console.log(bps, "bps on $", amount, "USDC. Actual Fee:" ,  calculatedFee.toString())
		expect(await utilsLibraryMock.getFee(Utils.parseUnits(amount.toString(), td), bps * 10)).to.be.equal(Utils.parseUnits(calculatedFee.toString(), 6));

		bps = 0.5
		amount = 1;
		calculatedFee = BN(amount).times(bps).div(10000);
		// console.log(bps, "bps(min taker fee) on $", amount, "USDC. Actual Fee:" ,  calculatedFee.toString())
		expect(await utilsLibraryMock.getFee(Utils.parseUnits(amount.toString(), td), bps * 10)).to.be.equal(Utils.parseUnits(calculatedFee.toString(), 6));
		amount = 0.0005;


		calculatedFee = BN(amount).times(bps).div(10000);
		// console.log(bps, "bps on $", amount, "USDC. Actual Fee:" ,  calculatedFee.toString())

		// The actual fee has precision after 6th digit , so it is 0
		// we do a round up here to get the minimum unit which matches the minimum unit from the getFee function
		calculatedFee = calculatedFee.dp(6, BN.ROUND_UP);
		expect(await utilsLibraryMock.getFee(Utils.parseUnits(amount.toString(), td), bps * 10)).to.be.equal(Utils.parseUnits(calculatedFee.toString(), 6));



	});

	it('Should return min() correctly', async () => {
		// a > b
		expect(await utilsLibraryMock.min(
			Utils.parseUnits("100", 18), Utils.parseUnits("10", 18))
		).to.be.
			equal(Utils.parseUnits("10", 18));
		// a < b
		expect(await utilsLibraryMock.min(
			Utils.parseUnits("10", 18), Utils.parseUnits("100", 18))
		).to.be.equal(Utils.parseUnits("10", 18));
	});

	it('Should return max() correctly', async () => {
		// a > b
		expect(await utilsLibraryMock.max(
			Utils.parseUnits("100", 18), Utils.parseUnits("10", 18))
		).to.be.equal(Utils.parseUnits("100", 18));
		// a < b
		expect(await utilsLibraryMock.max(
			Utils.parseUnits("10", 18), Utils.parseUnits("100", 18))
		).to.be.equal(Utils.parseUnits("100", 18));
	});

	it('Should return bytes32ToString() correctly', async () => {
		const testString = "Dexalot is awesome!";
		const testBytes32 = Utils.fromUtf8(testString);
		expect(await utilsLibraryMock.bytes32ToString(testBytes32)).to.be.equal(testString);
	});

	it('Should return stringToBytes32() correctly', async () => {
		const testString = "Dexalot is awesome!";
		const testBytes32 = Utils.fromUtf8(testString);
		expect(await utilsLibraryMock.stringToBytes32(testString)).to.be.equal(testBytes32);
	});

	it('Should return slice() correctly', async () => {
		const testString = "Dexalot is awesome!";
		const testBytes32 = Utils.fromUtf8(testString);
		// 0x446578616c6f7420697320617765736f6d652100000000000000000000000000 =  bytes.length = 64
		// fail - length parameter passed cannot be larger than bytes.length + 31
		await expect(utilsLibraryMock.slice(testBytes32, 0, 96)).to.be.revertedWith("slice_overflow");
		// fail - start + length <= bytes.length
		await expect(utilsLibraryMock.slice(testBytes32, 30, 5)).to.be.revertedWith("slice_outOfBounds");
		const result = await utilsLibraryMock.slice(testBytes32, 10, 5);
		expect(result).to.be.equal("0x2061776573");
	});
});
