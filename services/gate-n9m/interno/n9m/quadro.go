// Package n9m implementa o enquadramento do protocolo N9M 2.0 da Streamax.
//
// # O que a documentação diz
//
// O capítulo 02 descreve um cabeçalho de 12 bytes, big endian:
//
//	bits  1-2   V             versão, "the protocol version is 1"
//	bit   3     P             1 = cifrado
//	bit   4     M             1 = comprimido com gzip
//	bits  5-8   CSRC COUNT    "the current value is 8"
//	bits  9-16  PAYLOAD TYPE  0 = comando JSON, 2 = vídeo ao vivo, ...
//	bits 17-32  SSRC
//	bits 33-64  PAYLOAD LEN
//	bits 65-96  RESERVE       "the current value is 0"
//
// # O que o fio diz
//
// Um M1N2.0-STANDARD, protocolo 1.0.6, manda este cabeçalho no CONNECT:
//
//	08 00 00 00  00 00 01 be  52 00 00 00
//	^^           ^^^^^^^^^^^  ^^
//	byte 0       len = 446    "RESERVE" = 0x52
//
// Confirmado contra a documentação, porque o arquivo tem exatamente 458 bytes
// e 12 + 446 fecha: **o cabeçalho tem 12 bytes**, PAYLOAD LEN está no offset 4
// em big endian, PAYLOAD TYPE no offset 1 e SSRC nos offsets 2-3.
//
// Divergente da documentação, em toda captura:
//
//   - byte 0 é 0x08, não 0x4X. Pela tabela, V=1 poria os dois bits mais altos
//     em 01. Lido ao pé da letra, 0x08 dá V=0 e CSRC COUNT=8 — o que não pode
//     ser, porque não há nenhum byte de CSRC entre o cabeçalho e o JSON.
//   - RESERVE não é 0, é 0x52 no primeiro byte.
//
// # A decisão daqui
//
// Usamos o que está confirmado e registramos o que não está. Em particular:
//
//   - **Não rejeitamos por versão.** A checagem que tínhamos derrubava toda
//     conexão do aparelho real. Só o limite de tamanho protege contra
//     dessincronismo agora.
//   - **Não confiamos no bit M.** Compressão é detectada pela assinatura gzip
//     no payload, que é fato observável, em vez de por um bit cuja posição não
//     conseguimos confirmar com um quadro onde quase tudo é zero.
//   - **CSRC é tratado como ausente**, porque é o que os dados mostram. Se
//     algum quadro futuro trouxer CSRC, o tamanho não vai fechar e vamos ver.
//   - `Bruto0` e `Reserva` guardam os bytes como vieram, para quando houver
//     quadro de vídeo ou comprimido dando outro valor e a comparação resolver
//     o significado de cada bit.
//
// ⚠️ Nada disso está confirmado com o fabricante.
package n9m

import (
	"bytes"
	"compress/gzip"
	"encoding/binary"
	"fmt"
	"io"
)

// TamanhoCabecalho é a parte fixa, antes do payload. Confirmado no fio.
const TamanhoCabecalho = 12

// LimitePayload existe para que um cabeçalho lido fora de lugar não vire uma
// alocação de gigabytes. Com a checagem de versão fora, é a única defesa contra
// dessincronismo — por isso o limite é generoso mas não ilimitado.
const LimitePayload = 16 << 20

// FlagsObservadas é o byte 0 que o M1N2.0 manda em comando. Usamos o mesmo nas
// respostas: falar o dialeto que o aparelho fala é mais seguro do que insistir
// no que a tabela diz, já que é ele quem decide se aceita.
const FlagsObservadas byte = 0x08

// ReservaObservada é o campo RESERVE como o aparelho manda, apesar de a
// documentação dizer que é zero.
var ReservaObservada = [4]byte{0x52, 0x00, 0x00, 0x00}

var magicaGzip = []byte{0x1f, 0x8b}

// TipoPayload distingue o que vem depois do cabeçalho (capítulo 02).
type TipoPayload uint8

const (
	TipoComando         TipoPayload = 0
	TipoVideoAoVivo     TipoPayload = 2
	TipoGravacao        TipoPayload = 3
	TipoPlayback        TipoPayload = 4
	TipoFoto            TipoPayload = 6
	TipoImportaParam    TipoPayload = 10
	TipoExportaParam    TipoPayload = 11
	TipoSubfluxoVideo   TipoPayload = 15
	TipoSubfluxoGravado TipoPayload = 16
	TipoCaixaPreta      TipoPayload = 17
	TipoEspecial        TipoPayload = 22
	TipoManutencao      TipoPayload = 30
)

func (t TipoPayload) String() string {
	switch t {
	case TipoComando:
		return "comando"
	case TipoVideoAoVivo:
		return "video-ao-vivo"
	case TipoGravacao:
		return "gravacao"
	case TipoPlayback:
		return "playback"
	case TipoFoto:
		return "foto"
	case TipoImportaParam:
		return "importa-parametro"
	case TipoExportaParam:
		return "exporta-parametro"
	case TipoSubfluxoVideo:
		return "subfluxo-video"
	case TipoSubfluxoGravado:
		return "subfluxo-gravado"
	case TipoCaixaPreta:
		return "caixa-preta"
	case TipoEspecial:
		return "especial"
	case TipoManutencao:
		return "manutencao"
	default:
		return fmt.Sprintf("desconhecido(%d)", uint8(t))
	}
}

// Cabecalho são os 12 bytes já separados em campos. Os que a documentação
// descreve e o fio confirma viram campos com nome; os outros ficam crus.
type Cabecalho struct {
	Bruto0     byte    // byte 0 inteiro: bits de V, P, M e CSRC, ainda por decifrar
	Tipo       TipoPayload
	Ssrc       uint16
	TamPayload uint32
	Reserva    [4]byte // documentado como zero, observado como 52 00 00 00
}

func (c Cabecalho) String() string {
	return fmt.Sprintf("tipo=%s ssrc=%d payload=%dB b0=0x%02x reserva=%x",
		c.Tipo, c.Ssrc, c.TamPayload, c.Bruto0, c.Reserva)
}

// Quadro é um pacote inteiro.
type Quadro struct {
	Cabecalho Cabecalho
	Payload   []byte // descomprimido quando o gzip foi reconhecido
	Bruto     []byte // exatamente como veio do fio
	Comprimido bool  // detectado pela assinatura, não pelo bit M
}

// DecodificarCabecalho lê os 12 bytes fixos. Não rejeita por versão: ver o
// comentário do pacote.
func DecodificarCabecalho(b []byte) (Cabecalho, error) {
	if len(b) < TamanhoCabecalho {
		return Cabecalho{}, fmt.Errorf("n9m: cabeçalho precisa de %d bytes, veio %d", TamanhoCabecalho, len(b))
	}
	c := Cabecalho{
		Bruto0:     b[0],
		Tipo:       TipoPayload(b[1]),
		Ssrc:       binary.BigEndian.Uint16(b[2:4]),
		TamPayload: binary.BigEndian.Uint32(b[4:8]),
	}
	copy(c.Reserva[:], b[8:12])
	if c.TamPayload > LimitePayload {
		return c, fmt.Errorf("n9m: payload de %d bytes passa do limite de %d — provável perda de sincronismo", c.TamPayload, LimitePayload)
	}
	return c, nil
}

// LerQuadro lê um pacote completo. Devolve io.EOF quando o fluxo acaba limpo
// entre dois quadros.
func LerQuadro(r io.Reader) (*Quadro, error) {
	cab := make([]byte, TamanhoCabecalho)
	if _, err := io.ReadFull(r, cab); err != nil {
		return nil, err
	}
	c, err := DecodificarCabecalho(cab)
	if err != nil {
		return nil, err
	}

	q := &Quadro{Cabecalho: c}
	if c.TamPayload > 0 {
		q.Bruto = make([]byte, c.TamPayload)
		if _, err := io.ReadFull(r, q.Bruto); err != nil {
			return nil, fmt.Errorf("n9m: lendo payload de %d bytes: %w", c.TamPayload, err)
		}
	}

	// Compressão pela assinatura do gzip, não pelo bit: o bit está numa posição
	// que ainda não confirmamos, a assinatura é fato.
	q.Payload = q.Bruto
	if bytes.HasPrefix(q.Bruto, magicaGzip) {
		if aberto, err := descomprimir(q.Bruto); err == nil {
			q.Payload = aberto
			q.Comprimido = true
		}
	}
	return q, nil
}

// EscreverQuadro serializa um quadro usando o mesmo byte de flags e o mesmo
// RESERVE que o aparelho usa.
func EscreverQuadro(w io.Writer, tipo TipoPayload, ssrc uint16, payload []byte) error {
	return EscreverQuadroCom(w, FlagsObservadas, ReservaObservada, tipo, ssrc, payload)
}

// EscreverQuadroCom permite espelhar exatamente o cabeçalho que chegou, que é o
// que a sonda faz ao responder.
func EscreverQuadroCom(w io.Writer, flags byte, reserva [4]byte, tipo TipoPayload, ssrc uint16, payload []byte) error {
	cab := make([]byte, TamanhoCabecalho)
	cab[0] = flags
	cab[1] = byte(tipo)
	binary.BigEndian.PutUint16(cab[2:4], ssrc)
	binary.BigEndian.PutUint32(cab[4:8], uint32(len(payload)))
	copy(cab[8:12], reserva[:])
	if _, err := w.Write(cab); err != nil {
		return err
	}
	_, err := w.Write(payload)
	return err
}

func descomprimir(b []byte) ([]byte, error) {
	z, err := gzip.NewReader(bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	defer z.Close()
	return io.ReadAll(io.LimitReader(z, LimitePayload))
}
