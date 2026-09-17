import { useMemo, useState } from "react";
import { Activity, CalendarDays, Clock3, Download, Flag, History, MapPin, ShieldAlert, Terminal, Waypoints, WifiOff, X, Zap } from "lucide-react";
import { PageHeader, Tag, formatDateTime, formatTime, useStoredState, type IconType } from "../shared";
import { STORAGE, canalLabel, eventosIniciais, nomePonto, type ConfiguracaoVeiculo, type Evento, type PontoDeControle } from "../domain";

const tipoIcon: Record<Evento["tipo"], IconType> = { sensor: ShieldAlert, ponto: MapPin, rotograma: Clock3, rota: Waypoints, sinal: WifiOff, coacao: ShieldAlert, comando: Terminal, macro: Zap, comportamento: Activity };
const ATRASO_MIN = 2;
const atrasado = (evento: Evento) => (new Date(evento.receivedAt).getTime() - new Date(evento.occurredAt).getTime()) / 60000 > ATRASO_MIN;
const csvValue = (value: string | number | null | undefined) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export function EventsView({ pontos, configs, search, onToast }: { pontos: PontoDeControle[]; configs: ConfiguracaoVeiculo[]; search: string; onToast: (message: string) => void }) {
  const [eventos] = useStoredState<Evento[]>(STORAGE.eventos, eventosIniciais);
  const availableDates = useMemo(() => eventos.map((evento) => evento.occurredAt.slice(0, 10)).sort(), [eventos]);
  const [startDate, setStartDate] = useState(() => availableDates[0] ?? "2026-09-01");
  const [endDate, setEndDate] = useState(() => availableDates.at(-1) ?? "2026-09-15");
  const [fleet, setFleet] = useState("todas");
  const [vehicle, setVehicle] = useState("todos");
  const [eventType, setEventType] = useState<"todos" | Evento["tipo"]>("todos");
  const [severity, setSeverity] = useState<"todas" | Evento["severidade"]>("todas");
  const [nature, setNature] = useState<"todos" | "condicao" | "marco" | "atrasados">("todos");
  const [perfilGestao, setPerfilGestao] = useState(true);

  const fleetByVehicle = useMemo(() => new Map(configs.map((config) => [config.veiculo, config.frota])), [configs]);
  const fleets = useMemo(() => Array.from(new Set(configs.map((config) => config.frota))).sort(), [configs]);
  const vehicles = useMemo(() => Array.from(new Set(eventos.filter((evento) => fleet === "todas" || fleetByVehicle.get(evento.veiculo) === fleet).map((evento) => evento.veiculo))).sort(), [eventos, fleet, fleetByVehicle]);
  const visibleEvents = useMemo(() => eventos
    .filter((evento) => { const date = evento.occurredAt.slice(0, 10); return (!startDate || date >= startDate) && (!endDate || date <= endDate); })
    .filter((evento) => fleet === "todas" || fleetByVehicle.get(evento.veiculo) === fleet)
    .filter((evento) => vehicle === "todos" || evento.veiculo === vehicle)
    .filter((evento) => eventType === "todos" || evento.tipo === eventType)
    .filter((evento) => severity === "todas" || evento.severidade === severity)
    .filter((evento) => perfilGestao || evento.tipo !== "coacao")
    .filter((evento) => nature === "todos" || (nature === "atrasados" ? atrasado(evento) : evento.natureza === nature))
    .filter((evento) => `${evento.titulo} ${evento.veiculo} ${evento.motorista} ${evento.detalhe}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), [endDate, eventType, eventos, fleet, fleetByVehicle, nature, perfilGestao, search, severity, startDate, vehicle]);

  const openConditions = visibleEvents.filter((evento) => evento.natureza === "condicao" && !evento.encerradoEm).length;
  const delayed = visibleEvents.filter(atrasado).length;
  const signalLoss = visibleEvents.filter((evento) => evento.tipo === "sinal" && !evento.encerradoEm).length;
  const coercion = visibleEvents.filter((evento) => evento.tipo === "coacao").length;
  const hasFilters = fleet !== "todas" || vehicle !== "todos" || eventType !== "todos" || severity !== "todas" || nature !== "todos" || !perfilGestao || startDate !== availableDates[0] || endDate !== availableDates.at(-1);

  const clearFilters = () => {
    setStartDate(availableDates[0] ?? ""); setEndDate(availableDates.at(-1) ?? "");
    setFleet("todas"); setVehicle("todos"); setEventType("todos"); setSeverity("todas"); setNature("todos"); setPerfilGestao(true);
  };

  const exportReport = () => {
    if (!visibleEvents.length) { onToast("Não há eventos no filtro atual para exportar."); return; }
    const header = ["Evento", "Data do fato", "Data de recebimento", "Veículo", "Motorista", "Frota", "Tipo", "Natureza", "Severidade", "Perfil ativo", "Ponto de controle", "Status", "Detalhe"];
    const rows = visibleEvents.map((evento) => [evento.id, formatDateTime(evento.occurredAt), formatDateTime(evento.receivedAt), evento.veiculo, evento.motorista, fleetByVehicle.get(evento.veiculo) ?? "Outros veículos", evento.tipo, evento.natureza, evento.severidade, evento.perfilAtivo, evento.pontoDeControle ? nomePonto(evento.pontoDeControle, pontos) : "", evento.encerradoEm ? "Encerrado" : evento.natureza === "condicao" ? "Em curso" : "Registrado", evento.detalhe]);
    const csv = `\uFEFF${[header, ...rows].map((row) => row.map(csvValue).join(";")).join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `relatorio-eventos-${startDate || "inicio"}-${endDate || "fim"}.csv`; anchor.click(); URL.revokeObjectURL(url);
    onToast(`Relatório gerado com ${visibleEvents.length} evento(s).`);
  };

  return <>
    <PageHeader eyebrow="Histórico operacional" title="Eventos" description="Consulte o histórico pelo instante do fato, veículo e período. Condições têm início e fim; marcos registram um instante." action="Exportar relatório" actionIcon={Download} onAction={exportReport} />
    <section className="event-history-filters" aria-label="Filtros do histórico">
      <div className="event-filter-period"><CalendarDays size={14} /><label><span>De</span><input type="date" value={startDate} max={endDate || undefined} onChange={(event) => setStartDate(event.target.value)} /></label><i>até</i><label><span>Até</span><input type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} /></label></div>
      <label className="event-filter-field"><span>Frota</span><select value={fleet} onChange={(event) => { setFleet(event.target.value); setVehicle("todos"); }}><option value="todas">Todas as frotas</option>{fleets.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="event-filter-field"><span>Veículo</span><select value={vehicle} onChange={(event) => setVehicle(event.target.value)}><option value="todos">Todas as placas</option>{vehicles.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="event-filter-field"><span>Tipo</span><select value={eventType} onChange={(event) => setEventType(event.target.value as typeof eventType)}><option value="todos">Todos os tipos</option><option value="sensor">Sensor</option><option value="comportamento">Comportamento</option><option value="ponto">Ponto de controle</option><option value="rotograma">Rotograma</option><option value="rota">Rota</option><option value="sinal">Sinal</option><option value="macro">Macro</option><option value="comando">Comando</option><option value="coacao">Coação</option></select></label>
      <label className="event-filter-field"><span>Severidade</span><select value={severity} onChange={(event) => setSeverity(event.target.value as typeof severity)}><option value="todas">Todas</option><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></select></label>
      <button className={`event-sensitive-filter ${perfilGestao ? "active" : ""}`} onClick={() => setPerfilGestao((current) => !current)} title="Eventos de coação são restritos à gestão de risco"><ShieldAlert size={13} /><span>Coação</span></button>
      {hasFilters ? <button className="event-clear-filters" onClick={clearFilters}><X size={12} /> Limpar</button> : null}
    </section>
    <section className="event-history-summary" aria-label="Resumo do período"><div><Activity size={14} /><span>Condições abertas</span><strong>{String(openConditions).padStart(2, "0")}</strong></div><div><History size={14} /><span>Recebidos com atraso</span><strong>{String(delayed).padStart(2, "0")}</strong></div><div><WifiOff size={14} /><span>Perda de sinal</span><strong>{String(signalLoss).padStart(2, "0")}</strong></div><div><ShieldAlert size={14} /><span>Coação</span><strong>{perfilGestao ? String(coercion).padStart(2, "0") : "—"}</strong></div></section>
    <section className="panel event-history-panel">
      <header className="event-history-toolbar"><div className="segmented"><button className={nature === "todos" ? "active" : ""} onClick={() => setNature("todos")}>Todos</button><button className={nature === "condicao" ? "active" : ""} onClick={() => setNature("condicao")}>Condições</button><button className={nature === "marco" ? "active" : ""} onClick={() => setNature("marco")}>Marcos</button><button className={nature === "atrasados" ? "active" : ""} onClick={() => setNature("atrasados")}><History size={11} /> Atrasados</button></div><div><strong>{visibleEvents.length}</strong> evento(s) encontrado(s)<span>Ordenados pelo instante do fato</span></div></header>
      <div className="event-list event-history-list">{visibleEvents.map((evento) => { const Icon = tipoIcon[evento.tipo]; const late = atrasado(evento); const eventFleet = fleetByVehicle.get(evento.veiculo) ?? "Outros veículos"; return <article key={evento.id} className={`event-card ${evento.natureza} ${evento.tipo === "coacao" ? "duress" : ""} ${evento.tipo === "sinal" ? "signal" : ""}`}>
        <div className="event-vehicle-cell"><span className="event-vehicle-badge">{evento.veiculo}</span><span><strong>{evento.motorista}</strong><small>{eventFleet}</small></span></div>
        <div className="event-time"><strong>{formatTime(evento.occurredAt)}</strong><small>{new Date(evento.occurredAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</small>{late ? <span className="late-badge" title={`Recebido ${formatDateTime(evento.receivedAt)}`}><History size={10} /> atrasado</span> : <span className="rt-badge">tempo real</span>}</div>
        <div className={`event-shape ${evento.natureza}`}>{evento.natureza === "condicao" ? <span className={`cond-bar ${evento.encerradoEm ? "closed" : "open"}`}><i /><i /></span> : <span className="marco-dot"><Flag size={9} /></span>}</div>
        <div className="event-body"><div className="event-title"><Icon size={13} /> {evento.titulo}{evento.tipo === "coacao" ? <Tag tone="red">coação · canal restrito</Tag> : null}{evento.tipo === "sinal" ? <Tag tone="amber">perda de sinal</Tag> : null}<Tag tone={evento.natureza === "condicao" ? (evento.encerradoEm ? "neutral" : "amber") : "blue"}>{evento.natureza === "condicao" ? (evento.encerradoEm ? `encerrada ${formatTime(evento.encerradoEm)}` : "em curso") : "marco"}</Tag></div><div className="event-meta">Perfil {evento.perfilAtivo}{evento.pontoDeControle ? ` · ${nomePonto(evento.pontoDeControle, pontos)}` : ""}{evento.canalContingencia && evento.canalContingencia !== "sem_sinal" ? ` · via ${canalLabel[evento.canalContingencia]}` : ""}</div>{evento.ultimaPosicao ? <div className="event-lastpos"><MapPin size={11} /> Última posição: {evento.ultimaPosicao}</div> : null}</div>
        <div className="event-side"><Tag tone={evento.severidade === "alta" ? "red" : evento.severidade === "media" ? "amber" : "teal"}>{evento.severidade}</Tag></div>
      </article>; })}{visibleEvents.length === 0 ? <div className="events-empty"><Activity size={22} /><strong>Nenhum evento encontrado</strong><span>Ajuste o período ou remova alguns filtros.</span></div> : null}</div>
    </section>
  </>;
}
