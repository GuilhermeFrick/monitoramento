# Prompt — acesso ao MDVR (telnet e configurador web)

> Cole a partir de "## Contexto". Este cabeçalho não faz parte do prompt.

---

## Contexto

Você vai trabalhar com um **MDVR Streamax** (modelos M1N 2.0 ou X1NAI) numa
bancada de teste. Há dois caminhos de acesso, e eles servem a coisas
diferentes.

## 1. Telnet — shell no equipamento

Para inspecionar sistema de arquivos, processos, logs e configuração bruta.

```bash
telnet <IP_DO_DEVICE>        # porta 23
```

| Device | Usuário | Senha |
|---|---|---|
| M1N 2.0 de bancada (`192.168.15.100`) | `root` | `RMSoft1107` |
| Demais / X1NAI | `root` | `321456` |

O M1N 2.0 de bancada já sobe com `telnetd` ativo.

⚠️ **`telnetlib` foi removido do Python 3.13.** Se for automatizar, use socket
cru tratando os bytes IAC da negociação telnet — não presuma que o módulo
existe.

⚠️ **O rootfs é squashfs somente-leitura.** Trocar senha com `passwd` **não
persiste**: no X1NAI, `/etc/passwd` é symlink para `/var/run/passwd`, e o boot
copia `/root/passwd` por cima. Alterar de verdade exige repack do firmware.

## 2. Configurador web — a API HTTP

O equipamento roda **nginx na porta 80**, com o portal em `http://<IP>/` e uma
API JSON em `/devapi/v1/basic/<comando>`.

Envelope de resposta: `{"errorcode": 200, "data": {...}}`
— `200` ok · `406` sessão expirada · `410` falha de autenticação.

### Login

A senha vai **cifrada em DES-ECB**, chave `"streaming_rsp"` (só os 8 primeiros
bytes valem: `streamin`), *ZeroPadding*, saída em hex. Exemplo: `Avs01472` do
usuário `admin` vira `7d1cf897946ca1ac`.

```bash
curl -c cookies.txt -X POST http://<IP>/devapi/v1/basic/key \
  -H 'Content-Type: application/json' \
  --data '{"username":"admin","password":"<senha_des_hex>","language":1,"autoLogin":1,"pwenc":1}'
```

Devolve cookies `sessionId` / `session` / `uid` / `userRole`. Use `-b cookies.txt`
nas chamadas seguintes.

### Ler e gravar parâmetros

```http
GET  /devapi/v1/basic/systemparam?type=<tipo>&pwenc=1     # lê
POST /devapi/v1/basic/systemparam                          # grava
GET  /devapi/v1/basic/defaultsystemparam?type=<tipo>       # valores de fábrica
```

Corpo da gravação: `{"PARAMETER": {"MDVR": {...}}, "pwenc": 1}` — equivale ao
`RM_SDK_Global_SetParameter` do SDK e ao `CONFIGMODEL SET` do protocolo N9M.

### Duas armadilhas do configurador

**Não existe endpoint para acionar saída digital.** O `getiostatus` só **lê**
entradas. Acionar saída pela rede exige um processo no device que observe um
parâmetro e chame `RM_SDK_Device_ControlIoOut`.

**`SetParameter` descarta nós desconhecidos em silêncio** — devolve sucesso e
não grava nada. A árvore de parâmetros vive em `cfg/default.jsn` e
`cfg/validate.jsn`, dentro do squashfs somente-leitura. Só existem os nós que
já estão lá; criar um novo exige repack do firmware.

### Onde olhar o que já foi mapeado

| Arquivo | Conteúdo |
|---|---|
| `repos/api-configurador/mdvr-api-mapeamento.md` | arquitetura da API e requisições observadas |
| `repos/api-configurador/mdvr-endpoints-confirmados.txt` | lista de endpoints extraída do JavaScript do portal |
| `repos/api-configurador/mdvr-inventario-completo.md` | inventário de parâmetros |
| `toolchain/X1N1/sdk/streamaxsdk/resource/webapp/html/common/app-config.js` | fonte do portal — `pwd2DES`, `saveSysParameter` |

## Como se orientar

Antes de método invasivo, **procure na documentação do SDK** (`grep` em
`repos/sdk_documentation_n9m2/`). Boa parte do que parece precisar de
engenharia reversa já está documentada.

Ao descobrir algo pelo telnet ou pela API, **registre o comando exato e a
saída** — inferência sobre campo de parâmetro é a principal fonte de erro
aqui, e escrever com base em palpite desconfigura sensor que funciona.
