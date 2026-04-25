#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env, String,
};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    NextGroupId,
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
}

#[contract]
pub struct TalambagContract;

#[contractimpl]
impl TalambagContract {
    pub fn create_group(
        env: Env,
        owner: Address,
        name: String,
        asset: Address,
    ) -> Result<u32, Error> {
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
            .set(&DataKey::NextGroupId, &(group_id + 1));

        Ok(group_id)
    }

    pub fn add_member(
        env: Env,
        owner: Address,
        group_id: u32,
        member: Address,
    ) -> Result<(), Error> {
        owner.require_auth();

        let mut group = Self::group(env.clone(), group_id)?;
        if group.owner != owner {
            return Err(Error::Unauthorized);
        }

        let member_key = DataKey::GroupMember(group_id, member);
        if env.storage().instance().has(&member_key) {
            return Err(Error::AlreadyGroupMember);
        }

        env.storage().instance().set(&member_key, &true);
        group.member_count += 1;
        env.storage().instance().set(&DataKey::Group(group_id), &group);

        Ok(())
    }

    pub fn create_pool(
        env: Env,
        creator: Address,
        group_id: u32,
        name: String,
    ) -> Result<u32, Error> {
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
            organizer: creator,
            balance: 0,
        };

        env.storage()
            .instance()
            .set(&DataKey::Pool(group_id, pool_id), &pool);

        group.next_pool_id += 1;
        env.storage().instance().set(&DataKey::Group(group_id), &group);

        Ok(pool_id)
    }

    pub fn deposit(
        env: Env,
        from: Address,
        group_id: u32,
        pool_id: u32,
        amount: i128,
    ) -> Result<(), Error> {
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
        pool.balance += amount;
        env.storage()
            .instance()
            .set(&DataKey::Pool(group_id, pool_id), &pool);

        env.events()
            .publish((symbol_short!("deposit"), group_id, pool_id), (from, amount));

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

        pool.balance -= amount;
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
        env.storage()
            .instance()
            .get(&DataKey::NextGroupId)
            .unwrap_or(1)
    }

    pub fn group(env: Env, group_id: u32) -> Result<Group, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Group(group_id))
            .ok_or(Error::GroupNotFound)
    }

    pub fn pool(env: Env, group_id: u32, pool_id: u32) -> Result<Pool, Error> {
        let _group = Self::group(env.clone(), group_id)?;

        env.storage()
            .instance()
            .get(&DataKey::Pool(group_id, pool_id))
            .ok_or(Error::PoolNotFound)
    }

    pub fn is_member(env: Env, group_id: u32, member: Address) -> Result<bool, Error> {
        let _group = Self::group(env.clone(), group_id)?;

        Ok(env
            .storage()
            .instance()
            .has(&DataKey::GroupMember(group_id, member)))
    }

    pub fn pool_balance(env: Env, group_id: u32, pool_id: u32) -> Result<i128, Error> {
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
}

#[cfg(test)]
mod test;
