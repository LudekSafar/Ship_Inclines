// !!! ZDE VLOŽTE URL Z GOOGLE SCRIPTU !!!
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwI-H0V8vGSEJKMPXaDNvgpx5XyXvL-Ik-t2y3TatSJNb5eHrUnNoqA83-KN5jTHqft/exec"; 

// ZMĚNA: Odesíláme každou 1 minutu (60000 ms)
const UPLOAD_INTERVAL_MS = 60000; 

let logging = false;
let rawBuffer = []; 
let maxBuffer = []; 

let measureInterval = null;
let uploadInterval = null;
let wakeLock = null;

let sessionMaxFilename = "";
let minuteTicks = 0; 
let live = { ax:0, ay:0, az:0, g:0, beta:0, gamma:0 };

// Statistiky pro minutu
let minuteStats = {
    maxG: 0,
    minBeta: 1000, maxBeta: -1000,
    minGamma: 1000, maxGamma: -1000
};

// --- INIT ---
checkBackendVersion();

function checkBackendVersion() {
  const statusEl = document.getElementById('backend-version');
  if(statusEl) statusEl.innerHTML = "Ověřuji verzi...";
  
  if (SCRIPT_URL.indexOf("script.google.com") === -1) return;

  fetch(SCRIPT_URL).then(r => r.text()).then(t => {
       if(statusEl) statusEl.innerHTML = "Backend: <strong style='color:#0f0'>" + t + "</strong>";
  }).catch(e => console.log(e));
}

async function requestWakeLock() {
  if ('wakeLock' in navigator) {
      try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
  }
}
document.addEventListener('visibilitychange', async () => {
  if (wakeLock !== null && document.visibilityState === 'visible' && logging) await requestWakeLock();
});

function askPerm() {
  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    DeviceMotionEvent.requestPermission().then(r => { if (r === 'granted') { runSensors(); uiReady(); }});
  } else { runSensors(); uiReady(); }
}
function uiReady() {
    document.getElementById('btnPerm').style.display = 'none';
    document.getElementById('btnStart').style.display = 'block';
}

function runSensors() {
  window.addEventListener('devicemotion', e => {
     let x = e.accelerationIncludingGravity.x || 0;
     let y = e.accelerationIncludingGravity.y || 0;
     let z = e.accelerationIncludingGravity.z || 0;
     live.ax = x; live.ay = y; live.az = z;
     live.g = Math.sqrt(x*x + y*y + z*z) / 9.81;
     document.getElementById('gVal').innerText = live.g.toFixed(2);
  });
  window.addEventListener('deviceorientation', e => {
     live.beta = e.beta || 0;
     live.gamma = e.gamma || 0;
     
     // ZMĚNA: Zobrazení na displeji na 2 desetinná místa
     document.getElementById('betaVal').innerText = live.beta.toFixed(2);
     document.getElementById('gammaVal').innerText = live.gamma.toFixed(2);
  });
}

// --- POMOCNÁ FUNKCE PRO ČAS ---
function getActualTime() {
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`;
}

// --- LOGIKA MĚŘENÍ ---
function start() {
  if (SCRIPT_URL.length < 10) { alert("Chybí URL!"); return; }
  
  requestWakeLock();
  rawBuffer = [];
  maxBuffer = [];
  logging = true;
  minuteTicks = 0;
  resetMinuteStats();

  // Název souboru pro maxima
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  const ts = `${now.getFullYear()}_${pad(now.getMonth()+1)}_${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  sessionMaxFilename = `Lod_Log_Max_${ts}.csv`;

  document.getElementById('btnStart').style.display = 'none';
  document.getElementById('btnStop').style.display = 'block';
  document.getElementById('status').innerText = "Měřím... (Log: " + sessionMaxFilename + ")";

  measureInterval = setInterval(() => {
      if(logging) {
          const timeStr = getActualTime();
          
          // 1. RAW DATA
          const rawLine = `${timeStr};${live.ax.toFixed(3)};${live.ay.toFixed(3)};${live.az.toFixed(3)};${live.g.toFixed(3)};${live.beta.toFixed(2)};${live.gamma.toFixed(2)}\n`;
          rawBuffer.push(rawLine);

          // 2. AKTUALIZACE MAXIM
          updateStats(live);

          // 3. MINUTA
          minuteTicks++;
          if (minuteTicks >= 600) { 
              saveMinuteStats(getActualTime());
              minuteTicks = 0;
              resetMinuteStats();
          }

          if (rawBuffer.length % 10 === 0) {
              document.getElementById('bufSize').innerText = rawBuffer.length;
              document.getElementById('maxBufSize').innerText = maxBuffer.length;
              // Zobrazit aktuální maxima na displeji
              document.getElementById('gMaxVal').innerText = 
                  `B: ${minuteStats.minBeta.toFixed(0)}/${minuteStats.maxBeta.toFixed(0)}`;
          }
      }
  }, 100);

  uploadInterval = setInterval(tryUploadData, UPLOAD_INTERVAL_MS);
}

function updateStats(vals) {
    if (vals.g > minuteStats.maxG) minuteStats.maxG = vals.g;
    if (vals.beta < minuteStats.minBeta) minuteStats.minBeta = vals.beta;
    if (vals.beta > minuteStats.maxBeta) minuteStats.maxBeta = vals.beta;
    if (vals.gamma < minuteStats.minGamma) minuteStats.minGamma = vals.gamma;
    if (vals.gamma > minuteStats.maxGamma) minuteStats.maxGamma = vals.gamma;
}

function resetMinuteStats() {
    minuteStats = {
        maxG: 0,
        minBeta: 1000,  maxBeta: -1000,
        minGamma: 1000, maxGamma: -1000
    };
}

function saveMinuteStats(timeStr) {
    const maxLine = `${timeStr};${minuteStats.maxG.toFixed(3)};${minuteStats.minBeta.toFixed(2)};${minuteStats.maxBeta.toFixed(2)};${minuteStats.minGamma.toFixed(2)};${minuteStats.maxGamma.toFixed(2)}\n`;
    maxBuffer.push(maxLine);
}

function stop() {
  logging = false;
  clearInterval(measureInterval);
  clearInterval(uploadInterval);
  if (wakeLock) wakeLock.release();
  
  if (minuteTicks > 10) {
      saveMinuteStats(getActualTime());
  }

  tryUploadData();

  document.getElementById('btnStart').style.display = 'block';
  document.getElementById('btnStop').style.display = 'none';
  document.getElementById('status').innerText = "Zastaveno.";
}

function tryUploadData() {
  if (rawBuffer.length === 0 && maxBuffer.length === 0) return;
  if (!navigator.onLine) {
       document.getElementById('status').innerText = "OFFLINE. Data čekají.";
       return;
  }

  const rawToSend = [...rawBuffer];
  const maxToSend = [...maxBuffer];
  
  const payload = {
      rawCsv: rawToSend.join(""),
      maxCsv: maxToSend.join(""),
      maxFilename: sessionMaxFilename 
  };

  document.getElementById('status').innerText = `Odesílám...`;

  fetch(SCRIPT_URL, {
    method: 'POST',
    mode: 'no-cors', 
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(() => {
    rawBuffer = rawBuffer.slice(rawToSend.length);
    maxBuffer = maxBuffer.slice(maxToSend.length);
    document.getElementById('bufSize').innerText = rawBuffer.length;
    document.getElementById('maxBufSize').innerText = maxBuffer.length;
    document.getElementById('status').innerText = "Data OK.";
  }).catch(err => {
    document.getElementById('status').innerText = "Chyba sítě!";
  });
}