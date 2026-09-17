# Telemetria no ClickHouse

Como guardar o que o MDVR manda. As decisões abaixo saem do que foi medido em
[n9m-observado.md](n9m-observado.md), não de teoria.

## Por que não um tabelão

Um `eventos` com todas as colunas de todos os tipos parece simples até a
primeira consulta. Os conjuntos de campos **quase não se sobrepõem**: posição
tem latitude e velocidade, saúde tem tensão e temperatura, sensor tem estado e
código de uso. Uma linha de posição deixaria 40 colunas nulas.

Em ClickHouse coluna nula custa pouco para ler, então o problema não é espaço —
é o `ORDER BY`. A chave de ordenação é uma só por tabela, e ela é o que decide se
a consulta lê 2 MB ou 2 GB. Posição quer granularidade fina por dispositivo e
tempo; saúde chega a cada cinco minutos e quer outra. Com uma chave só, uma das
duas sempre perde.

## Por que não uma coluna JSON e pronto

O contrário — `dispositivo`, `momento`, `payload JSON` — tem o charme de nunca
precisar de migração. E paga caro em dois lugares.

**Não dá para ordenar nem indexar pelo que está dentro.** Filtrar por
`velocidade > 80` vira leitura completa, porque o ClickHouse não sabe pular
partes sem uma coluna de verdade na chave.

**O volume é em posição.** Um ponto a cada 30 segundos, por veículo, é o que
domina a tabela. Guardar isso como JSON gasta várias vezes mais que colunas
tipadas, e é justamente onde a diferença dói.

Além disso, o tipo `JSON` do ClickHouse ainda é experimental na 24.8, que é a
versão do nosso `infra/compose.yaml`. `Map(String, String)` é o que dá para usar
hoje sem susto.

## O desenho: tipado no que se consulta, mapa no resto

Quatro tabelas, separadas por **formato de consulta**, não por tipo de mensagem.

```
posicoes   alto volume, sempre os mesmos campos, consulta por janela de tempo
eventos    mudanças de estado: sensor, alarme, ignição, pânico
saude      periódico, esquema estável e largo
brutos     tudo como chegou, com TTL curto — a apólice de seguro
```

O que se filtra, ordena ou agrega vira **coluna tipada**. O resto vai num
`Map(String, String)`, e quando um campo do mapa fica quente ele é promovido a
coluna materializada — sem reescrever o histórico.

## As tabelas

### posicoes

```sql
CREATE TABLE posicoes
(
    cliente_id      UInt32,
    dispositivo_id  UUID,
    momento         DateTime64(3, 'UTC') CODEC(Delta, ZSTD(1)),
    recebido_em     DateTime64(3, 'UTC') CODEC(Delta, ZSTD(1)),

    -- Guardados como o fio manda: grau × 1e6 em inteiro. É exato, e Delta
    -- comprime muito melhor do que Float64 num veículo em movimento, onde
    -- pontos seguidos diferem nas últimas casas.
    latitude_e6     Int32 CODEC(Delta, ZSTD(1)),
    longitude_e6    Int32 CODEC(Delta, ZSTD(1)),

    velocidade_cm_s UInt32 CODEC(Delta, ZSTD(1)),  -- km/h × 100, como no fio
    rumo_centesimos UInt16 CODEC(Delta, ZSTD(1)),  -- graus × 100
    altitude_m      Int16,

    -- viled do capítulo 04: 0 válido, 1 poucos satélites, 2 sem módulo.
    -- Sem isto, 0,0 entra no banco como um ponto no Golfo da Guiné.
    qualidade       Enum8('valido' = 0, 'sem_precisao' = 1, 'sem_modulo' = 2),

    -- ureal: registro guardado e reenviado depois, não posição de agora.
    historico       Bool,

    extras          Map(String, String) CODEC(ZSTD(1))
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(momento)
ORDER BY (cliente_id, dispositivo_id, momento)
TTL toDateTime(momento) + INTERVAL 2 YEAR;
```

`cliente_id` vem primeiro na chave porque toda consulta do produto é de um
cliente só. É o corte que elimina mais dado antes de qualquer outra coisa.

### eventos

Mudança de estado discreta: porta abriu, pânico apertado, ignição ligou, alarme
disparou. Volume médio, consulta por dispositivo, janela e tipo.

```sql
CREATE TABLE eventos
(
    cliente_id      UInt32,
    dispositivo_id  UUID,
    momento         DateTime64(3, 'UTC') CODEC(Delta, ZSTD(1)),
    recebido_em     DateTime64(3, 'UTC') CODEC(Delta, ZSTD(1)),

    tipo            LowCardinality(String),  -- 'entrada_digital', 'alarme', 'ignicao'
    origem          LowCardinality(String),  -- 'S7', 'ACC'
    rotulo          LowCardinality(String),  -- 'Panic Button', vindo do aparelho
    uso             UInt8,                   -- o U do Sensor Uses: 1 = urgência
    estado          UInt8,

    -- Chave de deduplicação do próprio aparelho: SERIAL nos eventos de IO,
    -- TASKID nos de manutenção. Ver a seção de idempotência.
    chave_origem    String CODEC(ZSTD(1)),
    historico       Bool,

    dados           Map(String, String) CODEC(ZSTD(1))
)
ENGINE = ReplacingMergeTree
PARTITION BY toYYYYMM(momento)
ORDER BY (cliente_id, dispositivo_id, tipo, momento, chave_origem);
```

O `rotulo` vem do aparelho, não de configuração nossa: o `UPDATEIOSTATUSINFO`
manda `"NAME": "Panic Button"` junto com o estado. E o `uso` é o código do
*Sensor Uses* da tela de configuração — `1` é alarme de urgência. **O gate não
precisa saber qual entrada é o pânico; o aparelho conta.**

### saude

Tensão, temperatura, disco, sinal. Periódico, esquema largo mas estável, e é o
que responde "por que aquele veículo sumiu".

```sql
CREATE TABLE saude
(
    cliente_id      UInt32,
    dispositivo_id  UUID,
    momento         DateTime64(3, 'UTC') CODEC(Delta, ZSTD(1)),
    recebido_em     DateTime64(3, 'UTC') CODEC(Delta, ZSTD(1)),

    tensao_cv       UInt16,   -- volts × 100, como o aparelho manda
    temp_hd_cc      Int16,    -- °C × 100
    temp_rtc_cc     Int16,
    disco_livre     UInt64,
    disco_resta_s   UInt32,   -- SURPLUSTIME: segundos de gravação restante
    sinal_operadora UInt8,
    sinal_wifi      UInt8,
    tipo_rede       UInt8,

    chave_origem    String CODEC(ZSTD(1)),   -- TASKID
    historico       Bool,
    extras          Map(String, String) CODEC(ZSTD(1))
)
ENGINE = ReplacingMergeTree
PARTITION BY toYYYYMM(momento)
ORDER BY (cliente_id, dispositivo_id, momento, chave_origem)
TTL toDateTime(momento) + INTERVAL 1 YEAR;
```

As escalas ficam como o aparelho manda — inteiro vezes cem. Converter para
`Decimal` na gravação não ganha nada e abre espaço para erro de arredondamento
em quem grava; a divisão por 100 é da tela.

### brutos

```sql
CREATE TABLE brutos
(
    cliente_id      UInt32,
    dispositivo_id  UUID,
    recebido_em     DateTime64(3, 'UTC') CODEC(Delta, ZSTD(1)),
    tipo_payload    UInt8,
    ssrc            UInt16,
    payload         String CODEC(ZSTD(3))
)
ENGINE = MergeTree
PARTITION BY toYYYYMMDD(recebido_em)
ORDER BY (cliente_id, dispositivo_id, recebido_em)
TTL toDateTime(recebido_em) + INTERVAL 30 DAY;
```

Esta existe por um motivo concreto: **a documentação do fabricante já estava
errada três vezes**, e o bloco estendido de 217 bytes do GPS continua sem
decodificação. No dia em que ele for decifrado, com os brutos dá para
reprocessar trinta dias de histórico; sem eles, só resta esperar a frota mandar
de novo. Trinta dias de TTL é barato perto disso.

## Idempotência, que aqui não é opcional

O aparelho **reenvia histórico ao reconectar** — medido: registros de oito dias
atrás chegando em rajada de sete segundos. Durante um período em que a sonda
recusava o cabeçalho, ele reconectou trinta vezes, e cada tentativa recomeçava o
despejo.

A chave de deduplicação vem de graça do próprio aparelho:

| Mensagem | Chave | Verificado |
|---|---|---|
| Manutenção (tipo 30) | `TASKID` | 110 registros, 110 distintos |
| Entradas digitais | `SERIAL` | sequência por conexão |
| GPS | `momento` + dispositivo | não há chave própria |

O `ReplacingMergeTree` resolve, **com uma ressalva que precisa estar escrita**:
ele só deduplica na fusão das partes, que acontece quando acontece. Consulta
feita antes disso vê as duas linhas. As saídas:

- `SELECT ... FINAL` — correto e mais lento;
- agregar por `argMax(coluna, recebido_em)` — correto e rápido, mas contamina
  toda consulta;
- **deduplicar na ingestão**, com um conjunto de chaves recentes em Redis, e
  deixar o `ReplacingMergeTree` como rede de segurança.

Recomendo a terceira. O reenvio vem em rajada logo após a reconexão, então uma
janela curta em memória pega quase tudo, e o que escapar a fusão limpa depois.

## Duas colunas de tempo, sempre

`momento` é quando o evento aconteceu, lido do payload. `recebido_em` é quando
chegou. **Nunca a mesma coisa**: já vimos oito dias de diferença.

Gravar o histórico com a hora de agora é o tipo de erro que não dá erro — vira
gráfico plausível e errado, e só aparece quando alguém questiona um relatório.
Por isso `momento` entra no `ORDER BY`, e `recebido_em` fica fora dele, como
dado.

Quando o payload não traz hora confiável — o `utime` do GPS pode vir vazio —
o campo vira nulo, nunca `recebido_em` disfarçado.

## Como um campo sai do mapa e vira coluna

O `Map` não é depósito permanente, é sala de espera. Quando um campo começa a
aparecer em `WHERE`:

```sql
ALTER TABLE saude
    ADD COLUMN umidade_cc Int16 MATERIALIZED toInt16OrNull(extras['UMIDADE']);
```

Linhas novas gravam a coluna; as antigas são lidas do mapa pela mesma expressão.
Nenhuma reescrita, nenhuma janela de manutenção. É o que torna seguro começar
com o mapa largo em vez de tentar adivinhar o esquema final agora.

## O que ainda não está decidido

1. **Se `DEVINFOCHANGEUPLOAD` vira linha.** Chega a cada seis segundos com
   conteúdo praticamente idêntico — 165 envios em 24 minutos, quase todos iguais.
   Mil aparelhos seriam 166 linhas por segundo só de status de modem. Proposta:
   gravar só quando algum campo muda, e um registro a cada cinco minutos de
   qualquer forma, para a ausência de mudança também ficar registrada.
2. **Se `eventos` e `saude` compartilham tabela.** Hoje separadas porque o
   formato de consulta difere. Se na prática as telas sempre pedirem as duas
   juntas, uma visão materializada resolve sem fundir as bases.
3. **Retenção real.** Os TTLs acima são chute razoável, não requisito. Posição
   por dois anos é o que costuma ser pedido em frota; confirmar antes de virar
   política.
