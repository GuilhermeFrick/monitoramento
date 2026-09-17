-- Dispositivos no Postgres.
--
-- `cliente_id` é a primeira coluna de toda chave e de todo índice, pela mesma
-- razão das cercas: escopo por cliente não é filtro de conveniência, é o que
-- separa a frota de um cliente da do outro.
--
-- Esta tabela é o vínculo. O aparelho anuncia só o número de série; de quem ele
-- é e em que veículo está se decide aqui. Placa e motorista que chegam no
-- protocolo são declaração do instalador, servem para conferir, nunca para
-- vincular.
create table if not exists dispositivos (
  cliente_id     text        not null,
  id             text        not null,
  -- Serial de fábrica, gravado no chip. Imutável: alterar moveria para outro
  -- aparelho todo o histórico já gravado, sem deixar rastro.
  serie          text        not null,
  familia        text        not null check (familia in ('streamax_n9m','generico')),
  apelido        text,
  situacao       text        not null default 'ativo' check (situacao in ('ativo','inativo')),
  -- Nulo é aparelho cadastrado e ainda não instalado, que é um estado legítimo
  -- e diferente de erro.
  veiculo        text,
  observacao     text,

  -- O que o aparelho declarou de si na última conexão. Nulo até ele aparecer
  -- pela primeira vez — e nulo aqui significa "cadastrado, nunca visto", que
  -- não é a mesma coisa que "offline".
  decl_modelo    text,
  decl_protocolo text,
  decl_canais    integer,
  decl_evidencia text,
  decl_ip        text,
  visto_em       timestamptz,

  versao         integer     not null default 1,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  primary key (cliente_id, id)
);

-- O serial é único por cliente, não globalmente: o mesmo aparelho pode ser
-- devolvido e recadastrado em outro cliente depois de sair de uma frota.
create unique index if not exists dispositivos_serie_por_cliente
  on dispositivos (cliente_id, upper(serie));

-- O gate resolve serie -> dispositivo a cada conexão, sem saber o cliente
-- ainda. Por isso este índice não começa por cliente_id: é a única consulta do
-- sistema que legitimamente não tem escopo, porque é ela que descobre o escopo.
create index if not exists dispositivos_por_serie
  on dispositivos (upper(serie), familia);

-- Um veículo carrega um aparelho por vez. Índice parcial porque muitos podem
-- estar sem veículo ao mesmo tempo, e nulo não colide com nulo.
create unique index if not exists dispositivos_veiculo_unico
  on dispositivos (cliente_id, veiculo) where veiculo is not null;

-- Aparelhos que bateram na porta e não estão no cadastro.
--
-- O protocolo manda recusar e derrubar a conexão, e é o que o gate faz. Mas
-- recusar não é ignorar: serial desconhecido chegando é o único momento em que
-- se descobre sozinho que alguém instalou um aparelho sem avisar.
--
-- Não há cliente_id aqui de propósito: se não está cadastrado, não sabemos de
-- quem é. Inventar um escopo seria pior que não ter.
create table if not exists dispositivos_desconhecidos (
  serie           text        not null,
  familia         text        not null,
  modelo          text,
  -- Placa que o aparelho anunciou. Digitada na instalação; pode estar errada,
  -- vazia ou repetida. Serve para quem for cadastrar reconhecer o veículo.
  placa_declarada text,
  ip              text,
  tentativas      integer     not null default 1,
  primeira_em     timestamptz not null default now(),
  ultima_em       timestamptz not null default now(),
  primary key (serie, familia)
);

create index if not exists desconhecidos_por_ultima
  on dispositivos_desconhecidos (ultima_em desc);
