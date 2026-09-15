import type { Express } from "express";
import { z } from "zod";
import { pedidoSchema } from "../../shared/roteirizacao";
import { buscarEndereco, calcularRota, ErroRoteirizacao } from "./service";

export function registerRoutingRoutes(app: Express) {
  // Limite global por processo: protege a credencial também na instalação local sem login.
  let janela = Date.now(),
    consultas = 0,
    ativas = 0;
  app.get("/api/routing/status", (_req, res) =>
    res.json({ configurado: !!process.env.OPENROUTESERVICE_API_KEY?.trim() })
  );
  app.post(
    ["/api/routing/calculate", "/api/routing/search"],
    async (req, res) => {
      if (Date.now() - janela >= 60000) {
        janela = Date.now();
        consultas = 0;
      }
      if (++consultas > 30 || ativas >= 4) {
        res
          .status(429)
          .json({
            codigo: "LIMITE",
            message: "Muitas consultas. Aguarde um minuto e tente novamente.",
          });
        return;
      }
      const controller = new AbortController();
      const abortar = () => {
        if (!res.writableEnded) controller.abort();
      };
      res.on("close", abortar);
      ativas++;
      try {
        const result = req.path.endsWith("/search")
          ? await buscarEndereco(
              z
                .object({ texto: z.string().trim().min(3).max(200) })
                .parse(req.body).texto,
              controller.signal
            )
          : await calcularRota(pedidoSchema.parse(req.body), controller.signal);
        if (!res.destroyed) res.json(result);
      } catch (e) {
        if (res.destroyed) return;
        if (e instanceof z.ZodError)
          res
            .status(400)
            .json({
              codigo: "PEDIDO_INVALIDO",
              message:
                e.issues[0]?.message ??
                "Revise os pontos e o perfil do veículo.",
            });
        else if (e instanceof ErroRoteirizacao)
          res.status(e.status).json({ codigo: e.codigo, message: e.message });
        else
          res
            .status(500)
            .json({
              codigo: "INTERNO",
              message: "Não foi possível concluir a consulta.",
            });
      } finally {
        ativas--;
        res.off("close", abortar);
      }
    }
  );
}
