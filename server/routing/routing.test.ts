import { afterEach, describe, expect, it, vi } from "vitest";
import {
  coordenadaSchema,
  deGeoJSON,
  paraGeoJSON,
  pedidoSchema,
  type PedidoRoteirizacao,
} from "../../shared/roteirizacao";
import { calcularRota, montarPedido, normalizarResposta } from "./service";
import {
  catalogoValido,
  waypointsDosPontos,
  gerarTrechos,
  materializarParadas,
  motivoBloqueioPublicacao,
} from "../../client/src/pages/risk/mapa/rotograma";
import {
  UltimaConsulta,
  roteirizar,
} from "../../client/src/pages/risk/mapa/roteirizador";
import {
  perfilRoteirizacaoPadrao,
  pontosIniciais,
  rotogramasIniciais,
} from "../../client/src/pages/risk/domain";

const pedido = (): PedidoRoteirizacao => ({
  corredorM: 300,
  perfil: { ...perfilRoteirizacaoPadrao, evitarPedagio: true },
  waypoints: [
    {
      id: "a",
      pontoId: "PC-003",
      nome: "Origem",
      tipo: "parada",
      coordenada: { lat: -23, lng: -47 },
    },
    {
      id: "via",
      nome: "Passagem",
      tipo: "passagem",
      coordenada: { lat: -23.1, lng: -46.9 },
    },
    {
      id: "b",
      nome: "Parada",
      tipo: "parada",
      coordenada: { lat: -23.2, lng: -46.8 },
    },
    {
      id: "c",
      nome: "Destino",
      tipo: "parada",
      coordenada: { lat: -23.3, lng: -46.7 },
    },
  ],
});
const fixture = () => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [-47, -23],
          [-46.95, -23.05],
          [-46.9, -23.1],
          [-46.8, -23.2],
          [-46.7, -23.3],
        ],
      },
      properties: {
        segments: [
          { distance: 1000, duration: 60 },
          { distance: 2000, duration: 120 },
          { distance: 4000, duration: 240 },
        ],
        way_points: [0, 2, 3, 4],
        warnings: [{ message: "Verifique as restrições locais." }],
      },
    },
  ],
});
afterEach(() => vi.unstubAllGlobals());

describe("contrato geográfico", () => {
  it("converte longitude e latitude sem inverter", () => {
    expect(paraGeoJSON({ lat: -22.9, lng: -43.2 })).toEqual([-43.2, -22.9]);
    expect(deGeoJSON([-43.2, -22.9, 15])).toEqual({ lat: -22.9, lng: -43.2 });
    expect(coordenadaSchema.safeParse({ lat: 91, lng: 0 }).success).toBe(false);
  });
  it("valida origem, destino, coordenadas e pontos repetidos", () => {
    const p = pedido();
    p.waypoints.at(-1)!.coordenada = p.waypoints[0].coordenada;
    expect(pedidoSchema.safeParse(p).success).toBe(false);
    expect(pedidoSchema.safeParse({ ...pedido(), waypoints: [] }).success).toBe(
      false
    );
    const via = pedido();
    via.waypoints[0].tipo = "passagem";
    expect(pedidoSchema.safeParse(via).success).toBe(false);
  });
  it("envia o perfil HGV, limites físicos e áreas proibidas", () => {
    const p = pedido();
    p.perfil.cargaPerigosa = true;
    p.areasProibidas = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [-47, -22],
            [-46, -22],
            [-46, -21],
            [-47, -22],
          ],
        ],
      ],
    };
    const body = montarPedido(p);
    expect(body.coordinates[0]).toEqual([-47, -23]);
    expect(body.options).toMatchObject({
      vehicle_type: "hgv",
      avoid_features: ["tollways", "ferries"],
      profile_params: {
        restrictions: {
          height: 4.4,
          weight: 23,
          width: 2.6,
          length: 14,
          axleload: 10,
          hazmat: true,
        },
      },
      avoid_polygons: p.areasProibidas,
    });
    p.perfil.evitarViaNaoPavimentada = true;
    expect(() => montarPedido(p)).toThrow("não garante excluir");
  });
});
describe("normalização do provedor", () => {
  it("agrega passagens dentro da perna operacional e preserva geometria", () => {
    const r = normalizarResposta(fixture(), pedido());
    expect(r.modo).toBe("real");
    expect(r.pernas).toHaveLength(2);
    expect(r.pernas[0]).toMatchObject({ distanciaKm: 3, duracaoMin: 3 });
    expect(r.pernas[0].vertices).toHaveLength(4);
    expect(r.pernas[1].vertices).toHaveLength(2);
    expect(r.distanciaKm).toBe(7);
    expect(r.duracaoMin).toBe(7);
    expect(r.avisos).toHaveLength(1);
  });
  it.each([null, {}, { type: "FeatureCollection", features: [] }])(
    "rejeita resposta sem rota: %j",
    raw => expect(() => normalizarResposta(raw, pedido())).toThrow("incompleta")
  );
  it("rejeita quantidade de pernas, índices e coordenadas inválidos", () => {
    const raw = fixture();
    raw.features[0].properties.segments.pop();
    expect(() => normalizarResposta(raw, pedido())).toThrow("trechos");
    const indice = fixture();
    indice.features[0].properties.way_points = [0, 3, 2, 4];
    expect(() => normalizarResposta(indice, pedido())).toThrow("trechos");
    const coord = fixture();
    coord.features[0].geometry.coordinates[0] = [-47, 123];
    expect(() => normalizarResposta(coord, pedido())).toThrow(
      "coordenadas inválidas"
    );
  });
  it("mantém credencial no header do servidor e retorna contrato normalizado", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(fixture()));
    const r = await calcularRota(pedido(), undefined, {
      apiKey: "credencial-de-teste",
      fetcher,
    });
    expect(fetcher.mock.calls[0][0]).toContain("/driving-hgv/geojson");
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: "credencial-de-teste",
    });
    expect(JSON.stringify(r)).not.toContain("credencial-de-teste");
  });
  it("ausência de chave não chama o provedor", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      calcularRota(pedido(), undefined, { apiKey: "", fetcher })
    ).rejects.toMatchObject({ codigo: "NAO_CONFIGURADO", status: 503 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    [401, "AUTENTICACAO"],
    [403, "AUTENTICACAO"],
    [429, "LIMITE"],
    [503, "INDISPONIVEL"],
    [400, "SEM_ROTA"],
  ])("traduz falha HTTP %s", async (status, codigo) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { error: { code: 2009, message: "detalhe privado" } },
          { status: status as number }
        )
      );
    await expect(
      calcularRota(pedido(), undefined, { apiKey: "test", fetcher })
    ).rejects.toMatchObject({ codigo });
  });
  it("distingue timeout de cancelamento", async () => {
    const fetcher: typeof fetch = async (_url, init) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("abort"))
        )
      );
    await expect(
      calcularRota(pedido(), undefined, {
        apiKey: "test",
        fetcher,
        timeoutMs: 10,
      })
    ).rejects.toMatchObject({ codigo: "TIMEOUT" });
    const c = new AbortController();
    const promise = calcularRota(pedido(), c.signal, {
      apiKey: "test",
      fetcher,
    });
    c.abort();
    await expect(promise).rejects.toMatchObject({ codigo: "CANCELADO" });
  });
});
describe("rascunho operacional", () => {
  it("preserva pontos inativos no itinerário para correção explícita", () => {
    const ids = ["PC-003", "PC-005", "PC-001"];
    const w = waypointsDosPontos(ids, pontosIniciais);
    expect(w.map(p => p.pontoId)).toEqual(ids);
    expect(catalogoValido(w, pontosIniciais)).toBe(false);
    expect(
      catalogoValido(
        waypointsDosPontos(["PC-003", "PC-001"], pontosIniciais),
        pontosIniciais
      )
    ).toBe(true);
    const missing = waypointsDosPontos(["PC-003", "missing"], pontosIniciais);
    expect(missing).toHaveLength(2);
    expect(catalogoValido(missing, pontosIniciais)).toBe(false);
  });
  it("preserva limites somente para pares correspondentes, sem herdar por índice", () => {
    const anterior = rotogramasIniciais[0].trechos;
    const pernas = normalizarResposta(fixture(), pedido()).pernas;
    const t = gerarTrechos(["PC-003", "PC-005", "PC-NOVO"], pernas, anterior);
    expect(t[0].limites).toEqual(anterior[0].limites);
    expect(t[0].id).toBe(anterior[0].id);
    expect(t[1].limites.paradaMaxMin).toBe(15);
    expect(t[1].id).not.toBe(anterior[1].id);
    expect(t[0].vertices).toEqual(pernas[0].vertices);
    expect(() => gerarTrechos(["a", "b"], pernas, [])).toThrow("incompatíveis");
  });
  it("pontos de passagem não geram cadastro ou trecho", () => {
    const antes = JSON.stringify(pontosIniciais);
    const p = pedido();
    const resolved = materializarParadas(p.waypoints, pontosIniciais);
    expect(resolved.novos).toHaveLength(2);
    expect(resolved.paradas).toHaveLength(3);
    expect(resolved.waypoints[1].pontoId).toBeUndefined();
    expect(JSON.stringify(pontosIniciais)).toBe(antes);
    expect(
      gerarTrechos(
        resolved.paradas,
        normalizarResposta(fixture(), p).pernas,
        []
      )
    ).toHaveLength(2);
  });
  it("recusa publicar demonstração ou rotograma sem traçado", () => {
    expect(motivoBloqueioPublicacao(rotogramasIniciais[2])).toContain(
      "demonstrativo"
    );
    expect(
      motivoBloqueioPublicacao({ ...rotogramasIniciais[0], tracado: null })
    ).toContain("Defina");
  });
});
describe("concorrência do frontend", () => {
  it("descarta resultado antigo mesmo quando transporte ignora cancelamento", async () => {
    const consulta = new UltimaConsulta();
    let terminar!: (x: string) => void;
    const sucesso = vi.fn(),
      erro = vi.fn(),
      fim = vi.fn();
    const lenta = consulta.executar(
      () =>
        new Promise<string>(r => {
          terminar = r;
        }),
      sucesso,
      erro,
      fim
    );
    await consulta.executar(async () => "nova", sucesso, erro, fim);
    terminar("antiga");
    await lenta;
    expect(sucesso.mock.calls).toEqual([["nova"]]);
    expect(fim).toHaveBeenCalledTimes(1);
    expect(erro).not.toHaveBeenCalled();
  });
  it("invalida consulta pendente sem substituir último resultado válido", async () => {
    const c = new UltimaConsulta();
    let rejeitar!: (e: Error) => void;
    let resultado = "válido";
    const erro = vi.fn();
    const pendente = c.executar(
      () =>
        new Promise<string>((_r, reject) => {
          rejeitar = reject;
        }),
      r => {
        resultado = r;
      },
      erro,
      () => {}
    );
    c.cancelar();
    rejeitar(new Error("falha antiga"));
    await pendente;
    expect(resultado).toBe("válido");
    expect(erro).not.toHaveBeenCalled();
  });
  it("não aplica resposta com pernas incompatíveis e não simula falha", async () => {
    const r = normalizarResposta(fixture(), pedido());
    r.pernas.pop();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(r)));
    await expect(roteirizar(pedido())).rejects.toThrow("incompleta");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ message: "Sem chave" }, { status: 503 })
        )
    );
    await expect(roteirizar(pedido())).rejects.toThrow("Sem chave");
  });
});
