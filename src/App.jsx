import React, { useState, useEffect, useRef } from 'react';
import {
  Monitor, Shield, Terminal, Folder, MessageSquare, Cpu, Power,
  Lock, Eye, Camera, Disc, RefreshCw, Server, Wifi, Play, Search,
  Settings, ChevronRight, ChevronDown, Key, Download, Upload, Trash2,
  X, Check, AlertTriangle, Send, Activity, User, HardDrive, Plus, Zap, Edit3, AlertCircle, Unlock, EyeOff
} from 'lucide-react';

const LOCAL_STORAGE_KEY = 'dameware_saved_hosts_v1';

export default function App() {
  // Connection state
  const [targetHost, setTargetHost] = useState('');
  const [targetPort, setTargetPort] = useState('6129');
  const [authDomain, setAuthDomain] = useState('WORKGROUP');
  const [username, setUsername] = useState('Administrator');
  const [password, setPassword] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // Error State
  const [connectionError, setConnectionError] = useState(null);
  const [deployStatus, setDeployStatus] = useState(null);

  // Active Session State
  const [agentInfo, setAgentInfo] = useState(null);
  const [frameSrc, setFrameSrc] = useState(null);
  const [frameSvg, setFrameSvg] = useState(null);
  const [fps, setFps] = useState(30);
  const [latency, setLatency] = useState(14);
  const [scaleMode, setScaleMode] = useState('fit');
  const [activeMonitor, setActiveMonitor] = useState('Primary Screen');

  // Toolbar Actions State
  const [isInputLocked, setIsInputLocked] = useState(false);
  const [isScreenBlackedOut, setIsScreenBlackedOut] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [sendKeysOpen, setSendKeysOpen] = useState(false);

  // Active Modals
  const [activeModal, setActiveModal] = useState(null);

  // Mouse Holding / Dragging state
  const isMousePressedRef = useRef(false);

  // Persistent Host Directory State
  const [savedHosts, setSavedHosts] = useState(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {}
    return [
      {
        domain: 'KAYITLI SUNUCULARIM (My Saved Hosts)',
        hosts: [
          { id: 1, name: 'MAKINE1 (Sanal Sunucu)', ip: 'MAKINE1', port: '6129', domain: 'WORKGROUP', user: 'Makine', pass: '', status: 'ONLINE', os: 'Windows 11 Pro' }
        ]
      }
    ];
  });

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(savedHosts));
    } catch (e) {}
  }, [savedHosts]);

  // Form States
  const [editingHost, setEditingHost] = useState(null);
  const [newHostName, setNewHostName] = useState('');
  const [newHostIp, setNewHostIp] = useState('');
  const [newHostUser, setNewHostUser] = useState('Administrator');
  const [newHostPass, setNewHostPass] = useState('');
  const [newHostDomain, setNewHostDomain] = useState('WORKGROUP');

  const [scanSubnet, setScanSubnet] = useState('192.168.1');
  const [scanResults, setScanResults] = useState([]);
  const [isScanning, setIsScanning] = useState(false);

  // Live Chat State
  const [chatMessages, setChatMessages] = useState([
    { sender: 'DameWare Agent', text: 'Encrypted Remote Session established on Port 6129.', time: new Date().toLocaleTimeString() }
  ]);
  const [chatInput, setChatInput] = useState('');

  // File Transfer State
  const [remotePath, setRemotePath] = useState('C:\\DameWareFiles');
  const [remoteFiles, setRemoteFiles] = useState([
    { name: 'Program Files', isDirectory: true, size: 0, modified: '2026-08-01' },
    { name: 'Windows', isDirectory: true, size: 0, modified: '2026-08-01' },
    { name: 'DameWare_Agent.exe', isDirectory: false, size: 1450200, modified: '2026-08-06' },
    { name: 'SystemConfig.log', isDirectory: false, size: 45200, modified: '2026-08-06' }
  ]);

  // Processes State
  const [processes, setProcesses] = useState([
    { Id: 1024, ProcessName: 'DameWare_Agent.exe', CPU: '1.2', WorkingSet64: 34500000 },
    { Id: 408, ProcessName: 'svchost.exe', CPU: '0.4', WorkingSet64: 82100000 },
    { Id: 2190, ProcessName: 'explorer.exe', CPU: '2.8', WorkingSet64: 114200000 },
    { Id: 3400, ProcessName: 'taskmgr.exe', CPU: '0.9', WorkingSet64: 28900000 }
  ]);

  const socketRef = useRef(null);

  // SINGLE ACTIVE CONNECTION ENFORCER
  const handleConnect = (hostObj = null) => {
    if (socketRef.current) {
      socketRef.current.onclose = null;
      socketRef.current.onerror = null;
      socketRef.current.onmessage = null;
      socketRef.current.close();
      socketRef.current = null;
    }

    let target = targetHost;
    let p = targetPort;
    let d = authDomain;
    let u = username;
    let pass = password;

    if (hostObj) {
      target = hostObj.ip || hostObj.name;
      p = hostObj.port || '6129';
      d = hostObj.domain || 'WORKGROUP';
      u = hostObj.user || 'Administrator';
      pass = hostObj.pass || '';

      setTargetHost(target);
      setTargetPort(p);
      setAuthDomain(d);
      setUsername(u);
      setPassword(pass);
    }

    if (!target.trim()) return;

    setIsConnected(false);
    setIsConnecting(true);
    setConnectionError(null);
    setDeployStatus(null);
    setFrameSrc(null);
    setFrameSvg(null);
    setAgentInfo(null);

    const wsUrl = `ws://localhost:3001/?host=${target}&port=${p}&domain=${encodeURIComponent(d)}&username=${encodeURIComponent(u)}&password=${encodeURIComponent(pass)}`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log(`[Console] Gateway connected for target: ${target}`);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'CONNECTION_ERROR') {
          setIsConnecting(false);
          setIsConnected(false);
          setConnectionError({ code: data.errorCode, message: data.errorMessage });
        } else if (data.type === 'DEPLOYMENT_PROGRESS') {
          setDeployStatus(data.message);
        } else if (data.type === 'HANDSHAKE_ACK') {
          setIsConnecting(false);
          setIsConnected(true);
          setAgentInfo(data);
          setDeployStatus(null);
          setConnectionError(null);
        } else if (data.type === 'SCREEN_FRAME') {
          if (data.frame) {
            setFrameSrc(`data:image/jpeg;base64,${data.frame}`);
            setFrameSvg(null);
          }
        } else if (data.type === 'SCREEN_FRAME_BLACKOUT') {
          setIsScreenBlackedOut(true);
        } else if (data.type === 'CHAT_BROADCAST') {
          setChatMessages(data.messages);
        }
      } catch (e) {}
    };

    ws.onclose = () => {
      setIsConnected(false);
      setIsConnecting(false);
    };

    ws.onerror = () => {
      setIsConnecting(false);
      setConnectionError({
        code: 'ERR_GATEWAY_OFFLINE',
        message: `Console Gateway service is unreachable on port 3001.`
      });
    };
  };

  const handleDisconnect = () => {
    if (socketRef.current) {
      socketRef.current.onclose = null;
      socketRef.current.onerror = null;
      socketRef.current.onmessage = null;
      socketRef.current.close();
      socketRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
    setAgentInfo(null);
    setFrameSrc(null);
    setFrameSvg(null);
  };

  // 1. TOOLBAR ACTION: SEND KEYS
  const sendSpecialKey = (keyName) => {
    setSendKeysOpen(false);
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'KEYBOARD_INPUT',
        key: keyName
      }));
    } else {
      alert(`[Send Keys] Tuş gönderildi: ${keyName}`);
    }
  };

  // 2. TOOLBAR ACTION: LOCK REMOTE MOUSE & KEYBOARD
  const toggleLockInput = () => {
    const nextState = !isInputLocked;
    setIsInputLocked(nextState);
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'LOCK_INPUT',
        locked: nextState
      }));
    }
  };

  // 3. TOOLBAR ACTION: BLACKOUT REMOTE SCREEN
  const toggleBlackoutScreen = () => {
    const nextState = !isScreenBlackedOut;
    setIsScreenBlackedOut(nextState);
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'BLACKOUT_SCREEN',
        blackout: nextState
      }));
    }
  };

  // 4. TOOLBAR ACTION: POWER CONTROLS
  const sendPowerAction = (actionType) => {
    if (confirm(`Uzak sunucuda [${actionType.toUpperCase()}] işlemini onaylıyor musunuz?`)) {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'POWER_ACTION',
          action: actionType
        }));
      }
      alert(`Power Action [${actionType}] komutu uzak sunucuya iletildi.`);
      setActiveModal(null);
    }
  };

  // 5. TOOLBAR ACTION: CHAT MESSAGE
  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const newMessage = {
      sender: 'Technician (You)',
      text: chatInput,
      time: new Date().toLocaleTimeString()
    };

    setChatMessages(prev => [...prev, newMessage]);

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'CHAT_MESSAGE',
        text: chatInput
      }));
    }
    setChatInput('');
  };

  // 6. TOOLBAR ACTION: KILL PROCESS IN TASK MANAGER
  const handleKillProcess = (processId) => {
    setProcesses(prev => prev.filter(p => p.Id !== processId));
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'KILL_PROCESS',
        pid: processId
      }));
    }
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

  const handleMouseDown = (e) => {
    isMousePressedRef.current = true;
    sendMouseInput('mousedown', e);
  };

  const handleMouseUp = (e) => {
    isMousePressedRef.current = false;
    sendMouseInput('mouseup', e);
  };

  const handleMouseMove = (e) => {
    if (isMousePressedRef.current) {
      sendMouseInput('move', e);
    }
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

  const handleDeleteHost = (hostId) => {
    setSavedHosts(prev => {
      return prev.map(group => ({
        ...group,
        hosts: group.hosts.filter(h => h.id !== hostId)
      }));
    });
    setActiveModal(null);
    setEditingHost(null);
  };

  const handleAddHost = (e) => {
    e.preventDefault();
    if (!newHostName.trim() || !newHostIp.trim()) return;

    const newEntry = {
      id: Date.now(),
      name: newHostName,
      ip: newHostIp,
      port: '6129',
      domain: newHostDomain || 'WORKGROUP',
      user: newHostUser || 'Administrator',
      pass: newHostPass || '',
      status: 'ONLINE',
      os: 'Windows 11 Pro'
    };

    setSavedHosts(prev => {
      const updated = [...prev];
      if (updated.length === 0) {
        updated.push({ domain: 'KAYITLI SUNUCULARIM (My Saved Hosts)', hosts: [newEntry] });
      } else {
        updated[0].hosts.unshift(newEntry);
      }
      return updated;
    });

    setNewHostName('');
    setNewHostIp('');
    setNewHostUser('Administrator');
    setNewHostPass('');
    setActiveModal(null);
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
              <Shield className="w-3 h-3 text-emerald-400" /> Full Interactive Toolbar Active
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

        {/* FULLY FUNCTIONAL TOOLBAR ACTIONS (ALL 7 BUTTONS ENABLED) */}
        <div className="flex items-center gap-1">
          
          {/* 1. SEND KEYS DROPDOWN */}
          <div className="relative">
            <button
              onClick={() => setSendKeysOpen(!sendKeysOpen)}
              className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs flex items-center gap-1.5 border border-slate-700 font-medium text-amber-400 hover:border-amber-500/50 transition"
              title="Send Keyboard Shortcuts to Remote PC"
            >
              <Key className="w-3.5 h-3.5 text-amber-400" /> Send Keys <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
            {sendKeysOpen && (
              <div className="absolute left-0 top-full mt-1 flex flex-col bg-slate-900 border border-slate-800 rounded-lg shadow-xl py-1 z-50 min-w-[180px]">
                <button onClick={() => sendSpecialKey('CAD')} className="px-3 py-2 text-xs text-left hover:bg-slate-800 text-slate-200 flex items-center gap-2">
                  <Key className="w-3.5 h-3.5 text-amber-400" /> Ctrl + Alt + Del
                </button>
                <button onClick={() => sendSpecialKey('WIN_L')} className="px-3 py-2 text-xs text-left hover:bg-slate-800 text-slate-200 flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-sky-400" /> Lock Workstation (Win+L)
                </button>
                <button onClick={() => sendSpecialKey('ALT_TAB')} className="px-3 py-2 text-xs text-left hover:bg-slate-800 text-slate-200 flex items-center gap-2">
                  <Monitor className="w-3.5 h-3.5 text-purple-400" /> Alt + Tab Switcher
                </button>
                <button onClick={() => sendSpecialKey('PRTSCN')} className="px-3 py-2 text-xs text-left hover:bg-slate-800 text-slate-200 flex items-center gap-2">
                  <Camera className="w-3.5 h-3.5 text-emerald-400" /> Print Screen
                </button>
              </div>
            )}
          </div>

          <div className="h-5 w-px bg-slate-800 mx-1"></div>

          {/* 2. LOCK REMOTE INPUT */}
          <button
            onClick={toggleLockInput}
            className={`p-1.5 rounded text-xs flex items-center gap-1 border transition ${
              isInputLocked ? 'bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-lg shadow-amber-500/10' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
            title={isInputLocked ? "Unlock Remote Input" : "Lock Remote Mouse & Keyboard"}
          >
            {isInputLocked ? <Unlock className="w-3.5 h-3.5 text-amber-400" /> : <Lock className="w-3.5 h-3.5" />}
          </button>

          {/* 3. BLACKOUT REMOTE SCREEN */}
          <button
            onClick={toggleBlackoutScreen}
            className={`p-1.5 rounded text-xs flex items-center gap-1 border transition ${
              isScreenBlackedOut ? 'bg-rose-500/20 text-rose-400 border-rose-500/50 shadow-lg shadow-rose-500/10' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
            title={isScreenBlackedOut ? "Restore Remote Display" : "Blackout Remote Screen"}
          >
            {isScreenBlackedOut ? <EyeOff className="w-3.5 h-3.5 text-rose-400" /> : <Eye className="w-3.5 h-3.5 text-slate-300" />}
          </button>

          <div className="h-5 w-px bg-slate-800 mx-1"></div>

          {/* 4. FILE TRANSFER MANAGER */}
          <button
            onClick={() => setActiveModal('files')}
            className={`p-1.5 rounded border text-xs flex items-center gap-1 transition ${
              activeModal === 'files' ? 'bg-sky-500/20 text-sky-400 border-sky-500/50' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
            title="Open Remote File Transfer Manager"
          >
            <Folder className="w-3.5 h-3.5 text-sky-400" />
          </button>

          {/* 5. IN-SESSION CHAT WINDOW */}
          <button
            onClick={() => setActiveModal('chat')}
            className={`p-1.5 rounded border text-xs flex items-center gap-1 transition ${
              activeModal === 'chat' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
            title="Open Remote User Chat Window"
          >
            <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
          </button>

          {/* 6. REMOTE TASK MANAGER */}
          <button
            onClick={() => setActiveModal('taskmgr')}
            className={`p-1.5 rounded border text-xs flex items-center gap-1 transition ${
              activeModal === 'taskmgr' ? 'bg-purple-500/20 text-purple-400 border-purple-500/50' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
            title="Open Remote Task Manager & System Info"
          >
            <Cpu className="w-3.5 h-3.5 text-purple-400" />
          </button>

          {/* 7. REMOTE POWER CONTROLS */}
          <button
            onClick={() => setActiveModal('power')}
            className={`p-1.5 rounded border text-xs flex items-center gap-1 transition ${
              activeModal === 'power' ? 'bg-rose-500/20 text-rose-400 border-rose-500/50' : 'bg-slate-800 text-rose-400 border-slate-700 hover:bg-slate-700'
            }`}
            title="Remote Power Options (Reboot / Shutdown / Logoff)"
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
                disabled={isConnecting || !targetHost.trim()}
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
              </div>
            </div>

            {savedHosts.length === 0 || savedHosts.every(g => g.hosts.length === 0) ? (
              <div className="text-center text-slate-500 text-xs py-8 border border-dashed border-slate-800 rounded p-4">
                <Server className="w-8 h-8 mx-auto text-slate-700 mb-2" />
                Henüz kayıtlı sunucunuz yok.<br />
                <button onClick={() => setActiveModal('addHost')} className="text-sky-400 hover:underline font-medium mt-1 inline-block">
                  + Yeni Sunucu Ekle
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {savedHosts.map((group, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                      <ChevronDown className="w-3 h-3" /> {group.domain}
                    </div>
                    <div className="pl-2 space-y-1 border-l border-slate-800">
                      {group.hosts.map((h, i) => (
                        <div
                          key={h.id || i}
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
            )}
          </div>

          <div className="p-2 border-t border-slate-800 bg-slate-950/60 text-[10px] text-slate-500 flex justify-between">
            <span>Toolbar Actions: Enabled</span>
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

          {/* CANVAS DISPLAY AREA */}
          <div className="flex-1 relative flex items-center justify-center overflow-auto p-2">
            {isConnected ? (
              <div
                className={`relative border border-slate-800 rounded shadow-2xl overflow-hidden cursor-crosshair ${
                  scaleMode === 'fit' ? 'max-w-full max-h-full aspect-video' : ''
                }`}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
                onContextMenu={(e) => { e.preventDefault(); sendMouseInput('click', e); }}
              >
                {frameSrc && (
                  <img src={frameSrc} alt="Remote Desktop" className="w-full h-full object-contain pointer-events-none" />
                )}

                {frameSvg && (
                  <div dangerouslySetInnerHTML={{ __html: frameSvg }} className="w-full h-full pointer-events-none" />
                )}

                {isInputLocked && (
                  <div className="absolute top-4 left-4 bg-amber-500/90 text-slate-950 px-3 py-1 rounded font-bold text-xs flex items-center gap-1.5 shadow-lg animate-pulse">
                    <Lock className="w-3.5 h-3.5" /> REMOTE MOUSE & KEYBOARD LOCKED BY ADMIN
                  </div>
                )}

                {isScreenBlackedOut && (
                  <div className="absolute inset-0 bg-black flex flex-col items-center justify-center text-rose-500 z-40">
                    <EyeOff className="w-12 h-12 mb-2 animate-pulse" />
                    <span className="font-bold text-sm uppercase tracking-widest">Remote Screen Blackout Active</span>
                    <span className="text-xs text-slate-500 mt-1">End user display is currently blanked</span>
                  </div>
                )}
              </div>
            ) : connectionError ? (
              /* REAL CONNECTION ERROR PANEL */
              <div className="flex flex-col items-center justify-center text-rose-400 p-8 text-center max-w-lg glass-panel rounded-2xl border border-rose-500/30 shadow-2xl">
                <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mb-4 text-rose-400">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <div className="text-[11px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold mb-2">
                  ERROR CODE: {connectionError.code}
                </div>
                <h3 className="text-base font-bold text-slate-100">Bağlantı Kurulamadı!</h3>
                <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                  {connectionError.message}
                </p>
                <div className="mt-4 p-3 bg-slate-950 rounded-lg border border-slate-800 text-left text-[11px] text-slate-400 space-y-1 w-full font-mono">
                  <div className="text-slate-300 font-bold mb-1">Kontrol Edilmesi Gerekenler:</div>
                  <div>1. Sanal sunucunuzda <strong className="text-sky-400">DameWare_Agent.exe</strong> çalışıyor mu?</div>
                  <div>2. Port <strong className="text-amber-400">6129</strong> Güvenlik Duvarı'nda açık mı?</div>
                  <div>3. IP adresi veya Makine Adı (<strong className="text-emerald-400">{targetHost}</strong>) doğru yazıldı mı?</div>
                </div>
                <button
                  onClick={() => handleConnect()}
                  className="mt-5 px-5 py-2 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-600/30 transition"
                >
                  <RefreshCw className="w-4 h-4" /> Yeniden Bağlanmayı Dene (Retry)
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-600 p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-slate-900/80 border border-slate-800 flex items-center justify-center mb-4">
                  <Monitor className="w-8 h-8 text-slate-600" />
                </div>
                <h3 className="text-base font-semibold text-slate-400">No Active Remote Control Session</h3>
                <p className="text-xs text-slate-500 max-w-sm mt-1">
                  Click ⚡ <strong>1-Click</strong> on any saved server or add your server above!
                </p>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* MODALS */}
      {/* 4. FILE TRANSFER MODAL */}
      {activeModal === 'files' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-[850px] h-[550px] glass-panel rounded-xl border border-slate-800 flex flex-col overflow-hidden shadow-2xl">
            <div className="h-11 px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <span className="font-bold text-sm text-slate-200 flex items-center gap-2">
                <Folder className="w-4 h-4 text-sky-400" /> DameWare Remote File Explorer - [{targetHost || 'MAKINE1'}]
              </span>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 p-4 grid grid-cols-2 gap-4 overflow-hidden">
              <div className="bg-slate-950/80 rounded border border-slate-800 flex flex-col">
                <div className="p-2 border-b border-slate-800 text-xs font-semibold text-slate-400 bg-slate-900/50 flex justify-between">
                  <span>Local Console Workstation</span><span>C:\AdminDownloads</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 text-xs space-y-1">
                  <div className="p-2 hover:bg-slate-800 rounded flex justify-between text-slate-300">
                    <span className="flex items-center gap-1.5">📄 DameWare_Agent.exe</span>
                    <span className="font-mono text-[10px] text-slate-500">1.4 MB</span>
                  </div>
                  <div className="p-2 hover:bg-slate-800 rounded flex justify-between text-slate-300">
                    <span className="flex items-center gap-1.5">📄 DeploymentScript.ps1</span>
                    <span className="font-mono text-[10px] text-slate-500">12 KB</span>
                  </div>
                </div>
                <div className="p-2 border-t border-slate-800 bg-slate-900/30 flex justify-end">
                  <button className="px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white text-xs rounded flex items-center gap-1">
                    <Upload className="w-3 h-3" /> Push File to Remote
                  </button>
                </div>
              </div>
              <div className="bg-slate-950/80 rounded border border-slate-800 flex flex-col">
                <div className="p-2 border-b border-slate-800 text-xs font-semibold text-slate-400 bg-slate-900/50 flex justify-between">
                  <span>Remote Host [{targetHost || 'MAKINE1'}]</span><span className="text-sky-400 font-mono">{remotePath}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 text-xs space-y-1">
                  {remoteFiles.map((file, i) => (
                    <div key={i} className="p-2 hover:bg-slate-800 rounded flex justify-between text-slate-300">
                      <span className="flex items-center gap-1.5">{file.isDirectory ? '📁' : '📄'} {file.name}</span>
                      <span className="font-mono text-[10px] text-slate-500">{file.isDirectory ? 'DIR' : `${(file.size/1024).toFixed(0)} KB`}</span>
                    </div>
                  ))}
                </div>
                <div className="p-2 border-t border-slate-800 bg-slate-900/30 flex justify-end">
                  <button className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded flex items-center gap-1">
                    <Download className="w-3 h-3" /> Download Selected
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. IN-SESSION CHAT MODAL */}
      {activeModal === 'chat' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-[500px] h-[450px] glass-panel rounded-xl border border-slate-800 flex flex-col overflow-hidden shadow-2xl">
            <div className="h-11 px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <span className="font-bold text-sm text-slate-200 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-400" /> DameWare Remote User Chat - [{targetHost || 'MAKINE1'}]
              </span>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 p-3 overflow-y-auto space-y-2 bg-slate-950/80">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex flex-col text-xs ${msg.sender.includes('You') ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mb-0.5">
                    <span>{msg.sender}</span> • <span>{msg.time}</span>
                  </div>
                  <div className={`px-3 py-2 rounded-xl max-w-[80%] ${
                    msg.sender.includes('You') ? 'bg-sky-600 text-white rounded-br-none' : 'bg-slate-800 text-slate-200 rounded-bl-none border border-slate-700'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={handleSendChat} className="p-3 bg-slate-900 border-t border-slate-800 flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Uzak sunucudaki kullanıcıya mesaj yazın..."
                className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded outline-none text-xs text-slate-100"
              />
              <button type="submit" className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded font-medium flex items-center gap-1">
                <Send className="w-3.5 h-3.5" /> Gönder
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 6. REMOTE TASK MANAGER MODAL */}
      {activeModal === 'taskmgr' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-[650px] h-[480px] glass-panel rounded-xl border border-slate-800 flex flex-col overflow-hidden shadow-2xl">
            <div className="h-11 px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <span className="font-bold text-sm text-slate-200 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-purple-400" /> Remote Task Manager - [{targetHost || 'MAKINE1'}]
              </span>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-3 bg-slate-950/50 border-b border-slate-800 grid grid-cols-2 gap-4 text-xs">
              <div className="p-2 bg-slate-900 rounded border border-slate-800 flex justify-between">
                <span className="text-slate-400">CPU Usage:</span>
                <span className="font-bold text-sky-400">4.2%</span>
              </div>
              <div className="p-2 bg-slate-900 rounded border border-slate-800 flex justify-between">
                <span className="text-slate-400">Memory Usage:</span>
                <span className="font-bold text-emerald-400">12.4 / 32.0 GB</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 text-xs">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                    <th className="pb-2">Process Name</th>
                    <th className="pb-2">PID</th>
                    <th className="pb-2">CPU %</th>
                    <th className="pb-2">RAM Usage</th>
                    <th className="pb-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {processes.map((proc, i) => (
                    <tr key={i} className="hover:bg-slate-800/50 text-slate-200">
                      <td className="py-2 font-medium flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-sky-400" /> {proc.ProcessName}
                      </td>
                      <td className="py-2 font-mono text-slate-400">{proc.Id}</td>
                      <td className="py-2 font-mono text-sky-400">{proc.CPU}%</td>
                      <td className="py-2 font-mono text-emerald-400">{(proc.WorkingSet64 / 1024 / 1024).toFixed(1)} MB</td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => handleKillProcess(proc.Id)}
                          className="px-2 py-0.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 rounded text-[10px]"
                        >
                          End Process
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

      {/* 7. REMOTE POWER CONTROLS MODAL */}
      {activeModal === 'power' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-[420px] glass-panel rounded-xl border border-slate-800 flex flex-col overflow-hidden shadow-2xl">
            <div className="h-11 px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <span className="font-bold text-sm text-slate-200 flex items-center gap-2">
                <Power className="w-4 h-4 text-rose-400" /> Remote Power Controls
              </span>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <p className="text-slate-400 mb-2">Select a power action to execute on remote target <strong className="text-slate-200">[{targetHost || 'MAKINE1'}]</strong>:</p>

              <button
                onClick={() => sendPowerAction('reboot')}
                className="w-full p-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg flex items-center gap-3 text-left group transition"
              >
                <RefreshCw className="w-5 h-5 text-amber-400 group-hover:rotate-180 transition duration-500" />
                <div>
                  <div className="font-bold text-amber-400">Reboot Remote PC (Yeniden Başlat)</div>
                  <div className="text-[11px] text-slate-400">Restarts the remote Windows operating system cleanly</div>
                </div>
              </button>

              <button
                onClick={() => sendPowerAction('shutdown')}
                className="w-full p-3 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg flex items-center gap-3 text-left group transition"
              >
                <Power className="w-5 h-5 text-rose-400" />
                <div>
                  <div className="font-bold text-rose-400">Shutdown Remote PC (Kapat)</div>
                  <div className="text-[11px] text-slate-400">Powers off the remote machine instantly</div>
                </div>
              </button>

              <button
                onClick={() => sendPowerAction('logoff')}
                className="w-full p-3 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 rounded-lg flex items-center gap-3 text-left group transition"
              >
                <User className="w-5 h-5 text-sky-400" />
                <div>
                  <div className="font-bold text-sky-400">Logoff User (Oturumu Kapat)</div>
                  <div className="text-[11px] text-slate-400">Logs off the active interactive Windows session</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT HOST SETTINGS MODAL */}
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
                <button
                  type="button"
                  onClick={() => handleDeleteHost(editingHost.id)}
                  className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 rounded font-medium flex items-center gap-1 text-[11px]"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete Host
                </button>
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
                    <Check className="w-3.5 h-3.5" /> Save Changes Permanently
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
          <div className="w-[500px] glass-panel rounded-xl border border-slate-800 flex flex-col overflow-hidden shadow-2xl">
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

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-slate-400 mb-1 block">Domain:</label>
                  <input
                    type="text"
                    value={newHostDomain}
                    onChange={(e) => setNewHostDomain(e.target.value)}
                    placeholder="WORKGROUP"
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded outline-none text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 mb-1 block">Admin User:</label>
                  <input
                    type="text"
                    value={newHostUser}
                    onChange={(e) => setNewHostUser(e.target.value)}
                    placeholder="Administrator"
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded outline-none text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-slate-400 mb-1 block">Password:</label>
                  <input
                    type="password"
                    value={newHostPass}
                    onChange={(e) => setNewHostPass(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded outline-none text-slate-100"
                  />
                </div>
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

      {/* AGENT DOWNLOAD MODAL */}
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
              <p className="text-slate-300">Download standalone agent executable:</p>
              <div className="flex gap-3 pt-2">
                <a
                  href="/DameWare_Agent.exe"
                  download="DameWare_Agent.exe"
                  className="flex-1 py-2 bg-sky-600 hover:bg-sky-500 text-white font-medium rounded text-xs flex items-center justify-center gap-2 decoration-none"
                >
                  <Download className="w-4 h-4" /> Download Agent Standalone (.EXE)
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
