import { z } from "zod";

export const coordenadaSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
});
export type Coordenada = z.infer<typeof coordenadaSchema>;
export const paraGeoJSON = (p: Coordenada): [number, number] => [p.lng, p.lat];
export const deGeoJSON = (p: number[]): Coordenada =>
  coordenadaSchema.parse({ lat: p[1], lng: p[0] });

export const perfilSchema = z.object({
  veiculo: z.enum(["van", "caminhao", "carreta"]),
  alturaM: z.number().positive().max(10),
  pesoT: z.number().positive().max(200),
  larguraM: z.number().positive().max(10).optional(),
  comprimentoM: z.number().positive().max(100).optional(),
  cargaEixoT: z.number().positive().max(50).optional(),
  cargaPerigosa: z.boolean().default(false),
  evitarPedagio: z.boolean(),
  evitarBalsa: z.boolean(),
  evitarViaNaoPavimentada: z.boolean(),
});
export type PerfilRoteirizacao = z.input<typeof perfilSchema>;
export const waypointSchema = z.object({
  id: z.string().min(1).max(120),
  nome: z.string().trim().min(1).max(200),
  tipo: z.enum(["parada", "passagem"]),
  coordenada: coordenadaSchema,
  pontoId: z.string().max(120).optional(),
  raioM: z.number().min(25).max(5000).optional(),
});
export type WaypointRoteiro = z.infer<typeof waypointSchema>;
const ringSchema = z
  .array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]))
  .min(4)
  .max(500)
  .refine(
    r => r.length >= 4 && r[0][0] === r.at(-1)![0] && r[0][1] === r.at(-1)![1],
    "O polígono precisa estar fechado."
  );
export const pedidoSchema = z
  .object({
    waypoints: z.array(waypointSchema).min(2).max(50),
    perfil: perfilSchema,
    corredorM: z.number().min(25).max(10000),
    areasProibidas: z
      .object({
        type: z.literal("MultiPolygon"),
        coordinates: z.array(z.array(ringSchema).min(1).max(10)).max(20),
      })
      .optional(),
  })
  .superRefine((p, ctx) => {
    const w = p.waypoints;
    if (w.length < 2) {
      ctx.addIssue({
        code: "custom",
        message: "Escolha pelo menos uma origem e um destino.",
      });
      return;
    }
    if (w[0].tipo !== "parada" || w.at(-1)!.tipo !== "parada")
      ctx.addIssue({
        code: "custom",
        message: "Origem e destino devem ser paradas operacionais.",
      });
    if (new Set(w.map(x => x.id)).size !== w.length)
      ctx.addIssue({
        code: "custom",
        message: "Identificadores de pontos repetidos.",
      });
    if (
      w[0].coordenada.lat === w.at(-1)!.coordenada.lat &&
      w[0].coordenada.lng === w.at(-1)!.coordenada.lng
    )
      ctx.addIssue({
        code: "custom",
        message: "Escolha origem e destino diferentes.",
      });
    for (let i = 1; i < w.length; i++)
      if (
        w[i].coordenada.lat === w[i - 1].coordenada.lat &&
        w[i].coordenada.lng === w[i - 1].coordenada.lng
      )
        ctx.addIssue({
          code: "custom",
          message: "Dois pontos consecutivos estão na mesma posição.",
        });
  });
export type PedidoRoteirizacao = z.input<typeof pedidoSchema>;
export const pernaSchema = z.object({
  distanciaKm: z.number().nonnegative(),
  duracaoMin: z.number().nonnegative(),
  velocidadeMediaKmh: z.number().nonnegative(),
  vertices: z.array(coordenadaSchema).min(2),
});
export type PernaRoteirizada = z.infer<typeof pernaSchema>;
export const respostaSchema = z.object({
  geometria: z.object({
    tipo: z.literal("linha"),
    corredorM: z.number().positive(),
    vertices: z.array(coordenadaSchema).min(2).max(200000),
  }),
  pernas: z.array(pernaSchema).min(1),
  distanciaKm: z.number().nonnegative(),
  duracaoMin: z.number().nonnegative(),
  provedor: z.string(),
  calculadoEm: z.string().datetime(),
  modo: z.literal("real"),
  avisos: z.array(z.string()),
});
export type RespostaRoteirizacao = z.infer<typeof respostaSchema>;
export const enderecoSchema = z.object({
  nome: z.string(),
  coordenada: coordenadaSchema,
});
export type EnderecoRoteiro = z.infer<typeof enderecoSchema>;
