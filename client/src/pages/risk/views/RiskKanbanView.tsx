import { useMemo, useState, type DragEvent } from "react";
import {
  Activity,
  AlertTriangle,
  BellPlus,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Filter,
  Radio,
  RefreshCw,
  ShieldAlert,
  Terminal,
  Truck,
  UserCheck,
} from "lucide-react";
import { PageHeader } from "../shared";

export type AlertRisk = {
  id: string;
  title: string;
  vehicle: string;
  driver: string;
  zone: string;
  time: string;
  score: number;
  severity: "high" | "medium" | "low";
  detail: string;
  status: string;
  perfilAtivo: string;
  pontoDeControle: string | null;
  natureza: "condicao" | "marco";
  categoriaRisco: "security" | "safety";
};

type Etapa = "Novo" | "Aguardando ação" | "Em tratamento" | "Resolvido";

const etapas: { id: Etapa; titulo: string; descricao: string; icon: typeof CircleDot }[] = [
  { id: "Novo", titulo: "Novos", descricao: "Ainda não triados", icon: BellPlus },
  { id: "Aguardando ação", titulo: "Aguardando", descricao: "Priorizados para atendimento", icon: Clock3 },
  { id: "Em tratamento", titulo: "Em tratamento", descricao: "Assumidos pela central", icon: UserCheck },
  { id: "Resolvido", titulo: "Resolvidos", descricao: "Concluídos no turno", icon: Check },
];

const proximaEtapa: Record<Etapa, { status: Etapa; acao: string }> = {
  Novo: { status: "Aguardando ação", acao: "Triar" },
  "Aguardando ação": { status: "Em tratamento", acao: "Assumir" },
  "Em tratamento": { status: "Resolvido", acao: "Resolver" },
  Resolvido: { status: "Aguardando ação", acao: "Reabrir" },
};

const etapaDe = (status: string): Etapa => etapas.some((etapa) => etapa.id === status) ? status as Etapa : "Novo";
const severidadeLabel = { high: "Crítico", medium: "Atenção", low: "Baixo" } as const;

function CartaoAlerta({ risco, onAbrir, onMover, onComando, onArrastar }: {
  risco: AlertRisk;
  onAbrir: () => void;
  onMover: (status: Etapa) => void;
  onComando: () => void;
  onArrastar: (id: string) => void;
}) {
  const etapa = etapaDe(risco.status);
  const proxima = proximaEtapa[etapa];
  return <article
    className={`alert-card alert-${risco.severity} ${etapa === "Resolvido" ? "alert-resolvido" : ""}`}
    draggable
    tabIndex={0}
    role="group"
    aria-label={`${risco.title}, ${risco.vehicle}, ${severidadeLabel[risco.severity]}. Abrir detalhes.`}
    onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", risco.id); onArrastar(risco.id); }}
    onClick={onAbrir}
    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onAbrir(); } }}
  >
    <div className="alert-card-top">
      <span className="alert-card-classification"><span className={`alert-severity alert-severity-${risco.severity}`}><ShieldAlert size={11} /> {severidadeLabel[risco.severity]}</span><span className={`alert-domain alert-domain-${risco.categoriaRisco}`}>{risco.categoriaRisco === "security" ? "Security" : "Safety"}</span></span>
      <time>{risco.time}</time>
    </div>
    <h3>{risco.title}</h3>
    <p>{risco.detail}</p>
    <div className="alert-context">
      <span><Truck size={11} /><strong>{risco.vehicle}</strong></span>
      <span>{risco.driver}</span>
    </div>
    <div className="alert-location">{risco.zone}</div>
    <footer>
      <span className="alert-id">{risco.id}</span>
      <button className="alert-command" title={`Enviar comando para ${risco.vehicle}`} aria-label={`Enviar comando para ${risco.vehicle}`} onClick={(event) => { event.stopPropagation(); onComando(); }}><Terminal size={12} /></button>
      <button className="alert-next" onClick={(event) => { event.stopPropagation(); onMover(proxima.status); }}>{proxima.acao}<ChevronRight size={12} /></button>
    </footer>
  </article>;
}

export function RiskKanbanView({ risks, search, onSelectRisk, onCommand, onUpdate, onAddRisk, onToast }: {
  risks: AlertRisk[];
  search: string;
  onSelectRisk: (risk: AlertRisk) => void;
  onCommand: (vehicle: string) => void;
  onUpdate: (id: string, patch: Partial<AlertRisk>) => void;
  onAddRisk: (risk: AlertRisk) => void;
  onToast: (message: string) => void;
}) {
  const [severity, setSeverity] = useState<"all" | AlertRisk["severity"]>("all");
  const [natureza, setNatureza] = useState<"all" | AlertRisk["natureza"]>("all");
  const [filtroKpi, setFiltroKpi] = useState<"all" | "security" | "safety" | "critical" | "treatment">("all");
  const [somenteAbertos, setSomenteAbertos] = useState(false);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [colunaSobre, setColunaSobre] = useState<Etapa | null>(null);

  const filtrados = useMemo(() => risks.filter((risk) => {
    const texto = `${risk.title} ${risk.vehicle} ${risk.driver} ${risk.zone}`.toLocaleLowerCase("pt-BR");
    const correspondeKpi = filtroKpi === "all"
      || (filtroKpi === "security" && risk.categoriaRisco === "security")
      || (filtroKpi === "safety" && risk.categoriaRisco === "safety")
      || (filtroKpi === "critical" && risk.severity === "high")
      || (filtroKpi === "treatment" && etapaDe(risk.status) === "Em tratamento");
    return correspondeKpi
      && (severity === "all" || risk.severity === severity)
      && (natureza === "all" || risk.natureza === natureza)
      && (!somenteAbertos || etapaDe(risk.status) !== "Resolvido")
      && texto.includes(search.toLocaleLowerCase("pt-BR"));
  }), [filtroKpi, natureza, risks, search, severity, somenteAbertos]);

  const abertos = risks.filter((risk) => etapaDe(risk.status) !== "Resolvido");
  const criticos = abertos.filter((risk) => risk.severity === "high");
  const security = abertos.filter((risk) => risk.categoriaRisco === "security");
  const safety = abertos.filter((risk) => risk.categoriaRisco === "safety");
  const emTratamento = risks.filter((risk) => etapaDe(risk.status) === "Em tratamento");

  const aplicarFiltroKpi = (filtro: typeof filtroKpi) => {
    setFiltroKpi((atual) => atual === filtro && filtro !== "all" ? "all" : filtro);
    setSeverity("all");
    setNatureza("all");
  };

  const mover = (risk: AlertRisk, status: Etapa) => {
    if (etapaDe(risk.status) === status) return;
    onUpdate(risk.id, { status });
    onToast(`${risk.id} movido para ${status.toLocaleLowerCase("pt-BR")}.`);
  };

  const soltar = (event: DragEvent<HTMLDivElement>, status: Etapa) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain") || arrastando;
    const risk = risks.find((item) => item.id === id);
    if (risk) mover(risk, status);
    setArrastando(null);
    setColunaSobre(null);
  };

  const simularEntrada = () => {
    const indice = risks.length % 3;
    const modelos = [
      { title: "Distração detectada", detail: "Motorista desviou o olhar da via por tempo acima do limite configurado.", severity: "high" as const, categoriaRisco: "safety" as const },
      { title: "Desvio do rotograma", detail: "Veículo deixou o corredor planejado e aguarda validação da central.", severity: "medium" as const, categoriaRisco: "security" as const },
      { title: "Câmera com baixa visibilidade", detail: "A câmera frontal apresentou obstrução parcial durante o deslocamento.", severity: "low" as const, categoriaRisco: "safety" as const },
    ];
    const modelo = modelos[indice];
    onAddRisk({
      id: `AR-${String(Date.now()).slice(-5)}`,
      ...modelo,
      vehicle: fleetFallback[indice].vehicle,
      driver: fleetFallback[indice].driver,
      zone: fleetFallback[indice].zone,
      time: "agora",
      score: modelo.severity === "high" ? 91 : modelo.severity === "medium" ? 73 : 46,
      status: "Novo",
      perfilAtivo: "Viagem normal",
      pontoDeControle: null,
      natureza: "condicao",
    });
    onToast("Novo alerta recebido pela central.");
  };

  return <div className="alert-center">
    <PageHeader eyebrow="Operação em tempo real" title="Gestão de alertas e riscos" description="Receba, priorize e trate alertas da frota sem perder o contexto operacional." action="Simular alerta" actionIcon={BellPlus} onAction={simularEntrada} />

    <section className="alert-summary" aria-label="Resumo dos alertas">
      <button className={`alert-kpi ${filtroKpi === "all" ? "active" : ""}`} aria-pressed={filtroKpi === "all"} onClick={() => aplicarFiltroKpi("all")}><span className="alert-summary-icon live"><Radio size={14} /></span><span><small>Fila ao vivo</small><strong>{abertos.length} abertos</strong></span></button>
      <button className={`alert-kpi alert-kpi-security ${filtroKpi === "security" ? "active" : ""}`} aria-pressed={filtroKpi === "security"} onClick={() => aplicarFiltroKpi("security")}><span className="alert-summary-icon security"><ShieldAlert size={14} /></span><span><small>Risco Security</small><strong>{security.length} roubo e proteção</strong></span></button>
      <button className={`alert-kpi alert-kpi-safety ${filtroKpi === "safety" ? "active" : ""}`} aria-pressed={filtroKpi === "safety"} onClick={() => aplicarFiltroKpi("safety")}><span className="alert-summary-icon safety"><Activity size={14} /></span><span><small>Risco Safety</small><strong>{safety.length} comportamentais</strong></span></button>
      <button className={`alert-kpi ${filtroKpi === "critical" ? "active" : ""}`} aria-pressed={filtroKpi === "critical"} onClick={() => aplicarFiltroKpi("critical")}><span className="alert-summary-icon danger"><AlertTriangle size={14} /></span><span><small>Críticos</small><strong>{criticos.length} exigem atenção</strong></span></button>
      <button className={`alert-kpi ${filtroKpi === "treatment" ? "active" : ""}`} aria-pressed={filtroKpi === "treatment"} onClick={() => aplicarFiltroKpi("treatment")}><span className="alert-summary-icon active"><UserCheck size={14} /></span><span><small>Em tratamento</small><strong>{emTratamento.length} assumidos</strong></span></button>
      <div className="alert-sync"><span className="live-pulse" /> Sincronizado agora</div>
    </section>

    <div className="alert-toolbar">
      <div className="alert-filters"><span><Filter size={13} /> Filtrar</span>
        <select value={severity} onChange={(event) => setSeverity(event.target.value as typeof severity)} aria-label="Filtrar por criticidade"><option value="all">Todas as criticidades</option><option value="high">Críticos</option><option value="medium">Atenção</option><option value="low">Baixo risco</option></select>
        <select value={natureza} onChange={(event) => setNatureza(event.target.value as typeof natureza)} aria-label="Filtrar por origem"><option value="all">Todas as origens</option><option value="condicao">Condição detectada</option><option value="marco">Marco operacional</option></select>
        <button className={somenteAbertos ? "active" : ""} aria-pressed={somenteAbertos} onClick={() => setSomenteAbertos((atual) => !atual)}>Somente abertos</button>
      </div>
      <div className="alert-toolbar-actions"><span>{filtrados.length} alertas visíveis</span><button onClick={() => onToast("Fila sincronizada com os alertas mais recentes.")}><RefreshCw size={13} /> Atualizar</button><button onClick={() => onCommand(filtrados[0]?.vehicle ?? risks[0]?.vehicle)} disabled={!risks.length}><Terminal size={13} /> Comando</button></div>
    </div>

    <div className="alert-board-scroll">
      <section className="alert-kanban" aria-label="Quadro de tratamento de alertas">
        {etapas.map((etapa) => {
          const Icon = etapa.icon;
          const itens = filtrados.filter((risk) => etapaDe(risk.status) === etapa.id);
          return <div key={etapa.id} className={`alert-column alert-column-${etapa.id.replaceAll(" ", "-").toLocaleLowerCase("pt-BR")} ${colunaSobre === etapa.id ? "drag-over" : ""}`}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setColunaSobre(etapa.id); }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setColunaSobre(null); }}
            onDrop={(event) => soltar(event, etapa.id)}>
            <header><span className="alert-column-title"><i><Icon size={13} /></i><span><strong>{etapa.titulo}</strong><small>{etapa.descricao}</small></span></span><b>{itens.length}</b></header>
            <div className="alert-column-list">
              {itens.map((risk) => <CartaoAlerta key={risk.id} risco={risk} onAbrir={() => onSelectRisk(risk)} onMover={(status) => mover(risk, status)} onComando={() => onCommand(risk.vehicle)} onArrastar={setArrastando} />)}
              {!itens.length ? <div className="alert-column-empty"><CircleDot size={15} /><span>Nenhum alerta nesta etapa</span></div> : null}
            </div>
          </div>;
        })}
      </section>
    </div>
  </div>;
}

const fleetFallback = [
  { vehicle: "VTR-2048", driver: "Carlos Mendes", zone: "BR-116 · km 420" },
  { vehicle: "VTR-1783", driver: "Ana Paula Costa", zone: "Anel Rodoviário · faixa 2" },
  { vehicle: "VTR-0931", driver: "Rafael Nunes", zone: "Av. Brasil · acesso norte" },
];
