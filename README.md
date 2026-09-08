# Avansat Risk

Frontend demonstrativo para monitoramento de vídeo e gestão de risco operacional em frotas.

## Funcionalidades

- Dashboard operacional com score de segurança, riscos ativos e saúde da operação.
- Monitoramento ao vivo com árvore de frotas e veículos, mapa operacional e painel de câmeras.
- Seleção múltipla e modo mosaico para acompanhar vários dispositivos simultaneamente.
- Parede de monitoramento externa em `?display=mosaic`, adequada para TV ou monitor adicional.
- Evidências e vídeo, relatórios, regras e geocercas, tráfego, motoristas, treinamento e gestão de frota.
- Persistência local demonstrativa para riscos, intervenções, comentários e auditoria.

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

## Modo mosaico

Abra **Monitoramento ao vivo**, selecione os veículos usando os checkboxes na árvore e ative **Mosaico**. A ação **Abrir em tela** abre uma parede de monitoramento independente em uma nova janela, que pode ser movida para uma TV ou monitor adicional.

> Os dados atuais são demonstrativos e executados no frontend. Integrações reais com GPS, streaming MDVR, autenticação e APIs de telemetria devem ser conectadas em uma próxima etapa.
