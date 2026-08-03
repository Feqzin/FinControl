BEGIN;

ALTER TABLE public.vacation_plans
  ADD COLUMN IF NOT EXISTS gross_salary_amount decimal(12, 2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vacation_plans'
      AND column_name = 'income_competency_offset_months'
  ) THEN
    ALTER TABLE public.vacation_plans
      ADD COLUMN income_competency_offset_months integer NOT NULL DEFAULT 0;

    UPDATE public.vacation_plans AS vacation_plan
    SET income_competency_offset_months = CASE
      WHEN income.dia_recebimento <= 10 THEN -1
      ELSE 0
    END
    FROM public.rendas AS income
    WHERE vacation_plan.renda_id = income.id;
  END IF;
END
$$;

COMMIT;
