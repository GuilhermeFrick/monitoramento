# N9M observado no fio

O que um aparelho real manda, medido pela sonda (`services/gate-n9m`) em
17/09/2026. Isto **não** é plano nem interpretação da documentação: é o que
chegou no socket. Onde diverge da documentação, a documentação está errada.

Aparelho: `M1N2.0-STANDARD`, `DSNO 00E400689E`, protocolo `1.0.6`, `PV:1`
(N9M 2.0), 6 canais, ligado na WiFi da bancada.

## O cabeçalho não é o da tabela

O `CONNECT` chegou assim:

```
08 00 00 00  00 00 01 be  52 00 00 00
^^           ^^^^^^^^^^^  ^^
byte 0       len = 446    "RESERVE"
```

**Confirmado** — o arquivo tinha 458 bytes e 12 + 446 fecha exato:

| Campo | Offset | Formato |
|---|---|---|
| `PAYLOAD TYPE` | 1 | 1 byte |
| `SSRC` | 2-3 | 2 bytes, big endian |
| `PAYLOAD LEN` | 4-7 | 4 bytes, big endian |

**Divergente**, em todas as 30+ capturas, sem uma exceção:

- O byte 0 é `0x08`, não `0x4X`. Pela tabela, `V=1` poria os dois bits mais
  altos em `01`. Lido ao pé da letra, `0x08` dá `V=0` e `CSRC COUNT=8` — o que
  é impossível, porque não existe um único byte de CSRC entre o cabeçalho e o
  JSON.
- O `RESERVE`, documentado como zero, é `52 00 00 00`.

Por isso o codec não rejeita por versão (a checagem derrubava toda conexão do
aparelho), detecta compressão pela assinatura gzip em vez do bit `M`, e guarda
o byte 0 e o `RESERVE` crus. Quando houver quadro de vídeo ou comprimido para
comparar, a posição de cada bit se resolve; até lá, adivinhar seria pior.

As respostas espelham o cabeçalho que chegou. Quem decide se aceita é o
aparelho, não a tabela.

## O tipo 30 é JSON, e é a maior parte do tráfego

A documentação chama o payload 30 de *"streamax maintain data, not opensourced
currently"*. Na primeira sessão, **110 dos 129 quadros eram tipo 30** — e todos
começam com `7b 22`, que é `{"`. É JSON puro.

Nós observados dentro dele:

| Nó | O que traz |
|---|---|
| `DEV` | `CHIP` (= o `DSNO`), `DEVMODEL`, `ADDR` |
| `STORAGE` | `FREESIZE` em bytes, `SURPLUSTIME` em segundos de gravação restante, `STATUS` |
| `VOLTAGE` | `MAIN` — tensão ×100, então `1340` é 13,40 V |
| `TEMP` | `HDD1`, `RTC` — °C ×100, então `3400` é 34 °C |
| `COMMUNICATION` | `ICCID`, `IMEI`, `IMSI`, `IPV4ADDR`, `NETTYPE`, `STRENGTH` |
| `WIFI` | `EN`, `STATUS`, `STRENGTH` |
| `CAMERA` | `CHN` como máscara de bits (63 = 6 canais), `STATUS` |
| `RECORD` | estado por `GROUP` e `STREAM` |
| `TASKID` | `network_task_<microssegundos>` |
| `TIME` | unix, **do evento, não da chegada** |

Ou seja: tensão da bateria, temperatura, espaço em disco, sinal de operadora e
estado de câmera e gravação — telemetria de saúde de frota inteira — estava
sendo descartada por confiar na tabela.

O tipo 22 (`especial`), esse sim, é binário de verdade: é o relato de GPS do
capítulo 04 e precisa de parser próprio.

## O aparelho despeja histórico ao reconectar

**É o achado que mais muda o desenho.** Na sessão de 17/09 às 17:30, os
registros que chegaram tinham `TIME` entre **09/09 15:51 e 10/09 00:03** — oito
dias de idade, 8,2 horas de janela, entregues em cerca de 7 segundos de relógio.

Três consequências que não dá para retrofitar barato:

1. **A ingestão tem que usar o tempo do evento, nunca o da chegada.** Um
   registro de oito dias atrás gravado com o horário de agora é dado corrompido
   que ninguém percebe.
2. **Reconexão reenvia.** Durante o período em que a sonda rejeitava o
   cabeçalho, o aparelho reconectou 30 vezes, e cada tentativa recomeçava o
   despejo. Sem deduplicação, isso vira trinta cópias.
3. **O `TASKID` é a chave de idempotência**, e vem de graça: 110 registros, 110
   `TASKID` distintos, cada um com o timestamp em microssegundos embutido.

O pico também é de projeto: um aparelho que ficou dias offline entrega o
acumulado em rajada. Se a frota inteira reconectar junta — queda de link nossa,
por exemplo — a rajada é simultânea.

## Confirmações menores, todas úteis

**`EV: V2.0`.** Este aparelho suporta evidência por requisição da plataforma com
upload HTTP. É o caminho que deixa o arquivo ir direto ao object storage sem
atravessar serviço nosso, e estava em aberto no `mdvr-ingestao.md`.

**`ENCRYPTTYPE: 0` e `ETLS: 0`**, batendo com o `ENCRYPT_ENABLE = 0` que o
configurador declara. O codec da fase 1 não precisa decifrar nada.

**Vínculo com veículo não existe no aparelho.** `CARNUM`, `AUTOCAR`, `UNO`,
`UNAME` e `ICCID` vieram **todos vazios** no `CONNECT` — enquanto o `ICCID` real
aparece depois, no `COMMUNICATION`. Confirma que o vínculo tem que vir do nosso
cadastro.

**CGNAT confirmado.** O `IPV4ADDR` do módulo 4G é `100.65.141.118`, e numa
leitura seguinte `100.102.132.97` — faixa `100.64/10`, que é carrier-grade NAT, e
o endereço muda. Nunca vamos alcançar o aparelho; só ser alcançados.

**Keepalive a cada ~32 s**, não os 45 s da documentação. Respondido com eco, como
manda o capítulo 03, e a sessão se manteve estável.

**`DEVEMM` é um módulo que a documentação não cobre.** Operações vistas:
`GETSUPPORTSERVICE`, `UPLOADENCRYPTINFO`, `DEVINFOCHANGEUPLOAD`,
`UPDATEIOSTATUS`, `SPI`. O `GETSUPPORTSERVICE` devolve as capacidades do
aparelho (`TLS:1`, `HTTPS:1`, `KEYFRAME:1`, `PICKFRAME:1`, `GPSS:2`), que é
exatamente a peça de "capacidades declaradas" que o contrato neutro previa.

## O que ainda não sabemos

- O significado de cada bit do byte 0 e do `RESERVE`. Precisa de um quadro de
  vídeo ou comprimido para comparar.
- O formato binário do tipo 22 (GPS). O capítulo 04 descreve; falta conferir
  contra os bytes, que estão em `/tmp/capturas-n9m`.
- Se o despejo de histórico tem fim previsível ou se continua enquanto houver
  registro guardado. Importa para dimensionar a rajada.
