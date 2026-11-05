const urlInput = document.getElementById('urlInput');
const folderInput = document.getElementById('folderInput');
const chooseFolderBtn = document.getElementById('chooseFolderBtn');
const addBtn = document.getElementById('addBtn');
const queueEl = document.getElementById('queue');
const statusBar = document.getElementById('statusBar');

let downloadDir = '';
let nextId = 1;
const items = new Map();

function showStatus(message, type) {
  statusBar.textContent = message;
  statusBar.className = `status visible ${type}`;
  if (type === 'info' || type === 'success') {
    clearTimeout(showStatus._t);
    showStatus._t = setTimeout(() => {
      statusBar.className = 'status';
    }, 5000);
  }
}

function detectType(url) {
  const u = url.toLowerCase();
  const extMatch = /\.(mp4|webm|mov|mkv|avi)(\?.*)?$/.exec(u);
  const audioMatch = /\.(mp3|m4a|wav|ogg|flac|aac)(\?.*)?$/.exec(u);
  const imageMatch = /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/.exec(u);
  const apkMatch = /\.apk(\?.*)?$/.exec(u);

  if (apkMatch) return 'apk';
  if (extMatch) return 'video';
  if (audioMatch) return 'music';
  if (imageMatch) return 'image';
  return 'file';
}

function suggestFilename(url, type) {
  let name = '';
  try {
    const parsed = new URL(url);
    name = decodeURIComponent(parsed.pathname.split('/').pop() || '');
  } catch (e) {
    name = '';
  }
  if (name && name.includes('.')) return name;

  const stamp = Date.now();
  const extMap = { video: '.mp4', music: '.mp3', image: '.jpg', apk: '.apk', file: '' };
  return `${type}_${stamp}${extMap[type] || ''}`;
}

function humanSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function createItem(url, filename, type) {
  const id = `dl_${nextId++}`;
  const wrapper = document.createElement('div');
  wrapper.className = 'queue-item';
  wrapper.dataset.id = id;

  const nameEl = document.createElement('div');
  nameEl.className = 'queue-name';
  nameEl.textContent = filename;

  const typeBadge = document.createElement('span');
  typeBadge.className = `badge ${type}`;
  typeBadge.textContent = type;

  const statusBadge = document.createElement('span');
  statusBadge.className = 'badge queued';
  statusBadge.textContent = 'queued';

  const head = document.createElement('div');
  head.className = 'queue-head';

  const titleWrap = document.createElement('div');
  titleWrap.style.display = 'flex';
  titleWrap.style.alignItems = 'center';
  titleWrap.style.gap = '8px';
  titleWrap.style.overflow = 'hidden';
  titleWrap.appendChild(typeBadge);
  titleWrap.appendChild(nameEl);

  const actions = document.createElement('div');
  actions.className = 'queue-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-small btn-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = () => {
    window.electronAPI.cancelDownload(id);
  };

  const openBtn = document.createElement('button');
  openBtn.className = 'btn-small btn-open';
  openBtn.textContent = 'Show File';
  openBtn.style.display = 'none';

  actions.appendChild(cancelBtn);
  actions.appendChild(openBtn);

  head.appendChild(titleWrap);
  head.appendChild(statusBadge);
  head.appendChild(actions);

  const progressBar = document.createElement('div');
  progressBar.className = 'progress-bar';
  const progressFill = document.createElement('div');
  progressFill.className = 'progress-fill';
  progressBar.appendChild(progressFill);

  const meta = document.createElement('div');
  meta.className = 'queue-meta';
  const metaLeft = document.createElement('span');
  metaLeft.textContent = 'Waiting...';
  const metaRight = document.createElement('span');
  metaRight.textContent = '';
  meta.appendChild(metaLeft);
  meta.appendChild(metaRight);

  wrapper.appendChild(head);
  wrapper.appendChild(progressBar);
  wrapper.appendChild(meta);
  queueEl.prepend(wrapper);

  const record = { id, url, filename, type, statusBadge, progressFill, metaLeft, metaRight, cancelBtn, openBtn, finalPath: null };
  items.set(id, record);
  return record;
}

window.electronAPI.onProgress((data) => {
  const record = items.get(data.id);
  if (!record) return;
  if (record.statusBadge.textContent !== 'downloading') {
    record.statusBadge.textContent = 'downloading';
    record.statusBadge.className = 'badge downloading';
  }
  const percent = data.percent;
  record.progressFill.style.width = percent !== null ? `${percent}%` : '100%';
  if (percent !== null) {
    record.metaLeft.textContent = `${percent.toFixed(1)}%`;
  } else {
    record.metaLeft.textContent = 'Downloading...';
  }
  if (data.total > 0) {
    record.metaRight.textContent = `${humanSize(data.received)} / ${humanSize(data.total)}`;
  } else {
    record.metaRight.textContent = humanSize(data.received);
  }
});

window.electronAPI.onComplete((data) => {
  const record = items.get(data.id);
  if (!record) return;

  record.cancelBtn.style.display = 'none';

  if (data.cancelled) {
    record.statusBadge.textContent = 'cancelled';
    record.statusBadge.className = 'badge cancelled';
    record.metaLeft.textContent = 'Cancelled';
    showStatus('Download cancelled.', 'info');
    return;
  }

  if (data.success) {
    record.statusBadge.textContent = 'done';
    record.statusBadge.className = 'badge done';
    record.progressFill.style.width = '100%';
    record.metaLeft.textContent = 'Complete';
    record.metaRight.textContent = humanSize(data.size || 0);
    record.finalPath = data.path;
    record.openBtn.style.display = 'inline-block';
    record.openBtn.onclick = () => window.electronAPI.openPath(record.finalPath);
    showStatus(`Saved: ${data.path}`, 'success');
  } else {
    record.statusBadge.textContent = 'failed';
    record.statusBadge.className = 'badge failed';
    record.metaLeft.textContent = data.error || 'Download failed';
    showStatus(data.error || 'Download failed.', 'error');
  }
});

chooseFolderBtn.addEventListener('click', async () => {
  const chosen = await window.electronAPI.chooseFolder();
  if (chosen) {
    downloadDir = chosen;
    folderInput.value = chosen;
  }
});

async function startDownload() {
  const url = urlInput.value.trim();
  if (!url) {
    showStatus('Please paste a URL first.', 'error');
    return;
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    showStatus('That does not look like a valid URL.', 'error');
    return;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    showStatus('Only http and https links are supported.', 'error');
    return;
  }

  const type = detectType(url);
  const filename = suggestFilename(url, type);
  const record = createItem(url, filename, type);

  addBtn.disabled = true;
  try {
    const result = await window.electronAPI.startDownload({
      id: record.id,
      url,
      filename,
      directory: downloadDir || null
    });

    if (result && result.cancelled) {
      return;
    }
    if (result && result.success) {
      record.finalPath = result.path;
    }
  } catch (err) {
    record.statusBadge.textContent = 'failed';
    record.statusBadge.className = 'badge failed';
    record.metaLeft.textContent = err.message || 'Download failed';
    showStatus(err.message || 'Download failed.', 'error');
  } finally {
    addBtn.disabled = false;
    urlInput.value = '';
    urlInput.focus();
  }
}

addBtn.addEventListener('click', startDownload);
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') startDownload();
});
