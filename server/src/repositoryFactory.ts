import type { GraphRepository } from "./graphRepository";
import { createPostgresPool } from "./postgresConnection";
import { PostgresGraphRepository } from "./postgresGraphRepository";

export function createGraphRepository(): GraphRepository {
  return new PostgresGraphRepository(createPostgresPool());
}
