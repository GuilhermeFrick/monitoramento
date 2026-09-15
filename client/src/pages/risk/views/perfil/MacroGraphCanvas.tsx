import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, Columns3, Grid2X2, LayoutGrid, Link2, List, Maximize2, Network, Orbit, Plus, Rows3, Trash2, Truck, ZoomIn, ZoomOut } from "lucide-react";
import { categoriaDaMacro, categoriaMacroLabel, perfilVigente, proximasMacros, statusConfig, statusSyncLabel, type CategoriaMacro, type ConfiguracaoVeiculo, type FuncaoJornada, type FuncaoLogistica, type MacroVeiculo, type Transicao, type Validacao } from "../../domain";

export const NO_W = 168;
export const NO_H = 62;
const ESPACO_X = 232;
const ESPACO_Y = 104;
const LARGURA_MINIMA_VISTA = 760;
const LARGURA_MAXIMA_NO_NA_TELA = 145;

export type SelecaoGrafo = { tipo: "macro"; id: string } | { tipo: "transicao"; de: string; para: string } | { tipo: "padrao" };
export type MacroCatalogo = { id: string; nome: string; descricao: string; tipo: MacroVeiculo["tipo"]; categoria: CategoriaMacro; funcaoJornada: FuncaoJornada | null; funcaoLogistica: FuncaoLogistica | null };
export type TipoLayoutMacro = "camadas" | "coluna" | "linha" | "matriz" | "anel";

/**
 * Catálogo de macros — o vocabulário que a operação fala.
 *
 * As funções seguem o padrão do sistema de referência (manual p. 684-686): uma
 * macro pode avançar a jornada, a logística, ou as duas ao mesmo tempo.
 */
export const MACROS_CATALOGO: MacroCatalogo[] = [
  { id: "CAT-JORNADA-INICIO", nome: "Início de jornada", descricao: "Motorista assume o veículo e abre a jornada.", tipo: "inicio", categoria: "jornada", funcaoJornada: "inicio_jornada", funcaoLogistica: null },
  { id: "CAT-VIAGEM-INICIO", nome: "Início de viagem", descricao: "Abre a viagem e começa a contar direção.", tipo: "operacao", categoria: "logistica", funcaoJornada: "inicio_direcao", funcaoLogistica: "iniciar_viagem" },
  { id: "CAT-VIAGEM-REINICIO", nome: "Reinício de viagem", descricao: "Retoma a viagem depois de uma parada.", tipo: "operacao", categoria: "logistica", funcaoJornada: "inicio_direcao", funcaoLogistica: null },
  { id: "CAT-VIAGEM-FIM", nome: "Fim de viagem", descricao: "Encerra a viagem e entra em interjornada.", tipo: "fim", categoria: "logistica", funcaoJornada: "inicio_interjornada", funcaoLogistica: "finalizar_viagem" },
  { id: "CAT-JORNADA-FIM", nome: "Fim de jornada", descricao: "Encerra a jornada de trabalho do motorista.", tipo: "fim", categoria: "jornada", funcaoJornada: "inicio_interjornada", funcaoLogistica: null },
  { id: "CAT-CLIENTE-IN", nome: "Chegada no cliente", descricao: "Abre a operação no cliente; o tempo passa a contar como espera.", tipo: "operacao", categoria: "logistica", funcaoJornada: "inicio_espera", funcaoLogistica: "iniciar_operacao" },
  { id: "CAT-CLIENTE-OUT", nome: "Saída do cliente", descricao: "Conclui a operação e retoma a direção.", tipo: "operacao", categoria: "logistica", funcaoJornada: "inicio_direcao", funcaoLogistica: "concluir_operacao" },
  { id: "CAT-OPERACAO-CANCELA", nome: "Cancelar operação", descricao: "Cancela a operação em curso no cliente.", tipo: "operacao", categoria: "logistica", funcaoJornada: null, funcaoLogistica: "cancelar_operacao" },
  { id: "CAT-REFEICAO", nome: "Parada para refeição", descricao: "Parada programada para refeição do motorista.", tipo: "operacao", categoria: "logistica", funcaoJornada: "inicio_refeicao", funcaoLogistica: null },
  { id: "CAT-ABASTECIMENTO", nome: "Parada para abastecimento", descricao: "Parada em posto para abastecer.", tipo: "operacao", categoria: "logistica", funcaoJornada: "inicio_descanso", funcaoLogistica: null },
  { id: "CAT-PARADA-EVENTUAL", nome: "Parada eventual", descricao: "Parada não programada durante a viagem.", tipo: "operacao", categoria: "logistica", funcaoJornada: "inicio_descanso", funcaoLogistica: null },
  { id: "CAT-PERNOITE", nome: "Parada para pernoite", descricao: "Veículo estacionado para pernoite autorizado.", tipo: "operacao", categoria: "logistica", funcaoJornada: "inicio_interjornada", funcaoLogistica: null },
  { id: "CAT-DESCANSO-SEMANAL", nome: "Descanso semanal", descricao: "Início do descanso semanal remunerado.", tipo: "fim", categoria: "jornada", funcaoJornada: "inicio_descanso_semanal", funcaoLogistica: null },
  { id: "CAT-FISCALIZACAO", nome: "Fiscalização", descricao: "Parada em posto fiscal, balança ou inspeção.", tipo: "operacao", categoria: "logistica", funcaoJornada: "inicio_espera", funcaoLogistica: null },
  { id: "CAT-MANUTENCAO", nome: "Parada para manutenção", descricao: "Veículo parado para manutenção preventiva ou corretiva.", tipo: "operacao", categoria: "logistica", funcaoJornada: "inicio_espera", funcaoLogistica: null },
  { id: "CAT-EMERGENCIA", nome: "Emergência", descricao: "Ativa o perfil de resposta imediata a uma emergência.", tipo: "operacao", categoria: "logistica", funcaoJornada: null, funcaoLogistica: null },
  { id: "CAT-TRANSITO-LENTO", nome: "Trânsito lento", descricao: "Registra lentidão no trajeto sem alterar a inteligência embarcada.", tipo: "operacao", categoria: "informativa", funcaoJornada: null, funcaoLogistica: null },
];

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

/** Organizações geométricas alternativas para adequar o grafo ao tipo de operação. */
export function organizarMacros(config: ConfiguracaoVeiculo, tipo: TipoLayoutMacro): MacroVeiculo[] {
  if (tipo === "camadas") return autoLayout(config);

  const macros = config.macros;
  if (!macros.length) return macros;

  if (tipo === "coluna") {
    return macros.map((m, indice) => ({ ...m, x: 80, y: 40 + indice * ESPACO_Y }));
  }
  if (tipo === "linha") {
    return macros.map((m, indice) => ({ ...m, x: 40 + indice * ESPACO_X, y: 80 }));
  }
  if (tipo === "matriz") {
    const colunas = Math.ceil(Math.sqrt(macros.length));
    return macros.map((m, indice) => ({
      ...m,
      x: 40 + (indice % colunas) * ESPACO_X,
      y: 40 + Math.floor(indice / colunas) * ESPACO_Y,
    }));
  }

  if (macros.length === 1) return [{ ...macros[0], x: 300, y: 180 }];
  const raioX = Math.max(220, (macros.length * NO_W * 1.18) / (2 * Math.PI));
  const raioY = Math.max(145, raioX * .62);
  const centroX = raioX + NO_W / 2 + 48;
  const centroY = raioY + NO_H / 2 + 48;
  return macros.map((m, indice) => {
    const angulo = -Math.PI / 2 + (indice * Math.PI * 2) / macros.length;
    return { ...m, x: centroX + Math.cos(angulo) * raioX - NO_W / 2, y: centroY + Math.sin(angulo) * raioY - NO_H / 2 };
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

export function MacroGraphCanvas({ config, selecao, validacoes, contextActions, onSelecionar, onAbrirEditor, onMoverMacro, onCriarTransicao, onAdicionarMacro, onNovaMacro, onOrganizar, onRemoverMacro, onToast }: {
  config: ConfiguracaoVeiculo;
  selecao: SelecaoGrafo;
  validacoes: Validacao[];
  contextActions?: React.ReactNode;
  onSelecionar: (s: SelecaoGrafo) => void;
  onAbrirEditor: (s: SelecaoGrafo) => void;
  onMoverMacro: (id: string, x: number, y: number) => void;
  onCriarTransicao: (de: string, para: string) => void;
  onAdicionarMacro: (macro: MacroCatalogo) => void;
  onNovaMacro: () => void;
  onOrganizar: (tipo: TipoLayoutMacro) => void;
  onRemoverMacro: (macro: MacroVeiculo) => void;
  onToast: (m: string) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [vista, setVista] = useState<Caixa>({ x: 0, y: 0, w: 900, h: 420 });
  const [modoLigar, setModoLigar] = useState(false);
  const [ligando, setLigando] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<{ id: string; pointerId: number; dx: number; dy: number; origemX: number; origemY: number; x: number; y: number; moveu: boolean } | null>(null);
  const [ligacao, setLigacao] = useState<{ de: string; pointerId: number; inicio: { x: number; y: number }; x: number; y: number; sobre: string | null } | null>(null);
  const [panorama, setPanorama] = useState<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const [modo, setModo] = useState<"grafo" | "lista">("grafo");
  const [catalogoAberto, setCatalogoAberto] = useState(false);
  const [layoutAberto, setLayoutAberto] = useState(false);
  const ignorarClique = useRef(false);
  const ultimoCliqueNo = useRef<{ id: string; em: number } | null>(null);
  const catalogoRef = useRef<HTMLDivElement>(null);
  const ajusteLayoutPendente = useRef(false);

  const erros = validacoes.filter((v) => v.nivel === "erro");
  const permitidasAgora = useMemo(() => proximasMacros(config, config.macroVigente).map((m) => m.id), [config]);
  const vigente = perfilVigente(config);
  const status = statusConfig(config);

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
    // Um grafo com poucos nós não deve ser ampliado até ocupar toda a tela.
    // Esta escala mantém cada nó com no máximo ~145 px na tela e preserva uma
    // área de trabalho confortável ao redor dele.
    const larguraConfortavel = r?.width ? r.width * (NO_W / LARGURA_MAXIMA_NO_NA_TELA) : LARGURA_MINIMA_VISTA;
    // preserva a proporção do palco para o grafo não distorcer
    const w = Math.max(LARGURA_MINIMA_VISTA, larguraConfortavel, alvoW, alvoH * proporcao);
    const h = w / proporcao;
    setVista({ x: caixa.x - (w - caixa.w) / 2, y: caixa.y - (h - caixa.h) / 2, w, h });
  }, [config.macros]);

  // ajusta ao abrir e ao trocar de veículo
  useEffect(() => { ajustar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [config.veiculo, config.macros.length]);
  useEffect(() => {
    if (!ajusteLayoutPendente.current) return;
    ajusteLayoutPendente.current = false;
    ajustar();
  }, [ajustar, config.macros]);
  useEffect(() => {
    if (!catalogoAberto) return;
    const fechar = (e: PointerEvent) => { if (!catalogoRef.current?.contains(e.target as Node)) setCatalogoAberto(false); };
    document.addEventListener("pointerdown", fechar);
    return () => document.removeEventListener("pointerdown", fechar);
  }, [catalogoAberto]);

  const zoom = (fator: number) => setVista((v) => {
    const w = Math.min(4000, Math.max(320, v.w * fator));
    const h = w * (v.h / v.w);
    return { x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h };
  });

  const organizar = (tipo: TipoLayoutMacro) => {
    ajusteLayoutPendente.current = true;
    setLayoutAberto(false);
    onOrganizar(tipo);
  };

  const clicarNo = (id: string) => {
    if (!modoLigar) { onSelecionar({ tipo: "macro", id }); return; }
    if (!ligando) { setLigando(id); return; }
    if (ligando === id) { setLigando(null); return; }
    if (config.transicoes.some((t) => t.de === ligando && t.para === id)) { onToast("Essa transição já existe."); setLigando(null); return; }
    onCriarTransicao(ligando, id);
    setLigando(null);
  };

  const teclaNo = (e: React.KeyboardEvent, m: MacroVeiculo) => {
    if (e.key === "Enter") { e.preventDefault(); onAbrirEditor({ tipo: "macro", id: m.id }); return; }
    if (e.key === " ") { e.preventDefault(); clicarNo(m.id); return; }
    const passo = e.shiftKey ? 24 : 8;
    const mapa: Record<string, [number, number]> = { ArrowUp: [0, -passo], ArrowDown: [0, passo], ArrowLeft: [-passo, 0], ArrowRight: [passo, 0] };
    const delta = mapa[e.key];
    if (delta) { e.preventDefault(); onMoverMacro(m.id, m.x + delta[0], m.y + delta[1]); }
  };

  const posicaoMacro = (m: MacroVeiculo) => arrastando?.id === m.id ? { ...m, x: arrastando.x, y: arrastando.y } : m;

  const moverPonteiro = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = emGrafo(e.clientX, e.clientY);
    if (ligacao?.pointerId === e.pointerId) {
      const sobre = config.macros.find((m) => m.id !== ligacao.de && p.x >= m.x && p.x <= m.x + NO_W && p.y >= m.y && p.y <= m.y + NO_H)?.id ?? null;
      setLigacao((atual) => atual ? { ...atual, x: p.x, y: p.y, sobre } : null);
      return;
    }
    if (arrastando?.pointerId === e.pointerId) {
      const x = p.x - arrastando.dx;
      const y = p.y - arrastando.dy;
      setArrastando((atual) => atual ? { ...atual, x, y, moveu: atual.moveu || Math.hypot(x - atual.origemX, y - atual.origemY) > 2 } : null);
      return;
    }
    if (panorama) setVista((v) => ({ ...v, x: panorama.vx + (panorama.x - p.x), y: panorama.vy + (panorama.y - p.y) }));
  };

  const soltarPonteiro = (e: React.PointerEvent<SVGSVGElement>) => {
    if (ligacao?.pointerId === e.pointerId) {
      if (ligacao.sobre) {
        if (config.transicoes.some((t) => t.de === ligacao.de && t.para === ligacao.sobre)) onToast("Essa transição já existe.");
        else onCriarTransicao(ligacao.de, ligacao.sobre);
      }
      setLigacao(null);
    } else if (arrastando?.pointerId === e.pointerId) {
      if (arrastando.moveu) {
        ignorarClique.current = true;
        onMoverMacro(arrastando.id, arrastando.x, arrastando.y);
        window.setTimeout(() => { ignorarClique.current = false; }, 0);
      } else {
        const agora = performance.now();
        const anterior = ultimoCliqueNo.current;
        if (anterior?.id === arrastando.id && agora - anterior.em <= 500) {
          ultimoCliqueNo.current = null;
          onAbrirEditor({ tipo: "macro", id: arrastando.id });
        } else {
          ultimoCliqueNo.current = { id: arrastando.id, em: agora };
          onSelecionar({ tipo: "macro", id: arrastando.id });
        }
      }
      setArrastando(null);
    }
    setPanorama(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const iniciarLigacao = (e: React.PointerEvent<SVGCircleElement>, m: MacroVeiculo, x: number, y: number) => {
    e.preventDefault();
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    onSelecionar({ tipo: "macro", id: m.id });
    setLigacao({ de: m.id, pointerId: e.pointerId, inicio: { x: m.x + x, y: m.y + y }, x: m.x + x, y: m.y + y, sobre: null });
  };

  const caminhoCurvo = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const direcao = b.x >= a.x ? 1 : -1;
    const curva = Math.max(46, Math.abs(b.x - a.x) * .45);
    return `M ${a.x} ${a.y} C ${a.x + curva * direcao} ${a.y}, ${b.x - curva * direcao} ${b.y}, ${b.x} ${b.y}`;
  };

  return <section className="wsp-canvas-wrap" aria-label="Sequência de macros">
    <header className="wsp-canvas-toolbar">
      <div className="wsp-canvas-veiculo">
        <Truck size={14} />
        <strong>{config.veiculo}</strong>
        <span>{vigente.perfil.nome}</span>
        <i className={`wsp-status wsp-status-${status}`}>{config.mudancas.length ? `${config.mudancas.length} pendente${config.mudancas.length > 1 ? "s" : ""}` : statusSyncLabel[status]}</i>
      </div>
      <div className="wsp-canvas-acoes">
        <div className="wsp-modo" role="group" aria-label="Modo de visualização">
          <button className={modo === "grafo" ? "ativo" : ""} aria-pressed={modo === "grafo"} onClick={() => setModo("grafo")}><Network size={14} /> Grafo</button>
          <button className={modo === "lista" ? "ativo" : ""} aria-pressed={modo === "lista"} onClick={() => setModo("lista")}><List size={14} /> Lista</button>
        </div>
        <div className={`wsp-btn-grupo ${modo === "lista" ? "oculto" : ""}`} role="group" aria-label="Zoom">
          <button className="wsp-icone" onClick={() => zoom(1 / 0.8)} aria-label="Afastar"><ZoomOut size={15} /></button>
          <button className="wsp-icone" onClick={() => zoom(0.8)} aria-label="Aproximar"><ZoomIn size={15} /></button>
          <button className="wsp-icone" onClick={ajustar} aria-label="Ajustar à tela" title="Ajustar à tela"><Maximize2 size={15} /></button>
        </div>
        <div className={`wsp-layout ${modo === "lista" ? "oculto" : ""}`} onMouseEnter={() => setLayoutAberto(true)} onMouseLeave={() => setLayoutAberto(false)}>
          <button className={`wsp-btn ${layoutAberto ? "ativo" : ""}`} aria-label="Escolher organização do grafo" title="Organizar grafo" aria-haspopup="menu" aria-expanded={layoutAberto} onClick={() => setLayoutAberto(true)}><LayoutGrid size={14} /><span>Organizar</span><ChevronDown className="wsp-add-seta" size={12} /></button>
          {layoutAberto ? <div className="wsp-layout-menu" role="menu" aria-label="Organizar macros">
            <div className="wsp-layout-head"><strong>Organizar macros</strong><small>Escolha a distribuição visual</small></div>
            <button role="menuitem" onClick={() => organizar("camadas")}><LayoutGrid size={16} /><span><strong>Por fluxo</strong><small>Segue as ligações entre as macros</small></span></button>
            <button role="menuitem" onClick={() => organizar("coluna")}><Rows3 size={16} /><span><strong>Em coluna</strong><small>Uma macro embaixo da outra</small></span></button>
            <button role="menuitem" onClick={() => organizar("linha")}><Columns3 size={16} /><span><strong>Em linha</strong><small>Todas as macros lado a lado</small></span></button>
            <button role="menuitem" onClick={() => organizar("matriz")}><Grid2X2 size={16} /><span><strong>Matriz {Math.ceil(Math.sqrt(config.macros.length))} × {Math.ceil(Math.sqrt(config.macros.length))}</strong><small>Ocupa melhor largura e altura</small></span></button>
            <button role="menuitem" onClick={() => organizar("anel")}><Orbit size={16} /><span><strong>Em anel</strong><small>Distribui as macros ao redor do fluxo</small></span></button>
          </div> : null}
        </div>
        <button className={`wsp-btn ${modoLigar ? "ativo" : ""} ${modo === "lista" ? "oculto" : ""}`} aria-label={modoLigar ? (ligando ? "Selecionar destino da ligação" : "Selecionar origem da ligação") : "Ligar macros"} title="Ligar macros" aria-pressed={modoLigar} onClick={() => { setModoLigar(!modoLigar); setLigando(null); }}><Link2 size={14} /><span>{modoLigar ? (ligando ? "Clique o destino" : "Clique a origem") : "Ligar"}</span></button>
        <div className="wsp-add-macro" ref={catalogoRef}>
          <button className={`wsp-btn ${catalogoAberto ? "ativo" : ""}`} aria-label="Adicionar macro" title="Adicionar macro" aria-haspopup="menu" aria-expanded={catalogoAberto} onClick={() => setCatalogoAberto((aberto) => !aberto)}><Plus size={14} /><span>Macro</span><ChevronDown className="wsp-add-seta" size={12} /></button>
          {catalogoAberto ? <div className="wsp-catalogo" role="menu" aria-label="Catálogo de macros">
            <div className="wsp-catalogo-head"><strong>Adicionar macro</strong><small>Selecione uma macro cadastrada</small></div>
            <div className="wsp-catalogo-lista">{MACROS_CATALOGO.map((item) => {
              const adicionada = config.macros.some((m) => m.nome.trim().toLocaleLowerCase("pt-BR") === item.nome.toLocaleLowerCase("pt-BR"));
              return <button key={item.id} role="menuitem" disabled={adicionada} onClick={() => { onAdicionarMacro(item); setCatalogoAberto(false); }}>
                <span><strong>{item.nome}</strong><small>{categoriaMacroLabel[item.categoria]} · {item.descricao}</small></span>
                {adicionada ? <i>No grafo</i> : <Plus size={14} />}
              </button>;
            })}</div>
            <button className="wsp-catalogo-criar" role="menuitem" onClick={() => { setCatalogoAberto(false); onNovaMacro(); }}><Plus size={14} /><span><strong>Criar nova macro</strong><small>Cadastre uma opção personalizada</small></span></button>
          </div> : null}
        </div>
        {contextActions}
      </div>
    </header>

    {erros.length ? <button className="wsp-canvas-erros" onClick={() => { const alvo = erros.find((e) => e.macroId); if (alvo?.macroId) onAbrirEditor({ tipo: "macro", id: alvo.macroId }); }}>
      <AlertTriangle size={14} /> {erros.length} problema(s) impedem o embarque — ir para o primeiro
    </button> : null}

    {modo === "lista"
      ? <ListaMacros config={config} selecao={selecao} onSelecionar={onSelecionar} onAbrirEditor={onAbrirEditor} onRemoverMacro={onRemoverMacro} />
      : <div className="wsp-canvas-stage" ref={stageRef}>
          <svg
            ref={svgRef} className="wsp-canvas-svg" viewBox={`${vista.x} ${vista.y} ${vista.w} ${vista.h}`} preserveAspectRatio="xMidYMid meet"
            onPointerDown={(e) => { if (e.target === svgRef.current) { e.currentTarget.setPointerCapture(e.pointerId); const p = emGrafo(e.clientX, e.clientY); setPanorama({ x: p.x, y: p.y, vx: vista.x, vy: vista.y }); } }}
            onPointerMove={moverPonteiro}
            onPointerUp={soltarPonteiro}
            onPointerCancel={soltarPonteiro}
          >
            <defs>
              <marker id="wsp-seta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#9fb2c2" /></marker>
              <marker id="wsp-seta-ativa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--brand-action)" /></marker>
              <marker id="wsp-seta-sel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#c8102e" /></marker>
            </defs>

            {ligacao ? <g className="wsp-ligacao-preview" aria-hidden="true">
              <path d={caminhoCurvo(ligacao.inicio, { x: ligacao.x, y: ligacao.y })} markerEnd="url(#wsp-seta-ativa)" />
              <circle cx={ligacao.x} cy={ligacao.y} r={7} />
            </g> : null}

            {config.transicoes.map((t) => {
              const deOriginal = config.macros.find((m) => m.id === t.de);
              const paraOriginal = config.macros.find((m) => m.id === t.para);
              if (!deOriginal || !paraOriginal) return null;
              const de = posicaoMacro(deOriginal);
              const para = posicaoMacro(paraOriginal);
              const c1 = { x: de.x + NO_W / 2, y: de.y + NO_H / 2 };
              const c2 = { x: para.x + NO_W / 2, y: para.y + NO_H / 2 };
              const i = naBorda(c2, c1);
              const f = naBorda(c1, c2);
              const ativa = selecao.tipo === "macro" ? selecao.id === t.de : config.macroVigente === t.de;
              const sel = selecao.tipo === "transicao" && selecao.de === t.de && selecao.para === t.para;
              const escolha: SelecaoGrafo = { tipo: "transicao", de: t.de, para: t.para };
              const caminho = caminhoCurvo(i, f);
              return <g key={`${t.de}->${t.para}`} className={`wsp-aresta ${ativa ? "ativa" : ""} ${sel ? "sel" : ""}`} onClick={() => onSelecionar(escolha)} onDoubleClick={(e) => { e.stopPropagation(); onAbrirEditor(escolha); }}>
                <path d={caminho} className="wsp-aresta-alvo" />
                <path d={caminho} className="wsp-aresta-linha" markerEnd={`url(#${sel ? "wsp-seta-sel" : ativa ? "wsp-seta-ativa" : "wsp-seta"})`} />
              </g>;
            })}

            {config.macros.map((m) => {
              const posicao = posicaoMacro(m);
              const categoria = categoriaDaMacro(m);
              const sel = selecao.tipo === "macro" && selecao.id === m.id;
              const vigente = config.macroVigente === m.id;
              const disponivel = permitidasAgora.includes(m.id);
              const comErro = erros.some((e) => e.macroId === m.id);
              return <g
                key={m.id} transform={`translate(${posicao.x},${posicao.y})`} tabIndex={0} role="button"
                aria-label={`${m.nome}, macro ${categoriaMacroLabel[categoria].toLowerCase()}${categoria === "logistica" ? `, perfil ${m.perfil.nome}` : ""}${vigente ? ", em curso neste veículo" : ""}. Clique para selecionar; clique duas vezes para editar.`} aria-pressed={sel}
                className={`wsp-no ${sel ? "sel" : ""} ${vigente ? "vigente" : ""} ${ligando === m.id ? "ligando" : ""} ${ligacao?.sobre === m.id ? "alvo" : ""} ${arrastando?.id === m.id ? "arrastando" : ""} ${disponivel ? "disponivel" : ""} ${comErro ? "erro" : ""}`}
                onPointerDown={(e) => { if (modoLigar || ligacao) return; e.preventDefault(); e.stopPropagation(); svgRef.current?.setPointerCapture(e.pointerId); const p = emGrafo(e.clientX, e.clientY); setArrastando({ id: m.id, pointerId: e.pointerId, dx: p.x - m.x, dy: p.y - m.y, origemX: m.x, origemY: m.y, x: m.x, y: m.y, moveu: false }); }}
                onClick={() => { if (modoLigar && !ignorarClique.current) clicarNo(m.id); }}
                onKeyDown={(e) => teclaNo(e, m)}
              >
                <title>{`${m.nome}: arraste para mover; duplo clique para editar; arraste um ponto azul para ligar.`}</title>
                <rect width={NO_W} height={NO_H} rx={10} />
                <text className="wsp-no-nome" x={12} y={22}>{corta(m.nome, 21)}</text>
                <text className="wsp-no-perfil" x={12} y={39}>{categoria === "logistica" ? `logística · ${corta(m.perfil.nome, 15)}` : categoria === "jornada" ? "controle de jornada" : "somente registro"}</text>
                <text className="wsp-no-tag" x={12} y={53}>{m.tipo === "inicio" ? "início da sequência" : m.tipo === "fim" ? "fim da sequência" : "etapa da sequência"}</text>
                {comErro ? <circle className="wsp-no-erro" cx={NO_W - 34} cy={15} r={5} /> : vigente ? <circle className="wsp-no-dot" cx={NO_W - 34} cy={15} r={5} /> : null}
                <g
                  className="wsp-no-lixeira" role="button" aria-label={`Remover macro ${m.nome}`}
                  onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemoverMacro(m); }}
                  onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                >
                  <circle cx={NO_W - 14} cy={14} r={10} />
                  <Trash2 x={NO_W - 20} y={8} width={12} height={12} />
                </g>
                {[[NO_W / 2, 0], [NO_W, NO_H / 2], [NO_W / 2, NO_H], [0, NO_H / 2]].map(([x, y], indice) => <circle key={indice} className="wsp-conector" cx={x} cy={y} r={6} onPointerDown={(e) => iniciarLigacao(e, m, x, y)} />)}
              </g>;
            })}
          </svg>
        </div>}

    <footer className="wsp-canvas-legenda">
      <span><i className="vigente" /> em curso agora</span>
      <span><i className="disponivel" /> pode ser registrada a seguir</span>
      <span>1 clique seleciona · 2 cliques editam · arraste os pontos azuis para ligar</span>
    </footer>
  </section>;
}

function ListaMacros({ config, selecao, onSelecionar, onAbrirEditor, onRemoverMacro }: { config: ConfiguracaoVeiculo; selecao: SelecaoGrafo; onSelecionar: (s: SelecaoGrafo) => void; onAbrirEditor: (s: SelecaoGrafo) => void; onRemoverMacro: (macro: MacroVeiculo) => void }) {
  return <div className="wsp-lista-macros">
    <table>
      <thead><tr><th>MACRO</th><th>PAPEL</th><th>CATEGORIA / PERFIL</th><th>PODE IR PARA</th><th /></tr></thead>
      <tbody>{config.macros.map((m) => {
        const saidas = config.transicoes.filter((t) => t.de === m.id);
        const sel = selecao.tipo === "macro" && selecao.id === m.id;
        return <tr key={m.id} className={sel ? "sel" : ""}>
          <td><button className="wsp-link" onClick={() => onSelecionar({ tipo: "macro", id: m.id })} onDoubleClick={() => onAbrirEditor({ tipo: "macro", id: m.id })}>{m.nome}</button>{config.macroVigente === m.id ? <span className="wsp-badge-vigente">em curso</span> : null}</td>
          <td>{m.tipo === "inicio" ? "Início" : m.tipo === "fim" ? "Fim" : "Operação"}</td>
          <td>{categoriaMacroLabel[categoriaDaMacro(m)]}{categoriaDaMacro(m) === "logistica" ? ` · ${m.perfil.nome}` : " · não altera inteligência"}</td>
          <td>{saidas.length ? saidas.map((t) => config.macros.find((x) => x.id === t.para)?.nome ?? t.para).join(", ") : <em>nenhuma</em>}</td>
          <td><button className="wsp-lista-excluir" aria-label={`Remover macro ${m.nome}`} title="Remover macro" onClick={() => onRemoverMacro(m)}><Trash2 size={14} /></button></td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}

export type { Transicao };
