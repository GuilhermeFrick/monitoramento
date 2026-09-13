import { useEffect, useMemo, useState } from "react";
import { Copy, PanelRightClose, PanelRightOpen, RotateCcw, Truck, Undo2, Upload, X } from "lucide-react";
import { Callout, Modal, formatDateTime, useStoredState } from "../../shared";
import {
  configuracoesIniciais, itensDoEmbarque, newId, perfilVigente, statusConfig, statusSyncLabel, validarConfiguracao, STORAGE,
  type ConfiguracaoVeiculo, type MacroVeiculo, type PerfilOperacional, type ResultadoEmbarque, type TipoMacro,
} from "../../domain";
import { MacroGraphCanvas, autoLayout, type SelecaoGrafo } from "./MacroGraphCanvas";
import { ProfileInspector, type AbaInspetor } from "./ProfileInspector";
import { DeployReviewDialog, type FaseEmbarque } from "./DeployDialogs";

const OPERADOR = "Larissa Martins";

export function useConfiguracoes() { return useStoredState<ConfiguracaoVeiculo[]>(STORAGE.configuracoes, configuracoesIniciais); }

export function ProfileWorkspace({ configs, setConfigs, busca, onLimparBusca, onToast, VehicleNavigator }: {
  configs: ConfiguracaoVeiculo[];
  setConfigs: (next: ConfiguracaoVeiculo[] | ((c: ConfiguracaoVeiculo[]) => ConfiguracaoVeiculo[])) => void;
  busca: string;
  onLimparBusca: () => void;
  onToast: (m: string) => void;
  VehicleNavigator: React.ComponentType<{ configs: ConfiguracaoVeiculo[]; selecionado: string; busca: string; onLimparBusca: () => void; onSelecionar: (v: string) => void }>;
}) {
  const [veiculo, setVeiculo] = useState(configs[0]?.veiculo ?? "");
  const [selecao, setSelecao] = useState<SelecaoGrafo>({ tipo: "padrao" });
  const [aba, setAba] = useState<AbaInspetor>("atuadores");
  const [inspetorAberto, setInspetorAberto] = useState(true);
  const [novaMacro, setNovaMacro] = useState(false);
  const [confirmacao, setConfirmacao] = useState<{ titulo: string; corpo: string; acao: () => void } | null>(null);
  const [desfazer, setDesfazer] = useState<{ texto: string; snapshot: ConfiguracaoVeiculo } | null>(null);
  const [fase, setFase] = useState<FaseEmbarque | null>(null);
  const [resultado, setResultado] = useState<ResultadoEmbarque | null>(null);

  const config = configs.find((c) => c.veiculo === veiculo) ?? configs[0];
  const validacoes = useMemo(() => validarConfiguracao(config), [config]);
  const erros = validacoes.filter((v) => v.nivel === "erro");
  const status = statusConfig(config);
  const vigente = perfilVigente(config);

  useEffect(() => { if (!desfazer) return; const t = window.setTimeout(() => setDesfazer(null), 9000); return () => window.clearTimeout(t); }, [desfazer]);

  /** Toda alteração de rascunho passa por aqui: registra a mudança para a revisão do embarque. */
  const alterar = (descricao: string, fn: (c: ConfiguracaoVeiculo) => ConfiguracaoVeiculo) => setConfigs((atual) => atual.map((c) => c.veiculo !== config.veiculo ? c : {
    ...fn(c),
    mudancas: [...c.mudancas, { id: newId("MD"), descricao, em: new Date().toISOString(), por: OPERADOR }],
  }));

  /** Move e posiciona não são alteração de política — não entram no changelog. */
  const reposicionar = (fn: (c: ConfiguracaoVeiculo) => ConfiguracaoVeiculo) => setConfigs((atual) => atual.map((c) => c.veiculo === config.veiculo ? fn(c) : c));

  const patchPerfil = (descricao: string, fn: (p: PerfilOperacional) => PerfilOperacional) => alterar(descricao, (c) => selecao.tipo === "macro"
    ? { ...c, macros: c.macros.map((m) => m.id === selecao.id ? { ...m, perfil: fn(m.perfil) } : m) }
    : { ...c, perfilPadrao: fn(c.perfilPadrao) });

  const snapshot = () => ({ ...config, macros: config.macros.map((m) => ({ ...m })), transicoes: config.transicoes.map((t) => ({ ...t })) });

  const removerMacro = (macro: MacroVeiculo) => {
    const ligacoes = config.transicoes.filter((t) => t.de === macro.id || t.para === macro.id).length;
    setConfirmacao({
      titulo: `Remover “${macro.nome}”?`,
      corpo: `A macro e ${ligacoes} transição(ões) que a citam serão removidas. O motorista deixa de poder registrá-la.`,
      acao: () => {
        const antes = snapshot();
        alterar(`Macro “${macro.nome}” removida`, (c) => ({ ...c, macros: c.macros.filter((m) => m.id !== macro.id), transicoes: c.transicoes.filter((t) => t.de !== macro.id && t.para !== macro.id) }));
        setSelecao({ tipo: "padrao" });
        setDesfazer({ texto: `“${macro.nome}” removida`, snapshot: antes });
      },
    });
  };

  const removerTransicao = (de: string, para: string) => {
    const nomeDe = config.macros.find((m) => m.id === de)?.nome ?? de;
    const nomePara = config.macros.find((m) => m.id === para)?.nome ?? para;
    const antes = snapshot();
    alterar(`Transição ${nomeDe} → ${nomePara} removida`, (c) => ({ ...c, transicoes: c.transicoes.filter((t) => !(t.de === de && t.para === para)) }));
    setSelecao({ tipo: "padrao" });
    setDesfazer({ texto: `Transição ${nomeDe} → ${nomePara} removida`, snapshot: antes });
  };

  const aplicarDesfazer = () => {
    if (!desfazer) return;
    setConfigs((atual) => atual.map((c) => c.veiculo === desfazer.snapshot.veiculo ? desfazer.snapshot : c));
    setDesfazer(null);
    onToast("Alteração desfeita.");
  };

  const confirmarEmbarque = () => {
    setFase("enviando");
    window.setTimeout(() => {
      // Mock: um item é rejeitado quando o equipamento não tem a saída mapeada.
      const itens = itensDoEmbarque(config);
      const rejeitar = config.veiculo === "VTR-3110" && itens.some((i) => i.id === "MC-PERNOITE");
      const resposta: ResultadoEmbarque = {
        em: new Date().toISOString(), por: OPERADOR,
        estado: rejeitar ? "parcial" : "sucesso",
        itens: itens.map((i) => rejeitar && i.id === "MC-PERNOITE"
          ? { id: i.id, nome: i.nome, estado: "rejeitado" as const, motivo: "Equipamento MDVR-8 não tem a saída “trava da quinta roda” mapeada." }
          : { id: i.id, nome: i.nome, estado: "aceito" as const }),
      };
      setConfigs((atual) => atual.map((c) => c.veiculo !== config.veiculo ? c : {
        ...c,
        // sucesso esvazia o rascunho; parcial mantém só o que precisa voltar
        mudancas: resposta.estado === "sucesso" ? [] : c.mudancas,
        versaoEmbarcada: (c.versaoEmbarcada ?? 0) + 1,
        sincronizadoEm: resposta.em,
        ultimoEmbarque: resposta,
      }));
      setResultado(resposta);
      setFase("resultado");
    }, 1100);
  };

  const criarMacro = (nome: string, descricao: string, tipo: TipoMacro) => {
    const id = newId("MC");
    alterar(`Macro “${nome}” criada`, (c) => ({ ...c, macros: [...c.macros, { id, nome, descricao, tipo, x: 40, y: 40 + c.macros.length * 20, perfil: { ...c.perfilPadrao, nome } }] }));
    setSelecao({ tipo: "macro", id });
    setNovaMacro(false);
    onToast(`Macro “${nome}” criada. Ligue-a no grafo para o motorista poder registrá-la.`);
  };

  return <div className="wsp">
    <header className="wsp-header">
      <div className="wsp-header-id">
        <Truck size={16} />
        <div>
          <h1>{config.veiculo}</h1>
          <p>{config.frota} · agora em <strong>{vigente.perfil.nome}</strong>{vigente.macro ? ` por ${vigente.macro.nome}` : " (perfil padrão)"}</p>
        </div>
      </div>

      <div className="wsp-header-estado">
        <span className={`wsp-status wsp-status-${status}`}>{statusSyncLabel[status]}</span>
        <span className="wsp-header-meta">
          {config.mudancas.length ? `${config.mudancas.length} alteração(ões) de ${config.mudancas[config.mudancas.length - 1].por}` : "sem alterações pendentes"}
          {" · "}
          {config.versaoEmbarcada !== null ? `v${config.versaoEmbarcada} no equipamento` : "nunca embarcado"}
          {config.sincronizadoEm ? ` · ${formatDateTime(config.sincronizadoEm)}` : ""}
        </span>
      </div>

      <div className="wsp-header-acoes">
        <CopiarConfig config={config} configs={configs} onCopiar={(destinos) => {
          setConfigs((atual) => atual.map((c) => !destinos.includes(c.veiculo) ? c : {
            ...c,
            macros: config.macros.map((m) => ({ ...m })), transicoes: config.transicoes.map((t) => ({ ...t })), perfilPadrao: { ...config.perfilPadrao },
            mudancas: [...c.mudancas, { id: newId("MD"), descricao: `Configuração copiada de ${config.veiculo}`, em: new Date().toISOString(), por: OPERADOR }],
          }));
          onToast(`Copiado para ${destinos.length} veículo(s) — cada um precisa de novo embarque.`);
        }} />
        <button
          className="wsp-btn primario" onClick={() => { setResultado(null); setFase("revisao"); }}
          disabled={!config.mudancas.length}
          title={!config.mudancas.length ? "Nada a embarcar: não há alterações pendentes" : erros.length ? `${erros.length} problema(s) a corrigir` : "Revisar e embarcar"}
        >
          <Upload size={14} /> Revisar e embarcar
        </button>
        <button className="wsp-icone so-desktop" onClick={() => setInspetorAberto(!inspetorAberto)} aria-label={inspetorAberto ? "Fechar inspetor" : "Abrir inspetor"} aria-pressed={inspetorAberto}>
          {inspetorAberto ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
        </button>
      </div>
    </header>

    <div className={`wsp-corpo ${inspetorAberto ? "" : "sem-inspetor"}`}>
      <VehicleNavigator configs={configs} selecionado={config.veiculo} busca={busca} onLimparBusca={onLimparBusca} onSelecionar={(v) => { setVeiculo(v); setSelecao({ tipo: "padrao" }); }} />

      <MacroGraphCanvas
        config={config} selecao={selecao} validacoes={validacoes}
        onSelecionar={(s) => { setSelecao(s); setInspetorAberto(true); }}
        onMoverMacro={(id, x, y) => reposicionar((c) => ({ ...c, macros: c.macros.map((m) => m.id === id ? { ...m, x, y } : m) }))}
        onCriarTransicao={(de, para) => {
          const nomeDe = config.macros.find((m) => m.id === de)?.nome ?? de;
          const nomePara = config.macros.find((m) => m.id === para)?.nome ?? para;
          alterar(`Transição ${nomeDe} → ${nomePara} criada`, (c) => ({ ...c, transicoes: [...c.transicoes, { de, para }] }));
          onToast(`Transição criada: ${nomeDe} → ${nomePara}.`);
        }}
        onNovaMacro={() => setNovaMacro(true)}
        onAutoLayout={() => { reposicionar((c) => ({ ...c, macros: autoLayout(c) })); onToast("Grafo reorganizado em camadas."); }}
        onToast={onToast}
      />

      {inspetorAberto ? <>
        <button className="wsp-inspetor-fundo" aria-label="Fechar inspetor" onClick={() => setInspetorAberto(false)} />
        <ProfileInspector
          config={config} selecao={selecao} aba={aba} validacoes={validacoes}
          onAba={setAba} onPatchPerfil={patchPerfil} onRemoverMacro={removerMacro} onRemoverTransicao={removerTransicao}
        />
      </> : null}
    </div>

    {desfazer ? <div className="wsp-desfazer" role="status">
      <span>{desfazer.texto}</span>
      <button onClick={aplicarDesfazer}><Undo2 size={13} /> Desfazer</button>
      <button className="fechar" onClick={() => setDesfazer(null)} aria-label="Dispensar"><X size={13} /></button>
    </div> : null}

    {novaMacro ? <NovaMacroModal onClose={() => setNovaMacro(false)} onCriar={criarMacro} /> : null}

    {confirmacao ? <Modal title={confirmacao.titulo} onClose={() => setConfirmacao(null)}>
      <p className="wsp-ajuda">{confirmacao.corpo}</p>
      <div className="modal-actions">
        <button className="secondary-btn" onClick={() => setConfirmacao(null)}>Cancelar</button>
        <button className="danger-btn" onClick={() => { confirmacao.acao(); setConfirmacao(null); }}>Remover</button>
      </div>
    </Modal> : null}

    {fase ? <DeployReviewDialog
      config={config} validacoes={validacoes} fase={fase} resultado={resultado}
      onClose={() => { setFase(null); setResultado(null); }}
      onConfirmar={confirmarEmbarque}
      onTentarNovamente={() => { setResultado(null); setFase("revisao"); }}
    /> : null}
  </div>;
}

function NovaMacroModal({ onClose, onCriar }: { onClose: () => void; onCriar: (nome: string, descricao: string, tipo: TipoMacro) => void }) {
  const [nome, setNome] = useState("Parada para inspeção");
  const [descricao, setDescricao] = useState("Parada não prevista para verificação do veículo.");
  const [tipo, setTipo] = useState<TipoMacro>("operacao");
  return <Modal title="Nova macro" description="Um comportamento que o motorista pode informar — e o perfil que ele ativa neste veículo." onClose={onClose}>
    <div className="form-field"><label>Nome</label><input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
    <div className="form-field"><label>Descrição</label><input value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
    <div className="form-field"><label>Papel na sequência</label>
      <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoMacro)}>
        <option value="inicio">Início — abre a sequência</option>
        <option value="operacao">Operação — estado do meio</option>
        <option value="fim">Fim — encerra a sequência</option>
      </select>
    </div>
    <p className="wsp-ajuda menor">O perfil começa como cópia do padrão do veículo. Enquanto ela não estiver ligada no grafo, o embarque fica bloqueado.</p>
    <div className="modal-actions"><button className="secondary-btn" onClick={onClose}>Cancelar</button><button className="primary-btn" disabled={!nome.trim()} onClick={() => onCriar(nome.trim(), descricao.trim(), tipo)}>Criar macro</button></div>
  </Modal>;
}

function CopiarConfig({ config, configs, onCopiar }: { config: ConfiguracaoVeiculo; configs: ConfiguracaoVeiculo[]; onCopiar: (destinos: string[]) => void }) {
  const [aberto, setAberto] = useState(false);
  const [destinos, setDestinos] = useState<string[]>([]);
  const outros = configs.filter((c) => c.veiculo !== config.veiculo);
  return <>
    <button className="wsp-btn" onClick={() => { setDestinos([]); setAberto(true); }}><Copy size={14} /> Copiar</button>
    {aberto ? <Modal title={`Copiar a configuração de ${config.veiculo}`} description="Macros, sequência e perfis vão junto. O destino fica com alterações pendentes de embarque." onClose={() => setAberto(false)}>
      <Callout tone="warn" title="Isto substitui a configuração do destino">Veículos com equipamento ou carga diferentes costumam precisar de posturas diferentes — confira antes de embarcar.</Callout>
      <div className="check-list" style={{ marginTop: 12 }}>{outros.map((c) => {
        const on = destinos.includes(c.veiculo);
        return <label key={c.veiculo} className={`check-item ${on ? "on" : ""}`}>
          <input type="checkbox" checked={on} onChange={() => setDestinos(on ? destinos.filter((v) => v !== c.veiculo) : [...destinos, c.veiculo])} />
          <span><strong>{c.veiculo}</strong><small>{c.frota} · {c.macros.length} macros · {statusSyncLabel[statusConfig(c)].toLowerCase()}</small></span>
        </label>;
      })}</div>
      <div className="modal-actions">
        <button className="secondary-btn" onClick={() => setAberto(false)}>Cancelar</button>
        <button className="primary-btn" disabled={!destinos.length} onClick={() => { onCopiar(destinos); setAberto(false); }}><RotateCcw size={13} /> Copiar para {destinos.length}</button>
      </div>
    </Modal> : null}
  </>;
}
