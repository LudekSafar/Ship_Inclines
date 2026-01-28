// !!! ZDE VLOŽTE URL Z GOOGLE SCRIPTU !!!
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzYxb3CcbPawXuq1Q6UgIGDeCio3a2cw2TO7oiVZZGi_00sMvUekb1daRwkrEKKro7K/exec"; 

// KONFIGURACE
const UPLOAD_INTERVAL_MS = 300000; // 5 minut

let logging = false;

// Buffery dat
let rawBuffer = []; // Data každých 100ms
let maxBuffer = []; // Data každou minutu (maxima)

let measureInterval = null;
let uploadInterval = null;
let wakeLock = null;

// Proměnné pro MAX logiku
let sessionMaxFilename = "";
let minuteTicks = 0; // Počítadlo pro 1 minutu
let currentMinuteMax = { ax: 0, ay: 0, az: 0, g: 0, beta: 0, gamma: 0 };
let live = { ax:0, ay:0, az:0, g:0, beta:0, gamma:0 };

// --- 1. WAKE LOCK ---
async function requestWakeLock() {
  if ('wakeLock' in navigator) {
      try { wakeLock = await navigator.wakeLock.request('screen'); } 
      catch (e) { console.error(e); }
  }
}
document.addEventListener('visibilitychange', async () => {
  if (wakeLock !== null && document.visibilityState === 'visible' && logging) {
      await requestWakeLock();
  }
});

// --- 2. PERMISSIONS ---
function askPerm() {
  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    DeviceMotionEvent.requestPermission().then(r => {
       if (r === 'granted') { runSensors(); uiReady(); }
    });
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
     document.getElementById('betaVal').innerText = live.beta.toFixed(0);
     document.getElementById('gammaVal').innerText = live.gamma.toFixed(0);
  });
}

// --- 3. LOGIKA MĚŘENÍ A MAXIM ---
function start() {
  if (SCRIPT_URL === "MOJE_URL") { alert("Chyba: Nevložili jste URL skriptu!"); return; }
  
  requestWakeLock();
  rawBuffer = [];
  maxBuffer = [];
  logging = true;
  minuteTicks = 0;
  resetMinuteMax(); 

  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  const ts = `${now.getFullYear()}_${pad(now.getMonth()+1)}_${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  sessionMaxFilename = `Lod_Log_Max_${ts}.csv`;

  document.getElementById('btnStart').style.display = 'none';
  document.getElementById('btnStop').style.display = 'block';
  document.getElementById('status').innerText = "Měřím... (Max log: " + sessionMaxFilename + ")";

  let startTime = Date.now();

  measureInterval = setInterval(() => {
      if(logging) {
          let timeMs = Date.now() - startTime;
          
          const rawLine = `${timeMs};${live.ax.toFixed(3)};${live.ay.toFixed(3)};${live.az.toFixed(3)};${live.g.toFixed(3)};${live.beta.toFixed(2)};${live.gamma.toFixed(2)}\n`;
          rawBuffer.push(rawLine);

          updateMax(live);

          minuteTicks++;
          if (minuteTicks >= 600) {
              saveMinuteMax(timeMs);
              minuteTicks = 0;
              resetMinuteMax();
          }

          if (rawBuffer.length % 10 === 0) {
              document.getElementById('bufSize').innerText = rawBuffer.length;
              document.getElementById('maxBufSize').innerText = maxBuffer.length;
              document.getElementById('gMaxVal').innerText = currentMinuteMax.g.toFixed(2);
          }
      }
  }, 100);

  uploadInterval = setInterval(tryUploadData, UPLOAD_INTERVAL_MS);
}

function updateMax(vals) {
    if (Math.abs(vals.ax) > Math.abs(currentMinuteMax.ax)) currentMinuteMax.ax = vals.ax;
    if (Math.abs(vals.ay) > Math.abs(currentMinuteMax.ay)) currentMinuteMax.ay = vals.ay;
    if (Math.abs(vals.az) > Math.abs(currentMinuteMax.az)) currentMinuteMax.az = vals.az;
    if (Math.abs(vals.g) > Math.abs(currentMinuteMax.g))   currentMinuteMax.g = vals.g;
    if (Math.abs(vals.beta) > Math.abs(currentMinuteMax.beta)) currentMinuteMax.beta = vals.beta;
    if (Math.abs(vals.gamma) > Math.abs(currentMinuteMax.gamma)) currentMinuteMax.gamma = vals.gamma;
}

function resetMinuteMax() {
    currentMinuteMax = { ax:0, ay:0, az:0, g:0, beta:0, gamma:0 };
}

function saveMinuteMax(timeMs) {
    const maxLine = `${timeMs};${currentMinuteMax.ax.toFixed(3)};${currentMinuteMax.ay.toFixed(3)};${currentMinuteMax.az.toFixed(3)};${currentMinuteMax.g.toFixed(3)};${currentMinuteMax.beta.toFixed(2)};${currentMinuteMax.gamma.toFixed(2)}\n`;
    maxBuffer.push(maxLine);
}

function stop() {
  logging = false;
  clearInterval(measureInterval);
  clearInterval(uploadInterval);
  if (wakeLock) wakeLock.release();
  
  if (minuteTicks > 0) {
      saveMinuteMax(Date.now());
  }

  tryUploadData(); 

  document.getElementById('btnStart').style.display = 'block';
  document.getElementById('btnStop').style.display = 'none';
  document.getElementById('status').innerText = "Zastaveno.";
}

// --- 4. BEZPEČNÝ UPLOAD ---
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

  document.getElementById('status').innerText = `Odesílám (Raw: ${rawToSend.length}, Max: ${maxToSend.length})...`;

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
    document.getElementById('status').innerText = "Data OK. Další za 5 min.";
  }).catch(err => {
    document.getElementById('status').innerText = "Chyba sítě!";
  });
}