import paramiko
import os

HOST = "<SERVER_IP>"
USER = "root"
PASS = "<SERVER_PASSWORD>"
REMOTE_DIR = os.environ.get("REMOTE_GATEWAY_DIR", "/var/www/mysterio_gateway")

local_file = "gateway_bot.js"
remote_file = os.path.join(REMOTE_DIR, local_file).replace('\\', '/')

print(f"[*] Connecting to {HOST}...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
    ssh.connect(HOST, username=USER, password=PASS)
    print("[+] Connected successfully!")
except Exception as e:
    print(f"[-] Connection failed: {e}")
    exit(1)

# Ensure remote directory exists
print(f"[*] Ensuring remote directory {REMOTE_DIR} exists...")
ssh.exec_command(f"mkdir -p {REMOTE_DIR}")

# Upload the gateway_bot.js script via SFTP
sftp = ssh.open_sftp()
local_path = os.path.join(os.getcwd(), local_file)
print(f"[*] Uploading {local_file} -> {remote_file}...")
try:
    sftp.put(local_path, remote_file)
    print("[+] File uploaded successfully!")
    ssh.exec_command(f"chmod 644 {remote_file}")
except Exception as e:
    print(f"[-] Upload failed: {e}")
    sftp.close()
    ssh.close()
    exit(1)
sftp.close()

# Start/Restart the bot using PM2 and delete old files from /var/www/mysterio
print("[*] Configuring PM2, cleaning up old files, and restarting process 'gateway-bot'...")
commands = [
    # Clean up the old process and files from `/var/www/mysterio`
    "pm2 delete mysterio-gateway || true",
    "rm -f /var/www/mysterio/gateway_bot.js",
    "rm -f /var/www/mysterio/data/gateway_sessions.json",
    
    # Configure and start the new isolated process
    "cd /var/www/gateway_bot",
    "pm2 delete gateway-bot || true",
    "pm2 start gateway_bot.js --name 'gateway-bot'",
    "pm2 save",
    "pm2 status"
]
full_command = " && ".join(commands)

stdin, stdout, stderr = ssh.exec_command(full_command)
out = stdout.read().decode('utf-8', errors='ignore')
err = stderr.read().decode('utf-8', errors='ignore')

print("--- Remote Output ---")
print(out.encode('ascii', errors='replace').decode('ascii'))
if err:
    print("--- Remote Error ---")
    print(err.encode('ascii', errors='replace').decode('ascii'))

ssh.close()
print("[+] Deployment and startup completed!")
