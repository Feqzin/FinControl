import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { storage } from "./storage";
import { type Express } from "express";
import session from "express-session";
import { pool } from "./db";
import connectPgSimple from "connect-pg-simple";
import { scrypt, randomBytes, timingSafeEqual, createHash } from "crypto";
import { promisify } from "util";
import rateLimit from "express-rate-limit";
import { ENV } from "./env";
import { writeAuditLog } from "./audit-log";

const scryptAsync = promisify(scrypt);
const isProduction = process.env.NODE_ENV === "production";
const sessionCookieName = "fincontrol.sid";

const sessionCookieSettings = {
  maxAge: 30 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax" as const,
};

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  const [hashedPassword, salt] = stored.split(".");
  const hashedPasswordBuf = Buffer.from(hashedPassword, "hex");
  const suppliedPasswordBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedPasswordBuf, suppliedPasswordBuf);
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: "Muitas tentativas de login. Tente novamente em 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

function normalizeUsername(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.trim();
}

function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function invalidateUserSessions(userId: string, keepSessionId?: string): Promise<void> {
  const params: string[] = [userId];
  let query = `DELETE FROM "session" WHERE (sess::jsonb -> 'passport' ->> 'user') = $1`;
  if (keepSessionId) {
    params.push(keepSessionId);
    query += " AND sid <> $2";
  }
  await pool.query(query, params);
}

function auditAuth(req: { method: string; path: string }, event: Omit<Parameters<typeof writeAuditLog>[0], "method" | "route">): void {
  writeAuditLog({
    ...event,
    method: req.method,
    route: req.path,
  });
}

export function setupAuth(app: Express) {
  const PgStore = connectPgSimple(session);

  if (isProduction) {
    app.set("trust proxy", 1);
  }

  const sessionSettings: session.SessionOptions = {
    name: sessionCookieName,
    secret: ENV.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: new PgStore({
      pool,
      createTableIfMissing: true,
    }),
    cookie: sessionCookieSettings,
  };

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const normalizedUsername = normalizeUsername(username);
        const user = await storage.getUserByUsername(normalizedUsername);
        if (!user) return done(null, false, { message: "Usuario nao encontrado" });
        const match = await comparePasswords(password, user.password);
        if (!match) return done(null, false, { message: "Senha incorreta" });
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user || null);
    } catch (err) {
      done(err);
    }
  });

  app.post("/api/auth/register", loginLimiter, async (req, res, next) => {
    let username = "";
    try {
      username = normalizeUsername(req.body?.username);
      const password = req.body?.password;
      const nomeCompleto = req.body?.nomeCompleto;
      if (!username || !password) {
        auditAuth(req, {
          action: "auth",
          status: "failure",
          domain: "auth.register",
          details: { reason: "missing_credentials" },
        });
        return res.status(400).json({ message: "Usuario e senha sao obrigatorios" });
      }
      if (password.length < 8) {
        auditAuth(req, {
          action: "auth",
          status: "failure",
          domain: "auth.register",
          details: { username, reason: "password_too_short" },
        });
        return res.status(400).json({ message: "A senha deve ter pelo menos 8 caracteres" });
      }
      const existing = await storage.getUserByUsername(username);
      if (existing) {
        auditAuth(req, {
          action: "auth",
          status: "failure",
          domain: "auth.register",
          details: { username, reason: "username_in_use" },
        });
        return res.status(400).json({ message: "Este usuario ja esta em uso" });
      }
      const hashedPassword = await hashPassword(password);
      const user = await storage.createUser({ username, password: hashedPassword });
      if (nomeCompleto) {
        await storage.updateUser(user.id, { nomeCompleto });
      }
      const updatedUser = await storage.getUser(user.id);

      req.session.regenerate((regenErr) => {
        if (regenErr) {
          auditAuth(req, {
            action: "auth",
            status: "error",
            domain: "auth.register",
            details: { username, reason: "session_regenerate_failed" },
            error: regenErr.message,
          });
          return next(regenErr);
        }
        req.login(updatedUser!, (err) => {
          if (err) {
            auditAuth(req, {
              action: "auth",
              status: "error",
              domain: "auth.register",
              userId: updatedUser!.id,
              details: { username, reason: "session_login_failed" },
              error: err.message,
            });
            return next(err);
          }
          auditAuth(req, {
            action: "auth",
            status: "success",
            domain: "auth.register",
            userId: updatedUser!.id,
            details: { username },
          });
          return res.json({ id: updatedUser!.id, username: updatedUser!.username, nomeCompleto: updatedUser!.nomeCompleto });
        });
      });
    } catch (error) {
      auditAuth(req, {
        action: "auth",
        status: "error",
        domain: "auth.register",
        details: { username },
        error: error instanceof Error ? error.message : String(error),
      });
      next(error);
    }
  });

  app.post("/api/auth/login", loginLimiter, (req, res, next) => {
    const attemptedUsername = normalizeUsername(req.body?.username);
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) {
        auditAuth(req, {
          action: "auth",
          status: "error",
          domain: "auth.login",
          details: { username: attemptedUsername, reason: "passport_error" },
          error: err.message,
        });
        return next(err);
      }
      if (!user) {
        auditAuth(req, {
          action: "auth",
          status: "failure",
          domain: "auth.login",
          details: { username: attemptedUsername, reason: info?.message || "invalid_credentials" },
        });
        return res.status(401).json({ message: info?.message || "Credenciais invalidas" });
      }
      req.session.regenerate((regenErr) => {
        if (regenErr) {
          auditAuth(req, {
            action: "auth",
            status: "error",
            domain: "auth.login",
            userId: user.id,
            details: { username: attemptedUsername, reason: "session_regenerate_failed" },
            error: regenErr.message,
          });
          return next(regenErr);
        }
        req.login(user, (loginErr) => {
          if (loginErr) {
            auditAuth(req, {
              action: "auth",
              status: "error",
              domain: "auth.login",
              userId: user.id,
              details: { username: attemptedUsername, reason: "session_login_failed" },
              error: loginErr.message,
            });
            return next(loginErr);
          }
          auditAuth(req, {
            action: "auth",
            status: "success",
            domain: "auth.login",
            userId: user.id,
            details: { username: user.username },
          });
          return res.json({ id: user.id, username: user.username, nomeCompleto: user.nomeCompleto });
        });
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res, next) => {
    const userId = (req.user as any)?.id ?? null;
    req.logout((err) => {
      if (err) {
        auditAuth(req, {
          action: "auth",
          status: "error",
          domain: "auth.logout",
          userId,
          error: err.message,
        });
        return next(err);
      }

      if (!req.session) {
        auditAuth(req, {
          action: "auth",
          status: "success",
          domain: "auth.logout",
          userId,
          details: { hadSession: false },
        });
        res.clearCookie(sessionCookieName, {
          httpOnly: sessionCookieSettings.httpOnly,
          secure: sessionCookieSettings.secure,
          sameSite: sessionCookieSettings.sameSite,
          path: "/",
        });
        return res.json({ message: "Desconectado com sucesso" });
      }

      req.session.destroy((destroyErr) => {
        if (destroyErr) {
          auditAuth(req, {
            action: "auth",
            status: "error",
            domain: "auth.logout",
            userId,
            details: { reason: "session_destroy_failed" },
            error: destroyErr.message,
          });
          return next(destroyErr);
        }
        auditAuth(req, {
          action: "auth",
          status: "success",
          domain: "auth.logout",
          userId,
          details: { hadSession: true },
        });
        res.clearCookie(sessionCookieName, {
          httpOnly: sessionCookieSettings.httpOnly,
          secure: sessionCookieSettings.secure,
          sameSite: sessionCookieSettings.sameSite,
          path: "/",
        });
        return res.json({ message: "Desconectado com sucesso" });
      });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (req.isAuthenticated()) {
      const user = req.user as any;
      return res.json({ id: user.id, username: user.username, nomeCompleto: user.nomeCompleto });
    }
    return res.status(401).json({ message: "Nao autenticado" });
  });

  app.post("/api/auth/forgot-password", loginLimiter, async (req, res) => {
    try {
      const username = normalizeUsername(req.body?.username);
      const genericMessage = "Se o usuario existir, o link de redefinicao foi gerado.";
      if (!username) {
        auditAuth(req, {
          action: "auth",
          status: "failure",
          domain: "auth.forgot_password",
          details: { reason: "missing_username" },
        });
        return res.status(400).json({ message: "Informe o usuario" });
      }
      const user = await storage.getUserByUsername(username);
      if (!user) {
        auditAuth(req, {
          action: "auth",
          status: "failure",
          domain: "auth.forgot_password",
          details: { username, reason: "user_not_found" },
        });
        return res.json({ message: genericMessage });
      }
      const token = randomBytes(32).toString("hex");
      const tokenHash = hashResetToken(token);
      const expiry = new Date(Date.now() + 60 * 60 * 1000);
      await storage.updateUser(user.id, { resetToken: tokenHash, resetTokenExpiry: expiry });
      auditAuth(req, {
        action: "auth",
        status: "success",
        domain: "auth.forgot_password",
        userId: user.id,
        details: { username },
      });

      if (process.env.NODE_ENV === "production") {
        return res.json({ message: genericMessage });
      }

      const resetLink = `/redefinir-senha?token=${token}`;
      return res.json({ message: genericMessage, resetLink, _dev: "Em producao este link seria enviado por email" });
    } catch (err) {
      auditAuth(req, {
        action: "auth",
        status: "error",
        domain: "auth.forgot_password",
        error: err instanceof Error ? err.message : String(err),
      });
      return res.status(500).json({ message: "Erro interno" });
    }
  });

  app.post("/api/auth/reset-password", loginLimiter, async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) {
        auditAuth(req, {
          action: "auth",
          status: "failure",
          domain: "auth.reset_password",
          details: { reason: "missing_token_or_password" },
        });
        return res.status(400).json({ message: "Token e senha sao obrigatorios" });
      }
      if (password.length < 8) {
        auditAuth(req, {
          action: "auth",
          status: "failure",
          domain: "auth.reset_password",
          details: { reason: "password_too_short" },
        });
        return res.status(400).json({ message: "A senha deve ter pelo menos 8 caracteres" });
      }
      const tokenHash = hashResetToken(token);
      const user = await storage.getUserByResetToken(tokenHash);
      if (!user || !user.resetTokenExpiry || new Date() > new Date(user.resetTokenExpiry)) {
        auditAuth(req, {
          action: "auth",
          status: "failure",
          domain: "auth.reset_password",
          details: { reason: "invalid_or_expired_token" },
        });
        return res.status(400).json({ message: "Token invalido ou expirado" });
      }
      const hashedPassword = await hashPassword(password);
      await storage.updateUser(user.id, { password: hashedPassword, resetToken: null, resetTokenExpiry: null });
      await invalidateUserSessions(user.id, req.sessionID);

      if (req.session) {
        req.session.destroy(() => {});
        res.clearCookie(sessionCookieName, {
          httpOnly: sessionCookieSettings.httpOnly,
          secure: sessionCookieSettings.secure,
          sameSite: sessionCookieSettings.sameSite,
          path: "/",
        });
      }

      auditAuth(req, {
        action: "auth",
        status: "success",
        domain: "auth.reset_password",
        userId: user.id,
      });
      return res.json({ message: "Senha redefinida com sucesso. Faca login com a nova senha." });
    } catch (err) {
      auditAuth(req, {
        action: "auth",
        status: "error",
        domain: "auth.reset_password",
        error: err instanceof Error ? err.message : String(err),
      });
      return res.status(500).json({ message: "Erro interno" });
    }
  });

  app.patch("/api/auth/profile", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const { nomeCompleto } = req.body;
      await storage.updateUser(userId, { nomeCompleto });
      const user = await storage.getUser(userId);
      auditAuth(req, {
        action: "update",
        status: "success",
        domain: "auth.profile",
        userId,
      });
      return res.json({ id: user!.id, username: user!.username, nomeCompleto: user!.nomeCompleto });
    } catch (err) {
      auditAuth(req, {
        action: "update",
        status: "error",
        domain: "auth.profile",
        userId: (req.user as any)?.id ?? null,
        error: err instanceof Error ? err.message : String(err),
      });
      return res.status(500).json({ message: "Erro interno" });
    }
  });
}

export function requireAuth(req: any, res: any, next: any) {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ message: "Nao autenticado" });
}
