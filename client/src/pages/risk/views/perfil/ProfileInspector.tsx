import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, HelpCircle, Trash2 } from "lucide-react";
import { Toggle } from "../../shared";
import {
  acionamentoLabel, atuadorLabel, estadosSensor, estadosSensorKeys, posturaLabel, sensorLabel,
  type Atuador, type ConfigAtuador, type ConfiguracaoVeiculo, type MacroVeiculo, type ModoAcionamento, type PerfilOperacional, type PosturaAtuador, type Sensor, type Validacao,
} from "../../domain";
import type { SelecaoGrafo } from "./MacroGraphCanvas";

const posturas: PosturaAtuador[] = ["ligado", "desligado"];
const modos: ModoAcionamento[] = ["temporario", "permanente"];
const atuadores = Object.keys(atuadorLabel) as Atuador[];

export type AbaInspetor = "atuadores" | "sensores" | "contingencia";

export function ProfileInspector({ config, selecao, aba, validacoes, onAba, onPatchPerfil, onRemoverMacro, onRemoverTransicao }: {
  config: ConfiguracaoVeiculo;
  selecao: SelecaoGrafo;
  aba: AbaInspetor;
  validacoes: Validacao[];
  onAba: (a: AbaInspetor) => void;
  onPatchPerfil: (descricao: string, fn: (p: PerfilOperacional) => PerfilOperacional) => void;
  onRemoverMacro: (macro: MacroVeiculo) => void;
  onRemoverTransicao: (de: string, para: string) => void;
}) {
  if (selecao.tipo === "transicao") {
    const de = config.macros.find((m) => m.id === selecao.de);
    const para = config.macros.find((m) => m.id === selecao.para);
    return <aside className="wsp-inspetor" aria-label="Transição selecionada">
      <header className="wsp-inspetor-head">
        <div>
          <p className="wsp-inspetor-tipo">Transição</p>
          <h2>{de?.nome} → {para?.nome}</h2>
          <p className="wsp-inspetor-sub">Estando em “{de?.nome}”, o motorista pode registrar “{para?.nome}”.</p>
        </div>
      </header>
      <div className="wsp-inspetor-corpo">
        <p className="wsp-ajuda">O equipamento recusa qualquer transição que não esteja no grafo, independentemente do que o app tenha apresentado.</p>
      </div>
      <footer className="wsp-inspetor-rodape">
        <button className="wsp-btn perigo" onClick={() => onRemoverTransicao(selecao.de, selecao.para)}><Trash2 size={14} /> Remover transição</button>
      </footer>
    </aside>;
  }

  const macro = selecao.tipo === "macro" ? config.macros.find((m) => m.id === selecao.id) ?? null : null;
  const perfil = macro ? macro.perfil : config.perfilPadrao;
  const doItem = validacoes.filter((v) => macro ? v.macroId === macro.id : !v.macroId);

  return <aside className="wsp-inspetor" aria-label="Perfil selecionado">
    <header className="wsp-inspetor-head">
      <div>
        <p className="wsp-inspetor-tipo">{macro ? (macro.tipo === "inicio" ? "Macro · início" : macro.tipo === "fim" ? "Macro · fim" : "Macro") : "Perfil padrão do veículo"}</p>
        <h2>{macro ? macro.nome : "Nenhuma macro em curso"}</h2>
        <input
          className="wsp-inspetor-nome" value={perfil.nome} aria-label="Nome do perfil"
          onChange={(e) => onPatchPerfil(`Perfil renomeado para “${e.target.value}”`, (p) => ({ ...p, nome: e.target.value }))}
        />
      </div>
      <nav className="wsp-abas" role="tablist" aria-label="Seções do perfil">
        {(["atuadores", "sensores", "contingencia"] as AbaInspetor[]).map((id) => (
          <button key={id} role="tab" aria-selected={aba === id} className={aba === id ? "ativa" : ""} onClick={() => onAba(id)}>
            {id === "atuadores" ? "Atuadores" : id === "sensores" ? "Sensores" : "Contingência"}
          </button>
        ))}
      </nav>
    </header>

    <div className="wsp-inspetor-corpo">
      {doItem.length ? <div className="wsp-inspetor-alertas">{doItem.map((v, i) => (
        <p key={i} className={v.nivel === "erro" ? "erro" : "aviso"}><AlertTriangle size={13} /> {v.mensagem}</p>
      ))}</div> : null}

      {aba === "atuadores" ? <ActuatorList perfil={perfil} onPatchPerfil={onPatchPerfil} /> : null}
      {aba === "sensores" ? <SensorList perfil={perfil} onPatchPerfil={onPatchPerfil} /> : null}
      {aba === "contingencia" ? <ContingencySettings perfil={perfil} onPatchPerfil={onPatchPerfil} /> : null}
    </div>

    {macro ? <footer className="wsp-inspetor-rodape">
      <span className="wsp-inspetor-rodape-info">{macro.descricao}</span>
      <button className="wsp-btn perigo" onClick={() => onRemoverMacro(macro)}><Trash2 size={14} /> Remover macro</button>
    </footer> : <footer className="wsp-inspetor-rodape">
      <span className="wsp-inspetor-rodape-info">Vale quando nenhuma macro está em curso, e é restaurado pela limpeza da política embarcada.</span>
    </footer>}
  </aside>;
}

// ------------------------------------------------------------------ Atuadores

export function ActuatorList({ perfil, onPatchPerfil }: { perfil: PerfilOperacional; onPatchPerfil: (d: string, fn: (p: PerfilOperacional) => PerfilOperacional) => void }) {
  const [aberto, setAberto] = useState<Atuador | null>(null);

  const patch = (atuador: Atuador, descricao: string, fn: (a: ConfigAtuador) => ConfigAtuador) =>
    onPatchPerfil(descricao, (p) => ({ ...p, atuadores: { ...p.atuadores, [atuador]: fn(p.atuadores[atuador]) } }));

  const aplicarPosturaATodos = (postura: PosturaAtuador) => onPatchPerfil(`Todos os atuadores em “${posturaLabel[postura]}”`, (p) => ({
    ...p,
    atuadores: Object.fromEntries(atuadores.map((a) => [a, { ...p.atuadores[a], postura }])) as Record<Atuador, ConfigAtuador>,
  }));

  return <>
    <div className="wsp-secao-topo">
      <p className="wsp-ajuda">
        Assumir este perfil define o estado de <strong>todos</strong> os atuadores — inclusive os desligados.
        <Dica texto="Não existe “manter como estava”: sem a postura absoluta sobraria resíduo do modo anterior e o estado deixaria de ser conhecido." />
      </p>
      <div className="wsp-aplicar-todos">
        Aplicar a todos:
        {posturas.map((p) => <button key={p} className="wsp-link" onClick={() => aplicarPosturaATodos(p)}>{posturaLabel[p]}</button>)}
      </div>
    </div>

    <ul className="wsp-lista">{atuadores.map((atuador) => {
      const a = perfil.atuadores[atuador];
      const expandido = aberto === atuador;
      return <li key={atuador} className={`wsp-item ${expandido ? "aberto" : ""}`}>
        <button className="wsp-item-head" aria-expanded={expandido} onClick={() => setAberto(expandido ? null : atuador)}>
          {expandido ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="wsp-item-nome">{atuadorLabel[atuador]}</span>
          <span className="wsp-item-resumo">
            <span className={`wsp-pill ${a.postura === "ligado" ? "on" : ""}`}>{posturaLabel[a.postura]}</span>
            <span className="wsp-pill">{acionamentoLabel[a.acionamento]}{a.acionamento === "temporario" ? ` ${a.duracaoSeg}s` : ""}</span>
            {a.liberavelPeloMotorista ? <span className="wsp-pill motorista">motorista{a.limiteAcionamentos ? ` ·${a.limiteAcionamentos}x` : ""}{a.exigeAutenticacao ? " ·senha" : ""}</span> : null}
          </span>
        </button>

        {expandido ? <div className="wsp-item-corpo">
          <Campo rotulo="Postura ao entrar no perfil">
            <Segmentado
              opcoes={posturas.map((p) => ({ id: p, label: posturaLabel[p] }))} valor={a.postura}
              onChange={(v) => patch(atuador, `${atuadorLabel[atuador]}: postura ${posturaLabel[v as PosturaAtuador]}`, (c) => ({ ...c, postura: v as PosturaAtuador }))}
            />
          </Campo>

          <Campo rotulo="Quando uma violação aciona">
            <Segmentado
              opcoes={modos.map((m) => ({ id: m, label: acionamentoLabel[m] }))} valor={a.acionamento}
              onChange={(v) => patch(atuador, `${atuadorLabel[atuador]}: acionamento ${acionamentoLabel[v as ModoAcionamento]}`, (c) => ({ ...c, acionamento: v as ModoAcionamento }))}
            />
            {a.acionamento === "temporario"
              ? <label className="wsp-campo-inline">Encerra sozinho em
                  <input type="number" min={1} value={a.duracaoSeg} onChange={(e) => patch(atuador, `${atuadorLabel[atuador]}: duração ${e.target.value}s`, (c) => ({ ...c, duracaoSeg: Number(e.target.value) }))} /> s
                </label>
              : <ul className="wsp-condicoes"><li>a violação cessou</li><li><strong>e</strong> a central comandou o encerramento</li></ul>}
          </Campo>

          <Campo rotulo="Motorista pode acionar">
            <Toggle
              checked={a.liberavelPeloMotorista}
              onChange={(next) => patch(atuador, `${atuadorLabel[atuador]}: ${next ? "liberável pelo motorista" : "só pela central"}`, (c) => ({ ...c, liberavelPeloMotorista: next, limiteAcionamentos: next ? c.limiteAcionamentos : null, exigeAutenticacao: next ? c.exigeAutenticacao : false }))}
              label={a.liberavelPeloMotorista ? "Botão liberável na cabine" : "Só pela central"}
            />
            {a.liberavelPeloMotorista ? <div className="wsp-sub-campos">
              <label className="wsp-campo-inline">Limite
                <input type="number" min={0} value={a.limiteAcionamentos ?? 0} onChange={(e) => { const n = Number(e.target.value); patch(atuador, `${atuadorLabel[atuador]}: limite ${n || "sem limite"}`, (c) => ({ ...c, limiteAcionamentos: n > 0 ? n : null })); }} />
                {a.limiteAcionamentos ? "acionamentos" : "= sem limite"}
              </label>
              <Toggle checked={a.exigeAutenticacao} onChange={(next) => patch(atuador, `${atuadorLabel[atuador]}: ${next ? "exige credencial" : "sem credencial"}`, (c) => ({ ...c, exigeAutenticacao: next }))} label="Exige credencial do motorista" />
              <p className="wsp-ajuda menor">Esgotado o limite, só um novo embarque restaura a permissão.</p>
            </div> : null}
          </Campo>
        </div> : null}
      </li>;
    })}</ul>
  </>;
}

// ------------------------------------------------------------------- Sensores

export function SensorList({ perfil, onPatchPerfil }: { perfil: PerfilOperacional; onPatchPerfil: (d: string, fn: (p: PerfilOperacional) => PerfilOperacional) => void }) {
  return <>
    <p className="wsp-ajuda">
      O mesmo sensor muda de significado conforme o perfil.
      <Dica texto="Porta do baú aberta é normal no cliente e violação em viagem — por isso o estado que conta como violação é escolhido aqui, e não fixado no sensor." />
    </p>

    <ul className="wsp-lista">{estadosSensorKeys.map((sensor) => {
      const s = perfil.sensores.find((x) => x.sensor === sensor);
      const armado = Boolean(s?.armado);
      return <li key={sensor} className="wsp-item simples">
        <div className="wsp-item-head estatico">
          <span className="wsp-item-nome">{sensorLabel[sensor]}</span>
          <Toggle checked={armado} onChange={(next) => onPatchPerfil(`${sensorLabel[sensor]} ${next ? "armado" : "desarmado"}`, (p) => ({
            ...p,
            sensores: p.sensores.some((x) => x.sensor === sensor)
              ? p.sensores.map((x) => x.sensor === sensor ? { ...x, armado: next } : x)
              : [...p.sensores, { sensor, armado: next, estadoViolacao: estadosSensor[sensor][0] }],
            contingencia: next ? p.contingencia : { ...p.contingencia, sensores: p.contingencia.sensores.filter((x) => x !== sensor) },
          }))} label={armado ? "Armado" : "Desarmado"} />
        </div>
        {armado ? <div className="wsp-item-corpo sem-borda">
          <Campo rotulo="Estado que conta como violação">
            <select value={s?.estadoViolacao} onChange={(e) => onPatchPerfil(`${sensorLabel[sensor]}: violação = ${e.target.value}`, (p) => ({ ...p, sensores: p.sensores.map((x) => x.sensor === sensor ? { ...x, estadoViolacao: e.target.value } : x) }))}>
              {estadosSensor[sensor].map((estado) => <option key={estado} value={estado}>{estado}</option>)}
            </select>
          </Campo>
        </div> : null}
      </li>;
    })}</ul>

    <div className="wsp-bloco">
      <div className="wsp-bloco-head">
        <span>Latch de violação</span>
        <Toggle checked={perfil.latchViolacao} onChange={(next) => onPatchPerfil(`Latch ${next ? "ativado" : "desativado"}`, (p) => ({ ...p, latchViolacao: next }))} label={perfil.latchViolacao ? "Ativo" : "Desligado"} />
      </div>
      <p className="wsp-ajuda menor">
        {perfil.latchViolacao ? "Depois de reagir a uma violação, só volta a reagir quando o perfil trocar." : "Reage a cada violação, mesmo repetida."}
        <Dica texto="Sem o latch, um sensor oscilando na fronteira — porta que não fecha bem, trepidação — dispara a mesma reação dezenas de vezes." />
      </p>
    </div>
  </>;
}

// --------------------------------------------------------------- Contingência

export function ContingencySettings({ perfil, onPatchPerfil }: { perfil: PerfilOperacional; onPatchPerfil: (d: string, fn: (p: PerfilOperacional) => PerfilOperacional) => void }) {
  const armados = perfil.sensores.filter((s) => s.armado);
  return <>
    <p className="wsp-ajuda">
      Em satélite ou LoRaWAN a banda é mínima e cada mensagem custa.
      <Dica texto="Alertar por satélite cada abertura de porta consumiria o crédito antes do evento que importa — por isso é o perfil que decide o que vale a pena." />
    </p>

    <Campo rotulo="Sensores que geram alerta em contingência">
      {armados.length ? <div className="wsp-chips">{armados.map((s) => {
        const on = perfil.contingencia.sensores.includes(s.sensor);
        return <button key={s.sensor} className={`wsp-chip ${on ? "on" : ""}`} aria-pressed={on} onClick={() => onPatchPerfil(`${sensorLabel[s.sensor]} ${on ? "fora da" : "na"} contingência`, (p) => ({ ...p, contingencia: { ...p.contingencia, sensores: on ? p.contingencia.sensores.filter((x) => x !== s.sensor) : [...p.contingencia.sensores, s.sensor] } }))}>
          {sensorLabel[s.sensor]}
        </button>;
      })}</div> : <p className="wsp-vazio">Nenhum sensor armado neste perfil — arme um na aba Sensores.</p>}
    </Campo>

    <Campo rotulo="Frequência de reporte em contingência">
      <select value={perfil.contingencia.frequenciaReporteSeg} onChange={(e) => onPatchPerfil(`Reporte em contingência a cada ${e.target.value}s`, (p) => ({ ...p, contingencia: { ...p.contingencia, frequenciaReporteSeg: Number(e.target.value) } }))}>
        {[30, 60, 120, 300, 900].map((seg) => <option key={seg} value={seg}>{seg < 60 ? `A cada ${seg} s (alto consumo)` : `A cada ${seg / 60} min${seg === 900 ? " (economia)" : ""}`}</option>)}
      </select>
    </Campo>

    <Campo rotulo="O ajuste acima expira em">
      <select value={perfil.contingencia.expiraEmHoras} onChange={(e) => onPatchPerfil(`Ajuste de contingência expira em ${e.target.value} h`, (p) => ({ ...p, contingencia: { ...p.contingencia, expiraEmHoras: Number(e.target.value) } }))}>
        {[1, 2, 4, 6, 8, 12, 18].map((h) => <option key={h} value={h}>{h} h</option>)}
      </select>
      <p className="wsp-ajuda menor">Ao expirar volta ao padrão — é o que impede que uma decisão de emergência vire configuração permanente.</p>
    </Campo>
  </>;
}

// ------------------------------------------------------------------ Primitivos

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <div className="wsp-campo"><span className="wsp-campo-rotulo">{rotulo}</span>{children}</div>;
}

function Segmentado({ opcoes, valor, onChange }: { opcoes: { id: string; label: string }[]; valor: string; onChange: (v: string) => void }) {
  return <div className="wsp-segmentado" role="radiogroup">
    {opcoes.map((o) => <button key={o.id} role="radio" aria-checked={valor === o.id} className={valor === o.id ? "ativo" : ""} onClick={() => onChange(o.id)}>{o.label}</button>)}
  </div>;
}

function Dica({ texto }: { texto: string }) {
  const [aberto, setAberto] = useState(false);
  return <span className="wsp-dica">
    <button aria-label="Saiba mais" aria-expanded={aberto} onClick={() => setAberto(!aberto)}><HelpCircle size={13} /></button>
    {aberto ? <span className="wsp-dica-balao" role="note">{texto}</span> : null}
  </span>;
}
