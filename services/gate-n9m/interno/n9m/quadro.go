// Package n9m implementa o enquadramento do protocolo N9M 2.0 da Streamax.
//
// Todo pacote — comando ou mídia — vem com o mesmo cabeçalho de 12 bytes,
// big endian, descrito no capítulo 02 da documentação:
//
//	bits  1-2   V             versão, sempre 1
//	bit   3     P             1 = cifrado
//	bit   4     M             1 = comprimido com gzip
//	bits  5-8   CSRC COUNT    0-16 palavras de 32 bits depois do cabeçalho
//	bits  9-16  PAYLOAD TYPE  0 = comando JSON, 2 = vídeo ao vivo, ...
//	bits 17-32  SSRC          sentido depende do PAYLOAD TYPE
//	bits 33-64  PAYLOAD LEN
//	bits 65-96  RESERVE       zero, reservado
//
// Quando as duas flags estão ligadas, a ordem é comprimir e depois cifrar —
// então para desfazer é decifrar e depois descomprimir.
package n9m

import (
	"bytes"
	"compress/gzip"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
)

// TamanhoCabecalho é a parte fixa, antes do CSRC e do payload.
const TamanhoCabecalho = 12

// LimitePayload existe para que um cabeçalho corrompido não vire uma alocação
// de gigabytes. O maior payload legítimo é um quadro de vídeo.
const LimitePayload = 16 << 20

// ErroVersao indica que os bytes lidos não começam num cabeçalho N9M válido.
// Na prática significa que perdemos o sincronismo do fluxo, e a única saída
// honesta é derrubar a conexão em vez de tentar adivinhar onde ele recomeça.
var ErroVersao = errors.New("n9m: versão de cabeçalho não é 1, fluxo fora de sincronismo")

// TipoPayload distingue o que vem depois do cabeçalho (capítulo 02).
type TipoPayload uint8

const (
	TipoComando         TipoPayload = 0  // JSON de comando, status e controle
	TipoVideoAoVivo     TipoPayload = 2  // SSRC = número do canal
	TipoGravacao        TipoPayload = 3  // download de arquivo gravado
	TipoPlayback        TipoPayload = 4  // SSRC = número do canal
	TipoFoto            TipoPayload = 6  // imagem capturada
	TipoImportaParam    TipoPayload = 10 //
	TipoExportaParam    TipoPayload = 11 //
	TipoSubfluxoVideo   TipoPayload = 15 // SSRC = número do canal
	TipoSubfluxoGravado TipoPayload = 16 // SSRC = número do canal
	TipoCaixaPreta      TipoPayload = 17 //
	TipoEspecial        TipoPayload = 22 // GPS e afins, ver capítulo 04
	TipoManutencao      TipoPayload = 30 // proprietário da Streamax
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

// Cabecalho são os 12 bytes fixos já decodificados.
type Cabecalho struct {
	Versao     uint8
	Cifrado    bool
	Comprimido bool
	QtdCsrc    uint8
	Tipo       TipoPayload
	Ssrc       uint16
	TamPayload uint32
}

func (c Cabecalho) String() string {
	return fmt.Sprintf("v%d tipo=%s ssrc=%d csrc=%d cifrado=%t comprimido=%t payload=%dB",
		c.Versao, c.Tipo, c.Ssrc, c.QtdCsrc, c.Cifrado, c.Comprimido, c.TamPayload)
}

// Quadro é um pacote inteiro, com o payload já descomprimido quando possível.
type Quadro struct {
	Cabecalho Cabecalho
	Csrc      []byte // QtdCsrc palavras de 32 bits, cru
	Payload   []byte // descomprimido, se estava comprimido e deu para descomprimir
	Bruto     []byte // payload exatamente como veio do fio
}

// DecodificarCabecalho lê os 12 bytes fixos.
func DecodificarCabecalho(b []byte) (Cabecalho, error) {
	if len(b) < TamanhoCabecalho {
		return Cabecalho{}, fmt.Errorf("n9m: cabeçalho precisa de %d bytes, veio %d", TamanhoCabecalho, len(b))
	}
	c := Cabecalho{
		Versao:     b[0] >> 6,
		Cifrado:    b[0]&0x20 != 0,
		Comprimido: b[0]&0x10 != 0,
		QtdCsrc:    b[0] & 0x0F,
		Tipo:       TipoPayload(b[1]),
		Ssrc:       binary.BigEndian.Uint16(b[2:4]),
		TamPayload: binary.BigEndian.Uint32(b[4:8]),
		// b[8:12] é o RESERVE, que hoje é zero
	}
	if c.Versao != 1 {
		return c, ErroVersao
	}
	if c.TamPayload > LimitePayload {
		return c, fmt.Errorf("n9m: payload de %d bytes passa do limite de %d", c.TamPayload, LimitePayload)
	}
	return c, nil
}

// LerQuadro lê um pacote completo. Devolve io.EOF sem erro adicional quando o
// fluxo acaba limpo entre dois quadros.
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

	if c.QtdCsrc > 0 {
		q.Csrc = make([]byte, int(c.QtdCsrc)*4)
		if _, err := io.ReadFull(r, q.Csrc); err != nil {
			return nil, fmt.Errorf("n9m: lendo CSRC: %w", err)
		}
	}

	if c.TamPayload > 0 {
		q.Bruto = make([]byte, c.TamPayload)
		if _, err := io.ReadFull(r, q.Bruto); err != nil {
			return nil, fmt.Errorf("n9m: lendo payload: %w", err)
		}
	}

	// O payload utilizável é o bruto, a menos que dê para desfazer as camadas.
	// Não decifra: sem a chave, cifrado continua cifrado, e mentir sobre isso
	// seria pior do que devolver os bytes como estão.
	q.Payload = q.Bruto
	if !c.Cifrado && c.Comprimido && len(q.Bruto) > 0 {
		if aberto, err := descomprimir(q.Bruto); err == nil {
			q.Payload = aberto
		}
	}
	return q, nil
}

// EscreverQuadro serializa um quadro sem compressão nem cifra.
func EscreverQuadro(w io.Writer, tipo TipoPayload, ssrc uint16, payload []byte) error {
	cab := make([]byte, TamanhoCabecalho)
	cab[0] = 1 << 6 // V=1, P=0, M=0, CSRC COUNT=0
	cab[1] = byte(tipo)
	binary.BigEndian.PutUint16(cab[2:4], ssrc)
	binary.BigEndian.PutUint32(cab[4:8], uint32(len(payload)))
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
