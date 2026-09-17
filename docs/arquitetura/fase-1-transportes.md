# Fase 1 — transportes e portas

Levantado sobre os 25 capítulos do N9M 2.0. São fatos do protocolo, não escolha
nossa: onde houver decisão, está marcada como tal.

## Não existe UDP

Varredura dos 25 capítulos por `tcp|udp|http|rtp|rtsp|websocket|ftp`: **nenhuma
ocorrência de UDP**. Tudo o que o aparelho fala assenta em TCP — direto, ou por
HTTP e FTP em cima dele.

Isso simplifica a fase 1 mais do que parece. Não há perda de pacote para tratar,
não há reordenação, não há NAT traversal, não há jitter buffer na ingestão.
Sockets e enquadramento, e só.

O cabeçalho tem campos `SSRC` e `PAYLOAD TYPE`, herdados do vocabulário do RTP,
mas o transporte é TCP. Não confundir um com o outro.

## O que cada canal usa

| Canal | Transporte | Quem inicia | Fase 1 |
|---|---|---|---|
| Sinalização | TCP persistente | aparelho → nós | sim |
| Mídia: preview, playback, captura, intercom, broadcast, black-box | TCP | aparelho → nós | sim |
| Evidência, versão `V2.0` | HTTP | aparelho → nós | sim |
| Evidência, versões `V1.0` e `V1.1` | TCP, pelo canal de mídia | aparelho → nós | sim |
| IA: faces, listas, arquivos | HTTP | aparelho → nós | não |
| Atualização de firmware | FTP ou SFTP | aparelho baixa de nós | não |
| Captura com `SENDMODE: 2` | FTP | aparelho → nós | não |

**Em todos os casos quem abre a conexão é o aparelho.** Isso resolve o problema
de IP dinâmico e de NAT na frota, e significa que não precisamos alcançar o
veículo — precisamos estar alcançáveis. Endereço público estável e portas
abertas para entrada.

## Como o aparelho descobre para onde mandar mídia

Pelo campo `IPANDPORT`, que viaja no comando enviado pela sinalização:

> `IPANDPORT` — "Media address. If there is no such field, then use the ip:port
> set by the service provider, such as 58.60.231.218:5550."
> — capítulo 15, *Real_Time_Video_Request*

Exemplos literais da documentação: `"IPANDPORT": "192.168.161.79:8002"` em
preview e em playback, `"58.250.161.104:15618"` em evidência.

É por aqui que o balanceamento acontece, e é por isso que o endereço tem de sair
de uma função desde o primeiro dia, mesmo havendo um nó só.

O campo é opcional: sem ele o aparelho usa o endereço gravado nos parâmetros
dele. **Vamos sempre enviá-lo**, porque endereço gravado no aparelho é endereço
que só muda com visita técnica.

## Como uma conexão de mídia se liga a uma sessão

O aparelho abre o TCP de mídia e manda `SESSIONID` no comando de criação de
canal. O capítulo 03 é explícito sobre o que acontece se não vier:

> "To create the channel, `SESSIONID` must be sent through the channel. The
> server confirms the channel has been successfully established after receiving
> `SESSIONID`. The link manages to be added to the session, otherwise, the link
> is directly disconnected."

Daí em diante `STREAMNAME` identifica cada canal de mídia — e o mesmo TCP pode
carregar mais de um, distinguidos por esse nome.

Isso define a junção entre os dois serviços: **o nó de mídia recebe um socket
anônimo e descobre de quem é olhando o `SESSIONID` no diretório**. Sem diretório
compartilhado, o nó de mídia não tem como saber para qual cliente relatar — que
é exatamente o motivo de ele existir desde a fase 1, com um nó só.

## Portas

Três entradas nossas na fase 1. Números a fixar no ambiente, não no código.

| Serviço | Porta | Protocolo | Exposição |
|---|---|---|---|
| `gate-n9m` | 7001 | TCP | pública, entrada |
| `gate-midia-n9m` | 7002 | TCP | pública, entrada |
| `gate-evidencia` | 7003 | HTTP | pública, entrada |

E as de dentro, que não saem da rede privada: Postgres 5432, ClickHouse 8123,
Redis 6379, MinIO 9000.

O `gate-evidencia` é HTTP e serve três URLs que o aparelho recebe por comando:
`FILELISTINFOURL`, `FILEINFOURL` e `FILEUPLOADURL`. Ele grava no MinIO e avisa o
resto pelo contrato neutro.

## O que fica de fora da fase 1, e por quê

**FTP e SFTP.** Só aparecem em atualização de firmware e em captura com
`SENDMODE: 2`. Atualização de firmware em lote não é o problema que estamos
resolvendo agora, e captura tem três outros modos de envio que não usam FTP.
Subir um servidor FTP é responsabilidade operacional que não se paga ainda.

**HTTP de IA.** O capítulo 24 descreve reconhecimento facial com um conjunto
próprio de URLs. É produto à parte, não infraestrutura de ingestão.

Nos dois casos a porta de entrada já existe no desenho: são gates adicionais
implementando o mesmo contrato neutro, e entram sem mexer no que estiver pronto.

## O que a fase 1 entrega

1. Aparelho conecta, autentica e mantém sessão.
2. Telemetria, status e alarme sobem e chegam ao ClickHouse.
3. Comando desce — inclusive o de preview, com o endereço de mídia.
4. Preview ao vivo chega ao navegador.
5. Evidência sobe e fica no MinIO.

Playback usa o mesmo canal de mídia que o preview, então sai quase de graça
depois do item 4. Intercom precisa de caminho de áudio nos dois sentidos e de
protocolo de baixa latência até o navegador: fica para depois da medição.

## Decisões que faltam

1. **Protocolo do nó de mídia até o navegador.** O aparelho entrega TCP; o que
   sai para o operador pode ser WebSocket com os quadros crus (mais simples, e
   o `mdvr-video` do app já sabe ler esse formato), ou WebRTC (latência menor,
   e obrigatório se intercom entrar). Recomendo WebSocket na fase 1 justamente
   porque há código de parsing já escrito e testado do outro lado.
2. **Endereço público e portas.** Precisa de IP estável alcançável pela frota.
3. **TLS.** O N9M não obriga. Decidir se a sinalização sobe em TCP puro na fase
   1 e ganha TLS depois, ou já nasce cifrada — a segunda opção custa pouco
   agora e muito depois, quando houver frota instalada com endereço gravado.
