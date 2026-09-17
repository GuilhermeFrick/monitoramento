package n9m

import (
	"bytes"
	"compress/gzip"
	"encoding/binary"
	"encoding/json"
	"io"
	"testing"
)

// cabecalhoReal são os 12 bytes que um M1N2.0-STANDARD, protocolo 1.0.6,
// mandou no CONNECT em 17/09/2026, capturados pela sonda. O payload declarado
// é de 446 bytes e o arquivo tinha 458 — 12 + 446 fecha exato, que é o que
// prova que o cabeçalho tem 12 bytes.
//
// Este é o teste que importa. Os outros verificam o código; este verifica que o
// código concorda com o aparelho, que é a única autoridade que decide.
var cabecalhoReal = []byte{
	0x08,                   // byte 0 — pela tabela deveria ser 0x4X para V=1
	0x00,                   // PAYLOAD TYPE = 0, comando
	0x00, 0x00, //             SSRC = 0
	0x00, 0x00, 0x01, 0xbe, // PAYLOAD LEN = 446
	0x52, 0x00, 0x00, 0x00, // RESERVE — documentado como zero, não é
}

func TestCabecalhoDoAparelhoReal(t *testing.T) {
	c, err := DecodificarCabecalho(cabecalhoReal)
	if err != nil {
		t.Fatalf("o cabeçalho do aparelho real precisa ser aceito, e deu erro: %v", err)
	}
	if c.Tipo != TipoComando {
		t.Errorf("tipo = %v, esperava comando", c.Tipo)
	}
	if c.Ssrc != 0 {
		t.Errorf("ssrc = %d, esperava 0", c.Ssrc)
	}
	if c.TamPayload != 446 {
		t.Errorf("tamanho = %d, esperava 446", c.TamPayload)
	}
	if c.Bruto0 != 0x08 {
		t.Errorf("Bruto0 = 0x%02x, esperava 0x08 — o byte tem que ser guardado como veio", c.Bruto0)
	}
	if c.Reserva != [4]byte{0x52, 0, 0, 0} {
		t.Errorf("reserva = %x, esperava 52000000", c.Reserva)
	}
}

// A checagem de versão que existia aqui derrubava toda conexão do aparelho
// real. Este teste existe para que ninguém a traga de volta sem perceber.
func TestCabecalhoRealNaoEhRejeitadoPorVersao(t *testing.T) {
	corpo := []byte(`{"MODULE":"CERTIFICATE","OPERATION":"CONNECT"}`)

	var buf bytes.Buffer
	cab := append([]byte(nil), cabecalhoReal...)
	binary.BigEndian.PutUint32(cab[4:8], uint32(len(corpo)))
	buf.Write(cab)
	buf.Write(corpo)

	q, err := LerQuadro(&buf)
	if err != nil {
		t.Fatalf("quadro do aparelho real foi rejeitado: %v", err)
	}
	if !bytes.Equal(q.Payload, corpo) {
		t.Errorf("payload = %q", q.Payload)
	}
}

func TestTamanhoEhLidoEmBigEndian(t *testing.T) {
	// 0x000001be lido como little endian daria 3187736576, não 446.
	c, err := DecodificarCabecalho(cabecalhoReal)
	if err != nil {
		t.Fatal(err)
	}
	if c.TamPayload != 446 {
		t.Fatalf("tamanho = %d — provável troca de ordem de bytes", c.TamPayload)
	}
}

func TestPayloadAcimaDoLimiteEhErro(t *testing.T) {
	cab := append([]byte(nil), cabecalhoReal...)
	binary.BigEndian.PutUint32(cab[4:8], LimitePayload+1)
	if _, err := DecodificarCabecalho(cab); err == nil {
		t.Fatal("esperava erro: sem a checagem de versão, o limite é a única defesa contra dessincronismo")
	}
}

func TestCabecalhoCurtoEhErro(t *testing.T) {
	if _, err := DecodificarCabecalho([]byte{0x08, 0x00}); err == nil {
		t.Fatal("esperava erro para cabeçalho incompleto")
	}
}

func TestQuadroTruncadoEhErro(t *testing.T) {
	var buf bytes.Buffer
	cab := append([]byte(nil), cabecalhoReal...)
	binary.BigEndian.PutUint32(cab[4:8], 100) // promete 100
	buf.Write(cab)
	buf.Write([]byte("mas manda só isto"))

	if _, err := LerQuadro(&buf); err == nil {
		t.Fatal("esperava erro para payload truncado")
	}
}

func TestIdaEVolta(t *testing.T) {
	corpo := []byte(`{"MODULE":"CERTIFICATE","OPERATION":"KEEPALIVE"}`)

	var buf bytes.Buffer
	if err := EscreverQuadro(&buf, TipoComando, 0, corpo); err != nil {
		t.Fatalf("escrevendo: %v", err)
	}
	q, err := LerQuadro(&buf)
	if err != nil {
		t.Fatalf("lendo: %v", err)
	}
	if !bytes.Equal(q.Payload, corpo) {
		t.Errorf("payload = %q, esperava %q", q.Payload, corpo)
	}
}

// O que escrevemos tem que sair no dialeto do aparelho, não no da tabela.
func TestEscritaUsaODialetoDoAparelho(t *testing.T) {
	var buf bytes.Buffer
	if err := EscreverQuadro(&buf, TipoComando, 0, []byte("x")); err != nil {
		t.Fatal(err)
	}
	saida := buf.Bytes()
	if saida[0] != 0x08 {
		t.Errorf("byte 0 = 0x%02x, esperava 0x08 (o que o aparelho manda)", saida[0])
	}
	if !bytes.Equal(saida[8:12], []byte{0x52, 0, 0, 0}) {
		t.Errorf("reserva = %x, esperava 52000000", saida[8:12])
	}
}

func TestEscreverQuadroComEspelhaOCabecalho(t *testing.T) {
	var buf bytes.Buffer
	reserva := [4]byte{0xAA, 0xBB, 0xCC, 0xDD}
	if err := EscreverQuadroCom(&buf, 0x99, reserva, TipoEspecial, 7, []byte("x")); err != nil {
		t.Fatal(err)
	}
	saida := buf.Bytes()
	if saida[0] != 0x99 || saida[1] != byte(TipoEspecial) {
		t.Errorf("flags/tipo = %02x %02x", saida[0], saida[1])
	}
	if binary.BigEndian.Uint16(saida[2:4]) != 7 {
		t.Errorf("ssrc = %d", binary.BigEndian.Uint16(saida[2:4]))
	}
	if !bytes.Equal(saida[8:12], reserva[:]) {
		t.Errorf("reserva não foi espelhada: %x", saida[8:12])
	}
}

func TestDoisQuadrosSeguidos(t *testing.T) {
	var buf bytes.Buffer
	if err := EscreverQuadro(&buf, TipoComando, 0, []byte("primeiro")); err != nil {
		t.Fatal(err)
	}
	if err := EscreverQuadro(&buf, TipoEspecial, 7, []byte("segundo")); err != nil {
		t.Fatal(err)
	}

	um, err := LerQuadro(&buf)
	if err != nil || string(um.Payload) != "primeiro" {
		t.Fatalf("primeiro quadro: %q, %v", um.Payload, err)
	}
	dois, err := LerQuadro(&buf)
	if err != nil || string(dois.Payload) != "segundo" || dois.Cabecalho.Ssrc != 7 {
		t.Fatalf("segundo quadro: %q ssrc=%d, %v", dois.Payload, dois.Cabecalho.Ssrc, err)
	}
	if _, err := LerQuadro(&buf); err != io.EOF {
		t.Errorf("esperava EOF limpo no fim, obtive %v", err)
	}
}

// Compressão é detectada pela assinatura do gzip, não pelo bit M — cuja posição
// ainda não conseguimos confirmar. Aqui o byte de flags é o mesmo 0x08 de
// sempre, sem nenhum bit de compressão ligado, e mesmo assim tem que abrir.
func TestCompressaoEhDetectadaPelaAssinatura(t *testing.T) {
	corpo := []byte(`{"MODULE":"CERTIFICATE","OPERATION":"CONNECT","PARAMETER":{"DSNO":"00E400689E"}}`)

	var comprimido bytes.Buffer
	z := gzip.NewWriter(&comprimido)
	z.Write(corpo)
	z.Close()

	var buf bytes.Buffer
	cab := append([]byte(nil), cabecalhoReal...)
	binary.BigEndian.PutUint32(cab[4:8], uint32(comprimido.Len()))
	buf.Write(cab)
	buf.Write(comprimido.Bytes())

	q, err := LerQuadro(&buf)
	if err != nil {
		t.Fatalf("lendo: %v", err)
	}
	if !q.Comprimido {
		t.Error("deveria ter reconhecido o gzip")
	}
	if !bytes.Equal(q.Payload, corpo) {
		t.Errorf("payload não foi aberto: %q", q.Payload)
	}
	if !bytes.Equal(q.Bruto, comprimido.Bytes()) {
		t.Error("Bruto deveria guardar os bytes como vieram do fio")
	}
}

// Payload que não é gzip passa intacto, mesmo começando com byte alto.
func TestPayloadBinarioNaoEhTocado(t *testing.T) {
	corpo := []byte{0x1f, 0x00, 0x03, 0xff} // começa como gzip mas não é
	var buf bytes.Buffer
	cab := append([]byte(nil), cabecalhoReal...)
	binary.BigEndian.PutUint32(cab[4:8], uint32(len(corpo)))
	buf.Write(cab)
	buf.Write(corpo)

	q, err := LerQuadro(&buf)
	if err != nil {
		t.Fatal(err)
	}
	if q.Comprimido {
		t.Error("não deveria ter marcado como comprimido")
	}
	if !bytes.Equal(q.Payload, corpo) {
		t.Errorf("payload alterado: %x", q.Payload)
	}
}

// O CONNECT real inteiro, para garantir que o payload sai íntegro e parseável.
func TestConnectRealEhParseavel(t *testing.T) {
	corpo := []byte(`{"MODULE":"CERTIFICATE","OPERATION":"CONNECT","SESSION":"0000000B5E54AD399A8888A46AF8C521","PARAMETER":{"DSNO":"00E400689E","EV":"V2.0","PV":1,"SC":0,"NET":1,"CHANNEL":6}}`)

	var buf bytes.Buffer
	cab := append([]byte(nil), cabecalhoReal...)
	binary.BigEndian.PutUint32(cab[4:8], uint32(len(corpo)))
	buf.Write(cab)
	buf.Write(corpo)

	q, err := LerQuadro(&buf)
	if err != nil {
		t.Fatal(err)
	}
	var d struct {
		Module    string `json:"MODULE"`
		Parameter struct {
			Dsno string `json:"DSNO"`
			Ev   string `json:"EV"`
		} `json:"PARAMETER"`
	}
	if err := json.Unmarshal(q.Payload, &d); err != nil {
		t.Fatalf("payload não é JSON: %v", err)
	}
	if d.Parameter.Dsno != "00E400689E" || d.Parameter.Ev != "V2.0" {
		t.Errorf("campos errados: %+v", d.Parameter)
	}
}
