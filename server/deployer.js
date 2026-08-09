import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const AGENT_EXE  = 'RemoteMM_Agent.exe';
const TASK_NAME  = 'RemoteMMAgent';
// BOŞLUKSUZ YOL - schtasks /tr argümanında boşluk escape sorunu yok
const REMOTE_DIR = 'C:\\RemoteMM';
const REMOTE_EXE = `${REMOTE_DIR}\\${AGENT_EXE}`;
const UNC_DIR    = host => `\\\\${host}\\C$\\RemoteMM`;

function run(cmd, timeout = 30000) {
  return new Promise(resolve =>
    exec(cmd, { timeout }, (err, stdout, stderr) =>
      resolve({ ok: !err, out: stdout || '', err: stderr || '' })
    )
  );
}

async function portOpenPs(host, port) {
  const r = await run(
    `powershell -NoProfile -Command "Test-NetConnection -ComputerName ${host} -Port ${port} -InformationLevel Quiet -WarningAction SilentlyContinue"`,
    8000
  );
  return r.out.trim().toLowerCase() === 'true';
}

// Birden fazla kullanici formatiyla SMB C$ bagla
async function smbConnect(host, username, password) {
  const pw = password ? `"${password.replace(/"/g, '')}"` : '""';
  const formats = [username, `.\\${username}`, `${host}\\${username}`];

  for (const u of formats) {
    await run(`net use \\\\${host}\\C$ /delete /y`);
    await new Promise(r => setTimeout(r, 300));
    const r = await run(`net use \\\\${host}\\C$ ${pw} /USER:${u} /y`, 12000);
    if (r.ok) return { ok: true, user: u };
  }
  return { ok: false };
}

export async function pushDeployAgent({
  targetHost, domain = 'WORKGROUP', username = 'Administrator',
  password = '', port = 6129, onProgress
}) {
  const log = msg => { console.log(`[Deployer] ${msg}`); onProgress?.(msg); };
  const src = path.join(__dirname, '..', 'public', AGENT_EXE);
  const pw  = password || '';

  // ── 1. SMB Baglantisi ──────────────────────────────────────
  log(`📡 Adım 1: SMB bağlantısı deneniyor...`);
  const smb = await smbConnect(targetHost, username, pw);
  log(smb.ok
    ? `✅ SMB bağlandı (${smb.user}) — C$ erişimi var.`
    : `⚠️ C$ erişimi yok — mevcut EXE kullanılmaya çalışılacak.`
  );

  // ── 2. Eski gorevi sil ─────────────────────────────────────
  log(`🛑 Adım 2: Eski görev siliniyor...`);
  await run(`schtasks /delete /s ${targetHost} /u "${username}" /p "${pw}" /tn "${TASK_NAME}" /f`, 15000);
  await new Promise(r => setTimeout(r, 800));

  // ── 3. EXE kopyala (sadece C$ bagliysa) ───────────────────
  if (smb.ok) {
    log(`📋 Adım 3: Agent kopyalanıyor → ${REMOTE_EXE}`);
    const unc = UNC_DIR(targetHost);
    await run(`powershell -NoProfile -ExecutionPolicy Bypass -Command "New-Item -ItemType Directory -Force -Path '${unc}' | Out-Null"`);
    const cp = await run(`powershell -NoProfile -ExecutionPolicy Bypass -Command "Copy-Item -Path '${src.replace(/'/g, "''")}' -Destination '${unc}\\${AGENT_EXE}' -Force"`, 20000);
    log(cp.ok ? `✅ Agent kopyalandı.` : `⚠️ Kopya: ${cp.err.split('\n')[0].trim()}`);
  } else {
    log(`ℹ️ Adım 3: SMB başarısız. HTTP üzerinden agent indirme komutu gönderiliyor...`);
    let localIp = '127.0.0.1';
    for (const iface of Object.values(os.networkInterfaces())) {
      for (const alias of iface) {
        if (alias.family === 'IPv4' && !alias.internal) { localIp = alias.address; break; }
      }
    }
    const dlUrl = `http://${localIp}:3001/${AGENT_EXE}`;
    const dlCmd = `powershell -WindowStyle Hidden -Command "New-Item C:\\RemoteMM -ItemType Directory -Force | Out-Null; Stop-Process -Name RemoteMM_Agent -Force -ErrorAction SilentlyContinue; Invoke-WebRequest '${dlUrl}' -OutFile '${REMOTE_EXE}' -UseBasicParsing"`;
    
    log(`📥 İndirme görevi oluşturuluyor...`);
    await run(`schtasks /create /s ${targetHost} /u "${username}" /p "${pw}" /tn "RemoteMM_Downloader" /tr "${dlCmd.replace(/"/g, '\\"')}" /sc ONSTART /ru "SYSTEM" /rl HIGHEST /f`, 15000);
    log(`🚀 İndirme görevi çalıştırılıyor...`);
    await run(`schtasks /run /s ${targetHost} /u "${username}" /p "${pw}" /tn "RemoteMM_Downloader"`, 10000);
    await new Promise(r => setTimeout(r, 6000)); // Wait for download to finish
    await run(`schtasks /delete /s ${targetHost} /u "${username}" /p "${pw}" /tn "RemoteMM_Downloader" /f`, 10000);
  }

  // ── 4. Gorev Olustur (schtasks - kullanici oturumu) ────────
  log(`⚙️ Adım 4: Görev oluşturuluyor...`);
  const trCmd = `${REMOTE_EXE}`;

  const create = await run(
    `schtasks /create /s ${targetHost} /u "${username}" /p "${pw}" /tn "${TASK_NAME}" /tr "${trCmd}" /sc ONSTART /ru "SYSTEM" /rl HIGHEST /f`,
    20000
  );
  log(create.ok
    ? `✅ Görev oluşturuldu.`
    : `⚠️ Görev: ${(create.out || create.err).trim().split('\n').find(l => l.trim()) || 'Bilinmeyen hata'}`
  );

  // ── 5. Gorevi Hemen Calistir ───────────────────────────────
  log(`🚀 Adım 5: Görev çalıştırılıyor...`);
  const runCmd = await run(
    `schtasks /run /s ${targetHost} /u "${username}" /p "${pw}" /tn "${TASK_NAME}"`,
    15000
  );
  log(runCmd.ok
    ? `✅ Görev başlatıldı!`
    : `⚠️ Çalıştırma: ${(runCmd.out || runCmd.err).trim().split('\n')[0]}`
  );

  // ── 6. Port Dogrula ────────────────────────────────────────
  log(`🔍 Adım 6: Port ${port} bekleniyor...`);
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 3000));
    if (await portOpenPs(targetHost, port)) {
      log(`✅ Port ${port} açık — agent hazır!`);
      return { success: true };
    }
    log(`⏳ Başlatılıyor... (${i + 1}/12)`);
  }

  log(`❌ Port açılmadı. Uzak makinede "${REMOTE_EXE} --server" komutunu elle çalıştırın.`);
  return { success: false };
}
