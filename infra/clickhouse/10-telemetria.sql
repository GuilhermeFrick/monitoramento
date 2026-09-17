-- Telemetria. O raciocínio de cada decisão está em
-- docs/arquitetura/clickhouse-telemetria.md; aqui fica só o que roda.
--
-- Este arquivo é montado em /docker-entrypoint-initdb.d e executa uma vez, na
-- criação do volume. Mudou o esquema, ou se aplica o ALTER à mão, ou se recria
-- o volume — o init não roda de novo em banco que já existe.

-- Tabela de pouso. O gate escreve aqui, e só aqui.
--
-- Guarda o evento JÁ TRADUZIDO, em vocabulário nosso. Pousar o JSON do
-- fabricante e deixar as visões extrair `viled` e `WLM` enfiaria conhecimento
-- de Streamax dentro do ClickHouse, e aí a segunda família de aparelho exigiria
-- reescrever SQL além de escrever um gate novo.
create table if not exists telemetria.eventos_crus
(
    cliente_id     UInt32,
    dispositivo_id UUID,
    -- Quando o evento aconteceu, lido do payload.
    momento        DateTime64(3, 'UTC') CODEC(Delta, ZSTD(1)),
    -- Quando chegou. Nunca a mesma coisa: já se mediu oito dias de diferença.
    recebido_em    DateTime64(3, 'UTC') CODEC(Delta, ZSTD(1)),

    -- Classifica a mensagem: 'posicao', 'entrada_digital', 'saude'. Chama-se
    -- classe e não tipo porque a tabela `eventos` tem um `tipo` que é outra
    -- coisa — lá é o tipo do evento, aqui é a família da mensagem. O mesmo nome
    -- para as duas colide dentro da visão materializada, em silêncio.
    classe         LowCardinality(String),
    -- Chave de deduplicação vinda do próprio aparelho. O aparelho reenvia
    -- histórico a cada reconexão, então isto não é precaução, é requisito.
    chave_origem   String CODEC(ZSTD(1)),
    historico      Bool,

    dados          String CODEC(ZSTD(1))
)
engine = MergeTree
partition by toYYYYMM(momento)
order by (cliente_id, dispositivo_id, classe, momento)
ttl toDateTime(momento) + interval 90 day;

-- Bytes do fabricante, opacos. Apólice de seguro, não fonte: existe porque a
-- documentação do fabricante já estava errada três vezes, e o bloco estendido
-- de 217 bytes do GPS segue sem decodificação. Com isto dá para reprocessar;
-- sem, só resta esperar a frota mandar de novo.
create table if not exists telemetria.brutos
(
    cliente_id     UInt32,
    dispositivo_id UUID,
    recebido_em    DateTime64(3, 'UTC') CODEC(Delta, ZSTD(1)),
    tipo_payload   UInt8,
    ssrc           UInt16,
    payload        String CODEC(ZSTD(3))
)
engine = MergeTree
partition by toYYYYMMDD(recebido_em)
order by (cliente_id, dispositivo_id, recebido_em)
ttl toDateTime(recebido_em) + interval 30 day;

-- Posição. É o volume que domina, e o que a tela do mapa lê.
--
-- Latitude e longitude ficam como o fio manda: grau × 1e6 em inteiro. É exato,
-- e Delta comprime muito melhor que Float64 num veículo em movimento, onde
-- pontos seguidos só diferem nas últimas casas.
create table if not exists telemetria.posicoes
(
    cliente_id      UInt32,
    dispositivo_id  UUID,
    momento         DateTime64(3, 'UTC') CODEC(Delta, ZSTD(1)),
    recebido_em     DateTime64(3, 'UTC') CODEC(Delta, ZSTD(1)),

    latitude_e6     Int32  CODEC(Delta, ZSTD(1)),
    longitude_e6    Int32  CODEC(Delta, ZSTD(1)),
    velocidade_cm_s UInt32 CODEC(Delta, ZSTD(1)),
    rumo_centesimos UInt16 CODEC(Delta, ZSTD(1)),
    altitude_m      Int16,

    -- Sem isto, 0,0 de um aparelho sem módulo GPS entra no banco como um ponto
    -- no Golfo da Guiné.
    qualidade       LowCardinality(String),
    historico       Bool,
    extras          Map(String, String) CODEC(ZSTD(1))
)
engine = MergeTree
partition by toYYYYMM(momento)
order by (cliente_id, dispositivo_id, momento)
ttl toDateTime(momento) + interval 2 year;

-- Mudança de estado discreta: porta, pânico, ignição, alarme.
create table if not exists telemetria.eventos
(
    cliente_id     UInt32,
    dispositivo_id UUID,
    momento        DateTime64(3, 'UTC') CODEC(Delta, ZSTD(1)),
    recebido_em    DateTime64(3, 'UTC') CODEC(Delta, ZSTD(1)),

    tipo           LowCardinality(String),
    origem         LowCardinality(String),
    -- Vem do aparelho, não de configuração nossa: ele manda "Panic Button"
    -- junto com o estado.
    rotulo         LowCardinality(String),
    uso            UInt8,
    estado         UInt8,

    chave_origem   String CODEC(ZSTD(1)),
    historico      Bool,
    extras         Map(String, String) CODEC(ZSTD(1))
)
engine = ReplacingMergeTree
partition by toYYYYMM(momento)
order by (cliente_id, dispositivo_id, tipo, momento, chave_origem);

-- Saúde do equipamento. É o que responde "por que aquele veículo sumiu".
-- As escalas ficam como o aparelho manda, inteiro × 100; dividir é da tela.
create table if not exists telemetria.saude
(
    cliente_id      UInt32,
    dispositivo_id  UUID,
    momento         DateTime64(3, 'UTC') CODEC(Delta, ZSTD(1)),
    recebido_em     DateTime64(3, 'UTC') CODEC(Delta, ZSTD(1)),

    tensao_cv       UInt16,
    temp_hd_cc      Int16,
    temp_rtc_cc     Int16,
    disco_livre     UInt64,
    disco_resta_s   UInt32,
    sinal_operadora UInt8,
    sinal_wifi      UInt8,
    tipo_rede       UInt8,
    -- BHS do capítulo 04: 2 é discagem bem-sucedida, 3 exceção de conexão,
    -- 4 o centro negou por falha de autenticação. É o campo que distingue
    -- "sem cobertura" de "chip bloqueado" — três causas, três providências.
    estado_discagem UInt8,

    chave_origem    String CODEC(ZSTD(1)),
    historico       Bool,
    extras          Map(String, String) CODEC(ZSTD(1))
)
engine = ReplacingMergeTree
partition by toYYYYMM(momento)
order by (cliente_id, dispositivo_id, momento, chave_origem)
ttl toDateTime(momento) + interval 1 year;
