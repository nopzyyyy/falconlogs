import json
from http.server import BaseHTTPRequestHandler, HTTPServer

class WebhookHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        
        try:
            payload = json.loads(post_data.decode('utf-8'))
            
            # Zapier's default payload format can vary, so we handle both nested and flat structures
            subject = payload.get('subject') or payload.get('Subject') or 'No Subject'
            sender = payload.get('from') or payload.get('From') or 'Unknown Sender'
            body = payload.get('body') or payload.get('Body') or payload.get('bodyPreview') or 'No Content'
            date = payload.get('receivedDateTime') or payload.get('Date') or 'Unknown Date'
            
            print("\n" + "="*50)
            print(" 📬 NEW EMAIL RECEIVED VIA WEBHOOK")
            print("="*50)
            print(f" From:    {sender}")
            print(f" Subject: {subject}")
            print(f" Date:    {date}")
            print(f" Preview: {body[:300]}...")
            print("="*50 + "\n")
            
        except Exception as e:
            print(f"[-] Error parsing payload: {e}")
            print(f"[-] Raw payload data: {post_data.decode('utf-8')}")
            
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')

def run(port=5000):
    server_address = ('0.0.0.0', port)
    httpd = HTTPServer(server_address, WebhookHandler)
    print(f"[+] Webhook server running on port {port}...")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[-] Server stopped.")

if __name__ == '__main__':
    run()
