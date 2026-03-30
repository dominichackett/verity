# Verity - Prediction Market on Flow

Verity is a next-generation decentralized prediction market platform built on **Flow EVM**. It leverages the **Polymarket mechanism** (Conditional Tokens) for efficient share creation and trading, combined with **Autonomous AI Resolution** powered by Google Gemini and Google Search.

## 🌟 Overview

Verity is a truly universal prediction market. While traditional platforms rely on centralized admins or slow human oracles, Verity uses **Google Gemini ** with **Google Search grounding** to resolve any verifiable event on the web. 

It is a community-first platform where:
- **Permissionless Creation:** Any user can deploy a market for any topic.
- **Community Liquidity:** Users can profit from both making accurate predictions (trading) or providing market liquidity (LP).
- **Flow EVM Native:** Built on Flow's high-performance EVM for sub-second finality and near-zero fees.

## 🏗️ Architecture

The project is organized as a monorepo using [Turborepo](https://turbo.build/):

- **`apps/web`**: A modern Next.js frontend for browsing markets, trading shares, and managing positions.
- **`packages/contracts`**: Solidity smart contracts (Hardhat) deployed on Flow EVM.
- **`packages/resolver`**: A TypeScript service that indexes blockchain events and uses **Google Gemini AI** to resolve markets.
- **`packages/database`**: Supabase/PostgreSQL schema for real-time market data and trade history.

## ⚖️ Polymarket Mechanism

Verity implements a collateral-backed share model:
- **Collateral:** Markets use USDC (or MockUSDC on testnet) as the base currency.
- **Minting (Split):** Users can lock $1.00 USDC to mint 1 YES and 1 NO share.
- **Merging:** Users can burn 1 YES and 1 NO share to release $1.00 USDC.
- **Trading:** Shares are ERC1155 tokens, tradable via a Fixed Product Market Maker (AMM).
- **Payouts:** Upon resolution, winning shares are redeemable for $1.00 USDC.

## 🤖 AI Resolution Service

Verity features an automated resolution engine:
1.  **Indexing:** Monitors `VerityFactory` for new markets and syncs them to Supabase.
2.  **Monitoring:** Tracks market deadlines in real-time.
3.  **AI Verdict:** Uses **Google Gemini** with **Google Search** to fact-check outcomes.
4.  **On-Chain Resolution:** Automatically calls the `resolveMarket` function on-chain with the AI's verdict.

## ⚙️ Environment Variables

Each component requires its own `.env` file. Below are the required variables:

### Smart Contracts (`packages/contracts/.env`)
| Variable | Description |
| :--- | :--- |
| `PRIVATE_KEY` | Hex-encoded private key for deployment on Flow Testnet. |

### Web Application (`apps/web/.env.local`)
| Variable | Description |
| :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anonymous (public) key. |
| `NEXT_PUBLIC_FACTORY_ADDRESS` | The deployed `VerityFactory` contract address. |

### Resolver Service (`packages/resolver/.env`)
| Variable | Description |
| :--- | :--- |
| `FACTORY_ADDRESS` | The deployed `VerityFactory` contract address. |
| `PRIVATE_KEY` | Private key for the resolver account (must have resolution rights). |
| `SUPABASE_URL` | Your Supabase project URL. |
| `SUPABASE_SERVICE_KEY` | Supabase Service Role key (for write access). |
| `GOOGLE_GEMINI_API_KEY` | API Key from [Google AI Studio](https://aistudio.google.com/). |
| `AI_MODEL_NAME` . |

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- [Supabase](https://supabase.com/) account for the database.
- [Google AI Studio](https://aistudio.google.com/) API Key for Gemini.

### Installation
```bash
npm install
```

### Smart Contracts
```bash
# Compile contracts
npm run compile -w @verity/contracts

# Run tests
npm run test -w @verity/contracts

# Deploy to Flow Testnet
npm run deploy:flow-testnet -w @verity/contracts
```

### Resolver Service
1. Create a `.env` file in `packages/resolver` with your keys.
2. Run the service:
```bash
npm run start -w resolver
```

### Web Application
```bash
npm run dev -w @verity/web
```

## 🌐 Network Details (Flow Testnet)

- **RPC URL:** `https://testnet.evm.nodes.onflow.org`
- **Chain ID:** `545`
- **Explorer:** [Flowscan EVM](https://evm-testnet.flowscan.io)

## 📄 License
ISC
