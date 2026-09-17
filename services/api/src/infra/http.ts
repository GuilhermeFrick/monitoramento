/**
 * HTTP sem framework, do mesmo jeito que o backend falso.
 *
 * Este arquivo não conhece domínio nenhum: não sabe o que é dispositivo nem
 * cerca. Ele resolve credencial, escopo, corpo, erro e rota — e nada mais.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  CABECALHO_AUTORIZACAO,
  CABECALHO_CLIENTE,
  STATUS_POR_CODIGO,
  type CodigoErro,
} from "@avansat/contratos";
import type { ZodType } from "zod";

/** Erro que vira resposta HTTP. Qualquer outro erro vira 500 e log. */
export class ErroHttp extends Error {
  constructor(
    readonly codigo: CodigoErro,
    mensagem: string,
    readonly campos: Record<string, string> | null = null,
  ) {
    super(mensagem);
  }
}

export function responder(res: ServerResponse, status: number, corpo: unknown): void {
  const texto = corpo === null ? "" : JSON.stringify(corpo);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(texto),
    "access-control-allow-origin": "*",
    "access-control-allow-headers": `content-type, ${CABECALHO_CLIENTE}, ${CABECALHO_AUTORIZACAO}`,
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
  });
  res.end(texto);
}

export function responderErro(res: ServerResponse, erro: unknown): void {
  if (erro instanceof ErroHttp) {
    responder(res, STATUS_POR_CODIGO[erro.codigo], {
      codigo: erro.codigo,
      mensagem: erro.message,
      campos: erro.campos,
    });
    return;
  }
  // Erro não previsto não vaza detalhe para o cliente, mas vai inteiro para o
  // log: a mensagem do Postgres costuma conter nome de coluna e valor.
  console.error("erro não tratado:", erro);
  responder(res, 500, { codigo: "indisponivel", mensagem: "Erro interno.", campos: null });
}

/**
 * Autenticação e escopo.
 *
 * Por ora a credencial só precisa existir — a validação de token entra quando
 * houver emissor. O que **não** se afrouxa é o escopo: sem o cabeçalho de
 * cliente não se lê nada.
 */
export function autenticar(req: IncomingMessage): string {
  if (!req.headers[CABECALHO_AUTORIZACAO]) {
    throw new ErroHttp("nao_autenticado", "Credencial ausente.");
  }
  const cliente = req.headers[CABECALHO_CLIENTE];
  if (typeof cliente !== "string" || !cliente.trim()) {
    throw new ErroHttp(
      "sem_permissao",
      `Cabeçalho ${CABECALHO_CLIENTE} ausente: toda leitura é escopada por cliente.`,
    );
  }
  return cliente.trim();
}

const LIMITE_CORPO = 1 << 20;

export async function lerCorpo(req: IncomingMessage): Promise<unknown> {
  const partes: Buffer[] = [];
  let total = 0;
  for await (const parte of req) {
    total += (parte as Buffer).length;
    if (total > LIMITE_CORPO) throw new ErroHttp("validacao", "Corpo grande demais.");
    partes.push(parte as Buffer);
  }
  if (total === 0) return {};
  try {
    return JSON.parse(Buffer.concat(partes).toString("utf8"));
  } catch {
    throw new ErroHttp("validacao", "Corpo não é JSON válido.");
  }
}

/**
 * Valida contra o contrato e devolve o erro no formato que a tela espera.
 *
 * Os campos vêm com o caminho do erro como chave — `politica.limite_kmh` e não
 * só `politica` — porque é isso que permite a tela destacar o campo certo em
 * vez de mostrar um aviso genérico no topo do formulário.
 */
export function validar<T>(esquema: ZodType<T>, valor: unknown): T {
  const resultado = esquema.safeParse(valor);
  if (resultado.success) return resultado.data;

  const campos: Record<string, string> = {};
  for (const problema of resultado.error.issues) {
    campos[problema.path.join(".") || "_"] = problema.message;
  }
  throw new ErroHttp("validacao", "Corpo inválido.", campos);
}

/** Rota casada: método, expressão do caminho, e o que fazer. */
export type Manipulador = (ctx: {
  req: IncomingMessage;
  res: ServerResponse;
  cliente: string;
  params: Record<string, string>;
  url: URL;
}) => Promise<void>;

export type Rota = { metodo: string; padrao: RegExp; fazer: Manipulador };

/**
 * Monta uma rota a partir de um caminho com `:nome`.
 *
 * A ordem de registro importa: `/api/dispositivos/desconhecidos` precisa vir
 * antes de `/api/dispositivos/:id`, senão "desconhecidos" é lido como um id e
 * a resposta vira 404 sem explicação.
 */
export function rota(metodo: string, caminho: string, fazer: Manipulador): Rota {
  const padrao = new RegExp(
    "^" + caminho.replace(/:[a-zA-Z_]+/g, (m) => `(?<${m.slice(1)}>[^/]+)`) + "$",
  );
  return { metodo, padrao, fazer };
}

export function criarRoteador(rotas: Rota[]) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? "/", "http://interno");

    if (req.method === "OPTIONS") {
      responder(res, 204, null);
      return;
    }

    try {
      for (const r of rotas) {
        if (r.metodo !== req.method) continue;
        const casou = r.padrao.exec(url.pathname);
        if (!casou) continue;
        const cliente = autenticar(req);
        await r.fazer({ req, res, cliente, params: { ...casou.groups }, url });
        return;
      }
      throw new ErroHttp("nao_encontrado", `Sem rota para ${req.method} ${url.pathname}.`);
    } catch (erro) {
      responderErro(res, erro);
    }
  };
}
