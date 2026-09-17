package n9m

import (
	"bytes"
	"compress/gzip"
	"encoding/binary"
	"errors"
	"io"
	"testing"
)

// O cabeçalho é a única coisa que não podemos errar: um bit trocado aqui não
// dá erro, dá enquadramento deslocado três pacotes depois. Os casos abaixo são
// montados à mão a partir da tabela do capítulo 02, não a partir do código.
func TestDecodificarCabecalho(t *testing.T) {
	casos := []struct {
		nome    string
		bytes   []byte
		esperar Cabecalho
	}{
		{
			// V=1, P=0, M=0, CSRC=0 → 0b01_0_0_0000 = 0x40
			nome:  "comando simples",
			bytes: []byte{0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0A, 0, 0, 0, 0},
			esperar: Cabecalho{
				Versao: 1, Tipo: TipoComando, TamPayload: 10,
			},
		},
		{
			// V=1, P=1, M=1, CSRC=8 → 0b01_1_1_1000 = 0x78
			// PT=2 (vídeo), SSRC=3 (canal 3)
			nome:  "vídeo cifrado e comprimido com csrc",
			bytes: []byte{0x78, 0x02, 0x00, 0x03, 0x00, 0x01, 0x00, 0x00, 0, 0, 0, 0},
			esperar: Cabecalho{
				Versao: 1, Cifrado: true, Comprimido: true, QtdCsrc: 8,
				Tipo: TipoVideoAoVivo, Ssrc: 3, TamPayload: 65536,
			},
		},
		{
			// Só M ligado → 0b01_0_1_0000 = 0x50. PT=22 é o relato especial de GPS.
			nome:  "gps comprimido",
			bytes: []byte{0x50, 0x16, 0x00, 0x00, 0x00, 0x00, 0x00, 0x2A, 0, 0, 0, 0},
			esperar: Cabecalho{
				Versao: 1, Comprimido: true, Tipo: TipoEspecial, TamPayload: 42,
			},
		},
	}

	for _, caso := range casos {
		t.Run(caso.nome, func(t *testing.T) {
			obtido, err := DecodificarCabecalho(caso.bytes)
			if err != nil {
				t.Fatalf("erro inesperado: %v", err)
			}
			if obtido != caso.esperar {
				t.Errorf("cabeçalho errado\n  esperado %+v\n  obtido   %+v", caso.esperar, obtido)
			}
		})
	}
}

// Versão diferente de 1 significa que perdemos o sincronismo do fluxo. Tem que
// dar erro, não passar adiante: seguir lendo a partir de um ponto errado gera
// payloads absurdos e alocações enormes.
func TestVersaoInvalidaEhErro(t *testing.T) {
	// V=0 → 0x00
	_, err := DecodificarCabecalho([]byte{0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0, 0, 0, 0})
	if !errors.Is(err, ErroVersao) {
		t.Fatalf("esperava ErroVersao, obtive %v", err)
	}
}

func TestPayloadAcimaDoLimiteEhErro(t *testing.T) {
	cab := []byte{0x40, 0x00, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0, 0}
	binary.BigEndian.PutUint32(cab[4:8], LimitePayload+1)
	if _, err := DecodificarCabecalho(cab); err == nil {
		t.Fatal("esperava erro para payload acima do limite")
	}
}

func TestCabecalhoCurtoEhErro(t *testing.T) {
	if _, err := DecodificarCabecalho([]byte{0x40, 0x00}); err == nil {
		t.Fatal("esperava erro para cabeçalho incompleto")
	}
}

func TestIdaEVolta(t *testing.T) {
	corpo := []byte(`{"MODULE":"CERTIFICATE","OPERATION":"KEEPALIVE"}`)

	var buf bytes.Buffer
	if err := EscreverQuadro(&buf, TipoComando, 0, corpo); err != nil {
		t.Fatalf("escrevendo: %v", err)
	}

	quadro, err := LerQuadro(&buf)
	if err != nil {
		t.Fatalf("lendo: %v", err)
	}
	if quadro.Cabecalho.Tipo != TipoComando {
		t.Errorf("tipo = %v, esperava comando", quadro.Cabecalho.Tipo)
	}
	if quadro.Cabecalho.TamPayload != uint32(len(corpo)) {
		t.Errorf("tamanho = %d, esperava %d", quadro.Cabecalho.TamPayload, len(corpo))
	}
	if !bytes.Equal(quadro.Payload, corpo) {
		t.Errorf("payload = %q, esperava %q", quadro.Payload, corpo)
	}
}

// Dois quadros seguidos no mesmo fluxo têm que sair separados. É o caso que
// prova que o enquadramento respeita o PAYLOAD LEN em vez de ler até o fim.
func TestDoisQuadrosSeguidos(t *testing.T) {
	var buf bytes.Buffer
	if err := EscreverQuadro(&buf, TipoComando, 0, []byte("primeiro")); err != nil {
		t.Fatal(err)
	}
	if err := EscreverQuadro(&buf, TipoEspecial, 7, []byte("segundo")); err != nil {
		t.Fatal(err)
	}

	um, err := LerQuadro(&buf)
	if err != nil {
		t.Fatalf("primeiro quadro: %v", err)
	}
	if string(um.Payload) != "primeiro" {
		t.Errorf("primeiro payload = %q", um.Payload)
	}

	dois, err := LerQuadro(&buf)
	if err != nil {
		t.Fatalf("segundo quadro: %v", err)
	}
	if string(dois.Payload) != "segundo" || dois.Cabecalho.Ssrc != 7 {
		t.Errorf("segundo quadro = %q ssrc=%d", dois.Payload, dois.Cabecalho.Ssrc)
	}

	if _, err := LerQuadro(&buf); err != io.EOF {
		t.Errorf("esperava EOF limpo no fim, obtive %v", err)
	}
}

func TestCsrcEhLidoESeparadoDoPayload(t *testing.T) {
	corpo := []byte("dados")
	csrc := bytes.Repeat([]byte{0xAB}, 8*4) // CSRC COUNT = 8, o valor que a doc diz ser o atual

	var buf bytes.Buffer
	cab := make([]byte, TamanhoCabecalho)
	cab[0] = 1<<6 | 8 // V=1, CSRC COUNT=8
	binary.BigEndian.PutUint32(cab[4:8], uint32(len(corpo)))
	buf.Write(cab)
	buf.Write(csrc)
	buf.Write(corpo)

	quadro, err := LerQuadro(&buf)
	if err != nil {
		t.Fatalf("lendo: %v", err)
	}
	if !bytes.Equal(quadro.Csrc, csrc) {
		t.Errorf("csrc lido tem %d bytes, esperava %d", len(quadro.Csrc), len(csrc))
	}
	if !bytes.Equal(quadro.Payload, corpo) {
		t.Errorf("payload = %q, esperava %q — o CSRC vazou para dentro dele", quadro.Payload, corpo)
	}
}

func TestPayloadComprimidoEhAberto(t *testing.T) {
	corpo := []byte(`{"MODULE":"CERTIFICATE","OPERATION":"CONNECT","PARAMETER":{"DSNO":"007102037B"}}`)

	var comprimido bytes.Buffer
	z := gzip.NewWriter(&comprimido)
	z.Write(corpo)
	z.Close()

	var buf bytes.Buffer
	cab := make([]byte, TamanhoCabecalho)
	cab[0] = 1<<6 | 0x10 // V=1, M=1
	binary.BigEndian.PutUint32(cab[4:8], uint32(comprimido.Len()))
	buf.Write(cab)
	buf.Write(comprimido.Bytes())

	quadro, err := LerQuadro(&buf)
	if err != nil {
		t.Fatalf("lendo: %v", err)
	}
	if !bytes.Equal(quadro.Payload, corpo) {
		t.Errorf("payload não foi descomprimido: %q", quadro.Payload)
	}
	if !bytes.Equal(quadro.Bruto, comprimido.Bytes()) {
		t.Error("Bruto deveria guardar os bytes como vieram do fio")
	}
}

// Cifrado nós não sabemos abrir. O contrato é devolver os bytes como vieram e
// sinalizar pelo cabeçalho — nunca fingir que o payload é legível.
func TestPayloadCifradoNaoEhTocado(t *testing.T) {
	corpo := []byte("bytes que nao sao gzip nem json")

	var buf bytes.Buffer
	cab := make([]byte, TamanhoCabecalho)
	cab[0] = 1<<6 | 0x20 | 0x10 // V=1, P=1, M=1
	binary.BigEndian.PutUint32(cab[4:8], uint32(len(corpo)))
	buf.Write(cab)
	buf.Write(corpo)

	quadro, err := LerQuadro(&buf)
	if err != nil {
		t.Fatalf("lendo: %v", err)
	}
	if !quadro.Cabecalho.Cifrado {
		t.Error("cabeçalho deveria dizer que está cifrado")
	}
	if !bytes.Equal(quadro.Payload, corpo) {
		t.Error("payload cifrado foi alterado")
	}
}

// Um quadro cortado no meio não pode virar um quadro parcial válido.
func TestQuadroIncompletoEhErro(t *testing.T) {
	var buf bytes.Buffer
	cab := make([]byte, TamanhoCabecalho)
	cab[0] = 1 << 6
	binary.BigEndian.PutUint32(cab[4:8], 100) // promete 100 bytes
	buf.Write(cab)
	buf.Write([]byte("mas manda só isto"))

	if _, err := LerQuadro(&buf); err == nil {
		t.Fatal("esperava erro para payload truncado")
	}
}
