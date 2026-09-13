import { useState } from "react";
import { AlertTriangle, BellRing, Camera, ChevronDown, ChevronRight, Clock3, Info, Radio, Trash2, Volume2, X } from "lucide-react";
import { Toggle } from "../../shared";
import {
  acoesPadrao, acionamentoLabel, atuadorLabel, canalEnvioLabel, catalogoRegras, categoriaDaMacro, categoriaMacroLabel, estadosSensor, estadosSensorKeys, posturaLabel, sensorLabel,
  type Atuador, type CanalEnvio, type CategoriaMacro, type ConfigAtuador, type ConfiguracaoAcoes, type ConfiguracaoVeiculo, type MacroVeiculo, type ModoAcionamento, type PerfilOperacional, type PosturaAtuador, type Validacao,
} from "../../domain";
import type { SelecaoGrafo } from "./MacroGraphCanvas";

const posturas: PosturaAtuador[] = ["ligado", "desligado"];
const modos: ModoAcionamento[] = ["temporario", "permanente"];
const atuadores = Object.keys(atuadorLabel) as Atuador[];
const canais = Object.keys(canalEnvioLabel) as CanalEnvio[];

export type AbaInspetor = "estado" | "regras" | "acoes" | "contingencia";
type EditorProps = { perfil: PerfilOperacional; onPatchPerfil: (d: string, fn: (p: PerfilOperacional) => PerfilOperacional) => void };

const acoesDoPerfil = (perfil: PerfilOperacional): ConfiguracaoAcoes => {
  const padrao = acoesPadrao();
  return { ...padrao, ...perfil.acoes, camera: { ...padrao.camera, ...perfil.acoes?.camera } };
};

export function ProfileInspector({ config, selecao, aba, validacoes, onAba, onFechar, onPatchPerfil, onRemoverMacro, onRemoverTransicao }: {
  config: ConfiguracaoVeiculo;
  selecao: SelecaoGrafo;
  aba: AbaInspetor;
  validacoes: Validacao[];
  onAba: (a: AbaInspetor) => void;
  onFechar: () => void;
  onPatchPerfil: (descricao: string, fn: (p: PerfilOperacional) => PerfilOperacional) => void;
  onRemoverMacro: (macro: MacroVeiculo) => void;
  onRemoverTransicao: (de: string, para: string) => void;
}) {
  if (selecao.tipo === "transicao") {
    const de = config.macros.find((m) => m.id === selecao.de);
    const para = config.macros.find((m) => m.id === selecao.para);
    return <aside className="wsp-inspetor" aria-label="Transição selecionada">
      <header className="wsp-inspetor-head"><div>
        <p className="wsp-inspetor-tipo">Transição permitida</p>
        <h2>{de?.nome} → {para?.nome}</h2>
        <p className="wsp-inspetor-sub">Estando em “{de?.nome}”, o motorista pode registrar “{para?.nome}”.</p>
      </div><button className="wsp-inspetor-fechar" onClick={onFechar} aria-label="Fechar editor"><X size={15} /></button></header>
      <div className="wsp-inspetor-corpo"><p className="wsp-ajuda">As setas definem os próximos estados aceitos pelo equipamento. Qualquer transição fora do grafo será recusada.</p></div>
      <footer className="wsp-inspetor-rodape"><button className="wsp-btn perigo" onClick={() => onRemoverTransicao(selecao.de, selecao.para)}><Trash2 size={14} /> Remover transição</button></footer>
    </aside>;
  }

  const macro = selecao.tipo === "macro" ? config.macros.find((m) => m.id === selecao.id) ?? null : null;
  const categoria = macro ? categoriaDaMacro(macro) : null;
  const configuraInteligencia = !macro || categoria === "logistica";
  const perfil = macro ? macro.perfil : config.perfilPadrao;
  const doItem = validacoes.filter((v) => macro ? v.macroId === macro.id : !v.macroId);
  const abas: { id: AbaInspetor; label: string }[] = [
    { id: "estado", label: "Postura" },
    { id: "regras", label: "Detecção" },
    { id: "acoes", label: "Reação" },
    { id: "contingencia", label: "Contingência" },
  ];

  return <aside className="wsp-inspetor" aria-label="Editor da macro selecionada">
    <header className="wsp-inspetor-head"><div>
      <p className="wsp-inspetor-tipo">{macro ? `Macro · ${categoriaMacroLabel[categoria!]} · ${macro.tipo === "inicio" ? "início" : macro.tipo === "fim" ? "fim" : "operação"}` : "Perfil padrão do veículo"}</p>
      <h2>{macro ? macro.nome : "Nenhuma macro em curso"}</h2>
      <p className="wsp-inspetor-sub">{macro?.descricao ?? "Configuração aplicada quando nenhuma macro está ativa."}</p>
      {configuraInteligencia ? <label className="wsp-inspetor-perfil"><span>Perfil ativado</span><input className="wsp-inspetor-nome" value={perfil.nome} aria-label="Nome do perfil" onChange={(e) => onPatchPerfil(`Perfil renomeado para “${e.target.value}”`, (p) => ({ ...p, nome: e.target.value }))} /></label> : null}
    </div><button className="wsp-inspetor-fechar" onClick={onFechar} aria-label="Fechar editor"><X size={15} /></button>
    {configuraInteligencia ? <nav className="wsp-abas" role="tablist" aria-label="Configurações da macro">{abas.map(({ id, label }) => <button key={id} role="tab" aria-selected={aba === id} className={aba === id ? "ativa" : ""} onClick={() => onAba(id)}>{label}</button>)}</nav> : null}</header>

    <div className="wsp-inspetor-corpo">
      {doItem.length ? <div className="wsp-inspetor-alertas">{doItem.map((v, i) => <p key={i} className={v.nivel === "erro" ? "erro" : "aviso"}><AlertTriangle size={13} /> {v.mensagem}</p>)}</div> : null}
      {!configuraInteligencia && categoria ? <MacroSemInteligencia categoria={categoria} /> : null}
      {configuraInteligencia && aba === "estado" ? <InitialStateSettings perfil={perfil} onPatchPerfil={onPatchPerfil} /> : null}
      {configuraInteligencia && aba === "regras" ? <RulesSettings perfil={perfil} onPatchPerfil={onPatchPerfil} /> : null}
      {configuraInteligencia && aba === "acoes" ? <ActionSettings perfil={perfil} onPatchPerfil={onPatchPerfil} /> : null}
      {configuraInteligencia && aba === "contingencia" ? <ContingencySettings perfil={perfil} onPatchPerfil={onPatchPerfil} /> : null}
    </div>

    {macro ? <footer className="wsp-inspetor-rodape"><span className="wsp-inspetor-rodape-info">{categoria === "logistica" ? "As regras entram no próximo embarque deste veículo." : categoria === "jornada" ? "Registra a jornada sem alterar a inteligência embarcada." : "Registra a informação sem alterar a inteligência embarcada."}</span><button className="wsp-btn perigo" onClick={() => onRemoverMacro(macro)}><Trash2 size={14} /> Remover macro</button></footer>
      : <footer className="wsp-inspetor-rodape"><span className="wsp-inspetor-rodape-info">Este perfil volta a valer ao encerrar a sequência de macros.</span></footer>}
  </aside>;
}

function MacroSemInteligencia({ categoria }: { categoria: Exclude<CategoriaMacro, "logistica"> }) {
  const jornada = categoria === "jornada";
  const Icone = jornada ? Clock3 : Info;
  return <div className={`wsp-macro-simples ${categoria}`}>
    <span className="wsp-macro-simples-icone"><Icone size={19} /></span>
    <div><strong>{jornada ? "Controle de jornada" : "Registro informativo"}</strong><p>{jornada ? "Esta macro registra a atividade do motorista. Postura, sensores, reações e contingência permanecem inalterados." : "Esta macro registra uma ocorrência operacional. Ela não aciona sensores, regras, alertas ou atuadores."}</p></div>
  </div>;
}

function InitialStateSettings({ perfil, onPatchPerfil }: EditorProps) {
  const aplicarTodos = (postura: PosturaAtuador) => onPatchPerfil(`Todos os atuadores em “${posturaLabel[postura]}”`, (p) => ({ ...p, atuadores: Object.fromEntries(atuadores.map((a) => [a, { ...p.atuadores[a], postura }])) as Record<Atuador, ConfigAtuador> }));
  return <>
    <SectionIntro title="Estado inicial dos atuadores">Ao entrar nesta macro, o equipamento assume estes estados imediatamente.</SectionIntro>
    <div className="wsp-aplicar-todos">Aplicar a todos: {posturas.map((p) => <button key={p} className="wsp-link" onClick={() => aplicarTodos(p)}>{posturaLabel[p]}</button>)}</div>
    <ul className="wsp-lista">{atuadores.map((atuador) => <li key={atuador} className="wsp-item simples"><div className="wsp-item-head estatico"><span className="wsp-item-nome">{atuadorLabel[atuador]}</span><Segmentado opcoes={posturas.map((p) => ({ id: p, label: posturaLabel[p] }))} valor={perfil.atuadores[atuador].postura} onChange={(v) => onPatchPerfil(`${atuadorLabel[atuador]} inicia ${posturaLabel[v as PosturaAtuador].toLowerCase()}`, (p) => ({ ...p, atuadores: { ...p.atuadores, [atuador]: { ...p.atuadores[atuador], postura: v as PosturaAtuador } } }))} /></div></li>)}</ul>
  </>;
}

function RulesSettings({ perfil, onPatchPerfil }: EditorProps) {
  return <>
    <SectionIntro title="Sensores e regras de violação">Arme sensores físicos e complemente a política com regras do catálogo.</SectionIntro>
    <p className="wsp-grupo-titulo">Sensores do equipamento</p>
    <ul className="wsp-lista">{estadosSensorKeys.map((sensor) => {
      const s = perfil.sensores.find((x) => x.sensor === sensor);
      const armado = Boolean(s?.armado);
      return <li key={sensor} className="wsp-item simples">
        <div className="wsp-item-head estatico"><span className="wsp-item-nome">{sensorLabel[sensor]}</span><Toggle checked={armado} onChange={(next) => onPatchPerfil(`${sensorLabel[sensor]} ${next ? "armado" : "desarmado"}`, (p) => ({ ...p, sensores: p.sensores.some((x) => x.sensor === sensor) ? p.sensores.map((x) => x.sensor === sensor ? { ...x, armado: next } : x) : [...p.sensores, { sensor, armado: next, estadoViolacao: estadosSensor[sensor][0] }], contingencia: next ? p.contingencia : { ...p.contingencia, sensores: p.contingencia.sensores.filter((x) => x !== sensor) } }))} label={armado ? "Armado" : "Desarmado"} /></div>
        {armado ? <div className="wsp-item-corpo sem-borda"><Campo rotulo="Conta como violação quando"><select value={s?.estadoViolacao} onChange={(e) => onPatchPerfil(`${sensorLabel[sensor]}: violação = ${e.target.value}`, (p) => ({ ...p, sensores: p.sensores.map((x) => x.sensor === sensor ? { ...x, estadoViolacao: e.target.value } : x) }))}>{estadosSensor[sensor].map((estado) => <option key={estado} value={estado}>{estado}</option>)}</select></Campo></div> : null}
      </li>;
    })}</ul>

    <p className="wsp-grupo-titulo com-margem">Catálogo de regras</p>
    <div className="wsp-catalogo-regras">{catalogoRegras.map((regra) => {
      const ativa = Boolean(perfil.regras?.find((r) => r.regra === regra.id)?.habilitada);
      return <label key={regra.id} className={`wsp-regra ${ativa ? "ativa" : ""}`}><input type="checkbox" checked={ativa} onChange={(e) => onPatchPerfil(`${regra.nome} ${e.target.checked ? "habilitada" : "desabilitada"}`, (p) => ({ ...p, regras: p.regras?.some((r) => r.regra === regra.id) ? p.regras.map((r) => r.regra === regra.id ? { ...r, habilitada: e.target.checked } : r) : [...(p.regras ?? []), { regra: regra.id, habilitada: e.target.checked }] }))} /><span><strong>{regra.nome}</strong><small>{regra.descricao}</small></span></label>;
    })}</div>
    <div className="wsp-bloco"><div className="wsp-bloco-head"><span>Evitar repetição da mesma violação</span><Toggle checked={perfil.latchViolacao} onChange={(next) => onPatchPerfil(`Latch ${next ? "ativado" : "desativado"}`, (p) => ({ ...p, latchViolacao: next }))} label={perfil.latchViolacao ? "Ativo" : "Desligado"} /></div><p className="wsp-ajuda menor">Uma nova reação só ocorre depois que a condição cessar ou o perfil mudar.</p></div>
  </>;
}

function ActionSettings({ perfil, onPatchPerfil }: EditorProps) {
  const [aberto, setAberto] = useState<Atuador | null>(null);
  const acoes = acoesDoPerfil(perfil);
  const patchAcoes = (descricao: string, fn: (atual: ConfiguracaoAcoes) => ConfiguracaoAcoes) => onPatchPerfil(descricao, (p) => ({ ...p, acoes: fn(acoesDoPerfil(p)) }));
  const patchAtuador = (atuador: Atuador, descricao: string, fn: (a: ConfigAtuador) => ConfigAtuador) => onPatchPerfil(descricao, (p) => ({ ...p, atuadores: { ...p.atuadores, [atuador]: fn(p.atuadores[atuador]) } }));
  return <>
    <SectionIntro title="Ações da violação">Escolha o que o equipamento executa e como a ocorrência chega à central.</SectionIntro>
    <p className="wsp-grupo-titulo">Atuadores acionados</p>
    <ul className="wsp-lista">{atuadores.map((atuador) => {
      const item = perfil.atuadores[atuador];
      const ativo = item.acionarEmViolacao ?? (atuador === "sirene" || atuador === "luz_alerta");
      const expandido = aberto === atuador && ativo;
      return <li key={atuador} className={`wsp-item ${expandido ? "aberto" : ""}`}>
        <div className="wsp-item-head estatico"><button className="wsp-item-expande" disabled={!ativo} aria-label={`Configurar ${atuadorLabel[atuador]}`} onClick={() => setAberto(expandido ? null : atuador)}>{expandido ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button><span className="wsp-item-nome">{atuadorLabel[atuador]}</span><Toggle checked={ativo} onChange={(next) => patchAtuador(atuador, `${atuadorLabel[atuador]} ${next ? "incluído nas ações" : "removido das ações"}`, (a) => ({ ...a, acionarEmViolacao: next }))} label={ativo ? "Acionar" : "Não acionar"} /></div>
        {expandido ? <div className="wsp-item-corpo"><Campo rotulo="Tipo de acionamento"><Segmentado opcoes={modos.map((m) => ({ id: m, label: acionamentoLabel[m] }))} valor={item.acionamento} onChange={(v) => patchAtuador(atuador, `${atuadorLabel[atuador]}: ${acionamentoLabel[v as ModoAcionamento]}`, (a) => ({ ...a, acionamento: v as ModoAcionamento }))} /></Campo>{item.acionamento === "temporario" ? <label className="wsp-campo-inline">Duração <input type="number" min={1} value={item.duracaoSeg} onChange={(e) => patchAtuador(atuador, `${atuadorLabel[atuador]}: ${e.target.value}s`, (a) => ({ ...a, duracaoSeg: Number(e.target.value) }))} /> segundos</label> : <p className="wsp-ajuda menor">Permanece acionado até a violação cessar e a central autorizar.</p>}</div> : null}
      </li>;
    })}</ul>

    <p className="wsp-grupo-titulo com-margem">Cabine e central</p>
    <div className="wsp-acoes-grid">
      <ActionCard icon={<BellRing size={16} />} title="Aviso na cabine" help="Exibe uma orientação ao motorista."><Toggle checked={acoes.avisoCabine} onChange={(next) => patchAcoes(`Aviso na cabine ${next ? "ativado" : "desativado"}`, (a) => ({ ...a, avisoCabine: next }))} /></ActionCard>
      <ActionCard icon={<Volume2 size={16} />} title="Áudio na cabine" help="Reproduzido ao detectar a violação." vertical><select value={acoes.audio} onChange={(e) => patchAcoes("Áudio da cabine alterado", (a) => ({ ...a, audio: e.target.value as ConfiguracaoAcoes["audio"] }))}><option value="nenhum">Sem áudio</option><option value="alerta">Tom de alerta</option><option value="instrucao_parada">“Pare em local seguro”</option><option value="contate_central">“Contate a central”</option></select></ActionCard>
      <ActionCard icon={<Radio size={16} />} title="Gerar evento" help="Cria ocorrência para tratamento na central."><Toggle checked={acoes.gerarEvento} onChange={(next) => patchAcoes(`Geração de evento ${next ? "ativada" : "desativada"}`, (a) => ({ ...a, gerarEvento: next }))} /></ActionCard>
    </div>
    <Campo rotulo="Canais de envio do evento"><div className="wsp-canais">{canais.map((canal) => { const ativo = acoes.canais.includes(canal); return <button key={canal} className={`wsp-canal ${ativo ? "ativo" : ""}`} aria-pressed={ativo} onClick={() => patchAcoes(`${canalEnvioLabel[canal]} ${ativo ? "removido" : "selecionado"}`, (a) => ({ ...a, canais: ativo ? a.canais.filter((c) => c !== canal) : [...a.canais, canal] }))}><span>{canalEnvioLabel[canal]}</span><small>{canal === "tcp" ? "Rede celular/IP" : canal === "satelite" ? "Fallback satelital" : "Baixa banda"}</small></button>; })}</div></Campo>
    <div className="wsp-camera"><div className="wsp-camera-head"><Camera size={17} /><div><strong>Evidência de câmera</strong><small>Anexar imagem ou vídeo ao evento.</small></div><Toggle checked={acoes.camera.habilitada} onChange={(next) => patchAcoes(`Câmera ${next ? "habilitada" : "desabilitada"}`, (a) => ({ ...a, camera: { ...a.camera, habilitada: next } }))} /></div>{acoes.camera.habilitada ? <div className="wsp-camera-opcoes"><Segmentado opcoes={[{ id: "snapshot", label: "Snapshot" }, { id: "gravacao", label: "Gravar vídeo" }]} valor={acoes.camera.modo} onChange={(modo) => patchAcoes(`Evidência: ${modo}`, (a) => ({ ...a, camera: { ...a.camera, modo: modo as "snapshot" | "gravacao" } }))} />{acoes.camera.modo === "gravacao" ? <label className="wsp-campo-inline">Gravar <input type="number" min={5} max={300} value={acoes.camera.duracaoSeg} onChange={(e) => patchAcoes(`Gravação de ${e.target.value}s`, (a) => ({ ...a, camera: { ...a.camera, duracaoSeg: Number(e.target.value) } }))} /> segundos</label> : <p className="wsp-ajuda menor">Captura uma imagem no instante da violação.</p>}</div> : null}</div>
  </>;
}

function ContingencySettings({ perfil, onPatchPerfil }: EditorProps) {
  const armados = perfil.sensores.filter((s) => s.armado);
  const ativos = perfil.contingencia.canais ?? ["satelite", "lora"];
  const repetir = perfil.contingencia.repetirEnquantoViolacao ?? true;
  return <>
    <SectionIntro title="Contingência de comunicação">Defina o comportamento quando Satélite ou LoRa assumirem o envio.</SectionIntro>
    <Campo rotulo="Canais habilitados na contingência"><div className="wsp-canais">{(["satelite", "lora"] as const).map((canal) => { const ativo = ativos.includes(canal); return <button key={canal} className={`wsp-canal ${ativo ? "ativo" : ""}`} aria-pressed={ativo} onClick={() => onPatchPerfil(`${canalEnvioLabel[canal]} ${ativo ? "desabilitado" : "habilitado"}`, (p) => ({ ...p, contingencia: { ...p.contingencia, canais: ativo ? ativos.filter((c) => c !== canal) : [...ativos, canal] } }))}><span>{canalEnvioLabel[canal]}</span><small>{canal === "satelite" ? "Cobertura ampla" : "Rede LoRa disponível"}</small></button>; })}</div></Campo>
    <Campo rotulo="Violações que merecem contingência">{armados.length ? <div className="wsp-chips">{armados.map((s) => { const on = perfil.contingencia.sensores.includes(s.sensor); return <button key={s.sensor} className={`wsp-chip ${on ? "on" : ""}`} aria-pressed={on} onClick={() => onPatchPerfil(`${sensorLabel[s.sensor]} ${on ? "fora da" : "na"} contingência`, (p) => ({ ...p, contingencia: { ...p.contingencia, sensores: on ? p.contingencia.sensores.filter((x) => x !== s.sensor) : [...p.contingencia.sensores, s.sensor] } }))}>{sensorLabel[s.sensor]}</button>; })}</div> : <p className="wsp-vazio">Nenhum sensor armado. Configure a aba Sensores e regras.</p>}</Campo>
    <div className="wsp-bloco"><div className="wsp-bloco-head"><span>Enquanto permanecer em violação</span><Toggle checked={repetir} onChange={(next) => onPatchPerfil(`Repetição de contingência ${next ? "ativada" : "desativada"}`, (p) => ({ ...p, contingencia: { ...p.contingencia, repetirEnquantoViolacao: next } }))} label={repetir ? "Repetir mensagens" : "Enviar uma vez"} /></div>{repetir ? <Campo rotulo="Gerar nova mensagem a cada"><select value={perfil.contingencia.frequenciaReporteSeg} onChange={(e) => onPatchPerfil(`Reporte em contingência a cada ${e.target.value}s`, (p) => ({ ...p, contingencia: { ...p.contingencia, frequenciaReporteSeg: Number(e.target.value) } }))}>{[30, 60, 120, 300, 900].map((seg) => <option key={seg} value={seg}>{seg < 60 ? `${seg} segundos` : `${seg / 60} minuto${seg > 60 ? "s" : ""}`}</option>)}</select></Campo> : null}</div>
    <Campo rotulo="A configuração temporária expira em"><select value={perfil.contingencia.expiraEmHoras} onChange={(e) => onPatchPerfil(`Contingência expira em ${e.target.value} h`, (p) => ({ ...p, contingencia: { ...p.contingencia, expiraEmHoras: Number(e.target.value) } }))}>{[1, 2, 4, 6, 8, 12, 18].map((h) => <option key={h} value={h}>{h} h</option>)}</select></Campo>
  </>;
}

function SectionIntro({ title, children }: { title: string; children: React.ReactNode }) { return <div className="wsp-secao-topo"><p className="wsp-secao-kicker">{title}</p><p className="wsp-ajuda">{children}</p></div>; }
function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) { return <div className="wsp-campo"><span className="wsp-campo-rotulo">{rotulo}</span>{children}</div>; }
function Segmentado({ opcoes, valor, onChange }: { opcoes: { id: string; label: string }[]; valor: string; onChange: (v: string) => void }) { return <div className="wsp-segmentado" role="radiogroup">{opcoes.map((o) => <button key={o.id} role="radio" aria-checked={valor === o.id} className={valor === o.id ? "ativo" : ""} onClick={() => onChange(o.id)}>{o.label}</button>)}</div>; }
function ActionCard({ icon, title, help, children, vertical = false }: { icon: React.ReactNode; title: string; help: string; children: React.ReactNode; vertical?: boolean }) { return <div className={`wsp-acao-card ${vertical ? "vertical" : ""}`}><div className="wsp-acao-card-head">{icon}<div><strong>{title}</strong><small>{help}</small></div></div>{children}</div>; }
