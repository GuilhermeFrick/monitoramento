# services/api — monolito modular

Um processo, fronteiras de domínio impostas no código. A escolha foi deliberada:
um serviço por domínio paga custo de rede, deploy e observabilidade antes de
haver volume que justifique, e extrair um domínio depois fica barato **porque a
fronteira já é testada**.

```
src/
  dominios/<x>/    esquema.sql, repositorio.ts, repositorio.postgres.ts, rotas.ts
  infra/           pool, middleware de escopo, envelope de erro
```

Mesmas regras do front: um domínio não importa outro, e de fora só se acessa
pela porta. O teste de arquitetura passa a varrer esta pasta quando o primeiro
domínio migrar para cá.

## Estado

Esqueleto. O backend que existe hoje vive em `frontend/server` (Express + tRPC,
mais o serviço de roteirização) e migra para cá domínio a domínio. O esquema de
cercas já está escrito porque é o domínio de referência.
