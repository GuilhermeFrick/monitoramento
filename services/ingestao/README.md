# services/ingestao — telemetria

Processo separado desde já, e este é o único que se justifica separar agora.

Telemetria tem natureza oposta ao cadastro: chega em rajada, escreve em lote, e
uma perda de alguns segundos é aceitável enquanto um embarque meio aplicado não
é. Misturar os dois no mesmo processo faz o pico de posição derrubar a tela de
configuração.

Escreve em ClickHouse. Posição, evento de sensor e leitura de canal.
