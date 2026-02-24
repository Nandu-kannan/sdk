import { indexEvents } from "./indexer";
import { startApi } from "./api/server";
import { SoroSaveConfig } from "./types";

const config: SoroSaveConfig = {
  rpcUrl: "https://soroban-testnet.stellar.org", // Default for testnet
  contractId: process.env.CONTRACT_ID || "C...", // Replace with actual or use ENV
  networkPassphrase: "Test SDF Network ; September 2015",
};

async function main() {
  console.log("Starting SoroSave Indexer & API...");
  
  // Start Indexer
  indexEvents(config).catch(console.error);

  // Start GraphQL API
  startApi(config).catch(console.error);
}

main();
