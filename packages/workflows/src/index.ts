import { handler, capabilities } from "@chainlink/cre-sdk";

// Define the HTTP capability to fetch external data
const http = new capabilities.HTTPCapability();

// Define the EVM capability to interact with Flow EVM
const evm = new capabilities.EVMCapability();

handler.register(async (runtime, config) => {
  // 1. Triggered by a schedule or event (configured in workflow.yaml)
  console.log("Starting Market Resolution Workflow...");

  // 2. Fetch data from an external API (e.g., sports result)
  const response = await http.get({
    url: "https://api.example.com/sports/result?matchId=123",
  }).result();

  const result = response.body.outcome; // 0 or 1

  // 3. Perform off-chain computation/consensus logic
  // In a real DON, multiple nodes would run this and agree on the result
  
  // 4. Write the result to the PredictionMarket contract on Flow EVM
  const marketId = 0; // Example market ID
  
  // This is a simplified example of calling a contract method
  // The actual SDK methods might vary slightly based on the final CRE API
  /*
  await evm.write({
    address: config.contractAddress,
    method: "resolveMarket(uint256,uint256)",
    params: [marketId, result],
    network: "flow-testnet"
  });
  */

  return { marketId, outcome: result };
});
