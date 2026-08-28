import { Pool, type PoolConfig } from "pg";

function readNumber(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function createPostgresPool(): Pool {
  const max = readNumber(process.env.PGPOOL_MAX, 5);
  const connectionString = process.env.DATABASE_URL;

  if (connectionString) {
    return new Pool({ connectionString, max });
  }

  const config: PoolConfig = {
    host: process.env.PGHOST,
    port: readNumber(process.env.PGPORT, 5432),
    database: process.env.PGDATABASE ?? "explorer",
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    max,
  };

  return new Pool(config);
}
