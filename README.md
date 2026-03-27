# Talambag

Talambag is a Soroban-powered community pooling application built on Stellar. It helps real-world groups, families, organizations, and OFW communities manage shared contributions with better transparency than screenshot-based payment coordination.

Instead of collecting money through opaque chat threads and manually tracking who paid, Talambag records group membership, pool creation, contributions, and organizer withdrawals on-chain.

## What The Project Solves

Small communities often raise money for:

- emergency support
- medical needs
- gifts and celebrations
- shared projects
- mutual aid

The usual workflow is fragile:

- one person creates a chat group
- people send money manually
- someone keeps a private spreadsheet or screenshot list
- members have to trust that the totals are correct

Talambag improves that by giving the group a smart-contract-backed source of truth.

## How Talambag Works

Talambag is built around 2 concepts:

1. Groups
Each group has:

- an owner
- an asset contract address
- an approved member list
- one or more pools

2. Pools
Each pool belongs to a group and has:

- a name
- an organizer
- an internal balance tracked by the contract

The wallet that creates a pool automatically becomes that pool’s organizer.

## Core Rules Enforced By The Contract

The smart contract guarantees the following:

- only the group owner can add members to a group
- only members of a group can create pools inside that group
- only members of a group can contribute to that group’s pools
- only the organizer of a specific pool can withdraw from that pool
- each pool balance is tracked independently, even though funds are held by one contract

This means Talambag supports multiple groups and multiple pools without mixing balances or permissions.

## Example User Flow

1. Alice creates a group called `Barangay Emergency Support`
2. Alice adds Bob and Carla as members
3. Bob creates a pool called `Hospital Assistance`
4. Bob becomes the organizer of that pool
5. Carla deposits funds into the pool
6. Bob withdraws from that pool to the intended recipient
7. Anyone with the right IDs can inspect the group and pool state on-chain

## Project Architecture

This repository is a small monorepo with 2 main parts:

- Soroban smart contract in [`src/lib.rs`](/home/carts/Documents/Personal/Stellar-Project/src/lib.rs)
- Next.js frontend in [`frontend/`](/home/carts/Documents/Personal/Stellar-Project/frontend)

### Smart Contract

The contract is written in Rust with `soroban-sdk` and stores:

- the next group ID
- group records
- group membership records
- pool records

Primary contract methods:

- `create_group`
- `add_member`
- `create_pool`
- `deposit`
- `withdraw`
- `group`
- `pool`
- `is_member`
- `pool_balance`

Tests live in [`src/test.rs`](/home/carts/Documents/Personal/Stellar-Project/src/test.rs).

### Frontend

The frontend is a Next.js app that integrates with:

- `@stellar/stellar-sdk`
- `@stellar/freighter-api`
- Freighter wallet
- Soroban RPC on Stellar testnet

The UI lets a user:

- connect a wallet
- create a group
- add group members
- create a pool in a selected group
- load group and pool state by ID
- deposit to a pool
- withdraw as the selected pool organizer

## Technology Stack

- Rust
- Soroban SDK
- Stellar CLI
- Next.js
- React
- TypeScript
- pnpm
- Freighter

## Repo Structure

```text
.
├── src/
│   ├── lib.rs
│   └── test.rs
├── frontend/
│   ├── src/
│   ├── .env.example
│   └── package.json
├── Cargo.toml
└── README.md
```

## Prerequisites

Install:

- Rust
- `rustup`
- Stellar CLI
- Node.js
- pnpm
- Freighter browser extension

Helpful checks:

```bash
rustc --version
cargo --version
stellar --version
pnpm --version
```

## Smart Contract Development

Run tests:

```bash
cargo test
```

Build a Soroban-compatible WASM artifact:

```bash
stellar contract build
```

This produces:

```bash
target/wasm32v1-none/release/talambag.wasm
```

Important:

- use `stellar contract build`
- do not deploy the old `wasm32-unknown-unknown` artifact

## Deploy To Testnet

Deploy the contract:

```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/talambag.wasm \
  --source burner-key \
  --network testnet
```

After deployment, copy the returned contract ID into:

```env
NEXT_PUBLIC_TALAMBAG_CONTRACT_ID=
```

## Asset Configuration

Talambag needs a token contract address for the asset used by each group.

If you are using native XLM on Soroban, use the Stellar Asset Contract for `native`.

Example commands:

```bash
stellar contract asset deploy \
  --source burner-key \
  --network testnet \
  --asset native
```

```bash
stellar contract id asset \
  --network testnet \
  --asset native
```

That resulting `CA...` contract address goes into:

```env
NEXT_PUBLIC_TALAMBAG_ASSET_ADDRESS=
```

## Frontend Setup

Install dependencies:

```bash
cd frontend
pnpm install
```

Create a local environment file:

```bash
cp .env.example .env.local
```

Recommended frontend environment variables:

```env
NEXT_PUBLIC_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_STELLAR_NETWORK=TESTNET
NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
NEXT_PUBLIC_TALAMBAG_CONTRACT_ID=
NEXT_PUBLIC_TALAMBAG_ASSET_ADDRESS=
NEXT_PUBLIC_TALAMBAG_ASSET_CODE=XLM
NEXT_PUBLIC_TALAMBAG_ASSET_DECIMALS=7
NEXT_PUBLIC_STELLAR_EXPLORER_URL=https://stellar.expert/explorer/testnet
NEXT_PUBLIC_STELLAR_READ_ADDRESS=
```

### What These Values Mean

- `NEXT_PUBLIC_TALAMBAG_CONTRACT_ID`
  The deployed Talambag smart contract ID.

- `NEXT_PUBLIC_TALAMBAG_ASSET_ADDRESS`
  The token contract address used when creating groups.

- `NEXT_PUBLIC_STELLAR_READ_ADDRESS`
  Any funded testnet account address (`G...`) the frontend can use for read-only simulation calls.
  A common choice is the public address for your `burner-key`.

## Run The Frontend

Start the dev server:

```bash
pnpm dev
```

Validate the frontend:

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

## Contract API Reference

### `create_group(owner, name, asset) -> u32`

Creates a new group and returns the group ID.

### `add_member(owner, group_id, member)`

Adds a member to a group. Only the group owner can call this.

### `create_pool(creator, group_id, name) -> u32`

Creates a new pool in a group. The creator becomes the organizer.

### `deposit(from, group_id, pool_id, amount)`

Deposits funds into a pool. The sender must be a member of the group.

### `withdraw(organizer, group_id, pool_id, to, amount)`

Withdraws from a pool. Only that pool’s organizer can call this.

### `group(group_id) -> Group`

Returns group metadata.

### `pool(group_id, pool_id) -> Pool`

Returns pool metadata.

### `is_member(group_id, member) -> bool`

Checks whether a wallet belongs to a group.

### `pool_balance(group_id, pool_id) -> i128`

Returns the tracked internal balance for a pool.

## CLI Examples

Create a group:

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source group_owner \
  --network testnet \
  -- create_group \
  --owner <GROUP_OWNER_ADDRESS> \
  --name "Community Aid" \
  --asset <TOKEN_CONTRACT_ADDRESS>
```

Add a member:

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source group_owner \
  --network testnet \
  -- add_member \
  --owner <GROUP_OWNER_ADDRESS> \
  --group_id 1 \
  --member <MEMBER_ADDRESS>
```

Create a pool:

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source member \
  --network testnet \
  -- create_pool \
  --creator <MEMBER_ADDRESS> \
  --group_id 1 \
  --name "Emergency Support"
```

Deposit:

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source contributor \
  --network testnet \
  -- deposit \
  --from <CONTRIBUTOR_ADDRESS> \
  --group_id 1 \
  --pool_id 1 \
  --amount 10000000
```

Read a group:

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source anyone \
  --network testnet \
  -- group \
  --group_id 1
```

Read a pool:

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source anyone \
  --network testnet \
  -- pool \
  --group_id 1 \
  --pool_id 1
```

## Current Status

This project currently includes:

- a working Soroban contract for groups and pools
- Rust tests for core contract rules
- a frontend integrated with Freighter
- typed client-side contract interaction code
- testnet-oriented configuration

## Future Improvements

Possible next steps:

- list groups and pools directly in the UI instead of loading by ID
- support richer role management
- show contribution history and events
- improve explorer deep links and transaction receipts
- add end-to-end browser tests

## Smart Contract Address

CCA7C47RNAE4W24FGZUNSK7EJKCZ5OKHSO3AYHMHQ4D6PC542DFKOXUL


