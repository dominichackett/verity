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
  const [isTxLoading, setIsTxLoading] = useState(false);

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
      if (!error && data) {
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
  }, [selectedCategory]);

  const handlePlaceBet = async (side: number) => {
    if (!signer || !activeMarket) return;
    setIsTxLoading(true);
    try {
      const marketAbi = ["function placeBet(uint8 side) external payable"];
      const marketContract = new ethers.Contract(activeMarket.address, marketAbi, signer);
      
      const tx = await marketContract.placeBet(side, { 
        value: ethers.parseEther(betAmount) 
      });
      await tx.wait();
      setShowBetModal(false);
      alert("Bet placed successfully!");
    } catch (error) {
      console.error("Bet error:", error);
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
      const factoryAbi = [
        "function createMarket(string,string,string,string,string,uint256,bool) external payable"
      ];
      const factoryContract = new ethers.Contract(FACTORY_ADDRESS, factoryAbi, signer);
      
      const deadlineTimestamp = Math.floor(new Date(newMarket.deadline).getTime() / 1000);
      
      const tx = await factoryContract.createMarket(
        newMarket.question,
        newMarket.category,
        newMarket.subCategory,
        newMarket.topic,
        newMarket.context,
        deadlineTimestamp,
        newMarket.hasDraw,
        { value: ethers.parseEther("5") } // 5 FLOW bond
      );
      await tx.wait();
      setShowCreateModal(false);
      alert("Market created successfully!");
    } catch (error) {
      console.error("Creation error:", error);
      alert("Creation failed.");
    } finally {
      setIsTxLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white selection:bg-cyan-500/30 font-sans">
      {/* Navigation */}
      <nav className="border-b border-white/5 bg-black/40 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Award className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
              VERITY
            </span>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={connectWallet}
              className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-5 py-2.5 rounded-full transition-all active:scale-95 group"
            >
              <Wallet className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
              <span className="text-sm font-semibold">
                {account ? `${account.slice(0, 6)}...${account.slice(-4)}` : "Connect Wallet"}
              </span>
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-6 pt-12 pb-24">
        <header className="mb-16">
          <div className="flex items-center gap-2 text-cyan-400 text-sm font-bold uppercase tracking-widest mb-4">
            <Activity className="w-4 h-4 animate-pulse" />
            Universal Truth Protocol
          </div>
          <h1 className="text-6xl font-bold tracking-tight mb-6 max-w-3xl leading-[1.1]">
            Predict anything. <br />
            <span className="text-white/40">Powered by Gemini.</span>
          </h1>
          
          <div className="flex flex-wrap gap-3 mt-10">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-6 py-3 rounded-2xl text-sm font-bold transition-all border ${
                  selectedCategory === cat
                    ? "bg-cyan-500 text-black border-cyan-500 shadow-xl shadow-cyan-500/20 scale-105"
                    : "bg-white/5 text-white/60 border-white/10 hover:border-white/20 hover:text-white"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </header>

        {/* Market Feed */}
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            Active Markets
            <span className="bg-cyan-500/10 text-cyan-400 text-xs px-2 py-1 rounded-md">Live</span>
          </h2>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-black px-6 py-3 rounded-2xl font-bold transition-all shadow-xl shadow-cyan-500/10 active:scale-95"
          >
            <Plus className="w-5 h-5" />
            Create Market
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-80 bg-white/5 rounded-[40px] animate-pulse border border-white/5" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {markets.map((market) => {
              const total = (Number(market.yes_pool) || 0) + (Number(market.no_pool) || 0) + (Number(market.draw_pool) || 0);
              const yesProb = total > 0 ? (market.yes_pool * 100) / total : (market.has_draw ? 33.3 : 50);

              return (
                <div 
                  key={market.id} 
                  onClick={() => { setActiveMarket(market); setShowBetModal(true); }}
                  className="group bg-white/[0.02] border border-white/5 rounded-[40px] p-8 hover:bg-white/[0.05] transition-all hover:border-white/10 cursor-pointer overflow-hidden"
                >
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/30 border border-white/10 px-2 py-1 rounded-full bg-white/5">
                      {market.sub_category || market.category}
                    </span>
                    <span className="text-[10px] font-bold text-white/20">
                      Vol: {total.toFixed(1)} FLOW
                    </span>
                  </div>

                  <h3 className="text-xl font-bold leading-tight mb-8 group-hover:text-cyan-400 transition-colors line-clamp-2 min-h-[56px]">
                    {market.question}
                  </h3>

                  <div className="space-y-4">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-white/40 uppercase tracking-wider">Likelihood</span>
                      <span className="text-cyan-400">{yesProb.toFixed(1)}% YES</span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-cyan-500 transition-all duration-1000"
                        style={{ width: `${yesProb}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Bet Modal */}
      {showBetModal && activeMarket && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#111] border border-white/10 w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl">
            <div className="p-8 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-xl font-bold">Place your Bet</h2>
              <button onClick={() => setShowBetModal(false)} className="text-white/40 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-8">
              <p className="text-white/60 mb-8 font-medium leading-relaxed">{activeMarket.question}</p>
              
              <div className="space-y-4 mb-8">
                <div className="text-sm font-bold text-white/40 uppercase tracking-widest">Amount (FLOW)</div>
                <input 
                  type="number" 
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-2xl font-bold outline-none focus:border-cyan-500 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  disabled={isTxLoading}
                  onClick={() => handlePlaceBet(1)}
                  className="bg-cyan-500 hover:bg-cyan-400 text-black py-4 rounded-2xl font-bold transition-all disabled:opacity-50"
                >
                  YES
                </button>
                <button 
                  disabled={isTxLoading}
                  onClick={() => handlePlaceBet(0)}
                  className="bg-white/5 hover:bg-white/10 text-white py-4 rounded-2xl font-bold transition-all disabled:opacity-50"
                >
                  NO
                </button>
              </div>
              {activeMarket.has_draw && (
                <button 
                  disabled={isTxLoading}
                  onClick={() => handlePlaceBet(2)}
                  className="w-full mt-4 bg-white/5 hover:bg-white/10 text-white py-4 rounded-2xl font-bold transition-all disabled:opacity-50"
                >
                  DRAW
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#111] border border-white/10 w-full max-w-xl rounded-[32px] overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-8 border-b border-white/5 flex items-center justify-between sticky top-0 bg-[#111] z-10">
              <h2 className="text-xl font-bold">Create New Market</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-white/40 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleCreateMarket} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Market Question</label>
                <input 
                  required
                  placeholder="Will BTC hit $100k by 2027?"
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-4 outline-none focus:border-cyan-500"
                  onChange={(e) => setNewMarket({...newMarket, question: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Category</label>
                  <select 
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-4 outline-none"
                    onChange={(e) => setNewMarket({...newMarket, category: e.target.value})}
                  >
                    {categories.slice(1).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Deadline</label>
                  <input 
                    required
                    type="datetime-local"
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-4 outline-none"
                    onChange={(e) => setNewMarket({...newMarket, deadline: e.target.value})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Topic</label>
                  <input 
                    placeholder="Bitcoin"
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-4 outline-none"
                    onChange={(e) => setNewMarket({...newMarket, topic: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Sub-Category</label>
                  <input 
                    placeholder="Price Action"
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-4 outline-none"
                    onChange={(e) => setNewMarket({...newMarket, subCategory: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Context Details</label>
                <textarea 
                  placeholder="BTC/USD price on Binance..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-4 outline-none h-24 resize-none"
                  onChange={(e) => setNewMarket({...newMarket, context: e.target.value})}
                />
              </div>

              <div className="flex items-center gap-3 bg-white/5 p-4 rounded-xl border border-white/5">
                <input 
                  type="checkbox"
                  className="w-5 h-5 accent-cyan-500"
                  onChange={(e) => setNewMarket({...newMarket, hasDraw: e.target.checked})}
                />
                <span className="text-sm font-medium">Allow 3-Way (Draw) Resolution</span>
              </div>

              <div className="bg-cyan-500/10 p-6 rounded-2xl border border-cyan-500/20 text-center">
                <div className="text-cyan-400 text-xs font-bold uppercase tracking-widest mb-1">Creation Bond</div>
                <div className="text-2xl font-bold">5.0 FLOW</div>
                <div className="text-white/40 text-[10px] mt-2 leading-relaxed">
                  This bond is returned when the AI resolves the market correctly.
                </div>
              </div>

              <button 
                type="submit"
                disabled={isTxLoading}
                className="w-full bg-cyan-500 hover:bg-cyan-400 text-black py-4 rounded-2xl font-bold transition-all disabled:opacity-50"
              >
                Deploy Market to Flow EVM
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
