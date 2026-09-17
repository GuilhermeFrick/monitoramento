#!/usr/bin/env python3
"""Mostra ao vivo o que está entrando, uma linha por mensagem.

O log da sonda é fiel mas ilegível: cada mensagem ocupa três linhas e um JSON
inteiro. Isto condensa em uma linha por evento, com os valores já convertidos
para unidade de gente — volt em vez de centivolt, hora em vez de segundo.

    ./tools/watch.py /tmp/sonda.log

Marca com `histórico` toda mensagem cujo TIME é muito mais velho que a chegada.
É o comportamento de despejo ao reconectar, e vê-lo acontecendo ao vivo explica
mais do que qualquer documento.
"""
import json
import os
import re
import sys
import time
from datetime import datetime

ATRASO_HISTORICO = 300  # segundos entre o evento e a chegada para chamar de histórico

CORES = {
    "conexao": "\033[1;36m",
    "erro": "\033[1;31m",
    "historico": "\033[0;33m",
    "saude": "\033[0;32m",
    "apagado": "\033[0;90m",
    "zero": "\033[0m",
}


def cor(nome, texto):
    if not sys.stdout.isatty():
        return texto
    return f"{CORES[nome]}{texto}{CORES['zero']}"


def humano(bytes_):
    return f"{bytes_ / 2**30:.0f}GiB"


def descrever(d):
    """Devolve (rótulo, detalhe) para uma mensagem já decodificada."""
    op = d.get("OPERATION")

    if op == "CONNECT":
        p = d.get("PARAMETER") or d.get("RESPONSE") or {}
        if "DSNO" in p:
            return "conexão", f"{p.get('DSNO')} {p.get('DEVNAME','')} EV={p.get('EV')} canais={p.get('CHANNEL')}"
        return "conexão", f"resposta {p.get('ERRORCAUSE', '')}"

    if op == "KEEPALIVE":
        return "keepalive", ""

    if op == "GETSUPPORTSERVICE":
        p = d.get("PARAMETER", {})
        ligados = [k for k, v in sorted(p.items()) if v]
        return "capacidades", " ".join(ligados)

    if op == "UPDATEIOSTATUS":
        p = d.get("PARAMETER", {})
        acc = p.get("ACC", {}).get("A")
        pos = p.get("P", {})
        lat, lon = pos.get("W", "?"), pos.get("J", "?")
        if lat == "0.000000" and lon == "0.000000":
            local = "sem fixo de GPS"
        else:
            local = f"{lat},{lon} {pos.get('S', 0)}km/h"
        return "entradas", f"ACC={acc} {local}"

    if op == "DEVINFOCHANGEUPLOAD":
        p = d.get("PARAMETER", {})
        if "WLM" in p:
            w = p["WLM"]
            return "modem", f"RSSI={w.get('RSSI')} tipo={w.get('NT')} ip={w.get('IP')}"
        return "info", ",".join(sorted(p))

    if op == "SPI":
        return "tráfego", ""

    # tipo 30, sem MODULE
    if "VOLTAGE" in d:
        v = d["VOLTAGE"].get("MAIN", 0) / 100
        t = d.get("TEMP", {})
        e = (d.get("STORAGE") or [{}])[0]
        livre = humano(e.get("FREESIZE", 0))
        resta = e.get("SURPLUSTIME", 0) / 3600
        return "saúde", f"{v:.2f}V hd={t.get('HDD1', 0)/100:.0f}°C livre={livre} resta={resta:.0f}h"

    if "SWTIME" in d:
        return "liga/desliga", f"{len(d['SWTIME'])} ciclos"
    if "POWERINFO" in d:
        return "ignição", f"ACC={d['POWERINFO'].get('ACCSTATUS')}"
    if "RUNTIME" in d:
        r = d["RUNTIME"]
        return "operação", f"soc={r.get('SOCTIME', 0)/3600:.0f}h boots={r.get('SOCCNT')}"
    if "CAMERA" in d:
        c = d["CAMERA"]
        canais = bin(c.get("CHN", 0)).count("1")
        gravando = sum(1 for x in d.get("RECORD", []) if x.get("STATUS"))
        return "câmeras", f"{canais} canais, {gravando} gravando"

    if "MODULE" in d:
        return d["MODULE"].lower(), op or ""
    return "tipo30", ",".join(sorted(d))[:60]


def seguir(caminho):
    """tail -f simples, tolerante a arquivo que ainda não existe."""
    while not os.path.exists(caminho):
        time.sleep(0.5)
    with open(caminho, encoding="utf-8", errors="replace") as f:
        f.seek(0, os.SEEK_END)
        while True:
            linha = f.readline()
            if linha:
                yield linha
            else:
                time.sleep(0.2)


def main():
    caminho = sys.argv[1] if len(sys.argv) > 1 else "/tmp/sonda.log"
    print(f"acompanhando {caminho} — ctrl-c para sair\n", flush=True)

    for linha in seguir(caminho):
        agora = datetime.now().strftime("%H:%M:%S")

        if "conectou de" in linha:
            print(cor("conexao", f"{agora}  ── conexão aberta ──"), flush=True)
            continue
        if "fechou a conexão" in linha or "ERRO" in linha:
            print(cor("erro", f"{agora}  {linha.split('] ', 1)[-1].rstrip()}"), flush=True)
            continue
        if "bytes binários" in linha:
            m = re.search(r"(\d+) bytes binários", linha)
            print(f"{agora}  {'gps':<13} {cor('apagado', m.group(1) + ' bytes binários')}", flush=True)
            continue

        m = re.search(r"\{.*\}\s*$", linha.strip())
        if not m:
            continue
        try:
            d = json.loads(m.group(0))
        except json.JSONDecodeError:
            continue

        enviado = "    →" in linha
        rotulo, detalhe = descrever(d)

        # Mensagem cujo evento é bem mais velho que a chegada veio do despejo
        # de histórico. Marcar isso ao vivo é o ponto principal desta ferramenta.
        marca = ""
        if (t := d.get("TIME")) and (idade := time.time() - t) > ATRASO_HISTORICO:
            dias = idade / 86400
            marca = cor("historico", f"  ← histórico de {dias:.1f}d atrás" if dias >= 1 else f"  ← histórico de {idade/3600:.1f}h atrás")

        seta = cor("apagado", "→") if enviado else " "
        pintar = cor("saude", rotulo) if rotulo == "saúde" else rotulo
        print(f"{agora} {seta} {pintar:<13} {detalhe}{marca}", flush=True)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print()
