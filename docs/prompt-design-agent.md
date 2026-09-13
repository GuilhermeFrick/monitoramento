# Prompt para agente de design — evolução do Avansat Risk

> Cole o conteúdo abaixo (a partir de "## Contexto") no agente de design.
> Este cabeçalho não faz parte do prompt.

---

## Contexto

Você vai estender um frontend **já existente e funcional** — não recomeçar do
zero. O projeto se chama `avansat-risk` e vive neste repositório
(`monitoramento/`, stack em `package.json`): React + Vite + TypeScript,
componentes shadcn/Radix em `client/src/components/ui`, uma única página
(`client/src/pages/Home.tsx`) que roteia por estado (`ViewKey`) entre seções
de um dashboard, com dados mock persistidos em `localStorage` — não há
backend real ainda, e não deve haver: isto é uma ferramenta de exploração
visual, não o produto final.

**Preserve o que já funciona**: o layout de três colunas do monitoramento ao
vivo (árvore de frota + mapa + parede de câmeras), o modo mosaico com janela
externa (`?display=mosaic`), a navegação por `Sidebar`/`Topbar`, o sistema de
toast, os modais de intervenção, o tema visual (cores, tipografia, densidade).
Você está **adicionando e corrigindo conceitos de domínio**, não redesenhando
a experiência que já foi validada.

## O produto real, que o mock ainda não reflete

O `avansat-risk` foi montado a partir de um template genérico de "IA em
dashcam" (fadiga, celular ao volante, velocidade). O produto real — **MDVR
como hardware de gestão de risco** — é mais específico, e tem vocabulário
próprio que este frontend precisa passar a usar **com exatidão**, porque será
o que o time inteiro (comercial, operação, cliente) vai ler na tela:

| Termo usado hoje no mock | Termo correto do produto | Por quê importa |
|---|---|---|
| "Regras & geocercas" (uma coisa só) | **Cerca** (área com regra), **Rota** (trajeto com corredor), **Rotograma** (sequência de trechos planejada) | são três objetos diferentes, cadastrados e visualizados separadamente |
| — (não existe) | **Ponto de Controle** — área + categoria + política, é o que a plataforma cadastra e distribui (não confundir com "Área de Controle", que é uma leitura emergente de pontos sobrepostos, não cadastrada) | é a unidade central de gestão geográfica do produto |
| — (não existe) | **Perfil Operacional** — o "modo" do veículo (normal, cliente, pernoite, carga…), embarcável, trocado por geocerca ou por macro do motorista | é o conceito mais importante do produto: quase toda tela de configuração gira em torno de perfil |
| — (não existe) | **Macro** — ação que o motorista registra (início de carga, pernoite, parada autorizada) | gatilho de troca de perfil, junto com a geocerca |
| "Intervenção" genérica num risco | **Comando delegado** — a central não aciona o atuador direto: ela **habilita um botão** que o motorista aciona no veículo (modo único ou persistente) | distinção de segurança central do produto (autorizar ≠ atuar) |
| — (não existe) | **Coação** — uma segunda senha que autoriza a operação normalmente mas dispara alerta silencioso, sem reação perceptível no veículo | requisito de segurança física, tela própria de gestão de credenciais |
| — (não existe) | **Canal de contingência** — satélite/LoRaWAN quando a cobertura celular falha; perda de sinal é evento auditável, com última posição conhecida | saúde de conectividade é informação operacional, não só indicador binário |

## O que adicionar ou mudar, por área do produto

Cada item cita o requisito de origem (`DEV-xx`/`APP-xx`) só para você poder
perguntar de volta se precisar de mais contexto — não é vocabulário para
expor ao usuário final.

### 1. Cadastro e provisionamento (tela nova — não existe hoje)

Hoje não há nenhuma tela de "o que está sendo enviado para o equipamento".
Precisa de uma seção nova (`Provisionamento` ou `Embarque`, no grupo
"Gestão"):

- Catálogo versionado de configurações e perfis, do qual os embarques são
  emitidos (`DEV-24`).
- Lista de itens de um embarque (jornada, pontos de controle, cercas, perfis,
  credenciais) com **confirmação individual de aceite/rejeição** por
  equipamento — não é "enviado com sucesso" binário, é item a item
  (`DEV-38`).
- Bloqueio de emissão quando um item referencia outro ainda não embarcado, ou
  quando dois pontos de controle se sobrepõem sem precedência declarada —
  mostrar como erro de validação antes de permitir o envio, não como falha
  depois (`DEV-59`, `DEV-52.2`).
- Ação de **limpeza** da política embarcada (zerar jornada/pontos/cercas/
  perfis de um equipamento), com pontos marcados como **fixos** sobrevivendo
  à limpeza (`DEV-39`, `DEV-58`).

### 2. "Regras & geocercas" → separar em três telas

Renomear e dividir a seção atual:

- **Cercas** — cadastro de área com política (categoria, permanência),
  com toggle **ativa/inativa sem excluir** (`DEV-41`).
- **Pontos de controle e rotograma** — cadastro de pontos de controle
  (distinto de cerca simples: tem categoria + política de permanência) e o
  **rotograma**: sequência de pontos com duração/distância esperada por
  trecho, e **limites de telemetria por trecho** configuráveis por trecho, não
  só globais (`DEV-55`, `DEV-53`). Visualizar desvio de cronograma em 5
  níveis (no prazo / adiantada / muito adiantada / atrasada / muito
  atrasada), não só "atrasado sim/não".
- **Rotas** — trajeto com corredor (desvio = distância ao corredor), separado
  de rotograma (rotograma é plano de viagem com trechos; rota é o trajeto
  eletrônico em si).

Manter um mapa de "áreas de controle" (leitura agregada de pontos sobrepostos
para acompanhamento de frota) como visão **derivada**, não como cadastro à
parte (`DEV-05.2`) — deixar claro na UI que não se cadastra uma área de
controle diretamente.

### 3. Perfil Operacional (seção nova, provavelmente a mais importante)

Não existe hoje nenhuma noção de "modo do veículo". Precisa de:

- Biblioteca de perfis reutilizáveis e versionados (`DEV-40`, `DEV-51`):
  nome, postura de cada atuador (ligado/desligado/como estava), quais
  sensores ficam armados e o que conta como violação em cada um.
- Regra de troca: por geocerca/ponto de controle **ou** por macro do
  motorista — mostrar os dois gatilhos lado a lado num mesmo perfil, não como
  mecanismos separados.
- Para acionamento de atuador dentro de um perfil: modo **temporário** (com
  duração) vs **permanente** — e, se permanente, as duas condições que juntas
  liberam o encerramento (a violação cessou **e** a central comandou).
- Ajuste do canal de contingência por perfil: quais eventos justificam usá-lo
  e a frequência de reporte nesse modo (`DEV-79`, D — pode ser tela
  secundária/avançada).

### 4. Comandos → separar "comandar direto" de "delegar ao motorista"

A tela de intervenção hoje trata todo comando como acionamento direto.
Adicionar:

- **Habilitar botão** — a central não abre a trava; ela libera um botão que o
  motorista aciona no veículo, em modo único ou persistente (`DEV-45`). Deixar
  visualmente clara essa distinção de "autorizar ≠ atuar" — é o requisito de
  segurança mais citado do produto.
- Envio em modo persistente exige **confirmação explícita** de quem comanda,
  numa segunda etapa (não um clique só) (`DEV-45.2`).
- Antes de listar um comando como disponível, checar aplicabilidade ao
  equipamento (linha de produto, versão) e mostrá-lo **indisponível**, nunca
  enviável-e-recusado-depois (`DEV-47`, `DEV-47.1`).
- Campo de **observação obrigatória** em todo comando enviado, e essa
  observação permanece no histórico mesmo que o texto-modelo seja depois
  removido da lista de reutilizáveis (`DEV-48`, `DEV-48.1`).

### 5. Segurança operacional (tela nova — credenciais e coação)

- Cadastro de credencial do motorista **por veículo** (não por operação
  inteira), removível individualmente ou em lote (`DEV-43.2`).
- Gestão das duas senhas — operação e coação — deixando claro na UI que são
  **necessariamente diferentes**, mas que a de coação autoriza a operação
  **exatamente como a normal** do ponto de vista de quem está sendo coagido.
- Um evento de coação deve aparecer na lista de eventos com um badge/rota
  **distinta** de evento normal (canal ou destinatário diferente, nunca
  misturado no mesmo feed que o motorista possa ver) — a UI de gestão de
  risco vê a coação; a UI operacional comum, não.

### 6. Eventos — ordenação, tipos e auditoria

A lista de eventos hoje é só um feed cronológico por chegada. Ajustar:

- Ordenar e apresentar pelo **instante do fato** (`occurredAt`), não pelo
  instante de chegada — e marcar visualmente quando um evento chegou atrasado
  (entregue depois de reconexão), distinguindo-o de um evento em tempo real
  (`DEV-60.1`, `DEV-37.2`).
- Distinguir **condição** (tem início e fim — ex. "fora de rota") de
  **marco** (acontece num instante, não tem fim — ex. "entrou no ponto de
  controle") na forma como cada card de evento é desenhado.
- Um evento de **perda de sinal** aparece na timeline como evento próprio, com
  a última posição conhecida do veículo, não como "sem dados" (`DEV-84`,
  `DEV-84.1`).
- Se um comentário/observação de um evento histórico for editado, exigir uma
  confirmação de autorização e manter o registro de quem editou e quando —
  não sobrescrever silenciosamente (`APP-06.1`).

### 7. Mensageria motorista ↔ central (tela nova, pequena)

Um painel simples de troca de mensagens pré-formatadas e livres com
confirmação de leitura, por veículo — pode viver dentro de "Centro de
tráfego" como uma aba (`APP-18`).

## O que **não** fazer

- Não conectar a nenhuma API real nem propor esquema de banco — a camada de
  dados continua mock/`localStorage`, como já está.
- Não inventar telemetria ou eventos fora do que já existe como mock — pode
  enriquecer os objetos mock existentes (`Risk`, `fleetRows`, `eventFeed`) com
  os campos novos que os itens acima exigem (ex.: `perfilAtivo`,
  `pontoDeControle`, `condicaoOuMarco`), mas sem construir integração.
- Não renomear ou remover o modo mosaico, a parede de câmeras ou o layout do
  monitoramento ao vivo — eles já foram validados e não fazem parte deste
  escopo.
- Não usar os termos "geocerca genérica", "regra" sozinho, ou "intervenção"
  para o que a tabela de vocabulário acima já nomeia — use os termos exatos.

## Entregável esperado

Uma versão do mesmo projeto (`avansat-risk`) com:
1. As telas/seções novas ou renomeadas acima, navegáveis pelo sidebar
   existente (adicionar grupos/itens a `navGroups`, não recriar a navegação).
2. Dados mock coerentes com o vocabulário novo, o suficiente para clicar em
   cada tela e entender o que ela faz sem precisar de explicação adicional.
3. `pnpm check` e `pnpm build` passando, como o histórico deste repositório já
   exige a cada mudança (ver mensagens de commit anteriores).
