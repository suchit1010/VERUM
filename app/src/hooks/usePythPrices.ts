// app/src/hooks/usePythPrices.ts
// Streams live prices from Pyth Hermes WebSocket.
// Fallback to REST polling every 3s if WebSocket unavailable.

import { useState, useEffect, useRef } from "react";
import { HermesClient } from "@pythnetwork/hermes-client";
import { PYTH_FEED_IDS } from "../utils/constants";

export interface AssetPrice {
  price:       number;
  conf:        number;
  confBps:     number;
  publishTime: number;
  stale:       boolean;
}

export type PriceMap = Record<string, AssetPrice>;

const HERMES_URL  = "https://hermes.pyth.network";
const POLL_MS     = 3_000;
const STALE_SECS  = 60;

const FEED_IDS = Object.values(PYTH_FEED_IDS);
const FEED_KEYS = Object.keys(PYTH_FEED_IDS) as (keyof typeof PYTH_FEED_IDS)[];

export function usePythPrices() {
  const [prices, setPrices]   = useState<PriceMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const client                = useRef<HermesClient | null>(null);
  const intervalRef           = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    client.current = new HermesClient(HERMES_URL);

    async function fetchPrices() {
      try {
        const updates = await client.current!.getLatestPriceUpdates(FEED_IDS);
        const now     = Math.floor(Date.now() / 1000);
        const map: PriceMap = {};

        updates.parsed?.forEach((update, i) => {
          const key    = FEED_KEYS[i];
          const raw    = Number(update.price.price);
          const expo   = update.price.expo;
          const price  = raw * Math.pow(10, expo);
          const conf   = Number(update.price.conf) * Math.pow(10, expo);
          const confBps = price > 0 ? (conf / price) * 10_000 : 0;
          const pt     = update.price.publish_time;

          map[key] = {
            price,
            conf,
            confBps,
            publishTime: pt,
            stale: (now - pt) > STALE_SECS,
          };
        });

        setPrices(map);
        setLoading(false);
        setError(null);
      } catch (e: any) {
        setError(e?.message ?? "Pyth fetch failed");
        setLoading(false);
      }
    }

    fetchPrices();
    intervalRef.current = setInterval(fetchPrices, POLL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const btcConfBps = prices["BTC"]?.confBps ?? 0;

  return { prices, loading, error, btcConfBps };
}
