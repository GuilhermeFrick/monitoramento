/**
 * A costura onde entra um roteirizador de verdade.
 *
 * A plataforma não calcula caminho. Quem calcula é serviço externo — Google
 * Directions, HERE, Mapbox, ou um OSRM próprio. Este módulo existe para que o
 * resto da aplicação já converse no formato que qualquer um deles devolve:
 * uma polilinha, uma perna por par de paradas, e a distância e a duração que o
 * provedor estimou.
 *
 * A implementação daqui é **declaradamente de demonstração**: ela não conhece
 * rua, não respeita sentido de via e não sabe onde há pedágio. Ela interpola um
 * caminho entre as paradas e estima tempo por velocidade média do perfil. Todo
 * resultado volta com `aviso` dizendo isso, e a interface mostra esse aviso —
 * um traçado plausível que se apresente como roteirização real é pior do que
 * traçado nenhum, porque ninguém vai conferir.
 *
 * Para plugar o provedor de verdade, troque `roteirizar` por uma chamada HTTP e
 * mantenha `RespostaRoteirizacao`. Nada mais na aplicação precisa mudar.
 */
import type { GeometriaLinha, LatLng, PerfilRoteirizacao } from "../domain";
import { azimute, comprimentoM, deslocar, distanciaM, meio } from "./geometria";

export type PedidoRoteirizacao = {
  /** Origem, paradas intermediárias e destino, nesta ordem. Mínimo de duas. */
  paradas: LatLng[];
  perfil: PerfilRoteirizacao;
  corredorM: number;
};

export type PernaRoteirizada = {
  distanciaKm: number;
  duracaoMin: number;
  /** Velocidade média que o provedor assumiu, para o operador julgar o número. */
  velocidadeMediaKmh: number;
};

export type RespostaRoteirizacao = {
  geometria: GeometriaLinha;
  pernas: PernaRoteirizada[];
  provedor: string;
  calculadoEm: string;
  /** Vazio quando vier de um provedor real. Preenchido enquanto for demonstração. */
  aviso: string;
};

export const PROVEDOR_DEMO = "Roteirizador de demonstração";

/** Velocidade média por perfil, já descontando paradas e trecho urbano. */
const VELOCIDADE_MEDIA: Record<PerfilRoteirizacao["veiculo"], number> = { van: 62, caminhao: 54, carreta: 48 };

/** Quanto o caminho real costuma ser maior que a linha reta entre dois pontos. */
const FATOR_SINUOSIDADE = 1.28;

/**
 * Curva um segmento para ele não parecer traçado a régua.
 *
 * É enfeite honesto: serve para o operador não confundir uma reta geodésica com
 * uma rota calculada. A curvatura é determinística — a mesma origem e destino
 * produzem sempre o mesmo desenho, senão recalcular mexeria o mapa à toa.
 */
function arquear(a: LatLng, b: LatLng, passos: number): LatLng[] {
  const comprimento = distanciaM(a, b);
  const centro = meio(a, b);
  const rumo = azimute(a, b);
  // Desvio lateral proporcional, limitado para não inventar uma volta absurda.
  const desvio = Math.min(comprimento * 0.06, 9000);
  const lado = Math.sin((a.lat + b.lng) * 7.3) >= 0 ? 90 : -90;
  const apoio = deslocar(centro, desvio, rumo + lado);
  const pontos: LatLng[] = [];
  for (let i = 1; i < passos; i += 1) {
    const t = i / passos;
    const u = 1 - t;
    pontos.push({
      lat: u * u * a.lat + 2 * u * t * apoio.lat + t * t * b.lat,
      lng: u * u * a.lng + 2 * u * t * apoio.lng + t * t * b.lng,
    });
  }
  return pontos;
}

export async function roteirizar({ paradas, perfil, corredorM }: PedidoRoteirizacao): Promise<RespostaRoteirizacao> {
  if (paradas.length < 2) throw new Error("A roteirização precisa de pelo menos uma origem e um destino.");

  const vertices: LatLng[] = [paradas[0]];
  const pernas: PernaRoteirizada[] = [];
  const velocidade = VELOCIDADE_MEDIA[perfil.veiculo] * (perfil.evitarPedagio ? 0.92 : 1) * (perfil.evitarViaNaoPavimentada ? 1 : 0.95);

  for (let i = 1; i < paradas.length; i += 1) {
    const de = paradas[i - 1];
    const para = paradas[i];
    const reta = distanciaM(de, para);
    const passos = Math.max(2, Math.min(14, Math.round(reta / 25000)));
    const intermediarios = arquear(de, para, passos);
    vertices.push(...intermediarios, para);
    const distanciaM_ = comprimentoM([de, ...intermediarios, para]) * (FATOR_SINUOSIDADE - 0.28);
    const distanciaKm = Math.max(1, Math.round((distanciaM_ / 1000) * FATOR_SINUOSIDADE));
    pernas.push({
      distanciaKm,
      duracaoMin: Math.max(5, Math.round((distanciaKm / velocidade) * 60)),
      velocidadeMediaKmh: Math.round(velocidade),
    });
  }

  // Latência simulada: a interface precisa saber lidar com espera, porque o
  // provedor real leva de centenas de ms a alguns segundos.
  await new Promise((resolver) => window.setTimeout(resolver, 450));

  return {
    geometria: { tipo: "linha", corredorM, vertices },
    pernas,
    provedor: PROVEDOR_DEMO,
    calculadoEm: new Date().toISOString(),
    aviso: "Traçado de demonstração: interpolado entre as paradas, sem malha viária, sentido de via, pedágio ou restrição de gabarito. Conecte um provedor de roteirização antes de usar em operação.",
  };
}

/** Resumo do pedido, para a interface explicar o que vai ser pedido ao provedor. */
export function descreverPerfil(perfil: PerfilRoteirizacao): string {
  const evitar = [
    perfil.evitarPedagio ? "pedágio" : null,
    perfil.evitarBalsa ? "balsa" : null,
    perfil.evitarViaNaoPavimentada ? "via não pavimentada" : null,
  ].filter(Boolean);
  return `${perfil.alturaM} m · ${perfil.pesoT} t${evitar.length ? ` · evita ${evitar.join(", ")}` : " · sem restrições de via"}`;
}
