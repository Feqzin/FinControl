import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

type Strategy = "enum+check" | "domain-table" | "normalize-later";

type FieldAuditSpec = {
  table: string;
  column: string;
  nullable: boolean;
  allowed: readonly string[];
  strategy: Strategy;
  rationale: string;
};

type AuditRow = {
  raw_value: string | null;
  normalized_value: string | null;
  total: number;
};

type FieldReport = {
  table: string;
  column: string;
  nullable: boolean;
  strategy: Strategy;
  rationale: string;
  allowed: readonly string[];
  totalRows: number;
  nullRows: number;
  distinctRawValues: number;
  distinctNormalizedValues: number;
  values: AuditRow[];
  outliers: AuditRow[];
  casingOrWhitespaceVariants: Array<{
    normalized: string;
    variants: string[];
  }>;
};

type AuditReport = {
  generatedAt: string;
  databaseHost: string;
  fields: FieldReport[];
};

const SPECS: FieldAuditSpec[] = [
  {
    table: "pessoas",
    column: "tipo",
    nullable: false,
    allowed: ["me_deve", "eu_devo"],
    strategy: "enum+check",
    rationale: "Conjunto fechado e pequeno, usado em regras de negócio.",
  },
  {
    table: "dividas",
    column: "tipo",
    nullable: false,
    allowed: ["receber", "pagar"],
    strategy: "enum+check",
    rationale: "Conjunto fechado com impacto direto em cálculo financeiro.",
  },
  {
    table: "dividas",
    column: "status",
    nullable: false,
    allowed: ["pendente", "parcial", "pago", "vencido", "cancelado"],
    strategy: "enum+check",
    rationale: "Status de domínio financeiro com poucas variações válidas.",
  },
  {
    table: "dividas",
    column: "forma_pagamento",
    nullable: true,
    allowed: ["pix", "dinheiro", "cartao", "debito", "boleto", "transferencia", "simulacao"],
    strategy: "normalize-later",
    rationale: "Campo aberto hoje; usar check permissivo após normalização de aliases.",
  },
  {
    table: "parcelas",
    column: "status",
    nullable: false,
    allowed: ["pendente", "parcial", "pago", "vencido", "cancelado"],
    strategy: "enum+check",
    rationale: "Parcela é fonte de verdade para agregados financeiros.",
  },
  {
    table: "parcelas",
    column: "forma_pagamento",
    nullable: true,
    allowed: ["pix", "dinheiro", "cartao", "debito", "boleto", "transferencia", "simulacao"],
    strategy: "normalize-later",
    rationale: "Campo opcional e suscetível a variações de digitação.",
  },
  {
    table: "compras_cartao",
    column: "status_pessoa",
    nullable: true,
    allowed: ["pendente", "parcial", "pago", "vencido", "cancelado"],
    strategy: "enum+check",
    rationale: "Status de repasse para pessoa associada à compra de cartão.",
  },
  {
    table: "parcelas_compra",
    column: "status_cartao",
    nullable: false,
    allowed: ["pendente", "parcial", "pago", "vencido", "cancelado"],
    strategy: "enum+check",
    rationale: "Status por parcela de compra de cartão.",
  },
  {
    table: "parcelas_compra",
    column: "status_pessoa",
    nullable: true,
    allowed: ["pendente", "parcial", "pago", "vencido", "cancelado"],
    strategy: "enum+check",
    rationale: "Status opcional de parcela para pessoa vinculada.",
  },
  {
    table: "servicos",
    column: "categoria",
    nullable: false,
    allowed: ["streaming", "software", "lazer", "assinatura", "utilidades", "outros"],
    strategy: "normalize-later",
    rationale: "Lista tende a crescer; manter check inicial conservador.",
  },
  {
    table: "servicos",
    column: "forma_pagamento",
    nullable: false,
    allowed: ["pix", "dinheiro", "cartao", "debito", "boleto", "transferencia"],
    strategy: "normalize-later",
    rationale: "Padronização de meios de pagamento em toda a plataforma.",
  },
  {
    table: "servicos",
    column: "status",
    nullable: false,
    allowed: ["ativo", "cancelado", "pausado"],
    strategy: "enum+check",
    rationale: "Status funcional de serviço recorrente.",
  },
  {
    table: "servico_pagamentos",
    column: "status",
    nullable: false,
    allowed: ["pendente", "pago", "cancelado"],
    strategy: "enum+check",
    rationale: "Status de pagamento mensal de vínculo de serviço.",
  },
  {
    table: "rendas",
    column: "tipo",
    nullable: false,
    allowed: ["fixo", "variavel"],
    strategy: "enum+check",
    rationale: "Campo já modelado como enum no frontend.",
  },
  {
    table: "patrimonios",
    column: "tipo",
    nullable: false,
    allowed: ["conta_bancaria", "dinheiro", "poupanca", "investimento", "outros"],
    strategy: "normalize-later",
    rationale: "Padronização leve com espaço para evolução futura.",
  },
  {
    table: "metas",
    column: "status",
    nullable: false,
    allowed: ["ativa", "concluida", "cancelada"],
    strategy: "enum+check",
    rationale: "Estados de meta com ciclo de vida curto e previsível.",
  },
  {
    table: "import_logs",
    column: "source_type",
    nullable: false,
    allowed: ["texto", "csv", "ofx", "qfx", "manual"],
    strategy: "enum+check",
    rationale: "Origens de importação definidas por validator.",
  },
  {
    table: "import_logs",
    column: "status",
    nullable: false,
    allowed: ["previewed", "confirmed", "rolled_back", "failed"],
    strategy: "enum+check",
    rationale: "Estados operacionais de importação.",
  },
];

function quoteIdent(identifier: string): string {
  return `"${identifier.replaceAll("\"", "\"\"")}"`;
}

function requireDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error("DATABASE_URL obrigatoria para diagnostico de dominio.");
  }
  return value;
}

function databaseHostFromUrl(databaseUrl: string): string {
  try {
    return new URL(databaseUrl).host || "(unknown)";
  } catch {
    return "(unknown)";
  }
}

async function readFieldValues(client: pg.PoolClient, table: string, column: string): Promise<AuditRow[]> {
  const t = quoteIdent(table);
  const c = quoteIdent(column);
  const sql = `
    SELECT
      ${c}::text AS raw_value,
      CASE WHEN ${c} IS NULL THEN NULL ELSE lower(btrim(${c}::text)) END AS normalized_value,
      count(*)::int AS total
    FROM ${t}
    GROUP BY 1, 2
    ORDER BY 3 DESC, 1 NULLS FIRST;
  `;
  const result = await client.query<{ raw_value: string | null; normalized_value: string | null; total: number }>(sql);
  return result.rows.map((row) => ({
    raw_value: row.raw_value,
    normalized_value: row.normalized_value,
    total: Number(row.total),
  }));
}

function buildReport(spec: FieldAuditSpec, values: AuditRow[]): FieldReport {
  const allowedSet = new Set(spec.allowed);
  const totalRows = values.reduce((sum, row) => sum + row.total, 0);
  const nullRows = values.filter((row) => row.raw_value == null).reduce((sum, row) => sum + row.total, 0);
  const distinctRawValues = values.length;
  const distinctNormalizedValues = new Set(values.map((row) => row.normalized_value)).size;
  const outliers = values.filter((row) => {
    if (row.normalized_value == null) return false;
    if (allowedSet.size === 0) return false;
    return !allowedSet.has(row.normalized_value);
  });

  const variantsMap = new Map<string, Set<string>>();
  for (const row of values) {
    if (!row.normalized_value || row.raw_value == null) continue;
    if (!variantsMap.has(row.normalized_value)) {
      variantsMap.set(row.normalized_value, new Set<string>());
    }
    variantsMap.get(row.normalized_value)?.add(row.raw_value);
  }

  const casingOrWhitespaceVariants = [...variantsMap.entries()]
    .map(([normalized, variants]) => ({ normalized, variants: [...variants].sort((a, b) => a.localeCompare(b)) }))
    .filter((entry) => entry.variants.length > 1);

  return {
    table: spec.table,
    column: spec.column,
    nullable: spec.nullable,
    strategy: spec.strategy,
    rationale: spec.rationale,
    allowed: spec.allowed,
    totalRows,
    nullRows,
    distinctRawValues,
    distinctNormalizedValues,
    values,
    outliers,
    casingOrWhitespaceVariants,
  };
}

function printSummary(field: FieldReport): void {
  const id = `${field.table}.${field.column}`;
  console.log(`\n[domain-audit] ${id}`);
  console.log(`  strategy: ${field.strategy}`);
  console.log(`  rows: ${field.totalRows}, nullRows: ${field.nullRows}`);
  console.log(`  distinct(raw): ${field.distinctRawValues}, distinct(normalized): ${field.distinctNormalizedValues}`);
  if (field.outliers.length === 0) {
    console.log("  outliers: none");
  } else {
    console.log("  outliers:");
    for (const row of field.outliers) {
      console.log(`    - raw="${row.raw_value}" normalized="${row.normalized_value}" count=${row.total}`);
    }
  }
  if (field.casingOrWhitespaceVariants.length > 0) {
    console.log("  casing/spacing variants:");
    for (const variant of field.casingOrWhitespaceVariants) {
      console.log(`    - ${variant.normalized}: ${variant.variants.join(", ")}`);
    }
  }
}

async function run(): Promise<void> {
  const databaseUrl = requireDatabaseUrl();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    const fields: FieldReport[] = [];
    for (const spec of SPECS) {
      const values = await readFieldValues(client, spec.table, spec.column);
      const report = buildReport(spec, values);
      fields.push(report);
      printSummary(report);
    }

    const payload: AuditReport = {
      generatedAt: new Date().toISOString(),
      databaseHost: databaseHostFromUrl(databaseUrl),
      fields,
    };

    const outputDir = path.resolve(process.cwd(), "diagnostics");
    await mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, "domain-values-report.json");
    await writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");
    console.log(`\n[domain-audit] report saved at ${outputPath}`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error("[domain-audit] failed", error);
  process.exit(1);
});
