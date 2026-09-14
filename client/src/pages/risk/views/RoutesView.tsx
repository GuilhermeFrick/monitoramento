import { useMemo, useState } from "react";
import { Check, Route, Ruler, Truck, Upload, Waypoints } from "lucide-react";
import { Callout, KpiCard, Modal, PageHeader, SectionTitle, Tag, Toggle, useStoredState } from "../shared";
import { STORAGE, newId, rotasIniciais, rotogramasIniciais, type GeometriaLinha, type Rota, type Rotograma } from "../domain";
import { MapaGeo, type FormaMapa } from "../mapa/MapaGeo";
import { BarraFerramentas, EditorGeometria } from "../mapa/EditorGeometria";
import { comprimentoM, formatarDistancia, geometriaPadrao } from "../mapa/geometria";

export function RoutesView({ onToast, onGoRotograma, onRascunho }: {
  onToast: (message: string) => void;
  onGoRotograma: () => void;
  /** Mexer no corredor muda a política embarcada de quem roda a rota. */
  onRascunho?: (veiculos: string[], descricao: string) => void;
}) {
  const [rotas, setRotas] = useStoredState<Rota[]>(STORAGE.rotas, rotasIniciais);
  const [rotogramas] = useStoredState<Rotograma[]>(STORAGE.rotogramas, rotogramasIniciais);
  const [showNew, setShowNew] = useState(false);
  const [rotaId, setRotaId] = useState(rotas[0]?.id ?? "");
  const [desenhando, setDesenhando] = useState(false);
  const selecionada = rotas.find((r) => r.id === rotaId) ?? rotas[0];
  const foraCorredor = rotas.filter((r) => r.desvioAtualM !== null && r.desvioAtualM > r.geometria.corredorM).length;
  const corredorMedio = rotas.length ? Math.round(rotas.reduce((acc, r) => acc + r.geometria.corredorM, 0) / rotas.length) : 0;

  const veiculosDaRota = (id: string) => rotogramas.filter((r) => r.rota === id).map((r) => r.veiculo);

  const patch = (id: string, descricao: string | null, fn: (r: Rota) => Rota) => {
    setRotas((atuais) => atuais.map((r) => r.id === id ? { ...fn(r), versao: r.versao + 1 } : r));
    const afetados = veiculosDaRota(id);
    if (descricao && afetados.length) onRascunho?.(afetados, `${descricao} · ${rotas.find((r) => r.id === id)?.nome ?? id}`);
  };

  const formas = useMemo<FormaMapa[]>(() => rotas.map((r) => ({
    id: r.id,
    geometria: r.geometria,
    estilo: !r.ativa ? "rota-inativa" : r.id === selecionada?.id ? "rota" : "contexto",
    rotulo: `${r.nome} · ${formatarDistancia(comprimentoM(r.geometria.vertices))} · corredor ${r.geometria.corredorM} m`,
    aoClicar: () => setRotaId(r.id),
  })), [rotas, selecionada?.id]);

  const criarComGeometria = (geometria: GeometriaLinha) => {
    const nova: Rota = {
      id: newId("RT"), nome: "Nova rota", origem: "Definir", destino: "Definir",
      geometria,
      ativa: true, veiculosVinculados: 0, desvioAtualM: null, versao: 1,
    };
    setRotas((atuais) => [nova, ...atuais]);
    setRotaId(nova.id);
    setDesenhando(false);
    onToast("Rota desenhada. Ajuste nome, extremos e corredor ao lado.");
  };

  return <>
    <PageHeader eyebrow="Trajeto eletrônico" title="Rotas" description="Trajeto com corredor de tolerância. Desvio é a distância do veículo ao corredor. O plano de viagem por trechos é o rotograma, em outra tela." action="Nova rota" onAction={() => setShowNew(true)} />
    <div className="kpi-grid"><KpiCard label="Rotas ativas" value={String(rotas.filter((r) => r.ativa).length).padStart(2, "0")} meta={`${rotas.length} cadastradas`} icon={Route} /><KpiCard label="Veículos vinculados" value={String(rotas.reduce((acc, r) => acc + r.veiculosVinculados, 0))} meta="Em viagem agora" icon={Truck} /><KpiCard label="Fora do corredor" value={String(foraCorredor).padStart(2, "0")} meta="Condição ativa" icon={Waypoints} tone="red" /><KpiCard label="Corredor médio" value={`${corredorMedio} m`} meta="Tolerância lateral" icon={Ruler} /></div>
    <div className="grid-2-1">
      <div className="panel" style={{ padding: 0 }}>
        <div className="toolbar"><div><div className="panel-title">Rotas cadastradas</div><div className="panel-subtitle">Selecione uma linha para editar o traçado no mapa</div></div><button className="panel-link" onClick={onGoRotograma}>Ver rotogramas</button></div>
        <div className="table-wrap"><table><thead><tr><th>ROTA</th><th>CORREDOR</th><th>EXTENSÃO</th><th>VEÍCULOS</th><th>DESVIO ATUAL</th><th>ATIVA</th></tr></thead><tbody>{rotas.map((r) => {
          const fora = r.desvioAtualM !== null && r.desvioAtualM > r.geometria.corredorM;
          return <tr key={r.id} className={r.id === selecionada?.id ? "linha-selecionada" : ""}>
            <td><button className="celula-selecao" onClick={() => setRotaId(r.id)} aria-pressed={r.id === selecionada?.id}><div className="vehicle-cell"><div className="vehicle-avatar"><Route size={14} /></div><div><div className="vehicle-name">{r.nome}</div><div className="vehicle-meta">{r.id} · v{r.versao} · {r.origem} → {r.destino}</div></div></div></button></td>
            <td>{r.geometria.corredorM} m</td>
            <td>{formatarDistancia(comprimentoM(r.geometria.vertices))}</td>
            <td>{r.veiculosVinculados}</td>
            <td>{r.desvioAtualM === null ? <Tag>sem veículo</Tag> : <Tag tone={fora ? "red" : "teal"}>{r.desvioAtualM} m {fora ? "· fora" : "· dentro"}</Tag>}</td>
            <td><Toggle checked={r.ativa} onChange={(next) => { patch(r.id, next ? "Rota ativada" : "Rota inativada", (x) => ({ ...x, ativa: next })); onToast(next ? "Rota ativada." : "Rota inativada. Rotogramas que a usam continuam válidos até nova emissão."); }} /></td>
          </tr>;
        })}</tbody></table></div>
      </div>

      <div className="panel map-panel">
        <div className="map-head"><div><div className="panel-title">Corredores</div><div className="panel-subtitle">{selecionada ? `${selecionada.nome} · faixa de ${selecionada.geometria.corredorM} m` : "Trajeto e faixa de tolerância"}</div></div></div>
        <BarraFerramentas
          permitidos={["linha"]}
          ativo={desenhando ? "linha" : null}
          rotulo="Desenhar nova rota"
          onEscolher={() => setDesenhando(true)}
          onCancelar={() => setDesenhando(false)}
        />
        <MapaGeo
          formas={formas}
          rotulo="Mapa das rotas e seus corredores"
          ajuste={`rt-${selecionada?.id ?? ""}-${rotas.length}`}
          altura={360}
          editando={selecionada && !desenhando ? {
            geometria: selecionada.geometria,
            onChange: (geometria) => patch(selecionada.id, "Traçado ajustado no mapa", (r) => ({ ...r, geometria: geometria as GeometriaLinha })),
          } : null}
          desenhando={desenhando ? { tipo: "linha", onCancelar: () => setDesenhando(false), onConcluir: (g) => criarComGeometria(g as GeometriaLinha) } : null}
        />
        <div className="geo-legenda"><span><i className="rota" /> corredor da rota selecionada</span><span><i className="contexto" /> outras rotas</span><span><i className="inativo" /> inativa</span></div>

        {selecionada ? <>
          <EditorGeometria
            geometria={selecionada.geometria}
            onChange={(geometria) => patch(selecionada.id, "Corredor ajustado", (r) => ({ ...r, geometria: geometria as GeometriaLinha }))}
          />
          {veiculosDaRota(selecionada.id).length ? <div className="geo-afetados"><Upload size={12} /><span>Mudar o corredor vira rascunho em <strong>{veiculosDaRota(selecionada.id).join(", ")}</strong>.</span></div> : null}
        </> : null}

        <SectionTitle title="Rota não é rotograma" />
        <Callout tone="info" icon={Waypoints} title="Qual usar?"><b>Rota</b> é o trajeto eletrônico com corredor; o desvio se mede como distância à faixa, não à linha. <b>Rotograma</b> é o plano de viagem: sequência de pontos de controle com duração e limites por trecho, e desvio de cronograma em cinco níveis.</Callout>
      </div>
    </div>
    {showNew ? <NewRouteModal onClose={() => setShowNew(false)} onCreate={(rota) => { setRotas((c) => [rota, ...c]); setRotaId(rota.id); setShowNew(false); onToast(`Rota “${rota.nome}” cadastrada. Ajuste o traçado no mapa.`); }} /> : null}
  </>;
}

function NewRouteModal({ onClose, onCreate }: { onClose: () => void; onCreate: (rota: Rota) => void }) {
  const [nome, setNome] = useState("Guarulhos → Campinas (Bandeirantes)");
  const [origem, setOrigem] = useState("Pátio Guarulhos");
  const [destino, setDestino] = useState("Base Campinas");
  const [corredor, setCorredor] = useState("300");
  const [lat, setLat] = useState("-23.4356");
  const [lng, setLng] = useState("-46.4731");
  return <Modal title="Nova rota" description="Trajeto eletrônico com corredor de tolerância. O traçado nasce como um segmento e é ajustado no mapa." onClose={onClose}>
    <div className="form-field"><label>Nome</label><input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
    <div className="form-row"><div className="form-field"><label>Origem</label><input value={origem} onChange={(e) => setOrigem(e.target.value)} /></div><div className="form-field"><label>Destino</label><input value={destino} onChange={(e) => setDestino(e.target.value)} /></div></div>
    <div className="form-row"><div className="form-field"><label>Latitude inicial</label><input type="number" step="0.0005" value={lat} onChange={(e) => setLat(e.target.value)} /></div><div className="form-field"><label>Longitude inicial</label><input type="number" step="0.0005" value={lng} onChange={(e) => setLng(e.target.value)} /></div></div>
    <div className="form-field"><label>Corredor (m)</label><input type="number" value={corredor} onChange={(e) => setCorredor(e.target.value)} /><div className="form-hint">Distância além do corredor é o que conta como desvio de rota.</div></div>
    <div className="modal-actions"><button className="secondary-btn" onClick={onClose}>Cancelar</button><button className="primary-btn" disabled={!nome.trim()} onClick={() => {
      const base = geometriaPadrao("linha", { lat: Number(lat), lng: Number(lng) }, 5000) as GeometriaLinha;
      const geometria: GeometriaLinha = { ...base, corredorM: Math.max(25, Number(corredor)) };
      onCreate({ id: newId("RT"), nome: nome.trim(), origem, destino, geometria, ativa: true, veiculosVinculados: 0, desvioAtualM: null, versao: 1 });
    }}><Check size={13} /> Salvar rota</button></div>
  </Modal>;
}
