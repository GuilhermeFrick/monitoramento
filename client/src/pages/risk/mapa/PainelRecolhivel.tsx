/**
 * Painel lateral que vira trilho.
 *
 * Nas telas de geografia o mapa é a ferramenta; lista e inspetor são apoio. Com
 * três colunas fixas mais a árvore de frota, sobrava pouco mapa justamente onde
 * se desenha. Aqui cada painel de apoio recolhe para um trilho de ícones que
 * mantém a troca rápida de item — o que se perde é a descrição, não a navegação.
 *
 * O gesto e o desenho do trilho são os mesmos do navegador de veículos, para não
 * inventar um segundo vocabulário de recolher dentro do mesmo workspace.
 */
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type AtalhoPainel = {
  id: string;
  icone: ReactNode;
  rotulo: string;
  ativo: boolean;
  /** Ponto de estado no canto do ícone, como no trilho de veículos. */
  estado?: "ok" | "atencao" | "inativo" | "risco";
  aoClicar: () => void;
};

export function PainelRecolhivel({ recolhido, onAlternar, titulo, subtitulo, lado = "esquerda", atalhos, classe, children }: {
  recolhido: boolean;
  onAlternar: () => void;
  titulo: string;
  subtitulo?: string;
  lado?: "esquerda" | "direita";
  atalhos: AtalhoPainel[];
  classe?: string;
  children: ReactNode;
}) {
  if (recolhido) {
    return <aside className={`geo-trilho geo-trilho-${lado}`} aria-label={titulo}>
      <button
        type="button"
        className="geo-trilho-toggle"
        onClick={onAlternar}
        aria-expanded={false}
        title={`Expandir ${titulo.toLowerCase()}`}
        aria-label={`Expandir ${titulo.toLowerCase()}`}
      >{lado === "esquerda" ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}</button>
      <div className="geo-trilho-atalhos">
        {atalhos.map((atalho) => <button
          key={atalho.id}
          type="button"
          className={atalho.ativo ? "ativo" : ""}
          onClick={atalho.aoClicar}
          aria-pressed={atalho.ativo}
          title={atalho.rotulo}
          aria-label={atalho.rotulo}
        >{atalho.icone}{atalho.estado ? <i className={`geo-trilho-ponto ${atalho.estado}`} /> : null}</button>)}
      </div>
    </aside>;
  }

  return <div className={classe}>
    <div className="geo-card-head">
      <div><strong>{titulo}</strong>{subtitulo ? <span>{subtitulo}</span> : null}</div>
      <button
        type="button"
        className="geo-painel-toggle"
        onClick={onAlternar}
        aria-expanded
        title={`Recolher ${titulo.toLowerCase()} e ampliar o mapa`}
        aria-label={`Recolher ${titulo.toLowerCase()} e ampliar o mapa`}
      >{lado === "esquerda" ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}</button>
    </div>
    {children}
  </div>;
}
