# Avansat Risk

Frontend demonstrativo para monitoramento de vídeo e gestão de risco operacional em frotas.

## Funcionalidades

- Dashboard operacional com score de segurança, riscos ativos e saúde da operação.
- Monitoramento ao vivo com árvore de frotas e veículos, mapa operacional e painel de câmeras.
- Seleção múltipla e modo mosaico para acompanhar vários dispositivos simultaneamente.
- Parede de monitoramento externa em `?display=mosaic`, adequada para TV ou monitor adicional.
- Eventos ordenados pelo instante do fato, com distinção entre condição (início e fim) e marco, marcação de entrega atrasada, perda de sinal com última posição conhecida e evento de coação visível só na gestão de risco.
- Evidências e vídeo, relatórios, tráfego, motoristas, treinamento e gestão de frota.
- Regras e geocercas separadas por objeto do produto: **Perfil operacional** (postura de atuadores, sensores armados, gatilhos por geocerca ou macro, acionamento temporário/permanente, canal de contingência), **Pontos de controle e rotograma** (categoria, política, precedência, pontos fixos, trechos com limites de telemetria e desvio de cronograma em cinco níveis, áreas de controle como leitura derivada), **Cercas** (ativa/inativa sem excluir) e **Rotas** (corredor e desvio).
- **Provisionamento**: catálogo versionado, embarques com aceite item a item por equipamento, bloqueio de emissão por dependência não embarcada ou sobreposição sem precedência, e limpeza da política embarcada preservando pontos fixos.
- **Segurança operacional**: credenciais por veículo, senhas de operação e coação obrigatoriamente diferentes, revogação individual ou em lote.
- **Comandos ao veículo**: comando direto ou delegado ao motorista (habilitar botão em modo único ou persistente com confirmação em duas etapas), aplicabilidade por linha/firmware e observação obrigatória preservada no histórico.
- Mensageria motorista ↔ central com confirmação de leitura, como aba do Centro de tráfego.
- Persistência local demonstrativa (`localStorage`) para riscos, tratamento, comentários, auditoria, perfis, pontos, cercas, rotas, embarques, credenciais, eventos e mensagens.

## Execução local

```bash
pnpm install
pnpm dev
```

Para validar o projeto:

```bash
pnpm check
pnpm build
```

## Execução com Docker

Com Docker e Docker Compose instalados, execute:

```bash
docker compose up --build
```

A aplicação ficará disponível em <http://localhost:3001>. Para usar
outra porta, defina `APP_PORT` antes do comando (por exemplo,
`APP_PORT=8080 docker compose up --build`).

Para encerrar:

```bash
docker compose down
```

## Modo mosaico

Abra **Monitoramento ao vivo**, selecione os veículos usando os checkboxes na árvore e ative **Mosaico**. A ação **Abrir em tela** abre uma parede de monitoramento independente em uma nova janela, que pode ser movida para uma TV ou monitor adicional.

> Os dados atuais são demonstrativos e executados no frontend. Integrações reais com GPS, streaming MDVR, autenticação e APIs de telemetria devem ser conectadas em uma próxima etapa.
