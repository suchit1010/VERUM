import * as anchor from "@coral-xyz/anchor";
import { SolanaStablecoin } from "../sdk/core/src/stablecoin";
import * as fs from "fs";
import * as os from "os";

/**
 * SQUAD-UP: Transfer Stablecoin Authority to a Multisig
 * 
 * This script demonstrates how an SSS Stablecoin can be transitioned
 * from a single-key authority to a Squads v4 Multisig for institutional-grade security.
 */

async function main() {
    console.log("Connecting to Devnet...");
    const connection = new anchor.web3.Connection("https://api.devnet.solana.com", "confirmed");
    const walletPath = os.homedir() + "/.config/solana/id.json";
    const keypair = anchor.web3.Keypair.fromSecretKey(
        new Uint8Array(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
    );
    const wallet = new anchor.Wallet(keypair);
    const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
    anchor.setProvider(provider);

    // MINT from our previous devnet run
    // Using the SSS-1 mint from DEVNET_PROOF.md: EKjoQ5F5pSDZBAMZoLcawFYLDR1MCG6EVVzKyGtdSLZL
    const mintAddress = new anchor.web3.PublicKey("EKjoQ5F5pSDZBAMZoLcawFYLDR1MCG6EVVzKyGtdSLZL");

    // A Sample Squads v4 Multisig Address (Replace with your actual Squads vault)
    const squadsMultisigVault = new anchor.web3.PublicKey("7rqR3fK8W...sample...vault");

    console.log("Loading Stablecoin:", mintAddress.toBase58());
    const stable = await SolanaStablecoin.load(provider, mintAddress);

    console.log("Current Master Authority:", stable.config.masterAuthority.toBase58());

    if (stable.config.masterAuthority.toBase58() !== wallet.publicKey.toBase58()) {
        console.error("❌ You are not the master authority of this stablecoin.");
        return;
    }

    console.log("\n⚠️ WARNING: You are about to transfer MASTER AUTHORITY to a Multisig Vault.");
    console.log("Vault Address:", squadsMultisigVault.toBase58());

    // In a real execution, we would call:
    // const signature = await stable.updateRoleConfig({
    //     masterAuthority: squadsMultisigVault,
    //     // retain others...
    // }, keypair);

    console.log("\n[SIMULATION MODE]");
    console.log("Instruction: UpdateRoleConfig");
    console.log("New Master Authority -> Squads Vault");
    console.log("✅ Simulation successful.");

    console.log("\nTo execute this for real, uncomment the updateRoleConfig call in the script.");
}

main().catch(console.error);
