import { handler, capabilities } from "@chainlink/cre-sdk";

// Define capabilities
const http = new capabilities.HTTPCapability();
const evm = new capabilities.EVMCapability();

handler.register(async (runtime, config) => {
  const factoryAddress = config.factoryAddress;
  const supabaseUrl = runtime.env.SUPABASE_URL;
  const supabaseKey = runtime.env.SUPABASE_SERVICE_KEY;
  const network = "flow-testnet";

  console.log(`Verity Universal Indexer & Resolver starting...`);

  // 1. Get total number of markets
  const countResponse = await evm.read({
    address: factoryAddress,
    method: "getMarketsCount()",
    params: [],
    network: network
  }).result();
  
  const totalMarkets = Number(countResponse);

  for (let i = 0; i < totalMarkets; i++) {
    const marketRecord = await evm.read({
      address: factoryAddress,
      method: "markets(uint256)",
      params: [i],
      network: network
    }).result();

    const [marketAddress, creator, resolved] = marketRecord;

    // --- INDEXING LOGIC (Generalized Fields) ---
    const question = await evm.read({ address: marketAddress, method: "question()", params: [], network }).result();
    const category = await evm.read({ address: marketAddress, method: "category()", params: [], network }).result();
    const subCategory = await evm.read({ address: marketAddress, method: "subCategory()", params: [], network }).result();
    const topic = await evm.read({ address: marketAddress, method: "topic()", params: [], network }).result();
    const context = await evm.read({ address: marketAddress, method: "context()", params: [], network }).result();
    const deadline = await evm.read({ address: marketAddress, method: "deadline()", params: [], network }).result();
    const hasDraw = await evm.read({ address: marketAddress, method: "hasDraw()", params: [], network }).result();
    const yesPool = await evm.read({ address: marketAddress, method: "yesPool()", params: [], network }).result();
    const noPool = await evm.read({ address: marketAddress, method: "noPool()", params: [], network }).result();
    const drawPool = await evm.read({ address: marketAddress, method: "drawPool()", params: [], network }).result();

    // Push to Supabase
    await http.post({
      url: `${supabaseUrl}/rest/v1/markets`,
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
      },
      body: JSON.stringify({
        address: marketAddress,
        factory_address: factoryAddress,
        creator_address: creator,
        question,
        category,
        sub_category: subCategory, 
        topic: topic,   
        context: context,      
        deadline: new Date(Number(deadline) * 1000).toISOString(),
        has_draw: hasDraw,
        yes_pool: Number(yesPool) / 1e18,
        no_pool: Number(noPool) / 1e18,
        draw_pool: Number(drawPool) / 1e18,
        status: resolved ? 'resolved' : 'active'
      })
    }).result();

    // --- RESOLUTION LOGIC ---
    const now = Math.floor(Date.now() / 1000);
    if (!resolved && Number(deadline) <= now) {
      console.log(`Triggering Universal Gemini Resolution for: ${marketAddress}`);

      const geminiApiKey = runtime.env.GOOGLE_GEMINI_API_KEY;
      const modelName = runtime.env.AI_MODEL_NAME || "gemini-1.5-pro"; 
      
      const llmResponse = await http.post({
        url: `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are a universal market resolver for the Verity Prediction Market.
              Search the web to find the official result for this question:
              
              Question: "${question}"
              Main Category: ${category}
              Sub-Category: ${subCategory}
              Topic: ${topic}
              Contextual Details: ${context}
              3-way market (Draw allowed): ${hasDraw}
              
              Rules:
              - Use Google Search to verify the outcome from official and high-authority sources.
              - Return ONLY a raw JSON object.
              - verdict: 0 (NO/FALSE), 1 (YES/TRUE), 2 (DRAW/TIE).
              - reasoning: a short 1-sentence explanation of the factual result found.
              
              JSON Format: {"verdict": number, "reasoning": "string"}`
            }]
          }],
          tools: [{ "google_search_retrieval": {} }],
          generationConfig: {
            response_mime_type: "application/json"
          }
        })
      }).result();

      const geminiResult = JSON.parse(llmResponse.body.candidates[0].content.parts[0].text);
      console.log(`Verdict: ${geminiResult.verdict} Reason: ${geminiResult.reasoning}`);

      await evm.write({
        address: factoryAddress,
        method: "resolveMarket(address,uint8)",
        params: [marketAddress, geminiResult.verdict],
        network: network
      });

      await http.patch({
        url: `${supabaseUrl}/rest/v1/markets?address=eq.${marketAddress}`,
        headers: {
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          status: 'resolved',
          outcome: geminiResult.verdict,
          ai_reasoning: geminiResult.reasoning,
          updated_at: new Date().toISOString()
        })
      }).result();
    }
  }

  return { status: "success" };
});
