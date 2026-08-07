import sys
import os
import time
import json
import socket
import threading
import io
import ctypes
from ctypes import wintypes
import mss
from PIL import Image

PORT = 6129
IS_RUNNING = True
IS_INPUT_LOCKED = False
IS_BLACKOUT = False

# WIN32 API Setup via ctypes
user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

# Get screen resolution
user32.SetProcessDPIAware()
SCREEN_WIDTH = user32.GetSystemMetrics(0)
SCREEN_HEIGHT = user32.GetSystemMetrics(1)

# Mouse event constants
MOUSEEVENTF_MOVE = 0x0001
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004
MOUSEEVENTF_RIGHTDOWN = 0x0008
MOUSEEVENTF_RIGHTUP = 0x0010

# Keyboard event constants
VK_CONTROL = 0x11
VK_MENU = 0x12
VK_DELETE = 0x2E
VK_LWIN = 0x5B
VK_TAB = 0x09
VK_SNAPSHOT = 0x2C
VK_LEFT = 0x25
VK_RIGHT = 0x27
VK_RETURN = 0x0D
VK_ESCAPE = 0x1B
KEYEVENTF_KEYUP = 0x0002

def enable_uac_registry():
    try:
        import winreg
        key = winreg.CreateKeyEx(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System", 0, winreg.KEY_SET_VALUE)
        winreg.SetValueEx(key, "PromptOnSecureDesktop", 0, winreg.REG_DWORD, 0)
        winreg.CloseKey(key)
    except Exception as e:
        pass

def capture_screen_base64(sct):
    try:
        monitor = sct.monitors[1]  # Primary monitor
        sct_img = sct.grab(monitor)
        img = Image.frombytes("RGB", sct_img.size, sct_img.bgra, "raw", "BGRX")
        
        # Resize slightly or compress JPEG for maximum 60 FPS streaming speed
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=65, optimize=True)
        import base64
        return base64.b64encode(buffer.getvalue()).decode('utf-8')
    except Exception as e:
        return None

def handle_mouse_input(data):
    try:
        x_pct = data.get("xPercent", 0)
        y_pct = data.get("yPercent", 0)
        action = data.get("action", "")
        button = data.get("button", "left")

        target_x = int(SCREEN_WIDTH * x_pct)
        target_y = int(SCREEN_HEIGHT * y_pct)

        user32.SetCursorPos(target_x, target_y)

        if action == "mousedown":
            if button == "right":
                user32.mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0)
            else:
                user32.mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
        elif action == "mouseup":
            if button == "right":
                user32.mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0)
            else:
                user32.mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
        elif action == "click":
            if button == "right":
                user32.mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0)
                user32.mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0)
            else:
                user32.mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
                user32.mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
    except Exception as e:
        pass

def handle_keyboard_input(data):
    try:
        key = data.get("key", "")
        if key == "CAD":
            user32.keybd_event(VK_CONTROL, 0, 0, 0)
            user32.keybd_event(VK_MENU, 0, 0, 0)
            user32.keybd_event(VK_DELETE, 0, 0, 0)
            time.sleep(0.05)
            user32.keybd_event(VK_DELETE, 0, KEYEVENTF_KEYUP, 0)
            user32.keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0)
            user32.keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0)
        elif key == "UAC_YES":
            user32.keybd_event(VK_MENU, 0, 0, 0)
            user32.keybd_event(0x45, 0, 0, 0) # 'E'
            time.sleep(0.05)
            user32.keybd_event(0x45, 0, KEYEVENTF_KEYUP, 0)
            user32.keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0)

            user32.keybd_event(VK_LEFT, 0, 0, 0)
            user32.keybd_event(VK_LEFT, 0, KEYEVENTF_KEYUP, 0)
            time.sleep(0.05)
            user32.keybd_event(VK_RETURN, 0, 0, 0)
            user32.keybd_event(VK_RETURN, 0, KEYEVENTF_KEYUP, 0)
        elif len(key) == 1:
            vk = user32.VkKeyScanW(ord(key))
            if vk != -1:
                user32.keybd_event(vk & 0xFF, 0, 0, 0)
                user32.keybd_event(vk & 0xFF, 0, KEYEVENTF_KEYUP, 0)
    except Exception as e:
        pass

def handle_client(conn, addr):
    global IS_INPUT_LOCKED, IS_BLACKOUT
    print(f"[+] Connection accepted from {addr}")

    hostname = socket.gethostname()
    username = os.getlogin() if hasattr(os, 'getlogin') else "Admin"
    handshake = json.dumps({
        "type": "HANDSHAKE_ACK",
        "agentVersion": "DameWare Python Ultra v12.2",
        "hostname": hostname,
        "user": username,
        "os": f"Windows {sys.platform}"
    }) + "\n"
    conn.sendall(handshake.encode('utf-8'))

    # Streaming thread
    def stream_loop():
        with mss.mss() as sct:
            while IS_RUNNING:
                try:
                    if IS_BLACKOUT:
                        packet = json.dumps({
                            "type": "SCREEN_FRAME_BLACKOUT",
                            "blackedOut": True,
                            "timestamp": int(time.time() * 1000)
                        }) + "\n"
                        conn.sendall(packet.encode('utf-8'))
                    else:
                        frame_b64 = capture_screen_base64(sct)
                        if frame_b64:
                            packet = json.dumps({
                                "type": "SCREEN_FRAME",
                                "frame": frame_b64,
                                "timestamp": int(time.time() * 1000),
                                "width": SCREEN_WIDTH,
                                "height": SCREEN_HEIGHT
                            }) + "\n"
                            conn.sendall(packet.encode('utf-8'))
                    time.sleep(0.033)  # ~30 FPS
                except Exception as e:
                    break

    stream_thread = threading.Thread(target=stream_loop, daemon=True)
    stream_thread.start()

    # Input listener loop
    buffer = ""
    while IS_RUNNING:
        try:
            data = conn.recv(8192)
            if not data:
                break
            buffer += data.decode('utf-8', errors='ignore')
            lines = buffer.split('\n')
            buffer = lines.pop()

            for line in lines:
                if line.strip():
                    cmd = json.loads(line.strip())
                    cmd_type = cmd.get("type")
                    if cmd_type == "MOUSE_INPUT":
                        handle_mouse_input(cmd)
                    elif cmd_type == "KEYBOARD_INPUT":
                        handle_keyboard_input(cmd)
                    elif cmd_type == "LOCK_INPUT":
                        IS_INPUT_LOCKED = cmd.get("locked", False)
                        user32.BlockInput(IS_INPUT_LOCKED)
                    elif cmd_type == "BLACKOUT_SCREEN":
                        IS_BLACKOUT = cmd.get("blackout", False)
        except Exception as e:
            break

    conn.close()
    print("[-] Connection closed")

def start_agent():
    enable_uac_registry()
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(("0.0.0.0", PORT))
    server.listen(5)
    print(f"[*] DameWare Python Ultra Agent listening on port {PORT}...")

    while IS_RUNNING:
        conn, addr = server.accept()
        t = threading.Thread(target=handle_client, args=(conn, addr), daemon=True)
        t.start()

if __name__ == "__main__":
    start_agent()
