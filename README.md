# Verity - Prediction Market on Flow

A decentralized prediction market platform built on Flow EVM, utilizing Chainlink Runtime Environment (CRE) for off-chain computation and verifiable market resolution.

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
