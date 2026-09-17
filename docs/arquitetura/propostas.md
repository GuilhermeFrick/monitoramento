# Propostas de contrato

Quando o front precisa de algo que o backend ainda não tem, o caminho é:
implementar no falso, **registrar aqui**, e escrever o motivo. Nunca fingir que
já existe — um contrato que só vive no falso e não está marcado vira integração
quebrada com o time de backend achando que entregou.

Formato: o que falta, por que a tela precisa, e o que o falso faz enquanto isso.

---

## Nenhuma proposta em aberto

O domínio de cercas foi modelado a partir do que o mock já usava, e o falso não
inventou campo além disso.

---

## Modelo

### `PATCH /api/cercas/:id` — alteração parcial com versão

**Por que a tela precisa:** dois operadores editando a mesma cerca é situação
real na central. Sem versão no corpo, o último a salvar apaga o trabalho do
primeiro em silêncio.

**O que o falso faz:** compara `versao` do corpo com a guardada; divergiu,
devolve 409 dizendo as duas versões.

**Status:** implementado no falso. Falta confirmar com o backend se o mecanismo
será versão inteira ou ETag.
