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
  "function markets(uint256) external view returns (address marketAddress, address ammAddress, address creator, bool resolved)",
  "function resolveMarket(address, uint8) external",
  "event MarketCreated(address indexed marketAddress, address indexed ammAddress, address indexed creator, string question)"
];

const MARKET_ABI = [
  "function question() external view returns (string)",
  "function category() external view returns (string)",
  "function deadline() external view returns (uint256)",
  "function hasDraw() external view returns (bool)",
  "function collateralToken() external view returns (address)",
  "function resolved() external view returns (bool)",
  "function outcome() external view returns (uint8)",
  "function balanceOf(address, uint256) external view returns (uint256)"
];

class VerityResolver {
  private factory: ethers.Contract;

  constructor() {
    this.factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, wallet);
  }

  /**
   * Helper to sleep for a given duration
   */
  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Retry wrapper for RPC calls
   */
  private async withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
    try {
      return await fn();
    } catch (err: any) {
      if (retries > 0 && (err.message.includes("limit reached") || err.code === "SERVER_ERROR")) {
        console.warn(`⚠️ Rate limit hit, retrying in ${delay}ms... (${retries} retries left)`);
        await this.sleep(delay);
        return this.withRetry(fn, retries - 1, delay * 2);
      }
      throw err;
    }
  }

  /**
   * Indexes a single market into Supabase
   */
  async indexMarket(marketAddress: string, ammAddress: string, creator: string) {
    try {
      console.log(`🔍 Indexing market: ${marketAddress}`);
      const market = new ethers.Contract(marketAddress, MARKET_ABI, provider);

      let question = "";
      let category = "General";
      let deadline = 0n;
      let hasDraw = false;
      let collateralToken = "";
      let resolvedOnMarket = false;
      let outcome = 0;

      try {
        // Fetch metadata sequentially or in smaller chunks to avoid bursts
        question = await this.withRetry(() => market.question());
        deadline = await this.withRetry(() => market.deadline());
        hasDraw = await this.withRetry(() => market.hasDraw());
        collateralToken = await this.withRetry(() => market.collateralToken());
        resolvedOnMarket = await this.withRetry(() => market.resolved());
        outcome = await this.withRetry(() => market.outcome());
        
        try {
          category = await this.withRetry(() => market.category());
        } catch (e) {
          // Default to General if category function missing
        }
      } catch (e) {
        console.error(`❌ Error fetching metadata for ${marketAddress}:`, e);
        return;
      }

      // Fetch prices and liquidity from AMM
      let yesPrice = 0.5;
      let noPrice = 0.5;
      let drawPrice = 0.33;
      let totalLiquidity = 0;

      try {
          const yesReserves = await this.withRetry(() => market.balanceOf(ammAddress, 1));
          const noReserves = await this.withRetry(() => market.balanceOf(ammAddress, 0));
          
          if (!hasDraw) {
            const total = Number(yesReserves) + Number(noReserves);
            if (total > 0) {
                yesPrice = Number(noReserves) / total;
                noPrice = Number(yesReserves) / total;
            }
          } else {
            const drawReserves = await this.withRetry(() => market.balanceOf(ammAddress, 2));
            const rY = Number(yesReserves);
            const rN = Number(noReserves);
            const rD = Number(drawReserves);
            
            const termY = rN * rD;
            const termN = rY * rD;
            const termD = rY * rN;
            const sum = termY + termN + termD;
            
            if (sum > 0) {
              yesPrice = termY / sum;
              noPrice = termN / sum;
              drawPrice = termD / sum;
            }
          }

          const collateralContract = new ethers.Contract(collateralToken, ["function balanceOf(address) view returns (uint256)"], provider);
          const balance = await this.withRetry(() => collateralContract.balanceOf(marketAddress));
          totalLiquidity = Number(ethers.formatUnits(balance, 6)); 
      } catch (e) {
          // Keep defaults if AMM fails
      }

      const { error: upsertError } = await supabase.from("markets").upsert({
        address: marketAddress,
        amm_address: ammAddress,
        factory_address: FACTORY_ADDRESS,
        creator_address: creator,
        question,
        category, 
        deadline: new Date(Number(deadline) * 1000).toISOString(),
        has_draw: hasDraw,
        collateral_token: collateralToken,
        yes_price: yesPrice,
        no_price: noPrice,
        draw_price: hasDraw ? drawPrice : 0,
        total_liquidity_usdc: totalLiquidity,
        status: resolvedOnMarket ? 'resolved' : 'active',
        outcome: Number(outcome)
      }, { onConflict: 'address' });

      if (upsertError) {
        console.error(`❌ Supabase Error (Indexing ${marketAddress}):`, upsertError);
      } else {
        console.log(`✅ Indexed: ${question.slice(0, 50)}...`);
      }
    } catch (err) {
      console.error(`❌ Fatal error indexing ${marketAddress}:`, err);
    }
  }

  /**
   * Resolves a specific market using Gemini AI
   */
  async resolveMarket(marketData: any) {
    const { address, question, has_draw } = marketData;
    console.log(`🤖 AI Resolving: ${question}`);

    try {
      const prompt = `You are a universal market resolver for the Verity Prediction Market.
        Search the web to find the official result for this question:
        
        Question: "${question}"
        3-way market (Draw allowed): ${has_draw}
        
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
        throw new Error(`Gemini API Error: ${result.error?.message}`);
      }

      const data = JSON.parse(result.candidates[0].content.parts[0].text);
      console.log(`✅ AI Verdict for "${question}": ${data.verdict} | ${data.reasoning}`);

      // 1. Write to Blockchain
      const tx = await this.factory.resolveMarket(address, data.verdict);
      console.log(`🔗 Blockchain Resolve Tx Sent: ${tx.hash}`);
      await tx.wait();

      // 2. Update Supabase
      const { error } = await supabase.from("markets").update({
        status: 'resolved',
        outcome: data.verdict,
        ai_reasoning: data.reasoning,
        updated_at: new Date().toISOString()
      }).eq("address", address);

      if (error) throw error;
      console.log(`🎉 Market ${address} Resolved Successfully!`);
    } catch (err) {
      console.error(`❌ Resolution failed for ${address}:`, err);
    }
  }

  /**
   * Polls for new MarketCreated events using queryFilter (more stable than .on() on HTTP)
   */
  async startEventPolling(startBlock: number) {
    console.log(`👂 Starting event polling from block ${startBlock}...`);
    let lastCheckedBlock = startBlock;

    const poll = async () => {
      try {
        const currentBlock = await this.withRetry(() => provider.getBlockNumber());
        
        if (currentBlock > lastCheckedBlock) {
          // console.log(`🔍 Checking blocks ${lastCheckedBlock + 1} to ${currentBlock}`);
          const filter = this.factory.filters.MarketCreated();
          const logs = await this.withRetry(() => this.factory.queryFilter(filter, lastCheckedBlock + 1, currentBlock));

          for (const log of logs) {
            if ("args" in log) {
              const { marketAddress, ammAddress, creator, question } = (log as any).args;
              console.log(`✨ New Market Detected: ${question}`);
              await this.indexMarket(marketAddress, ammAddress, creator);
            }
          }
          lastCheckedBlock = currentBlock;
        }
      } catch (err) {
        console.error("❌ Error polling for events:", err);
      }
      // Poll every 15 seconds
      setTimeout(poll, 15000);
    };

    poll();
  }

  /**
   * Periodic loop to check for and resolve expired markets
   */
  async startResolutionLoop() {
    console.log("⏱️ Starting periodic resolution loop (every 5 minutes)...");
    
    const checkAndResolve = async () => {
      try {
        const now = new Date().toISOString();
        console.log(`⏱️ Periodic resolution check running at ${now}...`);
        const { data: expiredMarkets, error } = await supabase
          .from("markets")
          .select("*")
          .eq("status", "active")
          .lte("deadline", now);

        if (error) throw error;

        if (expiredMarkets && expiredMarkets.length > 0) {
          console.log(`⏳ Found ${expiredMarkets.length} expired markets. Starting resolution...`);
          for (const market of expiredMarkets) {
            await this.resolveMarket(market);
          }
        }
      } catch (err) {
        console.error("❌ Error in resolution loop:", err);
      }
    };

    // Run immediately then every 5 minutes
    checkAndResolve();
    setInterval(checkAndResolve, 5 * 60 * 1000);
  }

  /**
   * Initial sync of all markets from the blockchain
   */
  async sync() {
    console.log("🔄 Starting initial blockchain sync...");
    const currentBlock = await this.withRetry(() => provider.getBlockNumber());
    const count = await this.withRetry(() => this.factory.getMarketsCount());
    console.log(`🔍 Found ${count} markets on-chain.`);

    // Optimization: Fetch existing addresses from DB to skip them
    const { data: existingMarkets, error } = await supabase.from("markets").select("address");
    const existingAddresses = new Set(existingMarkets?.map(m => m.address.toLowerCase()) || []);
    
    if (error) {
      console.warn("⚠️ Could not fetch existing markets from DB, will perform full sync.", error.message);
    }

    let indexedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < count; i++) {
      const marketRecord = await this.withRetry(() => this.factory.markets(i));
      const addr = marketRecord.marketAddress.toLowerCase();

      if (existingAddresses.has(addr)) {
        skippedCount++;
        continue;
      }

      await this.indexMarket(marketRecord.marketAddress, marketRecord.ammAddress, marketRecord.creator);
      indexedCount++;
      // Small pause between markets to stay under 40 req/sec
      await this.sleep(100);
    }
    console.log(`🏁 Initial sync complete. Indexed: ${indexedCount}, Skipped: ${skippedCount}`);
    return currentBlock;
  }

  async start() {
    console.log("🚀 Verity Resolver Service Starting...");
    const syncBlock = await this.sync();
    this.startEventPolling(syncBlock);
    this.startResolutionLoop();
  }
}

const resolver = new VerityResolver();
resolver.start().catch(console.error);
