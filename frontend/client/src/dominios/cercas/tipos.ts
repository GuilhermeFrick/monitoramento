/**
 * O modelo de domínio de Cercas — como a tela pensa, não como o fio fala.
 *
 * Diferenças propositais em relação a `@avansat/contratos`:
 *
 *  - camelCase, porque é TypeScript e não JSON de transporte;
 *  - `Date | null` em vez de texto, para a tela nunca fazer aritmética de data
 *    com string;
 *  - nenhum campo opcional. Onde o transporte permite nulo, aqui o valor é nulo
 *    ou é o vazio do tipo — `undefined` não viaja para dentro da interface.
 *
 * Nada aqui importa outro domínio. Se um dia Cercas precisar do nome de um
 * veículo, quem cruza é a casca da aplicação, passando por props.
 */
import type { CategoriaCerca, GeometriaTransporte } from "@avansat/contratos";

export type Coordenada = { lat: number; lng: number };

export type Geometria =
  | { tipo: "circulo"; centro: Coordenada; raioM: number }
  | { tipo: "poligono"; vertices: Coordenada[] }
  | { tipo: "retangulo"; sudoeste: Coordenada; nordeste: Coordenada }
  | { tipo: "linha"; vertices: Coordenada[]; corredorM: number };

export type TipoGeometria = Geometria["tipo"];
export type { CategoriaCerca, GeometriaTransporte };

export type PoliticaCerca = {
  /** Nulo significa "sem limite". Zero significa "entrada proibida" — não são a mesma coisa. */
  permanenciaMaxMin: number | null;
  limiteKmh: number | null;
  janela: string;
};

export type Cerca = {
  id: string;
  nome: string;
  /** Vazio, nunca ausente: a tela decide se mostra o subtítulo com base nisto. */
  descricao: string;
  categoria: CategoriaCerca;
  politica: PoliticaCerca;
  ativa: boolean;
  local: string;
  versao: number;
  geometria: Geometria;
  veiculos: string[];
  vigenciaInicio: Date | null;
  vigenciaFim: Date | null;
  criadoEm: Date;
  atualizadoEm: Date;
};

/** Campos que o operador preenche. Id, versão e carimbos são do servidor. */
export type RascunhoCerca = Omit<Cerca, "id" | "versao" | "criadoEm" | "atualizadoEm">;

export type FiltroCercas = {
  veiculo: string | null;
  ativa: boolean | null;
  busca: string;
};

export type PaginaCercas = {
  itens: Cerca[];
  proximoCursor: string | null;
  total: number;
};

/**
 * Vigente hoje?
 *
 * Regra de domínio, e por isso mora aqui e não na tela: uma cerca fora da
 * janela de vigência não pode parecer igual a uma vigente, e mais de uma tela
 * precisa dessa resposta.
 */
export function vigenteEm(cerca: Cerca, momento: Date = new Date()): boolean {
  const dia = new Date(momento.getFullYear(), momento.getMonth(), momento.getDate());
  if (cerca.vigenciaInicio && cerca.vigenciaInicio > dia) return false;
  if (cerca.vigenciaFim && cerca.vigenciaFim < dia) return false;
  return true;
}
