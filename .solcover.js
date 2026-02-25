module.exports = {
  skipFiles: [
    "mocks",
    "others",
    "vaults/OmniVaultCreator.sol",
    "vaults/OmniVaultExecutor.sol",
    "vaults/OmniVaultExecutorSub.sol",
    "vaults/OmniVaultManager.sol",
  ],
  mocha: {
    grep: "@skip-on-coverage", // Find everything with this tag
    invert: true // Run the grep's inverse set.
  },
  configureYulOptimizer: true
};
