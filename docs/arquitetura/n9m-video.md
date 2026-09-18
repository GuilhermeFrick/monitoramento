# Vídeo e evidência no N9M

Os comandos de cada fluxo, levantados nos capítulos 14 a 19 e 23, mais o que foi
descoberto sondando o aparelho de bancada.

Todos os comandos de mídia vivem no módulo **`MEDIASTREAMMODEL`**, com uma
exceção: a consulta de lista de arquivos é `STORM`.

## Três caminhos independentes para vídeo ao vivo

Isto é o achado que muda o plano de teste. O aparelho não oferece um caminho,
oferece três, e eles não dependem um do outro.

| Caminho | Transporte | Onde serve | Custo de testar |
|---|---|---|---|
| Canal de mídia N9M | TCP, endereço via `IPANDPORT` | produção, veículo em campo | alto: exige o nó de mídia escrito |
| **RTSP do aparelho** | TCP 554 | bancada e rede local | **baixo: `ffplay` e pronto** |
| WebSocket do portal | HTTP 8000 | o configurador do próprio aparelho | médio: player em WASM |

**O aparelho roda um servidor RTSP LIVE555 na porta 554.** Descoberto varrendo
portas: responde `OPTIONS`, `DESCRIBE`, `SETUP`, `PLAY`, `PAUSE`, `TEARDOWN`,
com autenticação Digest em `realm="LIVE555 Streaming Media"`.

As credenciais do configurador funcionam nele — com `admin:Avs01472` a resposta
sai de `401 Unauthorized` para `404 Stream Not Found`, o que prova que a
autenticação passou e só falta o caminho do stream.

⚠️ **O caminho do stream ainda não é conhecido.** Tentados sem sucesso: `/`,
`/live`, `/0`, `/1`, `/ch0`, `/ch1`, `/channel1`, `/stream0`, `/stream1`,
`/main`, `/live/ch1`, `/cam/realmonitor`. O jeito de descobrir sem adivinhar é
por telnet no aparelho, olhando a configuração do LIVE555 — ver
[prompt-acesso-ao-mdvr.md](../prompt-acesso-ao-mdvr.md).

**A porta 8000 é HTTP** e devolve 404 na raiz. É por onde o portal do aparelho
sobe o vídeo: o log do configurador mostra `[WASMPlayer] create websocket
chnmask:31` seguido de `[Websocket] websocket ok`. O `chnmask` é a mesma máscara
de bits do campo `CHANNEL` do N9M — 31 é `0b11111`, canais 1 a 5.

## Ao vivo pelo N9M

### Pedir

`MEDIASTREAMMODEL` / **`REQUESTALIVEVIDEO`** — capítulo 15.

| Campo | O que faz |
|---|---|
| `STREAMNAME` | nome do canal de mídia, 1-32 caracteres. **Quem gera é o cliente**, e é por ele que o nó de mídia reconhece o fluxo depois |
| `CHANNEL` | máscara de bits: bit 0 é o canal 1, bit 31 o canal 32 |
| `STREAMTYPE` | 0 sub-stream · 1 principal · 2 stream de celular |
| `AUDIOVALID` | máscara de bits: em quais canais o áudio vem junto |
| `IPANDPORT` | para onde o aparelho manda a mídia. Sem isto ele usa o endereço gravado nos parâmetros dele |
| `FRAMECOUNT` | taxa de quadros na rede, 0-30. É o controle de banda |

Erros que valem tratar: **25** tarefa já existe (já há preview rodando) e
**26** recursos insuficientes.

### Controlar

`MEDIASTREAMMODEL` / **`CONTROLSTREAM`**, com `CMD`: 0 parar · 1 retomar ·
2 pausar · 3 trocar o tipo de stream · 4 mudar o áudio · 6 mudar o modo de
envio. O `STREAMNAME` tem que ser o mesmo do pedido.

Há ainda **`REQUESTIFRAME`** para forçar um quadro-chave, que é o que faz a
imagem aparecer rápido quando alguém abre a janela no meio do fluxo.

## Playback

`MEDIASTREAMMODEL` / **`REQUESTREMOTEPLAYBACK`** — capítulo 16. Usa o mesmo
canal de mídia e o mesmo `IPANDPORT` do preview, então sai quase de graça depois
que o ao vivo funcionar.

| Campo | O que faz |
|---|---|
| `STARTTIME` / `ENDTIME` | `YYYYMMDDhhmmss` |
| `VIDEOTYPE` | 0 comum · 1 de alarme · 2 os dois |
| `PLAYMODE` | 0 normal · **1 estrangulado**, em que o aparelho respeita a banda |
| `FRAME` | taxa desejada, para pedir menos que o gravado |
| `REQ` | resolução: 6 é 720P, 7 é 1080P |

Controle por **`CONTROLREMOTEPLAYBACK`**, com `PALYBACKCMD` (sim, escrito assim
na documentação): 0 parar · 1 retomar · 2 pausar · **3 arrastar** · 8 posição,
que vai no campo `HIGH`.

### Antes de dar play, é preciso saber o que existe

`STORM` / **`QUERYFILELIST`** — capítulo 14. Devolve em partes: `SENDFILECOUNT`
diz quantos vieram, `SENDTIME` numera a resposta e `LASTRECORD` avisa qual é a
última. **Quem trata isso precisa acumular até `LASTRECORD` chegar**, senão
mostra uma lista parcial como se fosse completa.

Há também `QUERYCALENDAR`, que devolve quais dias têm gravação — é o que permite
a tela pintar o calendário antes de o operador escolher a data.

## Evidência

Duas formas, e o campo `EV` do `CONNECT` diz qual o aparelho suporta. **O de
bancada declara `V2.0`**, que é a melhor: plataforma pede e o upload é por HTTP.

### O gatilho é o alarme

O capítulo 06 define os alarmes, e cada um chega com `ALARMUID`, `ALARMTYPE` e
`RUN` (o número de boot do aparelho). Os tipos:

perda de vídeo · vídeo encoberto · detecção de movimento · exceção de memória ·
**IO** · **emergência** · excesso de velocidade · subtensão · **geocerca** ·
ACC · **DSM/IA** · temperatura · umidade

O alarme de IO e o de emergência são os que ligam no `Panic Button` da entrada
S7 que vimos no `UPDATEIOSTATUSINFO`. O de geocerca é o que fecha o ciclo com as
cercas do produto.

### Pedir a evidência

`MEDIASTREAMMODEL` / **`REQUPLOADEVIDENCE`**. A plataforma manda os três
endereços HTTP e o identificador do alarme:

| Campo | O que faz |
|---|---|
| `TASKID` | identificador da tarefa |
| `CMD` | 0 iniciar · 1 cancelar |
| `ALARMUID` + `ALARMTYPE` + `RUN` | dizem **qual** evidência: vêm iguais aos do alarme |
| `FILELISTINFOURL` | onde o aparelho publica a lista do que encontrou |
| `FILEINFOURL` | onde ele pergunta se o arquivo já existe e com que tamanho |
| `FILEUPLOADURL` | onde ele manda os bytes |

### O que acontece depois

1. O aparelho responde se aceitou a tarefa.
2. Manda `UPLOADSTAT` avisando que começou — **e a plataforma tem que
   responder**, senão ele repete o aviso periodicamente.
3. Procura a evidência: caixa-preta, vídeo e foto.
4. Publica a lista em `FILELISTINFOURL`.
5. Para cada arquivo, pergunta em `FILEINFOURL` quanto a plataforma já tem.
6. Manda o que falta em `FILEUPLOADURL`.
7. Manda `UPLOADSTAT` de conclusão, que também precisa de resposta.

Três detalhes que mudam o desenho do serviço de evidência:

**Uma tarefa por vez.** O aparelho aceita **uma só** tarefa de evidência
simultânea e devolve erro `0x1A` quando está ocupado. Isso obriga fila do nosso
lado: pedir evidência de cinco alarmes ao mesmo tempo faz quatro falharem.

**O upload é retomável, e é a plataforma que informa o ponto.** No passo 5 o
aparelho pergunta o tamanho já recebido e manda só o resto — se são 100 MB e a
plataforma tem 80, ele manda 20. Quem implementar o `FILEINFOURL` devolvendo
sempre zero joga fora essa propriedade inteira e refaz o upload do começo a cada
queda de link.

**Dá para pedir o futuro.** O aparelho aceita pedido de evidência de um período
que ainda não foi gravado e sobe em fatias conforme grava. É o que permite pegar
os segundos *depois* do alarme sem esperar o período fechar.

## Por onde testar

A ordem é do mais barato para o mais caro, e cada passo prova algo que o
seguinte precisa.

1. **RTSP na bancada.** Descobrir o caminho do stream por telnet e abrir com
   `ffplay`. Prova que há vídeo saindo do aparelho, sem escrever uma linha de
   código. É o teste que separa "nosso código está errado" de "o aparelho não
   está entregando".
2. **`REQUESTALIVEVIDEO` pela sonda**, com `IPANDPORT` apontando para uma porta
   nossa que só registra bytes. Prova que o comando desce e que a conexão de
   mídia sobe, sem precisar decodificar quadro nenhum.
3. **Relay do canal de mídia**, aí sim com parsing.
4. **Evidência**, que é HTTP e independe de tudo acima — pode andar em paralelo.

O passo 2 é o que valida o desenho inteiro da fase 1, porque é onde o
`IPANDPORT` e o diretório de sessões deixam de ser teoria.
