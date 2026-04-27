#![cfg(test)]

extern crate std;

use super::{Error, Group, Pool, TalambagContract, TalambagContractClient};
use soroban_sdk::{symbol_short, testutils::Address as _, token, Address, Env, IntoVal, String};
use talambag_rewards::{RewardTokenContract, RewardTokenContractClient};

mod tests {
    use super::*;
    use soroban_sdk::testutils::Events;
    use std::boxed::Box;

    struct TestContext {
        env: Env,
        client: TalambagContractClient<'static>,
        rewards_client: RewardTokenContractClient<'static>,
        token_client: token::Client<'static>,
        contract_admin: Address,
        group_owner: Address,
        pool_creator: Address,
        contributor: Address,
        outsider: Address,
        recipient: Address,
        asset_address: Address,
    }

    fn text(env: &Env, value: &str) -> String {
        String::from_str(env, value)
    }

    fn setup() -> TestContext {
        let env = Env::default();
        env.mock_all_auths();

        let contract_admin = Address::generate(&env);
        let group_owner = Address::generate(&env);
        let pool_creator = Address::generate(&env);
        let contributor = Address::generate(&env);
        let outsider = Address::generate(&env);
        let recipient = Address::generate(&env);

        let asset_admin = Address::generate(&env);
        let asset = env.register_stellar_asset_contract_v2(asset_admin.clone());
        let asset_address = asset.address();

        let token_admin = token::StellarAssetClient::new(&env, &asset_address);
        token_admin.mint(&pool_creator, &1_000);
        token_admin.mint(&contributor, &1_000);
        token_admin.mint(&outsider, &1_000);

        let contract_id = env.register(TalambagContract, (&contract_admin,));
        let rewards_id = env.register(
            RewardTokenContract,
            (
                contract_admin.clone(),
                text(&env, "Talambag Rewards"),
                text(&env, "TLMBG"),
                7u32,
            ),
        );
        let env_ref: &'static Env = Box::leak(Box::new(env));
        let client = TalambagContractClient::new(env_ref, &contract_id);
        let rewards_client = RewardTokenContractClient::new(env_ref, &rewards_id);

        client.set_rewards_contract(&contract_admin, &rewards_id);
        rewards_client.set_core_contract(&contract_admin, &contract_id);

        TestContext {
            env: env_ref.clone(),
            client,
            rewards_client,
            token_client: token::Client::new(env_ref, &asset_address),
            contract_admin,
            group_owner,
            pool_creator,
            contributor,
            outsider,
            recipient,
            asset_address,
        }
    }

    fn create_group_with_members(context: &TestContext) -> u32 {
        let group_id = context.client.create_group(
            &context.group_owner,
            &text(&context.env, "Barangay Support"),
            &context.asset_address,
        );

        context
            .client
            .add_member(&context.group_owner, &group_id, &context.pool_creator);
        context
            .client
            .add_member(&context.group_owner, &group_id, &context.contributor);

        group_id
    }

    fn create_pool(context: &TestContext, group_id: u32) -> u32 {
        context.client.create_pool(
            &context.pool_creator,
            &group_id,
            &text(&context.env, "Emergency Relief Pool"),
        )
    }

    #[test]
    fn group_members_can_fund_a_pool_and_the_pool_organizer_can_withdraw() {
        let context = setup();
        let group_id = create_group_with_members(&context);
        let pool_id = create_pool(&context, group_id);

        context
            .client
            .deposit(&context.contributor, &group_id, &pool_id, &250);
        context.client.withdraw(
            &context.pool_creator,
            &group_id,
            &pool_id,
            &context.recipient,
            &100,
        );

        assert_eq!(context.client.pool_balance(&group_id, &pool_id), 150);
        assert_eq!(context.token_client.balance(&context.recipient), 100);
    }

    #[test]
    fn non_group_members_cannot_contribute_to_a_pool() {
        let context = setup();
        let group_id = create_group_with_members(&context);
        let pool_id = create_pool(&context, group_id);

        let result = context
            .client
            .try_deposit(&context.outsider, &group_id, &pool_id, &25);

        assert_eq!(result, Err(Ok(Error::NotGroupMember)));
    }

    #[test]
    fn only_the_pool_organizer_can_withdraw() {
        let context = setup();
        let group_id = create_group_with_members(&context);
        let pool_id = create_pool(&context, group_id);

        context
            .client
            .deposit(&context.contributor, &group_id, &pool_id, &180);

        let result = context.client.try_withdraw(
            &context.group_owner,
            &group_id,
            &pool_id,
            &context.recipient,
            &50,
        );

        assert_eq!(result, Err(Ok(Error::Unauthorized)));
    }

    #[test]
    fn group_and_pool_reads_reflect_owner_membership_and_balance() {
        let context = setup();
        let group_id = create_group_with_members(&context);
        let pool_id = create_pool(&context, group_id);

        context
            .client
            .deposit(&context.contributor, &group_id, &pool_id, &300);

        let group: Group = context.client.group(&group_id);
        let pool: Pool = context.client.pool(&group_id, &pool_id);

        assert_eq!(group.owner, context.group_owner);
        assert_eq!(group.member_count, 3);
        assert_eq!(group.asset, context.asset_address);
        assert!(context.client.is_member(&group_id, &context.contributor));
        assert_eq!(pool.organizer, context.pool_creator);
        assert_eq!(pool.balance, 300);
    }

    #[test]
    fn group_count_reflects_created_groups() {
        let context = setup();

        assert_eq!(context.client.group_count(), 1);

        context.client.create_group(
            &context.group_owner,
            &text(&context.env, "First Group"),
            &context.asset_address,
        );
        assert_eq!(context.client.group_count(), 2);

        context.client.create_group(
            &context.group_owner,
            &text(&context.env, "Second Group"),
            &context.asset_address,
        );
        assert_eq!(context.client.group_count(), 3);
    }

    #[test]
    fn create_group_registers_the_group_with_the_rewards_contract() {
        let context = setup();
        let group_id = context.client.create_group(
            &context.group_owner,
            &text(&context.env, "Rewarded Group"),
            &context.asset_address,
        );

        assert_eq!(context.client.admin(), context.contract_admin);
        assert_eq!(context.client.rewards_contract(), Some(context.rewards_client.address.clone()));
        assert_eq!(context.rewards_client.group_owner(&group_id), context.group_owner);
    }

    #[test]
    fn deposit_emits_event() {
        let context = setup();
        let group_id = create_group_with_members(&context);
        let pool_id = create_pool(&context, group_id);

        context
            .client
            .deposit(&context.contributor, &group_id, &pool_id, &500);

        let events = context.env.events().all();
        let deposit_event = events
            .iter()
            .find(|event| {
                event.0 == context.client.address
                    && event.1
                        == (symbol_short!("deposit"), group_id, pool_id).into_val(&context.env)
            })
            .unwrap();

        assert_eq!(deposit_event.0, context.client.address);
        assert_eq!(
            deposit_event.1,
            (symbol_short!("deposit"), group_id, pool_id).into_val(&context.env)
        );
    }

    #[test]
    fn withdraw_emits_event() {
        let context = setup();
        let group_id = create_group_with_members(&context);
        let pool_id = create_pool(&context, group_id);

        context
            .client
            .deposit(&context.contributor, &group_id, &pool_id, &400);
        context.client.withdraw(
            &context.pool_creator,
            &group_id,
            &pool_id,
            &context.recipient,
            &150,
        );

        let events = context.env.events().all();
        let last = events.last().unwrap();

        assert_eq!(last.0, context.client.address);
        assert_eq!(
            last.1,
            (symbol_short!("withdraw"), group_id, pool_id).into_val(&context.env)
        );
    }
}
