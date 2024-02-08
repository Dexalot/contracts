/**
 * The test runner for Dexalot UtilsLibrary contract
 */

import Utils from './utils';

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

	it('Should return matchingAllowed() correctly', async () => {
		// enum AuctionMode {
		// 	OFF,           // 0
		// 	LIVETRADING,   // 1
		// 	OPEN,          // 2
		// 	CLOSING,       // 3
		// 	PAUSED,        // 4
		// 	MATCHING,      // 5
		// 	RESTRICTED     // 6
		// }
		expect(await utilsLibraryMock.matchingAllowed(0)).to.be.true;
		expect(await utilsLibraryMock.matchingAllowed(1)).to.be.true;
		expect(await utilsLibraryMock.matchingAllowed(2)).to.be.false;
		expect(await utilsLibraryMock.matchingAllowed(3)).to.be.false;
		expect(await utilsLibraryMock.matchingAllowed(4)).to.be.false;
		expect(await utilsLibraryMock.matchingAllowed(5)).to.be.false;
		expect(await utilsLibraryMock.matchingAllowed(6)).to.be.false;
	});

	it('Should return isAuctionRestricted() correctly', async () => {
		// enum AuctionMode {
		// 	OFF,           // 0
		// 	LIVETRADING,   // 1
		// 	OPEN,          // 2
		// 	CLOSING,       // 3
		// 	PAUSED,        // 4
		// 	MATCHING,      // 5
		// 	RESTRICTED     // 6
		// }
		expect(await utilsLibraryMock.isAuctionRestricted(0)).to.be.false;
		expect(await utilsLibraryMock.isAuctionRestricted(1)).to.be.false;
		expect(await utilsLibraryMock.isAuctionRestricted(2)).to.be.false;
		expect(await utilsLibraryMock.isAuctionRestricted(3)).to.be.true;
		expect(await utilsLibraryMock.isAuctionRestricted(4)).to.be.false;
		expect(await utilsLibraryMock.isAuctionRestricted(5)).to.be.false;
		expect(await utilsLibraryMock.isAuctionRestricted(6)).to.be.true;
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

	it('Should return min() correctly', async () => {
		// a > b
		expect(await utilsLibraryMock.min(
			Utils.parseUnits("100", 18), Utils.parseUnits("10", 18))
		).to.be.equal(Utils.parseUnits("10", 18));
		// a < b
		expect(await utilsLibraryMock.min(
			Utils.parseUnits("10", 18), Utils.parseUnits("100", 18))
		).to.be.equal(Utils.parseUnits("10", 18));
	});

	it('Should return min() correctly', async () => {
		// a > b
		expect(await utilsLibraryMock.min(
			Utils.parseUnits("100", 18), Utils.parseUnits("10", 18))
		).to.be.equal(Utils.parseUnits("10", 18));
		// a < b
		expect(await utilsLibraryMock.min(
			Utils.parseUnits("10", 18), Utils.parseUnits("100", 18))
		).to.be.equal(Utils.parseUnits("10", 18));
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
