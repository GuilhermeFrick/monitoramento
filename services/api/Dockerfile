# syntax=docker/dockerfile:1
#
# Imagem da API. O contexto é a RAIZ do monorepo, como a do front: a API depende
# de @avansat/contratos por workspace, e um contexto restrito a services/api não
# enxerga o pacote.

FROM node:24-alpine AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

# Manifestos primeiro: a camada de instalação só invalida quando a árvore de
# dependências muda de verdade.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY frontend/package.json ./frontend/
COPY packages/contratos/package.json ./packages/contratos/
COPY services/api-falsa/package.json ./services/api-falsa/
COPY services/api/package.json ./services/api/
COPY services/ingestao/package.json ./services/ingestao/
COPY services/workers/package.json ./services/workers/
COPY frontend/patches ./frontend/patches

RUN pnpm install --frozen-lockfile --filter @avansat/api...

COPY packages ./packages
COPY services/api ./services/api

FROM node:24-alpine AS runtime

ENV NODE_ENV=production

# O layout do workspace é preservado pelo mesmo motivo do Dockerfile do front:
# em pnpm, services/api/node_modules é um punhado de symlinks para
# ../../node_modules/.pnpm. Copiar a pasta para outro caminho deixa todo link
# apontando para o vazio, e o processo morre no primeiro import.
WORKDIR /repo/services/api

COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/packages /repo/packages
COPY --from=build /repo/package.json /repo/pnpm-workspace.yaml /repo/
COPY --from=build /repo/services/api/node_modules ./node_modules
COPY --from=build /repo/services/api/package.json ./package.json
COPY --from=build /repo/services/api/src ./src

EXPOSE 4001

# Bate em /saude, que é a única rota sem credencial — healthcheck que precisa de
# token não serve para orquestrador nenhum.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4001/saude').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["./node_modules/.bin/tsx", "src/servidor.ts"]
