BEGIN;

ALTER TABLE public.future_purchase_simulations
  ADD COLUMN IF NOT EXISTS include_personal_receivables boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS include_card_receivables boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS selected_receivable_person_ids jsonb;

COMMIT;
