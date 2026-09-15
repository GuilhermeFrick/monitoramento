import { useMemo, useState } from "react";
import { AlertTriangle, Archive, CheckCircle2, Clock3, Download, Film, Grid2X2, List, PlayCircle, Plus, RefreshCw, Search, Star, Video } from "lucide-react";
import { Modal, PageHeader, Tag } from "../shared";
import type { ConfiguracaoVeiculo } from "../domain";

type EvidenceStatus = "Disponível" | "Solicitado" | "Falhou" | "Expirado";
type EvidenceTab = "solicitacoes" | "disponiveis" | "acervo" | "favoritos";

type EvidenceRecord = {
  id: string;
  vehicle: string;
  fleet: string;
  driver: string;
  origin: "Alerta" | "Playback";
  event: string;
  camera: string;
  requestedAt: string;
  duration: number;
  status: EvidenceStatus;
  expiresIn?: number;
  favorite: boolean;
  archived: boolean;
};

const initialEvidence: EvidenceRecord[] = [
  { id: "EV-584626", vehicle: "VTR-1783", fleet: "Centro · Longa distância", driver: "Ana Paula Costa", origin: "Playback", event: "Contexto de velocidade", camera: "Frontal", requestedAt: "15/09/2026 14:41", duration: 20, status: "Disponível", expiresIn: 30, favorite: false, archived: false },
  { id: "EV-584625", vehicle: "VTR-2048", fleet: "Sul · Distribuição", driver: "Carlos Mendes", origin: "Alerta", event: "Fadiga detectada", camera: "Cabine", requestedAt: "15/09/2026 14:32", duration: 15, status: "Disponível", expiresIn: 29, favorite: true, archived: true },
  { id: "EV-584624", vehicle: "VTR-0931", fleet: "Sudeste · Última milha", driver: "Rafael Nunes", origin: "Alerta", event: "Celular em uso", camera: "Cabine", requestedAt: "15/09/2026 14:18", duration: 15, status: "Disponível", expiresIn: 29, favorite: false, archived: true },
  { id: "EV-584623", vehicle: "VTR-1783", fleet: "Centro · Longa distância", driver: "Ana Paula Costa", origin: "Playback", event: "Verificação de trajeto", camera: "Frontal", requestedAt: "15/09/2026 13:57", duration: 20, status: "Solicitado", favorite: false, archived: false },
  { id: "EV-584622", vehicle: "VTR-3110", fleet: "Sudeste · Operação", driver: "Marcos Silva", origin: "Alerta", event: "Entrada em cerca restrita", camera: "Frontal", requestedAt: "15/09/2026 12:46", duration: 10, status: "Disponível", expiresIn: 21, favorite: true, archived: true },
  { id: "EV-584621", vehicle: "VTR-2240", fleet: "Sul · Distribuição", driver: "Não identificado", origin: "Playback", event: "Verificação operacional", camera: "Frontal", requestedAt: "15/09/2026 11:09", duration: 10, status: "Falhou", favorite: false, archived: false },
  { id: "EV-584620", vehicle: "VTR-2048", fleet: "Sul · Distribuição", driver: "Carlos Mendes", origin: "Playback", event: "Parada não programada", camera: "Lateral", requestedAt: "14/09/2026 17:22", duration: 30, status: "Expirado", favorite: false, archived: true },
];

const tabDescription: Record<EvidenceTab, string> = {
  solicitacoes: "Pedidos aguardando processamento ou que precisam ser reenviados.",
  disponiveis: "Vídeos recebidos e prontos para revisão antes de guardar.",
  acervo: "Evidências já preservadas e armazenadas na plataforma.",
  favoritos: "Atalho para as evidências marcadas pelo operador.",
};

const statusTone = (status: EvidenceStatus) => status === "Disponível" ? "teal" : status === "Solicitado" ? "blue" : status === "Falhou" ? "red" : "neutral";

export function EvidenceView({ configs, search: globalSearch, onToast }: { configs: ConfiguracaoVeiculo[]; search: string; onToast: (message: string) => void }) {
  const [records, setRecords] = useState(initialEvidence);
  const [tab, setTab] = useState<EvidenceTab>("acervo");
  const [query, setQuery] = useState("");
  const [fleet, setFleet] = useState("todas");
  const [status, setStatus] = useState<"todos" | EvidenceStatus>("todos");
  const [origin, setOrigin] = useState<"todas" | EvidenceRecord["origin"]>("todas");
  const [requestOpen, setRequestOpen] = useState(false);
  const [playing, setPlaying] = useState<EvidenceRecord | null>(null);
  const [view, setView] = useState<"lista" | "grade">("lista");

  const vehicles = useMemo(() => Array.from(new Set([...configs.map((item) => item.veiculo), ...initialEvidence.map((item) => item.vehicle)])), [configs]);
  const fleets = useMemo(() => Array.from(new Set([...configs.map((item) => item.frota), ...records.map((item) => item.fleet)])).sort(), [configs, records]);
  const filtered = useMemo(() => records.filter((item) => {
    const terms = `${query} ${globalSearch}`.trim().toLocaleLowerCase("pt-BR");
    if (tab === "solicitacoes" && !["Solicitado", "Falhou"].includes(item.status)) return false;
    if (tab === "disponiveis" && (item.status !== "Disponível" || item.archived)) return false;
    if (tab === "acervo" && !item.archived) return false;
    if (tab === "favoritos" && !item.favorite) return false;
    if (fleet !== "todas" && item.fleet !== fleet) return false;
    if (status !== "todos" && item.status !== status) return false;
    if (origin !== "todas" && item.origin !== origin) return false;
    return !terms || `${item.id} ${item.vehicle} ${item.driver} ${item.event} ${item.camera}`.toLocaleLowerCase("pt-BR").includes(terms);
  }), [fleet, globalSearch, origin, query, records, status, tab]);

  const requests = records.filter((item) => item.status === "Solicitado" || item.status === "Falhou").length;
  const ready = records.filter((item) => item.status === "Disponível" && !item.archived).length;
  const archived = records.filter((item) => item.archived).length;
  const toggleFavorite = (id: string) => setRecords((current) => current.map((item) => item.id === id ? { ...item, favorite: !item.favorite } : item));
  const refreshRequest = (id: string) => {
    setRecords((current) => current.map((item) => item.id === id ? { ...item, status: "Disponível", expiresIn: 30, archived: false } : item));
    setTab("disponiveis");
    onToast("Playback recebido e disponível para revisão.");
  };
  const archiveEvidence = (id: string) => {
    setRecords((current) => current.map((item) => item.id === id ? { ...item, archived: true } : item));
    setPlaying(null);
    setTab("acervo");
    onToast("Evidência armazenada no acervo da plataforma.");
  };
  const createRequest = (request: Omit<EvidenceRecord, "id" | "fleet" | "driver" | "origin" | "requestedAt" | "status" | "favorite" | "archived">) => {
    const config = configs.find((item) => item.veiculo === request.vehicle);
    const next: EvidenceRecord = {
      ...request,
      id: `EV-${584626 + records.length}`,
      fleet: config?.frota ?? "Outros veículos",
      driver: initialEvidence.find((item) => item.vehicle === request.vehicle)?.driver ?? "Motorista não informado",
      origin: "Playback",
      requestedAt: new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
      status: "Solicitado",
      favorite: false,
      archived: false,
    };
    setRecords((current) => [next, ...current]);
    setRequestOpen(false);
    setTab("solicitacoes");
    onToast(`Playback solicitado para ${request.vehicle}.`);
  };

  return <div className="evidence-page">
    <PageHeader eyebrow="Acervo de vídeo" title="Evidências & vídeo" description="Solicite playbacks, revise o que foi recebido e consulte evidências armazenadas." action="Nova solicitação" actionIcon={Plus} onAction={() => setRequestOpen(true)} />
    <section className="evidence-overview" aria-label="Resumo da biblioteca">
      <div className="evidence-overview-copy"><span><Film size={14} /> Fluxo de evidências</span><strong>{ready} vídeo(s) aguardando armazenamento</strong><small>Revise o conteúdo recebido e guarde no acervo o que deve ser preservado.</small></div>
      <div className="evidence-overview-stats"><div><Clock3 size={15} /><span><strong>{requests}</strong> solicitações</span></div><div><CheckCircle2 size={15} /><span><strong>{ready}</strong> disponíveis</span></div><div><Archive size={15} /><span><strong>{archived}</strong> no acervo</span></div></div>
    </section>

    <section className="panel evidence-library">
      <header className="evidence-library-head">
        <div className="evidence-tabs" role="tablist" aria-label="Seções de evidências">
          <button className={tab === "solicitacoes" ? "active" : ""} onClick={() => setTab("solicitacoes")}>Solicitações <span>{requests}</span></button>
          <button className={tab === "disponiveis" ? "active" : ""} onClick={() => setTab("disponiveis")}>Disponíveis <span>{ready}</span></button>
          <button className={tab === "acervo" ? "active" : ""} onClick={() => setTab("acervo")}>Acervo <span>{archived}</span></button>
          <button className={tab === "favoritos" ? "active" : ""} onClick={() => setTab("favoritos")}>Favoritos <span>{records.filter((item) => item.favorite).length}</span></button>
        </div>
        <div className="evidence-view-switch"><button className={view === "lista" ? "active" : ""} title="Visualização em lista" onClick={() => setView("lista")}><List size={14} /></button><button className={view === "grade" ? "active" : ""} title="Visualização em grade" onClick={() => setView("grade")}><Grid2X2 size={13} /></button></div>
      </header>
      <div className="evidence-tab-context"><span>{tabDescription[tab]}</span></div>

      <div className="evidence-filters">
        <label className="evidence-search"><Search size={13} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar placa, motorista ou evento..." /></label>
        <select value={fleet} onChange={(event) => setFleet(event.target.value)}><option value="todas">Todas as frotas</option>{fleets.map((item) => <option key={item}>{item}</option>)}</select>
        <select value={origin} onChange={(event) => setOrigin(event.target.value as typeof origin)}><option value="todas">Todas as origens</option><option value="Alerta">Gerado por alerta</option><option value="Playback">Playback solicitado</option></select>
        <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="todos">Todos os status</option><option>Disponível</option><option>Solicitado</option><option>Falhou</option><option>Expirado</option></select>
        <span className="evidence-result-count">{filtered.length} resultado(s)</span>
      </div>

      {view === "lista" ? <div className="evidence-table-wrap"><table className="evidence-table"><thead><tr><th>IDENTIFICAÇÃO</th><th>VEÍCULO / FROTA</th><th>EVENTO</th><th>CÂMERA</th><th>SOLICITADO EM</th><th>DURAÇÃO</th><th>STATUS</th><th aria-label="Favorito" /><th /></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td><strong>{item.id}</strong><small>{item.origin}</small></td><td><strong>{item.vehicle}</strong><small>{item.driver} · {item.fleet}</small></td><td><strong>{item.event}</strong><small>{item.archived ? "Armazenada no acervo" : item.expiresIn ? `Disponível por mais ${item.expiresIn} dias` : "—"}</small></td><td>{item.camera}</td><td>{item.requestedAt}</td><td>{item.duration}s</td><td><Tag tone={statusTone(item.status)}>{item.status}</Tag></td><td><button className={`evidence-star ${item.favorite ? "active" : ""}`} aria-label={item.favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"} onClick={() => toggleFavorite(item.id)}><Star size={14} fill={item.favorite ? "currentColor" : "none"} /></button></td><td><div className="evidence-row-actions">{item.status === "Disponível" ? <><button className="evidence-watch" onClick={() => setPlaying(item)}><PlayCircle size={13} /> Assistir</button>{!item.archived ? <button className="evidence-watch secondary" onClick={() => archiveEvidence(item.id)}><Archive size={12} /> Guardar</button> : null}</> : item.status === "Solicitado" ? <button className="evidence-watch secondary" onClick={() => refreshRequest(item.id)}><RefreshCw size={12} /> Atualizar</button> : <button className="evidence-watch secondary" onClick={() => setRequestOpen(true)}>Solicitar novamente</button>}</div></td></tr>)}</tbody></table></div> : <div className="evidence-grid">{filtered.map((item) => <article className="evidence-tile" key={item.id}><div className="evidence-thumb"><Video size={24} /><span>{item.camera}</span>{item.status === "Disponível" ? <button onClick={() => setPlaying(item)} aria-label={`Reproduzir ${item.id}`}><PlayCircle size={24} /></button> : null}</div><div className="evidence-tile-body"><div><strong>{item.event}</strong><small>{item.vehicle} · {item.driver}</small></div><Tag tone={statusTone(item.status)}>{item.status}</Tag></div></article>)}</div>}
      {!filtered.length ? <div className="evidence-empty"><Video size={24} /><strong>Nenhuma evidência encontrada</strong><span>Ajuste os filtros ou crie uma nova solicitação de playback.</span></div> : null}
    </section>

    {requestOpen ? <EvidenceRequestModal vehicles={vehicles} onClose={() => setRequestOpen(false)} onConfirm={createRequest} /> : null}
    {playing ? <EvidencePlayer evidence={playing} onClose={() => setPlaying(null)} onToast={onToast} onArchive={() => archiveEvidence(playing.id)} /> : null}
  </div>;
}

function EvidenceRequestModal({ vehicles, onClose, onConfirm }: { vehicles: string[]; onClose: () => void; onConfirm: (request: Omit<EvidenceRecord, "id" | "fleet" | "driver" | "origin" | "requestedAt" | "status" | "favorite" | "archived">) => void }) {
  const [vehicle, setVehicle] = useState(vehicles[0] ?? "VTR-2048");
  const [duration, setDuration] = useState(10);
  const [camera, setCamera] = useState("Frontal");
  const [event, setEvent] = useState("Solicitação manual");
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("15:26:30");
  const unavailable = vehicle === "VTR-2240";
  return <Modal title="Solicitar playback" description="Recupere um intervalo gravado diretamente do MDVR." onClose={onClose} className="evidence-request-modal">
    <div className="playback-info"><Video size={16} /><span>O intervalo terá <strong>{Math.floor(duration / 2)} segundos antes</strong> e <strong>{Math.ceil(duration / 2)} segundos depois</strong> do horário informado.</span></div>
    <div className="playback-form">
      <label className="playback-field full"><span>Veículo *</span><select value={vehicle} onChange={(e) => setVehicle(e.target.value)}>{vehicles.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="playback-field"><span>Tempo de vídeo *</span><div className="playback-input-unit"><input type="number" min={5} max={60} value={duration} onChange={(e) => setDuration(Math.max(5, Math.min(60, Number(e.target.value) || 5)))} /><i>segundos</i></div></label>
      <label className="playback-field"><span>Câmera *</span><select value={camera} onChange={(e) => setCamera(e.target.value)}><option>Frontal</option><option>Cabine</option><option>Traseira</option><option>Lateral</option><option>Todas</option></select></label>
      <label className="playback-field"><span>Data *</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label className="playback-field"><span>Hora inicial *</span><input type="time" step="1" value={time} onChange={(e) => setTime(e.target.value)} /></label>
      <label className="playback-field full"><span>Motivo da solicitação</span><input value={event} onChange={(e) => setEvent(e.target.value)} /></label>
    </div>
    <div className={`playback-availability ${unavailable ? "unavailable" : ""}`}>{unavailable ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}<div><strong>{unavailable ? "Vídeo indisponível neste momento" : "MDVR online e franquia disponível"}</strong><span>{unavailable ? "O veículo está sem comunicação. Tente novamente quando a conexão for restabelecida." : `A solicitação consumirá ${duration}s da franquia de playback.`}</span></div>{!unavailable ? <b>{duration}s</b> : null}</div>
    <div className="modal-actions"><button className="secondary-btn" onClick={onClose}>Cancelar</button><button className="primary-btn" disabled={Boolean(unavailable) || !event.trim() || !date || !time} onClick={() => onConfirm({ vehicle, duration, camera, event: event.trim() })}><Download size={13} /> Solicitar vídeo</button></div>
  </Modal>;
}

function EvidencePlayer({ evidence, onClose, onToast, onArchive }: { evidence: EvidenceRecord; onClose: () => void; onToast: (message: string) => void; onArchive: () => void }) {
  return <Modal title={evidence.event} description={`${evidence.id} · ${evidence.vehicle} · ${evidence.camera}`} onClose={onClose} wide className="evidence-player-modal">
    <div className="evidence-player-stage"><span className="camera-horizon" /><span className="camera-lane one" /><span className="camera-lane two" /><button aria-label="Reproduzir ou pausar"><PlayCircle size={34} /></button><div className="evidence-player-stamp">CAM · {evidence.camera} · {evidence.requestedAt}</div></div>
    <div className="evidence-player-controls"><span>00:00</span><i><b style={{ width: "38%" }} /></i><span>00:{String(evidence.duration).padStart(2, "0")}</span></div>
    <div className="evidence-player-meta"><div><span>Veículo</span><strong>{evidence.vehicle}</strong></div><div><span>Motorista</span><strong>{evidence.driver}</strong></div><div><span>Origem</span><strong>{evidence.origin}</strong></div><div><span>Validade</span><strong>{evidence.expiresIn ?? 30} dias</strong></div></div>
    <div className="modal-actions"><button className="secondary-btn" onClick={onClose}>Fechar</button>{!evidence.archived ? <button className="soft-btn" onClick={onArchive}><Archive size={13} /> Guardar no acervo</button> : null}<button className="primary-btn" onClick={() => onToast(`Download de ${evidence.id} preparado.`)}><Download size={13} /> Baixar evidência</button></div>
  </Modal>;
}
