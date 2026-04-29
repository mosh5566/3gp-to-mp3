/* ממיר 3GP ל-MP3 - לוגיקה ראשית (FFmpeg.wasm v0.11) */
const { createFFmpeg, fetchFile } = FFmpeg;

const ffmpeg = createFFmpeg({
  log: false,
  corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
});
let ffmpegReady = false;

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const statusDot = statusEl.querySelector('.status-dot');
const statusText = statusEl.querySelector('.status-text');
const fileInput = $('fileInput');
const dropzone = $('dropzone');
const filesList = $('filesList');
const actions = $('actions');
const convertAllBtn = $('convertAllBtn');
const downloadAllBtn = $('downloadAllBtn');
const clearBtn = $('clearBtn');
const installPrompt = $('installPrompt');
const installBtn = $('installBtn');

const files = [];
let nextId = 1;
let currentItem = null;

function setStatus(state, text) {
  statusDot.className = `status-dot ${state}`;
  statusText.textContent = text;
}

ffmpeg.setProgress(({ ratio }) => {
  if (currentItem && ratio >= 0 && ratio <= 1) {
    updateProgress(currentItem, Math.round(ratio * 100));
  }
});

async function loadFFmpeg() {
  try {
    setStatus('loading', 'טוען מנוע המרה (~25MB, חד פעמי)...');
    await ffmpeg.load();
    ffmpegReady = true;
    setStatus('ready', '✅ מוכן להמרה');
  } catch (e) {
    console.error('FFmpeg load failed:', e);
    setStatus('error', '❌ שגיאה בטעינת המנוע: ' + (e.message || 'לא ידוע'));
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function statusLabel(s) {
  return ({
    pending: '⏳ ממתין להמרה',
    converting: '🔄 ממיר...',
    done: '✅ הומר בהצלחה',
    error: '❌ שגיאה בהמרה',
  })[s] || s;
}

function addFiles(fileList) {
  let added = 0;
  for (const file of fileList) {
    if (!file || file.size === 0) continue;
    const item = {
      id: nextId++,
      file,
      status: 'pending',
      blob: null,
      url: null,
      element: null,
    };
    files.push(item);
    renderFile(item);
    added++;
  }
  if (added > 0) {
    actions.hidden = false;
    updateButtons();
  }
}

function renderFile(item) {
  const div = document.createElement('div');
  div.className = `file-item ${item.status}`;
  div.id = `file-${item.id}`;
  div.innerHTML = `
    <div class="file-name">${escapeHtml(item.file.name)}</div>
    <div class="file-meta">${formatSize(item.file.size)} · ${item.file.type || 'לא ידוע'}</div>
    <div class="file-status">${statusLabel(item.status)}</div>
    <div class="progress-bar" hidden><div class="progress-fill"></div></div>
    <div class="file-actions"></div>
  `;
  filesList.appendChild(div);
  item.element = div;
  refreshActions(item);
}

function refreshActions(item) {
  const el = item.element;
  if (!el) return;
  const actionsEl = el.querySelector('.file-actions');
  el.className = `file-item ${item.status}`;
  el.querySelector('.file-status').textContent = statusLabel(item.status);
  actionsEl.innerHTML = '';

  if (item.status === 'done' && item.url) {
    const a = document.createElement('a');
    a.href = item.url;
    a.download = mp3Name(item.file.name);
    a.textContent = '⬇️ הורד';
    a.className = 'download-btn';
    actionsEl.appendChild(a);
  }
  if (item.status === 'pending' || item.status === 'error') {
    const rm = document.createElement('button');
    rm.className = 'remove-btn';
    rm.textContent = 'הסר';
    rm.onclick = () => removeFile(item);
    actionsEl.appendChild(rm);
  }
}

function updateProgress(item, pct) {
  const bar = item.element?.querySelector('.progress-bar');
  const fill = item.element?.querySelector('.progress-fill');
  if (bar && fill) {
    bar.hidden = false;
    fill.style.width = pct + '%';
  }
}

function hideProgress(item) {
  const bar = item.element?.querySelector('.progress-bar');
  if (bar) bar.hidden = true;
}

function removeFile(item) {
  const idx = files.indexOf(item);
  if (idx >= 0) files.splice(idx, 1);
  item.element?.remove();
  if (item.url) URL.revokeObjectURL(item.url);
  if (files.length === 0) actions.hidden = true;
  updateButtons();
}

function mp3Name(originalName) {
  return originalName.replace(/\.[^.]+$/, '') + '.mp3';
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

async function convertAll() {
  if (!ffmpegReady) {
    alert('המנוע עדיין נטען, נסה שוב בעוד רגע');
    return;
  }
  convertAllBtn.disabled = true;
  for (const item of files) {
    if (item.status === 'pending') {
      await convertFile(item);
    }
  }
  convertAllBtn.disabled = false;
  updateButtons();
}

async function convertFile(item) {
  currentItem = item;
  item.status = 'converting';
  refreshActions(item);
  updateProgress(item, 0);
  try {
    const ext = (item.file.name.match(/\.([^.]+)$/) || [])[1] || '3gp';
    const inputName = `input-${item.id}.${ext}`;
    const outputName = `output-${item.id}.mp3`;
    ffmpeg.FS('writeFile', inputName, await fetchFile(item.file));
    await ffmpeg.run(
      '-i', inputName,
      '-vn',
      '-codec:a', 'libmp3lame',
      '-b:a', '192k',
      '-ar', '44100',
      outputName
    );
    const data = ffmpeg.FS('readFile', outputName);
    item.blob = new Blob([data.buffer], { type: 'audio/mpeg' });
    item.url = URL.createObjectURL(item.blob);
    item.status = 'done';
    try { ffmpeg.FS('unlink', inputName); } catch {}
    try { ffmpeg.FS('unlink', outputName); } catch {}
  } catch (e) {
    console.error('Conversion failed:', e);
    item.status = 'error';
  }
  hideProgress(item);
  refreshActions(item);
  currentItem = null;
}

function updateButtons() {
  const hasPending = files.some(f => f.status === 'pending');
  const hasDone = files.some(f => f.status === 'done');
  convertAllBtn.hidden = !hasPending;
  downloadAllBtn.hidden = !hasDone;
}

async function downloadAll() {
  for (const item of files) {
    if (item.status === 'done' && item.url) {
      const a = document.createElement('a');
      a.href = item.url;
      a.download = mp3Name(item.file.name);
      document.body.appendChild(a);
      a.click();
      a.remove();
      await new Promise(r => setTimeout(r, 200));
    }
  }
}

function clearAll() {
  for (const item of [...files]) removeFile(item);
}

/* Events */
fileInput.addEventListener('change', (e) => {
  addFiles(e.target.files);
  fileInput.value = '';
});

['dragenter', 'dragover'].forEach(ev =>
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('drag'); })
);
['dragleave', 'drop'].forEach(ev =>
  dropzone.addEventListener(ev, () => dropzone.classList.remove('drag'))
);
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
});

convertAllBtn.addEventListener('click', convertAll);
downloadAllBtn.addEventListener('click', downloadAll);
clearBtn.addEventListener('click', clearAll);

/* PWA install prompt */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installPrompt.hidden = false;
});
installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installPrompt.hidden = true;
});
window.addEventListener('appinstalled', () => { installPrompt.hidden = true; });

/* Service Worker + Share Target */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(async (reg) => {
    await navigator.serviceWorker.ready;
    const params = new URLSearchParams(location.search);
    if (params.has('share')) {
      const id = params.get('share');
      history.replaceState({}, '', location.pathname);
      const sw = navigator.serviceWorker.controller || reg.active;
      if (sw) {
        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => {
          if (event.data?.files?.length) {
            addFiles(event.data.files);
          }
        };
        sw.postMessage({ action: 'get-shared-files', id }, [channel.port2]);
      }
    }
  }).catch(err => console.warn('SW register failed:', err));
}

loadFFmpeg();
