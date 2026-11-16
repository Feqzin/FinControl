-- FinControl authenticates users in its server and queries PostgreSQL as postgres.
-- Browser clients do not query these tables through Supabase's Data API.
-- Keep Storage API grants and storage.* policies untouched.
BEGIN;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users', 'user_public_profiles', 'pessoas', 'dividas', 'cnpjs',
    'cnpj_das_importacoes', 'cnpj_das_obrigacoes', 'cnpj_das_calculos',
    'parcelas', 'cartoes', 'compras_cartao', 'compra_aliases',
    'icon_match_rules', 'user_icon_library', 'official_icon_packs',
    'official_icon_library', 'icon_pack_installs', 'icon_pack_ratings',
    'servicos', 'servico_pessoas', 'servico_pagamentos',
    'servico_cobranca_pagamentos', 'parcelas_compra',
    'cartao_fatura_pagamentos', 'cartao_fatura_pagamento_alocacoes',
    'future_purchase_simulations', 'pessoa_saldo_movimentacoes',
    'rendas', 'vacation_plans', 'patrimonios', 'metas', 'import_logs',
    'user_cloud_backups', 'user_subscriptions', 'billing_webhook_events',
    'session', 'schema_migrations', 'audit_events'
  ] LOOP
    IF to_regclass(format('%I.%I', 'public', table_name)) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM anon, authenticated', 'public', table_name);
      EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 'public', table_name);
    END IF;
  END LOOP;
END;
$$;

COMMIT;
