import { useState } from "react";
import { Check, Eye, EyeOff, KeyRound, ShieldAlert, Trash2, UserX } from "lucide-react";
import { Callout, KpiCard, Modal, PageHeader, Tag, formatDateTime, useStoredState } from "../shared";
import { STORAGE, credenciaisIniciais, equipamentos, newId, type Credencial } from "../domain";

const statusLabel: Record<Credencial["status"], { label: string; tone: "teal" | "amber" | "neutral" }> = { ativa: { label: "Ativa", tone: "teal" }, pendente_embarque: { label: "Pendente de embarque", tone: "amber" }, revogada: { label: "Revogada", tone: "neutral" } };

export function SecurityView({ onToast }: { onToast: (message: string) => void }) {
  const [credenciais, setCredenciais] = useStoredState<Credencial[]>(STORAGE.credenciais, credenciaisIniciais);
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [showNew, setShowNew] = useState(false);
  const ativas = credenciais.filter((c) => c.status === "ativa");
  const semCoacao = credenciais.filter((c) => c.status !== "revogada" && !c.senhaCoacaoDefinida);
  const revogar = (ids: string[]) => { setCredenciais((c) => c.map((x) => ids.includes(x.id) ? { ...x, status: "revogada" } : x)); setSelecionadas([]); onToast(ids.length === 1 ? "Credencial revogada neste veículo. Outros veículos do motorista não são afetados." : `${ids.length} credenciais revogadas em lote.`); };
  const toggle = (id: string) => setSelecionadas((c) => c.includes(id) ? c.filter((x) => x !== id) : [...c, id]);

  return <>
    <PageHeader eyebrow="Segurança física" title="Segurança operacional" description="Credenciais do motorista por veículo e gestão das duas senhas: operação e coação." action="Nova credencial" actionIcon={KeyRound} onAction={() => setShowNew(true)} />
    <div className="kpi-grid"><KpiCard label="Credenciais ativas" value={String(ativas.length).padStart(2, "0")} meta={`${credenciais.length} cadastradas`} icon={KeyRound} /><KpiCard label="Sem senha de coação" value={String(semCoacao.length).padStart(2, "0")} meta={semCoacao.length ? "Cobertura incompleta" : "Cobertura completa"} icon={ShieldAlert} tone={semCoacao.length ? "red" : "teal"} /><KpiCard label="Eventos de coação · 30 d" value="02" meta="Roteados só para gestão de risco" icon={UserX} tone="red" /><KpiCard label="Pendentes de embarque" value={String(credenciais.filter((c) => c.status === "pendente_embarque").length).padStart(2, "0")} meta="Aguardando aceite do equipamento" icon={Check} tone="amber" /></div>
    <div className="grid-2-1">
      <div className="panel" style={{ padding: 0 }}>
        <div className="toolbar"><div><div className="panel-title">Credenciais por veículo</div><div className="panel-subtitle">Um motorista pode ter credenciais em vários veículos; cada uma é removível separadamente</div></div>{selecionadas.length ? <button className="secondary-btn" onClick={() => revogar(selecionadas)}><Trash2 size={13} /> Revogar {selecionadas.length} em lote</button> : null}</div>
        <div className="table-wrap"><table><thead><tr><th /><th>MOTORISTA</th><th>VEÍCULO</th><th>SENHA OPERAÇÃO</th><th>SENHA COAÇÃO</th><th>STATUS</th><th /></tr></thead><tbody>{credenciais.map((c) => <tr key={c.id} style={{ opacity: c.status === "revogada" ? 0.55 : 1 }}><td><input type="checkbox" disabled={c.status === "revogada"} checked={selecionadas.includes(c.id)} onChange={() => toggle(c.id)} /></td><td><div className="vehicle-name">{c.motorista}</div><div className="vehicle-meta">{c.id} · criada {formatDateTime(c.criadaEm)}</div></td><td><div className="vehicle-name">{c.veiculo}</div><div className="vehicle-meta">{c.equipamento}</div></td><td>{c.senhaOperacaoDefinida ? <Tag tone="teal">definida</Tag> : <Tag tone="red">ausente</Tag>}</td><td>{c.senhaCoacaoDefinida ? <Tag tone="dark">definida</Tag> : <Tag tone="red">ausente</Tag>}</td><td><Tag tone={statusLabel[c.status].tone}>{statusLabel[c.status].label}</Tag></td><td>{c.status !== "revogada" ? <button className="action-more" title="Revogar neste veículo" onClick={() => revogar([c.id])}><Trash2 size={14} /></button> : null}</td></tr>)}</tbody></table></div>
      </div>
      <div className="panel">
        <div className="panel-title" style={{ marginBottom: 10 }}>Como funcionam as duas senhas</div>
        <div className="two-pass"><div className="pass-card"><KeyRound size={16} /><strong>Senha de operação</strong><small>Autoriza a operação no veículo. Uso normal do motorista.</small></div><div className="pass-card duress"><ShieldAlert size={16} /><strong>Senha de coação</strong><small>Autoriza a operação <b>exatamente como a normal</b> do ponto de vista de quem está no veículo. Nenhuma reação perceptível.</small><Tag tone="red">alerta silencioso</Tag></div></div>
        <Callout tone="warn" icon={ShieldAlert} title="Necessariamente diferentes">O cadastro recusa senhas iguais. Quem está sendo coagido não deve conseguir distinguir qual foi usada.</Callout>
        <Callout tone="info" icon={EyeOff} title="Roteamento do evento de coação">O evento aparece com badge próprio na lista de eventos da gestão de risco. A tela operacional comum, que o motorista pode ver, não o exibe.</Callout>
      </div>
    </div>
    {showNew ? <NewCredentialModal onClose={() => setShowNew(false)} onCreate={(c) => { setCredenciais((cur) => [c, ...cur]); setShowNew(false); onToast(`Credencial criada para ${c.motorista} em ${c.veiculo}. Emita um embarque para ativar.`); }} /> : null}
  </>;
}

function NewCredentialModal({ onClose, onCreate }: { onClose: () => void; onCreate: (c: Credencial) => void }) {
  const [motorista, setMotorista] = useState("Juliana Reis");
  const [veiculo, setVeiculo] = useState(equipamentos[0].veiculo);
  const [operacao, setOperacao] = useState("");
  const [coacao, setCoacao] = useState("");
  const [show, setShow] = useState(false);
  const iguais = operacao.length > 0 && operacao === coacao;
  const curta = (s: string) => s.length > 0 && s.length < 4;
  const valido = operacao.length >= 4 && coacao.length >= 4 && !iguais;
  return <Modal title="Nova credencial por veículo" description="A credencial vale só para o veículo escolhido. Para outros veículos, cadastre outra." onClose={onClose}>
    <div className="form-row"><div className="form-field"><label>Motorista</label><input value={motorista} onChange={(e) => setMotorista(e.target.value)} /></div><div className="form-field"><label>Veículo</label><select value={veiculo} onChange={(e) => setVeiculo(e.target.value)}>{equipamentos.map((e) => <option key={e.veiculo} value={e.veiculo}>{e.veiculo} · {e.equipamento}</option>)}</select></div></div>
    <div className="form-row"><div className="form-field"><label>Senha de operação</label><input type={show ? "text" : "password"} value={operacao} onChange={(e) => setOperacao(e.target.value)} placeholder="mín. 4 dígitos" />{curta(operacao) ? <div className="form-hint" style={{ color: "#d1635c" }}>Mínimo de 4 dígitos.</div> : null}</div><div className="form-field"><label>Senha de coação</label><input type={show ? "text" : "password"} value={coacao} onChange={(e) => setCoacao(e.target.value)} placeholder="diferente da operação" style={iguais ? { borderColor: "#d1635c" } : undefined} />{iguais ? <div className="form-hint" style={{ color: "#d1635c" }}>As senhas devem ser diferentes.</div> : curta(coacao) ? <div className="form-hint" style={{ color: "#d1635c" }}>Mínimo de 4 dígitos.</div> : null}</div></div>
    <button className="panel-link" onClick={() => setShow((s) => !s)}>{show ? <EyeOff size={12} /> : <Eye size={12} />} {show ? "Ocultar" : "Mostrar"} senhas</button>
    <div className="modal-actions"><button className="secondary-btn" onClick={onClose}>Cancelar</button><button className="primary-btn" disabled={!valido || !motorista.trim()} onClick={() => onCreate({ id: newId("CR"), motorista: motorista.trim(), veiculo, equipamento: equipamentos.find((e) => e.veiculo === veiculo)!.equipamento, criadaEm: new Date().toISOString(), senhaOperacaoDefinida: true, senhaCoacaoDefinida: true, status: "pendente_embarque" })}><Check size={13} /> Salvar credencial</button></div>
  </Modal>;
}
