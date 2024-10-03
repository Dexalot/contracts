module.exports = {
  skipFiles: [
    "mocks",
    "bridgeApps/CelerApp",
    "interfaces/celer",
    "library/celer",
    "MainnetRFQAssembly",
    "others/Multicall3",
    "PortfolioMainBnb",
    "bridgeApps/teleporter",
  ],
  mocha: {
    grep: "@skip-on-coverage", // Find everything with this tag
    invert: true // Run the grep's inverse set.
  },
  configureYulOptimizer: true
};
