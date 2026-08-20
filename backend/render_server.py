import os
import sys
import time
import threading
import subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler

class HealthCheckHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-type", "application/json")
        self.end_headers()
        response = '{"status": "ok", "worker": "active", "service": "gradeflow-api"}'
        self.wfile.write(response.encode("utf-8"))
        
    def log_message(self, format, *args):
        # Prevent health check spam in logs
        pass

def run_health_server(port):
    server = HTTPServer(("0.0.0.0", port), HealthCheckHandler)
    print(f"[RenderWeb] Health check server listening on port {port}", flush=True)
    server.serve_forever()

def run_scraper_worker():
    print("=" * 60, flush=True)
    print("  GradeFlow Real-time Scraper — Render Worker Active", flush=True)
    print("  Ready to process requests from the portal...", flush=True)
    print("=" * 60, flush=True)
    
    env = os.environ.copy()
    env["MALLOC_ARENA_MAX"] = "2"
    env["PYTHONUNBUFFERED"] = "1"
    
    while True:
        try:
            # Run the scraper queue securely with memory constraints
            subprocess.run([sys.executable, "-m", "scraper.process_queue", "--quiet"], env=env, check=False)
        except Exception as e:
            print(f"[RenderWorker Error]: {e}", flush=True)
            
        time.sleep(5)

if __name__ == "__main__":
    # Render assigns the $PORT environment variable to web services
    port = int(os.environ.get("PORT", "10000"))
    
    # Start the very simple HTTP server in a background daemon thread
    http_thread = threading.Thread(target=run_health_server, args=(port,), daemon=True)
    http_thread.start()
    
    # Run the worker process on the main thread so logs are flush output natively
    try:
        run_scraper_worker()
    except KeyboardInterrupt:
        print("[RenderWeb] Shutting down gracefully...", flush=True)
