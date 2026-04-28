#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, vec, Address, Env,
    IntoVal, String, Symbol,
};

const INSTANCE_TTL_THRESHOLD: u32 = 100;
const INSTANCE_TTL_EXTEND_TO: u32 = 518_400;

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    NextGroupId,
    RewardsContract,
    Group(u32),
    GroupMember(u32, Address),
    Pool(u32, u32),
}

#[derive(Clone)]
#[contracttype]
pub struct Group {
    pub id: u32,
    pub name: String,
    pub owner: Address,
    pub asset: Address,
    pub member_count: u32,
    pub next_pool_id: u32,
}

#[derive(Clone)]
#[contracttype]
pub struct Pool {
    pub id: u32,
    pub group_id: u32,
    pub name: String,
    pub organizer: Address,
    pub balance: i128,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
#[contracterror]
pub enum Error {
    Unauthorized = 1,
    AmountMustBePositive = 2,
    GroupNotFound = 3,
    PoolNotFound = 4,
    AlreadyGroupMember = 5,
    NotGroupMember = 6,
    InsufficientPoolBalance = 7,
    NameRequired = 8,
    ArithmeticOverflow = 9,
}

#[contract]
pub struct TalambagContract;

#[contractimpl]
impl TalambagContract {
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        Self::touch_instance(&env);
    }

    pub fn admin(env: Env) -> Address {
        Self::touch_instance(&env);
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    pub fn set_rewards_contract(
        env: Env,
        admin: Address,
        rewards_contract: Address,
    ) -> Result<(), Error> {
        Self::touch_instance(&env);
        Self::require_admin(&env, &admin)?;
        env.storage()
            .instance()
            .set(&DataKey::RewardsContract, &rewards_contract);

        env.events().publish(
            (Symbol::new(&env, "rewards_linked"),),
            rewards_contract,
        );

        Ok(())
    }

    pub fn rewards_contract(env: Env) -> Option<Address> {
        Self::touch_instance(&env);
        env.storage().instance().get(&DataKey::RewardsContract)
    }

    pub fn create_group(
        env: Env,
        owner: Address,
        name: String,
        asset: Address,
    ) -> Result<u32, Error> {
        Self::touch_instance(&env);
        Self::require_non_empty_name(&name)?;
        owner.require_auth();

        let group_id = Self::next_group_id(&env);
        let group = Group {
            id: group_id,
            name,
            owner: owner.clone(),
            asset,
            member_count: 1,
            next_pool_id: 1,
        };

        env.storage().instance().set(&DataKey::Group(group_id), &group);
        env.storage()
            .instance()
            .set(&DataKey::GroupMember(group_id, owner), &true);
        env.storage()
            .instance()
            .set(&DataKey::NextGroupId, &Self::checked_increment_u32(group_id)?);

        env.events().publish(
            (Symbol::new(&env, "group_created"), group_id),
            (group.owner.clone(), group.asset.clone()),
        );

        Self::register_group_with_rewards(&env, group_id, group.owner.clone());

        Ok(group_id)
    }

    pub fn add_member(
        env: Env,
        owner: Address,
        group_id: u32,
        member: Address,
    ) -> Result<(), Error> {
        Self::touch_instance(&env);
        owner.require_auth();

        let mut group = Self::group(env.clone(), group_id)?;
        if group.owner != owner {
            return Err(Error::Unauthorized);
        }

        let member_key = DataKey::GroupMember(group_id, member.clone());
        if env.storage().instance().has(&member_key) {
            return Err(Error::AlreadyGroupMember);
        }

        env.storage().instance().set(&member_key, &true);
        group.member_count = Self::checked_increment_u32(group.member_count)?;
        env.storage().instance().set(&DataKey::Group(group_id), &group);

        env.events().publish(
            (Symbol::new(&env, "member_added"), group_id),
            member,
        );

        Ok(())
    }

    pub fn create_pool(
        env: Env,
        creator: Address,
        group_id: u32,
        name: String,
    ) -> Result<u32, Error> {
        Self::touch_instance(&env);
        Self::require_non_empty_name(&name)?;
        creator.require_auth();

        if !Self::is_member(env.clone(), group_id, creator.clone())? {
            return Err(Error::NotGroupMember);
        }

        let mut group = Self::group(env.clone(), group_id)?;
        let pool_id = group.next_pool_id;
        let pool = Pool {
            id: pool_id,
            group_id,
            name,
            organizer: creator.clone(),
            balance: 0,
        };

        env.storage()
            .instance()
            .set(&DataKey::Pool(group_id, pool_id), &pool);

        group.next_pool_id = Self::checked_increment_u32(group.next_pool_id)?;
        env.storage().instance().set(&DataKey::Group(group_id), &group);

        env.events().publish(
            (Symbol::new(&env, "pool_created"), group_id, pool_id),
            creator.clone(),
        );

        Ok(pool_id)
    }

    pub fn deposit(
        env: Env,
        from: Address,
        group_id: u32,
        pool_id: u32,
        amount: i128,
    ) -> Result<(), Error> {
        Self::touch_instance(&env);
        if amount <= 0 {
            return Err(Error::AmountMustBePositive);
        }

        from.require_auth();

        if !Self::is_member(env.clone(), group_id, from.clone())? {
            return Err(Error::NotGroupMember);
        }

        let group = Self::group(env.clone(), group_id)?;
        let mut pool = Self::pool(env.clone(), group_id, pool_id)?;
        let token = token::Client::new(&env, &group.asset);
        let contract_address = env.current_contract_address();

        token.transfer(&from, &contract_address, &amount);
        pool.balance = Self::checked_add_i128(pool.balance, amount)?;
        env.storage()
            .instance()
            .set(&DataKey::Pool(group_id, pool_id), &pool);

        env.events()
            .publish((symbol_short!("deposit"), group_id, pool_id), (from.clone(), amount));

        Self::record_contribution_with_rewards(&env, group_id, from.clone(), amount);

        Ok(())
    }

    pub fn withdraw(
        env: Env,
        organizer: Address,
        group_id: u32,
        pool_id: u32,
        to: Address,
        amount: i128,
    ) -> Result<(), Error> {
        Self::touch_instance(&env);
        if amount <= 0 {
            return Err(Error::AmountMustBePositive);
        }

        organizer.require_auth();

        let group = Self::group(env.clone(), group_id)?;
        let mut pool = Self::pool(env.clone(), group_id, pool_id)?;
        if pool.organizer != organizer {
            return Err(Error::Unauthorized);
        }

        if pool.balance < amount {
            return Err(Error::InsufficientPoolBalance);
        }

        let token = token::Client::new(&env, &group.asset);
        let contract_address = env.current_contract_address();
        token.transfer(&contract_address, &to, &amount);

        pool.balance = Self::checked_sub_i128(pool.balance, amount)?;
        env.storage()
            .instance()
            .set(&DataKey::Pool(group_id, pool_id), &pool);

        env.events().publish(
            (symbol_short!("withdraw"), group_id, pool_id),
            (organizer, to, amount),
        );

        Ok(())
    }

    pub fn group_count(env: Env) -> u32 {
        Self::touch_instance(&env);
        env.storage()
            .instance()
            .get(&DataKey::NextGroupId)
            .unwrap_or(1)
    }

    pub fn group(env: Env, group_id: u32) -> Result<Group, Error> {
        Self::touch_instance(&env);
        env.storage()
            .instance()
            .get(&DataKey::Group(group_id))
            .ok_or(Error::GroupNotFound)
    }

    pub fn pool(env: Env, group_id: u32, pool_id: u32) -> Result<Pool, Error> {
        Self::touch_instance(&env);
        let _group = Self::group(env.clone(), group_id)?;

        env.storage()
            .instance()
            .get(&DataKey::Pool(group_id, pool_id))
            .ok_or(Error::PoolNotFound)
    }

    pub fn is_member(env: Env, group_id: u32, member: Address) -> Result<bool, Error> {
        Self::touch_instance(&env);
        let _group = Self::group(env.clone(), group_id)?;

        Ok(env
            .storage()
            .instance()
            .has(&DataKey::GroupMember(group_id, member)))
    }

    pub fn pool_balance(env: Env, group_id: u32, pool_id: u32) -> Result<i128, Error> {
        Self::touch_instance(&env);
        Ok(Self::pool(env, group_id, pool_id)?.balance)
    }

    fn next_group_id(env: &Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::NextGroupId)
            .unwrap_or(1)
    }

    fn require_non_empty_name(name: &String) -> Result<(), Error> {
        if name.len() == 0 {
            Err(Error::NameRequired)
        } else {
            Ok(())
        }
    }

    fn touch_instance(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
    }

    fn require_admin(env: &Env, admin: &Address) -> Result<(), Error> {
        admin.require_auth();
        if Self::admin(env.clone()) != *admin {
            return Err(Error::Unauthorized);
        }
        Ok(())
    }

    fn checked_increment_u32(value: u32) -> Result<u32, Error> {
        value.checked_add(1).ok_or(Error::ArithmeticOverflow)
    }

    fn checked_add_i128(left: i128, right: i128) -> Result<i128, Error> {
        left.checked_add(right).ok_or(Error::ArithmeticOverflow)
    }

    fn checked_sub_i128(left: i128, right: i128) -> Result<i128, Error> {
        left.checked_sub(right).ok_or(Error::ArithmeticOverflow)
    }

    fn register_group_with_rewards(env: &Env, group_id: u32, owner: Address) {
        if let Some(rewards_contract) = env.storage().instance().get::<_, Address>(&DataKey::RewardsContract) {
            env.invoke_contract::<()>(
                &rewards_contract,
                &Symbol::new(env, "register_group"),
                vec![env, group_id.into_val(env), owner.into_val(env)],
            );
        }
    }

    fn record_contribution_with_rewards(env: &Env, group_id: u32, contributor: Address, amount: i128) {
        if let Some(rewards_contract) = env.storage().instance().get::<_, Address>(&DataKey::RewardsContract) {
            if let Some(group) = env.storage().instance().get::<_, Group>(&DataKey::Group(group_id)) {
                Self::register_group_with_rewards(env, group_id, group.owner);
            }

            env.invoke_contract::<i128>(
                &rewards_contract,
                &Symbol::new(env, "record_contribution"),
                vec![
                    env,
                    group_id.into_val(env),
                    contributor.into_val(env),
                    amount.into_val(env),
                ],
            );
        }
    }
}

#[cfg(test)]
mod test;
