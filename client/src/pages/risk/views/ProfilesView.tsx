import { useState } from "react";
import { Check, Copy, Layers, MapPin, Satellite, ShieldCheck, Smartphone, Timer, Upload } from "lucide-react";
import { Callout, KpiCard, Modal, PageHeader, SectionTitle, Tag, Toggle, formatDateTime, useStoredState } from "../shared";
import { STORAGE, atuadorLabel, macros, newId, perfisIniciais, posturaLabel, sensorLabel, type Atuador, type PerfilOperacional, type PontoDeControle, type PosturaAtuador } from "../domain";

const posturas: PosturaAtuador[] = ["ligado", "desligado", "como_estava"];
const posturaTone: Record<PosturaAtuador, "teal" | "neutral" | "blue"> = { ligado: "teal", desligado: "neutral", como_estava: "blue" };

export function usePerfis() { return useStoredState<PerfilOperacional[]>(STORAGE.perfis, perfisIniciais); }

export function ProfilesView({ pontos, perfis, setPerfis, onToast }: { pontos: PontoDeControle[]; perfis: PerfilOperacional[]; setPerfis: (next: PerfilOperacional[] | ((c: PerfilOperacional[]) => PerfilOperacional[])) => void; onToast: (message: string) => void }) {
  const [selectedId, setSelectedId] = useState(perfis[0]?.id ?? "");
  const [tab, setTab] = useState<"postura" | "gatilhos" | "contingencia">("postura");
  const [showNew, setShowNew] = useState(false);
  const perfil = perfis.find((p) => p.id === selectedId) ?? perfis[0];
  const publicados = perfis.filter((p) => p.status === "publicado").length;

  const patch = (id: string, fn: (p: PerfilOperacional) => PerfilOperacional) => setPerfis((current) => current.map((p) => p.id === id ? fn(p) : p));
  const publicar = () => { patch(perfil.id, (p) => ({ ...p, status: "publicado", versao: p.versao + 1, atualizadoEm: new Date().toISOString() })); onToast(`${perfil.nome} publicado como v${perfil.versao + 1}. Disponível no catálogo de provisionamento.`); };
  const duplicar = () => { const copia: PerfilOperacional = { ...perfil, id: newId("PF"), nome: `${perfil.nome} (cópia)`, versao: 1, status: "rascunho", embarcadoEm: 0, atualizadoEm: new Date().toISOString() }; setPerfis((c) => [...c, copia]); setSelectedId(copia.id); onToast("Perfil duplicado como rascunho."); };
  const criar = (nome: string, base: string) => { const origem = perfis.find((p) => p.id === base) ?? perfil; const novo: PerfilOperacional = { ...origem, id: newId("PF"), nome, versao: 1, status: "rascunho", embarcadoEm: 0, atualizadoEm: new Date().toISOString(), gatilhos: { geocercas: [], macros: [] } }; setPerfis((c) => [...c, novo]); setSelectedId(novo.id); setShowNew(false); onToast(`Perfil “${nome}” criado como rascunho.`); };

  return <>
    <PageHeader eyebrow="Modo do veículo" title="Perfil operacional" description="Biblioteca versionada de perfis: postura dos atuadores, sensores armados, gatilhos de troca e canal de contingência." action="Novo perfil" onAction={() => setShowNew(true)} />
    <div className="kpi-grid"><KpiCard label="Perfis publicados" value={String(publicados).padStart(2, "0")} meta={`${perfis.length - publicados} em rascunho`} icon={Layers} /><KpiCard label="Equipamentos com perfil" value="184 / 192" meta="8 sem sinal aguardando embarque" icon={ShieldCheck} trend="up" /><KpiCard label="Trocas de perfil hoje" value="316" meta="212 por geocerca · 104 por macro" icon={MapPin} /><KpiCard label="Perfis em contingência" value="03" meta="Reportando por satélite" icon={Satellite} tone="amber" /></div>
    <div className="split-layout">
      <div className="panel" style={{ padding: 0 }}>
        <div className="toolbar"><div><div className="panel-title">Biblioteca de perfis</div><div className="panel-subtitle">Cada troca no veículo aponta para uma versão</div></div></div>
        <div className="list-select">{perfis.map((p) => <button key={p.id} className={`list-select-item ${p.id === perfil.id ? "active" : ""}`} onClick={() => { setSelectedId(p.id); setTab("postura"); }}><span className="list-select-main"><strong>{p.nome}</strong><small>{p.id} · v{p.versao} · {p.embarcadoEm} equipamentos</small></span><Tag tone={p.status === "publicado" ? "teal" : "amber"}>{p.status === "publicado" ? "Publicado" : "Rascunho"}</Tag></button>)}</div>
      </div>
      <div className="panel">
        <SectionTitle title={perfil.nome} subtitle={`${perfil.id} · versão ${perfil.versao} · atualizado ${formatDateTime(perfil.atualizadoEm)}`}>
          <div style={{ display: "flex", gap: 7 }}><button className="secondary-btn" onClick={duplicar}><Copy size={13} /> Duplicar</button>{perfil.status === "rascunho" ? <button className="primary-btn" onClick={publicar}><Upload size={13} /> Publicar v{perfil.versao + 1}</button> : <button className="soft-btn" onClick={() => { patch(perfil.id, (p) => ({ ...p, status: "rascunho" })); onToast("Nova revisão aberta como rascunho. A versão publicada continua válida nos equipamentos."); }}>Revisar</button>}</div>
        </SectionTitle>
        <p className="detail-text" style={{ marginBottom: 14 }}>{perfil.descricao}</p>
        <div className="segmented" style={{ marginBottom: 16 }}><button className={tab === "postura" ? "active" : ""} onClick={() => setTab("postura")}>Atuadores e sensores</button><button className={tab === "gatilhos" ? "active" : ""} onClick={() => setTab("gatilhos")}>Gatilhos de troca</button><button className={tab === "contingencia" ? "active" : ""} onClick={() => setTab("contingencia")}>Contingência</button></div>

        {tab === "postura" ? <>
          <div className="detail-label">Postura de cada atuador ao entrar no perfil</div>
          <div className="matrix">{(Object.keys(atuadorLabel) as Atuador[]).map((atuador) => <div className="matrix-row" key={atuador}><span>{atuadorLabel[atuador]}</span><div className="segmented">{posturas.map((postura) => <button key={postura} className={perfil.atuadores[atuador] === postura ? "active" : ""} onClick={() => patch(perfil.id, (p) => ({ ...p, atuadores: { ...p.atuadores, [atuador]: postura } }))}>{posturaLabel[postura]}</button>)}</div></div>)}</div>
          <div className="detail-label" style={{ marginTop: 18 }}>Acionamento de atuador por violação</div>
          <div className="option-cards">
            <button className={`option-card ${perfil.acionamento.modo === "temporario" ? "active" : ""}`} onClick={() => patch(perfil.id, (p) => ({ ...p, acionamento: { modo: "temporario", duracaoMin: p.acionamento.duracaoMin || 30 } }))}><Timer size={15} /><strong>Temporário</strong><small>Encerra sozinho após a duração configurada.</small>{perfil.acionamento.modo === "temporario" ? <label className="inline-field">Duração <input type="number" value={perfil.acionamento.duracaoMin} onChange={(e) => patch(perfil.id, (p) => ({ ...p, acionamento: { ...p.acionamento, duracaoMin: Number(e.target.value) } }))} /> min</label> : null}</button>
            <button className={`option-card ${perfil.acionamento.modo === "permanente" ? "active" : ""}`} onClick={() => patch(perfil.id, (p) => ({ ...p, acionamento: { modo: "permanente", duracaoMin: 0 } }))}><ShieldCheck size={15} /><strong>Permanente</strong><small>Só encerra quando as duas condições ocorrem juntas:</small><ul className="cond-list"><li><Check size={11} /> a violação cessou no sensor</li><li><Check size={11} /> a central comandou o encerramento</li></ul></button>
          </div>
          <div className="detail-label" style={{ marginTop: 18 }}>Sensores armados e o que conta como violação</div>
          <div className="table-wrap"><table><thead><tr><th>SENSOR</th><th>ARMADO</th><th>VIOLAÇÃO</th></tr></thead><tbody>{perfil.sensores.map((s) => <tr key={s.sensor}><td>{sensorLabel[s.sensor]}</td><td><Toggle checked={s.armado} onChange={(next) => patch(perfil.id, (p) => ({ ...p, sensores: p.sensores.map((x) => x.sensor === s.sensor ? { ...x, armado: next } : x) }))} /></td><td style={{ color: s.armado ? undefined : "#a3adb8" }}>{s.armado ? s.violacao : "Sensor desarmado neste perfil"}</td></tr>)}</tbody></table></div>
        </> : null}

        {tab === "gatilhos" ? <>
          <Callout tone="info" icon={Layers} title="Dois gatilhos, um mesmo perfil">O veículo entra neste perfil quando cruza uma das geocercas abaixo <em>ou</em> quando o motorista registra uma das macros. Ambos são embarcados juntos.</Callout>
          <div className="grid-1-1" style={{ marginTop: 14 }}>
            <div><div className="detail-label"><MapPin size={11} /> Por geocerca de ponto de controle</div><div className="check-list">{pontos.map((ponto) => { const on = perfil.gatilhos.geocercas.includes(ponto.id); return <label key={ponto.id} className={`check-item ${on ? "on" : ""}`}><input type="checkbox" checked={on} onChange={() => patch(perfil.id, (p) => ({ ...p, gatilhos: { ...p.gatilhos, geocercas: on ? p.gatilhos.geocercas.filter((g) => g !== ponto.id) : [...p.gatilhos.geocercas, ponto.id] } }))} /><span><strong>{ponto.nome}</strong><small>{ponto.id} · raio {ponto.raioM} m{ponto.politica.perfil !== perfil.id ? ` · política aponta para ${ponto.politica.perfil}` : ""}</small></span></label>; })}</div></div>
            <div><div className="detail-label"><Smartphone size={11} /> Por macro do motorista</div><div className="check-list">{macros.map((macro) => { const on = perfil.gatilhos.macros.includes(macro.id); return <label key={macro.id} className={`check-item ${on ? "on" : ""}`}><input type="checkbox" checked={on} onChange={() => patch(perfil.id, (p) => ({ ...p, gatilhos: { ...p.gatilhos, macros: on ? p.gatilhos.macros.filter((m) => m !== macro.id) : [...p.gatilhos.macros, macro.id] } }))} /><span><strong>{macro.nome}</strong><small>{macro.descricao}</small></span></label>; })}</div></div>
          </div>
        </> : null}

        {tab === "contingencia" ? <>
          <Callout tone="warn" icon={Satellite} title="Canal de contingência (avançado)">Quando a cobertura celular falha, o equipamento usa satélite ou LoRaWAN. Aqui você define quais eventos justificam usar esse canal neste perfil e com que frequência reportar.</Callout>
          <div className="detail-label" style={{ marginTop: 14 }}>Eventos que justificam contingência</div>
          <div className="chip-row">{["Violação de painel", "Desengate", "Movimento sem ignição", "Qualquer violação de sensor", "Perda de sinal > 2 min", "Perda de sinal > 5 min", "Senha de coação"].map((evento) => { const on = perfil.contingencia.eventos.includes(evento); return <button key={evento} className={`chip ${on ? "on" : ""}`} onClick={() => patch(perfil.id, (p) => ({ ...p, contingencia: { ...p.contingencia, eventos: on ? p.contingencia.eventos.filter((e) => e !== evento) : [...p.contingencia.eventos, evento] } }))}>{on ? <Check size={11} /> : null}{evento}</button>; })}</div>
          <div className="form-field" style={{ marginTop: 16, maxWidth: 320 }}><label>Frequência de reporte em contingência</label><select value={perfil.contingencia.frequenciaReporteSeg} onChange={(e) => patch(perfil.id, (p) => ({ ...p, contingencia: { ...p.contingencia, frequenciaReporteSeg: Number(e.target.value) } }))}><option value={30}>A cada 30 s (alto consumo)</option><option value={60}>A cada 1 min</option><option value={120}>A cada 2 min</option><option value={300}>A cada 5 min</option><option value={900}>A cada 15 min (economia)</option></select><div className="form-hint">Reporte por satélite tem custo por mensagem: perfis parados podem usar intervalos maiores.</div></div>
        </> : null}
      </div>
    </div>
    {showNew ? <NewProfileModal perfis={perfis} onClose={() => setShowNew(false)} onCreate={criar} /> : null}
  </>;
}

function NewProfileModal({ perfis, onClose, onCreate }: { perfis: PerfilOperacional[]; onClose: () => void; onCreate: (nome: string, base: string) => void }) {
  const [nome, setNome] = useState("Descarga noturna");
  const [base, setBase] = useState(perfis[0]?.id ?? "");
  return <Modal title="Novo perfil operacional" description="Crie a partir de um perfil existente; os gatilhos de troca começam vazios." onClose={onClose}>
    <div className="form-field"><label>Nome do perfil</label><input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
    <div className="form-field"><label>Copiar postura de</label><select value={base} onChange={(e) => setBase(e.target.value)}>{perfis.map((p) => <option key={p.id} value={p.id}>{p.nome} · v{p.versao}</option>)}</select></div>
    <div className="modal-actions"><button className="secondary-btn" onClick={onClose}>Cancelar</button><button className="primary-btn" disabled={!nome.trim()} onClick={() => onCreate(nome.trim(), base)}><Check size={13} /> Criar rascunho</button></div>
  </Modal>;
}
