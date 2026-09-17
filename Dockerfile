# syntax=docker/dockerfile:1
#
# Imagem do app. O contexto é a RAIZ do monorepo, não frontend/: desde que o
# front passou a depender de @avansat/contratos por workspace, um contexto
# restrito à pasta do front não enxerga o pacote e a instalação quebra.

FROM node:24-alpine AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

# Manifestos primeiro, para a camada de instalação só invalidar quando a árvore
# de dependências mudar de verdade.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY frontend/package.json ./frontend/
COPY packages/contratos/package.json ./packages/contratos/
COPY services/api-falsa/package.json ./services/api-falsa/
COPY services/api/package.json ./services/api/
COPY services/ingestao/package.json ./services/ingestao/
COPY services/workers/package.json ./services/workers/
COPY frontend/patches ./frontend/patches

RUN pnpm install --frozen-lockfile

COPY packages ./packages
COPY frontend ./frontend

RUN pnpm --filter avansat-risk build

FROM node:24-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=3000

# O layout do workspace é preservado de propósito. Em pnpm, frontend/node_modules
# é só um punhado de symlinks para ../../node_modules/.pnpm; copiar aquela pasta
# para outro lugar deixa todo link apontando para o vazio, e o processo morre no
# primeiro import com ERR_MODULE_NOT_FOUND. Mantendo os mesmos caminhos
# relativos, os links continuam válidos.
WORKDIR /repo/frontend

COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/packages /repo/packages
COPY --from=build /repo/package.json /repo/pnpm-workspace.yaml /repo/
COPY --from=build /repo/frontend/node_modules ./node_modules
COPY --from=build /repo/frontend/package.json ./package.json
COPY --from=build /repo/frontend/dist ./dist

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
