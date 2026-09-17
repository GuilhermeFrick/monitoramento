/**
 * A API real.
 *
 * Mesmas regras de escopo e os mesmos códigos de erro do backend falso — é o
 * que torna o falso útil: a tela que trata o erro do falso trata o do real.
 */
import { createServer } from "node:http";
import { criarRoteador, responder } from "./infra/http";
import { encerrar } from "./infra/postgres";
import { rotasDispositivos } from "./dominios/dispositivos";

const PORTA = Number(process.env.PORTA_API ?? 4001);

const roteador = criarRoteador([...rotasDispositivos]);

const servidor = createServer((req, res) => {
  // Fora do roteador porque não exige credencial: é o healthcheck do contêiner,
  // e healthcheck que precisa de token não serve para orquestrador nenhum.
  if (req.url === "/saude") {
    responder(res, 200, { ok: true });
    return;
  }
  void roteador(req, res);
});

servidor.listen(PORTA, () => {
  console.log(`api ouvindo em http://localhost:${PORTA}`);
});

for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinal, () => {
    servidor.close(() => void encerrar().then(() => process.exit(0)));
  });
}
