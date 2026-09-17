/**
 * A implementação que fala com o servidor.
 *
 * É o único arquivo do domínio que conhece rota e verbo. Ele valida a resposta
 * contra o contrato antes de mapear: servidor fora do contrato vira erro aqui,
 * na fronteira, e não um campo indefinido descoberto três componentes adiante.
 */
import { ROTAS_CERCAS, cercaSchema, paginaCercasSchema } from "@avansat/contratos";
import { ErroApi, type ClienteHttp } from "../../infra/http";
import { cercaDoFio, rascunhoParaOFio } from "./mapeamento";
import type { ConsultaCercas, RepositorioCercas } from "./repositorio";
import type { Cerca, PaginaCercas, RascunhoCerca } from "./tipos";

function validado<T>(esquema: { safeParse: (v: unknown) => { success: boolean; data?: T } }, bruto: unknown, oque: string): T {
  const r = esquema.safeParse(bruto);
  if (!r.success) throw new ErroApi("indisponivel", `O servidor devolveu ${oque} fora do contrato.`, null, 502);
  return r.data as T;
}

export class RepositorioCercasHttp implements RepositorioCercas {
  constructor(private readonly http: ClienteHttp) {}

  async listar(consulta: ConsultaCercas, signal?: AbortSignal): Promise<PaginaCercas> {
    const bruto = await this.http.requisitar(ROTAS_CERCAS.listar, {
      busca: {
        veiculo: consulta.veiculo, ativa: consulta.ativa, busca: consulta.busca,
        cursor: consulta.cursor, limite: consulta.limite,
      },
      signal,
    });
    const pagina = validado(paginaCercasSchema, bruto, "a lista de cercas");
    return { itens: pagina.itens.map(cercaDoFio), proximoCursor: pagina.proximo_cursor, total: pagina.total };
  }

  async obter(id: string, signal?: AbortSignal): Promise<Cerca> {
    return cercaDoFio(validado(cercaSchema, await this.http.requisitar(ROTAS_CERCAS.obter(id), { signal }), "a cerca"));
  }

  async criar(rascunho: RascunhoCerca, signal?: AbortSignal): Promise<Cerca> {
    const bruto = await this.http.requisitar(ROTAS_CERCAS.criar, { metodo: "POST", corpo: rascunhoParaOFio(rascunho), signal });
    return cercaDoFio(validado(cercaSchema, bruto, "a cerca criada"));
  }

  async alterar(id: string, versao: number, mudancas: Partial<RascunhoCerca>, signal?: AbortSignal): Promise<Cerca> {
    // Só o que mudou vai no corpo; a versão vai sempre, porque é ela que detecta o conflito.
    const parcial = rascunhoParaOFio({
      nome: "", descricao: "", categoria: "operacional", ativa: true, local: "",
      politica: { permanenciaMaxMin: null, limiteKmh: null, janela: "24h" },
      geometria: { tipo: "circulo", centro: { lat: 0, lng: 0 }, raioM: 25 },
      veiculos: [], vigenciaInicio: null, vigenciaFim: null,
      ...mudancas,
    } as RascunhoCerca);
    const corpo: Record<string, unknown> = { versao };
    for (const chave of Object.keys(mudancas) as (keyof RascunhoCerca)[]) {
      const noFio = ({ politica: "politica", geometria: "geometria", vigenciaInicio: "vigencia_inicio", vigenciaFim: "vigencia_fim" } as Record<string, string>)[chave] ?? chave;
      corpo[noFio] = (parcial as unknown as Record<string, unknown>)[noFio];
    }
    const bruto = await this.http.requisitar(ROTAS_CERCAS.alterar(id), { metodo: "PATCH", corpo, signal });
    return cercaDoFio(validado(cercaSchema, bruto, "a cerca alterada"));
  }

  async remover(id: string, signal?: AbortSignal): Promise<void> {
    await this.http.requisitar(ROTAS_CERCAS.remover(id), { metodo: "DELETE", signal });
  }
}
