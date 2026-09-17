/**
 * A porta do domínio.
 *
 * Quem consome Cercas importa daqui e de mais lugar nenhum. A escolha entre
 * falar com servidor ou rodar em memória é de ambiente, não de componente: a
 * tela não sabe qual das duas recebeu, e é essa ignorância que deixa trocar de
 * backend sem tocar em JSX.
 */
import { ClienteHttp } from "../../infra/http";
import { RepositorioCercasHttp } from "./repositorio.http";
import { RepositorioCercasMemoria } from "./repositorio.memoria";
import type { RepositorioCercas } from "./repositorio";
import type { Cerca } from "./tipos";

export type { Cerca, RascunhoCerca, FiltroCercas, PaginaCercas, Geometria, TipoGeometria, PoliticaCerca, CategoriaCerca } from "./tipos";
export { vigenteEm } from "./tipos";
export type { RepositorioCercas, ConsultaCercas } from "./repositorio";
export { CONSULTA_PADRAO } from "./repositorio";
export { RepositorioCercasMemoria } from "./repositorio.memoria";
export { cercaDoFio, rascunhoParaOFio, geometriaDoFio, geometriaParaOFio } from "./mapeamento";

export type OrigemDados = "http" | "memoria";

export function criarRepositorioCercas(opcoes: {
  origem?: OrigemDados;
  baseUrl?: string;
  cliente?: string;
  token?: () => string | null;
  iniciais?: Cerca[];
} = {}): RepositorioCercas {
  const origem = opcoes.origem
    ?? (import.meta.env?.VITE_ORIGEM_DADOS as OrigemDados | undefined)
    ?? "http";
  if (origem === "memoria") return new RepositorioCercasMemoria(opcoes.iniciais ?? []);
  return new RepositorioCercasHttp(new ClienteHttp({
    baseUrl: opcoes.baseUrl ?? (import.meta.env?.VITE_API_BASE as string | undefined) ?? window.location.origin,
    cliente: opcoes.cliente ?? (import.meta.env?.VITE_CLIENTE as string | undefined) ?? "avansat-demo",
    token: opcoes.token ?? (() => (import.meta.env?.VITE_TOKEN as string | undefined) ?? "Bearer demo"),
  }));
}
