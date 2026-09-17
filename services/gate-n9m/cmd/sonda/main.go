// Comando sonda — escuta N9M e mostra o que o aparelho manda.
//
// Isto não é o gate. É o instrumento que troca documentação por medição antes
// de escrevermos o gate: aponta o Servidor 2 do MDVR para cá e observa o que
// chega de verdade no fio.
//
// O que ele responde:
//
//	CERTIFICATE/CONNECT     sucesso, se -responder estiver ligado
//	CERTIFICATE/KEEPALIVE   eco, que é o que o protocolo manda
//
// Tudo o mais é registrado e não respondido, de propósito. Uma sonda que diz
// sim para qualquer coisa faz o aparelho agir, e aí ela deixou de ser sonda.
//
// Sem -responder, a sonda fica muda: o aparelho desiste em 5s e reconecta, o
// que já mostra o CONNECT e o comportamento de reconexão. Com -responder, a
// sessão se mantém e a telemetria começa a aparecer.
//
// Uso:
//
//	go run ./cmd/sonda -porta 7001 -responder -saida ./capturas
package main

import (
	"bufio"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"path/filepath"
	"sync/atomic"
	"time"

	"avansat/gate-n9m/interno/n9m"
)

var (
	porta     = flag.String("porta", "7001", "porta TCP de escuta")
	saida     = flag.String("saida", "", "diretório para gravar os bytes crus de cada conexão (vazio = não grava)")
	responder = flag.Bool("responder", false, "responder CONNECT e KEEPALIVE para manter a sessão viva")
)

var seq atomic.Uint64

func main() {
	flag.Parse()
	log.SetFlags(0)

	if *saida != "" {
		if err := os.MkdirAll(*saida, 0o755); err != nil {
			log.Fatalf("não consegui criar %s: %v", *saida, err)
		}
	}

	ouvinte, err := net.Listen("tcp", ":"+*porta)
	if err != nil {
		log.Fatalf("não consegui escutar na porta %s: %v", *porta, err)
	}
	defer ouvinte.Close()

	modo := "muda (não responde nada)"
	if *responder {
		modo = "responde CONNECT e KEEPALIVE"
	}
	log.Printf("sonda N9M escutando em :%s — %s", *porta, modo)
	for _, ip := range enderecosLocais() {
		log.Printf("  aponte o aparelho para  %s:%s", ip, *porta)
	}

	for {
		conexao, err := ouvinte.Accept()
		if err != nil {
			log.Printf("accept falhou: %v", err)
			continue
		}
		go atender(conexao)
	}
}

func atender(conexao net.Conn) {
	defer conexao.Close()

	id := seq.Add(1)
	inicio := time.Now()
	marca := func(formato string, args ...any) {
		log.Printf("[%03d %8.3fs] %s", id, time.Since(inicio).Seconds(), fmt.Sprintf(formato, args...))
	}
	marca("conectou de %s", conexao.RemoteAddr())

	var fonte io.Reader = conexao
	if *saida != "" {
		nome := filepath.Join(*saida, fmt.Sprintf("%s-%03d.bin", inicio.Format("20060102-150405"), id))
		arquivo, err := os.Create(nome)
		if err != nil {
			marca("não consegui gravar em %s: %v", nome, err)
		} else {
			defer arquivo.Close()
			fonte = io.TeeReader(conexao, arquivo)
			marca("bytes crus indo para %s", nome)
		}
	}

	leitor := bufio.NewReaderSize(fonte, 64<<10)
	quadros := 0

	for {
		quadro, err := n9m.LerQuadro(leitor)
		if err != nil {
			if err == io.EOF {
				marca("aparelho fechou a conexão depois de %d quadros", quadros)
			} else {
				marca("ERRO %v (depois de %d quadros) — os primeiros bytes do que sobrou:", err, quadros)
				despejar(leitor, marca)
			}
			return
		}
		quadros++
		marca("← %s", quadro.Cabecalho)
		if quadro.Comprimido {
			marca("    veio comprimido: %dB no fio, %dB abertos", len(quadro.Bruto), len(quadro.Payload))
		}
		tratar(conexao, quadro, marca)
	}
}

// comando é o mínimo do envelope JSON que precisamos ler para decidir se
// respondemos. O resto do conteúdo é mostrado cru, sem interpretação.
type comando struct {
	Module    string          `json:"MODULE"`
	Operation string          `json:"OPERATION"`
	Session   string          `json:"SESSION"`
	Parameter json.RawMessage `json:"PARAMETER"`
}

func tratar(conexao net.Conn, quadro *n9m.Quadro, marca func(string, ...any)) {
	if quadro.Cabecalho.Tipo != n9m.TipoComando {
		// Mídia e afins: só o tamanho interessa agora, o conteúdo é binário.
		if n := len(quadro.Payload); n > 0 {
			marca("    %d bytes binários, começando com %s", n, hex.EncodeToString(quadro.Payload[:min(16, n)]))
		}
		return
	}

	marca("    %s", string(quadro.Payload))

	var c comando
	if err := json.Unmarshal(quadro.Payload, &c); err != nil {
		marca("    (não é JSON válido: %v)", err)
		return
	}
	if !*responder || c.Module != "CERTIFICATE" {
		return
	}

	switch c.Operation {
	case "CONNECT":
		corpo, _ := json.Marshal(map[string]any{
			"MODULE":    "CERTIFICATE",
			"OPERATION": "CONNECT",
			"SESSION":   c.Session,
			"RESPONSE": map[string]any{
				"ERRORCODE":  0,
				"ERRORCAUSE": "SUCCESS",
				"MASKCMD":    1,
			},
		})
		responderCom(conexao, quadro.Cabecalho, corpo, marca)
	case "KEEPALIVE":
		// O protocolo pede o mesmo JSON de volta, sem RESPONSE.
		corpo, _ := json.Marshal(map[string]any{
			"MODULE":    "CERTIFICATE",
			"OPERATION": "KEEPALIVE",
			"SESSION":   c.Session,
		})
		responderCom(conexao, quadro.Cabecalho, corpo, marca)
	}
}

// responderCom espelha o byte de flags e o RESERVE que chegaram, em vez de usar
// os valores da tabela. O aparelho é quem decide se aceita a resposta, então
// falar o dialeto dele é mais seguro do que insistir na documentação.
func responderCom(conexao net.Conn, recebido n9m.Cabecalho, corpo []byte, marca func(string, ...any)) {
	if err := n9m.EscreverQuadroCom(conexao, recebido.Bruto0, recebido.Reserva, n9m.TipoComando, 0, corpo); err != nil {
		marca("    → falhou ao responder: %v", err)
		return
	}
	marca("    → %s", string(corpo))
}

// despejar mostra o que restou no buffer quando o enquadramento se perde. É a
// informação mais valiosa que a sonda produz, porque é exatamente onde a
// documentação e o fio discordam.
func despejar(leitor io.Reader, marca func(string, ...any)) {
	resto := make([]byte, 256)
	n, _ := io.ReadFull(io.LimitReader(leitor, int64(len(resto))), resto)
	if n <= 0 {
		marca("    (nada no buffer)")
		return
	}
	for _, linha := range splitLinhas(hex.Dump(resto[:n])) {
		marca("    %s", linha)
	}
}

func splitLinhas(s string) []string {
	var linhas []string
	inicio := 0
	for i := range s {
		if s[i] == '\n' {
			linhas = append(linhas, s[inicio:i])
			inicio = i + 1
		}
	}
	if inicio < len(s) {
		linhas = append(linhas, s[inicio:])
	}
	return linhas
}

func enderecosLocais() []string {
	var ips []string
	enderecos, err := net.InterfaceAddrs()
	if err != nil {
		return ips
	}
	for _, e := range enderecos {
		rede, ok := e.(*net.IPNet)
		if !ok || rede.IP.IsLoopback() || rede.IP.To4() == nil {
			continue
		}
		ips = append(ips, rede.IP.String())
	}
	return ips
}
