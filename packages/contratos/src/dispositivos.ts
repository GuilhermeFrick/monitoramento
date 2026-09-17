import { z } from "zod";
import { instanteSchema, paginaSchema } from "./comum";

/**
 * Dispositivo embarcado — o MDVR, e o que vier depois dele.
 *
 * Duas regras de domínio moldam este contrato.
 *
 * **O número de série identifica, o cadastro vincula.** O aparelho anuncia seu
 * serial e mais nada confiável: placa, motorista e número de frota chegam
 * vazios de fábrica, porque são campos que alguém digita na instalação. Quem
 * diz de que cliente é o aparelho e em que veículo ele está é esta tabela.
 *
 * **Nada aqui tem nome de fabricante.** O serial da Streamax se chama `DSNO` no
 * fio; aqui é `serie`. Outra família vai identificar por IMEI ou ICCID e entra
 * no mesmo campo. `familia` diz qual gate fala com ele.
 */

/** Família do aparelho, que é o mesmo que dizer qual gate o atende. */
export const familiaDispositivoSchema = z.enum(["streamax_n9m", "generico"]);
export type FamiliaDispositivo = z.infer<typeof familiaDispositivoSchema>;

/**
 * Situação cadastral, que não é o mesmo que estar online.
 *
 * `inativo` é decisão administrativa: o aparelho continua recusado na porta,
 * mas o histórico dele permanece. É o que se usa quando um veículo sai da
 * frota sem que ninguém queira apagar os últimos seis meses de viagem.
 */
export const situacaoDispositivoSchema = z.enum(["ativo", "inativo"]);
export type SituacaoDispositivo = z.infer<typeof situacaoDispositivoSchema>;

/**
 * O que o aparelho declarou de si na última conexão.
 *
 * Tudo nulo até ele conectar pela primeira vez — e nulo é informação: significa
 * cadastrado mas nunca visto, que é diferente de cadastrado e offline.
 *
 * `evidencia_versao` decide caminho de verdade: quem suporta a versão com
 * upload por HTTP manda o arquivo direto para o armazenamento, sem passar por
 * serviço nosso.
 */
export const declaracaoDispositivoSchema = z.object({
  modelo: z.string().nullable(),
  protocolo: z.string().nullable(),
  canais: z.number().int().nonnegative().nullable(),
  evidencia_versao: z.string().nullable(),
  visto_em: instanteSchema.nullable(),
  ip: z.string().nullable(),
});
export type DeclaracaoDispositivo = z.infer<typeof declaracaoDispositivoSchema>;

export const dispositivoSchema = z.object({
  id: z.string().min(1),
  /** Serial de fábrica. Único por cliente e imutável: vem do chip. */
  serie: z.string().min(1),
  familia: familiaDispositivoSchema,
  apelido: z.string().nullable(),
  situacao: situacaoDispositivoSchema,
  /** Nulo é aparelho cadastrado e ainda não instalado. A tela decide com isso. */
  veiculo: z.string().nullable(),
  observacao: z.string().nullable(),
  declarado: declaracaoDispositivoSchema,
  versao: z.number().int().positive(),
  criado_em: instanteSchema,
  atualizado_em: instanteSchema,
});
export type DispositivoTransporte = z.infer<typeof dispositivoSchema>;

export const paginaDispositivosSchema = paginaSchema(dispositivoSchema);

/**
 * O que se manda ao cadastrar.
 *
 * `declarado` fica de fora: é o aparelho que preenche, não o operador. Deixar
 * alguém digitar o modelo abriria espaço para o cadastro discordar do que está
 * no veículo — e o cadastro pareceria certo.
 */
export const criarDispositivoSchema = dispositivoSchema.omit({
  id: true,
  versao: true,
  declarado: true,
  criado_em: true,
  atualizado_em: true,
});
export type CriarDispositivoTransporte = z.infer<typeof criarDispositivoSchema>;

/**
 * O que se manda ao alterar.
 *
 * `serie` não está aqui: número de série não se corrige, se recadastra. Um
 * serial trocado por engano moveria para outro aparelho todo o histórico já
 * gravado, sem deixar rastro.
 */
export const alterarDispositivoSchema = criarDispositivoSchema
  .omit({ serie: true })
  .partial()
  .extend({ versao: z.number().int().positive() });
export type AlterarDispositivoTransporte = z.infer<typeof alterarDispositivoSchema>;

export const filtroDispositivosSchema = z.object({
  situacao: situacaoDispositivoSchema.nullable(),
  familia: familiaDispositivoSchema.nullable(),
  /** `true` traz só os sem veículo, `false` só os com. */
  sem_veiculo: z.boolean().nullable(),
  busca: z.string().nullable(),
  cursor: z.string().nullable(),
  limite: z.number().int().min(1).max(200),
});
export type FiltroDispositivosTransporte = z.infer<typeof filtroDispositivosSchema>;

/**
 * Aparelho que bateu na porta e não está no cadastro.
 *
 * O protocolo manda recusar e derrubar a conexão, e é o que o gate faz. Mas
 * recusar não é a mesma coisa que ignorar: um serial desconhecido chegando é o
 * único momento em que descobrimos sozinhos que alguém instalou um aparelho e
 * não avisou. Fica aqui esperando, para o cadastro ser um clique em vez de dez
 * caracteres copiados de um adesivo embaixo do banco.
 *
 * `cliente_id` não existe nesta fila de propósito: se ele não está cadastrado,
 * não sabemos de quem é. Quem decide é quem cadastra.
 */
export const dispositivoDesconhecidoSchema = z.object({
  serie: z.string().min(1),
  familia: familiaDispositivoSchema,
  modelo: z.string().nullable(),
  /** Placa que o aparelho anunciou. Texto digitado na instalação, pode mentir. */
  placa_declarada: z.string().nullable(),
  ip: z.string().nullable(),
  tentativas: z.number().int().positive(),
  primeira_em: instanteSchema,
  ultima_em: instanteSchema,
});
export type DispositivoDesconhecidoTransporte = z.infer<typeof dispositivoDesconhecidoSchema>;

export const paginaDesconhecidosSchema = paginaSchema(dispositivoDesconhecidoSchema);

export const ROTAS_DISPOSITIVOS = {
  listar: "/api/dispositivos",
  obter: (id: string) => `/api/dispositivos/${id}`,
  criar: "/api/dispositivos",
  alterar: (id: string) => `/api/dispositivos/${id}`,
  remover: (id: string) => `/api/dispositivos/${id}`,
  desconhecidos: "/api/dispositivos/desconhecidos",
} as const;
