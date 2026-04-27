#![cfg(test)]

extern crate std;

use super::{Error, RewardTokenContract, RewardTokenContractClient};
use soroban_sdk::{
    contract, contractimpl, contracttype, testutils::{Address as _, Events}, Address, Env,
    FromVal, IntoVal, String, Symbol,
};
use std::boxed::Box;

#[derive(Clone)]
#[contracttype]
enum MockCoreDataKey {
    Member(u32, Address),
}

#[contract]
struct MockCoreContract;

#[contractimpl]
impl MockCoreContract {
    pub fn set_member(env: Env, group_id: u32, member: Address, is_member: bool) {
        env.storage()
            .instance()
            .set(&MockCoreDataKey::Member(group_id, member), &is_member);
    }

    pub fn is_member(env: Env, group_id: u32, member: Address) -> bool {
        env.storage()
            .instance()
            .get(&MockCoreDataKey::Member(group_id, member))
            .unwrap_or(false)
    }
}

struct TestContext {
    env: Env,
    rewards_client: RewardTokenContractClient<'static>,
    core_client: MockCoreContractClient<'static>,
    group_owner: Address,
    member: Address,
    outsider: Address,
}

fn text(env: &Env, value: &str) -> String {
    String::from_str(env, value)
}

fn setup() -> TestContext {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let group_owner = Address::generate(&env);
    let member = Address::generate(&env);
    let outsider = Address::generate(&env);

    let core_id = env.register(MockCoreContract, ());
    let rewards_id = env.register(
        RewardTokenContract,
        (
            admin.clone(),
            text(&env, "Talambag Rewards"),
            text(&env, "TLMBG"),
            7u32,
        ),
    );

    let env_ref: &'static Env = Box::leak(Box::new(env));
    let rewards_client = RewardTokenContractClient::new(env_ref, &rewards_id);
    let core_client = MockCoreContractClient::new(env_ref, &core_id);

    rewards_client.set_core_contract(&admin, &core_id);

    TestContext {
        env: env_ref.clone(),
        rewards_client,
        core_client,
        group_owner,
        member,
        outsider,
    }
}

fn register_group(context: &TestContext, group_id: u32) {
    context
        .rewards_client
        .register_group(&group_id, &context.group_owner);
}

fn record_contribution(context: &TestContext, group_id: u32, contributor: &Address, amount: i128) {
    context
        .rewards_client
        .record_contribution(&group_id, contributor, &amount);
}

#[test]
fn constructor_sets_metadata_and_zero_supply() {
    let context = setup();

    let metadata = context.rewards_client.metadata();

    assert_eq!(context.rewards_client.version(), 1);
    assert_eq!(metadata.name, text(&context.env, "Talambag Rewards"));
    assert_eq!(metadata.symbol, text(&context.env, "TLMBG"));
    assert_eq!(metadata.decimals, 7);
    assert_eq!(context.rewards_client.total_supply(), 0);
    assert_eq!(context.rewards_client.core_contract(), Some(context.core_client.address.clone()));
}

#[test]
fn linking_the_core_contract_emits_event() {
    let context = setup();

    let events = context.env.events().all();
    let event = events.last().unwrap();
    let linked_core: Address = Address::from_val(&context.env, &event.2);

    assert_eq!(event.0, context.rewards_client.address);
    assert_eq!(
        event.1,
        (Symbol::new(&context.env, "core_linked"),).into_val(&context.env)
    );
    assert_eq!(linked_core, context.core_client.address);
}

#[test]
fn register_group_and_record_contribution_track_pending_rewards() {
    let context = setup();
    let group_id = 7;

    register_group(&context, group_id);

    let pending = context
        .rewards_client
        .record_contribution(&group_id, &context.member, &250);

    assert_eq!(pending, 250);
    assert_eq!(context.rewards_client.group_owner(&group_id), context.group_owner);
    assert_eq!(context.rewards_client.pending_reward(&group_id, &context.member), 250);
    assert_eq!(
        context
            .rewards_client
            .contributed_amount(&group_id, &context.member),
        250
    );
    assert_eq!(context.rewards_client.group_total_contributed(&group_id), 250);
    assert_eq!(context.rewards_client.group_total_claimed(&group_id), 0);
}

#[test]
fn group_registration_and_reward_accrual_emit_events() {
    let context = setup();
    let group_id = 8;

    register_group(&context, group_id);
    let registered_events = context.env.events().all();
    let registered = registered_events.last().unwrap();
    let registered_owner: Address = Address::from_val(&context.env, &registered.2);

    assert_eq!(registered_events.len(), 1);
    assert_eq!(registered.0, context.rewards_client.address);
    assert_eq!(
        registered.1,
        (Symbol::new(&context.env, "reward_group_registered"), group_id).into_val(&context.env)
    );
    assert_eq!(registered_owner, context.group_owner);

    record_contribution(&context, group_id, &context.member, 250);

    let pending_events = context.env.events().all();
    let pending = pending_events.last().unwrap();
    let pending_data: (Address, i128, i128) =
        <(Address, i128, i128)>::from_val(&context.env, &pending.2);

    assert_eq!(pending_events.len(), 1);
    assert_eq!(pending.0, context.rewards_client.address);
    assert_eq!(
        pending.1,
        (Symbol::new(&context.env, "reward_pending"), group_id).into_val(&context.env)
    );
    assert_eq!(pending_data, (context.member.clone(), 250i128, 250i128));
}

#[test]
fn members_can_claim_transfer_and_burn_rewards() {
    let context = setup();
    let group_id = 9;

    register_group(&context, group_id);
    record_contribution(&context, group_id, &context.member, 300);
    context.core_client.set_member(&group_id, &context.member, &true);

    let claimed = context
        .rewards_client
        .claim_rewards(&context.member, &group_id);

    assert_eq!(claimed, 300);
    assert_eq!(context.rewards_client.pending_reward(&group_id, &context.member), 0);
    assert_eq!(context.rewards_client.balance(&context.member), 300);
    assert_eq!(context.rewards_client.total_supply(), 300);
    assert_eq!(context.rewards_client.group_total_claimed(&group_id), 300);

    context
        .rewards_client
        .transfer(&context.member, &context.outsider, &120);
    context.rewards_client.burn(&context.outsider, &20);

    assert_eq!(context.rewards_client.balance(&context.member), 180);
    assert_eq!(context.rewards_client.balance(&context.outsider), 100);
    assert_eq!(context.rewards_client.total_supply(), 280);
}

#[test]
fn claim_transfer_and_burn_emit_events() {
    let context = setup();
    let group_id = 12;

    register_group(&context, group_id);
    record_contribution(&context, group_id, &context.member, 300);
    context.core_client.set_member(&group_id, &context.member, &true);
    context
        .rewards_client
        .claim_rewards(&context.member, &group_id);
    let claimed_events = context.env.events().all();
    let claimed = claimed_events.last().unwrap();
    let claimed_data: (Address, i128) = <(Address, i128)>::from_val(&context.env, &claimed.2);

    assert_eq!(claimed_events.len(), 1);
    assert_eq!(claimed.0, context.rewards_client.address);
    assert_eq!(
        claimed.1,
        (Symbol::new(&context.env, "reward_claimed"), group_id).into_val(&context.env)
    );
    assert_eq!(claimed_data, (context.member.clone(), 300i128));

    context
        .rewards_client
        .transfer(&context.member, &context.outsider, &120);
    let transferred_events = context.env.events().all();
    let transferred = transferred_events.last().unwrap();
    let transferred_data: (Address, Address, i128) =
        <(Address, Address, i128)>::from_val(&context.env, &transferred.2);

    assert_eq!(transferred_events.len(), 1);
    assert_eq!(transferred.0, context.rewards_client.address);
    assert_eq!(
        transferred.1,
        (Symbol::new(&context.env, "reward_transfer"),).into_val(&context.env)
    );
    assert_eq!(
        transferred_data,
        (context.member.clone(), context.outsider.clone(), 120i128)
    );

    context.rewards_client.burn(&context.outsider, &20);
    let burned_events = context.env.events().all();
    let burned = burned_events.last().unwrap();
    let burned_data: (Address, i128) = <(Address, i128)>::from_val(&context.env, &burned.2);

    assert_eq!(burned_events.len(), 1);
    assert_eq!(burned.0, context.rewards_client.address);
    assert_eq!(
        burned.1,
        (Symbol::new(&context.env, "reward_burned"),).into_val(&context.env)
    );
    assert_eq!(burned_data, (context.outsider.clone(), 20i128));
}

#[test]
fn claim_requires_pending_rewards() {
    let context = setup();
    let group_id = 10;

    register_group(&context, group_id);

    let result = context
        .rewards_client
        .try_claim_rewards(&context.member, &group_id);

    assert_eq!(result, Err(Ok(Error::NoRewardsAvailable)));
}

#[test]
fn claim_requires_the_user_to_still_be_a_group_member() {
    let context = setup();
    let group_id = 11;

    register_group(&context, group_id);
    record_contribution(&context, group_id, &context.member, 125);

    let result = context
        .rewards_client
        .try_claim_rewards(&context.member, &group_id);

    assert_eq!(result, Err(Ok(Error::NotEligible)));
}

#[test]
fn duplicate_group_registration_with_the_same_owner_is_idempotent() {
    let context = setup();
    let group_id = 15;

    register_group(&context, group_id);

    context
        .rewards_client
        .register_group(&group_id, &context.group_owner);

    assert!(context.rewards_client.is_group_registered(&group_id));
    assert_eq!(context.rewards_client.group_owner(&group_id), context.group_owner);
}

#[test]
fn duplicate_group_registration_with_a_different_owner_is_rejected() {
    let context = setup();
    let group_id = 16;

    register_group(&context, group_id);

    let result = context
        .rewards_client
        .try_register_group(&group_id, &context.member);

    assert_eq!(result, Err(Ok(Error::AlreadyGroupRegistered)));
}

#[test]
fn only_the_configured_admin_can_link_the_core_contract() {
    let context = setup();

    let result = context
        .rewards_client
        .try_set_core_contract(&context.member, &context.core_client.address);

    assert_eq!(result, Err(Ok(Error::Unauthorized)));
    assert_eq!(context.rewards_client.core_contract(), Some(context.core_client.address.clone()));
    assert_eq!(context.rewards_client.metadata().decimals, 7);
}