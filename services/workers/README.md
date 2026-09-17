# services/workers — trabalho assíncrono

O que não pode acontecer dentro de uma requisição: emitir embarque e aguardar o
aceite item a item do equipamento, gerar relatório de jornada, transcodificar
evidência, reprocessar telemetria atrasada.

Separado do `api` porque trabalho longo em processo de requisição transforma
timeout de cliente em trabalho perdido pela metade.
