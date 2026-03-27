#![cfg(test)]

extern crate std;

use super::{Error, TalambagContract, TalambagContractClient};
use soroban_sdk::{testutils::Address as _, token, Address, Env};

mod tests {
    use super::*;
    use std::boxed::Box;

    fn setup() -> (
        Env,
        TalambagContractClient<'static>,
        token::Client<'static>,
        Address,
        Address,
        Address,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let organizer = Address::generate(&env);
        let contributor = Address::generate(&env);
        let recipient = Address::generate(&env);

        let asset_admin = Address::generate(&env);
        let asset = env.register_stellar_asset_contract_v2(asset_admin.clone());
        let asset_address = asset.address();

        let token_admin = token::StellarAssetClient::new(&env, &asset_address);
        let _token_client = token::Client::new(&env, &asset_address);
        token_admin.mint(&contributor, &1_000);

        let contract_id = env.register(TalambagContract, ());
        let client = TalambagContractClient::new(&env, &contract_id);
        client.init(&organizer, &asset_address);

        // Extend lifetimes for the generated clients inside the test helper.
        let env_ref: &'static Env = Box::leak(Box::new(env));
        let client = TalambagContractClient::new(env_ref, &contract_id);
        let token_client = token::Client::new(env_ref, &asset_address);

        (
            env_ref.clone(),
            client,
            token_client,
            organizer,
            contributor,
            recipient,
        )
    }

    #[test]
    fn happy_path_deposit_and_organizer_withdrawal_succeeds() {
        let (_env, client, token_client, organizer, contributor, recipient) = setup();

        client.deposit(&contributor, &250);
        client.withdraw(&organizer, &recipient, &100);

        assert_eq!(client.pool_balance(), 150);
        assert_eq!(token_client.balance(&recipient), 100);
    }

    #[test]
    fn edge_case_non_organizer_withdrawal_is_rejected() {
        let (_env, client, _token_client, _organizer, contributor, recipient) = setup();

        client.deposit(&contributor, &200);

        let result = client.try_withdraw(&contributor, &recipient, &50);
        assert_eq!(result, Err(Ok(Error::Unauthorized)));
    }

    #[test]
    fn state_verification_storage_reflects_organizer_and_balance() {
        let (_env, client, _token_client, organizer, contributor, _recipient) = setup();

        client.deposit(&contributor, &300);

        assert_eq!(client.organizer(), organizer);
        assert_eq!(client.pool_balance(), 300);
    }
}
