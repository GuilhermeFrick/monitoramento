import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  CalendarDays,
  Car,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleGauge,
  Clock3,
  Download,
  FileBarChart,
  FileText,
  Filter,
  Gauge,
  Globe2,
  Headphones,
  LayoutDashboard,
  LifeBuoy,
  Map as MapIcon,
  MapPin,
  Menu,
  MoreHorizontal,
  PlayCircle,
  Plus,
  Radio,
  Radar,
  RefreshCw,
  Route,
  Search,
  Settings,
  SlidersHorizontal,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Smartphone,
  Target,
  TrendingDown,
  TrendingUp,
  Truck,
  UserCheck,
  Users,
  Video,
  X,
  Zap,
  HardDriveUpload,
  KeyRound,
  Layers,
  ListChecks,
  MapPinned,
  MessageSquare,
  Terminal,
  Waypoints,
} from "lucide-react";
import { KpiCard, PageHeader, type IconType } from "./risk/shared";
import { equipamentoDe } from "./risk/domain";
import { ProfilesView, useConfiguracoes } from "./risk/views/ProfilesView";
import { VehicleNavigator } from "./risk/views/perfil/VehicleNavigator";
import { ControlPointsView, usePontos } from "./risk/views/ControlPointsView";
import { FencesView } from "./risk/views/FencesView";
import { RoutesView } from "./risk/views/RoutesView";
import { ProvisioningView } from "./risk/views/ProvisioningView";
import { SecurityView } from "./risk/views/SecurityView";
import { EventsView } from "./risk/views/EventsView";
import { MessagingPanel } from "./risk/views/MessagingPanel";
import { CommandModal } from "./risk/views/CommandModal";

type ViewKey = "dashboard" | "realtime" | "risks" | "events" | "evidence" | "reports" | "fences" | "controlpoints" | "routes" | "profiles" | "provisioning" | "security" | "traffic" | "drivers" | "training" | "fleet" | "settings";

type Risk = {
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
};

const RISK_STORAGE_KEY = "avansat-risk:v2:risks";
const AUDIT_STORAGE_KEY = "avansat-risk:v2:audit";

function loadRisks(): Risk[] {
  try {
    const saved = window.localStorage.getItem(RISK_STORAGE_KEY);
    return saved ? JSON.parse(saved) as Risk[] : initialRisks;
  } catch {
    return initialRisks;
  }
}

const navGroups: { label: string; items: { id: ViewKey; label: string; icon: IconType; count?: number }[] }[] = [
  { label: "Operação", items: [
    { id: "dashboard", label: "Visão geral", icon: LayoutDashboard },
    { id: "realtime", label: "Monitoramento ao vivo", icon: Radar },
    { id: "risks", label: "Riscos em tempo real", icon: ShieldAlert, count: 12 },
    { id: "events", label: "Eventos", icon: ListChecks },
  ] },
  { label: "Inteligência", items: [
    { id: "evidence", label: "Evidências & vídeo", icon: Video },
    { id: "reports", label: "Relatórios", icon: FileBarChart },
  ] },
  { label: "Regras e geocercas", items: [
    { id: "profiles", label: "Perfil operacional", icon: Layers },
    { id: "controlpoints", label: "Pontos de controle e rotograma", icon: MapPinned },
    { id: "fences", label: "Cercas", icon: Globe2 },
    { id: "routes", label: "Rotas", icon: Waypoints },
  ] },
  { label: "Gestão", items: [
    { id: "provisioning", label: "Provisionamento", icon: HardDriveUpload },
    { id: "security", label: "Segurança operacional", icon: KeyRound },
    { id: "traffic", label: "Centro de tráfego", icon: Smartphone },
    { id: "drivers", label: "Motoristas", icon: Users },
    { id: "training", label: "Treinamento", icon: BookOpen },
    { id: "fleet", label: "Frota e veículos", icon: Truck },
  ] },
];

const initialRisks: Risk[] = [
  { id: "AR-2048", title: "Fadiga detectada", vehicle: "VTR-2048", driver: "Carlos Mendes", zone: "BR-116 · km 420", time: "há 4 min", score: 92, severity: "high", detail: "Padrão de olhos fechados acima do limiar por 8 segundos. Contato por intercom e parada em posto homologado recomendados.", status: "Em tratamento", perfilAtivo: "Viagem normal", pontoDeControle: null, natureza: "condicao" },
  { id: "AR-1783", title: "Velocidade acima do limite do trecho", vehicle: "VTR-1783", driver: "Ana Paula Costa", zone: "Anel Rodoviário · faixa 2", time: "há 11 min", score: 84, severity: "high", detail: "Veículo a 96 km/h em trecho do rotograma limitado a 80 km/h. Evento reincidente nesta rota.", status: "Aguardando ação", perfilAtivo: "Viagem normal", pontoDeControle: null, natureza: "condicao" },
  { id: "AR-0931", title: "Celular em uso", vehicle: "VTR-0931", driver: "Rafael Nunes", zone: "Av. Brasil · acesso norte", time: "há 18 min", score: 76, severity: "medium", detail: "Distração visual identificada por 3.4 segundos. Evidência de vídeo pronta para revisão.", status: "Aguardando ação", perfilAtivo: "No cliente", pontoDeControle: "CD Itaguaí · doca 4", natureza: "marco" },
  { id: "AR-3110", title: "Entrada em cerca restrita", vehicle: "VTR-3110", driver: "Marcos Silva", zone: "Pátio Itaguaí", time: "há 25 min", score: 61, severity: "medium", detail: "Entrada não prevista na cerca “Área restrita · Pátio Itaguaí” fora da janela autorizada.", status: "Em tratamento", perfilAtivo: "Em carga", pontoDeControle: "Base Campinas · carregamento", natureza: "marco" },
  { id: "AR-2240", title: "Falha de identificação", vehicle: "VTR-2240", driver: "Não identificado", zone: "Base Campinas", time: "há 32 min", score: 48, severity: "low", detail: "Credencial não validada no início do turno. Validação manual solicitada.", status: "Resolvido", perfilAtivo: "Pernoite", pontoDeControle: "Pátio pernoite Seropédica", natureza: "marco" },
];

const fleetRows = [
  { vehicle: "VTR-2048", type: "Caminhão 3/4", driver: "Carlos Mendes", fleet: "Sul · Distribuição", status: "high", risk: "92", speed: "78 km/h", last: "agora", perfilAtivo: "Viagem normal" },
  { vehicle: "VTR-1783", type: "Cavalo mecânico", driver: "Ana Paula Costa", fleet: "Centro · Longa distância", status: "high", risk: "84", speed: "96 km/h", last: "há 1 min", perfilAtivo: "Viagem normal" },
  { vehicle: "VTR-0931", type: "Van urbana", driver: "Rafael Nunes", fleet: "Sudeste · Última milha", status: "medium", risk: "76", speed: "52 km/h", last: "há 2 min", perfilAtivo: "No cliente" },
  { vehicle: "VTR-3110", type: "Caminhão 3/4", driver: "Marcos Silva", fleet: "Sudeste · Operação", status: "medium", risk: "61", speed: "34 km/h", last: "há 3 min", perfilAtivo: "Em carga" },
  { vehicle: "VTR-2240", type: "Van urbana", driver: "Não identificado", fleet: "Sul · Distribuição", status: "low", risk: "48", speed: "0 km/h", last: "há 5 min", perfilAtivo: "Pernoite" },
];

const eventFeed = [
  { color: "red", icon: Siren, title: "Fadiga detectada", desc: "VTR-2048 · Carlos Mendes · condição em curso", time: "14:32", natureza: "condicao" },
  { color: "amber", icon: Zap, title: "Macro registrada: Início de carga", desc: "VTR-3110 · Marcos Silva · marco", time: "14:28", natureza: "marco" },
  { color: "teal", icon: UserCheck, title: "Entrou no ponto de controle", desc: "VTR-3110 · Base Campinas · marco", time: "14:22", natureza: "marco" },
  { color: "red", icon: Globe2, title: "Entrada em cerca restrita", desc: "VTR-0931 · Pátio Itaguaí · marco", time: "14:15", natureza: "marco" },
];

function Sidebar({ active, onSelect }: { active: ViewKey; onSelect: (view: ViewKey) => void }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><ShieldCheck size={20} strokeWidth={2.3} /></div>
        <div><div className="brand-name">avansat</div><div className="brand-sub">risk operations</div></div>
      </div>
      <div className="sidebar-section">
        {navGroups.map((group) => <div key={group.label}>
          <div className="sidebar-label">{group.label}</div>
          {group.items.map(({ id, label, icon: Icon, count }) => <button key={id} className={`nav-btn ${active === id ? "active" : ""}`} onClick={() => onSelect(id)}>
            <Icon size={16} strokeWidth={1.8} /><span>{label}</span>{count ? <span className="nav-count">{count}</span> : null}
          </button>)}
        </div>)}
        <div className="sidebar-label">Sistema</div>
        <button className={`nav-btn ${active === "settings" ? "active" : ""}`} onClick={() => onSelect("settings")}><Settings size={16} strokeWidth={1.8} /><span>Configurações</span></button>
      </div>
      <div className="sidebar-bottom">
        <div className="operator-card"><div className="avatar">LM</div><div><div className="operator-name">Larissa Martins</div><div className="operator-role">Operadora · turno ativo</div></div><ChevronDown size={13} className="ml-auto" /></div>
      </div>
    </aside>
  );
}

function Topbar({ title, onSearch, onToast }: { title: string; onSearch: (value: string) => void; onToast: (message: string) => void }) {
  return <header className="topbar">
    <div className="breadcrumb"><span>Avansat Risk</span><ChevronRight size={12} /><strong>{title}</strong></div>
    <div className="top-actions">
      <label className="search-box"><Search size={14} /><input aria-label="Buscar" placeholder="Buscar veículo, motorista..." onChange={(event) => onSearch(event.target.value)} /></label>
      <button className="icon-btn" aria-label="Ajuda" onClick={() => onToast("Central de ajuda disponível em breve.")}><LifeBuoy size={15} /></button>
      <button className="icon-btn" aria-label="Notificações" onClick={() => onToast("Você tem 12 riscos aguardando tratamento.")}><Bell size={15} /><span className="notification-dot" /></button>
      <div className="avatar" title="Larissa Martins">LM</div>
    </div>
  </header>;
}

function RiskChart() {
  return <div className="line-chart"><div className="chart-grid"><span /><span /><span /><span /></div><svg className="line-svg" viewBox="0 0 620 155" preserveAspectRatio="none" aria-label="Tendência de risco"><defs><linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#82d2c3" stopOpacity=".26" /><stop offset="1" stopColor="#82d2c3" stopOpacity="0" /></linearGradient></defs><path d="M0 112 C35 108, 43 72, 78 87 S115 108, 145 92 S173 62, 208 75 S244 96, 276 73 S315 61, 342 77 S380 93, 408 58 S442 35, 472 51 S505 62, 530 34 S573 40, 620 18 L620 155 L0 155 Z" fill="url(#riskFill)" /><path d="M0 112 C35 108, 43 72, 78 87 S115 108, 145 92 S173 62, 208 75 S244 96, 276 73 S315 61, 342 77 S380 93, 408 58 S442 35, 472 51 S505 62, 530 34 S573 40, 620 18" fill="none" stroke="#2b9e8e" strokeWidth="2.5" vectorEffect="non-scaling-stroke" /><circle cx="472" cy="51" r="4" fill="#fff" stroke="#2b9e8e" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg><div className="chart-tooltip">Hoje<strong>78</strong></div><div className="chart-labels"><span>03 set</span><span>04 set</span><span>05 set</span><span>06 set</span><span>07 set</span><span>08 set</span></div></div>;
}

function MapPanel({ onSelectRisk }: { onSelectRisk: (risk: Risk) => void }) {
  return <div className="panel map-panel"><div className="map-head"><div><div className="panel-title">Mapa operacional</div><div className="panel-subtitle">12 eventos ativos · atualização há 18s</div></div><button className="panel-link" onClick={() => onSelectRisk(initialRisks[0])}>Abrir monitoramento <ChevronRight size={12} /></button></div><div className="map-stage"><div className="map-river" /><div className="map-road a" /><div className="map-road b" /><div className="map-road c" /><div className="map-road d" /><span className="map-label one">Contagem</span><span className="map-label two">Rio de Janeiro</span><span className="map-label three">Itaguaí</span><span className="map-label four">Seropédica</span><button className="map-pin pin-a" onClick={() => onSelectRisk(initialRisks[0])}><MapPin size={11} /></button><button className="map-pin amber pin-b" onClick={() => onSelectRisk(initialRisks[1])}><MapPin size={11} /></button><button className="map-pin teal pin-c" onClick={() => onSelectRisk(initialRisks[2])}><MapPin size={11} /></button><button className="map-pin amber pin-d" onClick={() => onSelectRisk(initialRisks[3])}><MapPin size={11} /></button><button className="map-pin teal pin-e" onClick={() => onSelectRisk(initialRisks[4])}><MapPin size={11} /></button><div className="map-controls"><button className="map-control" onClick={() => undefined}>+</button><button className="map-control" onClick={() => undefined}>−</button><button className="map-control" onClick={() => undefined}><Target size={13} /></button></div><div className="map-legend"><span><i /> alto</span><span><i className="amber" /> médio</span><span><i className="teal" /> monitorado</span></div></div></div>;
}

function FeedPanel({ onSelectRisk, onViewAll }: { onSelectRisk: (risk: Risk) => void; onViewAll: () => void }) {
  return <div className="panel"><div className="panel-header"><div><div className="panel-title">Atividade recente</div><div className="panel-subtitle">Eventos e comandos da operação · por instante do fato</div></div><button className="panel-link" onClick={onViewAll}>Ver todos <ChevronRight size={12} /></button></div><div className="feed-list">{eventFeed.map((item, index) => { const Icon = item.icon; return <button className="feed-item" key={item.title + index} onClick={() => onSelectRisk(initialRisks[index])}><span className={`feed-icon ${item.color}`}><Icon size={14} /></span><span><span className="feed-title">{item.title}</span><span className="feed-desc">{item.desc}</span></span><span className="feed-time">{item.time}</span></button>; })}</div></div>;
}

function FleetTable({ search, onSelectRisk }: { search: string; onSelectRisk: (risk: Risk) => void }) {
  const rows = fleetRows.filter((row) => `${row.vehicle} ${row.driver} ${row.fleet}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="panel"><div className="panel-header"><div><div className="panel-title">Frota em operação</div><div className="panel-subtitle">Veículos com telemetria ativa neste turno</div></div><button className="panel-link" onClick={() => onSelectRisk(initialRisks[0])}>Gestão de frota <ChevronRight size={12} /></button></div><div className="table-wrap"><table><thead><tr><th>VEÍCULO</th><th>MOTORISTA</th><th>FROTA</th><th>PERFIL ATIVO</th><th>RISCO</th><th>VELOCIDADE</th><th>ÚLTIMO SINAL</th><th /></tr></thead><tbody>{rows.map((row, i) => <tr key={row.vehicle}><td><div className="vehicle-cell"><div className="vehicle-avatar"><Truck size={14} /></div><div><div className="vehicle-name">{row.vehicle}</div><div className="vehicle-meta">{row.type}</div></div></div></td><td>{row.driver}</td><td>{row.fleet}</td><td><span className="tag tag-blue">{row.perfilAtivo}</span></td><td><span className={`status ${row.status}`}>{row.risk}</span></td><td>{row.speed}</td><td>{row.last}</td><td><button className="action-more" onClick={() => onSelectRisk(initialRisks[i])}><MoreHorizontal size={15} /></button></td></tr>)}</tbody></table>{rows.length === 0 ? <div className="empty-note">Nenhum veículo encontrado para “{search}”.</div> : null}</div></div>;
}

function Dashboard({ search, onSelectRisk, onToast, onNavigate }: { search: string; onSelectRisk: (risk: Risk) => void; onToast: (message: string) => void; onNavigate: (view: ViewKey) => void }) {
  return <>
    <PageHeader eyebrow="Cockpit operacional" title="Bom dia, Larissa" description="Aqui está o pulso de segurança da sua operação neste momento." />
    <div className="kpi-grid"><KpiCard label="Score de segurança" value="78 / 100" meta="4,2% vs. semana anterior" icon={CircleGauge} trend="up" /><KpiCard label="Riscos ativos" value="12" meta="3 críticos aguardando ação" icon={ShieldAlert} tone="red" trend="down" /><KpiCard label="Veículos conectados" value="184 / 192" meta="95,8% da frota online" icon={Radio} trend="up" /><KpiCard label="Tempo médio de resposta" value="04:38" meta="18% mais rápido" icon={Clock3} trend="up" /></div>
    <div className="grid-2-1"><div className="panel animate-rise animate-delay-1"><div className="panel-header"><div><div className="panel-title">Tendência de risco operacional</div><div className="panel-subtitle">Score consolidado da frota · últimos 6 dias</div></div><div className="chart-legend"><span className="legend-item"><i className="legend-dot" /> Score atual</span><span className="legend-item"><i className="legend-dot alt" /> Meta 80</span></div></div><RiskChart /></div><div className="panel animate-rise animate-delay-2"><div className="panel-header"><div><div className="panel-title">Saúde da operação</div><div className="panel-subtitle">Distribuição por criticidade</div></div><button className="panel-link" onClick={() => onSelectRisk(initialRisks[0])}>Detalhar</button></div><div className="risk-summary"><div className="score-ring"><div>78</div></div><div><div className="score-label">Score geral</div><div className="score-title">Operação controlada</div><div className="score-context">+4,2% de evolução no período</div></div></div><div className="risk-bars"><div className="risk-row"><span>Baixo risco</span><strong>142</strong><div className="bar"><span style={{ width: "76%" }} /></div></div><div className="risk-row"><span>Risco moderado</span><strong>31</strong><div className="bar warn"><span style={{ width: "28%" }} /></div></div><div className="risk-row"><span>Alto risco</span><strong>11</strong><div className="bar danger"><span style={{ width: "11%" }} /></div></div></div></div></div>
    <div className="grid-2-1"><MapPanel onSelectRisk={onSelectRisk} /><FeedPanel onSelectRisk={onSelectRisk} onViewAll={() => onNavigate("events")} /></div>
    <FleetTable search={search} onSelectRisk={onSelectRisk} />
    <div className="panel" style={{ marginTop: 18, background: "#183b3a", color: "#fff", borderColor: "#183b3a" }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}><div style={{ display: "flex", alignItems: "center", gap: 13 }}><div style={{ width: 34, height: 34, borderRadius: 9, display: "grid", placeItems: "center", background: "rgba(142,205,194,.16)", color: "#92d8cc" }}><HardDriveUpload size={17} /></div><div><div style={{ fontSize: 12, fontWeight: 800 }}>Embarque EMB-3041 aguardando aceite</div><div style={{ color: "#a7cbc6", fontSize: 10, marginTop: 4 }}>VTR-2048 · 4 itens aceitos · 1 rejeitado (ponto inativo) · 1 credencial pendente</div></div></div><button className="soft-btn" onClick={() => { onToast("Abrindo provisionamento."); onNavigate("provisioning"); }}>Ver provisionamento <ChevronRight size={13} /></button></div></div>
  </>;
}

function RisksView({ risks, search, onSelectRisk, onCommand }: { risks: Risk[]; search: string; onSelectRisk: (risk: Risk) => void; onCommand: (vehicle: string) => void }) {
  const [severity, setSeverity] = useState("all");
  const filtered = risks.filter((risk) => (severity === "all" || risk.severity === severity) && `${risk.title} ${risk.vehicle} ${risk.driver}`.toLowerCase().includes(search.toLowerCase()));
  return <><PageHeader eyebrow="Orquestração de risco" title="Riscos em tempo real" description="Priorize eventos ativos, delegue ou envie comandos ao veículo e acompanhe a eficácia de cada resposta." action="Comandos ao veículo" actionIcon={Terminal} onAction={() => onCommand(filtered[0]?.vehicle ?? initialRisks[0].vehicle)} /><div className="risk-page-grid"><div className="panel" style={{ padding: 0 }}><div className="toolbar"><div className="filters"><button className="secondary-btn"><Filter size={13} /> Filtros</button><select className="filter-select" value={severity} onChange={(e) => setSeverity(e.target.value)}><option value="all">Todas as criticidades</option><option value="high">Alta criticidade</option><option value="medium">Média criticidade</option><option value="low">Baixa criticidade</option></select><select className="filter-select"><option>Todos os status</option><option>Aguardando ação</option><option>Em tratamento</option><option>Resolvido</option></select></div><span style={{ fontSize: 10, color: "#84909d" }}>{filtered.length} eventos encontrados</span></div><div className="risk-list">{filtered.map((risk) => <button className="risk-list-item" key={risk.id} onClick={() => onSelectRisk(risk)}><span className={`risk-severity ${risk.severity === "medium" ? "amber" : risk.severity === "low" ? "teal" : ""}`} /><span><span className="risk-list-title">{risk.title}</span><span className="risk-list-desc">{risk.detail}</span><span className="risk-list-meta"><span>{risk.vehicle}</span><span>{risk.driver}</span><span>{risk.time}</span></span></span><span className="risk-score"><span className="risk-score-num">{risk.score}</span><span className="risk-score-label">score</span></span></button>)}{filtered.length === 0 ? <div className="empty-note"><div className="empty-icon"><ShieldCheck size={18} /></div>Nenhum risco corresponde aos filtros.</div> : null}</div></div><div className="panel page-panel"><div className="panel-header"><div><div className="panel-title">Eficiência dos comandos</div><div className="panel-subtitle">Últimos 30 dias</div></div><button className="panel-link" onClick={() => undefined}>Relatório</button></div><div className="report-cards"><div className="report-card"><div className="label">Resolvidos no SLA</div><div className="num">94%</div><div className="sub">+6,8% no período</div></div><div className="report-card"><div className="label">Reincidência</div><div className="num">8,2%</div><div className="sub" style={{ color: "#d1635c" }}>−2,1% no período</div></div><div className="report-card"><div className="label">Botões acionados pelo motorista</div><div className="num">218</div><div className="sub">de 231 habilitados</div></div></div><div className="detail-section"><div className="detail-label">Resposta por categoria</div><div className="risk-bars"><div className="risk-row"><span>Comportamento</span><strong>96%</strong><div className="bar"><span style={{ width: "96%" }} /></div></div><div className="risk-row"><span>Dinâmica veicular</span><strong>91%</strong><div className="bar"><span style={{ width: "91%" }} /></div></div><div className="risk-row"><span>Integridade MDVR</span><strong>88%</strong><div className="bar warn"><span style={{ width: "88%" }} /></div></div></div></div></div></div></>;
}

function MosaicDisplay({ vehicles, external = false }: { vehicles: typeof fleetRows; external?: boolean }) {
  const [clock, setClock] = useState(new Date());
  useEffect(() => { const timer = window.setInterval(() => setClock(new Date()), 1000); return () => window.clearInterval(timer); }, []);
  return <div className={`mosaic-display ${external ? "mosaic-external" : ""}`}><div className="mosaic-display-head"><div><div className="mosaic-display-brand"><span className="brand-mark"><ShieldCheck size={15} /></span> avansat <b>MONITORING WALL</b></div><div className="mosaic-display-title">Parede de monitoramento · {vehicles.length} veículos em foco</div></div><div className="mosaic-display-clock"><span className="live-pulse" /> AO VIVO · {clock.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div></div><div className="mosaic-grid">{vehicles.map((vehicle) => <div className="mosaic-device" key={vehicle.vehicle}><div className="mosaic-device-head"><span className={`vehicle-status ${vehicle.status === "high" ? "danger" : vehicle.status === "medium" ? "warn" : "ok"}`} /><strong>{vehicle.vehicle}</strong><span className="mosaic-driver">{vehicle.driver}</span><span className={`status ${vehicle.status}`}>{vehicle.risk}</span></div><div className="mosaic-camera-grid">{["Frontal", "Cabine", "Traseira", "Lateral"].map((camera, index) => <div className="mosaic-camera" key={camera}><span className="camera-scanline" /><PlayCircle size={18} /><small>CAM {String(index + 1).padStart(2, "0")} · {camera}</small></div>)}</div><div className="mosaic-device-foot"><span>{vehicle.speed}</span><span>{vehicle.last}</span><span className="mosaic-foot-live"><Radio size={10} /> stream ativo</span></div></div>)}</div>{vehicles.length === 0 ? <div className="mosaic-empty"><Video size={24} />Selecione veículos para iniciar o mosaico.</div> : null}</div>;
}

function MosaicExternalPage() {
  const [vehicleIds, setVehicleIds] = useState<string[]>(() => { try { return JSON.parse(window.localStorage.getItem("avansat-risk:mosaic-selection") ?? "[]") as string[]; } catch { return []; } });
  const vehicles = fleetRows.filter((row) => vehicleIds.includes(row.vehicle));
  useEffect(() => { const sync = () => { try { setVehicleIds(JSON.parse(window.localStorage.getItem("avansat-risk:mosaic-selection") ?? "[]") as string[]); } catch { /* seleção opcional */ } }; const timer = window.setInterval(sync, 1200); return () => window.clearInterval(timer); }, []);
  return <MosaicDisplay vehicles={vehicles.length ? vehicles : fleetRows.slice(0, 4)} external />;
}

function RealtimeView({ onSelectRisk, onToast, onCommand }: { onSelectRisk: (risk: Risk) => void; onToast: (message: string) => void; onCommand: (vehicle: string) => void }) {
  const [selectedVehicle, setSelectedVehicle] = useState("VTR-2048");
  const [treeFilter, setTreeFilter] = useState("");
  const [cameraCount, setCameraCount] = useState(4);
  const [selectedVehicles, setSelectedVehicles] = useState<string[]>(["VTR-2048", "VTR-1783"]);
  const [monitorMode, setMonitorMode] = useState<"single" | "mosaic">("single");
  const vehicles = fleetRows.filter((row) => `${row.vehicle} ${row.driver} ${row.fleet}`.toLowerCase().includes(treeFilter.toLowerCase()));
  const selected = fleetRows.find((row) => row.vehicle === selectedVehicle) ?? fleetRows[0];
  const selectVehicle = (vehicle: string) => { setSelectedVehicle(vehicle); onToast(`${vehicle} selecionado · câmeras e telemetria atualizadas.`); };
  const toggleMosaicVehicle = (vehicle: string) => setSelectedVehicles((current) => current.includes(vehicle) ? current.filter((item) => item !== vehicle) : [...current, vehicle]);
  const mosaicVehicles = fleetRows.filter((row) => selectedVehicles.includes(row.vehicle));
  const openMosaicWindow = () => { try { window.localStorage.setItem("avansat-risk:mosaic-selection", JSON.stringify(selectedVehicles)); } catch { /* localStorage opcional */ } const popup = window.open(`${window.location.origin}${window.location.pathname}?display=mosaic`, "avansat-monitoring-wall", "popup=yes,width=1440,height=900"); if (popup) { popup.focus(); onToast("Parede de monitoramento aberta em uma nova janela."); } else onToast("O navegador bloqueou a janela. Permita pop-ups para usar uma tela externa."); };
  return <>
    <PageHeader eyebrow="Centro de operação" title="Monitoramento ao vivo" description="Selecione veículos na árvore, acompanhe a posição no mapa e abra câmeras sem perder o contexto operacional." />
    <div className="monitor-toolbar"><div className="monitor-live"><span className="live-pulse" /> AO VIVO <span>·</span> Atualizado há 8s <span className="selection-pill">{selectedVehicles.length} em foco</span></div><div className="monitor-toolbar-actions"><div className="segmented monitor-mode"><button className={monitorMode === "single" ? "active" : ""} onClick={() => setMonitorMode("single")}>Estação</button><button className={monitorMode === "mosaic" ? "active" : ""} onClick={() => setMonitorMode("mosaic")}>Mosaico <span>{selectedVehicles.length}</span></button></div><button className="secondary-btn" onClick={() => onToast("Filtros avançados disponíveis: frota, status, risco e câmera.")}><Filter size={13} /> Filtros</button><button className="secondary-btn" onClick={openMosaicWindow}><ArrowUpRight size={13} /> Abrir em tela</button><button className="primary-btn" onClick={() => onToast("Patrulha iniciada com a seleção atual.")}><PlayCircle size={13} /> Iniciar patrulha</button></div></div>
    {monitorMode === "mosaic" ? <div className="mosaic-inline-wrap"><MosaicDisplay vehicles={mosaicVehicles} /><div className="mosaic-inline-actions"><span><CheckCircle2 size={13} /> {selectedVehicles.length} veículos selecionados</span><button className="soft-btn" onClick={openMosaicWindow}><ArrowUpRight size={13} /> Enviar para TV / monitor</button></div></div> : null}
    <div className="monitor-workspace">
      <aside className="fleet-tree panel">
        <div className="fleet-tree-head"><div><div className="panel-title">Frotas e veículos</div><div className="panel-subtitle">{fleetRows.length} selecionáveis · 4 online</div></div><button className="icon-btn" onClick={() => setTreeFilter("")}><RefreshCw size={13} /></button></div>
        <label className="tree-search"><Search size={13} /><input placeholder="Buscar frota ou veículo" value={treeFilter} onChange={(event) => setTreeFilter(event.target.value)} /></label>
        <div className="tree-summary"><button className="tree-summary-item active" onClick={() => setTreeFilter("")}><span><Truck size={13} /> Todas as frotas</span><strong>192</strong></button><button className="tree-summary-item" onClick={() => setTreeFilter("offline")}><span><Radio size={13} /> Sem sinal</span><strong className="offline-count">8</strong></button></div>
        <div className="tree-list"><div className="tree-group"><button className="tree-group-title"><ChevronDown size={14} /><span className="tree-folder" /> Sul · Distribuição <strong>52</strong></button><div className="tree-children">{vehicles.filter((row) => row.fleet.startsWith("Sul") || !treeFilter).map((row) => <button key={row.vehicle} className={`tree-vehicle ${selectedVehicle === row.vehicle ? "selected" : ""}`} onClick={() => selectVehicle(row.vehicle)}><span className={`tree-check ${selectedVehicles.includes(row.vehicle) ? "checked" : ""}`} onClick={(event) => { event.stopPropagation(); toggleMosaicVehicle(row.vehicle); }}>{selectedVehicles.includes(row.vehicle) ? <Check size={10} /> : null}</span><span className={`vehicle-status ${row.status === "high" ? "danger" : row.status === "medium" ? "warn" : "ok"}`} /><span className="tree-vehicle-copy"><strong>{row.vehicle}</strong><small>{row.driver}</small></span><span className="tree-risk">{row.risk}</span></button>)}</div></div><div className="tree-group collapsed"><button className="tree-group-title"><ChevronRight size={14} /><span className="tree-folder" /> Centro · Longa distância <strong>68</strong></button></div><div className="tree-group collapsed"><button className="tree-group-title"><ChevronRight size={14} /><span className="tree-folder" /> Sudeste · Operação <strong>72</strong></button></div>{vehicles.length === 0 ? <div className="empty-note">Nenhum veículo encontrado.</div> : null}</div>
        <div className="tree-footer"><button onClick={() => setSelectedVehicles(vehicles.map((row) => row.vehicle))}><Check size={12} /> Adicionar todos</button><button onClick={() => setSelectedVehicles([])}><X size={12} /> Limpar mosaico</button></div>
      </aside>
      <section className="monitor-map panel"><div className="monitor-section-head"><div><div className="panel-title">Mapa operacional</div><div className="panel-subtitle">Posição, direção, risco, cercas e pontos de controle da seleção</div></div><div className="map-quick-actions"><button className="icon-btn" onClick={() => onToast("Mapa centralizado na seleção.")}><Target size={14} /></button><button className="icon-btn" onClick={() => onToast("Camadas de cercas e pontos de controle alternadas.")}><Globe2 size={14} /></button></div></div><div className="live-map-stage"><div className="map-river" /><div className="map-road a" /><div className="map-road b" /><div className="map-road c" /><div className="map-road d" /><span className="map-label one">Contagem</span><span className="map-label two">Rio de Janeiro</span><span className="map-label three">Itaguaí</span><span className="map-label four">Seropédica</span>{fleetRows.map((row, i) => <button key={row.vehicle} className={`map-pin ${row.status === "medium" ? "amber" : row.status === "low" ? "teal" : ""} live-pin-${i} ${selectedVehicle === row.vehicle ? "selected-pin" : ""}`} onClick={() => selectVehicle(row.vehicle)}><MapPin size={11} /></button>)}<div className="map-controls"><button className="map-control">+</button><button className="map-control">−</button><button className="map-control"><Target size={13} /></button></div><div className="map-legend"><span><i /> alto risco</span><span><i className="amber" /> atenção</span><span><i className="teal" /> conectado</span></div></div><div className="vehicle-strip"><div className="vehicle-strip-main"><div className="vehicle-avatar"><Truck size={15} /></div><div><strong>{selected.vehicle}</strong><small>{selected.driver} · {selected.speed} · {selected.last} · perfil {selected.perfilAtivo}</small></div></div><span className={`status ${selected.status}`}>{selected.status === "high" ? "Alto risco" : selected.status === "medium" ? "Atenção" : "Monitorado"}</span><button className="panel-link" onClick={() => onSelectRisk(initialRisks.find((risk) => risk.vehicle === selected.vehicle) ?? initialRisks[0])}>Abrir ocorrência <ChevronRight size={12} /></button></div></section>
      <aside className="camera-wall panel"><div className="camera-wall-head"><div><div className="panel-title">Câmeras do veículo</div><div className="panel-subtitle">{selectedVehicle} · MDVR-0882</div></div><span className="status online">Online</span></div><div className="camera-tabs"><button className="active">Ao vivo</button><button>Playback</button><button>Alarmes <span>3</span></button></div><div className={`camera-grid camera-count-${cameraCount}`}>{Array.from({ length: cameraCount }).map((_, index) => <button className="camera-tile" key={index} onClick={() => onToast(`Câmera ${index + 1} aberta em foco.`)}><div className="camera-art"><span className="camera-scanline" /><PlayCircle size={22} /></div><div className="camera-tile-footer"><span>CAM {String(index + 1).padStart(2, "0")}</span><small>{index === 0 ? "Frontal" : index === 1 ? "Cabine" : index === 2 ? "Traseira" : "Lateral"}</small></div></button>)}</div><div className="camera-controls"><button className="camera-control active" onClick={() => onToast("Áudio do veículo ativado.")}><Headphones size={14} /><span>Áudio</span></button><button className="camera-control" onClick={() => onToast("Intercomunicador pronto para iniciar.")}><Radio size={14} /><span>Intercom</span></button><button className="camera-control" onClick={() => onToast("Captura salva em evidências.")}><Archive size={14} /><span>Capturar</span></button><button className="camera-control danger" onClick={() => onCommand(selectedVehicle)}><ShieldAlert size={14} /><span>Comandos</span></button></div><div className="camera-wall-footer"><span>Grade de câmeras</span><div className="segmented"><button className={cameraCount === 1 ? "active" : ""} onClick={() => setCameraCount(1)}>1</button><button className={cameraCount === 4 ? "active" : ""} onClick={() => setCameraCount(4)}>4</button></div><button className="icon-btn" onClick={() => onToast("Parede de câmeras maximizada.")}><ArrowUpRight size={14} /></button></div></aside>
    </div>
    <div className="monitor-statusbar"><span><CheckCircle2 size={13} /> MDVR conectado</span><span><Radio size={13} /> 184 veículos online</span><span><Video size={13} /> 12 streams ativos</span><span className="statusbar-spacer" /><button onClick={() => onToast("Central de ajuda do operador aberta.")}><Headphones size={13} /> Ajuda rápida</button></div>
  </>;
}

function EvidenceView({ onToast }: { onToast: (message: string) => void }) {
  const evidence = [{ title: "Fadiga detectada · VTR-2048", type: "Alarme de comportamento", time: "Hoje, 14:32", color: "red" }, { title: "Excesso de velocidade · VTR-1783", type: "Evento de dinâmica veicular", time: "Hoje, 14:28", color: "amber" }, { title: "Entrada em cerca restrita · VTR-0931", type: "Cerca · área restrita", time: "Hoje, 14:15", color: "teal" }];
  return <><PageHeader eyebrow="Evidência operacional" title="Evidências & vídeo" description="Revise alarmes, clipes e registros de acidente vinculados a cada evento de risco." action="Solicitar evidência" onAction={() => onToast("Solicitação enviada para o dispositivo VTR-2048.")} /><div className="grid-2-1"><div className="panel"><div className="panel-header"><div><div className="panel-title">Galeria de evidências</div><div className="panel-subtitle">Últimos eventos capturados</div></div><div className="segmented"><button className="active">Todos</button><button>Alarmes</button><button>Acidentes</button></div></div>{evidence.map((item) => <div className="feed-item" key={item.title}><div className={`feed-icon ${item.color}`}><Video size={14} /></div><div><div className="feed-title">{item.title}</div><div className="feed-desc">{item.type} · {item.time}</div><div style={{ marginTop: 9, display: "flex", gap: 7 }}><button className="soft-btn" onClick={() => onToast("Reprodução iniciada no player de evidência.")}><PlayCircle size={12} /> Reproduzir</button><button className="secondary-btn" onClick={() => onToast("Evidência marcada para auditoria.")}><Archive size={12} /> Arquivar</button></div></div><button className="action-more"><MoreHorizontal size={15} /></button></div>)}</div><div className="panel page-panel"><div className="panel-header"><div><div className="panel-title">Reprodução selecionada</div><div className="panel-subtitle">VTR-2048 · câmera frontal</div></div><button className="icon-btn" onClick={() => onToast("Player maximizado.")}><ArrowUpRight size={14} /></button></div><div style={{ height: 210, borderRadius: 9, background: "linear-gradient(135deg,#183b3a 0%,#2c6860 48%,#6b8d88 49%,#bdd7d1 100%)", position: "relative", overflow: "hidden", display: "grid", placeItems: "center" }}><div style={{ width: 50, height: 50, borderRadius: "50%", background: "rgba(255,255,255,.9)", display: "grid", placeItems: "center", color: "#0f7c75" }}><PlayCircle size={25} /></div><span style={{ position: "absolute", left: 13, bottom: 11, color: "#fff", fontSize: 9, fontFamily: "DM Mono" }}>00:18 / 00:42</span><span style={{ position: "absolute", right: 13, top: 11, color: "#d8fff8", fontSize: 9 }}>CAM 01 · HD</span></div><div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, color: "#8896a3", fontSize: 10 }}><span>14:32:08</span><span>Fadiga · score 92</span><button className="panel-link" onClick={() => onToast("Download preparado.")}><Download size={12} /> Baixar</button></div></div></div></>;
}

function ReportsView({ onToast }: { onToast: (message: string) => void }) {
  return <><PageHeader eyebrow="Inteligência operacional" title="Relatórios" description="Transforme eventos de telemetria em decisões de segurança e melhoria contínua." action="Novo relatório" onAction={() => onToast("Fluxo de criação de relatório aberto.")} /><div className="report-cards"><div className="report-card"><div className="label">Score médio da frota</div><div className="num">78,4</div><div className="sub">+4,2% vs. mês anterior</div></div><div className="report-card"><div className="label">Alarmes por 100 km</div><div className="num">2,8</div><div className="sub" style={{ color: "#d1635c" }}>−0,6 no período</div></div><div className="report-card"><div className="label">Treinamentos eficazes</div><div className="num">87%</div><div className="sub">+9% após treinamento</div></div></div><div className="grid-1-1"><div className="panel"><div className="panel-header"><div><div className="panel-title">Resumo mensal de segurança</div><div className="panel-subtitle">Eventos críticos por semana</div></div><button className="secondary-btn" onClick={() => onToast("PDF do resumo mensal preparado.")}><Download size={13} /> Exportar</button></div><div className="mini-bars">{[58, 77, 52, 86, 64, 43, 30].map((height, i) => <div className="mini-bar-col" key={i}><div className={`mini-bar ${i === 6 ? "" : "alt"}`} style={{ height: `${height}%` }} /><label>{["03/09", "04/09", "05/09", "06/09", "07/09", "08/09", "Hoje"][i]}</label></div>)}</div></div><div className="panel"><div className="panel-header"><div><div className="panel-title">Relatórios salvos</div><div className="panel-subtitle">Acompanhamentos configurados</div></div><button className="panel-link" onClick={() => onToast("Todos os relatórios carregados.")}>Ver gestão</button></div>{["Análise de segurança · Sul", "Retrato de motorista · Q3", "Status online da frota", "Eficácia de comandos"].map((name, i) => <div className="feed-item" key={name}><div className="feed-icon teal"><FileText size={14} /></div><div><div className="feed-title">{name}</div><div className="feed-desc">Atualizado {i + 1}h atrás · próximo envio amanhã</div></div><button className="action-more" onClick={() => onToast(`Abrindo ${name}.`)}><MoreHorizontal size={15} /></button></div>)}</div></div></>;
}

function FleetView({ view, onToast, onOpenForm }: { view: "fleet" | "drivers" | "training" | "traffic" | "settings"; onToast: (message: string) => void; onOpenForm: () => void }) {
  const [trafficTab, setTrafficTab] = useState<"devices" | "messages">("devices");
  const config = {
    fleet: { eyebrow: "Cadastros operacionais", title: "Frota e veículos", desc: "Gerencie frotas, veículos, dispositivos e atributos de elegibilidade ao risco.", action: "Adicionar veículo", icon: Truck },
    drivers: { eyebrow: "Identificação do condutor", title: "Motoristas", desc: "Acompanhe identificação facial, IButton, associação e perfil de segurança.", action: "Adicionar motorista", icon: Users },
    training: { eyebrow: "Melhoria contínua", title: "Treinamento", desc: "Converta reincidência em trilhas de desenvolvimento e meça mudança de comportamento.", action: "Criar treinamento", icon: BookOpen },
    traffic: { eyebrow: "Conectividade MDVR", title: "Centro de tráfego", desc: "Monitore dispositivos, canal celular e de contingência, consumo, prioridade de evidências e mensagens com o motorista.", action: "Nova política", icon: Smartphone },
    settings: { eyebrow: "Governança", title: "Configurações", desc: "Ajuste regras gerais, responsáveis, SLAs e preferências da operação.", action: "Nova preferência", icon: Settings },
  }[view];
  const Icon = config.icon;
  const rows = view === "drivers" ? [{ a: "Carlos Mendes", b: "CNH · validada", c: "VTR-2048", d: "92", e: "Identificado" }, { a: "Ana Paula Costa", b: "CNH · validada", c: "VTR-1783", d: "84", e: "Identificado" }, { a: "Rafael Nunes", b: "CNH · renovar em 42d", c: "VTR-0931", d: "76", e: "Identificado" }, { a: "Marcos Silva", b: "CNH · validada", c: "VTR-3110", d: "61", e: "Identificado" }] : view === "training" ? [{ a: "Direção defensiva · Q3", b: "12 motoristas inscritos", c: "Vencimento 18 set", d: "78%", e: "Em andamento" }, { a: "Pausa segura e fadiga", b: "8 motoristas inscritos", c: "Vencimento 12 set", d: "94%", e: "Ativo" }, { a: "Política de celular", b: "31 motoristas inscritos", c: "Vencimento 30 set", d: "62%", e: "Em andamento" }] : view === "traffic" ? [{ a: "MDVR-0882", b: "VTR-2048 · MDVR-8 Pro · fw 4.2.1", c: "Celular · 4G · 312 MB hoje", d: "92", e: "Conectado" }, { a: "MDVR-0714", b: "VTR-1783 · MDVR-8 · fw 4.1.0", c: "Celular · 4G · 280 MB hoje", d: "84", e: "Conectado" }, { a: "MDVR-1028", b: "VTR-0931 · MDVR-4 · fw 3.9.4", c: "Satélite (contingência) · 14 msgs", d: "76", e: "Contingência" }, { a: "MDVR-0921", b: "VTR-3110 · MDVR-8 · fw 4.2.1", c: "Celular · 4G · 96 MB hoje", d: "61", e: "Conectado" }, { a: "MDVR-0655", b: "VTR-2240 · MDVR-4 · fw 3.8.0", c: "Sem sinal há 30 min · última posição Seropédica", d: "48", e: "Sem sinal" }] : [{ a: "VTR-2048", b: "Caminhão 3/4 · MDVR-0882", c: "Sul · Distribuição", d: "92", e: "Conectado" }, { a: "VTR-1783", b: "Cavalo mecânico · MDVR-0714", c: "Centro · Longa distância", d: "84", e: "Conectado" }, { a: "VTR-0931", b: "Van urbana · MDVR-1028", c: "Sudeste · Última milha", d: "76", e: "Conectado" }, { a: "VTR-3110", b: "Caminhão 3/4 · MDVR-0921", c: "Sudeste · Operação", d: "61", e: "Conectado" }];
  return <><PageHeader eyebrow={config.eyebrow} title={config.title} description={config.desc} action={config.action} onAction={onOpenForm} />{view === "traffic" ? <div className="segmented" style={{ marginBottom: 16 }}><button className={trafficTab === "devices" ? "active" : ""} onClick={() => setTrafficTab("devices")}><Smartphone size={12} /> Dispositivos e canais</button><button className={trafficTab === "messages" ? "active" : ""} onClick={() => setTrafficTab("messages")}><MessageSquare size={12} /> Mensageria motorista ↔ central</button></div> : null}{view === "traffic" && trafficTab === "messages" ? <MessagingPanel onToast={onToast} /> : <><div className="kpi-grid"><KpiCard label={view === "training" ? "Trilhas ativas" : view === "traffic" ? "Dispositivos online" : "Total cadastrado"} value={view === "training" ? "08" : view === "traffic" ? "184 / 192" : view === "fleet" ? "192" : view === "drivers" ? "218" : "12"} meta="+8,4% no período" icon={Icon} trend="up" /><KpiCard label="Em conformidade" value={view === "drivers" ? "91%" : "87%"} meta="Meta operacional: 85%" icon={CheckCircle2} trend="up" /><KpiCard label="Atenção necessária" value={view === "training" ? "04" : "12"} meta="Priorizados hoje" icon={AlertTriangle} tone="red" trend="down" /><KpiCard label="Última atualização" value="14:32" meta="Sincronização concluída" icon={RefreshCw} /></div><div className="panel"><div className="toolbar"><div className="filters"><button className="secondary-btn"><Filter size={13} /> Filtros</button><label className="search-box" style={{ minWidth: 210, padding: "7px 10px" }}><Search size={13} /><input placeholder={`Buscar ${view === "drivers" ? "motorista" : "registro"}...`} /></label></div><div style={{ display: "flex", gap: 7 }}><button className="secondary-btn" onClick={() => onToast("Exportação preparada.")}><Download size={13} /> Exportar</button><button className="icon-btn" onClick={() => onToast("Tabela atualizada.")}><RefreshCw size={14} /></button></div></div><div className="table-wrap"><table><thead><tr><th>{view === "drivers" ? "MOTORISTA" : view === "training" ? "TRILHA" : "REGISTRO"}</th><th>DETALHES</th><th>GRUPO / VÍNCULO</th><th>SCORE</th><th>STATUS</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.a}><td><div className="vehicle-cell"><div className="vehicle-avatar"><Icon size={14} /></div><div><div className="vehicle-name">{row.a}</div><div className="vehicle-meta">{row.b}</div></div></div></td><td>{row.b}</td><td>{row.c}</td><td><span className="status low">{row.d}</span></td><td><span className={`status ${row.e === "Sem sinal" ? "offline" : row.e === "Contingência" ? "review" : "online"}`}>{row.e}</span></td><td><button className="action-more" onClick={() => onToast(`Abrindo detalhes de ${row.a}.`)}><MoreHorizontal size={15} /></button></td></tr>)}</tbody></table></div></div></>}</>;
}

function DetailDrawer({ risk, onClose, onToast, onUpdate, onCommand }: { risk: Risk; onClose: () => void; onToast: (message: string) => void; onUpdate: (id: string, patch: Partial<Risk>) => void; onCommand: (vehicle: string) => void }) {
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState(risk.status);
  const equipamento = equipamentoDe(risk.vehicle);
  const saveTreatment = () => {
    const nextStatus = status === "Aguardando ação" ? "Em tratamento" : "Resolvido";
    onUpdate(risk.id, { status: nextStatus });
    try { window.localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify({ event: risk.id, action: "treatment", status: nextStatus, comment, at: new Date().toISOString() })); } catch { /* localStorage opcional */ }
    onToast(comment ? "Tratamento e comentário registrados." : "Tratamento registrado com sucesso.");
    onClose();
  };
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><div className="modal-title">Detalhe do risco</div><div className="modal-desc">Evento {risk.id} · correlação de telemetria, política embarcada e evidência</div></div><button className="close-btn" onClick={onClose}><X size={15} /></button></div><div className="detail-hero" style={{ margin: 0, borderRadius: 10 }}><div className="detail-kicker">{status} · {risk.natureza === "condicao" ? "condição" : "marco"}</div><div className="detail-title">{risk.title}</div><div className="detail-sub">{risk.vehicle} · {risk.driver}</div><div className="detail-score"><strong>{risk.score}</strong><span>score de risco</span></div></div><div className="detail-section"><div className="detail-label">Contexto</div><div className="detail-text">{risk.detail}</div></div><div className="detail-section"><div className="detail-grid"><div><div className="detail-label">Localização</div><div className="detail-value">{risk.zone}</div></div><div><div className="detail-label">Detectado</div><div className="detail-value">{risk.time}</div></div><div><div className="detail-label">Perfil operacional ativo</div><div className="detail-value">{risk.perfilAtivo}</div></div><div><div className="detail-label">Ponto de controle</div><div className="detail-value">{risk.pontoDeControle ?? "Fora de ponto de controle"}</div></div><div><div className="detail-label">Equipamento</div><div className="detail-value">{equipamento.equipamento} · {equipamento.linha}</div></div><div><div className="detail-label">Canal</div><div className="detail-value">{equipamento.canal === "sem_sinal" ? "Sem sinal" : equipamento.canal === "celular" ? "Celular" : "Contingência"}</div></div></div></div><div className="detail-section"><div className="detail-label">Fluxo operacional</div><div className="detail-actions"><button className="primary-btn" onClick={() => onCommand(risk.vehicle)}><Terminal size={13} /> Comandos ao veículo</button><button className="soft-btn" onClick={() => onToast("Evidência solicitada ao MDVR.")}><Video size={13} /> Solicitar evidência</button><button className="secondary-btn" onClick={() => onToast("Localização focada no mapa operacional.")}><MapPin size={13} /> Ver localização</button></div><div className="form-hint">Comandos delegados habilitam um botão para o motorista; a central não atua diretamente na trava.</div></div><div className="detail-section"><div className="detail-label">Tratamento e auditoria</div><select className="filter-select" style={{ width: "100%", marginBottom: 9 }} value={status} onChange={(e) => setStatus(e.target.value)}><option>Aguardando ação</option><option>Em tratamento</option><option>Resolvido</option></select><textarea className="form-field" style={{ width: "100%", border: "1px solid #dfe7eb", borderRadius: 7, padding: 9, fontSize: 11, minHeight: 56, resize: "vertical" }} placeholder="Adicionar comentário do tratamento..." value={comment} onChange={(e) => setComment(e.target.value)} /><div className="audit-note">Cada alteração registra responsável, horário, status e comentário para auditoria.</div></div><div className="modal-actions"><button className="secondary-btn" onClick={onClose}>Fechar</button><button className="primary-btn" onClick={saveTreatment}><Check size={13} /> Salvar tratamento</button></div></div></div>;
}

function EntityModal({ kind, onClose, onToast }: { kind: "fleet" | "drivers" | "training" | "traffic" | "settings"; onClose: () => void; onToast: (message: string) => void }) {
  const labels = { fleet: ["Adicionar veículo", "cadastro do veículo", "Placa", "VTR-0000"], drivers: ["Adicionar motorista", "perfil do motorista", "Nome completo", "Novo motorista"], training: ["Criar treinamento", "trilha de desenvolvimento", "Nome da trilha", "Direção defensiva"], traffic: ["Nova política", "controle de consumo celular", "Nome da política", "Prioridade de evidência"], settings: ["Nova preferência", "parâmetro operacional", "Nome da configuração", "SLA de resposta"] }[kind];
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><div className="modal-title">{labels[0]}</div><div className="modal-desc">Preencha os dados para criar um novo registro de {labels[1]}.</div></div><button className="close-btn" onClick={onClose}><X size={15} /></button></div><div className="form-field"><label>{labels[2]}</label><input defaultValue={labels[3]} /></div><div className="form-row"><div className="form-field"><label>Grupo / vínculo</label><select defaultValue="sul"><option value="sul">Sul · Distribuição</option><option value="centro">Centro · Longa distância</option><option value="sudeste">Sudeste · Operação</option></select></div><div className="form-field"><label>Status inicial</label><select defaultValue="active"><option value="active">Ativo</option><option value="draft">Rascunho</option></select></div></div><div className="form-field"><label>Observações</label><textarea placeholder="Adicionar contexto operacional..." /><div className="form-hint">O registro ficará disponível imediatamente nesta sessão demonstrativa.</div></div><div className="modal-actions"><button className="secondary-btn" onClick={onClose}>Cancelar</button><button className="primary-btn" onClick={() => { onToast(`${labels[0]} salvo com sucesso.`); onClose(); }}><Check size={13} /> Salvar registro</button></div></div></div>;
}

function MainApp() {
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");
  const [search, setSearch] = useState("");
  const [risks, setRisks] = useState<Risk[]>(loadRisks);
  const [selectedRisk, setSelectedRisk] = useState<Risk | null>(null);
  const [commandVehicle, setCommandVehicle] = useState<string | null>(null);
  const [entityForm, setEntityForm] = useState<"fleet" | "drivers" | "training" | "traffic" | "settings" | null>(null);
  const [toast, setToast] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [configs, setConfigs] = useConfiguracoes();
  const [pontos, setPontos] = usePontos();
  const title = useMemo(() => [...navGroups.flatMap((g) => g.items), { id: "settings", label: "Configurações" }].find((item) => item.id === activeView)?.label ?? "Visão geral", [activeView]);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3000); };
  useEffect(() => { try { window.localStorage.setItem(RISK_STORAGE_KEY, JSON.stringify(risks)); } catch { /* localStorage opcional */ } }, [risks]);
  const updateRisk = (id: string, patch: Partial<Risk>) => setRisks((current) => current.map((risk) => risk.id === id ? { ...risk, ...patch } : risk));
  const chooseView = (view: ViewKey) => { setActiveView(view); setSearch(""); setSidebarOpen(false); };
  const openRisk = (risk: Risk) => setSelectedRisk(risk);
  const openCommand = (vehicle: string) => { setSelectedRisk(null); setCommandVehicle(vehicle); };
  const entityView = activeView as "fleet" | "drivers" | "training" | "traffic" | "settings";
  const body = activeView === "dashboard" ? <Dashboard search={search} onSelectRisk={openRisk} onToast={notify} onNavigate={chooseView} />
    : activeView === "risks" ? <RisksView risks={risks} search={search} onSelectRisk={openRisk} onCommand={openCommand} />
    : activeView === "events" ? <EventsView pontos={pontos} onToast={notify} onCommand={openCommand} />
    : activeView === "realtime" ? <RealtimeView onSelectRisk={openRisk} onToast={notify} onCommand={openCommand} />
    : activeView === "evidence" ? <EvidenceView onToast={notify} />
    : activeView === "reports" ? <ReportsView onToast={notify} />
    : activeView === "profiles" ? <ProfilesView configs={configs} setConfigs={setConfigs} busca={search} onLimparBusca={() => setSearch("")} onToast={notify} VehicleNavigator={VehicleNavigator} />
    : activeView === "controlpoints" ? <ControlPointsView pontos={pontos} setPontos={setPontos} onToast={notify} />
    : activeView === "fences" ? <FencesView onToast={notify} />
    : activeView === "routes" ? <RoutesView onToast={notify} onGoRotograma={() => chooseView("controlpoints")} />
    : activeView === "provisioning" ? <ProvisioningView pontos={pontos} onToast={notify} />
    : activeView === "security" ? <SecurityView onToast={notify} />
    : <FleetView view={entityView} onToast={notify} onOpenForm={() => setEntityForm(entityView)} />;
  return <div className="app-shell"><div className={sidebarOpen ? "sidebar-mobile-overlay open" : "sidebar-mobile-overlay"} onClick={() => setSidebarOpen(false)} /><div className={sidebarOpen ? "sidebar sidebar-open" : "sidebar"}><Sidebar active={activeView} onSelect={chooseView} /></div><div className="main-area"><Topbar title={title} onSearch={setSearch} onToast={notify} /><main className={activeView === "profiles" ? "content content-workspace" : "content"}>{body}</main></div>{selectedRisk ? <DetailDrawer risk={selectedRisk} onClose={() => setSelectedRisk(null)} onToast={notify} onUpdate={updateRisk} onCommand={openCommand} /> : null}{commandVehicle ? <CommandModal veiculo={commandVehicle} onClose={() => setCommandVehicle(null)} onToast={notify} /> : null}{entityForm ? <EntityModal kind={entityForm} onClose={() => setEntityForm(null)} onToast={notify} /> : null}{toast ? <div className="toast">{toast}</div> : null}<button className="mobile-menu" aria-label="Abrir menu" onClick={() => setSidebarOpen(true)}><Menu size={18} /></button></div>;
}

export default function Home() {
  const displayMode = new URLSearchParams(window.location.search).get("display");
  return displayMode === "mosaic" ? <MosaicExternalPage /> : <MainApp />;
}
