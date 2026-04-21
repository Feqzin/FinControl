BEGIN;

ALTER TABLE dividas
  ADD COLUMN IF NOT EXISTS observacao_pagamento text,
  ADD COLUMN IF NOT EXISTS comprovante_path text,
  ADD COLUMN IF NOT EXISTS comprovante_nome text,
  ADD COLUMN IF NOT EXISTS comprovante_mime_type text,
  ADD COLUMN IF NOT EXISTS comprovante_tamanho integer,
  ADD COLUMN IF NOT EXISTS comprovante_enviado_em timestamptz;

ALTER TABLE parcelas
  ADD COLUMN IF NOT EXISTS observacao_pagamento text,
  ADD COLUMN IF NOT EXISTS comprovante_path text,
  ADD COLUMN IF NOT EXISTS comprovante_nome text,
  ADD COLUMN IF NOT EXISTS comprovante_mime_type text,
  ADD COLUMN IF NOT EXISTS comprovante_tamanho integer,
  ADD COLUMN IF NOT EXISTS comprovante_enviado_em timestamptz;

COMMIT;
