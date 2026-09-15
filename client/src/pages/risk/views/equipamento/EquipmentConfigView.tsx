import { useState } from "react";
import { AlertTriangle, Cpu, Loader2, Upload } from "lucide-react";
import { Toggle } from "../../shared";
import {
  atuadorLabel, baudRates, capacidadeDe, equipamentoDe, expansorHabilitado, funcaoSerialLabel,
  newId, normalizarMapaIO, protocoloCANLabel, sensorLabel, seriaisEmConflito, statusConfig,
  statusSyncLabel, validarConfiguracao,
  type Atuador, type BaudRate, type ConfiguracaoVeiculo, type EntradaIO, type MapaIO,
  type PortaSerial, type ProtocoloCAN, type RedeCAN, type SaidaIO, type Sensor,
} from "../../domain";
import type { ControleArvoreVeiculos, VehicleNavigatorProps } from "../perfil/VehicleNavigator";

const sensores = Object.keys(sensorLabel) as Sensor[];
const atuadores = Object.keys(atuadorLabel) as Atuador[];

type Aba = "entradas" | "saidas" | "comunicacao";
type AlterarMapa = (descricao: string, fn: (m: MapaIO) => MapaIO) => void;

export function EquipmentConfigView({ configs, setConfigs, veiculo, arvore, busca, onBusca, onLimparBusca, onToast, VehicleNavigator }: {
  configs: ConfiguracaoVeiculo[];
  setConfigs: (next: ConfiguracaoVeiculo[] | ((c: ConfiguracaoVeiculo[]) => ConfiguracaoVeiculo[])) => void;
  veiculo: { atual: string; selecionar: (v: string) => void };
  arvore?: ControleArvoreVeiculos;
  busca: string;
  onBusca: (valor: string) => void;
  onLimparBusca: () => void;
  onToast: (m: string) => void;
  VehicleNavigator: React.ComponentType<VehicleNavigatorProps>;
}) {
  const [aba, setAba] = useState<Aba>("entradas");
  const [enviando, setEnviando] = useState(false);
  const [navegadorRecolhidoLocal, setNavegadorRecolhidoLocal] = useState(false);
  const navegadorRecolhido = arvore?.estado.painelRecolhido ?? navegadorRecolhidoLocal;
  const config = configs.find((c) => c.veiculo === veiculo.atual) ?? configs[0];
  const equipamento = equipamentoDe(config.veiculo);
  const cap = capacidadeDe(config.veiculo);
  const mapa = normalizarMapaIO(config.veiculo, config.mapaIO);
  const expansorAtivo = expansorHabilitado(mapa);
  const status = statusConfig(config);
  const errosMapa = validarConfiguracao({ ...config, mapaIO: mapa }).filter((v) => v.nivel === "erro" && ["canal", "capacidade", "serial"].some((termo) => v.codigo.includes(termo)));

  const alterar: AlterarMapa = (descricao, fn) => setConfigs((atual) => atual.map((c) => c.veiculo !== config.veiculo ? c : {
    ...c, mapaIO: fn(normalizarMapaIO(c.veiculo, c.mapaIO)),
    mudancas: [...c.mudancas, { id: newId("MD"), descricao, em: new Date().toISOString(), por: "User Teste" }],
  }));

  const enviarConfiguracao = () => {
    if (!config.mudancas.length || errosMapa.length || enviando) return;
    setEnviando(true);
    window.setTimeout(() => {
      const em = new Date().toISOString();
      setConfigs((atual) => atual.map((c) => c.veiculo !== config.veiculo ? c : {
        ...c,
        mudancas: [],
        versaoEmbarcada: (c.versaoEmbarcada ?? 0) + 1,
        sincronizadoEm: em,
        ultimoEmbarque: {
          em, por: "User Teste", estado: "sucesso",
          itens: [{ id: "MAPA-IO", nome: "Entradas, saídas e comunicação do equipamento", estado: "aceito" }],
        },
      }));
      setEnviando(false);
      onToast(`Configuração enviada para ${config.veiculo}.`);
    }, 900);
  };

  return <div className="wsp">
    <div className={`wsp-corpo sem-inspetor ${navegadorRecolhido ? "nav-recolhida" : ""}`}>
      <VehicleNavigator
        configs={configs} selecionado={config.veiculo} busca={busca} onBusca={onBusca} onLimparBusca={onLimparBusca}
        onSelecionar={veiculo.selecionar} recolhido={navegadorRecolhido} arvore={arvore}
        onAlternar={() => setNavegadorRecolhidoLocal((atual) => !atual)}
      />
      <section className="wsp-canvas-wrap" aria-label="Configuração do equipamento">
        <header className="wsp-canvas-toolbar eq-toolbar">
          <div className="eq-identidade"><Cpu size={17} /><div><h2>{config.veiculo} · {equipamento.equipamento}</h2><p>{equipamento.linha} · 8 entradas e 2 saídas nativas · expansor {expansorAtivo ? "habilitado" : "desabilitado"}</p></div></div>
          <div className="eq-toolbar-acoes">
            <span className={`wsp-status wsp-status-${status}`}>{statusSyncLabel[status]}</span>
            {config.mudancas.length ? <button
              type="button" className="eq-enviar" onClick={enviarConfiguracao}
              disabled={enviando || errosMapa.length > 0}
              title={errosMapa.length ? "Corrija os conflitos antes de enviar" : "Enviar configuração ao equipamento"}
            >{enviando ? <Loader2 className="girando" size={13} /> : <Upload size={13} />}{enviando ? "Enviando…" : "Enviar configuração"}</button> : null}
          </div>
        </header>
        {errosMapa.length ? <div className="eq-alerta"><AlertTriangle size={13} /> {errosMapa.length} conflito(s) no mapeamento</div> : null}
        <nav className="wsp-abas eq-abas" role="tablist" aria-label="Seções do equipamento">
          {([
            ["entradas", `Entradas · ${cap.entradas}${expansorAtivo ? " + 4" : ""}`],
            ["saidas", `Saídas · ${cap.saidas}${expansorAtivo ? " + 4" : ""}`],
            ["comunicacao", "Comunicação"],
          ] as [Aba, string][]).map(([id, label]) => <button key={id} role="tab" aria-selected={aba === id} className={aba === id ? "ativa" : ""} onClick={() => setAba(id)}>{label}</button>)}
        </nav>
        <div className="eq-corpo">
          {aba === "entradas" ? <Entradas mapa={mapa} onAlterar={alterar} /> : null}
          {aba === "saidas" ? <Saidas mapa={mapa} onAlterar={alterar} /> : null}
          {aba === "comunicacao" ? <Comunicacao mapa={mapa} onAlterar={alterar} /> : null}
        </div>
      </section>
    </div>
  </div>;
}

function Entradas({ mapa, onAlterar }: { mapa: MapaIO; onAlterar: AlterarMapa }) {
  const expansorAtivo = expansorHabilitado(mapa);
  const visiveis = mapa.entradas.filter((entrada) => entrada.fonte === "nativo" || expansorAtivo);
  const usadas = mapa.entradas.map((e) => e.funcao).filter(Boolean) as Sensor[];
  const patch = (id: string, descricao: string, fn: (e: EntradaIO) => EntradaIO) => onAlterar(descricao, (m) => ({ ...m, entradas: m.entradas.map((e) => e.id === id ? fn(e) : e) }));
  return <div className="eq-tabela eq-tabela-entradas"><table><colgroup><col className="eq-col-pino" /><col className="eq-col-funcao" /><col className="eq-col-nivel" /><col className="eq-col-debounce" /><col className="eq-col-status" /></colgroup>
    <thead><tr><th>PINO</th><th>FUNÇÃO</th><th>ESTADO ATIVO</th><th>DEBOUNCE</th><th>STATUS</th></tr></thead>
    <tbody>{visiveis.map((entrada) => <tr key={entrada.id} className={entrada.habilitado ? "" : "desativado"}>
      <td><span className={`eq-pino ${entrada.fonte === "expansor485" ? "expansor" : ""}`}>{entrada.canal}</span></td>
      <td><select aria-label={`Função de ${entrada.canal}`} value={entrada.funcao ?? ""} onChange={(e) => patch(entrada.id, `${entrada.canal}: função ${e.target.value || "nenhuma"}`, (atual) => {
        const funcao = (e.target.value || null) as Sensor | null;
        return { ...atual, funcao, nome: funcao ? sensorLabel[funcao] : "" };
      })}>
        <option value="">Sem função</option>{sensores.map((sensor) => <option key={sensor} value={sensor} disabled={usadas.includes(sensor) && entrada.funcao !== sensor}>{sensorLabel[sensor]}{usadas.includes(sensor) && entrada.funcao !== sensor ? " · em uso" : ""}</option>)}
      </select></td>
      <td><div className="eq-nivel" aria-label={`Estado ativo de ${entrada.canal}`}>
        <button type="button" className={entrada.polaridade === "alta" ? "ativo" : ""} onClick={() => patch(entrada.id, `${entrada.canal}: ativo em High`, (atual) => ({ ...atual, polaridade: "alta" }))}>High</button>
        <button type="button" className={entrada.polaridade === "baixa" ? "ativo" : ""} onClick={() => patch(entrada.id, `${entrada.canal}: ativo em Low`, (atual) => ({ ...atual, polaridade: "baixa" }))}>Low</button>
      </div></td>
      <td><label className="eq-debounce"><input aria-label={`Debounce de ${entrada.canal}`} type="number" min="0" max="60" step="1" value={entrada.debounceSeg} onChange={(e) => patch(entrada.id, `${entrada.canal}: debounce atualizado`, (atual) => ({ ...atual, debounceSeg: Math.max(0, Number(e.target.value)) }))} /><span>s</span></label></td>
      <td><Toggle checked={entrada.habilitado} onChange={(valor) => patch(entrada.id, `${entrada.canal} ${valor ? "habilitado" : "desabilitado"}`, (atual) => ({ ...atual, habilitado: valor }))} label={entrada.habilitado ? "Ativo" : "Inativo"} /></td>
    </tr>)}</tbody>
  </table></div>;
}

function Saidas({ mapa, onAlterar }: { mapa: MapaIO; onAlterar: AlterarMapa }) {
  const expansorAtivo = expansorHabilitado(mapa);
  const visiveis = mapa.saidas.filter((saida) => saida.fonte === "nativo" || expansorAtivo);
  const usadas = mapa.saidas.map((s) => s.funcao).filter(Boolean) as Atuador[];
  const patch = (id: string, descricao: string, fn: (s: SaidaIO) => SaidaIO) => onAlterar(descricao, (m) => ({ ...m, saidas: m.saidas.map((s) => s.id === id ? fn(s) : s) }));
  return <div className="eq-tabela eq-tabela-saidas"><table><colgroup><col className="eq-col-pino" /><col className="eq-col-funcao" /><col className="eq-col-status" /></colgroup>
    <thead><tr><th>PINO</th><th>FUNÇÃO</th><th>STATUS</th></tr></thead>
    <tbody>{visiveis.map((saida) => <tr key={saida.id} className={saida.habilitado ? "" : "desativado"}>
      <td><span className={`eq-pino saida ${saida.fonte === "expansor485" ? "expansor" : ""}`}>{saida.canal}</span></td>
      <td><select aria-label={`Função de ${saida.canal}`} value={saida.funcao ?? ""} onChange={(e) => patch(saida.id, `${saida.canal}: função ${e.target.value || "nenhuma"}`, (atual) => {
        const funcao = (e.target.value || null) as Atuador | null;
        return { ...atual, funcao, nome: funcao ? atuadorLabel[funcao] : "" };
      })}>
        <option value="">Sem função</option>{atuadores.map((atuador) => <option key={atuador} value={atuador} disabled={usadas.includes(atuador) && saida.funcao !== atuador}>{atuadorLabel[atuador]}{usadas.includes(atuador) && saida.funcao !== atuador ? " · em uso" : ""}</option>)}
      </select></td>
      <td><Toggle checked={saida.habilitado} onChange={(valor) => patch(saida.id, `${saida.canal} ${valor ? "habilitado" : "desabilitado"}`, (atual) => ({ ...atual, habilitado: valor }))} label={saida.habilitado ? "Ativo" : "Inativo"} /></td>
    </tr>)}</tbody>
  </table></div>;
}

function Comunicacao({ mapa, onAlterar }: { mapa: MapaIO; onAlterar: AlterarMapa }) {
  const conflitos = new Set(seriaisEmConflito(mapa).map((s) => s.id));
  const rs232 = mapa.seriais.filter((s) => s.porta.startsWith("RS232"));
  const rs485 = mapa.seriais.filter((s) => s.porta === "RS485");
  const baud485 = rs485[0]?.baudRate ?? 115200;
  const patchSerial = (id: string, descricao: string, fn: (s: PortaSerial) => PortaSerial) => onAlterar(descricao, (m) => ({ ...m, seriais: m.seriais.map((s) => s.id === id ? fn(s) : s) }));
  const patchCAN = (id: string, descricao: string, fn: (r: RedeCAN) => RedeCAN) => onAlterar(descricao, (m) => ({ ...m, redesCAN: m.redesCAN.map((r) => r.id === id ? fn(r) : r) }));
  const alterarBaud485 = (baudRate: BaudRate) => onAlterar(`RS485: baud rate ${baudRate}`, (m) => ({ ...m, seriais: m.seriais.map((s) => s.porta === "RS485" ? { ...s, baudRate } : s) }));

  return <div className="eq-comunicacao">
    <SecaoComunicacao titulo="Portas RS232" resumo="Periféricos dedicados">
      <div className="eq-tabela eq-tabela-barramento"><table><thead><tr><th>PORTA</th><th>PERIFÉRICO</th><th>BAUD RATE</th><th>STATUS</th></tr></thead><tbody>
        {rs232.map((serial) => <tr key={serial.id} className={serial.habilitado === false ? "desativado" : ""}>
          <td><span className="eq-pino periferico">{serial.porta}</span></td><td><strong>{funcaoSerialLabel[serial.funcao]}</strong></td>
          <td><BaudSelect value={serial.baudRate} label={`Baud rate de ${serial.porta}`} onChange={(baudRate) => patchSerial(serial.id, `${serial.porta}: baud rate ${baudRate}`, (atual) => ({ ...atual, baudRate }))} /></td>
          <td><Toggle checked={serial.habilitado !== false} onChange={(habilitado) => patchSerial(serial.id, `${serial.porta} ${habilitado ? "habilitada" : "desabilitada"}`, (atual) => ({ ...atual, habilitado }))} label={serial.habilitado !== false ? "Ativa" : "Inativa"} /></td>
        </tr>)}
      </tbody></table></div>
    </SecaoComunicacao>

    <SecaoComunicacao titulo="Barramento RS485" resumo="Periféricos endereçáveis" acao={<label className="eq-baud-inline"><span>Baud rate</span><BaudSelect value={baud485} label="Baud rate da RS485" onChange={alterarBaud485} /></label>}>
      <div className="eq-tabela eq-tabela-barramento"><table><thead><tr><th>PERIFÉRICO</th><th>ENDEREÇO</th><th>STATUS</th></tr></thead><tbody>
        {rs485.map((serial) => <tr key={serial.id} className={`${serial.habilitado === false ? "desativado" : ""} ${conflitos.has(serial.id) ? "conflito" : ""}`}>
          <td><strong>{funcaoSerialLabel[serial.funcao]}</strong>{serial.funcao === "expansor_io" ? <small className="eq-detalhe">Habilita 4 entradas e 4 saídas</small> : null}</td>
          <td><input aria-label={`Endereço de ${funcaoSerialLabel[serial.funcao]}`} type="number" min="1" max="247" value={serial.endereco ?? 1} onChange={(e) => patchSerial(serial.id, `${funcaoSerialLabel[serial.funcao]}: endereço atualizado`, (atual) => ({ ...atual, endereco: Math.min(247, Math.max(1, Number(e.target.value))) }))} /></td>
          <td><Toggle checked={serial.habilitado !== false} onChange={(habilitado) => patchSerial(serial.id, `${funcaoSerialLabel[serial.funcao]} ${habilitado ? "habilitado" : "desabilitado"}`, (atual) => ({ ...atual, habilitado }))} label={serial.habilitado !== false ? "Ativo" : "Inativo"} /></td>
        </tr>)}
      </tbody></table></div>
    </SecaoComunicacao>

    <SecaoComunicacao titulo="Rede CAN 1" resumo="Leitura de dados do veículo">
      <div className="eq-tabela eq-tabela-barramento"><table><thead><tr><th>REDE</th><th>PROTOCOLO</th><th>STATUS</th></tr></thead><tbody>
        {mapa.redesCAN.map((rede) => <tr key={rede.id} className={rede.habilitado ? "" : "desativado"}>
          <td><span className="eq-pino can">{rede.rede}</span></td>
          <td><select aria-label={`Protocolo de ${rede.rede}`} value={rede.protocolo} onChange={(e) => patchCAN(rede.id, `${rede.rede}: protocolo atualizado`, (atual) => ({ ...atual, protocolo: e.target.value as ProtocoloCAN }))}>{(Object.keys(protocoloCANLabel) as ProtocoloCAN[]).map((protocolo) => <option key={protocolo} value={protocolo}>{protocoloCANLabel[protocolo]}</option>)}</select></td>
          <td><Toggle checked={rede.habilitado} onChange={(habilitado) => patchCAN(rede.id, `${rede.rede} ${habilitado ? "habilitada" : "desabilitada"}`, (atual) => ({ ...atual, habilitado }))} label={rede.habilitado ? "Ativa" : "Inativa"} /></td>
        </tr>)}
      </tbody></table></div>
    </SecaoComunicacao>
  </div>;
}

function BaudSelect({ value, label, onChange }: { value: BaudRate; label: string; onChange: (valor: BaudRate) => void }) {
  return <select aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value) as BaudRate)}>{baudRates.map((baud) => <option key={baud} value={baud}>{baud.toLocaleString("pt-BR")} bps</option>)}</select>;
}

function SecaoComunicacao({ titulo, resumo, acao, children }: { titulo: string; resumo: string; acao?: React.ReactNode; children: React.ReactNode }) {
  return <section className="eq-secao"><header className="eq-secao-head"><div><h3>{titulo}</h3><p>{resumo}</p></div>{acao}</header>{children}</section>;
}
