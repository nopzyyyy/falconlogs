import imaplib
import email
import sys
from email.header import decode_header
from datetime import datetime

# Reconfigure stdout to handle non-ASCII/emojis gracefully
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(errors='replace')

# ── Config ──
EMAIL = os.environ.get("CHIME_EMAIL", "mysterio.payments@gmail.com")
PASSWORD = os.environ.get("CHIME_EMAIL_PASSWORD", "your_email_app_password")
IMAP_SERVER = "imap.gmail.com"
IMAP_PORT   = 993

def decode_mime(value):
    """Decode MIME-encoded header values."""
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
    """Extract plain-text body from email message."""
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            disp = str(part.get("Content-Disposition", ""))
            if ct == "text/plain" and "attachment" not in disp:
                payload = part.get_payload(decode=True)
                if payload:
                    charset = part.get_content_charset() or "utf-8"
                    return payload.decode(charset, errors="replace")
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            charset = msg.get_content_charset() or "utf-8"
            return payload.decode(charset, errors="replace")
    return "(No plain-text body)"

def main():
    print("=" * 60)
    print(f"  Gmail Email Checker")
    print(f"  Account: {EMAIL}")
    print(f"  Time:    {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    # Connect
    print(f"\n[*] Connecting to {IMAP_SERVER}:{IMAP_PORT} ...")
    try:
        mail = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT)
        print("[+] Connected successfully.")
    except Exception as e:
        print(f"[!] Connection failed: {e}")
        return

    # Login
    print(f"[*] Logging in as {EMAIL} ...")
    try:
        mail.login(EMAIL, PASSWORD)
        print("[+] Login successful!\n")
    except imaplib.IMAP4.error as e:
        print(f"[!] Login failed: {e}")
        print("[!] If using 2FA, you may need an App Password.")
        print("[!] Generate one at: https://account.microsoft.com/security")
        return

    # List mailbox folders
    print("-" * 60)
    print("  MAILBOX FOLDERS")
    print("-" * 60)
    status, folders = mail.list()
    if status == "OK":
        for f in folders:
            print(f"  {f.decode()}")

    # Select INBOX
    print("\n" + "-" * 60)
    print("  INBOX - LATEST 10 EMAILS")
    print("-" * 60)
    mail.select("INBOX")
    status, messages = mail.search(None, "ALL")

    if status != "OK" or not messages[0]:
        print("  (No emails found)")
        mail.logout()
        return

    mail_ids = messages[0].split()
    total = len(mail_ids)
    print(f"  Total emails in inbox: {total}\n")

    # Show latest 10
    latest = mail_ids[-10:] if total >= 10 else mail_ids
    latest.reverse()  # newest first

    for i, msg_id in enumerate(latest, 1):
        status, msg_data = mail.fetch(msg_id, "(RFC822)")
        if status != "OK":
            continue

        raw = msg_data[0][1]
        msg = email.message_from_bytes(raw)

        subject = decode_mime(msg["Subject"])
        sender  = decode_mime(msg["From"])
        date    = msg["Date"] or "(No date)"

        print(f"  +-- Email #{i}")
        print(f"  | From:    {sender}")
        print(f"  | Subject: {subject}")
        print(f"  | Date:    {date}")

        # Preview body (first 200 chars)
        body = get_body(msg)
        preview = body[:200].replace("\n", " ").replace("\r", "").strip()
        print(f"  | Preview: {preview}...")
        print(f"  +{'-' * 55}")
        print()

    # Check UNSEEN count
    status, unseen = mail.search(None, "UNSEEN")
    if status == "OK" and unseen[0]:
        unread_count = len(unseen[0].split())
        print(f"  [Unread] Unread emails: {unread_count}")
    else:
        print(f"  [Read] No unread emails")

    mail.logout()
    print("\n[+] Done. Logged out.")

if __name__ == "__main__":
    main()
