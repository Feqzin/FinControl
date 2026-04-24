BEGIN;

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_subscription_id text,
  provider_plan_id text,
  external_reference text,
  status text NOT NULL DEFAULT 'pending',
  provider_status text,
  amount numeric(12,2),
  currency text NOT NULL DEFAULT 'BRL',
  started_at timestamp,
  current_period_end timestamp,
  canceled_at timestamp,
  last_webhook_at timestamp,
  last_sync_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  raw_payload jsonb
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id
  ON user_subscriptions (user_id);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_provider
  ON user_subscriptions (provider);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status
  ON user_subscriptions (status);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_external_reference
  ON user_subscriptions (external_reference);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_updated_at
  ON user_subscriptions (updated_at);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_subscriptions_provider_subscription_id
  ON user_subscriptions (provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_subscriptions_provider_external_reference
  ON user_subscriptions (provider, external_reference)
  WHERE external_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS billing_webhook_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  topic text,
  payload jsonb,
  processed_at timestamp,
  status text NOT NULL DEFAULT 'received',
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_provider
  ON billing_webhook_events (provider);

CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_provider_event_id
  ON billing_webhook_events (provider_event_id);

CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_status
  ON billing_webhook_events (status);

CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_created_at
  ON billing_webhook_events (created_at);

CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_webhook_events_provider_event_id
  ON billing_webhook_events (provider, provider_event_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_user_subscriptions_provider'
      AND conrelid = 'user_subscriptions'::regclass
  ) THEN
    ALTER TABLE user_subscriptions
      ADD CONSTRAINT chk_user_subscriptions_provider
      CHECK (provider IN ('mercado_pago'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_user_subscriptions_status'
      AND conrelid = 'user_subscriptions'::regclass
  ) THEN
    ALTER TABLE user_subscriptions
      ADD CONSTRAINT chk_user_subscriptions_status
      CHECK (status IN ('pending', 'active', 'paused', 'canceled', 'expired', 'rejected'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_billing_webhook_events_provider'
      AND conrelid = 'billing_webhook_events'::regclass
  ) THEN
    ALTER TABLE billing_webhook_events
      ADD CONSTRAINT chk_billing_webhook_events_provider
      CHECK (provider IN ('mercado_pago'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_billing_webhook_events_status'
      AND conrelid = 'billing_webhook_events'::regclass
  ) THEN
    ALTER TABLE billing_webhook_events
      ADD CONSTRAINT chk_billing_webhook_events_status
      CHECK (status IN ('received', 'processed', 'ignored', 'error'));
  END IF;
END;
$$;

COMMIT;
