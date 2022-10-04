/**
 *
 * Common utility functions
 *
 */

import fs from 'fs';
import neatCsv from 'neat-csv';

import { BigNumberish, ethers } from "ethers";

const assetMap: any = {"0": "NATIVE", "1": "ERC20 ", "2": "NONE"}

export default class utils {

    static fromUtf8(txt: string) {
        return ethers.utils.formatBytes32String(txt)
    }

    static toUtf8(txt: string) {
        return ethers.utils.parseBytes32String(txt)
    }

    static fromWei(wei: BigNumberish) {
        return ethers.utils.formatEther(wei) as any
    }

    static toWei(wei: string) {
        return ethers.utils.parseEther(wei)
    }

    static formatUnits(bn: BigNumberish, decimals: number) {
        return ethers.utils.formatUnits(bn, decimals) as any
    }

    static parseUnits (txt: string, decimals: number) {
        return ethers.utils.parseUnits(txt, decimals)
    }

    static bnToStr(bn: BigNumberish) {
        return bn.toString()
    }

    static strToBn(str: string) {
        return ethers.BigNumber.from(str)
    }

    static printResults(account: string, name: string, res: any, decimals: number) {
        const assetTypeInt = parseInt(res.assetType.toString());
        console.log("Account: ", account, ":::",
        name, "::", assetMap[assetTypeInt], "::",
        ethers.utils.formatUnits(res.available, decimals), "/",
        ethers.utils.formatUnits(res.total, decimals), "/",
        "[P Avail / P Tot]");
    }

    static printBalances(_account: string, _res: any, decimals: number) {
        const assetTypeInt = parseInt(_res.assetType.toString());
        console.log("Account: ", _account, " ::: ",
        assetMap[assetTypeInt], " :: ",
        ethers.utils.formatUnits(_res.available, decimals), "/",
        ethers.utils.formatUnits(_res.total, decimals), "/",
        "[P Avail / P Tot]");
    }

    static async loadOrders(filename: string) {
        const rawdata = fs.readFileSync(filename);
        const result = await neatCsv(rawdata);
        return result;
    }

    static getMapKeyByValue(map: Map<any, any>, searchValue: any) {
        for (const [key, value] of map.entries()) {
            if (value.id === searchValue)
                return key;
        }
    }

    static async getClientOrderId(provider: any, account: string) {
        const blocknumber =
            (await provider.getBlockNumber()) || 0
        const timestamp = new Date().toISOString()
        if (account) {
            const id = ethers.utils.toUtf8Bytes(`${account}${blocknumber}${timestamp}`);
            return ethers.utils.keccak256(id);
        }
        return ''
      }
}
