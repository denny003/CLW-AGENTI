import os
import sys
import json
import socket
import urllib.request
import urllib.error
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 8080
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SITE_DIR = os.path.join(BASE_DIR, 'site')
DATA_FILE = os.path.join(BASE_DIR, 'scripts', 'local_transfers.json')
REMOTE_API_BASE = os.environ.get('REMOTE_API_BASE', 'https://clw-agenti.netlify.app')

class LocalDevHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=SITE_DIR, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-oa-session')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        url_path = self.path.split('?')[0]

        clean_routes = {
            '/': '/index.html',
            '/gestione-ordini': '/gestione-ordini.html',
            '/pianificazione-produzione': '/pianificazione-produzione.html',
            '/offerta': '/offerta.html',
            '/configurazione': '/configurazione.html',
            '/giro-visite': '/giro-visite.html',
            '/area-sviluppo': '/area-sviluppo.html',
            '/privacy': '/privacy.html'
        }
        if url_path in clean_routes:
            self.path = clean_routes[url_path] + (('?' + self.path.split('?')[1]) if '?' in self.path else '')
            return super().do_GET()

        if url_path.startswith('/api/'):
            self.proxy_remote_get()
            return

        return super().do_GET()

    def do_POST(self):
        content_len = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_len).decode('utf-8') if content_len > 0 else '{}'
        try:
            payload = json.loads(body)
        except Exception:
            payload = {}

        self.proxy_remote_post(payload)

    def proxy_remote_get(self):
        remote_url = REMOTE_API_BASE + self.path
        try:
            req = urllib.request.Request(remote_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=5) as resp:
                content = resp.read()
                self.send_response(resp.status)
                self.send_header('Content-Type', resp.headers.get('Content-Type', 'application/json'))
                self.send_header('Content-Length', str(len(content)))
                self.end_headers()
                self.wfile.write(content)
        except Exception as e:
            self.send_json_response({'data': [], 'note': f'Proxy fallback: {e}'})

    def proxy_remote_post(self, payload):
        remote_url = REMOTE_API_BASE + self.path
        try:
            data_bytes = json.dumps(payload).encode('utf-8')
            req = urllib.request.Request(
                remote_url,
                data=data_bytes,
                headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'}
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                content = resp.read()
                self.send_response(resp.status)
                self.send_header('Content-Type', resp.headers.get('Content-Type', 'application/json'))
                self.send_header('Content-Length', str(len(content)))
                self.end_headers()
                self.wfile.write(content)
        except Exception as e:
            self.send_json_response({'success': True, 'mock': True, 'note': f'Local fallback: {e}'})

    def send_json_response(self, data, status=200):
        resp = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(resp)))
        self.end_headers()
        self.wfile.write(resp)

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'

if __name__ == '__main__':
    local_ip = get_local_ip()
    server_address = ('', PORT)
    httpd = HTTPServer(server_address, LocalDevHandler)

    print("=" * 64)
    print("🚀 CLW-AGENTI — SERVER LOCALE ATTIVO")
    print("=" * 64)
    print(f"💻 Da questo computer (PC):")
    print(f"   👉 http://localhost:{PORT}/ (Dashboard)")
    print(f"   👉 http://localhost:{PORT}/offerta.html (Nuova Offerta/Ordine)")
    print(f"   👉 http://localhost:{PORT}/gestione-ordini.html")
    print(f"   👉 http://localhost:{PORT}/area-sviluppo.html")
    print("")
    print(f"📱 Dal tuo SMARTPHONE (stesso Wi-Fi):")
    print(f"   👉 http://{local_ip}:{PORT}/")
    print("=" * 64)
    print("Premi Ctrl+C per arrestare il server.")
    print("=" * 64)
    sys.stdout.flush()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer arrestato.")
