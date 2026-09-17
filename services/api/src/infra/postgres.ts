/**
 * Conexão com o Postgres. Não conhece domínio.
 */
import pg from "pg";

/**
 * O Postgres devolve `numeric` como string, para não perder precisão em valores
 * que não cabem num double. Nas nossas tabelas não há `numeric` — contadores e
 * versões são `integer` — então deixamos como vem e convertemos no domínio,
 * onde se sabe o que o número significa.
 */
export const pool = new pg.Pool({
  host: process.env.PGHOST ?? "localhost",
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? "avansat",
  password: process.env.PGPASSWORD ?? "avansat",
  database: process.env.PGDATABASE ?? "avansat",
  max: Number(process.env.PGPOOL_MAX ?? 10),
  // Consulta que trava segura uma conexão do pool até o fim do mundo. Melhor
  // falhar em cinco segundos e devolver 503 do que empilhar requisições.
  statement_timeout: 5_000,
  connectionTimeoutMillis: 5_000,
});

export async function consultar<T extends pg.QueryResultRow>(
  sql: string,
  valores: unknown[] = [],
): Promise<T[]> {
  const resultado = await pool.query<T>(sql, valores);
  return resultado.rows;
}

/** Códigos do Postgres que o domínio precisa distinguir de um erro qualquer. */
export const ERRO_PG = {
  /** Violação de unicidade: serial repetido, veículo já com aparelho. */
  UNICO: "23505",
  /** Violação de chave estrangeira. */
  ESTRANGEIRA: "23503",
  /** Violação de check: valor fora do conjunto permitido. */
  RESTRICAO: "23514",
} as const;

export function codigoPg(erro: unknown): string | null {
  if (erro && typeof erro === "object" && "code" in erro && typeof erro.code === "string") {
    return erro.code;
  }
  return null;
}

/** O nome do índice que estourou, para traduzir o conflito em mensagem útil. */
export function restricaoPg(erro: unknown): string | null {
  if (erro && typeof erro === "object" && "constraint" in erro && typeof erro.constraint === "string") {
    return erro.constraint;
  }
  return null;
}

export async function encerrar(): Promise<void> {
  await pool.end();
}
