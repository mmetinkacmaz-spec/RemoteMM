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

namespace DameWareNativeAgent
{
    class Program
    {
        private static int PORT = 6129;
        private static bool isRunning = true;

        [DllImport("user32.dll")]
        public static extern bool SetCursorPos(int X, int Y);

        [DllImport("user32.dll")]
        public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);

        public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        public const uint MOUSEEVENTF_LEFTUP = 0x0004;
        public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
        public const uint MOUSEEVENTF_RIGHTUP = 0x0010;

        static void Main(string[] args)
        {
            Console.Title = "DameWare Mini Remote Control Agent v12.2 (Native)";
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("==========================================================");
            Console.WriteLine(" DameWare Native Agent Service - Real Control Active");
            Console.WriteLine("==========================================================");

            TcpListener listener = new TcpListener(IPAddress.Any, PORT);
            try {
                listener.Start();
                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine(string.Format("[+] Agent Active & Listening on TCP Port {0}", PORT));
                Console.WriteLine(string.Format("[+] Computer Name: {0}", Environment.MachineName));
                Console.WriteLine(string.Format("[+] User Account: {0}", Environment.UserName));
                Console.ResetColor();

                while (isRunning) {
                    TcpClient client = listener.AcceptTcpClient();
                    Console.WriteLine(string.Format("[*] Console connected from: {0}", client.Client.RemoteEndPoint));
                    ThreadPool.QueueUserWorkItem(HandleClient, client);
                }
            } catch (Exception ex) {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine(string.Format("[-] Error starting agent: {0}", ex.Message));
            }
        }

        private static void HandleClient(object obj)
        {
            TcpClient client = (TcpClient)obj;
            NetworkStream stream = client.GetStream();

            // Send Handshake
            string handshake = string.Format("{{\"type\":\"HANDSHAKE_ACK\",\"agentVersion\":\"DameWare Native v12.2\",\"hostname\":\"{0}\",\"user\":\"{1}\",\"os\":\"Windows {2}\"}}\n", Environment.MachineName, Environment.UserName, Environment.OSVersion);
            byte[] handshakeBytes = Encoding.UTF8.GetBytes(handshake);
            stream.Write(handshakeBytes, 0, handshakeBytes.Length);

            // Frame Streaming Thread (15 FPS)
            Thread streamThread = new Thread(() => {
                try {
                    while (client.Connected) {
                        string frameBase64 = CapturePrimaryScreenJpegBase64();
                        if (!string.IsNullOrEmpty(frameBase64)) {
                            string packet = string.Format("{{\"type\":\"SCREEN_FRAME\",\"frame\":\"{0}\",\"timestamp\":{1},\"width\":1920,\"height\":1080}}\n", frameBase64, DateTime.Now.Ticks);
                            byte[] packetBytes = Encoding.UTF8.GetBytes(packet);
                            stream.Write(packetBytes, 0, packetBytes.Length);
                        }
                        Thread.Sleep(66); // ~15 FPS
                    }
                } catch {}
            });
            streamThread.IsBackground = true;
            streamThread.Start();

            // Command Processing Loop
            byte[] buffer = new byte[8192];
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

            Console.WriteLine("[-] Console disconnected.");
            client.Close();
        }

        private static void ProcessCommand(string cmd)
        {
            try {
                if (cmd.Contains("MOUSE_INPUT")) {
                    // Extract xPercent and yPercent
                    double xPercent = GetJsonDouble(cmd, "xPercent");
                    double yPercent = GetJsonDouble(cmd, "yPercent");
                    string action = GetJsonString(cmd, "action");
                    string button = GetJsonString(cmd, "button");

                    Rectangle bounds = Screen.PrimaryScreen.Bounds;
                    int targetX = (int)(bounds.Width * xPercent);
                    int targetY = (int)(bounds.Height * yPercent);

                    // Move Cursor
                    SetCursorPos(targetX, targetY);

                    // Execute Click
                    if (action == "click") {
                        if (button == "right") {
                            mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0);
                            mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0);
                        } else {
                            mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                            mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                        }
                    }
                } else if (cmd.Contains("KEYBOARD_INPUT")) {
                    string key = GetJsonString(cmd, "key");
                    if (key == "CAD") {
                        System.Diagnostics.Process.Start("taskmgr.exe");
                    } else if (key == "WIN_L") {
                        // Lock Workstation
                    } else {
                        SendKeys.SendWait(key);
                    }
                }
            } catch (Exception ex) {
                Console.WriteLine("Input Error: " + ex.Message);
            }
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

        private static string CapturePrimaryScreenJpegBase64()
        {
            try {
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
    }
}
