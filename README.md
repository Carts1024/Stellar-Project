# Talambag

Talambag, A portmanteau of Tala (Star/Stellar) and Ambag (Contribution). It literally means "Stellar Contribution". Is a Soroban-powered community pooling application built on Stellar. It helps real-world groups, families, organizations, and OFW communities manage shared contributions with better transparency than screenshot-based payment coordination.

Instead of collecting money through opaque chat threads and manually tracking who paid, Talambag records group membership, pool creation, contributions, and organizer withdrawals on-chain.

## Demo Video

[![Watch the Talambag Demo](https://img.youtube.com/vi/Y03vvhb_GjQ/maxresdefault.jpg)](https://www.youtube.com/watch?v=Y03vvhb_GjQ)

## UI Screenshots

Add your app screenshots inside `frontend/public/screenshots/` and keep the filenames below to render images automatically in this README.

### Wallet States

Talambag Wallet Connected
![Talambag Wallet Connected](frontend/public/screenshots/dashboard-overview.png)

Talambag Wallet Disconnected
![Talambag Wallet Disconnected](frontend/public/screenshots/wallet-disconnected.png)

### Wallet Options


![Talambag Wallet Options](frontend/public/screenshots/wallets.png)


![Talambag Wallet Options(cont.)](frontend/public/screenshots/wallets(cont).png)

### Dashboard Overview

![Talambag Dashboard](frontend/public/screenshots/dashboard-overview.png)

### Group Page

![ Group Page](frontend/public/screenshots/group-page.png)

### Create Group

![Create Group Form](frontend/public/screenshots/create-group.png)

### Add Member to Group

![Add Member to Group Form](frontend/public/screenshots/add-member.png)

### Pool Page

![ Pool Page](frontend/public/screenshots/pool-page.png)

### Pool Actions (Deposit)

![Pool Actions](frontend/public/screenshots/add-deposit.png)

### Pool Actions (Withdraw)

![Pool Actions](frontend/public/screenshots/add-withdrawal.png)

### Transaction Feedback to User

![Transaction Feedback](frontend/public/screenshots/transaction-feedback.png)

### Successful Testnet Transaction

![Successful Testnet Transaction](frontend/public/screenshots/successful-transaction.png)

## Stellar Expert Link

https://stellar.expert/explorer/testnet/contract/CD44KFLGE2ISRUD6Q5BZTX3NI4ILTD5QUIWIED255UJDRAFJSR7GYIJE


![Stellar Expert Contract ](frontend/public/screenshots/talambag-contract.png)

## Smart Contract Address

CD44KFLGE2ISRUD6Q5BZTX3NI4ILTD5QUIWIED255UJDRAFJSR7GYIJE


## Smart Contract Short Description
This Soroban smart contract manages community groups and their contribution pools on-chain. It enforces membership and role-based permissions so only authorized users can add members, create pools, contribute, or withdraw funds. It also tracks each pool balance independently to keep funds and accounting transparent across multiple groups.

## Transaction Hash of a Contract Call
63a9457f00da89738e4394b2ddcbf3f1a39951ade3cd7ffafa7466d1e28c3c31

https://stellar.expert/explorer/testnet/tx/63a9457f00da89738e4394b2ddcbf3f1a39951ade3cd7ffafa7466d1e28c3c31

## Future Scope

Planned next steps for Talambag:

- list groups and pools directly in the UI instead of loading by ID
- support richer role management
- show contribution history and events
- improve explorer deep links and transaction receipts
- add end-to-end browser tests
- add analytics dashboards for pool health and activity trends
- add exportable contribution reports for community treasurers


```

## Project Setup Guide (Local Development)

Follow these steps to run Talambag on your machine.

1. Clone and enter the repository.

```bash
git clone https://github.com/Carts1024/Stellar-Project.git
cd Stellar-Project
```

2. Install required tooling.

```bash
rustc --version
cargo --version
stellar --version
node --version
pnpm --version
```

3. Install frontend dependencies.

```bash
cd frontend
pnpm install
cd ..
```

4. Build and test the smart contract.

```bash
cargo test
stellar contract build
```

Expected WASM output:

```bash
target/wasm32v1-none/release/talambag.wasm
```

5. (Optional but recommended) Deploy your contract to testnet.

```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/talambag.wasm \
  --source burner-key \
  --network testnet
```

6. Configure frontend environment variables.

```bash
cd frontend
cp .env.example .env.local
```

Set these values in `frontend/.env.local`:

```env
NEXT_PUBLIC_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_STELLAR_NETWORK=TESTNET
NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
NEXT_PUBLIC_TALAMBAG_CONTRACT_ID=CD44KFLGE2ISRUD6Q5BZTX3NI4ILTD5QUIWIED255UJDRAFJSR7GYIJE
NEXT_PUBLIC_TALAMBAG_ASSET_ADDRESS=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
NEXT_PUBLIC_TALAMBAG_ASSET_CODE=XLM
NEXT_PUBLIC_TALAMBAG_ASSET_DECIMALS=7
NEXT_PUBLIC_STELLAR_EXPLORER_URL=https://stellar.expert/explorer/testnet
NEXT_PUBLIC_STELLAR_READ_ADDRESS=<FUNDED_TESTNET_WALLET_ADDRESS>
```

7. Start the frontend development server.

```bash
pnpm dev
```

8. Validate frontend quality checks.

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

9. Open the app in your browser.

```text
http://localhost:3000
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



## Current Status

This project currently includes:

- a working Soroban contract for groups and pools
- Rust tests for core contract rules
- a frontend integrated with Freighter
- typed client-side contract interaction code
- testnet-oriented configuration





