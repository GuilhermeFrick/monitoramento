# gate-n9m

A borda do N9M. Hoje tem duas coisas: o codec de enquadramento, que é
definitivo, e a **sonda** (`cmd/probe`), que é instrumento de bancada e sai de
cena quando o gate existir.

> **Convenção:** código em inglês — identificadores, comentários e nomes de
> arquivo. A documentação de arquitetura em `docs/` continua em português.

## Estrutura

```
cmd/probe/           flags e ligação das peças
internal/n9m/        o protocolo
  frame.go           cabeçalho de 12 bytes, leitura e escrita
  message.go         envelope JSON, CONNECT, KEEPALIVE
internal/probe/      o servidor de escuta da sonda
test/                os testes, separados do código
tools/watch.py       visualizador ao vivo do log
```

Os testes ficam em `test/`, fora do pacote que exercitam. Isso não é a convenção
do Go e tem um preço: só alcançam identificadores exportados, então função
interna só se testa através de alguma chamada pública que a use. E a cobertura
precisa de flag explícita:

```bash
go test ./test/ -coverpkg=./internal/... -cover
```

`internal/n9m` não sabe que existe socket e `internal/probe` não sabe decodificar
cabeçalho. É o que vai permitir o gate reusar o codec sem arrastar junto o
comportamento de sonda, que é o oposto do que o gate precisa fazer.

## Rodar

```bash
go run ./cmd/probe -addr :7001 -reply -capture ./captures
./tools/watch.py /caminho/do/log      # visão legível, uma linha por mensagem
```

| Flag | Efeito |
|---|---|
| `-addr` | endereço de escuta, padrão `:7001` |
| `-reply` | mantém a sessão viva; sem ela a sonda fica muda e o aparelho reconecta |
| `-capture` | diretório para os bytes crus, um arquivo por conexão |
| `-maskcmd` | quais fluxos de histórico aceitamos no `CONNECT` |

Depois aponte o endereço de servidor do MDVR para esta máquina. Nos aparelhos
testados a conexão é com **um servidor de cada vez**, então um slot reserva só
recebe tráfego quando o principal falha — para observar de verdade, aponte o
slot que está em uso.

## Por que uma sonda antes do gate

Documentação de fabricante e fio nem sempre concordam, e neste caso não
concordaram. A sonda escuta, decodifica e grava os bytes crus, para a
discordância ficar registrada em vez de virar lembrança. O que ela achou está em
[docs/arquitetura/n9m-observado.md](../../docs/arquitetura/n9m-observado.md).

Ela responde só a `CONNECT` e `KEEPALIVE`, porque sem isso a sessão cai em 5
segundos e nunca se vê telemetria. Todo o resto é registrado e não respondido, de
propósito: sonda que diz sim para qualquer comando faz o aparelho agir, e aí
deixou de ser sonda.

Ela **não** consulta cadastro e aceita qualquer serial. É o oposto do que o gate
vai fazer — o capítulo 03 manda recusar aparelho desconhecido. Por isso ela só
roda em bancada, nunca em endereço público.

## O codec

Três decisões que vale dizer em voz alta, e todas vieram de medição:

**Versão não é verificada.** A checagem que existia exigia `V=1` nos dois bits
mais altos e derrubava toda conexão do aparelho real. Só o limite de tamanho
protege contra dessincronismo agora.

**Compressão é detectada pela assinatura gzip**, não pelo bit `M`, cuja posição
não dá para confirmar num quadro onde quase tudo é zero.

**Cifrado continua cifrado.** Sem a chave, os bytes voltam como vieram e a flag
fica no cabeçalho. Fingir que o payload é legível seria pior que falhar.

Os testes montam os cabeçalhos à mão a partir da tabela da documentação **e** a
partir dos bytes reais capturados. Os dois conjuntos discordam, e é essa
discordância que o `TestDecodeRealDeviceHeader` guarda.
