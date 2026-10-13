#!/usr/bin/env python3
"""Open a same-origin path in a debuggable WebView. The emulator job uses this for shots."""

import base64
import json
import os
import socket
import struct
import subprocess
import sys
import urllib.request


def adb(*args: str) -> str:
    result = subprocess.run(['adb', *args], check=True, stdout=subprocess.PIPE)
    return result.stdout.replace(b'\0', b' ').decode()


def forward_devtools() -> None:
    pid = adb('shell', 'pidof', '-s', 'com.boardarabia.app').strip()
    if not pid:
        raise SystemExit('the app process was not found')
    needle = f'webview_devtools_remote_{pid}'
    socket_name = ''
    for token in adb('shell', 'cat', '/proc/net/unix').split():
        if needle in token:
            socket_name = token.lstrip('@')
            break
    if not socket_name:
        raise SystemExit('WebView devtools socket was not found')
    subprocess.run(['adb', 'forward', '--remove', 'tcp:9222'], check=False, stdout=subprocess.DEVNULL)
    subprocess.run(['adb', 'forward', 'tcp:9222', f'localabstract:{socket_name}'], check=True)


def connect(ws_url: str) -> socket.socket:
    rest = ws_url[len('ws://') :]
    hostport, path = rest.split('/', 1)
    host, port = hostport.split(':')
    sock = socket.create_connection((host, int(port)), timeout=15)
    key = base64.b64encode(os.urandom(16)).decode()
    sock.sendall(
        (
            f'GET /{path} HTTP/1.1\r\n'
            f'Host: {hostport}\r\n'
            'Upgrade: websocket\r\n'
            'Connection: Upgrade\r\n'
            f'Sec-WebSocket-Key: {key}\r\n'
            'Sec-WebSocket-Version: 13\r\n\r\n'
        ).encode()
    )
    data = b''
    while b'\r\n\r\n' not in data:
        chunk = sock.recv(4096)
        if not chunk:
            raise SystemExit('devtools handshake closed')
        data += chunk
    status = data.split(b'\r\n', 1)[0]
    if b' 101 ' not in status:
        raise SystemExit(status.decode())
    return sock


def send_text(sock: socket.socket, payload: str) -> None:
    raw = payload.encode()
    mask = os.urandom(4)
    length = len(raw)
    frame = bytearray([0x81])
    if length < 126:
        frame.append(0x80 | length)
    else:
        frame.append(0xFE)
        frame += struct.pack('!H', length)
    frame += mask
    frame += bytes(byte ^ mask[index % 4] for index, byte in enumerate(raw))
    sock.sendall(frame)


def main() -> None:
    target = sys.argv[1]
    if not target.startswith('https://localhost/'):
        raise SystemExit('target must be an https://localhost path')
    forward_devtools()
    pages = json.load(urllib.request.urlopen('http://127.0.0.1:9222/json', timeout=15))
    page = next(item for item in pages if item.get('type') == 'page' and item.get('webSocketDebuggerUrl'))
    print(page.get('url', ''))
    sock = connect(page['webSocketDebuggerUrl'])
    send_text(
        sock,
        json.dumps({'id': 1, 'method': 'Page.navigate', 'params': {'url': target}}),
    )
    sock.close()
    print(target)


if __name__ == '__main__':
    main()
