import { useState } from "react";
import { Check, Globe2, MapPin, Power, Target } from "lucide-react";
import { Callout, KpiCard, Modal, PageHeader, SectionTitle, Tag, Toggle, useStoredState } from "../shared";
import { STORAGE, cercasIniciais, newId, type Cerca } from "../domain";

const categoriaLabel: Record<Cerca["categoria"], string> = { restrita: "Área restrita", operacional: "Área operacional", velocidade: "Limite de velocidade", horario: "Janela de horário" };

export function FencesView({ onToast }: { onToast: (message: string) => void }) {
  const [cercas, setCercas] = useStoredState<Cerca[]>(STORAGE.cercas, cercasIniciais);
  const [filtro, setFiltro] = useState<"todas" | "ativas" | "inativas">("todas");
  const [showNew, setShowNew] = useState(false);
  const visiveis = cercas.filter((c) => filtro === "todas" || (filtro === "ativas" ? c.ativa : !c.ativa));
  const ativas = cercas.filter((c) => c.ativa).length;
  const toggle = (id: string, next: boolean) => { setCercas((c) => c.map((x) => x.id === id ? { ...x, ativa: next } : x)); onToast(next ? "Cerca reativada. Será incluída no próximo embarque." : "Cerca inativada sem exclusão: histórico e versões preservados."); };
  const criar = (cerca: Cerca) => { setCercas((c) => [cerca, ...c]); setShowNew(false); onToast(`Cerca “${cerca.nome}” cadastrada (v1).`); };

  return <>
    <PageHeader eyebrow="Área com regra" title="Cercas" description="Área geográfica com política própria: categoria e permanência. Pontos de controle e rotas ficam em telas separadas." action="Nova cerca" onAction={() => setShowNew(true)} />
    <div className="kpi-grid"><KpiCard label="Cercas cadastradas" value={String(cercas.length).padStart(2, "0")} meta={`${ativas} ativas · ${cercas.length - ativas} inativas`} icon={Globe2} /><KpiCard label="Violações hoje" value="07" meta="4 em áreas restritas" icon={Target} tone="red" trend="down" /><KpiCard label="Embarcadas" value="176 / 184" meta="8 equipamentos pendentes" icon={MapPin} /><KpiCard label="Última publicação" value="14:05" meta="Perímetro urbano Rio · v6" icon={Power} /></div>
    <div className="grid-2-1">
      <div className="panel" style={{ padding: 0 }}>
        <div className="toolbar"><div className="segmented"><button className={filtro === "todas" ? "active" : ""} onClick={() => setFiltro("todas")}>Todas</button><button className={filtro === "ativas" ? "active" : ""} onClick={() => setFiltro("ativas")}>Ativas</button><button className={filtro === "inativas" ? "active" : ""} onClick={() => setFiltro("inativas")}>Inativas</button></div><span style={{ fontSize: 10, color: "#84909d" }}>{visiveis.length} cercas</span></div>
        <div className="table-wrap"><table><thead><tr><th>CERCA</th><th>CATEGORIA</th><th>POLÍTICA</th><th>VERSÃO</th><th>ATIVA</th></tr></thead><tbody>{visiveis.map((c) => <tr key={c.id} style={{ opacity: c.ativa ? 1 : 0.6 }}><td><div className="vehicle-cell"><div className="vehicle-avatar"><Globe2 size={14} /></div><div><div className="vehicle-name">{c.nome}</div><div className="vehicle-meta">{c.id} · {c.local}</div></div></div></td><td><Tag tone={c.categoria === "restrita" ? "red" : c.categoria === "velocidade" ? "amber" : "teal"}>{categoriaLabel[c.categoria]}</Tag></td><td style={{ fontSize: 10 }}>{c.politica.limiteKmh ? `≤ ${c.politica.limiteKmh} km/h · ` : ""}{c.politica.permanenciaMaxMin !== null ? (c.politica.permanenciaMaxMin === 0 ? "entrada proibida · " : `permanência ≤ ${c.politica.permanenciaMaxMin} min · `) : ""}{c.politica.janela}</td><td>v{c.versao}</td><td><Toggle checked={c.ativa} onChange={(next) => toggle(c.id, next)} /></td></tr>)}</tbody></table>{visiveis.length === 0 ? <div className="empty-note">Nenhuma cerca neste filtro.</div> : null}</div>
      </div>
      <div className="panel map-panel"><div className="map-head"><div><div className="panel-title">Cercas no mapa</div><div className="panel-subtitle">{ativas} ativas exibidas</div></div></div><div className="map-stage"><div className="map-river" /><div className="map-road a" /><div className="map-road b" /><div className="map-road c" /><div className="map-road d" /><span className="map-label one">Contagem</span><span className="map-label two">Rio de Janeiro</span><span className="map-label three">Itaguaí</span><span className="map-label four">Seropédica</span><span className="map-zone zone-a red" /><span className="map-zone zone-b amber" /><span className="map-zone zone-c teal" /><div className="map-legend"><span><i /> restrita</span><span><i className="amber" /> velocidade</span><span><i className="teal" /> operacional</span></div></div>
        <SectionTitle title="Inativar não é excluir" /><Callout tone="info" icon={Power} title="Toggle ativa/inativa">Uma cerca inativa sai dos próximos embarques mas mantém histórico de violações e versões. Reative quando precisar sem recadastrar.</Callout>
      </div>
    </div>
    {showNew ? <NewFenceModal onClose={() => setShowNew(false)} onCreate={criar} /> : null}
  </>;
}

function NewFenceModal({ onClose, onCreate }: { onClose: () => void; onCreate: (cerca: Cerca) => void }) {
  const [nome, setNome] = useState("Pátio de manobra · Guarulhos");
  const [categoria, setCategoria] = useState<Cerca["categoria"]>("operacional");
  const [permanencia, setPermanencia] = useState("30");
  const [limite, setLimite] = useState("20");
  const [janela, setJanela] = useState("24h");
  return <Modal title="Nova cerca" description="Área com política de categoria e permanência. Para ponto de controle com perfil, use a tela de Pontos de controle." onClose={onClose}>
    <div className="form-field"><label>Nome</label><input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
    <div className="form-row"><div className="form-field"><label>Categoria</label><select value={categoria} onChange={(e) => setCategoria(e.target.value as Cerca["categoria"])}>{(Object.keys(categoriaLabel) as Cerca["categoria"][]).map((k) => <option key={k} value={k}>{categoriaLabel[k]}</option>)}</select></div><div className="form-field"><label>Janela</label><input value={janela} onChange={(e) => setJanela(e.target.value)} /></div></div>
    <div className="form-row"><div className="form-field"><label>Permanência máx. (min)</label><input type="number" value={permanencia} onChange={(e) => setPermanencia(e.target.value)} disabled={categoria === "velocidade"} /><div className="form-hint">0 = entrada proibida</div></div><div className="form-field"><label>Limite de velocidade (km/h)</label><input type="number" value={limite} onChange={(e) => setLimite(e.target.value)} disabled={categoria === "restrita" || categoria === "horario"} /></div></div>
    <div className="form-field"><label>Geometria</label><div className="segmented"><button className="active">Desenhar no mapa</button><button>Importar KML</button></div><div className="form-hint">Nesta versão demonstrativa a geometria é simulada.</div></div>
    <div className="modal-actions"><button className="secondary-btn" onClick={onClose}>Cancelar</button><button className="primary-btn" disabled={!nome.trim()} onClick={() => onCreate({ id: newId("CE"), nome: nome.trim(), categoria, politica: { permanenciaMaxMin: categoria === "velocidade" ? null : Number(permanencia), limiteKmh: categoria === "restrita" || categoria === "horario" ? null : Number(limite), janela }, ativa: true, local: "Guarulhos · SP", versao: 1 })}><Check size={13} /> Salvar cerca</button></div>
  </Modal>;
}
