/**
 * Cliente HTTP — e nada além disso.
 *
 * Esta camada não conhece cerca, veículo nem rotograma. Ela sabe montar
 * requisição, anexar credencial e escopo, e transformar o envelope de erro do
 * servidor em erro tipado. Qualquer nome daqui faz sentido para quem nunca
 * ouviu falar do negócio — que é exatamente o critério para algo ser
 * infraestrutura em vez de domínio.
 */
import { CABECALHO_AUTORIZACAO, CABECALHO_CLIENTE, erroSchema, type CodigoErro } from "@avansat/contratos";

/**
 * Erro com código, não com frase.
 *
 * A tela precisa ramificar — conflito pede recarregar, validação pede apontar o
 * campo, não encontrado pede voltar para a lista. Se o erro chegasse só como
 * texto, toda tela acabaria comparando string de mensagem, que quebra na
 * primeira vez que alguém melhora a redação no servidor.
 */
export class ErroApi extends Error {
  constructor(
    readonly codigo: CodigoErro,
    mensagem: string,
    readonly campos: Record<string, string> | null,
    readonly status: number,
  ) {
    super(mensagem);
    this.name = "ErroApi";
  }
  /** Conflito de versão: alguém salvou antes. A tela recarrega e reaplica. */
  get ehConflito() { return this.codigo === "conflito"; }
  get ehValidacao() { return this.codigo === "validacao"; }
}

/** Sem rede não há código do servidor; a tela ainda precisa distinguir isso de um 500. */
export class ErroRede extends Error {
  constructor(causa: unknown) {
    super("Sem conexão com o servidor.");
    this.name = "ErroRede";
    this.cause = causa;
  }
}

export type ConfigHttp = {
  baseUrl: string;
  /** Escopo do cliente. Vai em toda requisição: não é opcional, é o que separa uma frota da outra. */
  cliente: string;
  token: () => string | null;
};

export type OpcoesRequisicao = {
  metodo?: "GET" | "POST" | "PATCH" | "DELETE";
  corpo?: unknown;
  busca?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
};

export class ClienteHttp {
  constructor(private readonly config: ConfigHttp) {}

  async requisitar<T>(caminho: string, opcoes: OpcoesRequisicao = {}): Promise<T> {
    const url = new URL(caminho, this.config.baseUrl);
    for (const [chave, valor] of Object.entries(opcoes.busca ?? {})) {
      if (valor !== null && valor !== undefined && valor !== "") url.searchParams.set(chave, String(valor));
    }

    const cabecalhos: Record<string, string> = { [CABECALHO_CLIENTE]: this.config.cliente };
    const token = this.config.token();
    if (token) cabecalhos[CABECALHO_AUTORIZACAO] = token;
    if (opcoes.corpo !== undefined) cabecalhos["content-type"] = "application/json";

    let resposta: Response;
    try {
      resposta = await fetch(url, {
        method: opcoes.metodo ?? "GET",
        headers: cabecalhos,
        body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
        signal: opcoes.signal,
        credentials: "include",
      });
    } catch (causa) {
      if (opcoes.signal?.aborted) throw causa;
      throw new ErroRede(causa);
    }

    if (resposta.status === 204) return undefined as T;

    const bruto: unknown = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      const envelope = erroSchema.safeParse(bruto);
      if (envelope.success) {
        throw new ErroApi(envelope.data.codigo, envelope.data.mensagem, envelope.data.campos, resposta.status);
      }
      // Servidor fora do contrato: não inventa código, diz que está indisponível.
      throw new ErroApi("indisponivel", `Resposta ${resposta.status} fora do contrato.`, null, resposta.status);
    }
    return bruto as T;
  }
}
