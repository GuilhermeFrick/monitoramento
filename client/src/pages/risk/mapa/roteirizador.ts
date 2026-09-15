import { z } from "zod";
import {
  enderecoSchema,
  pedidoSchema,
  respostaSchema,
  type PedidoRoteirizacao,
  type RespostaRoteirizacao,
} from "@shared/roteirizacao";
export type {
  PedidoRoteirizacao,
  RespostaRoteirizacao,
  PernaRoteirizada,
} from "@shared/roteirizacao";

async function consultar(
  path: string,
  body: unknown,
  signal?: AbortSignal
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`/api/routing/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new Error(
      "Sem conexão com o servidor. Sua última rota foi preservada."
    );
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = z.object({ message: z.string() }).safeParse(data);
    throw new Error(
      error.success
        ? error.data.message
        : "Não foi possível concluir a consulta. Tente novamente."
    );
  }
  return data;
}
export async function roteirizar(
  pedido: PedidoRoteirizacao,
  signal?: AbortSignal
): Promise<RespostaRoteirizacao> {
  const validado = pedidoSchema.safeParse(pedido);
  if (!validado.success)
    throw new Error(
      validado.error.issues[0]?.message ?? "Revise o itinerário."
    );
  const parsed = respostaSchema.safeParse(
    await consultar("calculate", validado.data, signal)
  );
  if (
    !parsed.success ||
    parsed.data.pernas.length !==
      pedido.waypoints.filter(w => w.tipo === "parada").length - 1
  )
    throw new Error(
      "O servidor retornou uma rota incompleta. Recalcule antes de aplicar."
    );
  return parsed.data;
}
export async function buscarEnderecos(texto: string, signal?: AbortSignal) {
  return z
    .array(enderecoSchema)
    .parse(await consultar("search", { texto }, signal));
}

/** Invalidação imediata também protege contra transportes que ignoram o abort. */
export class UltimaConsulta {
  private versao = 0;
  private controller?: AbortController;
  cancelar() {
    this.versao++;
    this.controller?.abort();
  }
  async executar<T>(
    fn: (signal: AbortSignal) => Promise<T>,
    sucesso: (r: T) => void,
    erro: (e: unknown) => void,
    fim: () => void
  ) {
    this.cancelar();
    const versao = this.versao;
    const controller = new AbortController();
    this.controller = controller;
    try {
      const result = await fn(controller.signal);
      if (versao === this.versao) sucesso(result);
    } catch (e) {
      if (versao === this.versao && !controller.signal.aborted) erro(e);
    } finally {
      if (versao === this.versao) fim();
    }
  }
}
