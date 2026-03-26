-- Verity Supabase Schema (Polymarket Mechanism Version)

-- 1. Markets Table
CREATE TABLE markets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address TEXT UNIQUE NOT NULL,       -- Flow EVM contract address
    amm_address TEXT UNIQUE,            -- AMM contract address
    factory_address TEXT NOT NULL,      -- The factory that deployed it
    creator_address TEXT NOT NULL,      -- User who created the market
    collateral_token TEXT NOT NULL,     -- USDC address
    question TEXT NOT NULL,
    category TEXT NOT NULL,
    sub_category TEXT,
    topic TEXT,
    context TEXT,
    deadline TIMESTAMPTZ NOT NULL,
    has_draw BOOLEAN DEFAULT false,
    
    -- Real-time Prices (from AMM or CLOB)
    yes_price NUMERIC DEFAULT 0.5,      -- $0.00 to $1.00
    no_price NUMERIC DEFAULT 0.5,
    draw_price NUMERIC DEFAULT 0.0,
    
    -- Liquidity Info
    total_liquidity_usdc NUMERIC DEFAULT 0,
    
    -- Resolution State
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolving', 'resolved', 'voided')),
    outcome INTEGER,                    -- 1: NO, 2: YES, 3: DRAW, 4: VOID (Matches VerityMarket.Outcome)
    ai_reasoning TEXT,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Positions Table (Replaces Bets)
-- Tracks individual user share balances for each outcome
CREATE TABLE user_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address TEXT NOT NULL,
    market_address TEXT NOT NULL,
    yes_shares NUMERIC DEFAULT 0,
    no_shares NUMERIC DEFAULT 0,
    draw_shares NUMERIC DEFAULT 0,
    
    UNIQUE(user_address, market_address),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Trades Table (For Activity Feed)
CREATE TABLE trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_address TEXT NOT NULL,
    user_address TEXT NOT NULL,
    type TEXT NOT NULL,                 -- 'BUY', 'SELL', 'MINT', 'MERGE'
    outcome_index INTEGER,              -- 0: NO, 1: YES, 2: DRAW
    collateral_amount NUMERIC NOT NULL, -- USDC spent/received
    share_amount NUMERIC NOT NULL,      -- Shares bought/sold
    tx_hash TEXT UNIQUE NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Indices
CREATE INDEX idx_markets_status ON markets(status);
CREATE INDEX idx_user_positions_user ON user_positions(user_address);
CREATE INDEX idx_trades_market ON trades(market_address);

-- Enable Realtime
alter publication supabase_realtime add table markets;
alter publication supabase_realtime add table user_positions;
alter publication supabase_realtime add table trades;
