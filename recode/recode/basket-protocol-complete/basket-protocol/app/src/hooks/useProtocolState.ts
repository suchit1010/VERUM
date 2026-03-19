// app/src/hooks/useProtocolState.ts
import { useState, useEffect, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, Idl } from "@coral-xyz/anchor";
import { BASKET_VAULT_PROGRAM_ID } from "../utils/constants";
import { fetchProtocolState, getAdaptiveCR, ProtocolState } from "../utils/basket-sdk";
import { usePythPrices } from "./usePythPrices";

// Minimal IDL stub — replace with generated IDL after `anchor build`
const IDL_STUB: Idl = {
  version: "0.1.0",
  name:    "basket_vault",
  instructions: [],
  accounts: [
    {
      name: "globalConfig",
      type: {
        kind: "struct" as const,
        fields: [
          { name: "basketMint",             type: "publicKey" },
          { name: "sssProgram",             type: "publicKey" },
          { name: "svsProgramId",           type: "publicKey" },
          { name: "rebalanceAuthority",     type: "publicKey" },
          { name: "emergencyAuthority",     type: "publicKey" },
          { name: "vaultAuthorityBump",     type: "u8"        },
          { name: "totalMinted",            type: "u64"       },
          { name: "insuranceFundLamports",  type: "u64"       },
          { name: "emergencyMode",          type: "bool"      },
          { name: "lastRebalanceTimestamp", type: "i64"       },
          { name: "lastRebalanceRequestId", type: { array: ["u8", 32] } },
          { name: "assetRegistry",          type: { vec: "bytes" } },
        ],
      },
    },
  ],
  errors: [],
};

export function useProtocolState() {
  const { connection }          = useConnection();
  const wallet                  = useWallet();
  const { prices, btcConfBps }  = usePythPrices();

  const [state, setState]         = useState<ProtocolState | null>(null);
  const [loading, setLoading]     = useState(false);
  const [program, setProgram]     = useState<Program | null>(null);

  // Initialize program when wallet connects
  useEffect(() => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      setProgram(null);
      return;
    }
    const provider = new AnchorProvider(connection, wallet as any, {
      commitment: "confirmed",
    });
    // In production: import IDL from "../../target/idl/basket_vault.json"
    const prog = new Program(IDL_STUB, BASKET_VAULT_PROGRAM_ID, provider);
    setProgram(prog);
  }, [wallet.publicKey, connection]);

  // Fetch protocol state
  const refresh = useCallback(async () => {
    if (!program) return;
    setLoading(true);
    try {
      const s = await fetchProtocolState(program);
      const { cr } = getAdaptiveCR(btcConfBps);
      setState({ ...s, adaptiveCR: cr, btcConfBps });
    } catch (e) {
      console.error("fetchProtocolState:", e);
    } finally {
      setLoading(false);
    }
  }, [program, btcConfBps]);

  useEffect(() => { refresh(); }, [refresh]);

  return { state, loading, program, prices, btcConfBps, refresh };
}
