# Talambag

Transparent Soroban-based pooled contributions for community gifts and emergency aid.

## Problem

Community organizers and OFW groups lose track of pooled contributions for gifts or emergency aid because manual GCash screenshots are opaque and easily faked, leading to trust issues.

## Solution

Talambag uses a Soroban smart contract to create a transparent, immutable pool where anyone can deposit XLM and only the verified organizer can withdraw, visible to all contributors on-chain.

## Suggested Timeline for MVP Delivery

- Day 1: Set up Soroban contract project, initialize organizer and asset logic
- Day 2: Implement deposit, organizer-only withdrawal, and public balance query
- Day 3: Write and validate contract tests
- Day 4: Build the web app UI for deposit, pool balance display, and organizer withdrawal flow
- Day 5: Deploy to testnet and run end-to-end testing

## Stellar Features Used

- Soroban smart contract
- XLM or USDC transfer using Soroban token interface

## Prerequisites

- Rust toolchain installed
- Soroban CLI installed

Suggested check:

```bash
soroban --version
rustc --version
cargo --version
```

## Build Instructions

```bash
soroban contract build
```

## Test Instructions

```bash
cargo test
```

## Frontend Setup

The repo now includes a Next.js frontend in [`frontend/`](/home/carts/Documents/Personal/Stellar-Project/frontend) that connects to the Soroban contract with Freighter.

Install dependencies with `pnpm`:

```bash
cd frontend
pnpm install
```

Create a local environment file from the example and fill in your deployed values:

```bash
cp .env.example .env.local
```

Required frontend environment variables:

- `NEXT_PUBLIC_TALAMBAG_CONTRACT_ID`
- `NEXT_PUBLIC_TALAMBAG_ASSET_ADDRESS`
- `NEXT_PUBLIC_STELLAR_READ_ADDRESS`

Useful defaults are already included in `.env.example` for Stellar testnet.

Run the frontend locally:

```bash
pnpm dev
```

Validate the frontend:

```bash
pnpm lint
pnpm build
```

## Testnet Deploy

```bash
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/stellaroid.wasm \
  --source organizer \
  --network testnet
```

## Sample CLI Invocation

This MVP uses `init`, `deposit`, `withdraw`, and `pool_balance` rather than certificate registration because the Talambag problem statement is a shared contribution pool.

Initialize the organizer and asset:

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source organizer \
  --network testnet \
  -- init \
  --organizer <ORGANIZER_ADDRESS> \
  --asset <TOKEN_CONTRACT_ADDRESS>
```

Deposit into the pool:

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source contributor \
  --network testnet \
  -- deposit \
  --from <CONTRIBUTOR_ADDRESS> \
  --amount 10000000
```

Read the pool balance:

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source anyone \
  --network testnet \
  -- pool_balance
```

## MIT License

This project is provided under the MIT License.
