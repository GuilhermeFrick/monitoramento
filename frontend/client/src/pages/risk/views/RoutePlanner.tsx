import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  CornerDownRight,
  Crosshair,
  Loader2,
  MapPin,
  Plus,
  Search,
  Settings2,
  Trash2,
  Truck,
  Undo2,
  Waypoints,
  X,
} from "lucide-react";
import {
  pedidoSchema,
  type Coordenada,
  type EnderecoRoteiro,
  type PedidoRoteirizacao,
  type RespostaRoteirizacao,
  type WaypointRoteiro,
} from "@shared/roteirizacao";
import {
  newId,
  perfilRoteirizacaoPadrao,
  veiculoRoteirizacaoLabel,
  type FonteTracado,
  type PontoDeControle,
} from "../domain";
import { centroDe, distanciaM } from "../mapa/geometria";
import { MapaGeo, type FormaMapa } from "../mapa/MapaGeo";
import {
  buscarEnderecos,
  roteirizar,
  UltimaConsulta,
} from "../mapa/roteirizador";
import {
  catalogoValido,
  materializarParadas,
  waypointsDosPontos,
} from "../mapa/rotograma";
import type { TracadoEscolhido } from "./TracadoDialog";

const numero = (n: number, dec = 1) =>
  n.toLocaleString("pt-BR", { maximumFractionDigits: dec });
export const duracaoTexto = (min: number) => {
  const m = Math.round(min);
  return m >= 60
    ? `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim()
    : `${m} min`;
};
const falhaTexto = (e: unknown) =>
  e instanceof Error
    ? e.message
    : "Não foi possível calcular. Tente novamente.";
type EscolhaMapa =
  | { tipo: "substituir"; id: string }
  | { tipo: "parada" | "passagem" };

export function RoutePlanner({
  pontos,
  paradasAtuais,
  corredorPadrao,
  fonteAtual,
  rotaAtual,
  onClose,
  onAplicar,
}: {
  pontos: PontoDeControle[];
  paradasAtuais: string[];
  corredorPadrao: number;
  fonteAtual?: FonteTracado | null;
  rotaAtual?: Pick<import("../domain").Rotograma, "tracado" | "trechos">;
  onClose: () => void;
  onAplicar: (e: TracadoEscolhido) => void;
}) {
  const disponiveis = pontos.filter(p => p.ativo);
  const [pedido, setPedido] = useState<PedidoRoteirizacao>(() => {
    const origem = fonteAtual?.tipo === "roteirizacao" ? fonteAtual : undefined;
    const waypoints =
      origem?.waypoints ??
      waypointsDosPontos(
        paradasAtuais.length >= 2
          ? paradasAtuais
          : disponiveis.slice(0, 2).map(p => p.id),
        pontos
      );
    return {
      waypoints,
      corredorM: corredorPadrao,
      perfil: {
        ...perfilRoteirizacaoPadrao,
        ...origem?.perfil,
      },
    };
  });
  const [resultado, setResultado] = useState<{
    pedido: PedidoRoteirizacao;
    resposta: RespostaRoteirizacao;
  } | null>(() => {
    if (
      fonteAtual?.tipo !== "roteirizacao" ||
      fonteAtual.modo !== "real" ||
      !rotaAtual?.tracado ||
      rotaAtual.trechos.length !==
        pedido.waypoints.filter(w => w.tipo === "parada").length - 1 ||
      rotaAtual.trechos.some(t => !t.vertices)
    )
      return null;
    const pernas = rotaAtual.trechos.map(t => ({
      distanciaKm: t.distanciaKm,
      duracaoMin: t.duracaoMin,
      velocidadeMediaKmh:
        t.duracaoMin > 0 ? (t.distanciaKm / t.duracaoMin) * 60 : 0,
      vertices: t.vertices!,
    }));
    return {
      pedido,
      resposta: {
        geometria: rotaAtual.tracado,
        pernas,
        distanciaKm: pernas.reduce((s, p) => s + p.distanciaKm, 0),
        duracaoMin: pernas.reduce((s, p) => s + p.duracaoMin, 0),
        provedor: fonteAtual.provedor,
        calculadoEm: fonteAtual.em,
        modo: "real",
        avisos: fonteAtual.avisos ?? [],
      },
    };
  });
  const [calculando, setCalculando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [configurado, setConfigurado] = useState<boolean | null>(null);
  const [recolhido, setRecolhido] = useState(false);
  const [perfilAberto, setPerfilAberto] = useState(false);
  const [selecionado, setSelecionado] = useState(pedido.waypoints[0]?.id ?? "");
  const [escolhaMapa, setEscolhaMapa] = useState<EscolhaMapa | null>(null);
  const [busca, setBusca] = useState("");
  const [enderecos, setEnderecos] = useState<EnderecoRoteiro[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [erroBusca, setErroBusca] = useState<string | null>(null);
  const [historico, setHistorico] = useState<PedidoRoteirizacao[]>([]);
  const [ajuste, setAjuste] = useState(0);
  const consulta = useRef(new UltimaConsulta());
  const pesquisa = useRef(new UltimaConsulta());
  const estado = useRef(pedido);
  estado.current = pedido;
  const agendado = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ponto = pedido.waypoints.find(w => w.id === selecionado);
  const assinatura = JSON.stringify(pedido);
  const atualizado =
    !!resultado && JSON.stringify(resultado.pedido) === assinatura;
  const validar = (p: PedidoRoteirizacao) =>
    pedidoSchema
      .refine(
        x => catalogoValido(x.waypoints, pontos),
        "Há um ponto inativo ou indisponível. Substitua-o ou remova-o do itinerário."
      )
      .safeParse(p);
  const validacao = validar(pedido);
  const operacionais = pedido.waypoints.filter(w => w.tipo === "parada");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/routing/status", { signal: controller.signal })
      .then(r => r.json())
      .then((s: { configurado?: boolean }) =>
        setConfigurado(s.configurado === true)
      )
      .catch(() => {});
    return () => {
      controller.abort();
      consulta.current.cancelar();
      pesquisa.current.cancelar();
      clearTimeout(agendado.current);
    };
  }, []);
  useEffect(() => {
    pesquisa.current.cancelar();
    setEnderecos([]);
    setErroBusca(null);
    setBuscando(false);
  }, [selecionado]);

  function calcular(next = estado.current, reenquadrar = false) {
    clearTimeout(agendado.current);
    const validado = validar(next);
    if (!validado.success) {
      setErro(validado.error.issues[0]?.message ?? "Revise o itinerário.");
      return;
    }
    setCalculando(true);
    setErro(null);
    void consulta.current.executar(
      signal => roteirizar(next, signal),
      resposta => {
        setResultado({ pedido: next, resposta });
        setConfigurado(true);
        if (reenquadrar) setAjuste(n => n + 1);
      },
      e => setErro(falhaTexto(e)),
      () => setCalculando(false)
    );
  }
  function alterar(next: PedidoRoteirizacao, recalcular = false) {
    consulta.current.cancelar();
    clearTimeout(agendado.current);
    setCalculando(false);
    setErro(null);
    setHistorico(h => [...h.slice(-19), estado.current]);
    estado.current = next;
    setPedido(next);
    if (recalcular) agendado.current = setTimeout(() => calcular(next), 350);
  }
  function patch(
    id: string,
    changes: Partial<WaypointRoteiro>,
    recalcular = false
  ) {
    alterar(
      {
        ...estado.current,
        waypoints: estado.current.waypoints.map(w =>
          w.id === id ? { ...w, ...changes } : w
        ),
      },
      recalcular
    );
  }
  function moverMarcador(id: string, coordenada: Coordenada) {
    // Uma localização editada vira um novo ponto; o catálogo compartilhado fica intacto.
    patch(id, { coordenada, pontoId: undefined }, true);
    setSelecionado(id);
  }
  function adicionar(
    coordenada: Coordenada,
    tipo: "parada" | "passagem",
    nome?: string,
    indice?: number
  ) {
    const w: WaypointRoteiro = {
      id: newId("WP"),
      tipo,
      nome: nome ?? (tipo === "passagem" ? "Ponto de passagem" : "Nova parada"),
      coordenada,
      raioM: 100,
    };
    const waypoints = [...estado.current.waypoints];
    waypoints.splice(indice ?? Math.max(0, waypoints.length - 1), 0, w);
    alterar({ ...estado.current, waypoints }, !!resultado);
    setSelecionado(w.id);
    setEscolhaMapa(null);
  }
  function escolherPosicao(coordenada: Coordenada) {
    if (!escolhaMapa) return;
    if (escolhaMapa.tipo === "substituir") {
      moverMarcador(escolhaMapa.id, coordenada);
      setEscolhaMapa(null);
    } else adicionar(coordenada, escolhaMapa.tipo);
  }
  function adicionarPassagemNaLinha(coordenada: Coordenada) {
    if (escolhaMapa) {
      escolherPosicao(coordenada);
      return;
    }
    if (!atualizado || !resultado) return;
    // Insere na ordem percorrida da polilinha, inclusive quando ela faz curvas.
    const vertices = resultado.resposta.geometria.vertices;
    const maisProximo = (p: Coordenada, a = 0) => {
      let melhor = a,
        d = Infinity;
      for (let i = a; i < vertices.length; i++) {
        const n = distanciaM(p, vertices[i]);
        if (n < d) {
          d = n;
          melhor = i;
        }
      }
      return melhor;
    };
    const pos = maisProximo(coordenada);
    let ultimo = 0,
      inserir = pedido.waypoints.length - 1;
    for (let i = 1; i < pedido.waypoints.length; i++) {
      ultimo = maisProximo(pedido.waypoints[i].coordenada, ultimo);
      if (pos <= ultimo) {
        inserir = i;
        break;
      }
    }
    adicionar(coordenada, "passagem", undefined, inserir);
  }
  function reordenar(indice: number, delta: number) {
    const w = [...pedido.waypoints],
      destino = indice + delta;
    if (destino < 0 || destino >= w.length) return;
    [w[indice], w[destino]] = [w[destino], w[indice]];
    if (w[0].tipo !== "parada" || w.at(-1)?.tipo !== "parada") return;
    alterar({ ...pedido, waypoints: w });
  }
  function remover(id: string) {
    const w = pedido.waypoints.filter(w => w.id !== id);
    if (w.length && (w[0].tipo !== "parada" || w.at(-1)?.tipo !== "parada")) {
      setErro(
        "Remova primeiro os pontos de passagem que ficariam fora da origem ou do destino."
      );
      return;
    }
    alterar({ ...pedido, waypoints: w });
    setSelecionado(w[0]?.id ?? "");
  }
  function pesquisar() {
    setBuscando(true);
    setErroBusca(null);
    void pesquisa.current.executar(
      signal => buscarEnderecos(busca.trim(), signal),
      enderecos => {
        setEnderecos(enderecos);
        if (!enderecos.length)
          setErroBusca(
            "Nenhum endereço encontrado. Refine a busca ou escolha no mapa."
          );
      },
      e => setErroBusca(falhaTexto(e)),
      () => setBuscando(false)
    );
  }
  function aplicar() {
    if (!resultado || !atualizado || calculando) return;
    const resolvidos = materializarParadas(pedido.waypoints, pontos);
    onAplicar({
      tracado: resultado.resposta.geometria,
      rotaId: "",
      pernas: resultado.resposta.pernas,
      paradas: resolvidos.paradas,
      novosPontos: resolvidos.novos,
      fonte: {
        tipo: "roteirizacao",
        provedor: resultado.resposta.provedor,
        modo: "real",
        perfil: pedido.perfil,
        avisos: resultado.resposta.avisos,
        em: resultado.resposta.calculadoEm,
        waypoints: resolvidos.waypoints,
      },
    });
  }
  const formas = useMemo<FormaMapa[]>(() => {
    const lista: FormaMapa[] = pedido.waypoints.map(w => ({
      id: w.id,
      geometria: {
        tipo: "circulo",
        centro: w.coordenada,
        raioM: w.tipo === "passagem" ? 1 : (w.raioM ?? 100),
      },
      estilo: "contexto",
    }));
    if (resultado)
      lista.unshift({
        id: "rota-calculada",
        geometria: {
          ...resultado.resposta.geometria,
          corredorM: pedido.corredorM,
        },
        estilo: "trecho-atual",
        rotulo: atualizado
          ? "Clique para adicionar uma passagem"
          : "Último traçado calculado",
        aoClicar: adicionarPassagemNaLinha,
      });
    return lista;
  }, [pedido, resultado, atualizado, escolhaMapa]);
  const marcadores = pedido.waypoints.map((w, i) => ({
    id: w.id,
    coordenada: w.coordenada,
    nome: w.nome,
    texto:
      i === 0
        ? "A"
        : i === pedido.waypoints.length - 1
          ? "B"
          : w.tipo === "passagem"
            ? "·"
            : String(
                pedido.waypoints
                  .slice(0, i + 1)
                  .filter(x => x.tipo === "parada").length - 1
              ),
    tipo:
      i === 0
        ? ("origem" as const)
        : i === pedido.waypoints.length - 1
          ? ("destino" as const)
          : w.tipo,
  }));

  return (
    <div className="roteiro-editor">
      <div className={`roteiro-workspace ${recolhido ? "recolhido" : ""}`}>
        <aside className="roteiro-sidebar" aria-label="Itinerário">
          <div className="roteiro-panel-head">
            <strong>{!recolhido && "Itinerário"}</strong>
            <button
              className="geo-btn"
              aria-label={
                recolhido ? "Expandir itinerário" : "Recolher itinerário"
              }
              onClick={() => setRecolhido(!recolhido)}
            >
              {recolhido ? (
                <ChevronRight size={15} />
              ) : (
                <ChevronLeft size={15} />
              )}
            </button>
          </div>
          {!recolhido && (
            <div className="roteiro-scroll">
              <div className="roteiro-sequencia-head">
                <span>
                  {operacionais.length} paradas ·{" "}
                  {pedido.waypoints.length - operacionais.length} passagens
                </span>
                <button
                  className="geo-btn"
                  disabled={!historico.length}
                  title="Desfazer última alteração"
                  aria-label="Desfazer última alteração"
                  onClick={() => {
                    const anterior = historico.at(-1);
                    if (anterior) {
                      consulta.current.cancelar();
                      clearTimeout(agendado.current);
                      setCalculando(false);
                      estado.current = anterior;
                      setPedido(anterior);
                      setHistorico(h => h.slice(0, -1));
                      setErro(null);
                    }
                  }}
                >
                  <Undo2 size={13} />
                </button>
              </div>
              <ol className="roteiro-paradas">
                {pedido.waypoints.map((w, i) => (
                  <li
                    key={w.id}
                    className={`${selecionado === w.id ? "selecionado" : ""} ${w.tipo}`}
                  >
                    <button
                      className="roteiro-parada-select"
                      onClick={() => {
                        setSelecionado(w.id);
                        setBusca("");
                        setEscolhaMapa(null);
                      }}
                    >
                      <span className={`roteiro-num ${marcadores[i].tipo}`}>
                        {marcadores[i].texto}
                      </span>
                      <span>
                        <small>
                          {i === 0
                            ? "ORIGEM"
                            : i === pedido.waypoints.length - 1
                              ? "DESTINO"
                              : w.tipo === "passagem"
                                ? "PASSAGEM"
                                : "PARADA"}
                        </small>
                        <strong>{w.nome || "Sem nome"}</strong>
                      </span>
                    </button>
                    <div className="roteiro-parada-acoes">
                      <button
                        title="Subir"
                        aria-label={`Subir ${w.nome}`}
                        disabled={i === 0}
                        onClick={() => reordenar(i, -1)}
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        title="Descer"
                        aria-label={`Descer ${w.nome}`}
                        disabled={i === pedido.waypoints.length - 1}
                        onClick={() => reordenar(i, 1)}
                      >
                        <ArrowDown size={12} />
                      </button>
                      <button
                        title="Remover"
                        aria-label={`Remover ${w.nome}`}
                        disabled={
                          w.tipo === "parada" && operacionais.length <= 2
                        }
                        onClick={() => remover(w.id)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="roteiro-add">
                <button
                  className="geo-btn"
                  disabled={pedido.waypoints.length >= 50}
                  onClick={() => {
                    const p = disponiveis.find(
                      p => !pedido.waypoints.some(w => w.pontoId === p.id)
                    );
                    if (p) {
                      const w: WaypointRoteiro = {
                        id: newId("WP"),
                        tipo: "parada",
                        nome: p.nome,
                        pontoId: p.id,
                        coordenada: centroDe(p.geometria),
                      };
                      const list = [...pedido.waypoints];
                      list.splice(Math.max(0, list.length - 1), 0, w);
                      alterar({ ...pedido, waypoints: list });
                      setSelecionado(w.id);
                    } else setEscolhaMapa({ tipo: "parada" });
                  }}
                >
                  <Plus size={13} /> Parada
                </button>
                <button
                  className="geo-btn"
                  disabled={
                    pedido.waypoints.length < 2 || pedido.waypoints.length >= 50
                  }
                  onClick={() => setEscolhaMapa({ tipo: "passagem" })}
                >
                  <CornerDownRight size={13} /> Passagem
                </button>
              </div>

              {ponto && (
                <section
                  className="roteiro-detalhe"
                  aria-label="Editar ponto selecionado"
                >
                  <label>
                    Local cadastrado
                    <select
                      aria-label="Local cadastrado"
                      value={ponto.pontoId ?? ""}
                      onChange={e => {
                        const p = disponiveis.find(
                          p => p.id === e.target.value
                        );
                        if (p)
                          patch(ponto.id, {
                            nome: p.nome,
                            pontoId: p.id,
                            coordenada: centroDe(p.geometria),
                          });
                        else patch(ponto.id, { pontoId: undefined });
                      }}
                    >
                      <option value="">Escolher no mapa ou endereço</option>
                      {ponto.pontoId &&
                        !disponiveis.some(p => p.id === ponto.pontoId) && (
                          <option value={ponto.pontoId} disabled>
                            {ponto.nome} · inativo/indisponível
                          </option>
                        )}
                      {disponiveis.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="roteiro-local-acoes">
                    <button
                      className="geo-btn"
                      onClick={() =>
                        setEscolhaMapa({ tipo: "substituir", id: ponto.id })
                      }
                    >
                      <Crosshair size={13} /> Escolher no mapa
                    </button>
                  </div>
                  <form
                    className="roteiro-busca"
                    onSubmit={e => {
                      e.preventDefault();
                      pesquisar();
                    }}
                  >
                    <input
                      aria-label="Buscar endereço"
                      placeholder="Buscar endereço, cidade…"
                      value={busca}
                      onChange={e => {
                        pesquisa.current.cancelar();
                        setBuscando(false);
                        setEnderecos([]);
                        setBusca(e.target.value);
                      }}
                    />
                    <button
                      className="geo-btn"
                      type="submit"
                      aria-label="Pesquisar endereço"
                      disabled={busca.trim().length < 3 || buscando}
                    >
                      {buscando ? (
                        <Loader2 size={13} className="girando" />
                      ) : (
                        <Search size={13} />
                      )}
                    </button>
                  </form>
                  {erroBusca && (
                    <p role="alert" className="roteiro-inline-error">
                      {erroBusca}
                    </p>
                  )}
                  {enderecos.length > 0 && (
                    <div className="roteiro-enderecos">
                      {enderecos.map((e, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            patch(
                              ponto.id,
                              {
                                coordenada: e.coordenada,
                                nome: e.nome,
                                pontoId: undefined,
                              },
                              !!resultado
                            );
                            setEnderecos([]);
                            setBusca("");
                            setAjuste(n => n + 1);
                          }}
                        >
                          <MapPin size={12} />
                          {e.nome}
                        </button>
                      ))}
                    </div>
                  )}
                  {!ponto.pontoId && (
                    <>
                      <label>
                        Nome{" "}
                        {ponto.tipo === "parada"
                          ? "do novo ponto de controle"
                          : "da passagem"}
                        <input
                          aria-label="Nome do ponto"
                          value={ponto.nome}
                          maxLength={200}
                          onChange={e =>
                            patch(ponto.id, { nome: e.target.value })
                          }
                        />
                      </label>
                      <div className="roteiro-campos">
                        <label>
                          Latitude
                          <input
                            aria-label="Latitude"
                            type="number"
                            step="0.00001"
                            min={-90}
                            max={90}
                            value={ponto.coordenada.lat}
                            onChange={e =>
                              patch(ponto.id, {
                                coordenada: {
                                  ...ponto.coordenada,
                                  lat: Number(e.target.value),
                                },
                              })
                            }
                          />
                        </label>
                        <label>
                          Longitude
                          <input
                            aria-label="Longitude"
                            type="number"
                            step="0.00001"
                            min={-180}
                            max={180}
                            value={ponto.coordenada.lng}
                            onChange={e =>
                              patch(ponto.id, {
                                coordenada: {
                                  ...ponto.coordenada,
                                  lng: Number(e.target.value),
                                },
                              })
                            }
                          />
                        </label>
                      </div>
                      {ponto.tipo === "parada" && (
                        <>
                          <label>
                            Raio do ponto · m
                            <input
                              aria-label="Raio do ponto"
                              type="number"
                              min={25}
                              max={5000}
                              value={ponto.raioM ?? 100}
                              onChange={e =>
                                patch(ponto.id, {
                                  raioM: Number(e.target.value),
                                })
                              }
                            />
                          </label>
                          <p className="roteiro-hint">
                            Será cadastrado ao aplicar o traçado.
                          </p>
                        </>
                      )}
                    </>
                  )}
                </section>
              )}

              <button
                className="roteiro-perfil-toggle"
                aria-expanded={perfilAberto}
                onClick={() => setPerfilAberto(!perfilAberto)}
              >
                <Truck size={16} />
                <span>
                  <strong>
                    {veiculoRoteirizacaoLabel[pedido.perfil.veiculo]}
                  </strong>
                  <small>
                    {numero(pedido.perfil.alturaM)} m ·{" "}
                    {numero(pedido.perfil.pesoT)} t
                  </small>
                </span>
                <Settings2 size={15} />
              </button>
              {perfilAberto && (
                <section
                  className="roteiro-perfil"
                  aria-label="Perfil do veículo"
                >
                  <label>
                    Veículo
                    <select
                      aria-label="Tipo de veículo"
                      value={pedido.perfil.veiculo}
                      onChange={e =>
                        alterar({
                          ...pedido,
                          perfil: {
                            ...pedido.perfil,
                            veiculo: e.target
                              .value as PedidoRoteirizacao["perfil"]["veiculo"],
                          },
                        })
                      }
                    >
                      {Object.entries(veiculoRoteirizacaoLabel).map(
                        ([v, n]) => (
                          <option key={v} value={v}>
                            {n}
                          </option>
                        )
                      )}
                    </select>
                  </label>
                  <div className="roteiro-campos">
                    {(
                      [
                        ["alturaM", "Altura · m", 10],
                        ["pesoT", "Peso total · t", 200],
                        ["larguraM", "Largura · m", 10],
                        ["comprimentoM", "Comprimento · m", 100],
                        ["cargaEixoT", "Carga por eixo · t", 50],
                      ] as const
                    ).map(([key, label, max]) => (
                      <label key={key}>
                        {label}
                        <input
                          type="number"
                          aria-label={label}
                          min={0.1}
                          max={max}
                          step={0.1}
                          value={pedido.perfil[key] ?? ""}
                          onChange={e =>
                            alterar({
                              ...pedido,
                              perfil: {
                                ...pedido.perfil,
                                [key]:
                                  e.target.value === ""
                                    ? undefined
                                    : Number(e.target.value),
                              },
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  {(
                    [
                      ["evitarPedagio", "Evitar pedágios"],
                      ["evitarBalsa", "Evitar balsas"],
                      ["cargaPerigosa", "Carga perigosa"],
                    ] as const
                  ).map(([key, label]) => (
                    <label className="roteiro-check" key={key}>
                      <input
                        type="checkbox"
                        checked={!!pedido.perfil[key]}
                        onChange={e =>
                          alterar({
                            ...pedido,
                            perfil: {
                              ...pedido.perfil,
                              [key]: e.target.checked,
                            },
                          })
                        }
                      />
                      {label}
                    </label>
                  ))}
                  {pedido.perfil.evitarViaNaoPavimentada && (
                    <label className="roteiro-check">
                      <input
                        type="checkbox"
                        checked
                        onChange={() =>
                          alterar({
                            ...pedido,
                            perfil: {
                              ...pedido.perfil,
                              evitarViaNaoPavimentada: false,
                            },
                          })
                        }
                      />{" "}
                      Desativar exclusão de vias não pavimentadas (indisponível)
                    </label>
                  )}
                  <p className="roteiro-hint">
                    A exclusão de vias não pavimentadas não está disponível
                    neste serviço.
                  </p>
                </section>
              )}
              <label className="roteiro-corredor">
                Corredor permitido · m
                <input
                  type="number"
                  min={25}
                  max={10000}
                  step={25}
                  aria-label="Corredor permitido"
                  value={pedido.corredorM}
                  onChange={e =>
                    alterar({ ...pedido, corredorM: Number(e.target.value) })
                  }
                />
              </label>
            </div>
          )}
        </aside>
        <section className="roteiro-mapa" aria-label="Prévia do itinerário">
          <div className="roteiro-mapa-head">
            <span>
              <Waypoints size={15} />
              <strong>Planejar viagem</strong>
            </span>
            <button className="geo-btn" onClick={() => setAjuste(n => n + 1)}>
              <Crosshair size={13} /> Enquadrar
            </button>
          </div>
          <MapaGeo
            formas={formas}
            marcadores={marcadores}
            onMoverMarcador={moverMarcador}
            onEscolherPosicao={escolhaMapa ? escolherPosicao : null}
            rotulo="Mapa de roteirização"
            ajuste={`roteiro-${ajuste}`}
          />
          {escolhaMapa && (
            <div className="roteiro-mapa-instrucao" role="status">
              <Crosshair size={16} />
              <span>
                Clique no mapa para{" "}
                {escolhaMapa.tipo === "substituir"
                  ? "reposicionar o ponto"
                  : `adicionar uma ${escolhaMapa.tipo}`}
                .
              </span>
              <button
                aria-label="Cancelar seleção no mapa"
                onClick={() => setEscolhaMapa(null)}
              >
                <X size={14} />
              </button>
            </div>
          )}
          <div className="roteiro-mapa-legenda">
            <span>
              <i className="origem" /> Origem
            </span>
            <span>
              <i className="destino" /> Destino
            </span>
            <span>
              <i className="passagem" /> Passagem
            </span>
            <small>Arraste os marcadores · clique na rota para ajustar</small>
          </div>
          <div className="roteiro-resultado" aria-live="polite">
            {configurado === false && !erro && (
              <p className="roteiro-notice">
                O serviço de rotas aguarda ativação pelo administrador. Você já
                pode montar o itinerário.
              </p>
            )}
            {erro && (
              <p role="alert" className="roteiro-inline-error">
                {erro}
              </p>
            )}
            {!validacao.success && (
              <p className="roteiro-hint">
                {validacao.error.issues[0]?.message}
              </p>
            )}
            <div className="roteiro-totais">
              <div>
                {resultado ? (
                  <>
                    <strong>
                      {numero(resultado.resposta.distanciaKm)} <small>km</small>
                      <span>·</span>
                      {duracaoTexto(resultado.resposta.duracaoMin)}
                    </strong>
                    <small>
                      {calculando
                        ? "Recalculando… traçado anterior preservado"
                        : atualizado
                          ? "Calculado para o perfil do veículo"
                          : "Traçado desatualizado — recalcule antes de aplicar"}
                    </small>
                  </>
                ) : (
                  <>
                    <strong>Seu próximo trajeto</strong>
                    <small>
                      Defina origem, paradas e destino para calcular.
                    </small>
                  </>
                )}
              </div>
              <button
                className="primary-btn"
                disabled={calculando || !validacao.success}
                onClick={() => calcular(pedido, !resultado)}
              >
                {calculando ? (
                  <Loader2 size={15} className="girando" />
                ) : (
                  <Waypoints size={15} />
                )}{" "}
                {calculando
                  ? "Calculando…"
                  : resultado
                    ? "Recalcular rota"
                    : "Calcular rota"}
              </button>
            </div>
            {resultado && (
              <details className="roteiro-trechos">
                <summary>
                  {resultado.resposta.pernas.length} trechos · ver distâncias e
                  tempos
                </summary>
                <ol>
                  {resultado.resposta.pernas.map((p, i) => {
                    const ops = resultado.pedido.waypoints.filter(
                      w => w.tipo === "parada"
                    );
                    return (
                      <li key={i}>
                        <span>
                          {ops[i].nome} → {ops[i + 1].nome}
                        </span>
                        <strong>
                          {numero(p.distanciaKm)} km ·{" "}
                          {duracaoTexto(p.duracaoMin)}
                        </strong>
                      </li>
                    );
                  })}
                </ol>
              </details>
            )}
            {resultado?.resposta.avisos.map((a, i) => (
              <p key={i} className="roteiro-notice">
                {a}
              </p>
            ))}
          </div>
        </section>
      </div>
      <footer className="roteiro-footer">
        <span>
          {pedido.waypoints.filter(w => w.tipo === "parada" && !w.pontoId)
            .length > 0
            ? `${pedido.waypoints.filter(w => w.tipo === "parada" && !w.pontoId).length} novo(s) ponto(s) serão cadastrados. `
            : ""}
          Salva como rascunho para revisão.
        </span>
        <button className="secondary-btn" onClick={onClose}>
          Cancelar
        </button>
        <button
          className="primary-btn"
          disabled={!atualizado || calculando || !validacao.success}
          onClick={aplicar}
        >
          <Check size={14} /> Usar este traçado
        </button>
      </footer>
    </div>
  );
}
