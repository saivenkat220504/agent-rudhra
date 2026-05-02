"""
Simple HTTP server for Vision App.
Serves files with proper MIME types for ES modules.
Run: python server.py
"""
import http.server
import os

PORT = 8080

class CORSHandler(http.server.SimpleHTTPRequestHandler):
    """Handler that adds CORS and proper MIME types."""
    
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'application/javascript',
        '.mjs': 'application/javascript',
        '.css': 'text/css',
        '.html': 'text/html',
        '.json': 'application/json',
        '.wasm': 'application/wasm',
    }

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()
    
    def log_message(self, format, *args):
        """Suppress noisy request logs, only show errors."""
        pass

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = http.server.HTTPServer(('0.0.0.0', PORT), CORSHandler)
    print(f'\n  🔮 Vision App running at: http://localhost:{PORT}\n')
    print(f'  Open this URL in Chrome/Edge with camera access.\n')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n  Server stopped.')
        server.server_close()
