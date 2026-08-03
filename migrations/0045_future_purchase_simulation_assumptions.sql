BEGIN;

ALTER TABLE public.future_purchase_simulations
  ADD COLUMN IF NOT EXISTS include_liquid_assets boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS include_personal_debts boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS include_card_commitments boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS include_expected_receivables boolean NOT NULL DEFAULT false;

COMMIT;
