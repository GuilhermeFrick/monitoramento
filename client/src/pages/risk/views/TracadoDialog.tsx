/**
 * Como a jornada ganha um traçado.
 *
 * São três caminhos, e eles existem porque as operações chegam de três jeitos
 * diferentes: quem já tem a rota homologada pega do catálogo; quem roteiriza em
 * outra ferramenta importa o arquivo; e quem está montando a viagem agora pede
 * ao roteirizador a partir das paradas.
 *
 * O terceiro depende de serviço externo, e isso aparece na tela em vez de ficar
 * escondido — ver `mapa/roteirizador.ts`.
 */
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Check, FileUp, Loader2, MapPin, Plus, Route, Settings2, Trash2, Waypoints } from "lucide-react";
import { Modal, Tag } from "../shared";
import {
  perfilRoteirizacaoPadrao, veiculoRoteirizacaoLabel,
  type FonteTracado, type GeometriaLinha, type PerfilRoteirizacao, type PontoDeControle, type Rota,
} from "../domain";
import { MapaGeo, type FormaMapa } from "../mapa/MapaGeo";
import { centroDe, comprimentoM, formatarDistancia } from "../mapa/geometria";
import { ErroImportacao, MAX_VERTICES_LINHA, importarTracado, type ResultadoImportacao } from "../mapa/importarTracado";
import { descreverPerfil, roteirizar, type RespostaRoteirizacao } from "../mapa/roteirizador";

export type TracadoEscolhido = {
  tracado: GeometriaLinha;
  fonte: FonteTracado;
  rotaId: string;
  /** Presente só na roteirização: distância e duração por perna, vindas do provedor. */
  pernas?: { distanciaKm: number; duracaoMin: number }[];
  /** Presente só na roteirização: a sequência de paradas que gerou o traçado. */
  paradas?: string[];
};

type Aba = "catalogo" | "importar" | "roteirizar";

export function TracadoDialog({ rotas, pontos, paradasAtuais, corredorPadrao, onClose, onAplicar }: {
  rotas: Rota[];
  pontos: PontoDeControle[];
  paradasAtuais: string[];
  corredorPadrao: number;
  onClose: () => void;
  onAplicar: (escolha: TracadoEscolhido) => void;
}) {
  const [aba, setAba] = useState<Aba>("catalogo");
  return <Modal title="Definir o traçado da viagem" description="Escolha uma rota homologada, traga um arquivo de fora ou peça ao roteirizador a partir das paradas." onClose={onClose} wide>
    <div className="segmented tracado-abas" role="tablist" aria-label="Origem do traçado">
      <button role="tab" aria-selected={aba === "catalogo"} className={aba === "catalogo" ? "active" : ""} onClick={() => setAba("catalogo")}><Route size={12} /> Catálogo</button>
      <button role="tab" aria-selected={aba === "importar"} className={aba === "importar" ? "active" : ""} onClick={() => setAba("importar")}><FileUp size={12} /> Importar arquivo</button>
      <button role="tab" aria-selected={aba === "roteirizar"} className={aba === "roteirizar" ? "active" : ""} onClick={() => setAba("roteirizar")}><Waypoints size={12} /> Roteirizar</button>
    </div>
    {aba === "catalogo" ? <AbaCatalogo rotas={rotas} onClose={onClose} onAplicar={onAplicar} /> : null}
    {aba === "importar" ? <AbaImportar corredorPadrao={corredorPadrao} onClose={onClose} onAplicar={onAplicar} /> : null}
    {aba === "roteirizar" ? <AbaRoteirizar pontos={pontos} paradasAtuais={paradasAtuais} corredorPadrao={corredorPadrao} onClose={onClose} onAplicar={onAplicar} /> : null}
  </Modal>;
}

// ----------------------------------------------------------------- Catálogo

function AbaCatalogo({ rotas, onClose, onAplicar }: { rotas: Rota[]; onClose: () => void; onAplicar: (e: TracadoEscolhido) => void }) {
  const [rotaId, setRotaId] = useState(rotas.find((r) => r.ativa)?.id ?? rotas[0]?.id ?? "");
  const rota = rotas.find((r) => r.id === rotaId);
  const formas = useMemo<FormaMapa[]>(() => rota ? [{ id: rota.id, geometria: rota.geometria, estilo: "rota", rotulo: rota.nome }] : [], [rota]);

  if (!rotas.length) return <p className="tracado-vazio">Nenhuma rota cadastrada. Use a tela de Rotas para criar uma, ou traga o traçado por importação ou roteirização.</p>;

  return <>
    <p className="tracado-nota">O traçado é <strong>copiado</strong> para a jornada. Alterar a rota no catálogo depois não muda uma jornada já emitida — ela só muda no próximo embarque.</p>
    <div className="tracado-corpo">
      <div className="tracado-lista">
        {rotas.map((r) => <button key={r.id} className={`tracado-item ${r.id === rotaId ? "selecionado" : ""}`} onClick={() => setRotaId(r.id)}>
          <Route size={14} />
          <span><strong>{r.nome}</strong><small>{r.origem} → {r.destino} · {formatarDistancia(comprimentoM(r.geometria.vertices))} · corredor {r.geometria.corredorM} m</small></span>
          {r.ativa ? null : <Tag>inativa</Tag>}
        </button>)}
      </div>
      <div className="tracado-mapa"><MapaGeo formas={formas} rotulo="Prévia da rota escolhida" ajuste={`prev-${rotaId}`} altura={230} /></div>
    </div>
    <div className="modal-actions">
      <button className="secondary-btn" onClick={onClose}>Cancelar</button>
      <button className="primary-btn" disabled={!rota} onClick={() => rota && onAplicar({
        tracado: rota.geometria,
        rotaId: rota.id,
        fonte: { tipo: "catalogo", rotaId: rota.id, em: new Date().toISOString() },
      })}><Check size={13} /> Usar esta rota</button>
    </div>
  </>;
}

// ---------------------------------------------------------------- Importação

function AbaImportar({ corredorPadrao, onClose, onAplicar }: { corredorPadrao: number; onClose: () => void; onAplicar: (e: TracadoEscolhido) => void }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [corredor, setCorredor] = useState(corredorPadrao);

  const receber = async (arquivo: File) => {
    setErro(null);
    try {
      const texto = await arquivo.text();
      setResultado(importarTracado(arquivo.name, texto, corredor));
    } catch (falha) {
      setResultado(null);
      setErro(falha instanceof ErroImportacao ? falha.message : "Não foi possível ler o arquivo.");
    }
  };

  const formas = useMemo<FormaMapa[]>(() => resultado
    ? [{ id: "importado", geometria: { ...resultado.geometria, corredorM: corredor }, estilo: "rota", rotulo: resultado.arquivo }]
    : [], [resultado, corredor]);
  const perdeuPontos = resultado && resultado.verticesFinais < resultado.verticesOriginais;

  return <>
    <div
      className="tracado-solta"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const a = e.dataTransfer.files[0]; if (a) void receber(a); }}
    >
      <FileUp size={20} />
      <div>
        <strong>Arraste o arquivo aqui ou escolha do computador</strong>
        <small>GPX, KML ou GeoJSON. A leitura é local: o arquivo não sai do navegador.</small>
      </div>
      <button className="secondary-btn" onClick={() => entrada.current?.click()}>Escolher arquivo</button>
      <input ref={entrada} type="file" accept=".gpx,.kml,.geojson,.json" hidden onChange={(e) => { const a = e.target.files?.[0]; if (a) void receber(a); }} />
    </div>

    {erro ? <div className="tracado-erro"><AlertTriangle size={14} /> {erro}</div> : null}

    {resultado ? <>
      <div className="tracado-corpo">
        <div className="tracado-resumo">
          <h4>{resultado.arquivo}</h4>
          <dl>
            <div><dt>Formato</dt><dd>{resultado.formato.toUpperCase()}</dd></div>
            <div><dt>Extensão</dt><dd>{resultado.extensaoKm} km</dd></div>
            <div><dt>Pontos no arquivo</dt><dd>{resultado.verticesOriginais}</dd></div>
            <div><dt>Vértices embarcados</dt><dd>{resultado.verticesFinais}</dd></div>
          </dl>
          <label>Corredor<span className="geo-numero"><input type="number" min={25} step={50} value={corredor} onChange={(e) => setCorredor(Math.max(25, Number(e.target.value)))} /><small>m</small></span></label>
          {perdeuPontos ? <p className="tracado-aviso">
            O arquivo trazia {resultado.verticesOriginais} pontos e o traçado foi simplificado para {resultado.verticesFinais},
            que é o que cabe no limite estimado de {MAX_VERTICES_LINHA} vértices do equipamento. A forma do caminho é preservada;
            a precisão ponto a ponto, não.
          </p> : null}
        </div>
        <div className="tracado-mapa"><MapaGeo formas={formas} rotulo="Prévia do traçado importado" ajuste={`imp-${resultado.arquivo}-${resultado.verticesFinais}`} altura={230} /></div>
      </div>
      <div className="modal-actions">
        <button className="secondary-btn" onClick={onClose}>Cancelar</button>
        <button className="primary-btn" onClick={() => onAplicar({
          tracado: { ...resultado.geometria, corredorM: corredor },
          rotaId: "",
          fonte: { tipo: "importacao", arquivo: resultado.arquivo, formato: resultado.formato, verticesOriginais: resultado.verticesOriginais, em: new Date().toISOString() },
        })}><Check size={13} /> Usar este traçado</button>
      </div>
    </> : null}
  </>;
}

// -------------------------------------------------------------- Roteirização

function AbaRoteirizar({ pontos, paradasAtuais, corredorPadrao, onClose, onAplicar }: {
  pontos: PontoDeControle[];
  paradasAtuais: string[];
  corredorPadrao: number;
  onClose: () => void;
  onAplicar: (e: TracadoEscolhido) => void;
}) {
  const [paradas, setParadas] = useState<string[]>(paradasAtuais.length >= 2 ? paradasAtuais : pontos.slice(0, 2).map((p) => p.id));
  const [perfil, setPerfil] = useState<PerfilRoteirizacao>(perfilRoteirizacaoPadrao);
  const [corredor, setCorredor] = useState(corredorPadrao);
  const [calculando, setCalculando] = useState(false);
  const [resposta, setResposta] = useState<RespostaRoteirizacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarPerfil, setMostrarPerfil] = useState(false);

  const pontoDe = (id: string) => pontos.find((p) => p.id === id);
  const disponiveis = pontos.filter((p) => p.ativo);
  const invalidar = () => { setResposta(null); setErro(null); };

  const mover = (indice: number, passo: number) => {
    const destino = indice + passo;
    if (destino < 0 || destino >= paradas.length) return;
    const copia = [...paradas];
    [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
    setParadas(copia);
    invalidar();
  };
  const trocar = (indice: number, id: string) => { setParadas(paradas.map((p, i) => i === indice ? id : p)); invalidar(); };
  const remover = (indice: number) => { if (paradas.length <= 2) return; setParadas(paradas.filter((_, i) => i !== indice)); invalidar(); };
  const adicionar = () => {
    const candidato = disponiveis.find((p) => !paradas.includes(p.id)) ?? disponiveis[0];
    if (candidato) { setParadas([...paradas, candidato.id]); invalidar(); }
  };

  const calcular = async () => {
    const coordenadas = paradas.map((id) => pontoDe(id)).filter(Boolean).map((p) => centroDe(p!.geometria));
    if (coordenadas.length < 2) { setErro("Escolha ao menos uma origem e um destino."); return; }
    setCalculando(true);
    setErro(null);
    try {
      setResposta(await roteirizar({ paradas: coordenadas, perfil, corredorM: corredor }));
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "A roteirização falhou.");
    } finally {
      setCalculando(false);
    }
  };

  const formas = useMemo<FormaMapa[]>(() => {
    const lista: FormaMapa[] = paradas.map((id, indice) => {
      const ponto = pontoDe(id);
      return ponto ? { id: `${id}-${indice}`, geometria: ponto.geometria, estilo: "ponto" as const, rotulo: `${indice + 1}. ${ponto.nome}` } : null;
    }).filter(Boolean) as FormaMapa[];
    if (resposta) lista.unshift({ id: "calculada", geometria: resposta.geometria, estilo: "rota", rotulo: `${resposta.provedor} · ${formatarDistancia(comprimentoM(resposta.geometria.vertices))}` });
    return lista;
  }, [paradas, pontos, resposta]);

  const totalKm = resposta?.pernas.reduce((soma, p) => soma + p.distanciaKm, 0) ?? 0;
  const totalMin = resposta?.pernas.reduce((soma, p) => soma + p.duracaoMin, 0) ?? 0;

  return <>
    <p className="tracado-nota">O rotograma é plano sobre <strong>pontos de controle</strong>: escolha a origem, as paradas e o destino, e o roteirizador liga os três.</p>

    <div className="tracado-corpo">
      <div className="tracado-paradas">
        <div className="tracado-paradas-topo"><strong>Sequência de paradas</strong><button className="secondary-btn" onClick={adicionar}><Plus size={12} /> Parada</button></div>
        <ol>{paradas.map((id, indice) => <li key={`${id}-${indice}`}>
          <span className={`tracado-parada-num ${indice === 0 ? "origem" : indice === paradas.length - 1 ? "destino" : ""}`}>{indice === 0 ? "A" : indice === paradas.length - 1 ? "B" : indice}</span>
          <select value={id} aria-label={`Parada ${indice + 1}`} onChange={(e) => trocar(indice, e.target.value)}>
            {disponiveis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <button type="button" title="Subir" aria-label={`Mover parada ${indice + 1} para cima`} disabled={indice === 0} onClick={() => mover(indice, -1)}><ArrowUp size={11} /></button>
          <button type="button" title="Descer" aria-label={`Mover parada ${indice + 1} para baixo`} disabled={indice === paradas.length - 1} onClick={() => mover(indice, 1)}><ArrowDown size={11} /></button>
          <button type="button" title="Remover" aria-label={`Remover parada ${indice + 1}`} disabled={paradas.length <= 2} onClick={() => remover(indice)}><Trash2 size={11} /></button>
        </li>)}</ol>

        <button className="tracado-perfil-toggle" onClick={() => setMostrarPerfil((v) => !v)} aria-expanded={mostrarPerfil}>
          <Settings2 size={12} /> Perfil do veículo <small>{veiculoRoteirizacaoLabel[perfil.veiculo]} · {descreverPerfil(perfil)}</small>
        </button>
        {mostrarPerfil ? <div className="tracado-perfil">
          <label>Veículo<select value={perfil.veiculo} onChange={(e) => { setPerfil({ ...perfil, veiculo: e.target.value as PerfilRoteirizacao["veiculo"] }); invalidar(); }}>
            {(Object.keys(veiculoRoteirizacaoLabel) as PerfilRoteirizacao["veiculo"][]).map((v) => <option key={v} value={v}>{veiculoRoteirizacaoLabel[v]}</option>)}
          </select></label>
          <div className="geo-campos">
            <label>Altura<span className="geo-numero"><input type="number" step={0.1} value={perfil.alturaM} onChange={(e) => { setPerfil({ ...perfil, alturaM: Number(e.target.value) }); invalidar(); }} /><small>m</small></span></label>
            <label>Peso<span className="geo-numero"><input type="number" value={perfil.pesoT} onChange={(e) => { setPerfil({ ...perfil, pesoT: Number(e.target.value) }); invalidar(); }} /><small>t</small></span></label>
          </div>
          <label className="tracado-check"><input type="checkbox" checked={perfil.evitarPedagio} onChange={(e) => { setPerfil({ ...perfil, evitarPedagio: e.target.checked }); invalidar(); }} /> Evitar pedágio</label>
          <label className="tracado-check"><input type="checkbox" checked={perfil.evitarBalsa} onChange={(e) => { setPerfil({ ...perfil, evitarBalsa: e.target.checked }); invalidar(); }} /> Evitar balsa</label>
          <label className="tracado-check"><input type="checkbox" checked={perfil.evitarViaNaoPavimentada} onChange={(e) => { setPerfil({ ...perfil, evitarViaNaoPavimentada: e.target.checked }); invalidar(); }} /> Evitar via não pavimentada</label>
          <label>Corredor<span className="geo-numero"><input type="number" min={25} step={50} value={corredor} onChange={(e) => { setCorredor(Math.max(25, Number(e.target.value))); invalidar(); }} /><small>m</small></span></label>
        </div> : null}

        <button className="primary-btn tracado-calcular" onClick={() => void calcular()} disabled={calculando}>
          {calculando ? <><Loader2 size={13} className="girando" /> Calculando…</> : <><Waypoints size={13} /> Calcular traçado</>}
        </button>
        {erro ? <div className="tracado-erro"><AlertTriangle size={14} /> {erro}</div> : null}
      </div>

      <div className="tracado-mapa">
        <MapaGeo formas={formas} rotulo="Prévia da roteirização" ajuste={`rot-${paradas.join("-")}-${resposta?.calculadoEm ?? ""}`} altura={230} />
        {resposta ? <div className="tracado-pernas">
          <div className="tracado-pernas-topo"><strong>{totalKm} km · {Math.floor(totalMin / 60)}h{String(totalMin % 60).padStart(2, "0")}</strong><span>{resposta.pernas[0]?.velocidadeMediaKmh} km/h médios</span></div>
          <ol>{resposta.pernas.map((perna, i) => <li key={i}>
            <span>{pontoDe(paradas[i])?.nome} → {pontoDe(paradas[i + 1])?.nome}</span>
            <strong>{perna.distanciaKm} km · {perna.duracaoMin} min</strong>
          </li>)}</ol>
        </div> : null}
      </div>
    </div>

    {resposta?.aviso ? <div className="tracado-aviso-provedor"><AlertTriangle size={14} /><div><strong>{resposta.provedor}</strong><span>{resposta.aviso}</span></div></div> : null}

    <div className="modal-actions">
      <button className="secondary-btn" onClick={onClose}>Cancelar</button>
      <button className="primary-btn" disabled={!resposta} onClick={() => resposta && onAplicar({
        tracado: resposta.geometria,
        rotaId: "",
        fonte: { tipo: "roteirizacao", provedor: resposta.provedor, perfil, em: resposta.calculadoEm },
        pernas: resposta.pernas,
        paradas,
      })}><Check size={13} /> Usar este traçado</button>
    </div>
  </>;
}

export function ResumoFonte({ fonte }: { fonte: FonteTracado | null }) {
  if (!fonte) return <span className="tracado-fonte sem"><MapPin size={11} /> Sem traçado definido</span>;
  if (fonte.tipo === "catalogo") return <span className="tracado-fonte"><Route size={11} /> Rota {fonte.rotaId} do catálogo</span>;
  if (fonte.tipo === "importacao") return <span className="tracado-fonte"><FileUp size={11} /> {fonte.arquivo} · {fonte.formato.toUpperCase()} · {fonte.verticesOriginais} pontos originais</span>;
  return <span className="tracado-fonte"><Waypoints size={11} /> {fonte.provedor} · {veiculoRoteirizacaoLabel[fonte.perfil.veiculo]}</span>;
}
