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
  }, [selectedCategory, account, signer]); // Add account and signer to dependencies

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
      
      console.log("Frontend: Attempting to create market with category:", newMarket.category);
      
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

  const calculatePayout = (side: number) => {
    if (!activeMarket || !betAmount || parseFloat(betAmount) <= 0) return "0.00";

    const currentBet = parseFloat(betAmount);
    const yesPool = parseFloat(activeMarket.yes_pool);
    const noPool = parseFloat(activeMarket.no_pool);
    const drawPool = parseFloat(activeMarket.draw_pool);
    const fee = 0.015; // 1.5% fee

    let totalPool = yesPool + noPool + drawPool;
    let winningPool = 0;

    if (side === 1) { // YES
      winningPool = yesPool + currentBet;
    } else if (side === 0) { // NO
      winningPool = noPool + currentBet;
    } else if (side === 2) { // DRAW
      winningPool = drawPool + currentBet;
    } else {
      return "0.00";
    }

    if (winningPool === 0) return "0.00"; // Avoid division by zero

    const estimatedPayout = (currentBet / winningPool) * (totalPool + currentBet) * (1 - fee);
    return estimatedPayout.toFixed(2);
  };


  const activeMarkets = markets.filter(m => m.status !== 'resolved');
  const resolvedMarkets = markets.filter(m => m.status === 'resolved');

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-cyan-500/30 font-sans relative overflow-x-hidden">
      {/* Dynamic Mesh Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-600/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/20 rounded-full blur-[150px]" />
        <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-blue-500/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-[20%] left-[10%] w-[35%] h-[35%] bg-emerald-500/10 rounded-full blur-[130px]" />
      </div>

      {/* Navigation */}
      <nav className="border-b border-white/10 bg-black/20 backdrop-blur-2xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-gradient-to-tr from-cyan-400 via-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(34,211,238,0.3)] group cursor-pointer">
              <Award className="w-6 h-6 text-white group-hover:rotate-12 transition-transform" />
            </div>
            <span className="text-2xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-white/40">
              VERITY
            </span>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={connectWallet}
              className="flex items-center gap-2 bg-gradient-to-b from-white/10 to-transparent hover:from-white/20 border border-white/10 px-6 py-3 rounded-2xl transition-all active:scale-95 group shadow-xl"
            >
              <Wallet className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
              <span className="text-sm font-bold tracking-tight">
                {account ? `${account.slice(0, 6)}...${account.slice(-4)}` : "Connect Wallet"}
              </span>
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-6 pt-16 pb-24 relative">
        <header className="mb-20 text-center md:text-left">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-black uppercase tracking-[0.3em] mb-8 shadow-[0_0_15px_rgba(34,211,238,0.1)]">
            <Activity className="w-3.5 h-3.5 animate-pulse" />
            Next-Gen Prediction Protocol
          </div>
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter mb-8 leading-[0.9] bg-clip-text text-transparent bg-gradient-to-b from-white to-white/50">
            Predict the <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600">Unpredictable.</span>
          </h1>
          
          <div className="flex flex-wrap justify-center md:justify-start gap-4 mt-12">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-8 py-4 rounded-[24px] text-sm font-black transition-all border-2 ${
                  selectedCategory === cat
                    ? "bg-white text-black border-white shadow-[0_0_30px_rgba(255,255,255,0.2)] scale-105"
                    : "bg-white/5 text-white/40 border-white/5 hover:border-white/20 hover:text-white hover:bg-white/10"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </header>

        {/* Market Feed */}
        <div className="flex items-center justify-between mb-12">
          <div className="space-y-1">
            <h2 className="text-3xl font-black tracking-tight flex items-center gap-3">
              Market Stream
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-bounce" />
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-bounce [animation-delay:0.2s]" />
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-bounce [animation-delay:0.4s]" />
              </div>
            </h2>
            <p className="text-white/30 text-sm font-medium uppercase tracking-widest">Global consensus in real-time</p>
          </div>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-3 bg-gradient-to-tr from-cyan-500 via-blue-600 to-purple-600 hover:brightness-110 text-white px-8 py-4 rounded-[28px] font-black transition-all shadow-2xl shadow-blue-500/20 active:scale-95 group"
          >
            <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
            Launch Market
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-[400px] bg-white/5 rounded-[48px] animate-pulse border border-white/10" />
            ))}
          </div>
        ) : (
          <div className="space-y-24">
            {/* Active Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
              {activeMarkets.map((market) => {
                const total = (Number(market.yes_pool) || 0) + (Number(market.no_pool) || 0) + (Number(market.draw_pool) || 0);
                const yesProb = total > 0 ? (market.yes_pool * 100) / total : (market.has_draw ? 33.3 : 50);
                
                // High-Vibrancy Dynamic Themes
                const themes: any = {
                  'Crypto': {
                    glow: 'from-blue-500/30 via-blue-400/10 to-transparent',
                    border: 'border-blue-400/40',
                    text: 'text-blue-400',
                    bg: 'bg-blue-400/20',
                    cardBg: 'bg-blue-500/[0.08]'
                  },
                  'Sports': {
                    glow: 'from-emerald-500/30 via-emerald-400/10 to-transparent',
                    border: 'border-emerald-400/40',
                    text: 'text-emerald-400',
                    bg: 'bg-emerald-400/20',
                    cardBg: 'bg-emerald-500/[0.08]'
                  },
                  'Politics': {
                    glow: 'from-purple-500/30 via-purple-400/10 to-transparent',
                    border: 'border-purple-400/40',
                    text: 'text-purple-400',
                    bg: 'bg-purple-400/20',
                    cardBg: 'bg-purple-500/[0.08]'
                  },
                  'Pop Culture': {
                    glow: 'from-pink-500/30 via-pink-400/10 to-transparent',
                    border: 'border-pink-400/40',
                    text: 'text-pink-400',
                    bg: 'bg-pink-400/20',
                    cardBg: 'bg-pink-500/[0.08]'
                  },
                  'Default': {
                    glow: 'from-cyan-500/30 via-cyan-400/10 to-transparent',
                    border: 'border-cyan-400/40',
                    text: 'text-cyan-400',
                    bg: 'bg-cyan-400/20',
                    cardBg: 'bg-cyan-500/[0.08]'
                  }
                };
                const theme = themes[market.category] || themes.Default;

                return (
                  <div 
                    key={market.id} 
                    onClick={() => { setActiveMarket(market); setShowBetModal(true); }}
                    className={`group relative ${theme.cardBg} border-2 ${theme.border} rounded-[48px] p-10 hover:bg-white/[0.12] transition-all cursor-pointer overflow-hidden backdrop-blur-2xl hover:-translate-y-2 hover:shadow-[0_0_50px_-10px_rgba(255,255,255,0.1)]`}
                  >
                    {/* Permanent Animated Glow */}
                    <div className={`absolute -top-24 -left-24 w-64 h-64 bg-gradient-to-br ${theme.glow} blur-3xl opacity-40 group-hover:opacity-100 transition-opacity duration-700`} />
                    
                    <div className="relative z-10 h-full flex flex-col">
                      <div className="flex items-center justify-between mb-8">
                        <div className={`px-4 py-1.5 rounded-full ${theme.bg} border ${theme.border} text-[10px] font-black uppercase tracking-[0.2em] shadow-lg`}>
                          {market.sub_category || market.category}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-black text-white/50 uppercase tracking-widest bg-white/5 px-3 py-1.5 rounded-xl border border-white/10">
                          <TrendingUp className={`w-3 h-3 ${theme.text}`} />
                          {total.toFixed(0)} FLOW
                        </div>
                      </div>

                      <h3 className="text-2xl font-black leading-[1.1] mb-10 text-white transition-colors line-clamp-3 min-h-[72px] tracking-tight drop-shadow-md">
                        {market.question}
                      </h3>

                      {/* Vibrant Data Section */}
                      <div className={`mt-auto space-y-5 bg-gradient-to-br ${theme.bg} to-white/[0.02] p-8 rounded-[36px] border ${theme.border} group-hover:border-white/40 transition-all shadow-xl backdrop-blur-md`}>
                        <div className="flex justify-between items-end">
                          <div className="space-y-1">
                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Current Sentiment</span>
                            <span className="block text-4xl font-black text-white">
                              {yesProb.toFixed(0)}% <span className={`${theme.text} text-sm font-black`}>YES</span>
                            </span>
                          </div>
                          <div className={`w-14 h-14 rounded-2xl ${theme.bg} border ${theme.border} flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg`}>
                            <ChevronRight className={`w-7 h-7 ${theme.text}`} />
                          </div>
                        </div>
                        
                        {/* High-Contrast Glow Bar */}
                        <div className="h-4 bg-black/30 rounded-full overflow-hidden p-[3px] border border-white/10 shadow-inner relative">
                          <div 
                            className={`h-full bg-gradient-to-r from-white/40 via-white to-white/40 rounded-full transition-all duration-1000 absolute inset-0 blur-md opacity-30`}
                            style={{ width: `${yesProb}%` }}
                          />
                          <div 
                            className={`h-full bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 rounded-full transition-all duration-1000 shadow-[0_0_25px_rgba(255,255,255,0.6)] relative z-10`}
                            style={{ width: `${yesProb}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Resolved Section */}
            {resolvedMarkets.length > 0 && (
              <div className="pt-24 border-t border-white/10">
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
                  <div className="space-y-2">
                    <h2 className="text-4xl font-black tracking-tight text-white/40 flex items-center gap-4">
                      Truth Archives
                      <Award className="w-8 h-8 text-white/20" />
                    </h2>
                    <p className="text-white/20 text-sm font-bold uppercase tracking-[0.3em]">The record of human prediction</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                  {resolvedMarkets.map((market) => {
                    const outcomeLabel = market.outcome === 1 ? "YES" : market.outcome === 0 ? "NO" : "DRAW";
                    
                    // Unified High-Vibrancy Dynamic Themes
                    const themes: any = {
                      'Crypto': {
                        glow: 'from-blue-500/30 via-blue-400/10 to-transparent',
                        border: 'border-blue-400/40',
                        text: 'text-blue-400',
                        bg: 'bg-blue-400/20',
                        cardBg: 'bg-blue-500/[0.08]'
                      },
                      'Sports': {
                        glow: 'from-emerald-500/30 via-emerald-400/10 to-transparent',
                        border: 'border-emerald-400/40',
                        text: 'text-emerald-400',
                        bg: 'bg-emerald-400/20',
                        cardBg: 'bg-emerald-500/[0.08]'
                      },
                      'Politics': {
                        glow: 'from-purple-500/30 via-purple-400/10 to-transparent',
                        border: 'border-purple-400/40',
                        text: 'text-purple-400',
                        bg: 'bg-purple-400/20',
                        cardBg: 'bg-purple-500/[0.08]'
                      },
                      'Pop Culture': {
                        glow: 'from-pink-500/30 via-pink-400/10 to-transparent',
                        border: 'border-pink-400/40',
                        text: 'text-pink-400',
                        bg: 'bg-pink-400/20',
                        cardBg: 'bg-pink-500/[0.08]'
                      },
                      'Default': {
                        glow: 'from-cyan-500/30 via-cyan-400/10 to-transparent',
                        border: 'border-cyan-400/40',
                        text: 'text-cyan-400',
                        bg: 'bg-cyan-400/20',
                        cardBg: 'bg-cyan-500/[0.08]'
                      }
                    };
                    const theme = themes[market.category] || themes.Default;

                    // Outcome-specific coloring
                    const outcomeColors: any = {
                      'YES': 'bg-gradient-to-tr from-emerald-500 to-green-600 shadow-emerald-500/20',
                      'NO': 'bg-gradient-to-tr from-rose-500 to-red-700 shadow-rose-500/20',
                      'DRAW': 'bg-gradient-to-tr from-amber-400 to-orange-600 shadow-amber-500/20'
                    }
                    const outcomeBgClass = outcomeColors[outcomeLabel] || outcomeColors.YES;
                    
                    return (
                      <div 
                        key={market.id} 
                        className={`group relative ${theme.cardBg} border-2 ${theme.border} rounded-[48px] p-10 overflow-hidden backdrop-blur-2xl shadow-[0_0_50px_-10px_rgba(255,255,255,0.05)]`}
                      >
                        {/* Permanent Animated Glow */}
                        <div className={`absolute -top-24 -left-24 w-64 h-64 bg-gradient-to-br ${theme.glow} blur-3xl opacity-40`} />

                        <div className="relative z-10">
                          <div className="flex items-center justify-between mb-8">
                            <span className={`px-4 py-1.5 rounded-full ${theme.bg} border ${theme.border} text-[10px] font-black uppercase tracking-[0.2em] shadow-lg`}>
                              {market.category}
                            </span>
                            <span className={`text-[10px] font-black uppercase tracking-tighter px-4 py-2 rounded-2xl ${outcomeBgClass} text-white shadow-lg`}>
                              {outcomeLabel}
                            </span>
                          </div>

                          <h3 className="text-xl font-black leading-tight mb-8 text-white/70 drop-shadow-md">
                            {market.question}
                          </h3>
                          
                          <div className={`bg-white/[0.05] p-6 rounded-[32px] border ${theme.border} relative shadow-inner backdrop-blur-md`}>
                            <div className={`absolute -top-3 left-6 px-3 py-1 bg-black/60 text-[9px] font-black ${theme.text} uppercase tracking-widest border border-white/10 rounded-full shadow-md`}>
                              Gemini Verdict
                            </div>
                            <p className="text-sm text-white/60 font-medium leading-relaxed italic pt-2">
                              "{market.ai_reasoning}"
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Bet Modal */}
      {showBetModal && activeMarket && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-xl">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowBetModal(false)} />
          
          <div className="relative bg-[#0A0A0A] border border-white/10 w-full max-w-lg rounded-[48px] overflow-hidden shadow-[0_0_100px_rgba(34,211,238,0.2)] animate-in fade-in zoom-in duration-300">
            {/* Modal Mesh Background */}
            <div className="absolute inset-0 -z-10 opacity-30">
              <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500 rounded-full blur-[80px]" />
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-600 rounded-full blur-[80px]" />
            </div>

            <div className="p-10 border-b border-white/10 flex items-center justify-between bg-white/5 backdrop-blur-md">
              <div className="space-y-1">
                <h2 className="text-2xl font-black tracking-tight">Place Forecast</h2>
                <div className="text-[10px] font-black text-cyan-400 uppercase tracking-[0.2em]">Market Liquidity: Active</div>
              </div>
              <button 
                onClick={() => setShowBetModal(false)} 
                className="w-12 h-12 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl flex items-center justify-center transition-all active:scale-90"
              >
                <X className="w-6 h-6 text-white/40" />
              </button>
            </div>

            <div className="p-10 space-y-10">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Stake Amount (FLOW)</div>
                  <div className="text-[10px] font-black text-cyan-400">Balance: {parseFloat(userBalance).toFixed(2)} FLOW</div>
                </div>
                <div className="relative group">
                  <input 
                    type="number" 
                    value={betAmount}
                    onChange={(e) => setBetAmount(e.target.value)}
                    className="w-full bg-white/5 border-2 border-white/5 rounded-3xl p-6 text-4xl font-black outline-none focus:border-cyan-500/50 transition-all text-center group-hover:bg-white/10"
                  />
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 text-white/20 font-black">FLOW</div>
                </div>
              </div>
              {/* Define currentBet here */}
              {betAmount && parseFloat(betAmount) > 0 && (() => {
                const currentBet = parseFloat(betAmount);
                return (
                  <>
                    <div className="grid grid-cols-2 gap-6">
                      <button 
                        disabled={isTxLoading}
                        onClick={() => handlePlaceBet(1)}
                        className="relative h-24 bg-gradient-to-tr from-emerald-500 to-cyan-500 rounded-[32px] font-black text-xl shadow-xl shadow-emerald-500/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 overflow-hidden group flex flex-col items-center justify-center"
                      >
                        <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity" />
                        <span className="relative z-10">YES</span>
                        <span className="relative z-10 text-xs font-medium text-white/70">
                          {parseFloat(calculatePayout(1)) > currentBet ? `+${(parseFloat(calculatePayout(1)) - currentBet).toFixed(2)} FLOW` : `${(parseFloat(calculatePayout(1)) - currentBet).toFixed(2)} FLOW`}
                        </span>
                      </button>
                      <button 
                        disabled={isTxLoading}
                        onClick={() => handlePlaceBet(0)}
                        className="relative h-24 bg-gradient-to-tr from-rose-500 to-orange-600 rounded-[32px] font-black text-xl shadow-xl shadow-rose-500/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 overflow-hidden group flex flex-col items-center justify-center"
                      >
                        <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity" />
                        <span className="relative z-10">NO</span>
                        <span className="relative z-10 text-xs font-medium text-white/70">
                          {parseFloat(calculatePayout(0)) > currentBet ? `+${(parseFloat(calculatePayout(0)) - currentBet).toFixed(2)} FLOW` : `${(parseFloat(calculatePayout(0)) - currentBet).toFixed(2)} FLOW`}
                        </span>
                      </button>
                    </div>
                    {activeMarket.has_draw && (
                      <button 
                        disabled={isTxLoading}
                        onClick={() => handlePlaceBet(2)}
                        className="w-full h-20 bg-white/5 hover:bg-white/10 border-2 border-white/5 rounded-[32px] font-black text-lg transition-all active:scale-95 disabled:opacity-50 flex flex-col items-center justify-center"
                      >
                        <span className="relative z-10">DRAW / TIE</span>
                        <span className="relative z-10 text-xs font-medium text-white/70">
                          {parseFloat(calculatePayout(2)) > currentBet ? `+${(parseFloat(calculatePayout(2)) - currentBet).toFixed(2)} FLOW` : `${(parseFloat(calculatePayout(2)) - currentBet).toFixed(2)} FLOW`}
                        </span>
                      </button>
                    )}
                  </>
                );
              })()}
            </div>          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-xl">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowCreateModal(false)} />
          
<div className="relative bg-[#0A0A0A] border border-white/10 w-full max-w-2xl rounded-[48px] overflow-hidden shadow-[0_0_100px_rgba(168,85,247,0.2)] animate-in fade-in slide-in-from-bottom-8 duration-500 max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-white/5 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-thumb]:bg-purple-500/50 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:hover:bg-purple-400/70">
            {/* Modal Mesh Background */}
            <div className="absolute inset-0 -z-10 opacity-30">
              <div className="absolute top-0 left-0 w-80 h-80 bg-purple-600 rounded-full blur-[100px]" />
              <div className="absolute bottom-0 right-0 w-80 h-80 bg-blue-600 rounded-full blur-[100px]" />
            </div>

            <div className="p-10 border-b border-white/10 flex items-center justify-between sticky top-0 bg-black/60 backdrop-blur-2xl z-20">
              <div className="space-y-1">
                <h2 className="text-3xl font-black tracking-tight">Deploy Market</h2>
                <div className="text-[10px] font-black text-purple-400 uppercase tracking-[0.2em]">Protocol Fee: 5.0 FLOW (Bonded)</div>
              </div>
              <button 
                onClick={() => setShowCreateModal(false)} 
                className="w-12 h-12 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl flex items-center justify-center transition-all active:scale-90"
              >
                <X className="w-6 h-6 text-white/40" />
              </button>
            </div>

            <form onSubmit={handleCreateMarket} className="p-10 space-y-10">
              <div className="space-y-4">
                <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">Market Proposition</label>
                <textarea 
                  required
                  placeholder="e.g. Will ETH exceed $5,000 before July 2026?"
                  className="w-full bg-white/5 border-2 border-white/5 rounded-3xl p-6 text-xl font-bold outline-none focus:border-purple-500/50 transition-all h-32 resize-none group-hover:bg-white/10"
                  onChange={(e) => setNewMarket({...newMarket, question: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">Domain</label>
                  <select 
  className="w-full bg-white/5 border-2 border-white/5 rounded-2xl p-5 font-bold outline-none focus:border-purple-500/50 appearance-none text-white [&>option]:bg-[#0A0A0A] [&>option]:text-white"
                    onChange={(e) => setNewMarket({...newMarket, category: e.target.value})}
                  >
                    {categories.slice(1).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">Resolution Time</label>
                  <input 
                    required
                    type="datetime-local"
                    className="w-full bg-white/5 border-2 border-white/5 rounded-2xl p-5 font-bold outline-none focus:border-purple-500/50"
                    onChange={(e) => setNewMarket({...newMarket, deadline: e.target.value})}
                  />
                </div>
              </div>

              <div className="bg-gradient-to-tr from-purple-500/10 via-blue-500/10 to-transparent p-8 rounded-[40px] border border-white/10 space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center border border-purple-500/30">
                    <Activity className="w-5 h-5 text-purple-400" />
                  </div>
                  <div className="text-sm font-black uppercase tracking-widest">Resolution Mechanism</div>
                </div>
                <div className="flex items-center gap-4 bg-black/40 p-5 rounded-2xl border border-white/5 group cursor-pointer" onClick={() => setNewMarket({...newMarket, hasDraw: !newMarket.hasDraw})}>
                  <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${newMarket.hasDraw ? 'bg-purple-500 border-purple-500' : 'border-white/20'}`}>
                    {newMarket.hasDraw && <CheckCircle2 className="w-4 h-4 text-white" />}
                  </div>
                  <span className="text-sm font-bold text-white/60">Enable 3-Way Market (Allow for Draw/Tie)</span>
                </div>
              </div>

              <button 
                type="submit"
                disabled={isTxLoading}
                className="w-full relative h-24 bg-gradient-to-r from-purple-600 via-blue-600 to-cyan-500 rounded-[32px] font-black text-xl shadow-[0_20px_50px_rgba(168,85,247,0.3)] hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-50 overflow-hidden group"
              >
                <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity" />
                <span className="relative z-10 flex items-center justify-center gap-3">
                  Deploy to Flow EVM
                  <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
                </span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
