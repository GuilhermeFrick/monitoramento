import { useState } from "react";
import { Check, CheckCheck, MessageSquare, Send } from "lucide-react";
import { Tag, formatTime, useStoredState } from "../shared";
import { STORAGE, equipamentos, mensagensIniciais, mensagensPredefinidas, newId, type Mensagem } from "../domain";

export function MessagingPanel({ onToast }: { onToast: (message: string) => void }) {
  const [mensagens, setMensagens] = useStoredState<Mensagem[]>(STORAGE.mensagens, mensagensIniciais);
  const [veiculo, setVeiculo] = useState(equipamentos[0].veiculo);
  const [texto, setTexto] = useState("");
  const conversa = mensagens.filter((m) => m.veiculo === veiculo).sort((a, b) => a.enviadaEm.localeCompare(b.enviadaEm));
  const naoLidas = (v: string) => mensagens.filter((m) => m.veiculo === v && m.direcao === "motorista" && !m.lidaEm).length;
  const enviar = (t: string, predefinida: boolean) => {
    if (!t.trim()) return;
    const nova: Mensagem = { id: newId("m"), veiculo, direcao: "central", texto: t.trim(), enviadaEm: new Date().toISOString(), lidaEm: null, predefinida };
    setMensagens((c) => [...c, nova]); setTexto("");
    onToast(`Mensagem enviada a ${veiculo}. Aguardando confirmação de leitura.`);
    window.setTimeout(() => setMensagens((c) => c.map((m) => m.id === nova.id ? { ...m, lidaEm: new Date().toISOString() } : m)), 2500);
  };
  const marcarLidas = (v: string) => setMensagens((c) => c.map((m) => m.veiculo === v && m.direcao === "motorista" && !m.lidaEm ? { ...m, lidaEm: new Date().toISOString() } : m));

  return <div className="split-layout msg-layout">
    <div className="panel" style={{ padding: 0 }}>
      <div className="toolbar"><div><div className="panel-title">Conversas por veículo</div><div className="panel-subtitle">Mensagens pré-formatadas e livres</div></div></div>
      <div className="list-select">{equipamentos.map((e) => <button key={e.veiculo} className={`list-select-item ${e.veiculo === veiculo ? "active" : ""}`} onClick={() => { setVeiculo(e.veiculo); marcarLidas(e.veiculo); }}><span className="list-select-main"><strong>{e.veiculo}</strong><small>{e.equipamento} · {e.canal === "sem_sinal" ? "sem sinal · entrega adiada" : "online"}</small></span>{naoLidas(e.veiculo) ? <Tag tone="red">{naoLidas(e.veiculo)} nova(s)</Tag> : null}</button>)}</div>
    </div>
    <div className="panel msg-panel">
      <div className="panel-header"><div><div className="panel-title"><MessageSquare size={13} /> {veiculo}</div><div className="panel-subtitle">Confirmação de leitura por mensagem</div></div></div>
      <div className="msg-thread">{conversa.length === 0 ? <div className="empty-note">Sem mensagens com este veículo.</div> : null}{conversa.map((m) => <div key={m.id} className={`msg ${m.direcao}`}><div className="msg-bubble">{m.texto}{m.predefinida ? <Tag>modelo</Tag> : null}</div><div className="msg-meta">{formatTime(m.enviadaEm)}{m.direcao === "central" ? (m.lidaEm ? <span className="read"><CheckCheck size={11} /> lida {formatTime(m.lidaEm)}</span> : <span><Check size={11} /> enviada</span>) : null}</div></div>)}</div>
      <div className="chip-row" style={{ marginTop: 10 }}>{mensagensPredefinidas.map((p) => <button key={p} className="chip" onClick={() => enviar(p, true)}>{p}</button>)}</div>
      <div style={{ display: "flex", gap: 7, marginTop: 10 }}><input className="form-input" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") enviar(texto, false); }} placeholder="Mensagem livre ao motorista" /><button className="primary-btn" disabled={!texto.trim()} onClick={() => enviar(texto, false)}><Send size={13} /></button></div>
    </div>
  </div>;
}
