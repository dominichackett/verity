import { handler, capabilities } from "@chainlink/cre-sdk";

// Define capabilities
const http = new capabilities.HTTPCapability();
const evm = new capabilities.EVMCapability();

handler.register(async (runtime, config) => {
  const factoryAddress = config.factoryAddress;
  const network = "flow-testnet";

  console.log(`Scanning VerityFactory at ${factoryAddress}...`);

  // 1. Get total number of markets
  const countResponse = await evm.read({
    address: factoryAddress,
    method: "getMarketsCount()",
    params: [],
    network: network
  }).result();
  
  const totalMarkets = Number(countResponse);
  console.log(`Found ${totalMarkets} total markets.`);

  for (let i = 0; i < totalMarkets; i++) {
    // 2. Fetch market record from factory
    const marketRecord = await evm.read({
      address: factoryAddress,
      method: "markets(uint256)",
      params: [i],
      network: network
    }).result();

    const [marketAddress, creator, resolved] = marketRecord;

    if (resolved) continue;

    // 3. Check market details
    const deadline = await evm.read({
      address: marketAddress,
      method: "deadline()",
      params: [],
      network: network
    }).result();

    const now = Math.floor(Date.now() / 1000);
    if (Number(deadline) > now) {
      console.log(`Market ${marketAddress} is still active. Skipping.`);
      continue;
    }

    console.log(`Resolving market: ${marketAddress}...`);

    // Fetch context for AI
    const question = await evm.read({ address: marketAddress, method: "question()", params: [], network }).result();
    const sportType = await evm.read({ address: marketAddress, method: "sportType()", params: [], network }).result();
    const teams = await evm.read({ address: marketAddress, method: "teams()", params: [], network }).result();
    const hasDraw = await evm.read({ address: marketAddress, method: "hasDraw()", params: [], network }).result();

    // 4. Fetch real-world data (Example using a placeholder sports API)
    // In production, you would use API keys and specific endpoints for API-Football etc.
    const sportsData = await http.get({
      url: `https://api.verity.predict/v1/scores?teams=${encodeURIComponent(teams)}&sport=${sportType}`,
    }).result();

    // 5. Call LLM for Verdict
    // Using the HTTP capability to call an LLM provider (e.g., Anthropic or OpenAI)
    const llmResponse = await http.post({
      url: "https://api.anthropic.com/v1/messages",
      headers: {
        "x-api-key": runtime.env.ANTHROPIC_API_KEY,
        "content-type": "application/json",
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-sonnet-20240229",
        max_tokens: 100,
        messages: [{
          role: "user",
          content: `Analyze this sports outcome. 
          Question: "${question}"
          Data: ${JSON.stringify(sportsData.body)}
          3-way market allowed: ${hasDraw}
          Return ONLY a JSON object: {"verdict": 0} for NO, {"verdict": 1} for YES, {"verdict": 2} for DRAW.`
        }]
      })
    }).result();

    const verdict = JSON.parse(llmResponse.body.content[0].text).verdict;
    console.log(`AI Verdict for ${marketAddress}: ${verdict}`);

    // 6. Write resolution to blockchain
    await evm.write({
      address: factoryAddress,
      method: "resolveMarket(address,uint8)",
      params: [marketAddress, verdict],
      network: network
    });

    console.log(`Market ${marketAddress} successfully resolved.`);
  }

  return { status: "success" };
});
