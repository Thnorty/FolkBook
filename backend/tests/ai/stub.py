"""A stand-in AI server on 127.0.0.1, for tests: records requests, answers from a queue."""

import json
import threading
import time
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest


@dataclass
class StubAi:
    url: str = ""
    requests: list[dict] = field(default_factory=list)
    replies: list[tuple[int, object, dict]] = field(default_factory=list)
    delay: float = 0

    def answer(self, status: int, body: object, headers: dict | None = None) -> None:
        self.replies.append((status, body, headers or {}))

    def chat_reply(self, content: str) -> None:
        self.answer(200, {"choices": [{"message": {"role": "assistant", "content": content}}]})


@pytest.fixture
def stub_ai():
    stub = StubAi()

    class Handler(BaseHTTPRequestHandler):
        def _handle(self):
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length else b""
            stub.requests.append(
                {
                    "method": self.command,
                    "path": self.path,
                    "headers": dict(self.headers),
                    "json": json.loads(raw) if raw else None,
                }
            )
            if stub.delay:
                time.sleep(stub.delay)
            status, body, headers = (
                stub.replies.pop(0) if stub.replies else (500, {"error": "no reply"}, {})
            )
            payload = body if isinstance(body, bytes) else json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            for name, value in headers.items():
                self.send_header(name, value)
            self.end_headers()
            self.wfile.write(payload)

        do_GET = do_POST = _handle

        def log_message(self, *args):  # quiet
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    stub.url = f"http://127.0.0.1:{server.server_address[1]}/v1"
    thread = threading.Thread(
        target=server.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True
    )
    thread.start()
    yield stub
    server.shutdown()
    server.server_close()


def closed_port() -> int:
    """A port nothing listens on."""
    import socket

    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]
