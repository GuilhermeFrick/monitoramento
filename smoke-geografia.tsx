/** Fumaça dos workspaces de pontos, rotogramas e cercas. */
import React, { createElement } from "react";
import { renderToString } from "react-dom/server";
(globalThis as any).React = React;
(globalThis as any).window = { localStorage: undefined, setTimeout, clearTimeout };

const { ControlPointsView } = await import("./client/src/pages/risk/views/ControlPointsView");
const { FencesView } = await import("./client/src/pages/risk/views/FencesView");
const { VehicleNavigator } = await import("./client/src/pages/risk/views/perfil/VehicleNavigator");
const d = await import("./client/src/pages/risk/domain");

let ok = true;
const falhar = (mensagem: string) => { console.log("  FALHA:", mensagem); ok = false; };
const props = {
  configs: d.configuracoesIniciais, veiculo: { atual: "VTR-2048", selecionar: () => {} },
  busca: "", onBusca: () => {}, onLimparBusca: () => {}, onToast: () => {}, VehicleNavigator,
};

try {
  const html = renderToString(createElement(ControlPointsView as any, { ...props, pontos: d.pontosIniciais, setPontos: () => {} }));
  for (const marcador of ["Pontos de controle e rotograma", "Veículos", "Rotograma", "Visão da viagem", "Sequência do rotograma", "Publicar"]) if (!html.includes(marcador)) falhar(`rotograma não renderizou ${marcador}`);
  console.log(`  ok [rotograma] ${html.length} chars`);
} catch (erro) { falhar(`rotograma: ${(erro as Error).message}`); }

try {
  const html = renderToString(createElement(FencesView as any, props));
  for (const marcador of ["Cercas eletrônicas", "Veículos", "Vinculadas", "Catálogo", "Configuração da cerca", "Desvincular"]) if (!html.includes(marcador)) falhar(`cercas não renderizou ${marcador}`);
  console.log(`  ok [cercas] ${html.length} chars`);
} catch (erro) { falhar(`cercas: ${(erro as Error).message}`); }

try {
  const html = renderToString(createElement(FencesView as any, { ...props, veiculo: { atual: "VTR-2240", selecionar: () => {} } }));
  for (const marcador of ["Nenhuma cerca vinculada", "Abrir catálogo"]) if (!html.includes(marcador)) falhar(`estado vazio não renderizou ${marcador}`);
  console.log(`  ok [cercas sem vínculo] ${html.length} chars`);
} catch (erro) { falhar(`cercas sem vínculo: ${(erro as Error).message}`); }

console.log(ok ? "\nOK — geografia operacional renderiza nos estados principais" : "\nfalhou");
process.exit(ok ? 0 : 1);
