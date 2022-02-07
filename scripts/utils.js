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

    fromWei: function (wei) {
        return ethers.utils.formatEther(wei);
    },

    toWei: function (wei) {
        return ethers.utils.parseEther(wei);
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
    },

    saveFile: function (filename, content) {
      try {
        fs.writeFileSync(filename, content, undefined, 2);
        console.log("File saved:", filename);
      } catch(err) {
        console.log(err)
        return
      }
    },

    getContractVersionFromSol: function (filename) {
      if (fs.existsSync(filename)) {
        try {
          const content = fs.readFileSync(filename, 'utf8');
          let lines = content.split('\n');
          let line = lines.filter(line => /VERSION/.test(line));
          return line[0].match(/([0-9]{1,}\.)+[0-9]{1,}/g)[0];
        } catch(err) {
          console.log(err)
          return
        }
      } else {
        console.log("File does not exist:", filename)
      }
    },

    extractVersion: function (version) {
      version = version.replace('v', '')
      version = version.replace('.', '')
      version = version.replace('.', '')
      return parseInt(version)
    }

}
