/**
 * Fumaça do Perfil operacional — roda com `tsx smoke-perfil.tsx`.
 *
 * Existe porque type-check e build não pegam o que quebrou a tela em uso: um
 * objeto salvo no localStorage com a forma antiga, entregue a um código que já
 * espera outra. Aqui a página é realmente renderizada, em cada estado que ela
 * pode assumir, incluindo o do dado velho.
 */
import React, { createElement } from "react";
import { renderToString } from "react-dom/server";

(globalThis as any).React = React;
(globalThis as any).window = { localStorage: undefined, setTimeout, clearTimeout };

const { ProfileWorkspace, useConfiguracoes } = await import("./client/src/pages/risk/views/perfil/ProfileWorkspace");
const { ProfileInspector } = await import("./client/src/pages/risk/views/perfil/ProfileInspector");
const { VehicleNavigator } = await import("./client/src/pages/risk/views/perfil/VehicleNavigator");
const { configuracoesIniciais } = await import("./client/src/pages/risk/domain");
type Config = (typeof configuracoesIniciais)[number];

let ok = true;
const falhar = (msg: string) => { console.log("  FALHA:", msg); ok = false; };

function render(configs: Config[], rotulo: string, esperaNos = true) {
  try {
    const html = renderToString(createElement(ProfileWorkspace as any, {
      configs, setConfigs: () => {}, busca: "", onBusca: () => {}, onLimparBusca: () => {}, onToast: () => {}, VehicleNavigator,
    }));
    const marcadores = ["Revisar e embarcar", "wsp-corpo", "wsp-nav", "wsp-canvas", ...(esperaNos ? ["wsp-no"] : [])];
    const faltando = marcadores.filter((m) => !html.includes(m));
    if (faltando.length) return falhar(`[${rotulo}] não renderizou ${faltando.join(", ")}`);
    console.log(`  ok [${rotulo}] ${html.length} chars`);
  } catch (e) {
    falhar(`[${rotulo}] ${(e as Error).message}`);
  }
}

render(configuracoesIniciais, "dados iniciais");
render([configuracoesIniciais[2]], "veículo em rascunho");
render([configuracoesIniciais[3]], "veículo com embarque parcial");
render([configuracoesIniciais[4]], "veículo nunca embarcado");
render([{ ...configuracoesIniciais[0], transicoes: [] }], "grafo sem transições");
render([{ ...configuracoesIniciais[0], macros: [], transicoes: [], macroVigente: null }], "sem macros", false);

// O inspetor abre sob demanda, entao nao aparece no render inicial do workspace.
// Testado isolado com cada tipo de seleção.
function renderInspetor(selecao: any, rotulo: string, marcadores: string[], config: Config = configuracoesIniciais[0]) {
  try {
    const html = renderToString(createElement(ProfileInspector as any, {
      config, selecao, aba: "estado", validacoes: [],
      onAba: () => {}, onFechar: () => {}, onPatchPerfil: () => {},
      onRemoverMacro: () => {}, onRemoverTransicao: () => {},
    }));
    const faltando = marcadores.filter((m) => !html.includes(m));
    if (faltando.length) return falhar(`[inspetor ${rotulo}] não renderizou ${faltando.join(", ")}`);
    console.log(`  ok [inspetor ${rotulo}] ${html.length} chars`);
  } catch (e) {
    falhar(`[inspetor ${rotulo}] ${(e as Error).message}`);
  }
}

const macro = configuracoesIniciais[0].macros[0];
renderInspetor({ tipo: "macro", id: macro.id }, "macro", ["Perfil ativado", "wsp-inspetor"]);
const macroJornada = { ...macro, id: "MC-FIM-JORNADA", nome: "Fim de jornada", categoria: "jornada" as const };
const configJornada = { ...configuracoesIniciais[0], macros: [...configuracoesIniciais[0].macros, macroJornada] };
renderInspetor({ tipo: "macro", id: macroJornada.id }, "macro de jornada", ["Controle de jornada", "permanecem inalterados"], configJornada);
const macroInformativa = { ...macro, id: "MC-INFO", nome: "Trânsito lento", categoria: "informativa" as const };
const configInformativa = { ...configuracoesIniciais[0], macros: [...configuracoesIniciais[0].macros, macroInformativa] };
renderInspetor({ tipo: "macro", id: macroInformativa.id }, "macro informativa", ["Registro informativo", "não aciona sensores"], configInformativa);
renderInspetor({ tipo: "padrao" }, "perfil padrão", ["wsp-inspetor"]);
renderInspetor({ tipo: "transicao", de: configuracoesIniciais[0].transicoes[0].de, para: configuracoesIniciais[0].transicoes[0].para }, "transição", ["Remover transição"]);

// O caso que quebrou em uso: localStorage com a forma ANTIGA da configuração.
// `useStoredState` tem de descartar e cair no inicial, em vez de devolver um
// objeto sem os campos que o código de hoje lê.
const antigo = configuracoesIniciais.map((c) => {
  const { mudancas, versaoEmbarcada, sincronizadoEm, ultimoEmbarque, ...resto } = c as any;
  return { ...resto, atualizadoEm: "2026-09-01T09:20:00", embarcadoEm: "2026-09-02T08:10:00" };
});
const store: Record<string, string> = { "avansat-risk:v5:configuracoes-veiculo": JSON.stringify(antigo) };
(globalThis as any).window.localStorage = { getItem: (k: string) => store[k] ?? null, setItem: () => {} };

function Sonda() {
  const [configs] = useConfiguracoes();
  const primeiro = configs[0] as any;
  if (!Array.isArray(primeiro?.mudancas)) throw new Error("useStoredState devolveu a forma antiga (sem `mudancas`)");
  return createElement("i", null, "forma válida");
}

try {
  renderToString(createElement(Sonda));
  console.log("  ok [localStorage na forma antiga] descartado, caiu no inicial");
} catch (e) {
  falhar(`[localStorage na forma antiga] ${(e as Error).message}`);
}

console.log(ok ? "\nOK — renderiza em todos os estados" : "\nfalhou");
process.exit(ok ? 0 : 1);
