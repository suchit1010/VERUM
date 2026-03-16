import React, { useState, useEffect } from "react";
import { Box, Text, Newline, render, useInput } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import { PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "@stbr/sss-token";
import { AnchorProvider } from "@coral-xyz/anchor";

type AppMode = "loading" | "dashboard" | "error" | "action_mint" | "action_burn" | "action_pause";

export interface AppProps {
  mintAddress: string;
  provider: AnchorProvider;
}

export function App({ mintAddress, provider }: AppProps) {
  const [mode, setMode] = useState<AppMode>("loading");
  const [stablecoin, setStablecoin] = useState<SolanaStablecoin | null>(null);
  const [config, setConfig] = useState<any>(null);
  const [supply, setSupply] = useState<bigint | null>(null);
  const [paused, setPaused] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [logMsg, setLogMsg] = useState("");

  // Input states
  const [inputAddress, setInputAddress] = useState("");
  const [inputAmount, setInputAmount] = useState("");

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === "c")) {
      if (mode !== "dashboard" && mode !== "loading" && mode !== "error") {
        setMode("dashboard");
      } else {
        process.exit(0);
      }
    }
  });

  const refreshData = async (coin = stablecoin) => {
    if (!coin) return;
    try {
      const cfg = await coin.getConfig();
      const sup = await coin.getTotalSupply();
      const p = await coin.isPaused();
      setConfig(cfg);
      setSupply(sup);
      setPaused(p);
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to refresh data");
    }
  };

  useEffect(() => {
    async function load() {
      try {
        const mintPubkey = new PublicKey(mintAddress);
        const coin = await SolanaStablecoin.load(provider, mintPubkey);
        setStablecoin(coin);
        await refreshData(coin);
        setMode("dashboard");
      } catch (err: any) {
        setErrorMsg(err?.message || "Failed to load stablecoin. Is the mint address correct?");
        setMode("error");
      }
    }
    load();
  }, [mintAddress, provider]);

  const handleActionSelect = (item: any) => {
    const act = item.value;
    if (act === "refresh") {
      refreshData();
      setLogMsg("Data refreshed.");
    } else if (act === "mint") {
      setInputAddress("");
      setInputAmount("");
      setMode("action_mint");
    } else if (act === "burn") {
      setInputAmount("");
      setMode("action_burn");
    } else if (act === "pause") {
      setMode("action_pause");
    } else if (act === "quit") {
      process.exit(0);
    }
  };

  const executeMint = async () => {
    if (!stablecoin) return;
    try {
      setLogMsg("Minting...");
      const tx = await stablecoin.mint({
        recipient: new PublicKey(inputAddress),
        amount: BigInt(inputAmount),
        minter: (provider.wallet as any).payer, // uses the provider's wallet keypair
      });
      setLogMsg(`Minted successfully! TX: ${tx}`);
      refreshData();
    } catch (err: any) {
      setLogMsg(`Mint failed: ${err.message}`);
    }
    setMode("dashboard");
  };

  const executeBurn = async () => {
    if (!stablecoin) return;
    try {
      setLogMsg("Burning...");
      const tx = await stablecoin.burn({
        amount: BigInt(inputAmount),
        burner: (provider.wallet as any).payer,
      });
      setLogMsg(`Burned successfully! TX: ${tx}`);
      refreshData();
    } catch (err: any) {
      setLogMsg(`Burn failed: ${err.message}`);
    }
    setMode("dashboard");
  };

  const handleTogglePause = async () => {
    if (!stablecoin) return;
    try {
      setLogMsg("Toggling pause...");
      let tx;
      if (paused) {
        tx = await stablecoin.unpause((provider.wallet as any).payer);
      } else {
        tx = await stablecoin.pause((provider.wallet as any).payer);
      }
      setLogMsg(`Pause toggled successfully! TX: ${tx}`);
      refreshData();
    } catch (err: any) {
      setLogMsg(`Pause toggle failed: ${err.message}`);
    }
    setMode("dashboard");
  };

  if (mode === "loading") {
    return <Text color="yellow">Loading stablecoin {mintAddress}...</Text>;
  }

  if (mode === "error") {
    return (
      <Box flexDirection="column" padding={1} borderStyle="round" borderColor="red">
        <Text color="red" bold>Error loading stablecoin:</Text>
        <Text color="red">{errorMsg}</Text>
        <Newline />
        <Text color="gray">Press ESC or Ctrl+C to exit.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* HEADER */}
      <Box borderStyle="round" borderColor="cyan" padding={1} flexDirection="column">
        <Text bold color="cyan">SSS Token Admin Dashboard</Text>
        {config && (
          <>
            <Text>Name: <Text color="green">{config.name}</Text></Text>
            <Text>Symbol: <Text color="green">{config.symbol}</Text></Text>
            <Text>Mint: <Text color="green">{mintAddress}</Text></Text>
            <Text>Admin: <Text color="green">{config.authority.toBase58()}</Text></Text>
            <Text>Total Supply: <Text color="blue">{supply !== null ? supply.toString() : "0"}</Text></Text>
            <Text>Status: {paused ? <Text color="red" bold>PAUSED</Text> : <Text color="green" bold>ACTIVE</Text>}</Text>
          </>
        )}
      </Box>

      {/* EVENT LOG */}
      <Box paddingY={1}>
        <Text color="gray">Log: {logMsg || "Awaiting action..."}</Text>
      </Box>

      {/* ACTION AREAS */}
      {mode === "dashboard" && (
        <Box flexDirection="column">
          <Text bold underline>Select Action:</Text>
          <SelectInput
            items={[
              { label: "Mint Tokens", value: "mint" },
              { label: "Burn Tokens", value: "burn" },
              { label: paused ? "Unpause Token" : "Pause Token", value: "pause" },
              { label: "Refresh Data", value: "refresh" },
              { label: "Quit", value: "quit" }
            ]}
            onSelect={handleActionSelect}
          />
        </Box>
      )}

      {mode === "action_mint" && (
        <Box flexDirection="column">
          <Text bold color="yellow">--- MINT TOKENS ---</Text>
          <Box>
            <Text>Recipient Pubkey: </Text>
            <TextInput value={inputAddress} onChange={setInputAddress} />
          </Box>
          <Box>
            <Text>Amount (raw integer): </Text>
            <TextInput value={inputAmount} onChange={setInputAmount} onSubmit={executeMint} />
          </Box>
          <Text color="gray">Press UP/DOWN to navigate, ENTER to submit. ESC to cancel (Ctrl+C)</Text>
        </Box>
      )}

      {mode === "action_burn" && (
        <Box flexDirection="column">
          <Text bold color="yellow">--- BURN TOKENS (from your wallet) ---</Text>
          <Box>
            <Text>Amount (raw integer): </Text>
            <TextInput value={inputAmount} onChange={setInputAmount} onSubmit={executeBurn} />
          </Box>
          <Text color="gray">Press ENTER to submit.</Text>
        </Box>
      )}

      {mode === "action_pause" && (
        <Box flexDirection="column">
          <Text bold color="yellow">Are you sure you want to {paused ? "UNPAUSE" : "PAUSE"} the token?</Text>
          <SelectInput
            items={[
              { label: "Yes, do it", value: "yes" },
              { label: "No, cancel", value: "no" }
            ]}
            onSelect={(item: any) => {
              if (item.value === "yes") handleTogglePause();
              else setMode("dashboard");
            }}
          />
        </Box>
      )}
    </Box>
  );
}

export function startApp(mintAddress: string, provider: AnchorProvider) {
  render(<App mintAddress={mintAddress} provider={provider} />);
}
