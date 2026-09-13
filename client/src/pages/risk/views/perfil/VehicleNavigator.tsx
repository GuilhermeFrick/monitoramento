import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, Truck, X } from "lucide-react";
import { perfilVigente, statusConfig, statusSyncLabel, type ConfiguracaoVeiculo } from "../../domain";

export function VehicleNavigator({ configs, selecionado, busca, onLimparBusca, onSelecionar }: {
  configs: ConfiguracaoVeiculo[];
  selecionado: string;
  busca: string;
  onLimparBusca: () => void;
  onSelecionar: (veiculo: string) => void;
}) {
  const [recolhidas, setRecolhidas] = useState<string[]>([]);

  const frotas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const filtrados = termo ? configs.filter((c) => `${c.veiculo} ${c.frota}`.toLowerCase().includes(termo)) : configs;
    const mapa = new Map<string, ConfiguracaoVeiculo[]>();
    for (const c of filtrados) mapa.set(c.frota, [...(mapa.get(c.frota) ?? []), c]);
    return Array.from(mapa.entries());
  }, [configs, busca]);

  const total = frotas.reduce((soma, [, v]) => soma + v.length, 0);

  return <section className="wsp-nav" aria-label="Veículos">
    <header className="wsp-nav-head">
      <div className="wsp-nav-titulo">Veículos<span>{total}</span></div>
      {busca.trim()
        ? <button className="wsp-filtro-chip" onClick={onLimparBusca}>
            <Search size={12} /> “{busca.trim()}” <X size={12} />
          </button>
        : <p className="wsp-nav-dica">Use a busca do topo para filtrar por veículo ou frota.</p>}
    </header>

    <div className="wsp-nav-lista">
      {frotas.map(([frota, veiculos]) => {
        const fechada = recolhidas.includes(frota);
        return <div key={frota} className="wsp-frota">
          <button
            className="wsp-frota-head" aria-expanded={!fechada}
            onClick={() => setRecolhidas((atual) => fechada ? atual.filter((f) => f !== frota) : [...atual, frota])}
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
              <button className={`wsp-veiculo ${ativo ? "ativo" : ""}`} aria-current={ativo ? "true" : undefined} onClick={() => onSelecionar(c.veiculo)}>
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
