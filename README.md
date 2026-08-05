# RemoteMM - DameWare Mini Remote Control Enterprise Studio Equivalent

**RemoteMM** is a high-performance, enterprise-grade remote desktop administration and remote control suite designed as an exact equivalent of **DameWare Mini Remote Control (DMRC)**.

![DameWare RemoteMM Architecture](https://img.shields.io/badge/DameWare-v12.2_Equivalent-0284c7?style=for-the-badge&logo=windows)
![License](https://img.shields.io/badge/License-MIT-emerald?style=for-the-badge)

---

## 🌟 Key Features

- **Viewer Console & Host Directory**:
  - Saved Address Book grouped by Domain & Department.
  - **⚡ 1-Click Direct Connect** with stored per-host Admin credentials.
  - Host Configuration Profile Editor (⚙️ Settings).
  - Subnet IP Range Scanner for DameWare Agents on Port 6129.

- **DameWare Remote Actions Toolbar**:
  - **Send Keys**: `Ctrl+Alt+Del`, `Win+L`, `Alt+Tab`, `PrintScreen`.
  - **Input Controls**: Lock Remote Keyboard & Mouse, Blackout Remote Screen, View-Only mode.
  - **Utilities**: Split-pane Remote File Manager, In-Session User Chat, Task Manager & Process Killer, Power Controls (Reboot, Shutdown, Logoff).

- **Standalone Native Agent Service (`DameWare_Agent.exe`)**:
  - Zero external dependencies (No Node.js required on remote target VMs).
  - Single-file standalone executable compiled for Windows 7, 10, 11, and Server 2012–2022.
  - **On-The-Fly Auto-Push Agent Deployer**: Automatically deploys and starts agent service over SMB/WMI if port 6129 is closed.

---

## 🚀 Quick Start

### 1. Launching the Viewer Console & Gateway
```bash
# Install dependencies
npm install

# Start Agent Service (Port 6129)
npm run agent

# Start Gateway Server Bridge (Port 3001)
npm run server

# Launch Console UI (Port 5173)
npm run dev
```

Open `http://localhost:5173/` in your browser.

---

## 📁 Repository Structure

```
RemoteMM/
├── agent/                  # DameWare Agent Service Engine & C# Source
│   ├── native/             # DameWareAgent.cs (Standalone C# 5 native agent)
│   └── index.js            # Node.js Agent fallback
├── server/                 # Gateway Server & Auto-Push SMB/WMI Deployer
│   ├── index.js            # Gateway WebSocket <-> Raw TCP Socket Bridge
│   └── deployer.js         # Remote Agent Push Deployment Engine
├── public/                 # Compiled DameWare_Agent.exe & QuickStart scripts
├── src/                    # Viewer Console UI (Vite + React + Tailwind v4)
│   ├── App.jsx             # DameWare Admin Studio Main Interface
│   └── index.css           # Glassmorphism Dark Mode Styling
└── package.json
```

---

## 🛡️ License

MIT License. Designed for IT System Administrators and Enterprise Remote Support.
