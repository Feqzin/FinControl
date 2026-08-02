CREATE TABLE IF NOT EXISTS vacation_plans (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  renda_id varchar NOT NULL REFERENCES rendas(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  duration_days integer NOT NULL,
  vacation_pay_received boolean NOT NULL DEFAULT false,
  vacation_pay_date date,
  vacation_pay_amount numeric(12, 2),
  included_in_patrimony boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT vacation_plans_duration_days_check CHECK (duration_days BETWEEN 1 AND 90),
  CONSTRAINT vacation_plans_pay_amount_check CHECK (vacation_pay_amount IS NULL OR vacation_pay_amount >= 0),
  CONSTRAINT vacation_plans_patrimony_check CHECK (included_in_patrimony = false OR vacation_pay_received = true)
);

CREATE INDEX IF NOT EXISTS idx_vacation_plans_user_id
  ON vacation_plans(user_id);

CREATE INDEX IF NOT EXISTS idx_vacation_plans_renda_id
  ON vacation_plans(renda_id);

CREATE INDEX IF NOT EXISTS idx_vacation_plans_start_date
  ON vacation_plans(start_date);
