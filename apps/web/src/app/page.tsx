"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ethers } from "ethers";
import { useWeb3 } from "@/hooks/useWeb3";
import { 
  TrendingUp, 
  Plus, 
  Wallet, 
  ChevronRight, 
  Activity,
  Award,
  CircleDot,
  X,
  CheckCircle2
} from "lucide-react";

const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_FACTORY_ADDRESS || "";

export default function Home() {
  const { account, signer, connectWallet, isCorrectNetwork } = useWeb3();
  const [markets, setMarkets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("All");
  
  // Modal States
  const [showBetModal, setShowBetModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeMarket, setActiveMarket] = useState<any>(null);
  const [betAmount, setBetAmount] = useState("1.0");
  const [userBalance, setUserBalance] = useState("0.00");
  const [isTxLoading, setIsTxLoading] = useState(false);

  // Trade State
  const [tradeMode, setTradeMode] = useState<"buy" | "sell">("buy");
  const [userPositions, setUserPositions] = useState({ yes: "0", no: "0", draw: "0" });

  // Creation State
  const [newMarket, setNewMarket] = useState({
    question: "",
    category: "Sports",
    subCategory: "",
    topic: "",
    context: "",
    deadline: "",
    hasDraw: false
  });

  const categories = ["All", "Sports", "Crypto", "Politics", "Pop Culture"];

  useEffect(() => {
    async function fetchMarkets() {
      let query = supabase
        .from("markets")
        .select("*")
        .order("created_at", { ascending: false });

      if (selectedCategory !== "All") {
        query = query.eq("category", selectedCategory);
      }

      const { data, error } = await query;
      if (error) {
        console.error("Supabase fetch error:", error);
      } else if (data) {
        setMarkets(data);
      }
      setLoading(false);
    }

    fetchMarkets();

    const channel = supabase
      .channel("markets-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "markets" }, (payload) => {
        fetchMarkets();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedCategory, account, signer]);

  useEffect(() => {
    async function fetchBalance() {
      if (account && signer) {
        try {
          const balance = await signer.provider?.getBalance(account);
          if (balance) {
            setUserBalance(ethers.formatEther(balance));
          }
        } catch (error) {
          console.error("Failed to fetch balance:", error);
          setUserBalance("0.00");
        }
      } else {
        setUserBalance("0.00");
      }
    }
    fetchBalance();
  }, [account, signer]);

  useEffect(() => {
    async function fetchPositions() {
      if (!account || !activeMarket || !signer) return;
      try {
        const marketAbi = ["function balanceOf(address, uint256) view returns (uint256)"];
        const marketContract = new ethers.Contract(activeMarket.address, marketAbi, signer.provider);
        
        const [yes, no, draw] = await Promise.all([
          marketContract.balanceOf(account, 1),
          marketContract.balanceOf(account, 0),
          activeMarket.has_draw ? marketContract.balanceOf(account, 2) : Promise.resolve(0n)
        ]);
        
        setUserPositions({
          yes: ethers.formatUnits(yes, 18),
          no: ethers.formatUnits(no, 18),
          draw: ethers.formatUnits(draw, 18)
        });
      } catch (e) {
        console.error("Error fetching positions:", e);
      }
    }
    if (showBetModal) fetchPositions();
  }, [account, activeMarket, showBetModal, signer]);

  const handlePlaceBet = async (side: number) => {
    if (!signer || !activeMarket || !activeMarket.amm_address) return;
    setIsTxLoading(true);
    try {
      if (tradeMode === "buy") {
        const ammAbi = ["function buy(uint256, uint256, uint256) external"];
        const erc20Abi = ["function approve(address, uint256) external returns (bool)"];
        const ammContract = new ethers.Contract(activeMarket.amm_address, ammAbi, signer);
        const collateralContract = new ethers.Contract(activeMarket.collateral_token, erc20Abi, signer);
        const amount = ethers.parseEther(betAmount);
        const approveTx = await collateralContract.approve(activeMarket.amm_address, amount);
        await approveTx.wait();
        const tx = await ammContract.buy(side, amount, 0);
        await tx.wait();
        alert("Shares purchased!");
      } else {
        const ammAbi = ["function sell(uint256, uint256, uint256) external"];
        const marketAbi = ["function setApprovalForAll(address, bool) external"];
        const ammContract = new ethers.Contract(activeMarket.amm_address, ammAbi, signer);
        const marketContract = new ethers.Contract(activeMarket.address, marketAbi, signer);
        const amount = ethers.parseEther(betAmount);
        const approveTx = await marketContract.setApprovalForAll(activeMarket.amm_address, true);
        await approveTx.wait();
        const tx = await ammContract.sell(side, amount, 0);
        await tx.wait();
        alert("Shares sold!");
      }
      setShowBetModal(false);
    } catch (error) {
      console.error("Trade error:", error);
      alert("Transaction failed.");
    } finally {
      setIsTxLoading(false);
    }
  };

  const handleCreateMarket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signer) return;
    setIsTxLoading(true);
    try {
      const factoryAbi = ["function createMarket(string,string,string,string,string,uint256,bool) external payable"];
      const factoryContract = new ethers.Contract(FACTORY_ADDRESS, factoryAbi, signer);
      const deadlineTimestamp = Math.floor(new Date(newMarket.deadline).getTime() / 1000);
      const tx = await factoryContract.createMarket(
        newMarket.question, newMarket.category, newMarket.subCategory, 
        newMarket.topic, newMarket.context, deadlineTimestamp, newMarket.hasDraw,
        { value: ethers.parseEther("5") }
      );
      await tx.wait();
      setShowCreateModal(false);
      alert("Market created!");
    } catch (error) {
      console.error("Creation error:", error);
      alert("Creation failed.");
    } finally {
      setIsTxLoading(false);
    }
  };

  const calculatePayout = (side: number) => {
    if (!activeMarket || !betAmount || parseFloat(betAmount) <= 0) return "0.00";
    const currentBet = parseFloat(betAmount);
    const price = side === 1 ? activeMarket.yes_price : side === 0 ? activeMarket.no_price : activeMarket.draw_price;
    if (!price || price === 0) return "0.00";
    return (currentBet / price).toFixed(2);
  };

  const activeMarkets = markets.filter(m => m.status !== 'resolved');
  const resolvedMarkets = markets.filter(m => m.status === 'resolved');

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-cyan-500/30 font-sans relative overflow-x-hidden">
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-600/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/20 rounded-full blur-[150px]" />
      </div>

      <nav className="border-b border-white/10 bg-black/20 backdrop-blur-2xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-gradient-to-tr from-cyan-400 via-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(34,211,238,0.3)]">
              <Award className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-black tracking-tighter">VERITY</span>
          </div>
          <button onClick={connectWallet} className="flex items-center gap-2 bg-white/10 border border-white/10 px-6 py-3 rounded-2xl">
            <Wallet className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-bold">{account ? `${account.slice(0, 6)}...${account.slice(-4)}` : "Connect Wallet"}</span>
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 pt-16 pb-24">
        <header className="mb-20">
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter mb-8 leading-[0.9]">
            Predict the <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600">Unpredictable.</span>
          </h1>
          <div className="flex gap-4">
            {categories.map((cat) => (
              <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-8 py-4 rounded-3xl font-black transition-all ${selectedCategory === cat ? "bg-white text-black" : "bg-white/5 text-white/40"}`}>{cat}</button>
            ))}
          </div>
        </header>

        <div className="flex items-center justify-between mb-12">
          <h2 className="text-3xl font-black tracking-tight">Market Stream</h2>
          <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-3 bg-gradient-to-tr from-cyan-500 to-purple-600 px-8 py-4 rounded-3xl font-black">
            <Plus className="w-5 h-5" /> Launch Market
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {activeMarkets.map((market) => (
            <div key={market.id} onClick={() => { setActiveMarket(market); setShowBetModal(true); setTradeMode("buy"); }} className="group relative bg-white/[0.05] border-2 border-white/10 rounded-[48px] p-10 hover:bg-white/[0.08] transition-all cursor-pointer">
              <div className="flex items-center justify-between mb-8">
                <div className="px-4 py-1.5 rounded-full bg-white/10 border border-white/10 text-[10px] font-black uppercase tracking-widest">{market.category}</div>
                <div className="text-[10px] font-black text-white/50 uppercase tracking-widest">{market.total_liquidity_usdc || "0"} USDC</div>
              </div>
              <h3 className="text-2xl font-black leading-tight mb-10 min-h-[72px]">{market.question}</h3>
              <div className="space-y-5 bg-black/40 p-8 rounded-[36px] border border-white/10">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <span className="block text-[10px] font-black text-white/40 uppercase tracking-widest">Price</span>
                    <span className="block text-4xl font-black">${market.yes_price?.toFixed(2) || "0.50"} <span className="text-cyan-400 text-sm">YES</span></span>
                  </div>
                  <ChevronRight className="w-8 h-8 text-white/20" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Bet Modal with Trade Toggle & Positions */}
      {showBetModal && activeMarket && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-xl">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowBetModal(false)} />
          <div className="relative bg-[#0A0A0A] border border-white/10 w-full max-w-lg rounded-[48px] overflow-hidden shadow-2xl animate-in zoom-in duration-300">
            <div className="p-10 border-b border-white/10 flex items-center justify-between bg-white/5">
              <div>
                <h2 className="text-2xl font-black tracking-tight">{tradeMode === "buy" ? "Buy Shares" : "Sell Shares"}</h2>
                <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">{activeMarket.question}</p>
              </div>
              <button onClick={() => setShowBetModal(false)} className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center"><X className="w-6 h-6 text-white/40" /></button>
            </div>

            <div className="p-10 space-y-8">
              {/* Trade Mode Toggle */}
              <div className="flex bg-white/5 p-1.5 rounded-2xl gap-2">
                <button onClick={() => setTradeMode("buy")} className={`flex-1 py-3 rounded-xl text-sm font-black transition-all ${tradeMode === "buy" ? "bg-white text-black" : "text-white/40 hover:text-white"}`}>BUY</button>
                <button onClick={() => setTradeMode("sell")} className={`flex-1 py-3 rounded-xl text-sm font-black transition-all ${tradeMode === "sell" ? "bg-white text-black" : "text-white/40 hover:text-white"}`}>SELL</button>
              </div>

              {/* Position Info */}
              <div className="bg-white/5 p-6 rounded-3xl border border-white/5 flex justify-around">
                <div className="text-center"><span className="block text-[9px] font-black text-white/30 uppercase mb-1">Your YES</span><span className="font-black text-cyan-400">{parseFloat(userPositions.yes).toFixed(1)}</span></div>
                <div className="text-center"><span className="block text-[9px] font-black text-white/30 uppercase mb-1">Your NO</span><span className="font-black text-rose-400">{parseFloat(userPositions.no).toFixed(1)}</span></div>
                {activeMarket.has_draw && <div className="text-center"><span className="block text-[9px] font-black text-white/30 uppercase mb-1">Your DRAW</span><span className="font-black text-amber-400">{parseFloat(userPositions.draw).toFixed(1)}</span></div>}
              </div>

              <div className="space-y-4">
                <div className="flex justify-between text-[10px] font-black text-white/30 uppercase"><span>{tradeMode === "buy" ? "Collateral (USDC)" : "Shares to Sell"}</span><span>Bal: {tradeMode === "buy" ? parseFloat(userBalance).toFixed(1) : (side => side === 1 ? userPositions.yes : userPositions.no)(1)}</span></div>
                <input type="number" value={betAmount} onChange={(e) => setBetAmount(e.target.value)} className="w-full bg-white/5 border-2 border-white/5 rounded-3xl p-6 text-4xl font-black text-center outline-none focus:border-cyan-500/50" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => handlePlaceBet(1)} disabled={isTxLoading} className="h-24 bg-gradient-to-tr from-emerald-500 to-cyan-500 rounded-3xl font-black text-xl flex flex-col items-center justify-center">
                  <span>YES</span>
                  <span className="text-xs opacity-60">{tradeMode === "buy" ? `${calculatePayout(1)} USDC Payout` : "Confirm Sell"}</span>
                </button>
                <button onClick={() => handlePlaceBet(0)} disabled={isTxLoading} className="h-24 bg-gradient-to-tr from-rose-500 to-orange-600 rounded-3xl font-black text-xl flex flex-col items-center justify-center">
                  <span>NO</span>
                  <span className="text-xs opacity-60">{tradeMode === "buy" ? `${calculatePayout(0)} USDC Payout` : "Confirm Sell"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-xl">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowCreateModal(false)} />
          <div className="relative bg-[#0A0A0A] border border-white/10 w-full max-w-2xl rounded-[48px] p-10 overflow-y-auto max-h-[90vh]">
            <h2 className="text-3xl font-black mb-8">Deploy Market</h2>
            <form onSubmit={handleCreateMarket} className="space-y-8">
              <textarea required placeholder="Market question..." className="w-full bg-white/5 border-2 border-white/10 rounded-3xl p-6 h-32 text-xl font-bold" onChange={(e) => setNewMarket({...newMarket, question: e.target.value})} />
              <div className="grid grid-cols-2 gap-6">
                <select className="bg-white/5 border-2 border-white/10 rounded-2xl p-5" onChange={(e) => setNewMarket({...newMarket, category: e.target.value})}>
                  {categories.slice(1).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="datetime-local" className="bg-white/5 border-2 border-white/10 rounded-2xl p-5" onChange={(e) => setNewMarket({...newMarket, deadline: e.target.value})} />
              </div>
              <button type="submit" disabled={isTxLoading} className="w-full h-24 bg-gradient-to-r from-purple-600 to-cyan-500 rounded-3xl font-black text-xl">Deploy to Flow EVM</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
