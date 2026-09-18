#!/usr/bin/env python3
"""Captura o preview por WebSocket do MDVR e mostra o que vem dentro.

Este é o caminho que o próprio portal do aparelho usa, e o único que entrega
**todos os canais numa conexão só** — o RTSP da porta 554 entrega um canal por
sessão, que não serve para parede de câmeras.

    ./tools/ws_preview.py --ip 192.168.15.100 --canais 63 --segundos 10 \\
        --saida /tmp/preview.bin

O endpoint saiu do app do motorista (packages/mdvr-sdk):

    ws://<ip>/websocket/preview?chnmask=<mascara>&streamType=<0|1>&iframe=<0|1>

⚠️ `streamType` está invertido em relação ao protocolo N9M. No app, MAIN é '0'
e SUB é '1'; no N9M do capítulo 15, STREAMTYPE 0 é sub-stream e 1 é principal.
Os nomes aqui seguem o do app, porque é o que este endpoint espera.

Não usa biblioteca de WebSocket de propósito: o handshake é um GET com upgrade,
e ler quadro de servidor é simples porque servidor não mascara. Uma dependência
a menos numa ferramenta de bancada.
"""
import argparse
import base64
import collections
import os
import socket
import struct
import sys
import time

HEADER = 12
MAGIC = b"\x52\x00\x00\x00"  # marcador no offset 8, o mesmo do app


def handshake(sock: socket.socket, host: str, caminho: str, cookie: str) -> None:
    chave = base64.b64encode(os.urandom(16)).decode()
    pedido = (
        f"GET {caminho} HTTP/1.1\r\n"
        f"Host: {host}\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {chave}\r\n"
        "Sec-WebSocket-Version: 13\r\n"
        + (f"Cookie: {cookie}\r\n" if cookie else "")
        + "\r\n"
    )
    sock.sendall(pedido.encode())

    resposta = b""
    while b"\r\n\r\n" not in resposta:
        parte = sock.recv(4096)
        if not parte:
            raise RuntimeError("conexão fechada durante o handshake")
        resposta += parte
    cabecalho, _, resto = resposta.partition(b"\r\n\r\n")
    primeira = cabecalho.split(b"\r\n")[0].decode(errors="replace")
    if "101" not in primeira:
        raise RuntimeError(f"upgrade recusado: {primeira}")
    print(f"  {primeira}")
    return resto


def ler_quadros_ws(sock: socket.socket, sobra: bytes, ate: float):
    """Gera o payload de cada quadro WebSocket. Servidor não mascara."""
    buf = bytearray(sobra)

    def encher(n: int) -> bool:
        while len(buf) < n:
            if time.time() > ate:
                return False
            sock.settimeout(max(0.1, ate - time.time()))
            try:
                parte = sock.recv(65536)
            except socket.timeout:
                return False
            if not parte:
                return False
            buf.extend(parte)
        return True

    while time.time() < ate:
        if not encher(2):
            return
        opcode = buf[0] & 0x0F
        tam = buf[1] & 0x7F
        deslocamento = 2
        if tam == 126:
            if not encher(4):
                return
            tam = struct.unpack(">H", buf[2:4])[0]
            deslocamento = 4
        elif tam == 127:
            if not encher(10):
                return
            tam = struct.unpack(">Q", buf[2:10])[0]
            deslocamento = 10
        if not encher(deslocamento + tam):
            return
        carga = bytes(buf[deslocamento : deslocamento + tam])
        del buf[: deslocamento + tam]
        if opcode == 0x8:  # close
            return
        if opcode in (0x1, 0x2, 0x0):
            yield carga


def analisar(mensagens: list[bytes]) -> None:
    """Cada mensagem WebSocket é um pedaço de um canal, com cabeçalho próprio.

    O formato NÃO é o enquadramento de 12 bytes do N9M — é outro, do modo
    direto. O que se descobriu capturando:

        byte 0     número do canal, 0 a 5 com chnmask=63
        bytes 1-3  marcador ASCII: "2dc", "3dc" ou "4dc", que parece o tipo do
                   quadro. O padrão lembra o "##dc" de chunk de vídeo do AVI.
        bytes 4-5  tamanho em little endian de uma parte do conteúdo
        resto      H.264 em Annex-B, com SPS 67, PPS 68 e IDR 65

    Concatenar as mensagens antes de olhar destrói a fronteira e some com o
    canal — foi o primeiro erro cometido aqui.
    """
    if not mensagens:
        print("  nenhuma mensagem")
        return

    fluxo = b"".join(mensagens)
    total = len(fluxo)
    print(f"\n  {len(mensagens)} mensagens, {total} bytes")

    por_canal = collections.Counter(m[0] for m in mensagens if m)
    marcadores = collections.Counter(
        m[1:4].decode("ascii", "replace") for m in mensagens if len(m) >= 4
    )
    print(f"  canais (byte 0): {dict(sorted(por_canal.items()))}")
    print(f"  marcadores (bytes 1-3): {dict(marcadores.most_common())}")

    chaves = fluxo.count(b"\x00\x00\x00\x01\x67")
    nals = fluxo.count(b"\x00\x00\x00\x01")
    print(f"  H.264: {nals} NALs, {chaves} SPS (quadros-chave)")
    sps = fluxo.find(b"\x00\x00\x00\x01\x67")
    if sps >= 0:
        perfil, _, nivel = fluxo[sps + 5], fluxo[sps + 6], fluxo[sps + 7]
        print(f"  perfil 0x{perfil:02x} nível {nivel} ({nivel / 10:.1f})")

    print(f"  maior mensagem {max(len(m) for m in mensagens)}B, "
          f"menor {min(len(m) for m in mensagens)}B")


def extrair_canal(mensagens: list[bytes], canal: int, destino: str) -> None:
    """Grava o H.264 de um canal só, a partir do primeiro quadro-chave.

    Começar antes do SPS entrega ao decodificador quadros que dependem de um
    quadro de referência que ele não tem, e o resultado é tela verde — que
    parece defeito do vídeo e é só ponto de partida errado.
    """
    partes = [m for m in mensagens if m and m[0] == canal]
    if not partes:
        print(f"  canal {canal}: nada capturado")
        return
    fluxo = b"".join(m[4:] for m in partes)
    inicio = fluxo.find(b"\x00\x00\x00\x01\x67")
    if inicio < 0:
        print(f"  canal {canal}: nenhum quadro-chave na captura, nada a gravar")
        return
    with open(destino, "wb") as f:
        f.write(fluxo[inicio:])
    print(f"  canal {canal}: {len(fluxo) - inicio} bytes em {destino}")
    print(f"    ffplay {destino}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--ip", default="192.168.15.100")
    ap.add_argument("--porta", type=int, default=80)
    ap.add_argument("--canais", type=int, default=63,
                    help="máscara de bits: 63 = 0b111111 = canais 1 a 6")
    ap.add_argument("--stream", choices=["MAIN", "SUB"], default="SUB")
    ap.add_argument("--iframe", action="store_true", help="só quadros-chave")
    ap.add_argument("--segundos", type=float, default=10)
    ap.add_argument("--saida", default="", help="grava os bytes crus aqui")
    ap.add_argument("--cookie", default="", help="Cookie: da sessão do configurador")
    ap.add_argument("--extrair", type=int, default=None,
                    help="grava o H.264 deste canal num arquivo .h264")
    args = ap.parse_args()

    caminho = (f"/websocket/preview?chnmask={args.canais}"
               f"&streamType={'0' if args.stream == 'MAIN' else '1'}"
               f"&iframe={'1' if args.iframe else '0'}")
    print(f"conectando ws://{args.ip}:{args.porta}{caminho}")

    # O aparelho aceita UMA sessão de preview por vez e devolve 502 enquanto a
    # anterior não é liberada — inclusive a que ele mesmo abre quando alguém
    # deixa a aba de Antevisão do configurador aberta. Tentar de novo por alguns
    # segundos é o que separa "ocupado agora" de "não funciona".
    sock = None
    for tentativa in range(1, 6):
        sock = socket.create_connection((args.ip, args.porta), timeout=10)
        try:
            sobra = handshake(sock, args.ip, caminho, args.cookie)
            break
        except RuntimeError as erro:
            sock.close()
            if "502" not in str(erro) or tentativa == 5:
                raise
            print(f"  ocupado ({erro}) — tentativa {tentativa}, esperando 4s")
            time.sleep(4)

    try:
        fim = time.time() + args.segundos
        mensagens = list(ler_quadros_ws(sock, sobra, fim))
        bytes_totais = sum(len(m) for m in mensagens)
        print(f"  {len(mensagens)} mensagens em {args.segundos:.0f}s"
              f"  ({bytes_totais/args.segundos/1024:.0f} KiB/s)")
    finally:
        sock.close()

    if args.saida:
        with open(args.saida, "wb") as f:
            f.write(b"".join(mensagens))
        print(f"  bytes crus em {args.saida}")
    analisar(mensagens)
    if args.extrair is not None:
        extrair_canal(mensagens, args.extrair, f"/tmp/canal{args.extrair}.h264")
    return 0


if __name__ == "__main__":
    sys.exit(main())
