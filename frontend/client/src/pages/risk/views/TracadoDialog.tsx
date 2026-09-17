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
import { AlertTriangle, Check, FileUp, MapPin, Route, Waypoints } from "lucide-react";
import { Modal, Tag } from "../shared";
import {
  veiculoRoteirizacaoLabel,
  type FonteTracado, type GeometriaLinha, type PontoDeControle, type Rota,
} from "../domain";
import { MapaGeo, type FormaMapa } from "../mapa/MapaGeo";
import { comprimentoM, formatarDistancia } from "../mapa/geometria";
import { ErroImportacao, MAX_VERTICES_LINHA, importarTracado, type ResultadoImportacao } from "../mapa/importarTracado";
import { RoutePlanner } from "./RoutePlanner";

export type TracadoEscolhido = {
  tracado: GeometriaLinha;
  fonte: FonteTracado;
  rotaId: string;
  /** Presente só na roteirização: distância e duração por perna, vindas do provedor. */
  pernas?: { distanciaKm: number; duracaoMin: number; vertices?: import("../domain").LatLng[] }[];
  /** Presente só na roteirização: a sequência de paradas que gerou o traçado. */
  paradas?: string[];
  novosPontos?: PontoDeControle[];
};

type Aba = "catalogo" | "importar" | "roteirizar";

export function TracadoDialog({ rotas, pontos, paradasAtuais, corredorPadrao, fonteAtual, rotaAtual, onClose, onAplicar }: {
  rotas: Rota[];
  pontos: PontoDeControle[];
  paradasAtuais: string[];
  corredorPadrao: number;
  fonteAtual?: FonteTracado | null;
  rotaAtual?: Pick<import("../domain").Rotograma, "tracado" | "trechos">;
  onClose: () => void;
  onAplicar: (escolha: TracadoEscolhido) => void;
}) {
  const [aba, setAba] = useState<Aba>("roteirizar");
  return <Modal title="Definir o traçado da viagem" description="Origem, paradas e destino. Ajuste o caminho e salve no rotograma." onClose={onClose} wide className="tracado-dialog">
    <div className="segmented tracado-abas" role="tablist" aria-label="Origem do traçado">
      <button role="tab" aria-selected={aba === "catalogo"} className={aba === "catalogo" ? "active" : ""} onClick={() => setAba("catalogo")}><Route size={12} /> Catálogo</button>
      <button role="tab" aria-selected={aba === "importar"} className={aba === "importar" ? "active" : ""} onClick={() => setAba("importar")}><FileUp size={12} /> Importar arquivo</button>
      <button role="tab" aria-selected={aba === "roteirizar"} className={aba === "roteirizar" ? "active" : ""} onClick={() => setAba("roteirizar")}><Waypoints size={12} /> Roteirizar</button>
    </div>
    {aba === "catalogo" ? <AbaCatalogo rotas={rotas} onClose={onClose} onAplicar={onAplicar} /> : null}
    {aba === "importar" ? <AbaImportar corredorPadrao={corredorPadrao} onClose={onClose} onAplicar={onAplicar} /> : null}
    {aba === "roteirizar" ? <RoutePlanner rotaAtual={rotaAtual} fonteAtual={fonteAtual} pontos={pontos} paradasAtuais={paradasAtuais} corredorPadrao={corredorPadrao} onClose={onClose} onAplicar={onAplicar} /> : null}
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

export function ResumoFonte({ fonte }: { fonte: FonteTracado | null }) {
  if (!fonte) return <span className="tracado-fonte sem"><MapPin size={11} /> Sem traçado definido</span>;
  if (fonte.tipo === "catalogo") return <span className="tracado-fonte"><Route size={11} /> Rota {fonte.rotaId} do catálogo</span>;
  if (fonte.tipo === "importacao") return <span className="tracado-fonte"><FileUp size={11} /> {fonte.arquivo} · {fonte.formato.toUpperCase()} · {fonte.verticesOriginais} pontos originais</span>;
  return <span className="tracado-fonte"><Waypoints size={11} /> {fonte.provedor} · {veiculoRoteirizacaoLabel[fonte.perfil.veiculo]}</span>;
}
