require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { MST_TESTNET } = require("./web3/src/network.js");

const accounts = [process.env.DEPLOYER_PRIVATE_KEY, process.env.PLAYER_PRIVATE_KEY].filter(Boolean);

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    // "paris" avoids PUSH0 so bytecode runs on EVM chains that have not enabled Shanghai.
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "paris" },
  },
  networks: {
    // HARDHAT_CHAIN_ID lets a local node impersonate MST's chain ID to rehearse the MST scripts offline.
    hardhat: { chainId: Number(process.env.HARDHAT_CHAIN_ID || 31337) },
    mstTestnet: {
      url: process.env.MST_TESTNET_RPC_URL || MST_TESTNET.rpcUrls[0],
      chainId: MST_TESTNET.chainId,
      accounts,
    },
  },
};
