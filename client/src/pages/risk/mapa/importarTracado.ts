/**
 * Importação de traçado — esta parte é real, não mock.
 *
 * Quem já roteiriza em outra ferramenta exporta GPX, KML ou GeoJSON, e não
 * deveria ter de redesenhar o caminho aqui. A leitura do arquivo não depende de
 * serviço nenhum, então foi feita de verdade.
 *
 * Um detalhe do domínio manda no resultado: um GPX de rastreador traz milhares
 * de pontos, e a geocerca do equipamento não guarda isso. Por isso todo arquivo
 * passa por simplificação até caber no limite, e a interface informa quantos
 * vértices entraram e quantos sobraram — descartar 95% dos pontos em silêncio
 * seria esconder uma perda de precisão real.
 */
import type { FormatoImportacao, GeometriaLinha, LatLng } from "../domain";
import { comprimentoM, distanciaM } from "./geometria";

/**
 * Teto de vértices de uma linha embarcada.
 *
 * ⚠️ Como o limite de polígono, **não confirmado** com o fabricante. Fica isolado
 * aqui para trocar num lugar só quando o número real aparecer.
 */
export const MAX_VERTICES_LINHA = 200;

export type ResultadoImportacao = {
  geometria: GeometriaLinha;
  formato: FormatoImportacao;
  arquivo: string;
  verticesOriginais: number;
  verticesFinais: number;
  extensaoKm: number;
};

export class ErroImportacao extends Error {}

const FORMATOS: Record<string, FormatoImportacao> = { gpx: "gpx", kml: "kml", geojson: "geojson", json: "geojson" };

export function formatoDoArquivo(nome: string): FormatoImportacao | null {
  const extensao = nome.toLowerCase().split(".").pop() ?? "";
  return FORMATOS[extensao] ?? null;
}

const valido = (p: LatLng) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

function lerGpx(texto: string): LatLng[] {
  const doc = new DOMParser().parseFromString(texto, "application/xml");
  if (doc.querySelector("parsererror")) throw new ErroImportacao("Arquivo GPX inválido: o XML não pôde ser lido.");
  // Um GPX traz trilha percorrida (trkpt) ou rota planejada (rtept); servem as duas.
  const nos = Array.from(doc.querySelectorAll("trkpt, rtept, wpt"));
  return nos.map((no) => ({ lat: Number(no.getAttribute("lat")), lng: Number(no.getAttribute("lon")) })).filter(valido);
}

function lerKml(texto: string): LatLng[] {
  const doc = new DOMParser().parseFromString(texto, "application/xml");
  if (doc.querySelector("parsererror")) throw new ErroImportacao("Arquivo KML inválido: o XML não pôde ser lido.");
  const blocos = Array.from(doc.getElementsByTagName("coordinates"));
  const pontos: LatLng[] = [];
  for (const bloco of blocos) {
    for (const tripla of (bloco.textContent ?? "").trim().split(/\s+/)) {
      // KML é lng,lat[,alt] — a ordem invertida em relação ao GPX é armadilha clássica.
      const [lng, lat] = tripla.split(",").map(Number);
      const ponto = { lat, lng };
      if (valido(ponto)) pontos.push(ponto);
    }
  }
  return pontos;
}

function coordenadasGeoJson(no: unknown, acumulado: LatLng[]): void {
  if (!no || typeof no !== "object") return;
  const alvo = no as { type?: string; geometry?: unknown; features?: unknown[]; geometries?: unknown[]; coordinates?: unknown };
  if (Array.isArray(alvo.features)) { for (const f of alvo.features) coordenadasGeoJson(f, acumulado); return; }
  if (Array.isArray(alvo.geometries)) { for (const g of alvo.geometries) coordenadasGeoJson(g, acumulado); return; }
  if (alvo.geometry) { coordenadasGeoJson(alvo.geometry, acumulado); return; }
  const coordenadas = alvo.coordinates;
  if (!Array.isArray(coordenadas)) return;
  const empilhar = (item: unknown): void => {
    if (!Array.isArray(item)) return;
    if (typeof item[0] === "number" && typeof item[1] === "number") {
      const ponto = { lat: item[1] as number, lng: item[0] as number };
      if (valido(ponto)) acumulado.push(ponto);
      return;
    }
    for (const filho of item) empilhar(filho);
  };
  empilhar(coordenadas);
}

function lerGeoJson(texto: string): LatLng[] {
  let dado: unknown;
  try { dado = JSON.parse(texto); } catch { throw new ErroImportacao("Arquivo GeoJSON inválido: o JSON não pôde ser lido."); }
  const pontos: LatLng[] = [];
  coordenadasGeoJson(dado, pontos);
  return pontos;
}

/** Distância perpendicular de `p` ao segmento `a`–`b`, em metros. */
function distanciaAoSegmento(p: LatLng, a: LatLng, b: LatLng): number {
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  if (dx === 0 && dy === 0) return distanciaM(p, a);
  const t = Math.max(0, Math.min(1, ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / (dx * dx + dy * dy)));
  return distanciaM(p, { lat: a.lat + t * dy, lng: a.lng + t * dx });
}

/** Ramer–Douglas–Peucker: mantém a forma do caminho e joga fora o que não muda o desenho. */
export function simplificar(pontos: LatLng[], toleranciaM: number): LatLng[] {
  if (pontos.length <= 2) return pontos;
  let indiceMaior = 0;
  let maior = 0;
  for (let i = 1; i < pontos.length - 1; i += 1) {
    const d = distanciaAoSegmento(pontos[i], pontos[0], pontos[pontos.length - 1]);
    if (d > maior) { maior = d; indiceMaior = i; }
  }
  if (maior <= toleranciaM) return [pontos[0], pontos[pontos.length - 1]];
  const esquerda = simplificar(pontos.slice(0, indiceMaior + 1), toleranciaM);
  const direita = simplificar(pontos.slice(indiceMaior), toleranciaM);
  return [...esquerda.slice(0, -1), ...direita];
}

/** Aumenta a tolerância até o traçado caber no limite do equipamento. */
function reduzirAoLimite(pontos: LatLng[], limite: number): LatLng[] {
  if (pontos.length <= limite) return pontos;
  let tolerancia = 25;
  let resultado = pontos;
  for (let tentativa = 0; tentativa < 24 && resultado.length > limite; tentativa += 1) {
    resultado = simplificar(pontos, tolerancia);
    tolerancia *= 1.8;
  }
  if (resultado.length > limite) {
    // Último recurso: amostragem uniforme, preservando as duas pontas.
    const passo = Math.ceil(resultado.length / limite);
    const amostra = resultado.filter((_, i) => i % passo === 0);
    if (amostra[amostra.length - 1] !== resultado[resultado.length - 1]) amostra.push(resultado[resultado.length - 1]);
    return amostra;
  }
  return resultado;
}

export function importarTracado(nome: string, texto: string, corredorM: number): ResultadoImportacao {
  const formato = formatoDoArquivo(nome);
  if (!formato) throw new ErroImportacao("Formato não reconhecido. Use GPX, KML ou GeoJSON.");

  const brutos = formato === "gpx" ? lerGpx(texto) : formato === "kml" ? lerKml(texto) : lerGeoJson(texto);
  if (brutos.length < 2) throw new ErroImportacao("O arquivo não tem pontos suficientes para formar um traçado.");

  const vertices = reduzirAoLimite(brutos, MAX_VERTICES_LINHA);
  return {
    geometria: { tipo: "linha", corredorM, vertices },
    formato,
    arquivo: nome,
    verticesOriginais: brutos.length,
    verticesFinais: vertices.length,
    extensaoKm: Math.round(comprimentoM(vertices) / 1000),
  };
}
