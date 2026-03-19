import React, { useState } from 'react';
import { launchToken } from '@deaura/limitless-sdk';
import { useWallet } from '@solana/wallet-adapter-react';

const LaunchVerumToken = () => {
  const wallet = useWallet();
  const [status, setStatus] = useState<string>('');
  const [mintAddress, setMintAddress] = useState<string>('');

  const handleLaunchToken = async () => {
    try {
      if (!wallet?.publicKey) {
        setStatus("🔴 Please connect your wallet before launching a token.");
        return;
      }

      setStatus("⏳ Preparing to launch VERUM on Mainnet...");

      const params = {
        rpcurl: "https://api.mainnet-beta.solana.com",
        wallet,
        metadata: {
          name: "VERUM",
          symbol: "VERUM",
          // This must be a valid JSON URI for the token metadata!
          uri: "https://raw.githubusercontent.com/sonisha/verum/main/metadata.json", 
        },
        tokenSupply: 1_000_000, 
        liquidityAmount: 500,   
        tickSpacing: 128,       
        feeTierAddress: "G319n1BPjeXjAfheDxYe8KWZM7FQhQCJerWRK2nZYtiJ", 
        integratorAccount: null,
        salesRepAccount: null,
        onStep: (step: any) => setStatus(`🪄 Step: ${step}`),
      };

      const response = await launchToken(params as any);

      if (!response.success) {
        setStatus(`🔴 Launch failed: ${response.error}`);
        return;
      }

      console.log("Token launched successfully:", response.data);
      setStatus(`✅ VERUM Launched Successfully!`);
      setMintAddress(response.data?.mint || JSON.stringify(response.data));
    } catch (error: any) {
      console.error("Unexpected error launching token:", error);
      setStatus(`🔴 Unexpected Error: ${error.message || "Unknown error"}`);
    }
  };

  return (
    <div className="mt-8 p-6 bg-slate-800 rounded-xl border border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.2)]">
      <h2 className="text-2xl font-bold text-white mb-2 py-1">🚀 Launch VERUM on DeAura</h2>
      <p className="text-slate-300 mb-6 text-sm">
        Clicking this will trigger the DeAura Limitless SDK to launch the token on Mainnet. Requirements: Your wallet must be on Mainnet and funded.
      </p>

      <button
        onClick={handleLaunchToken}
        className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold py-3 px-6 rounded-lg transition-all"
      >
        Launch Token Now
      </button>

      {status && (
        <div className="mt-4 p-4 bg-slate-900 rounded-lg text-sm text-slate-300 font-mono break-words">
          {status}
        </div>
      )}

      {mintAddress && (
        <div className="mt-2 p-4 bg-green-900/50 border border-green-500 rounded-lg text-sm text-green-300 font-mono">
          <strong>Mint Address:</strong> {mintAddress}
        </div>
      )}
    </div>
  );
};

export default LaunchVerumToken;
