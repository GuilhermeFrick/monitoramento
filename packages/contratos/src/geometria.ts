import { z } from "zod";

/**
 * Geometria no transporte.
 *
 * A união é fechada nas quatro formas que a geocerca nativa do MDVR aceita. Ela
 * é fechada aqui, no contrato, e não só na tela: é o contrato que impede um
 * cliente novo — app do motorista, integração de terceiro — de mandar um
 * multipolígono que o equipamento não saberia embarcar.
 */

export const coordenadaSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type CoordenadaTransporte = z.infer<typeof coordenadaSchema>;

/** ⚠️ Não confirmado com o fabricante. Trocar aqui quando o número real aparecer. */
export const MAX_VERTICES_POLIGONO = 24;
export const MAX_VERTICES_LINHA = 200;

export const geometriaSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("circulo"),
    centro: coordenadaSchema,
    raio_m: z.number().int().min(25, "raio abaixo de 25 m: o equipamento não distingue a entrada"),
  }),
  z.object({
    tipo: z.literal("poligono"),
    vertices: z.array(coordenadaSchema).min(3, "polígono precisa de ao menos 3 vértices"),
  }),
  z.object({
    tipo: z.literal("retangulo"),
    sudoeste: coordenadaSchema,
    nordeste: coordenadaSchema,
  }),
  z.object({
    tipo: z.literal("linha"),
    vertices: z.array(coordenadaSchema).min(2, "a linha precisa de ao menos 2 pontos"),
    corredor_m: z.number().int().min(25),
  }),
]);

export type GeometriaTransporte = z.infer<typeof geometriaSchema>;
export type TipoGeometria = GeometriaTransporte["tipo"];
