"""
RemoteMM Agent v4.0 - Gercek Windows Servisi
--------------------------------------------------
SCM (Service Control Manager) modunda:
  pywin32 ServiceFramework ile RegisterServiceCtrlHandler() cagirir
  SERVICE_RUNNING rapor eder → SCM mutlu
  WTSQueryUserToken + CreateProcessAsUser ile kullanici oturumunda --server baslatir
  Watchdog: server olmediyse 5 saniyede yeniden baslatir

--server modunda:
  GDI32 ile ekran yakala, TCP 6129 uzerinden stream et
  SendInput ile fare/klavye kontrolu
"""

import sys, os, time, json, socket, threading, io, ctypes, ctypes.wintypes, base64

kernel32 = ctypes.windll.kernel32
userenv  = ctypes.windll.userenv
wtsapi32 = ctypes.windll.wtsapi32
user32   = ctypes.windll.user32
gdi32    = ctypes.windll.gdi32

PORT       = 6129
AGENT_PATH = os.path.abspath(sys.executable if getattr(sys, 'frozen', False) else __file__)

# ─── Windows Yapilari ────────────────────────────────────────
class STARTUPINFO(ctypes.Structure):
    _fields_ = [
        ('cb',              ctypes.c_ulong),
        ('lpReserved',      ctypes.c_wchar_p),
        ('lpDesktop',       ctypes.c_wchar_p),
        ('lpTitle',         ctypes.c_wchar_p),
        ('dwX',             ctypes.c_ulong), ('dwY', ctypes.c_ulong),
        ('dwXSize',         ctypes.c_ulong), ('dwYSize', ctypes.c_ulong),
        ('dwXCountChars',   ctypes.c_ulong), ('dwYCountChars', ctypes.c_ulong),
        ('dwFillAttribute', ctypes.c_ulong),
        ('dwFlags',         ctypes.c_ulong),
        ('wShowWindow',     ctypes.c_ushort),
        ('cbReserved2',     ctypes.c_ushort),
        ('lpReserved2',     ctypes.c_void_p),
        ('hStdInput',       ctypes.c_void_p),
        ('hStdOutput',      ctypes.c_void_p),
        ('hStdError',       ctypes.c_void_p),
    ]

class PROCESS_INFORMATION(ctypes.Structure):
    _fields_ = [
        ('hProcess', ctypes.c_void_p), ('hThread', ctypes.c_void_p),
        ('dwProcessId', ctypes.c_ulong), ('dwThreadId', ctypes.c_ulong),
    ]

class BITMAPINFOHEADER(ctypes.Structure):
    _fields_ = [
        ('biSize', ctypes.c_uint32), ('biWidth', ctypes.c_int32),
        ('biHeight', ctypes.c_int32), ('biPlanes', ctypes.c_uint16),
        ('biBitCount', ctypes.c_uint16), ('biCompression', ctypes.c_uint32),
        ('biSizeImage', ctypes.c_uint32), ('biXPelsPerMeter', ctypes.c_int32),
        ('biYPelsPerMeter', ctypes.c_int32), ('biClrUsed', ctypes.c_uint32),
        ('biClrImportant', ctypes.c_uint32),
    ]

# ─── WTS / Kullanici Oturumu Launcher ───────────────────────
def get_active_session():
    try:
        return kernel32.WTSGetActiveConsoleSessionId()
    except AttributeError:
        # Fallback for older windows versions if somehow kernel32 doesn't have it
        return 1

advapi32 = ctypes.windll.advapi32

# Setup proper ctypes for 64-bit pointers
kernel32.GetCurrentProcess.restype = ctypes.c_void_p
advapi32.OpenProcessToken.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.POINTER(ctypes.c_void_p)]
advapi32.OpenProcessToken.restype = ctypes.c_int32
advapi32.DuplicateTokenEx.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_void_p, ctypes.c_int32, ctypes.c_int32, ctypes.POINTER(ctypes.c_void_p)]
advapi32.DuplicateTokenEx.restype = ctypes.c_int32
advapi32.SetTokenInformation.argtypes = [ctypes.c_void_p, ctypes.c_int32, ctypes.c_void_p, ctypes.c_uint32]
advapi32.SetTokenInformation.restype = ctypes.c_int32
advapi32.CreateProcessAsUserW.argtypes = [ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_wchar_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_bool, ctypes.c_uint32, ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_void_p, ctypes.c_void_p]
advapi32.CreateProcessAsUserW.restype = ctypes.c_int32

def get_system_token_for_session(session_id):
    hToken = ctypes.c_void_p()
    # TOKEN_ALL_ACCESS = 0xF01FF
    if not advapi32.OpenProcessToken(kernel32.GetCurrentProcess(), 0xF01FF, ctypes.byref(hToken)):
        return None
    
    hTokenDup = ctypes.c_void_p()
    class SECURITY_ATTRIBUTES(ctypes.Structure):
        _fields_ = [("nLength", ctypes.c_uint32), ("lpSecurityDescriptor", ctypes.c_void_p), ("bInheritHandle", ctypes.c_int32)]
    sa = SECURITY_ATTRIBUTES()
    sa.nLength = ctypes.sizeof(SECURITY_ATTRIBUTES)
    
    # SecurityImpersonation = 2, TokenPrimary = 1
    if not advapi32.DuplicateTokenEx(hToken, 0xF01FF, ctypes.byref(sa), 2, 1, ctypes.byref(hTokenDup)):
        kernel32.CloseHandle(hToken)
        return None
        
    kernel32.CloseHandle(hToken)
    
    # TokenSessionId = 12
    sess_id = ctypes.c_uint32(session_id)
    advapi32.SetTokenInformation(hTokenDup, 12, ctypes.byref(sess_id), ctypes.sizeof(sess_id))
    return hTokenDup

def launch_server_in_user_session():
    """SYSTEM olarak calisirken kullanici masaustunde --server baslatir."""
    session_id = get_active_session()
    if session_id == 0xFFFFFFFF:
        return False
        
    token = get_system_token_for_session(session_id)
    if not token: return False

    env_block = ctypes.c_void_p()
    userenv.CreateEnvironmentBlock(ctypes.byref(env_block), token, False)

    si = STARTUPINFO()
    si.cb          = ctypes.sizeof(STARTUPINFO)
    si.lpDesktop   = "WinSta0\\Default"
    si.dwFlags     = 0x00000001
    si.wShowWindow = 0

    pi  = PROCESS_INFORMATION()
    if getattr(sys, 'frozen', False):
        cmd_str = f'"{AGENT_PATH}" --server'
    else:
        cmd_str = f'"{sys.executable}" "{AGENT_PATH}" --server'

    cmd_buf = ctypes.create_unicode_buffer(cmd_str)

    ok = advapi32.CreateProcessAsUserW(
        token, None, cmd_buf, None, None, False,
        0x00000400 | 0x08000000,
        env_block if env_block else None,
        None, ctypes.byref(si), ctypes.byref(pi)
    )
    if env_block: userenv.DestroyEnvironmentBlock(env_block)
    log_file = os.path.join(os.path.dirname(AGENT_PATH), "agent_debug.log")
    if ok:
        kernel32.CloseHandle(pi.hProcess)
        kernel32.CloseHandle(pi.hThread)
        with open(log_file, "a") as f: f.write(f"[{time.time()}] Launched --server in session {session_id} successfully.\n")
    else:
        err = kernel32.GetLastError()
        with open(log_file, "a") as f: f.write(f"[{time.time()}] CreateProcessAsUserW failed with error {err}\n")
    return bool(ok)

def server_running():
    try:
        s = socket.socket(); s.settimeout(1)
        s.connect(('127.0.0.1', PORT)); s.close(); return True
    except: return False

def watchdog_loop():
    """Arka planda calisir: server yoksa yeniden baslatir."""
    log_file = os.path.join(os.path.dirname(AGENT_PATH), "agent_debug.log")
    os.system('netsh advfirewall firewall delete rule name=RemoteMMAgent >nul 2>&1')
    os.system(f'netsh advfirewall firewall add rule name=RemoteMMAgent dir=in action=allow protocol=TCP localport={PORT} >nul 2>&1')
    last_launch = 0
    with open(log_file, "a") as f: f.write(f"[{time.time()}] Watchdog started in session {get_active_session()}.\n")
    while True:
        try:
            if not server_running():
                now = time.time()
                if now - last_launch > 10:
                    sess = get_active_session()
                    if sess != 0xFFFFFFFF:
                        with open(log_file, "a") as f: f.write(f"[{time.time()}] Server not running. Attempting launch in session {sess}.\n")
                        if launch_server_in_user_session():
                            last_launch = now
            time.sleep(5)
        except Exception as e:
            with open(log_file, "a") as f: f.write(f"[{time.time()}] Watchdog error: {e}\n")
            time.sleep(5)



user32.SetProcessDPIAware()

def get_scr():
    w = user32.GetSystemMetrics(0)
    h = user32.GetSystemMetrics(1)
    return (w if w > 0 else 1920), (h if h > 0 else 1080)

def switch_desktop():
    try:
        # Maksimum erişim (0x02000000 | 0x0100) ile masaüstünü aç (UAC ve Winlogon desteği)
        hdesk = user32.OpenInputDesktop(0, False, 0x02000000) 
        if hdesk:
            user32.SetThreadDesktop(hdesk)
            user32.CloseDesktop(hdesk)
            return True
    except: pass
    
    try:
        # Eğer OpenInputDesktop başarısız olursa, aktif "Winlogon" veya "Default" masaüstüne doğrudan bağlan
        hdesk = user32.OpenDesktopW("Winlogon", 0, False, 0x02000000)
        if hdesk:
            user32.SetThreadDesktop(hdesk)
            user32.CloseDesktop(hdesk)
            return True
    except: pass
    
    return False
def capture_gdi(quality=70):
    try:
        switch_desktop()
        from PIL import Image
        w, h = get_scr()
        hdc     = user32.GetDC(0)
        hdc_mem = gdi32.CreateCompatibleDC(hdc)
        hbmp    = gdi32.CreateCompatibleBitmap(hdc, w, h)
        hbmp_old = gdi32.SelectObject(hdc_mem, hbmp)
        gdi32.BitBlt(hdc_mem, 0, 0, w, h, hdc, 0, 0, 0x00CC0020)

        bmi = BITMAPINFOHEADER()
        bmi.biSize = ctypes.sizeof(BITMAPINFOHEADER)
        bmi.biWidth = w; bmi.biHeight = -h
        bmi.biPlanes = 1; bmi.biBitCount = 32; bmi.biCompression = 0

        buf = ctypes.create_string_buffer(w * h * 4)
        gdi32.GetDIBits(hdc_mem, hbmp, 0, h, buf, ctypes.byref(bmi), 0)
        gdi32.SelectObject(hdc_mem, hbmp_old)
        gdi32.DeleteObject(hbmp); gdi32.DeleteDC(hdc_mem)
        user32.ReleaseDC(0, hdc)

        img = Image.frombuffer('RGBA', (w, h), buf, 'raw', 'BGRA', 0, 1).convert('RGB')
        out = io.BytesIO()
        img.save(out, format='JPEG', quality=quality, optimize=True, subsampling=1)
        return base64.b64encode(out.getvalue()).decode()
    except: return None


# ─── Input ───────────────────────────────────────────────────
MOUSEEVENTF_LEFTDOWN=0x0002; MOUSEEVENTF_LEFTUP=0x0004
MOUSEEVENTF_RIGHTDOWN=0x0008; MOUSEEVENTF_RIGHTUP=0x0010
MOUSEEVENTF_MIDDLEDOWN=0x0020; MOUSEEVENTF_MIDDLEUP=0x0040
MOUSEEVENTF_WHEEL=0x0800; MOUSEEVENTF_MOVE=0x0001; MOUSEEVENTF_ABSOLUTE=0x8000
KEYEVENTF_KEYUP=0x0002; INPUT_MOUSE=0; INPUT_KEYBOARD=1
VK_CTRL=0x11; VK_ALT=0x12; VK_DEL=0x2E; VK_WIN=0x5B
VK_TAB=0x09; VK_RET=0x0D; VK_ESC=0x1B; VK_F4=0x73

class MI(ctypes.Structure):
    _fields_=[('dx',ctypes.c_long),('dy',ctypes.c_long),('mouseData',ctypes.c_ulong),
              ('dwFlags',ctypes.c_ulong),('time',ctypes.c_ulong),
              ('dwExtraInfo',ctypes.POINTER(ctypes.c_ulong))]
class KI(ctypes.Structure):
    _fields_=[('wVk',ctypes.c_ushort),('wScan',ctypes.c_ushort),
              ('dwFlags',ctypes.c_ulong),('time',ctypes.c_ulong),
              ('dwExtraInfo',ctypes.POINTER(ctypes.c_ulong))]
class IU(ctypes.Union):
    _fields_=[('mi',MI),('ki',KI)]
class INP(ctypes.Structure):
    _fields_=[('type',ctypes.c_ulong),('_input',IU)]

def ms(flags, dx=0, dy=0, data=0):
    try:
        switch_desktop()
        i=INP(); i.type=INPUT_MOUSE; i._input.mi=MI()
        i._input.mi.dx=dx; i._input.mi.dy=dy
        i._input.mi.mouseData=data; i._input.mi.dwFlags=flags
        i._input.mi.time=0; i._input.mi.dwExtraInfo=None
        user32.SendInput(1, ctypes.byref(i), ctypes.sizeof(INP))
    except: pass

def ks(vk, flags=0):
    try:
        switch_desktop()
        i=INP(); i.type=INPUT_KEYBOARD; i._input.ki=KI()
        i._input.ki.wVk=vk; i._input.ki.wScan=0
        i._input.ki.dwFlags=flags; i._input.ki.time=0; i._input.ki.dwExtraInfo=None
        user32.SendInput(1, ctypes.byref(i), ctypes.sizeof(INP))
    except: pass

LOCKED=False; BLACKOUT=False

def do_mouse(cmd):
    if LOCKED: return
    try:
        x=float(cmd.get('xPercent',0)); y=float(cmd.get('yPercent',0))
        act=cmd.get('action',''); btn=cmd.get('button','left'); dlt=int(cmd.get('delta',0))
        ax=int(x*65535); ay=int(y*65535)
        ms(MOUSEEVENTF_MOVE|MOUSEEVENTF_ABSOLUTE, ax, ay)
        if   act=='mousedown':
            if btn=='right': ms(MOUSEEVENTF_RIGHTDOWN)
            elif btn=='middle': ms(MOUSEEVENTF_MIDDLEDOWN)
            else: ms(MOUSEEVENTF_LEFTDOWN)
        elif act=='mouseup':
            if btn=='right': ms(MOUSEEVENTF_RIGHTUP)
            elif btn=='middle': ms(MOUSEEVENTF_MIDDLEUP)
            else: ms(MOUSEEVENTF_LEFTUP)
        elif act=='click':
            if btn=='right': ms(MOUSEEVENTF_RIGHTDOWN); ms(MOUSEEVENTF_RIGHTUP)
            elif btn=='middle': ms(MOUSEEVENTF_MIDDLEDOWN); ms(MOUSEEVENTF_MIDDLEUP)
            else: ms(MOUSEEVENTF_LEFTDOWN); ms(MOUSEEVENTF_LEFTUP)
        elif act=='dblclick':
            ms(MOUSEEVENTF_LEFTDOWN); ms(MOUSEEVENTF_LEFTUP)
            time.sleep(0.05)
            ms(MOUSEEVENTF_LEFTDOWN); ms(MOUSEEVENTF_LEFTUP)
        elif act=='scroll':
            ms(MOUSEEVENTF_WHEEL, data=dlt*120)
    except: pass

def do_key(cmd):
    if LOCKED: return
    try:
        k=cmd.get('key','')
        if k=='CAD':
            ks(VK_CTRL); ks(VK_ALT); ks(VK_DEL); time.sleep(0.05)
            ks(VK_DEL,KEYEVENTF_KEYUP); ks(VK_ALT,KEYEVENTF_KEYUP); ks(VK_CTRL,KEYEVENTF_KEYUP)
        elif k=='TASK_MGR':
            os.system('start taskmgr.exe')
        elif k=='WIN_KEY':
            ks(VK_WIN); time.sleep(0.1); ks(VK_WIN,KEYEVENTF_KEYUP)
        elif k=='WIN_L': user32.LockWorkStation()
        elif k=='WIN_TAB':
            ks(VK_WIN); ks(VK_TAB); time.sleep(0.05)
            ks(VK_TAB,KEYEVENTF_KEYUP); ks(VK_WIN,KEYEVENTF_KEYUP)
        elif k=='ALT_TAB':
            ks(VK_ALT); ks(VK_TAB); time.sleep(0.05)
            ks(VK_TAB,KEYEVENTF_KEYUP); ks(VK_ALT,KEYEVENTF_KEYUP)
        elif k=='ALT_F4':
            ks(VK_ALT); ks(VK_F4); time.sleep(0.05)
            ks(VK_F4,KEYEVENTF_KEYUP); ks(VK_ALT,KEYEVENTF_KEYUP)
        elif k=='ESC': ks(VK_ESC); time.sleep(0.1); ks(VK_ESC,KEYEVENTF_KEYUP)
        elif k=='PRTSCN': ks(0x2C); time.sleep(0.1); ks(0x2C,KEYEVENTF_KEYUP)
        elif k=='UAC_YES': ks(VK_RET); time.sleep(0.05); ks(VK_RET,KEYEVENTF_KEYUP)
        elif k=='UAC_NO':  ks(VK_ESC); time.sleep(0.05); ks(VK_ESC,KEYEVENTF_KEYUP)
        elif len(k)==1:
            vk=user32.VkKeyScanW(ord(k))
            lo=vk&0xFF; hi=(vk>>8)&0xFF
            if hi&1: ks(0x10)
            if hi&2: ks(VK_CTRL)
            if hi&4: ks(VK_ALT)
            ks(lo); time.sleep(0.02); ks(lo,KEYEVENTF_KEYUP)
            if hi&4: ks(VK_ALT,KEYEVENTF_KEYUP)
            if hi&2: ks(VK_CTRL,KEYEVENTF_KEYUP)
            if hi&1: ks(0x10,KEYEVENTF_KEYUP)
        elif k.startswith('F') and k[1:].isdigit():
            fn=int(k[1:])
            if 1<=fn<=12:
                vk=0x6F+fn; ks(vk); time.sleep(0.02); ks(vk,KEYEVENTF_KEYUP)
    except: pass

def handle_client(conn, addr):
    global LOCKED, BLACKOUT
    hostname = socket.gethostname()
    try: uname = os.getlogin()
    except: uname = 'User'
    w, h = get_scr()
    hs = json.dumps({'type':'HANDSHAKE_ACK','agentVersion':'RemoteMM v4.0',
                     'hostname':hostname,'user':uname,
                     'screenWidth':w,'screenHeight':h,'os':'Windows'}) + '\n'
    try: conn.sendall(hs.encode())
    except: conn.close(); return

    quality=[70]; fps=[0.033]

    def stream():
        while True:
            try:
                t0 = time.time()
                if BLACKOUT:
                    pkt = json.dumps({'type':'SCREEN_FRAME_BLACKOUT','blackedOut':True,
                                      'timestamp':int(t0*1000)}) + '\n'
                    conn.sendall(pkt.encode())
                else:
                    frame = capture_gdi(quality[0])
                    if frame:
                        w2, h2 = get_scr()
                        pkt = json.dumps({'type':'SCREEN_FRAME','frame':frame,
                                          'timestamp':int(t0*1000),
                                          'width':w2,'height':h2}) + '\n'
                        conn.sendall(pkt.encode())
                time.sleep(max(0, fps[0] - (time.time()-t0)))
            except: break

    threading.Thread(target=stream, daemon=True).start()
    buf = ''
    while True:
        try:
            data = conn.recv(16384)
            if not data: break
            buf += data.decode('utf-8', errors='ignore')
            lines = buf.split('\n'); buf = lines.pop()
            for line in lines:
                line = line.strip()
                if not line: continue
                try: cmd = json.loads(line)
                except: continue
                t = cmd.get('type','')
                if   t=='MOUSE_INPUT':    threading.Thread(target=do_mouse,args=(cmd,),daemon=True).start()
                elif t=='KEYBOARD_INPUT': threading.Thread(target=do_key,  args=(cmd,),daemon=True).start()
                elif t=='LOCK_INPUT':
                    LOCKED = bool(cmd.get('locked',False))
                    try: user32.BlockInput(LOCKED)
                    except: pass
                elif t=='BLACKOUT_SCREEN': BLACKOUT = bool(cmd.get('blackout',False))
                elif t=='SET_QUALITY': quality[0] = max(20,min(95,int(cmd.get('quality',70))))
                elif t=='SET_FPS':     fps[0]     = 1.0/max(5,min(60,int(cmd.get('fps',30))))
                elif t=='PING':
                    conn.sendall((json.dumps({'type':'PONG','timestamp':int(time.time()*1000)})+'\n').encode())
                elif t=='POWER_ACTION':
                    a = cmd.get('action','')
                    if   a=='reboot':   os.system('shutdown /r /t 5')
                    elif a=='shutdown': os.system('shutdown /s /t 5')
                    elif a=='logoff':   os.system('logoff')
        except: break
    conn.close()

def start_server():
    srv = socket.socket(); srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    for _ in range(10):
        try: srv.bind(('0.0.0.0', PORT)); break
        except: time.sleep(2)
    else: return
    srv.listen(10); srv.settimeout(2.0)
    while True:
        try:
            conn, addr = srv.accept()
            threading.Thread(target=handle_client, args=(conn,addr), daemon=True).start()
        except socket.timeout: continue
        except: break
    srv.close()


# ─── ENTRY POINT ─────────────────────────────────────────────
if __name__ == '__main__':
    try:
        if '--server' in sys.argv:
            # Kullanici oturumunda TCP server modu
            start_server()
        else:
            # Watchdog loop baslat (schtasks ile SYSTEM olarak arka planda calisir)
            watchdog_loop()
    except Exception as e:
        import traceback
        log_file = os.path.join(os.path.dirname(AGENT_PATH), "agent_crash.log")
        with open(log_file, "a") as f: f.write(f"Crash: {e}\n{traceback.format_exc()}\n")
