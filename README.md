# Talambag

[![CI And Testnet Deploy](https://github.com/Carts1024/Stellar-Project/actions/workflows/ci-and-deploy.yml/badge.svg?branch=main)](https://github.com/Carts1024/Stellar-Project/actions/workflows/ci-and-deploy.yml)

**Talambag** is a portmanteau of *Tala* (Star/Stellar) and *Ambag* (Contribution) — literally meaning **"Stellar Contribution"**. It is a Soroban-powered community pooling application built on the Stellar blockchain. It helps real-world groups — families, organizations, and OFW communities — manage shared contributions with on-chain transparency that screenshot-based payment coordination simply cannot provide.

Instead of collecting money through opaque chat threads and manually tracking who paid, Talambag records group membership, pool creation, contributions, and organizer withdrawals entirely on-chain.

---

## 📖 Table of Contents

- [Architecture Overview](#architecture-overview)
- [Key Features](#key-features)
- [Project Structure](#project-structure)
- [Smart Contracts Reference](#smart-contracts-reference)
- [Frontend architecture & PWA Strategy](#frontend-architecture--pwa-strategy)
- [Real-time Indexer](#real-time-indexer)
- [Project Setup Guide (Local Development)](#project-setup-guide-local-development)
- [Visuals & Demo](#visuals--demo)

---

## 🏗 Architecture Overview

Talambag leverages a modern, decoupled architecture:
1. **Smart Contracts (Soroban/Rust):** Enforces group/pool logic, handles contributions, manages authorization, and issues reward tokens via a two-contract architecture (Core + Rewards).
2. **Real-time Indexer (Node.js/Prisma):** Subscribes to the Stellar RPC to ingest contract events into a PostgreSQL database, broadcasting them to the frontend via Server-Sent Events (SSE). 
3. **Progressive Web App (Next.js/React):** A highly responsive mobile-first frontend running on Next.js 15.5 that utilizes custom Service Workers (SW), localStorage cache, and wallet state snapshots to provide robust offline reading capabilities.

---

## ✨ Key Features

### 1. Community Pooling (Core)
- **Groups & Members:** Create and join distinct groups identified on-chain.
- **Contribution Pools:** Group members can create time-boxed or goal-oriented pools.
- **Deposits & Withdrawals:** Verifiable contributions recorded on-chain using Soroban smart contracts.

### 2. Rewards System (Dual-Contract Design)
- **Contribution Incentives:** The `talambag_rewards` contract is linked to the core contract. When a member contributes in the core contract, it natively communicates with the rewards contract to grant `PENDING` reward tokens based on the contribution value.
- **Auto-Syncing:** If a group was created prior to the rewards contract being linked, the records are seamlessly auto-synced when the first post-link deposit is routed.

### 3. Real-Time Event Syncing
- **Centralized Source of Truth:** Instead of relying on manual refresh buttons, the frontend connects to the **Indexer** over SSE (`/events/stream`). 
- **Graceful Cache Invalidation:** The frontend listens to contract events (`deposit`, `withdraw`, `pool_created`, `member_added`) from the indexer and uses them purely as cache invalidation signals, prompting an immediate fallback to querying the on-chain single source of truth.

### 4. Progressive Web App (PWA) & Offline Mode
- **No Third-Party PWA Libraries:** Fully custom-built PWA lifecycle using `public/sw.js` and App route manifest generation.
- **Read-Only Offline Access:** Using our custom persistent caching abstraction (`browser-storage.ts`, `cache.ts`), cached read operations are surfaced to the user.
- **Smart Wallet Persistence:** Snapshotting current connect wallets so the dashboard and profile screens load safely when offline. Actions requiring a signature (creating pools, depositing) are disabled intelligently alongside a dynamic connectivity banner.

---

## 🗂 Project Structure

```text
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

## 📜 Smart Contracts Reference

### Core Contract (`TalambagContract`)
- **Groups:** Stores an atomic counter. Allows the creation of distinct group instances.
- **Pools:** Bound to an individual group. Keeps track of the balance.
- **Auth:** Standard `.require_auth()` logic bound to the Group Owner (for adding members) or Pool Organizer (for withdrawals).
- **Integration:** Exposes `set_rewards_contract` for inter-contract linkages. 

### Rewards Contract (`RewardTokenContract`)
- Maintains balances and token supply for local contributions (`DataKey::PendingReward` / `DataKey::GroupTotalContributed`).
- Allows users to claim their generated pending tokens based on the internal parameters.

---

## 📡 Frontend Architecture & PWA Strategy

The web UI is geared around mobile environments. By eliminating reliance on generic `next-pwa` plugins, the configuration maintains full control over what is cached.
- **Persistence Layer:** Contract read queries proxy through a cache layer. 
- **Offline Recon:** `use-online-status.ts` intelligently flips the UI to read-only mode, showing a fallback status banner so users never hit a generic blank screen. Real-time streams are explicitly paused on disconnect and seamlessly resumed when returning online.

---

## ⚡️ Real-time Indexer

The indexer is a standalone Node.js daemon designed to sit between the stellar RPC and the frontend.
- **Prisma & Postgres:** Uses Prisma schema and Postgres (`@prisma/adapter-pg` supported) to sink `getEvents` from the RPC node efficiently in bounded batch intervals.
- **Streaming:** The `/events/stream` HTTP endpoint allows fine-grained, filtered subscription to particular contracts and topics, eliminating the need to poll the RPC from the frontend.

---

## 🚀 Project Setup Guide (Local Development)

### 1. Prerequisites
- **Rust / WebAssembly target:** `rustup target add wasm32-unknown-unknown`
- **Stellar CLI:** Used for Soroban builds and tests.
- **Node.js 22+ & pnpm:** `npm install -g pnpm`
- **Local Postgres:** E.g., `docker run --name talambag-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres`
- **Stellar Quickstart Container** (for a local network)

### 2. Smart Contracts
```bash
cd contracts
stellar contract build
# Runs tests across core and rewards module
cargo test
```
*Note: Deploy both the core and rewards contracts using `stellar contract deploy` on your target local/testnet, then link them with the core contract's `set_rewards_contract` endpoint.*

### 3. Indexer Configuration
```bash
cd indexer
pnpm install
```
Ensure your database is running and generate Prisma client files:
```bash
export INDEXER_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/talambag"
export INDEXER_STELLAR_RPC_URL="http://localhost:8000/rpc" # Assuming local quickstart
pnpm run db:generate
pnpm dev
```

### 4. Frontend Launch
```bash
cd frontend
pnpm install
# Set required env vars inside .env corresponding to your deployed contract IDs & Indexer URL
pnpm dev
```
Navigate to `http://localhost:3000` to interact with the Next.js app!

---

## 🎨 Visuals & Demo

**Live Demo**: [https://talambag.vercel.app/](https://talambag.vercel.app/)

**Platform Functionality:**

| Feature | Screenshot Preview |
|---|---|
| Dashboard Overview | ![Dashboard](frontend/public/screenshots/dashboard-overview.png) |
| Offline / Wallet Disconnected | ![Disconnected](frontend/public/screenshots/wallet-disconnected.png) |
| Mobile Create Group | ![Mobile Create](frontend/public/screenshots/mobile-create-new-group.png) |
| Group Pool Layout | ![Pools Layout](frontend/public/screenshots/pool-page.png) |
| Pool Deposits | ![Deposits](frontend/public/screenshots/add-deposit.png) |
| Wallet Providers | ![Wallets](frontend/public/screenshots/wallets.png) |

### Mobile Responsive

![Talambag Mobile Dashboard](frontend/public/screenshots/mobile-dashboard.png)

![Talambag Mobile Create Group](frontend/public/screenshots/mobile-create-new-group.png)

![Talambag Mobile Groups](frontend/public/screenshots/mobile-groups.png)

![Talambag Mobile Pools](frontend/public/screenshots/mobile-pools.png)

![Talambag Mobile Deposit](frontend/public/screenshots/mobile-deposit.png)

### Transaction Feedback

![Transaction Feedback](frontend/public/screenshots/transaction-feedback.png)

### Successful Testnet Transaction

![Successful Testnet Transaction](frontend/public/screenshots/successful-transaction.png)

---

## CI/CD Pipeline

![CI/CD Pipeline Success](frontend/public/screenshots/ci-cd-success.png)

---

## Smart Contract

| Detail | Value |
|---|---|
| **Core Contract Address** | `CC33ZSM7OC3ZGIGWQ7ZRSTEI5XNQJXR42Q67SZ5UAIXPPG5O3TAE4NRY` |
| **Rewards Contract Address** | `CDLGOZDVXN7EGXDLLQ7CGGQQCLRUPA3CVIDICRJIK54FS4KBRYAREBU5` |
| **Contribution Asset (SAC) Address** | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| **Rewards Token Address** | `CALO6BXM5AIJGQIGAAC236AUJSNYRYEBAMP5GXRWQTGZXPEZ52UK3RPW` |
| **Network** | Stellar Testnet |
| **Core Contract Explorer** | [View Contract](https://stellar.expert/explorer/testnet/contract/CCMTJRJSJXN2ZEWE7FPNXFIYCJYWS4C7BRCFHQGDSJDHVMEJSN755L2D) |
| **Rewards Contract Explorer** | [View Contract](https://stellar.expert/explorer/testnet/contract/CDLGOZDVXN7EGXDLLQ7CGGQQCLRUPA3CVIDICRJIK54FS4KBRYAREBU5) |
| **Contribution Asset Explorer** | [View Contract](https://stellar.expert/explorer/testnet/contract/CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC) |
| **Sample Inter-Contract Transaction Hash (Linking Core Contract to Rewards Contract)** | [`63a9457f...`](https://stellar.expert/explorer/testnet/tx/b639784abf16b3e04214e2468d63f519b93f2284ce24bc6c32d6cfc78d545cab) |
| **Sample Inter-Contract Transaction Hash (Linking Rewards Contract to Core Contract)** | [`63a9457f...`](https://stellar.expert/explorer/testnet/tx/14344aaf8c692ad54a6cae16d860fb4bea7dd8984750ca3f50a55f65d3267341) |

Pools are stored inside the core contract; there is no separate pool contract address.

![Stellar Expert Contract](frontend/public/screenshots/talambag-contract.png)

---

## Architecture Overview

Talambag is split into three layers:

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

## Implemented Features

- On-chain group, member, pool, deposit, and organizer-withdraw workflows powered by the Talambag core Soroban contract.
- Separate rewards contract that tracks pending TLMBG rewards, claimed balances, per-group contribution totals, and global token supply.
- Cross-contract rewards accrual: every successful deposit forwards contribution data from the core contract into the rewards contract.
- Admin-controlled contract binding through `set_rewards_contract` on the core contract and `set_core_contract` on the rewards contract.
- Automatic rewards registration for newly created groups, plus first-post-link synchronization for older groups that were created before rewards were linked.
- Pool-page rewards dashboard showing pending claim, wallet balance, reward-weighted contribution total, and total TLMBG supply.
- Claim flow that verifies active Talambag membership before minting TLMBG to the connected wallet.
- Realtime indexer support for both core and rewards contracts so frontend reads and event streams stay in sync with on-chain activity.


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
| `Admin` | Admin address that can link the rewards contract |
| `NextGroupId` | Global counter for the next group ID |
| `RewardsContract` | Stores the linked rewards contract address |
| `Group(u32)` | Stores a `Group` struct by group ID |
| `GroupMember(u32, Address)` | Boolean flag indicating whether a wallet is a group member |
| `Pool(u32, u32)` | Stores a `Pool` struct keyed by `(group_id, pool_id)` |

### Write Functions (require wallet authorization)

| Function | Auth Required | Description |
|---|---|---|
| `set_rewards_contract(admin, rewards_contract)` | `admin` | Links the core contract to the deployed rewards contract so deposits can forward contribution data. |
| `create_group(owner, name, asset)` | `owner` | Creates a new group. Owner is automatically added as the first member. Returns the new `group_id`. |
| `add_member(owner, group_id, member)` | `owner` | Adds a wallet address as a group member. Only the group owner can call this. |
| `create_pool(creator, group_id, name)` | `creator` | Creates a pool inside a group. Caller must be a group member and becomes the pool organizer. Returns the new `pool_id`. |
| `deposit(from, group_id, pool_id, amount)` | `from` | Transfers `amount` tokens from `from` into the pool. Caller must be a group member. Emits a `deposit` event. |
| `withdraw(organizer, group_id, pool_id, to, amount)` | `organizer` | Transfers `amount` tokens from the pool to `to`. Only the pool organizer can call this. Emits a `withdraw` event. |

### Read Functions (no authorization required)

| Function | Returns | Description |
|---|---|---|
| `rewards_contract(env)` | `Option<Address>` | Returns the currently linked rewards contract, if configured. |
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
| `9` | `ArithmeticOverflow` | Arithmetic update exceeded the supported integer range |

### On-Chain Events

| Topic | Data | Emitted By |
|---|---|---|
| `("rewards_linked")` | `rewards_contract: Address` | `set_rewards_contract` |
| `("deposit", group_id, pool_id)` | `(from: Address, amount: i128)` | `deposit` |
| `("withdraw", group_id, pool_id)` | `(organizer: Address, to: Address, amount: i128)` | `withdraw` |

### Rewards Contract Reference

The rewards contract (`contracts/rewards/src/lib.rs`) stores TLMBG metadata and balances separately from the core pooling logic.

| Function | Description |
|---|---|
| `set_core_contract(admin, core_contract)` | Admin-only binding step that authorizes the Talambag core contract to register groups and record contributions. |
| `is_group_registered(group_id)` | Returns whether a Talambag group has been registered in rewards storage. |
| `metadata()` | Returns the rewards token name, symbol, and decimals. |
| `pending_reward(group_id, owner)` | Returns the wallet's unclaimed TLMBG for a specific group. |
| `contributed_amount(group_id, owner)` | Returns the reward-weighted contributed total for a wallet within a group. |
| `claim_rewards(user, group_id)` | Verifies group membership through Talambag core, mints pending TLMBG, and resets the user's pending balance to zero. |
| `balance(owner)` | Returns the wallet's claimed TLMBG balance. |
| `total_supply()` | Returns the total amount of TLMBG minted across all groups. |

`register_group` and `record_contribution` are intended to be called by the linked Talambag core contract, not by end users directly.

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
| `/groups/[groupId]/pools/[poolId]` | `src/app/groups/[groupId]/pools/[poolId]/page.tsx` | Pool detail: balance, deposit button (members), withdraw form (organizer only), rewards dashboard, claim action, and event history |

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

#### `rewards-client.ts`

All rewards-contract reads and writes live here.

| Function | Description |
|---|---|
| `getRewardSnapshot(walletAddress, groupId)` | Reads rewards metadata, wallet balance, pending reward, contribution total, registration state, and total supply for the current group view. |
| `claimGroupRewards(walletAddress, groupId, onSubmitting)` | Signs and submits `claim_rewards`. Returns the transaction hash and claimed TLMBG amount. |

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

### Step 3 — Build and test both smart contracts

```bash
cd contracts
cargo test --workspace
stellar contract build
cd rewards
stellar contract build
cd ../..
```

Expected WASM output:

```
contracts/target/wasm32v1-none/release/talambag.wasm
contracts/target/wasm32v1-none/release/talambag_rewards.wasm
```

> **Important:** Always use `stellar contract build`. Do not use `cargo build --target wasm32-unknown-unknown` — that produces an incompatible artifact.

> **Workspace note:** `contracts/` is a Cargo workspace, so both WASM artifacts are emitted under `contracts/target/...`.

### Step 4 — (Optional) Deploy and bind the contracts on Testnet

Follow the manual CLI flow in [Deploying to Testnet](#deploying-to-testnet) below. You will need both returned contract IDs, and the binding calls are required before rewards start accruing on deposits.

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

### Railway (Indexer)

The Railway config for the indexer lives at `indexer/railway.toml` (the repo root does not include a Railway config). Set the Railway service root to `indexer/` so Nixpacks uses that file, and configure the runtime secrets (`INDEXER_DATABASE_URL`, `INDEXER_CORE_CONTRACT_ID`, `INDEXER_REWARD_CONTRACT_ID`, etc.) in Railway variables.

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

#### Manual CLI Flow

```bash
cd contracts
stellar contract build
cd rewards
stellar contract build
cd ..

DEPLOYER_ALIAS=<YOUR_STELLAR_KEY_ALIAS>
ADMIN_ADDRESS=<YOUR_PUBLIC_ADMIN_ADDRESS>

CORE_CONTRACT_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/talambag.wasm \
  --source-account "$DEPLOYER_ALIAS" \
  --network testnet \
  -- \
  --admin "$ADMIN_ADDRESS")

REWARDS_CONTRACT_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/talambag_rewards.wasm \
  --source-account "$DEPLOYER_ALIAS" \
  --network testnet \
  -- \
  --admin "$ADMIN_ADDRESS" \
  --name "Talambag Rewards" \
  --symbol "TLMBG" \
  --decimals 7)

stellar contract invoke \
  --id "$CORE_CONTRACT_ID" \
  --source-account "$DEPLOYER_ALIAS" \
  --network testnet \
  -- set_rewards_contract \
  --admin "$ADMIN_ADDRESS" \
  --rewards_contract "$REWARDS_CONTRACT_ID"

stellar contract invoke \
  --id "$REWARDS_CONTRACT_ID" \
  --source-account "$DEPLOYER_ALIAS" \
  --network testnet \
  -- set_core_contract \
  --admin "$ADMIN_ADDRESS" \
  --core_contract "$CORE_CONTRACT_ID"

stellar contract invoke \
  --id "$CORE_CONTRACT_ID" \
  --source-account "$DEPLOYER_ALIAS" \
  --network testnet \
  -- rewards_contract

stellar contract invoke \
  --id "$REWARDS_CONTRACT_ID" \
  --source-account "$DEPLOYER_ALIAS" \
  --network testnet \
  -- core_contract
```

The deploy commands return contract IDs (`CD...`). Use the core ID as `NEXT_PUBLIC_TALAMBAG_CONTRACT_ID` and `INDEXER_CORE_CONTRACT_ID`, and use the rewards ID as `NEXT_PUBLIC_TALAMBAG_REWARDS_CONTRACT_ID` and `INDEXER_REWARD_CONTRACT_ID`.

> **Important:** Binding is not optional in a rewards-enabled deployment. Until `set_rewards_contract` and `set_core_contract` are both called successfully, deposits only affect the core contract and no rewards activity appears on the rewards contract.

> **Legacy group note:** If a group was created before the rewards contract was linked, the first successful post-link deposit will register that group in rewards automatically before recording contribution data.

#### GitHub Actions Flow

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
  --source-account <GROUP_OWNER_KEY_ALIAS> \
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
  --source-account <GROUP_OWNER_KEY_ALIAS> \
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
  --source-account <MEMBER_KEY_ALIAS> \
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
  --source-account <CONTRIBUTOR_KEY_ALIAS> \
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
  --source-account <ORGANIZER_KEY_ALIAS> \
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
  --source-account <ANY_KEY_ALIAS> \
  --network testnet \
  -- group \
  --group_id 1
```

**Read a pool:**

```bash
stellar contract invoke \
  --id CD44KFLGE2ISRUD6Q5BZTX3NI4ILTD5QUIWIED255UJDRAFJSR7GYIJE \
  --source-account <ANY_KEY_ALIAS> \
  --network testnet \
  -- pool \
  --group_id 1 \
  --pool_id 1
```

**Read pending rewards:**

```bash
stellar contract invoke \
  --id <REWARDS_CONTRACT_ID> \
  --source-account <ANY_KEY_ALIAS> \
  --network testnet \
  -- pending_reward \
  --group_id 1 \
  --owner <CONTRIBUTOR_ADDRESS>
```

**Read claimed TLMBG balance:**

```bash
stellar contract invoke \
  --id <REWARDS_CONTRACT_ID> \
  --source-account <ANY_KEY_ALIAS> \
  --network testnet \
  -- balance \
  --owner <CONTRIBUTOR_ADDRESS>
```

**Claim rewards:**

```bash
stellar contract invoke \
  --id <REWARDS_CONTRACT_ID> \
  --source-account <CONTRIBUTOR_KEY_ALIAS> \
  --network testnet \
  -- claim_rewards \
  --user <CONTRIBUTOR_ADDRESS> \
  --group_id 1
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
