-- Verity Supabase Schema (Universal Version)

-- 1. Markets Table
-- Stores the metadata and current state of all prediction markets
CREATE TABLE markets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address TEXT UNIQUE NOT NULL,       -- Flow EVM contract address
    factory_address TEXT NOT NULL,      -- The factory that deployed it
    creator_address TEXT NOT NULL,      -- User who created the market
    question TEXT NOT NULL,
    category TEXT NOT NULL,             -- e.g., "Sports", "Crypto", "Politics"
    sub_category TEXT,                  -- e.g., "Premier League", "Price Action", "Elections"
    topic TEXT,                         -- e.g., "Soccer", "Bitcoin", "USA"
    context TEXT,                       -- e.g., "Arsenal vs Man City", "BTC/USD", "General Election"
    deadline TIMESTAMPTZ NOT NULL,
    has_draw BOOLEAN DEFAULT false,
    
    -- Real-time Pools (Cached from Chain)
    yes_pool NUMERIC DEFAULT 0,
    no_pool NUMERIC DEFAULT 0,
    draw_pool NUMERIC DEFAULT 0,
    
    -- Resolution State
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolving', 'resolved', 'voided', 'conflict')),
    outcome INTEGER,                    -- 0: NO, 1: YES, 2: DRAW, 3: CONFLICT, 4: VOID
    ai_reasoning TEXT,                  -- The reasoning snippet from Google Gemini
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Bets Table
CREATE TABLE bets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id UUID REFERENCES markets(id) ON DELETE CASCADE,
    market_address TEXT NOT NULL,
    user_address TEXT NOT NULL,
    amount NUMERIC NOT NULL,            -- Amount in FLOW
    side INTEGER NOT NULL,              -- 0: NO, 1: YES, 2: DRAW
    tx_hash TEXT UNIQUE NOT NULL,       -- Transaction hash on Flow EVM
    
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Indices
CREATE INDEX idx_markets_status ON markets(status);
CREATE INDEX idx_markets_category ON markets(category);
CREATE INDEX idx_markets_deadline ON markets(deadline);
CREATE INDEX idx_bets_user_address ON bets(user_address);

-- Enable Realtime
alter publication supabase_realtime add table markets;
alter publication supabase_realtime add table bets;
