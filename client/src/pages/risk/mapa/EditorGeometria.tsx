/**
 * O mapa nunca pode ser a única forma de fazer alguma coisa.
 *
 * Tudo que se faz arrastando — mover centro, mudar raio, andar com um vértice,
 * inserir, remover, alargar corredor — tem aqui o mesmo efeito por campo
 * numérico e botão, alcançável por teclado e por leitor de tela. Quem está num
 * notebook pequeno, com mouse ruim ou sem mouse nenhum continua trabalhando.
 */
import { Circle, Hexagon, Minus, Plus, Spline, Square, Trash2, X } from "lucide-react";
import { MAX_VERTICES_POLIGONO, tipoGeometriaLabel, type Geometria, type LatLng, type TipoGeometria } from "../domain";
import { comprimentoM, deslocar, formatarArea, formatarDistancia, medidaDe, meio, validarGeometria, areaM2, verticesDe } from "./geometria";

const ICONES: Record<TipoGeometria, typeof Circle> = { circulo: Circle, poligono: Hexagon, retangulo: Square, linha: Spline };

/** As quatro formas que a geocerca nativa aceita — a barra não oferece mais nada. */
export function BarraFerramentas({ permitidos, ativo, onEscolher, onCancelar, rotulo }: {
  permitidos: TipoGeometria[];
  ativo: TipoGeometria | null;
  onEscolher: (tipo: TipoGeometria) => void;
  onCancelar: () => void;
  rotulo: string;
}) {
  return <div className="mapa-ferramentas" role="toolbar" aria-label={rotulo}>
    <span className="mapa-ferramentas-titulo">Desenhar</span>
    {permitidos.map((tipo) => {
      const Icone = ICONES[tipo];
      return <button
        key={tipo}
        type="button"
        className={ativo === tipo ? "ativa" : ""}
        aria-pressed={ativo === tipo}
        title={`${tipoGeometriaLabel[tipo]} — a geocerca do equipamento aceita esta forma`}
        onClick={() => ativo === tipo ? onCancelar() : onEscolher(tipo)}
      ><Icone size={13} /> {tipoGeometriaLabel[tipo]}</button>;
    })}
    {ativo ? <button type="button" className="cancelar" onClick={onCancelar}><X size={12} /> Cancelar (Esc)</button> : null}
  </div>;
}

export function AvisosGeometria({ geometria }: { geometria: Geometria }) {
  const problemas = validarGeometria(geometria);
  if (!problemas.length) return null;
  return <div className="mapa-avisos">{problemas.map((p) => <p key={p.mensagem} className={p.nivel}>{p.mensagem}</p>)}</div>;
}

const arredondar = (valor: number) => Math.round(valor * 1e6) / 1e6;

export function EditorGeometria({ geometria, onChange, permitirTroca }: {
  geometria: Geometria;
  onChange: (g: Geometria) => void;
  /** Áreas podem trocar entre círculo, polígono e retângulo; a linha de uma rota, não. */
  permitirTroca?: TipoGeometria[];
}) {
  const trocar = (tipo: TipoGeometria) => {
    if (tipo === geometria.tipo) return;
    const cantos = verticesDe(geometria);
    const centro = { lat: cantos.reduce((s, p) => s + p.lat, 0) / cantos.length, lng: cantos.reduce((s, p) => s + p.lng, 0) / cantos.length };
    const escala = geometria.tipo === "circulo" ? geometria.raioM : Math.max(150, comprimentoM(cantos) / 6);
    if (tipo === "circulo") onChange({ tipo, centro, raioM: Math.round(escala) });
    else if (tipo === "poligono") onChange({ tipo, vertices: cantos.length >= 3 ? cantos : [0, 72, 144, 216, 288].map((a) => deslocar(centro, escala, a)) });
    else if (tipo === "retangulo") {
      const lats = cantos.map((p) => p.lat);
      const lngs = cantos.map((p) => p.lng);
      onChange({ tipo, sudoeste: { lat: Math.min(...lats), lng: Math.min(...lngs) }, nordeste: { lat: Math.max(...lats), lng: Math.max(...lngs) } });
    }
  };

  const editarVertice = (indice: number, campo: keyof LatLng, valor: number) => {
    if (geometria.tipo !== "poligono" && geometria.tipo !== "linha") return;
    const vertices = geometria.vertices.map((v, i) => i === indice ? { ...v, [campo]: valor } : v);
    onChange({ ...geometria, vertices });
  };
  const inserirVertice = (indice: number) => {
    if (geometria.tipo !== "poligono" && geometria.tipo !== "linha") return;
    const { vertices } = geometria;
    const proximo = vertices[(indice + 1) % vertices.length];
    onChange({ ...geometria, vertices: [...vertices.slice(0, indice + 1), meio(vertices[indice], proximo), ...vertices.slice(indice + 1)] });
  };
  const removerVertice = (indice: number) => {
    if (geometria.tipo !== "poligono" && geometria.tipo !== "linha") return;
    const minimo = geometria.tipo === "poligono" ? 3 : 2;
    if (geometria.vertices.length <= minimo) return;
    onChange({ ...geometria, vertices: geometria.vertices.filter((_, i) => i !== indice) });
  };

  const vertices = geometria.tipo === "poligono" || geometria.tipo === "linha" ? geometria.vertices : [];
  const acimaDoLimite = geometria.tipo === "poligono" && vertices.length > MAX_VERTICES_POLIGONO;

  return <div className="geo-editor-geometria">
    <div className="geo-card-head"><div><strong>Geometria</strong><span>{tipoGeometriaLabel[geometria.tipo]} · {medidaDe(geometria)}</span></div></div>

    {permitirTroca && permitirTroca.length > 1 ? <div className="geo-troca-forma" role="group" aria-label="Tipo de geometria">
      {permitirTroca.map((tipo) => {
        const Icone = ICONES[tipo];
        return <button key={tipo} type="button" className={geometria.tipo === tipo ? "ativa" : ""} aria-pressed={geometria.tipo === tipo} onClick={() => trocar(tipo)}><Icone size={12} /> {tipoGeometriaLabel[tipo]}</button>;
      })}
    </div> : null}

    {geometria.tipo === "circulo" ? <>
      <div className="geo-campos">
        <CampoGeo label="Raio" unidade="m" passo={10} valor={geometria.raioM} onChange={(raioM) => onChange({ ...geometria, raioM: Math.max(25, raioM) })} />
        <CampoGeo label="Área" unidade="" somenteLeitura texto={formatarArea(Math.PI * geometria.raioM ** 2)} />
      </div>
      <div className="geo-campos">
        <CampoGeo label="Latitude" unidade="°" passo={0.0005} decimais valor={geometria.centro.lat} onChange={(lat) => onChange({ ...geometria, centro: { ...geometria.centro, lat: arredondar(lat) } })} />
        <CampoGeo label="Longitude" unidade="°" passo={0.0005} decimais valor={geometria.centro.lng} onChange={(lng) => onChange({ ...geometria, centro: { ...geometria.centro, lng: arredondar(lng) } })} />
      </div>
    </> : null}

    {geometria.tipo === "retangulo" ? <div className="geo-campos quatro">
      <CampoGeo label="Sul" unidade="°" passo={0.0005} decimais valor={geometria.sudoeste.lat} onChange={(lat) => onChange({ ...geometria, sudoeste: { ...geometria.sudoeste, lat: arredondar(lat) } })} />
      <CampoGeo label="Oeste" unidade="°" passo={0.0005} decimais valor={geometria.sudoeste.lng} onChange={(lng) => onChange({ ...geometria, sudoeste: { ...geometria.sudoeste, lng: arredondar(lng) } })} />
      <CampoGeo label="Norte" unidade="°" passo={0.0005} decimais valor={geometria.nordeste.lat} onChange={(lat) => onChange({ ...geometria, nordeste: { ...geometria.nordeste, lat: arredondar(lat) } })} />
      <CampoGeo label="Leste" unidade="°" passo={0.0005} decimais valor={geometria.nordeste.lng} onChange={(lng) => onChange({ ...geometria, nordeste: { ...geometria.nordeste, lng: arredondar(lng) } })} />
    </div> : null}

    {geometria.tipo === "linha" ? <div className="geo-campos">
      <CampoGeo label="Corredor" unidade="m" passo={50} valor={geometria.corredorM} onChange={(corredorM) => onChange({ ...geometria, corredorM: Math.max(25, corredorM) })} />
      <CampoGeo label="Extensão" unidade="" somenteLeitura texto={formatarDistancia(comprimentoM(geometria.vertices))} />
    </div> : null}

    {vertices.length ? <div className="geo-vertices">
      <div className="geo-vertices-topo">
        <span>{vertices.length} vértice(s){geometria.tipo === "poligono" ? ` · ${formatarArea(areaM2(vertices))}` : ""}</span>
        {acimaDoLimite ? <span className="acima">acima do limite estimado de {MAX_VERTICES_POLIGONO}</span> : null}
      </div>
      <ol>{vertices.map((v, i) => <li key={i}>
        <span className="geo-vertice-num">{i + 1}</span>
        <input type="number" step={0.0005} value={v.lat} aria-label={`Latitude do vértice ${i + 1}`} onChange={(e) => editarVertice(i, "lat", arredondar(Number(e.target.value)))} />
        <input type="number" step={0.0005} value={v.lng} aria-label={`Longitude do vértice ${i + 1}`} onChange={(e) => editarVertice(i, "lng", arredondar(Number(e.target.value)))} />
        <button type="button" title="Inserir vértice depois deste" aria-label={`Inserir vértice depois do ${i + 1}`} onClick={() => inserirVertice(i)}><Plus size={11} /></button>
        <button type="button" title="Remover este vértice" aria-label={`Remover vértice ${i + 1}`} disabled={vertices.length <= (geometria.tipo === "poligono" ? 3 : 2)} onClick={() => removerVertice(i)}><Minus size={11} /></button>
      </li>)}</ol>
      <p className="geo-dica-mapa">No mapa: arraste a alça vazada para inserir um vértice; <kbd>Alt</kbd> + clique remove.</p>
    </div> : null}

    <AvisosGeometria geometria={geometria} />
  </div>;
}

function CampoGeo({ label, unidade, valor, onChange, passo = 1, decimais, somenteLeitura, texto }: {
  label: string;
  unidade: string;
  valor?: number;
  onChange?: (valor: number) => void;
  passo?: number;
  decimais?: boolean;
  somenteLeitura?: boolean;
  texto?: string;
}) {
  if (somenteLeitura) return <label>{label}<span className="geo-numero somente-leitura">{texto}</span></label>;
  return <label>{label}<span className="geo-numero">
    <input type="number" step={passo} value={decimais ? valor : Math.round(valor ?? 0)} onChange={(e) => onChange?.(Number(e.target.value))} />
    {unidade ? <small>{unidade}</small> : null}
  </span></label>;
}

export function BotaoRemoverGeometria({ onRemover, rotulo }: { onRemover: () => void; rotulo: string }) {
  return <button type="button" className="geo-btn perigo" onClick={onRemover}><Trash2 size={12} /> {rotulo}</button>;
}
