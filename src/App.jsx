import React, { useState, useEffect, useRef } from 'react';
import {
  Monitor, Shield, Terminal, Folder, MessageSquare, Cpu, Power,
  Lock, Eye, Camera, Disc, RefreshCw, Server, Wifi, Play, Search,
  Settings, ChevronRight, ChevronDown, Key, Download, Upload, Trash2,
  X, Check, AlertTriangle, Send, Activity, User, HardDrive, Plus, Zap, Edit3, AlertCircle, Unlock, EyeOff, Copy
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
  const [setupCommand, setSetupCommand] = useState('');

  // Mouse Holding / Dragging state
  const isMousePressedRef = useRef(false);
  const canvasRef = useRef(null);

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
          { id: 'host-1', name: 'makine1 (172.26.10.109)', ip: '172.26.10.109', port: '6129', domain: 'WORKGROUP', user: 'makina1', pass: '', status: 'ONLINE', os: 'Windows 10 Pro' }
        ]
      }
    ];
  });


  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(savedHosts));
    } catch (e) {}
  }, [savedHosts]);

  useEffect(() => {
    // Fetch the dynamic setup command from the backend on load
    fetch('http://localhost:3001/api/setup-command')
      .then(res => res.json())
      .then(data => {
        if (data && data.cmd) {
          setSetupCommand(data.cmd);
        }
      })
      .catch(err => console.error('Failed to fetch setup command:', err));
  }, []);

  // Form States
  const [editingHost, setEditingHost] = useState(null);
  const [newHostName, setNewHostName] = useState('');
  const [newHostIp, setNewHostIp] = useState('');
  const [newHostUser, setNewHostUser] = useState('Administrator');
  const [newHostPass, setNewHostPass] = useState('');
  const [newHostDomain, setNewHostDomain] = useState('WORKGROUP');

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
    { name: 'DameWare_Agent.exe', isDirectory: false, size: 1450200, modified: '2026-08-06' }
  ]);

  // Processes State
  const [processes, setProcesses] = useState([
    { Id: 1024, ProcessName: 'DameWare_Agent.exe', CPU: '1.2', WorkingSet64: 34500000 },
    { Id: 408, ProcessName: 'svchost.exe', CPU: '0.4', WorkingSet64: 82100000 },
    { Id: 2190, ProcessName: 'explorer.exe', CPU: '2.8', WorkingSet64: 114200000 },
    { Id: 3400, ProcessName: 'taskmgr.exe', CPU: '0.9', WorkingSet64: 28900000 }
  ]);

  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectCountRef = useRef(0);
  const lastHostRef = useRef(null);

  const isCancelledRef = useRef(false);

  // SINGLE ACTIVE CONNECTION ENFORCER
  const handleConnect = (hostObj = null) => {
    isCancelledRef.current = false;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
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

    // Reconnect tracking
    reconnectCountRef.current = 0;
    lastHostRef.current = hostObj || { ip: target, port: p, domain: d, user: u, pass };

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
          setTimeout(() => { if (canvasRef.current) canvasRef.current.focus(); }, 300);
        } else if (data.type === 'SCREEN_FRAME') {
          setIsConnecting(false);
          setIsConnected(true);
          setDeployStatus(null);
          setConnectionError(null);
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
      // Otomatik yeniden bağlanma — 5 deneme, 4 saniye aralık
      if (reconnectCountRef.current < 5 && lastHostRef.current && !isCancelledRef.current) {
        reconnectCountRef.current++;
        reconnectTimerRef.current = setTimeout(() => {
          handleConnect(lastHostRef.current);
        }, 4000);
      }
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
    isCancelledRef.current = true;
    reconnectCountRef.current = 0;
    lastHostRef.current = null;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
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

  const handleKeyDown = (e) => {
    if (!isConnected || isViewOnly) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    let keyToSend = e.key;

    if (e.key === 'Enter') keyToSend = '{ENTER}';
    else if (e.key === 'Backspace') keyToSend = '{BACKSPACE}';
    else if (e.key === 'Tab') { keyToSend = '{TAB}'; e.preventDefault(); }
    else if (e.key === 'Escape') keyToSend = '{ESC}';
    else if (e.key === 'Delete') keyToSend = '{DELETE}';
    else if (e.key === 'ArrowUp') keyToSend = '{UP}';
    else if (e.key === 'ArrowDown') keyToSend = '{DOWN}';
    else if (e.key === 'ArrowLeft') keyToSend = '{LEFT}';
    else if (e.key === 'ArrowRight') keyToSend = '{RIGHT}';
    else if (e.key === 'Space' || e.key === ' ') keyToSend = ' ';
    else if (e.key.length > 1) return;

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'KEYBOARD_INPUT',
        key: keyToSend
      }));
    }
  };

  const sendSpecialKey = (keyName) => {
    setSendKeysOpen(false);
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
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'LOCK_INPUT',
        locked: nextState
      }));
    }
  };

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

  const sendPowerAction = (actionType) => {
    if (confirm(`Uzak sunucuda [${actionType.toUpperCase()}] işlemini onaylıyor musunuz?`)) {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'POWER_ACTION',
          action: actionType
        }));
      }
      setActiveModal(null);
    }
  };

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

  const handleKillProcess = (processId) => {
    setProcesses(prev => prev.filter(p => p.Id !== processId));
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'KILL_PROCESS',
        pid: processId
      }));
    }
  };

  const sendMouseInput = (action, e, extra = {}) => {
    if (!isConnected || isViewOnly) return;
    
    const container = e.currentTarget || e.target?.closest('[data-remote-canvas]');
    if (!container) return;
    const imgEl = container.querySelector('img');

    const containerRect = container.getBoundingClientRect();
    let xPercent, yPercent;

    // Gerçek uzak ekran boyutlarını HANDSHAKE_ACK'tan al
    const remoteW = agentInfo?.screenWidth || 1920;
    const remoteH = agentInfo?.screenHeight || 1080;
    const naturalAspect = remoteW / remoteH;

    if (scaleMode === 'fit') {
      const containerWidth  = containerRect.width;
      const containerHeight = containerRect.height;
      const containerAspect = containerWidth / containerHeight;

      let renderedWidth, renderedHeight, leftOffset, topOffset;
      if (containerAspect > naturalAspect) {
        renderedHeight = containerHeight;
        renderedWidth  = containerHeight * naturalAspect;
        leftOffset = containerRect.left + (containerWidth - renderedWidth) / 2;
        topOffset  = containerRect.top;
      } else {
        renderedWidth  = containerWidth;
        renderedHeight = containerWidth / naturalAspect;
        leftOffset = containerRect.left;
        topOffset  = containerRect.top + (containerHeight - renderedHeight) / 2;
      }
      xPercent = (e.clientX - leftOffset) / renderedWidth;
      yPercent = (e.clientY - topOffset)  / renderedHeight;
    } else if (scaleMode === '100%') {
      const imgRect = imgEl ? imgEl.getBoundingClientRect() : containerRect;
      xPercent = (e.clientX - imgRect.left) / imgRect.width;
      yPercent = (e.clientY - imgRect.top)  / imgRect.height;
    } else {
      // stretch
      xPercent = (e.clientX - containerRect.left) / containerRect.width;
      yPercent = (e.clientY - containerRect.top)  / containerRect.height;
    }

    xPercent = Math.max(0, Math.min(1, xPercent));
    yPercent = Math.max(0, Math.min(1, yPercent));

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'MOUSE_INPUT',
        action,
        button: e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left',
        xPercent,
        yPercent,
        ...extra
      }));
    }
  };

  const sendScrollInput = (e) => {
    if (!isConnected || isViewOnly) return;
    const delta = e.deltaY > 0 ? -1 : 1;
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'MOUSE_INPUT', action: 'scroll', delta }));
    }
  };

  const handleMouseDown = (e) => {
    isMousePressedRef.current = true;
    if (canvasRef.current) canvasRef.current.focus();
    sendMouseInput('mousedown', e);
  };

  const handleMouseUp = (e) => {
    isMousePressedRef.current = false;
    sendMouseInput('mouseup', e);
  };

  const handleMouseMove = (e) => {
    sendMouseInput('move', e);
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
      id: `host-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
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
              <Shield className="w-3 h-3 text-emerald-400" /> Full HD Remote Canvas Stream
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
        <div className="flex items-center gap-1.5">
          
          {/* DEDICATED UAC APPROVE BUTTON */}
          <button
            onClick={() => sendSpecialKey('UAC_YES')}
            className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-600/30 transition animate-pulse"
            title="Approve UAC Prompt (Presses 'Evet' / 'Yes')"
          >
            <Check className="w-4 h-4 stroke-[3]" /> Approve UAC (Evet)
          </button>

          <div className="relative">
            <button
              onClick={() => setSendKeysOpen(!sendKeysOpen)}
              className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs flex items-center gap-1.5 border border-slate-700 font-medium text-amber-400 hover:border-amber-500/50 transition"
              title="Send Keyboard Shortcuts"
            >
              <Key className="w-3.5 h-3.5 text-amber-400" /> Send Keys <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
            {sendKeysOpen && (
              <div className="absolute left-0 top-full mt-1 flex flex-col bg-slate-900 border border-slate-800 rounded-lg shadow-xl py-1 z-50 min-w-[240px]">
                {/* UAC */}
                <div className="px-3 py-1 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">UAC Onay</div>
                <button onClick={() => sendSpecialKey('UAC_YES')} className="px-3 py-2 text-xs text-left hover:bg-slate-800 text-emerald-400 font-bold flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Approve UAC — Evet / Yes (Enter)
                </button>
                <button onClick={() => sendSpecialKey('UAC_NO')} className="px-3 py-2 text-xs text-left hover:bg-slate-800 text-rose-400 font-bold flex items-center gap-2">
                  <X className="w-4 h-4 text-rose-400" /> Decline UAC — Hayır / No (Esc)
                </button>
                <div className="h-px bg-slate-800 my-1"></div>
                {/* Sistem Tuşları */}
                <div className="px-3 py-1 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Sistem Tuşları</div>
                <button onClick={() => sendSpecialKey('TASK_MGR')} className="px-3 py-2 text-xs text-left hover:bg-slate-800 text-slate-200 flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5 text-purple-400" /> Görev Yöneticisi (Ctrl+Shift+Esc)
                </button>
                <button onClick={() => sendSpecialKey('WIN_KEY')} className="px-3 py-2 text-xs text-left hover:bg-slate-800 text-slate-200 flex items-center gap-2">
                  <Monitor className="w-3.5 h-3.5 text-sky-400" /> Başlat Menüsü (Win)
                </button>
                <button onClick={() => sendSpecialKey('CAD')} className="px-3 py-2 text-xs text-left hover:bg-slate-800 text-slate-200 flex items-center gap-2">
                  <Key className="w-3.5 h-3.5 text-amber-400" /> Ctrl + Alt + Del
                </button>
                <button onClick={() => sendSpecialKey('WIN_L')} className="px-3 py-2 text-xs text-left hover:bg-slate-800 text-slate-200 flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-sky-400" /> Ekranı Kilitle (Win+L)
                </button>
                <button onClick={() => sendSpecialKey('ESC')} className="px-3 py-2 text-xs text-left hover:bg-slate-800 text-slate-200 flex items-center gap-2">
                  <X className="w-3.5 h-3.5 text-slate-400" /> Escape Tuşu
                </button>
                <button onClick={() => sendSpecialKey('ALT_F4')} className="px-3 py-2 text-xs text-left hover:bg-slate-800 text-slate-200 flex items-center gap-2">
                  <X className="w-3.5 h-3.5 text-rose-400" /> Pencereyi Kapat (Alt+F4)
                </button>
                <button onClick={() => sendSpecialKey('WIN_TAB')} className="px-3 py-2 text-xs text-left hover:bg-slate-800 text-slate-200 flex items-center gap-2">
                  <Monitor className="w-3.5 h-3.5 text-purple-400" /> Task Switcher (Win+Tab)
                </button>
                <button onClick={() => sendSpecialKey('ALT_TAB')} className="px-3 py-2 text-xs text-left hover:bg-slate-800 text-slate-200 flex items-center gap-2">
                  <Monitor className="w-3.5 h-3.5 text-slate-400" /> Alt + Tab
                </button>
                <button onClick={() => sendSpecialKey('PRTSCN')} className="px-3 py-2 text-xs text-left hover:bg-slate-800 text-slate-200 flex items-center gap-2">
                  <Camera className="w-3.5 h-3.5 text-emerald-400" /> Print Screen
                </button>
                <div className="h-px bg-slate-800 my-1"></div>
                {/* Güç / Oturum */}
                <div className="px-3 py-1 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Oturum &amp; Güç</div>
                <button onClick={() => sendPowerAction('logoff')} className="px-3 py-2 text-xs text-left hover:bg-slate-800 text-amber-400 flex items-center gap-2">
                  <Power className="w-3.5 h-3.5 text-amber-400" /> Oturumu Kapat (Logoff)
                </button>
                <button onClick={() => sendPowerAction('reboot')} className="px-3 py-2 text-xs text-left hover:bg-slate-800 text-orange-400 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 text-orange-400" /> Yeniden Başlat (Reboot)
                </button>
                <button onClick={() => sendPowerAction('shutdown')} className="px-3 py-2 text-xs text-left hover:bg-slate-800 text-rose-400 flex items-center gap-2">
                  <Power className="w-3.5 h-3.5 text-rose-400" /> Kapat (Shutdown)
                </button>
              </div>
            )}
          </div>

          <div className="h-5 w-px bg-slate-800 mx-1"></div>

          <button
            onClick={toggleLockInput}
            className={`p-1.5 rounded text-xs flex items-center gap-1 border transition ${
              isInputLocked ? 'bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-lg shadow-amber-500/10' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
            title={isInputLocked ? "Unlock Remote Physical Mouse/Keyboard" : "Lock Remote Physical Mouse/Keyboard"}
          >
            {isInputLocked ? <Unlock className="w-3.5 h-3.5 text-amber-400" /> : <Lock className="w-3.5 h-3.5" />}
          </button>

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

          <button
            onClick={() => setActiveModal('files')}
            className={`p-1.5 rounded border text-xs flex items-center gap-1 transition ${
              activeModal === 'files' ? 'bg-sky-500/20 text-sky-400 border-sky-500/50' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
            title="Open Remote File Transfer Manager"
          >
            <Folder className="w-3.5 h-3.5 text-sky-400" />
          </button>

          <button
            onClick={() => setActiveModal('chat')}
            className={`p-1.5 rounded border text-xs flex items-center gap-1 transition ${
              activeModal === 'chat' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
            title="Open Remote User Chat Window"
          >
            <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
          </button>

          <button
            onClick={() => setActiveModal('taskmgr')}
            className={`p-1.5 rounded border text-xs flex items-center gap-1 transition ${
              activeModal === 'taskmgr' ? 'bg-purple-500/20 text-purple-400 border-purple-500/50' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
            title="Open Remote Task Manager & System Info"
          >
            <Cpu className="w-3.5 h-3.5 text-purple-400" />
          </button>

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

          {/* ELECTRON NATIVE TITLEBAR WINDOW CONTROLS */}
          {typeof window !== 'undefined' && window.electronAPI && (
            <div className="flex items-center gap-1 ml-2 pl-2 border-l border-slate-800">
              <button
                onClick={() => window.electronAPI.minimizeWindow()}
                className="w-7 h-7 rounded hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-xs transition"
                title="Minimize Window"
              >
                ─
              </button>
              <button
                onClick={() => window.electronAPI.maximizeWindow()}
                className="w-7 h-7 rounded hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-xs transition"
                title="Maximize Window"
              >
                ▢
              </button>
              <button
                onClick={() => window.electronAPI.closeWindow()}
                className="w-7 h-7 rounded hover:bg-rose-600 text-slate-400 hover:text-white flex items-center justify-center text-xs transition"
                title="Close Window"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </header>

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
                  <div key={`group-${idx}`} className="space-y-1">
                    <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                      <ChevronDown className="w-3 h-3" /> {group.domain}
                    </div>
                    <div className="pl-2 space-y-1 border-l border-slate-800">
                      {group.hosts.map((h, i) => (
                        <div
                          key={`host-item-${h.id || h.ip || 'index'}-${i}`}
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
            <span>Winlogon Capture: Enabled</span>
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

          {/* CANVAS DISPLAY AREA (FULL SIZE HD VIEWPORT) */}
          <div className="flex-1 relative flex items-center justify-center overflow-hidden p-2">
            {isConnected ? (
              <div
                ref={canvasRef}
                tabIndex={0}
                data-remote-canvas="true"
                className="relative w-full h-full border border-slate-800/80 rounded-lg shadow-2xl overflow-hidden cursor-crosshair outline-none focus:border-sky-500 flex items-center justify-center bg-black"
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
                onWheel={(e) => { e.preventDefault(); sendScrollInput(e); }}
                onKeyDown={handleKeyDown}
                onContextMenu={(e) => { e.preventDefault(); sendMouseInput('click', e); }}
              >
                {frameSrc ? (
                  <img
                    src={frameSrc}
                    alt="Remote Desktop"
                    className={`w-full h-full pointer-events-none ${
                      scaleMode === 'fit'
                        ? 'object-contain'
                        : scaleMode === 'stretch'
                        ? 'object-fill'
                        : 'object-none'
                    }`}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-500 gap-2">
                    <RefreshCw className="w-8 h-8 animate-spin text-sky-400" />
                    <span className="text-xs">Receiving High Definition Stream...</span>
                  </div>
                )}

                {isInputLocked && (
                  <div className="absolute top-4 left-4 bg-amber-500/90 text-slate-950 px-3 py-1 rounded font-bold text-xs flex items-center gap-1.5 shadow-lg animate-pulse z-30">
                    <Lock className="w-3.5 h-3.5" /> REMOTE PHYSICAL INPUT BLOCKED (ADMIN CONTROL ACTIVE)
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
      {activeModal === 'agentInstall' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-[500px] glass-panel rounded-xl border border-slate-800 flex flex-col overflow-hidden shadow-2xl">
            <div className="h-11 px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <span className="font-bold text-sm text-slate-200 flex items-center gap-2">
                <Download className="w-4 h-4 text-sky-400" /> DameWare Agent Package
              </span>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <p className="text-slate-300">Bu bilgisayar veya sunucu bir Domain'e (Active Directory) bağlı değilse (Workgroup ağındaysa), Otomatik Kurulum başarısız olabilir. Yeni makineyi RemoteMM'e bağlamak için aşağıdaki tek satırlık kodu hedef makinede <strong>PowerShell (Yönetici)</strong> üzerinden çalıştırın:</p>
              
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-sky-500/20 to-emerald-500/20 rounded-lg blur opacity-50 group-hover:opacity-100 transition duration-1000"></div>
                <div className="relative bg-slate-950 border border-slate-800 rounded-lg p-4">
                  <pre className="font-mono text-[10px] text-sky-300 whitespace-pre-wrap break-all select-all selection:bg-sky-900 overflow-y-auto max-h-40 scrollbar-thin">
                    {setupCommand || "Yükleniyor..."}
                  </pre>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-800/50 mt-4">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(setupCommand);
                    alert('Kurulum kodu kopyalandı! Sıfır makinede Yönetici PowerShell penceresine sağ tıklayıp yapıştırın.');
                  }}
                  disabled={!setupCommand}
                  className="flex-1 py-2.5 bg-emerald-600/20 border border-emerald-500/30 hover:bg-emerald-600/30 text-emerald-400 font-medium rounded text-xs flex items-center justify-center gap-2 transition disabled:opacity-50"
                >
                  <Copy className="w-4 h-4" /> Kodu Kopyala
                </button>
                <a
                  href="/RemoteMM_Agent.exe"
                  download="RemoteMM_Agent.exe"
                  className="flex-1 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-medium rounded text-xs flex items-center justify-center gap-2 decoration-none shadow-lg shadow-sky-600/20"
                >
                  <Download className="w-4 h-4" /> Çevrimdışı İndir (.EXE)
                </a>
              </div>
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

    </div>
  );
}
