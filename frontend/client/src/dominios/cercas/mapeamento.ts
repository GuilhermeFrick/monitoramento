/**
 * A fronteira entre o fio e o domínio — o único lugar onde os dois formatos se
 * encontram.
 *
 * Duas regras que este arquivo existe para garantir:
 *
 *  1. **Data inválida vira nulo, nunca `Invalid Date`.** Um `Invalid Date` não
 *     explode: ele se propaga em silêncio, formata como "Invalid Date" no meio
 *     da tela e faz comparação retornar falso para tudo.
 *
 *  2. **Campo ausente vira o vazio do tipo, nunca `undefined`.** Texto some
 *     vira string vazia, lista some vira lista vazia. `undefined` viajando pela
 *     tela produz o erro clássico de ler propriedade de indefinido, três
 *     componentes abaixo de onde o dado entrou.
 */
import type { CercaTransporte, CriarCercaTransporte, GeometriaTransporte } from "@avansat/contratos";
import type { Cerca, Geometria, RascunhoCerca } from "./tipos";

/** Texto ISO vira Date, e só se for uma data de verdade. */
function paraData(texto: string | null): Date | null {
  if (!texto) return null;
  const data = new Date(texto);
  return Number.isNaN(data.getTime()) ? null : data;
}

/** Date vira AAAA-MM-DD no fuso local, que é como o operador enxerga a vigência. */
function paraDataDoFio(data: Date | null): string | null {
  if (!data || Number.isNaN(data.getTime())) return null;
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${data.getFullYear()}-${mes}-${dia}`;
}

export function geometriaDoFio(g: GeometriaTransporte): Geometria {
  switch (g.tipo) {
    case "circulo": return { tipo: "circulo", centro: g.centro, raioM: g.raio_m };
    case "poligono": return { tipo: "poligono", vertices: g.vertices };
    case "retangulo": return { tipo: "retangulo", sudoeste: g.sudoeste, nordeste: g.nordeste };
    case "linha": return { tipo: "linha", vertices: g.vertices, corredorM: g.corredor_m };
  }
}

export function geometriaParaOFio(g: Geometria): GeometriaTransporte {
  switch (g.tipo) {
    case "circulo": return { tipo: "circulo", centro: g.centro, raio_m: Math.round(g.raioM) };
    case "poligono": return { tipo: "poligono", vertices: g.vertices };
    case "retangulo": return { tipo: "retangulo", sudoeste: g.sudoeste, nordeste: g.nordeste };
    case "linha": return { tipo: "linha", vertices: g.vertices, corredor_m: Math.round(g.corredorM) };
  }
}

export function cercaDoFio(t: CercaTransporte): Cerca {
  return {
    id: t.id,
    nome: t.nome,
    descricao: t.descricao ?? "",
    categoria: t.categoria,
    politica: {
      permanenciaMaxMin: t.politica.permanencia_max_min,
      limiteKmh: t.politica.limite_kmh,
      janela: t.politica.janela,
    },
    ativa: t.ativa,
    local: t.local,
    versao: t.versao,
    geometria: geometriaDoFio(t.geometria),
    veiculos: t.veiculos ?? [],
    vigenciaInicio: paraData(t.vigencia_inicio),
    vigenciaFim: paraData(t.vigencia_fim),
    // Criado e atualizado sempre existem no contrato; se vierem quebrados, o
    // epoch é melhor que `Invalid Date` — ordena de forma previsível.
    criadoEm: paraData(t.criado_em) ?? new Date(0),
    atualizadoEm: paraData(t.atualizado_em) ?? new Date(0),
  };
}

export function rascunhoParaOFio(r: RascunhoCerca): CriarCercaTransporte {
  return {
    nome: r.nome,
    descricao: r.descricao.trim() === "" ? null : r.descricao,
    categoria: r.categoria,
    politica: {
      permanencia_max_min: r.politica.permanenciaMaxMin,
      limite_kmh: r.politica.limiteKmh,
      janela: r.politica.janela,
    },
    ativa: r.ativa,
    local: r.local,
    geometria: geometriaParaOFio(r.geometria),
    veiculos: r.veiculos,
    vigencia_inicio: paraDataDoFio(r.vigenciaInicio),
    vigencia_fim: paraDataDoFio(r.vigenciaFim),
  };
}
