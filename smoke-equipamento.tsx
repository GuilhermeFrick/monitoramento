/** Fumaça do módulo Configuração do equipamento. */
import React, { createElement } from "react";
import { renderToString } from "react-dom/server";
(globalThis as any).React = React;
(globalThis as any).window = { localStorage: undefined, setTimeout, clearTimeout };

const { EquipmentConfigView } = await import("./client/src/pages/risk/views/equipamento/EquipmentConfigView");
const { VehicleNavigator } = await import("./client/src/pages/risk/views/perfil/VehicleNavigator");
const d = await import("./client/src/pages/risk/domain");

let ok = true;
const falhar = (m: string) => { console.log("  FALHA:", m); ok = false; };

function render(configs: any[], rotulo: string, marcadores: string[]) {
  try {
    const html = renderToString(createElement(EquipmentConfigView as any, {
      configs, setConfigs: () => {}, veiculo: { atual: configs[0].veiculo, selecionar: () => {} },
      busca: "", onBusca: () => {}, onLimparBusca: () => {}, onToast: () => {}, VehicleNavigator,
    }));
    const faltando = marcadores.filter((m) => !html.includes(m));
    if (faltando.length) return falhar(`[${rotulo}] não renderizou ${faltando.join(", ")}`);
    console.log(`  ok [${rotulo}] ${html.length} chars`);
  } catch (e) { falhar(`[${rotulo}] ${(e as Error).message}`); }
}

const m8 = d.configuracoesIniciais.find((c) => d.equipamentoDe(c.veiculo).linha !== "MDVR-4")!;
const m4 = d.configuracoesIniciais.find((c) => d.equipamentoDe(c.veiculo).linha === "MDVR-4")!;

render([m8], "modelo com expansor", ["Configuração do equipamento", "eq-tabela", "Botão de pânico", "IN1", "Entradas · 8 + 4", "ESTADO ATIVO", "DEBOUNCE", "High", "Low"]);
render([m4], "modelo sem expansor", ["Entradas · 8", "Saídas · 2", "IN1"]);
render([{ ...m8, mudancas: [{ id: "MD-TESTE", descricao: "IN1 alterada", em: new Date().toISOString(), por: "Teste" }] }], "configuração alterada", ["Enviar configuração", "Rascunho"]);

const mapaM8 = d.normalizarMapaIO(m8.veiculo, m8.mapaIO);
if (mapaM8.entradas.filter((e: any) => e.fonte === "nativo").length !== 8 || mapaM8.saidas.filter((s: any) => s.fonte === "nativo").length !== 2) falhar("o MDVR deve ter exatamente 8 entradas e 2 saídas nativas");
else console.log("  ok [capacidade] 8 entradas e 2 saídas nativas");
if (mapaM8.entradas.filter((e: any) => e.fonte === "expansor485").length !== 4 || mapaM8.saidas.filter((s: any) => s.fonte === "expansor485").length !== 4) falhar("o expansor deve manter 4 entradas e 4 saídas configuráveis");
else console.log("  ok [expansor] 4 entradas e 4 saídas preservadas");
if (!mapaM8.seriais.some((s: any) => s.porta === "RS232-1" && s.funcao === "satelite") || !mapaM8.seriais.some((s: any) => s.porta === "RS232-2" && s.funcao === "lorawan")) falhar("as duas RS232 devem ter seus terminais dedicados");
else console.log("  ok [RS232] satélite e LoRaWAN em portas dedicadas");
if (!mapaM8.redesCAN.some((r: any) => r.rede === "CAN1" && r.protocolo === "j1939")) falhar("a CAN1 deve nascer com protocolo configurável");
else console.log("  ok [CAN] CAN1 normalizada com J1939");

// --- validação cruzada: o perfil não pode usar função que o veículo não tem ---
const semQuintaRoda = { ...m8, mapaIO: { ...m8.mapaIO, saidas: m8.mapaIO.saidas.map((s: any) => s.funcao === "trava_quinta_roda" ? { ...s, funcao: null, habilitado: false } : s) } };
const erros = d.validarConfiguracao(semQuintaRoda).filter((v: any) => v.nivel === "erro");
if (!erros.some((e: any) => e.codigo === "atuador-sem-canal")) falhar("remover a quinta roda do mapa deveria bloquear o perfil que a usa");
else console.log("  ok [validação] perfil que usa atuador inexistente vira erro bloqueante");

const semPorta = { ...m8, mapaIO: { ...m8.mapaIO, entradas: m8.mapaIO.entradas.map((e: any) => e.funcao === "porta_bau" ? { ...e, funcao: null, habilitado: false } : e) } };
if (!d.validarConfiguracao(semPorta).some((v: any) => v.codigo === "sensor-sem-canal")) falhar("sensor armado sem canal deveria virar erro");
else console.log("  ok [validação] sensor armado sem canal vira erro bloqueante");

const enderecoExpansor = mapaM8.seriais.find((s: any) => s.funcao === "expansor_io")!.endereco;
const duasNoMesmoEndereco = { ...m8, mapaIO: { ...mapaM8, seriais: mapaM8.seriais.map((s: any) => s.funcao === "r_watch" ? { ...s, habilitado: true, endereco: enderecoExpansor } : s) } };
if (!d.validarConfiguracao(duasNoMesmoEndereco).some((v: any) => v.codigo === "serial-em-conflito")) falhar("dois periféricos RS485 no mesmo endereço deveriam conflitar");
else console.log("  ok [validação] endereço RS485 duplicado vira erro");

const estourado = { ...m4, mapaIO: { ...m4.mapaIO, saidas: [...Array(9)].map((_, i) => ({ id: `DO-${i}`, canal: `DO-${i}`, fonte: "nativo", nome: "x", funcao: null, modoPadrao: "temporario", duracaoPadraoSeg: 30, habilitado: true })) } };
if (!d.validarConfiguracao(estourado).some((v: any) => v.codigo === "saidas-acima-capacidade")) falhar("saídas além da capacidade do modelo deveriam bloquear");
else console.log("  ok [validação] canal além da capacidade do modelo vira erro");

// a configuração inicial de todo veículo continua válida
for (const c of d.configuracoesIniciais) {
  const e = d.validarConfiguracao(c).filter((v: any) => v.nivel === "erro");
  if (e.length) falhar(`${c.veiculo} deveria ser válido: ${e.map((x: any) => x.codigo).join(", ")}`);
}
console.log(ok ? "\nOK — módulo renderiza e a validação cruzada tem dente" : "\nfalhou");
process.exit(ok ? 0 : 1);
