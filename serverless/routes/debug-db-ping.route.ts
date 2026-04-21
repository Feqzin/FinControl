import type { Express } from "express";
import { pool } from "../db.js";

type DbNowRow = {
  now: string;
};

export function registerDebugDbPingRoute(app: Express): void {
  app.get("/api/debug/db-ping", async (_req, res) => {
    try {
      const result = await pool.query<DbNowRow>("select now() as now");
      const now = result.rows[0]?.now ?? null;

      return res.json({ ok: true, now });
    } catch (error) {
      const errorLike = error as { code?: unknown; name?: unknown; message?: unknown };

      return res.status(500).json({
        ok: false,
        message:
          typeof errorLike?.message === "string"
            ? errorLike.message
            : "Erro interno ao testar conexao com o banco",
        code: errorLike?.code ? String(errorLike.code) : null,
        name: errorLike?.name ? String(errorLike.name) : null,
      });
    }
  });
}

