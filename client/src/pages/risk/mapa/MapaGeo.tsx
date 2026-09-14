/**
 * O mapa das telas de geografia — base real, geometria editável.
 *
 * Duas decisões que a estrutura deste arquivo protege:
 *
 * 1. **Leaflet só existe no cliente.** A biblioteca toca `window` e `document`
 *    ao carregar o módulo, e os smokes renderizam a aplicação no servidor com
 *    `renderToString`. Por isso o import é dinâmico dentro do efeito, e o
 *    servidor vê apenas uma `div` com altura reservada — o que também evita o
 *    pulo de layout quando o mapa monta.
 *
 * 2. **Arrastar não passa por React a cada quadro.** Durante o gesto as camadas
 *    são atualizadas direto no Leaflet e a medida aparece num balão; `onChange`
 *    é chamado uma vez, ao soltar. Isso mantém o arraste fluido e deixa o
 *    changelog de rascunho com uma entrada por gesto, não por pixel.
 */
import { useEffect, useRef, useState } from "react";
import type * as LeafletNS from "leaflet";
import {
  azimute, centroDe, circuloComoPoligono, comprimentoM, deslocar, distanciaM, envolvente,
  formatarArea, formatarDistancia, areaM2, meio, retanguloDe, verticesDe,
} from "./geometria";
import type { Geometria, LatLng, TipoGeometria } from "../domain";

export type EstiloForma =
  | "ponto" | "ponto-inativo" | "ponto-fixo" | "selecionado"
  | "cerca" | "cerca-inativa" | "cerca-vencida"
  | "rota" | "rota-inativa" | "sobreposicao" | "contexto"
  | "trecho" | "trecho-feito" | "trecho-atual";

export type FormaMapa = {
  id: string;
  geometria: Geometria;
  estilo: EstiloForma;
  rotulo?: string;
  /** Linha tracejada ligando pontos na ordem do rotograma, sem corredor. */
  aoClicar?: () => void;
};

export type MapaGeoProps = {
  formas: FormaMapa[];
  /** Geometria em edição por alças. `onChange` recebe o resultado ao fim do gesto. */
  editando?: { geometria: Geometria; onChange: (g: Geometria) => void } | null;
  /** Desenho em curso. `Esc` cancela, `Enter`/duplo clique conclui, Ctrl+Z desfaz. */
  desenhando?: { tipo: TipoGeometria; onConcluir: (g: Geometria) => void; onCancelar: () => void } | null;
  /** Quando esta chave muda, o mapa reenquadra no conteúdo. */
  ajuste?: string;
  rotulo: string;
  altura?: number;
};

/**
 * Base sem chave de API.
 *
 * A opção óbvia de base neutra (Carto Positron) passou a carimbar "API KEY
 * REQUIRED" nos tiles, o que inviabiliza usá-la sem contratar. Aqui a base vem
 * do OpenStreetMap e o tom neutro é obtido por filtro no painel de tiles
 * (`.leaflet-tile-pane`), que não toca nos vetores: cerca, ponto e corredor
 * continuam com a cor cheia da paleta sobre um fundo dessaturado.
 *
 * ⚠️ Para volume de produção, troque por um provedor contratado — o servidor
 * comunitário do OSM não é para tráfego de aplicação.
 */
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATRIBUICAO = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** Traço de cada estilo. Espelha a paleta do painel: petróleo age, âmbar atenta, vermelho bloqueia. */
const ESTILOS: Record<EstiloForma, LeafletNS.PathOptions> = {
  ponto: { color: "#0f7c75", weight: 2, fillColor: "#0f7c75", fillOpacity: 0.1 },
  "ponto-inativo": { color: "#98a4b0", weight: 1.5, dashArray: "4 4", fillColor: "#98a4b0", fillOpacity: 0.07 },
  "ponto-fixo": { color: "#1b5e7a", weight: 2, fillColor: "#1b5e7a", fillOpacity: 0.1 },
  selecionado: { color: "#0b5f59", weight: 3, fillColor: "#14a396", fillOpacity: 0.2 },
  cerca: { color: "#0f7c75", weight: 2, fillColor: "#0f7c75", fillOpacity: 0.12 },
  "cerca-inativa": { color: "#98a4b0", weight: 1.5, dashArray: "5 5", fillColor: "#98a4b0", fillOpacity: 0.06 },
  "cerca-vencida": { color: "#bb7a25", weight: 2, dashArray: "6 3", fillColor: "#e0a04e", fillOpacity: 0.1 },
  rota: { color: "#0f7c75", weight: 3, fillColor: "#0f7c75", fillOpacity: 0.14 },
  "rota-inativa": { color: "#98a4b0", weight: 2, dashArray: "5 5", fillColor: "#98a4b0", fillOpacity: 0.06 },
  sobreposicao: { color: "#d1635c", weight: 2, fillColor: "#d1635c", fillOpacity: 0.3 },
  contexto: { color: "#8fa0ae", weight: 1.5, fillColor: "#8fa0ae", fillOpacity: 0.05 },
  trecho: { color: "#8fa0ae", weight: 2, dashArray: "7 5" },
  "trecho-feito": { color: "#0f7c75", weight: 2.5 },
  "trecho-atual": { color: "#4f66a8", weight: 4 },
};

/**
 * Buscar o módulo do mapa, com uma segunda chance.
 *
 * A carga do chunk falha de vez em quando por motivo passageiro — rede instável,
 * ou a janela em que um deploy novo já trocou o `index.html` mas o navegador
 * ainda pede o arquivo antigo. Uma tentativa extra resolve a maioria desses
 * casos sem o operador perceber; o que sobrar cai na tela de falha, que tem
 * botão para tentar de novo à mão.
 */
async function carregarLeaflet(): Promise<typeof LeafletNS> {
  try {
    return await import("leaflet");
  } catch {
    await new Promise((resolver) => window.setTimeout(resolver, 400));
    return await import("leaflet");
  }
}

const paraLL = (p: LatLng): [number, number] => [p.lat, p.lng];
const daLL = (p: LeafletNS.LatLng): LatLng => ({ lat: p.lat, lng: p.lng });

/** Largura do corredor em pixels no zoom atual — a faixa tem largura real, não decorativa. */
function metrosEmPixels(metros: number, lat: number, mapa: LeafletNS.Map): number {
  const metrosPorPixel = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** mapa.getZoom();
  return Math.max(2, metros / metrosPorPixel);
}

export function MapaGeo({ formas, editando, desenhando, ajuste, rotulo, altura }: MapaGeoProps) {
  const hospedeiro = useRef<HTMLDivElement | null>(null);
  const mapa = useRef<LeafletNS.Map | null>(null);
  const leaflet = useRef<typeof LeafletNS | null>(null);
  const estaticas = useRef<LeafletNS.LayerGroup | null>(null);
  const edicao = useRef<LeafletNS.LayerGroup | null>(null);
  const rascunho = useRef<LeafletNS.LayerGroup | null>(null);
  const corredores = useRef<{ camada: LeafletNS.Polyline; metros: number; lat: number }[]>([]);
  const arrastando = useRef(false);
  /**
   * Os objetos `editando` e `desenhando` são literais novos a cada render, e
   * desenhar atualiza a medida na tela — ou seja, re-renderiza. Se os efeitos
   * dependessem da identidade deles, o traço em curso seria descartado no meio
   * do gesto. Os efeitos dependem do **tipo**; os callbacks vêm por ref.
   */
  const refEditando = useRef(editando);
  const refDesenhando = useRef(desenhando);
  refEditando.current = editando;
  refDesenhando.current = desenhando;
  const [pronto, setPronto] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  /**
   * Uma falha de rede na carga do mapa não pode ser definitiva: sem isto, um
   * chunk que não chegou por um instante deixa o card cinza até alguém recarregar
   * a página inteira, perdendo o que estava editando.
   */
  const [tentativa, setTentativa] = useState(0);
  const [medida, setMedida] = useState<string | null>(null);
  const [dicaDesenho, setDicaDesenho] = useState<string | null>(null);

  // -------------------------------------------------------------- montagem
  useEffect(() => {
    let vivo = true;
    let instancia: LeafletNS.Map | null = null;
    (async () => {
      // O Leaflet é publicado como UMD: conforme o empacotador, os nomes vêm no
      // namespace ou atrás de `default`. Aceitar os dois evita um mapa que fica
      // em branco sem dizer por quê.
      const modulo = await carregarLeaflet();
      const L = ((modulo as unknown as { default?: typeof LeafletNS }).default ?? modulo) as typeof LeafletNS;
      if (!vivo || !hospedeiro.current) return;
      if (typeof L?.map !== "function") throw new Error("módulo do mapa carregou sem a função `map`");
      leaflet.current = L;
      instancia = L.map(hospedeiro.current, { zoomControl: true, attributionControl: true, preferCanvas: false });
      instancia.setView([-22.9068, -43.1729], 9);
      L.tileLayer(TILES, { attribution: ATRIBUICAO, maxZoom: 19 }).addTo(instancia);
      instancia.zoomControl.setPosition("bottomright");
      estaticas.current = L.layerGroup().addTo(instancia);
      edicao.current = L.layerGroup().addTo(instancia);
      rascunho.current = L.layerGroup().addTo(instancia);
      instancia.on("zoomend", () => {
        for (const { camada, metros, lat } of corredores.current) camada.setStyle({ weight: metrosEmPixels(metros, lat, instancia!) });
      });
      mapa.current = instancia;
      setPronto(true);
      // O card pode ter sido medido antes do mapa existir; recalcula depois do layout.
      window.setTimeout(() => instancia?.invalidateSize(), 60);
    })().catch((erro: unknown) => {
      // Sem isto a falha some numa promise rejeitada e o operador vê um card cinza.
      console.error("Falha ao carregar o mapa", erro);
      if (vivo) setFalha(erro instanceof Error ? erro.message : "erro desconhecido");
    });
    return () => { vivo = false; instancia?.remove(); mapa.current = null; setPronto(false); };
  }, [tentativa]);

  // Acompanha o card quando o painel lateral recolhe ou a janela muda.
  useEffect(() => {
    if (!pronto || !hospedeiro.current || typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(() => mapa.current?.invalidateSize());
    observador.observe(hospedeiro.current);
    return () => observador.disconnect();
  }, [pronto]);

  // ------------------------------------------------------ camadas estáticas
  useEffect(() => {
    const L = leaflet.current;
    const grupo = estaticas.current;
    const m = mapa.current;
    if (!L || !grupo || !m) return;
    grupo.clearLayers();
    corredores.current = [];
    for (const forma of formas) {
      const estilo = ESTILOS[forma.estilo];
      for (const camada of construir(L, forma.geometria, estilo, m, corredores)) {
        if (forma.rotulo) camada.bindTooltip(forma.rotulo, { direction: "top", className: "mapa-rotulo" });
        if (forma.aoClicar) camada.on("click", (evento) => { L.DomEvent.stop(evento); forma.aoClicar?.(); });
        grupo.addLayer(camada);
      }
    }
  }, [formas, pronto]);

  // -------------------------------------------------------- alças de edição
  const chaveEdicao = editando ? JSON.stringify(editando.geometria) : "";
  useEffect(() => {
    const L = leaflet.current;
    const grupo = edicao.current;
    const m = mapa.current;
    if (!L || !grupo || !m) return;
    grupo.clearLayers();
    const alvo = refEditando.current;
    if (!alvo || arrastando.current) return;
    montarAlcas(L, m, grupo, alvo.geometria, {
      aoIniciar: () => { arrastando.current = true; },
      aoMover: setMedida,
      aoSoltar: (geometria) => { arrastando.current = false; setMedida(null); refEditando.current?.onChange(geometria); },
    });
  }, [chaveEdicao, pronto]);

  // --------------------------------------------------------------- desenho
  const tipoDesenho = desenhando?.tipo ?? null;
  useEffect(() => {
    const L = leaflet.current;
    const m = mapa.current;
    const grupo = rascunho.current;
    if (!L || !m || !grupo) return;
    grupo.clearLayers();
    if (!tipoDesenho) {
      m.getContainer().classList.remove("desenhando");
      setDicaDesenho(null);
      return;
    }
    m.getContainer().classList.add("desenhando");
    const tipo = tipoDesenho;
    const concluirCom = (g: Geometria) => refDesenhando.current?.onConcluir(g);
    const cancelar = () => refDesenhando.current?.onCancelar();
    let vertices: LatLng[] = [];
    let previa: LeafletNS.Path | null = null;
    const marcas: LeafletNS.CircleMarker[] = [];

    const dica = () => {
      if (tipo === "circulo") return vertices.length ? "Clique de novo para fixar o raio · Esc cancela" : "Clique para marcar o centro · Esc cancela";
      if (tipo === "retangulo") return vertices.length ? "Clique no canto oposto · Esc cancela" : "Clique no primeiro canto · Esc cancela";
      return vertices.length >= (tipo === "linha" ? 2 : 3)
        ? "Enter ou duplo clique conclui · Ctrl+Z desfaz · Esc cancela"
        : `Clique para adicionar pontos (${vertices.length}) · Esc cancela`;
    };
    const redesenhar = (cursor?: LatLng) => {
      setDicaDesenho(dica());
      if (previa) { grupo.removeLayer(previa); previa = null; }
      const pontos = cursor ? [...vertices, cursor] : vertices;
      if (tipo === "circulo" && vertices.length && cursor) {
        const raio = distanciaM(vertices[0], cursor);
        previa = L.circle(paraLL(vertices[0]), { radius: raio, ...ESTILOS.selecionado, dashArray: "5 4" });
        setMedida(`raio ${formatarDistancia(raio)}`);
      } else if (tipo === "retangulo" && vertices.length && cursor) {
        const r = retanguloDe(vertices[0], cursor);
        previa = L.rectangle([paraLL(r.sudoeste), paraLL(r.nordeste)], { ...ESTILOS.selecionado, dashArray: "5 4" });
        setMedida(formatarArea(areaM2(verticesDe(r))));
      } else if (pontos.length >= 2) {
        previa = tipo === "poligono"
          ? L.polygon(pontos.map(paraLL), { ...ESTILOS.selecionado, dashArray: "5 4" })
          : L.polyline(pontos.map(paraLL), { ...ESTILOS.selecionado, dashArray: "5 4" });
        setMedida(tipo === "poligono" ? formatarArea(areaM2(pontos)) : formatarDistancia(comprimentoM(pontos)));
      } else setMedida(null);
      if (previa) grupo.addLayer(previa);
    };
    const marcar = (p: LatLng) => {
      const marca = L.circleMarker(paraLL(p), { radius: 4, color: "#0b5f59", fillColor: "#fff", fillOpacity: 1, weight: 2 });
      marcas.push(marca);
      grupo.addLayer(marca);
    };
    const concluir = () => {
      if (tipo === "poligono" && vertices.length >= 3) concluirCom({ tipo: "poligono", vertices });
      else if (tipo === "linha" && vertices.length >= 2) concluirCom({ tipo: "linha", vertices, corredorM: 300 });
    };
    const desfazer = () => {
      vertices = vertices.slice(0, -1);
      const ultima = marcas.pop();
      if (ultima) grupo.removeLayer(ultima);
      redesenhar();
    };

    const aoClicar = (evento: LeafletNS.LeafletMouseEvent) => {
      const p = daLL(evento.latlng);
      if (tipo === "circulo") {
        if (!vertices.length) { vertices = [p]; marcar(p); redesenhar(); return; }
        const raio = distanciaM(vertices[0], p);
        concluirCom({ tipo: "circulo", centro: vertices[0], raioM: Math.max(25, Math.round(raio)) });
        return;
      }
      if (tipo === "retangulo") {
        if (!vertices.length) { vertices = [p]; marcar(p); redesenhar(); return; }
        concluirCom(retanguloDe(vertices[0], p));
        return;
      }
      vertices = [...vertices, p];
      marcar(p);
      redesenhar();
    };
    const aoMover = (evento: LeafletNS.LeafletMouseEvent) => { if (vertices.length) redesenhar(daLL(evento.latlng)); };
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") { evento.preventDefault(); cancelar(); }
      else if (evento.key === "Enter") { evento.preventDefault(); concluir(); }
      else if (evento.key.toLowerCase() === "z" && (evento.ctrlKey || evento.metaKey)) { evento.preventDefault(); desfazer(); }
    };

    redesenhar();
    m.on("click", aoClicar);
    m.on("mousemove", aoMover);
    m.on("dblclick", concluir);
    m.doubleClickZoom.disable();
    window.addEventListener("keydown", aoTeclar);
    return () => {
      m.off("click", aoClicar);
      m.off("mousemove", aoMover);
      m.off("dblclick", concluir);
      m.doubleClickZoom.enable();
      m.getContainer().classList.remove("desenhando");
      window.removeEventListener("keydown", aoTeclar);
      grupo.clearLayers();
      setMedida(null);
      setDicaDesenho(null);
    };
  }, [tipoDesenho, pronto]);

  // ----------------------------------------------------------- enquadramento
  useEffect(() => {
    const L = leaflet.current;
    const m = mapa.current;
    if (!L || !m || arrastando.current) return;
    const foco = refEditando.current?.geometria;
    const caixa = envolvente(foco ? [foco] : formas.map((f) => f.geometria));
    if (!caixa) return;
    const limites = L.latLngBounds(paraLL(caixa[0]), paraLL(caixa[1]));
    m.fitBounds(limites, { padding: [44, 44], maxZoom: foco ? 15 : 12, animate: false });
    // Reenquadra ao trocar de veículo ou de seleção — nunca no meio de um gesto.
  }, [ajuste, pronto]);

  return <div className="mapa-geo" style={altura ? { height: altura } : undefined}>
    <div ref={hospedeiro} className="mapa-tela" role="application" aria-label={rotulo} />
    {falha ? <div className="mapa-falha" role="alert">
        <strong>O mapa não carregou.</strong>
        <span>{falha}</span>
        <span>A geometria continua editável pelos campos do inspetor.</span>
        <button type="button" className="secondary-btn" onClick={() => { setFalha(null); setTentativa((n) => n + 1); }}>Tentar de novo</button>
      </div>
      : !pronto ? <div className="mapa-carregando" aria-hidden="true"><span /></div> : null}
    {medida ? <div className="mapa-medida" role="status">{medida}</div> : null}
    {dicaDesenho ? <div className="mapa-dica" role="status">{dicaDesenho}</div> : null}
  </div>;
}

// ------------------------------------------------------------------ camadas

type RefCorredores = { current: { camada: LeafletNS.Polyline; metros: number; lat: number }[] };

function construir(L: typeof LeafletNS, g: Geometria, estilo: LeafletNS.PathOptions, m: LeafletNS.Map, corredores: RefCorredores): LeafletNS.Path[] {
  if (g.tipo === "circulo") return [L.circle(paraLL(g.centro), { radius: g.raioM, ...estilo })];
  if (g.tipo === "poligono") return [L.polygon(g.vertices.map(paraLL), estilo)];
  if (g.tipo === "retangulo") return [L.rectangle([paraLL(g.sudoeste), paraLL(g.nordeste)], estilo)];
  // Linha: a faixa do corredor tem a largura real em metros, e o eixo vai por cima.
  const lat = g.vertices[0]?.lat ?? 0;
  const faixa = L.polyline(g.vertices.map(paraLL), {
    color: estilo.color, opacity: 0.22, weight: metrosEmPixels(g.corredorM, lat, m), lineCap: "round", lineJoin: "round", interactive: true,
  });
  corredores.current.push({ camada: faixa, metros: g.corredorM, lat });
  const eixo = L.polyline(g.vertices.map(paraLL), { ...estilo, fillOpacity: 0 });
  return [faixa, eixo];
}

// ------------------------------------------------------------------- alças

type Callbacks = { aoIniciar: () => void; aoMover: (texto: string | null) => void; aoSoltar: (g: Geometria) => void };

const ALCA = "mapa-alca";
const ALCA_MEIO = "mapa-alca meio";
const ALCA_RAIO = "mapa-alca raio";

function alca(L: typeof LeafletNS, p: LatLng, classe: string): LeafletNS.Marker {
  return L.marker(paraLL(p), {
    draggable: true,
    keyboard: false,
    icon: L.divIcon({ className: classe, iconSize: [14, 14], iconAnchor: [7, 7] }),
  });
}

function montarAlcas(L: typeof LeafletNS, m: LeafletNS.Map, grupo: LeafletNS.LayerGroup, g: Geometria, cb: Callbacks) {
  if (g.tipo === "circulo") return alcasCirculo(L, grupo, g, cb);
  if (g.tipo === "retangulo") return alcasRetangulo(L, grupo, g, cb);
  return alcasVertices(L, m, grupo, g, cb);
}

function alcasCirculo(L: typeof LeafletNS, grupo: LeafletNS.LayerGroup, g: { tipo: "circulo"; centro: LatLng; raioM: number }, cb: Callbacks) {
  const contorno = L.circle(paraLL(g.centro), { radius: g.raioM, ...ESTILOS.selecionado, dashArray: "6 4" });
  grupo.addLayer(contorno);
  let centro = g.centro;
  let raio = g.raioM;

  const alcaCentro = alca(L, centro, ALCA);
  const alcaRaio = alca(L, deslocar(centro, raio, 90), ALCA_RAIO);
  grupo.addLayer(alcaCentro);
  grupo.addLayer(alcaRaio);

  alcaCentro.on("dragstart", cb.aoIniciar);
  alcaCentro.on("drag", (evento) => {
    centro = daLL((evento.target as LeafletNS.Marker).getLatLng());
    contorno.setLatLng(paraLL(centro));
    alcaRaio.setLatLng(paraLL(deslocar(centro, raio, 90)));
    cb.aoMover(`centro · raio ${formatarDistancia(raio)}`);
  });
  alcaCentro.on("dragend", () => cb.aoSoltar({ tipo: "circulo", centro, raioM: Math.round(raio) }));

  alcaRaio.on("dragstart", cb.aoIniciar);
  alcaRaio.on("drag", (evento) => {
    raio = Math.max(25, distanciaM(centro, daLL((evento.target as LeafletNS.Marker).getLatLng())));
    contorno.setRadius(raio);
    cb.aoMover(`raio ${formatarDistancia(raio)}`);
  });
  alcaRaio.on("dragend", () => {
    alcaRaio.setLatLng(paraLL(deslocar(centro, raio, 90)));
    cb.aoSoltar({ tipo: "circulo", centro, raioM: Math.round(raio) });
  });
}

function alcasRetangulo(L: typeof LeafletNS, grupo: LeafletNS.LayerGroup, g: { tipo: "retangulo"; sudoeste: LatLng; nordeste: LatLng }, cb: Callbacks) {
  let sw = g.sudoeste;
  let ne = g.nordeste;
  const contorno = L.rectangle([paraLL(sw), paraLL(ne)], { ...ESTILOS.selecionado, dashArray: "6 4" });
  grupo.addLayer(contorno);
  // Só os quatro cantos: o retângulo tem de continuar retângulo para o equipamento aceitar.
  const cantos: LeafletNS.Marker[] = [];
  const posicoes = (): LatLng[] => [sw, { lat: sw.lat, lng: ne.lng }, ne, { lat: ne.lat, lng: sw.lng }];
  const sincronizar = () => {
    contorno.setBounds(L.latLngBounds(paraLL(sw), paraLL(ne)));
    posicoes().forEach((p, i) => cantos[i]?.setLatLng(paraLL(p)));
  };
  posicoes().forEach((p, indice) => {
    const marcador = alca(L, p, ALCA);
    cantos.push(marcador);
    grupo.addLayer(marcador);
    marcador.on("dragstart", cb.aoIniciar);
    marcador.on("drag", (evento) => {
      const atual = daLL((evento.target as LeafletNS.Marker).getLatLng());
      const oposto = posicoes()[(indice + 2) % 4];
      const normalizado = retanguloDe(atual, oposto);
      sw = normalizado.sudoeste;
      ne = normalizado.nordeste;
      contorno.setBounds(L.latLngBounds(paraLL(sw), paraLL(ne)));
      cb.aoMover(formatarArea(areaM2(verticesDe({ tipo: "retangulo", sudoeste: sw, nordeste: ne }))));
    });
    marcador.on("dragend", () => { sincronizar(); cb.aoSoltar({ tipo: "retangulo", sudoeste: sw, nordeste: ne }); });
  });
}

function alcasVertices(L: typeof LeafletNS, m: LeafletNS.Map, grupo: LeafletNS.LayerGroup, g: { tipo: "poligono"; vertices: LatLng[] } | { tipo: "linha"; vertices: LatLng[]; corredorM: number }, cb: Callbacks) {
  let vertices = [...g.vertices];
  const fechado = g.tipo === "poligono";
  const emitir = () => cb.aoSoltar(fechado ? { tipo: "poligono", vertices } : { tipo: "linha", vertices, corredorM: (g as { corredorM: number }).corredorM });
  const medir = () => fechado ? formatarArea(areaM2(vertices)) : formatarDistancia(comprimentoM(vertices));

  const contorno = fechado
    ? L.polygon(vertices.map(paraLL), { ...ESTILOS.selecionado, dashArray: "6 4" })
    : L.polyline(vertices.map(paraLL), { ...ESTILOS.selecionado, dashArray: "6 4" });
  grupo.addLayer(contorno);

  const atualizarContorno = () => (contorno as LeafletNS.Polyline).setLatLngs(vertices.map(paraLL));

  vertices.forEach((vertice, indice) => {
    const marcador = alca(L, vertice, ALCA);
    grupo.addLayer(marcador);
    marcador.on("dragstart", cb.aoIniciar);
    marcador.on("drag", (evento) => {
      vertices = vertices.map((v, i) => i === indice ? daLL((evento.target as LeafletNS.Marker).getLatLng()) : v);
      atualizarContorno();
      cb.aoMover(medir());
    });
    marcador.on("dragend", emitir);
    // Remover vértice sem depender do mouse fino: clique com Alt, e há botão no inspetor.
    marcador.on("click", (evento) => {
      const original = (evento as unknown as { originalEvent?: MouseEvent }).originalEvent;
      if (!original?.altKey || vertices.length <= (fechado ? 4 : 3)) return;
      L.DomEvent.stop(evento);
      vertices = vertices.filter((_, i) => i !== indice);
      cb.aoSoltar(fechado ? { tipo: "poligono", vertices } : { tipo: "linha", vertices, corredorM: (g as { corredorM: number }).corredorM });
    });
  });

  // Alças intermediárias: arrastar o meio de um segmento insere um vértice ali.
  const limite = fechado ? vertices.length : vertices.length - 1;
  for (let i = 0; i < limite; i += 1) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const marcador = alca(L, meio(a, b), ALCA_MEIO);
    grupo.addLayer(marcador);
    let inserido = -1;
    marcador.on("dragstart", () => {
      cb.aoIniciar();
      inserido = i + 1;
      vertices = [...vertices.slice(0, inserido), meio(a, b), ...vertices.slice(inserido)];
    });
    marcador.on("drag", (evento) => {
      if (inserido < 0) return;
      vertices = vertices.map((v, indice) => indice === inserido ? daLL((evento.target as LeafletNS.Marker).getLatLng()) : v);
      atualizarContorno();
      cb.aoMover(medir());
    });
    marcador.on("dragend", () => { inserido = -1; emitir(); });
  }
  void m;
}

export { circuloComoPoligono, centroDe, azimute };
