/**
 * As regras de arquitetura, como teste.
 *
 * Regra escrita em documento é intenção; o que segura a estrutura é algo que
 * quebra o build. Este arquivo varre os imports do front e reprova quem cruzar
 * uma fronteira que não deveria.
 *
 * As quatro fronteiras:
 *
 *   infra/     → utilidades sem negócio (HTTP, formatação, hooks genéricos)
 *   ui/        → componentes genéricos, sem negócio
 *   dominios/  → uma pasta por domínio, com tudo daquele domínio dentro
 *   app/       → a casca: roteador, shell, providers
 *
 * A dependência é de mão única: `app` pode tudo, `dominios` pode `infra` e
 * `ui`, e esses dois não podem nada. Um domínio **nunca** importa outro. Quando
 * duas telas precisam do mesmo dado, quem cruza é a casca, passando por props —
 * não existe "só desta vez".
 *
 * Como decidir se algo é domínio ou infraestrutura: se o nome só faz sentido
 * para quem conhece o negócio, é domínio. `formatarDistancia` é infra;
 * `vigenteEm` é domínio.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = resolve(import.meta.dirname, "..", "client", "src");

type Arquivo = { caminho: string; relativo: string; imports: string[] };

function varrer(dir: string, achados: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const completo = join(dir, entrada);
    if (statSync(completo).isDirectory()) {
      if (entrada === "node_modules" || entrada === "ui") continue; // `ui/` são os componentes do shadcn, terceiros
      varrer(completo, achados);
    } else if (/\.(ts|tsx)$/.test(entrada)) {
      achados.push(completo);
    }
  }
  return achados;
}

/** Só `import`/`export ... from` e `import(...)`. Não tenta ser um parser. */
function importsDe(fonte: string): string[] {
  const achados: string[] = [];
  const padrao = /(?:^|\n)\s*(?:import|export)\b[^;'"]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const m of fonte.matchAll(padrao)) achados.push(m[1] ?? m[2]);
  return achados;
}

const arquivos: Arquivo[] = varrer(RAIZ).map((caminho) => ({
  caminho,
  relativo: relative(RAIZ, caminho).replaceAll("\\", "/"),
  imports: importsDe(readFileSync(caminho, "utf8")),
}));

/** Resolve o alvo do import para um caminho relativo a `client/src`, ou null se for pacote externo. */
function alvoInterno(arquivo: Arquivo, especificador: string): string | null {
  if (especificador.startsWith("@/")) return especificador.slice(2);
  if (especificador.startsWith(".")) {
    const absoluto = resolve(join(arquivo.caminho, ".."), especificador);
    const rel = relative(RAIZ, absoluto).replaceAll("\\", "/");
    return rel.startsWith("..") ? null : rel;
  }
  return null;
}

const camadaDe = (rel: string): "infra" | "ui-generico" | "dominio" | "app" | "legado" =>
  rel.startsWith("infra/") ? "infra"
  : rel.startsWith("componentes/") ? "ui-generico"
  : rel.startsWith("dominios/") ? "dominio"
  : rel.startsWith("app/") ? "app"
  : "legado";

const dominioDe = (rel: string): string | null =>
  rel.startsWith("dominios/") ? rel.split("/")[1] ?? null : null;

function violacoes(regra: (a: Arquivo, alvo: string) => string | null): string[] {
  const achados: string[] = [];
  for (const arquivo of arquivos) {
    for (const especificador of arquivo.imports) {
      const alvo = alvoInterno(arquivo, especificador);
      if (!alvo) continue;
      const problema = regra(arquivo, alvo);
      if (problema) achados.push(`${arquivo.relativo} → ${especificador}: ${problema}`);
    }
  }
  return achados;
}

describe("arquitetura por domínios", () => {
  it("infraestrutura não conhece domínio", () => {
    expect(violacoes((a, alvo) =>
      camadaDe(a.relativo) === "infra" && (camadaDe(alvo) === "dominio" || camadaDe(alvo) === "app")
        ? "infra não pode conhecer domínio nem a casca; mova o que é de negócio para o domínio"
        : null)).toEqual([]);
  });

  it("componente genérico não conhece domínio", () => {
    expect(violacoes((a, alvo) =>
      camadaDe(a.relativo) === "ui-generico" && (camadaDe(alvo) === "dominio" || camadaDe(alvo) === "app")
        ? "componente genérico não pode conhecer domínio; receba por props"
        : null)).toEqual([]);
  });

  it("um domínio não importa outro domínio", () => {
    expect(violacoes((a, alvo) => {
      const meu = dominioDe(a.relativo);
      const dele = dominioDe(alvo);
      return meu && dele && meu !== dele
        ? `${meu} não pode importar ${dele}; quem cruza domínios é a casca, passando por props`
        : null;
    })).toEqual([]);
  });

  it("domínio não importa a casca da aplicação", () => {
    expect(violacoes((a, alvo) =>
      camadaDe(a.relativo) === "dominio" && camadaDe(alvo) === "app"
        ? "domínio não pode depender da casca; inverta passando por props"
        : null)).toEqual([]);
  });

  it("de fora, um domínio só se acessa pela porta (index)", () => {
    expect(violacoes((a, alvo) => {
      const dele = dominioDe(alvo);
      if (!dele || dominioDe(a.relativo) === dele) return null;
      const interno = alvo.replace(`dominios/${dele}`, "").replace(/^\//, "");
      return interno && interno !== "index" && interno !== "index.ts"
        ? `importe de "dominios/${dele}" e exporte o que falta no index; arquivo interno é detalhe do domínio`
        : null;
    })).toEqual([]);
  });

  it("relata o que já está organizado, para a migração ter medida", () => {
    const contagem = arquivos.reduce<Record<string, number>>((acc, a) => {
      const camada = camadaDe(a.relativo);
      acc[camada] = (acc[camada] ?? 0) + 1;
      return acc;
    }, {});
    const dominios = [...new Set(arquivos.map((a) => dominioDe(a.relativo)).filter(Boolean))];
    console.log(`  arquivos por camada: ${JSON.stringify(contagem)}`);
    console.log(`  domínios em fatia vertical: ${dominios.join(", ") || "(nenhum)"}`);
    expect(arquivos.length).toBeGreaterThan(0);
  });
});
