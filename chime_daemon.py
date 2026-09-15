import imaplib
import email
import sys
import re
import time
import requests
from email.header import decode_header
from datetime import datetime

# ── Config ──
EMAIL = os.environ.get("CHIME_EMAIL", "mysterio.payments@gmail.com")
PASSWORD = os.environ.get("CHIME_EMAIL_PASSWORD", "your_email_app_password")
IMAP_SERVER = "imap.gmail.com"
IMAP_PORT = 993

WEBHOOK_URL = os.environ.get("CHIME_WEBHOOK_URL", "http://localhost:3001/api/payments/chime-webhook")
WEBHOOK_TOKEN = os.environ.get("CHIME_WEBHOOK_TOKEN", "mysterio_chime_secure_token_2026")

# Reconfigure stdout to handle non-ASCII/emojis gracefully
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(errors='replace')

def decode_mime(value):
    if value is None:
        return "(No value)"
    parts = decode_header(value)
    decoded = []
    for part, charset in parts:
        if isinstance(part, bytes):
            decoded.append(part.decode(charset or "utf-8", errors="replace"))
        else:
            decoded.append(part)
    return " ".join(decoded)

def get_body(msg):
    """Extract plain-text or HTML body from email message."""
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            disp = str(part.get("Content-Disposition", ""))
            if (ct == "text/plain" or ct == "text/html") and "attachment" not in disp:
                payload = part.get_payload(decode=True)
                if payload:
                    charset = part.get_content_charset() or "utf-8"
                    return payload.decode(charset, errors="replace")
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            charset = msg.get_content_charset() or "utf-8"
            return payload.decode(charset, errors="replace")
    return ""

def process_email(mail, msg_id):
    try:
        status, msg_data = mail.fetch(msg_id, "(RFC822)")
        if status != "OK" or not msg_data:
            return False

        raw = msg_data[0][1]
        msg = email.message_from_bytes(raw)

        subject = decode_mime(msg["Subject"])
        sender  = decode_mime(msg["From"])

        # Check if the email is from Chime
        if "chime" not in sender.lower() and "chime" not in subject.lower():
            return False

        print(f"[*] Processing alert from: {sender} | Subject: {subject}")

        body = get_body(msg)
        # Strip HTML tags to make regex scanning simple and robust
        body_clean = re.sub(r'<[^>]+>', ' ', body)
        
        # 1. Parse amount (e.g. $1.00, $45.50, $1,250.00)
        amount_match = re.search(r'\$([0-9,]+\.[0-9]{2})', body_clean)
        
        # 2. Parse Order ID or Topup ID (e.g. ORD-B2F5A31E or TOP-4A1C8E2D)
        id_match = re.search(r'(ORD-[0-9A-F]{8}|TOP-[0-9A-F]{8})', body_clean, re.IGNORECASE)

        if amount_match:
            amount_str = amount_match.group(1).replace(',', '')
            amount = float(amount_str)
            txn_id = id_match.group(1).upper() if id_match else None

            print(f"[+] Parsed Transaction! ID: {txn_id} | Amount: ${amount}")

            # Send payload to server webhook
            payload = {
                "id": txn_id,
                "amount": amount,
                "sender": sender
            }
            headers = {
                "Authorization": f"Bearer {WEBHOOK_TOKEN}",
                "Content-Type": "application/json"
            }

            try:
                response = requests.post(WEBHOOK_URL, json=payload, headers=headers, timeout=10)
                if response.status_code == 200:
                    res_data = response.json()
                    print(f"[+] Webhook triggered successfully: {res_data}")
                    # Mark the email as SEEN (Read) since it is successfully processed
                    mail.store(msg_id, '+FLAGS', '\\Seen')
                    print(f"[+] Marked email #{msg_id.decode()} as Read.")
                    return True
                else:
                    print(f"[!] Webhook returned error code {response.status_code}: {response.text}")
            except Exception as ex:
                print(f"[!] Failed to connect to server webhook: {ex}")
        else:
            print(f"[!] Could not extract amount from email. Amount found: {amount_match is not None}")
            print(f"[-] Preview of cleaned body: {body_clean[:300].strip()}...")
            
    except Exception as e:
        print(f"[!] Error processing email #{msg_id.decode()}: {e}")
    return False

def check_inbox():
    print(f"[*] Connecting to {IMAP_SERVER}...")
    try:
        mail = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT)
        mail.login(EMAIL, PASSWORD)
        mail.select("INBOX")
    except Exception as e:
        print(f"[!] IMAP Connection/Auth failed: {e}")
        return

    # Search for UNSEEN emails
    status, messages = mail.search(None, "UNSEEN")
    if status == "OK" and messages[0]:
        mail_ids = messages[0].split()
        print(f"[+] Found {len(mail_ids)} unread email(s) in inbox.")
        for msg_id in mail_ids:
            process_email(mail, msg_id)
            
    try:
        mail.logout()
    except:
        pass

def main():
    print("=" * 60)
    print("   CHIME EMAIL DAEMON PROCESSOR")
    print(f"   Monitoring: {EMAIL}")
    print(f"   Time Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    while True:
        try:
            check_inbox()
        except KeyboardInterrupt:
            print("\n[-] Daemon stopped by user.")
            break
        except Exception as e:
            print(f"[!] General daemon loop error: {e}")
        
        # Sleep for 10 seconds before next check
        time.sleep(10)

if __name__ == "__main__":
    main()
