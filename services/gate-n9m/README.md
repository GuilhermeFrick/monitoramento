# gate-n9m

A borda do N9M. Hoje tem duas coisas: o codec de enquadramento, que é
definitivo, e a **sonda**, que é instrumento de bancada e vai embora quando o
gate existir.

## Por que uma sonda antes do gate

O capítulo 02 descreve o cabeçalho e o 03 descreve a autenticação, mas
documentação de fabricante e fio nem sempre concordam. A sonda escuta, decodifica
e mostra o que o aparelho manda de verdade — e grava os bytes crus, para a
discordância ficar registrada em vez de virar lembrança.

Ela responde a duas coisas só, `CONNECT` e `KEEPALIVE`, porque sem isso a sessão
cai em 5 segundos e nunca chegamos a ver telemetria. Todo o resto é registrado e
não respondido, de propósito: sonda que diz sim para qualquer comando faz o
aparelho agir, e aí deixou de ser sonda.

Ela **não** consulta cadastro e aceita qualquer `DSNO`. É o oposto do que o gate
vai fazer — o protocolo manda recusar aparelho desconhecido. Por isso ela só
roda em bancada, nunca em endereço público.

## Rodar

```bash
go run ./cmd/sonda -porta 7001 -responder -saida ./capturas
```

| Flag | Efeito |
|---|---|
| `-porta` | porta TCP de escuta, padrão 7001 |
| `-responder` | mantém a sessão viva; sem ela a sonda fica muda e o aparelho reconecta |
| `-saida` | diretório para os bytes crus, um arquivo por conexão |

Depois aponte o **Servidor 2** do MDVR (`Configuração → Definição de rede →
Definição de servidor`) para o IP desta máquina. O `Servidor 1` continua na
Avansat pelo 4G, então nada para de funcionar enquanto se observa.

## O codec

`interno/n9m` implementa o cabeçalho de 12 bytes do capítulo 02. Duas decisões
que valem dizer em voz alta:

**Versão diferente de 1 é erro, não aviso.** Significa que o enquadramento
saiu de lugar, e seguir lendo dali produz payloads absurdos e alocações enormes.
Derruba a conexão; o aparelho reconecta.

**Cifrado continua cifrado.** Sem a chave, `LerQuadro` devolve os bytes como
vieram e sinaliza pelo cabeçalho. Fingir que o payload é legível seria pior que
falhar.

Os testes montam os cabeçalhos à mão a partir da tabela da documentação, não a
partir do código — é a única forma de o teste discordar de um erro de leitura da
tabela. Trocar as máscaras de `P` e `M` faz dois deles quebrarem, que foi como se
verificou que eles têm dente.
