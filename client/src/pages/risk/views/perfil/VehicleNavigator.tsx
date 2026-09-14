import { useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Search, Truck, X } from "lucide-react";
import { perfilVigente, statusConfig, statusSyncLabel, type ConfiguracaoVeiculo } from "../../domain";

export type EstadoArvoreVeiculos = {
  painelRecolhido: boolean;
  frotasRecolhidas: string[];
  buscaAberta: boolean;
  scrollTop: number;
};

export type ControleArvoreVeiculos = {
  estado: EstadoArvoreVeiculos;
  atualizar: Dispatch<SetStateAction<EstadoArvoreVeiculos>>;
};

export type VehicleNavigatorProps = {
  configs: ConfiguracaoVeiculo[];
  selecionado: string;
  busca: string;
  onBusca: (valor: string) => void;
  onLimparBusca: () => void;
  onSelecionar: (veiculo: string) => void;
  recolhido?: boolean;
  onAlternar?: () => void;
  arvore?: ControleArvoreVeiculos;
};

export function VehicleNavigator({ configs, selecionado, busca, onBusca, onLimparBusca, onSelecionar, recolhido = false, onAlternar, arvore }: VehicleNavigatorProps) {
  const [recolhidasLocais, setRecolhidasLocais] = useState<string[]>([]);
  const [buscaAbertaLocal, setBuscaAbertaLocal] = useState(false);
  const [scrollLocal, setScrollLocal] = useState(0);
  const listaRef = useRef<HTMLDivElement>(null);

  const painelRecolhido = arvore?.estado.painelRecolhido ?? recolhido;
  const recolhidas = arvore?.estado.frotasRecolhidas ?? recolhidasLocais;
  const buscaAberta = arvore?.estado.buscaAberta ?? buscaAbertaLocal;
  const scrollTop = arvore?.estado.scrollTop ?? scrollLocal;

  useLayoutEffect(() => {
    if (listaRef.current && listaRef.current.scrollTop !== scrollTop) listaRef.current.scrollTop = scrollTop;
  }, [scrollTop]);

  const alternarPainel = () => arvore
    ? arvore.atualizar((atual) => ({ ...atual, painelRecolhido: !atual.painelRecolhido }))
    : onAlternar?.();
  const alternarBusca = () => arvore
    ? arvore.atualizar((atual) => ({ ...atual, buscaAberta: !atual.buscaAberta }))
    : setBuscaAbertaLocal((aberta) => !aberta);
  const alternarFrota = (frota: string, fechada: boolean) => arvore
    ? arvore.atualizar((atual) => ({ ...atual, frotasRecolhidas: fechada ? atual.frotasRecolhidas.filter((f) => f !== frota) : [...atual.frotasRecolhidas, frota] }))
    : setRecolhidasLocais((atual) => fechada ? atual.filter((f) => f !== frota) : [...atual, frota]);
  const guardarScroll = (valor: number) => arvore
    ? arvore.atualizar((atual) => ({ ...atual, scrollTop: valor }))
    : setScrollLocal(valor);

  const frotas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const filtrados = termo ? configs.filter((c) => `${c.veiculo} ${c.frota}`.toLowerCase().includes(termo)) : configs;
    const mapa = new Map<string, ConfiguracaoVeiculo[]>();
    for (const c of filtrados) mapa.set(c.frota, [...(mapa.get(c.frota) ?? []), c]);
    return Array.from(mapa.entries());
  }, [configs, busca]);

  const total = frotas.reduce((soma, [, v]) => soma + v.length, 0);

  if (painelRecolhido) return <section className="wsp-nav wsp-nav-recolhida" aria-label="Veículos recolhidos">
    <button className="wsp-nav-toggle" onClick={alternarPainel} aria-label="Expandir veículos" title="Expandir veículos"><ChevronRight size={16} /></button>
    <div className="wsp-nav-atalhos">{configs.map((c) => <button key={c.veiculo} className={c.veiculo === selecionado ? "ativo" : ""} onClick={() => onSelecionar(c.veiculo)} aria-label={`${c.veiculo} · ${c.frota}`} title={`${c.veiculo} · ${c.frota}`}><Truck size={16} /><span className={`wsp-mini-status wsp-mini-${statusConfig(c)}`} /></button>)}</div>
  </section>;

  return <section className="wsp-nav" aria-label="Veículos">
    <header className="wsp-nav-head">
      <div className="wsp-nav-titulo">Veículos<span>{total}</span><button className="wsp-nav-search" onClick={alternarBusca} aria-label="Buscar veículo ou frota" title="Buscar veículo ou frota"><Search size={14} /></button><button className="wsp-nav-toggle" onClick={alternarPainel} aria-label="Recolher veículos" title="Recolher veículos"><ChevronLeft size={15} /></button></div>
      {buscaAberta || busca ? <label className="wsp-nav-busca"><Search size={12} /><input autoFocus value={busca} onChange={(e) => onBusca(e.target.value)} placeholder="Veículo ou frota" aria-label="Filtrar veículos" />{busca ? <button onClick={onLimparBusca} aria-label="Limpar busca"><X size={12} /></button> : null}</label> : null}
    </header>

    <div className="wsp-nav-lista" ref={listaRef} onScroll={(event) => guardarScroll(event.currentTarget.scrollTop)}>
      {frotas.map(([frota, veiculos]) => {
        const fechada = recolhidas.includes(frota);
        return <div key={frota} className="wsp-frota">
          <button
            className="wsp-frota-head" aria-expanded={!fechada}
            onClick={() => alternarFrota(frota, fechada)}
          >
            {fechada ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
            <span>{frota}</span>
            <strong>{veiculos.length}</strong>
          </button>
          {fechada ? null : <ul className="wsp-frota-veiculos">{veiculos.map((c) => {
            const status = statusConfig(c);
            const vigente = perfilVigente(c);
            const ativo = c.veiculo === selecionado;
            return <li key={c.veiculo}>
              <button className={`wsp-veiculo ${ativo ? "ativo" : ""}`} aria-current={ativo ? "true" : undefined} aria-label={`${c.veiculo} · ${c.frota} · ${vigente.perfil.nome} · ${statusSyncLabel[status]}`} title={`${vigente.perfil.nome} · ${statusSyncLabel[status]}`} onClick={() => onSelecionar(c.veiculo)}>
                <Truck size={14} />
                <span className="wsp-veiculo-copy">
                  <strong>{c.veiculo}</strong>
                  <small>{vigente.perfil.nome}</small>
                </span>
                <span className={`wsp-status wsp-status-${status}`}>{statusSyncLabel[status]}</span>
              </button>
            </li>;
          })}</ul>}
        </div>;
      })}
      {total === 0 ? <p className="wsp-vazio">Nenhum veículo para “{busca.trim()}”.</p> : null}
    </div>
  </section>;
}
