import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { db } from "../server/db";
import { comprasCartao, parcelasCompra } from "../shared/schema";
import { buildParcelasCompraRows } from "../server/services/parcelas-compra-materialization";

type CliOptions = {
  userId?: string;
  dryRun: boolean;
};

function parseOptions(argv: string[]): CliOptions {
  let userId: string | undefined;
  let dryRun = false;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg.startsWith("--user-id=")) {
      userId = arg.slice("--user-id=".length).trim() || undefined;
    }
  }

  return { userId, dryRun };
}

async function run() {
  const options = parseOptions(process.argv.slice(2));
  const compras = options.userId
    ? await db.select().from(comprasCartao).where(eq(comprasCartao.userId, options.userId))
    : await db.select().from(comprasCartao);

  let scanned = 0;
  let createdPurchases = 0;
  let createdRows = 0;
  let alreadyMaterialized = 0;
  let partialSchedules = 0;

  for (const compra of compras) {
    scanned += 1;
    const existing = await db.select({ id: parcelasCompra.id }).from(parcelasCompra).where(and(
      eq(parcelasCompra.userId, compra.userId),
      eq(parcelasCompra.compraCartaoId, compra.id),
    ));

    if (existing.length === 0) {
      const rows = buildParcelasCompraRows(compra);
      createdPurchases += 1;
      createdRows += rows.length;

      if (!options.dryRun && rows.length > 0) {
        await db.insert(parcelasCompra).values(rows);
      }
      continue;
    }

    alreadyMaterialized += 1;
    const expectedRows = Math.max(1, Number(compra.parcelas) || 1);
    if (existing.length !== expectedRows) {
      partialSchedules += 1;
    }
  }

  console.log("Backfill parcelas_compra finalizado");
  console.log(`- dryRun: ${options.dryRun}`);
  console.log(`- userId: ${options.userId ?? "ALL"}`);
  console.log(`- compras analisadas: ${scanned}`);
  console.log(`- compras com parcelas criadas: ${createdPurchases}`);
  console.log(`- parcelas criadas: ${createdRows}`);
  console.log(`- compras ja materializadas: ${alreadyMaterialized}`);
  console.log(`- compras com cronograma parcial (nao alteradas): ${partialSchedules}`);
}

run().catch((error) => {
  console.error("Falha no backfill de parcelas_compra:", error);
  process.exit(1);
});
