import { useMemo, useState } from "react";
import { AlertTriangle, Check, Clock3, MapPin, MapPinned, Plus, Send } from "lucide-react";
import { Modal, Tag, Toggle, useStoredState } from "../shared";
import {
  STORAGE, catalogoMacros, categoriaPontoLabel, newId, nivelDesvioLabel,
  nivelDesvioTone, nomeMacro, nomePonto, pontosIniciais, rotogramasIniciais,
  type CategoriaPonto, type ConfiguracaoVeiculo, type PontoDeControle, type Rotograma, type Trecho,
} from "../domain";
import type { ControleArvoreVeiculos, VehicleNavigatorProps } from "./perfil/VehicleNavigator";

export function usePontos() { return useStoredState<PontoDeControle[]>(STORAGE.pontos, pontosIniciais); }

type AbaGeo = "rotograma" | "pontos";

export function ControlPointsView({ pontos, setPontos, configs, veiculo, arvore, busca, onBusca, onLimparBusca, onToast, VehicleNavigator }: {
  pontos: PontoDeControle[];
  setPontos: (next: PontoDeControle[] | ((c: PontoDeControle[]) => PontoDeControle[])) => void;
  configs: ConfiguracaoVeiculo[];
  veiculo: { atual: string; selecionar: (v: string) => void };
  arvore?: ControleArvoreVeiculos;
  busca: string;
  onBusca: (valor: string) => void;
  onLimparBusca: () => void;
  onToast: (message: string) => void;
  VehicleNavigator: React.ComponentType<VehicleNavigatorProps>;
}) {
  const [rotogramas, setRotogramas] = useStoredState<Rotograma[]>(STORAGE.rotogramas, rotogramasIniciais);
  const [aba, setAba] = useState<AbaGeo>("rotograma");
  const [showNew, setShowNew] = useState(false);
  const [pontoId, setPontoId] = useState(pontos[0]?.id ?? "");
  const [trechoId, setTrechoId] = useState("");
  const [navegadorRecolhidoLocal, setNavegadorRecolhidoLocal] = useState(false);
  const navegadorRecolhido = arvore?.estado.painelRecolhido ?? navegadorRecolhidoLocal;
  const config = configs.find((c) => c.veiculo === veiculo.atual) ?? configs[0];
  const rotograma = rotogramas.find((r) => r.veiculo === config.veiculo);
  const trechoSelecionado = rotograma?.trechos.find((t) => t.id === trechoId) ?? rotograma?.trechos[rotograma.trechoAtual] ?? rotograma?.trechos[0];
  const idsNoRotograma = useMemo(() => new Set(rotograma?.trechos.flatMap((t) => [t.de, t.para]) ?? []), [rotograma]);
  const pontoSelecionado = pontos.find((p) => p.id === pontoId) ?? pontos[0];
  const semPrecedencia = pontos.filter((p) => p.sobrepoe.length > 0 && p.precedencia === null && p.sobrepoe.some((id) => pontos.find((outro) => outro.id === id)?.precedencia === null));

  const patchTrecho = (id: string, fn: (t: Trecho) => Trecho) => {
    if (!rotograma) return;
    setRotogramas((atuais) => atuais.map((r) => r.id === rotograma.id ? { ...r, trechos: r.trechos.map((t) => t.id === id ? fn(t) : t) } : r));
  };
  const publicar = () => {
    if (!rotograma) return;
    setRotogramas((atuais) => atuais.map((r) => r.id === rotograma.id ? { ...r, versao: r.versao + 1 } : r));
    onToast(`Rotograma de ${config.veiculo} publicado como v${rotograma.versao + 1}.`);
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
            {aba === "rotograma" && rotograma ? <button className="geo-btn primario" onClick={publicar}><Send size={13} /> Publicar</button> : null}
            {aba === "pontos" ? <button className="geo-btn primario" onClick={() => setShowNew(true)}><Plus size={13} /> Novo ponto</button> : null}
          </div>
        </header>
        <nav className="wsp-abas eq-abas" role="tablist" aria-label="Geografia operacional">
          <button role="tab" aria-selected={aba === "rotograma"} className={aba === "rotograma" ? "ativa" : ""} onClick={() => setAba("rotograma")}>Rotograma</button>
          <button role="tab" aria-selected={aba === "pontos"} className={aba === "pontos" ? "ativa" : ""} onClick={() => setAba("pontos")}>Pontos de controle · {pontos.length}</button>
        </nav>
        {semPrecedencia.length ? <div className="eq-alerta"><AlertTriangle size={13} /> {semPrecedencia.length} ponto(s) sobrepostos precisam de precedência</div> : null}
        <div className="geo-corpo">
          {aba === "rotograma" ? <RotogramaWorkspace rotograma={rotograma} pontos={pontos} trecho={trechoSelecionado} onTrecho={setTrechoId} onPatch={patchTrecho} /> : null}
          {aba === "pontos" ? <PontosWorkspace pontos={pontos} selecionado={pontoSelecionado} noRotograma={idsNoRotograma} onSelecionar={setPontoId} onPatch={(id, fn) => setPontos((atuais) => atuais.map((p) => p.id === id ? fn(p) : p))} /> : null}
        </div>
      </section>
    </div>
    {showNew ? <NewPointModal onClose={() => setShowNew(false)} onCreate={(ponto) => { setPontos((atuais) => [...atuais, ponto]); setPontoId(ponto.id); setShowNew(false); setAba("pontos"); onToast(`Ponto “${ponto.nome}” criado.`); }} /> : null}
  </div>;
}

function RotogramaWorkspace({ rotograma, pontos, trecho, onTrecho, onPatch }: { rotograma?: Rotograma; pontos: PontoDeControle[]; trecho?: Trecho; onTrecho: (id: string) => void; onPatch: (id: string, fn: (t: Trecho) => Trecho) => void }) {
  if (!rotograma) return <div className="geo-empty"><MapPinned size={28} /><strong>Nenhum rotograma para este veículo</strong><span>Crie uma jornada a partir dos pontos de controle cadastrados.</span><button className="geo-btn primario"><Plus size={13} /> Criar rotograma</button></div>;
  return <div className="geo-rotograma-grid">
    <div className="geo-mapa-card">
      <div className="geo-card-head"><div><strong>Visão da viagem</strong><span>{rotograma.trechos.reduce((total, t) => total + t.distanciaKm, 0)} km planejados · {rotograma.trechos.length} trechos</span></div><Tag tone={nivelDesvioTone[rotograma.nivel]}>{nivelDesvioLabel[rotograma.nivel]} · {rotograma.desvioMin > 0 ? "+" : ""}{rotograma.desvioMin} min</Tag></div>
      <MapaOperacional pontos={pontos} rotograma={rotograma} />
      <div className="geo-legenda"><span><i className="feito" /> concluído</span><span><i className="atual" /> em curso</span><span><i /> planejado</span></div>
    </div>
    <aside className="geo-itinerario">
      <div className="geo-card-head"><div><strong>Sequência do rotograma</strong><span>Clique em um trecho para configurar</span></div></div>
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
    </aside>
  </div>;
}

function PontosWorkspace({ pontos, selecionado, noRotograma, onSelecionar, onPatch }: { pontos: PontoDeControle[]; selecionado?: PontoDeControle; noRotograma: Set<string>; onSelecionar: (id: string) => void; onPatch: (id: string, fn: (p: PontoDeControle) => PontoDeControle) => void }) {
  return <div className="geo-pontos-grid">
    <div className="geo-lista-pontos"><div className="geo-card-head"><div><strong>Catálogo de pontos</strong><span>Áreas reutilizáveis nos rotogramas</span></div></div>{pontos.map((p) => <button key={p.id} className={`geo-ponto-item ${selecionado?.id === p.id ? "selecionado" : ""}`} onClick={() => onSelecionar(p.id)}><MapPin size={14} /><span><strong>{p.nome}</strong><small>{p.local} · raio {p.raioM} m</small></span>{noRotograma.has(p.id) ? <Tag tone="blue">na viagem</Tag> : null}</button>)}</div>
    <div className="geo-mapa-card"><div className="geo-card-head"><div><strong>Pontos no mapa</strong><span>Selecione um ponto para editar</span></div></div><MapaOperacional pontos={pontos} /></div>
    {selecionado ? <aside className="geo-inspetor"><div className="geo-card-head"><div><strong>{selecionado.nome}</strong><span>{selecionado.id} · v{selecionado.versao}</span></div><Toggle checked={selecionado.ativo} onChange={(ativo) => onPatch(selecionado.id, (p) => ({ ...p, ativo }))} /></div>
      <label>Categoria<select value={selecionado.categoria} onChange={(e) => onPatch(selecionado.id, (p) => ({ ...p, categoria: e.target.value as CategoriaPonto }))}>{(Object.keys(categoriaPontoLabel) as CategoriaPonto[]).map((c) => <option key={c} value={c}>{categoriaPontoLabel[c]}</option>)}</select></label>
      <label>Macro ao entrar<select value={selecionado.politica.macro} onChange={(e) => onPatch(selecionado.id, (p) => ({ ...p, politica: { ...p.politica, macro: e.target.value } }))}>{catalogoMacros.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></label>
      <div className="geo-campos"><CampoNumero label="Raio" unidade="m" valor={selecionado.raioM} onChange={(raioM) => onPatch(selecionado.id, (p) => ({ ...p, raioM }))} /><CampoNumero label="Permanência máx." unidade="min" valor={selecionado.politica.permanenciaMaxMin} onChange={(permanenciaMaxMin) => onPatch(selecionado.id, (p) => ({ ...p, politica: { ...p.politica, permanenciaMaxMin } }))} /></div>
      <div className="geo-resumo-regra"><Clock3 size={13} /><span>Ao entrar, registra <strong>{nomeMacro(selecionado.politica.macro)}</strong>. Janela {selecionado.politica.janela}.</span></div>
      {selecionado.sobrepoe.length ? <label>Precedência<select value={selecionado.precedencia ?? ""} onChange={(e) => onPatch(selecionado.id, (p) => ({ ...p, precedencia: e.target.value ? Number(e.target.value) : null }))}><option value="">Definir</option><option value="1">1 · prevalece</option><option value="2">2 · cede</option></select></label> : null}
      <label className="geo-toggle-linha"><span><strong>Ponto fixo</strong><small>Permanece após limpar a viagem</small></span><Toggle checked={selecionado.fixo} onChange={(fixo) => onPatch(selecionado.id, (p) => ({ ...p, fixo }))} /></label>
    </aside> : null}
  </div>;
}

function MapaOperacional({ pontos, rotograma }: { pontos: PontoDeControle[]; rotograma?: Rotograma }) {
  const ids = rotograma ? [rotograma.trechos[0]?.de, ...rotograma.trechos.map((t) => t.para)].filter(Boolean) : pontos.slice(0, 6).map((p) => p.id);
  const posicoes = [[12, 72], [29, 50], [46, 63], [62, 35], [78, 45], [90, 20]];
  const caminho = posicoes.slice(0, ids.length).map(([x, y]) => `${x},${y}`).join(" ");
  return <div className="geo-mapa"><svg viewBox="0 0 100 85" preserveAspectRatio="none" aria-label="Mapa do rotograma"><path className="geo-rio" d="M-5 78 C22 54, 34 88, 58 62 S82 28, 106 37" /><g className="geo-estradas"><path d="M0 18 L100 74" /><path d="M5 65 L92 12" /><path d="M38 0 L57 85" /></g>{rotograma ? <polyline className="geo-rota-sombra" points={caminho} /> : null}{rotograma ? <polyline className="geo-rota" points={caminho} /> : null}{ids.map((id, i) => { const [x, y] = posicoes[i] ?? posicoes[posicoes.length - 1]; const p = pontos.find((item) => item.id === id); return <g key={`${id}-${i}`} className="geo-map-marker" transform={`translate(${x} ${y})`}><circle r={rotograma?.trechoAtual === i ? 3.7 : 3} /><text y="-5">{i + 1}</text><title>{p?.nome ?? id}</title></g>; })}</svg><span className="geo-cidade c1">Campinas</span><span className="geo-cidade c2">Seropédica</span><span className="geo-cidade c3">Itaguaí</span></div>;
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
  const [fixo, setFixo] = useState(false);
  return <Modal title="Novo ponto de controle" description="Cadastre a área uma vez e reutilize-a nos rotogramas dos veículos." onClose={onClose}>
    <div className="form-field"><label>Nome</label><input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
    <div className="form-field"><label>Localização</label><input value={local} onChange={(e) => setLocal(e.target.value)} /></div>
    <div className="form-row"><div className="form-field"><label>Categoria</label><select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaPonto)}>{(Object.keys(categoriaPontoLabel) as CategoriaPonto[]).map((c) => <option key={c} value={c}>{categoriaPontoLabel[c]}</option>)}</select></div><div className="form-field"><label>Macro ao entrar</label><select value={macro} onChange={(e) => setMacro(e.target.value)}>{catalogoMacros.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></div></div>
    <div className="form-row"><div className="form-field"><label>Raio (m)</label><input type="number" value={raio} onChange={(e) => setRaio(e.target.value)} /></div><div className="form-field"><label>Ponto fixo</label><Toggle checked={fixo} onChange={setFixo} label={fixo ? "Fixo" : "Temporário"} /></div></div>
    <div className="modal-actions"><button className="secondary-btn" onClick={onClose}>Cancelar</button><button className="primary-btn" disabled={!nome.trim() || !macro} onClick={() => onCreate({ id: newId("PC"), nome: nome.trim(), categoria, politica: { macro, permanenciaMaxMin: 60, permanenciaMinMin: 0, janela: "24h" }, fixo, precedencia: null, ativo: true, raioM: Number(raio), local: local.trim(), sobrepoe: [], versao: 1 })}><Check size={13} /> Salvar ponto</button></div>
  </Modal>;
}
