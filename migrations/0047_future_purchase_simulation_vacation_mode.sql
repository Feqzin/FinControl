BEGIN;

ALTER TABLE public.future_purchase_simulations
  ADD COLUMN IF NOT EXISTS include_vacation_plans boolean NOT NULL DEFAULT false;

COMMIT;
