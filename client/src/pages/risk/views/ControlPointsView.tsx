import { useMemo, useState } from "react";
import { AlertTriangle, Check, Clock3, Layers, MapPin, MapPinned, Pencil, Plus, Route, Send, Sliders, Upload } from "lucide-react";
import { Modal, Tag, Toggle, useStoredState } from "../shared";
import {
  MAX_VERTICES_POLIGONO, STORAGE, catalogoMacros, categoriaPontoLabel, newId, nivelDesvioLabel,
  nivelDesvioTone, nomeMacro, nomePonto, pontosIniciais, rotogramasIniciais,
  rotasIniciais,
  type CategoriaPonto, type ConfiguracaoVeiculo, type GeometriaArea, type PontoDeControle, type Rota, type Rotograma, type TipoGeometria, type Trecho,
} from "../domain";
import { MapaGeo, type FormaMapa } from "../mapa/MapaGeo";
import { PainelRecolhivel } from "../mapa/PainelRecolhivel";
import { TracadoDialog, ResumoFonte, type TracadoEscolhido } from "./TracadoDialog";
import { BarraFerramentas, EditorGeometria } from "../mapa/EditorGeometria";
import { centroDe, medidaDe, paresSobrepostos } from "../mapa/geometria";
import type { ControleArvoreVeiculos, VehicleNavigatorProps } from "./perfil/VehicleNavigator";

/** Um ponto com sobreposição merece marca no trilho: é o que trava o embarque. */
function conflitosDe(sobrepostos: ReturnType<typeof paresSobrepostos<PontoDeControle>>, id: string): boolean {
  return sobrepostos.some(({ a, b }) => (a.id === id || b.id === id) && a.precedencia === null && b.precedencia === null);
}

export function usePontos() { return useStoredState<PontoDeControle[]>(STORAGE.pontos, pontosIniciais); }

type AbaGeo = "rotograma" | "pontos";

/** Um ponto de controle é área: círculo ou polígono. Retângulo entra pela troca de forma. */
const FORMAS_DE_AREA: TipoGeometria[] = ["circulo", "poligono", "retangulo"];

export function ControlPointsView({ pontos, setPontos, configs, veiculo, arvore, busca, onBusca, onLimparBusca, onToast, onRascunho, VehicleNavigator }: {
  pontos: PontoDeControle[];
  setPontos: (next: PontoDeControle[] | ((c: PontoDeControle[]) => PontoDeControle[])) => void;
  configs: ConfiguracaoVeiculo[];
  veiculo: { atual: string; selecionar: (v: string) => void };
  arvore?: ControleArvoreVeiculos;
  busca: string;
  onBusca: (valor: string) => void;
  onLimparBusca: () => void;
  onToast: (message: string) => void;
  /** Editar geometria é alteração de rascunho: entra no changelog do veículo afetado. */
  onRascunho?: (veiculos: string[], descricao: string) => void;
  VehicleNavigator: React.ComponentType<VehicleNavigatorProps>;
}) {
  const [rotogramas, setRotogramas] = useStoredState<Rotograma[]>(STORAGE.rotogramas, rotogramasIniciais);
  const [aba, setAba] = useState<AbaGeo>("rotograma");
  const [showNew, setShowNew] = useState(false);
  const [pontoId, setPontoId] = useState(pontos[0]?.id ?? "");
  const [trechoId, setTrechoId] = useState("");
  const [ferramenta, setFerramenta] = useState<TipoGeometria | null>(null);
  const [listaRecolhida, setListaRecolhida] = useStoredState(STORAGE.painelPontos, false);
  const [inspetorRecolhido, setInspetorRecolhido] = useStoredState(STORAGE.inspetorPontos, false);
  const [itinerarioRecolhido, setItinerarioRecolhido] = useStoredState(STORAGE.painelItinerario, false);
  const [rotas] = useStoredState<Rota[]>(STORAGE.rotas, rotasIniciais);
  const [showTracado, setShowTracado] = useState(false);
  const [navegadorRecolhidoLocal, setNavegadorRecolhidoLocal] = useState(false);
  const navegadorRecolhido = arvore?.estado.painelRecolhido ?? navegadorRecolhidoLocal;
  const config = configs.find((c) => c.veiculo === veiculo.atual) ?? configs[0];
  const rotograma = rotogramas.find((r) => r.veiculo === config.veiculo);
  const trechoSelecionado = rotograma?.trechos.find((t) => t.id === trechoId) ?? rotograma?.trechos[rotograma.trechoAtual] ?? rotograma?.trechos[0];
  const idsNoRotograma = useMemo(() => new Set(rotograma?.trechos.flatMap((t) => [t.de, t.para]) ?? []), [rotograma]);
  const pontoSelecionado = pontos.find((p) => p.id === pontoId) ?? pontos[0];

  /** Sobreposição real no mapa, não a lista declarada: é ela que trava o embarque. */
  const sobrepostos = useMemo(() => paresSobrepostos(pontos.filter((p) => p.ativo)), [pontos]);
  const semPrecedencia = sobrepostos.filter(({ a, b }) => a.precedencia === null && b.precedencia === null);

  /** Quais veículos carregam este ponto na política embarcada. */
  const veiculosDoPonto = (id: string) => rotogramas.filter((r) => r.trechos.some((t) => t.de === id || t.para === id)).map((r) => r.veiculo);

  const patchPonto = (id: string, descricao: string, fn: (p: PontoDeControle) => PontoDeControle) => {
    setPontos((atuais) => atuais.map((p) => p.id === id ? { ...fn(p), versao: p.versao + 1 } : p));
    const afetados = veiculosDoPonto(id);
    if (afetados.length) onRascunho?.(afetados, `${descricao} · ${nomePonto(id, pontos)}`);
  };
  const patchTrecho = (id: string, fn: (t: Trecho) => Trecho) => {
    if (!rotograma) return;
    setRotogramas((atuais) => atuais.map((r) => r.id === rotograma.id ? { ...r, trechos: r.trechos.map((t) => t.id === id ? fn(t) : t) } : r));
    onRascunho?.([rotograma.veiculo], `Limites do trecho ajustados · ${rotograma.id}`);
  };
  /**
   * Aplica o traçado escolhido e, quando ele veio do roteirizador, reconstrói os
   * trechos a partir das paradas — distância e duração passam a ser as que o
   * provedor calculou, em vez de números digitados à mão.
   */
  const aplicarTracado = (escolha: TracadoEscolhido) => {
    if (!rotograma) return;
    setRotogramas((atuais) => atuais.map((r) => {
      if (r.id !== rotograma.id) return r;
      const trechos = escolha.paradas && escolha.pernas
        ? escolha.paradas.slice(0, -1).map((de, i) => {
            const para = escolha.paradas![i + 1];
            const anterior = r.trechos.find((t) => t.de === de && t.para === para) ?? r.trechos[i];
            return {
              id: anterior?.id ?? `T${i + 1}`,
              de, para,
              distanciaKm: escolha.pernas![i].distanciaKm,
              duracaoMin: escolha.pernas![i].duracaoMin,
              limites: anterior?.limites ?? { velocidadeKmh: 80, paradaMaxMin: 15, direcaoContinuaMaxMin: 240 },
            };
          })
        : r.trechos;
      return { ...r, tracado: escolha.tracado, fonte: escolha.fonte, rota: escolha.rotaId, trechos, trechoAtual: Math.min(r.trechoAtual, Math.max(0, trechos.length - 1)) };
    }));
    setShowTracado(false);
    onRascunho?.([rotograma.veiculo], `Traçado da jornada redefinido · ${rotograma.id}`);
    onToast(escolha.fonte.tipo === "roteirizacao"
      ? "Traçado calculado e trechos atualizados com a distância e a duração do provedor."
      : "Traçado aplicado à jornada.");
  };

  const publicar = () => {
    if (!rotograma) return;
    setRotogramas((atuais) => atuais.map((r) => r.id === rotograma.id ? { ...r, versao: r.versao + 1 } : r));
    onToast(`Rotograma de ${config.veiculo} publicado como v${rotograma.versao + 1}.`);
  };
  const criarPonto = (ponto: PontoDeControle) => {
    setPontos((atuais) => [...atuais, ponto]);
    setPontoId(ponto.id);
    setShowNew(false);
    setFerramenta(null);
    setAba("pontos");
    onToast(`Ponto “${ponto.nome}” criado. Vincule-o a um rotograma para embarcá-lo.`);
  };

  return <div className="wsp geo-wsp">
    <div className={`wsp-corpo sem-inspetor ${navegadorRecolhido ? "nav-recolhida" : ""}`}>
      <VehicleNavigator
        configs={configs} selecionado={config.veiculo} busca={busca} onBusca={onBusca} onLimparBusca={onLimparBusca}
        onSelecionar={veiculo.selecionar} recolhido={navegadorRecolhido} arvore={arvore}
        onAlternar={() => setNavegadorRecolhidoLocal((atual) => !atual)}
      />
      <section className="wsp-canvas-wrap" aria-label="Pontos de controle e rotograma">
        <header className="wsp-canvas-toolbar geo-toolbar">
          <div className="eq-identidade"><MapPinned size={17} /><div><h2>{config.veiculo} · {aba === "rotograma" ? "Rotograma" : "Pontos de controle"}</h2><p>{rotograma ? `${rotograma.nome} · rota ${rotograma.rota} · v${rotograma.versao}` : "Nenhum rotograma vinculado"}</p></div></div>
          <div className="geo-toolbar-acoes">
            {aba === "rotograma" && rotograma ? <button className="geo-btn" onClick={() => setShowTracado(true)}><Route size={13} /> {rotograma.tracado ? "Trocar traçado" : "Definir traçado"}</button> : null}
            {aba === "rotograma" && rotograma ? <button className="geo-btn primario" onClick={publicar}><Send size={13} /> Publicar</button> : null}
            {aba === "pontos" ? <button className="geo-btn primario" onClick={() => setShowNew(true)}><Plus size={13} /> Novo ponto</button> : null}
          </div>
        </header>
        <nav className="wsp-abas eq-abas" role="tablist" aria-label="Geografia operacional">
          <button role="tab" aria-selected={aba === "rotograma"} className={aba === "rotograma" ? "ativa" : ""} onClick={() => setAba("rotograma")}>Rotograma</button>
          <button role="tab" aria-selected={aba === "pontos"} className={aba === "pontos" ? "ativa" : ""} onClick={() => setAba("pontos")}>Pontos de controle · {pontos.length}</button>
        </nav>
        {semPrecedencia.length ? <div className="eq-alerta">
          <AlertTriangle size={13} /> {semPrecedencia.length} sobreposição(ões) sem precedência declarada — o equipamento recusa o embarque
          <button onClick={() => { setAba("pontos"); setPontoId(semPrecedencia[0].a.id); }}>Resolver</button>
        </div> : null}
        <div className="geo-corpo">
          {aba === "rotograma" ? <RotogramaWorkspace
            rotograma={rotograma} pontos={pontos} trecho={trechoSelecionado}
            recolhido={itinerarioRecolhido} onRecolher={() => setItinerarioRecolhido(!itinerarioRecolhido)}
            onTrecho={setTrechoId} onPatch={patchTrecho} onDefinirTracado={() => setShowTracado(true)}
          /> : null}
          {aba === "pontos" ? <PontosWorkspace
            pontos={pontos} selecionado={pontoSelecionado} noRotograma={idsNoRotograma}
            sobrepostos={sobrepostos} ferramenta={ferramenta} onFerramenta={setFerramenta}
            listaRecolhida={listaRecolhida} inspetorRecolhido={inspetorRecolhido}
            onLista={() => setListaRecolhida(!listaRecolhida)} onInspetor={() => setInspetorRecolhido(!inspetorRecolhido)}
            onSelecionar={setPontoId} onPatch={patchPonto} onCriar={criarPonto}
            veiculosDoPonto={veiculosDoPonto}
          /> : null}
        </div>
      </section>
    </div>
    {showNew ? <NewPointModal onClose={() => setShowNew(false)} onCreate={criarPonto} /> : null}
    {showTracado && rotograma ? <TracadoDialog
      rotas={rotas}
      pontos={pontos}
      paradasAtuais={rotograma.trechos.length ? [rotograma.trechos[0].de, ...rotograma.trechos.map((t) => t.para)] : []}
      corredorPadrao={rotograma.tracado?.corredorM ?? 300}
      onClose={() => setShowTracado(false)}
      onAplicar={aplicarTracado}
    /> : null}
  </div>;
}

// ---------------------------------------------------------------- Rotograma
//
// Rotograma não se desenha: é plano sobre pontos que já existem. O mapa liga os
// pontos na ordem dos trechos e mostra qual está em curso — por isso aqui não há
// barra de ferramentas de desenho, só leitura e os limites por trecho.

function RotogramaWorkspace({ rotograma, pontos, trecho, recolhido, onRecolher, onTrecho, onPatch, onDefinirTracado }: {
  rotograma?: Rotograma;
  pontos: PontoDeControle[];
  trecho?: Trecho;
  recolhido: boolean;
  onRecolher: () => void;
  onTrecho: (id: string) => void;
  onPatch: (id: string, fn: (t: Trecho) => Trecho) => void;
  onDefinirTracado: () => void;
}) {
  const formas = useMemo<FormaMapa[]>(() => {
    if (!rotograma) return [];
    const lista: FormaMapa[] = [];
    // Com traçado definido, ele é o que o veículo segue e o que se embarca. As
    // ligações diretas entre paradas ficam só para a jornada ainda sem traçado,
    // onde valem como esboço do plano — e aí a tela pede para definir o traçado.
    if (rotograma.tracado) {
      lista.push({
        id: `${rotograma.id}-tracado`,
        estilo: "rota",
        geometria: rotograma.tracado,
        rotulo: `Traçado da viagem · corredor ${rotograma.tracado.corredorM} m`,
      });
    }
    rotograma.trechos.forEach((t, indice) => {
      const de = pontos.find((p) => p.id === t.de);
      const para = pontos.find((p) => p.id === t.para);
      if (!de || !para) return;
      const estado = indice < rotograma.trechoAtual ? "trecho-feito" : indice === rotograma.trechoAtual ? "trecho-atual" : "trecho";
      lista.push({
        id: `${rotograma.id}-${t.id}`,
        estilo: rotograma.tracado && estado === "trecho" ? "trecho" : estado,
        rotulo: `Trecho ${indice + 1} · ${t.distanciaKm} km · ${t.duracaoMin} min · máx ${t.limites.velocidadeKmh} km/h`,
        geometria: { tipo: "linha", corredorM: 0, vertices: [centroDe(de.geometria), centroDe(para.geometria)] },
        aoClicar: () => onTrecho(t.id),
      });
    });
    const usados = new Set(rotograma.trechos.flatMap((t) => [t.de, t.para]));
    for (const id of Array.from(usados)) {
      const ponto = pontos.find((p) => p.id === id);
      if (!ponto) continue;
      lista.push({
        id: ponto.id,
        geometria: ponto.geometria,
        estilo: !ponto.ativo ? "ponto-inativo" : ponto.fixo ? "ponto-fixo" : "ponto",
        rotulo: `${ponto.nome} · ${medidaDe(ponto.geometria)}${ponto.fixo ? " · ponto fixo" : ""}`,
      });
    }
    return lista;
  }, [rotograma, pontos, onTrecho]);

  if (!rotograma) return <div className="geo-empty"><MapPinned size={28} /><strong>Nenhum rotograma para este veículo</strong><span>Crie uma jornada a partir dos pontos de controle cadastrados.</span><button className="geo-btn primario"><Plus size={13} /> Criar rotograma</button></div>;

  const totalKm = rotograma.trechos.reduce((total, t) => total + t.distanciaKm, 0);
  return <div className={`geo-rotograma-grid ${recolhido ? "itinerario-recolhido" : ""}`}>
    <div className="geo-mapa-card">
      <div className="geo-card-head"><div><strong>Visão da viagem</strong><span>{totalKm} km planejados · {rotograma.trechos.length} trechos</span></div><Tag tone={nivelDesvioTone[rotograma.nivel]}>{nivelDesvioLabel[rotograma.nivel]} · {rotograma.desvioMin > 0 ? "+" : ""}{rotograma.desvioMin} min</Tag></div>
      <div className="geo-tracado-barra">
        <ResumoFonte fonte={rotograma.fonte} />
        <button className="geo-btn" onClick={onDefinirTracado}><Pencil size={12} /> {rotograma.tracado ? "Trocar traçado" : "Definir traçado"}</button>
      </div>
      {!rotograma.tracado ? <div className="geo-sem-tracado">
        <AlertTriangle size={13} />
        <span>Esta jornada ainda não tem traçado: as linhas do mapa ligam as paradas em reta e servem só como esboço. Escolha uma rota do catálogo, importe um arquivo ou roteirize as paradas.</span>
      </div> : null}
      <MapaGeo formas={formas} ajuste={`rg-${rotograma.id}-${rotograma.fonte?.em ?? ""}`} rotulo={`Mapa do rotograma de ${rotograma.veiculo}`} />
      <div className="geo-legenda">
        <span><i className="feito" /> concluído</span><span><i className="atual" /> em curso</span><span><i /> planejado</span>
        <span><i className="rota" /> traçado</span>
        <span className="geo-legenda-nota">adiantar também é desvio</span>
      </div>
    </div>
    <PainelRecolhivel
      recolhido={recolhido}
      onAlternar={onRecolher}
      titulo="Sequência do rotograma"
      subtitulo="Clique num trecho, aqui ou no mapa"
      lado="direita"
      classe="geo-itinerario"
      atalhos={rotograma.trechos.map((t, index) => ({
        id: t.id,
        icone: <span className="geo-trilho-num">{index + 1}</span>,
        rotulo: `Trecho ${index + 1} · ${nomePonto(t.de, pontos)} → ${nomePonto(t.para, pontos)}`,
        ativo: trecho?.id === t.id,
        estado: index < rotograma.trechoAtual ? "ok" : index === rotograma.trechoAtual ? "atencao" : "inativo",
        aoClicar: () => onTrecho(t.id),
      }))}
    >
      <div className="geo-trechos">{rotograma.trechos.map((t, index) => {
        const ativo = trecho?.id === t.id;
        const estado = index < rotograma.trechoAtual ? "concluido" : index === rotograma.trechoAtual ? "em-curso" : "planejado";
        return <button key={t.id} className={`geo-trecho ${ativo ? "selecionado" : ""}`} onClick={() => onTrecho(t.id)}>
          <span className={`geo-trecho-num ${estado}`}>{index + 1}</span><span><strong>{nomePonto(t.de, pontos)} → {nomePonto(t.para, pontos)}</strong><small>{t.distanciaKm} km · {t.duracaoMin} min</small></span>{estado === "em-curso" ? <Tag tone="blue">em curso</Tag> : null}
        </button>;
      })}</div>
      {trecho ? <div className="geo-editor-trecho"><h3>Limites do trecho</h3><div className="geo-campos">
        <CampoNumero label="Duração" unidade="min" valor={trecho.duracaoMin} onChange={(valor) => onPatch(trecho.id, (t) => ({ ...t, duracaoMin: valor }))} />
        <CampoNumero label="Distância" unidade="km" valor={trecho.distanciaKm} onChange={(valor) => onPatch(trecho.id, (t) => ({ ...t, distanciaKm: valor }))} />
        <CampoNumero label="Velocidade" unidade="km/h" valor={trecho.limites.velocidadeKmh} onChange={(valor) => onPatch(trecho.id, (t) => ({ ...t, limites: { ...t.limites, velocidadeKmh: valor } }))} />
        <CampoNumero label="Parada máx." unidade="min" valor={trecho.limites.paradaMaxMin} onChange={(valor) => onPatch(trecho.id, (t) => ({ ...t, limites: { ...t.limites, paradaMaxMin: valor } }))} />
      </div></div> : null}
    </PainelRecolhivel>
  </div>;
}

// ----------------------------------------------------------------- Pontos

function PontosWorkspace({ pontos, selecionado, noRotograma, sobrepostos, ferramenta, listaRecolhida, inspetorRecolhido, onLista, onInspetor, onFerramenta, onSelecionar, onPatch, onCriar, veiculosDoPonto }: {
  pontos: PontoDeControle[];
  selecionado?: PontoDeControle;
  noRotograma: Set<string>;
  sobrepostos: ReturnType<typeof paresSobrepostos<PontoDeControle>>;
  ferramenta: TipoGeometria | null;
  listaRecolhida: boolean;
  inspetorRecolhido: boolean;
  onLista: () => void;
  onInspetor: () => void;
  onFerramenta: (t: TipoGeometria | null) => void;
  onSelecionar: (id: string) => void;
  onPatch: (id: string, descricao: string, fn: (p: PontoDeControle) => PontoDeControle) => void;
  onCriar: (p: PontoDeControle) => void;
  veiculosDoPonto: (id: string) => string[];
}) {
  const conflitos = selecionado ? sobrepostos.filter(({ a, b }) => a.id === selecionado.id || b.id === selecionado.id) : [];

  const formas = useMemo<FormaMapa[]>(() => {
    const lista: FormaMapa[] = pontos.map((p) => ({
      id: p.id,
      geometria: p.geometria,
      estilo: selecionado?.id === p.id ? "selecionado" : !p.ativo ? "ponto-inativo" : p.fixo ? "ponto-fixo" : "ponto",
      rotulo: `${p.nome} · ${medidaDe(p.geometria)}${p.ativo ? "" : " · inativo"}${p.fixo ? " · fixo" : ""}`,
      aoClicar: () => onSelecionar(p.id),
    }));
    // A região comum é leitura emergente: aparece, mas não existe ferramenta de desenhá-la.
    for (const { a, b, regiao } of sobrepostos) {
      if (regiao.length < 3) continue;
      lista.push({
        id: `ac-${a.id}-${b.id}`,
        estilo: "sobreposicao",
        geometria: { tipo: "poligono", vertices: regiao },
        rotulo: `Área de controle · ${a.nome} ∩ ${b.nome}${a.precedencia === null && b.precedencia === null ? " · sem precedência" : ""}`,
      });
    }
    return lista;
  }, [pontos, selecionado?.id, sobrepostos, onSelecionar]);

  const afetados = selecionado ? veiculosDoPonto(selecionado.id) : [];

  return <div className={`geo-pontos-grid ${listaRecolhida ? "lista-recolhida" : ""} ${inspetorRecolhido ? "inspetor-recolhido" : ""}`}>
    <PainelRecolhivel
      recolhido={listaRecolhida}
      onAlternar={onLista}
      titulo="Catálogo de pontos"
      subtitulo="Áreas reutilizáveis nos rotogramas"
      classe="geo-lista-pontos"
      atalhos={pontos.map((p) => ({
        id: p.id,
        icone: <MapPin size={15} />,
        rotulo: `${p.nome} · ${p.local}`,
        ativo: selecionado?.id === p.id,
        estado: !p.ativo ? "inativo" : conflitosDe(sobrepostos, p.id) ? "risco" : "ok",
        aoClicar: () => onSelecionar(p.id),
      }))}
    >
      {pontos.map((p) => <button key={p.id} className={`geo-ponto-item ${selecionado?.id === p.id ? "selecionado" : ""} ${p.ativo ? "" : "inativo"}`} onClick={() => onSelecionar(p.id)}>
        <MapPin size={14} /><span><strong>{p.nome}</strong><small>{p.local} · {medidaDe(p.geometria)}</small></span>
        {noRotograma.has(p.id) ? <Tag tone="blue">na viagem</Tag> : null}
      </button>)}
    </PainelRecolhivel>

    <div className="geo-mapa-card">
      <div className="geo-card-head"><div><strong>Pontos no mapa</strong><span>Arraste as alças para ajustar a área</span></div></div>
      <BarraFerramentas
        permitidos={FORMAS_DE_AREA}
        ativo={ferramenta}
        rotulo="Desenhar novo ponto de controle"
        onEscolher={onFerramenta}
        onCancelar={() => onFerramenta(null)}
      />
      <MapaGeo
        formas={formas}
        rotulo="Mapa dos pontos de controle"
        ajuste={`pt-${selecionado?.id ?? ""}-${pontos.length}`}
        editando={selecionado && !ferramenta ? {
          geometria: selecionado.geometria,
          onChange: (geometria) => onPatch(selecionado.id, "Área ajustada no mapa", (p) => ({ ...p, geometria: geometria as GeometriaArea })),
        } : null}
        desenhando={ferramenta ? {
          tipo: ferramenta,
          onCancelar: () => onFerramenta(null),
          onConcluir: (geometria) => onCriar(pontoNovo(geometria as GeometriaArea)),
        } : null}
      />
      <div className="geo-legenda">
        <span><i className="ponto" /> ativo</span><span><i className="fixo" /> fixo</span>
        <span><i className="inativo" /> inativo</span><span><i className="conflito" /> área de controle</span>
      </div>
    </div>

    {selecionado ? <PainelRecolhivel
      recolhido={inspetorRecolhido}
      onAlternar={onInspetor}
      titulo={selecionado.nome}
      subtitulo={`${selecionado.id} · v${selecionado.versao}`}
      lado="direita"
      classe="geo-inspetor"
      atalhos={[{ id: selecionado.id, icone: <Sliders size={15} />, rotulo: `Abrir configuração de ${selecionado.nome}`, ativo: true, estado: conflitosDe(sobrepostos, selecionado.id) ? "risco" : undefined, aoClicar: onInspetor }]}
    >
      <div className="geo-inspetor-acao"><Toggle checked={selecionado.ativo} onChange={(ativo) => onPatch(selecionado.id, ativo ? "Ponto ativado" : "Ponto inativado", (p) => ({ ...p, ativo }))} label={selecionado.ativo ? "Ativo" : "Inativo"} /></div>

      {conflitos.length ? <div className="geo-conflito">
        <AlertTriangle size={14} />
        <div>
          <strong>Sobrepõe {conflitos.length} outra(s) área(s)</strong>
          {conflitos.map(({ a, b }) => {
            const outro = a.id === selecionado.id ? b : a;
            const resolvido = selecionado.precedencia !== null || outro.precedencia !== null;
            return <p key={outro.id}>{outro.nome} — {resolvido ? "precedência declarada" : "sem regra de desempate"}</p>;
          })}
          <label>Precedência deste ponto
            <select value={selecionado.precedencia ?? ""} onChange={(e) => onPatch(selecionado.id, "Precedência declarada", (p) => ({ ...p, precedencia: e.target.value ? Number(e.target.value) : null }))}>
              <option value="">Não declarada</option>
              <option value="1">1 · prevalece</option>
              <option value="2">2 · cede</option>
            </select>
          </label>
          <span className="geo-conflito-nota"><Layers size={11} /> A região comum é leitura do mapa, não um cadastro.</span>
        </div>
      </div> : null}

      <EditorGeometria
        geometria={selecionado.geometria}
        permitirTroca={FORMAS_DE_AREA}
        onChange={(geometria) => onPatch(selecionado.id, "Geometria editada", (p) => ({ ...p, geometria: geometria as GeometriaArea }))}
      />

      <label>Categoria<select value={selecionado.categoria} onChange={(e) => onPatch(selecionado.id, "Categoria alterada", (p) => ({ ...p, categoria: e.target.value as CategoriaPonto }))}>{(Object.keys(categoriaPontoLabel) as CategoriaPonto[]).map((c) => <option key={c} value={c}>{categoriaPontoLabel[c]}</option>)}</select></label>
      <label>Macro ao entrar<select value={selecionado.politica.macro} onChange={(e) => onPatch(selecionado.id, "Macro de entrada alterada", (p) => ({ ...p, politica: { ...p.politica, macro: e.target.value } }))}>{catalogoMacros.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></label>
      <div className="geo-campos"><CampoNumero label="Permanência máx." unidade="min" valor={selecionado.politica.permanenciaMaxMin} onChange={(permanenciaMaxMin) => onPatch(selecionado.id, "Permanência alterada", (p) => ({ ...p, politica: { ...p.politica, permanenciaMaxMin } }))} /><CampoNumero label="Permanência mín." unidade="min" valor={selecionado.politica.permanenciaMinMin} onChange={(permanenciaMinMin) => onPatch(selecionado.id, "Permanência alterada", (p) => ({ ...p, politica: { ...p.politica, permanenciaMinMin } }))} /></div>
      <div className="geo-resumo-regra"><Clock3 size={13} /><span>Ao entrar, registra <strong>{nomeMacro(selecionado.politica.macro)}</strong>. Janela {selecionado.politica.janela}.</span></div>
      <label className="geo-toggle-linha"><span><strong>Ponto fixo</strong><small>Sobrevive à limpeza da política embarcada</small></span><Toggle checked={selecionado.fixo} onChange={(fixo) => onPatch(selecionado.id, fixo ? "Marcado como fixo" : "Deixou de ser fixo", (p) => ({ ...p, fixo }))} /></label>
      {afetados.length ? <div className="geo-afetados"><Upload size={12} /><span>Alterar esta área vira rascunho em <strong>{afetados.join(", ")}</strong>. Embarque pela política do veículo.</span></div> : null}
    </PainelRecolhivel> : null}
  </div>;
}

function pontoNovo(geometria: GeometriaArea): PontoDeControle {
  return {
    id: newId("PC"), nome: "Novo ponto de controle", categoria: "cliente",
    politica: { macro: catalogoMacros[0]?.id ?? "", permanenciaMaxMin: 60, permanenciaMinMin: 0, janela: "24h" },
    fixo: false, precedencia: null, ativo: true, geometria, local: "Definir", sobrepoe: [], versao: 1,
  };
}

function CampoNumero({ label, unidade, valor, onChange }: { label: string; unidade: string; valor: number; onChange: (valor: number) => void }) {
  return <label>{label}<span className="geo-numero"><input type="number" min="0" value={valor} onChange={(e) => onChange(Math.max(0, Number(e.target.value)))} /><small>{unidade}</small></span></label>;
}

function NewPointModal({ onClose, onCreate }: { onClose: () => void; onCreate: (ponto: PontoDeControle) => void }) {
  const [nome, setNome] = useState("Cliente Duque de Caxias · portaria 2");
  const [local, setLocal] = useState("Duque de Caxias · RJ");
  const [categoria, setCategoria] = useState<CategoriaPonto>("cliente");
  const [macro, setMacro] = useState(catalogoMacros[0]?.id ?? "");
  const [raio, setRaio] = useState("200");
  const [lat, setLat] = useState("-22.7856");
  const [lng, setLng] = useState("-43.3117");
  const [fixo, setFixo] = useState(false);
  return <Modal title="Novo ponto de controle" description="Ponto de controle é área, não alfinete. Informe o centro e o raio, ou desenhe direto no mapa pela barra de ferramentas." onClose={onClose}>
    <div className="form-field"><label>Nome</label><input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
    <div className="form-field"><label>Localização</label><input value={local} onChange={(e) => setLocal(e.target.value)} /></div>
    <div className="form-row"><div className="form-field"><label>Categoria</label><select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaPonto)}>{(Object.keys(categoriaPontoLabel) as CategoriaPonto[]).map((c) => <option key={c} value={c}>{categoriaPontoLabel[c]}</option>)}</select></div><div className="form-field"><label>Macro ao entrar</label><select value={macro} onChange={(e) => setMacro(e.target.value)}>{catalogoMacros.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></div></div>
    <div className="form-row"><div className="form-field"><label>Latitude</label><input type="number" step="0.0005" value={lat} onChange={(e) => setLat(e.target.value)} /></div><div className="form-field"><label>Longitude</label><input type="number" step="0.0005" value={lng} onChange={(e) => setLng(e.target.value)} /></div></div>
    <div className="form-row"><div className="form-field"><label>Raio (m)</label><input type="number" value={raio} onChange={(e) => setRaio(e.target.value)} /><div className="form-hint">Polígono e retângulo ficam disponíveis depois, no inspetor. Máximo estimado de {MAX_VERTICES_POLIGONO} vértices.</div></div><div className="form-field"><label>Ponto fixo</label><Toggle checked={fixo} onChange={setFixo} label={fixo ? "Sobrevive à limpeza" : "Removido na limpeza"} /></div></div>
    <div className="modal-actions"><button className="secondary-btn" onClick={onClose}>Cancelar</button><button className="primary-btn" disabled={!nome.trim() || !macro} onClick={() => onCreate({
      id: newId("PC"), nome: nome.trim(), categoria,
      politica: { macro, permanenciaMaxMin: 60, permanenciaMinMin: 0, janela: "24h" },
      fixo, precedencia: null, ativo: true,
      geometria: { tipo: "circulo", centro: { lat: Number(lat), lng: Number(lng) }, raioM: Math.max(25, Number(raio)) },
      local: local.trim(), sobrepoe: [], versao: 1,
    })}><Check size={13} /> Salvar ponto</button></div>
  </Modal>;
}
