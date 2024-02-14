/**
 *
 * Common utility functions
 *
 */

import fs from 'fs';
import neatCsv from 'neat-csv';

import { BigNumber, BigNumberish, ethers } from "ethers";

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

    static emptyCustomData() {
      return ethers.utils.hexZeroPad("0x", 28);
    }

    static generatePayload(xChainMsgType: number, nonce: number, tx: number, trader: string, symbol: string, quantity: BigNumber, timestamp: number, customdata: string) {
      const types = ["uint160", "uint64", "uint16", "uint16", "bytes32", "uint256", "bytes28", "uint32"];
      const values = [trader, nonce, tx, xChainMsgType, symbol, quantity, customdata, timestamp];
      return ethers.utils.solidityPack(types, values);
    }

    static async getOptions2 (gasMultiplier=110, nonce=0, gasPx= BigNumber.from(2500000000)): any {
      const gastoSend = Math.ceil(gasPx.mul(gasMultiplier).div(100).toNumber());
      const  maxPriorityFeePerGas= 1;
      const  optionsWithNonce = {gasLimit: 700000,  maxFeePerGas:gastoSend , maxPriorityFeePerGas }
      if (nonce>0 ){
        optionsWithNonce.nonce= nonce;
      }
      return optionsWithNonce;
    }

    static async executeAll(promises: any[]) {
      const txs = await Promise.all(promises);
      const results =  await Promise.all(txs.map((tx) => {
        if (tx.status === "fulfilled") {
          return tx.value.wait();
        }
      })
      );
      return results;
    }

    static async getClientOrderId(provider: any, account: string, counter=1) {
        const blocknumber =
            (await provider.getBlockNumber()) || 0
        const timestamp = new Date().toISOString()
        if (account) {
            const id = ethers.utils.toUtf8Bytes(`${account}${blocknumber}${timestamp}${counter}`);
            return ethers.utils.keccak256(id);
        }
        return ''
      }

      static async getBookwithLoop(tradePairs:any , tradePair: string, side: string) {
        const map1 = new Map();
        let price = BigNumber.from(0);
        let lastOrderId = this.fromUtf8("");
        const tradePairId = this.fromUtf8(tradePair);
        let book: any;
        let i;
        const nPrice = 50;
        const nOrder = 50
        //console.log( `getBookwithLoop called ${tradePair} ${side}: `);
        let k =0;
        let total = BigNumber.from(0);
        do {
          try {
          book = await tradePairs.getNBook(tradePairId, side === "BUY" ? 0 : 1 , nPrice, nOrder, price.toString(), lastOrderId);
          } catch (error){
            console.log(`${tradePair}, getBookwithLoop ${side} pass : ${k} `, error);
          }

          price = book[2];
          lastOrderId = book[3];
          k +=1;

          let currentRecord;
          for (i = 0; i < book[0].length; i++) {
            if (book[0][i].eq(0)) {
              //console.log (i);
              break;
            } else {
              const key = book[0][i].toString();
              if (map1.has(key)) {
                currentRecord = map1.get(key);
                if (currentRecord) {
                  currentRecord.quantity = book[1][i].add(currentRecord.quantity);
                }
              } else {
                map1.set(key, {
                  price: book[0][i],
                  quantity: book[1][i],
                  total
                });
              }
            }
          }
        } while (price.gt(0) || lastOrderId != this.fromUtf8(""));

        const orderbook = Array.from(map1.values());

        //Calc Totals orderbook.length>0 ? orderbook[0].quantity:

        for (i = 0; i < orderbook.length; i++) {
          total = total.add(orderbook[i].quantity);
          orderbook[i].total = total;
        }

        return orderbook;
      }
}
