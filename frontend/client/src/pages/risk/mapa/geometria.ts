/**
 * Cálculos de apoio ao mapa — e só de apoio.
 *
 * Nada aqui decide entrada ou saída de cerca: quem detecta é a geocerca nativa
 * do MDVR. O que estas funções fazem é dar ao operador o que ele precisa ver
 * enquanto desenha (raio em metros, extensão em km, área) e apontar onde dois
 * pontos de controle se sobrepõem — que hoje é invisível e trava o embarque.
 */
import {
  MAX_VERTICES_POLIGONO, type Geometria, type GeometriaArea, type GeometriaCirculo,
  type GeometriaLinha, type GeometriaPoligono, type GeometriaRetangulo, type LatLng, type TipoGeometria,
} from "../domain";

const RAIO_TERRA_M = 6371008.8;
const rad = (graus: number) => (graus * Math.PI) / 180;
const deg = (radianos: number) => (radianos * 180) / Math.PI;

/** Distância em metros entre dois pontos (haversine). */
export function distanciaM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RAIO_TERRA_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Ponto a `metros` de distância de `origem`, na direção `azimute` (graus). */
export function deslocar(origem: LatLng, metros: number, azimute: number): LatLng {
  const d = metros / RAIO_TERRA_M;
  const brng = rad(azimute);
  const lat1 = rad(origem.lat);
  const lng1 = rad(origem.lng);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
  const lng2 = lng1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: deg(lat2), lng: deg(lng2) };
}

/** Azimute em graus de `a` para `b`. */
export function azimute(a: LatLng, b: LatLng): number {
  const lat1 = rad(a.lat);
  const lat2 = rad(b.lat);
  const dLng = rad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export const meio = (a: LatLng, b: LatLng): LatLng => ({ lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 });

// ------------------------------------------------------------------- Medidas

export function formatarDistancia(metros: number): string {
  if (metros < 1000) return `${Math.round(metros)} m`;
  return `${(metros / 1000).toFixed(metros < 10000 ? 1 : 0)} km`;
}

export function formatarArea(m2: number): string {
  if (m2 < 1_000_000) return `${Math.round(m2 / 1000) / 10} ha`;
  return `${(m2 / 1_000_000).toFixed(1)} km²`;
}

/** Comprimento total de uma polilinha, em metros. */
export function comprimentoM(vertices: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < vertices.length; i += 1) total += distanciaM(vertices[i - 1], vertices[i]);
  return total;
}

/** Área de um anel em m², por projeção equirretangular local — suficiente para leitura na tela. */
export function areaM2(vertices: LatLng[]): number {
  if (vertices.length < 3) return 0;
  const lat0 = rad(vertices.reduce((soma, v) => soma + v.lat, 0) / vertices.length);
  const pontos = vertices.map((v) => ({ x: rad(v.lng) * Math.cos(lat0) * RAIO_TERRA_M, y: rad(v.lat) * RAIO_TERRA_M }));
  let acumulado = 0;
  for (let i = 0; i < pontos.length; i += 1) {
    const atual = pontos[i];
    const proximo = pontos[(i + 1) % pontos.length];
    acumulado += atual.x * proximo.y - proximo.x * atual.y;
  }
  return Math.abs(acumulado / 2);
}

export function verticesDe(geometria: Geometria): LatLng[] {
  switch (geometria.tipo) {
    case "circulo": return [geometria.centro];
    case "poligono": case "linha": return geometria.vertices;
    case "retangulo": {
      const { sudoeste: sw, nordeste: ne } = geometria;
      return [sw, { lat: sw.lat, lng: ne.lng }, ne, { lat: ne.lat, lng: sw.lng }];
    }
  }
}

/** O que a tela mostra ao lado do nome: raio, extensão ou área. */
export function medidaDe(geometria: Geometria): string {
  switch (geometria.tipo) {
    case "circulo": return `raio ${formatarDistancia(geometria.raioM)}`;
    case "linha": return `${formatarDistancia(comprimentoM(geometria.vertices))} · corredor ${formatarDistancia(geometria.corredorM)}`;
    case "poligono": return `${formatarArea(areaM2(geometria.vertices))} · ${geometria.vertices.length} vértices`;
    case "retangulo": return formatarArea(areaM2(verticesDe(geometria)));
  }
}

/** Caixa envolvente como par [sudoeste, nordeste]; `null` quando não há geometria. */
export function envolvente(geometrias: Geometria[]): [LatLng, LatLng] | null {
  const pontos: LatLng[] = [];
  for (const g of geometrias) {
    if (g.tipo === "circulo") {
      for (const a of [0, 90, 180, 270]) pontos.push(deslocar(g.centro, g.raioM, a));
    } else {
      pontos.push(...verticesDe(g));
      if (g.tipo === "linha" && g.corredorM > 0) {
        for (const v of g.vertices) for (const a of [0, 90, 180, 270]) pontos.push(deslocar(v, g.corredorM, a));
      }
    }
  }
  if (!pontos.length) return null;
  const lats = pontos.map((p) => p.lat);
  const lngs = pontos.map((p) => p.lng);
  return [{ lat: Math.min(...lats), lng: Math.min(...lngs) }, { lat: Math.max(...lats), lng: Math.max(...lngs) }];
}

export const centroDe = (geometria: Geometria): LatLng => {
  if (geometria.tipo === "circulo") return geometria.centro;
  const caixa = envolvente([geometria]);
  if (!caixa) return { lat: 0, lng: 0 };
  return meio(caixa[0], caixa[1]);
};

// ------------------------------------------------------------- Sobreposição
//
// Apoio visual para a restrição de precedência: dois pontos que se sobrepõem
// precisam de regra de desempate declarada, senão o equipamento fica indefinido
// e o embarque é recusado. Hoje isso é invisível no cadastro.

/** Círculo aproximado por polígono, para desenhar e para interseção. */
export function circuloComoPoligono(circulo: GeometriaCirculo, lados = 64): LatLng[] {
  return Array.from({ length: lados }, (_, i) => deslocar(circulo.centro, circulo.raioM, (i * 360) / lados));
}

export const comoAnel = (geometria: GeometriaArea): LatLng[] => geometria.tipo === "circulo" ? circuloComoPoligono(geometria) : verticesDe(geometria);

function dentroDoAnel(ponto: LatLng, anel: LatLng[]): boolean {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i, i += 1) {
    const a = anel[i];
    const b = anel[j];
    const cruza = a.lat > ponto.lat !== b.lat > ponto.lat;
    if (cruza && ponto.lng < ((b.lng - a.lng) * (ponto.lat - a.lat)) / (b.lat - a.lat) + a.lng) dentro = !dentro;
  }
  return dentro;
}

/** Duas áreas se sobrepõem? Teste por amostragem dos anéis — leitura, não detecção. */
export function areasSeSobrepoem(a: GeometriaArea, b: GeometriaArea): boolean {
  if (a.tipo === "circulo" && b.tipo === "circulo") return distanciaM(a.centro, b.centro) < a.raioM + b.raioM;
  const anelA = comoAnel(a);
  const anelB = comoAnel(b);
  return anelA.some((p) => dentroDoAnel(p, anelB)) || anelB.some((p) => dentroDoAnel(p, anelA));
}

/**
 * A região comum de duas áreas — a "área de controle".
 *
 * Devolvida só para **desenhar**: ela é leitura emergente da sobreposição, não
 * um cadastro. Em nenhum lugar da interface existe ferramenta de desenhá-la.
 */
export function regiaoComum(a: GeometriaArea, b: GeometriaArea): LatLng[] {
  const anelA = comoAnel(a);
  const anelB = comoAnel(b);
  const dentroA = anelB.filter((p) => dentroDoAnel(p, anelA));
  const dentroB = anelA.filter((p) => dentroDoAnel(p, anelB));
  const juntos = [...dentroA, ...dentroB];
  if (juntos.length < 3) return [];
  const centro = { lat: juntos.reduce((s, p) => s + p.lat, 0) / juntos.length, lng: juntos.reduce((s, p) => s + p.lng, 0) / juntos.length };
  return juntos.sort((p, q) => azimute(centro, p) - azimute(centro, q));
}

/** Pares de pontos cuja área se sobrepõe de fato no mapa. */
export function paresSobrepostos<T extends { id: string; geometria: GeometriaArea }>(itens: T[]): { a: T; b: T; regiao: LatLng[] }[] {
  const pares: { a: T; b: T; regiao: LatLng[] }[] = [];
  for (let i = 0; i < itens.length; i += 1) {
    for (let j = i + 1; j < itens.length; j += 1) {
      if (!areasSeSobrepoem(itens[i].geometria, itens[j].geometria)) continue;
      pares.push({ a: itens[i], b: itens[j], regiao: regiaoComum(itens[i].geometria, itens[j].geometria) });
    }
  }
  return pares;
}

// -------------------------------------------------------------- Construtores

/** Geometria inicial de um desenho novo, centrada onde o operador está olhando. */
export function geometriaPadrao(tipo: TipoGeometria, centro: LatLng, escalaM = 400): Geometria {
  switch (tipo) {
    case "circulo": return { tipo, centro, raioM: escalaM };
    case "poligono": return { tipo, vertices: [0, 72, 144, 216, 288].map((a) => deslocar(centro, escalaM, a)) };
    case "retangulo": return { tipo, sudoeste: deslocar(deslocar(centro, escalaM, 180), escalaM, 270), nordeste: deslocar(deslocar(centro, escalaM, 0), escalaM, 90) };
    case "linha": return { tipo, corredorM: 300, vertices: [deslocar(centro, escalaM, 270), deslocar(centro, escalaM, 90)] };
  }
}

/** Retângulo normalizado a partir de dois cantos quaisquer. */
export function retanguloDe(a: LatLng, b: LatLng): GeometriaRetangulo {
  return {
    tipo: "retangulo",
    sudoeste: { lat: Math.min(a.lat, b.lat), lng: Math.min(a.lng, b.lng) },
    nordeste: { lat: Math.max(a.lat, b.lat), lng: Math.max(a.lng, b.lng) },
  };
}

// ----------------------------------------------------------------- Validação

export type ProblemaGeometria = { nivel: "erro" | "aviso"; mensagem: string };

/**
 * O desenho cabe no que o equipamento aceita?
 *
 * O limite de vértices é aviso, não erro: o número ainda não está confirmado com
 * o fabricante (ver `MAX_VERTICES_POLIGONO`), e recusar um traço por um limite
 * incerto atrapalharia mais do que ajuda.
 */
export function validarGeometria(geometria: Geometria): ProblemaGeometria[] {
  const problemas: ProblemaGeometria[] = [];
  if (geometria.tipo === "circulo") {
    if (geometria.raioM < 25) problemas.push({ nivel: "erro", mensagem: "Raio abaixo de 25 m: o equipamento não consegue distinguir a entrada." });
  }
  if (geometria.tipo === "poligono") {
    if (geometria.vertices.length < 3) problemas.push({ nivel: "erro", mensagem: "Polígono precisa de ao menos 3 vértices." });
    if (geometria.vertices.length > MAX_VERTICES_POLIGONO) problemas.push({ nivel: "aviso", mensagem: `${geometria.vertices.length} vértices: acima do limite estimado de ${MAX_VERTICES_POLIGONO} do equipamento. O número ainda não foi confirmado com o fabricante.` });
  }
  if (geometria.tipo === "linha") {
    if (geometria.vertices.length < 2) problemas.push({ nivel: "erro", mensagem: "A linha precisa de ao menos 2 pontos." });
    if (geometria.corredorM < 50) problemas.push({ nivel: "aviso", mensagem: "Corredor abaixo de 50 m tende a gerar desvio por imprecisão do GPS." });
  }
  return problemas;
}

export type { Geometria, GeometriaArea, GeometriaCirculo, GeometriaLinha, GeometriaPoligono, GeometriaRetangulo, LatLng, TipoGeometria };
