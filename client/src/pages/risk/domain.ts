/**
 * Domínio mock do Avansat Risk — MDVR como hardware de gestão de risco.
 * Sem backend: tudo aqui é dado demonstrativo, persistido em localStorage pelas views.
 */

export const STORAGE = {
  perfis: "avansat-risk:v3:perfis",
  pontos: "avansat-risk:v3:pontos-de-controle",
  cercas: "avansat-risk:v3:cercas",
  rotas: "avansat-risk:v3:rotas",
  rotogramas: "avansat-risk:v3:rotogramas",
  embarques: "avansat-risk:v3:embarques",
  credenciais: "avansat-risk:v3:credenciais",
  eventos: "avansat-risk:v3:eventos",
  mensagens: "avansat-risk:v3:mensagens",
  comandos: "avansat-risk:v3:historico-comandos",
  textosComando: "avansat-risk:v3:textos-comando",
} as const;

// ---------------------------------------------------------------- Equipamentos

export type Equipamento = { veiculo: string; equipamento: string; linha: "MDVR-4" | "MDVR-8" | "MDVR-8 Pro"; firmware: string; perfilAtivo: string; canal: "celular" | "satelite" | "lorawan" | "sem_sinal" };

export const equipamentos: Equipamento[] = [
  { veiculo: "VTR-2048", equipamento: "MDVR-0882", linha: "MDVR-8 Pro", firmware: "4.2.1", perfilAtivo: "PF-VIAGEM", canal: "celular" },
  { veiculo: "VTR-1783", equipamento: "MDVR-0714", linha: "MDVR-8", firmware: "4.1.0", perfilAtivo: "PF-VIAGEM", canal: "celular" },
  { veiculo: "VTR-0931", equipamento: "MDVR-1028", linha: "MDVR-4", firmware: "3.9.4", perfilAtivo: "PF-CLIENTE", canal: "satelite" },
  { veiculo: "VTR-3110", equipamento: "MDVR-0921", linha: "MDVR-8", firmware: "4.2.1", perfilAtivo: "PF-CARGA", canal: "celular" },
  { veiculo: "VTR-2240", equipamento: "MDVR-0655", linha: "MDVR-4", firmware: "3.8.0", perfilAtivo: "PF-PERNOITE", canal: "sem_sinal" },
];

export const canalLabel: Record<Equipamento["canal"], string> = { celular: "Celular", satelite: "Satélite (contingência)", lorawan: "LoRaWAN (contingência)", sem_sinal: "Sem sinal" };

// ---------------------------------------------------------- Perfil Operacional

export type Atuador = "bloqueio_motor" | "trava_bau" | "sirene" | "luz_alerta" | "trava_quinta_roda";
export type PosturaAtuador = "ligado" | "desligado" | "como_estava";
export type Sensor = "porta_bau" | "porta_cabine" | "ignicao" | "velocidade" | "engate" | "painel" | "movimento";

export const atuadorLabel: Record<Atuador, string> = { bloqueio_motor: "Bloqueio de motor", trava_bau: "Trava do baú", sirene: "Sirene", luz_alerta: "Luz de alerta", trava_quinta_roda: "Trava da quinta roda" };
export const posturaLabel: Record<PosturaAtuador, string> = { ligado: "Ligado", desligado: "Desligado", como_estava: "Como estava" };
export const sensorLabel: Record<Sensor, string> = { porta_bau: "Porta do baú", porta_cabine: "Porta da cabine", ignicao: "Ignição", velocidade: "Velocidade", engate: "Engate / desengate", painel: "Violação do painel", movimento: "Movimento sem ignição" };

export type SensorArmado = { sensor: Sensor; armado: boolean; violacao: string };

export type PerfilOperacional = {
  id: string;
  nome: string;
  versao: number;
  descricao: string;
  status: "publicado" | "rascunho";
  atuadores: Record<Atuador, PosturaAtuador>;
  sensores: SensorArmado[];
  gatilhos: { geocercas: string[]; macros: string[] };
  acionamento: { modo: "temporario" | "permanente"; duracaoMin: number };
  contingencia: { eventos: string[]; frequenciaReporteSeg: number };
  atualizadoEm: string;
  embarcadoEm: number;
};

export const perfisIniciais: PerfilOperacional[] = [
  {
    id: "PF-VIAGEM", nome: "Viagem normal", versao: 7, status: "publicado", atualizadoEm: "2026-09-01T09:20:00", embarcadoEm: 184,
    descricao: "Postura padrão em deslocamento. Sensores de porta armados, atuadores em repouso.",
    atuadores: { bloqueio_motor: "desligado", trava_bau: "ligado", sirene: "desligado", luz_alerta: "desligado", trava_quinta_roda: "ligado" },
    sensores: [
      { sensor: "porta_bau", armado: true, violacao: "Abertura fora de ponto de controle" },
      { sensor: "porta_cabine", armado: false, violacao: "—" },
      { sensor: "velocidade", armado: true, violacao: "Acima do limite do trecho por 10 s" },
      { sensor: "engate", armado: true, violacao: "Desengate com ignição ligada" },
      { sensor: "painel", armado: true, violacao: "Qualquer abertura" },
    ],
    gatilhos: { geocercas: [], macros: ["MC-FIM-CARGA", "MC-SAIDA-CLIENTE"] },
    acionamento: { modo: "permanente", duracaoMin: 0 },
    contingencia: { eventos: ["Violação de painel", "Desengate", "Perda de sinal > 5 min"], frequenciaReporteSeg: 300 },
  },
  {
    id: "PF-CLIENTE", nome: "No cliente", versao: 4, status: "publicado", atualizadoEm: "2026-08-22T15:05:00", embarcadoEm: 92,
    descricao: "Dentro de ponto de controle de cliente. Baú liberado, motor bloqueado enquanto descarrega.",
    atuadores: { bloqueio_motor: "ligado", trava_bau: "desligado", sirene: "desligado", luz_alerta: "como_estava", trava_quinta_roda: "ligado" },
    sensores: [
      { sensor: "porta_bau", armado: false, violacao: "—" },
      { sensor: "ignicao", armado: true, violacao: "Ignição ligada durante descarga" },
      { sensor: "engate", armado: true, violacao: "Desengate sem macro de fim de entrega" },
      { sensor: "movimento", armado: true, violacao: "Deslocamento > 30 m" },
    ],
    gatilhos: { geocercas: ["PC-001", "PC-004"], macros: ["MC-INICIO-ENTREGA"] },
    acionamento: { modo: "temporario", duracaoMin: 90 },
    contingencia: { eventos: ["Movimento sem ignição", "Violação de painel"], frequenciaReporteSeg: 120 },
  },
  {
    id: "PF-PERNOITE", nome: "Pernoite", versao: 3, status: "publicado", atualizadoEm: "2026-08-30T21:40:00", embarcadoEm: 61,
    descricao: "Veículo parado em ponto de pernoite autorizado. Tudo travado, sirene armada.",
    atuadores: { bloqueio_motor: "ligado", trava_bau: "ligado", sirene: "ligado", luz_alerta: "ligado", trava_quinta_roda: "ligado" },
    sensores: [
      { sensor: "porta_bau", armado: true, violacao: "Qualquer abertura" },
      { sensor: "porta_cabine", armado: true, violacao: "Abertura sem credencial" },
      { sensor: "ignicao", armado: true, violacao: "Ignição sem credencial" },
      { sensor: "movimento", armado: true, violacao: "Deslocamento > 10 m" },
      { sensor: "painel", armado: true, violacao: "Qualquer abertura" },
    ],
    gatilhos: { geocercas: ["PC-002"], macros: ["MC-PERNOITE"] },
    acionamento: { modo: "permanente", duracaoMin: 0 },
    contingencia: { eventos: ["Qualquer violação de sensor", "Perda de sinal > 2 min"], frequenciaReporteSeg: 60 },
  },
  {
    id: "PF-CARGA", nome: "Em carga", versao: 2, status: "publicado", atualizadoEm: "2026-09-05T11:10:00", embarcadoEm: 40,
    descricao: "Carregamento em base própria. Baú aberto, motor bloqueado, engate monitorado.",
    atuadores: { bloqueio_motor: "ligado", trava_bau: "desligado", sirene: "desligado", luz_alerta: "desligado", trava_quinta_roda: "ligado" },
    sensores: [
      { sensor: "engate", armado: true, violacao: "Desengate durante carga" },
      { sensor: "ignicao", armado: true, violacao: "Ignição ligada com baú aberto" },
    ],
    gatilhos: { geocercas: ["PC-003"], macros: ["MC-INICIO-CARGA"] },
    acionamento: { modo: "temporario", duracaoMin: 120 },
    contingencia: { eventos: ["Desengate"], frequenciaReporteSeg: 300 },
  },
  {
    id: "PF-PARADA", nome: "Parada autorizada", versao: 1, status: "rascunho", atualizadoEm: "2026-09-07T17:55:00", embarcadoEm: 0,
    descricao: "Parada curta em posto homologado. Rascunho aguardando revisão de postura da sirene.",
    atuadores: { bloqueio_motor: "desligado", trava_bau: "ligado", sirene: "como_estava", luz_alerta: "desligado", trava_quinta_roda: "ligado" },
    sensores: [
      { sensor: "porta_bau", armado: true, violacao: "Qualquer abertura" },
      { sensor: "movimento", armado: true, violacao: "Deslocamento > 50 m sem macro de fim de parada" },
    ],
    gatilhos: { geocercas: ["PC-005"], macros: ["MC-PARADA"] },
    acionamento: { modo: "temporario", duracaoMin: 45 },
    contingencia: { eventos: ["Perda de sinal > 5 min"], frequenciaReporteSeg: 300 },
  },
];

export type Macro = { id: string; nome: string; descricao: string; perfilDestino: string };

export const macros: Macro[] = [
  { id: "MC-INICIO-CARGA", nome: "Início de carga", descricao: "Motorista registra chegada ao ponto de carregamento.", perfilDestino: "PF-CARGA" },
  { id: "MC-FIM-CARGA", nome: "Fim de carga", descricao: "Carregamento concluído; veículo retoma viagem.", perfilDestino: "PF-VIAGEM" },
  { id: "MC-INICIO-ENTREGA", nome: "Início de entrega", descricao: "Chegada ao cliente, começa descarga.", perfilDestino: "PF-CLIENTE" },
  { id: "MC-SAIDA-CLIENTE", nome: "Saída do cliente", descricao: "Entrega concluída; veículo retoma viagem.", perfilDestino: "PF-VIAGEM" },
  { id: "MC-PERNOITE", nome: "Pernoite", descricao: "Veículo estacionado para pernoite autorizado.", perfilDestino: "PF-PERNOITE" },
  { id: "MC-PARADA", nome: "Parada autorizada", descricao: "Parada curta em posto homologado.", perfilDestino: "PF-PARADA" },
];

// -------------------------------------------------------- Pontos de Controle

export type CategoriaPonto = "cliente" | "pernoite" | "base" | "posto" | "area_risco" | "carga";
export const categoriaPontoLabel: Record<CategoriaPonto, string> = { cliente: "Cliente", pernoite: "Pernoite", base: "Base própria", posto: "Posto homologado", area_risco: "Área de risco", carga: "Carregamento" };

export type PontoDeControle = {
  id: string;
  nome: string;
  categoria: CategoriaPonto;
  politica: { perfil: string; permanenciaMaxMin: number; permanenciaMinMin: number; janela: string };
  fixo: boolean;
  precedencia: number | null;
  ativo: boolean;
  raioM: number;
  local: string;
  sobrepoe: string[];
  versao: number;
};

export const pontosIniciais: PontoDeControle[] = [
  { id: "PC-001", nome: "CD Itaguaí · doca 4", categoria: "cliente", politica: { perfil: "PF-CLIENTE", permanenciaMaxMin: 90, permanenciaMinMin: 15, janela: "06:00–20:00" }, fixo: false, precedencia: 1, ativo: true, raioM: 250, local: "Itaguaí · RJ", sobrepoe: ["PC-006"], versao: 3 },
  { id: "PC-002", nome: "Pátio pernoite Seropédica", categoria: "pernoite", politica: { perfil: "PF-PERNOITE", permanenciaMaxMin: 720, permanenciaMinMin: 0, janela: "20:00–06:00" }, fixo: true, precedencia: null, ativo: true, raioM: 180, local: "Seropédica · RJ", sobrepoe: [], versao: 5 },
  { id: "PC-003", nome: "Base Campinas · carregamento", categoria: "carga", politica: { perfil: "PF-CARGA", permanenciaMaxMin: 120, permanenciaMinMin: 30, janela: "24h" }, fixo: true, precedencia: null, ativo: true, raioM: 400, local: "Campinas · SP", sobrepoe: [], versao: 2 },
  { id: "PC-004", nome: "Cliente Contagem · portaria B", categoria: "cliente", politica: { perfil: "PF-CLIENTE", permanenciaMaxMin: 60, permanenciaMinMin: 10, janela: "07:00–18:00" }, fixo: false, precedencia: null, ativo: true, raioM: 200, local: "Contagem · MG", sobrepoe: [], versao: 1 },
  { id: "PC-005", nome: "Posto Graal · km 402", categoria: "posto", politica: { perfil: "PF-PARADA", permanenciaMaxMin: 45, permanenciaMinMin: 0, janela: "24h" }, fixo: false, precedencia: null, ativo: false, raioM: 150, local: "BR-116 · km 402", sobrepoe: [], versao: 1 },
  { id: "PC-006", nome: "Zona portuária Itaguaí", categoria: "area_risco", politica: { perfil: "PF-VIAGEM", permanenciaMaxMin: 20, permanenciaMinMin: 0, janela: "24h" }, fixo: true, precedencia: null, ativo: true, raioM: 1200, local: "Itaguaí · RJ", sobrepoe: ["PC-001"], versao: 4 },
];

// ------------------------------------------------------------------- Cercas

export type Cerca = {
  id: string;
  nome: string;
  categoria: "restrita" | "operacional" | "velocidade" | "horario";
  politica: { permanenciaMaxMin: number | null; limiteKmh: number | null; janela: string };
  ativa: boolean;
  local: string;
  versao: number;
};

export const cercasIniciais: Cerca[] = [
  { id: "CE-01", nome: "Anel Rodoviário · faixa 2", categoria: "velocidade", politica: { permanenciaMaxMin: null, limiteKmh: 80, janela: "24h" }, ativa: true, local: "Belo Horizonte · MG", versao: 2 },
  { id: "CE-02", nome: "Área restrita · Pátio Itaguaí", categoria: "restrita", politica: { permanenciaMaxMin: 0, limiteKmh: null, janela: "24h" }, ativa: true, local: "Itaguaí · RJ", versao: 3 },
  { id: "CE-03", nome: "Base Campinas · portaria noturna", categoria: "horario", politica: { permanenciaMaxMin: null, limiteKmh: null, janela: "22:00–05:00" }, ativa: false, local: "Campinas · SP", versao: 1 },
  { id: "CE-04", nome: "Perímetro urbano Rio · centro", categoria: "operacional", politica: { permanenciaMaxMin: 40, limiteKmh: 50, janela: "06:00–22:00" }, ativa: true, local: "Rio de Janeiro · RJ", versao: 6 },
];

// -------------------------------------------------------------------- Rotas

export type Rota = { id: string; nome: string; origem: string; destino: string; corredorM: number; distanciaKm: number; ativa: boolean; veiculosVinculados: number; desvioAtualM: number | null; versao: number };

export const rotasIniciais: Rota[] = [
  { id: "RT-01", nome: "Campinas → Itaguaí (BR-116)", origem: "Base Campinas", destino: "CD Itaguaí", corredorM: 300, distanciaKm: 512, ativa: true, veiculosVinculados: 14, desvioAtualM: 40, versao: 4 },
  { id: "RT-02", nome: "Contagem → Rio (BR-040)", origem: "Cliente Contagem", destino: "Perímetro Rio", corredorM: 500, distanciaKm: 438, ativa: true, veiculosVinculados: 9, desvioAtualM: 1240, versao: 2 },
  { id: "RT-03", nome: "Alça portuária Itaguaí", origem: "Zona portuária", destino: "CD Itaguaí", corredorM: 150, distanciaKm: 11, ativa: false, veiculosVinculados: 0, desvioAtualM: null, versao: 1 },
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
export const tipoItemLabel: Record<TipoItemEmbarque, string> = { jornada: "Jornada (rotograma)", ponto: "Ponto de controle", cerca: "Cerca", perfil: "Perfil operacional", credencial: "Credencial" };

export type ItemEmbarque = { id: string; tipo: TipoItemEmbarque; referencia: string; nome: string; versao: number; aceite: "pendente" | "aceito" | "rejeitado"; motivo?: string; respondidoEm?: string };
export type Embarque = { id: string; veiculo: string; equipamento: string; emitidoEm: string; emitidoPor: string; itens: ItemEmbarque[] };

export type CatalogoItem = { id: string; tipo: TipoItemEmbarque; nome: string; versao: number; publicadoEm: string; dependeDe: string[] };

export const catalogo: CatalogoItem[] = [
  ...perfisIniciais.filter((p) => p.status === "publicado").map((p) => ({ id: p.id, tipo: "perfil" as const, nome: p.nome, versao: p.versao, publicadoEm: p.atualizadoEm, dependeDe: [] })),
  ...pontosIniciais.map((p) => ({ id: p.id, tipo: "ponto" as const, nome: p.nome, versao: p.versao, publicadoEm: "2026-09-02T10:00:00", dependeDe: [p.politica.perfil] })),
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
  { id: "EV-9105", tipo: "coacao", titulo: "Senha de coação utilizada", veiculo: "VTR-1783", motorista: "Ana Paula Costa", natureza: "marco", occurredAt: "2026-09-08T14:31:20", receivedAt: "2026-09-08T14:31:22", encerradoEm: null, severidade: "alta", perfilAtivo: "PF-VIAGEM", pontoDeControle: null, detalhe: "Credencial de coação validada no equipamento. Operação autorizada normalmente no veículo; alerta silencioso roteado somente para a gestão de risco.", comentarios: [] },
  { id: "EV-9104", tipo: "comportamento", titulo: "Fadiga detectada", veiculo: "VTR-2048", motorista: "Carlos Mendes", natureza: "condicao", occurredAt: "2026-09-08T14:32:00", receivedAt: "2026-09-08T14:32:03", encerradoEm: null, severidade: "alta", perfilAtivo: "PF-VIAGEM", pontoDeControle: null, detalhe: "Padrão de olhos fechados acima do limiar por 8 segundos.", comentarios: [{ id: "c1", texto: "Contato por intercom realizado, motorista respondeu.", autor: "Larissa Martins", criadoEm: "2026-09-08T14:34:00" }] },
  { id: "EV-9103", tipo: "sinal", titulo: "Perda de sinal celular", veiculo: "VTR-2240", motorista: "Não identificado", natureza: "condicao", occurredAt: "2026-09-08T14:02:10", receivedAt: "2026-09-08T14:02:10", encerradoEm: null, severidade: "media", perfilAtivo: "PF-PERNOITE", pontoDeControle: "PC-002", ultimaPosicao: "Seropédica · -22.7438, -43.7071 · 14:01:58", canalContingencia: "sem_sinal", detalhe: "Sem reporte pelo canal celular há 30 min. Canal de contingência não configurado para este perfil neste equipamento.", comentarios: [] },
  { id: "EV-9102", tipo: "rota", titulo: "Fora do corredor da rota", veiculo: "VTR-1783", motorista: "Ana Paula Costa", natureza: "condicao", occurredAt: "2026-09-08T13:48:00", receivedAt: "2026-09-08T13:48:02", encerradoEm: null, severidade: "alta", perfilAtivo: "PF-VIAGEM", pontoDeControle: null, detalhe: "Distância ao corredor de RT-02: 1.240 m (corredor de 500 m).", comentarios: [] },
  { id: "EV-9101", tipo: "sensor", titulo: "Porta do baú aberta fora de ponto de controle", veiculo: "VTR-0931", motorista: "Rafael Nunes", natureza: "condicao", occurredAt: "2026-09-08T12:20:40", receivedAt: "2026-09-08T13:05:12", encerradoEm: "2026-09-08T12:24:05", severidade: "alta", perfilAtivo: "PF-VIAGEM", pontoDeControle: null, canalContingencia: "satelite", detalhe: "Sensor de porta do baú violado com perfil Viagem normal. Evento entregue após reconexão via satélite.", comentarios: [] },
  { id: "EV-9100", tipo: "ponto", titulo: "Entrou no ponto de controle", veiculo: "VTR-3110", motorista: "Marcos Silva", natureza: "marco", occurredAt: "2026-09-08T13:12:00", receivedAt: "2026-09-08T13:12:01", encerradoEm: null, severidade: "baixa", perfilAtivo: "PF-CARGA", pontoDeControle: "PC-003", detalhe: "Perfil trocado automaticamente para Em carga pela geocerca do ponto.", comentarios: [] },
  { id: "EV-9099", tipo: "macro", titulo: "Macro registrada: Início de carga", veiculo: "VTR-3110", motorista: "Marcos Silva", natureza: "marco", occurredAt: "2026-09-08T13:12:40", receivedAt: "2026-09-08T13:12:41", encerradoEm: null, severidade: "baixa", perfilAtivo: "PF-CARGA", pontoDeControle: "PC-003", detalhe: "Macro confirmada pelo motorista no terminal do veículo.", comentarios: [] },
  { id: "EV-9098", tipo: "rotograma", titulo: "Jornada muito atrasada", veiculo: "VTR-0931", motorista: "Rafael Nunes", natureza: "condicao", occurredAt: "2026-09-08T12:55:00", receivedAt: "2026-09-08T13:05:12", encerradoEm: null, severidade: "media", perfilAtivo: "PF-VIAGEM", pontoDeControle: null, canalContingencia: "satelite", detalhe: "Desvio de +95 min no trecho T1 de RG-0931. Entregue após reconexão.", comentarios: [] },
  { id: "EV-9097", tipo: "comando", titulo: "Botão de destrave habilitado (modo único)", veiculo: "VTR-2048", motorista: "Carlos Mendes", natureza: "marco", occurredAt: "2026-09-08T11:40:00", receivedAt: "2026-09-08T11:40:01", encerradoEm: null, severidade: "baixa", perfilAtivo: "PF-CLIENTE", pontoDeControle: "PC-001", detalhe: "Central habilitou o botão de destrave do baú; motorista acionou às 11:41.", comentarios: [] },
  { id: "EV-9096", tipo: "ponto", titulo: "Permanência acima da política", veiculo: "VTR-2048", motorista: "Carlos Mendes", natureza: "condicao", occurredAt: "2026-09-08T10:05:00", receivedAt: "2026-09-08T10:05:02", encerradoEm: "2026-09-08T10:31:00", severidade: "media", perfilAtivo: "PF-CLIENTE", pontoDeControle: "PC-001", detalhe: "Permanência de 116 min em CD Itaguaí · doca 4 (política: 90 min).", comentarios: [] },
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
export const nomePerfil = (id: string, perfis: PerfilOperacional[]) => perfis.find((p) => p.id === id)?.nome ?? id;
export const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
