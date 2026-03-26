import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, ".env") });

// --- CONFIGURATION ---
const RPC_URL = "https://testnet.evm.nodes.onflow.org";
const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS || "";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const GEMINI_KEY = process.env.GOOGLE_GEMINI_API_KEY || "";
const MODEL_NAME = process.env.AI_MODEL_NAME || "gemini-1.5-pro";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Missing Supabase configuration!");
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const FACTORY_ABI = [
  "function getMarketsCount() external view returns (uint256)",
  "function markets(uint256) external view returns (address, address, bool)",
  "function resolveMarket(address, uint8) external"
];

const MARKET_ABI = [
  "function question() external view returns (string)",
  "function category() external view returns (string)",
  "function subCategory() external view returns (string)",
  "function topic() external view returns (string)",
  "function context() external view returns (string)",
  "function deadline() external view returns (uint256)",
  "function hasDraw() external view returns (bool)",
  "function yesPool() external view returns (uint256)",
  "function noPool() external view returns (uint256)",
  "function drawPool() external view returns (uint256)"
];

async function run() {
  console.log("🚀 Verity Resolver Starting...");
  console.log(`📍 Factory Address: ${FACTORY_ADDRESS}`);
  
  const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, wallet);

  // 1. Fetch total markets
  const count = await factory.getMarketsCount();
  console.log(`🔍 Found ${count} markets on-chain.`);

  for (let i = 0; i < count; i++) {
    const [marketAddress, creator, resolved] = await factory.markets(i);
    const market = new ethers.Contract(marketAddress, MARKET_ABI, provider);

    // --- INDEXING LOGIC ---
    const [
      question, category, subCategory, topic, context, 
      deadline, hasDraw, yesPool, noPool, drawPool
    ] = await Promise.all([
      market.question(), market.category(), market.subCategory(), 
      market.topic(), market.context(), market.deadline(), 
      market.hasDraw(), market.yesPool(), market.noPool(), market.drawPool()
    ]);

    console.log(`📊 Indexing: ${question} (Category read from contract: "${category}")`);

    const { error: upsertError } = await supabase.from("markets").upsert({
      address: marketAddress,
      factory_address: FACTORY_ADDRESS,
      creator_address: creator,
      question,
      category,
      sub_category: subCategory,
      topic,
      context,
      deadline: new Date(Number(deadline) * 1000).toISOString(),
      has_draw: hasDraw,
      yes_pool: Number(ethers.formatEther(yesPool)),
      no_pool: Number(ethers.formatEther(noPool)),
      draw_pool: Number(ethers.formatEther(drawPool)),
      status: resolved ? 'resolved' : 'active'
    }, { onConflict: 'address' });

    if (upsertError) {
      console.error(`❌ Supabase Error (Indexing):`, upsertError);
    } else {
      console.log(`✅ Supabase Indexed: ${marketAddress}`);
    }

    // --- RESOLUTION LOGIC ---
    const now = Math.floor(Date.now() / 1000);
    if (!resolved && Number(deadline) <= now) {
      console.log(`🤖 Resolving: ${question}`);

      try {
        const prompt = `You are a universal market resolver for the Verity Prediction Market.
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
        
        JSON Format: {"verdict": number, "reasoning": "string"}`;

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              tools: [{ google_search: {} }],
              generationConfig: { response_mime_type: "application/json" }
            })
          }
        );

        const result: any = await response.json();

        if (!response.ok) {
          console.error(`❌ Gemini API Error (${response.status}):`, result.error?.message || "Unknown error");
          if (response.status === 429) {
            console.log("💡 Tip: Search grounding has very low rate limits. Try disabling 'google_search_retrieval' or checking your quota.");
          }
          continue; 
        }

        if (!result.candidates?.[0]?.content?.parts?.[0]?.text) {
          console.error("❌ Gemini Error: Invalid response format.", JSON.stringify(result));
          continue;
        }

        const data = JSON.parse(result.candidates[0].content.parts[0].text);

        console.log(`✅ AI Verdict: ${data.verdict} | ${data.reasoning}`);

        // Write to Blockchain
        const tx = await factory.resolveMarket(marketAddress, data.verdict);
        console.log(`🔗 Tx Sent: ${tx.hash}`);
        await tx.wait();

        // Update Supabase
        const { error: updateError } = await supabase.from("markets").update({
          status: 'resolved',
          outcome: data.verdict,
          ai_reasoning: data.reasoning,
          updated_at: new Date().toISOString()
        }).eq("address", marketAddress);

        if (updateError) {
          console.error(`❌ Supabase Error (Resolution Update):`, updateError);
        } else {
          console.log(`🎉 Market Resolved Successfully!`);
        }
      } catch (err) {
        console.error(`❌ Error resolving ${marketAddress}:`, err);
      }
    }
  }
}

run().catch(console.error);
