/**
 * Backend falso.
 *
 * Existe por dois motivos, nessa ordem: o front desenvolve antes do backend
 * existir, e o contrato é validado enquanto ainda está sendo escrito — um
 * contrato que ninguém exercitou só revela seus buracos em integração.
 *
 * A regra que governa este arquivo é **mentir o mínimo**. Ele devolve os mesmos
 * códigos do real (validação, conflito, não encontrado, não autorizado) e
 * aplica a mesma regra de escopo por cliente. Um falso permissivo é pior que
 * nenhum: ele treina a tela a não tratar o erro que só vai aparecer em
 * produção, e dá a sensação de que a integração está pronta.
 *
 * Sem framework de propósito: `node:http` e pronto. Sobe com um comando, não
 * tem build, e ninguém precisa entender uma pilha nova para mexer nele.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  CABECALHO_AUTORIZACAO, CABECALHO_CLIENTE, STATUS_POR_CODIGO,
  alterarCercaSchema, cercaSchema, criarCercaSchema,
  type CercaTransporte, type CodigoErro,
} from "@avansat/contratos";
import { cercasSemente } from "./dados";

const PORTA = Number(process.env.PORTA_API_FALSA ?? 4000);

/** Os dados vivem em memória, por cliente. Reiniciar o processo zera tudo — é falso. */
const acervo = new Map<string, CercaTransporte[]>();
function doCliente(cliente: string): CercaTransporte[] {
  if (!acervo.has(cliente)) acervo.set(cliente, cercasSemente(cliente));
  return acervo.get(cliente)!;
}

class ErroHttp extends Error {
  constructor(readonly codigo: CodigoErro, mensagem: string, readonly campos: Record<string, string> | null = null) {
    super(mensagem);
  }
}

function responder(res: ServerResponse, status: number, corpo: unknown): void {
  const texto = JSON.stringify(corpo);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(texto),
    "access-control-allow-origin": "*",
    "access-control-allow-headers": `content-type, ${CABECALHO_CLIENTE}, ${CABECALHO_AUTORIZACAO}`,
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
  });
  res.end(texto);
}

/**
 * Autenticação e escopo.
 *
 * O real valida um token de verdade; aqui basta existir. O que **não** é
 * afrouxado é o escopo: sem o cabeçalho de cliente não se lê nada, e um id de
 * outro cliente devolve 404, nunca 403. Devolver 403 contaria ao chamador que
 * aquele id existe em algum lugar, que é justamente o vazamento que o escopo
 * deveria impedir.
 */
function autenticar(req: IncomingMessage): string {
  const token = req.headers[CABECALHO_AUTORIZACAO];
  if (!token) throw new ErroHttp("nao_autenticado", "Credencial ausente.");
  const cliente = req.headers[CABECALHO_CLIENTE];
  if (typeof cliente !== "string" || !cliente.trim()) {
    throw new ErroHttp("sem_permissao", `Cabeçalho ${CABECALHO_CLIENTE} ausente: toda leitura é escopada por cliente.`);
  }
  return cliente.trim();
}

async function lerCorpo(req: IncomingMessage): Promise<unknown> {
  const partes: Buffer[] = [];
  for await (const parte of req) partes.push(parte as Buffer);
  if (!partes.length) return {};
  try {
    return JSON.parse(Buffer.concat(partes).toString("utf8"));
  } catch {
    throw new ErroHttp("validacao", "Corpo não é JSON válido.");
  }
}

function validar<T>(esquema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: { issues: { path: PropertyKey[]; message: string }[] } } }, valor: unknown): T {
  const r = esquema.safeParse(valor);
  if (r.success) return r.data as T;
  const campos: Record<string, string> = {};
  for (const problema of r.error?.issues ?? []) campos[problema.path.join(".") || "_"] = problema.message;
  throw new ErroHttp("validacao", "Corpo inválido.", campos);
}

const agora = () => new Date().toISOString();

/** Roteamento por comparação de caminho — são seis rotas, não precisa de mais. */
async function rotear(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://localhost:${PORTA}`);
  const caminho = url.pathname.replace(/\/+$/, "") || "/";

  if (req.method === "OPTIONS") return responder(res, 204, {});
  if (caminho === "/saude") return responder(res, 200, { ok: true, servico: "api-falsa" });

  const cliente = autenticar(req);
  const cercas = doCliente(cliente);
  const idDaRota = caminho.startsWith("/api/cercas/") ? caminho.slice("/api/cercas/".length).split("/")[0] : null;
  const achar = (id: string) => {
    const i = cercas.findIndex((c) => c.id === id);
    if (i < 0) throw new ErroHttp("nao_encontrado", `Cerca ${id} não existe neste cliente.`);
    return i;
  };

  if (caminho === "/api/cercas" && req.method === "GET") {
    const veiculo = url.searchParams.get("veiculo");
    const ativa = url.searchParams.get("ativa");
    const busca = (url.searchParams.get("busca") ?? "").trim().toLowerCase();
    const limite = Math.min(200, Math.max(1, Number(url.searchParams.get("limite") ?? 50)));
    const inicio = Number(url.searchParams.get("cursor") ?? 0);
    const filtradas = cercas.filter((c) =>
      (!veiculo || c.veiculos.includes(veiculo)) &&
      (ativa === null || c.ativa === (ativa === "true")) &&
      (!busca || `${c.nome} ${c.local}`.toLowerCase().includes(busca)));
    const pagina = filtradas.slice(inicio, inicio + limite);
    const proximo = inicio + limite < filtradas.length ? String(inicio + limite) : null;
    return responder(res, 200, { itens: pagina, proximo_cursor: proximo, total: filtradas.length });
  }

  if (idDaRota && req.method === "GET") return responder(res, 200, cercas[achar(idDaRota)]);

  if (caminho === "/api/cercas" && req.method === "POST") {
    const corpo = validar(criarCercaSchema, await lerCorpo(req));
    if (cercas.some((c) => c.nome.toLowerCase() === corpo.nome.toLowerCase())) {
      throw new ErroHttp("conflito", `Já existe uma cerca chamada "${corpo.nome}" neste cliente.`, { nome: "nome já usado" });
    }
    const nova: CercaTransporte = { ...corpo, id: `CE-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, versao: 1, criado_em: agora(), atualizado_em: agora() };
    cercas.unshift(nova);
    return responder(res, 201, nova);
  }

  if (idDaRota && req.method === "PATCH") {
    const indice = achar(idDaRota);
    const corpo = validar(alterarCercaSchema, await lerCorpo(req));
    const atual = cercas[indice];
    // Conflito de versão: o real precisa disso, então o falso também precisa.
    if (corpo.versao !== atual.versao) {
      throw new ErroHttp("conflito", `A cerca mudou: você está na versão ${corpo.versao}, o servidor está na ${atual.versao}.`);
    }
    const { versao: _ignorada, ...mudancas } = corpo;
    const atualizada: CercaTransporte = { ...atual, ...mudancas, versao: atual.versao + 1, atualizado_em: agora() };
    cercas[indice] = validar(cercaSchema, atualizada);
    return responder(res, 200, cercas[indice]);
  }

  if (idDaRota && req.method === "DELETE") {
    cercas.splice(achar(idDaRota), 1);
    return responder(res, 204, {});
  }

  throw new ErroHttp("nao_encontrado", `Rota ${req.method} ${caminho} não existe.`);
}

export function criarServidorFalso() {
  return createServer((req, res) => {
    rotear(req, res).catch((erro: unknown) => {
      if (erro instanceof ErroHttp) {
        return responder(res, STATUS_POR_CODIGO[erro.codigo], { codigo: erro.codigo, mensagem: erro.message, campos: erro.campos });
      }
      console.error("[api-falsa] erro não tratado", erro);
      responder(res, 500, { codigo: "indisponivel", mensagem: "Erro interno na API falsa.", campos: null });
    });
  });
}

if (process.env.NODE_ENV !== "test") {
  criarServidorFalso().listen(PORTA, () => {
    console.log(`API falsa em http://localhost:${PORTA} — envie ${CABECALHO_CLIENTE} e ${CABECALHO_AUTORIZACAO}`);
  });
}
