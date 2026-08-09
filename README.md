# RemoteMM 🚀

RemoteMM is a powerful, high-performance, web-based Remote Desktop & IT Management system designed to bypass common Windows restrictions (like UAC and UIPI) by running its agent at the deepest `SYSTEM` level. 

It provides real-time desktop streaming, mouse/keyboard synchronization, remote file transfer, and an automated deployment system that easily integrates both Domain (Active Directory) and Workgroup environments.

## ✨ Features

- **True SYSTEM-Level Access:** The agent utilizes Token Duplication to spawn inside the active user session with full `SYSTEM` privileges. This allows complete interaction with elevated UAC prompts, Task Manager, and secure desktop lock screens without mouse freezing.
- **High-Definition Web Interface:** Built with React and Vite, the control panel offers a sleek, dark-mode GUI to manage hosts.
- **1-Click Push Deployment:** Automatically deploy the agent to Domain-joined machines via WMI/RPC without user interaction.
- **One-Liner Workgroup Install:** Easily add non-domain machines with an auto-generated PowerShell snippet that configures the firewall and scheduled tasks in seconds.
- **Real-Time Control:** Low-latency mouse (with drag & drop) and keyboard forwarding.

## 🛠️ Architecture

1. **Frontend (Vite + React):** The `src/` directory contains the web control panel. It talks to the Gateway over HTTP and WebSockets.
2. **Gateway (Node.js):** The `server/` directory runs the backend (`index.js`). It handles traffic bridging between the Web UI and the Python Agent. It also serves the agent executable (`RemoteMM_Agent.exe`) dynamically.
3. **Agent (Python/Win32API):** The `agent/py_agent.py` script captures the GDI screen, intercepts inputs, and dynamically switches desktops (`WinSta0\Default` to `Winlogon`) to ensure the session is never lost.

## 🚀 Getting Started

### 1. Prerequisites
- Node.js (v18+)
- Python 3.10+ (For agent development)
- Windows OS (The Agent requires Windows API features)

### 2. Setup the Server
```bash
# Install dependencies
npm install

# Start the Gateway backend and Vite frontend concurrently
npm run dev
```

### 3. Deploying to Target Machines

**Method A: Automatic Push (Domain Environments)**
1. Open the RemoteMM Web UI.
2. Click **Add Host**, enter the Target IP, Domain, and Admin Credentials.
3. Click the **1-Click** connect button. The server will automatically push the agent via SMB/WMI.

**Method B: Manual Setup (Workgroup Environments)**
1. Open the RemoteMM Web UI.
2. Click **Agent Deployment** at the top right.
3. Copy the dynamically generated PowerShell command.
4. Run the command in an **Elevated (Administrator) PowerShell** on the target machine.

## 💻 Tech Stack
- **Frontend:** React, Tailwind CSS, Lucide Icons, Vite
- **Backend:** Node.js, Express, `ws` (WebSockets)
- **Agent:** Python, `ctypes`, `win32gui`, `pyinstaller`

## 🔒 Security Warning
RemoteMM runs with full `SYSTEM` privileges and exposes remote screen and keyboard control. It is intended for authorized IT administration, network management, and development testing only. Ensure your firewall (Port `6129`) is properly restricted to trusted IP addresses.

---
*Built for absolute administrative control.*
