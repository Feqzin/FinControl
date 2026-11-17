import type { Express, RequestHandler } from "express";
import type { Pool } from "pg";
import { z } from "zod";

const groupBody = z.object({
  name: z.string().trim().min(1).max(60),
  debtIds: z.array(z.string().regex(/^(manual|cartao):[a-zA-Z0-9-]+$/)).max(2000)
    .transform(ids => Array.from(new Set(ids))),
});

export function registerDebtGroupsRoutes(app: Express, pool: Pool, requireAuth: RequestHandler) {
  app.get("/api/debt-groups", requireAuth, async (req, res, next) => {
    try {
      const result = await pool.query('SELECT id, name, debt_ids AS "debtIds" FROM user_debt_groups WHERE user_id = $1 ORDER BY name, id', [(req.user as { id: string }).id]);
      res.json(result.rows);
    } catch (error) { next(error); }
  });

  const save: RequestHandler = async (req, res, next) => {
    const parsed = groupBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: "Informe um nome de até 60 caracteres e selecione dívidas válidas." }); return; }
    try {
      const userId = (req.user as { id: string }).id;
      const { name, debtIds } = parsed.data;
      if (debtIds.length) {
        const owned = await pool.query<{ id: string }>(
          `SELECT 'manual:' || id AS id FROM dividas WHERE user_id = $1 AND ('manual:' || id) = ANY($2::text[])
           UNION ALL SELECT 'cartao:' || id AS id FROM compras_cartao WHERE user_id = $1 AND ('cartao:' || id) = ANY($2::text[])`,
          [userId, debtIds],
        );
        if (owned.rows.length !== debtIds.length) { res.status(400).json({ message: "Uma das dívidas selecionadas não está disponível na sua conta." }); return; }
      }
      const result = req.method === "POST"
        ? await pool.query('INSERT INTO user_debt_groups (user_id, name, debt_ids) VALUES ($1, $2, $3::jsonb) RETURNING id, name, debt_ids AS "debtIds"', [userId, name, JSON.stringify(debtIds)])
        : await pool.query('UPDATE user_debt_groups SET name = $2, debt_ids = $3::jsonb, updated_at = now() WHERE user_id = $1 AND id = $4 RETURNING id, name, debt_ids AS "debtIds"', [userId, name, JSON.stringify(debtIds), req.params.id]);
      if (!result.rows[0]) { res.status(404).json({ message: "Grupo não encontrado." }); return; }
      res.status(req.method === "POST" ? 201 : 200).json(result.rows[0]);
    } catch (error) { next(error); }
  };
  app.post("/api/debt-groups", requireAuth, save);
  app.patch("/api/debt-groups/:id", requireAuth, save);
}
