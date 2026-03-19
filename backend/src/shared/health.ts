import express from "express";
import { logger } from "./logger";

/**
 * Create a health check endpoint for a service
 */
export function createHealthRouter(serviceName: string) {
  const router = express.Router();

  router.get("/health", (req, res) => {
    res.json({
      service: serviceName,
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  return router;
}

/**
 * Create a base Express app with common middleware
 */
export function createApp(serviceName: string) {
  const app = express();

  app.use(express.json());
  app.use(createHealthRouter(serviceName));

  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

/**
 * Start an Express server
 */
export function startServer(app: express.Application, port: number, serviceName: string) {
  app.listen(port, () => {
    logger.info(`${serviceName} listening on port ${port}`);
  });
}
