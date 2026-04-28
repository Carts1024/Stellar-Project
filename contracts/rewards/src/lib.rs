#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, vec, Address, Env, IntoVal, String,
    Symbol,
};

const INSTANCE_TTL_THRESHOLD: u32 = 100;
const INSTANCE_TTL_EXTEND_TO: u32 = 518_400;

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    CoreContract,
    Metadata,
    TotalSupply,
    Balance(Address),
    GroupOwner(u32),
    GroupTotalContributed(u32),
    GroupTotalClaimed(u32),
    PendingReward(u32, Address),
    ContributedAmount(u32, Address),
}

#[derive(Clone)]
#[contracttype]
pub struct RewardTokenMetadata {
    pub name: String,
    pub symbol: String,
    pub decimals: u32,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
#[contracterror]
pub enum Error {
    Unauthorized = 1,
    AmountMustBePositive = 2,
    ArithmeticOverflow = 3,
    GroupNotRegistered = 4,
    AlreadyGroupRegistered = 5,
    NoRewardsAvailable = 6,
    NotEligible = 7,
    MetadataRequired = 8,
    CoreContractNotConfigured = 9,
    InsufficientBalance = 10,
}

#[contract]
pub struct RewardTokenContract;

#[contractimpl]
impl RewardTokenContract {
    pub fn __constructor(env: Env, admin: Address, name: String, symbol: String, decimals: u32) {
        Self::require_metadata(&name, &symbol).unwrap();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(
            &DataKey::Metadata,
            &RewardTokenMetadata {
                name,
                symbol,
                decimals,
            },
        );
        env.storage().instance().set(&DataKey::TotalSupply, &0i128);
        Self::touch_instance(&env);
    }

    pub fn version(env: Env) -> u32 {
        Self::touch_instance(&env);
        1
    }

    pub fn metadata(env: Env) -> RewardTokenMetadata {
        Self::touch_instance(&env);
        env.storage().instance().get(&DataKey::Metadata).unwrap()
    }

    pub fn set_core_contract(
        env: Env,
        admin: Address,
        core_contract: Address,
    ) -> Result<(), Error> {
        Self::touch_instance(&env);
        Self::require_admin(&env, &admin)?;
        env.storage()
            .instance()
            .set(&DataKey::CoreContract, &core_contract);

        env.events().publish(
            (Symbol::new(&env, "core_linked"),),
            core_contract,
        );

        Ok(())
    }

    pub fn core_contract(env: Env) -> Option<Address> {
        Self::touch_instance(&env);
        env.storage().instance().get(&DataKey::CoreContract)
    }

    pub fn is_group_registered(env: Env, group_id: u32) -> bool {
        Self::touch_instance(&env);
        env.storage().instance().has(&DataKey::GroupOwner(group_id))
    }

    pub fn register_group(env: Env, group_id: u32, owner: Address) -> Result<(), Error> {
        Self::touch_instance(&env);
        let core_contract = Self::require_core_contract(&env)?;
        core_contract.require_auth();

        if let Some(existing_owner) = env
            .storage()
            .instance()
            .get::<_, Address>(&DataKey::GroupOwner(group_id))
        {
            if existing_owner == owner {
                return Ok(());
            }

            return Err(Error::AlreadyGroupRegistered);
        }

        env.storage().instance().set(&DataKey::GroupOwner(group_id), &owner);
        env.storage()
            .instance()
            .set(&DataKey::GroupTotalContributed(group_id), &0i128);
        env.storage()
            .instance()
            .set(&DataKey::GroupTotalClaimed(group_id), &0i128);

        env.events().publish(
            (Symbol::new(&env, "reward_group_registered"), group_id),
            owner,
        );

        Ok(())
    }

    pub fn record_contribution(
        env: Env,
        group_id: u32,
        contributor: Address,
        amount: i128,
    ) -> Result<i128, Error> {
        Self::touch_instance(&env);
        if amount <= 0 {
            return Err(Error::AmountMustBePositive);
        }

        let core_contract = Self::require_core_contract(&env)?;
        core_contract.require_auth();
        Self::ensure_group_registered(&env, group_id)?;

        let group_total = Self::checked_add_i128(
            env.storage()
                .instance()
                .get(&DataKey::GroupTotalContributed(group_id))
                .unwrap_or(0),
            amount,
        )?;
        let contributor_total = Self::checked_add_i128(
            env.storage()
                .instance()
                .get(&DataKey::ContributedAmount(group_id, contributor.clone()))
                .unwrap_or(0),
            amount,
        )?;
        let pending = Self::checked_add_i128(
            env.storage()
                .instance()
                .get(&DataKey::PendingReward(group_id, contributor.clone()))
                .unwrap_or(0),
            amount,
        )?;

        env.storage()
            .instance()
            .set(&DataKey::GroupTotalContributed(group_id), &group_total);
        env.storage().instance().set(
            &DataKey::ContributedAmount(group_id, contributor.clone()),
            &contributor_total,
        );
        env.storage().instance().set(
            &DataKey::PendingReward(group_id, contributor.clone()),
            &pending,
        );

        env.events().publish(
            (Symbol::new(&env, "reward_pending"), group_id),
            (contributor, amount, pending),
        );

        Ok(pending)
    }

    pub fn claim_rewards(env: Env, user: Address, group_id: u32) -> Result<i128, Error> {
        Self::touch_instance(&env);
        user.require_auth();
        Self::ensure_group_registered(&env, group_id)?;

        let pending: i128 = env
            .storage()
            .instance()
            .get(&DataKey::PendingReward(group_id, user.clone()))
            .unwrap_or(0);

        if pending <= 0 {
            return Err(Error::NoRewardsAvailable);
        }

        let core_contract = Self::require_core_contract(&env)?;
        let is_member: bool = env.invoke_contract(
            &core_contract,
            &Symbol::new(&env, "is_member"),
            vec![&env, group_id.into_val(&env), user.clone().into_val(&env)],
        );

        if !is_member {
            return Err(Error::NotEligible);
        }

        let next_balance = Self::checked_add_i128(Self::balance(env.clone(), user.clone()), pending)?;
        let next_supply = Self::checked_add_i128(Self::total_supply(env.clone()), pending)?;
        let next_group_total_claimed = Self::checked_add_i128(
            env.storage()
                .instance()
                .get(&DataKey::GroupTotalClaimed(group_id))
                .unwrap_or(0),
            pending,
        )?;

        env.storage()
            .instance()
            .set(&DataKey::PendingReward(group_id, user.clone()), &0i128);
        env.storage()
            .instance()
            .set(&DataKey::Balance(user.clone()), &next_balance);
        env.storage().instance().set(&DataKey::TotalSupply, &next_supply);
        env.storage().instance().set(
            &DataKey::GroupTotalClaimed(group_id),
            &next_group_total_claimed,
        );

        env.events().publish(
            (Symbol::new(&env, "reward_claimed"), group_id),
            (user, pending),
        );

        Ok(pending)
    }

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) -> Result<(), Error> {
        Self::touch_instance(&env);
        if amount <= 0 {
            return Err(Error::AmountMustBePositive);
        }

        from.require_auth();

        let next_from_balance = Self::checked_sub_i128(Self::balance(env.clone(), from.clone()), amount)?;
        let next_to_balance = Self::checked_add_i128(Self::balance(env.clone(), to.clone()), amount)?;

        env.storage()
            .instance()
            .set(&DataKey::Balance(from.clone()), &next_from_balance);
        env.storage()
            .instance()
            .set(&DataKey::Balance(to.clone()), &next_to_balance);

        env.events().publish(
            (Symbol::new(&env, "reward_transfer"),),
            (from, to, amount),
        );

        Ok(())
    }

    pub fn burn(env: Env, from: Address, amount: i128) -> Result<(), Error> {
        Self::touch_instance(&env);
        if amount <= 0 {
            return Err(Error::AmountMustBePositive);
        }

        from.require_auth();

        let next_from_balance = Self::checked_sub_i128(Self::balance(env.clone(), from.clone()), amount)?;
        let next_supply = Self::checked_sub_i128(Self::total_supply(env.clone()), amount)?;

        env.storage()
            .instance()
            .set(&DataKey::Balance(from.clone()), &next_from_balance);
        env.storage().instance().set(&DataKey::TotalSupply, &next_supply);

        env.events().publish(
            (Symbol::new(&env, "reward_burned"),),
            (from, amount),
        );

        Ok(())
    }

    pub fn balance(env: Env, owner: Address) -> i128 {
        Self::touch_instance(&env);
        env.storage()
            .instance()
            .get(&DataKey::Balance(owner))
            .unwrap_or(0)
    }

    pub fn pending_reward(env: Env, group_id: u32, owner: Address) -> Result<i128, Error> {
        Self::touch_instance(&env);
        Self::ensure_group_registered(&env, group_id)?;
        Ok(env
            .storage()
            .instance()
            .get(&DataKey::PendingReward(group_id, owner))
            .unwrap_or(0))
    }

    pub fn contributed_amount(env: Env, group_id: u32, owner: Address) -> Result<i128, Error> {
        Self::touch_instance(&env);
        Self::ensure_group_registered(&env, group_id)?;
        Ok(env
            .storage()
            .instance()
            .get(&DataKey::ContributedAmount(group_id, owner))
            .unwrap_or(0))
    }

    pub fn total_supply(env: Env) -> i128 {
        Self::touch_instance(&env);
        env.storage().instance().get(&DataKey::TotalSupply).unwrap_or(0)
    }

    pub fn group_owner(env: Env, group_id: u32) -> Result<Address, Error> {
        Self::touch_instance(&env);
        env.storage()
            .instance()
            .get(&DataKey::GroupOwner(group_id))
            .ok_or(Error::GroupNotRegistered)
    }

    pub fn group_total_contributed(env: Env, group_id: u32) -> Result<i128, Error> {
        Self::touch_instance(&env);
        Self::ensure_group_registered(&env, group_id)?;
        Ok(env
            .storage()
            .instance()
            .get(&DataKey::GroupTotalContributed(group_id))
            .unwrap_or(0))
    }

    pub fn group_total_claimed(env: Env, group_id: u32) -> Result<i128, Error> {
        Self::touch_instance(&env);
        Self::ensure_group_registered(&env, group_id)?;
        Ok(env
            .storage()
            .instance()
            .get(&DataKey::GroupTotalClaimed(group_id))
            .unwrap_or(0))
    }

    fn touch_instance(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
    }

    fn require_admin(env: &Env, admin: &Address) -> Result<(), Error> {
        admin.require_auth();
        if env.storage().instance().get::<_, Address>(&DataKey::Admin).unwrap() != *admin {
            return Err(Error::Unauthorized);
        }
        Ok(())
    }

    fn require_core_contract(env: &Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::CoreContract)
            .ok_or(Error::CoreContractNotConfigured)
    }

    fn ensure_group_registered(env: &Env, group_id: u32) -> Result<(), Error> {
        if !env.storage().instance().has(&DataKey::GroupOwner(group_id)) {
            return Err(Error::GroupNotRegistered);
        }
        Ok(())
    }

    fn require_metadata(name: &String, symbol: &String) -> Result<(), Error> {
        if name.len() == 0 || symbol.len() == 0 {
            return Err(Error::MetadataRequired);
        }
        Ok(())
    }

    fn checked_add_i128(left: i128, right: i128) -> Result<i128, Error> {
        left.checked_add(right).ok_or(Error::ArithmeticOverflow)
    }

    fn checked_sub_i128(left: i128, right: i128) -> Result<i128, Error> {
        if left < right {
            return Err(Error::InsufficientBalance);
        }
        left.checked_sub(right).ok_or(Error::ArithmeticOverflow)
    }
}

#[cfg(test)]
mod test;