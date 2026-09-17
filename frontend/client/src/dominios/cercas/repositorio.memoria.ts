/**
 * A implementação sem servidor.
 *
 * Serve a teste de componente e a demonstração offline. Como o falso, ela
 * **mente o mínimo**: aplica o mesmo conflito de versão e o mesmo erro de nome
 * repetido. Uma implementação em memória que aceita tudo faz o teste passar e a
 * produção falhar, que é o pior dos dois mundos.
 */
import { ErroApi } from "../../infra/http";
import type { ConsultaCercas, RepositorioCercas } from "./repositorio";
import type { Cerca, PaginaCercas, RascunhoCerca } from "./tipos";

export class RepositorioCercasMemoria implements RepositorioCercas {
  private readonly acervo: Cerca[];
  constructor(iniciais: Cerca[] = []) {
    this.acervo = iniciais.map((c) => ({ ...c }));
  }

  private achar(id: string): number {
    const i = this.acervo.findIndex((c) => c.id === id);
    if (i < 0) throw new ErroApi("nao_encontrado", `Cerca ${id} não existe.`, null, 404);
    return i;
  }

  async listar(consulta: ConsultaCercas): Promise<PaginaCercas> {
    const termo = consulta.busca.trim().toLowerCase();
    const filtradas = this.acervo.filter((c) =>
      (!consulta.veiculo || c.veiculos.includes(consulta.veiculo)) &&
      (consulta.ativa === null || c.ativa === consulta.ativa) &&
      (!termo || `${c.nome} ${c.local}`.toLowerCase().includes(termo)));
    const inicio = Number(consulta.cursor ?? 0);
    const pagina = filtradas.slice(inicio, inicio + consulta.limite);
    const proximo = inicio + consulta.limite < filtradas.length ? String(inicio + consulta.limite) : null;
    return { itens: pagina.map((c) => ({ ...c })), proximoCursor: proximo, total: filtradas.length };
  }

  async obter(id: string): Promise<Cerca> {
    return { ...this.acervo[this.achar(id)] };
  }

  async criar(rascunho: RascunhoCerca): Promise<Cerca> {
    if (this.acervo.some((c) => c.nome.toLowerCase() === rascunho.nome.toLowerCase())) {
      throw new ErroApi("conflito", `Já existe uma cerca chamada "${rascunho.nome}".`, { nome: "nome já usado" }, 409);
    }
    const agora = new Date();
    const nova: Cerca = { ...rascunho, id: `CE-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, versao: 1, criadoEm: agora, atualizadoEm: agora };
    this.acervo.unshift(nova);
    return { ...nova };
  }

  async alterar(id: string, versao: number, mudancas: Partial<RascunhoCerca>): Promise<Cerca> {
    const indice = this.achar(id);
    const atual = this.acervo[indice];
    if (versao !== atual.versao) {
      throw new ErroApi("conflito", `A cerca mudou: você está na versão ${versao}, o acervo está na ${atual.versao}.`, null, 409);
    }
    const atualizada: Cerca = { ...atual, ...mudancas, versao: atual.versao + 1, atualizadoEm: new Date() };
    this.acervo[indice] = atualizada;
    return { ...atualizada };
  }

  async remover(id: string): Promise<void> {
    this.acervo.splice(this.achar(id), 1);
  }
}
