import { useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, Download, FileSpreadsheet, FileText, Gauge, Moon, PauseCircle, Search, UserRound } from "lucide-react";
import { Modal, PageHeader, Tag } from "../shared";
import { WorkSchedulesView } from "./WorkSchedulesView";

type JourneyStatus = "regular" | "atencao" | "excedida";
type JourneyMode = "acompanhamento" | "espelho";

type JourneyDriver = {
  id: string;
  name: string;
  vehicle: string;
  fleet: string;
  status: JourneyStatus;
  state: string;
  since: string;
  drivingToday: string;
  shiftToday: string;
  remaining: string;
};

type JourneyDay = {
  date: string;
  start: string;
  driveStart: string;
  mealStart: string;
  mealEnd: string;
  end: string;
  regular: string;
  overtime: string;
  waiting: string;
  night: string;
  status: JourneyStatus;
};

const drivers: JourneyDriver[] = [
  { id: "MOT-0148", name: "Carlos Mendes", vehicle: "VTR-2048", fleet: "Sul · Distribuição", status: "atencao", state: "Em direção", since: "13:18", drivingToday: "07h42", shiftToday: "09h18", remaining: "01h18" },
  { id: "MOT-0082", name: "Ana Paula Costa", vehicle: "VTR-1783", fleet: "Centro · Longa distância", status: "excedida", state: "Em espera", since: "14:06", drivingToday: "08h51", shiftToday: "10h36", remaining: "00h00" },
  { id: "MOT-0211", name: "Rafael Nunes", vehicle: "VTR-0931", fleet: "Sudeste · Última milha", status: "regular", state: "Refeição", since: "13:52", drivingToday: "05h24", shiftToday: "07h02", remaining: "03h36" },
  { id: "MOT-0176", name: "Marcos Silva", vehicle: "VTR-3110", fleet: "Sudeste · Operação", status: "regular", state: "Em direção", since: "12:47", drivingToday: "06h11", shiftToday: "07h48", remaining: "02h49" },
  { id: "MOT-0254", name: "Juliana Reis", vehicle: "VTR-2240", fleet: "Sul · Distribuição", status: "regular", state: "Interjornada", since: "08:12", drivingToday: "00h00", shiftToday: "00h00", remaining: "09h32" },
];

const dayTemplate: JourneyDay[] = [
  { date: "15/09/2026", start: "06:42", driveStart: "07:04", mealStart: "12:03", mealEnd: "13:02", end: "—", regular: "07:42", overtime: "00:00", waiting: "01:36", night: "00:00", status: "atencao" },
  { date: "14/09/2026", start: "06:38", driveStart: "06:55", mealStart: "11:58", mealEnd: "13:01", end: "17:22", regular: "08:00", overtime: "01:07", waiting: "01:12", night: "00:00", status: "regular" },
  { date: "13/09/2026", start: "07:10", driveStart: "07:26", mealStart: "12:18", mealEnd: "13:19", end: "17:46", regular: "08:00", overtime: "00:36", waiting: "00:48", night: "00:00", status: "regular" },
  { date: "12/09/2026", start: "05:52", driveStart: "06:11", mealStart: "11:36", mealEnd: "12:39", end: "16:58", regular: "08:00", overtime: "01:03", waiting: "01:28", night: "00:08", status: "atencao" },
  { date: "11/09/2026", start: "06:47", driveStart: "07:02", mealStart: "12:06", mealEnd: "13:05", end: "17:13", regular: "08:00", overtime: "00:26", waiting: "00:54", night: "00:00", status: "regular" },
  { date: "10/09/2026", start: "04:58", driveStart: "05:20", mealStart: "11:12", mealEnd: "12:04", end: "16:44", regular: "08:00", overtime: "01:54", waiting: "01:43", night: "01:02", status: "excedida" },
  { date: "09/09/2026", start: "06:31", driveStart: "06:48", mealStart: "11:51", mealEnd: "12:54", end: "17:05", regular: "08:00", overtime: "00:17", waiting: "01:04", night: "00:00", status: "regular" },
  { date: "08/09/2026", start: "06:54", driveStart: "07:12", mealStart: "12:15", mealEnd: "13:14", end: "17:32", regular: "08:00", overtime: "00:20", waiting: "01:20", night: "00:00", status: "regular" },
];

const toneForStatus = (status: JourneyStatus) => status === "regular" ? "teal" : status === "atencao" ? "amber" : "red";
const labelForStatus = (status: JourneyStatus) => status === "regular" ? "Regular" : status === "atencao" ? "Atenção" : "Excedida";

export function JourneyView({ search: globalSearch, onToast }: { search: string; onToast: (message: string) => void }) {
  const [section, setSection] = useState<"journey" | "schedules">("journey");
  const [mode, setMode] = useState<JourneyMode>("acompanhamento");
  const [selectedId, setSelectedId] = useState(drivers[0].id);
  const [query, setQuery] = useState("");
  const [fleet, setFleet] = useState("todas");
  const [status, setStatus] = useState<"todos" | JourneyStatus>("todos");
  const [from, setFrom] = useState("2026-09-01");
  const [to, setTo] = useState("2026-09-15");
  const [exportOpen, setExportOpen] = useState(false);
  const selected = drivers.find((driver) => driver.id === selectedId) ?? drivers[0];
  const fleets = Array.from(new Set(drivers.map((driver) => driver.fleet)));
  const visibleDrivers = useMemo(() => drivers.filter((driver) => {
    const term = `${query} ${globalSearch}`.trim().toLocaleLowerCase("pt-BR");
    return (fleet === "todas" || driver.fleet === fleet)
      && (status === "todos" || driver.status === status)
      && (!term || `${driver.name} ${driver.vehicle} ${driver.fleet}`.toLocaleLowerCase("pt-BR").includes(term));
  }), [fleet, globalSearch, query, status]);
  const rows = useMemo(() => dayTemplate.map((day, index) => selected.id === drivers[0].id ? day : {
    ...day,
    start: index % 2 ? "07:04" : "06:18",
    driveStart: index % 2 ? "07:19" : "06:37",
    overtime: selected.status === "excedida" && index < 3 ? "02:14" : day.overtime,
    status: selected.status === "excedida" && index < 3 ? "excedida" as const : day.status,
  }), [selected.id, selected.status]);

  const exportCsv = () => {
    const header = ["Data", "Início jornada", "Início direção", "Início refeição", "Fim refeição", "Fim jornada", "Horas normais", "Horas extras", "Horas em espera", "Horas noturnas", "Status"];
    const csv = `\uFEFFMotorista;${selected.name}\nVeículo;${selected.vehicle}\nPeríodo;${from} a ${to}\n\n${[header, ...rows.map((row) => [row.date, row.start, row.driveStart, row.mealStart, row.mealEnd, row.end, row.regular, row.overtime, row.waiting, row.night, labelForStatus(row.status)])].map((row) => row.join(";")).join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `jornada-${selected.vehicle}-${from}-${to}.csv`; anchor.click(); URL.revokeObjectURL(url);
    setExportOpen(false); onToast(`Relatório de ${selected.name} exportado em CSV.`);
  };

  if (section === "schedules") return <WorkSchedulesView onToast={onToast} onBack={() => setSection("journey")} />;

  return <div className="journey-page">
    <PageHeader eyebrow="Controle de jornada" title="Jornada" description="Acompanhe direção, espera, refeição, descanso e o espelho individual de cada motorista." action="Exportar relatório" actionIcon={Download} onAction={() => setExportOpen(true)} />
    <section className="journey-summary" aria-label="Resumo das jornadas">
      <div><span className="journey-summary-icon"><Gauge size={15} /></span><span><small>Em direção</small><strong>12 motoristas</strong></span></div>
      <div><span className="journey-summary-icon warn"><AlertTriangle size={15} /></span><span><small>Próximos do limite</small><strong>03 motoristas</strong></span></div>
      <div><span className="journey-summary-icon danger"><Clock3 size={15} /></span><span><small>Jornada excedida</small><strong>01 motorista</strong></span></div>
      <div><span className="journey-summary-icon ok"><PauseCircle size={15} /></span><span><small>Em descanso</small><strong>08 motoristas</strong></span></div>
    </section>

    <section className="journey-filters">
      <label className="journey-search"><Search size={13} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar motorista ou veículo..." /></label>
      <select value={fleet} onChange={(event) => setFleet(event.target.value)}><option value="todas">Todas as frotas</option>{fleets.map((item) => <option key={item}>{item}</option>)}</select>
      <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="todos">Todos os status</option><option value="regular">Regular</option><option value="atencao">Atenção</option><option value="excedida">Excedida</option></select>
      <button className="secondary-btn journey-schedules-btn" onClick={() => setSection("schedules")}><CalendarDays size={12} /> Escalas</button>
      <div className="journey-period"><CalendarDays size={13} /><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /><i>até</i><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div>
    </section>

    <div className="journey-layout">
      <aside className="panel journey-drivers">
        <header><span>Motoristas</span><b>{visibleDrivers.length}</b></header>
        <div>{visibleDrivers.map((driver) => <button key={driver.id} className={selected.id === driver.id ? "active" : ""} onClick={() => setSelectedId(driver.id)}><span className={`journey-driver-state ${driver.status}`} /><span><strong>{driver.name}</strong><small>{driver.vehicle} · {driver.state}</small></span><Tag tone={toneForStatus(driver.status)}>{labelForStatus(driver.status)}</Tag></button>)}{!visibleDrivers.length ? <div className="journey-no-driver">Nenhum motorista encontrado.</div> : null}</div>
      </aside>

      <section className="panel journey-detail">
        <header className="journey-detail-head"><div><span className="journey-kicker">{selected.id} · {selected.vehicle}</span><strong>{selected.name}</strong><small>{selected.fleet}</small></div><div className="journey-mode"><button className={mode === "acompanhamento" ? "active" : ""} onClick={() => setMode("acompanhamento")}>Acompanhamento</button><button className={mode === "espelho" ? "active" : ""} onClick={() => setMode("espelho")}>Espelho mensal</button></div></header>
        {mode === "acompanhamento" ? <JourneyCurrent driver={selected} /> : <JourneyMirror driver={selected} rows={rows} />}
      </section>
    </div>
    {exportOpen ? <JourneyExportModal driver={selected} from={from} to={to} onClose={() => setExportOpen(false)} onCsv={exportCsv} onPdf={() => { setExportOpen(false); onToast(`Relatório A4 de ${selected.name} preparado para impressão.`); }} /> : null}
  </div>;
}

function JourneyCurrent({ driver }: { driver: JourneyDriver }) {
  const segments = [
    { type: "Direção", from: "06:42", to: "10:18", width: 31, className: "drive" },
    { type: "Espera", from: "10:18", to: "12:03", width: 15, className: "wait" },
    { type: "Refeição", from: "12:03", to: "13:02", width: 10, className: "meal" },
    { type: driver.state, from: "13:02", to: "agora", width: 34, className: driver.state === "Em espera" ? "wait" : "drive" },
  ];
  return <div className="journey-current">
    <div className="journey-current-status"><div className={`journey-state-mark ${driver.status}`}><Gauge size={18} /></div><div><span>Estado atual</span><strong>{driver.state}</strong><small>Desde {driver.since}</small></div><Tag tone={toneForStatus(driver.status)}>{labelForStatus(driver.status)}</Tag></div>
    <div className="journey-metrics"><div><span>Direção hoje</span><strong>{driver.drivingToday}</strong><small>limite 09h00</small></div><div><span>Jornada hoje</span><strong>{driver.shiftToday}</strong><small>desde o primeiro registro</small></div><div><span>Direção disponível</span><strong>{driver.remaining}</strong><small>antes do limite diário</small></div><div><span>Interjornada anterior</span><strong>11h24</strong><small>descanso concluído</small></div></div>
    <section className="journey-timeline"><header><div><strong>Linha do tempo de hoje</strong><small>Atividades registradas pelas macros do motorista</small></div><span>06:42 — agora</span></header><div className="journey-track">{segments.map((segment) => <div key={`${segment.type}-${segment.from}`} className={segment.className} style={{ flexGrow: segment.width }}><strong>{segment.type}</strong><span>{segment.from}–{segment.to}</span></div>)}</div><div className="journey-track-legend"><span><i className="drive" /> Direção</span><span><i className="wait" /> Espera</span><span><i className="meal" /> Refeição</span><span><i className="rest" /> Descanso</span></div></section>
    <section className="journey-compliance"><header><strong>Conformidade da jornada</strong><span>Atualizado agora</span></header><div><span><CheckCircle2 size={14} /> Refeição mínima cumprida</span><small>59 minutos registrados</small></div><div className={driver.status !== "regular" ? "warning" : ""}><span>{driver.status === "regular" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />} Limite de direção diária</span><small>{driver.remaining} restante(s)</small></div><div><span><Moon size={14} /> Descanso entre jornadas</span><small>11h24 concluídas</small></div></section>
  </div>;
}

function JourneyMirror({ driver, rows }: { driver: JourneyDriver; rows: JourneyDay[] }) {
  return <div className="journey-mirror"><div className="journey-report-head"><div><span>Relatório de jornada</span><strong>{driver.name}</strong><small>Setembro de 2026 · {driver.vehicle}</small></div><div><div><span>Horas normais</span><strong>61h42</strong></div><div><span>Horas extras</span><strong>05h43</strong></div><div><span>Horas em espera</span><strong>09h45</strong></div><div><span>Horas noturnas</span><strong>01h10</strong></div></div></div><div className="journey-table-wrap"><table className="journey-table"><thead><tr><th>DATA</th><th>INÍCIO JORNADA</th><th>INÍCIO DIREÇÃO</th><th>INÍCIO REFEIÇÃO</th><th>FIM REFEIÇÃO</th><th>FIM JORNADA</th><th>HORAS NORMAIS</th><th>HORAS EXTRAS</th><th>EM ESPERA</th><th>NOTURNAS</th><th>STATUS</th></tr></thead><tbody>{rows.map((row) => <tr key={row.date}><td><strong>{row.date}</strong></td><td><span className="journey-time start">{row.start}</span></td><td><span className="journey-time drive">{row.driveStart}</span></td><td><span className="journey-time meal">{row.mealStart}</span></td><td><span className="journey-time meal">{row.mealEnd}</span></td><td><span className="journey-time end">{row.end}</span></td><td><span className="journey-time regular">{row.regular}</span></td><td><span className="journey-time overtime">{row.overtime}</span></td><td><span className="journey-time wait">{row.waiting}</span></td><td><span className="journey-time night">{row.night}</span></td><td><Tag tone={toneForStatus(row.status)}>{labelForStatus(row.status)}</Tag></td></tr>)}</tbody></table></div></div>;
}

function JourneyExportModal({ driver, from, to, onClose, onCsv, onPdf }: { driver: JourneyDriver; from: string; to: string; onClose: () => void; onCsv: () => void; onPdf: () => void }) {
  return <Modal title="Exportar relatório de jornada" description="O arquivo é gerado individualmente por motorista para manter a assinatura e a conferência." onClose={onClose}>
    <div className="journey-export-context"><UserRound size={18} /><div><strong>{driver.name}</strong><span>{driver.vehicle} · {driver.fleet}</span><small>{new Date(`${from}T12:00:00`).toLocaleDateString("pt-BR")} até {new Date(`${to}T12:00:00`).toLocaleDateString("pt-BR")}</small></div></div>
    <div className="journey-export-options"><button onClick={onPdf}><FileText size={20} /><strong>PDF · Folha A4</strong><small>Espelho pronto para impressão e assinatura.</small></button><button onClick={onCsv}><FileSpreadsheet size={20} /><strong>Planilha CSV</strong><small>Dados detalhados para conferência e integração.</small></button></div>
    <div className="modal-actions"><button className="secondary-btn" onClick={onClose}>Cancelar</button></div>
  </Modal>;
}
