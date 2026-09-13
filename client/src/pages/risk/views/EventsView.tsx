import { useMemo, useState } from "react";
import { Activity, Check, Clock3, Flag, History, MapPin, MessageSquare, Pencil, Satellite, ShieldAlert, WifiOff, Terminal, Waypoints, X, Zap } from "lucide-react";
import { Callout, KpiCard, Modal, PageHeader, Tag, formatDateTime, formatTime, useStoredState, type IconType } from "../shared";
import { STORAGE, canalLabel, eventosIniciais, newId, nomePonto, type Comentario, type Evento, type PontoDeControle } from "../domain";

const tipoIcon: Record<Evento["tipo"], IconType> = { sensor: ShieldAlert, ponto: MapPin, rotograma: Clock3, rota: Waypoints, sinal: WifiOff, coacao: ShieldAlert, comando: Terminal, macro: Zap, comportamento: Activity };
const ATRASO_MIN = 2;
const atrasado = (e: Evento) => (new Date(e.receivedAt).getTime() - new Date(e.occurredAt).getTime()) / 60000 > ATRASO_MIN;

export function EventsView({ pontos, onToast, onCommand }: { pontos: PontoDeControle[]; onToast: (message: string) => void; onCommand: (veiculo: string) => void }) {
  const [eventos, setEventos] = useStoredState<Evento[]>(STORAGE.eventos, eventosIniciais);
  const [perfilGestao, setPerfilGestao] = useState(true);
  const [filtro, setFiltro] = useState<"todos" | "condicao" | "marco" | "atrasados">("todos");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const visiveis = useMemo(() => eventos.filter((e) => perfilGestao || e.tipo !== "coacao").filter((e) => filtro === "todos" || (filtro === "atrasados" ? atrasado(e) : e.natureza === filtro)).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), [eventos, filtro, perfilGestao]);
  const selected = eventos.find((e) => e.id === selectedId) ?? null;
  const abertas = eventos.filter((e) => e.natureza === "condicao" && !e.encerradoEm).length;

  const addComentario = (id: string, texto: string) => { setEventos((c) => c.map((e) => e.id === id ? { ...e, comentarios: [...e.comentarios, { id: newId("c"), texto, autor: "Larissa Martins", criadoEm: new Date().toISOString() }] } : e)); onToast("Comentário registrado."); };
  const editComentario = (id: string, cid: string, texto: string) => { setEventos((c) => c.map((e) => e.id === id ? { ...e, comentarios: e.comentarios.map((k) => k.id === cid ? { ...k, texto, editadoPor: "Larissa Martins", editadoEm: new Date().toISOString() } : k) } : e)); onToast("Comentário editado com registro de autoria e horário."); };

  return <>
    <PageHeader eyebrow="Timeline do fato" title="Eventos" description="Ordenados pelo instante em que ocorreram, não pela chegada. Condições têm início e fim; marcos acontecem num instante." />
    <div className="kpi-grid"><KpiCard label="Condições abertas" value={String(abertas).padStart(2, "0")} meta="Com início e sem fim" icon={Activity} tone="red" /><KpiCard label="Entregues com atraso" value={String(eventos.filter(atrasado).length).padStart(2, "0")} meta="Chegaram após reconexão" icon={History} tone="amber" /><KpiCard label="Perda de sinal" value={String(eventos.filter((e) => e.tipo === "sinal" && !e.encerradoEm).length).padStart(2, "0")} meta="Com última posição conhecida" icon={WifiOff} tone="amber" /><KpiCard label="Coação" value={perfilGestao ? String(eventos.filter((e) => e.tipo === "coacao").length).padStart(2, "0") : "—"} meta={perfilGestao ? "Visível só na gestão de risco" : "Oculto neste perfil"} icon={ShieldAlert} tone="red" /></div>
    <div className="panel" style={{ padding: 0 }}>
      <div className="toolbar"><div className="segmented"><button className={filtro === "todos" ? "active" : ""} onClick={() => setFiltro("todos")}>Todos</button><button className={filtro === "condicao" ? "active" : ""} onClick={() => setFiltro("condicao")}>Condições</button><button className={filtro === "marco" ? "active" : ""} onClick={() => setFiltro("marco")}>Marcos</button><button className={filtro === "atrasados" ? "active" : ""} onClick={() => setFiltro("atrasados")}>Entregues com atraso</button></div><div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ fontSize: 10, color: "#84909d" }}>{visiveis.length} eventos · por instante do fato</span><div className="segmented" title="Simula qual UI está aberta: coação só aparece na gestão de risco"><button className={perfilGestao ? "active" : ""} onClick={() => setPerfilGestao(true)}>UI gestão de risco</button><button className={!perfilGestao ? "active" : ""} onClick={() => setPerfilGestao(false)}>UI operacional</button></div></div></div>
      <div className="event-list">{visiveis.map((e) => { const Icon = tipoIcon[e.tipo]; const late = atrasado(e); return <button key={e.id} className={`event-card ${e.natureza} ${e.tipo === "coacao" ? "duress" : ""} ${e.tipo === "sinal" ? "signal" : ""}`} onClick={() => setSelectedId(e.id)}>
        <div className="event-time"><strong>{formatTime(e.occurredAt)}</strong><small>{new Date(e.occurredAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</small>{late ? <span className="late-badge" title={`Recebido ${formatDateTime(e.receivedAt)}`}><History size={10} /> atrasado</span> : <span className="rt-badge">tempo real</span>}</div>
        <div className={`event-shape ${e.natureza}`}>{e.natureza === "condicao" ? <span className={`cond-bar ${e.encerradoEm ? "closed" : "open"}`}><i /><i /></span> : <span className="marco-dot"><Flag size={9} /></span>}</div>
        <div className="event-body"><div className="event-title"><Icon size={13} /> {e.titulo}{e.tipo === "coacao" ? <Tag tone="red">coação · canal restrito</Tag> : null}{e.tipo === "sinal" ? <Tag tone="amber">perda de sinal</Tag> : null}<Tag tone={e.natureza === "condicao" ? (e.encerradoEm ? "neutral" : "amber") : "blue"}>{e.natureza === "condicao" ? (e.encerradoEm ? `condição · encerrada ${formatTime(e.encerradoEm)}` : "condição · em curso") : "marco"}</Tag></div><div className="event-meta">{e.veiculo} · {e.motorista} · perfil {e.perfilAtivo}{e.pontoDeControle ? ` · ${nomePonto(e.pontoDeControle, pontos)}` : ""}{e.canalContingencia && e.canalContingencia !== "sem_sinal" ? ` · via ${canalLabel[e.canalContingencia]}` : ""}</div>{e.ultimaPosicao ? <div className="event-lastpos"><MapPin size={11} /> Última posição conhecida: {e.ultimaPosicao}</div> : null}</div>
        <div className="event-side">{e.comentarios.length ? <span className="event-comments"><MessageSquare size={11} /> {e.comentarios.length}</span> : null}<Tag tone={e.severidade === "alta" ? "red" : e.severidade === "media" ? "amber" : "teal"}>{e.severidade}</Tag></div>
      </button>; })}{visiveis.length === 0 ? <div className="empty-note">Nenhum evento neste filtro.</div> : null}</div>
    </div>
    {selected ? <EventDetail evento={selected} pontos={pontos} onClose={() => setSelectedId(null)} onAdd={(t) => addComentario(selected.id, t)} onEdit={(cid, t) => editComentario(selected.id, cid, t)} onCommand={() => { setSelectedId(null); onCommand(selected.veiculo); }} /> : null}
  </>;
}

function EventDetail({ evento, pontos, onClose, onAdd, onEdit, onCommand }: { evento: Evento; pontos: PontoDeControle[]; onClose: () => void; onAdd: (t: string) => void; onEdit: (cid: string, t: string) => void; onCommand: () => void }) {
  const [texto, setTexto] = useState("");
  const [editing, setEditing] = useState<Comentario | null>(null);
  const late = atrasado(evento);
  return <Modal title={evento.titulo} description={`${evento.id} · ${evento.veiculo} · ${evento.motorista}`} onClose={onClose}>
    <div className="detail-grid" style={{ marginBottom: 12 }}><div><div className="detail-label">Ocorreu em</div><div className="detail-value">{formatDateTime(evento.occurredAt)}</div></div><div><div className="detail-label">Recebido em</div><div className="detail-value">{formatDateTime(evento.receivedAt)}{late ? <Tag tone="amber">atrasado</Tag> : null}</div></div><div><div className="detail-label">Natureza</div><div className="detail-value">{evento.natureza === "condicao" ? (evento.encerradoEm ? `Condição · encerrada ${formatTime(evento.encerradoEm)}` : "Condição · em curso") : "Marco"}</div></div><div><div className="detail-label">Perfil ativo</div><div className="detail-value">{evento.perfilAtivo}{evento.pontoDeControle ? ` · ${nomePonto(evento.pontoDeControle, pontos)}` : ""}</div></div></div>
    {evento.tipo === "coacao" ? <Callout tone="danger" icon={ShieldAlert} title="Evento de coação">Roteado exclusivamente para a gestão de risco. Não responda pelo canal de mensagens do veículo: o motorista pode estar acompanhado.</Callout> : null}
    {evento.tipo === "sinal" ? <Callout tone="warn" icon={Satellite} title="Perda de sinal é evento, não ausência de dados">Última posição conhecida: {evento.ultimaPosicao}. {evento.canalContingencia === "sem_sinal" ? "Sem canal de contingência configurado para este perfil." : ""}</Callout> : null}
    <div className="detail-section"><div className="detail-label">Detalhe</div><div className="detail-text">{evento.detalhe}</div></div>
    <div className="detail-section"><div className="detail-label">Comentários e auditoria</div>{evento.comentarios.length === 0 ? <div className="form-hint">Sem comentários.</div> : null}{evento.comentarios.map((c) => <div key={c.id} className="comment"><div className="comment-text">{c.texto}</div><div className="comment-meta">{c.autor} · {formatDateTime(c.criadoEm)}{c.editadoPor ? <span className="edited"> · editado por {c.editadoPor} em {formatDateTime(c.editadoEm!)}</span> : null}<button className="panel-link" onClick={() => setEditing(c)}><Pencil size={10} /> editar</button></div></div>)}
      <div style={{ display: "flex", gap: 7, marginTop: 8 }}><input className="form-input" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Novo comentário" /><button className="soft-btn" disabled={!texto.trim()} onClick={() => { onAdd(texto.trim()); setTexto(""); }}><Check size={12} /></button></div>
    </div>
    <div className="modal-actions"><button className="secondary-btn" onClick={onClose}>Fechar</button>{evento.tipo !== "coacao" ? <button className="primary-btn" onClick={onCommand}><Terminal size={13} /> Comandos ao veículo</button> : null}</div>
    {editing ? <EditCommentModal comentario={editing} onClose={() => setEditing(null)} onConfirm={(t) => { onEdit(editing.id, t); setEditing(null); }} /> : null}
  </Modal>;
}

function EditCommentModal({ comentario, onClose, onConfirm }: { comentario: Comentario; onClose: () => void; onConfirm: (t: string) => void }) {
  const [texto, setTexto] = useState(comentario.texto);
  const [senha, setSenha] = useState("");
  return <div className="modal-backdrop nested" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()}><div className="modal-head"><div><div className="modal-title">Editar comentário histórico</div><div className="modal-desc">Exige autorização. O registro original de {comentario.autor} não é sobrescrito silenciosamente: fica quem editou e quando.</div></div><button className="close-btn" onClick={onClose}><X size={15} /></button></div>
    <div className="form-field"><label>Texto</label><textarea value={texto} onChange={(e) => setTexto(e.target.value)} /></div>
    <div className="form-field"><label>Senha do operador para autorizar</label><input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••" /><div className="form-hint">Demonstrativo: qualquer senha com 4+ caracteres autoriza.</div></div>
    <div className="modal-actions"><button className="secondary-btn" onClick={onClose}>Cancelar</button><button className="primary-btn" disabled={senha.length < 4 || !texto.trim() || texto.trim() === comentario.texto} onClick={() => onConfirm(texto.trim())}><Check size={13} /> Autorizar edição</button></div></div></div>;
}
