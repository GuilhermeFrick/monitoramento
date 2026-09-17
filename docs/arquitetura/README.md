# Arquitetura

Duas regras governam este repositório. Ambas existem porque já custaram caro
quando não existiam.

## 1. Fatias verticais por domínio

Uma pasta por domínio do negócio, com **tudo** daquele domínio dentro: tipos,
acesso a dados, telas e componentes próprios. Não há pasta por tipo de arquivo.

```
frontend/client/src/
  infra/          HTTP, formatação, hooks genéricos — não conhece negócio
  componentes/    UI genérica — não conhece negócio
  dominios/
    cercas/       tipos, repositório, mapeamento, telas, componentes da cerca
    rotogramas/
    jornada/
  app/            a casca: roteador, shell, providers
```

**A dependência é de mão única.** `app` pode tudo. `dominios` podem usar `infra`
e `componentes`. Esses dois não podem nada. E **um domínio nunca importa outro**.

Quando duas telas precisam do mesmo dado, quem cruza é a casca, passando por
props. Não existe "só desta vez": o primeiro atalho entre domínios é o que
transforma quinze fatias independentes num novelo onde mexer em cercas quebra
jornada.

**De fora, um domínio só se acessa pela porta** — o `index.ts`. O resto é
detalhe interno e pode mudar sem avisar ninguém.

### Domínio ou infraestrutura?

Se o nome só faz sentido para quem conhece o negócio, é domínio.
`formatarDistancia` é infra. `vigenteEm` é domínio.

### A regra é um teste, não um combinado

`frontend/testes/arquitetura.test.ts` varre os imports e quebra o build em cada
violação, com a mensagem dizendo o que fazer. Regra que vive só em documento é
intenção; o que segura estrutura é algo que falha.

O teste também imprime quantos arquivos já estão em cada camada, para a migração
do código legado ter medida em vez de sensação.

## 2. Contrato antes da tela

### Backend falso

`services/api-falsa` sobe com um comando e espelha o contrato real. Ele existe
para o front desenvolver antes do backend, e para o contrato ser exercitado
enquanto ainda está sendo escrito.

**Ele mente o mínimo.** Devolve os mesmos códigos do real e aplica a mesma regra
de escopo por cliente:

| Situação | Código | Status |
|---|---|---|
| Sem credencial | `nao_autenticado` | 401 |
| Sem o cabeçalho de cliente | `sem_permissao` | 403 |
| Id de outro cliente | `nao_encontrado` | 404 |
| Corpo inválido | `validacao` | 422 |
| Versão defasada, nome repetido | `conflito` | 409 |

O 404 para id de outro cliente é deliberado: um 403 contaria ao chamador que
aquele id existe em algum lugar, que é justamente o vazamento que o escopo
deveria impedir.

Um falso permissivo é pior que nenhum. Ele treina a tela a não tratar o erro que
só vai aparecer em produção.

### Repositório por domínio

Uma interface descrevendo as operações em vocabulário de negócio, uma
implementação HTTP e uma em memória, escolhidas por variável de ambiente
(`VITE_ORIGEM_DADOS`). **Nenhum componente conhece URL, verbo, cabeçalho ou
formato de transporte.**

A implementação em memória também mente o mínimo: aplica o mesmo conflito de
versão e o mesmo erro de nome repetido do real.

### Tradução num lugar só

`dominios/<x>/mapeamento.ts` é o único ponto onde transporte e domínio se
encontram. Duas garantias que ele existe para dar:

- **Data inválida vira nulo, nunca `Invalid Date`.** Um `Invalid Date` não
  explode: formata como texto no meio da tela e faz toda comparação dar falso.
- **Campo ausente vira o vazio do tipo, nunca `undefined`.** `undefined`
  viajando pela tela produz o erro de ler propriedade de indefinido, três
  componentes abaixo de onde o dado entrou.

### Campo que decide é obrigatório

Todo campo que a interface usa para decidir alguma coisa — habilitar botão,
filtrar, ramificar — entra como **chave obrigatória** no tipo, mesmo que o valor
possa ser nulo. Chave opcional esquecida no mapeamento passa pelo compilador e
vira bug silencioso; chave obrigatória com valor nulo não passa.

### Quando o backend ainda não tem

Implemente no falso, marque como proposta e escreva o motivo. Nunca finja que já
existe. Ver [propostas.md](propostas.md).

## Estado da migração

O app atual vive em `frontend/` e ainda está organizado por tipo de arquivo.
`cercas` é a primeira fatia vertical e serve de molde; os demais domínios migram
um a um. O teste de arquitetura mede o avanço a cada execução.
