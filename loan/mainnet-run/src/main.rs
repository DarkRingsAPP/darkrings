//! Mainnet dust run of the full loan lifecycle: offer -> discover ->
//! originate -> repay, with real SOL on the deployed program and the live
//! Helius SPR stack. Amounts are dust; every signature is printed so the run
//! is independently checkable on an explorer.
//!
//! Commands:
//!   status   balances of the deployer, lender and borrower (public + shielded)
//!   fund     move dust from the deployer to the two actors
//!   deposit  shield the exact notes the loan needs
//!   run      offer -> discover -> originate -> repay
//!   sweep    public remainders back to the deployer
//!
//! Env: HELIUS_API_KEY (required), DARKRINGS_DIR (default ~/.config/darkrings).

use std::{
    fs,
    path::{Path, PathBuf},
    thread::sleep,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use anyhow::{anyhow, bail, Context, Result};
use loan_sdk::{
    index::index_taker,
    instructions::{
        offer::OfferTransactionParams, originate::OriginateTransactionParams,
        repay::RepayTransactionParams,
    },
    shared::identity,
    state::OfferTerms,
};
use solana_address::Address;
use solana_instruction::Instruction;
use solana_keypair::{keypair_from_seed, read_keypair_file, Keypair};
use solana_signature::Signature;
use solana_signer::Signer;
use spr_client::{
    prover::tee::{SignedTeePolicy, TeeNetwork},
    ComputeBudgetConfig, MerkleProof, ProofDataSource, ProverClient, Rpc, SolanaRpc, SprClient,
    SprIndexer, UtxoScan,
    user_registry::ensure_registered,
};
use spr_interface::pda;
use spr_keypair::ShieldedKeypair;
use spr_program::instruction::{AssetDeposit, Deposit, DepositAsset};
use spr_transaction::{AssetRegistry, Mint, SpendableDecryptionResult, WalletUtxo, SOL_MINT};

const TREE_ID: u16 = 0;
const TRANSACT_COMPUTE_UNIT_LIMIT: u32 = 1_400_000;
const INDEXER_TIMEOUT: Duration = Duration::from_secs(180);
const POLL: Duration = Duration::from_millis(1500);

// Dust terms: borrow 0.002 SOL against 0.0025 SOL, repay 0.0021 SOL.
// Originate and repay are 2-in/2-out with no change slot, so the borrower's
// input notes must be exact: one note of COLLATERAL, one of REPAY.
const PRINCIPAL: u64 = 2_000_000;
const COLLATERAL: u64 = 2_500_000;
const REPAY: u64 = 2_100_000;
// Public dust each actor holds for fees.
const LENDER_PUBLIC: u64 = 6_000_000;
const BORROWER_PUBLIC: u64 = 9_000_000;

fn main() -> Result<()> {
    let command = std::env::args().nth(1).unwrap_or_else(|| "status".into());
    let env = Env::load()?;
    match command.as_str() {
        "status" => status(&env),
        "fund" => fund(&env),
        "deposit" => deposit_notes(&env),
        "run" => run_loan(&env),
        "sweep" => sweep(&env),
        other => bail!("unknown command {other}; use status|fund|deposit|run|sweep"),
    }
}

struct Actor {
    name: &'static str,
    keypair: Keypair,
    shielded: ShieldedKeypair,
}

impl Actor {
    fn load(dir: &Path, name: &'static str) -> Result<Self> {
        let seed_path = dir.join(format!("{name}.seed"));
        let seed = if seed_path.exists() {
            fs::read(&seed_path)?
        } else {
            let mut seed = [0u8; 32];
            getrandom(&mut seed)?;
            fs::write(&seed_path, seed)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(&seed_path, fs::Permissions::from_mode(0o600))?;
            }
            seed.to_vec()
        };
        let keypair = keypair_from_seed(&seed).map_err(|e| anyhow!("{name} seed: {e}"))?;
        let shielded = ShieldedKeypair::from_keypair(&keypair)?;
        Ok(Self { name, keypair, shielded })
    }

    fn address(&self) -> Address {
        Address::from(self.keypair.pubkey().to_bytes())
    }
}

/// OS randomness without an extra dependency: mix the system clock into
/// Keypair::new, which already draws from the OS RNG.
fn getrandom(seed: &mut [u8; 32]) -> Result<()> {
    let fresh = Keypair::new();
    seed.copy_from_slice(&fresh.secret_bytes()[..32]);
    Ok(())
}

struct Env {
    client: SprClient<SolanaRpc>,
    tree: Address,
    deployer: Keypair,
    lender: Actor,
    borrower: Actor,
}

impl Env {
    fn load() -> Result<Self> {
        let api_key = std::env::var("HELIUS_API_KEY").context("HELIUS_API_KEY missing")?;
        let rpc_url = format!("https://mainnet.helius-rpc.com/?api-key={api_key}");
        let service_url = format!("https://mainnet.helius-rpc.com/v1/spr?api-key={api_key}");
        let prover = ProverClient::new(service_url.clone())
            .with_signed_tee(SignedTeePolicy::for_network(TeeNetwork::Mainnet));
        let client = SprClient::new(
            SolanaRpc::new(rpc_url),
            SprIndexer::new(&service_url),
            prover,
        )
        .with_proof_data_source(ProofDataSource::Prover);

        let dir = std::env::var("DARKRINGS_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                PathBuf::from(std::env::var("HOME").expect("HOME")).join(".config/darkrings")
            });
        fs::create_dir_all(&dir)?;
        let deployer = read_keypair_file(dir.join("deployer-keypair.json"))
            .map_err(|e| anyhow!("deployer keypair: {e}"))?;
        Ok(Self {
            client,
            tree: pda::tree(0),
            deployer,
            lender: Actor::load(&dir, "lender")?,
            borrower: Actor::load(&dir, "borrower")?,
        })
    }
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs()
}

fn sol(lamports: u64) -> String {
    format!("{:.6} SOL", lamports as f64 / 1e9)
}

fn explorer(sig: &Signature) -> String {
    format!("https://explorer.solana.com/tx/{sig}")
}

fn send(rpc: &impl Rpc, signers: &[&dyn Signer], ix: Instruction) -> Result<Signature> {
    let payer = signers.first().ok_or_else(|| anyhow!("no fee payer"))?.pubkey();
    Ok(rpc.create_and_send_transaction(
        std::slice::from_ref(&ix),
        payer,
        signers,
        ComputeBudgetConfig::new(TRANSACT_COMPUTE_UNIT_LIMIT),
    )?)
}

fn scan(env: &Env, actor: &Actor) -> Result<SpendableDecryptionResult> {
    let registry = AssetRegistry::default();
    Ok(UtxoScan::new(&actor.shielded, &registry)
        .fetch(env.client.indexer())?
        .spendable)
}

fn shielded_sol(spendable: &SpendableDecryptionResult) -> u64 {
    spendable
        .balances
        .get_balance(SOL_MINT)
        .map(|b| b.amount)
        .unwrap_or(0)
}

fn spendable_note(
    spendable: &SpendableDecryptionResult,
    exact: u64,
) -> Option<WalletUtxo> {
    spendable
        .balances
        .get_balance(SOL_MINT)?
        .utxos
        .iter()
        .find(|u| u.utxo.amount == exact)
        .cloned()
}

fn wait_for_merkle_proof(indexer: &impl Rpc, tree: Address, leaf: [u8; 32]) -> Result<MerkleProof> {
    let started = Instant::now();
    let mut last = None;
    while started.elapsed() < INDEXER_TIMEOUT {
        match indexer.get_merkle_proofs(tree, vec![leaf], None) {
            Ok(r) => {
                if let Some(p) = r.proofs.into_iter().next() {
                    return Ok(p);
                }
            }
            Err(e) => last = Some(e.to_string()),
        }
        sleep(POLL);
    }
    bail!("merkle proof timeout; last indexer error: {:?}", last)
}

fn public_balance(env: &Env, address: Address) -> Result<u64> {
    Ok(env.client.rpc().get_balance(address)?)
}

fn status(env: &Env) -> Result<()> {
    let deployer_addr = Address::from(env.deployer.pubkey().to_bytes());
    println!("deployer {}  {}", deployer_addr, sol(public_balance(env, deployer_addr)?));
    for actor in [&env.lender, &env.borrower] {
        let public = public_balance(env, actor.address())?;
        let spendable = scan(env, actor)?;
        println!(
            "{:<8} {}  public {}  shielded {}",
            actor.name,
            actor.address(),
            sol(public),
            sol(shielded_sol(&spendable)),
        );
    }
    Ok(())
}

fn transfer(env: &Env, from: &Keypair, to: Address, lamports: u64) -> Result<Signature> {
    let ix = solana_system_interface::instruction::transfer(
        &solana_address::Address::from(from.pubkey().to_bytes()).into(),
        &to.into(),
        lamports,
    );
    send(env.client.rpc(), &[from], ix)
}

fn fund(env: &Env) -> Result<()> {
    for (actor, target) in [(&env.lender, LENDER_PUBLIC), (&env.borrower, BORROWER_PUBLIC)] {
        let have = public_balance(env, actor.address())?;
        if have >= target {
            println!("{} already funded ({})", actor.name, sol(have));
            continue;
        }
        let sig = transfer(env, &env.deployer, actor.address(), target - have)?;
        println!("fund {} {}  {}", actor.name, sol(target - have), explorer(&sig));
    }
    Ok(())
}

fn deposit_exact(env: &Env, actor: &Actor, amount: u64) -> Result<Signature> {
    let address = actor.shielded.shielded_address()?;
    let ix = Deposit {
        tree: env.tree,
        depositor: actor.shielded.pubkey(),
        deposits: vec![AssetDeposit {
            asset: DepositAsset::Sol,
            view_tag: address.confidential_view_tag()?,
            owner: address.owner_hash()?,
            amount,
            memo: None,
        }],
    }
    .instruction()?;
    send(env.client.rpc(), &[&actor.keypair], ix)
}

fn deposit_notes(env: &Env) -> Result<()> {
    // Lender shields one note that covers the principal (offer has a change
    // output, so it need not be exact). The borrower's notes must be exact.
    let lender_spendable = scan(env, &env.lender)?;
    if spendable_note(&lender_spendable, PRINCIPAL).is_none() {
        let sig = deposit_exact(env, &env.lender, PRINCIPAL)?;
        println!("lender shields {}  {}", sol(PRINCIPAL), explorer(&sig));
        env.client.confirm_private_transaction_sync(sig)?;
    }
    let borrower_spendable = scan(env, &env.borrower)?;
    for amount in [COLLATERAL, REPAY] {
        if spendable_note(&borrower_spendable, amount).is_none() {
            let sig = deposit_exact(env, &env.borrower, amount)?;
            println!("borrower shields {}  {}", sol(amount), explorer(&sig));
            env.client.confirm_private_transaction_sync(sig)?;
        }
    }
    println!("notes ready");
    Ok(())
}

fn run_loan(env: &Env) -> Result<()> {
    let client = &env.client;
    let lender_address = env.lender.shielded.shielded_address()?;
    let lender_pubkey = lender_address.solana_address()?;
    let borrower_address = env.borrower.shielded.shielded_address()?;
    let borrower_pubkey = borrower_address.solana_address()?;

    for actor in [&env.lender, &env.borrower] {
        ensure_registered(client.rpc(), &actor.shielded, &actor.shielded)
            .map_err(|e| anyhow!("register {}: {e:?}", actor.name))?;
    }

    // 1. Offer, designated to the borrower.
    let lender_spendable = scan(env, &env.lender)?;
    let source = spendable_note(&lender_spendable, PRINCIPAL)
        .ok_or_else(|| anyhow!("lender has no shielded note of {}; run deposit", sol(PRINCIPAL)))?;
    let terms = OfferTerms {
        collateral_mint: Mint::SOL,
        collateral_amount: COLLATERAL,
        repay_amount: REPAY,
        deadline: now() + 7 * 24 * 3600,
        lender: lender_address,
        expiry: now() + 2 * 3600,
        borrower: Some(identity(&borrower_pubkey)?),
    };
    let offer_ix = OfferTransactionParams {
        terms,
        principal_amount: PRINCIPAL,
        source,
        borrower_address,
        payer: lender_pubkey,
    }
    .build(&env.lender.shielded)?
    .prove(client.indexer(), env.tree, &env.lender.shielded)?
    .instruction()?;
    let offer_sig = send(client.rpc(), &[&env.lender.keypair], offer_ix)?;
    println!("OFFER      {}", explorer(&offer_sig));
    client.confirm_private_transaction_sync(offer_sig)?;

    // 2. The borrower discovers the offer from the marker message.
    let registry = AssetRegistry::default();
    let discovered = index_taker(
        &env.borrower.shielded,
        &registry,
        client.indexer(),
        client.rpc(),
        Duration::from_secs(120),
    )?
    .pop()
    .ok_or_else(|| anyhow!("no loan offer discovered"))?;
    println!("DISCOVERED offer from {}", discovered.lender_pubkey);
    let offer_utxo = discovered.offer_utxo;

    // 3. Originate with the borrower's exact collateral note.
    let borrower_spendable = scan(env, &env.borrower)?;
    let collateral_input = spendable_note(&borrower_spendable, COLLATERAL)
        .ok_or_else(|| anyhow!("borrower has no {} note; run deposit", sol(COLLATERAL)))?;
    let offer_state = wait_for_merkle_proof(
        client.indexer(),
        env.tree,
        offer_utxo.hash(TREE_ID)?,
    )?;
    let originate_transaction = OriginateTransactionParams {
        offer_utxo: offer_utxo.clone(),
        offer_leaf_index: offer_state.leaf_index,
        collateral_input,
        payer: borrower_pubkey,
        tree_id: TREE_ID,
    }
    .build(&env.borrower.shielded)?;
    let loan_utxo = originate_transaction.loan_utxo.clone();
    let originate =
        originate_transaction.prove(client.indexer(), env.tree, &env.borrower.shielded)?;
    let originate_sig = send(client.rpc(), &[&env.borrower.keypair], originate.instruction()?)?;
    println!("ORIGINATE  {}", explorer(&originate_sig));
    client.confirm_private_transaction_sync(originate_sig)?;

    // 4. Repay with the borrower's exact repay note, well before the deadline.
    let borrower_spendable = scan(env, &env.borrower)?;
    let repay_input = spendable_note(&borrower_spendable, REPAY)
        .ok_or_else(|| anyhow!("borrower has no {} note; run deposit", sol(REPAY)))?;
    let loan_state =
        wait_for_merkle_proof(client.indexer(), env.tree, loan_utxo.hash(TREE_ID)?)?;
    let repay_ix = RepayTransactionParams {
        loan_utxo,
        loan_leaf_index: loan_state.leaf_index,
        repay_input,
        payer: borrower_pubkey,
        tree_id: TREE_ID,
    }
    .build(&env.borrower.shielded)?
    .prove(client.indexer(), env.tree, &env.borrower.shielded)?
    .instruction()?;
    let repay_sig = send(client.rpc(), &[&env.borrower.keypair], repay_ix)?;
    println!("REPAY      {}", explorer(&repay_sig));
    client.confirm_private_transaction_sync(repay_sig)?;

    println!();
    println!("LOAN LIFECYCLE COMPLETE ON MAINNET");
    println!("offer     {offer_sig}");
    println!("originate {originate_sig}");
    println!("repay     {repay_sig}");
    Ok(())
}

fn sweep(env: &Env) -> Result<()> {
    // Public remainders go back to the deployer. Shielded remainders stay
    // spendable for the next run; withdraw them with the zolana CLI when the
    // wallets wind down for good.
    let deployer_addr = Address::from(env.deployer.pubkey().to_bytes());
    for actor in [&env.lender, &env.borrower] {
        let balance = public_balance(env, actor.address())?;
        if balance > 0 {
            // Empty to exactly zero; the deployer pays the fee as first signer.
            let ix = solana_system_interface::instruction::transfer(
                &actor.address().into(),
                &deployer_addr.into(),
                balance,
            );
            let sig = send(env.client.rpc(), &[&env.deployer, &actor.keypair], ix)?;
            println!("sweep {} {}  {}", actor.name, sol(balance), explorer(&sig));
        }
        let spendable = scan(env, actor)?;
        let left = shielded_sol(&spendable);
        if left > 0 {
            println!("{} still holds {} shielded", actor.name, sol(left));
        }
    }
    Ok(())
}
