#!/usr/bin/env python3
"""Parede de vídeo de bancada: seis canais do MDVR no navegador.

    ./tools/video_wall.py --ip 192.168.15.100
    # abre http://localhost:8099

Faz três coisas, e a terceira é a razão de existir um proxy em vez de a página
falar direto com o aparelho:

1. Autentica no configurador (DES-ECB com a chave "streamin") e guarda a sessão.
2. Serve a página em localhost.
3. Repassa o WebSocket de preview do aparelho para o navegador.

O aparelho só aceita o upgrade com o cookie de sessão dele. Uma página aberta de
outra origem depende de o navegador mandar esse cookie, o que varia com a
política de SameSite e falha em silêncio. Com o proxy, quem autentica é o Python
e o navegador só vê `ws://localhost`.

O proxy também resolve a sessão única: o aparelho aceita **um** preview por vez
e devolve 502 enquanto houver outro aberto. Aqui a espera e a nova tentativa
acontecem num lugar só.
"""
import argparse
import base64
import hashlib
import http.server
import json
import os
import socket
import socketserver
import struct
import subprocess
import sys
import threading
import time
import urllib.request

GUID = b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
AQUI = os.path.dirname(os.path.abspath(__file__))


def senha_des(senha: str) -> str:
    """O portal cifra a senha em DES-ECB com os 8 primeiros bytes de
    "streaming_rsp", ZeroPadding, saída em hexa. Sai pelo openssl porque o
    provedor legacy é onde o DES ainda mora, e é uma dependência a menos."""
    chave = "streamin".encode().hex()
    saida = subprocess.run(
        ["openssl", "enc", "-des-ecb", "-provider", "legacy", "-provider", "default",
         "-K", chave, "-nopad"],
        input=senha.encode(), capture_output=True, check=True,
    ).stdout
    return saida.hex()


def autenticar(ip: str, usuario: str, senha: str) -> str:
    corpo = json.dumps({
        "username": usuario, "password": senha_des(senha),
        "language": 1, "autoLogin": 1, "pwenc": 1,
    }).encode()
    pedido = urllib.request.Request(
        f"http://{ip}/devapi/v1/basic/key", data=corpo,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(pedido, timeout=10) as resposta:
        cookies = resposta.headers.get_all("Set-Cookie") or []
        dados = json.loads(resposta.read())
    if dados.get("errorcode") != 200:
        raise RuntimeError(f"login recusado: {dados}")
    return "; ".join(c.split(";")[0] for c in cookies)


# ---------------------------------------------------------------- WebSocket

def ler_mensagens(sock: socket.socket, sobra: bytes, mascarado: bool):
    """Gera o payload de cada mensagem. Cliente mascara, servidor não."""
    buf = bytearray(sobra)

    def encher(n: int) -> bool:
        while len(buf) < n:
            try:
                parte = sock.recv(65536)
            except (socket.timeout, OSError):
                return False
            if not parte:
                return False
            buf.extend(parte)
        return True

    while True:
        if not encher(2):
            return
        opcode = buf[0] & 0x0F
        tem_mascara = bool(buf[1] & 0x80)
        tam = buf[1] & 0x7F
        desloc = 2
        if tam == 126:
            if not encher(4):
                return
            tam = struct.unpack(">H", buf[2:4])[0]
            desloc = 4
        elif tam == 127:
            if not encher(10):
                return
            tam = struct.unpack(">Q", buf[2:10])[0]
            desloc = 10
        chave = b""
        if tem_mascara:
            if not encher(desloc + 4):
                return
            chave = bytes(buf[desloc:desloc + 4])
            desloc += 4
        if not encher(desloc + tam):
            return
        carga = bytes(buf[desloc:desloc + tam])
        del buf[:desloc + tam]
        if chave:
            carga = bytes(b ^ chave[i % 4] for i, b in enumerate(carga))
        if opcode == 0x8:
            return
        if opcode in (0x0, 0x1, 0x2):
            yield carga


def escrever_mensagem(sock: socket.socket, dados: bytes) -> None:
    """Quadro binário sem máscara, que é o que servidor manda."""
    n = len(dados)
    if n < 126:
        cabecalho = struct.pack("!BB", 0x82, n)
    elif n < (1 << 16):
        cabecalho = struct.pack("!BBH", 0x82, 126, n)
    else:
        cabecalho = struct.pack("!BBQ", 0x82, 127, n)
    sock.sendall(cabecalho + dados)


def abrir_preview(ip: str, cookie: str, mascara: int, stream: str, tentativas: int = 6):
    caminho = (f"/websocket/preview?chnmask={mascara}"
               f"&streamType={'0' if stream == 'MAIN' else '1'}&iframe=0")
    for tentativa in range(1, tentativas + 1):
        sock = socket.create_connection((ip, 80), timeout=10)
        chave = base64.b64encode(os.urandom(16)).decode()
        sock.sendall((
            f"GET {caminho} HTTP/1.1\r\nHost: {ip}\r\n"
            "Upgrade: websocket\r\nConnection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {chave}\r\nSec-WebSocket-Version: 13\r\n"
            f"Cookie: {cookie}\r\n\r\n"
        ).encode())
        resposta = b""
        while b"\r\n\r\n" not in resposta:
            parte = sock.recv(4096)
            if not parte:
                break
            resposta += parte
        cabecalho, _, resto = resposta.partition(b"\r\n\r\n")
        primeira = cabecalho.split(b"\r\n")[0].decode(errors="replace")
        if "101" in primeira:
            return sock, resto
        sock.close()
        # 502 é o aparelho dizendo que já há um preview aberto — inclusive a aba
        # de Antevisão do configurador esquecida num navegador.
        print(f"  aparelho ocupado ({primeira}), tentativa {tentativa}/{tentativas}")
        time.sleep(3)
    raise RuntimeError("não consegui abrir o preview; feche a Antevisão do configurador")


# ---------------------------------------------------------------- servidor

class Servidor(http.server.BaseHTTPRequestHandler):
    opcoes = None  # preenchido em main
    # HTTP/1.1 não é detalhe: o navegador recusa upgrade de WebSocket anunciado
    # como HTTP/1.0, que é o padrão do BaseHTTPRequestHandler.
    protocol_version = "HTTP/1.1"

    def log_message(self, *_):
        pass  # o log padrão polui; o que interessa é impresso à mão

    def do_GET(self):
        if self.path.startswith("/stream"):
            self.repassar()
            return
        if self.path in ("/", "/index.html"):
            with open(os.path.join(AQUI, "video_wall.html"), "rb") as f:
                corpo = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(corpo)))
            self.end_headers()
            self.wfile.write(corpo)
            return
        self.send_error(404)

    def repassar(self):
        chave = self.headers.get("Sec-WebSocket-Key")
        if not chave:
            self.send_error(400, "esperado um upgrade de websocket")
            return
        aceite = base64.b64encode(hashlib.sha1(chave.encode() + GUID).digest()).decode()
        self.send_response(101)
        self.send_header("Upgrade", "websocket")
        self.send_header("Connection", "Upgrade")
        self.send_header("Sec-WebSocket-Accept", aceite)
        self.end_headers()

        o = self.opcoes
        print(f"navegador conectou; abrindo preview de {o.ip}")
        try:
            aparelho, sobra = abrir_preview(o.ip, o.cookie, o.canais, o.stream)
        except Exception as erro:
            print(f"  falhou: {erro}")
            return

        print("  repassando")
        navegador = self.connection
        parar = threading.Event()

        def vigiar_navegador():
            # O navegador só manda close e ping; o que importa é saber quando
            # ele foi embora, para soltar a sessão única do aparelho.
            for _ in ler_mensagens(navegador, b"", mascarado=True):
                pass
            parar.set()

        threading.Thread(target=vigiar_navegador, daemon=True).start()
        enviadas = 0
        try:
            aparelho.settimeout(1.0)
            for carga in ler_mensagens(aparelho, sobra, mascarado=False):
                if parar.is_set():
                    break
                escrever_mensagem(navegador, carga)
                enviadas += 1
        except OSError:
            pass
        finally:
            aparelho.close()
            print(f"  encerrado depois de {enviadas} mensagens")


class ServidorThreads(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--ip", default="192.168.15.100")
    ap.add_argument("--usuario", default="admin")
    ap.add_argument("--senha", default="Avs01472")
    ap.add_argument("--porta", type=int, default=8099)
    ap.add_argument("--canais", type=int, default=63,
                    help="máscara de bits: 63 = 0b111111 = canais 1 a 6")
    ap.add_argument("--stream", choices=["MAIN", "SUB"], default="SUB")
    args = ap.parse_args()

    print(f"autenticando em {args.ip}")
    args.cookie = autenticar(args.ip, args.usuario, args.senha)
    print("  sessão obtida")

    Servidor.opcoes = args
    with ServidorThreads(("127.0.0.1", args.porta), Servidor) as servidor:
        print(f"\n  abra  http://localhost:{args.porta}\n")
        try:
            servidor.serve_forever()
        except KeyboardInterrupt:
            print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
