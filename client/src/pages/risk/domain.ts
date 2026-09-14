/**
 * Domínio mock do Avansat Risk — MDVR como hardware de gestão de risco.
 * Sem backend: tudo aqui é dado demonstrativo, persistido em localStorage pelas views.
 */

export const STORAGE = {
  // v5: o perfil deixou de ser biblioteca publicada e virou configuracao de cada
  // veiculo, dentro de um grafo de macros. Dado salvo antes nao e migravel.
  configuracoes: "avansat-risk:v5:configuracoes-veiculo",
  // v6: ponto, cerca e rota passaram a carregar geometria com coordenadas. O dado
  // salvo antes não tem latitude nem longitude, então não há para onde migrar.
  pontos: "avansat-risk:v6:pontos-de-controle",
  cercas: "avansat-risk:v6:cercas",
  rotas: "avansat-risk:v6:rotas",
  rotogramas: "avansat-risk:v3:rotogramas",
  embarques: "avansat-risk:v3:embarques",
  credenciais: "avansat-risk:v3:credenciais",
  eventos: "avansat-risk:v3:eventos",
  mensagens: "avansat-risk:v3:mensagens",
  comandos: "avansat-risk:v3:historico-comandos",
  textosComando: "avansat-risk:v3:textos-comando",
  // Conveniências de tela: o operador escolhe quanta lista quer ver ao lado do mapa.
  painelCercas: "avansat-risk:v6:painel-cercas",
  inspetorCercas: "avansat-risk:v6:inspetor-cercas",
  painelPontos: "avansat-risk:v6:painel-pontos",
  inspetorPontos: "avansat-risk:v6:inspetor-pontos",
  painelItinerario: "avansat-risk:v6:painel-itinerario",
} as const;

// ---------------------------------------------------------------- Equipamentos

/** Por que o veiculo esta no perfil em que esta. DEV-51: gatilho ou comando; DEV-80: padrao. */
export type OrigemPerfil = { tipo: "geocerca" | "macro" | "comando" | "padrao"; ref: string };

export const origemPerfilLabel: Record<OrigemPerfil["tipo"], string> = { geocerca: "Geocerca do ponto de controle", macro: "Macro do motorista", comando: "Comando da central", padrao: "Perfil padrao (nenhum outro em vigor)" };

export type Equipamento = { veiculo: string; equipamento: string; linha: "MDVR-4" | "MDVR-8" | "MDVR-8 Pro"; firmware: string; perfilAtivo: string; perfilDesde: string; perfilOrigem: OrigemPerfil; canal: "celular" | "satelite" | "lorawan" | "sem_sinal" };

export const equipamentos: Equipamento[] = [
  { veiculo: "VTR-2048", equipamento: "MDVR-0882", linha: "MDVR-8 Pro", firmware: "4.2.1", perfilAtivo: "Em viagem", perfilDesde: "2026-09-08T11:42:00", perfilOrigem: { tipo: "macro", ref: "MC-INICIO" }, canal: "celular" },
  { veiculo: "VTR-1783", equipamento: "MDVR-0714", linha: "MDVR-8", firmware: "4.1.0", perfilAtivo: "Em viagem", perfilDesde: "2026-09-08T09:15:00", perfilOrigem: { tipo: "macro", ref: "MC-CLIENTE-OUT" }, canal: "celular" },
  { veiculo: "VTR-0931", equipamento: "MDVR-1028", linha: "MDVR-4", firmware: "3.9.4", perfilAtivo: "No cliente", perfilDesde: "2026-09-08T13:58:00", perfilOrigem: { tipo: "geocerca", ref: "PC-001" }, canal: "satelite" },
  { veiculo: "VTR-3110", equipamento: "MDVR-0921", linha: "MDVR-8", firmware: "4.2.1", perfilAtivo: "Abastecimento", perfilDesde: "2026-09-08T12:20:00", perfilOrigem: { tipo: "geocerca", ref: "PC-003" }, canal: "celular" },
  { veiculo: "VTR-2240", equipamento: "MDVR-0655", linha: "MDVR-4", firmware: "3.8.0", perfilAtivo: "Pernoite", perfilDesde: "2026-09-07T21:05:00", perfilOrigem: { tipo: "comando", ref: "Larissa Martins" }, canal: "sem_sinal" },
];

export const canalLabel: Record<Equipamento["canal"], string> = { celular: "Celular", satelite: "Satélite (contingência)", lorawan: "LoRaWAN (contingência)", sem_sinal: "Sem sinal" };

// ---------------------------------------------------------- Perfil Operacional
//
// O perfil e o MODO em que o veiculo esta: a postura de todos os atuadores, quais
// sensores estao armados e o que cada um considera violacao (ER_01 Secao 4.6).
//
// Ele NAO e uma biblioteca publicada e compartilhada. E **configuracao de cada
// veiculo**: dois veiculos da mesma frota podem ter posturas diferentes para a
// mesma macro, porque o que esta em jogo e o equipamento daquele veiculo --
// quais atuadores ele tem ligados, quais sensores existem, que carga leva.
//
// Quem ativa um perfil e uma macro LOGISTICA -- o comportamento operacional que
// o motorista informa (inicio de viagem, chegada no cliente). Macros de jornada
// e informativas nao alteram a inteligencia embarcada. E as macros nao podem ser
// registradas em qualquer ordem: formam um GRAFO de transicoes permitidas
// (`ConfiguracaoVeiculo.transicoes`), que o equipamento usa para recusar uma
// transicao invalida independentemente do que o app apresentou (`DEV-68`).
//
// Tres regras do dominio que o modelo faz questao de nao deixar contornar:
//   DEV-65  postura ABSOLUTA: assumir um perfil define o estado de TODOS os
//           atuadores. Nao existe "como estava" -- resíduo do modo anterior e
//           exatamente o que a postura absoluta elimina.
//   DEV-74  o modo de acionamento (temporario x permanente) e POR ATUADOR: sirene
//           por 30 s e bloqueio permanente convivem no mesmo perfil.
//   DEV-66  latch: depois de reagir a uma violacao, nao reage de novo ate o
//           perfil trocar.

export type Atuador = "bloqueio_motor" | "trava_bau" | "sirene" | "luz_alerta" | "trava_quinta_roda";
export type PosturaAtuador = "ligado" | "desligado";
export type ModoAcionamento = "temporario" | "permanente";
export type Sensor = "botao_panico" | "porta_bau" | "porta_cabine" | "ignicao" | "velocidade" | "engate" | "painel" | "movimento";

export const atuadorLabel: Record<Atuador, string> = { bloqueio_motor: "Bloqueio de motor", trava_bau: "Trava do baú", sirene: "Sirene", luz_alerta: "Luz de alerta", trava_quinta_roda: "Trava da quinta roda" };
export const posturaLabel: Record<PosturaAtuador, string> = { ligado: "Ligado", desligado: "Desligado" };
export const acionamentoLabel: Record<ModoAcionamento, string> = { temporario: "Temporário", permanente: "Permanente" };
export const sensorLabel: Record<Sensor, string> = { botao_panico: "Botão de pânico", porta_bau: "Porta do baú", porta_cabine: "Porta da cabine", ignicao: "Ignição", velocidade: "Velocidade", engate: "Engate / desengate", painel: "Painel do equipamento", movimento: "Movimento" };

/** Estados que cada sensor pode assumir. O perfil escolhe qual conta como violação (`DEV-73`). */
export const estadosSensor: Record<Sensor, string[]> = {
  botao_panico: ["Pressionado", "Normal"],
  porta_bau: ["Aberta", "Fechada"],
  porta_cabine: ["Aberta", "Fechada"],
  ignicao: ["Ligada", "Desligada"],
  velocidade: ["Acima do limite do trecho", "Acima de 80 km/h", "Qualquer deslocamento"],
  engate: ["Desengatado", "Engatado"],
  painel: ["Aberto", "Fechado"],
  movimento: ["Em movimento", "Parado"],
};

export const estadosSensorKeys = Object.keys(estadosSensor) as Sensor[];

export type SensorArmado = { sensor: Sensor; armado: boolean; estadoViolacao: string };

export type RegraCatalogoId = "panico" | "desvio_rota" | "parada_nao_programada" | "perda_sinal" | "tempo_parado";
export type RegraPerfil = { regra: RegraCatalogoId; habilitada: boolean };

export const catalogoRegras: { id: RegraCatalogoId; nome: string; descricao: string }[] = [
  { id: "panico", nome: "Botão de pânico", descricao: "Considera violação quando o botão de emergência é acionado." },
  { id: "desvio_rota", nome: "Desvio de rota", descricao: "Detecta saída do corredor previsto no rotograma ativo." },
  { id: "parada_nao_programada", nome: "Parada não programada", descricao: "Detecta imobilização fora dos pontos e janelas permitidos." },
  { id: "perda_sinal", nome: "Perda de sinal", descricao: "Viola quando o equipamento fica sem comunicação além da tolerância." },
  { id: "tempo_parado", nome: "Tempo parado excedido", descricao: "Detecta permanência acima do tempo permitido para a operação." },
];

export type CanalEnvio = "tcp" | "satelite" | "lora";
export const canalEnvioLabel: Record<CanalEnvio, string> = {
  tcp: "Primário · TCP",
  satelite: "Secundário · Satélite",
  lora: "Terciário · LoRa",
};

export type ConfiguracaoAcoes = {
  avisoCabine: boolean;
  audio: "nenhum" | "alerta" | "instrucao_parada" | "contate_central";
  gerarEvento: boolean;
  canais: CanalEnvio[];
  camera: { habilitada: boolean; modo: "snapshot" | "gravacao"; duracaoSeg: number };
};

export const acoesPadrao = (): ConfiguracaoAcoes => ({
  avisoCabine: true,
  audio: "alerta",
  gerarEvento: true,
  canais: ["tcp"],
  camera: { habilitada: false, modo: "snapshot", duracaoSeg: 30 },
});

/**
 * Configuração de um atuador dentro de um perfil.
 *
 * `postura` é o estado em que o atuador entra ao assumir o perfil (`DEV-65`).
 * `acionamento` é o que acontece quando uma violação o aciona (`DEV-74`):
 * temporário encerra sozinho ao fim de `duracaoSeg`; permanente só encerra
 * quando a violação cessa **e** a central comanda (`DEV-75`).
 */
export type ConfigAtuador = {
  postura: PosturaAtuador;
  /** Se uma violação deste perfil deve acionar o atuador. */
  acionarEmViolacao?: boolean;
  acionamento: ModoAcionamento;
  duracaoSeg: number;
  /** Se a central pode habilitar um botão na cabine para o motorista acionar (`DEV-45`). */
  liberavelPeloMotorista: boolean;
  /** Quantas vezes o motorista pode acionar antes de exigir novo embarque (`DEV-76`). `null` = sem limite. */
  limiteAcionamentos: number | null;
  /** Exige credencial do motorista antes de liberar (`DEV-77`). */
  exigeAutenticacao: boolean;
};

/** O conteúdo de um modo — sem identidade de catálogo: ele vive dentro de uma macro de um veículo. */
export type PerfilOperacional = {
  nome: string;
  atuadores: Record<Atuador, ConfigAtuador>;
  sensores: SensorArmado[];
  /** Regras adicionais escolhidas no catálogo da plataforma. */
  regras?: RegraPerfil[];
  /** Entregas e reações executadas quando uma violação ocorre. */
  acoes?: ConfiguracaoAcoes;
  /** Após reagir a uma violação, não reage de novo até o perfil trocar (`DEV-66`). */
  latchViolacao: boolean;
  contingencia: {
    /** Canais de baixa banda que podem assumir quando o TCP estiver indisponível. */
    canais?: Array<"satelite" | "lora">;
    /** Quais sensores geram alerta quando o equipamento está em canal de contingência (`DEV-78`). */
    sensores: Sensor[];
    frequenciaReporteSeg: number;
    /** Mantém o reporte periódico enquanto a violação continuar ativa. */
    repetirEnquantoViolacao?: boolean;
    /** O ajuste acima expira e volta ao padrão (`DEV-79`). */
    expiraEmHoras: number;
  };
};

const cfg = (postura: PosturaAtuador, extra: Partial<ConfigAtuador> = {}): ConfigAtuador => ({ postura, acionamento: "temporario", duracaoSeg: 30, liberavelPeloMotorista: false, limiteAcionamentos: null, exigeAutenticacao: false, ...extra });

// ------------------------------------------------------- Macros e o grafo delas

/** `inicio` abre a sequência, `fim` a encerra; `operacao` são os estados do meio. */
export type TipoMacro = "inicio" | "operacao" | "fim";
export type CategoriaMacro = "jornada" | "logistica" | "informativa";

export const categoriaMacroLabel: Record<CategoriaMacro, string> = {
  jornada: "Jornada",
  logistica: "Logística",
  informativa: "Informativa",
};

/**
 * Macro — o comportamento que o motorista informa no app. Macros logísticas
 * podem ativar um perfil operacional; as de jornada e informativas apenas
 * registram estado/ocorrência. Todas carregam sua posição no grafo.
 */
/**
 * As duas funções que uma macro pode carregar.
 *
 * No sistema de referência (New Enterprise, manual p. 684-686) o motorista
 * **nunca inicia uma jornada ou uma viagem diretamente**: ele registra uma
 * macro, e a macro carrega até duas funções independentes que avançam duas
 * máquinas de estado distintas. `FIM DE VIAGEM` é ao mesmo tempo *Finalizar
 * Viagem* (logística) e *Início de Interjornada* (jornada); `REINICIO DE
 * VIAGEM` só avança a jornada, e deliberadamente **não** reabre a viagem.
 *
 * Só existe "Início de": o fim de um estado é a macro seguinte. A duração sai
 * da diferença entre marcos consecutivos (manual p. 172, "Tempo Entre Macros"),
 * que é a mesma distinção **marco × condição** do `DEV-62.1`.
 */
export type FuncaoJornada = "inicio_jornada" | "inicio_direcao" | "inicio_espera" | "inicio_refeicao" | "inicio_descanso" | "inicio_interjornada" | "inicio_descanso_semanal";
export type FuncaoLogistica = "iniciar_viagem" | "finalizar_viagem" | "iniciar_operacao" | "concluir_operacao" | "cancelar_operacao";

export const funcaoJornadaLabel: Record<FuncaoJornada, string> = {
  inicio_jornada: "Início de jornada",
  inicio_direcao: "Início de direção",
  inicio_espera: "Início de espera",
  inicio_refeicao: "Início de refeição",
  inicio_descanso: "Início de descanso",
  inicio_interjornada: "Início de interjornada",
  inicio_descanso_semanal: "Início de descanso semanal",
};

export const funcaoLogisticaLabel: Record<FuncaoLogistica, string> = {
  iniciar_viagem: "Iniciar viagem",
  finalizar_viagem: "Finalizar viagem",
  iniciar_operacao: "Iniciar operação",
  concluir_operacao: "Concluir operação",
  cancelar_operacao: "Cancelar operação",
};

export const funcoesJornada = Object.keys(funcaoJornadaLabel) as FuncaoJornada[];
export const funcoesLogistica = Object.keys(funcaoLogisticaLabel) as FuncaoLogistica[];

export type MacroVeiculo = {
  id: string;
  nome: string;
  descricao: string;
  tipo: TipoMacro;
  /** Define as capacidades da macro. Opcional para manter compatibilidade com rascunhos antigos. */
  categoria?: CategoriaMacro;
  /** Avança a máquina de jornada (controle de ponto). `null` = não mexe nela. */
  funcaoJornada: FuncaoJornada | null;
  /** Avança a máquina de logística (viagem/operação). `null` = não mexe nela. */
  funcaoLogistica: FuncaoLogistica | null;
  perfil: PerfilOperacional;
  x: number;
  y: number;
};

/** Classifica rascunhos antigos sem apagar o que o usuário já configurou no navegador. */
export function categoriaDaMacro(macro: MacroVeiculo): CategoriaMacro {
  const nome = macro.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  // Macros do catálogo podem ter sido salvas antes da categoria existir. O nome
  // prevalece até sobre a categoria antiga para aplicar a classificação revisada.
  if (["inicio de jornada", "fim de jornada", "descanso semanal"].includes(nome)) return "jornada";
  if (["inicio de viagem", "reinicio de viagem", "fim de viagem", "chegada no cliente", "saida do cliente", "cancelar operacao", "parada para refeicao", "pausa para refeicao", "parada para abastecimento", "abastecimento", "parada eventual", "parada para pernoite", "pernoite", "fiscalizacao", "parada para manutencao", "manutencao", "emergencia"].includes(nome)) return "logistica";
  if (macro.categoria) return macro.categoria;
  if (["transito", "congestion", "lentidao", "interdicao", "acidente na via"].some((termo) => nome.includes(termo))) return "informativa";
  if (["abastecimento", "pernoite", "cliente", "fiscalizacao", "manutencao", "emergencia", "parada eventual"].some((termo) => nome.includes(termo))) return "logistica";
  if (macro.funcaoLogistica) return "logistica";
  if (macro.funcaoJornada) return "jornada";
  return "logistica";
}

/** Uma aresta do grafo: estando em `de`, o motorista pode registrar `para`. */
export type Transicao = { de: string; para: string };

/**
 * Toda a política embarcada de **um veículo**: o perfil padrão, as macros que o
 * motorista pode registrar, e o grafo que diz de onde para onde ele pode ir.
 */
/** Uma alteração de rascunho, para o operador saber o que vai embarcar. */
export type Mudanca = { id: string; descricao: string; em: string; por: string };

export type EstadoItemEmbarcado = "aceito" | "rejeitado";
export type ItemResultado = { id: string; nome: string; estado: EstadoItemEmbarcado; motivo?: string };

/** O que o equipamento respondeu, item a item (`DEV-38`). */
export type ResultadoEmbarque = { em: string; por: string; estado: "sucesso" | "parcial" | "falha"; itens: ItemResultado[] };

export type ConfiguracaoVeiculo = {
  veiculo: string;
  frota: string;
  /** Vigente quando nenhuma macro está em curso, e restaurado pela limpeza (`DEV-80`). */
  perfilPadrao: PerfilOperacional;
  macros: MacroVeiculo[];
  transicoes: Transicao[];
  /** O que existe fisicamente neste veículo — ver `MapaIO`. */
  mapaIO: MapaIO;
  /** Onde o veículo está agora na sequência — `null` significa perfil padrão. */
  macroVigente: string | null;
  desde: string;
  /** Versão que está no equipamento. `null` = nunca embarcada. */
  versaoEmbarcada: number | null;
  /** Alterações feitas desde o último embarque. Vazio = sincronizado. */
  mudancas: Mudanca[];
  sincronizadoEm: string | null;
  ultimoEmbarque: ResultadoEmbarque | null;
};

export type StatusSync = "sincronizado" | "rascunho" | "falha" | "nunca_embarcado";

export const statusSyncLabel: Record<StatusSync, string> = {
  sincronizado: "Sincronizado",
  rascunho: "Rascunho",
  falha: "Falha no embarque",
  nunca_embarcado: "Nunca embarcado",
};

export const statusSyncTone: Record<StatusSync, "teal" | "amber" | "red" | "neutral"> = {
  sincronizado: "teal", rascunho: "amber", falha: "red", nunca_embarcado: "neutral",
};

/**
 * Estado de sincronização — derivado, nunca guardado.
 *
 * Guardar um timestamp de "alterado" e outro de "embarcado" e comparar os dois
 * é frágil: os dois relógios avançam em momentos diferentes e o veículo fica
 * eternamente "alterado" depois de um embarque bem-sucedido. A lista de
 * mudanças pendentes é a fonte única: embarcar **esvazia** a lista.
 */
export function statusConfig(c: ConfiguracaoVeiculo): StatusSync {
  if (c.ultimoEmbarque?.estado === "falha") return "falha";
  if (c.mudancas.length) return "rascunho";
  if (c.versaoEmbarcada === null) return "nunca_embarcado";
  return "sincronizado";
}

// ------------------------------------------------------- Mapa de I/O do veículo
//
// Onde o nome de domínio ganha um canal físico. O perfil operacional fala em
// `trava_bau`; é aqui que `trava_bau` vira a saída digital 2 daquele MDVR.
// Sem este mapa, todo veículo teria de ter os mesmos periféricos — e não tem:
// um cavalo mecânico tem quinta roda, uma van urbana não.
//
// Há um segundo motivo: hoje metade da configuração de um sensor vive na tela
// web do próprio MDVR (pino, polaridade, debounce) e metade no nosso JSON (o
// nome de domínio). As duas podem divergir **em silêncio**. Aqui elas aparecem
// lado a lado.

export type FonteSinal = "nativo" | "expansor485" | "can";
export const fonteSinalLabel: Record<FonteSinal, string> = { nativo: "Nativo", expansor485: "Expansor RS485", can: "CAN" };

export type Polaridade = "alta" | "baixa";
export const polaridadeLabel: Record<Polaridade, string> = { alta: "Aciona em nível alto", baixa: "Aciona em nível baixo" };

export type EntradaIO = {
  id: string;
  canal: string;
  fonte: FonteSinal;
  nome: string;
  /** Nome de domínio pelo qual o perfil operacional referencia esta entrada. */
  funcao: Sensor | null;
  polaridade: Polaridade;
  /** Tolerância por periférico (`DEV-32`) — config do adaptador, não regra. */
  debounceSeg: number;
  habilitado: boolean;
};

export type SaidaIO = {
  id: string;
  canal: string;
  fonte: Exclude<FonteSinal, "can">;
  nome: string;
  funcao: Atuador | null;
  /** Padrão do canal. O perfil pode especializar por atuador (`DEV-74`). */
  modoPadrao: ModoAcionamento;
  duracaoPadraoSeg: number;
  habilitado: boolean;
};

export type FuncaoSerial = "livre" | "expansor_io" | "satelite" | "lorawan" | "teclado" | "r_watch";
export const funcaoSerialLabel: Record<FuncaoSerial, string> = {
  livre: "Livre", expansor_io: "Expansor de I/O", satelite: "Terminal satelital",
  lorawan: "Gateway LoRaWAN", teclado: "Teclado / leitor", r_watch: "R-Watch",
};

export type BaudRate = 4800 | 9600 | 19200 | 38400 | 57600 | 115200;
export const baudRates: BaudRate[] = [4800, 9600, 19200, 38400, 57600, 115200];

export type PortaSerial = {
  id: string;
  porta: "RS232-1" | "RS232-2" | "RS485";
  funcao: FuncaoSerial;
  observacao: string;
  habilitado?: boolean;
  baudRate: BaudRate;
  /** Endereço é obrigatório apenas para periféricos do barramento RS485. */
  endereco?: number;
};

export type ProtocoloCAN = "j1939" | "obd2_diagnostico" | "j1939_tacografo";
export const protocoloCANLabel: Record<ProtocoloCAN, string> = {
  j1939: "J1939",
  obd2_diagnostico: "OBD-II · diagnóstico",
  j1939_tacografo: "J1939 · tacógrafo",
};
export type RedeCAN = { id: string; rede: "CAN1"; protocolo: ProtocoloCAN; habilitado: boolean };

export type MapaIO = { entradas: EntradaIO[]; saidas: SaidaIO[]; seriais: PortaSerial[]; redesCAN: RedeCAN[] };

/**
 * Limites físicos por modelo.
 *
 * Os números do M1N 2.0 foram **lidos do próprio equipamento**; os do X1NAI
 * vieram de documentação e nunca foram conferidos — por isso `verificado`
 * existe, e a interface precisa dizer isso. Configurar um canal que o modelo
 * não tem falha no embarque, longe de quem conserta.
 */
export type CapacidadeModelo = { rotulo: string; entradas: number; saidas: number; seriais: number; verificado: boolean };

export const capacidadePorLinha: Record<Equipamento["linha"], CapacidadeModelo> = {
  "MDVR-8 Pro": { rotulo: "MDVR com expansor opcional", entradas: 8, saidas: 2, seriais: 3, verificado: true },
  "MDVR-8": { rotulo: "MDVR com expansor opcional", entradas: 8, saidas: 2, seriais: 3, verificado: true },
  "MDVR-4": { rotulo: "MDVR com expansor opcional", entradas: 8, saidas: 2, seriais: 3, verificado: true },
};

export const capacidadeDe = (veiculo: string): CapacidadeModelo => capacidadePorLinha[(equipamentos.find((e) => e.veiculo === veiculo) ?? equipamentos[0]).linha];

const sensoresPadraoIO: { nome: string; funcao: Sensor }[] = [
  { nome: "Botão de pânico", funcao: "botao_panico" },
  { nome: "Porta do baú", funcao: "porta_bau" },
  { nome: "Porta da cabine", funcao: "porta_cabine" },
  { nome: "Ignição", funcao: "ignicao" },
  { nome: "Painel do equipamento", funcao: "painel" },
  { nome: "Velocidade", funcao: "velocidade" },
  { nome: "Movimento", funcao: "movimento" },
  { nome: "Engate", funcao: "engate" },
];

const atuadoresPadraoIO: { nome: string; funcao: Atuador }[] = [
  { nome: "Bloqueio de motor", funcao: "bloqueio_motor" },
  { nome: "Trava do baú", funcao: "trava_bau" },
  { nome: "Sirene", funcao: "sirene" },
  { nome: "Luz de alerta", funcao: "luz_alerta" },
  { nome: "Trava da quinta roda", funcao: "trava_quinta_roda" },
];

const entradaPorFuncao = (mapa: MapaIO, funcao: Sensor | undefined) => funcao ? mapa.entradas.find((e) => e.funcao === funcao) : undefined;
const saidaPorFuncao = (mapa: MapaIO, funcao: Atuador | undefined) => funcao ? mapa.saidas.find((s) => s.funcao === funcao) : undefined;

/** Migra mapas antigos e mantém 8/2 portas nativas e 4/4 portas do expansor. */
export function normalizarMapaIO(veiculo: string, mapa: MapaIO): MapaIO {
  const cap = capacidadeDe(veiculo);
  const entradasNativas = Array.from({ length: cap.entradas }, (_, i): EntradaIO => {
    const padrao = sensoresPadraoIO[i];
    const anterior = mapa.entradas.find((e) => e.id === `IN-${i + 1}` || e.canal === `IN${i + 1}` || e.canal === `IO${i + 1}`) ?? entradaPorFuncao(mapa, padrao?.funcao);
    const funcao = anterior?.funcao ?? padrao?.funcao ?? null;
    return { id: `IN-${i + 1}`, canal: `IN${i + 1}`, fonte: "nativo", nome: funcao ? sensorLabel[funcao] : "", funcao, polaridade: anterior?.polaridade ?? "baixa", debounceSeg: anterior?.debounceSeg ?? 0, habilitado: anterior?.habilitado ?? Boolean(padrao) };
  });
  const entradasExpansor = Array.from({ length: 4 }, (_, i): EntradaIO => {
    const anterior = mapa.entradas.find((e) => e.id === `EXP-IN-${i + 1}` || e.canal === `EXP-IN${i + 1}` || (e.fonte === "expansor485" && mapa.entradas.filter((x) => x.fonte === "expansor485").indexOf(e) === i));
    const funcao = anterior?.funcao && !entradasNativas.some((e) => e.funcao === anterior.funcao) ? anterior.funcao : null;
    return { id: `EXP-IN-${i + 1}`, canal: `EXP-IN${i + 1}`, fonte: "expansor485", nome: funcao ? sensorLabel[funcao] : "", funcao, polaridade: anterior?.polaridade ?? "baixa", debounceSeg: anterior?.debounceSeg ?? 0, habilitado: funcao ? (anterior?.habilitado ?? true) : false };
  });
  const saidasNativas = Array.from({ length: cap.saidas }, (_, i): SaidaIO => {
    const padrao = atuadoresPadraoIO[i];
    const anterior = mapa.saidas.find((s) => s.id === `OUT-${i + 1}` || s.canal === `OUT${i + 1}`) ?? saidaPorFuncao(mapa, padrao?.funcao);
    const funcao = anterior?.funcao ?? padrao?.funcao ?? null;
    return { id: `OUT-${i + 1}`, canal: `OUT${i + 1}`, fonte: "nativo", nome: funcao ? atuadorLabel[funcao] : "", funcao, modoPadrao: anterior?.modoPadrao ?? "permanente", duracaoPadraoSeg: anterior?.duracaoPadraoSeg ?? 0, habilitado: anterior?.habilitado ?? Boolean(padrao) };
  });
  const funcoesExpansor = atuadoresPadraoIO.slice(cap.saidas, cap.saidas + 4);
  const saidasExpansor = Array.from({ length: 4 }, (_, i): SaidaIO => {
    const padrao = funcoesExpansor[i];
    const anterior = mapa.saidas.find((s) => s.id === `EXP-OUT-${i + 1}` || s.canal === `EXP-OUT${i + 1}`) ?? saidaPorFuncao(mapa, padrao?.funcao);
    const funcao = anterior?.funcao ?? padrao?.funcao ?? null;
    return { id: `EXP-OUT-${i + 1}`, canal: `EXP-OUT${i + 1}`, fonte: "expansor485", nome: funcao ? atuadorLabel[funcao] : "", funcao, modoPadrao: anterior?.modoPadrao ?? "permanente", duracaoPadraoSeg: anterior?.duracaoPadraoSeg ?? 0, habilitado: anterior?.habilitado ?? Boolean(padrao) };
  });
  const satelite = mapa.seriais.find((s) => s.funcao === "satelite") ?? mapa.seriais.find((s) => s.porta === "RS232-1");
  const lorawan = mapa.seriais.find((s) => s.funcao === "lorawan") ?? mapa.seriais.find((s) => s.porta === "RS232-2");
  const expansor = mapa.seriais.find((s) => s.funcao === "expansor_io");
  const rWatch = mapa.seriais.find((s) => s.funcao === "r_watch");
  const seriais: PortaSerial[] = [
    { id: "RS232-1-SAT", porta: "RS232-1", funcao: "satelite", observacao: "Terminal satelital", baudRate: satelite?.baudRate ?? 9600, habilitado: satelite?.habilitado ?? true },
    { id: "RS232-2-LORA", porta: "RS232-2", funcao: "lorawan", observacao: "Terminal LoRaWAN", baudRate: lorawan?.baudRate ?? 9600, habilitado: lorawan?.habilitado ?? true },
    { id: "RS485-EXP", porta: "RS485", funcao: "expansor_io", observacao: "Expansor de I/O", baudRate: expansor?.baudRate ?? rWatch?.baudRate ?? 115200, endereco: expansor?.endereco ?? 1, habilitado: expansor?.habilitado ?? Boolean(mapa.seriais.find((s) => s.funcao === "expansor_io")) },
    { id: "RS485-RWATCH", porta: "RS485", funcao: "r_watch", observacao: "R-Watch", baudRate: rWatch?.baudRate ?? expansor?.baudRate ?? 115200, endereco: rWatch?.endereco ?? 2, habilitado: rWatch?.habilitado ?? false },
  ];
  const redesCAN: RedeCAN[] = mapa.redesCAN?.length ? mapa.redesCAN : [{ id: "CAN1", rede: "CAN1", protocolo: "j1939", habilitado: true }];
  return { entradas: [...entradasNativas, ...entradasExpansor], saidas: [...saidasNativas, ...saidasExpansor], seriais, redesCAN };
}

export const expansorHabilitado = (mapa: MapaIO) => mapa.seriais.some((s) => s.funcao === "expansor_io" && s.habilitado !== false);

/** O RS485 é endereçável: o conflito ocorre apenas quando dois periféricos usam o mesmo endereço. */
export function seriaisEmConflito(mapa: MapaIO): PortaSerial[] {
  const ocupadas = new Map<string, PortaSerial[]>();
  for (const s of mapa.seriais.filter((x) => x.habilitado !== false && x.funcao !== "livre")) {
    const chave = s.porta === "RS485" ? `${s.porta}:${s.endereco ?? "sem-endereco"}` : s.porta;
    ocupadas.set(chave, [...(ocupadas.get(chave) ?? []), s]);
  }
  return Array.from(ocupadas.values()).filter((lista) => lista.length > 1).flat();
}

/** Funções de domínio que este veículo realmente tem — é o que o perfil pode referenciar. */
export function funcoesDisponiveis(mapa: MapaIO): { sensores: Sensor[]; atuadores: Atuador[] } {
  const expansorAtivo = expansorHabilitado(mapa);
  return {
    sensores: mapa.entradas.filter((e) => e.habilitado && e.funcao && (e.fonte !== "expansor485" || expansorAtivo)).map((e) => e.funcao as Sensor),
    atuadores: mapa.saidas.filter((s) => s.habilitado && s.funcao && (s.fonte !== "expansor485" || expansorAtivo)).map((s) => s.funcao as Atuador),
  };
}

function mapaIOBase(linha: Equipamento["linha"]): MapaIO {
  const completo = linha !== "MDVR-4";
  const entradas: EntradaIO[] = [
    { id: "DI-1", canal: "DI-1", fonte: "nativo", nome: "Porta do baú", funcao: "porta_bau", polaridade: "baixa", debounceSeg: 2, habilitado: true },
    { id: "DI-2", canal: "DI-2", fonte: "nativo", nome: "Porta da cabine", funcao: "porta_cabine", polaridade: "baixa", debounceSeg: 2, habilitado: true },
    { id: "DI-3", canal: "DI-3", fonte: "nativo", nome: "Ignição", funcao: "ignicao", polaridade: "alta", debounceSeg: 1, habilitado: true },
    { id: "DI-4", canal: "DI-4", fonte: "nativo", nome: "Painel do equipamento", funcao: "painel", polaridade: "baixa", debounceSeg: 0, habilitado: true },
    { id: "CAN-VEL", canal: "velocidade", fonte: "can", nome: "Velocidade (CAN)", funcao: "velocidade", polaridade: "alta", debounceSeg: 0, habilitado: true },
    { id: "CAN-MOV", canal: "movimento", fonte: "can", nome: "Movimento (CAN)", funcao: "movimento", polaridade: "alta", debounceSeg: 3, habilitado: true },
  ];
  if (completo) entradas.push({ id: "EXP-1", canal: "EXP-1", fonte: "expansor485", nome: "Sensor de engate", funcao: "engate", polaridade: "baixa", debounceSeg: 2, habilitado: true });

  const saidas: SaidaIO[] = [
    { id: "DO-1", canal: "DO-1", fonte: "nativo", nome: "Bloqueio de motor", funcao: "bloqueio_motor", modoPadrao: "permanente", duracaoPadraoSeg: 0, habilitado: true },
    { id: "DO-2", canal: "DO-2", fonte: "nativo", nome: "Trava do baú", funcao: "trava_bau", modoPadrao: "permanente", duracaoPadraoSeg: 0, habilitado: true },
  ];
  if (completo) saidas.push(
    { id: "DO-3", canal: "DO-3", fonte: "nativo", nome: "Sirene", funcao: "sirene", modoPadrao: "temporario", duracaoPadraoSeg: 30, habilitado: true },
    { id: "DO-4", canal: "DO-4", fonte: "nativo", nome: "Luz de alerta", funcao: "luz_alerta", modoPadrao: "temporario", duracaoPadraoSeg: 60, habilitado: true },
    { id: "EXP-DO-1", canal: "EXP-DO-1", fonte: "expansor485", nome: "Trava da quinta roda", funcao: "trava_quinta_roda", modoPadrao: "permanente", duracaoPadraoSeg: 0, habilitado: true },
  );

  const seriais: PortaSerial[] = completo
    ? [
        { id: "RS485-1", porta: "RS485", funcao: "expansor_io", observacao: "Expansor que serve EXP-1 e EXP-DO-1.", baudRate: 115200, endereco: 1 },
        { id: "RS232-1", porta: "RS232-1", funcao: "satelite", observacao: "Terminal satelital — canal de contingência.", baudRate: 9600 },
      ]
    : [{ id: "RS485-1", porta: "RS485", funcao: "teclado", observacao: "Teclado do motorista.", baudRate: 115200, endereco: 3 }];

  return { entradas, saidas, seriais, redesCAN: [{ id: "CAN1", rede: "CAN1", protocolo: "j1939", habilitado: true }] };
}

// ------------------------------------------------------------------ Validação

export type Validacao = { nivel: "erro" | "aviso"; codigo: string; mensagem: string; macroId?: string };

/** Erro impede o embarque; aviso só alerta. */
export function validarConfiguracao(c: ConfiguracaoVeiculo): Validacao[] {
  const achados: Validacao[] = [];

  if (!c.macros.some((m) => m.tipo === "inicio")) {
    achados.push({ nivel: "erro", codigo: "sem-inicio", mensagem: "Nenhuma macro abre a sequência — o motorista não teria por onde começar." });
  }
  for (const m of macrosInalcancaveis(c)) {
    achados.push({ nivel: "erro", codigo: "inalcancavel", macroId: m.id, mensagem: `“${m.nome}” não tem caminho a partir de um início: o motorista nunca conseguiria registrá-la.` });
  }
  for (const m of c.macros) {
    if (m.tipo !== "fim" && !c.transicoes.some((t) => t.de === m.id)) {
      achados.push({ nivel: "erro", codigo: "sem-saida", macroId: m.id, mensagem: `“${m.nome}” não é fim de sequência e não tem nenhuma saída: o motorista ficaria preso nela.` });
    }
    if (categoriaDaMacro(m) === "logistica") {
      if (!m.perfil.sensores.some((s) => s.armado)) {
        achados.push({ nivel: "aviso", codigo: "sem-sensor", macroId: m.id, mensagem: `O perfil de “${m.nome}” não tem nenhum sensor armado — nada será detectado enquanto ela estiver em curso.` });
      }
      for (const [chave, a] of Object.entries(m.perfil.atuadores) as [Atuador, ConfigAtuador][]) {
        if (a.liberavelPeloMotorista && a.limiteAcionamentos === null && !a.exigeAutenticacao) {
          achados.push({ nivel: "aviso", codigo: "sem-limite", macroId: m.id, mensagem: `Em “${m.nome}”, ${atuadorLabel[chave].toLowerCase()} é liberável pelo motorista sem limite nem credencial.` });
        }
      }
    }
  }
  // Coerência entre a política e o que o veículo realmente tem (mapa de I/O)
  const mapaIO = normalizarMapaIO(c.veiculo, c.mapaIO);
  const disponiveis = funcoesDisponiveis(mapaIO);
  const cap = capacidadeDe(c.veiculo);
  const perfis: { rotulo: string; macroId?: string; perfil: PerfilOperacional }[] = [
    { rotulo: "perfil padrão", perfil: c.perfilPadrao },
    ...c.macros.map((m) => ({ rotulo: `“${m.nome}”`, macroId: m.id, perfil: m.perfil })),
  ];
  for (const { rotulo, macroId, perfil } of perfis) {
    for (const s of perfil.sensores.filter((x) => x.armado)) {
      if (!disponiveis.sensores.includes(s.sensor)) {
        achados.push({ nivel: "erro", codigo: "sensor-sem-canal", macroId, mensagem: `${rotulo} arma “${sensorLabel[s.sensor]}”, que não existe no mapa de I/O deste veículo.` });
      }
    }
    for (const [chave, a] of Object.entries(perfil.atuadores) as [Atuador, ConfigAtuador][]) {
      const usado = a.postura === "ligado" || a.liberavelPeloMotorista;
      if (usado && !disponiveis.atuadores.includes(chave)) {
        achados.push({ nivel: "erro", codigo: "atuador-sem-canal", macroId, mensagem: `${rotulo} usa ${atuadorLabel[chave].toLowerCase()}, que não existe no mapa de I/O deste veículo.` });
      }
    }
  }
  const nativasEntrada = c.mapaIO.entradas.filter((e) => e.fonte === "nativo").length;
  const nativasSaida = c.mapaIO.saidas.filter((x) => x.fonte === "nativo").length;
  if (nativasEntrada > cap.entradas) achados.push({ nivel: "erro", codigo: "entradas-acima-capacidade", mensagem: `${nativasEntrada} entradas nativas mapeadas, e o modelo aceita ${cap.entradas}.` });
  if (nativasSaida > cap.saidas) achados.push({ nivel: "erro", codigo: "saidas-acima-capacidade", mensagem: `${nativasSaida} saídas nativas mapeadas, e o modelo aceita ${cap.saidas}.` });
  for (const s of seriaisEmConflito(c.mapaIO)) {
    achados.push({ nivel: "erro", codigo: "serial-em-conflito", mensagem: s.porta === "RS485" ? `O endereço ${s.endereco ?? "não informado"} da RS485 está repetido.` : `A porta ${s.porta} está alocada para mais de uma função.` });
  }
  if (!cap.verificado) {
    achados.push({ nivel: "aviso", codigo: "capacidade-nao-verificada", mensagem: `Os limites deste modelo (${cap.entradas} entradas, ${cap.saidas} saídas) vieram de documentação e nunca foram conferidos no equipamento.` });
  }

  if (!c.perfilPadrao.sensores.some((s) => s.armado)) {
    achados.push({ nivel: "aviso", codigo: "padrao-sem-sensor", mensagem: "O perfil padrão não tem sensor armado — entre um embarque e outro o veículo fica sem detecção." });
  }
  return achados;
}

/** O que vai no embarque: o perfil padrão e uma linha por macro. */
export function itensDoEmbarque(c: ConfiguracaoVeiculo): { id: string; nome: string }[] {
  return [
    { id: "PADRAO", nome: `Perfil padrão · ${c.perfilPadrao.nome}` },
    ...c.macros.map((m) => {
      const categoria = categoriaDaMacro(m);
      return { id: m.id, nome: categoria === "logistica" ? `${m.nome} · perfil ${m.perfil.nome}` : categoria === "jornada" ? `${m.nome} · controle de jornada` : `${m.nome} · registro informativo` };
    }),
    { id: "GRAFO", nome: `Sequência de macros · ${c.transicoes.length} transições` },
  ];
}

const perfilPadraoBase = (): PerfilOperacional => ({
  nome: "Padrão",
  atuadores: {
    bloqueio_motor: cfg("desligado", { acionamento: "permanente" }),
    trava_bau: cfg("ligado", { acionamento: "permanente" }),
    sirene: cfg("desligado", { duracaoSeg: 30 }),
    luz_alerta: cfg("desligado", { duracaoSeg: 60 }),
    trava_quinta_roda: cfg("ligado", { acionamento: "permanente" }),
  },
  sensores: [
    { sensor: "painel", armado: true, estadoViolacao: "Aberto" },
    { sensor: "engate", armado: true, estadoViolacao: "Desengatado" },
  ],
  latchViolacao: true,
  contingencia: { sensores: ["painel"], frequenciaReporteSeg: 900, expiraEmHoras: 12 },
});

/** Macros padrão de uma operação de transporte — o ponto de partida de cada veículo. */
function macrosBase(): MacroVeiculo[] {
  return [
    {
      // A categoria é inferida aqui para que rascunhos v5 já salvos continuem compatíveis.
      id: "MC-INICIO", nome: "Início de viagem", tipo: "inicio", x: 60, y: 40,
      funcaoLogistica: "iniciar_viagem", funcaoJornada: "inicio_direcao",
      descricao: "Motorista assume o veículo e inicia a viagem.",
      perfil: {
        nome: "Em viagem",
        atuadores: {
          bloqueio_motor: cfg("desligado", { acionamento: "permanente" }),
          trava_bau: cfg("ligado", { acionamento: "permanente" }),
          sirene: cfg("desligado", { duracaoSeg: 30 }),
          luz_alerta: cfg("desligado", { duracaoSeg: 60 }),
          trava_quinta_roda: cfg("ligado", { acionamento: "permanente", liberavelPeloMotorista: true, limiteAcionamentos: 3, exigeAutenticacao: true }),
        },
        sensores: [
          { sensor: "porta_bau", armado: true, estadoViolacao: "Aberta" },
          { sensor: "porta_cabine", armado: false, estadoViolacao: "Aberta" },
          { sensor: "velocidade", armado: true, estadoViolacao: "Acima do limite do trecho" },
          { sensor: "engate", armado: true, estadoViolacao: "Desengatado" },
          { sensor: "painel", armado: true, estadoViolacao: "Aberto" },
        ],
        latchViolacao: true,
        contingencia: { sensores: ["painel", "engate"], frequenciaReporteSeg: 300, expiraEmHoras: 6 },
      },
    },
    {
      id: "MC-CLIENTE-IN", nome: "Chegada no cliente", tipo: "operacao", categoria: "logistica", x: 300, y: 40,
      funcaoLogistica: "iniciar_operacao", funcaoJornada: "inicio_espera",
      descricao: "Veículo entrou no cliente e começa a descarga.",
      perfil: {
        nome: "No cliente",
        atuadores: {
          bloqueio_motor: cfg("ligado", { acionamento: "permanente" }),
          trava_bau: cfg("desligado", { duracaoSeg: 120, liberavelPeloMotorista: true, limiteAcionamentos: 10 }),
          sirene: cfg("desligado", { duracaoSeg: 30 }),
          luz_alerta: cfg("ligado", { duracaoSeg: 60 }),
          trava_quinta_roda: cfg("ligado", { acionamento: "permanente", liberavelPeloMotorista: true, limiteAcionamentos: 2, exigeAutenticacao: true }),
        },
        sensores: [
          { sensor: "porta_bau", armado: false, estadoViolacao: "Aberta" },
          { sensor: "ignicao", armado: true, estadoViolacao: "Ligada" },
          { sensor: "engate", armado: true, estadoViolacao: "Desengatado" },
          { sensor: "movimento", armado: true, estadoViolacao: "Em movimento" },
          { sensor: "painel", armado: true, estadoViolacao: "Aberto" },
        ],
        latchViolacao: true,
        contingencia: { sensores: ["movimento", "painel"], frequenciaReporteSeg: 120, expiraEmHoras: 4 },
      },
    },
    {
      id: "MC-CLIENTE-OUT", nome: "Saída do cliente", tipo: "operacao", categoria: "logistica", x: 540, y: 40,
      funcaoLogistica: "concluir_operacao", funcaoJornada: "inicio_direcao",
      descricao: "Entrega concluída; veículo retoma a viagem.",
      perfil: {
        nome: "Em viagem",
        atuadores: {
          bloqueio_motor: cfg("desligado", { acionamento: "permanente" }),
          trava_bau: cfg("ligado", { acionamento: "permanente" }),
          sirene: cfg("desligado", { duracaoSeg: 30 }),
          luz_alerta: cfg("desligado", { duracaoSeg: 60 }),
          trava_quinta_roda: cfg("ligado", { acionamento: "permanente", liberavelPeloMotorista: true, limiteAcionamentos: 3, exigeAutenticacao: true }),
        },
        sensores: [
          { sensor: "porta_bau", armado: true, estadoViolacao: "Aberta" },
          { sensor: "velocidade", armado: true, estadoViolacao: "Acima do limite do trecho" },
          { sensor: "engate", armado: true, estadoViolacao: "Desengatado" },
          { sensor: "painel", armado: true, estadoViolacao: "Aberto" },
        ],
        latchViolacao: true,
        contingencia: { sensores: ["painel", "engate"], frequenciaReporteSeg: 300, expiraEmHoras: 6 },
      },
    },
    {
      id: "MC-ABASTECIMENTO", nome: "Parada para abastecimento", tipo: "operacao", categoria: "logistica", x: 180, y: 200,
      funcaoLogistica: null, funcaoJornada: "inicio_descanso",
      descricao: "Parada em posto homologado para abastecer.",
      perfil: {
        nome: "Abastecimento",
        atuadores: {
          bloqueio_motor: cfg("desligado", { acionamento: "permanente" }),
          trava_bau: cfg("ligado", { acionamento: "permanente" }),
          sirene: cfg("desligado", { duracaoSeg: 30 }),
          luz_alerta: cfg("ligado", { duracaoSeg: 120 }),
          trava_quinta_roda: cfg("ligado", { acionamento: "permanente" }),
        },
        sensores: [
          { sensor: "porta_bau", armado: true, estadoViolacao: "Aberta" },
          { sensor: "movimento", armado: true, estadoViolacao: "Em movimento" },
          { sensor: "painel", armado: true, estadoViolacao: "Aberto" },
        ],
        latchViolacao: true,
        contingencia: { sensores: ["porta_bau", "movimento"], frequenciaReporteSeg: 300, expiraEmHoras: 4 },
      },
    },
    {
      id: "MC-REFEICAO", nome: "Pausa para refeição", tipo: "operacao", categoria: "logistica", x: 420, y: 200,
      funcaoLogistica: null, funcaoJornada: "inicio_refeicao",
      descricao: "Pausa de refeição prevista na jornada.",
      perfil: {
        nome: "Pausa",
        atuadores: {
          bloqueio_motor: cfg("ligado", { acionamento: "permanente" }),
          trava_bau: cfg("ligado", { acionamento: "permanente" }),
          sirene: cfg("desligado", { duracaoSeg: 45 }),
          luz_alerta: cfg("desligado", { duracaoSeg: 60 }),
          trava_quinta_roda: cfg("ligado", { acionamento: "permanente" }),
        },
        sensores: [
          { sensor: "porta_bau", armado: true, estadoViolacao: "Aberta" },
          { sensor: "porta_cabine", armado: true, estadoViolacao: "Aberta" },
          { sensor: "movimento", armado: true, estadoViolacao: "Em movimento" },
          { sensor: "painel", armado: true, estadoViolacao: "Aberto" },
        ],
        latchViolacao: true,
        contingencia: { sensores: ["porta_bau", "movimento", "painel"], frequenciaReporteSeg: 120, expiraEmHoras: 3 },
      },
    },
    {
      id: "MC-PERNOITE", nome: "Pernoite", tipo: "operacao", categoria: "logistica", x: 660, y: 200,
      funcaoLogistica: null, funcaoJornada: "inicio_interjornada",
      descricao: "Veículo estacionado para pernoite autorizado.",
      perfil: {
        nome: "Pernoite",
        atuadores: {
          bloqueio_motor: cfg("ligado", { acionamento: "permanente" }),
          trava_bau: cfg("ligado", { acionamento: "permanente" }),
          sirene: cfg("desligado", { duracaoSeg: 45 }),
          luz_alerta: cfg("desligado", { duracaoSeg: 120 }),
          trava_quinta_roda: cfg("ligado", { acionamento: "permanente" }),
        },
        sensores: [
          { sensor: "porta_bau", armado: true, estadoViolacao: "Aberta" },
          { sensor: "porta_cabine", armado: true, estadoViolacao: "Aberta" },
          { sensor: "ignicao", armado: true, estadoViolacao: "Ligada" },
          { sensor: "movimento", armado: true, estadoViolacao: "Em movimento" },
          { sensor: "painel", armado: true, estadoViolacao: "Aberto" },
        ],
        latchViolacao: true,
        contingencia: { sensores: ["porta_bau", "porta_cabine", "movimento", "painel"], frequenciaReporteSeg: 60, expiraEmHoras: 2 },
      },
    },
    {
      id: "MC-FIM", nome: "Fim de viagem", tipo: "fim", categoria: "logistica", x: 780, y: 40,
      funcaoLogistica: "finalizar_viagem", funcaoJornada: "inicio_interjornada",
      descricao: "Viagem encerrada; veículo entregue no pátio.",
      perfil: {
        nome: "Pátio",
        atuadores: {
          bloqueio_motor: cfg("ligado", { acionamento: "permanente" }),
          trava_bau: cfg("ligado", { acionamento: "permanente" }),
          sirene: cfg("desligado", { duracaoSeg: 30 }),
          luz_alerta: cfg("desligado", { duracaoSeg: 60 }),
          trava_quinta_roda: cfg("ligado", { acionamento: "permanente" }),
        },
        sensores: [
          { sensor: "porta_bau", armado: true, estadoViolacao: "Aberta" },
          { sensor: "movimento", armado: true, estadoViolacao: "Em movimento" },
          { sensor: "painel", armado: true, estadoViolacao: "Aberto" },
        ],
        latchViolacao: true,
        contingencia: { sensores: ["movimento", "painel"], frequenciaReporteSeg: 900, expiraEmHoras: 12 },
      },
    },
  ];
}

/** O grafo padrão: de onde para onde o motorista pode ir. */
function transicoesBase(): Transicao[] {
  const meio = ["MC-CLIENTE-IN", "MC-ABASTECIMENTO", "MC-REFEICAO", "MC-PERNOITE"];
  const arestas: Transicao[] = [];
  for (const destino of [...meio, "MC-FIM"]) arestas.push({ de: "MC-INICIO", para: destino });
  arestas.push({ de: "MC-CLIENTE-IN", para: "MC-CLIENTE-OUT" });
  for (const destino of ["MC-CLIENTE-IN", "MC-ABASTECIMENTO", "MC-REFEICAO", "MC-PERNOITE", "MC-FIM"]) arestas.push({ de: "MC-CLIENTE-OUT", para: destino });
  for (const origem of ["MC-ABASTECIMENTO", "MC-REFEICAO", "MC-PERNOITE"]) {
    for (const destino of [...meio.filter((m) => m !== origem), "MC-FIM"]) arestas.push({ de: origem, para: destino });
  }
  return arestas;
}

/**
 * Catálogo de macros — o **vocabulário** é da plataforma (toda a frota fala as
 * mesmas macros), mas o **perfil** por trás de cada uma é de cada veículo.
 * É por este id que um ponto de controle referencia a macro que ele dispara.
 */
export const catalogoMacros: { id: string; nome: string; descricao: string; tipo: TipoMacro; categoria: CategoriaMacro }[] =
  macrosBase().map((macro) => ({ id: macro.id, nome: macro.nome, descricao: macro.descricao, tipo: macro.tipo, categoria: categoriaDaMacro(macro) }));

export const nomeMacro = (id: string) => catalogoMacros.find((m) => m.id === id)?.nome ?? id;

/**
 * Poda a política ao que o veículo realmente tem.
 *
 * O molde de macros é o mesmo para toda a frota, mas o mapa de I/O não: um
 * modelo reduzido não tem quinta roda nem sirene. Sem esta poda, o dado inicial
 * já nasceria com erro de validação — e um erro semeado ensina o operador a
 * ignorar o alerta.
 */
function ajustarPolitica(config: ConfiguracaoVeiculo): ConfiguracaoVeiculo {
  const mapaIO = normalizarMapaIO(config.veiculo, config.mapaIO);
  const { sensores, atuadores } = funcoesDisponiveis(mapaIO);
  const podar = (perfil: PerfilOperacional): PerfilOperacional => ({
    ...perfil,
    sensores: perfil.sensores.filter((s) => sensores.includes(s.sensor)),
    contingencia: { ...perfil.contingencia, sensores: perfil.contingencia.sensores.filter((x) => sensores.includes(x)) },
    atuadores: Object.fromEntries((Object.keys(perfil.atuadores) as Atuador[]).map((a) => [
      a,
      atuadores.includes(a) ? perfil.atuadores[a] : { ...perfil.atuadores[a], postura: "desligado" as PosturaAtuador, liberavelPeloMotorista: false, limiteAcionamentos: null, exigeAutenticacao: false },
    ])) as Record<Atuador, ConfigAtuador>,
  });
  return { ...config, mapaIO, perfilPadrao: podar(config.perfilPadrao), macros: config.macros.map((m) => ({ ...m, perfil: podar(m.perfil) })) };
}

const configuracoesBase: ConfiguracaoVeiculo[] = [
  { veiculo: "VTR-2048", frota: "Sul · Distribuição", perfilPadrao: perfilPadraoBase(), macros: macrosBase(), transicoes: transicoesBase(), mapaIO: mapaIOBase(equipamentos.find((e) => e.veiculo === "VTR-2048")!.linha), macroVigente: "MC-INICIO", desde: "2026-09-08T11:42:00", versaoEmbarcada: 7, mudancas: [], sincronizadoEm: "2026-09-02T08:10:00", ultimoEmbarque: null },
  { veiculo: "VTR-1783", frota: "Centro · Longa distância", perfilPadrao: perfilPadraoBase(), macros: macrosBase(), transicoes: transicoesBase(), mapaIO: mapaIOBase(equipamentos.find((e) => e.veiculo === "VTR-1783")!.linha), macroVigente: "MC-CLIENTE-OUT", desde: "2026-09-08T09:15:00", versaoEmbarcada: 7, mudancas: [], sincronizadoEm: "2026-09-02T08:12:00", ultimoEmbarque: null },
  { veiculo: "VTR-0931", frota: "Sudeste · Última milha", perfilPadrao: perfilPadraoBase(), macros: macrosBase(), transicoes: transicoesBase(), mapaIO: mapaIOBase(equipamentos.find((e) => e.veiculo === "VTR-0931")!.linha), macroVigente: "MC-CLIENTE-IN", desde: "2026-09-08T13:58:00", versaoEmbarcada: 4,
    mudancas: [
      { id: "MD-01", descricao: "Trava do baú passou a exigir credencial em “Chegada no cliente”", em: "2026-09-08T10:12:00", por: "Larissa Martins" },
      { id: "MD-02", descricao: "Sensor de movimento armado no perfil padrão", em: "2026-09-08T10:20:00", por: "Larissa Martins" },
    ],
    sincronizadoEm: "2026-08-23T07:40:00", ultimoEmbarque: null },
  { veiculo: "VTR-3110", frota: "Sudeste · Operação", perfilPadrao: perfilPadraoBase(), macros: macrosBase(), transicoes: transicoesBase(), mapaIO: mapaIOBase(equipamentos.find((e) => e.veiculo === "VTR-3110")!.linha), macroVigente: "MC-ABASTECIMENTO", desde: "2026-09-08T12:20:00", versaoEmbarcada: 2, mudancas: [], sincronizadoEm: "2026-09-05T14:00:00",
    ultimoEmbarque: { em: "2026-09-05T14:00:00", por: "Rafael Duarte", estado: "parcial", itens: [
      { id: "PADRAO", nome: "Perfil padrão · Padrão", estado: "aceito" },
      { id: "MC-PERNOITE", nome: "Pernoite · perfil Pernoite", estado: "rejeitado", motivo: "Equipamento MDVR-8 não tem a saída “trava da quinta roda” mapeada." },
      { id: "GRAFO", nome: "Sequência de macros · 23 transições", estado: "aceito" },
    ] } },
  { veiculo: "VTR-2240", frota: "Sul · Distribuição", perfilPadrao: perfilPadraoBase(), macros: macrosBase(), transicoes: transicoesBase(), mapaIO: mapaIOBase(equipamentos.find((e) => e.veiculo === "VTR-2240")!.linha), macroVigente: "MC-PERNOITE", desde: "2026-09-07T21:05:00", versaoEmbarcada: null, mudancas: [], sincronizadoEm: null, ultimoEmbarque: null },
];

export const configuracoesIniciais: ConfiguracaoVeiculo[] = configuracoesBase.map(ajustarPolitica);

/** Macros que o motorista pode registrar estando na macro `atual` (`DEV-68`). */
export function proximasMacros(config: ConfiguracaoVeiculo, atual: string | null): MacroVeiculo[] {
  if (!atual) return config.macros.filter((m) => m.tipo === "inicio");
  const permitidos = config.transicoes.filter((t) => t.de === atual).map((t) => t.para);
  return config.macros.filter((m) => permitidos.includes(m.id));
}

/** Macros que o grafo nunca alcança a partir de um início — configuração que não roda. */
export function macrosInalcancaveis(config: ConfiguracaoVeiculo): MacroVeiculo[] {
  const alcancados = new Set<string>();
  const fila = config.macros.filter((m) => m.tipo === "inicio").map((m) => m.id);
  fila.forEach((id) => alcancados.add(id));
  while (fila.length) {
    const atual = fila.shift() as string;
    for (const t of config.transicoes.filter((x) => x.de === atual)) {
      if (!alcancados.has(t.para)) { alcancados.add(t.para); fila.push(t.para); }
    }
  }
  return config.macros.filter((m) => !alcancados.has(m.id));
}

/** O perfil de inteligência em vigor; jornada e informação não o substituem. */
export function perfilVigente(config: ConfiguracaoVeiculo): { perfil: PerfilOperacional; macro: MacroVeiculo | null } {
  const macro = config.macros.find((m) => m.id === config.macroVigente) ?? null;
  if (!macro || categoriaDaMacro(macro) === "logistica") return { perfil: macro ? macro.perfil : config.perfilPadrao, macro };
  const nomeAtivo = equipamentos.find((e) => e.veiculo === config.veiculo)?.perfilAtivo;
  const perfilMantido = config.macros.find((m) => categoriaDaMacro(m) === "logistica" && m.perfil.nome === nomeAtivo)?.perfil ?? config.perfilPadrao;
  return { perfil: perfilMantido, macro };
}

// ------------------------------------------------------------------ Geometria
//
// A plataforma **não calcula geometria**. Quem detecta entrada e saída é a
// geocerca nativa do MDVR, e ela aceita exatamente quatro formas. Por isso o
// tipo abaixo é uma união fechada: o que não couber nela não pode ser embarcado,
// e portanto o editor de mapa não pode produzi-lo — nada de mão livre,
// multipolígono ou polígono com furo.
//
// O que a plataforma calcula é só apoio visual na tela (sobreposição, extensão,
// área). Isso nunca vira critério de disparo: a decisão continua no equipamento.

export type LatLng = { lat: number; lng: number };

export type TipoGeometria = "circulo" | "poligono" | "retangulo" | "linha";

export type GeometriaCirculo = { tipo: "circulo"; centro: LatLng; raioM: number };
export type GeometriaPoligono = { tipo: "poligono"; vertices: LatLng[] };
export type GeometriaRetangulo = { tipo: "retangulo"; sudoeste: LatLng; nordeste: LatLng };
/** Linha com paradas. O corredor é a faixa de tolerância lateral, em metros. */
export type GeometriaLinha = { tipo: "linha"; vertices: LatLng[]; corredorM: number };

export type Geometria = GeometriaCirculo | GeometriaPoligono | GeometriaRetangulo | GeometriaLinha;

/** Geometrias que uma **área** aceita — ponto de controle e cerca. Linha não é área. */
export type GeometriaArea = GeometriaCirculo | GeometriaPoligono | GeometriaRetangulo;

export const tipoGeometriaLabel: Record<TipoGeometria, string> = {
  circulo: "Círculo", poligono: "Polígono", retangulo: "Retângulo", linha: "Linha com paradas",
};

/**
 * Limite de vértices por polígono no equipamento.
 *
 * ⚠️ **Não confirmado** com o fabricante. Está isolado aqui de propósito: quando
 * o número real aparecer, troque nesta constante e nada mais precisa mudar. A
 * interface avisa ao ultrapassar em vez de recusar o traço no meio do desenho.
 */
export const MAX_VERTICES_POLIGONO = 24;

// -------------------------------------------------------- Pontos de Controle

export type CategoriaPonto = "cliente" | "pernoite" | "base" | "posto" | "area_risco" | "carga";
export const categoriaPontoLabel: Record<CategoriaPonto, string> = { cliente: "Cliente", pernoite: "Pernoite", base: "Base própria", posto: "Posto homologado", area_risco: "Área de risco", carga: "Carregamento" };

export type PontoDeControle = {
  id: string;
  nome: string;
  categoria: CategoriaPonto;
  /** Entrar no ponto registra esta macro — e é ela que traz o perfil do veículo (`DEV-52`). */
  politica: { macro: string; permanenciaMaxMin: number; permanenciaMinMin: number; janela: string };
  fixo: boolean;
  precedencia: number | null;
  ativo: boolean;
  /** Ponto de controle é **área**, nunca alfinete: círculo com raio ou polígono. */
  geometria: GeometriaArea;
  local: string;
  sobrepoe: string[];
  versao: number;
};

export const pontosIniciais: PontoDeControle[] = [
  { id: "PC-001", nome: "CD Itaguaí · doca 4", categoria: "cliente", politica: { macro: "MC-CLIENTE-IN", permanenciaMaxMin: 90, permanenciaMinMin: 15, janela: "06:00–20:00" }, fixo: false, precedencia: 1, ativo: true, geometria: { tipo: "circulo", centro: { lat: -22.9270, lng: -43.8180 }, raioM: 250 }, local: "Itaguaí · RJ", sobrepoe: ["PC-006"], versao: 3 },
  { id: "PC-002", nome: "Pátio pernoite Seropédica", categoria: "pernoite", politica: { macro: "MC-PERNOITE", permanenciaMaxMin: 720, permanenciaMinMin: 0, janela: "20:00–06:00" }, fixo: true, precedencia: null, ativo: true, geometria: { tipo: "circulo", centro: { lat: -22.7438, lng: -43.7071 }, raioM: 180 }, local: "Seropédica · RJ", sobrepoe: [], versao: 5 },
  { id: "PC-003", nome: "Base Campinas · carregamento", categoria: "carga", politica: { macro: "MC-ABASTECIMENTO", permanenciaMaxMin: 120, permanenciaMinMin: 30, janela: "24h" }, fixo: true, precedencia: null, ativo: true, geometria: { tipo: "poligono", vertices: [{ lat: -22.9012, lng: -47.0668 }, { lat: -22.9008, lng: -47.0552 }, { lat: -22.9098, lng: -47.0544 }, { lat: -22.9112, lng: -47.0652 }] }, local: "Campinas · SP", sobrepoe: [], versao: 2 },
  { id: "PC-004", nome: "Cliente Contagem · portaria B", categoria: "cliente", politica: { macro: "MC-CLIENTE-IN", permanenciaMaxMin: 60, permanenciaMinMin: 10, janela: "07:00–18:00" }, fixo: false, precedencia: null, ativo: true, geometria: { tipo: "circulo", centro: { lat: -19.9320, lng: -44.0539 }, raioM: 200 }, local: "Contagem · MG", sobrepoe: [], versao: 1 },
  { id: "PC-005", nome: "Posto Graal · km 402", categoria: "posto", politica: { macro: "MC-REFEICAO", permanenciaMaxMin: 45, permanenciaMinMin: 0, janela: "24h" }, fixo: false, precedencia: null, ativo: false, geometria: { tipo: "circulo", centro: { lat: -22.5372, lng: -44.7756 }, raioM: 150 }, local: "BR-116 · km 402", sobrepoe: [], versao: 1 },
  { id: "PC-006", nome: "Zona portuária Itaguaí", categoria: "area_risco", politica: { macro: "MC-INICIO", permanenciaMaxMin: 20, permanenciaMinMin: 0, janela: "24h" }, fixo: true, precedencia: null, ativo: true, geometria: { tipo: "circulo", centro: { lat: -22.9350, lng: -43.8280 }, raioM: 1200 }, local: "Itaguaí · RJ", sobrepoe: ["PC-001"], versao: 4 },
];

// ------------------------------------------------------------------- Cercas

export type Cerca = {
  id: string;
  nome: string;
  descricao?: string;
  categoria: "restrita" | "operacional" | "velocidade" | "horario";
  politica: { permanenciaMaxMin: number | null; limiteKmh: number | null; janela: string };
  ativa: boolean;
  local: string;
  versao: number;
  /** A geometria é cadastrada uma vez e depois vinculada aos veículos. */
  geometria: Geometria;
  veiculos?: string[];
  vigenciaInicio?: string;
  vigenciaFim?: string | null;
};

export const cercasIniciais: Cerca[] = [
  { id: "CE-01", nome: "Anel Rodoviário · faixa 2", categoria: "velocidade", politica: { permanenciaMaxMin: null, limiteKmh: 80, janela: "24h" }, ativa: true, local: "Belo Horizonte · MG", versao: 2, veiculos: ["VTR-1783"], vigenciaInicio: "2026-09-01", vigenciaFim: null, geometria: { tipo: "linha", corredorM: 300, vertices: [{ lat: -19.9538, lng: -43.9948 }, { lat: -19.9320, lng: -44.0102 }, { lat: -19.9006, lng: -43.9884 }, { lat: -19.8712, lng: -43.9430 }, { lat: -19.8564, lng: -43.9042 }] } },
  { id: "CE-02", nome: "Área restrita · Pátio Itaguaí", categoria: "restrita", politica: { permanenciaMaxMin: 0, limiteKmh: null, janela: "24h" }, ativa: true, local: "Itaguaí · RJ", versao: 3, veiculos: ["VTR-2048", "VTR-0931"], vigenciaInicio: "2026-09-02", vigenciaFim: null, geometria: { tipo: "poligono", vertices: [{ lat: -22.9288, lng: -43.8352 }, { lat: -22.9236, lng: -43.8218 }, { lat: -22.9324, lng: -43.8126 }, { lat: -22.9402, lng: -43.8232 }, { lat: -22.9376, lng: -43.8344 }] } },
  { id: "CE-03", nome: "Base Campinas · portaria noturna", categoria: "horario", politica: { permanenciaMaxMin: null, limiteKmh: null, janela: "22:00–05:00" }, ativa: false, local: "Campinas · SP", versao: 1, veiculos: [], vigenciaInicio: "2026-08-20", vigenciaFim: "2026-09-05", geometria: { tipo: "circulo", centro: { lat: -22.9060, lng: -47.0606 }, raioM: 420 } },
  { id: "CE-04", nome: "Perímetro urbano Rio · centro", categoria: "operacional", politica: { permanenciaMaxMin: 40, limiteKmh: 50, janela: "06:00–22:00" }, ativa: true, local: "Rio de Janeiro · RJ", versao: 6, veiculos: ["VTR-2048", "VTR-3110"], vigenciaInicio: "2026-09-01", vigenciaFim: null, geometria: { tipo: "retangulo", sudoeste: { lat: -22.9184, lng: -43.1908 }, nordeste: { lat: -22.8942, lng: -43.1620 } } },
];

// -------------------------------------------------------------------- Rotas
//
// Rota é trajeto **mais corredor**: o desvio se mede como distância ao corredor,
// não a uma linha. Por isso a largura é um campo em metros dentro da geometria,
// e a faixa é derivada dela — nunca desenhada à mão.

/** A extensão não é guardada: sai do traçado, para não haver dois números discordando. */
export type Rota = { id: string; nome: string; origem: string; destino: string; geometria: GeometriaLinha; ativa: boolean; veiculosVinculados: number; desvioAtualM: number | null; versao: number };

export const rotasIniciais: Rota[] = [
  { id: "RT-01", nome: "Campinas → Itaguaí (BR-116)", origem: "Base Campinas", destino: "CD Itaguaí", ativa: true, veiculosVinculados: 14, desvioAtualM: 40, versao: 4, geometria: { tipo: "linha", corredorM: 300, vertices: [{ lat: -22.9056, lng: -47.0608 }, { lat: -22.9670, lng: -46.5390 }, { lat: -23.1790, lng: -45.8870 }, { lat: -22.9660, lng: -45.1180 }, { lat: -22.5372, lng: -44.7756 }, { lat: -22.7900, lng: -44.0480 }, { lat: -22.8722, lng: -43.7756 }, { lat: -22.9270, lng: -43.8180 }] } },
  { id: "RT-02", nome: "Contagem → Rio (BR-040)", origem: "Cliente Contagem", destino: "Perímetro Rio", ativa: true, veiculosVinculados: 9, desvioAtualM: 1240, versao: 2, geometria: { tipo: "linha", corredorM: 500, vertices: [{ lat: -19.9320, lng: -44.0539 }, { lat: -20.3880, lng: -43.9060 }, { lat: -21.1350, lng: -43.7780 }, { lat: -21.7660, lng: -43.3490 }, { lat: -22.3160, lng: -43.7020 }, { lat: -22.6520, lng: -43.4130 }, { lat: -22.9068, lng: -43.1729 }] } },
  { id: "RT-03", nome: "Alça portuária Itaguaí", origem: "Zona portuária", destino: "CD Itaguaí", ativa: false, veiculosVinculados: 0, desvioAtualM: null, versao: 1, geometria: { tipo: "linha", corredorM: 150, vertices: [{ lat: -22.9350, lng: -43.8280 }, { lat: -22.9322, lng: -43.8236 }, { lat: -22.9270, lng: -43.8180 }] } },
];

// ---------------------------------------------------------------- Rotograma

export type NivelDesvio = "no_prazo" | "adiantada" | "muito_adiantada" | "atrasada" | "muito_atrasada";
export const nivelDesvioLabel: Record<NivelDesvio, string> = { no_prazo: "No prazo", adiantada: "Adiantada", muito_adiantada: "Muito adiantada", atrasada: "Atrasada", muito_atrasada: "Muito atrasada" };
export const nivelDesvioTone: Record<NivelDesvio, "teal" | "blue" | "amber" | "red" | "neutral"> = { no_prazo: "teal", adiantada: "blue", muito_adiantada: "amber", atrasada: "amber", muito_atrasada: "red" };

export type Trecho = { id: string; de: string; para: string; duracaoMin: number; distanciaKm: number; limites: { velocidadeKmh: number; paradaMaxMin: number; direcaoContinuaMaxMin: number } };

export type Rotograma = { id: string; nome: string; veiculo: string; rota: string; trechos: Trecho[]; trechoAtual: number; desvioMin: number; nivel: NivelDesvio; versao: number };

export const rotogramasIniciais: Rotograma[] = [
  {
    id: "RG-2048", nome: "Jornada VTR-2048 · 08 set", veiculo: "VTR-2048", rota: "RT-01", trechoAtual: 1, desvioMin: 32, nivel: "atrasada", versao: 2,
    trechos: [
      { id: "T1", de: "PC-003", para: "PC-005", duracaoMin: 240, distanciaKm: 260, limites: { velocidadeKmh: 90, paradaMaxMin: 15, direcaoContinuaMaxMin: 240 } },
      { id: "T2", de: "PC-005", para: "PC-006", duracaoMin: 210, distanciaKm: 240, limites: { velocidadeKmh: 80, paradaMaxMin: 10, direcaoContinuaMaxMin: 210 } },
      { id: "T3", de: "PC-006", para: "PC-001", duracaoMin: 25, distanciaKm: 12, limites: { velocidadeKmh: 40, paradaMaxMin: 0, direcaoContinuaMaxMin: 60 } },
    ],
  },
  {
    id: "RG-1783", nome: "Jornada VTR-1783 · 08 set", veiculo: "VTR-1783", rota: "RT-02", trechoAtual: 0, desvioMin: -48, nivel: "muito_adiantada", versao: 1,
    trechos: [
      { id: "T1", de: "PC-004", para: "PC-005", duracaoMin: 300, distanciaKm: 310, limites: { velocidadeKmh: 80, paradaMaxMin: 20, direcaoContinuaMaxMin: 240 } },
      { id: "T2", de: "PC-005", para: "PC-002", duracaoMin: 120, distanciaKm: 128, limites: { velocidadeKmh: 80, paradaMaxMin: 10, direcaoContinuaMaxMin: 120 } },
    ],
  },
  {
    id: "RG-3110", nome: "Jornada VTR-3110 · 08 set", veiculo: "VTR-3110", rota: "RT-01", trechoAtual: 0, desvioMin: 4, nivel: "no_prazo", versao: 1,
    trechos: [
      { id: "T1", de: "PC-003", para: "PC-001", duracaoMin: 480, distanciaKm: 512, limites: { velocidadeKmh: 90, paradaMaxMin: 15, direcaoContinuaMaxMin: 240 } },
    ],
  },
  {
    id: "RG-0931", nome: "Jornada VTR-0931 · 08 set", veiculo: "VTR-0931", rota: "RT-03", trechoAtual: 0, desvioMin: 95, nivel: "muito_atrasada", versao: 3,
    trechos: [
      { id: "T1", de: "PC-006", para: "PC-001", duracaoMin: 25, distanciaKm: 11, limites: { velocidadeKmh: 40, paradaMaxMin: 0, direcaoContinuaMaxMin: 60 } },
    ],
  },
];

// ----------------------------------------------------------------- Embarques

export type TipoItemEmbarque = "jornada" | "ponto" | "cerca" | "perfil" | "credencial";
export const tipoItemLabel: Record<TipoItemEmbarque, string> = { jornada: "Jornada (rotograma)", ponto: "Ponto de controle", cerca: "Cerca", perfil: "Política operacional do veículo", credencial: "Credencial" };

export type ItemEmbarque = { id: string; tipo: TipoItemEmbarque; referencia: string; nome: string; versao: number; aceite: "pendente" | "aceito" | "rejeitado"; motivo?: string; respondidoEm?: string };
export type Embarque = { id: string; veiculo: string; equipamento: string; emitidoEm: string; emitidoPor: string; itens: ItemEmbarque[] };

export type CatalogoItem = { id: string; tipo: TipoItemEmbarque; nome: string; versao: number; publicadoEm: string; dependeDe: string[] };

export const catalogo: CatalogoItem[] = [
  ...configuracoesIniciais.map((c) => ({ id: `CFG-${c.veiculo}`, tipo: "perfil" as const, nome: `Política operacional · ${c.veiculo}`, versao: c.versaoEmbarcada ?? 1, publicadoEm: c.sincronizadoEm ?? c.desde, dependeDe: [] })),
  ...pontosIniciais.map((p) => ({ id: p.id, tipo: "ponto" as const, nome: p.nome, versao: p.versao, publicadoEm: "2026-09-02T10:00:00", dependeDe: [] })),
  ...cercasIniciais.map((c) => ({ id: c.id, tipo: "cerca" as const, nome: c.nome, versao: c.versao, publicadoEm: "2026-08-28T14:00:00", dependeDe: [] })),
  ...rotogramasIniciais.map((r) => ({ id: r.id, tipo: "jornada" as const, nome: r.nome, versao: r.versao, publicadoEm: "2026-09-08T05:30:00", dependeDe: Array.from(new Set(r.trechos.flatMap((t) => [t.de, t.para]))) })),
];

export const embarquesIniciais: Embarque[] = [
  {
    id: "EMB-3041", veiculo: "VTR-2048", equipamento: "MDVR-0882", emitidoEm: "2026-09-08T05:42:00", emitidoPor: "Larissa Martins",
    itens: [
      { id: "i1", tipo: "jornada", referencia: "RG-2048", nome: "Jornada VTR-2048 · 08 set", versao: 2, aceite: "aceito", respondidoEm: "2026-09-08T05:43:10" },
      { id: "i2", tipo: "ponto", referencia: "PC-003", nome: "Base Campinas · carregamento", versao: 2, aceite: "aceito", respondidoEm: "2026-09-08T05:43:11" },
      { id: "i3", tipo: "ponto", referencia: "PC-005", nome: "Posto Graal · km 402", versao: 1, aceite: "rejeitado", motivo: "Ponto inativo no catálogo", respondidoEm: "2026-09-08T05:43:12" },
      { id: "i4", tipo: "ponto", referencia: "PC-001", nome: "CD Itaguaí · doca 4", versao: 3, aceite: "aceito", respondidoEm: "2026-09-08T05:43:12" },
      { id: "i5", tipo: "perfil", referencia: "PF-VIAGEM", nome: "Viagem normal", versao: 7, aceite: "aceito", respondidoEm: "2026-09-08T05:43:14" },
      { id: "i6", tipo: "credencial", referencia: "CR-2048-01", nome: "Carlos Mendes · VTR-2048", versao: 1, aceite: "pendente" },
    ],
  },
  {
    id: "EMB-3040", veiculo: "VTR-0931", equipamento: "MDVR-1028", emitidoEm: "2026-09-08T05:10:00", emitidoPor: "Larissa Martins",
    itens: [
      { id: "i1", tipo: "jornada", referencia: "RG-0931", nome: "Jornada VTR-0931 · 08 set", versao: 3, aceite: "aceito", respondidoEm: "2026-09-08T05:11:02" },
      { id: "i2", tipo: "perfil", referencia: "PF-CLIENTE", nome: "No cliente", versao: 4, aceite: "rejeitado", motivo: "Firmware 3.9.4 não suporta atuador 'luz_alerta' em modo como_estava", respondidoEm: "2026-09-08T05:11:05" },
      { id: "i3", tipo: "cerca", referencia: "CE-02", nome: "Área restrita · Pátio Itaguaí", versao: 3, aceite: "aceito", respondidoEm: "2026-09-08T05:11:05" },
    ],
  },
  {
    id: "EMB-3038", veiculo: "VTR-2240", equipamento: "MDVR-0655", emitidoEm: "2026-09-07T22:15:00", emitidoPor: "Bruno Sato",
    itens: [
      { id: "i1", tipo: "perfil", referencia: "PF-PERNOITE", nome: "Pernoite", versao: 3, aceite: "pendente" },
      { id: "i2", tipo: "ponto", referencia: "PC-002", nome: "Pátio pernoite Seropédica", versao: 5, aceite: "pendente" },
    ],
  },
];

// ---------------------------------------------------------------- Credenciais

export type Credencial = { id: string; motorista: string; veiculo: string; equipamento: string; criadaEm: string; senhaOperacaoDefinida: boolean; senhaCoacaoDefinida: boolean; status: "ativa" | "pendente_embarque" | "revogada" };

export const credenciaisIniciais: Credencial[] = [
  { id: "CR-2048-01", motorista: "Carlos Mendes", veiculo: "VTR-2048", equipamento: "MDVR-0882", criadaEm: "2026-09-08T05:40:00", senhaOperacaoDefinida: true, senhaCoacaoDefinida: true, status: "pendente_embarque" },
  { id: "CR-1783-01", motorista: "Ana Paula Costa", veiculo: "VTR-1783", equipamento: "MDVR-0714", criadaEm: "2026-08-12T08:00:00", senhaOperacaoDefinida: true, senhaCoacaoDefinida: true, status: "ativa" },
  { id: "CR-0931-01", motorista: "Rafael Nunes", veiculo: "VTR-0931", equipamento: "MDVR-1028", criadaEm: "2026-08-15T08:00:00", senhaOperacaoDefinida: true, senhaCoacaoDefinida: false, status: "ativa" },
  { id: "CR-3110-01", motorista: "Marcos Silva", veiculo: "VTR-3110", equipamento: "MDVR-0921", criadaEm: "2026-07-30T08:00:00", senhaOperacaoDefinida: true, senhaCoacaoDefinida: true, status: "ativa" },
  { id: "CR-3110-02", motorista: "Carlos Mendes", veiculo: "VTR-3110", equipamento: "MDVR-0921", criadaEm: "2026-08-02T08:00:00", senhaOperacaoDefinida: true, senhaCoacaoDefinida: true, status: "ativa" },
  { id: "CR-2240-01", motorista: "Juliana Reis", veiculo: "VTR-2240", equipamento: "MDVR-0655", criadaEm: "2026-06-10T08:00:00", senhaOperacaoDefinida: true, senhaCoacaoDefinida: true, status: "revogada" },
];

// -------------------------------------------------------------------- Eventos

export type Comentario = { id: string; texto: string; autor: string; criadoEm: string; editadoPor?: string; editadoEm?: string };

export type Evento = {
  id: string;
  tipo: "sensor" | "ponto" | "rotograma" | "rota" | "sinal" | "coacao" | "comando" | "macro" | "comportamento";
  titulo: string;
  veiculo: string;
  motorista: string;
  natureza: "condicao" | "marco";
  occurredAt: string;
  receivedAt: string;
  encerradoEm: string | null;
  severidade: "alta" | "media" | "baixa";
  perfilAtivo: string;
  pontoDeControle: string | null;
  ultimaPosicao?: string;
  canalContingencia?: Equipamento["canal"];
  detalhe: string;
  comentarios: Comentario[];
};

export const eventosIniciais: Evento[] = [
  { id: "EV-9105", tipo: "coacao", titulo: "Senha de coação utilizada", veiculo: "VTR-1783", motorista: "Ana Paula Costa", natureza: "marco", occurredAt: "2026-09-08T14:31:20", receivedAt: "2026-09-08T14:31:22", encerradoEm: null, severidade: "alta", perfilAtivo: "Em viagem", pontoDeControle: null, detalhe: "Credencial de coação validada no equipamento. Operação autorizada normalmente no veículo; alerta silencioso roteado somente para a gestão de risco.", comentarios: [] },
  { id: "EV-9104", tipo: "comportamento", titulo: "Fadiga detectada", veiculo: "VTR-2048", motorista: "Carlos Mendes", natureza: "condicao", occurredAt: "2026-09-08T14:32:00", receivedAt: "2026-09-08T14:32:03", encerradoEm: null, severidade: "alta", perfilAtivo: "Em viagem", pontoDeControle: null, detalhe: "Padrão de olhos fechados acima do limiar por 8 segundos.", comentarios: [{ id: "c1", texto: "Contato por intercom realizado, motorista respondeu.", autor: "Larissa Martins", criadoEm: "2026-09-08T14:34:00" }] },
  { id: "EV-9103", tipo: "sinal", titulo: "Perda de sinal celular", veiculo: "VTR-2240", motorista: "Não identificado", natureza: "condicao", occurredAt: "2026-09-08T14:02:10", receivedAt: "2026-09-08T14:02:10", encerradoEm: null, severidade: "media", perfilAtivo: "Pernoite", pontoDeControle: "PC-002", ultimaPosicao: "Seropédica · -22.7438, -43.7071 · 14:01:58", canalContingencia: "sem_sinal", detalhe: "Sem reporte pelo canal celular há 30 min. Canal de contingência não configurado para este perfil neste equipamento.", comentarios: [] },
  { id: "EV-9102", tipo: "rota", titulo: "Fora do corredor da rota", veiculo: "VTR-1783", motorista: "Ana Paula Costa", natureza: "condicao", occurredAt: "2026-09-08T13:48:00", receivedAt: "2026-09-08T13:48:02", encerradoEm: null, severidade: "alta", perfilAtivo: "Em viagem", pontoDeControle: null, detalhe: "Distância ao corredor de RT-02: 1.240 m (corredor de 500 m).", comentarios: [] },
  { id: "EV-9101", tipo: "sensor", titulo: "Porta do baú aberta fora de ponto de controle", veiculo: "VTR-0931", motorista: "Rafael Nunes", natureza: "condicao", occurredAt: "2026-09-08T12:20:40", receivedAt: "2026-09-08T13:05:12", encerradoEm: "2026-09-08T12:24:05", severidade: "alta", perfilAtivo: "Em viagem", pontoDeControle: null, canalContingencia: "satelite", detalhe: "Sensor de porta do baú violado com perfil Viagem normal. Evento entregue após reconexão via satélite.", comentarios: [] },
  { id: "EV-9100", tipo: "ponto", titulo: "Entrou no ponto de controle", veiculo: "VTR-3110", motorista: "Marcos Silva", natureza: "marco", occurredAt: "2026-09-08T13:12:00", receivedAt: "2026-09-08T13:12:01", encerradoEm: null, severidade: "baixa", perfilAtivo: "Abastecimento", pontoDeControle: "PC-003", detalhe: "Perfil trocado automaticamente para Em carga pela geocerca do ponto.", comentarios: [] },
  { id: "EV-9099", tipo: "macro", titulo: "Macro registrada: Início de carga", veiculo: "VTR-3110", motorista: "Marcos Silva", natureza: "marco", occurredAt: "2026-09-08T13:12:40", receivedAt: "2026-09-08T13:12:41", encerradoEm: null, severidade: "baixa", perfilAtivo: "Abastecimento", pontoDeControle: "PC-003", detalhe: "Macro confirmada pelo motorista no terminal do veículo.", comentarios: [] },
  { id: "EV-9098", tipo: "rotograma", titulo: "Jornada muito atrasada", veiculo: "VTR-0931", motorista: "Rafael Nunes", natureza: "condicao", occurredAt: "2026-09-08T12:55:00", receivedAt: "2026-09-08T13:05:12", encerradoEm: null, severidade: "media", perfilAtivo: "Em viagem", pontoDeControle: null, canalContingencia: "satelite", detalhe: "Desvio de +95 min no trecho T1 de RG-0931. Entregue após reconexão.", comentarios: [] },
  { id: "EV-9097", tipo: "comando", titulo: "Botão de destrave habilitado (modo único)", veiculo: "VTR-2048", motorista: "Carlos Mendes", natureza: "marco", occurredAt: "2026-09-08T11:40:00", receivedAt: "2026-09-08T11:40:01", encerradoEm: null, severidade: "baixa", perfilAtivo: "No cliente", pontoDeControle: "PC-001", detalhe: "Central habilitou o botão de destrave do baú; motorista acionou às 11:41.", comentarios: [] },
  { id: "EV-9096", tipo: "ponto", titulo: "Permanência acima da política", veiculo: "VTR-2048", motorista: "Carlos Mendes", natureza: "condicao", occurredAt: "2026-09-08T10:05:00", receivedAt: "2026-09-08T10:05:02", encerradoEm: "2026-09-08T10:31:00", severidade: "media", perfilAtivo: "No cliente", pontoDeControle: "PC-001", detalhe: "Permanência de 116 min em CD Itaguaí · doca 4 (política: 90 min).", comentarios: [] },
];

// ----------------------------------------------------------------- Mensagens

export type Mensagem = { id: string; veiculo: string; direcao: "central" | "motorista"; texto: string; enviadaEm: string; lidaEm: string | null; predefinida: boolean };

export const mensagensPredefinidas = ["Confirme sua situação.", "Siga para o próximo ponto de controle.", "Parada autorizada por 30 min.", "Aguarde liberação da central.", "Retorne ao corredor da rota."];

export const mensagensIniciais: Mensagem[] = [
  { id: "m1", veiculo: "VTR-2048", direcao: "central", texto: "Confirme sua situação.", enviadaEm: "2026-09-08T14:33:00", lidaEm: "2026-09-08T14:33:40", predefinida: true },
  { id: "m2", veiculo: "VTR-2048", direcao: "motorista", texto: "Tudo bem, vou parar no próximo posto.", enviadaEm: "2026-09-08T14:34:10", lidaEm: "2026-09-08T14:34:12", predefinida: false },
  { id: "m3", veiculo: "VTR-2048", direcao: "central", texto: "Parada autorizada por 30 min.", enviadaEm: "2026-09-08T14:35:00", lidaEm: null, predefinida: true },
  { id: "m4", veiculo: "VTR-1783", direcao: "central", texto: "Retorne ao corredor da rota.", enviadaEm: "2026-09-08T13:50:00", lidaEm: "2026-09-08T13:52:30", predefinida: true },
  { id: "m5", veiculo: "VTR-0931", direcao: "motorista", texto: "Fila na portaria do CD, sem previsão.", enviadaEm: "2026-09-08T13:06:00", lidaEm: "2026-09-08T13:06:05", predefinida: false },
];

// ------------------------------------------------------------------ Comandos

export type Comando = {
  id: string;
  nome: string;
  modo: "direto" | "delegado";
  atuador: Atuador | "reporte" | "mensagem";
  descricao: string;
  aplicavel: { linhas: Equipamento["linha"][]; firmwareMinimo: string };
};

export const comandos: Comando[] = [
  { id: "CMD-DESTRAVE-BAU", nome: "Habilitar botão de destrave do baú", modo: "delegado", atuador: "trava_bau", descricao: "A central libera o botão; o motorista aciona no veículo.", aplicavel: { linhas: ["MDVR-8", "MDVR-8 Pro"], firmwareMinimo: "4.0.0" } },
  { id: "CMD-LIBERA-MOTOR", nome: "Habilitar botão de liberação do motor", modo: "delegado", atuador: "bloqueio_motor", descricao: "A central libera o botão; o motorista desbloqueia no veículo.", aplicavel: { linhas: ["MDVR-4", "MDVR-8", "MDVR-8 Pro"], firmwareMinimo: "3.9.0" } },
  { id: "CMD-QUINTA-RODA", nome: "Habilitar botão da quinta roda", modo: "delegado", atuador: "trava_quinta_roda", descricao: "Libera o desengate pelo motorista.", aplicavel: { linhas: ["MDVR-8 Pro"], firmwareMinimo: "4.2.0" } },
  { id: "CMD-SIRENE", nome: "Acionar sirene", modo: "direto", atuador: "sirene", descricao: "Atuação imediata pela central.", aplicavel: { linhas: ["MDVR-4", "MDVR-8", "MDVR-8 Pro"], firmwareMinimo: "3.8.0" } },
  { id: "CMD-LUZ", nome: "Acionar luz de alerta", modo: "direto", atuador: "luz_alerta", descricao: "Atuação imediata pela central.", aplicavel: { linhas: ["MDVR-8", "MDVR-8 Pro"], firmwareMinimo: "4.0.0" } },
  { id: "CMD-BLOQUEIO", nome: "Bloquear motor (progressivo)", modo: "direto", atuador: "bloqueio_motor", descricao: "Atuação imediata pela central, com redução gradual.", aplicavel: { linhas: ["MDVR-8", "MDVR-8 Pro"], firmwareMinimo: "4.1.0" } },
  { id: "CMD-REPORTE", nome: "Solicitar reporte de posição", modo: "direto", atuador: "reporte", descricao: "Força um reporte imediato pelo canal disponível.", aplicavel: { linhas: ["MDVR-4", "MDVR-8", "MDVR-8 Pro"], firmwareMinimo: "3.8.0" } },
];

export const textosComandoIniciais = ["Liberação solicitada pelo cliente na doca.", "Motorista confirmou parada segura por intercom.", "Autorizado pelo supervisor de turno.", "Suspeita de sinistro, acionamento preventivo."];

export type HistoricoComando = { id: string; comando: string; veiculo: string; modo: "direto" | "delegado"; persistente: boolean; observacao: string; enviadoEm: string; enviadoPor: string; status: "enviado" | "acionado_pelo_motorista" | "expirado" };

export const historicoComandosInicial: HistoricoComando[] = [
  { id: "HC-01", comando: "Habilitar botão de destrave do baú", veiculo: "VTR-2048", modo: "delegado", persistente: false, observacao: "Liberação solicitada pelo cliente na doca.", enviadoEm: "2026-09-08T11:40:00", enviadoPor: "Larissa Martins", status: "acionado_pelo_motorista" },
  { id: "HC-02", comando: "Solicitar reporte de posição", veiculo: "VTR-2240", modo: "direto", persistente: false, observacao: "Sem sinal há 20 min, tentando reporte por contingência.", enviadoEm: "2026-09-08T14:22:00", enviadoPor: "Larissa Martins", status: "expirado" },
];

// ------------------------------------------------------------------ Helpers

export const compareVersion = (a: string, b: string) => {
  const pa = a.split(".").map(Number); const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) { if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0); }
  return 0;
};

export const comandoAplicavel = (comando: Comando, equipamento: Equipamento): { ok: boolean; motivo?: string } => {
  if (!comando.aplicavel.linhas.includes(equipamento.linha)) return { ok: false, motivo: `Linha ${equipamento.linha} não suporta este comando` };
  if (compareVersion(equipamento.firmware, comando.aplicavel.firmwareMinimo) < 0) return { ok: false, motivo: `Firmware ${equipamento.firmware} < ${comando.aplicavel.firmwareMinimo}` };
  return { ok: true };
};

export const equipamentoDe = (veiculo: string) => equipamentos.find((e) => e.veiculo === veiculo) ?? equipamentos[0];
export const nomePonto = (id: string, pontos: PontoDeControle[]) => pontos.find((p) => p.id === id)?.nome ?? id;
export const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
