import type { CercaTransporte } from "@avansat/contratos";

/**
 * Semente por cliente.
 *
 * Coordenadas reais de propósito: um falso com lugar errado engana a demo e
 * esconde erro de projeção. O segundo cliente existe para o escopo ser
 * exercitável — sem ele ninguém percebe que o filtro por cliente não funciona.
 */
export function cercasSemente(cliente: string): CercaTransporte[] {
  const carimbo = "2026-09-01T09:00:00.000Z";
  if (cliente !== "avansat-demo") {
    return [{
      id: "CE-OUTRO-01", nome: "Pátio do outro cliente", descricao: null, categoria: "restrita",
      politica: { permanencia_max_min: 0, limite_kmh: null, janela: "24h" },
      ativa: true, local: "Curitiba · PR", versao: 1,
      geometria: { tipo: "circulo", centro: { lat: -25.4284, lng: -49.2733 }, raio_m: 300 },
      veiculos: [], vigencia_inicio: "2026-09-01", vigencia_fim: null,
      criado_em: carimbo, atualizado_em: carimbo,
    }];
  }
  return [
    {
      id: "CE-01", nome: "Anel Rodoviário · faixa 2", descricao: "Corredor com limite reduzido.", categoria: "velocidade",
      politica: { permanencia_max_min: null, limite_kmh: 80, janela: "24h" },
      ativa: true, local: "Belo Horizonte · MG", versao: 2,
      geometria: { tipo: "linha", corredor_m: 300, vertices: [
        { lat: -19.9538, lng: -43.9948 }, { lat: -19.932, lng: -44.0102 }, { lat: -19.9006, lng: -43.9884 },
        { lat: -19.8712, lng: -43.943 }, { lat: -19.8564, lng: -43.9042 }] },
      veiculos: ["VTR-1783"], vigencia_inicio: "2026-09-01", vigencia_fim: null,
      criado_em: carimbo, atualizado_em: carimbo,
    },
    {
      id: "CE-02", nome: "Área restrita · Pátio Itaguaí", descricao: null, categoria: "restrita",
      politica: { permanencia_max_min: 0, limite_kmh: null, janela: "24h" },
      ativa: true, local: "Itaguaí · RJ", versao: 3,
      geometria: { tipo: "poligono", vertices: [
        { lat: -22.9288, lng: -43.8352 }, { lat: -22.9236, lng: -43.8218 }, { lat: -22.9324, lng: -43.8126 },
        { lat: -22.9402, lng: -43.8232 }, { lat: -22.9376, lng: -43.8344 }] },
      veiculos: ["VTR-2048", "VTR-0931"], vigencia_inicio: "2026-09-02", vigencia_fim: null,
      criado_em: carimbo, atualizado_em: carimbo,
    },
    {
      id: "CE-03", nome: "Base Campinas · portaria noturna", descricao: "Fora da vigência: serve para testar o estado vencido.", categoria: "horario",
      politica: { permanencia_max_min: null, limite_kmh: null, janela: "22:00–05:00" },
      ativa: false, local: "Campinas · SP", versao: 1,
      geometria: { tipo: "circulo", centro: { lat: -22.906, lng: -47.0606 }, raio_m: 420 },
      veiculos: [], vigencia_inicio: "2026-08-20", vigencia_fim: "2026-09-05",
      criado_em: carimbo, atualizado_em: carimbo,
    },
    {
      id: "CE-04", nome: "Perímetro urbano Rio · centro", descricao: null, categoria: "operacional",
      politica: { permanencia_max_min: 40, limite_kmh: 50, janela: "06:00–22:00" },
      ativa: true, local: "Rio de Janeiro · RJ", versao: 6,
      geometria: { tipo: "retangulo", sudoeste: { lat: -22.9184, lng: -43.1908 }, nordeste: { lat: -22.8942, lng: -43.162 } },
      veiculos: ["VTR-2048", "VTR-3110"], vigencia_inicio: "2026-09-01", vigencia_fim: null,
      criado_em: carimbo, atualizado_em: carimbo,
    },
  ];
}
