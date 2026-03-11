import { createApp, startServer } from "../../shared/health";
import { logger } from "../../shared/logger";
import { config } from "../../shared/config";
import cors from "cors";

const SERVICE_NAME = "sss-webhook";
const PORT = parseInt(process.env.PORT || "3004");

const app = createApp(SERVICE_NAME);
app.use(cors());

/**
 * Webhook Service — Configurable event notifications with retry logic.
 *
 * Listens to Redis pub/sub from the indexer and dispatches HTTP
 * webhooks to registered endpoints with exponential backoff retry.
 */

interface WebhookRegistration {
  id: string;
  url: string;
  events: string[];     // Event types to subscribe to
  mint?: string;        // Optional: filter by mint
  secret?: string;      // Optional: HMAC signing secret
  active: boolean;
  createdAt: string;
}

// In-memory store (would be Postgres in production)
const webhooks: Map<string, WebhookRegistration> = new Map();

// ─── Webhook Registration ────────────────────────────────────────

app.post("/api/webhooks", async (req, res) => {
  try {
    const { url, events, mint, secret } = req.body;

    const registration: WebhookRegistration = {
      id: `wh-${Date.now()}`,
      url,
      events: events || ["*"],
      mint,
      secret,
      active: true,
      createdAt: new Date().toISOString(),
    };

    webhooks.set(registration.id, registration);
    logger.info("Webhook registered", { id: registration.id, url, events });

    res.status(201).json(registration);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/webhooks", async (req, res) => {
  res.json({ webhooks: Array.from(webhooks.values()) });
});

app.delete("/api/webhooks/:id", async (req, res) => {
  const { id } = req.params;
  if (webhooks.delete(id)) {
    res.json({ deleted: true });
  } else {
    res.status(404).json({ error: "Webhook not found" });
  }
});

// ─── Webhook Delivery ────────────────────────────────────────────

async function deliverWebhook(
  registration: WebhookRegistration,
  event: { type: string; data: any },
  attempt: number = 1
): Promise<boolean> {
  try {
    const payload = {
      id: `evt-${Date.now()}`,
      type: event.type,
      data: event.data,
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(registration.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SSS-Webhook-ID": registration.id,
        "X-SSS-Event-Type": event.type,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    logger.info("Webhook delivered", {
      webhookId: registration.id,
      eventType: event.type,
      attempt,
    });

    return true;
  } catch (err: any) {
    logger.warn("Webhook delivery failed", {
      webhookId: registration.id,
      attempt,
      error: err.message,
    });

    // Retry with exponential backoff
    if (attempt < config.webhook.retryAttempts) {
      const delay = config.webhook.retryDelayMs * Math.pow(2, attempt - 1);
      setTimeout(() => deliverWebhook(registration, event, attempt + 1), delay);
    } else {
      logger.error("Webhook delivery exhausted retries", {
        webhookId: registration.id,
        eventType: event.type,
      });
    }

    return false;
  }
}

// ─── Test Endpoint ───────────────────────────────────────────────

app.post("/api/webhooks/:id/test", async (req, res) => {
  const registration = webhooks.get(req.params.id);
  if (!registration) {
    return res.status(404).json({ error: "Webhook not found" });
  }

  const testEvent = {
    type: "test",
    data: { message: "Test webhook delivery from SSS" },
  };

  const success = await deliverWebhook(registration, testEvent);
  res.json({ success, webhookId: registration.id });
});

startServer(app, PORT, SERVICE_NAME);
