import { z } from "zod";
import {
  deGeoJSON,
  paraGeoJSON,
  pedidoSchema,
  type PedidoRoteirizacao,
  type RespostaRoteirizacao,
  type PernaRoteirizada,
} from "../../shared/roteirizacao";

export class ErroRoteirizacao extends Error {
  constructor(
    public codigo: string,
    message: string,
    public status = 502
  ) {
    super(message);
  }
}
export function montarPedido(pedido: PedidoRoteirizacao) {
  const p = pedidoSchema.parse(pedido);
  if (p.perfil.evitarViaNaoPavimentada)
    throw new ErroRoteirizacao(
      "RESTRICAO_NAO_SUPORTADA",
      "Este serviço não garante excluir vias não pavimentadas. Desmarque essa opção e revise o traçado.",
      422
    );
  return {
    coordinates: p.waypoints.map(w => paraGeoJSON(w.coordenada)),
    instructions: false,
    elevation: false,
    language: "pt-br",
    options: {
      vehicle_type: p.perfil.veiculo === "van" ? "delivery" : "hgv",
      avoid_features: [
        p.perfil.evitarPedagio ? "tollways" : null,
        p.perfil.evitarBalsa ? "ferries" : null,
      ].filter((x): x is string => !!x),
      profile_params: {
        restrictions: {
          height: p.perfil.alturaM,
          weight: p.perfil.pesoT,
          width: p.perfil.larguraM,
          length: p.perfil.comprimentoM,
          axleload: p.perfil.cargaEixoT,
          hazmat: p.perfil.cargaPerigosa,
        },
      },
      ...(p.areasProibidas ? { avoid_polygons: p.areasProibidas } : {}),
    },
  };
}
const parSchema = z.array(z.number().finite()).min(2).max(3);
const featureSchema = z.object({
  type: z.literal("Feature"),
  geometry: z.object({
    type: z.literal("LineString"),
    coordinates: z.array(parSchema).min(2).max(200000),
  }),
  properties: z.object({
    segments: z.array(
      z.object({
        distance: z.number().positive(),
        duration: z.number().positive(),
      })
    ),
    way_points: z.array(z.number().int().nonnegative()),
    warnings: z.array(z.object({ message: z.string().max(2000) })).optional(),
  }),
});
const collectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(featureSchema).min(1),
});
export function normalizarResposta(
  raw: unknown,
  pedido: PedidoRoteirizacao
): RespostaRoteirizacao {
  const parsed = collectionSchema.safeParse(raw);
  if (!parsed.success)
    throw new ErroRoteirizacao(
      "RESPOSTA_INVALIDA",
      "O provedor retornou uma rota incompleta. Tente novamente."
    );
  const f = parsed.data.features[0];
  const { segments, way_points } = f.properties;
  const vertices = f.geometry.coordinates.map(p => {
    try {
      return deGeoJSON(p);
    } catch {
      throw new ErroRoteirizacao(
        "RESPOSTA_INVALIDA",
        "O provedor retornou coordenadas inválidas."
      );
    }
  });
  if (
    segments.length !== pedido.waypoints.length - 1 ||
    way_points.length !== pedido.waypoints.length ||
    way_points[0] !== 0 ||
    way_points.at(-1) !== vertices.length - 1 ||
    way_points.some(
      (n, i) => n >= vertices.length || (i > 0 && n <= way_points[i - 1])
    )
  ) {
    throw new ErroRoteirizacao(
      "PERNAS_INVALIDAS",
      "Os trechos recebidos não correspondem às paradas. Recalcule a rota."
    );
  }
  const pernas: PernaRoteirizada[] = [];
  let distancia = 0,
    duracao = 0,
    inicio = 0;
  segments.forEach((s, i) => {
    distancia += s.distance;
    duracao += s.duration;
    if (pedido.waypoints[i + 1].tipo === "parada") {
      pernas.push({
        distanciaKm: distancia / 1000,
        duracaoMin: duracao / 60,
        velocidadeMediaKmh: (distancia / duracao) * 3.6,
        vertices: vertices.slice(way_points[inicio], way_points[i + 1] + 1),
      });
      inicio = i + 1;
      distancia = 0;
      duracao = 0;
    }
  });
  return {
    geometria: { tipo: "linha", corredorM: pedido.corredorM, vertices },
    pernas,
    distanciaKm: pernas.reduce((s, p) => s + p.distanciaKm, 0),
    duracaoMin: pernas.reduce((s, p) => s + p.duracaoMin, 0),
    provedor: "openrouteservice",
    calculadoEm: new Date().toISOString(),
    modo: "real",
    avisos: f.properties.warnings?.map(w => w.message) ?? [],
  };
}
type Dependencias = {
  apiKey?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};
async function requisitar(
  path: string,
  init: RequestInit,
  signal: AbortSignal | undefined,
  deps: Dependencias
): Promise<unknown> {
  const key = deps.apiKey ?? process.env.OPENROUTESERVICE_API_KEY;
  if (!key?.trim())
    throw new ErroRoteirizacao(
      "NAO_CONFIGURADO",
      "O serviço de rotas ainda não foi configurado. Solicite a ativação ao administrador.",
      503
    );
  const timeout = AbortSignal.timeout(deps.timeoutMs ?? 20000);
  try {
    const response = await (deps.fetcher ?? fetch)(
      `https://api.openrouteservice.org${path}`,
      {
        ...init,
        headers: { Authorization: key, "Content-Type": "application/json" },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      }
    );
    if (!response.ok) {
      if (response.status === 401 || response.status === 403)
        throw new ErroRoteirizacao(
          "AUTENTICACAO",
          "O provedor recusou a credencial. Solicite a revisão ao administrador.",
          503
        );
      if (response.status === 429)
        throw new ErroRoteirizacao(
          "LIMITE",
          "Limite de consultas atingido. Aguarde um minuto e tente novamente.",
          429
        );
      const data = await response.json().catch(() => null);
      const code = z
        .object({ error: z.object({ code: z.number() }) })
        .safeParse(data);
      if (
        response.status < 500 &&
        code.success &&
        [2009, 2010].includes(code.data.error.code)
      )
        throw new ErroRoteirizacao(
          "SEM_ROTA",
          "Nenhuma rota encontrada para estes pontos e restrições. Ajuste as posições ou o perfil.",
          422
        );
      if (response.status < 500)
        throw new ErroRoteirizacao(
          "PEDIDO_RECUSADO",
          "O provedor não aceita essa combinação de pontos, distância ou restrições. Revise o itinerário.",
          422
        );
      throw new ErroRoteirizacao(
        "INDISPONIVEL",
        "O serviço de rotas está temporariamente indisponível. Tente novamente."
      );
    }
    return await response.json();
  } catch (e) {
    if (e instanceof ErroRoteirizacao) throw e;
    if (signal?.aborted)
      throw new ErroRoteirizacao("CANCELADO", "Consulta cancelada.", 499);
    if (timeout.aborted)
      throw new ErroRoteirizacao(
        "TIMEOUT",
        "O cálculo demorou mais que o esperado. Tente novamente.",
        504
      );
    throw new ErroRoteirizacao(
      "INDISPONIVEL",
      "Não foi possível consultar o serviço de rotas. Tente novamente."
    );
  }
}
export async function calcularRota(
  pedido: PedidoRoteirizacao,
  signal?: AbortSignal,
  deps: Dependencias = {}
) {
  const payload = montarPedido(pedido);
  return normalizarResposta(
    await requisitar(
      "/v2/directions/driving-hgv/geojson",
      { method: "POST", body: JSON.stringify(payload) },
      signal,
      deps
    ),
    pedido
  );
}
export async function buscarEndereco(
  texto: string,
  signal?: AbortSignal,
  deps: Dependencias = {}
) {
  const raw = await requisitar(
    `/geocode/search?${new URLSearchParams({ text: texto, size: "5", "boundary.country": "BRA" })}`,
    { method: "GET" },
    signal,
    deps
  );
  const parsed = z
    .object({
      features: z.array(
        z.object({
          properties: z.object({ label: z.string() }),
          geometry: z.object({
            type: z.literal("Point"),
            coordinates: parSchema,
          }),
        })
      ),
    })
    .safeParse(raw);
  if (!parsed.success)
    throw new ErroRoteirizacao(
      "RESPOSTA_INVALIDA",
      "A busca retornou endereços inválidos."
    );
  return parsed.data.features.map(f => ({
    nome: f.properties.label,
    coordenada: deGeoJSON(f.geometry.coordinates),
  }));
}
