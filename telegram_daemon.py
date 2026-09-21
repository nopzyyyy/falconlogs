import asyncio
import os
import json
import time
import re
import sys
from telethon import TelegramClient
from telethon.tl.types import Channel, Chat
from telethon.errors import FloodWaitError, SessionPasswordNeededError

# API credentials
api_id = int(os.environ.get("TELEGRAM_API_ID", 12345678))
api_hash = os.environ.get("TELEGRAM_API_HASH", "your_telegram_api_hash")
SESSION_NAME = os.environ.get("TELEGRAM_SESSION_NAME", "falconlogs_session")

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SETTINGS_FILE = os.path.join(BASE_DIR, "data", "settings.json")
STATUS_FILE = os.path.join(BASE_DIR, "data", "telegram_forwarder_status.json")

def read_settings():
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error reading settings: {e}")
    return {}

def read_status():
    if os.path.exists(STATUS_FILE):
        try:
            with open(STATUS_FILE, "r") as f:
                return json.load(f)
        except Exception as e:
            pass
    return {"last_run_time": 0}

def write_status(status):
    try:
        os.makedirs(os.path.dirname(STATUS_FILE), exist_ok=True)
        with open(STATUS_FILE, "w") as f:
            json.dump(status, f, indent=2)
    except Exception as e:
        print(f"Error writing status: {e}")

# Parse link to get entity and message id
def parse_tg_link(link):
    # e.g., https://t.me/Flowmark/1287 or https://t.me/c/120938102/1287
    link = link.strip().replace("https://", "").replace("http://", "").replace("t.me/", "")
    parts = [p for p in link.split("/") if p]
    if len(parts) >= 2:
        if parts[0] == "c":
            channel_id = parts[1]
            if not channel_id.startswith("-100"):
                channel_id = "-100" + channel_id
            return int(channel_id), int(parts[2])
        else:
            return parts[0], int(parts[1])
    return None, None

async def run_forwarding():
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Starting auto-forwarder run...")
    settings = read_settings()
    cfg = settings.get("telegramForwarder", {})
    link = cfg.get("sourceMessageLink", "")
    
    entity, msg_id = parse_tg_link(link)
    if not entity or not msg_id:
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Error: Invalid message link: '{link}'")
        return False
        
    client = TelegramClient(os.path.join(BASE_DIR, SESSION_NAME), api_id, api_hash)
    await client.connect()
    
    if not await client.is_user_authorized():
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Error: Telethon client is not authorized! Please run with --login first.")
        await client.disconnect()
        return False
        
    try:
        print(f"Fetching message {msg_id} from {entity}...")
        msg = await client.get_messages(entity, ids=msg_id)
        if not msg:
            print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Error: Target message not found!")
            await client.disconnect()
            return False
            
        print("Fetching dialogs...")
        dialogs = await client.get_dialogs()
        
        # Filter for groups and channels only (EXCLUDE individual contacts/users!)
        targets = []
        for d in dialogs:
            if (d.is_group or d.is_channel) and not d.is_user:
                targets.append(d)
                
        print(f"Found {len(targets)} eligible groups/channels. Starting forwards...")
        
        success = 0
        failed = 0
        
        for i, target in enumerate(targets):
            name = getattr(target, "name", "Unknown")
            print(f"[{i+1}/{len(targets)}] Forwarding to '{name}' ({target.id})...")
            try:
                await client.forward_messages(target.id, msg)
                success += 1
                await asyncio.sleep(3.0)  # sleep 3s between forwards to prevent rate limiting
            except FloodWaitError as e:
                print(f"FloodWait encountered: sleeping for {e.seconds} seconds...")
                await asyncio.sleep(e.seconds)
                try:
                    await client.forward_messages(target.id, msg)
                    success += 1
                except Exception as ex:
                    print(f"Failed to forward to '{name}' after flood sleep: {ex}")
                    failed += 1
            except Exception as e:
                print(f"Failed to forward to '{name}': {e}")
                failed += 1
                await asyncio.sleep(1.0)
                
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Completed run: {success} successfully sent, {failed} failed.")
        
        # Save last run status
        status = read_status()
        status["last_run_time"] = int(time.time())
        status["last_run_success"] = success
        status["last_run_failed"] = failed
        status["status"] = "idle"
        write_status(status)
        
        await client.disconnect()
        return True
        
    except Exception as e:
        print(f"Exception during forwarding: {e}")
        await client.disconnect()
        return False

async def main_loop():
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Background forwarding daemon active.")
    while True:
        try:
            settings = read_settings()
            cfg = settings.get("telegramForwarder", {})
            enabled = cfg.get("enabled", False)
            interval_hours = float(cfg.get("intervalHours", 6))
            
            if enabled:
                status = read_status()
                last_run = status.get("last_run_time", 0)
                now = int(time.time())
                
                # Check if it is time to run
                if now >= last_run + (interval_hours * 3600):
                    status["status"] = "running"
                    write_status(status)
                    await run_forwarding()
            else:
                pass
                
        except Exception as e:
            print(f"Error in daemon loop: {e}")
            
        await asyncio.sleep(60)  # check settings every 60 seconds

if __name__ == "__main__":
    if "--login" in sys.argv:
        phone = "+16472173809"
        password = "janeeshanethmini"
        client = TelegramClient(os.path.join(BASE_DIR, SESSION_NAME), api_id, api_hash)
        
        async def do_login():
            await client.connect()
            if await client.is_user_authorized():
                print("Successfully authenticated! Session is already valid.")
                await client.disconnect()
                return
                
            print(f"Starting login sequence for phone: {phone}")
            sent = await client.send_code_request(phone)
            print("Telegram verification code sent to your app.")
            
            # Interactive prompt (stdin)
            code = input("ENTER CODE: ").strip()
            
            try:
                await client.sign_in(phone, code)
                print("Login successful! Session authenticated.")
            except SessionPasswordNeededError:
                print("2FA password required. Attempting with password...")
                await client.sign_in(password=password)
                print("Login successful (2FA verified)!")
            except Exception as e:
                print(f"Login failed: {e}")
            
            await client.disconnect()
            
        asyncio.run(do_login())
    else:
        asyncio.run(main_loop())
