/**
 * Perfil operacional — workspace de edição em altura de viewport.
 *
 * A tela junta três tarefas que só fazem sentido em conjunto: escolher o
 * veículo, entender/editar a sequência de macros e configurar o perfil da macro
 * selecionada. Por isso são três painéis simultâneos, e não um fluxo vertical:
 * num fluxo vertical o operador clica no grafo, rola até o editor e perde de
 * vista o nó que está editando.
 */
export { ProfileWorkspace as ProfilesView, useConfiguracoes } from "./perfil/ProfileWorkspace";
