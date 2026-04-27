# Talambag

**Talambag** is a portmanteau of *Tala* (Star/Stellar) and *Ambag* (Contribution) — literally meaning **"Stellar Contribution"**. It is a Soroban-powered community pooling application built on the Stellar blockchain. It helps real-world groups — families, organizations, and OFW communities — manage shared contributions with on-chain transparency that screenshot-based payment coordination simply cannot provide.

Instead of collecting money through opaque chat threads and manually tracking who paid, Talambag records group membership, pool creation, contributions, and organizer withdrawals entirely on-chain.

---

## Table of Contents

- [Live Demo](#live-demo)
- [Demo Video](#demo-video)
- [UI Screenshots](#ui-screenshots)
- [Smart Contract](#smart-contract)
- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [Smart Contract Reference](#smart-contract-reference)
- [Frontend Reference](#frontend-reference)
- [Project Setup Guide](#project-setup-guide-local-development)
- [Environment Variables](#environment-variables)
- [Running Quality Checks](#running-quality-checks)
- [Deploying to Testnet](#deploying-to-testnet)
- [CLI Examples](#cli-examples)
- [Future Scope](#future-scope)

---

## Live Demo

https://talambag.vercel.app/

---

## Demo Video

[![Watch the Talambag Demo](https://img.youtube.com/vi/Y03vvhb_GjQ/maxresdefault.jpg)](https://www.youtube.com/watch?v=Y03vvhb_GjQ)

---

## UI Screenshots

### Wallet States

Talambag — Wallet Connected
![Talambag Wallet Connected](frontend/public/screenshots/dashboard-overview.png)

Talambag — Wallet Disconnected
![Talambag Wallet Disconnected](frontend/public/screenshots/wallet-disconnected.png)

### Wallet Options

![Talambag Wallet Options](frontend/public/screenshots/wallets.png)

![Talambag Wallet Options (cont.)](frontend/public/screenshots/wallets(cont).png)

### Dashboard Overview

![Talambag Dashboard](frontend/public/screenshots/dashboard-overview.png)

### Group Page

![Group Page](frontend/public/screenshots/group-page.png)

### Create Group

![Create Group Form](frontend/public/screenshots/create-group.png)

### Add Member to Group

![Add Member to Group Form](frontend/public/screenshots/add-member.png)

### Pool Page

![Pool Page](frontend/public/screenshots/pool-page.png)

### Pool Actions — Deposit

![Pool Deposit](frontend/public/screenshots/add-deposit.png)

### Pool Actions — Withdraw

![Pool Withdrawal](frontend/public/screenshots/add-withdrawal.png)

### Transaction Feedback

![Transaction Feedback](frontend/public/screenshots/transaction-feedback.png)

### Successful Testnet Transaction

![Successful Testnet Transaction](frontend/public/screenshots/successful-transaction.png)

---

## Smart Contract

| Detail | Value |
|---|---|
| **Contract Address** | `CD44KFLGE2ISRUD6Q5BZTX3NI4ILTD5QUIWIED255UJDRAFJSR7GYIJE` |
| **Network** | Stellar Testnet |
| **Stellar Expert** | [View Contract](https://stellar.expert/explorer/testnet/contract/CD44KFLGE2ISRUD6Q5BZTX3NI4ILTD5QUIWIED255UJDRAFJSR7GYIJE) |
| **Sample Transaction Hash** | [`63a9457f...`](https://stellar.expert/explorer/testnet/tx/63a9457f00da89738e4394b2ddcbf3f1a39951ade3cd7ffafa7466d1e28c3c31) |

![Stellar Expert Contract](frontend/public/screenshots/talambag-contract.png)

---

## Architecture Overview

Talambag is split into two layers:

```
┌─────────────────────────────┐
│        Next.js Frontend     │  React 19 · TypeScript · pnpm
│  (Vercel-deployed SPA/SSR)  │
└────────────┬────────────────┘
             │  @stellar/stellar-sdk + stellar-wallets-kit + EventSource
             ▼
┌─────────────────────────────┐
│      Talambag Indexer       │  Express · TypeScript · Neon Postgres
│  Polls RPC, stores events,  │  serves history + realtime SSE
└────────────┬────────────────┘
             │  Stellar RPC getEvents
             ▼
┌─────────────────────────────┐
│   Stellar Soroban Testnet   │  Soroban RPC · Horizon
│ Talambag Core + Rewards WASM│  Rust · soroban-sdk 22
└─────────────────────────────┘
```

### How It Works

1. A **group owner** creates a group on-chain, choosing a name and the Stellar asset used for contributions. The owner is automatically the first member.
2. The owner **adds wallet addresses** as members. Only members can interact with pools inside the group.
3. Any member can **create a pool** with a name. The wallet that creates the pool becomes its **organizer**.
4. Group members **deposit** tokens into a pool. The core contract keeps pooled funds in escrow and forwards contribution data to the rewards contract.
5. The rewards contract tracks **claimable reward tokens** for each contributor. Claiming rewards calls back into Talambag core to verify group membership before minting tokens.
6. The pool **organizer** can **withdraw** any amount to any Stellar address they choose.
7. Both contracts emit **on-chain events** that a separate indexer normalizes into Neon PostgreSQL and streams to the frontend in real time.

### Problem It Solves

Small communities often raise money for emergency support, medical needs, gifts, shared projects, or mutual aid. The usual workflow is fragile: one person runs a chat group, people send money manually, and someone maintains a private spreadsheet or screenshot list that members have to trust blindly.

Talambag gives the group a smart-contract-backed source of truth. Balances are held by the contract rather than any individual, every transaction is publicly auditable, and role enforcement (who can add members, who can withdraw) is guaranteed by on-chain code rather by social trust alone.

---

## Project Structure

```
Stellar-Project/
├── contracts/                  # Soroban smart contracts (Rust workspace)
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs              # Talambag core contract logic
│       └── test.rs             # Cross-contract unit tests
│   └── rewards/
│       ├── Cargo.toml
│       └── src/
│           └── lib.rs          # Reward/governance token contract
└── frontend/                   # Next.js 15 web application
    ├── package.json
    ├── next.config.ts
    ├── tsconfig.json
    └── src/
        ├── app/
        │   ├── layout.tsx              # Root layout with WalletProvider
        │   ├── page.tsx                # Dashboard — lists all groups
        │   ├── groups/
        │   │   └── [groupId]/
        │   │       ├── page.tsx        # Group detail — member & pool management
        │   │       └── pools/
        │   │           └── [poolId]/
        │   │               └── page.tsx  # Pool detail — deposit, withdraw, events
        │   └── api/
        │       └── contract-events/
        │           └── route.ts        # Server-side proxy to Stellar Expert events API
        ├── components/
        │   ├── navbar.tsx              # Top navigation bar
        │   ├── layout-shell.tsx        # Wraps pages with WalletProvider + Navbar
        │   ├── wallet-kit-button.tsx   # Connect/disconnect wallet button + dropdown
        │   ├── wallet-status-notice.tsx # Wrong-network and wallet-error banners
        │   ├── feedback-banner.tsx     # Transaction state feedback (signing → success)
        │   ├── search-bar.tsx          # Reusable search input
        │   ├── modal.tsx               # Generic modal shell
        │   ├── create-group-modal.tsx  # Form: create a new group
        │   ├── add-member-modal.tsx    # Form: add a wallet to a group
        │   ├── create-pool-modal.tsx   # Form: create a pool inside a group
        │   └── deposit-modal.tsx       # Form: deposit tokens into a pool
        ├── contexts/
        │   └── wallet-context.tsx      # React context providing wallet state globally
        ├── hooks/
        │   └── use-wallet-kit.ts       # Wallet Kit state machine + event subscription
        └── lib/
            ├── config.ts           # App-wide config from environment variables
            ├── talambag-client.ts  # All Soroban RPC calls and signing logic
          ├── rewards-client.ts   # Reward token reads and claim actions
          ├── realtime-events.ts  # Indexer-backed event history + SSE helpers
            ├── wallet-kit.ts       # Stellar Wallets Kit initialization and helpers
            ├── types.ts            # Shared TypeScript types
            ├── format.ts           # Amount formatting and address shortening
            ├── validators.ts       # Stellar address and text validation
            └── cache.ts            # 30-second TTL in-memory cache for RPC reads
    └── indexer/                    # Realtime event ingestion service
      ├── package.json
      ├── tsconfig.json
      ├── .env.example
      └── src/
        ├── server.ts           # HTTP API + SSE stream
        ├── indexer.ts          # RPC polling loop
        ├── normalize-event.ts  # Soroban event decoding
        ├── db.ts               # Neon/Postgres persistence
        └── config.ts           # Environment parsing
```

---

## Smart Contract Reference

The contract (`contracts/src/lib.rs`) is written in Rust using [soroban-sdk 22](https://docs.rs/soroban-sdk).

### Data Structures

#### `Group`

| Field | Type | Description |
|---|---|---|
| `id` | `u32` | Auto-incremented group identifier |
| `name` | `String` | Human-readable group name (required, non-empty) |
| `owner` | `Address` | Wallet that created the group; controls membership |
| `asset` | `Address` | Stellar asset contract used for all deposits and withdrawals |
| `member_count` | `u32` | Number of registered member wallets |
| `next_pool_id` | `u32` | Auto-increment counter for pool IDs within this group |

#### `Pool`

| Field | Type | Description |
|---|---|---|
| `id` | `u32` | Pool identifier (scoped to its group) |
| `group_id` | `u32` | Parent group |
| `name` | `String` | Human-readable pool name (required, non-empty) |
| `organizer` | `Address` | Wallet that created the pool; the only wallet that can withdraw |
| `balance` | `i128` | Current on-chain token balance held by the contract |

### Storage Layout (`DataKey`)

| Variant | Description |
|---|---|
| `NextGroupId` | Global counter for the next group ID |
| `Group(u32)` | Stores a `Group` struct by group ID |
| `GroupMember(u32, Address)` | Boolean flag indicating whether a wallet is a group member |
| `Pool(u32, u32)` | Stores a `Pool` struct keyed by `(group_id, pool_id)` |

### Write Functions (require wallet authorization)

| Function | Auth Required | Description |
|---|---|---|
| `create_group(owner, name, asset)` | `owner` | Creates a new group. Owner is automatically added as the first member. Returns the new `group_id`. |
| `add_member(owner, group_id, member)` | `owner` | Adds a wallet address as a group member. Only the group owner can call this. |
| `create_pool(creator, group_id, name)` | `creator` | Creates a pool inside a group. Caller must be a group member and becomes the pool organizer. Returns the new `pool_id`. |
| `deposit(from, group_id, pool_id, amount)` | `from` | Transfers `amount` tokens from `from` into the pool. Caller must be a group member. Emits a `deposit` event. |
| `withdraw(organizer, group_id, pool_id, to, amount)` | `organizer` | Transfers `amount` tokens from the pool to `to`. Only the pool organizer can call this. Emits a `withdraw` event. |

### Read Functions (no authorization required)

| Function | Returns | Description |
|---|---|---|
| `group_count(env)` | `u32` | Total number of groups created |
| `group(env, group_id)` | `Result<Group, Error>` | Fetches a group by ID |
| `pool(env, group_id, pool_id)` | `Result<Pool, Error>` | Fetches a pool by group and pool ID |
| `is_member(env, group_id, member)` | `Result<bool, Error>` | Checks whether a wallet is a member of the group |
| `pool_balance(env, group_id, pool_id)` | `Result<i128, Error>` | Returns the current token balance of a pool |

### Contract Errors

| Code | Variant | Triggered When |
|---|---|---|
| `1` | `Unauthorized` | Caller is not the group owner or pool organizer |
| `2` | `AmountMustBePositive` | Deposit or withdrawal amount is zero or negative |
| `3` | `GroupNotFound` | The requested group ID does not exist |
| `4` | `PoolNotFound` | The requested pool ID does not exist within the group |
| `5` | `AlreadyGroupMember` | The wallet being added is already a member |
| `6` | `NotGroupMember` | Caller is not a member of the group |
| `7` | `InsufficientPoolBalance` | Pool does not have enough balance to fulfill the withdrawal |
| `8` | `NameRequired` | Group or pool name is empty |

### On-Chain Events

| Topic | Data | Emitted By |
|---|---|---|
| `("deposit", group_id, pool_id)` | `(from: Address, amount: i128)` | `deposit` |
| `("withdraw", group_id, pool_id)` | `(organizer: Address, to: Address, amount: i128)` | `withdraw` |

---

## Frontend Reference

The frontend is a **Next.js 15** application written in TypeScript with React 19.

### Key Dependencies

| Package | Version | Purpose |
|---|---|---|
| `@stellar/stellar-sdk` | `^14.6.1` | Building, simulating, and submitting Soroban transactions |
| `@creit-tech/stellar-wallets-kit` | `^2.1.0` | Multi-wallet connection modal (Freighter, xBull, etc.) |
| `next` | `^15.5.2` | SSR/SSG framework and API routes |
| `react` | `^19.1.1` | UI library |
| `typescript` | `^5.9.2` | Static typing |

### Pages

| Route | File | Description |
|---|---|---|
| `/` | `src/app/page.tsx` | Dashboard: total group count, wallet status, XLM balance, searchable group list, create-group button |
| `/groups/[groupId]` | `src/app/groups/[groupId]/page.tsx` | Group detail: member count, pool list, add-member (owner only), create-pool (members only) |
| `/groups/[groupId]/pools/[poolId]` | `src/app/groups/[groupId]/pools/[poolId]/page.tsx` | Pool detail: balance, deposit button (members), withdraw form (organizer only), event history |

### API Routes

| Route | File | Description |
|---|---|---|
| `GET /api/contract-events` | `src/app/api/contract-events/route.ts` | Server-side proxy to the Stellar Expert events API. Fetches the last 200 events for the contract with 30-second Next.js cache revalidation. Avoids exposing upstream API endpoints to the browser. |

### Core Library Modules (`src/lib/`)

#### `talambag-client.ts`

All Soroban contract interactions live here.

| Function | Description |
|---|---|
| `createGroup(owner, name, asset, onSubmitting)` | Signs and submits `create_group`. Returns `{ hash, groupId }`. |
| `addGroupMember(owner, groupId, member, onSubmitting)` | Signs and submits `add_member`. Returns `{ hash }`. |
| `createPool(creator, groupId, name, onSubmitting)` | Signs and submits `create_pool`. Returns `{ hash, poolId }`. |
| `depositToPool(from, groupId, poolId, amount, onSubmitting)` | Signs and submits `deposit`. Returns `{ hash }`. |
| `withdrawFromPool(organizer, groupId, poolId, to, amount, onSubmitting)` | Signs and submits `withdraw`. Returns `{ hash }`. |
| `readGroupCount()` | Simulates `group_count` and returns a `number`. |
| `listGroups()` | Reads groups 1 through `group_count` in parallel. Returns `GroupSummary[]`. |
| `listPools(groupId, nextPoolId)` | Reads pools 1 through `nextPoolId - 1` in parallel. Returns `PoolSummary[]`. |
| `getContractSnapshot(groupId, poolId, walletAddress)` | Reads group, pool, and membership in one batch. Used on page load. |
| `fetchPoolEvents(groupId, poolId)` | Calls `/api/contract-events`, filters by pool, and returns `PoolEvent[]`. |
| `classifyError(error)` | Classifies any error as `wallet_not_found`, `rejected`, `insufficient_balance`, or `other`. |

#### `wallet-kit.ts`

Wraps `@creit-tech/stellar-wallets-kit`. Handles lazy initialization, themed modal, event subscription, address reading, XLM balance fetching, and network passphrase verification.

| Function | Description |
|---|---|
| `ensureWalletKitInitialized()` | Lazily imports and initializes the Wallet Kit singleton. |
| `connectWalletWithKit()` | Opens the wallet selection modal and returns a `WalletSnapshot`. |
| `disconnectActiveWallet()` | Disconnects the current wallet. |
| `readWalletSnapshot()` | Reads address, network, XLM balance, and expected-network flag. |
| `signWithActiveWallet(xdr)` | Prompts the connected wallet to sign a transaction XDR. |
| `subscribeWalletKitEvents(handler)` | Subscribes to `WalletSelected`, `StateUpdated`, and `Disconnected` events. |

#### `cache.ts`

Simple TTL-based in-memory cache (default 30 seconds) that deduplicates repeated RPC reads within the same page session. Keys are invalidated after successful write transactions to keep displayed data fresh.

#### `config.ts`

Reads all `NEXT_PUBLIC_*` environment variables and exports a typed `appConfig` object. Also exports `getExpectedNetworkPassphrase()` and `hasRequiredConfig()` for use across the app.

#### `format.ts`

| Function | Description |
|---|---|
| `parseAmountToInt(amount, decimals)` | Converts a human-readable decimal string to the integer the contract expects (e.g. `"1.5"` with 7 decimals → `15_000_000n`). |
| `formatAmount(value, decimals)` | Converts a contract integer back to a display string with trailing zeros trimmed. |
| `shortenAddress(address, size?)` | Returns `GABCD...WXYZ` abbreviated form. |
| `formatXlmBalance(raw)` | Formats a raw XLM stroop balance (7 decimal integer) to a human-readable decimal string. |

#### `validators.ts`

| Function | Description |
|---|---|
| `isValidStellarAddress(value)` | Returns `true` if the string is a valid Stellar `Address`. |
| `requireText(value, label)` | Throws if the value is empty; otherwise returns the trimmed string. |

#### `types.ts`

Shared TypeScript types used across the application:

| Type | Description |
|---|---|
| `GroupSummary` | Data shape for a group returned from the contract |
| `PoolSummary` | Data shape for a pool returned from the contract |
| `PoolEvent` | A deposit or withdrawal event from the Stellar Expert API |
| `TxFeedback` | Tracks the UI state of a transaction (`idle \| signing \| submitting \| success \| rejected \| error`) |
| `WalletSnapshot` | Full wallet connection state snapshot |
| `WalletErrorKind` | Error classification: `wallet_not_found \| rejected \| insufficient_balance \| other` |

### State Management

There is no external state library. State flows through:

1. **`WalletContext`** (`contexts/wallet-context.tsx`) — A React context wrapping `useWalletKit` that provides `wallet`, `connectWallet`, `disconnectWallet`, and `refreshWallet` to the entire component tree.
2. **Page-level `useState`** — Each page manages its own data (group, pools, events, feedback) with `useCallback`-wrapped loaders triggered by `useEffect`.
3. **`TxFeedback`** — A single state object drives the `FeedbackBanner` component, showing the current transaction phase or result.

### Transaction Flow

Every write action follows the same pattern:

```
User clicks action button
  → Modal opens (or inline form activates)
    → handleSubmit called
      → feedback: "signing"     ← waiting for wallet approval
        → wallet signs XDR via stellar-wallets-kit
          → feedback: "submitting"  ← tx broadcast to network
            → contract simulated, assembled, submitted via Soroban RPC
              → feedback: "success" | "rejected" | "error"
                → page data refreshed
```

---

## Project Setup Guide (Local Development)

### Prerequisites

| Tool | Minimum Version | Install |
|---|---|---|
| Rust (stable) | 1.75+ | [rustup.rs](https://rustup.rs) |
| Stellar CLI | latest | [docs.stellar.org/tools/cli](https://developers.stellar.org/docs/tools/developer-tools/cli/install-cli) |
| Node.js | 18+ | [nodejs.org](https://nodejs.org) |
| pnpm | 10+ | `npm install -g pnpm` |
| Freighter (or another Stellar wallet) | latest | [freighter.app](https://freighter.app) |

Verify your environment:

```bash
rustc --version
cargo --version
stellar --version
node --version
pnpm --version
```

---

### Step 1 — Clone the repository

```bash
git clone https://github.com/Carts1024/Stellar-Project.git
cd Stellar-Project
```

### Step 2 — Install frontend dependencies

```bash
cd frontend
pnpm install
cd ..
```

### Step 3 — Build and test the smart contract

```bash
cd contracts
cargo test
stellar contract build
cd ..
```

Expected WASM output:

```
contracts/target/wasm32v1-none/release/talambag.wasm
```

> **Important:** Always use `stellar contract build`. Do not use `cargo build --target wasm32-unknown-unknown` — that produces an incompatible artifact.

### Step 4 — (Optional) Deploy your own contract to Testnet

```bash
stellar contract deploy \
  --wasm contracts/target/wasm32v1-none/release/talambag.wasm \
  --source <YOUR_STELLAR_SECRET_KEY_OR_ALIAS> \
  --network testnet
```

The command returns a contract address (`CD...`). Use it as `NEXT_PUBLIC_TALAMBAG_CONTRACT_ID`.

To get a Stellar Asset Contract address for native XLM on testnet:

```bash
stellar contract id asset \
  --network testnet \
  --asset native
```

Use the returned address as `NEXT_PUBLIC_TALAMBAG_ASSET_ADDRESS`.

### Step 5 — Configure frontend environment variables

```bash
cd frontend
cp .env.example .env.local
```

Edit `frontend/.env.local`:

```env
NEXT_PUBLIC_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_STELLAR_NETWORK=TESTNET
NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
NEXT_PUBLIC_TALAMBAG_CONTRACT_ID=CD44KFLGE2ISRUD6Q5BZTX3NI4ILTD5QUIWIED255UJDRAFJSR7GYIJE
NEXT_PUBLIC_TALAMBAG_REWARDS_CONTRACT_ID=<DEPLOYED_REWARDS_CONTRACT_ID>
NEXT_PUBLIC_TALAMBAG_ASSET_ADDRESS=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
NEXT_PUBLIC_TALAMBAG_ASSET_CODE=XLM
NEXT_PUBLIC_TALAMBAG_ASSET_DECIMALS=7
NEXT_PUBLIC_STELLAR_EXPLORER_URL=https://stellar.expert/explorer/testnet
NEXT_PUBLIC_STELLAR_READ_ADDRESS=<FUNDED_TESTNET_WALLET_ADDRESS>
NEXT_PUBLIC_TALAMBAG_INDEXER_URL=http://localhost:8080
```

### Step 6 — Configure and start the realtime indexer

```bash
cd indexer
cp .env.example .env
pnpm install
pnpm dev
```

Populate `indexer/.env` with your Neon connection string, Talambag core contract ID, rewards contract ID, and the RPC endpoint you want to poll.

### Step 7 — Start the development server

```bash
cd frontend
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_STELLAR_RPC_URL` | Yes | Soroban RPC endpoint. Defaults to `https://soroban-testnet.stellar.org`. |
| `NEXT_PUBLIC_STELLAR_NETWORK` | Yes | Network name: `TESTNET` or `PUBLIC`. |
| `NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE` | Yes | Network passphrase string. |
| `NEXT_PUBLIC_TALAMBAG_CONTRACT_ID` | Yes | The deployed Soroban contract address. |
| `NEXT_PUBLIC_TALAMBAG_REWARDS_CONTRACT_ID` | Yes | The deployed Soroban rewards token contract address. |
| `NEXT_PUBLIC_TALAMBAG_ASSET_ADDRESS` | Yes | Stellar asset contract address used for contributions. |
| `NEXT_PUBLIC_TALAMBAG_ASSET_CODE` | Yes | Human-readable asset code, e.g. `XLM`. |
| `NEXT_PUBLIC_TALAMBAG_ASSET_DECIMALS` | Yes | Decimal places for the asset (`7` for XLM). |
| `NEXT_PUBLIC_STELLAR_EXPLORER_URL` | Yes | Base URL for Stellar Expert, used for transaction and contract links. |
| `NEXT_PUBLIC_STELLAR_READ_ADDRESS` | Yes | A funded testnet wallet address used as the fee source for read-only simulations. |
| `NEXT_PUBLIC_STELLAR_HORIZON_URL` | No | Horizon server URL for XLM balance lookups. Defaults to `https://horizon-testnet.stellar.org`. |
| `NEXT_PUBLIC_TALAMBAG_INDEXER_URL` | Yes for realtime streaming | Base URL of the separate Talambag indexer service, e.g. `http://localhost:8080`. |

### Indexer Variables

| Variable | Required | Description |
|---|---|---|
| `INDEXER_DATABASE_URL` | Yes | Neon Postgres connection string used to persist cursors and normalized events. |
| `INDEXER_STELLAR_RPC_URL` | Yes | Stellar RPC endpoint that supports `getEvents`. |
| `INDEXER_CORE_CONTRACT_ID` | Yes | Talambag core contract ID to index. |
| `INDEXER_REWARD_CONTRACT_ID` | Yes | Rewards contract ID to index. |
| `INDEXER_ALLOWED_ORIGIN` | Yes | CORS origin allowed to consume the SSE stream. |
| `INDEXER_POLL_INTERVAL_MS` | No | Polling cadence in milliseconds. Defaults to `4000`. |
| `INDEXER_BATCH_LIMIT` | No | Maximum events to fetch per `getEvents` request. Defaults to `200`. |
| `INDEXER_START_LEDGER` | No | Optional ledger sequence to use for initial backfill. |

---

## Running Quality Checks

From `frontend/`:

```bash
# Type-check without emitting files
pnpm exec tsc --noEmit

# Lint all source files
pnpm lint

# Production build (catches build-time errors)
pnpm build
```

From `indexer/`:

```bash
# Install dependencies once
pnpm install

# Strict type-check
pnpm run typecheck

# Production build
pnpm run build
```

From `contracts/`:

```bash
# Run all Soroban unit tests
cargo test --workspace
```

---

## Deploying to Testnet

### Smart Contracts

```bash
# Build the core contract
cd contracts
stellar contract build

# Build the rewards contract
cd rewards
stellar contract build
```

The GitHub Actions workflow at `.github/workflows/ci-and-deploy.yml` runs on every pull request and on every push to `main`. On `main`, after all contract, frontend, and indexer checks pass, it automatically:

1. deploys a fresh Talambag core contract to testnet,
2. deploys a fresh rewards contract to testnet,
3. links both contracts with `set_rewards_contract` and `set_core_contract`, and
4. uploads a `deployment.env` artifact containing the new contract IDs.

Configure these GitHub repository secrets before enabling automatic deployment:

- `STELLAR_TESTNET_SECRET_KEY`
- `STELLAR_TESTNET_ADMIN_ADDRESS`

### Frontend

The frontend is deployed on [Vercel](https://vercel.com). Push to `main` to trigger a production deployment. Set all `NEXT_PUBLIC_*` environment variables in the Vercel project settings before deploying, including the core contract ID, rewards contract ID, and indexer URL.

---

## CLI Examples

The following examples use the Stellar CLI to invoke the deployed contract directly on testnet.

**Create a group:**

```bash
stellar contract invoke \
  --id CD44KFLGE2ISRUD6Q5BZTX3NI4ILTD5QUIWIED255UJDRAFJSR7GYIJE \
  --source <GROUP_OWNER_KEY_ALIAS> \
  --network testnet \
  -- create_group \
  --owner <GROUP_OWNER_ADDRESS> \
  --name "Community Aid" \
  --asset CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

**Add a member:**

```bash
stellar contract invoke \
  --id CD44KFLGE2ISRUD6Q5BZTX3NI4ILTD5QUIWIED255UJDRAFJSR7GYIJE \
  --source <GROUP_OWNER_KEY_ALIAS> \
  --network testnet \
  -- add_member \
  --owner <GROUP_OWNER_ADDRESS> \
  --group_id 1 \
  --member <MEMBER_ADDRESS>
```

**Create a pool:**

```bash
stellar contract invoke \
  --id CD44KFLGE2ISRUD6Q5BZTX3NI4ILTD5QUIWIED255UJDRAFJSR7GYIJE \
  --source <MEMBER_KEY_ALIAS> \
  --network testnet \
  -- create_pool \
  --creator <MEMBER_ADDRESS> \
  --group_id 1 \
  --name "Emergency Support"
```

**Deposit (amount in stroops — 1 XLM = 10,000,000):**

```bash
stellar contract invoke \
  --id CD44KFLGE2ISRUD6Q5BZTX3NI4ILTD5QUIWIED255UJDRAFJSR7GYIJE \
  --source <CONTRIBUTOR_KEY_ALIAS> \
  --network testnet \
  -- deposit \
  --from <CONTRIBUTOR_ADDRESS> \
  --group_id 1 \
  --pool_id 1 \
  --amount 10000000
```

**Withdraw:**

```bash
stellar contract invoke \
  --id CD44KFLGE2ISRUD6Q5BZTX3NI4ILTD5QUIWIED255UJDRAFJSR7GYIJE \
  --source <ORGANIZER_KEY_ALIAS> \
  --network testnet \
  -- withdraw \
  --organizer <ORGANIZER_ADDRESS> \
  --group_id 1 \
  --pool_id 1 \
  --to <RECIPIENT_ADDRESS> \
  --amount 5000000
```

**Read a group:**

```bash
stellar contract invoke \
  --id CD44KFLGE2ISRUD6Q5BZTX3NI4ILTD5QUIWIED255UJDRAFJSR7GYIJE \
  --source <ANY_KEY_ALIAS> \
  --network testnet \
  -- group \
  --group_id 1
```

**Read a pool:**

```bash
stellar contract invoke \
  --id CD44KFLGE2ISRUD6Q5BZTX3NI4ILTD5QUIWIED255UJDRAFJSR7GYIJE \
  --source <ANY_KEY_ALIAS> \
  --network testnet \
  -- pool \
  --group_id 1 \
  --pool_id 1
```

---

## Future Scope

Planned next steps for Talambag:

- List groups and pools directly in the UI instead of loading by numeric ID
- Support richer role management (e.g. co-organizers, read-only viewers)
- Show full contribution history and event timeline per pool
- Improve explorer deep links and display formatted transaction receipts
- Add end-to-end browser tests with Playwright
- Add analytics dashboards for pool health and activity trends
- Add exportable contribution reports for community treasurers
- Support mainnet deployment and real-asset contributions
