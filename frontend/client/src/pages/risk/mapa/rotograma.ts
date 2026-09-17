import {
  newId,
  type Trecho,
  type PontoDeControle,
  type Rotograma,
} from "../domain";
import type { PernaRoteirizada, WaypointRoteiro } from "@shared/roteirizacao";
import { centroDe } from "./geometria";

export function waypointsDosPontos(
  ids: string[],
  pontos: PontoDeControle[]
): WaypointRoteiro[] {
  return ids.map(id => {
    const p = pontos.find(p => p.id === id);
    return {
      id: newId("WP"),
      nome: p?.nome ?? `Ponto indisponível · ${id}`,
      tipo: "parada",
      pontoId: id,
      coordenada: p ? centroDe(p.geometria) : { lat: 0, lng: 0 },
    };
  });
}

export function catalogoValido(
  waypoints: WaypointRoteiro[],
  pontos: PontoDeControle[]
) {
  return waypoints.every(
    w => !w.pontoId || pontos.some(p => p.id === w.pontoId && p.ativo)
  );
}

export function gerarTrechos(
  paradas: string[],
  pernas: (Pick<PernaRoteirizada, "distanciaKm" | "duracaoMin"> & {
    vertices?: PernaRoteirizada["vertices"];
  })[],
  anteriores: Trecho[]
): Trecho[] {
  if (paradas.length < 2 || pernas.length !== paradas.length - 1)
    throw new Error("Trechos incompatíveis com as paradas.");
  const usados = new Set<string>();
  return paradas.slice(0, -1).map((de, i) => {
    const para = paradas[i + 1];
    const anterior = anteriores.find(
      t => t.de === de && t.para === para && !usados.has(t.id)
    );
    const id = anterior?.id ?? newId("T");
    usados.add(id);
    return {
      id,
      de,
      para,
      distanciaKm: pernas[i].distanciaKm,
      duracaoMin: pernas[i].duracaoMin,
      vertices: pernas[i].vertices,
      limites: anterior
        ? { ...anterior.limites }
        : { velocidadeKmh: 80, paradaMaxMin: 15, direcaoContinuaMaxMin: 240 },
    };
  });
}
export function materializarParadas(
  waypoints: WaypointRoteiro[],
  existentes: PontoDeControle[]
) {
  const novos: PontoDeControle[] = [];
  const resolvidos = waypoints.map(w => {
    if (w.tipo === "passagem") return w;
    if (w.pontoId && existentes.some(p => p.id === w.pontoId && p.ativo))
      return w;
    const id = newId("PC");
    novos.push({
      id,
      nome: w.nome,
      categoria: "cliente",
      geometria: {
        tipo: "circulo",
        centro: w.coordenada,
        raioM: w.raioM ?? 100,
      },
      politica: {
        macro: "",
        permanenciaMaxMin: 60,
        permanenciaMinMin: 0,
        janela: "24h",
      },
      fixo: false,
      precedencia: null,
      ativo: true,
      local: `${w.coordenada.lat.toFixed(5)}, ${w.coordenada.lng.toFixed(5)}`,
      sobrepoe: [],
      versao: 1,
    });
    return { ...w, pontoId: id };
  });
  return {
    novos,
    waypoints: resolvidos,
    paradas: resolvidos.filter(w => w.tipo === "parada").map(w => w.pontoId!),
  };
}
export function motivoBloqueioPublicacao(r: Rotograma): string | null {
  if (!r.tracado || !r.trechos.length)
    return "Defina um traçado e ao menos um trecho antes de publicar.";
  if (r.fonte?.tipo === "roteirizacao" && r.fonte.modo !== "real")
    return "Este traçado é demonstrativo. Calcule uma rota real antes de publicar.";
  return null;
}
