/**
 * Fumaça dos workspaces de pontos, rotogramas, cercas e rotas.
 *
 * O ponto sensível destes testes é o mapa: bibliotecas de mapa tocam `window` e
 * `document` ao carregar o módulo, e esta suíte renderiza no servidor. Se algum
 * dia alguém importar o Leaflet estaticamente, é aqui que quebra — de propósito.
 */
import React, { createElement } from "react";
import { renderToString } from "react-dom/server";
(globalThis as any).React = React;
(globalThis as any).window = { localStorage: undefined, setTimeout, clearTimeout };

const { ControlPointsView } = await import("./client/src/pages/risk/views/ControlPointsView");
const { FencesView } = await import("./client/src/pages/risk/views/FencesView");
const { RoutesView } = await import("./client/src/pages/risk/views/RoutesView");
const { VehicleNavigator } = await import("./client/src/pages/risk/views/perfil/VehicleNavigator");
const d = await import("./client/src/pages/risk/domain");
const g = await import("./client/src/pages/risk/mapa/geometria");
const imp = await import("./client/src/pages/risk/mapa/importarTracado");
const { TracadoDialog } = await import("./client/src/pages/risk/views/TracadoDialog");

let ok = true;
const falhar = (mensagem: string) => { console.log("  FALHA:", mensagem); ok = false; };
const props = {
  configs: d.configuracoesIniciais, veiculo: { atual: "VTR-2048", selecionar: () => {} },
  busca: "", onBusca: () => {}, onLimparBusca: () => {}, onToast: () => {}, VehicleNavigator,
};

function render(rotulo: string, elemento: React.ReactElement, marcadores: string[]) {
  try {
    const html = renderToString(elemento);
    const faltando = marcadores.filter((m) => !html.includes(m));
    if (faltando.length) return falhar(`[${rotulo}] não renderizou ${faltando.join(", ")}`);
    console.log(`  ok [${rotulo}] ${html.length} chars`);
    return html;
  } catch (erro) { falhar(`[${rotulo}] ${(erro as Error).message}`); }
}

// O servidor precisa entregar o contêiner do mapa com altura reservada — é o que
// evita o pulo de layout quando o Leaflet monta no cliente.
const rotograma = render("rotograma", createElement(ControlPointsView as any, { ...props, pontos: d.pontosIniciais, setPontos: () => {} }),
  ["Pontos de controle e rotograma", "Veículos", "Rotograma", "Visão da viagem", "Sequência do rotograma", "Publicar", "mapa-geo", "mapa-tela", "geo-painel-toggle"]);

render("cercas", createElement(FencesView as any, props),
  ["Cercas eletrônicas", "Veículos", "Vinculadas", "Catálogo", "Configuração da cerca", "Desvincular", "mapa-geo", "Desenhar", "Geometria", "geo-painel-toggle"]);

render("cercas sem vínculo", createElement(FencesView as any, { ...props, veiculo: { atual: "VTR-2240", selecionar: () => {} } }),
  ["Nenhuma cerca vinculada", "Abrir catálogo"]);

render("rotas", createElement(RoutesView as any, { onToast: () => {}, onGoRotograma: () => {}, onRascunho: () => {} }),
  ["Rotas", "Corredores", "mapa-geo", "Rota não é rotograma", "corredor", "Extensão"]);

if (rotograma && /leaflet-container|leaflet-pane/.test(rotograma)) falhar("Leaflet montou no servidor: o import precisa continuar dinâmico dentro do efeito");

// O mapa é a ferramenta destas telas: os painéis de apoio precisam continuar
// recolhíveis, senão o mapa volta a ser espremido entre três colunas fixas.
if (rotograma && !rotograma.includes("ampliar o mapa")) falhar("o painel de apoio perdeu o botão de recolher");

// A sobreposição declarada no mock tem de ser real no mapa, senão o aviso de
// precedência nunca aparece para o operador.
const pares = g.paresSobrepostos(d.pontosIniciais.filter((p) => p.ativo));
if (!pares.length) falhar("nenhuma sobreposição detectada entre os pontos iniciais");
else if (!pares.some(({ a, b }) => (a.id === "PC-001" && b.id === "PC-006") || (a.id === "PC-006" && b.id === "PC-001"))) falhar("PC-001 e PC-006 deveriam se sobrepor");
else if (pares.every((p) => p.regiao.length < 3)) falhar("a região comum saiu vazia: não haveria o que desenhar");
else console.log(`  ok [sobreposição] ${pares.length} par(es), região com ${pares[0].regiao.length} vértices`);

// Só as quatro formas que a geocerca nativa aceita podem existir no catálogo.
const permitidas = new Set(["circulo", "poligono", "retangulo", "linha"]);
const forasteiras = [...d.cercasIniciais.map((c) => c.geometria.tipo), ...d.pontosIniciais.map((p) => p.geometria.tipo), ...d.rotasIniciais.map((r) => r.geometria.tipo)].filter((t) => !permitidas.has(t));
if (forasteiras.length) falhar(`geometria fora do que o equipamento aceita: ${forasteiras.join(", ")}`);
else console.log("  ok [formas] catálogo usa só círculo, polígono, retângulo e linha");

// As coordenadas precisam ser plausíveis: mapa de demonstração com lugar errado
// destrói a credibilidade mais rápido do que a falta de mapa.
const todas = [...d.pontosIniciais.map((p) => p.geometria), ...d.cercasIniciais.map((c) => c.geometria), ...d.rotasIniciais.map((r) => r.geometria)];
const foraDoBrasil = todas.flatMap(g.verticesDe).filter((v) => v.lat > 5 || v.lat < -34 || v.lng > -34 || v.lng < -74);
if (foraDoBrasil.length) falhar(`${foraDoBrasil.length} coordenada(s) fora do Brasil`);
else console.log(`  ok [coordenadas] ${todas.length} geometrias dentro do território`);

render("diálogo de traçado", createElement(TracadoDialog as any, {
  rotas: d.rotasIniciais, pontos: d.pontosIniciais, paradasAtuais: ["PC-003", "PC-001"],
  corredorPadrao: 300, onClose: () => {}, onAplicar: () => {},
}), ["Definir o traçado", "Catálogo", "Importar arquivo", "Roteirizar"]);

// Importar é a parte que não depende de serviço externo, então é testada de
// verdade. GPX e KML precisam de DOMParser, que não existe no Node — aqui fica
// o GeoJSON, que é JSON puro, mais a simplificação, que é onde mora o risco.
try {
  const linha = { type: "Feature", geometry: { type: "LineString", coordinates: Array.from({ length: 900 }, (_, i) => [-47 + i * 0.004, -22.9 + Math.sin(i / 9) * 0.05]) } };
  const r = imp.importarTracado("rota.geojson", JSON.stringify(linha), 300);
  if (r.verticesOriginais !== 900) falhar(`GeoJSON: esperava 900 pontos, veio ${r.verticesOriginais}`);
  else if (r.verticesFinais > imp.MAX_VERTICES_LINHA) falhar(`simplificação não respeitou o teto: ${r.verticesFinais} > ${imp.MAX_VERTICES_LINHA}`);
  else if (r.verticesFinais < 2) falhar("simplificação destruiu o traçado");
  else console.log(`  ok [importar geojson] ${r.verticesOriginais} -> ${r.verticesFinais} vértices, ${r.extensaoKm} km`);
} catch (e) { falhar(`importar geojson: ${(e as Error).message}`); }

try {
  imp.importarTracado("rota.txt", "nada", 300);
  falhar("formato desconhecido deveria ser recusado");
} catch (e) { console.log(`  ok [importar] formato desconhecido recusado: ${(e as Error).message.slice(0, 40)}…`); }

// Ausência de credencial deve ser explícita e nunca gerar caminho de demonstração.
try {
  const { calcularRota } = await import("./server/routing/service");
  const waypoints = ["PC-003", "PC-001"].map(id => ({ id, nome: id, tipo: "parada" as const, coordenada: g.centroDe(d.pontosIniciais.find(p => p.id === id)!.geometria) }));
  await calcularRota({ waypoints, perfil: d.perfilRoteirizacaoPadrao, corredorM: 300 }, undefined, { apiKey: "" });
  falhar("roteirizar sem credencial deveria ser recusado");
} catch (e) {
  if (e instanceof Error && "codigo" in e && e.codigo === "NAO_CONFIGURADO") console.log("  ok [roteirizar] sem credencial não produz rota simulada");
  else falhar(`roteirizar: ${(e as Error).message}`);
}

console.log(ok ? "\nOK — geografia operacional renderiza e respeita as restrições do equipamento" : "\nfalhou");
process.exit(ok ? 0 : 1);
