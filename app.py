"""Форма — локальное приложение на Python, без сторонних зависимостей."""

import argparse
import json
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from recommender import recommend

STATIC = Path(__file__).parent / "static"


class Handler(BaseHTTPRequestHandler):
    def send_content(self, status, content, content_type):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Security-Policy", "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'")
        self.end_headers()
        self.wfile.write(content)

    def send_json(self, status, data):
        self.send_content(status, json.dumps(data, ensure_ascii=False).encode(), "application/json; charset=utf-8")

    def do_GET(self):
        route = urlsplit(self.path).path
        files = {"/": "index.html", "/styles.css": "styles.css", "/app.js": "app.js", "/favicon.svg": "favicon.svg"}
        if route == "/api/health":
            self.send_json(200, {"status": "ok"})
        elif route in files:
            path = STATIC / files[route]
            mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
            self.send_content(200, path.read_bytes(), mime + "; charset=utf-8")
        else:
            self.send_json(404, {"error": "Страница не найдена"})

    def do_POST(self):
        if urlsplit(self.path).path != "/api/recommend":
            self.send_json(404, {"error": "Страница не найдена"})
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 4096:
                raise ValueError("Некорректный размер запроса")
            payload = json.loads(self.rfile.read(size))
            result = recommend(payload)
        except (ValueError, TypeError, UnicodeDecodeError) as error:
            self.send_json(400, {"error": str(error)})
            return
        self.send_json(200, result)


def main():
    parser = argparse.ArgumentParser(description="Форма — помощник по выбору формы бизнеса")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Форма запущена → http://{args.host}:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nПриложение остановлено.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
