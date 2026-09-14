import { useMemo, useState } from "react";
import { CalendarDays, Check, Globe2, Link2, Map, MapPin, Plus, Route, Truck, Unlink2 } from "lucide-react";
import { Modal, Tag, Toggle, useStoredState } from "../shared";
import { STORAGE, cercasIniciais, newId, type Cerca, type ConfiguracaoVeiculo } from "../domain";
import type { ControleArvoreVeiculos, VehicleNavigatorProps } from "./perfil/VehicleNavigator";

const categoriaLabel: Record<Cerca["categoria"], string> = { restrita: "Área restrita", operacional: "Área operacional", velocidade: "Limite de velocidade", horario: "Janela de horário" };
const formaLabel: Record<NonNullable<Cerca["forma"]>, string> = { corredor: "Corredor", poligono: "Polígono", circular: "Circular" };

export function FencesView({ configs, veiculo, arvore, busca, onBusca, onLimparBusca, onToast, VehicleNavigator }: {
  configs: ConfiguracaoVeiculo[];
  veiculo: { atual: string; selecionar: (v: string) => void };
  arvore?: ControleArvoreVeiculos;
  busca: string;
  onBusca: (valor: string) => void;
  onLimparBusca: () => void;
  onToast: (message: string) => void;
  VehicleNavigator: React.ComponentType<VehicleNavigatorProps>;
}) {
  const [cercas, setCercas] = useStoredState<Cerca[]>(STORAGE.cercas, cercasIniciais);
  const [aba, setAba] = useState<"vinculadas" | "catalogo">("vinculadas");
  const [cercaId, setCercaId] = useState(cercas[0]?.id ?? "");
  const [showNew, setShowNew] = useState(false);
  const [navegadorRecolhidoLocal, setNavegadorRecolhidoLocal] = useState(false);
  const navegadorRecolhido = arvore?.estado.painelRecolhido ?? navegadorRecolhidoLocal;
  const config = configs.find((c) => c.veiculo === veiculo.atual) ?? configs[0];
  // Completa cercas salvas pela versão anterior, sem descartar ativações ou políticas já editadas.
  const cercasNormalizadas = useMemo(() => cercas.map((c) => {
    const base = cercasIniciais.find((item) => item.id === c.id);
    return { ...base, ...c, politica: { ...base?.politica, ...c.politica }, veiculos: c.veiculos ?? base?.veiculos ?? [] } as Cerca;
  }), [cercas]);
  const vinculadas = useMemo(() => cercasNormalizadas.filter((c) => (c.veiculos ?? []).includes(config.veiculo)), [cercasNormalizadas, config.veiculo]);
  const visiveis = aba === "vinculadas" ? vinculadas : cercasNormalizadas;
  const cerca = cercasNormalizadas.find((c) => c.id === cercaId && visiveis.some((v) => v.id === c.id)) ?? visiveis[0] ?? cercasNormalizadas[0];
  const vinculada = Boolean(cerca && (cerca.veiculos ?? []).includes(config.veiculo));

  const patch = (id: string, fn: (c: Cerca) => Cerca) => setCercas((atuais) => atuais.map((c) => c.id === id ? { ...fn(c), versao: c.versao + 1 } : c));
  const alternarVinculo = () => {
    if (!cerca) return;
    patch(cerca.id, (atual) => ({ ...atual, veiculos: vinculada ? (atual.veiculos ?? []).filter((v) => v !== config.veiculo) : [...(atual.veiculos ?? []), config.veiculo], vigenciaInicio: vinculada ? atual.vigenciaInicio : new Date().toISOString().slice(0, 10) }));
    onToast(vinculada ? `Cerca desvinculada de ${config.veiculo}.` : `Cerca vinculada a ${config.veiculo}.`);
  };

  return <div className="wsp geo-wsp">
    <div className={`wsp-corpo sem-inspetor ${navegadorRecolhido ? "nav-recolhida" : ""}`}>
      <VehicleNavigator
        configs={configs} selecionado={config.veiculo} busca={busca} onBusca={onBusca} onLimparBusca={onLimparBusca}
        onSelecionar={veiculo.selecionar} recolhido={navegadorRecolhido} arvore={arvore}
        onAlternar={() => setNavegadorRecolhidoLocal((atual) => !atual)}
      />
      <section className="wsp-canvas-wrap" aria-label="Cercas eletrônicas">
        <header className="wsp-canvas-toolbar geo-toolbar">
          <div className="eq-identidade"><Globe2 size={17} /><div><h2>{config.veiculo} · Cercas eletrônicas</h2><p>{vinculadas.length} vinculada(s) · geometria, tolerância e vigência por veículo</p></div></div>
          <button className="geo-btn primario" onClick={() => setShowNew(true)}><Plus size={13} /> Nova cerca</button>
        </header>
        <nav className="wsp-abas eq-abas" role="tablist" aria-label="Cercas do veículo">
          <button role="tab" aria-selected={aba === "vinculadas"} className={aba === "vinculadas" ? "ativa" : ""} onClick={() => setAba("vinculadas")}>Vinculadas · {vinculadas.length}</button>
          <button role="tab" aria-selected={aba === "catalogo"} className={aba === "catalogo" ? "ativa" : ""} onClick={() => setAba("catalogo")}>Catálogo · {cercas.length}</button>
        </nav>
        <div className="geo-corpo">
          {visiveis.length ? <div className="cerca-grid">
            <div className="cerca-lista"><div className="geo-card-head"><div><strong>{aba === "vinculadas" ? "Cercas deste veículo" : "Cercas disponíveis"}</strong><span>Selecione para visualizar e configurar</span></div></div>{visiveis.map((item) => <button key={item.id} className={`cerca-item ${cerca?.id === item.id ? "selecionado" : ""}`} onClick={() => setCercaId(item.id)}><span className={`cerca-icone cerca-${item.categoria}`}><Globe2 size={14} /></span><span><strong>{item.nome}</strong><small>{item.local} · {formaLabel[item.forma ?? "poligono"]}</small></span><i className={item.ativa ? "ativo" : ""} /></button>)}</div>
            <div className="geo-mapa-card cerca-mapa-card"><div className="geo-card-head"><div><strong>{cerca.nome}</strong><span>{cerca.local} · {cerca.extensaoKm ?? "—"} km</span></div><Tag tone={cerca.ativa ? "teal" : "neutral"}>{cerca.ativa ? "Ativa" : "Inativa"}</Tag></div><MapaCerca cerca={cerca} /><div className="geo-legenda"><span><i className="cerca-area" /> área protegida</span><span><i className="cerca-tolerancia" /> tolerância de {cerca.toleranciaM ?? 100} m</span><span><i className="rota" /> trajeto do veículo</span></div></div>
            <aside className="geo-inspetor cerca-inspetor">
              <div className="geo-card-head"><div><strong>Configuração da cerca</strong><span>{cerca.id} · versão {cerca.versao}</span></div><Toggle checked={cerca.ativa} onChange={(ativa) => patch(cerca.id, (c) => ({ ...c, ativa }))} /></div>
              <div className={`cerca-vinculo ${vinculada ? "vinculado" : ""}`}><Truck size={14} /><span><strong>{vinculada ? `Vinculada a ${config.veiculo}` : "Não vinculada"}</strong><small>{vinculada ? `Vigente desde ${cerca.vigenciaInicio ?? "hoje"}` : "A cerca continua disponível no catálogo"}</small></span><button onClick={alternarVinculo}>{vinculada ? <Unlink2 size={13} /> : <Link2 size={13} />}{vinculada ? "Desvincular" : "Vincular"}</button></div>
              <label>Categoria<select value={cerca.categoria} onChange={(e) => patch(cerca.id, (c) => ({ ...c, categoria: e.target.value as Cerca["categoria"] }))}>{(Object.keys(categoriaLabel) as Cerca["categoria"][]).map((categoria) => <option key={categoria} value={categoria}>{categoriaLabel[categoria]}</option>)}</select></label>
              <label>Geometria<select value={cerca.forma ?? "poligono"} onChange={(e) => patch(cerca.id, (c) => ({ ...c, forma: e.target.value as NonNullable<Cerca["forma"]> }))}>{(Object.keys(formaLabel) as NonNullable<Cerca["forma"]>[]).map((forma) => <option key={forma} value={forma}>{formaLabel[forma]}</option>)}</select></label>
              <div className="geo-campos"><CampoCerca label="Tolerância" unidade="m" valor={cerca.toleranciaM ?? 100} onChange={(toleranciaM) => patch(cerca.id, (c) => ({ ...c, toleranciaM }))} /><CampoCerca label="Velocidade" unidade="km/h" valor={cerca.politica.limiteKmh ?? 0} onChange={(limiteKmh) => patch(cerca.id, (c) => ({ ...c, politica: { ...c.politica, limiteKmh: limiteKmh || null } }))} /></div>
              <label>Janela operacional<input value={cerca.politica.janela} onChange={(e) => patch(cerca.id, (c) => ({ ...c, politica: { ...c.politica, janela: e.target.value } }))} /></label>
              <div className="cerca-vigencia"><CalendarDays size={14} /><span><strong>Vigência</strong><small>{cerca.vigenciaInicio ?? "Não iniciada"} → {cerca.vigenciaFim ?? "sem término"}</small></span></div>
              <div className="cerca-resumo"><MapPin size={13} /><span>{categoriaLabel[cerca.categoria]} · {cerca.politica.permanenciaMaxMin === 0 ? "entrada proibida" : cerca.politica.permanenciaMaxMin ? `permanência máxima ${cerca.politica.permanenciaMaxMin} min` : "sem limite de permanência"}</span></div>
            </aside>
          </div> : <div className="geo-empty"><Globe2 size={28} /><strong>Nenhuma cerca vinculada</strong><span>Abra o catálogo e vincule uma geometria existente a {config.veiculo}.</span><button className="geo-btn primario" onClick={() => setAba("catalogo")}><Link2 size={13} /> Abrir catálogo</button></div>}
        </div>
      </section>
    </div>
    {showNew ? <NewFenceModal veiculo={config.veiculo} onClose={() => setShowNew(false)} onCreate={(nova) => { setCercas((atuais) => [nova, ...atuais]); setCercaId(nova.id); setAba("vinculadas"); setShowNew(false); onToast(`Cerca “${nova.nome}” criada e vinculada a ${config.veiculo}.`); }} /> : null}
  </div>;
}

function MapaCerca({ cerca }: { cerca: Cerca }) {
  const forma = cerca.forma ?? "poligono";
  return <div className="geo-mapa cerca-mapa"><svg viewBox="0 0 100 85" preserveAspectRatio="none" aria-label={`Geometria de ${cerca.nome}`}><path className="geo-rio" d="M-4 69 C18 54, 32 80, 51 59 S80 30, 106 42" /><g className="geo-estradas"><path d="M0 20 L100 68" /><path d="M8 77 L94 9" /><path d="M39 0 L58 85" /></g><path className="cerca-trajeto" d="M8 70 C28 55, 40 62, 52 43 S74 36, 92 17" />{forma === "corredor" ? <path className="cerca-geometria corredor" d="M8 70 C28 55, 40 62, 52 43 S74 36, 92 17" /> : forma === "circular" ? <circle className="cerca-geometria" cx="59" cy="43" r="19" /> : <polygon className="cerca-geometria" points="24,61 37,30 69,23 84,49 58,70" />}<g className="geo-map-marker" transform="translate(52 43)"><circle r="3.5" /><text y="-5">V</text></g></svg><span className="geo-cidade c1">Campinas</span><span className="geo-cidade c2">Seropédica</span><span className="geo-cidade c3">Itaguaí</span></div>;
}

function CampoCerca({ label, unidade, valor, onChange }: { label: string; unidade: string; valor: number; onChange: (valor: number) => void }) {
  return <label>{label}<span className="geo-numero"><input type="number" min="0" value={valor} onChange={(e) => onChange(Math.max(0, Number(e.target.value)))} /><small>{unidade}</small></span></label>;
}

function NewFenceModal({ veiculo, onClose, onCreate }: { veiculo: string; onClose: () => void; onCreate: (cerca: Cerca) => void }) {
  const [nome, setNome] = useState("Corredor logístico · nova operação");
  const [descricao, setDescricao] = useState("Cerca para controle do trajeto autorizado.");
  const [local, setLocal] = useState("Campinas → Itaguaí");
  const [categoria, setCategoria] = useState<Cerca["categoria"]>("operacional");
  const [forma, setForma] = useState<NonNullable<Cerca["forma"]>>("corredor");
  const [tolerancia, setTolerancia] = useState("300");
  const [permanente, setPermanente] = useState(true);
  return <Modal title="Nova cerca eletrônica" description="Desenhe a geometria e depois vincule-a aos veículos que devem obedecê-la." onClose={onClose} wide>
    <div className="form-row"><div className="form-field"><label>Nome</label><input value={nome} onChange={(e) => setNome(e.target.value)} /></div><div className="form-field"><label>Localização</label><input value={local} onChange={(e) => setLocal(e.target.value)} /></div></div>
    <div className="form-field"><label>Descrição</label><input value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
    <div className="form-row"><div className="form-field"><label>Categoria</label><select value={categoria} onChange={(e) => setCategoria(e.target.value as Cerca["categoria"])}>{(Object.keys(categoriaLabel) as Cerca["categoria"][]).map((c) => <option key={c} value={c}>{categoriaLabel[c]}</option>)}</select></div><div className="form-field"><label>Geometria</label><select value={forma} onChange={(e) => setForma(e.target.value as NonNullable<Cerca["forma"]>)}>{(Object.keys(formaLabel) as NonNullable<Cerca["forma"]>[]).map((f) => <option key={f} value={f}>{formaLabel[f]}</option>)}</select></div></div>
    <div className="form-row"><div className="form-field"><label>Tolerância (m)</label><input type="number" value={tolerancia} onChange={(e) => setTolerancia(e.target.value)} /></div><div className="form-field"><label>Vigência</label><Toggle checked={permanente} onChange={setPermanente} label={permanente ? "Permanente" : "30 dias"} /></div></div>
    <div className="cerca-desenho-preview"><Map size={20} /><span><strong>Desenhar no mapa</strong><small>Clique para adicionar pontos; duplo clique encerra o desenho.</small></span><Route size={20} /></div>
    <div className="modal-actions"><button className="secondary-btn" onClick={onClose}>Cancelar</button><button className="primary-btn" disabled={!nome.trim()} onClick={() => onCreate({ id: newId("CE"), nome: nome.trim(), descricao: descricao.trim(), categoria, politica: { permanenciaMaxMin: null, limiteKmh: null, janela: "24h" }, ativa: true, local: local.trim(), versao: 1, forma, toleranciaM: Number(tolerancia), extensaoKm: 0, veiculos: [veiculo], vigenciaInicio: new Date().toISOString().slice(0, 10), vigenciaFim: permanente ? null : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) })}><Check size={13} /> Salvar e vincular</button></div>
  </Modal>;
}
