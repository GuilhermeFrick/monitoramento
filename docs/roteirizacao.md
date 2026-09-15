# Roteirização operacional

O editor usa Leaflet e o backend consulta o openrouteservice `driving-hgv`. Não há fallback para curvas simuladas. A chave é exclusiva do servidor; nenhuma variável `VITE_` deve conter essa credencial.

## Configuração no container

Crie `.env` na raiz (ignorado pelo Git e pelo contexto do Docker):

```dotenv
APP_PORT=3002
OPENROUTESERVICE_API_KEY=sua_chave
```

Recrie apenas o serviço desta aplicação:

```bash
docker compose up -d --build app
```

Se não houver `.env` com a porta, use `APP_PORT=3002 docker compose up -d --build app`. A chave entra em runtime, não durante o build. O endpoint `GET /api/routing/status` informa apenas se a integração está configurada, nunca o valor da chave.

Para produção, configure um provedor de tiles autorizado para seu volume e sua atribuição:

```dotenv
VITE_MAP_TILE_URL=https://seu-provedor/{z}/{x}/{y}.png
VITE_MAP_ATTRIBUTION=Atribuição exigida pelo provedor
```

Essas duas opções são públicas e exigem reconstruir a imagem. Sem configuração, o mapa local usa a base comunitária do OpenStreetMap. Observe a [política de tiles](https://operations.osmfoundation.org/policies/tiles/). Não use uma credencial secreta na URL pública dos tiles.

## Uso

Em “Pontos de controle e rotograma”, escolha o veículo e abra “Definir/Trocar traçado”. A aba Roteirizar oferece origem, destino, paradas e passagens. O painel esquerdo é recolhível. Local cadastrado, busca de endereço e clique no mapa são alternativas para escolher cada local.

- Paradas criam trechos e novos pontos de controle quando necessário. O cadastro só acontece ao aplicar; cancelar descarta os novos pontos.
- Arrastar um local cadastrado cria uma nova localização no rascunho. O ponto compartilhado do catálogo não é movido.
- Passagens modelam o caminho sem criar cadastro ou trecho operacional. Adicione pelo botão Passagem ou clicando no traçado atualizado.
- Arraste marcadores para recalcular após soltar. Pelo teclado, use as setas no marcador, com Shift para passos maiores. Também é possível editar coordenadas nos campos.
- Reordene pelo painel. Desfazer recupera a última edição. Mudanças deixam o resultado desatualizado até novo cálculo.
- O último caminho válido permanece na tela durante loading e falhas; aplicar fica bloqueado enquanto estiver desatualizado.
- Ao aplicar, distâncias e tempos do provedor substituem as estimativas; os limites são preservados somente quando o par origem/destino do trecho permanece igual.
- Publicar cria um snapshot com versão, geometria, trechos e pontos. Editar preserva o snapshot anterior. Publicação nesta etapa é local, como o restante do protótipo; não há novo transporte para o MDVR nem confirmação de recebimento real.

O editor preserva a geometria detalhada do provedor. A serialização e simplificação para os limites reais do firmware devem ser feitas no adaptador de embarque, após confirmar esses limites; o teto de importação preexistente de 200 vértices é uma estimativa, não uma especificação verificada do MDVR.

## Contrato e limites

`shared/roteirizacao.ts` define os contratos e as conversões `[longitude, latitude]` ↔ `{lat,lng}`. `server/routing/service.ts` concentra a autenticação, os parâmetros HGV, a normalização e os erros do provedor. `POST /api/routing/calculate` recebe `PedidoRoteirizacao`; `POST /api/routing/search` recebe `{texto}` e limita a busca ao Brasil.

O contrato aceita `areasProibidas` como GeoJSON MultiPolygon fechado. A vinculação dessas áreas ao catálogo de cercas está preparada no backend, mas ainda não há seletor de cercas neste editor.

O perfil considera altura, largura, comprimento, peso, carga por eixo, carga perigosa, pedágios e balsas. A opção de excluir vias não pavimentadas é explicitamente recusada: não há parâmetro documentado confiável equivalente no serviço hospedado usado aqui. A qualidade e a cobertura das restrições dependem dos dados viários; o resultado não equivale à homologação operacional de uma rota. Duração é estimativa do provedor, sem somar permanências das paradas ou prometer trânsito em tempo real.

O backend tem timeout de 20 segundos, cancelamento por desconexão, máximo de 50 pontos, quatro consultas simultâneas e 30 consultas por minuto por processo. O frontend descarta respostas obsoletas mesmo se o transporte ignorar cancelamento. O endpoint segue o acesso local sem login desta aplicação; antes de expor a instalação publicamente, vincule-o à autenticação e às quotas por organização.

Não foram adicionadas dependências. A integração usa o `fetch` do Node 24, Zod e Leaflet já presentes.

## Verificação

```bash
npm run check
npm test
npm run build
node_modules/.bin/tsx smoke-geografia.tsx
```

Os testes do adaptador usam respostas controladas e não consomem cota. Sem `OPENROUTESERVICE_API_KEY`, o teste real de malha viária e de geocodificação permanece pendente. Não confundir sucesso de fixtures com validação da cobertura do provedor.

Referência: [opções oficiais do openrouteservice](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/routing-options).
