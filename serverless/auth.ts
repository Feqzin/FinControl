import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { storage } from "./storage.js";
import { type Express, type Request } from "express";
import session from "express-session";
import { pool } from "./db.js";
import connectPgSimple from "connect-pg-simple";
import { scrypt, randomBytes, timingSafeEqual, createHash } from "crypto";
import { promisify } from "util";
import rateLimit from "express-rate-limit";
import { ENV } from "./env.js";
import { writeAuditLog } from "./audit-log.js";
import { writeTechnicalLog } from "./logger.js";
import { getUserSubscriptionAccess } from "./subscription-access.js";
import {
  isEmailLikeUsername,
  normalizePublicUsername,
  resolvePublicUsernameForResponse,
  validatePublicUsername,
} from "../shared/public-username.js";

const scryptAsync = promisify(scrypt);
const isProduction = ENV.nodeEnv === "production";
const isVercelRuntime = ENV.isVercel;
const SESSION_STORE_TABLE_NAME = "session" as const;
const SCRYPT_KEY_LENGTH = 64;
const HASH_HEX_LENGTH = SCRYPT_KEY_LENGTH * 2;
const LEGACY_PASSWORD_RESET_MESSAGE =
  "Conta com senha antiga detectada. Use 'Esqueci minha senha' para redefinir e entrar.";

function failAuthConfig(message: string): never {
  throw new Error(`[AUTH] ${message}`);
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  failAuthConfig(`Valor booleano invalido: "${value}". Use true/false ou 1/0.`);
}

function resolveSessionCookieName(): string {
  const fromEnv = process.env.SESSION_COOKIE_NAME?.trim();
  const fallback = "fincontrol.sid";
  const resolved = fromEnv || fallback;

  if (resolved.length > 100) {
    failAuthConfig("SESSION_COOKIE_NAME muito longo. Use no maximo 100 caracteres.");
  }

  if (!/^[A-Za-z0-9._-]+$/.test(resolved)) {
    failAuthConfig(
      "SESSION_COOKIE_NAME invalido. Use apenas letras, numeros, ponto, underscore e hifen.",
    );
  }

  return resolved;
}

function resolveSessionCookieSameSite(): "lax" | "strict" | "none" {
  // Guia rapido:
  // - lax: frontend e API no mesmo "site" (inclui subdominios do mesmo dominio raiz).
  // - none: frontend e API em sites diferentes (cross-site); exige HTTPS + secure=true.
  const fromEnv = process.env.SESSION_COOKIE_SAME_SITE?.trim().toLowerCase();
  if (!fromEnv) return "lax";
  if (fromEnv === "lax" || fromEnv === "strict" || fromEnv === "none") {
    return fromEnv;
  }
  failAuthConfig(
    `SESSION_COOKIE_SAME_SITE invalido: "${fromEnv}". Use lax, strict ou none.`,
  );
}

function resolveSessionCookieDomain(): string | undefined {
  // Opcional: use quando quiser compartilhar cookie entre subdominios do mesmo dominio.
  // Se nao definido, o cookie fica host-only (escopo mais restrito e seguro por padrao).
  const fromEnv = process.env.SESSION_COOKIE_DOMAIN?.trim();
  if (!fromEnv) return undefined;

  const normalized = fromEnv.toLowerCase();
  if (
    normalized.includes("://") ||
    normalized.includes("/") ||
    normalized.includes(":") ||
    normalized.includes(" ")
  ) {
    failAuthConfig(
      `SESSION_COOKIE_DOMAIN invalido: "${fromEnv}". Informe apenas o host de dominio (sem protocolo, porta ou path).`,
    );
  }

  const withoutLeadingDot = normalized.startsWith(".")
    ? normalized.slice(1)
    : normalized;
  if (!/^[a-z0-9.-]+$/.test(withoutLeadingDot)) {
    failAuthConfig(
      `SESSION_COOKIE_DOMAIN invalido: "${fromEnv}". Use apenas letras, numeros, ponto e hifen.`,
    );
  }

  if (withoutLeadingDot.length < 3 || withoutLeadingDot.endsWith(".")) {
    failAuthConfig(`SESSION_COOKIE_DOMAIN invalido: "${fromEnv}".`);
  }

  if (isProduction && (withoutLeadingDot === "localhost" || withoutLeadingDot === "127.0.0.1")) {
    failAuthConfig("SESSION_COOKIE_DOMAIN nao pode ser localhost/127.0.0.1 em producao.");
  }

  return withoutLeadingDot;
}

const sessionCookieName = resolveSessionCookieName();
const sessionCookieSameSite = resolveSessionCookieSameSite();
const sessionCookieSecureFromEnv = parseBooleanEnv(process.env.SESSION_COOKIE_SECURE);
const sessionCookieSecure = sessionCookieSecureFromEnv ?? isProduction;
const sessionCookieDomain = resolveSessionCookieDomain();
const sessionStoreCreateTableIfMissingFromEnv = parseBooleanEnv(
  process.env.SESSION_STORE_CREATE_TABLE_IF_MISSING,
);
const sessionStoreCreateTableIfMissing =
  isProduction
    ? false
    : (sessionStoreCreateTableIfMissingFromEnv ?? true);

if (isProduction && !sessionCookieSecure) {
  failAuthConfig("SESSION_COOKIE_SECURE deve ser true em producao.");
}

if (sessionCookieSameSite === "none" && !sessionCookieSecure) {
  failAuthConfig(
    "SESSION_COOKIE_SAME_SITE=none exige SESSION_COOKIE_SECURE=true e HTTPS ativo.",
  );
}

if (isProduction && sessionStoreCreateTableIfMissingFromEnv === true) {
  failAuthConfig(
    "SESSION_STORE_CREATE_TABLE_IF_MISSING=true nao e permitido em producao. " +
    "Crie a tabela de sessao antes do deploy e mantenha essa opcao desativada.",
  );
}

const shouldTrustProxy = isProduction || isVercelRuntime;

const sessionCookieSettings = {
  path: "/",
  maxAge: 30 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  secure: sessionCookieSecure,
  sameSite: sessionCookieSameSite,
  ...(sessionCookieDomain ? { domain: sessionCookieDomain } : {}),
};

function toAuthUserResponse(user: {
  id: string;
  username?: string | null;
  nomeCompleto?: string | null;
  fullNameVisibility?: unknown;
  subscriptionTier?: unknown;
}) {
  const access = getUserSubscriptionAccess(user);
  const fullNameVisibility = user.fullNameVisibility === "public" ? "public" : "private";
  const publicUsername = resolvePublicUsernameForResponse(user.username);
  return {
    id: user.id,
    username: publicUsername,
    nomeCompleto: user.nomeCompleto ?? null,
    fullNameVisibility,
    subscriptionTier: access.subscriptionTier,
    features: access.features,
    limits: access.limits,
  };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, SCRYPT_KEY_LENGTH)) as Buffer;
  const storedPassword = `${buf.toString("hex")}.${salt}`;
  if (!inspectStoredPassword(storedPassword).isComparable) {
    throw new Error("[AUTH] hashPassword gerou formato invalido; esperado hash.salt");
  }
  return storedPassword;
}

type StoredPasswordInspection = {
  hasPassword: boolean;
  hasSeparator: boolean;
  hasHash: boolean;
  hasSalt: boolean;
  hashLooksHex: boolean;
  hasExpectedHashLength: boolean;
  hashLength: number;
  saltLength: number;
  isComparable: boolean;
  hashHex?: string;
  salt?: string;
};

function inspectStoredPassword(stored: unknown): StoredPasswordInspection {
  if (typeof stored !== "string" || stored.length === 0) {
    return {
      hasPassword: false,
      hasSeparator: false,
      hasHash: false,
      hasSalt: false,
      hashLooksHex: false,
      hasExpectedHashLength: false,
      hashLength: 0,
      saltLength: 0,
      isComparable: false,
    };
  }

  const separatorIndex = stored.indexOf(".");
  const hasSeparator = separatorIndex > 0 && separatorIndex < stored.length - 1;
  const hashHex = hasSeparator ? stored.slice(0, separatorIndex).trim() : "";
  const salt = hasSeparator ? stored.slice(separatorIndex + 1).trim() : "";
  const hasHash = hashHex.length > 0;
  const hasSalt = salt.length > 0;
  const hashLooksHex = hasHash && /^[a-f0-9]+$/i.test(hashHex);
  const hasExpectedHashLength = hashHex.length === HASH_HEX_LENGTH;
  const isComparable = hasSeparator && hasHash && hasSalt && hashLooksHex && hasExpectedHashLength;

  return {
    hasPassword: true,
    hasSeparator,
    hasHash,
    hasSalt,
    hashLooksHex,
    hasExpectedHashLength,
    hashLength: hashHex.length,
    saltLength: salt.length,
    isComparable,
    hashHex: isComparable ? hashHex : undefined,
    salt: isComparable ? salt : undefined,
  };
}

async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  const parsed = inspectStoredPassword(stored);
  if (!parsed.isComparable || !parsed.hashHex || !parsed.salt) return false;

  const hashedPasswordBuf = Buffer.from(parsed.hashHex, "hex");
  const suppliedPasswordBuf = (await scryptAsync(supplied, parsed.salt, SCRYPT_KEY_LENGTH)) as Buffer;
  if (hashedPasswordBuf.length !== suppliedPasswordBuf.length) return false;
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

function normalizeLoginIdentifier(input: unknown): string {
  const raw = normalizeUsername(input);
  if (!raw) return "";
  if (isEmailLikeUsername(raw)) {
    return raw.toLowerCase();
  }
  return normalizePublicUsername(raw);
}

const FULL_NAME_VISIBILITY_VALUES = new Set(["private", "public"]);

function sanitizeNomeCompleto(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 120);
}

function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function invalidateUserSessions(userId: string, keepSessionId?: string): Promise<void> {
  const params: string[] = [userId];
  let query = `DELETE FROM "${SESSION_STORE_TABLE_NAME}" WHERE (sess::jsonb -> 'passport' ->> 'user') = $1`;
  if (keepSessionId) {
    params.push(keepSessionId);
    query += " AND sid <> $2";
  }
  await pool.query(query, params);
}

function auditAuth(req: Request, event: Omit<Parameters<typeof writeAuditLog>[0], "method" | "route">): void {
  writeAuditLog({
    ...event,
    method: req.method,
    route: req.path,
    requestId: req.requestId ?? null,
    requestIp: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null,
  });
}

export function setupAuth(app: Express) {
  const PgStore = connectPgSimple(session);

  if (shouldTrustProxy) {
    app.set("trust proxy", 1);
  }

  const sessionSettings: session.SessionOptions = {
    name: sessionCookieName,
    proxy: shouldTrustProxy,
    secret: ENV.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: new PgStore({
      pool,
      tableName: SESSION_STORE_TABLE_NAME,
      createTableIfMissing: sessionStoreCreateTableIfMissing,
    }),
    cookie: sessionCookieSettings,
  };

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(
      { usernameField: "identifier", passwordField: "password", passReqToCallback: true },
      async (req, _identifier, password, done) => {
      try {
        const normalizedIdentifier = normalizeLoginIdentifier(
          req.body?.identifier ?? req.body?.username,
        );
        const user = await storage.getUserByUsername(normalizedIdentifier);

        if (!user) {
          writeTechnicalLog({
            event: "auth.login.user_lookup",
            source: "auth",
            level: "info",
            data: {
              identifier: normalizedIdentifier,
              userFound: false,
            },
          });
          return done(null, false, { message: "E-mail/usuario ou senha invalidos." });
        }

        const storedPasswordInspection = inspectStoredPassword(user.password);
        writeTechnicalLog({
          event: "auth.login.user_lookup",
          source: "auth",
          level: storedPasswordInspection.isComparable ? "info" : "warn",
          data: {
            identifier: normalizedIdentifier,
            userFound: true,
            hasId: Boolean(user.id),
            hasUsername: typeof user.username === "string" && user.username.length > 0,
            hasPassword: storedPasswordInspection.hasPassword,
            hasSeparator: storedPasswordInspection.hasSeparator,
            hasHash: storedPasswordInspection.hasHash,
            hasSalt: storedPasswordInspection.hasSalt,
            hashLooksHex: storedPasswordInspection.hashLooksHex,
            hasExpectedHashLength: storedPasswordInspection.hasExpectedHashLength,
            passwordComparable: storedPasswordInspection.isComparable,
            hashLength: storedPasswordInspection.hashLength,
            saltLength: storedPasswordInspection.saltLength,
          },
        });

        if (!storedPasswordInspection.isComparable) {
          return done(null, false, { message: LEGACY_PASSWORD_RESET_MESSAGE });
        }

        const match = await comparePasswords(password, user.password);
        if (!match) return done(null, false, { message: "E-mail/usuario ou senha invalidos." });
        return done(null, user);
      } catch (err) {
        writeTechnicalLog({
          event: "auth.login.strategy.error",
          source: "auth",
          level: "error",
          data: {
            identifier: normalizeLoginIdentifier(req.body?.identifier ?? req.body?.username),
            reason: "strategy_exception",
            error: err instanceof Error ? err.message : String(err),
          },
        });
        return done(err);
      }
      },
    )
  );

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user || null);
    } catch (err) {
      writeTechnicalLog({
        event: "auth.session.deserialize.error",
        source: "auth",
        level: "error",
        data: {
          userId: id,
          reason: "deserialize_exception",
          error: err instanceof Error ? err.message : String(err),
        },
      });
      done(err);
    }
  });

  app.post("/api/auth/register", loginLimiter, async (req, res, next) => {
    let username = "";
    try {
      username = normalizePublicUsername(req.body?.username);
      const password = req.body?.password;
      const nomeCompleto = req.body?.nomeCompleto;

      writeTechnicalLog({
        event: "auth.register.input",
        source: "auth",
        level: "info",
        requestId: req.requestId ?? undefined,
        data: {
          username,
          hasPassword: typeof password === "string" && password.length > 0,
        },
      });

      if (!password) {
        auditAuth(req, {
          action: "auth",
          status: "failure",
          domain: "auth.register",
          details: { reason: "missing_credentials" },
        });
        return res.status(400).json({ message: "Usuario e senha sao obrigatorios" });
      }
      const usernameValidationError = validatePublicUsername(username);
      if (usernameValidationError) {
        auditAuth(req, {
          action: "auth",
          status: "failure",
          domain: "auth.register",
          details: { reason: "invalid_public_username" },
        });
        return res.status(400).json({ message: usernameValidationError });
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

      writeTechnicalLog({
        event: "auth.register.user_lookup",
        source: "auth",
        level: "info",
        requestId: req.requestId ?? undefined,
        data: {
          username,
          userFound: Boolean(existing),
        },
      });

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
      const generatedPasswordInspection = inspectStoredPassword(hashedPassword);

      writeTechnicalLog({
        event: "auth.register.password_generated",
        source: "auth",
        level: generatedPasswordInspection.isComparable ? "info" : "warn",
        requestId: req.requestId ?? undefined,
        data: {
          username,
          passwordComparable: generatedPasswordInspection.isComparable,
        },
      });

      const user = await storage.createUser({ username, password: hashedPassword });
      let persistedPasswordInspection = inspectStoredPassword(user.password);

      writeTechnicalLog({
        event: "auth.register.password_persisted",
        source: "auth",
        level: persistedPasswordInspection.isComparable ? "info" : "warn",
        requestId: req.requestId ?? undefined,
        data: {
          username,
          userFound: true,
          passwordComparable: persistedPasswordInspection.isComparable,
        },
      });

      if (!persistedPasswordInspection.isComparable) {
        writeTechnicalLog({
          event: "auth.register.password_repair_attempt",
          source: "auth",
          level: "warn",
          requestId: req.requestId ?? undefined,
          data: {
            username,
            reason: "persisted_password_not_comparable",
          },
        });

        const repairedUser = await storage.updateUser(user.id, { password: hashedPassword });
        persistedPasswordInspection = inspectStoredPassword(repairedUser?.password ?? "");

        writeTechnicalLog({
          event: "auth.register.password_repair_result",
          source: "auth",
          level: persistedPasswordInspection.isComparable ? "info" : "error",
          requestId: req.requestId ?? undefined,
          data: {
            username,
            passwordComparable: persistedPasswordInspection.isComparable,
          },
        });

        if (!persistedPasswordInspection.isComparable) {
          throw new Error("Falha ao persistir senha no formato hash.salt");
        }
      }

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
          req.session.save((saveErr) => {
            if (saveErr) {
              auditAuth(req, {
                action: "auth",
                status: "error",
                domain: "auth.register",
                userId: updatedUser!.id,
                details: { username, reason: "session_save_failed" },
                error: saveErr.message,
              });
              return next(saveErr);
            }

            auditAuth(req, {
              action: "auth",
              status: "success",
              domain: "auth.register",
              userId: updatedUser!.id,
              details: { username },
            });
            return res.json(toAuthUserResponse(updatedUser!));
          });
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
    const attemptedIdentifier = normalizeLoginIdentifier(req.body?.identifier ?? req.body?.username);
    const requestBody = typeof req.body === "object" && req.body !== null
      ? req.body as Record<string, unknown>
      : {};
    requestBody.identifier = requestBody.identifier ?? requestBody.username;
    req.body = requestBody;

    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) {
        auditAuth(req, {
          action: "auth",
          status: "error",
          domain: "auth.login",
          details: { identifier: attemptedIdentifier, reason: "passport_error" },
          error: err.message,
        });
        return next(err);
      }
      if (!user) {
        auditAuth(req, {
          action: "auth",
          status: "failure",
          domain: "auth.login",
          details: { identifier: attemptedIdentifier, reason: info?.message || "invalid_credentials" },
        });
        return res.status(401).json({ message: "E-mail/usuario ou senha invalidos." });
      }
      req.session.regenerate((regenErr) => {
        if (regenErr) {
          auditAuth(req, {
            action: "auth",
            status: "error",
            domain: "auth.login",
            userId: user.id,
            details: { identifier: attemptedIdentifier, reason: "session_regenerate_failed" },
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
              details: { identifier: attemptedIdentifier, reason: "session_login_failed" },
              error: loginErr.message,
            });
            return next(loginErr);
          }
          req.session.save((saveErr) => {
            if (saveErr) {
              auditAuth(req, {
                action: "auth",
                status: "error",
                domain: "auth.login",
                userId: user.id,
                details: { identifier: attemptedIdentifier, reason: "session_save_failed" },
                error: saveErr.message,
              });
              return next(saveErr);
            }

            auditAuth(req, {
              action: "auth",
              status: "success",
              domain: "auth.login",
              userId: user.id,
              details: { username: user.username },
            });
            return res.json(toAuthUserResponse(user));
          });
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
          ...(sessionCookieSettings.domain ? { domain: sessionCookieSettings.domain } : {}),
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
          ...(sessionCookieSettings.domain ? { domain: sessionCookieSettings.domain } : {}),
        });
        return res.json({ message: "Desconectado com sucesso" });
      });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (req.isAuthenticated()) {
      const user = req.user as any;
      return res.json(toAuthUserResponse(user));
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
          ...(sessionCookieSettings.domain ? { domain: sessionCookieSettings.domain } : {}),
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
      const sessionUser = req.user as any;
      const userId = sessionUser.id;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const updates: Record<string, unknown> = {};
      const persistedUser = await storage.getUser(userId);
      if (!persistedUser) {
        return res.status(404).json({ message: "Usuário não encontrado." });
      }
      const currentPublicUsername = resolvePublicUsernameForResponse(persistedUser.username);
      const canDefinePublicUsername = currentPublicUsername === null;

      if (Object.prototype.hasOwnProperty.call(body, "nomeCompleto")) {
        const rawNomeCompleto = body.nomeCompleto;
        if (rawNomeCompleto !== null && rawNomeCompleto !== undefined && typeof rawNomeCompleto !== "string") {
          return res.status(400).json({ message: "Nome completo inválido." });
        }
        updates.nomeCompleto = sanitizeNomeCompleto(rawNomeCompleto as string | null | undefined);
      }

      if (Object.prototype.hasOwnProperty.call(body, "username")) {
        const rawUsername = body.username;
        if (typeof rawUsername !== "string") {
          return res.status(400).json({ message: "Usuário público inválido." });
        }

        const normalizedCandidate = normalizePublicUsername(rawUsername);
        if (!canDefinePublicUsername) {
          if (normalizedCandidate !== currentPublicUsername) {
            return res.status(403).json({ message: "Usuário público não pode ser alterado." });
          }
        } else {
          const validationError = validatePublicUsername(normalizedCandidate);
          if (validationError) {
            return res.status(400).json({ message: validationError });
          }
          const existing = await storage.getUserByUsername(normalizedCandidate);
          if (existing && existing.id !== userId) {
            return res.status(409).json({ message: "Este usuário público já está em uso." });
          }
          updates.username = normalizedCandidate;
        }
      }

      if (Object.prototype.hasOwnProperty.call(body, "fullNameVisibility")) {
        const rawVisibility = body.fullNameVisibility;
        if (typeof rawVisibility !== "string") {
          return res.status(400).json({ message: "Configuração de privacidade inválida." });
        }
        const visibility = rawVisibility.trim().toLowerCase();
        if (!FULL_NAME_VISIBILITY_VALUES.has(visibility)) {
          return res.status(400).json({ message: "Configuração de privacidade inválida." });
        }
        updates.fullNameVisibility = visibility;
      }

      if (Object.keys(updates).length > 0) {
        await storage.updateUser(userId, updates as any);
      }

      const user = await storage.getUser(userId);
      auditAuth(req, {
        action: "update",
        status: "success",
        domain: "auth.profile",
        userId,
      });
      return res.json(toAuthUserResponse(user!));
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
