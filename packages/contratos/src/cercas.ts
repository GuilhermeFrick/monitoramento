import { z } from "zod";
import { dataSchema, instanteSchema, paginaSchema } from "./comum";
import { geometriaSchema } from "./geometria";

/**
 * Cerca eletrônica no transporte.
 *
 * Toda chave é obrigatória. `descricao`, `vigencia_inicio` e `vigencia_fim`
 * podem valer nulo, mas não podem faltar: a tela decide com os três — se some
 * a descrição some o subtítulo, e é a vigência que diz se a cerca está valendo
 * hoje ou só desenhada. Chave que some do mapeamento sem o compilador reclamar
 * vira uma tela que decide errado em silêncio.
 */

export const categoriaCercaSchema = z.enum(["restrita", "operacional", "velocidade", "horario"]);
export type CategoriaCerca = z.infer<typeof categoriaCercaSchema>;

export const politicaCercaSchema = z.object({
  permanencia_max_min: z.number().int().nonnegative().nullable(),
  limite_kmh: z.number().int().positive().nullable(),
  janela: z.string().min(1),
});

export const cercaSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  descricao: z.string().nullable(),
  categoria: categoriaCercaSchema,
  politica: politicaCercaSchema,
  ativa: z.boolean(),
  local: z.string(),
  versao: z.number().int().positive(),
  geometria: geometriaSchema,
  /** Veículos que embarcam esta cerca. Vazio é vazio, nunca ausente. */
  veiculos: z.array(z.string()),
  vigencia_inicio: dataSchema.nullable(),
  vigencia_fim: dataSchema.nullable(),
  criado_em: instanteSchema,
  atualizado_em: instanteSchema,
});
export type CercaTransporte = z.infer<typeof cercaSchema>;

export const paginaCercasSchema = paginaSchema(cercaSchema);

/** O que se manda ao criar. Sem id, sem versão, sem carimbo de tempo: é o servidor que decide. */
export const criarCercaSchema = cercaSchema.omit({
  id: true,
  versao: true,
  criado_em: true,
  atualizado_em: true,
});
export type CriarCercaTransporte = z.infer<typeof criarCercaSchema>;

/**
 * O que se manda ao alterar.
 *
 * `versao` vem junto e não é decorativa: é ela que faz o servidor devolver 409
 * quando dois operadores editam a mesma cerca. Sem isso, o último a salvar
 * apaga o trabalho do primeiro sem ninguém perceber.
 */
export const alterarCercaSchema = criarCercaSchema.partial().extend({
  versao: z.number().int().positive(),
});
export type AlterarCercaTransporte = z.infer<typeof alterarCercaSchema>;

export const filtroCercasSchema = z.object({
  veiculo: z.string().nullable(),
  ativa: z.boolean().nullable(),
  busca: z.string().nullable(),
  cursor: z.string().nullable(),
  limite: z.number().int().min(1).max(200),
});
export type FiltroCercasTransporte = z.infer<typeof filtroCercasSchema>;

export const ROTAS_CERCAS = {
  listar: "/api/cercas",
  obter: (id: string) => `/api/cercas/${id}`,
  criar: "/api/cercas",
  alterar: (id: string) => `/api/cercas/${id}`,
  remover: (id: string) => `/api/cercas/${id}`,
  vincular: (id: string) => `/api/cercas/${id}/veiculos`,
} as const;
