import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, LayoutGrid, Link2, List, Maximize2, Plus, ZoomIn, ZoomOut } from "lucide-react";
import { proximasMacros, type ConfiguracaoVeiculo, type MacroVeiculo, type Transicao, type Validacao } from "../../domain";

export const NO_W = 168;
export const NO_H = 62;
const ESPACO_X = 232;
const ESPACO_Y = 104;

export type SelecaoGrafo = { tipo: "macro"; id: string } | { tipo: "transicao"; de: string; para: string } | { tipo: "padrao" };

type Caixa = { x: number; y: number; w: number; h: number };

/** Reposiciona as macros em camadas, a partir das de início. */
export function autoLayout(config: ConfiguracaoVeiculo): MacroVeiculo[] {
  const nivel = new Map<string, number>();
  const fila: string[] = [];
  for (const m of config.macros.filter((x) => x.tipo === "inicio")) { nivel.set(m.id, 0); fila.push(m.id); }
  for (const m of config.macros) if (!nivel.has(m.id) && !config.transicoes.some((t) => t.para === m.id)) { nivel.set(m.id, 0); fila.push(m.id); }
  while (fila.length) {
    const atual = fila.shift() as string;
    const n = nivel.get(atual) ?? 0;
    for (const t of config.transicoes.filter((x) => x.de === atual)) {
      const prox = nivel.get(t.para);
      if (prox === undefined || prox < n + 1) {
        if (prox !== undefined && prox >= n + 1) continue;
        nivel.set(t.para, n + 1);
        fila.push(t.para);
      }
    }
  }
  const porNivel = new Map<number, string[]>();
  for (const m of config.macros) {
    const n = nivel.get(m.id) ?? 0;
    porNivel.set(n, [...(porNivel.get(n) ?? []), m.id]);
  }
  return config.macros.map((m) => {
    const n = nivel.get(m.id) ?? 0;
    const indice = (porNivel.get(n) ?? []).indexOf(m.id);
    return { ...m, x: 40 + n * ESPACO_X, y: 40 + indice * ESPACO_Y };
  });
}

function limites(macros: MacroVeiculo[]): Caixa {
  if (!macros.length) return { x: 0, y: 0, w: 800, h: 400 };
  const x1 = Math.min(...macros.map((m) => m.x));
  const y1 = Math.min(...macros.map((m) => m.y));
  const x2 = Math.max(...macros.map((m) => m.x + NO_W));
  const y2 = Math.max(...macros.map((m) => m.y + NO_H));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** Ponto onde a reta vinda de `origem` toca a borda da caixa centrada em `alvo`. */
function naBorda(origem: { x: number; y: number }, alvo: { x: number; y: number }) {
  const dx = alvo.x - origem.x;
  const dy = alvo.y - origem.y;
  if (!dx && !dy) return alvo;
  const ex = dx === 0 ? Infinity : (NO_W / 2 + 4) / Math.abs(dx);
  const ey = dy === 0 ? Infinity : (NO_H / 2 + 4) / Math.abs(dy);
  const e = Math.min(ex, ey);
  return { x: alvo.x - dx * e, y: alvo.y - dy * e };
}

const corta = (texto: string, max: number) => texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;

export function MacroGraphCanvas({ config, selecao, validacoes, onSelecionar, onMoverMacro, onCriarTransicao, onNovaMacro, onAutoLayout, onToast }: {
  config: ConfiguracaoVeiculo;
  selecao: SelecaoGrafo;
  validacoes: Validacao[];
  onSelecionar: (s: SelecaoGrafo) => void;
  onMoverMacro: (id: string, x: number, y: number) => void;
  onCriarTransicao: (de: string, para: string) => void;
  onNovaMacro: () => void;
  onAutoLayout: () => void;
  onToast: (m: string) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [vista, setVista] = useState<Caixa>({ x: 0, y: 0, w: 900, h: 420 });
  const [modoLigar, setModoLigar] = useState(false);
  const [ligando, setLigando] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [panorama, setPanorama] = useState<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const [modoLista, setModoLista] = useState(false);

  const erros = validacoes.filter((v) => v.nivel === "erro");
  const permitidasAgora = useMemo(() => proximasMacros(config, config.macroVigente).map((m) => m.id), [config]);

  /** Converte coordenada de tela em coordenada do grafo. */
  const emGrafo = useCallback((clientX: number, clientY: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return { x: 0, y: 0 };
    return { x: vista.x + ((clientX - r.left) / r.width) * vista.w, y: vista.y + ((clientY - r.top) / r.height) * vista.h };
  }, [vista]);

  const ajustar = useCallback(() => {
    const r = stageRef.current?.getBoundingClientRect();
    const caixa = limites(config.macros);
    const margem = 48;
    const alvoW = caixa.w + margem * 2;
    const alvoH = caixa.h + margem * 2;
    const proporcao = r && r.height ? r.width / r.height : alvoW / alvoH;
    // preserva a proporção do palco para o grafo não distorcer
    const w = Math.max(alvoW, alvoH * proporcao);
    const h = w / proporcao;
    setVista({ x: caixa.x - (w - caixa.w) / 2, y: caixa.y - (h - caixa.h) / 2, w, h });
  }, [config.macros]);

  // ajusta ao abrir e ao trocar de veículo
  useEffect(() => { ajustar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [config.veiculo]);

  const zoom = (fator: number) => setVista((v) => {
    const w = Math.min(4000, Math.max(320, v.w * fator));
    const h = w * (v.h / v.w);
    return { x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h };
  });

  const clicarNo = (id: string) => {
    if (!modoLigar) { onSelecionar({ tipo: "macro", id }); return; }
    if (!ligando) { setLigando(id); return; }
    if (ligando === id) { setLigando(null); return; }
    if (config.transicoes.some((t) => t.de === ligando && t.para === id)) { onToast("Essa transição já existe."); setLigando(null); return; }
    onCriarTransicao(ligando, id);
    setLigando(null);
  };

  const teclaNo = (e: React.KeyboardEvent, m: MacroVeiculo) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); clicarNo(m.id); return; }
    const passo = e.shiftKey ? 24 : 8;
    const mapa: Record<string, [number, number]> = { ArrowUp: [0, -passo], ArrowDown: [0, passo], ArrowLeft: [-passo, 0], ArrowRight: [passo, 0] };
    const delta = mapa[e.key];
    if (delta) { e.preventDefault(); onMoverMacro(m.id, Math.max(0, m.x + delta[0]), Math.max(0, m.y + delta[1])); }
  };

  return <section className="wsp-canvas-wrap" aria-label="Sequência de macros">
    <header className="wsp-canvas-toolbar">
      <div className="wsp-canvas-titulo">
        <h2>Sequência de macros</h2>
        <p>Cada caixa é um comportamento que o motorista informa; a seta é uma transição permitida.</p>
      </div>
      <div className="wsp-canvas-acoes">
        <div className="wsp-btn-grupo" role="group" aria-label="Zoom">
          <button className="wsp-icone" onClick={() => zoom(1 / 0.8)} aria-label="Afastar"><ZoomOut size={15} /></button>
          <button className="wsp-icone" onClick={() => zoom(0.8)} aria-label="Aproximar"><ZoomIn size={15} /></button>
          <button className="wsp-icone" onClick={ajustar} aria-label="Ajustar à tela" title="Ajustar à tela"><Maximize2 size={15} /></button>
        </div>
        <button className="wsp-btn" onClick={onAutoLayout}><LayoutGrid size={14} /> Organizar</button>
        <button className={`wsp-btn ${modoLigar ? "ativo" : ""}`} aria-pressed={modoLigar} onClick={() => { setModoLigar(!modoLigar); setLigando(null); }}>
          <Link2 size={14} /> {modoLigar ? (ligando ? "Clique o destino" : "Clique a origem") : "Ligar"}
        </button>
        <button className="wsp-btn" onClick={onNovaMacro}><Plus size={14} /> Macro</button>
        <button className={`wsp-btn ${modoLista ? "ativo" : ""}`} aria-pressed={modoLista} onClick={() => setModoLista(!modoLista)}><List size={14} /> Lista</button>
      </div>
    </header>

    {erros.length ? <button className="wsp-canvas-erros" onClick={() => { const alvo = erros.find((e) => e.macroId); if (alvo?.macroId) onSelecionar({ tipo: "macro", id: alvo.macroId }); }}>
      <AlertTriangle size={14} /> {erros.length} problema(s) impedem o embarque — ir para o primeiro
    </button> : null}

    {modoLista
      ? <ListaMacros config={config} selecao={selecao} onSelecionar={onSelecionar} />
      : <div className="wsp-canvas-stage" ref={stageRef}>
          <svg
            ref={svgRef} className="wsp-canvas-svg" viewBox={`${vista.x} ${vista.y} ${vista.w} ${vista.h}`} preserveAspectRatio="xMidYMid meet"
            onPointerDown={(e) => { if (e.target === svgRef.current) { const p = emGrafo(e.clientX, e.clientY); setPanorama({ x: p.x, y: p.y, vx: vista.x, vy: vista.y }); } }}
            onPointerMove={(e) => {
              if (arrastando) { const p = emGrafo(e.clientX, e.clientY); onMoverMacro(arrastando.id, Math.max(0, p.x - arrastando.dx), Math.max(0, p.y - arrastando.dy)); return; }
              if (panorama) { const p = emGrafo(e.clientX, e.clientY); setVista((v) => ({ ...v, x: panorama.vx + (panorama.x - p.x), y: panorama.vy + (panorama.y - p.y) })); }
            }}
            onPointerUp={() => { setArrastando(null); setPanorama(null); }}
            onPointerLeave={() => { setArrastando(null); setPanorama(null); }}
          >
            <defs>
              <marker id="wsp-seta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#9fb2c2" /></marker>
              <marker id="wsp-seta-ativa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#0f8c7e" /></marker>
              <marker id="wsp-seta-sel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#c8102e" /></marker>
            </defs>

            {config.transicoes.map((t) => {
              const de = config.macros.find((m) => m.id === t.de);
              const para = config.macros.find((m) => m.id === t.para);
              if (!de || !para) return null;
              const c1 = { x: de.x + NO_W / 2, y: de.y + NO_H / 2 };
              const c2 = { x: para.x + NO_W / 2, y: para.y + NO_H / 2 };
              const i = naBorda(c2, c1);
              const f = naBorda(c1, c2);
              const ativa = config.macroVigente === t.de;
              const sel = selecao.tipo === "transicao" && selecao.de === t.de && selecao.para === t.para;
              return <g key={`${t.de}->${t.para}`} className={`wsp-aresta ${ativa ? "ativa" : ""} ${sel ? "sel" : ""}`} onClick={() => onSelecionar({ tipo: "transicao", de: t.de, para: t.para })}>
                <line x1={i.x} y1={i.y} x2={f.x} y2={f.y} strokeWidth={16} stroke="transparent" />
                <line x1={i.x} y1={i.y} x2={f.x} y2={f.y} markerEnd={`url(#${sel ? "wsp-seta-sel" : ativa ? "wsp-seta-ativa" : "wsp-seta"})`} />
              </g>;
            })}

            {config.macros.map((m) => {
              const sel = selecao.tipo === "macro" && selecao.id === m.id;
              const vigente = config.macroVigente === m.id;
              const disponivel = permitidasAgora.includes(m.id);
              const comErro = erros.some((e) => e.macroId === m.id);
              const saidas = config.transicoes.filter((t) => t.de === m.id).length;
              return <g
                key={m.id} transform={`translate(${m.x},${m.y})`} tabIndex={0} role="button"
                aria-label={`${m.nome}, perfil ${m.perfil.nome}${vigente ? ", em curso neste veículo" : ""}`} aria-pressed={sel}
                className={`wsp-no ${sel ? "sel" : ""} ${vigente ? "vigente" : ""} ${ligando === m.id ? "ligando" : ""} ${disponivel ? "disponivel" : ""} ${comErro ? "erro" : ""}`}
                onPointerDown={(e) => { if (modoLigar) return; e.stopPropagation(); const p = emGrafo(e.clientX, e.clientY); setArrastando({ id: m.id, dx: p.x - m.x, dy: p.y - m.y }); }}
                onClick={() => clicarNo(m.id)}
                onKeyDown={(e) => teclaNo(e, m)}
              >
                <rect width={NO_W} height={NO_H} rx={10} />
                <text className="wsp-no-nome" x={12} y={22}>{corta(m.nome, 21)}</text>
                <text className="wsp-no-perfil" x={12} y={39}>perfil: {corta(m.perfil.nome, 19)}</text>
                <text className="wsp-no-tag" x={12} y={53}>{m.tipo === "inicio" ? "início" : m.tipo === "fim" ? "fim da sequência" : `${saidas} saída(s)`}{vigente ? " · em curso" : ""}</text>
                {comErro ? <circle className="wsp-no-erro" cx={NO_W - 15} cy={15} r={5} /> : vigente ? <circle className="wsp-no-dot" cx={NO_W - 15} cy={15} r={5} /> : null}
              </g>;
            })}
          </svg>
        </div>}

    <footer className="wsp-canvas-legenda">
      <span><i className="vigente" /> em curso agora</span>
      <span><i className="disponivel" /> pode ser registrada a seguir</span>
      <span>Clique para editar · arraste ou use as setas do teclado para mover</span>
    </footer>
  </section>;
}

function ListaMacros({ config, selecao, onSelecionar }: { config: ConfiguracaoVeiculo; selecao: SelecaoGrafo; onSelecionar: (s: SelecaoGrafo) => void }) {
  return <div className="wsp-lista-macros">
    <table>
      <thead><tr><th>MACRO</th><th>PAPEL</th><th>PERFIL</th><th>PODE IR PARA</th></tr></thead>
      <tbody>{config.macros.map((m) => {
        const saidas = config.transicoes.filter((t) => t.de === m.id);
        const sel = selecao.tipo === "macro" && selecao.id === m.id;
        return <tr key={m.id} className={sel ? "sel" : ""}>
          <td><button className="wsp-link" onClick={() => onSelecionar({ tipo: "macro", id: m.id })}>{m.nome}</button>{config.macroVigente === m.id ? <span className="wsp-badge-vigente">em curso</span> : null}</td>
          <td>{m.tipo === "inicio" ? "Início" : m.tipo === "fim" ? "Fim" : "Operação"}</td>
          <td>{m.perfil.nome}</td>
          <td>{saidas.length ? saidas.map((t) => config.macros.find((x) => x.id === t.para)?.nome ?? t.para).join(", ") : <em>nenhuma</em>}</td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}

export type { Transicao };
