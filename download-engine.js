const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

function sanitizeFilename(name) {
  const cleaned = String(name || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\.+$/, '')
    .trim();
  return cleaned || 'download';
}

function uniquePath(dir, filename) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let candidate = path.join(dir, filename);
  let counter = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base} (${counter})${ext}`);
    counter += 1;
  }
  return candidate;
}

function extensionForMime(mimeType) {
  const map = {
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
    'audio/ogg': '.ogg',
    'audio/wav': '.wav',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'application/vnd.android.package-archive': '.apk'
  };
  return map[(mimeType || '').split(';')[0].trim()] || '';
}

function filenameFromUrl(urlString, mimeType) {
  try {
    const parsed = new URL(urlString);
    let base = path.basename(decodeURIComponent(parsed.pathname)) || 'download';
    if (!path.extname(base)) base += extensionForMime(mimeType);
    return sanitizeFilename(base);
  } catch (e) {
    return 'download';
  }
}

function performDownload(urlString, destination, state, onProgress, redirectCount = 0) {
  return new Promise((resolve) => {
    if (redirectCount > 10) {
      resolve({ success: false, error: 'Too many redirects' });
      return;
    }

    let parsed;
    try {
      parsed = new URL(urlString);
    } catch (e) {
      resolve({ success: false, error: 'Invalid URL' });
      return;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      resolve({ success: false, error: 'Only http and https URLs are supported' });
      return;
    }

    const client = parsed.protocol === 'https:' ? https : http;
    const request = client.get(
      urlString,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LinkDownloader/1.0',
          'Accept': '*/*'
        }
      },
      (response) => {
        state.request = request;

        if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
          response.resume();
          let next;
          try {
            next = new URL(response.headers.location, urlString).toString();
          } catch (e) {
            resolve({ success: false, error: 'Invalid redirect URL' });
            return;
          }
          performDownload(next, destination, state, onProgress, redirectCount + 1).then(resolve);
          return;
        }

        if (response.statusCode !== 200) {
          response.resume();
          resolve({ success: false, error: `Server returned HTTP ${response.statusCode}` });
          return;
        }

        const total = parseInt(response.headers['content-length'] || '0', 10);
        const mimeType = response.headers['content-type'] || '';
        let received = 0;
        let lastEmit = 0;

        const fileStream = fs.createWriteStream(destination);
        state.fileStream = fileStream;

        response.on('data', (chunk) => {
          received += chunk.length;
          const now = Date.now();
          if (now - lastEmit > 120) {
            lastEmit = now;
            const percent = total > 0 ? Math.min(100, (received / total) * 100) : null;
            if (onProgress) onProgress({ received, total, percent, mimeType });
          }
        });

        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close(() => {
            if (state.cancelled) {
              try { fs.unlinkSync(destination); } catch (e) {}
              resolve({ success: false, cancelled: true });
              return;
            }
            resolve({ success: true, path: destination, size: received, mimeType });
          });
        });

        fileStream.on('error', (err) => {
          try { fs.unlinkSync(destination); } catch (e) {}
          resolve({ success: false, error: err.message });
        });
      }
    );

    state.request = request;

    request.setTimeout(60000, () => {
      request.destroy();
      resolve({ success: false, error: 'Connection timed out' });
    });

    request.on('error', (err) => {
      if (state.cancelled) {
        resolve({ success: false, cancelled: true });
        return;
      }
      resolve({ success: false, error: err.message });
    });
  });
}

async function downloadToFolder({ url, filename, directory, id, onProgress, state }) {
  fs.mkdirSync(directory, { recursive: true });
  const targetName = sanitizeFilename(filename || filenameFromUrl(url, ''));
  const target = uniquePath(directory, targetName);
  const dlState = state || { id, cancelled: false, request: null, fileStream: null };
  const result = await performDownload(url, target, dlState, onProgress);
  return result;
}

module.exports = {
  sanitizeFilename,
  uniquePath,
  filenameFromUrl,
  performDownload,
  downloadToFolder
};
