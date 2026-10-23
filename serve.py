"""Serve the ES-module prototype with reliable MIME types on Windows."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class ModuleHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".glb": "model/gltf-binary",
    }


if __name__ == "__main__":
    print("Open http://localhost:8000")
    ThreadingHTTPServer(("localhost", 8000), ModuleHandler).serve_forever()
