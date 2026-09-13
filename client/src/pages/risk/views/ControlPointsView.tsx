import { useState } from "react";
import { AlertTriangle, Check, Layers, Lock, MapPin, Milestone, Pin, Timer } from "lucide-react";
import { Callout, KpiCard, Modal, PageHeader, SectionTitle, Tag, Toggle, useStoredState } from "../shared";
import { STORAGE, categoriaPontoLabel, newId, nivelDesvioLabel, nivelDesvioTone, nomePonto, nomeMacro, catalogoMacros, equipamentoDe, pontosIniciais, rotogramasIniciais, type CategoriaPonto, type NivelDesvio, type PontoDeControle, type Rotograma, type Trecho } from "../domain";

const niveis: NivelDesvio[] = ["muito_adiantada", "adiantada", "no_prazo", "atrasada", "muito_atrasada"];

export function usePontos() { return useStoredState<PontoDeControle[]>(STORAGE.pontos, pontosIniciais); }

export function ControlPointsView({ pontos, setPontos, onToast }: { pontos: PontoDeControle[]; setPontos: (next: PontoDeControle[] | ((c: PontoDeControle[]) => PontoDeControle[])) => void; onToast: (message: string) => void }) {
  const [rotogramas, setRotogramas] = useStoredState<Rotograma[]>(STORAGE.rotogramas, rotogramasIniciais);
  const [tab, setTab] = useState<"pontos" | "rotograma" | "areas">("pontos");
  const [rgId, setRgId] = useState(rotogramas[0]?.id ?? "");
  const [showNew, setShowNew] = useState(false);
  const rotograma = rotogramas.find((r) => r.id === rgId) ?? rotogramas[0];
  const semPrecedencia = pontos.filter((p) => p.sobrepoe.length > 0 && p.precedencia === null && p.sobrepoe.some((o) => pontos.find((x) => x.id === o)?.precedencia === null));

  const patchTrecho = (trechoId: string, fn: (t: Trecho) => Trecho) => setRotogramas((c) => c.map((r) => r.id === rotograma.id ? { ...r, trechos: r.trechos.map((t) => t.id === trechoId ? fn(t) : t) } : r));

  return <>
    <PageHeader eyebrow="Unidade de gestão geográfica" title="Pontos de controle e rotograma" description="Ponto de controle = área + categoria + política de permanência e perfil. Rotograma = sequência planejada de pontos com limites por trecho." action="Novo ponto de controle" onAction={() => setShowNew(true)} />
    <div className="kpi-grid"><KpiCard label="Pontos de controle" value={String(pontos.length).padStart(2, "0")} meta={`${pontos.filter((p) => p.fixo).length} fixos sobrevivem à limpeza`} icon={MapPin} /><KpiCard label="Sobreposições sem precedência" value={String(semPrecedencia.length).padStart(2, "0")} meta={semPrecedencia.length ? "Bloqueia emissão de embarque" : "Nenhum bloqueio"} icon={AlertTriangle} tone={semPrecedencia.length ? "red" : "teal"} /><KpiCard label="Jornadas ativas" value={String(rotogramas.length).padStart(2, "0")} meta={`${rotogramas.filter((r) => r.nivel === "no_prazo").length} no prazo`} icon={Milestone} /><KpiCard label="Fora do cronograma" value={String(rotogramas.filter((r) => r.nivel === "muito_atrasada" || r.nivel === "muito_adiantada").length).padStart(2, "0")} meta="Muito atrasada ou muito adiantada" icon={Timer} tone="amber" /></div>
    <div className="segmented" style={{ marginBottom: 16 }}><button className={tab === "pontos" ? "active" : ""} onClick={() => setTab("pontos")}>Pontos de controle</button><button className={tab === "rotograma" ? "active" : ""} onClick={() => setTab("rotograma")}>Rotograma</button><button className={tab === "areas" ? "active" : ""} onClick={() => setTab("areas")}>Áreas de controle (leitura)</button></div>

    {tab === "pontos" ? <div className="panel" style={{ padding: 0 }}>
      {semPrecedencia.length ? <div style={{ padding: "14px 16px 0" }}><Callout tone="danger" icon={AlertTriangle} title={`${semPrecedencia.length} ponto(s) sobrepostos sem precedência declarada`}>Declare qual ponto prevalece antes de emitir um embarque. O provisionamento recusa a emissão enquanto isso não for resolvido.</Callout></div> : null}
      <div className="table-wrap"><table><thead><tr><th>PONTO</th><th>CATEGORIA</th><th>POLÍTICA</th><th>MACRO AO ENTRAR</th><th>PRECEDÊNCIA</th><th>FIXO</th><th>ATIVO</th></tr></thead><tbody>{pontos.map((p) => { const conflito = p.sobrepoe.length > 0 && p.precedencia === null; return <tr key={p.id}><td><div className="vehicle-cell"><div className="vehicle-avatar"><MapPin size={14} /></div><div><div className="vehicle-name">{p.nome}</div><div className="vehicle-meta">{p.id} · v{p.versao} · raio {p.raioM} m · {p.local}</div></div></div></td><td><Tag tone={p.categoria === "area_risco" ? "red" : p.categoria === "cliente" ? "teal" : "neutral"}>{categoriaPontoLabel[p.categoria]}</Tag></td><td style={{ fontSize: 10 }}>{p.politica.permanenciaMinMin ? `${p.politica.permanenciaMinMin}–` : "≤ "}{p.politica.permanenciaMaxMin} min · {p.politica.janela}</td><td style={{ fontSize: 10 }}>{nomeMacro(p.politica.macro)}</td><td>{p.sobrepoe.length === 0 ? <span style={{ color: "#a3adb8", fontSize: 10 }}>—</span> : <select className="filter-select" value={p.precedencia ?? ""} onChange={(e) => { setPontos((c) => c.map((x) => x.id === p.id ? { ...x, precedencia: e.target.value ? Number(e.target.value) : null } : x)); onToast("Precedência atualizada."); }} style={conflito ? { borderColor: "#d1635c" } : undefined}><option value="">Sobrepõe {p.sobrepoe.join(", ")} · definir</option><option value={1}>1 · prevalece</option><option value={2}>2 · cede</option></select>}</td><td>{p.fixo ? <Tag tone="dark"><Pin size={10} /> fixo</Tag> : <button className="panel-link" onClick={() => { setPontos((c) => c.map((x) => x.id === p.id ? { ...x, fixo: true } : x)); onToast("Ponto marcado como fixo: sobrevive à limpeza da política embarcada."); }}>marcar fixo</button>}</td><td><Toggle checked={p.ativo} onChange={(next) => { setPontos((c) => c.map((x) => x.id === p.id ? { ...x, ativo: next } : x)); onToast(next ? "Ponto ativado." : "Ponto inativado. Embarques que o referenciam serão rejeitados pelo equipamento."); }} /></td></tr>; })}</tbody></table></div>
    </div> : null}

    {tab === "rotograma" ? <div className="split-layout">
      <div className="panel" style={{ padding: 0 }}>
        <div className="toolbar"><div><div className="panel-title">Jornadas</div><div className="panel-subtitle">Desvio de cronograma em cinco níveis</div></div></div>
        <div className="list-select">{rotogramas.map((r) => <button key={r.id} className={`list-select-item ${r.id === rotograma.id ? "active" : ""}`} onClick={() => setRgId(r.id)}><span className="list-select-main"><strong>{r.veiculo}</strong><small>{r.nome} · trecho {r.trechoAtual + 1}/{r.trechos.length}</small></span><Tag tone={nivelDesvioTone[r.nivel]}>{nivelDesvioLabel[r.nivel]} · {r.desvioMin > 0 ? "+" : ""}{r.desvioMin} min</Tag></button>)}</div>
        <div style={{ padding: 16 }}><div className="detail-label">Escala de desvio</div><div className="level-scale">{niveis.map((n) => <span key={n} className={`level level-${nivelDesvioTone[n]} ${rotograma.nivel === n ? "current" : ""}`}>{nivelDesvioLabel[n]}</span>)}</div><div className="form-hint">Muito adiantada / adiantada / no prazo / atrasada / muito atrasada. Faixas configuradas na política da operação.</div></div>
      </div>
      <div className="panel">
        <SectionTitle title={rotograma.nome} subtitle={`${rotograma.id} · v${rotograma.versao} · rota ${rotograma.rota} · perfil ativo ${equipamentoDe(rotograma.veiculo).perfilAtivo}`}><button className="soft-btn" onClick={() => { setRotogramas((c) => c.map((r) => r.id === rotograma.id ? { ...r, versao: r.versao + 1 } : r)); onToast(`Rotograma publicado como v${rotograma.versao + 1}. Emita um embarque para atualizar o equipamento.`); }}>Publicar nova versão</button></SectionTitle>
        <div className="trecho-list">{rotograma.trechos.map((t, index) => <div key={t.id} className={`trecho ${index === rotograma.trechoAtual ? "current" : index < rotograma.trechoAtual ? "done" : ""}`}>
          <div className="trecho-head"><span className="trecho-index">{index + 1}</span><div className="trecho-path"><strong>{nomePonto(t.de, pontos)}</strong><span>→</span><strong>{nomePonto(t.para, pontos)}</strong></div>{index === rotograma.trechoAtual ? <Tag tone={nivelDesvioTone[rotograma.nivel]}>em curso · {nivelDesvioLabel[rotograma.nivel]}</Tag> : index < rotograma.trechoAtual ? <Tag tone="teal"><Check size={10} /> concluído</Tag> : <Tag>planejado</Tag>}</div>
          <div className="trecho-grid">
            <label>Duração esperada<input type="number" value={t.duracaoMin} onChange={(e) => patchTrecho(t.id, (x) => ({ ...x, duracaoMin: Number(e.target.value) }))} /><small>min</small></label>
            <label>Distância<input type="number" value={t.distanciaKm} onChange={(e) => patchTrecho(t.id, (x) => ({ ...x, distanciaKm: Number(e.target.value) }))} /><small>km</small></label>
            <label>Velocidade máx.<input type="number" value={t.limites.velocidadeKmh} onChange={(e) => patchTrecho(t.id, (x) => ({ ...x, limites: { ...x.limites, velocidadeKmh: Number(e.target.value) } }))} /><small>km/h</small></label>
            <label>Parada máx.<input type="number" value={t.limites.paradaMaxMin} onChange={(e) => patchTrecho(t.id, (x) => ({ ...x, limites: { ...x.limites, paradaMaxMin: Number(e.target.value) } }))} /><small>min</small></label>
            <label>Direção contínua máx.<input type="number" value={t.limites.direcaoContinuaMaxMin} onChange={(e) => patchTrecho(t.id, (x) => ({ ...x, limites: { ...x.limites, direcaoContinuaMaxMin: Number(e.target.value) } }))} /><small>min</small></label>
          </div>
        </div>)}</div>
        <div className="form-hint" style={{ marginTop: 10 }}>Limites de telemetria são por trecho: um mesmo veículo pode ter 90 km/h na rodovia e 40 km/h na alça portuária.</div>
      </div>
    </div> : null}

    {tab === "areas" ? <div className="grid-2-1">
      <div className="panel map-panel"><div className="map-head"><div><div className="panel-title">Áreas de controle</div><div className="panel-subtitle">Leitura derivada da sobreposição de pontos</div></div><Tag tone="blue"><Layers size={10} /> visão derivada</Tag></div><div className="map-stage"><div className="map-river" /><div className="map-road a" /><div className="map-road b" /><div className="map-road c" /><div className="map-road d" /><span className="map-label one">Contagem</span><span className="map-label two">Rio de Janeiro</span><span className="map-label three">Itaguaí</span><span className="map-label four">Seropédica</span><span className="map-zone zone-c red" /><span className="map-zone zone-d teal" /><button className="map-pin teal pin-c"><MapPin size={11} /></button><button className="map-pin pin-d"><MapPin size={11} /></button><div className="map-legend"><span><i /> área de risco</span><span><i className="teal" /> cliente</span></div></div></div>
      <div className="panel"><Callout tone="info" icon={Lock} title="Área de controle não se cadastra">É a leitura agregada de pontos de controle que se sobrepõem, usada para acompanhar a frota. Para mudar uma área, edite os pontos que a compõem.</Callout>
        <div className="detail-label" style={{ marginTop: 14 }}>Áreas identificadas agora</div>
        {[{ nome: "Itaguaí · porto + CD", pontos: ["PC-006", "PC-001"], veiculos: 3 }, { nome: "Seropédica · pernoite", pontos: ["PC-002"], veiculos: 1 }, { nome: "Campinas · base", pontos: ["PC-003"], veiculos: 1 }].map((area) => <div className="feed-item" key={area.nome}><div className="feed-icon teal"><Layers size={14} /></div><div><div className="feed-title">{area.nome}</div><div className="feed-desc">{area.pontos.map((id) => nomePonto(id, pontos)).join(" + ")} · {area.veiculos} veículo(s) dentro</div></div><Tag>{area.pontos.length} ponto(s)</Tag></div>)}
      </div>
    </div> : null}
    {showNew ? <NewPointModal onClose={() => setShowNew(false)} onCreate={(ponto) => { setPontos((c) => [...c, ponto]); setShowNew(false); onToast(`Ponto de controle “${ponto.nome}” cadastrado (v1).`); }} /> : null}
  </>;
}

function NewPointModal({ onClose, onCreate }: { onClose: () => void; onCreate: (ponto: PontoDeControle) => void }) {
  const [nome, setNome] = useState("Cliente Duque de Caxias · portaria 2");
  const [categoria, setCategoria] = useState<CategoriaPonto>("cliente");
  const [macro, setMacro] = useState(catalogoMacros[0]?.id ?? "");
  const [max, setMax] = useState("60");
  const [min, setMin] = useState("10");
  const [raio, setRaio] = useState("200");
  const [fixo, setFixo] = useState(false);
  return <Modal title="Novo ponto de controle" description="Área + categoria + política. Entrar no ponto registra a macro escolhida — e é ela que traz o perfil configurado naquele veículo." onClose={onClose}>
    <div className="form-field"><label>Nome</label><input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
    <div className="form-row"><div className="form-field"><label>Categoria</label><select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaPonto)}>{(Object.keys(categoriaPontoLabel) as CategoriaPonto[]).map((k) => <option key={k} value={k}>{categoriaPontoLabel[k]}</option>)}</select></div><div className="form-field"><label>Perfil operacional ao entrar</label><select value={macro} onChange={(e) => setMacro(e.target.value)}>{catalogoMacros.map((mc) => <option key={mc.id} value={mc.id}>{mc.nome}</option>)}</select></div></div>
    <div className="form-row"><div className="form-field"><label>Permanência mín. (min)</label><input type="number" value={min} onChange={(e) => setMin(e.target.value)} /></div><div className="form-field"><label>Permanência máx. (min)</label><input type="number" value={max} onChange={(e) => setMax(e.target.value)} /></div></div>
    <div className="form-row"><div className="form-field"><label>Raio (m)</label><input type="number" value={raio} onChange={(e) => setRaio(e.target.value)} /></div><div className="form-field"><label>Ponto fixo</label><Toggle checked={fixo} onChange={setFixo} label={fixo ? "Sobrevive à limpeza" : "Removido na limpeza"} /></div></div>
    <div className="modal-actions"><button className="secondary-btn" onClick={onClose}>Cancelar</button><button className="primary-btn" disabled={!nome.trim() || !macro} onClick={() => onCreate({ id: newId("PC"), nome: nome.trim(), categoria, politica: { macro, permanenciaMaxMin: Number(max), permanenciaMinMin: Number(min), janela: "24h" }, fixo, precedencia: null, ativo: true, raioM: Number(raio), local: "Duque de Caxias · RJ", sobrepoe: [], versao: 1 })}><Check size={13} /> Salvar ponto</button></div>
  </Modal>;
}
