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
    """Arka planda calisir: server yoksa veya aktif oturum degistiyse yeniden baslatir."""
    log_file = os.path.join(os.path.dirname(AGENT_PATH), "agent_debug.log")
    os.system('netsh advfirewall firewall delete rule name=RemoteMMAgent >nul 2>&1')
    os.system(f'netsh advfirewall firewall add rule name=RemoteMMAgent dir=in action=allow protocol=TCP localport={PORT} >nul 2>&1')
    last_launch = 0
    last_session = 0xFFFFFFFF
    with open(log_file, "a") as f: f.write(f"[{time.time()}] Watchdog started in session {get_active_session()}.\n")
    while True:
        try:
            curr_sess = get_active_session()
            now = time.time()
            if curr_sess != 0xFFFFFFFF:
                need_launch = False
                if curr_sess != last_session:
                    with open(log_file, "a") as f:
                        f.write(f"[{time.time()}] Session switched from {last_session} to {curr_sess}. Restarting server for new session.\n")
                    os.system('taskkill /F /IM RemoteMM_Agent.exe /FI "SESSION ne 0" >nul 2>&1')
                    need_launch = True
                elif not server_running() and (now - last_launch > 2):
                    with open(log_file, "a") as f:
                        f.write(f"[{time.time()}] Server not running in session {curr_sess}. Restarting server.\n")
                    need_launch = True

                if need_launch:
                    if launch_server_in_user_session():
                        last_launch = now
                        last_session = curr_sess
            time.sleep(1)
        except Exception as e:
            with open(log_file, "a") as f: f.write(f"[{time.time()}] Watchdog error: {e}\n")
            time.sleep(2)



user32.SetProcessDPIAware()

def get_scr():
    w = user32.GetSystemMetrics(0)
    h = user32.GetSystemMetrics(1)
    return (w if w > 0 else 1920), (h if h > 0 else 1080)

def switch_desktop():
    try:
        hdesk = user32.OpenInputDesktop(0, False, 0x02000000)
        if hdesk:
            user32.SetThreadDesktop(hdesk)
            user32.CloseDesktop(hdesk)
            return True
    except: pass
    
    try:
        hdesk = user32.OpenDesktopW("Winlogon", 0, False, 0x02000000)
        if hdesk:
            user32.SetThreadDesktop(hdesk)
            user32.CloseDesktop(hdesk)
            return True
    except: pass

    try:
        hdesk = user32.OpenDesktopW("Default", 0, False, 0x02000000)
        if hdesk:
            user32.SetThreadDesktop(hdesk)
            user32.CloseDesktop(hdesk)
            return True
    except: pass
    
    return False

def capture_gdi(quality=65):
    try:
        from PIL import Image
        w, h = get_scr()
        hdc = user32.GetDC(0)
        if not hdc:
            switch_desktop()
            hdc = user32.GetDC(0)
            if not hdc: return None
        hdc_mem = gdi32.CreateCompatibleDC(hdc)
        if not hdc_mem:
            user32.ReleaseDC(0, hdc)
            return None
        hbmp = gdi32.CreateCompatibleBitmap(hdc, w, h)
        if not hbmp:
            gdi32.DeleteDC(hdc_mem)
            user32.ReleaseDC(0, hdc)
            return None
        hbmp_old = gdi32.SelectObject(hdc_mem, hbmp)
        ok = gdi32.BitBlt(hdc_mem, 0, 0, w, h, hdc, 0, 0, 0x00CC0020)
        if not ok:
            switch_desktop()
            gdi32.SelectObject(hdc_mem, hbmp_old)
            gdi32.DeleteObject(hbmp); gdi32.DeleteDC(hdc_mem)
            user32.ReleaseDC(0, hdc)
            return None

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
        img.save(out, format='JPEG', quality=quality, optimize=True)
        return base64.b64encode(out.getvalue()).decode()
    except Exception as e:
        return None


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
              ('dwExtraInfo',ctypes.c_size_t)]
class KI(ctypes.Structure):
    _fields_=[('wVk',ctypes.c_ushort),('wScan',ctypes.c_ushort),
              ('dwFlags',ctypes.c_ulong),('time',ctypes.c_ulong),
              ('dwExtraInfo',ctypes.c_size_t)]
class IU(ctypes.Union):
    _fields_=[('mi',MI),('ki',KI)]
class INP(ctypes.Structure):
    _fields_=[('type',ctypes.c_ulong),('_input',IU)]

MAGIC_REMOTE_TAG = 0x524D4D

class MSLLHOOKSTRUCT(ctypes.Structure):
    _fields_ = [
        ('pt', ctypes.wintypes.POINT),
        ('mouseData', ctypes.wintypes.DWORD),
        ('flags', ctypes.wintypes.DWORD),
        ('time', ctypes.wintypes.DWORD),
        ('dwExtraInfo', ctypes.c_size_t)
    ]

class KBDLLHOOKSTRUCT(ctypes.Structure):
    _fields_ = [
        ('vkCode', ctypes.wintypes.DWORD),
        ('scanCode', ctypes.wintypes.DWORD),
        ('flags', ctypes.wintypes.DWORD),
        ('time', ctypes.wintypes.DWORD),
        ('dwExtraInfo', ctypes.c_size_t)
    ]

HOOK_MOUSE = [None]
HOOK_KBD = [None]
LOCKED = False
BLACKOUT = False
CURTAIN_HWND = [None]

CLIENTS_LOCK = threading.Lock()
ACTIVE_CLIENTS = []
CHAT_HISTORY = []
CHAT_PROC = [None]
CHAT_LOCK = threading.Lock()

HOOKPROC_M = ctypes.WINFUNCTYPE(ctypes.c_longlong, ctypes.c_int, ctypes.c_size_t, ctypes.POINTER(MSLLHOOKSTRUCT))
HOOKPROC_K = ctypes.WINFUNCTYPE(ctypes.c_longlong, ctypes.c_int, ctypes.c_size_t, ctypes.POINTER(KBDLLHOOKSTRUCT))
user32.SetWindowsHookExW.restype = ctypes.wintypes.HHOOK
user32.SetWindowsHookExW.argtypes = [ctypes.c_int, ctypes.c_void_p, ctypes.wintypes.HINSTANCE, ctypes.wintypes.DWORD]
user32.CallNextHookEx.restype = ctypes.c_longlong
user32.CallNextHookEx.argtypes = [ctypes.wintypes.HHOOK, ctypes.c_int, ctypes.c_size_t, ctypes.c_void_p]

def hook_mouse_proc(nCode, wParam, lParam):
    if nCode >= 0 and LOCKED:
        try:
            info = ctypes.cast(lParam, ctypes.POINTER(MSLLHOOKSTRUCT)).contents
            if (info.flags & 1) or (info.dwExtraInfo == MAGIC_REMOTE_TAG):
                return user32.CallNextHookEx(None, nCode, wParam, lParam)
            return 1
        except: pass
    return user32.CallNextHookEx(None, nCode, wParam, lParam)

def hook_kbd_proc(nCode, wParam, lParam):
    if nCode >= 0 and LOCKED:
        try:
            info = ctypes.cast(lParam, ctypes.POINTER(KBDLLHOOKSTRUCT)).contents
            if (info.flags & 0x10) or (info.dwExtraInfo == MAGIC_REMOTE_TAG):
                return user32.CallNextHookEx(None, nCode, wParam, lParam)
            return 1
        except: pass
    return user32.CallNextHookEx(None, nCode, wParam, lParam)

CB_MOUSE = HOOKPROC_M(hook_mouse_proc)
CB_KBD = HOOKPROC_K(hook_kbd_proc)

def set_curtain_window(state):
    global BLACKOUT
    BLACKOUT = bool(state)

def input_and_curtain_manager():
    switch_desktop()
    hmod = kernel32.GetModuleHandleW(None)
    HOOK_MOUSE[0] = user32.SetWindowsHookExW(14, CB_MOUSE, hmod, 0)
    HOOK_KBD[0] = user32.SetWindowsHookExW(13, CB_KBD, hmod, 0)
    msg = ctypes.wintypes.MSG()
    while True:
        try:
            if BLACKOUT and not CURTAIN_HWND[0]:
                switch_desktop()
                w, h = get_scr()
                hwnd = user32.CreateWindowExW(
                    0x00000008 | 0x00000080, 'STATIC', '',
                    0x80000000 | 0x10000000 | 0x04,
                    0, 0, w, h, 0, 0, 0, None
                )
                if hwnd:
                    try: user32.SetWindowDisplayAffinity(hwnd, 0x00000011)
                    except: pass
                    CURTAIN_HWND[0] = hwnd
                user32.PostMessageW(0xFFFF, 0x0112, 0xF170, 2)
            elif not BLACKOUT and CURTAIN_HWND[0]:
                try: user32.DestroyWindow(CURTAIN_HWND[0])
                except: pass
                CURTAIN_HWND[0] = None
                user32.PostMessageW(0xFFFF, 0x0112, 0xF170, -1)

            while user32.PeekMessageW(ctypes.byref(msg), 0, 0, 0, 1):
                user32.TranslateMessage(ctypes.byref(msg))
                user32.DispatchMessageW(ctypes.byref(msg))
            time.sleep(0.015)
        except:
            time.sleep(0.05)

def ms(flags, dx=0, dy=0, data=0):
    try:
        switch_desktop()
        user32.SetMessageExtraInfo(MAGIC_REMOTE_TAG)
        i=INP(); i.type=INPUT_MOUSE; i._input.mi=MI()
        i._input.mi.dx=dx; i._input.mi.dy=dy
        i._input.mi.mouseData=data; i._input.mi.dwFlags=flags
        i._input.mi.time=0
        i._input.mi.dwExtraInfo=MAGIC_REMOTE_TAG
        user32.SendInput(1, ctypes.byref(i), ctypes.sizeof(INP))
    except: pass

def ks(vk, flags=0):
    try:
        switch_desktop()
        user32.SetMessageExtraInfo(MAGIC_REMOTE_TAG)
        i=INP(); i.type=INPUT_KEYBOARD; i._input.ki=KI()
        i._input.ki.wVk=vk; i._input.ki.wScan=0
        i._input.ki.dwFlags=flags; i._input.ki.time=0
        i._input.ki.dwExtraInfo=MAGIC_REMOTE_TAG
        user32.SendInput(1, ctypes.byref(i), ctypes.sizeof(INP))
    except: pass

def do_mouse(cmd):
    try:
        x=float(cmd.get('xPercent',0)); y=float(cmd.get('yPercent',0))
        act=cmd.get('action',''); btn=cmd.get('button','left'); dlt=int(cmd.get('delta',0))
        ax=int(x*65535); ay=int(y*65535)
        w, h = get_scr()
        user32.SetMessageExtraInfo(MAGIC_REMOTE_TAG)
        user32.SetCursorPos(int(x * w), int(y * h))
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
    # Remote admin input is NOT blocked by LOCKED (BlockInput blocks physical local user only)
    try:
        k=cmd.get('key','')
        if not k: return
        if k in ('CAD', '{CAD}'):
            ks(VK_CTRL); ks(VK_ALT); ks(VK_DEL); time.sleep(0.05)
            ks(VK_DEL,KEYEVENTF_KEYUP); ks(VK_ALT,KEYEVENTF_KEYUP); ks(VK_CTRL,KEYEVENTF_KEYUP)
        elif k in ('TASK_MGR', '{TASK_MGR}'):
            os.system('start taskmgr.exe')
        elif k in ('WIN_KEY', 'Meta', 'OS', '{WIN}', 'Win'):
            ks(VK_WIN); time.sleep(0.08); ks(VK_WIN,KEYEVENTF_KEYUP)
        elif k in ('WIN_L', '{WIN_L}'): user32.LockWorkStation()
        elif k in ('WIN_TAB', '{WIN_TAB}'):
            ks(VK_WIN); ks(VK_TAB); time.sleep(0.05)
            ks(VK_TAB,KEYEVENTF_KEYUP); ks(VK_WIN,KEYEVENTF_KEYUP)
        elif k in ('ALT_TAB', '{ALT_TAB}'):
            ks(VK_ALT); ks(VK_TAB); time.sleep(0.05)
            ks(VK_TAB,KEYEVENTF_KEYUP); ks(VK_ALT,KEYEVENTF_KEYUP)
        elif k in ('ALT_F4', '{ALT_F4}'):
            ks(VK_ALT); ks(VK_F4); time.sleep(0.05)
            ks(VK_F4,KEYEVENTF_KEYUP); ks(VK_ALT,KEYEVENTF_KEYUP)
        elif k in ('ESC', '{ESC}', 'Escape'): ks(VK_ESC); time.sleep(0.05); ks(VK_ESC,KEYEVENTF_KEYUP)
        elif k in ('ENTER', '{ENTER}', 'Enter'): ks(VK_RET); time.sleep(0.02); ks(VK_RET,KEYEVENTF_KEYUP)
        elif k in ('BACKSPACE', '{BACKSPACE}', 'Backspace'): ks(0x08); time.sleep(0.02); ks(0x08,KEYEVENTF_KEYUP)
        elif k in ('TAB', '{TAB}', 'Tab'): ks(VK_TAB); time.sleep(0.02); ks(VK_TAB,KEYEVENTF_KEYUP)
        elif k in ('DELETE', '{DELETE}', 'Delete'): ks(VK_DEL); time.sleep(0.02); ks(VK_DEL,KEYEVENTF_KEYUP)
        elif k in ('UP', '{UP}', 'ArrowUp'): ks(0x26); time.sleep(0.02); ks(0x26,KEYEVENTF_KEYUP)
        elif k in ('DOWN', '{DOWN}', 'ArrowDown'): ks(0x28); time.sleep(0.02); ks(0x28,KEYEVENTF_KEYUP)
        elif k in ('LEFT', '{LEFT}', 'ArrowLeft'): ks(0x25); time.sleep(0.02); ks(0x25,KEYEVENTF_KEYUP)
        elif k in ('RIGHT', '{RIGHT}', 'ArrowRight'): ks(0x27); time.sleep(0.02); ks(0x27,KEYEVENTF_KEYUP)
        elif k in ('HOME', '{HOME}', 'Home'): ks(0x24); time.sleep(0.02); ks(0x24,KEYEVENTF_KEYUP)
        elif k in ('END', '{END}', 'End'): ks(0x23); time.sleep(0.02); ks(0x23,KEYEVENTF_KEYUP)
        elif k in ('PAGEUP', '{PAGEUP}', 'PageUp'): ks(0x21); time.sleep(0.02); ks(0x21,KEYEVENTF_KEYUP)
        elif k in ('PAGEDOWN', '{PAGEDOWN}', 'PageDown'): ks(0x22); time.sleep(0.02); ks(0x22,KEYEVENTF_KEYUP)
        elif k in ('INSERT', '{INSERT}', 'Insert'): ks(0x2D); time.sleep(0.02); ks(0x2D,KEYEVENTF_KEYUP)
        elif k in ('PRTSCN', '{PRTSCN}', 'PrintScreen'): ks(0x2C); time.sleep(0.05); ks(0x2C,KEYEVENTF_KEYUP)
        elif k=='UAC_YES': ks(VK_RET); time.sleep(0.05); ks(VK_RET,KEYEVENTF_KEYUP)
        elif k=='UAC_NO':  ks(VK_ESC); time.sleep(0.05); ks(VK_ESC,KEYEVENTF_KEYUP)
        elif k.startswith('F') and k[1:].isdigit():
            fn=int(k[1:])
            if 1<=fn<=12:
                vk=0x6F+fn; ks(vk); time.sleep(0.02); ks(vk,KEYEVENTF_KEYUP)
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
    except: pass

def get_drives():
    drives = []
    try:
        import string
        bitmask = kernel32.GetLogicalDrives()
        for letter in string.ascii_uppercase:
            if bitmask & 1:
                drives.append(f"{letter}:\\")
            bitmask >>= 1
    except:
        drives = ['C:\\']
    return drives or ['C:\\']

SOCKET_LOCK = threading.Lock()

def send_json_safe(conn, obj):
    try:
        data = (json.dumps(obj) + '\n').encode('utf-8')
        with SOCKET_LOCK:
            conn.sendall(data)
        return True
    except:
        return False

def handle_fs(conn, cmd):
    t = cmd.get('type', '')
    try:
        if t == 'FS_LIST':
            req_path = cmd.get('path', 'C:\\')
            if not req_path or req_path == '.':
                req_path = 'C:\\'
            req_path = os.path.abspath(req_path)
            drives = get_drives()
            entries = []
            if os.path.exists(req_path) and os.path.isdir(req_path):
                try:
                    with os.scandir(req_path) as it:
                        for entry in it:
                            try:
                                is_dir = entry.is_dir(follow_symlinks=False)
                                stat = entry.stat(follow_symlinks=False)
                                mtime = time.strftime('%Y-%m-%d %H:%M', time.localtime(stat.st_mtime))
                                entries.append({
                                    'name': entry.name,
                                    'isDirectory': is_dir,
                                    'size': stat.st_size if not is_dir else 0,
                                    'modified': mtime
                                })
                            except: pass
                except: pass
            entries.sort(key=lambda x: (not x['isDirectory'], x['name'].lower()))
            res = {
                'type': 'FS_LIST_RES',
                'path': req_path,
                'drives': drives,
                'entries': entries
            }
            send_json_safe(conn, res)

        elif t == 'FS_DOWNLOAD':
            fpath = cmd.get('path', '')
            if os.path.isfile(fpath):
                sz = os.path.getsize(fpath)
                if sz > 25 * 1024 * 1024:
                    send_json_safe(conn, {'type':'FS_ERROR','message':'Dosya 25MB sinirini asiyor.'})
                    return
                with open(fpath, 'rb') as f:
                    content = f.read()
                b64 = base64.b64encode(content).decode('ascii')
                res = {
                    'type': 'FS_DOWNLOAD_RES',
                    'path': fpath,
                    'filename': os.path.basename(fpath),
                    'data': b64,
                    'size': sz
                }
                send_json_safe(conn, res)

        elif t == 'FS_UPLOAD':
            fpath = cmd.get('path', '')
            b64_data = cmd.get('data', '')
            content = base64.b64decode(b64_data)
            parent = os.path.dirname(os.path.abspath(fpath))
            if parent: os.makedirs(parent, exist_ok=True)
            with open(fpath, 'wb') as f:
                f.write(content)
            res = {'type': 'FS_UPLOAD_RES', 'path': fpath, 'success': True}
            send_json_safe(conn, res)

        elif t == 'FS_DELETE':
            fpath = cmd.get('path', '')
            if os.path.isdir(fpath):
                import shutil
                shutil.rmtree(fpath, ignore_errors=True)
            elif os.path.isfile(fpath):
                os.remove(fpath)
            res = {'type': 'FS_DELETE_RES', 'path': fpath, 'success': True}
            send_json_safe(conn, res)

        elif t == 'FS_MKDIR':
            fpath = cmd.get('path', '')
            os.makedirs(fpath, exist_ok=True)
            res = {'type': 'FS_MKDIR_RES', 'path': fpath, 'success': True}
            send_json_safe(conn, res)

        elif t == 'FS_EXEC':
            fpath = cmd.get('path', '')
            os.system(f'start "" "{fpath}"')
            res = {'type': 'FS_EXEC_RES', 'path': fpath, 'success': True}
            send_json_safe(conn, res)
    except Exception as e:
        send_json_safe(conn, {'type':'FS_ERROR','message':str(e)})

def handle_task_list(conn):
    try:
        import subprocess
        cmd = 'powershell -NoProfile -Command "Get-Process | Select-Object -First 50 Id, ProcessName, @{Name=\'CPU\';Expression={$_.CPU}}, WorkingSet64 | ConvertTo-Json"'
        out = subprocess.check_output(cmd, shell=True, timeout=5).decode('utf-8', errors='ignore')
        procs = json.loads(out)
        if isinstance(procs, dict): procs = [procs]
        formatted = []
        for p in procs:
            formatted.append({
                'Id': p.get('Id', 0),
                'ProcessName': p.get('ProcessName', 'Unknown') + '.exe',
                'CPU': f"{round(float(p.get('CPU') or 0), 1)}%",
                'WorkingSet64': int(p.get('WorkingSet64') or 0),
                'User': 'SYSTEM'
            })
        send_json_safe(conn, {'type':'TASK_LIST_RES','processes':formatted})
    except: pass

def broadcast_chat():
    payload = {'type': 'CHAT_BROADCAST', 'messages': list(CHAT_HISTORY)}
    with CLIENTS_LOCK:
        for c in list(ACTIVE_CLIENTS):
            send_json_safe(c, payload)

def ensure_chat_ui():
    """Kullanici masaustunde Chat UI penceresini baslatir (calismiyorsa)."""
    global CHAT_PROC
    with CHAT_LOCK:
        if CHAT_PROC[0] and CHAT_PROC[0].poll() is None:
            try:
                CHAT_PROC[0].stdin.write(json.dumps({'action': 'show'}) + '\n')
                CHAT_PROC[0].stdin.flush()
                return True
            except: pass

        try:
            if getattr(sys, 'frozen', False):
                cmd = [AGENT_PATH, '--chat-ui']
            else:
                cmd = [sys.executable, AGENT_PATH, '--chat-ui']

            si = subprocess.STARTUPINFO()
            si.dwFlags = subprocess.STARTF_USESHOWWINDOW
            si.wShowWindow = 1 # SW_SHOWNORMAL
            si.lpDesktop = "WinSta0\\Default"

            proc = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                startupinfo=si
            )
            CHAT_PROC[0] = proc

            def read_chat_stdout():
                for line in proc.stdout:
                    line = line.strip()
                    if not line: continue
                    try:
                        data = json.loads(line)
                        if data.get('type') == 'USER_MESSAGE':
                            text = data.get('text', '').strip()
                            if text:
                                t_str = data.get('time', time.strftime('%H:%M:%S'))
                                try: uname = os.getlogin()
                                except: uname = 'User'
                                msg_obj = {
                                    'sender': f'Remote User ({uname})',
                                    'text': text,
                                    'time': t_str
                                }
                                CHAT_HISTORY.append(msg_obj)
                                broadcast_chat()
                    except: pass

            threading.Thread(target=read_chat_stdout, daemon=True).start()
            return True
        except Exception as e:
            try:
                log_file = os.path.join(os.path.dirname(AGENT_PATH), "agent_debug.log")
                with open(log_file, "a") as f:
                    f.write(f"[{time.time()}] ensure_chat_ui error: {e}\n")
            except: pass
            return False

def send_to_chat_ui(payload):
    ensure_chat_ui()
    with CHAT_LOCK:
        if CHAT_PROC[0] and CHAT_PROC[0].poll() is None:
            try:
                CHAT_PROC[0].stdin.write(json.dumps(payload) + '\n')
                CHAT_PROC[0].stdin.flush()
            except: pass

def run_chat_ui():
    import tkinter as tk
    from tkinter import scrolledtext

    root = tk.Tk()
    root.title('RemoteMM - Uzak Destek & Operatör Sohbeti')
    root.geometry('400x520')
    root.configure(bg='#0f172a')
    root.attributes('-topmost', True)
    root.minsize(340, 420)

    try:
        sw = root.winfo_screenwidth()
        sh = root.winfo_screenheight()
        root.geometry(f"400x520+{sw - 425}+{sh - 570}")
    except: pass

    # Header
    h_frame = tk.Frame(root, bg='#1e293b', pady=10, padx=12)
    h_frame.pack(fill='x')

    top_row = tk.Frame(h_frame, bg='#1e293b')
    top_row.pack(fill='x')
    tk.Label(top_row, text='RemoteMM Uzak Destek', font=('Segoe UI', 11, 'bold'), fg='#38bdf8', bg='#1e293b').pack(side='left')
    tk.Label(top_row, text='● Canli', font=('Segoe UI', 9, 'bold'), fg='#22c55e', bg='#1e293b').pack(side='right')

    tk.Label(h_frame, text='Teknisyen baglandi • Canli iletisim oturumu', font=('Segoe UI', 8), fg='#94a3b8', bg='#1e293b').pack(anchor='w', pady=(2, 0))

    # Messages
    txt = scrolledtext.ScrolledText(root, wrap='word', bg='#0f172a', fg='#e2e8f0', font=('Segoe UI', 9), bd=0, padx=10, pady=10)
    txt.pack(fill='both', expand=True, padx=8, pady=8)
    txt.tag_config('tech_hdr', foreground='#38bdf8', font=('Segoe UI', 9, 'bold'))
    txt.tag_config('user_hdr', foreground='#4ade80', font=('Segoe UI', 9, 'bold'))
    txt.tag_config('sys_hdr', foreground='#64748b', font=('Segoe UI', 8, 'italic'))
    txt.tag_config('body', foreground='#f1f5f9', font=('Segoe UI', 9))
    txt.config(state='disabled')

    def add_msg(sender, text, time_str, tag='user_hdr'):
        txt.config(state='normal')
        txt.insert('end', f'[{time_str}] {sender}:\n', tag)
        txt.insert('end', f'{text}\n\n', 'body')
        txt.config(state='disabled')
        txt.see('end')

    add_msg('Sistem', 'Destek oturumu baslatildi. Teknisyene dogrudan buradan cevap yazabilirsiniz.', time.strftime('%H:%M:%S'), 'sys_hdr')

    # Input Frame
    b_frame = tk.Frame(root, bg='#1e293b', pady=10, padx=10)
    b_frame.pack(fill='x', side='bottom')

    entry = tk.Entry(b_frame, bg='#0f172a', fg='#f8fafc', insertbackground='#38bdf8', font=('Segoe UI', 10), bd=1, relief='solid')
    entry.pack(side='left', fill='x', expand=True, padx=(0, 8), ipady=5)

    def on_send():
        val = entry.get().strip()
        if val:
            entry.delete(0, 'end')
            t_now = time.strftime('%H:%M:%S')
            add_msg('Siz', val, t_now, 'user_hdr')
            print(json.dumps({'type': 'USER_MESSAGE', 'text': val, 'time': t_now}), flush=True)

    entry.bind('<Return>', lambda e: on_send())

    btn = tk.Button(b_frame, text='Gonder', font=('Segoe UI', 9, 'bold'), bg='#0284c7', fg='white', activebackground='#0369a1', activeforeground='white', bd=0, padx=14, pady=5, cursor='hand2', command=on_send)
    btn.pack(side='right')

    def handle_incoming(cmd):
        act = cmd.get('action')
        if act == 'incoming':
            sndr = cmd.get('sender', 'Teknisyen')
            txt_msg = cmd.get('text', '')
            t_str = cmd.get('time', time.strftime('%H:%M:%S'))
            add_msg(sndr, txt_msg, t_str, 'tech_hdr')
            root.deiconify()
            root.lift()
            root.attributes('-topmost', True)
            root.after(300, lambda: root.attributes('-topmost', False))
            entry.focus_set()
            try: user32.MessageBeep(0x00000040)
            except: pass
        elif act == 'show':
            root.deiconify()
            root.lift()
            root.attributes('-topmost', True)
            root.after(300, lambda: root.attributes('-topmost', False))
            entry.focus_set()
        elif act == 'close':
            root.destroy()

    def stdin_thread():
        for line in sys.stdin:
            line = line.strip()
            if not line: continue
            try:
                cmd = json.loads(line)
                root.after(0, lambda c=cmd: handle_incoming(c))
            except: pass

    threading.Thread(target=stdin_thread, daemon=True).start()

    root.protocol('WM_DELETE_WINDOW', root.withdraw)
    print(json.dumps({'type': 'READY'}), flush=True)
    root.mainloop()

def handle_client(conn, addr):
    global LOCKED, BLACKOUT
    with CLIENTS_LOCK:
        ACTIVE_CLIENTS.append(conn)

    hostname = socket.gethostname()
    try: uname = os.getlogin()
    except: uname = 'User'
    w, h = get_scr()
    hs = {
        'type': 'HANDSHAKE_ACK',
        'agentVersion': 'RemoteMM v4.1',
        'hostname': hostname,
        'user': uname,
        'screenWidth': w,
        'screenHeight': h,
        'os': 'Windows'
    }
    if not send_json_safe(conn, hs):
        with CLIENTS_LOCK:
            if conn in ACTIVE_CLIENTS: ACTIVE_CLIENTS.remove(conn)
        conn.close()
        return

    # Send current chat history immediately to connecting technician
    send_json_safe(conn, {'type': 'CHAT_BROADCAST', 'messages': list(CHAT_HISTORY)})

    quality = [65]
    fps = [0.05]
    client_alive = [True]

    def stream():
        switch_desktop()
        while client_alive[0]:
            try:
                t0 = time.time()
                frame = capture_gdi(quality[0])
                if frame:
                    w2, h2 = get_scr()
                    send_json_safe(conn, {
                        'type': 'SCREEN_FRAME',
                        'frame': frame,
                        'timestamp': int(t0 * 1000),
                        'width': w2,
                        'height': h2,
                        'blackedOut': BLACKOUT
                    })
                elapsed = time.time() - t0
                time.sleep(max(0.01, fps[0] - elapsed))
            except Exception:
                time.sleep(0.1)

    threading.Thread(target=stream, daemon=True).start()
    buf = ''
    while client_alive[0]:
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
                elif t=='BLACKOUT_SCREEN':
                    BLACKOUT = bool(cmd.get('blackout',False))
                elif t=='CHAT_MESSAGE':
                    text = cmd.get('text', '').strip()
                    if text:
                        t_str = time.strftime('%H:%M:%S')
                        msg_obj = {
                            'sender': 'Technician',
                            'text': text,
                            'time': t_str
                        }
                        CHAT_HISTORY.append(msg_obj)
                        broadcast_chat()
                        send_to_chat_ui({
                            'action': 'incoming',
                            'sender': 'Teknisyen',
                            'text': text,
                            'time': t_str
                        })
                elif t=='CHAT_OPEN':
                    ensure_chat_ui()
                elif t=='SET_QUALITY': quality[0] = max(20,min(95,int(cmd.get('quality',65))))
                elif t=='SET_FPS':     fps[0]     = 1.0/max(5,min(60,int(cmd.get('fps',20))))
                elif t=='PING':
                    send_json_safe(conn, {'type':'PONG','timestamp':int(time.time()*1000)})
                elif t=='POWER_ACTION':
                    a = cmd.get('action','')
                    if   a=='reboot':   os.system('shutdown /r /t 5')
                    elif a=='shutdown': os.system('shutdown /s /t 5')
                    elif a=='logoff':   os.system('logoff')
                elif t.startswith('FS_'):
                    threading.Thread(target=handle_fs, args=(conn, cmd), daemon=True).start()
                elif t=='TASK_LIST':
                    threading.Thread(target=handle_task_list, args=(conn,), daemon=True).start()
                elif t=='KILL_PROCESS':
                    try: os.system(f'taskkill /F /PID {int(cmd.get("pid",0))}')
                    except: pass
        except: break
    client_alive[0] = False
    with CLIENTS_LOCK:
        if conn in ACTIVE_CLIENTS: ACTIVE_CLIENTS.remove(conn)
    LOCKED = False
    BLACKOUT = False
    conn.close()

def start_server():
    os.system('netsh advfirewall firewall delete rule name=RemoteMMAgent >nul 2>&1')
    os.system(f'netsh advfirewall firewall add rule name=RemoteMMAgent dir=in action=allow protocol=TCP localport={PORT} >nul 2>&1')
    threading.Thread(target=input_and_curtain_manager, daemon=True).start()
    srv = socket.socket()
    for _ in range(15):
        try:
            srv.bind(('0.0.0.0', PORT))
            break
        except:
            time.sleep(1)
    else: return
    srv.listen(10); srv.settimeout(2.0)
    while True:
        try:
            conn, addr = srv.accept()
            threading.Thread(target=handle_client, args=(conn,addr), daemon=True).start()
        except socket.timeout: continue
        except: break
    srv.close()


def try_run_as_service():
    """Eger Windows Servisi olarak baslatildiysa SCM'ye baglanir ve calisir."""
    try:
        class SERVICE_STATUS(ctypes.Structure):
            _fields_ = [
                ('dwServiceType',             ctypes.c_uint32),
                ('dwCurrentState',            ctypes.c_uint32),
                ('dwControlsAccepted',        ctypes.c_uint32),
                ('dwWin32ExitCode',           ctypes.c_uint32),
                ('dwServiceSpecificExitCode', ctypes.c_uint32),
                ('dwCheckPoint',              ctypes.c_uint32),
                ('dwWaitHint',                ctypes.c_uint32)
            ]

        STATUS_HANDLE = [None]
        def service_handler(control, dwEventType, lpEventData, lpContext):
            if control in (1, 5):
                st = SERVICE_STATUS()
                st.dwServiceType = 0x10
                st.dwCurrentState = 1
                advapi32.SetServiceStatus(STATUS_HANDLE[0], ctypes.byref(st))
            return 0

        HANDLER_PROC = ctypes.WINFUNCTYPE(ctypes.c_uint32, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_void_p, ctypes.c_void_p)(service_handler)

        def service_main(argc, argv):
            STATUS_HANDLE[0] = advapi32.RegisterServiceCtrlHandlerExW("RemoteMMAgent", HANDLER_PROC, None)
            st = SERVICE_STATUS()
            st.dwServiceType = 0x10
            st.dwCurrentState = 4
            st.dwControlsAccepted = 1 | 5
            advapi32.SetServiceStatus(STATUS_HANDLE[0], ctypes.byref(st))
            watchdog_loop()

        MAIN_PROC = ctypes.WINFUNCTYPE(None, ctypes.c_uint32, ctypes.c_void_p)(service_main)

        class STE(ctypes.Structure):
            _fields_ = [('lpServiceName', ctypes.c_wchar_p), ('lpServiceProc', ctypes.c_void_p)]
        table = (STE * 2)()
        table[0].lpServiceName = 'RemoteMMAgent'
        table[0].lpServiceProc = ctypes.cast(MAIN_PROC, ctypes.c_void_p).value
        table[1].lpServiceName = None
        table[1].lpServiceProc = None

        advapi32.StartServiceCtrlDispatcherW(table)
    except: pass

# ─── ENTRY POINT ─────────────────────────────────────────────
if __name__ == '__main__':
    try:
        if '--chat-ui' in sys.argv:
            run_chat_ui()
            sys.exit(0)
        elif '--server' in sys.argv:
            start_server()
        else:
            try_run_as_service()
            curr_sess = ctypes.c_ulong()
            kernel32.ProcessIdToSessionId(kernel32.GetCurrentProcessId(), ctypes.byref(curr_sess))
            if curr_sess.value > 0:
                start_server()
            else:
                watchdog_loop()
    except Exception as e:
        import traceback
        log_file = os.path.join(os.path.dirname(AGENT_PATH), "agent_crash.log")
        with open(log_file, "a") as f: f.write(f"Crash: {e}\n{traceback.format_exc()}\n")
