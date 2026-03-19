export const config = {
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || "http://localhost:8899",
    wsUrl: process.env.SOLANA_WS_URL || "ws://localhost:8900",
    programId: process.env.SSS_PROGRAM_ID || "SSS1111111111111111111111111111111111111111",
    hookProgramId: process.env.SSS_HOOK_PROGRAM_ID || "SSSHOOK1111111111111111111111111111111111",
  },
  database: {
    url: process.env.DATABASE_URL || "postgres://sss:sss_password@localhost:5432/sss_stablecoin",
  },
  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
  },
  webhook: {
    retryAttempts: parseInt(process.env.WEBHOOK_RETRY_ATTEMPTS || "3"),
    retryDelayMs: parseInt(process.env.WEBHOOK_RETRY_DELAY_MS || "5000"),
  },
};
