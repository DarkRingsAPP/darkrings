use anyhow::{anyhow, Result};
use solana_address::Address;
use spr_keypair::ShieldedKeypair;
use spr_program_test::{
    fixture,
    localnet::{FixtureLocalnet, LocalnetPaths, LocalnetPorts},
    SprProgramTest,
};
use spr_transaction::{AssetRegistry, WalletUtxo};
use spr_user_registry_interface::user_registry_program_id;

use std::{
    env,
    path::{Path, PathBuf},
};

#[path = "../../../test-utils/wallet.rs"]
mod wallet;

use wallet::deposit;
pub use wallet::{send, wait_for_merkle_proof, TestWallet};

// SPL the lender shields and offers as principal; SOL the borrower posts as
// collateral; SPL the borrower shields to repay principal plus interest.
pub const LENDER_SHIELD_SPL: u64 = 500_000_000;
pub const PRINCIPAL_AMOUNT: u64 = 300_000_000;
pub const COLLATERAL_AMOUNT: u64 = 250_000_000;
pub const REPAY_AMOUNT: u64 = 330_000_000;

// Each actor is one ed25519 identity: the wallet's signing key doubles as the
// Solana fee payer, and the wallet holds the asset registry and the spendable
// notes its scan found after the deposits.
pub struct TestEnv {
    /// The localnet with its client and default tree. Dropping it stops the
    /// validator, so it lives as long as the test.
    pub localnet: FixtureLocalnet,
    pub lender: TestWallet,
    /// The lender's SPL UTXO the offer spends.
    pub lender_input: WalletUtxo,
    pub borrower: TestWallet,
    pub spl_mint: Address,
}

/// `file` under this workspace's `target/deploy`, where `cargo build-sbf`
/// writes the program.
fn deploy_path(file: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../target/deploy")
        .join(file)
}

/// `ZOLANA_PROVER_KEYS_DIR`, else `~/.config/zolana/proving-keys`, the
/// directory `zolana test-env` keeps the proving keys in.
fn proving_keys_dir() -> Result<PathBuf> {
    if let Ok(dir) = env::var("ZOLANA_PROVER_KEYS_DIR") {
        return Ok(dir.into());
    }
    let home = env::var("HOME").map_err(|_| anyhow!("HOME is not set"))?;
    Ok(Path::new(&home).join(".config/zolana/proving-keys"))
}

/// The CLI, prover, Photon, surfpool and pool program come from the
/// environment (`ZOLANA_CLI_BIN`, `PROVER_BIN`, `ZOLANA_PHOTON_BIN`,
/// `SURFPOOL_BIN`, `SHIELDED_POOL_PROGRAM_PATH`). The keys and the scratch
/// directory are set here: `LocalnetPaths::workspace` alone resolves them
/// inside the cargo git checkout of zolana.
fn localnet_paths() -> Result<LocalnetPaths> {
    Ok(LocalnetPaths {
        proving_keys_dir: proving_keys_dir()?,
        scratch_dir: Path::new(env!("CARGO_MANIFEST_DIR")).join("../target/localnet"),
        ..LocalnetPaths::workspace()
    })
}

/// The user registry program, `USER_REGISTRY_PROGRAM_PATH`, which
/// `scripts/build-localnet.sh` downloads from the `user-registry-v1.0.0`
/// release.
fn user_registry_program_path() -> Result<PathBuf> {
    env::var("USER_REGISTRY_PROGRAM_PATH")
        .map(PathBuf::from)
        .map_err(|_| {
            anyhow!("USER_REGISTRY_PROGRAM_PATH is not set; see scripts/build-localnet.sh")
        })
}

/// Boot the localnet of test number `test` ([`LocalnetPorts::for_test`]); tests
/// running in parallel take distinct numbers.
pub fn setup(test: u16) -> Result<TestEnv> {
    let localnet = FixtureLocalnet::start(
        "darkrings-loan",
        LocalnetPorts::for_test(test)?,
        vec![
            (loan_program::ID, deploy_path("loan_program.so")),
            (user_registry_program_id(), user_registry_program_path()?),
        ],
        &localnet_paths()?,
    )?;
    let payer = fixture::payer();

    let spl_mint = fixture::spl_mint();
    let mut assets = AssetRegistry::default();
    assets.insert(fixture::SPL_ASSET_ID, spl_mint)?;
    let spl_funding = fixture::payer_token_account();

    let lender_shielded_keypair = ShieldedKeypair::from_keypair(&fixture::actor(0))?;
    let borrower_shielded_keypair = ShieldedKeypair::from_keypair(&fixture::actor(1))?;

    // Fund the actors: shield SPL (principal) to the lender; SOL
    // (collateral) and SPL (the later repayment) to the borrower.
    let lender_address = lender_shielded_keypair
        .shielded_address()
        .map_err(|e| anyhow!("lender address: {e:?}"))?;
    let borrower_address = borrower_shielded_keypair
        .shielded_address()
        .map_err(|e| anyhow!("borrower address: {e:?}"))?;
    deposit(
        &localnet,
        &payer,
        SprProgramTest::wallet_spl_shield_data(
            LENDER_SHIELD_SPL,
            &lender_address,
            &spl_mint,
            &spl_funding,
        )?,
    )?;
    deposit(
        &localnet,
        &payer,
        SprProgramTest::wallet_sol_shield_data(COLLATERAL_AMOUNT, &borrower_address)?,
    )?;
    deposit(
        &localnet,
        &payer,
        SprProgramTest::wallet_spl_shield_data(
            REPAY_AMOUNT,
            &borrower_address,
            &spl_mint,
            &spl_funding,
        )?,
    )?;

    // The deposits are wallet-owned and indexed, so each wallet discovers
    // its own through the indexer.
    let lender = TestWallet::scan(lender_shielded_keypair, assets.clone(), &localnet.client)
        .map_err(|e| anyhow!("scan lender deposit: {e:?}"))?;
    let borrower = TestWallet::scan(borrower_shielded_keypair, assets, &localnet.client)
        .map_err(|e| anyhow!("scan borrower deposit: {e:?}"))?;
    let lender_input = lender
        .spendable_utxo(spl_mint, LENDER_SHIELD_SPL)
        .ok_or_else(|| anyhow!("no lender SPL note of {LENDER_SHIELD_SPL}"))?;
    assert_eq!(
        (lender_input.utxo.asset.asset, lender_input.utxo.amount),
        (spl_mint, LENDER_SHIELD_SPL)
    );

    let env = TestEnv {
        localnet,
        lender,
        lender_input,
        borrower,
        spl_mint,
    };
    Ok(env)
}
