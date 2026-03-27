#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, Address, Env,
};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Organizer,
    Asset,
    Initialized,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
#[contracterror]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    AmountMustBePositive = 4,
}

#[contract]
pub struct TalambagContract;

#[contractimpl]
impl TalambagContract {
    /// Initializes the pool once by storing the verified organizer address and
    /// the token contract address that represents the asset used for deposits.
    ///
    /// For the Talambag MVP, this asset can be the tokenized representation of
    /// XLM or USDC on Soroban.
    pub fn init(env: Env, organizer: Address, asset: Address) -> Result<(), Error> {
        if env
            .storage()
            .instance()
            .has(&DataKey::Initialized)
        {
            return Err(Error::AlreadyInitialized);
        }

        organizer.require_auth();

        env.storage().instance().set(&DataKey::Organizer, &organizer);
        env.storage().instance().set(&DataKey::Asset, &asset);
        env.storage().instance().set(&DataKey::Initialized, &true);

        Ok(())
    }

    /// Accepts a deposit from any address into the communal pool.
    ///
    /// The token contract enforces authorization from `from`, so only the owner
    /// of the funds can move them into the pool.
    pub fn deposit(env: Env, from: Address, amount: i128) -> Result<(), Error> {
        Self::require_initialized(&env)?;
        if amount <= 0 {
            return Err(Error::AmountMustBePositive);
        }

        from.require_auth();

        let asset = Self::asset(&env)?;
        let token = token::Client::new(&env, &asset);
        let contract_address = env.current_contract_address();

        token.transfer(&from, &contract_address, &amount);
        Ok(())
    }

    /// Withdraws funds from the pool to a recipient, but only if the caller is
    /// the verified organizer address stored during initialization.
    pub fn withdraw(
        env: Env,
        organizer: Address,
        to: Address,
        amount: i128,
    ) -> Result<(), Error> {
        Self::require_initialized(&env)?;
        if amount <= 0 {
            return Err(Error::AmountMustBePositive);
        }

        let stored_organizer = Self::organizer(env.clone())?;
        if organizer != stored_organizer {
            return Err(Error::Unauthorized);
        }

        organizer.require_auth();

        let asset = Self::asset(&env)?;
        let token = token::Client::new(&env, &asset);
        let contract_address = env.current_contract_address();

        token.transfer(&contract_address, &to, &amount);
        Ok(())
    }

    /// Public view function that returns the current total balance held by the
    /// pool contract for the configured asset.
    pub fn pool_balance(env: Env) -> Result<i128, Error> {
        Self::require_initialized(&env)?;
        let asset = Self::asset(&env)?;
        let token = token::Client::new(&env, &asset);
        Ok(token.balance(&env.current_contract_address()))
    }

    /// Returns the verified organizer address for public inspection.
    pub fn organizer(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Organizer)
            .ok_or(Error::NotInitialized)
    }

    /// Returns the configured asset/token contract address for public inspection.
    pub fn asset(env: &Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Asset)
            .ok_or(Error::NotInitialized)
    }

    fn require_initialized(env: &Env) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Initialized) {
            Ok(())
        } else {
            Err(Error::NotInitialized)
        }
    }
}

#[cfg(test)]
mod test;
