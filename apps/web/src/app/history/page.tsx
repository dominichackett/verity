"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ethers } from "ethers";
import { useWeb3 } from "@/hooks/useWeb3";
import { 
  ArrowLeft,
  Activity,
  Award,
  Wallet,
  Clock
} from "lucide-react";
import Link from "next/link";

export default function HistoryPage() {
  const { account, connectWallet } = useWeb3();
  const [userTrades, setUserTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!account) {
      setLoading(false);
      return;
    }

    async function fetchTrades() {
      console.log("🔍 Fetching trades for account:", account);
      
      const { data: tradesData, error: tradesError } = await supabase
        .from("trades")
        .select("*")
        .ilike("user_address", account)
        .order("created_at", { ascending: false });

      if (tradesError) {
        console.error("❌ Supabase error fetching trades:", tradesError);
        setLoading(false);
        return;
      }

      if (tradesData && tradesData.length > 0) {
        const marketAddresses = [...new Set(tradesData.map(t => t.market_address))];
        const { data: marketsData } = await supabase
          .from("markets")
          .select("address, question")
          .in("address", marketAddresses);

        const marketMap = new Map(marketsData?.map(m => [m.address.toLowerCase(), m.question]) || []);
        
        const tradesWithMarkets = tradesData.map(t => ({
          ...t,
          markets: {
            question: marketMap.get(t.market_address.toLowerCase()) || `Market ${t.market_address.slice(0, 6)}...`
          }
        }));

        setUserTrades(tradesWithMarkets);
      }
      setLoading(false);
    }

    fetchTrades();

    const channel = supabase
      .channel("trades-realtime-page")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "trades" }, (payload) => {
        if (payload.new && payload.new.user_address.toLowerCase() === account.toLowerCase()) {
          fetchTrades();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [account]);

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-cyan-500/30 font-sans relative overflow-x-hidden">
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-600/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/20 rounded-full blur-[150px]" />
      </div>

      <nav className="border-b border-white/10 bg-black/20 backdrop-blur-2xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-11 h-11 bg-gradient-to-tr from-cyan-400 via-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(34,211,238,0.3)]">
              <Award className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-black tracking-tighter uppercase">Verity</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm font-black text-white/40 hover:text-white uppercase tracking-widest transition-colors mr-6">Markets</Link>
            <button onClick={connectWallet} className="flex items-center gap-2 bg-white/10 border border-white/10 px-6 py-3 rounded-2xl">
              <Wallet className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-bold">{account ? `${account.slice(0, 6)}...${account.slice(-4)}` : "Connect Wallet"}</span>
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 pt-16 pb-24">
        <div className="mb-12">
          <Link href="/" className="flex items-center gap-2 text-white/40 hover:text-white transition-colors mb-8 group w-fit">
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Back to Markets</span>
          </Link>
          <h1 className="text-5xl font-black tracking-tighter">Activity History</h1>
          <p className="text-white/40 font-bold uppercase tracking-widest text-xs mt-4">Tracking your on-chain predictions and payouts</p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-[48px] overflow-hidden backdrop-blur-md shadow-2xl">
          {!account ? (
            <div className="p-32 text-center">
              <Wallet className="w-16 h-16 text-white/10 mx-auto mb-8" />
              <h3 className="text-xl font-black mb-4 uppercase tracking-tight">Connect your wallet</h3>
              <p className="text-white/30 text-sm font-bold max-w-xs mx-auto mb-10 leading-relaxed uppercase tracking-widest">Please connect your wallet to view your personal activity history.</p>
              <button onClick={connectWallet} className="px-10 py-5 bg-white text-black rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-white/90 transition-all">Connect Wallet</button>
            </div>
          ) : loading ? (
            <div className="p-32 text-center">
              <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin mx-auto mb-6"></div>
              <p className="text-white/30 font-black uppercase tracking-widest text-sm">Syncing History...</p>
            </div>
          ) : userTrades.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/20 bg-white/[0.08]">
                    <th className="px-10 py-8 text-[11px] font-black uppercase tracking-[0.2em] text-white/70">Market</th>
                    <th className="px-10 py-8 text-[11px] font-black uppercase tracking-[0.2em] text-white/70">Action</th>
                    <th className="px-10 py-8 text-[11px] font-black uppercase tracking-[0.2em] text-white/70">Outcome</th>
                    <th className="px-10 py-8 text-[11px] font-black uppercase tracking-[0.2em] text-white/70">Shares</th>
                    <th className="px-10 py-8 text-[11px] font-black uppercase tracking-[0.2em] text-white/70">Value</th>
                    <th className="px-10 py-8 text-[11px] font-black uppercase tracking-[0.2em] text-white/70">Time</th>
                    <th className="px-10 py-8 text-[11px] font-black uppercase tracking-[0.2em] text-white/70 text-right">Explorer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {userTrades.map((trade) => (
                    <tr key={trade.id} className="hover:bg-white/[0.04] transition-colors group">
                      <td className="px-10 py-8 max-w-md">
                        <span className="font-bold text-sm text-white/90 line-clamp-2 leading-relaxed">
                          {trade.markets?.question || `Market ${trade.market_address.slice(0,6)}...`}
                        </span>
                      </td>
                      <td className="px-10 py-8">
                        <span className={`px-4 py-1.5 rounded-full text-[9px] font-black tracking-widest border ${
                          trade.type === 'BUY' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 
                          trade.type === 'SELL' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' : 
                          'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                        }`}>
                          {trade.type}
                        </span>
                      </td>
                      <td className="px-10 py-8">
                        <span className="font-black text-[10px] text-white/60 tracking-widest">
                          {trade.outcome_index === 1 ? "YES" : trade.outcome_index === 0 ? "NO" : "DRAW"}
                        </span>
                      </td>
                      <td className="px-10 py-8">
                        <span className="font-black text-sm text-white/80">
                          {trade.share_amount ? trade.share_amount.toFixed(1) : "-"}
                        </span>
                      </td>
                      <td className="px-10 py-8">
                        <span className="font-black text-sm text-white">
                          {trade.collateral_amount ? trade.collateral_amount.toFixed(1) : "0.0"} <span className="text-[10px] text-white/40 ml-1">USDC</span>
                        </span>
                      </td>
                      <td className="px-10 py-8">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-white/60 uppercase tracking-tight">
                            {new Date(trade.created_at).toLocaleDateString()}
                          </span>
                          <span className="text-[9px] font-bold text-white/30 uppercase tracking-tighter">
                            {new Date(trade.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </td>
                      <td className="px-10 py-8 text-right">
                        <a 
                          href={`https://evm-testnet.flowscan.io/tx/${trade.tx_hash}`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="inline-flex w-12 h-12 bg-white/5 rounded-2xl items-center justify-center hover:bg-white/20 transition-all text-white/40 hover:text-cyan-400 border border-white/10"
                        >
                          <Activity className="w-5 h-5" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-32 text-center">
              <Activity className="w-16 h-16 text-white/5 mx-auto mb-8" />
              <p className="text-white/20 font-black uppercase tracking-widest text-sm mb-2">No activity history found</p>
              <p className="text-white/10 text-[10px] font-bold uppercase tracking-widest">Start predicting to build your track record</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
