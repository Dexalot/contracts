/**
 *
 * Common async utility functions used across deployment and upgrade scripts
 *
 */

const fs = require("fs");
const neatCsv = require('neat-csv');

module.exports = {

  loadData: async function (filename) {
    let rawdata = fs.readFileSync(filename);
    const result = await neatCsv(rawdata);
    return result;
},

  sleep: function (ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

}
