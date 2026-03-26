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
  const [notification, setNotification] = useState<{
    show: boolean;
    title: string;
    message: string;
    type: "success" | "error";
  }>({ show: false, title: "", message: "", type: "success" });

  const showNotify = (title: string, message: string, type: "success" | "error" = "success") => {
    setNotification({ show: true, title, message, type });
  };

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
    hasDraw: false,
    initialLiquidity: "100.0"
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
        showNotify("Shares Purchased", `You have successfully bought ${calculatePayout(side)} shares.`);
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
        showNotify("Shares Sold", `You have successfully sold your position for USDC.`);
      }
      setShowBetModal(false);
    } catch (error) {
      console.error("Trade error:", error);
      showNotify("Transaction Failed", "The transaction could not be completed on the blockchain.", "error");
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
        "function createMarket(string,string,string,string,string,uint256,bool) external payable",
        "function collateralToken() view returns (address)",
        "event MarketCreated(address indexed, address indexed, address indexed, string)"
      ];
      const factoryContract = new ethers.Contract(FACTORY_ADDRESS, factoryAbi, signer);
      
      const deadlineTimestamp = Math.floor(new Date(newMarket.deadline).getTime() / 1000);
      const tx = await factoryContract.createMarket(
        newMarket.question, newMarket.category, newMarket.subCategory, 
        newMarket.topic, newMarket.context, deadlineTimestamp, newMarket.hasDraw,
        { value: ethers.parseEther("5") }
      );
      const receipt = await tx.wait();
      
      // Extract AMM address from logs
      const event = receipt.logs.find((log: any) => {
        try {
          return factoryContract.interface.parseLog(log)?.name === "MarketCreated";
        } catch (e) {
          return false;
        }
      });
      
      if (event) {
        const parsedEvent = factoryContract.interface.parseLog(event);
        const ammAddress = parsedEvent?.args[1];
        const collateralTokenAddress = await factoryContract.collateralToken();
        
        // Add Initial Liquidity
        const ammAbi = ["function addLiquidity(uint256) external"];
        const erc20Abi = ["function approve(address, uint256) external returns (bool)"];
        const ammContract = new ethers.Contract(ammAddress, ammAbi, signer);
        const collateralContract = new ethers.Contract(collateralTokenAddress, erc20Abi, signer);
        
        const liquidityAmount = ethers.parseEther(newMarket.initialLiquidity);
        const approveTx = await collateralContract.approve(ammAddress, liquidityAmount);
        await approveTx.wait();
        
        const addLiquidityTx = await ammContract.addLiquidity(liquidityAmount);
        await addLiquidityTx.wait();
      }

      setShowCreateModal(false);
      showNotify("Market Created", "Your prediction market has been deployed with initial liquidity.");
    } catch (error) {
      console.error("Creation error:", error);
      showNotify("Creation Failed", "There was an error deploying your market to the network.", "error");
    } finally {
      setIsTxLoading(false);
    }
  };

  const calculatePayout = (side: number) => {
    if (!activeMarket || !betAmount || parseFloat(betAmount) <= 0) return "0.00";
    const currentBet = parseFloat(betAmount);
    
    if (tradeMode === "buy") {
      const price = side === 1 ? activeMarket.yes_price : side === 0 ? activeMarket.no_price : activeMarket.draw_price;
      if (!price || price === 0) return "0.00";
      return (currentBet / price).toFixed(2);
    } else {
      // Selling: return approximate USDC back
      const price = side === 1 ? activeMarket.yes_price : side === 0 ? activeMarket.no_price : activeMarket.draw_price;
      return (currentBet * (price || 0.5)).toFixed(2);
    }
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
          <p className="text-lg md:text-xl font-bold text-white/40 mb-12 max-w-2xl leading-relaxed uppercase tracking-wide">
            The first prediction market on Flow with <span className="text-white">Autonomous AI Resolution</span> via Gemini and Google Search.
          </p>
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
          {activeMarkets.map((market) => {
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
                    onClick={() => { setActiveMarket(market); setShowBetModal(true); setTradeMode("buy"); }}
                    className={`group relative ${theme.cardBg} border-2 ${theme.border} rounded-[48px] p-10 hover:bg-white/[0.12] transition-all cursor-pointer overflow-hidden backdrop-blur-2xl hover:-translate-y-2`}
                  >
                    <div className={`absolute -top-24 -left-24 w-64 h-64 bg-gradient-to-br ${theme.glow} blur-3xl opacity-40 group-hover:opacity-100 transition-opacity duration-700`} />
                    
                    <div className="relative z-10 h-full flex flex-col">
                      <div className="flex items-center justify-between mb-8">
                        <div className={`px-4 py-1.5 rounded-full ${theme.bg} border ${theme.border} text-[10px] font-black uppercase tracking-widest`}>
                          {market.category}
                        </div>
                        <div className="text-[10px] font-black text-white/50 uppercase tracking-widest">
                          {market.total_liquidity_usdc || "0"} USDC
                        </div>
                      </div>

                      <h3 className="text-2xl font-black leading-tight mb-10 min-h-[72px] tracking-tight text-white drop-shadow-md">
                        {market.question}
                      </h3>

                      <div className={`mt-auto space-y-5 bg-gradient-to-br ${theme.bg} to-white/[0.02] p-8 rounded-[36px] border ${theme.border} group-hover:border-white/40 transition-all shadow-xl backdrop-blur-md`}>
                        <div className="flex justify-between items-end">
                          <div className="space-y-1">
                            <span className="block text-[10px] font-black text-white/40 uppercase tracking-widest">Price</span>
                            <span className="block text-4xl font-black text-white">
                              ${market.yes_price?.toFixed(2) || "0.50"} <span className={`${theme.text} text-sm font-black`}>YES</span>
                            </span>
                          </div>
                          <div className={`w-14 h-14 rounded-2xl ${theme.bg} border ${theme.border} flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg`}>
                            <ChevronRight className={`w-7 h-7 ${theme.text}`} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
          })}
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
                <div className="text-center"><span className="block text-[9px] font-black text-white/30 uppercase mb-1">Your YES</span><span className="font-black text-emerald-400">{parseFloat(userPositions.yes).toFixed(1)}</span></div>
                <div className="text-center"><span className="block text-[9px] font-black text-white/30 uppercase mb-1">Your NO</span><span className="font-black text-rose-400">{parseFloat(userPositions.no).toFixed(1)}</span></div>
                {activeMarket.has_draw && <div className="text-center"><span className="block text-[9px] font-black text-white/30 uppercase mb-1">Your DRAW</span><span className="font-black text-amber-400">{parseFloat(userPositions.draw).toFixed(1)}</span></div>}
              </div>

              <div className="space-y-4">
                <div className="flex justify-between text-[10px] font-black text-white/30 uppercase"><span>{tradeMode === "buy" ? "Collateral (USDC)" : "Shares to Sell"}</span><span>Bal: {tradeMode === "buy" ? parseFloat(userBalance).toFixed(1) : (side => side === 1 ? userPositions.yes : side === 0 ? userPositions.no : userPositions.draw)(1)}</span></div>
                <input type="number" value={betAmount} onChange={(e) => setBetAmount(e.target.value)} className="w-full bg-white/5 border-2 border-white/5 rounded-3xl p-6 text-4xl font-black text-center outline-none focus:border-cyan-500/50" />
              </div>

              <div className={`grid ${activeMarket.has_draw ? "grid-cols-3" : "grid-cols-2"} gap-4`}>
                <button onClick={() => handlePlaceBet(1)} disabled={isTxLoading} className="h-24 bg-gradient-to-tr from-emerald-500 to-cyan-500 rounded-3xl font-black text-xl flex flex-col items-center justify-center">
                  <span>YES</span>
                  <span className="text-xs opacity-60">{tradeMode === "buy" ? `${calculatePayout(1)} USDC Payout` : "Confirm Sell"}</span>
                </button>
                <button onClick={() => handlePlaceBet(0)} disabled={isTxLoading} className="h-24 bg-gradient-to-tr from-rose-500 to-orange-600 rounded-3xl font-black text-xl flex flex-col items-center justify-center">
                  <span>NO</span>
                  <span className="text-xs opacity-60">{tradeMode === "buy" ? `${calculatePayout(0)} USDC Payout` : "Confirm Sell"}</span>
                </button>
                {activeMarket.has_draw && (
                  <button onClick={() => handlePlaceBet(2)} disabled={isTxLoading} className="h-24 bg-gradient-to-tr from-amber-500 to-yellow-600 rounded-3xl font-black text-xl flex flex-col items-center justify-center">
                    <span>DRAW</span>
                    <span className="text-xs opacity-60">{tradeMode === "buy" ? `${calculatePayout(2)} USDC Payout` : "Confirm Sell"}</span>
                  </button>
                )}
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
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-3xl font-black">Deploy Market</h2>
              <button onClick={() => setShowCreateModal(false)} className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center hover:bg-white/10 transition-colors">
                <X className="w-6 h-6 text-white/40" />
              </button>
            </div>
            <form onSubmit={handleCreateMarket} className="space-y-8">
              <textarea required placeholder="Market question..." className="w-full bg-white/5 border-2 border-white/10 rounded-3xl p-6 h-32 text-xl font-bold" onChange={(e) => setNewMarket({...newMarket, question: e.target.value})} />
              <div className="grid grid-cols-2 gap-6">
                <select className="w-full bg-white/5 border-2 border-white/5 rounded-2xl p-5 font-bold outline-none focus:border-purple-500/50 appearance-none text-white [&>option]:bg-[#0A0A0A] [&>option]:text-white"
                  onChange={(e) => setNewMarket({...newMarket, category: e.target.value})}>
                  {categories.slice(1).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="datetime-local" className="bg-white/5 border-2 border-white/10 rounded-2xl p-5" onChange={(e) => setNewMarket({...newMarket, deadline: e.target.value})} />
              </div>
              
              <div className="flex items-center gap-4 bg-white/5 p-6 rounded-3xl border border-white/5">
                <input 
                  type="checkbox" 
                  id="hasDraw"
                  className="w-6 h-6 rounded-lg bg-white/5 border-white/10 text-purple-600 focus:ring-purple-500"
                  checked={newMarket.hasDraw}
                  onChange={(e) => setNewMarket({...newMarket, hasDraw: e.target.checked})}
                />
                <label htmlFor="hasDraw" className="text-sm font-black text-white/60 uppercase tracking-widest cursor-pointer">
                  Include DRAW Option (Soccer/Tie Support)
                </label>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-white/30 uppercase tracking-widest">Initial Liquidity (USDC)</label>
                <input 
                  type="number" 
                  value={newMarket.initialLiquidity} 
                  onChange={(e) => setNewMarket({...newMarket, initialLiquidity: e.target.value})} 
                  className="w-full bg-white/5 border-2 border-white/10 rounded-3xl p-6 text-2xl font-black outline-none focus:border-cyan-500/50" 
                />
              </div>

              <button type="submit" disabled={isTxLoading} className="w-full h-24 bg-gradient-to-r from-purple-600 to-cyan-500 rounded-3xl font-black text-xl">Deploy with Liquidity</button>
            </form>
          </div>
        </div>
      )}

      {/* Notification Modal */}
      {notification.show && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 backdrop-blur-2xl">
          <div className="absolute inset-0 bg-black/80" onClick={() => setNotification({ ...notification, show: false })} />
          <div className="relative bg-[#0A0A0A] border-2 border-white/10 w-full max-w-sm rounded-[40px] p-10 text-center shadow-[0_0_50px_rgba(0,0,0,0.5)] animate-in zoom-in duration-300">
            <div className={`w-20 h-20 rounded-3xl mx-auto mb-8 flex items-center justify-center ${notification.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
              {notification.type === 'success' ? <CheckCircle2 className="w-10 h-10" /> : <X className="w-10 h-10" />}
            </div>
            <h2 className="text-2xl font-black mb-2">{notification.title}</h2>
            <p className="text-sm font-bold text-white/40 mb-10 leading-relaxed uppercase tracking-tight">
              {notification.message}
            </p>
            <button 
              onClick={() => setNotification({ ...notification, show: false })}
              className="w-full py-5 bg-white text-black rounded-2xl font-black text-sm hover:bg-white/90 transition-colors uppercase tracking-widest"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
