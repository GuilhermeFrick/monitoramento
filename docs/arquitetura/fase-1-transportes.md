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
dele. **Vamos sempre enviá-lo**, porque o endereço gravado é um só e vale para o
aparelho inteiro — é o `IPANDPORT` que permite mandar cada tarefa de mídia para
um nó diferente, e isso é a definição de balancear.

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
3. ~~**TLS.**~~ **Resolvido pelo configurador do aparelho**, ver abaixo: TLS é
   caixa de seleção com porta própria. O custo é nosso (certificado e um
   segundo listener), não do aparelho. Nasce cifrado.

## Identidade do aparelho e vínculo com o veículo

### O `DSNO` é a identidade, e é a única coisa que não se digita

> `DSNO` — "The device serial number. It is used for vehicle management. The
> value is encrypted chip number. Each N9M host has different chip numbers and
> the chip number is the unique identifier for the device."
> — capítulo 03, *Connection_Command*

Vem no `CONNECT`, tem de 1 a 32 bytes, e na prática são 10 caracteres hex:
`007102037B` no aparelho que temos em bancada, `00B5000053` e `00600052B8` nos
exemplos da documentação.

A página *Informações de registro* do configurador do aparelho confirma isso de
um jeito que nenhum documento confirmaria. Dos campos daquela tela, **um só não
é editável**:

| Campo na tela | Editável | Campo no protocolo |
|---|---|---|
| Número de série de fábrica | **não**, vem do chip | `DSNO` |
| Auto-numeração de dispositivo | sim | `AUTONO` |
| Número de matrícula | sim | `AUTOCAR` |
| Placa do veículo | sim | `CARNUM` |
| Número VIN do veículo | sim | — |
| Identificação do motorista | sim | `UNO` |
| Nome do motorista | sim | `UNAME` |

Placa e VIN chegam no pacote, mas são texto que alguém digitou na instalação.
Estão errados com a mesma facilidade com que estão certos, e ninguém percebe até
o dia em que dois aparelhos anunciam a mesma placa. **Não são vínculo, são
declaração.**

### O `SESSIONID` não é identidade

É o aparelho quem gera o `SESSIONID`, não nós, e ele vale por conexão:

> "The device generates `SESSIONID` which is a unique global descriptor."
> — capítulo 03

Serve para amarrar os pacotes de uma mesma conexão, inclusive a de mídia. Nada
durável se guarda por ele: reconectou, é outro. Quem persiste é o `DSNO`.

### O protocolo obriga cadastrar antes

Isso não é escolha de arquitetura, está escrito no fluxo de autenticação:

> "If the central server database includes the device, then the response is
> successful... If the central server database doesn't include the device, then
> the error code needs to be returned and the link be disconnected."
> — capítulo 03

Ou seja: aparelho desconhecido **tem** que ser recusado e desconectado. O
cadastro vem primeiro, sempre. A janela toda de autenticação é de 15 segundos.

**Mas recusar não é a mesma coisa que ignorar.** Um `DSNO` desconhecido batendo
na porta é exatamente o sinal de um aparelho que foi instalado e não foi
cadastrado — e é o único momento em que descobrimos isso sozinhos. O gate recusa
a conexão como manda o protocolo, e grava a tentativa numa fila de
**aguardando cadastro**, com serial, placa declarada, tipo e horário. Quem for
cadastrar acha o aparelho esperando em vez de digitar dez caracteres hex de um
adesivo.

### O vínculo é tabela nossa, não dado do pacote

```
dispositivo(id, dsno, cliente_id, veiculo_id, ...)   ← Postgres, nosso cadastro
```

O aparelho diz quem ele é; **nós** dizemos de quem ele é e em que veículo está.
Trocar o equipamento de veículo é `UPDATE` no nosso cadastro, não visita ao
configurador.

A placa que chega no `CONNECT` ganha então o papel certo: **conferência**. Se o
aparelho anuncia `ABC1D23` e o cadastro diz outra coisa, isso não derruba a
conexão — vira alerta de divergência. É como se descobre que um equipamento foi
remanejado de veículo sem ninguém avisar o cadastro, que é uma das formas mais
comuns de a frota e o sistema saírem de sincronia.

### O `DSNO` para na fronteira

Pela regra que governa a ingestão, o contrato neutro **não** carrega `DSNO`.
`DSNO` é formato da Streamax; outra família de aparelho vai identificar por IMEI,
por ICCID ou por qualquer outra coisa. O gate resolve `DSNO → dispositivo.id` na
autenticação e, daí para dentro, todo mundo fala o nosso id.

```
CONNECT com DSNO:007102037B
   │
   ▼  gate-n9m: consulta cadastro, recusa se não achar
dispositivo.id = 4f2a…        ← a partir daqui ninguém mais viu um DSNO
   │
   ▼  contrato neutro → enriquecimento → ingestão → API → front
```

Sem isso, o dia da segunda família de aparelho é o dia em que `dsno` aparece em
consulta de ClickHouse, em coluna de Postgres e em componente de React.

### Como a conexão ganha identificador, dos dois lados

**Sinalização.** Chega socket anônimo, chega `CONNECT` com `DSNO` dentro dos 15
segundos. O gate resolve no cadastro e passa a guardar `conexão → dispositivo.id`
em memória, além de publicar `dispositivo.id → este nó` no diretório em Redis.
Sem `CONNECT` válido na janela, derruba.

**Mídia.** Mesmo problema, resolvido pelo mesmo campo: o `CREATESTREAM` que abre
o canal de mídia carrega `DSNO`, `STREAMNAME` e `SESSION`.

```json
{ "MODULE": "CERTIFICATE", "OPERATION": "CREATESTREAM",
  "PARAMETER": { "DSNO": "00B5000053", "STREAMNAME": "4-500", "VISION": "1.0.4" },
  "SESSION": "0000001008206F2F212156B31CF66AA2" }
```

O nó de mídia resolve o `DSNO` do mesmo jeito e casa o `SESSION` com a sessão de
sinalização que está no diretório. `STREAMNAME` identifica cada canal dali em
diante — e o mesmo TCP pode carregar mais de um.

## O que o configurador do aparelho já entrega de graça

A página *Definição de rede → Definição de servidor* do MDVR de bancada mostra
três coisas que mudam o plano da fase 1 para melhor.

**TLS é caixa de seleção, com porta separada.** A tela tem `TLS Activar` e, para
cada servidor, duas portas: uma `TCP` e uma `TLS`. Do lado do aparelho cifrar não
custa nada — o custo é só nosso, um certificado e um segundo listener. Então não
há motivo para a fase 1 subir em claro. Migrar a frota depois não exige visita
técnica — ver abaixo —, mas exige campanha de reconfiguração remota com aparelho
offline no meio do caminho. Nascer cifrado evita a campanha inteira.

**O endereço é um nome, não um IP.** O `Servidor 1` do aparelho de bancada aponta
para `mdvr.avansat.com.br`, que resolve para `200.155.159.176`. Duas
consequências: já existe endereço público N9M da Avansat no ar, então a fase 2
não começa do zero em infraestrutura; e a frota se repõe por DNS, sem tocar em
aparelho. O que o DNS **não** move é a porta — essa só muda por parâmetro.

E parâmetro se empurra remotamente: o capítulo 12 define `CONFIGMODEL SET` pela
própria sinalização. Endereço e porta de aparelho já instalado mudam à distância,
desde que ele ainda conecte em **algum** dos slots. São três, e é para isso que o
terceiro serve.

**Sinalização e mídia são endereços independentes no aparelho.** Há
`Endereço do servidor registrado` e `Endereço do servidor de mídia`, cada um com
seu par de portas. É a confirmação prática do que o `IPANDPORT` faz: o endereço
gravado é o padrão, e o comando de sinalização sobrepõe quando quer mandar o
aparelho para outro nó. Os dois caminhos existem porque servem a momentos
diferentes.

**São três servidores, não um.** A tela tem `Servidor 1`, `Servidor 2` e
`Servidor 3`, e o
campo `SC` do `CONNECT` — "connect to the server subscript at this time, starting
from 0" — diz em qual dos dois o aparelho está. Isso é failover que já vem no
aparelho, sem balanceador e sem custo nosso além de subir o segundo endereço. Na
fase 1 os dois podem apontar para o mesmo lugar; o dia de separar não exige tocar
na frota.

Confirmações menores da mesma captura: o tipo de protocolo aparece como `N9M`, e
o estado de conexão como "Servidor principal está conectado" — o aparelho de
bancada está falando N9M com algum servidor central agora.
