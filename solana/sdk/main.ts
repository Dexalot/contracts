import { getUserInput } from "./utils";
import { printCommands, printSections } from "./command";
import Interactor from "./interactor";
import { green } from "kleur";
import { red } from "kleur";

const exitNum = 13;

const main = async () => {
  while (true) {
    console.clear();
    printSections();
    const sectionCommand = await getUserInput("Enter section: \n");
    console.clear();

    if (Number(sectionCommand) === exitNum) {
      console.log(green("Exiting..."));
      process.exit(0);
    }
    printCommands(sectionCommand);
    const command_str = await getUserInput("Enter command: \n");
    const command = Number(command_str);
    switch (sectionCommand) {
      case "1": // Initialize
        if (command_str === "") {
          continue;
        }
        switch (command) {
          case 1:
            await Interactor.initialize();
            break;
          case 2:
            await Interactor.initializeLayerzero();
            break;
          default:
            console.error(red("\n\nInvalid command!\n\n"));
        }
        break;
      case "2": // Global configuration
        if (command_str === "") {
          continue;
        }
        switch (command) {
          case 1:
            await Interactor.setDefaultChainEid();
            break;
          case 2:
            await Interactor.setAirdropAmount();
            break;
          case 3:
            await Interactor.pauseProgram();
            break;
          case 4:
            await Interactor.unpauseProgram();
            break;
          case 5:
            await Interactor.enableAllowDeposit();
            break;
          case 6:
            await Interactor.disableAllowDeposit();
            break;
          case 7:
            await Interactor.enableNativeDeposits();
            break;
          case 8:
            await Interactor.disableNativeDeposits();
            break;
          case 9:
            await Interactor.setSwapSigner();
            break;
          case 10:
            await Interactor.getGlobalConfig();
            break;
          default:
            console.error(red("\n\nInvalid command!\n\n"));
        }
        break;
      case "3": // Layerzero
        if (command_str === "") {
          continue;
        }
        switch (command) {
          case 1:
            await Interactor.setRemote();
            break;
          case 2:
            await Interactor.getRemote();
            break;
          case 3:
            await Interactor.getPortfolioPDA();
            break;
          default:
            console.error(red("\n\nInvalid command!\n\n"));
        }
        break;
      case "4": // Wallet & Balance
        if (command_str === "") {
          continue;
        }
        switch (command) {
          case 1:
            await Interactor.createWallet();
            break;
          case 2:
            await Interactor.loadWallet();
            break;
          case 3:
            await Interactor.createKeypairFileFromSecretKey();
            break;
          case 4:
            await Interactor.printWallet();
            break;
          case 5:
            await Interactor.showBalance();
            break;
          case 6:
            await Interactor.requestAirdrop();
            break;
          default:
            console.error(red("\n\nInvalid command!\n\n"));
        }
        break;
      case "5": // Account management
        if (command_str === "") {
          continue;
        }
        switch (command) {
          case 1:
            await Interactor.addAdmin();
            break;
          case 2:
            await Interactor.removeAdmin();
            break;
          case 3:
            await Interactor.banAccount();
            break;
          case 4:
            await Interactor.unbanAccount();
            break;
          case 5:
            await Interactor.addRebalancer();
            break;
          case 6:
            await Interactor.removeRebalancer();
            break;
          default:
            console.error(red("\n\nInvalid command!\n\n"));
        }
        break;
      case "6": // SOL vaults
        if (command_str === "") {
          continue;
        }
        switch (command) {
          case 1:
            await Interactor.getSolVaultBalance();
            break;
          case 2:
            await Interactor.getSolUserFundsVaultBalance();
            break;
          case 3:
            await Interactor.getAirdropVaultBalance();
            break;
          default:
            console.error(red("\n\nInvalid command!\n\n"));
        }
        break;
      case "7": // Token operations
        if (command_str === "") {
          continue;
        }
        switch (command) {
          case 1:
            await Interactor.createNewToken();
            break;
          case 2:
            await Interactor.checkIsTokenSupproted();
            break;
          case 3:
            await Interactor.addToken();
            break;
          case 4:
            await Interactor.getTokenDetails();
            break;
          case 5:
            await Interactor.removeToken();
            break;
          case 6:
            await Interactor.mintSPLToken();
            break;
          case 7:
            await Interactor.getSPLTokenBalanceOfActiveWallet();
            break;
          case 8:
            await Interactor.getSPLTokenVaultBalance();
            break;
          case 9:
            await Interactor.getSPLTokenUserFundsVaultBalance();
            break;
          case 10:
            await Interactor.getSPLTokenBalanceOfPubkey();
            break;
          case 11:
            await Interactor.createAccount();
            break;
          default:
            console.error(red("\n\nInvalid command!\n\n"));
        }
        break;
      case "8": // Deposits
        if (command_str === "") {
          continue;
        }
        switch (command) {
          case 1:
            await Interactor.depositToSolVault();
            break;
          case 2:
            await Interactor.depositSPLToken();
            break;
          case 3:
            await Interactor.depositToAirdropVault();
            break;
          default:
            console.error(red("\n\nInvalid section!\n\n"));
        }
        break;
      case "9": // Swaps
        if (command_str === "") {
          continue;
        }
        switch (command) {
          case 1:
            await Interactor.simpleSwap();
            break;
          case 2:
            await Interactor.partialSwap();
            break;
          case 3:
            await Interactor.crossSwap();
            break;
          case 4:
            await Interactor.removeFromSwapQueue();
            break;
          case 5:
            await Interactor.updateSwapExpiry();
            break;
          case 6:
            await Interactor.addDestination();
            break;
          default:
            console.error(red("\n\nInvalid command!\n\n"));
        }
        break;
      case "10":
        if (command_str === "") {
          continue;
        }
        switch (command) {
          case 1:
            await Interactor.claimSplBalance();
            break;
          case 2:
            await Interactor.claimNativeBalance();
            break;
          case 3:
            await Interactor.claimAirdropBalance();
            break;
          default:
            console.error(red("\n\nInvalid command!\n\n"));
        }
        break;
      case "11":
        if (command_str === "") {
          continue;
        }
        switch (command) {
          case 1:
            await Interactor.fundSol();
            break;
          case 2:
            await Interactor.fundSpl();
            break;
          default:
            console.error(red("\n\nInvalid command!\n\n"));
        }
        break;
      case "12":
        if (command_str === "") {
          continue;
        }
        switch (command) {
          case 1:
            await Interactor.generateTestRemainingAccounts();
            break;
          default:
            console.error(red("\n\nInvalid command!\n\n"));
        }
        break;
    }
    await getUserInput("Press any key to continue...");
  }
};

main();
