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
  "function markets(uint256) external view returns (address, address, address, bool)",
  "function resolveMarket(address, uint8) external"
];

const MARKET_ABI = [
  "function question() external view returns (string)",
  "function deadline() external view returns (uint256)",
  "function hasDraw() external view returns (bool)",
  "function collateralToken() external view returns (address)",
  "function resolved() external view returns (bool)",
  "function outcome() external view returns (uint8)",
  "function balanceOf(address, uint256) external view returns (uint256)"
];

async function run() {
  console.log("🚀 Verity Resolver Starting (Polymarket Version)...");
  console.log(`📍 Factory Address: ${FACTORY_ADDRESS}`);
  
  const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, wallet);

  // 1. Fetch total markets
  const count = await factory.getMarketsCount();
  console.log(`🔍 Found ${count} markets on-chain.`);

  for (let i = 0; i < count; i++) {
    try {
        const [marketAddress, ammAddress, creator, resolvedOnFactory] = await factory.markets(i);
        const market = new ethers.Contract(marketAddress, MARKET_ABI, provider);

        // --- INDEXING LOGIC ---
        const [
          question, deadline, hasDraw, collateralToken, resolvedOnMarket, outcome
        ] = await Promise.all([
          market.question(), market.deadline(), 
          market.hasDraw(), market.collateralToken(),
          market.resolved(), market.outcome()
        ]);

        // Fetch prices from AMM (Simple approximation: yesReserves / (yesReserves + noReserves))
        let yesPrice = 0.5;
        let noPrice = 0.5;
        try {
            const yesReserves = await market.balanceOf(ammAddress, 1);
            const noReserves = await market.balanceOf(ammAddress, 0);
            const total = Number(yesReserves) + Number(noReserves);
            if (total > 0) {
                yesPrice = Number(noReserves) / total; // Price of YES is NO_reserves / Total_reserves in FPMM
                noPrice = Number(yesReserves) / total;
            }
        } catch (e) {
            console.log("Could not fetch AMM reserves, using defaults.");
        }

        console.log(`📊 Indexing: ${question} | YES: $${yesPrice.toFixed(2)}`);

        const { error: upsertError } = await supabase.from("markets").upsert({
          address: marketAddress,
          amm_address: ammAddress,
          factory_address: FACTORY_ADDRESS,
          creator_address: creator,
          question,
          category: "Unknown", 
          deadline: new Date(Number(deadline) * 1000).toISOString(),
          has_draw: hasDraw,
          collateral_token: collateralToken,
          yes_price: yesPrice,
          no_price: noPrice,
          status: resolvedOnMarket ? 'resolved' : 'active',
          outcome: Number(outcome)
        }, { onConflict: 'address' });

        if (upsertError) {
          console.error(`❌ Supabase Error (Indexing):`, upsertError);
        }

        // --- RESOLUTION LOGIC ---
        const now = Math.floor(Date.now() / 1000);
        if (!resolvedOnMarket && Number(deadline) <= now) {
          console.log(`🤖 Resolving: ${question}`);

          const prompt = `You are a universal market resolver for the Verity Prediction Market.
            Search the web to find the official result for this question:
            
            Question: "${question}"
            3-way market (Draw allowed): ${hasDraw}
            
            Rules:
            - Use Google Search to verify the outcome from official and high-authority sources.
            - Return ONLY a raw JSON object.
            - verdict: 1 (NO/FALSE), 2 (YES/TRUE), 3 (DRAW/TIE).
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
            console.error(`❌ Gemini API Error:`, result.error?.message);
            continue;
          }

          const data = JSON.parse(result.candidates[0].content.parts[0].text);
          console.log(`✅ AI Verdict: ${data.verdict} | ${data.reasoning}`);

          // Write to Blockchain via Factory
          const tx = await factory.resolveMarket(marketAddress, data.verdict);
          console.log(`🔗 Tx Sent: ${tx.hash}`);
          await tx.wait();

          // Update Supabase
          await supabase.from("markets").update({
            status: 'resolved',
            outcome: data.verdict,
            ai_reasoning: data.reasoning,
            updated_at: new Date().toISOString()
          }).eq("address", marketAddress);

          console.log(`🎉 Market Resolved Successfully!`);
        }
    } catch (err) {
        console.error(`❌ Error processing market ${i}:`, err);
    }
  }
}

run().catch(console.error);
