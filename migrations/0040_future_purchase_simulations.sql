BEGIN;

CREATE TABLE IF NOT EXISTS public.future_purchase_simulations (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  purchase_name text,
  total_amount numeric(12, 2) NOT NULL,
  installment_count integer NOT NULL,
  card_id varchar REFERENCES public.cartoes(id) ON DELETE SET NULL,
  first_installment_month text NOT NULL,
  minimum_reserve numeric(12, 2) NOT NULL DEFAULT 0,
  extra_incomes jsonb NOT NULL DEFAULT '[]'::jsonb,
  result_status text,
  worst_month text,
  lowest_balance numeric(12, 2),
  safe_purchase_amount numeric(12, 2),
  recommended_installments integer,
  monthly_timeline_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_future_purchase_simulations_user_id
  ON public.future_purchase_simulations(user_id);

CREATE INDEX IF NOT EXISTS idx_future_purchase_simulations_card_id
  ON public.future_purchase_simulations(card_id);

CREATE INDEX IF NOT EXISTS idx_future_purchase_simulations_created_at
  ON public.future_purchase_simulations(created_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'future_purchase_simulations_installment_count_check'
      AND conrelid = 'public.future_purchase_simulations'::regclass
  ) THEN
    ALTER TABLE public.future_purchase_simulations
      ADD CONSTRAINT future_purchase_simulations_installment_count_check
      CHECK (installment_count >= 1);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'future_purchase_simulations_total_amount_check'
      AND conrelid = 'public.future_purchase_simulations'::regclass
  ) THEN
    ALTER TABLE public.future_purchase_simulations
      ADD CONSTRAINT future_purchase_simulations_total_amount_check
      CHECK (total_amount >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'future_purchase_simulations_minimum_reserve_check'
      AND conrelid = 'public.future_purchase_simulations'::regclass
  ) THEN
    ALTER TABLE public.future_purchase_simulations
      ADD CONSTRAINT future_purchase_simulations_minimum_reserve_check
      CHECK (minimum_reserve >= 0);
  END IF;
END $$;

COMMIT;
