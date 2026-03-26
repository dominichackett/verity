# Verity - Prediction Market on Flow

A decentralized prediction market platform built on Flow EVM, utilizing the **Polymarket mechanism** (Conditional Tokens) for efficient share creation and trading.

## Polymarket Mechanism

Verity implements a Peer-to-Peer Central Limit Order Book (CLOB) and AMM model similar to Polymarket:
- **Collateral-Backed Shares:** 1 YES share + 1 NO share is always worth exactly $1.00 USDC.
- **Minting (Split):** Users can lock $1.00 USDC to mint 1 YES and 1 NO share.
- **Merging:** Users can burn 1 YES and 1 NO share to release $1.00 USDC.
- **Trading:** Shares are ERC1155 tokens, tradable on-chain via a Fixed Product Market Maker (AMM) or off-chain via CLOB.
- **Fixed Payouts:** Upon resolution, winning shares are redeemable for $1.00 USDC (minus protocol fees).

## Project Structure

- `apps/web`: Next.js frontend application.
- `packages/contracts`: Hardhat project for Solidity smart contracts on Flow EVM.
- `packages/workflows`: Chainlink Runtime Environment (CRE) workflows for market resolution.

## Prerequisites

- Node.js 18+
- npm (or pnpm/yarn if configured)
- [CRE CLI](https://cre.chain.link) for workflow simulation.

## Getting Started

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Setup Environment Variables:**
    - Copy `.env.example` to `.env` in `packages/contracts`.
    - Provide your `PRIVATE_KEY`.

3.  **Compile Contracts:**
    ```bash
    npm run compile -w @verity/contracts
    ```

4.  **Run Workflows:**
    ```bash
    npm run simulate -w @verity/workflows
    ```

5.  **Start Frontend:**
    ```bash
    npm run dev -w @verity/web
    ```

## Network Details (Flow Testnet)

- **RPC URL:** `https://testnet.evm.nodes.onflow.org`
- **Chain ID:** `545`
- **Explorer:** [Flowscan EVM](https://evm-testnet.flowscan.io)
