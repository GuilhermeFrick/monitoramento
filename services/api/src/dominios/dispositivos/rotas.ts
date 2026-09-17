/**
 * Rotas de dispositivos. Traduz HTTP em chamada de repositório e nada mais —
 * regra de negócio fica no repositório, formato de erro fica na infra.
 */
import {
  ROTAS_DISPOSITIVOS,
  alterarDispositivoSchema,
  criarDispositivoSchema,
  filtroDispositivosSchema,
} from "@avansat/contratos";
import { lerCorpo, responder, rota, validar, type Rota } from "../../infra/http";
import * as repositorio from "./repositorio";

/** Query string vira filtro. Ausente é nulo, nunca undefined. */
function lerFiltro(url: URL) {
  const texto = (chave: string) => url.searchParams.get(chave);
  const booleano = (chave: string) => {
    const v = texto(chave);
    return v === null ? null : v === "true";
  };
  return validar(filtroDispositivosSchema, {
    situacao: texto("situacao"),
    familia: texto("familia"),
    sem_veiculo: booleano("sem_veiculo"),
    busca: texto("busca"),
    cursor: texto("cursor"),
    limite: Number(texto("limite") ?? 50),
  });
}

export const rotasDispositivos: Rota[] = [
  // Antes de :id, senão "desconhecidos" é lido como um identificador.
  rota("GET", ROTAS_DISPOSITIVOS.desconhecidos, async ({ res, url }) => {
    const limite = Math.min(Number(url.searchParams.get("limite") ?? 50), 200);
    const itens = await repositorio.desconhecidos(limite);
    responder(res, 200, { itens, proximo_cursor: null, total: itens.length });
  }),

  rota("GET", ROTAS_DISPOSITIVOS.listar, async ({ res, cliente, url }) => {
    responder(res, 200, await repositorio.listar(cliente, lerFiltro(url)));
  }),

  rota("GET", "/api/dispositivos/:id", async ({ res, cliente, params }) => {
    responder(res, 200, await repositorio.obter(cliente, params.id!));
  }),

  rota("POST", ROTAS_DISPOSITIVOS.criar, async ({ req, res, cliente }) => {
    const entrada = validar(criarDispositivoSchema, await lerCorpo(req));
    responder(res, 201, await repositorio.criar(cliente, entrada));
  }),

  rota("PATCH", "/api/dispositivos/:id", async ({ req, res, cliente, params }) => {
    const mudancas = validar(alterarDispositivoSchema, await lerCorpo(req));
    responder(res, 200, await repositorio.alterar(cliente, params.id!, mudancas));
  }),

  rota("DELETE", "/api/dispositivos/:id", async ({ res, cliente, params }) => {
    await repositorio.remover(cliente, params.id!);
    responder(res, 204, null);
  }),
];
