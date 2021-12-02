/**
 *
 * Common utility functions used across deployment and upgrade scripts
 *
 */

const fs = require("fs");

const { ethers } = require("ethers");

module.exports = {

    fromUtf8: function (txt) {
        return ethers.utils.formatBytes32String(txt);
    },

    toUtf8: function (txt) {
        return ethers.utils.parseBytes32String(txt);
    },

    formatUnits: function (bn, decimals) {
      return ethers.utils.formatUnits(bn, decimals);
    },

    parseUnits: function (txt, decimals) {
      return ethers.utils.parseUnits(txt, decimals);
    },

    bnToStr: function(_bn) {
        return _bn.toString();
    },

    getContractsAbi: function(contract) {
        const contractFile = "./artifacts/contracts/" + contract + ".sol/" + contract + ".json";
        return this.readFile(contractFile);
    },

    readFile: function  (filename) {
      if (fs.existsSync(filename)) {
        try {
          const jsonString = fs.readFileSync(filename)
            return JSON.parse(jsonString);
        } catch(err) {
          console.log(err)
          return
        }
      } else {
        console.log("File does not exist:", filename)
      }
    }

}
