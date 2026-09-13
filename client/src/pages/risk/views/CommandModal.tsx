import { useState } from "react";
import { AlertTriangle, Check, Hand, Lock, Send, ShieldAlert, Trash2, Zap } from "lucide-react";
import { Callout, Modal, Tag, useStoredState } from "../shared";
import { STORAGE, comandoAplicavel, comandos, equipamentoDe, historicoComandosInicial, newId, textosComandoIniciais, type Comando, type HistoricoComando } from "../domain";

export function useHistoricoComandos() { return useStoredState<HistoricoComando[]>(STORAGE.comandos, historicoComandosInicial); }

export function CommandModal({ veiculo, onClose, onToast, onSent }: { veiculo: string; onClose: () => void; onToast: (message: string) => void; onSent?: (h: HistoricoComando) => void }) {
  const equipamento = equipamentoDe(veiculo);
  const [modo, setModo] = useState<"delegado" | "direto">("delegado");
  const [comandoId, setComandoId] = useState<string>(comandos.find((c) => c.modo === "delegado")?.id ?? "");
  const [persistente, setPersistente] = useState(false);
  const [observacao, setObservacao] = useState("");
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [confirmacao, setConfirmacao] = useState("");
  const [textos, setTextos] = useStoredState<string[]>(STORAGE.textosComando, textosComandoIniciais);
  const [, setHistorico] = useHistoricoComandos();
  const lista = comandos.filter((c) => c.modo === modo);
  const comando = comandos.find((c) => c.id === comandoId) ?? lista[0];
  const aplic = comando ? comandoAplicavel(comando, equipamento) : { ok: false };
  const podeEnviar = Boolean(comando) && aplic.ok && observacao.trim().length >= 8;

  const escolherModo = (m: "delegado" | "direto") => { setModo(m); setComandoId(comandos.find((c) => c.modo === m)?.id ?? ""); setPersistente(false); setEtapa(1); };
  const enviar = () => {
    if (!comando) return;
    const registro: HistoricoComando = { id: newId("HC"), comando: comando.nome, veiculo, modo: comando.modo, persistente, observacao: observacao.trim(), enviadoEm: new Date().toISOString(), enviadoPor: "Larissa Martins", status: "enviado" };
    setHistorico((c) => [registro, ...c]);
    onSent?.(registro);
    onToast(comando.modo === "delegado" ? `Botão habilitado em ${veiculo} (${persistente ? "persistente" : "modo único"}). O motorista precisa acionar no veículo.` : `Comando “${comando.nome}” enviado a ${veiculo}.`);
    onClose();
  };
  const removerTexto = (texto: string) => { setTextos((c) => c.filter((t) => t !== texto)); onToast("Texto-modelo removido da lista. Observações já registradas no histórico permanecem."); };

  return <Modal title="Comandos ao veículo" description={`${veiculo} · ${equipamento.equipamento} · ${equipamento.linha} · firmware ${equipamento.firmware}`} onClose={onClose} wide>
    <div className="option-cards" style={{ marginBottom: 14 }}>
      <button className={`option-card ${modo === "delegado" ? "active" : ""}`} onClick={() => escolherModo("delegado")}><Hand size={15} /><strong>Delegar ao motorista</strong><small>A central <b>habilita um botão</b>. Quem aciona é o motorista, no veículo. Autorizar ≠ atuar.</small></button>
      <button className={`option-card ${modo === "direto" ? "active" : ""}`} onClick={() => escolherModo("direto")}><Zap size={15} /><strong>Comandar direto</strong><small>A central atua no equipamento imediatamente. Restrito a atuadores sem risco de segurança física.</small></button>
    </div>
    {etapa === 1 ? <>
      <div className="detail-label">Comando</div>
      <div className="cmd-list">{lista.map((c: Comando) => { const a = comandoAplicavel(c, equipamento); const on = comando?.id === c.id; return <button key={c.id} className={`cmd-item ${on ? "on" : ""} ${a.ok ? "" : "unavailable"}`} disabled={!a.ok} onClick={() => setComandoId(c.id)} title={a.ok ? undefined : a.motivo}><span className="cmd-check">{on && a.ok ? <Check size={11} /> : null}</span><span><strong>{c.nome}</strong><small>{c.descricao}</small></span>{a.ok ? <Tag tone={c.modo === "delegado" ? "blue" : "amber"}>{c.modo === "delegado" ? "habilita botão" : "atua"}</Tag> : <Tag tone="neutral"><Lock size={10} /> indisponível · {a.motivo}</Tag>}</button>; })}</div>
      {modo === "delegado" ? <div className="detail-label" style={{ marginTop: 14 }}>Modo do botão</div> : null}
      {modo === "delegado" ? <div className="segmented" style={{ marginBottom: 4 }}><button className={!persistente ? "active" : ""} onClick={() => setPersistente(false)}>Único · vale para um acionamento</button><button className={persistente ? "active" : ""} onClick={() => setPersistente(true)}>Persistente · fica habilitado</button></div> : null}
      {persistente ? <Callout tone="warn" icon={AlertTriangle} title="Modo persistente exige confirmação explícita">O botão continua habilitado até ser revogado pela central. Na próxima etapa você confirma digitando a placa.</Callout> : null}
      <div className="form-field" style={{ marginTop: 14 }}><label>Observação obrigatória</label><textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Motivo do comando (mín. 8 caracteres). Fica no histórico." />{observacao.trim().length > 0 && observacao.trim().length < 8 ? <div className="form-hint" style={{ color: "#d1635c" }}>Descreva o motivo com pelo menos 8 caracteres.</div> : <div className="form-hint">Textos-modelo abaixo. Remover um modelo não apaga observações já usadas no histórico.</div>}</div>
      <div className="chip-row">{textos.map((t) => <span key={t} className="chip chip-removable"><button onClick={() => setObservacao(t)}>{t}</button><button aria-label="Remover modelo" onClick={() => removerTexto(t)}><Trash2 size={10} /></button></span>)}</div>
      <div className="modal-actions"><button className="secondary-btn" onClick={onClose}>Cancelar</button>{persistente ? <button className="primary-btn" disabled={!podeEnviar} onClick={() => setEtapa(2)}><ShieldAlert size={13} /> Continuar para confirmação</button> : <button className="primary-btn" disabled={!podeEnviar} onClick={enviar}><Send size={13} /> {modo === "delegado" ? "Habilitar botão" : "Enviar comando"}</button>}</div>
    </> : <>
      <Callout tone="danger" icon={ShieldAlert} title="Confirmar habilitação persistente">Você vai deixar <b>{comando?.nome}</b> habilitado em <b>{veiculo}</b> até revogação manual. Observação: “{observacao.trim()}”.</Callout>
      <div className="form-field" style={{ marginTop: 14 }}><label>Digite a placa {veiculo} para confirmar</label><input value={confirmacao} onChange={(e) => setConfirmacao(e.target.value.toUpperCase())} placeholder={veiculo} /></div>
      <div className="modal-actions"><button className="secondary-btn" onClick={() => setEtapa(1)}>Voltar</button><button className="primary-btn danger-btn" disabled={confirmacao !== veiculo} onClick={enviar}><Check size={13} /> Confirmar e habilitar</button></div>
    </>}
  </Modal>;
}
