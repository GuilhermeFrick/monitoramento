import { useMemo, useState } from "react";
import { CalendarDays, Check, Globe2, Link2, MapPin, Plus, Sliders, Truck, Unlink2, Upload } from "lucide-react";
import { Modal, Tag, Toggle, useStoredState } from "../shared";
import { STORAGE, cercasIniciais, newId, tipoGeometriaLabel, type Cerca, type ConfiguracaoVeiculo, type Geometria, type TipoGeometria } from "../domain";
import { MapaGeo, type FormaMapa } from "../mapa/MapaGeo";
import { PainelRecolhivel } from "../mapa/PainelRecolhivel";
import { BarraFerramentas, EditorGeometria } from "../mapa/EditorGeometria";
import { geometriaPadrao, medidaDe } from "../mapa/geometria";
import type { ControleArvoreVeiculos, VehicleNavigatorProps } from "./perfil/VehicleNavigator";

const categoriaLabel: Record<Cerca["categoria"], string> = { restrita: "Área restrita", operacional: "Área operacional", velocidade: "Limite de velocidade", horario: "Janela de horário" };

/** Uma cerca pode assumir qualquer das quatro formas que a geocerca nativa aceita. */
const FORMAS: TipoGeometria[] = ["circulo", "poligono", "retangulo", "linha"];

/** Centro do Rio: âncora de um desenho novo quando a cerca ainda não tem geometria. */
const ANCORA = { lat: -22.9068, lng: -43.1729 };

/** Vigência fora da janela de hoje não pode parecer igual a uma cerca vigente. */
function vigente(cerca: Cerca, hoje = new Date().toISOString().slice(0, 10)): boolean {
  if (cerca.vigenciaInicio && cerca.vigenciaInicio > hoje) return false;
  if (cerca.vigenciaFim && cerca.vigenciaFim < hoje) return false;
  return true;
}

export function FencesView({ configs, veiculo, arvore, busca, onBusca, onLimparBusca, onToast, onRascunho, VehicleNavigator }: {
  configs: ConfiguracaoVeiculo[];
  veiculo: { atual: string; selecionar: (v: string) => void };
  arvore?: ControleArvoreVeiculos;
  busca: string;
  onBusca: (valor: string) => void;
  onLimparBusca: () => void;
  onToast: (message: string) => void;
  /** Editar geometria vira rascunho nos veículos que carregam a cerca. */
  onRascunho?: (veiculos: string[], descricao: string) => void;
  VehicleNavigator: React.ComponentType<VehicleNavigatorProps>;
}) {
  const [cercas, setCercas] = useStoredState<Cerca[]>(STORAGE.cercas, cercasIniciais);
  const [aba, setAba] = useState<"vinculadas" | "catalogo">("vinculadas");
  const [cercaId, setCercaId] = useState(cercas[0]?.id ?? "");
  const [showNew, setShowNew] = useState(false);
  const [ferramenta, setFerramenta] = useState<TipoGeometria | null>(null);
  const [listaRecolhida, setListaRecolhida] = useStoredState(STORAGE.painelCercas, false);
  const [inspetorRecolhido, setInspetorRecolhido] = useStoredState(STORAGE.inspetorCercas, false);
  const [navegadorRecolhidoLocal, setNavegadorRecolhidoLocal] = useState(false);
  const navegadorRecolhido = arvore?.estado.painelRecolhido ?? navegadorRecolhidoLocal;
  const config = configs.find((c) => c.veiculo === veiculo.atual) ?? configs[0];

  // Completa cercas salvas com forma parcial, sem descartar ativações ou políticas já editadas.
  const cercasNormalizadas = useMemo(() => cercas.map((c) => {
    const base = cercasIniciais.find((item) => item.id === c.id);
    return {
      ...base, ...c,
      politica: { ...base?.politica, ...c.politica },
      veiculos: c.veiculos ?? base?.veiculos ?? [],
      geometria: c.geometria ?? base?.geometria ?? geometriaPadrao("circulo", ANCORA),
    } as Cerca;
  }), [cercas]);

  const vinculadas = useMemo(() => cercasNormalizadas.filter((c) => (c.veiculos ?? []).includes(config.veiculo)), [cercasNormalizadas, config.veiculo]);
  const visiveis = aba === "vinculadas" ? vinculadas : cercasNormalizadas;
  const cerca = cercasNormalizadas.find((c) => c.id === cercaId && visiveis.some((v) => v.id === c.id)) ?? visiveis[0] ?? cercasNormalizadas[0];
  const vinculada = Boolean(cerca && (cerca.veiculos ?? []).includes(config.veiculo));

  const patch = (id: string, descricao: string | null, fn: (c: Cerca) => Cerca) => {
    setCercas((atuais) => {
      const existente = atuais.find((c) => c.id === id);
      const base = existente ?? cercasNormalizadas.find((c) => c.id === id);
      if (!base) return atuais;
      const atualizada = { ...fn({ ...base }), versao: base.versao + 1 };
      return existente ? atuais.map((c) => c.id === id ? atualizada : c) : [atualizada, ...atuais];
    });
    const afetados = cercasNormalizadas.find((c) => c.id === id)?.veiculos ?? [];
    if (descricao && afetados.length) onRascunho?.(afetados, `${descricao} · ${cerca?.nome ?? id}`);
  };

  const alternarVinculo = () => {
    if (!cerca) return;
    const proximos = vinculada ? (cerca.veiculos ?? []).filter((v) => v !== config.veiculo) : [...(cerca.veiculos ?? []), config.veiculo];
    patch(cerca.id, null, (atual) => ({ ...atual, veiculos: proximos, vigenciaInicio: vinculada ? atual.vigenciaInicio : new Date().toISOString().slice(0, 10) }));
    onRascunho?.([config.veiculo], vinculada ? `Cerca desvinculada · ${cerca.nome}` : `Cerca vinculada · ${cerca.nome}`);
    onToast(vinculada ? `Cerca desvinculada de ${config.veiculo}.` : `Cerca vinculada a ${config.veiculo}.`);
  };

  const criarComGeometria = (geometria: Geometria) => {
    const nova: Cerca = {
      id: newId("CE"), nome: "Nova cerca", descricao: "Desenhada no mapa.", categoria: "operacional",
      politica: { permanenciaMaxMin: null, limiteKmh: null, janela: "24h" },
      ativa: true, local: "Definir", versao: 1, geometria,
      veiculos: [config.veiculo], vigenciaInicio: new Date().toISOString().slice(0, 10), vigenciaFim: null,
    };
    setCercas((atuais) => [nova, ...atuais]);
    setCercaId(nova.id);
    setAba("vinculadas");
    setFerramenta(null);
    onRascunho?.([config.veiculo], `Cerca criada · ${nova.nome}`);
    onToast(`Cerca desenhada e vinculada a ${config.veiculo}. Ajuste nome e política no inspetor.`);
  };

  const estiloDe = (item: Cerca): FormaMapa["estilo"] => {
    if (!item.ativa) return "cerca-inativa";
    if (!vigente(item)) return "cerca-vencida";
    return cerca?.id === item.id ? "selecionado" : "contexto";
  };

  // Contexto: as outras cercas do veículo continuam visíveis, apagadas, para o
  // operador ver o conjunto sem confundir com a que está editando.
  const formas = useMemo<FormaMapa[]>(() => {
    const conjunto = aba === "vinculadas" ? vinculadas : cercasNormalizadas;
    return conjunto.map((item) => ({
      id: item.id,
      geometria: item.geometria,
      estilo: estiloDe(item),
      rotulo: `${item.nome} · ${medidaDe(item.geometria)}${item.ativa ? "" : " · inativa"}${vigente(item) ? "" : " · fora da vigência"}`,
      aoClicar: () => setCercaId(item.id),
    }));
  }, [aba, vinculadas, cercasNormalizadas, cerca?.id]);

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
          {visiveis.length ? <div className={`cerca-grid ${listaRecolhida ? "lista-recolhida" : ""} ${inspetorRecolhido ? "inspetor-recolhido" : ""}`}>
            <PainelRecolhivel
              recolhido={listaRecolhida}
              onAlternar={() => setListaRecolhida(!listaRecolhida)}
              titulo={aba === "vinculadas" ? "Cercas deste veículo" : "Cercas disponíveis"}
              subtitulo="Selecione para visualizar e configurar"
              classe="cerca-lista"
              atalhos={visiveis.map((item) => ({
                id: item.id,
                icone: <Globe2 size={15} />,
                rotulo: `${item.nome} · ${item.local}`,
                ativo: cerca?.id === item.id,
                estado: !item.ativa ? "inativo" : vigente(item) ? "ok" : "atencao",
                aoClicar: () => setCercaId(item.id),
              }))}
            >
              {visiveis.map((item) => <button key={item.id} className={`cerca-item ${cerca?.id === item.id ? "selecionado" : ""} ${item.ativa ? "" : "inativa"}`} onClick={() => setCercaId(item.id)}>
                <span className={`cerca-icone cerca-${item.categoria}`}><Globe2 size={14} /></span>
                <span><strong>{item.nome}</strong><small>{item.local} · {tipoGeometriaLabel[item.geometria.tipo]}</small></span>
                <i className={item.ativa ? "ativo" : ""} />
              </button>)}
            </PainelRecolhivel>

            <div className="geo-mapa-card cerca-mapa-card">
              <div className="geo-card-head"><div><strong>{cerca.nome}</strong><span>{cerca.local} · {medidaDe(cerca.geometria)}</span></div><Tag tone={!cerca.ativa ? "neutral" : vigente(cerca) ? "teal" : "amber"}>{!cerca.ativa ? "Inativa" : vigente(cerca) ? "Ativa" : "Fora da vigência"}</Tag></div>
              <BarraFerramentas
                permitidos={FORMAS}
                ativo={ferramenta}
                rotulo="Desenhar nova cerca"
                onEscolher={setFerramenta}
                onCancelar={() => setFerramenta(null)}
              />
              <MapaGeo
                formas={formas}
                rotulo={`Mapa das cercas de ${config.veiculo}`}
                ajuste={`ce-${cerca.id}-${aba}`}
                editando={cerca && !ferramenta ? {
                  geometria: cerca.geometria,
                  onChange: (geometria) => patch(cerca.id, "Geometria ajustada no mapa", (c) => ({ ...c, geometria })),
                } : null}
                desenhando={ferramenta ? { tipo: ferramenta, onCancelar: () => setFerramenta(null), onConcluir: criarComGeometria } : null}
              />
              <div className="geo-legenda">
                <span><i className="selecionada" /> em edição</span><span><i className="contexto" /> outras do veículo</span>
                <span><i className="inativo" /> inativa</span><span><i className="vencida" /> fora da vigência</span>
              </div>
            </div>

            <PainelRecolhivel
              recolhido={inspetorRecolhido}
              onAlternar={() => setInspetorRecolhido(!inspetorRecolhido)}
              titulo="Configuração da cerca"
              subtitulo={`${cerca.id} · versão ${cerca.versao}`}
              lado="direita"
              classe="geo-inspetor cerca-inspetor"
              atalhos={[{ id: cerca.id, icone: <Sliders size={15} />, rotulo: `Abrir configuração de ${cerca.nome}`, ativo: true, aoClicar: () => setInspetorRecolhido(false) }]}
            >
              <div className="geo-inspetor-acao"><Toggle checked={cerca.ativa} onChange={(ativa) => patch(cerca.id, ativa ? "Cerca reativada" : "Cerca inativada", (c) => ({ ...c, ativa }))} label={cerca.ativa ? "Ativa" : "Inativa"} /></div>
              {!cerca.ativa ? <p className="geo-nota-inativa">Inativa continua cadastrada e some do mapa só de cor: desativar não é excluir.</p> : null}

              <div className={`cerca-vinculo ${vinculada ? "vinculado" : ""}`}>
                <Truck size={14} />
                <span><strong>{vinculada ? `Vinculada a ${config.veiculo}` : "Não vinculada"}</strong><small>{vinculada ? `Vigente desde ${cerca.vigenciaInicio ?? "hoje"}` : "A cerca continua disponível no catálogo"}</small></span>
                <button onClick={alternarVinculo}>{vinculada ? <Unlink2 size={13} /> : <Link2 size={13} />}{vinculada ? "Desvincular" : "Vincular"}</button>
              </div>

              <label>Nome<input value={cerca.nome} onChange={(e) => patch(cerca.id, "Nome alterado", (c) => ({ ...c, nome: e.target.value }))} /></label>
              <label>Categoria<select value={cerca.categoria} onChange={(e) => patch(cerca.id, "Categoria alterada", (c) => ({ ...c, categoria: e.target.value as Cerca["categoria"] }))}>{(Object.keys(categoriaLabel) as Cerca["categoria"][]).map((categoria) => <option key={categoria} value={categoria}>{categoriaLabel[categoria]}</option>)}</select></label>

              <EditorGeometria
                geometria={cerca.geometria}
                permitirTroca={FORMAS}
                onChange={(geometria) => patch(cerca.id, "Geometria editada", (c) => ({ ...c, geometria }))}
              />

              <div className="geo-campos">
                <CampoCerca label="Velocidade" unidade="km/h" valor={cerca.politica.limiteKmh ?? 0} onChange={(limiteKmh) => patch(cerca.id, "Limite de velocidade alterado", (c) => ({ ...c, politica: { ...c.politica, limiteKmh: limiteKmh || null } }))} />
                <CampoCerca label="Permanência" unidade="min" valor={cerca.politica.permanenciaMaxMin ?? 0} onChange={(permanenciaMaxMin) => patch(cerca.id, "Permanência alterada", (c) => ({ ...c, politica: { ...c.politica, permanenciaMaxMin } }))} />
              </div>
              <label>Janela operacional<input value={cerca.politica.janela} onChange={(e) => patch(cerca.id, "Janela alterada", (c) => ({ ...c, politica: { ...c.politica, janela: e.target.value } }))} /></label>

              <div className="geo-campos">
                <label>Vigência início<input type="date" value={cerca.vigenciaInicio ?? ""} onChange={(e) => patch(cerca.id, "Vigência alterada", (c) => ({ ...c, vigenciaInicio: e.target.value }))} /></label>
                <label>Vigência fim<input type="date" value={cerca.vigenciaFim ?? ""} onChange={(e) => patch(cerca.id, "Vigência alterada", (c) => ({ ...c, vigenciaFim: e.target.value || null }))} /></label>
              </div>
              <div className="cerca-vigencia"><CalendarDays size={14} /><span><strong>Vigência</strong><small>{cerca.vigenciaInicio ?? "Não iniciada"} → {cerca.vigenciaFim ?? "sem término"}{vigente(cerca) ? "" : " · fora da janela de hoje"}</small></span></div>
              <div className="cerca-resumo"><MapPin size={13} /><span>{categoriaLabel[cerca.categoria]} · {cerca.politica.permanenciaMaxMin === 0 ? "entrada proibida" : cerca.politica.permanenciaMaxMin ? `permanência máxima ${cerca.politica.permanenciaMaxMin} min` : "sem limite de permanência"}</span></div>
              {(cerca.veiculos ?? []).length ? <div className="geo-afetados"><Upload size={12} /><span>Alterações viram rascunho em <strong>{(cerca.veiculos ?? []).join(", ")}</strong>. Embarque pela política do veículo.</span></div> : null}
            </PainelRecolhivel>
          </div> : <div className="geo-empty"><Globe2 size={28} /><strong>Nenhuma cerca vinculada</strong><span>Abra o catálogo e vincule uma geometria existente a {config.veiculo}.</span><button className="geo-btn primario" onClick={() => setAba("catalogo")}><Link2 size={13} /> Abrir catálogo</button></div>}
        </div>
      </section>
    </div>
    {showNew ? <NewFenceModal veiculo={config.veiculo} onClose={() => setShowNew(false)} onCreate={(nova) => {
      setCercas((atuais) => [nova, ...atuais]);
      setCercaId(nova.id);
      setAba("vinculadas");
      setShowNew(false);
      onRascunho?.([config.veiculo], `Cerca criada · ${nova.nome}`);
      onToast(`Cerca “${nova.nome}” criada e vinculada a ${config.veiculo}.`);
    }} /> : null}
  </div>;
}

function CampoCerca({ label, unidade, valor, onChange }: { label: string; unidade: string; valor: number; onChange: (valor: number) => void }) {
  return <label>{label}<span className="geo-numero"><input type="number" min="0" value={valor} onChange={(e) => onChange(Math.max(0, Number(e.target.value)))} /><small>{unidade}</small></span></label>;
}

function NewFenceModal({ veiculo, onClose, onCreate }: { veiculo: string; onClose: () => void; onCreate: (cerca: Cerca) => void }) {
  const [nome, setNome] = useState("Corredor logístico · nova operação");
  const [descricao, setDescricao] = useState("Cerca para controle do trajeto autorizado.");
  const [local, setLocal] = useState("Campinas → Itaguaí");
  const [categoria, setCategoria] = useState<Cerca["categoria"]>("operacional");
  const [forma, setForma] = useState<TipoGeometria>("linha");
  const [lat, setLat] = useState("-22.9068");
  const [lng, setLng] = useState("-43.1729");
  const [escala, setEscala] = useState("600");
  const [permanente, setPermanente] = useState(true);
  return <Modal title="Nova cerca eletrônica" description="A geometria nasce aqui com um tamanho inicial e é ajustada no mapa ou pelos campos do inspetor." onClose={onClose} wide>
    <div className="form-row"><div className="form-field"><label>Nome</label><input value={nome} onChange={(e) => setNome(e.target.value)} /></div><div className="form-field"><label>Localização</label><input value={local} onChange={(e) => setLocal(e.target.value)} /></div></div>
    <div className="form-field"><label>Descrição</label><input value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
    <div className="form-row"><div className="form-field"><label>Categoria</label><select value={categoria} onChange={(e) => setCategoria(e.target.value as Cerca["categoria"])}>{(Object.keys(categoriaLabel) as Cerca["categoria"][]).map((c) => <option key={c} value={c}>{categoriaLabel[c]}</option>)}</select></div><div className="form-field"><label>Geometria</label><select value={forma} onChange={(e) => setForma(e.target.value as TipoGeometria)}>{FORMAS.map((f) => <option key={f} value={f}>{tipoGeometriaLabel[f]}</option>)}</select><div className="form-hint">São as quatro formas que a geocerca do equipamento reconhece.</div></div></div>
    <div className="form-row"><div className="form-field"><label>Latitude</label><input type="number" step="0.0005" value={lat} onChange={(e) => setLat(e.target.value)} /></div><div className="form-field"><label>Longitude</label><input type="number" step="0.0005" value={lng} onChange={(e) => setLng(e.target.value)} /></div></div>
    <div className="form-row"><div className="form-field"><label>Tamanho inicial (m)</label><input type="number" value={escala} onChange={(e) => setEscala(e.target.value)} /></div><div className="form-field"><label>Vigência</label><Toggle checked={permanente} onChange={setPermanente} label={permanente ? "Permanente" : "30 dias"} /></div></div>
    <div className="modal-actions"><button className="secondary-btn" onClick={onClose}>Cancelar</button><button className="primary-btn" disabled={!nome.trim()} onClick={() => onCreate({
      id: newId("CE"), nome: nome.trim(), descricao: descricao.trim(), categoria,
      politica: { permanenciaMaxMin: null, limiteKmh: null, janela: "24h" },
      ativa: true, local: local.trim(), versao: 1,
      geometria: geometriaPadrao(forma, { lat: Number(lat), lng: Number(lng) }, Math.max(50, Number(escala))),
      veiculos: [veiculo], vigenciaInicio: new Date().toISOString().slice(0, 10),
      vigenciaFim: permanente ? null : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    })}><Check size={13} /> Salvar e vincular</button></div>
  </Modal>;
}
