import { z } from "zod";

/**
 * O que trafega no fio — e só isso.
 *
 * Este pacote descreve o **transporte**: snake_case, data em texto, nulo
 * explícito. Ele não descreve o modelo de domínio de nenhum dos dois lados.
 * Quem traduz é a fronteira de cada lado (o mapeamento do repositório no front,
 * o mapeamento do domínio no serviço), e é de propósito que a tradução exista
 * em um lugar só: sem ela, o formato do transporte vaza para dentro da tela e
 * qualquer troca de backend vira reescrita.
 *
 * Regra que vale para todo esquema daqui: **campo que a interface usa para
 * decidir alguma coisa é obrigatório na chave, mesmo podendo ser nulo no
 * valor.** Chave opcional esquecida no mapeamento passa pelo compilador e vira
 * bug silencioso; chave obrigatória com valor nulo não passa.
 */

/** Códigos que o serviço real devolve — o falso devolve exatamente os mesmos. */
export const CODIGOS_ERRO = [
  "validacao",       // 422 — corpo malformado ou regra de campo violada
  "nao_autenticado", // 401 — sem credencial ou credencial expirada
  "sem_permissao",   // 403 — autenticado, mas fora do escopo do cliente
  "nao_encontrado",  // 404 — id inexistente, ou existente em outro cliente
  "conflito",        // 409 — versão defasada, ou unicidade violada
  "indisponivel",    // 503 — dependência externa fora do ar
] as const;

export type CodigoErro = (typeof CODIGOS_ERRO)[number];

export const STATUS_POR_CODIGO: Record<CodigoErro, number> = {
  validacao: 422,
  nao_autenticado: 401,
  sem_permissao: 403,
  nao_encontrado: 404,
  conflito: 409,
  indisponivel: 503,
};

/**
 * Envelope de erro.
 *
 * `campos` existe para o erro de validação conseguir apontar onde doeu, em vez
 * de devolver uma frase que a tela só sabe exibir inteira.
 */
export const erroSchema = z.object({
  codigo: z.enum(CODIGOS_ERRO),
  mensagem: z.string(),
  campos: z.record(z.string(), z.string()).nullable(),
});
export type ErroTransporte = z.infer<typeof erroSchema>;

/** Página. O cursor é opaco: quem consome não interpreta, só devolve. */
export const paginaSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    itens: z.array(item),
    proximo_cursor: z.string().nullable(),
    total: z.number().int().nonnegative(),
  });

export type Pagina<T> = { itens: T[]; proximo_cursor: string | null; total: number };

/**
 * Escopo por cliente.
 *
 * Não é cabeçalho opcional de conveniência: é o que separa a frota de um
 * cliente da do outro. O falso aplica a mesma regra do real justamente porque
 * um falso permissivo esconde vazamento de escopo até a produção.
 */
export const CABECALHO_CLIENTE = "x-avansat-cliente";
export const CABECALHO_AUTORIZACAO = "authorization";

/** Data e hora no fio é sempre texto ISO 8601 em UTC. */
export const instanteSchema = z.string().datetime({ offset: true });
/** Data sem hora é sempre AAAA-MM-DD. */
export const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "esperado AAAA-MM-DD");
