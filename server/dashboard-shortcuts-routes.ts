import type { Express, RequestHandler } from "express";
import type { Pool } from "pg";
import { DEFAULT_ACCENT, isAccentColor } from "../shared/appearance.js";
import { isValidDashboardShortcuts } from "../shared/dashboard-shortcuts.js";

export function registerDashboardShortcutsRoutes(
  app: Express,
  pool: Pool,
  requireAuth: RequestHandler,
): void {
  app.get("/api/appearance", requireAuth, async (req, res, next) => {
    try {
      const result = await pool.query<{ accent_color: string }>("SELECT accent_color FROM user_appearance WHERE user_id = $1", [(req.user as { id: string }).id]);
      res.json({ accentColor: result.rows[0]?.accent_color ?? DEFAULT_ACCENT });
    } catch (error) { next(error); }
  });
  app.put("/api/appearance", requireAuth, async (req, res, next) => {
    if (!isAccentColor(req.body?.accentColor)) { res.status(400).json({ message: "Escolha uma cor válida." }); return; }
    try {
      const accentColor = req.body.accentColor.toLowerCase();
      await pool.query(`INSERT INTO user_appearance (user_id, accent_color) VALUES ($1, $2)
        ON CONFLICT (user_id) DO UPDATE SET accent_color = EXCLUDED.accent_color, updated_at = now()`, [(req.user as { id: string }).id, accentColor]);
      res.json({ accentColor });
    } catch (error) { next(error); }
  });

  app.get("/api/dashboard/shortcuts", requireAuth, async (req, res, next) => {
    try {
      const userId = (req.user as { id: string }).id;
      const result = await pool.query<{ shortcuts: unknown }>(
        "SELECT shortcuts FROM user_dashboard_shortcuts WHERE user_id = $1",
        [userId],
      );
      const shortcuts = result.rows[0]?.shortcuts ?? null;
      return res.json({ shortcuts: isValidDashboardShortcuts(shortcuts) ? shortcuts : null });
    } catch (error) {
      return next(error);
    }
  });

  app.put("/api/dashboard/shortcuts", requireAuth, async (req, res, next) => {
    const shortcuts: unknown = req.body?.shortcuts;
    if (!isValidDashboardShortcuts(shortcuts)) {
      return res.status(400).json({ message: "Escolha até seis atalhos válidos, sem repetição." });
    }

    try {
      const userId = (req.user as { id: string }).id;
      await pool.query(
        `INSERT INTO user_dashboard_shortcuts (user_id, shortcuts)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (user_id) DO UPDATE
         SET shortcuts = EXCLUDED.shortcuts, updated_at = now()`,
        [userId, JSON.stringify(shortcuts)],
      );
      return res.json({ shortcuts });
    } catch (error) {
      return next(error);
    }
  });
}
