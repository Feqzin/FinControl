import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { storage } from "./storage";
import { type Express } from "express";
import session from "express-session";
import { pool } from "./db";
import connectPgSimple from "connect-pg-simple";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import rateLimit from "express-rate-limit";
import { ENV } from "./env";

const scryptAsync = promisify(scrypt);

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

export function setupAuth(app: Express) {
  const PgStore = connectPgSimple(session);

  const sessionSettings: session.SessionOptions = {
    secret: ENV.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: new PgStore({
      pool,
      createTableIfMissing: true,
    }),
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: false,
      sameSite: "lax",
    },
  };

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
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
    try {
      const { username, password, nomeCompleto } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Usuario e senha sao obrigatorios" });
      }
      if (password.length < 8) {
        return res.status(400).json({ message: "A senha deve ter pelo menos 8 caracteres" });
      }
      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(400).json({ message: "Este usuario ja esta em uso" });
      }
      const hashedPassword = await hashPassword(password);
      const user = await storage.createUser({ username, password: hashedPassword });
      if (nomeCompleto) {
        await storage.updateUser(user.id, { nomeCompleto });
      }
      const updatedUser = await storage.getUser(user.id);
      req.login(updatedUser!, (err) => {
        if (err) return next(err);
        return res.json({ id: updatedUser!.id, username: updatedUser!.username, nomeCompleto: updatedUser!.nomeCompleto });
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/login", loginLimiter, (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Credenciais invalidas" });
      req.login(user, (err) => {
        if (err) return next(err);
        return res.json({ id: user.id, username: user.username, nomeCompleto: user.nomeCompleto });
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.json({ message: "Desconectado com sucesso" });
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
      const { username } = req.body;
      const genericMessage = "Se o usuario existir, o link de redefinicao foi gerado.";
      if (!username) return res.status(400).json({ message: "Informe o usuario" });
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.json({ message: genericMessage });
      }
      const token = randomBytes(32).toString("hex");
      const expiry = new Date(Date.now() + 60 * 60 * 1000);
      await storage.updateUser(user.id, { resetToken: token, resetTokenExpiry: expiry });

      if (process.env.NODE_ENV === "production") {
        return res.json({ message: genericMessage });
      }

      const resetLink = `/redefinir-senha?token=${token}`;
      return res.json({ message: genericMessage, resetLink, _dev: "Em producao este link seria enviado por email" });
    } catch (err) {
      return res.status(500).json({ message: "Erro interno" });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) return res.status(400).json({ message: "Token e senha sao obrigatorios" });
      if (password.length < 8) return res.status(400).json({ message: "A senha deve ter pelo menos 8 caracteres" });
      const user = await storage.getUserByResetToken(token);
      if (!user || !user.resetTokenExpiry || new Date() > new Date(user.resetTokenExpiry)) {
        return res.status(400).json({ message: "Token invalido ou expirado" });
      }
      const hashedPassword = await hashPassword(password);
      await storage.updateUser(user.id, { password: hashedPassword, resetToken: null, resetTokenExpiry: null });
      return res.json({ message: "Senha redefinida com sucesso. Faca login com a nova senha." });
    } catch (err) {
      return res.status(500).json({ message: "Erro interno" });
    }
  });

  app.patch("/api/auth/profile", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const { nomeCompleto } = req.body;
      await storage.updateUser(userId, { nomeCompleto });
      const user = await storage.getUser(userId);
      return res.json({ id: user!.id, username: user!.username, nomeCompleto: user!.nomeCompleto });
    } catch (err) {
      return res.status(500).json({ message: "Erro interno" });
    }
  });
}

export function requireAuth(req: any, res: any, next: any) {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ message: "Nao autenticado" });
}
