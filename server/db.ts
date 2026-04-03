import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";
import { ENV } from "./env";

export const pool = new pg.Pool({
  connectionString: ENV.databaseUrl,
});

export const db = drizzle(pool, { schema });
