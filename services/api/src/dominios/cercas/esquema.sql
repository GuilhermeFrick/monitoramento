-- Cercas no Postgres.
--
-- `cliente_id` é a primeira coluna de toda chave e de todo índice porque o
-- escopo por cliente não é filtro de conveniência: é o que separa a frota de um
-- cliente da do outro. Consulta sem ele deve ser impossível, não apenas
-- desaconselhada.
--
-- A geometria fica em jsonb, e não em PostGIS, por uma razão de domínio: a
-- plataforma não calcula geometria. Quem detecta entrada e saída é a geocerca
-- nativa do MDVR, que aceita quatro formas. O banco guarda o que será embarcado;
-- não precisa saber intersectar.
create table if not exists cercas (
  cliente_id        text        not null,
  id                text        not null,
  nome              text        not null,
  descricao         text,
  categoria         text        not null check (categoria in ('restrita','operacional','velocidade','horario')),
  politica          jsonb       not null,
  ativa             boolean     not null default true,
  local             text        not null default '',
  -- Incrementada a cada alteração. É o que faz o servidor devolver conflito
  -- quando dois operadores editam a mesma cerca.
  versao            integer     not null default 1,
  geometria         jsonb       not null,
  vigencia_inicio   date,
  vigencia_fim      date,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  primary key (cliente_id, id)
);

-- Nome único por cliente, não global: dois clientes podem ter "Pátio Itaguaí".
create unique index if not exists cercas_nome_por_cliente
  on cercas (cliente_id, lower(nome));

-- Vínculo cerca↔veículo. Tabela própria porque a mesma cerca vale para muitos
-- veículos e um veículo carrega muitas cercas, e porque desvincular precisa ser
-- barato sem reescrever a cerca inteira.
create table if not exists cercas_veiculos (
  cliente_id text not null,
  cerca_id   text not null,
  veiculo    text not null,
  vinculado_em timestamptz not null default now(),
  primary key (cliente_id, cerca_id, veiculo),
  foreign key (cliente_id, cerca_id) references cercas (cliente_id, id) on delete cascade
);

create index if not exists cercas_veiculos_por_veiculo
  on cercas_veiculos (cliente_id, veiculo);
