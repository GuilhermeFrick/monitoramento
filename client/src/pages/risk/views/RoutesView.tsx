import { useState } from "react";
import { Check, Route, Ruler, Truck, Waypoints } from "lucide-react";
import { Callout, KpiCard, Modal, PageHeader, SectionTitle, Tag, Toggle, useStoredState } from "../shared";
import { STORAGE, newId, rotasIniciais, type Rota } from "../domain";

export function RoutesView({ onToast, onGoRotograma }: { onToast: (message: string) => void; onGoRotograma: () => void }) {
  const [rotas, setRotas] = useStoredState<Rota[]>(STORAGE.rotas, rotasIniciais);
  const [showNew, setShowNew] = useState(false);
  const foraCorredor = rotas.filter((r) => r.desvioAtualM !== null && r.desvioAtualM > r.corredorM).length;
  return <>
    <PageHeader eyebrow="Trajeto eletrônico" title="Rotas" description="Trajeto com corredor de tolerância. Desvio é a distância do veículo ao corredor. O plano de viagem por trechos é o rotograma, em outra tela." action="Nova rota" onAction={() => setShowNew(true)} />
    <div className="kpi-grid"><KpiCard label="Rotas ativas" value={String(rotas.filter((r) => r.ativa).length).padStart(2, "0")} meta={`${rotas.length} cadastradas`} icon={Route} /><KpiCard label="Veículos vinculados" value={String(rotas.reduce((acc, r) => acc + r.veiculosVinculados, 0))} meta="Em viagem agora" icon={Truck} /><KpiCard label="Fora do corredor" value={String(foraCorredor).padStart(2, "0")} meta="Condição ativa" icon={Waypoints} tone="red" /><KpiCard label="Corredor médio" value={`${Math.round(rotas.reduce((acc, r) => acc + r.corredorM, 0) / rotas.length)} m`} meta="Tolerância lateral" icon={Ruler} /></div>
    <div className="grid-2-1">
      <div className="panel" style={{ padding: 0 }}>
        <div className="toolbar"><div><div className="panel-title">Rotas cadastradas</div><div className="panel-subtitle">Corredor, distância e desvio atual</div></div><button className="panel-link" onClick={onGoRotograma}>Ver rotogramas</button></div>
        <div className="table-wrap"><table><thead><tr><th>ROTA</th><th>CORREDOR</th><th>DISTÂNCIA</th><th>VEÍCULOS</th><th>DESVIO ATUAL</th><th>ATIVA</th></tr></thead><tbody>{rotas.map((r) => { const fora = r.desvioAtualM !== null && r.desvioAtualM > r.corredorM; return <tr key={r.id}><td><div className="vehicle-cell"><div className="vehicle-avatar"><Route size={14} /></div><div><div className="vehicle-name">{r.nome}</div><div className="vehicle-meta">{r.id} · v{r.versao} · {r.origem} → {r.destino}</div></div></div></td><td>{r.corredorM} m</td><td>{r.distanciaKm} km</td><td>{r.veiculosVinculados}</td><td>{r.desvioAtualM === null ? <Tag>sem veículo</Tag> : <Tag tone={fora ? "red" : "teal"}>{r.desvioAtualM} m {fora ? "· fora" : "· dentro"}</Tag>}</td><td><Toggle checked={r.ativa} onChange={(next) => { setRotas((c) => c.map((x) => x.id === r.id ? { ...x, ativa: next } : x)); onToast(next ? "Rota ativada." : "Rota inativada. Rotogramas que a usam continuam válidos até nova emissão."); }} /></td></tr>; })}</tbody></table></div>
      </div>
      <div className="panel map-panel"><div className="map-head"><div><div className="panel-title">Corredores</div><div className="panel-subtitle">Trajeto e faixa de tolerância</div></div></div><div className="map-stage"><div className="map-river" /><div className="map-road a" /><div className="map-road b" /><div className="map-road c" /><div className="map-road d" /><span className="map-label one">Contagem</span><span className="map-label two">Rio de Janeiro</span><span className="map-label three">Itaguaí</span><span className="map-label four">Seropédica</span><span className="map-corridor" /><button className="map-pin pin-b"><Truck size={11} /></button><div className="map-legend"><span><i className="teal" /> corredor</span><span><i /> fora do corredor</span></div></div>
        <SectionTitle title="Rota ≠ rotograma" /><Callout tone="info" icon={Waypoints} title="Qual usar?"><b>Rota</b> é o trajeto eletrônico com corredor; gera condição “fora do corredor”. <b>Rotograma</b> é o plano de viagem: sequência de pontos de controle com duração e limites por trecho; gera desvio de cronograma em cinco níveis.</Callout>
      </div>
    </div>
    {showNew ? <NewRouteModal onClose={() => setShowNew(false)} onCreate={(rota) => { setRotas((c) => [rota, ...c]); setShowNew(false); onToast(`Rota “${rota.nome}” cadastrada.`); }} /> : null}
  </>;
}

function NewRouteModal({ onClose, onCreate }: { onClose: () => void; onCreate: (rota: Rota) => void }) {
  const [nome, setNome] = useState("Guarulhos → Campinas (Bandeirantes)");
  const [origem, setOrigem] = useState("Pátio Guarulhos");
  const [destino, setDestino] = useState("Base Campinas");
  const [corredor, setCorredor] = useState("300");
  const [distancia, setDistancia] = useState("96");
  return <Modal title="Nova rota" description="Trajeto eletrônico com corredor de tolerância." onClose={onClose}>
    <div className="form-field"><label>Nome</label><input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
    <div className="form-row"><div className="form-field"><label>Origem</label><input value={origem} onChange={(e) => setOrigem(e.target.value)} /></div><div className="form-field"><label>Destino</label><input value={destino} onChange={(e) => setDestino(e.target.value)} /></div></div>
    <div className="form-row"><div className="form-field"><label>Corredor (m)</label><input type="number" value={corredor} onChange={(e) => setCorredor(e.target.value)} /><div className="form-hint">Distância além do corredor = desvio de rota.</div></div><div className="form-field"><label>Distância (km)</label><input type="number" value={distancia} onChange={(e) => setDistancia(e.target.value)} /></div></div>
    <div className="modal-actions"><button className="secondary-btn" onClick={onClose}>Cancelar</button><button className="primary-btn" disabled={!nome.trim()} onClick={() => onCreate({ id: newId("RT"), nome: nome.trim(), origem, destino, corredorM: Number(corredor), distanciaKm: Number(distancia), ativa: true, veiculosVinculados: 0, desvioAtualM: null, versao: 1 })}><Check size={13} /> Salvar rota</button></div>
  </Modal>;
}
