BEGIN;

CREATE TABLE IF NOT EXISTS icon_match_rules (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  icon_id text NOT NULL,
  normalized_term text NOT NULL,
  original_term text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_icon_match_rules_user_id
  ON icon_match_rules(user_id);

CREATE INDEX IF NOT EXISTS idx_icon_match_rules_normalized_term
  ON icon_match_rules(normalized_term);

CREATE INDEX IF NOT EXISTS idx_icon_match_rules_created_at
  ON icon_match_rules(created_at);

CREATE INDEX IF NOT EXISTS idx_icon_match_rules_updated_at
  ON icon_match_rules(updated_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_icon_match_rules_user_term_unique
  ON icon_match_rules(user_id, normalized_term);

COMMIT;
