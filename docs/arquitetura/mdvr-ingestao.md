# Ingestão de MDVR — levantamento

Base: protocolo N9M 2.0 (25 capítulos catalogados em `sdk_documentation_n9m2`),
o backend `avansat-n9m-backend` que já existe, e os três pacotes do app do
motorista (`mdvr-n9m`, `mdvr-sdk`, `mdvr-video`).

## A regra que governa tudo: o gate é substituível

Nada fora do gate pode saber que existe N9M.

Isso não é elegância: é a diferença entre suportar um segundo fabricante em duas
semanas ou em dois trimestres. No dia em que entrar um MDVR de outra marca — ou
um gateway de terceiro no lugar do nosso — a conta que se paga é proporcional a
quantos serviços conhecem o formato do primeiro.

Então há **um contrato neutro de dispositivo**, e cada família de aparelho tem
seu próprio gate implementando-o. Enriquecimento, telemetria, API e workers
falam só o contrato, e não têm como descobrir qual gate produziu o dado.

```
  MDVR Streamax ──▶ gate-n9m ───────┐
  MDVR outra marca ─▶ gate-xyz ─────┼──▶ contrato neutro ──▶ enriquecimento ──▶ …
  Gateway de terceiro ▶ adaptador ──┘         │
                                              └── comandos no sentido inverso
```

O `adaptador-gateway` deixa de ser um caso à parte: ele é só mais um gate. Não é
exceção no desenho, é o terceiro de uma lista.

### O contrato tem três partes

**Eventos que sobem.** Posição, leitura de sensor, alarme, macro do motorista,
mudança de estado, início e fim de sessão de mídia. Vocabulário de negócio, não
de protocolo: o gate já traduziu `DSNO` em identidade de aparelho e `ALARMUID`
em identificador de ocorrência. O envelope leva a família de origem só como
procedência, para auditoria — nunca para o consumidor ramificar em cima.

Se um serviço lá na frente precisar perguntar "veio do N9M?" para decidir algo, o
contrato está errado, e o lugar de corrigir é o contrato.

**Comandos que descem.** A plataforma emite intenção — habilitar botão de
destrave, pedir preview do canal 2, solicitar evidência da ocorrência tal — e o
gate traduz para o dialeto do seu fabricante. Quem comanda não monta pacote N9M,
não sabe que existe `SERIAL` de correlação, e não escolhe porta.

**Capacidades declaradas.** Nem todo aparelho faz tudo. No N9M isso já vem no
`CONNECT`: o campo `CHANNEL` diz quantas câmeras, `TSE` diz se há time shifting,
`EV` diz qual versão de upload de evidência. Cada gate traduz isso para uma lista
neutra de capacidades, e a interface usa essa lista para mostrar o comando como
**indisponível** em vez de enviável e recusado depois.

Essa disciplina já existe no front, um nível acima: `comandoAplicavel` confere
linha e firmware antes de oferecer o comando. É a mesma regra, aplicada na
fronteira do dispositivo.

### Onde a especificidade pode morar

Dentro do gate, e em mais lugar nenhum. O `gate-n9m` pode e deve conhecer o
cabeçalho de 32 bits, o gzip, a cascata de idempotência e a janela de 15
segundos. Nada disso atravessa a fronteira.

O teste de arquitetura do front tem equivalente aqui: **nenhum serviço fora de
`services/gate-*` pode importar um pacote de protocolo.** Vale escrever antes do
segundo fabricante existir, porque depois dele o acoplamento já aconteceu.

## O fato que decide a arquitetura de mídia

O N9M **separa a conexão de sinalização da conexão de mídia**, e é a plataforma
quem diz ao aparelho para onde mandar o vídeo:

> "For media connection, the server requests the media command to send message to
> the device through the message connection. The message includes media server
> address and the device automatically connects to this media address for media
> transmission." — N9M Summary, *Description of Mode*

Isso muda o problema de balanceamento de lugar. Não é preciso um balanceador na
frente da mídia decidindo para onde vai o fluxo: **o serviço de sinalização
escolhe o nó de mídia e entrega o endereço ao aparelho**. O balanceamento é uma
decisão de software, com o contexto todo em mãos — carga do nó, região do
veículo, qual nó já atende aquele cliente.

O ciclo de uma sessão de mídia (capítulo 03, *Streaming Media Link*):

```
   MDVR                  gate-n9m                gate-midia-n9m
     │  TCP persistente        │                           │
     ├────── CONNECT ─────────▶│                           │
     │◀───── resposta ─────────┤                           │
     │                         │                           │
     │◀── comando de preview ──┤  (contém IP:porta do nó)   │
     │        com endereço     │                           │
     ├─────────── TCP de mídia ────────────────────────────▶│
     ├─────────── criar canal de mídia ────────────────────▶│
     ├──── notificação de início de sessão ────────────────▶│
     ├══════════ bytes de vídeo ═══════════════════════════▶│
     ├──── notificação de fim de sessão ───────────────────▶│
```

As notificações de início e fim viajam pelo canal de mídia, e o comando sai pela
sinalização. Ou seja: **o gate de sinalização sabe quais sessões de mídia
existem**, sem precisar perguntar a ninguém. É daí que sai o diretório de
sessões.

## O que já está pronto

`avansat-n9m-backend` (Node/TypeScript, 651 linhas de fonte) resolve o canal de
sinalização e não é pouco:

- TCP multi-device com framing incremental, que é onde a maioria das
  implementações erra — frame fragmentado ou dois frames concatenados no mesmo
  pacote;
- `CERTIFICATE/CONNECT`, janela de 15 s para autenticar, allowlist por DSNO;
- keepalive e substituição segura de sessão na reconexão;
- gzip do N9M e teto de payload;
- envelope de ingestão versionado com **chave de idempotência** em cascata:
  `EVTUUID`, depois `RUN+ALARMUID+CMDNO`, depois `SERIAL`, por fim SHA-256 do
  conteúdo. Isso é o que impede alarme duplicado quando o aparelho reenvia;
- testes de integração TCP.

O codec vem de `@avansat/mdvr-n9m`, **o mesmo pacote que o app do motorista
usa**. Servidor e app falam o protocolo pelo mesmo código, com
`FakeN9mTransport` para teste. Esse compartilhamento é um ativo real e pesa na
decisão de linguagem.

O sink hoje escreve NDJSON no stdout. É o ponto de extensão previsto.

### O caminho local, que é outro caminho

`mdvr-sdk` fala HTTP com o servidor web do próprio MDVR na wifi local (entradas
e saídas digitais, capacidades, logs). `mdvr-video` lê o preview por WebSocket,
com parsing de cabeçalho de frame Streamax.

Isso não é redundância do caminho em nuvem: é o caminho de instalação e
manutenção, quando o técnico está ao lado do veículo. Vale manter separado e
não tentar unificar.

## Serviços

Seis papéis. Dois deles — sinalização e mídia — têm uma instância por família de
aparelho; os outros quatro são únicos e neutros.

### `gate-*` — sinalização, bidirecional, um por família

`gate-n9m` é o primeiro. Mantém a conexão TCP persistente de cada aparelho,
autentica, responde keepalive — e traduz, nos dois sentidos, entre o dialeto
Streamax e o contrato neutro.

**Os dois sentidos vivem aqui, e não podem viver separados.** Comando para o
aparelho só sai pela conexão que o aparelho mantém aberta, e quem a segura é
este processo. Um serviço de comandos à parte teria que pedir a este para
enviar — então o que ele seria é uma fila, não um serviço.

Publica no contrato neutro. Não decide nada de negócio: a tradução que ele faz é
de **formato**, não de regra. Quem resolve aparelho → veículo → cliente é o
enriquecimento, porque isso é cadastro e não protocolo.

### `gate-midia-*` — canal de mídia, também por família

Recebe as conexões de mídia dos aparelhos e distribui aos consumidores. Registra
seu endereço num diretório, para o gate de sinalização saber que existe e com
que carga.

**Também é por família**, e por um motivo concreto: o quadro de vídeo do
Streamax tem cabeçalho próprio — o `mdvr-video` do app já faz esse parsing, com
campos em little-endian de 24 bits. Outro fabricante empacota de outro jeito.

O que precisa ser neutro é a saída: o que sai para o navegador é um fluxo num
protocolo de web, e o consumidor não descobre de qual família veio. A fronteira
neutra fica entre o nó de mídia e o espectador, não entre o nó e o aparelho.

É o único serviço onde a linguagem muda o número (ver decisão abaixo).

### `enriquecimento` — bruto vira domínio

Traduz envelope N9M em evento Avansat: posição, leitura de sensor, alarme,
macro. Resolve aparelho → veículo → cliente. É aqui que `DSNO` vira `VTR-2048` e
ganha dono.

Separado do gate por uma razão prática: o gate não pode parar de responder
keepalive porque uma consulta de cadastro ficou lenta. Aparelho sem keepalive
derruba a conexão e reconecta, e reconexão em massa é como um pico vira apagão.

### `ingestao-telemetria` — ClickHouse

Escreve em lote. Posição, sensor, canal. Separado porque a escrita em lote tem
ritmo próprio e não deve ditar o ritmo do enriquecimento.

### `api` — o monolito modular

O que já está planejado em `services/api`. Postgres, cadastro e política.

### `workers` — trabalho longo

Orquestração de evidência é o caso principal, e ele é longo por natureza: a
plataforma pede, o aparelho aceita, procura o arquivo, envia, e isso leva
minutos. Capítulo 23 descreve o ciclo com `EUTSTAT` reportando andamento.

### `gate-terceiro` — quando a fonte é de fora

Você mencionou já conhecer soluções de gateway. Pela regra da neutralidade, isto
não é uma categoria nova: é um gate como os outros, que em vez de falar TCP com
o aparelho consome a API de quem já fala.

Implementa o mesmo contrato, publica os mesmos eventos, aceita os mesmos
comandos e declara as mesmas capacidades — provavelmente menos delas, e é
justamente isso que a lista de capacidades existe para expressar.

O ganho é a reversibilidade: dá para começar com gateway de terceiro para chegar
ao mercado antes, e migrar para o gate próprio depois, aparelho a aparelho, sem
que nenhuma tela saiba da troca.

## Linguagem

**Toda a borda de dispositivo em Go. Todo o resto em TypeScript.**

### Por que não o meio-termo

A primeira versão deste documento recomendava sinalização em TypeScript e só a
mídia em Go. Estava errado, por dois motivos.

O primeiro é que o argumento a favor do TS era de **adequação, não de
vantagem**: "Node dá conta desse perfil". Dar conta não justifica uma fronteira
de linguagem. Fronteira se paga com custo diário de quem mantém, e só vale
quando o outro lado ganha algo que compense.

O segundo é pior: aquela fronteira ficava no lugar errado. Sinalização e mídia
são **fortemente acopladas** — o gate de sinalização escolhe o nó de mídia,
entrega o endereço, recebe as notificações de início e fim de sessão e mantém o
diretório. Duas linguagens atravessando um acoplamento desses é exatamente onde
a salada dói.

### O argumento dos 10 segundos vira o contrário

Se a sinalização troca mensagem a cada 10 segundos, o processamento é
irrelevante. O que sobra como custo dominante é **segurar a conexão** — e é
justamente aí que Go ganha: uma goroutine ociosa custa alguns KB de pilha,
enquanto em Node cada socket carrega objeto, closures e pressão de coletor.

Ou seja, quanto mais leve for a mensagem, mais o peso migra para onde o Node é
pior. O argumento de que "é pouca coisa" reforça o Go, não o contrário.

### O custo real, medido

O que se perde é menor do que parecia:

| | Linhas |
|---|---|
| Codec que passaria a existir duas vezes | ~280 |
| Servidor N9M a reescrever | 464 |
| Sessão do app, que **nunca** foi compartilhável | 548 |

As 548 linhas de sessão não são perda: o app autentica **no** aparelho e o
servidor autentica **o** aparelho. São papéis opostos, e nunca foram o mesmo
código. O que de fato se compartilha hoje são os ~280 do codec.

Duplicar 280 linhas de codec é barato, e tem mitigação conhecida: **vetores de
teste dourados**. Um arquivo de casos em hexadecimal, e as duas implementações
obrigadas a codificar e decodificar igual. Isso transforma a duplicação de risco
em invariante verificada — e chega a ser melhor que a implementação única, onde
um erro de framing fica invisível porque os dois lados erram junto.

### O que Go ganha aqui

- Binário único, sem `node_modules` na borda;
- memória previsível por conexão, com milhares delas abertas;
- sem cauda de pausa de coletor no pico, que é quando mais importa;
- `splice` no Linux para a mídia não passar pelo espaço de usuário;
- uma linguagem só onde o acoplamento é maior.

### Onde fica a fronteira

Na mesma linha que o contrato neutro de dispositivo já desenha:

```
  Go  │  gate-n9m · gate-midia-n9m · gate-<outra família>
 ─────┼──────────── contrato neutro de dispositivo ────────────
  TS  │  enriquecimento · ingestão · api · workers · front
```

Isso não é salada, é o contrário: **a fronteira de linguagem coincide com uma
fronteira de contrato que teria de existir de qualquer jeito**, pela regra de
neutralidade de fabricante. Salada é quando as fronteiras são arbitrárias e se
cruzam; aqui há uma só, e ela já estava no desenho.

Do lado de cá ela continua TypeScript por um motivo concreto: enriquecimento,
API e workers compartilham `@avansat/contratos` com o front, no mesmo pacote e
nos mesmos tipos. Levar esses serviços para Go criaria uma segunda fronteira,
essa sim arbitrária, e obrigaria a gerar tipos para o front a partir de outra
fonte.

### O que a borda em Go não deve fazer

Nada de negócio. Ela traduz protocolo para contrato e contrato para protocolo, e
para por aí. Resolver aparelho → veículo → cliente é cadastro e fica do lado de
TypeScript, junto do resto do domínio.

## Não fazer over-engineering agora

### Fase 1, o que dá para fazer já

Um processo de sinalização e um de mídia, ambos em Go, publicando no contrato
neutro. Do outro lado da fronteira, enriquecimento e ingestão em TypeScript,
gravando em Postgres e ClickHouse. O gate entrega sempre o mesmo endereço de
mídia, porque só existe um nó.

O nó de mídia pode começar como repasse simples, sem `splice` nem pool — a
otimização entra quando a medição pedir. O que importa agora é ele já nascer em
Go, para não haver reescrita de linguagem no meio do caminho.

O que **não** pode ser adiado, porque é caro de retrofitar:

1. **O diretório de sessões desde o primeiro dia.** Redis mapeando
   `device+canal → nó de mídia`. Com um nó só ele parece inútil; sem ele, o dia
   do segundo nó é uma reescrita. É a estrutura que permite crescer, e custa
   pouco agora.
2. **O endereço de mídia como resposta de uma função**, nunca constante de
   ambiente. A função hoje devolve sempre o mesmo; amanhã ela escolhe. A
   chamada não muda.
3. **O envelope versionado**, que já existe.
4. **A idempotência**, que já existe.

### Fase 2, quando doer

O sinal de que chegou a hora é medível, não é opinião: latência de repasse de
mídia subindo no percentil 95, ou pausa de coletor aparecendo no perfil do
processo de mídia.

- vários nós de mídia, com o gate de sinalização escolhendo por carga e região;
- repasse com `splice` e pool de buffers no nó de mídia;
- sinalização horizontal atrás de um balanceador L4 simples — não precisa de
  afinidade, porque o aparelho reconecta e se reapresenta.

### Consumo, que é o outro lado do balanceamento

Operador e torre de controle consomem do nó que **segura** aquele fluxo — não dá
para balancear às cegas. O diretório de sessões resolve: o front pergunta à API
onde está a sessão, e recebe o endereço do nó certo.

Uma decisão de fase 2 que vale antecipar no pensamento: para muitos
espectadores no mesmo veículo, o nó de mídia deve publicar **um** fluxo e
espelhar para N, em vez de puxar N fluxos do aparelho. O MDVR tem link móvel; o
gargalo é o upload dele, não o nosso.

## Evidência e mídia armazenada

O capítulo 23 traz um detalhe que simplifica muito: o aparelho declara no
`CONNECT`, campo `EV`, qual versão de upload suporta. **`V2.0` é "plataforma
pede + upload por HTTP"**.

Onde o aparelho suportar V2.0, a evidência pode subir direto para o object
storage por URL assinada, sem atravessar nenhum serviço nosso. Isso elimina o
caminho mais pesado do sistema para a maior parte da frota nova, e deixa o
relay apenas para os aparelhos antigos.

Isso também é entrada para `docs/arquitetura/midia.md`, onde a decisão de como a
mídia chega ao navegador está em aberto: se o aparelho já sabe falar HTTP com
storage, o argumento a favor da URL assinada fica mais forte dos dois lados.

## O que precisa ser decidido

1. **Quais famílias de aparelho entram, e em que ordem.** É o que dimensiona
   quantos gates existirão e quão cedo o contrato neutro é posto à prova — um
   contrato com um só implementador ainda não provou que é neutro.
2. **Qual gateway terceiro está na mesa**, e se ele cobre mídia ou só
   telemetria. Muda o peso do nó de mídia.
3. **Quantos aparelhos e qual o pico de espectadores simultâneos.** É o que diz
   se a fase 2 é para daqui a seis meses ou dois anos.
4. **Qual fatia da frota declara `EV: V2.0`.** Decide se o upload direto ao
   storage é o caminho principal ou a exceção.
5. **Protocolo de entrega ao navegador**: WebRTC tem a latência que a parede de
   câmeras pede, HLS é mais simples e atrasa alguns segundos. Para intercom
   (capítulo 20), só WebRTC serve.
