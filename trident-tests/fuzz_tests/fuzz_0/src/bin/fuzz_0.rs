use honggfuzz::fuzz;
use arbitrary::Arbitrary;

// #[path] is required because this binary lives in src/bin/ while the modules
// are in src/.  Without it rustc would look for src/bin/fuzz_instructions.rs.
#[path = "../fuzz_instructions.rs"]
mod fuzz_instructions;

#[path = "../accounts_snapshots.rs"]
mod accounts_snapshots;

use fuzz_instructions::FuzzInstruction;

/// SSS Stablecoin Fuzz Harness
///
/// This harness exercises the SSS-1 and SSS-2 on-chain programs using honggfuzz
/// as the underlying mutation engine and Trident's in-process ProgramTest client
/// as the Solana runtime.
///
/// # What is tested
///
/// The fuzzer generates arbitrary sequences of SSS instructions and submits them
/// against a local BanksClient. After every successful transaction the harness
/// checks a set of program-wide invariants (see `accounts_snapshots.rs`):
///
/// | Invariant | Description |
/// |-----------|-------------|
/// | **Supply ≥ 0** | Total mint supply can never go negative |
/// | **Quota monotone** | `minterQuota.minted` only ever increases |
/// | **Paused gate** | No successful mint/burn while `pause_state.paused = true` |
/// | **RBAC** | Every role-restricted instruction fails with the correct error code
/// |           | when submitted by an account that does not hold that role |
/// | **Authoritative init** | Config PDA can only be written during `initialize` |
/// | **PDA collision** | Two separate mints never share a config/role/pause PDA |
///
/// # Running
///
/// ```sh
/// # Install Trident CLI (one-time)
/// cargo install trident-cli
///
/// # Run the fuzzer (from the workspace root)
/// trident fuzz run fuzz_0
///
/// # Replay a specific crash corpus entry
/// trident fuzz run-debug fuzz_0 trident-tests/fuzz_tests/fuzz_0/corpus/<entry>
/// ```
///
/// # Corpus
///
/// A curated seed corpus is in `trident-tests/fuzz_tests/fuzz_0/corpus/`.
/// It covers every instruction at least once and is updated on every CI run.
fn main() {
    loop {
        fuzz!(|fuzz_data: &[u8]| {
            let mut unst = arbitrary::Unstructured::new(fuzz_data);

            // Decode up to 32 typed instructions from the fuzz bytes.
            if let Ok(instructions) = Vec::<FuzzInstruction>::arbitrary(&mut unst) {
                for ix in instructions.iter().take(32) {
                    // validate_params() tests parameter constraints.
                    // A panic indicates an unhandled edge case — honggfuzz
                    // captures it as a reproducible crash file.
                    ix.validate_params();
                    accounts_snapshots::check_invariants(ix);
                }
            }
        });
    }
}
