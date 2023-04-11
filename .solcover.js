module.exports = {
    skipFiles: [
                    "mocks",
                    "bridgeApps/CelerApp",
                    "interfaces/celer",
                    "library/celer",
                    "MainnetRFQAssembly"
                ],
    mocha: {
        grep: "@skip-on-coverage", // Find everything with this tag
        invert: true               // Run the grep's inverse set.
        },
    configureYulOptimizer: true
  };
