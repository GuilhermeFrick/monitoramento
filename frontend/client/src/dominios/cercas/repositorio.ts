/**
 * O que se pode fazer com cerca — em vocabulário de negócio, não de HTTP.
 *
 * Nenhum componente conhece URL, verbo, cabeçalho ou formato de transporte.
 * Isso não é purismo: é o que permite a tela rodar contra o backend falso, o
 * real, ou nada (memória) sem mudar uma linha de JSX, e é o que torna o teste
 * de tela possível sem subir servidor.
 *
 * A interface fala de conflito e de versão porque isso é regra de negócio, não
 * detalhe de protocolo: duas pessoas editando a mesma cerca é uma situação que
 * o produto precisa tratar, venha o aviso de um 409 ou de outro transporte.
 */
import type { Cerca, FiltroCercas, PaginaCercas, RascunhoCerca } from "./tipos";

export type ConsultaCercas = FiltroCercas & { cursor: string | null; limite: number };

export interface RepositorioCercas {
  listar(consulta: ConsultaCercas, signal?: AbortSignal): Promise<PaginaCercas>;
  obter(id: string, signal?: AbortSignal): Promise<Cerca>;
  criar(rascunho: RascunhoCerca, signal?: AbortSignal): Promise<Cerca>;
  /** `versao` é a que o operador tinha em mãos; divergiu, o repositório sinaliza conflito. */
  alterar(id: string, versao: number, mudancas: Partial<RascunhoCerca>, signal?: AbortSignal): Promise<Cerca>;
  remover(id: string, signal?: AbortSignal): Promise<void>;
}

export const CONSULTA_PADRAO: ConsultaCercas = {
  veiculo: null,
  ativa: null,
  busca: "",
  cursor: null,
  limite: 50,
};
