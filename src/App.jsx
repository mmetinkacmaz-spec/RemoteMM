import React, { useState, useEffect, useRef } from 'react';
import {
  Monitor, Shield, Terminal, Folder, MessageSquare, Cpu, Power,
  Lock, Eye, Camera, Disc, RefreshCw, Server, Wifi, Play, Search,
  Settings, ChevronRight, ChevronDown, Key, Download, Upload, Trash2,
  X, Check, AlertTriangle, Send, Activity, User, HardDrive, Plus, Zap, Edit3
} from 'lucide-react';

export default function App() {
  // Connection state
  const [targetHost, setTargetHost] = useState('MAKINE1');
  const [targetPort, setTargetPort] = useState('6129');
  const [authDomain, setAuthDomain] = useState('CORP');
  const [username, setUsername] = useState('Administrator');
  const [password, setPassword] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // Deployment Toast state
  const [deployStatus, setDeployStatus] = useState(null);

  // Active Session State
  const [agentInfo, setAgentInfo] = useState(null);
  const [frameSrc, setFrameSrc] = useState(null);
  const [frameSvg, setFrameSvg] = useState(null);
  const [fps, setFps] = useState(30);
  const [latency, setLatency] = useState(14);
  const [scaleMode, setScaleMode] = useState('fit');
  const [activeMonitor, setActiveMonitor] = useState('Primary Screen');

  // Control Toggles
  const [isInputLocked, setIsInputLocked] = useState(false);
  const [isScreenBlackedOut, setIsScreenBlackedOut] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);

  // Active Modals
  const [activeModal, setActiveModal] = useState(null);

  // Host Directory Tree
  const [savedHosts, setSavedHosts] = useState([
    {
      domain: 'MY VIRTUAL MACHINES (Sanal Sunucularım)',
      hosts: [
        { id: 1, name: 'MAKINE1 (Hyper-V Server)', ip: 'MAKINE1', port: '6129', domain: 'WORKGROUP', user: 'Makine', pass: '', status: 'ONLINE', os: 'Win 11 Pro' },
        { id: 2, name: 'DC-SRV-2024', ip: '127.0.0.1', port: '6129', domain: 'CORP', user: 'Administrator', pass: '', status: 'ONLINE', os: 'Win Server 2022' }
      ]
    },
    {
      domain: 'CORP.LOCAL (Enterprise Domain)',
      hosts: [
        { id: 3, name: 'FINANCE-PC01', ip: '192.168.1.105', port: '6129', domain: 'CORP', user: 'FinanceAdmin', pass: '', status: 'ONLINE', os: 'Win 11 Pro' },
        { id: 4, name: 'EXEC-LAPTOP03', ip: '192.168.1.112', port: '6129', domain: 'CORP', user: 'ExecUser', pass: '', status: 'BUSY', os: 'Win 11 Ent' },
        { id: 5, name: 'SQL-CLUSTER01', ip: '192.168.1.200', port: '6129', domain: 'CORP', user: 'sqladmin', pass: '', status: 'OFFLINE', os: 'Win Server 2019' }
      ]
    }
  ]);

  // Host Settings Editing State
  const [editingHost, setEditingHost] = useState(null);

  // New Host Form State
  const [newHostName, setNewHostName] = useState('');
  const [newHostIp, setNewHostIp] = useState('');
  const [newHostOs, setNewHostOs] = useState('Windows 11 Pro');

  // Subnet Scanner State
  const [scanSubnet, setScanSubnet] = useState('192.168.1');
  const [scanResults, setScanResults] = useState([]);
  const [isScanning, setIsScanning] = useState(false);

  // Chat State
  const [chatMessages, setChatMessages] = useState([
    { sender: 'System', text: 'DameWare Encrypted Session established on Port 6129.', time: new Date().toLocaleTimeString() }
  ]);
  const [chatInput, setChatInput] = useState('');

  // File Manager State
  const [remotePath, setRemotePath] = useState('C:\\');
  const [remoteFiles, setRemoteFiles] = useState([
    { name: 'Program Files', isDirectory: true, size: 0, modified: '2026-08-01' },
    { name: 'Windows', isDirectory: true, size: 0, modified: '2026-08-01' },
    { name: 'Users', isDirectory: true, size: 0, modified: '2026-08-02' },
    { name: 'DameWare_Agent.exe', isDirectory: false, size: 1450200, modified: '2026-08-05' },
    { name: 'system_audit.log', isDirectory: false, size: 84200, modified: '2026-08-05' }
  ]);

  // Task Manager State
  const [processes, setProcesses] = useState([
    { Id: 1024, ProcessName: 'DWRCS.exe', CPU: '1.2', WorkingSet64: 34500000 },
    { Id: 408, ProcessName: 'svchost.exe', CPU: '0.4', WorkingSet64: 82100000 },
    { Id: 2190, ProcessName: 'explorer.exe', CPU: '2.1', WorkingSet64: 124000000 },
    { Id: 512, ProcessName: 'lsass.exe', CPU: '0.1', WorkingSet64: 21000000 }
  ]);

  const socketRef = useRef(null);

  const handleConnect = (hostObj = null) => {
    let target = targetHost;
    let p = targetPort;
    let d = authDomain;
    let u = username;
    let pass = password;

    if (hostObj) {
      target = hostObj.ip || hostObj.name;
      p = hostObj.port || '6129';
      d = hostObj.domain || 'CORP';
      u = hostObj.user || 'Administrator';
      pass = hostObj.pass || '';

      setTargetHost(target);
      setTargetPort(p);
      setAuthDomain(d);
      setUsername(u);
      setPassword(pass);
    }

    setIsConnecting(true);
    setDeployStatus(null);

    const wsUrl = `ws://localhost:3001/?host=${target}&port=${p}&domain=${encodeURIComponent(d)}&username=${encodeURIComponent(u)}&password=${encodeURIComponent(pass)}`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log('Connected to Gateway Socket');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'DEPLOYMENT_PROGRESS') {
          setDeployStatus(data.message);
        } else if (data.type === 'HANDSHAKE_ACK') {
          setIsConnecting(false);
          setIsConnected(true);
          setAgentInfo(data);
          setDeployStatus(null);
        } else if (data.type === 'SCREEN_FRAME') {
          if (data.frame) {
            setFrameSrc(`data:image/jpeg;base64,${data.frame}`);
            setFrameSvg(null);
          }
        } else if (data.type === 'SCREEN_FRAME_SVG') {
          setFrameSvg(data.svg);
          setFrameSrc(null);
        } else if (data.type === 'CHAT_BROADCAST') {
          setChatMessages(data.messages);
        }
      } catch (e) {}
    };

    ws.onclose = () => {
      setIsConnected(false);
      setIsConnecting(false);
      setAgentInfo(null);
    };

    ws.onerror = () => {
      setIsConnecting(false);
    };
  };

  const handleDisconnect = () => {
    if (socketRef.current) {
      socketRef.current.close();
    }
    setIsConnected(false);
    setAgentInfo(null);
  };

  const handleOpenEditHost = (host) => {
    setEditingHost({ ...host });
    setActiveModal('editHostSettings');
  };

  const handleSaveHostSettings = (e) => {
    e.preventDefault();
    if (!editingHost) return;

    setSavedHosts(prev => {
      return prev.map(group => ({
        ...group,
        hosts: group.hosts.map(h => h.id === editingHost.id ? editingHost : h)
      }));
    });

    setActiveModal(null);
    setEditingHost(null);
  };

  const handleAddHost = (e) => {
    e.preventDefault();
    if (!newHostName.trim() || !newHostIp.trim()) return;

    setSavedHosts(prev => {
      const updated = [...prev];
      updated[0].hosts.unshift({
        id: Date.now(),
        name: newHostName,
        ip: newHostIp,
        port: '6129',
        domain: authDomain || 'WORKGROUP',
        user: username || 'Administrator',
        pass: password || '',
        status: 'ONLINE',
        os: newHostOs
      });
      return updated;
    });

    setNewHostName('');
    setNewHostIp('');
    setActiveModal(null);
  };

  const sendMouseInput = (action, e) => {
    if (!isConnected || isViewOnly || isInputLocked) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPercent = (e.clientX - rect.left) / rect.width;
    const yPercent = (e.clientY - rect.top) / rect.height;

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'MOUSE_INPUT',
        action: action,
        button: e.button === 2 ? 'right' : 'left',
        xPercent,
        yPercent
      }));
    }
  };

  const sendSpecialKey = (keyName) => {
    if (!isConnected || isViewOnly) return;
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'KEYBOARD_INPUT',
        key: keyName
      }));
    }
  };

  const toggleLockInput = () => {
    const nextState = !isInputLocked;
    setIsInputLocked(nextState);
    fetch(`http://localhost:6129/api/controls/lock-input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locked: nextState })
    }).catch(() => {});
  };

  const toggleBlackoutScreen = () => {
    const nextState = !isScreenBlackedOut;
    setIsScreenBlackedOut(nextState);
    fetch(`http://localhost:6129/api/controls/blackout-screen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blackout: nextState })
    }).catch(() => {});
  };

  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'CHAT_MESSAGE',
        text: chatInput
      }));
    } else {
      setChatMessages(prev => [...prev, { sender: 'Technician', text: chatInput, time: new Date().toLocaleTimeString() }]);
    }
    setChatInput('');
  };

  const runSubnetScan = () => {
    setIsScanning(true);
    setScanResults([]);
    setTimeout(() => {
      setScanResults([
        { ip: `${scanSubnet}.1`, host: 'ROUTER-GW', port6129: false },
        { ip: `${scanSubnet}.10`, host: 'DC-SRV-2024', port6129: true, agentVersion: '12.2' },
        { ip: `${scanSubnet}.105`, host: 'FINANCE-PC01', port6129: true, agentVersion: '12.2' },
        { ip: `${scanSubnet}.112`, host: 'EXEC-LAPTOP03', port6129: true, agentVersion: '12.1' },
        { ip: `${scanSubnet}.140`, host: 'DEV-MACHINE-04', port6129: false }
      ]);
      setIsScanning(false);
    }, 1500);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#090d16] text-slate-100 select-none overflow-hidden">
      
      {/* TOP HEADER / DAMEWARE TOOLBAR */}
      <header className="h-14 glass-header px-4 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
            <Monitor className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-sm text-slate-100 flex items-center gap-2">
              DameWare Mini Remote Control <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 font-mono">v12.2 Enterprise</span>
            </h1>
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Shield className="w-3 h-3 text-emerald-400" /> Host Credentials & Direct 1-Click Connect Configured
            </p>
          </div>
        </div>

        {/* CONNECTION STATUS & STATS */}
        {isConnected ? (
          <div className="flex items-center gap-4 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 pulse-dot"></span>
              <span className="font-mono text-emerald-400 font-bold">{agentInfo?.hostname || targetHost}</span>
              <span className="text-slate-500">({targetPort})</span>
            </div>
            <div className="h-4 w-px bg-slate-800"></div>
            <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
              <span>FPS: <strong className="text-sky-400">{fps}</strong></span>
              <span>PING: <strong className="text-emerald-400">{latency}ms</strong></span>
              <span>USER: <strong className="text-slate-200">{agentInfo?.user || username}</strong></span>
            </div>
            <button
              onClick={handleDisconnect}
              className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 text-xs transition"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span> Ready for Connection
          </div>
        )}

        {/* TOOLBAR ACTIONS */}
        <div className="flex items-center gap-1">
          <div className="relative group">
            <button
              disabled={!isConnected}
              className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs flex items-center gap-1.5 border border-slate-700"
            >
              <Key className="w-3.5 h-3.5 text-amber-400" /> Send Keys <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
            <div className="absolute right-0 top-full mt-1 hidden group-hover:flex flex-col bg-slate-900 border border-slate-800 rounded-lg shadow-xl py-1 z-50 min-w-[160px]">
              <button onClick={() => sendSpecialKey('CAD')} className="px-3 py-1.5 text-xs text-left hover:bg-slate-800 text-slate-200">Ctrl + Alt + Del</button>
              <button onClick={() => sendSpecialKey('WIN_L')} className="px-3 py-1.5 text-xs text-left hover:bg-slate-800 text-slate-200">Lock Workstation (Win+L)</button>
              <button onClick={() => sendSpecialKey('Alt+Tab')} className="px-3 py-1.5 text-xs text-left hover:bg-slate-800 text-slate-200">Alt + Tab</button>
              <button onClick={() => sendSpecialKey('PrtScn')} className="px-3 py-1.5 text-xs text-left hover:bg-slate-800 text-slate-200">Print Screen</button>
            </div>
          </div>

          <div className="h-5 w-px bg-slate-800 mx-1"></div>

          <button
            disabled={!isConnected}
            onClick={toggleLockInput}
            className={`p-1.5 rounded text-xs flex items-center gap-1 border ${
              isInputLocked ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            } disabled:opacity-40`}
            title="Lock Remote Mouse & Keyboard"
          >
            <Lock className="w-3.5 h-3.5" />
          </button>

          <button
            disabled={!isConnected}
            onClick={toggleBlackoutScreen}
            className={`p-1.5 rounded text-xs flex items-center gap-1 border ${
              isScreenBlackedOut ? 'bg-rose-500/20 text-rose-400 border-rose-500/40' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            } disabled:opacity-40`}
            title="Blackout Remote Screen"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          <div className="h-5 w-px bg-slate-800 mx-1"></div>

          <button
            disabled={!isConnected}
            onClick={() => setActiveModal('files')}
            className={`p-1.5 rounded border text-xs flex items-center gap-1 ${
              activeModal === 'files' ? 'bg-sky-500/20 text-sky-400 border-sky-500/40' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            } disabled:opacity-40`}
            title="File Transfer Manager"
          >
            <Folder className="w-3.5 h-3.5 text-sky-400" />
          </button>

          <button
            disabled={!isConnected}
            onClick={() => setActiveModal('chat')}
            className={`p-1.5 rounded border text-xs flex items-center gap-1 ${
              activeModal === 'chat' ? 'bg-sky-500/20 text-sky-400 border-sky-500/40' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            } disabled:opacity-40`}
            title="Remote Chat Window"
          >
            <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
          </button>

          <button
            disabled={!isConnected}
            onClick={() => setActiveModal('taskmgr')}
            className={`p-1.5 rounded border text-xs flex items-center gap-1 ${
              activeModal === 'taskmgr' ? 'bg-sky-500/20 text-sky-400 border-sky-500/40' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            } disabled:opacity-40`}
            title="Task Manager & Diagnostics"
          >
            <Cpu className="w-3.5 h-3.5 text-purple-400" />
          </button>

          <button
            disabled={!isConnected}
            onClick={() => setActiveModal('power')}
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-rose-400 disabled:opacity-40"
            title="Power Controls (Reboot/Shutdown)"
          >
            <Power className="w-3.5 h-3.5" />
          </button>

          <div className="h-5 w-px bg-slate-800 mx-1"></div>

          <button
            onClick={() => setActiveModal('agentInstall')}
            className="px-2.5 py-1.5 rounded bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 text-xs flex items-center gap-1.5 font-medium"
          >
            <Download className="w-3.5 h-3.5" /> Agent Deployment
          </button>
        </div>
      </header>

      {/* AUTO DEPLOYMENT NOTIFICATION TOAST */}
      {deployStatus && (
        <div className="bg-sky-900/90 text-sky-200 border-b border-sky-700/50 px-4 py-2 text-xs flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400" />
            <span>{deployStatus}</span>
          </div>
          <span className="text-[10px] font-mono bg-sky-950 px-2 py-0.5 rounded text-sky-300">Auto-Push Engine</span>
        </div>
      )}

      {/* MAIN CONTAINER */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* LEFT SIDEBAR: QUICK CONNECT & SAVED HOSTS */}
        <aside className="w-80 glass-panel border-r border-slate-800 flex flex-col shrink-0">
          
          {/* Quick Connect Form */}
          <div className="p-3 border-b border-slate-800 bg-slate-900/50">
            <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-sky-400" /> Quick Remote Connection
            </h2>

            <div className="space-y-2 text-xs">
              <div>
                <label className="text-[11px] text-slate-400">Target IP / Hostname:</label>
                <input
                  type="text"
                  value={targetHost}
                  onChange={(e) => setTargetHost(e.target.value)}
                  className="w-full mt-0.5 px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded focus:border-sky-500 outline-none text-slate-100 font-mono"
                  placeholder="e.g. MAKINE1 or 192.168.1.100"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-slate-400">Port:</label>
                  <input
                    type="text"
                    value={targetPort}
                    onChange={(e) => setTargetPort(e.target.value)}
                    className="w-full mt-0.5 px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400">Domain:</label>
                  <input
                    type="text"
                    value={authDomain}
                    onChange={(e) => setAuthDomain(e.target.value)}
                    className="w-full mt-0.5 px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-slate-400">Admin User:</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full mt-0.5 px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400">Admin Password:</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full mt-0.5 px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded outline-none"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <button
                disabled={isConnecting}
                onClick={() => handleConnect()}
                className="w-full mt-2 py-2 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-medium flex items-center justify-center gap-2 transition shadow-lg shadow-sky-600/20"
              >
                {isConnecting ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> Connecting...</>
                ) : (
                  <><Play className="w-4 h-4 fill-current" /> Connect to Remote Server</>
                )}
              </button>
            </div>
          </div>

          {/* Saved Host Address Book */}
          <div className="flex-1 overflow-y-auto p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Host Directory</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveModal('addHost')}
                  className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1 font-medium"
                >
                  <Plus className="w-3 h-3" /> Add Host
                </button>
                <button
                  onClick={() => setActiveModal('scanner')}
                  className="text-[11px] text-sky-400 hover:underline flex items-center gap-1"
                >
                  <Search className="w-3 h-3" /> Subnet Scan
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {savedHosts.map((group, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                    <ChevronDown className="w-3 h-3" /> {group.domain}
                  </div>
                  <div className="pl-2 space-y-1 border-l border-slate-800">
                    {group.hosts.map((h, i) => (
                      <div
                        key={i}
                        className="group flex items-center justify-between p-2 rounded hover:bg-slate-800/80 transition border border-transparent hover:border-slate-700/50"
                      >
                        <div className="flex items-center gap-2 cursor-pointer flex-1" onClick={() => handleConnect(h)}>
                          <div className={`w-2 h-2 rounded-full ${
                            h.status === 'ONLINE' ? 'bg-emerald-400' : h.status === 'BUSY' ? 'bg-amber-400' : 'bg-slate-600'
                          }`}></div>
                          <div>
                            <div className="text-xs font-medium text-slate-200 group-hover:text-sky-400 transition flex items-center gap-1.5">
                              {h.name}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">{h.ip} • {h.user || 'Admin'}</div>
                          </div>
                        </div>

                        {/* HOST SETTINGS ⚙️ & 1-CLICK CONNECT BUTTONS */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleOpenEditHost(h)}
                            className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-amber-400 transition"
                            title="Configure Admin User & Host Credentials"
                          >
                            <Settings className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleConnect(h)}
                            className="px-2 py-1 rounded bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 text-[10px] font-medium flex items-center gap-1 transition"
                            title="1-Click Direct Connect"
                          >
                            <Zap className="w-3 h-3 fill-current" /> 1-Click
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-2 border-t border-slate-800 bg-slate-950/60 text-[10px] text-slate-500 flex justify-between">
            <span>Saved Credentials: Encrypted</span>
            <span>Port: 6129</span>
          </div>
        </aside>

        {/* CENTER VIEWPORT / REMOTE DESKTOP CANVAS */}
        <main className="flex-1 bg-[#050811] flex flex-col relative overflow-hidden">
          
          {/* Sub-Header Bar */}
          <div className="h-9 bg-slate-900/90 border-b border-slate-800 px-4 flex items-center justify-between text-xs text-slate-400 shrink-0">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <Monitor className="w-3.5 h-3.5 text-sky-400" /> Display:
                <select
                  value={activeMonitor}
                  onChange={(e) => setActiveMonitor(e.target.value)}
                  className="bg-slate-950 text-slate-200 border border-slate-800 rounded px-1.5 py-0.5 text-xs outline-none"
                >
                  <option>Primary Screen (1920x1080)</option>
                  <option>Monitor 2 (1920x1080)</option>
                  <option>All Displays (Combined)</option>
                </select>
              </span>

              <div className="h-4 w-px bg-slate-800"></div>

              <span className="flex items-center gap-1.5">
                Scaling:
                <div className="flex bg-slate-950 p-0.5 rounded border border-slate-800">
                  {['fit', '100%', 'stretch'].map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setScaleMode(mode)}
                      className={`px-2 py-0.5 rounded text-[11px] uppercase ${
                        scaleMode === mode ? 'bg-sky-500 text-white' : 'hover:text-slate-200'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsViewOnly(!isViewOnly)}
                className={`px-2 py-0.5 rounded border text-[11px] ${
                  isViewOnly ? 'bg-purple-500/20 text-purple-400 border-purple-500/40' : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
              >
                {isViewOnly ? 'View Only Active' : 'Control Mode Active'}
              </button>
            </div>
          </div>

          {/* CANVAS DISPLAY AREA WITH MOUSE MOVE & CLICK BINDINGS */}
          <div className="flex-1 relative flex items-center justify-center overflow-auto p-2">
            {isConnected ? (
              <div
                className={`relative border border-slate-800 rounded shadow-2xl overflow-hidden cursor-crosshair ${
                  scaleMode === 'fit' ? 'max-w-full max-h-full aspect-video' : ''
                }`}
                onMouseMove={(e) => sendMouseInput('move', e)}
                onClick={(e) => sendMouseInput('click', e)}
                onContextMenu={(e) => { e.preventDefault(); sendMouseInput('click', e); }}
              >
                {frameSrc && (
                  <img src={frameSrc} alt="Remote Desktop" className="w-full h-full object-contain pointer-events-none" />
                )}

                {frameSvg && (
                  <div dangerouslySetInnerHTML={{ __html: frameSvg }} className="w-full h-full pointer-events-none" />
                )}

                {isInputLocked && (
                  <div className="absolute top-4 left-4 bg-amber-500/90 text-slate-950 px-3 py-1 rounded font-bold text-xs flex items-center gap-1.5 shadow-lg">
                    <Lock className="w-3.5 h-3.5" /> REMOTE MOUSE & KEYBOARD LOCKED BY ADMIN
                  </div>
                )}

                {isScreenBlackedOut && (
                  <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center text-rose-500">
                    <Eye className="w-12 h-12 mb-2 animate-pulse" />
                    <span className="font-bold text-sm uppercase tracking-widest">Remote Screen Blackout Active</span>
                    <span className="text-xs text-slate-500 mt-1">End user display is currently blanked</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-600 p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-slate-900/80 border border-slate-800 flex items-center justify-center mb-4">
                  <Monitor className="w-8 h-8 text-slate-600" />
                </div>
                <h3 className="text-base font-semibold text-slate-400">No Active Remote Control Session</h3>
                <p className="text-xs text-slate-500 max-w-sm mt-1">
                  Click ⚙️ to configure host Admin User/Password or click ⚡ <strong>1-Click</strong> to connect instantly!
                </p>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* MODALS */}

      {/* EDIT HOST SETTINGS MODAL ⚙️ */}
      {activeModal === 'editHostSettings' && editingHost && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-[500px] glass-panel rounded-xl border border-slate-800 flex flex-col overflow-hidden shadow-2xl">
            <div className="h-11 px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <span className="font-bold text-sm text-slate-200 flex items-center gap-2">
                <Settings className="w-4 h-4 text-amber-400" /> Configure Host Connection Profile
              </span>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            <form onSubmit={handleSaveHostSettings} className="p-5 space-y-3 text-xs">
              <div>
                <label className="text-slate-400 mb-1 block">Server Name / Label:</label>
                <input
                  type="text"
                  required
                  value={editingHost.name}
                  onChange={(e) => setEditingHost({ ...editingHost, name: e.target.value })}
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 mb-1 block">Target IP / Hostname:</label>
                  <input
                    type="text"
                    required
                    value={editingHost.ip}
                    onChange={(e) => setEditingHost({ ...editingHost, ip: e.target.value })}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded font-mono text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-slate-400 mb-1 block">Port:</label>
                  <input
                    type="text"
                    value={editingHost.port || '6129'}
                    onChange={(e) => setEditingHost({ ...editingHost, port: e.target.value })}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded font-mono text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-400 mb-1 block">Domain:</label>
                  <input
                    type="text"
                    value={editingHost.domain || 'WORKGROUP'}
                    onChange={(e) => setEditingHost({ ...editingHost, domain: e.target.value })}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded font-mono text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-slate-400 mb-1 block">Admin User:</label>
                  <input
                    type="text"
                    value={editingHost.user || 'Administrator'}
                    onChange={(e) => setEditingHost({ ...editingHost, user: e.target.value })}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-slate-400 mb-1 block">Admin Password:</label>
                  <input
                    type="password"
                    value={editingHost.pass || ''}
                    onChange={(e) => setEditingHost({ ...editingHost, pass: e.target.value })}
                    placeholder="••••••••"
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-100"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-between items-center border-t border-slate-800">
                <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Auto-Accept Connection Enabled
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveModal(null)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded font-medium flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" /> Save Credentials
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD HOST MODAL */}
      {activeModal === 'addHost' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-[450px] glass-panel rounded-xl border border-slate-800 flex flex-col overflow-hidden shadow-2xl">
            <div className="h-11 px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <span className="font-bold text-sm text-slate-200 flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" /> Add New Host to Directory
              </span>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            <form onSubmit={handleAddHost} className="p-4 space-y-3 text-xs">
              <div>
                <label className="text-slate-400 mb-1 block">Server Name / Description:</label>
                <input
                  type="text"
                  required
                  value={newHostName}
                  onChange={(e) => setNewHostName(e.target.value)}
                  placeholder="e.g. MAKINE1 (Hyper-V)"
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded outline-none text-slate-100"
                />
              </div>

              <div>
                <label className="text-slate-400 mb-1 block">IP Address or Hostname:</label>
                <input
                  type="text"
                  required
                  value={newHostIp}
                  onChange={(e) => setNewHostIp(e.target.value)}
                  placeholder="e.g. MAKINE1 or 192.168.1.150"
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded outline-none text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="text-slate-400 mb-1 block">OS Type:</label>
                <select
                  value={newHostOs}
                  onChange={(e) => setNewHostOs(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded outline-none text-slate-200"
                >
                  <option>Windows 11 Pro</option>
                  <option>Windows 10 Enterprise</option>
                  <option>Windows Server 2022</option>
                  <option>Windows Server 2019</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Save Host to Directory
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FILE TRANSFER MODAL */}
      {activeModal === 'files' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-[850px] h-[550px] glass-panel rounded-xl border border-slate-800 flex flex-col overflow-hidden shadow-2xl">
            <div className="h-11 px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <span className="font-bold text-sm text-slate-200 flex items-center gap-2">
                <Folder className="w-4 h-4 text-sky-400" /> DameWare Remote File Explorer - [{targetHost}]
              </span>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            <div className="flex-1 p-4 grid grid-cols-2 gap-4 overflow-hidden">
              <div className="bg-slate-950/80 rounded border border-slate-800 flex flex-col">
                <div className="p-2 border-b border-slate-800 text-xs font-semibold text-slate-400 bg-slate-900/50 flex justify-between">
                  <span>Local Console Workstation</span>
                  <span className="font-mono text-slate-500">C:\AdminDownloads</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 text-xs space-y-1">
                  <div className="p-1.5 hover:bg-slate-800 rounded flex justify-between text-slate-300">
                    <span>📁 DeploymentScripts</span><span>-</span>
                  </div>
                  <div className="p-1.5 hover:bg-slate-800 rounded flex justify-between text-slate-300">
                    <span>📄 DameWare_Agent_v12.2.msi</span><span>14.2 MB</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950/80 rounded border border-slate-800 flex flex-col">
                <div className="p-2 border-b border-slate-800 text-xs font-semibold text-slate-400 bg-slate-900/50 flex justify-between">
                  <span>Remote Host [{targetHost}]</span>
                  <span className="font-mono text-sky-400">{remotePath}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 text-xs space-y-1">
                  {remoteFiles.map((file, i) => (
                    <div key={i} className="p-1.5 hover:bg-slate-800 rounded flex justify-between items-center text-slate-300">
                      <span className="flex items-center gap-1.5">
                        {file.isDirectory ? '📁' : '📄'} {file.name}
                      </span>
                      <span className="text-slate-500 font-mono text-[11px]">
                        {file.isDirectory ? 'DIR' : `${(file.size / 1024).toFixed(1)} KB`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="h-12 px-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400">Drag files between panes or click Upload/Download</span>
              <div className="flex gap-2">
                <button className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded font-medium flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5" /> Upload File to Remote
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CHAT MODAL */}
      {activeModal === 'chat' && (
        <div className="fixed bottom-4 right-4 w-[380px] h-[480px] glass-panel rounded-xl border border-slate-800 z-50 flex flex-col overflow-hidden shadow-2xl">
          <div className="h-10 px-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
            <span className="font-bold text-xs text-slate-200 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-emerald-400" /> In-Session User Chat
            </span>
            <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-white"><X className="w-3.5 h-3.5" /></button>
          </div>

          <div className="flex-1 p-3 overflow-y-auto space-y-2 text-xs">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.sender === 'Technician' ? 'items-end' : 'items-start'}`}>
                <div className="text-[10px] text-slate-500 mb-0.5">{msg.sender} • {msg.time}</div>
                <div className={`px-3 py-2 rounded-lg max-w-[85%] ${
                  msg.sender === 'Technician' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-200'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleSendChat} className="p-2 border-t border-slate-800 bg-slate-950 flex gap-1.5">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Type message to end user..."
              className="flex-1 px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-xs outline-none text-slate-100"
            />
            <button type="submit" className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium">
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}

      {/* TASK MANAGER MODAL */}
      {activeModal === 'taskmgr' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-[700px] h-[480px] glass-panel rounded-xl border border-slate-800 flex flex-col overflow-hidden shadow-2xl">
            <div className="h-11 px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <span className="font-bold text-sm text-slate-200 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-purple-400" /> Remote Task Manager - [{targetHost}]
              </span>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                    <th className="pb-2">PID</th>
                    <th className="pb-2">Process Name</th>
                    <th className="pb-2">CPU %</th>
                    <th className="pb-2">Memory (MB)</th>
                    <th className="pb-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {processes.map((proc, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/50">
                      <td className="py-2 font-mono text-slate-400">{proc.Id}</td>
                      <td className="py-2 font-medium text-slate-200">{proc.ProcessName}</td>
                      <td className="py-2 font-mono text-sky-400">{proc.CPU}%</td>
                      <td className="py-2 font-mono text-slate-300">{(proc.WorkingSet64 / (1024*1024)).toFixed(1)} MB</td>
                      <td className="py-2 text-right">
                        <button className="px-2 py-0.5 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded hover:bg-rose-500/30">
                          End Task
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* AGENT DEPLOYMENT MODAL */}
      {activeModal === 'agentInstall' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-[650px] glass-panel rounded-xl border border-slate-800 flex flex-col overflow-hidden shadow-2xl">
            <div className="h-11 px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <span className="font-bold text-sm text-slate-200 flex items-center gap-2">
                <Download className="w-4 h-4 text-sky-400" /> DameWare Agent Package & Push Installer
              </span>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-slate-300">
                You can download the standalone <strong className="text-sky-400">DameWare_Agent.exe</strong> (Zero dependency, no Node.js required) or deploy automatically over SMB/WMI.
              </p>

              <div className="bg-slate-950 p-3 rounded border border-slate-800 font-mono text-[11px] text-sky-300 space-y-1">
                <div># Quick Powershell Remote Download & Firewall Rule:</div>
                <div className="text-slate-400">New-NetFirewallRule -DisplayName "DameWare 6129" -Direction Inbound -LocalPort 6129 -Protocol TCP -Action Allow</div>
                <div className="text-slate-400">Invoke-WebRequest -Uri "http://localhost:5173/DameWare_Agent.exe" -OutFile "DameWare_Agent.exe"; .\DameWare_Agent.exe</div>
              </div>

              <div className="flex gap-3 pt-2">
                <a
                  href="/DameWare_Agent.exe"
                  download="DameWare_Agent.exe"
                  className="flex-1 py-2 bg-sky-600 hover:bg-sky-500 text-white font-medium rounded text-xs flex items-center justify-center gap-2 decoration-none"
                >
                  <Download className="w-4 h-4" /> Download Agent Standalone (.EXE)
                </a>
                <a
                  href="/DameWare_QuickStart.bat"
                  download="DameWare_QuickStart.bat"
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded text-xs flex items-center justify-center gap-2 decoration-none"
                >
                  <Terminal className="w-4 h-4 text-emerald-400" /> Download Auto-Start Batch (.BAT)
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUBNET SCANNER MODAL */}
      {activeModal === 'scanner' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-[600px] glass-panel rounded-xl border border-slate-800 flex flex-col overflow-hidden shadow-2xl">
            <div className="h-11 px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <span className="font-bold text-sm text-slate-200 flex items-center gap-2">
                <Search className="w-4 h-4 text-sky-400" /> Subnet Scanner for DameWare Agents (Port 6129)
              </span>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-4 border-b border-slate-800 flex gap-2 text-xs">
              <input
                type="text"
                value={scanSubnet}
                onChange={(e) => setScanSubnet(e.target.value)}
                placeholder="192.168.1"
                className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded font-mono text-slate-100"
              />
              <button
                disabled={isScanning}
                onClick={runSubnetScan}
                className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded font-medium flex items-center gap-1.5"
              >
                {isScanning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} Scan Range
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[300px] text-xs">
              {scanResults.length === 0 ? (
                <div className="text-center text-slate-500 py-6">Enter subnet prefix and click Scan Range to discover active agents.</div>
              ) : (
                <div className="space-y-1">
                  {scanResults.map((item, i) => (
                    <div key={i} className="flex justify-between items-center p-2 rounded bg-slate-900/60 border border-slate-800">
                      <div>
                        <div className="font-mono text-slate-200">{item.ip}</div>
                        <div className="text-[11px] text-slate-400">{item.host}</div>
                      </div>
                      {item.port6129 ? (
                        <button
                          onClick={() => { handleConnect(item); setActiveModal(null); }}
                          className="px-2.5 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-[11px] hover:bg-emerald-500/30"
                        >
                          Connect Agent (v{item.agentVersion})
                        </button>
                      ) : (
                        <span className="text-slate-600 text-[11px]">No Agent Detected</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
