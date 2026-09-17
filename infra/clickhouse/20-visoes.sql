-- Visões materializadas: quebram a tabela de pouso nas específicas.
--
-- Três coisas que surpreendem quem espera visão de banco relacional:
--
--   1. É gatilho de inserção. A visão enxerga só o bloco sendo inserido, nunca
--      o que já está na tabela. Criar hoje não traz nada de ontem.
--   2. Por isso tabela derivada nova precisa de carga manual do histórico, com
--      INSERT ... SELECT FROM eventos_crus. Esquecer esse passo é o erro
--      clássico: a tabela parece vazia e ninguém entende por quê.
--   3. Visão que lança erro derruba o INSERT na tabela de pouso. Por isso só se
--      usa extração tolerante aqui — JSONExtract devolve zero em campo ausente
--      — e nunca CAST que possa estourar.
--
-- E uma armadilha que custou uma subida quebrada: apelidar uma coluna de saída
-- com o mesmo nome de uma coluna de entrada faz as expressões seguintes verem o
-- apelido, não a origem. Por isso a coluna de pouso se chama `classe` e o mapa
-- de sobra se chama `extras` nas três visões.
--
-- Nenhum nome abaixo é do fabricante. `qualidade` já chega 'valido' ou
-- 'sem_modulo' porque a tradução aconteceu no Go.

create materialized view if not exists telemetria.mv_posicoes to telemetria.posicoes as
select
    cliente_id,
    dispositivo_id,
    momento,
    recebido_em,
    toInt32(JSONExtractInt(dados, 'latitude_e6'))      as latitude_e6,
    toInt32(JSONExtractInt(dados, 'longitude_e6'))     as longitude_e6,
    toUInt32(JSONExtractUInt(dados, 'velocidade_cm_s')) as velocidade_cm_s,
    toUInt16(JSONExtractUInt(dados, 'rumo_centesimos')) as rumo_centesimos,
    toInt16(JSONExtractInt(dados, 'altitude_m'))       as altitude_m,
    JSONExtractString(dados, 'qualidade')              as qualidade,
    historico,
    map()                                              as extras
from telemetria.eventos_crus
where classe = 'posicao';

create materialized view if not exists telemetria.mv_eventos to telemetria.eventos as
select
    cliente_id,
    dispositivo_id,
    momento,
    recebido_em,
    JSONExtractString(dados, 'evento')  as tipo,
    JSONExtractString(dados, 'origem')  as origem,
    JSONExtractString(dados, 'rotulo')  as rotulo,
    toUInt8(JSONExtractUInt(dados, 'uso'))    as uso,
    toUInt8(JSONExtractUInt(dados, 'estado')) as estado,
    chave_origem,
    historico,
    map()                                as extras
from telemetria.eventos_crus
where classe = 'entrada_digital';

create materialized view if not exists telemetria.mv_saude to telemetria.saude as
select
    cliente_id,
    dispositivo_id,
    momento,
    recebido_em,
    toUInt16(JSONExtractUInt(dados, 'tensao_cv'))       as tensao_cv,
    toInt16(JSONExtractInt(dados, 'temp_hd_cc'))        as temp_hd_cc,
    toInt16(JSONExtractInt(dados, 'temp_rtc_cc'))       as temp_rtc_cc,
    toUInt64(JSONExtractUInt(dados, 'disco_livre'))     as disco_livre,
    toUInt32(JSONExtractUInt(dados, 'disco_resta_s'))   as disco_resta_s,
    toUInt8(JSONExtractUInt(dados, 'sinal_operadora'))  as sinal_operadora,
    toUInt8(JSONExtractUInt(dados, 'sinal_wifi'))       as sinal_wifi,
    toUInt8(JSONExtractUInt(dados, 'tipo_rede'))        as tipo_rede,
    toUInt8(JSONExtractUInt(dados, 'estado_discagem'))  as estado_discagem,
    chave_origem,
    historico,
    map()                                               as extras
from telemetria.eventos_crus
where classe = 'saude';
