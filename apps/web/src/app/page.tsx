"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ethers } from "ethers";
import { 
  TrendingUp, 
  Search, 
  Plus, 
  Wallet, 
  ChevronRight, 
  Activity,
  Award,
  CircleDot
} from "lucide-react";

export default function Home() {
  const [markets, setMarkets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("All");

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

    // Set up real-time subscription
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

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white selection:bg-cyan-500/30">
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

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-white/50">
            <a href="#" className="hover:text-cyan-400 transition-colors">Markets</a>
            <a href="#" className="hover:text-cyan-400 transition-colors">Portfolio</a>
            <a href="#" className="hover:text-cyan-400 transition-colors">Activity</a>
          </div>

          <button className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-5 py-2.5 rounded-full transition-all active:scale-95 group">
            <Wallet className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
            <span className="text-sm font-semibold">Connect Wallet</span>
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-6 pt-12 pb-24">
        <header className="mb-16">
          <div className="flex items-center gap-2 text-cyan-400 text-sm font-bold uppercase tracking-widest mb-4">
            <Activity className="w-4 h-4 animate-pulse" />
            Live Truth Protocol
          </div>
          <h1 className="text-6xl font-bold tracking-tight mb-6 max-w-3xl leading-[1.1]">
            Predict the future. <br />
            <span className="text-white/40">Powered by the web.</span>
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

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {[
            { label: "Total Volume", value: "1,248,390 FLOW", icon: TrendingUp, color: "text-cyan-400" },
            { label: "Active Markets", value: markets.length.toString(), icon: CircleDot, color: "text-blue-400" },
            { label: "AI Resolved", value: "84.2%", icon: Activity, color: "text-purple-400" }
          ].map((stat, i) => (
            <div key={i} className="bg-white/[0.02] border border-white/5 p-8 rounded-[32px] hover:bg-white/[0.04] transition-colors group">
              <stat.icon className={`w-6 h-6 ${stat.color} mb-4 group-hover:scale-110 transition-transform`} />
              <div className="text-white/40 text-sm font-medium mb-1">{stat.label}</div>
              <div className="text-3xl font-bold tracking-tight">{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Market Feed */}
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            Active Markets
            <span className="bg-cyan-500/10 text-cyan-400 text-xs px-2 py-1 rounded-md">Live</span>
          </h2>
          <button className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-black px-6 py-3 rounded-2xl font-bold transition-all shadow-xl shadow-cyan-500/10 active:scale-95">
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
                  className="group bg-white/[0.02] border border-white/5 rounded-[40px] p-8 hover:bg-white/[0.05] transition-all hover:border-white/10 cursor-pointer overflow-hidden relative"
                >
                  <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronRight className="w-6 h-6 text-cyan-400" />
                  </div>

                  <div className="flex items-center gap-2 mb-6">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/30 border border-white/10 px-2 py-1 rounded-full bg-white/5">
                      {market.sub_category || market.category}
                    </span>
                    <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-pulse" />
                  </div>

                  <h3 className="text-xl font-bold leading-tight mb-8 group-hover:text-cyan-400 transition-colors line-clamp-2 min-h-[56px]">
                    {market.question}
                  </h3>

                  <div className="space-y-6">
                    <div>
                      <div className="flex justify-between text-sm font-bold mb-3">
                        <span className="text-white">YES Probability</span>
                        <span className="text-cyan-400">{yesProb.toFixed(1)}%</span>
                      </div>
                      <div className="h-4 bg-white/5 rounded-full overflow-hidden p-1">
                        <div 
                          className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 rounded-full transition-all duration-1000 shadow-[0_0_12px_rgba(34,211,238,0.4)]"
                          style={{ width: `${yesProb}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-white/5">
                      <div className="text-white/40 text-xs font-semibold">
                        Volume: {total.toFixed(2)} FLOW
                      </div>
                      <div className="text-white/40 text-xs font-semibold">
                        {new Date(market.deadline).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
