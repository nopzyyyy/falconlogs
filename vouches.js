// ── Falcon Logs Vouches Client Script ──────────────────────────────────────────

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_BATCH = 20;
const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

let draftPhotos = [];
let galleryPhotos = [];
let lightboxIndex = 0;

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showVouchToast(msg, type = 'info') {
  if (typeof window.siteToast === 'function') {
    window.siteToast(msg, type);
  } else {
    alert(msg);
  }
}

function updateUploadStatus() {
  const status = document.getElementById('vouchUploadStatus');
  const btn = document.getElementById('btnVouchDone');
  const count = draftPhotos.length;
  if (status) {
    status.textContent = count
      ? `${count} photo${count === 1 ? '' : 's'} ready to submit`
      : 'No photos selected yet';
  }
  if (btn) btn.disabled = count === 0;
}

function renderDraftPhotos() {
  const container = document.getElementById('vouchDraftPhotos');
  if (!container) return;
  container.innerHTML = draftPhotos.map((photo, i) => `
    <div class="d-flex align-items-center mb-2 gap-2 p-2 rounded" style="background: rgba(255,255,255,0.04);">
      <img src="${escHtml(photo.url || photo.image_url)}" style="width:60px;height:40px;object-fit:cover;border-radius:4px" alt="Vouch preview">
      <span style="font-size:12.5px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(photo.name || 'Photo ' + (i + 1))}</span>
      <button class="btn btn-outline-danger btn-sm" type="button" data-remove-draft="${photo.id}" style="padding:2px 8px;font-size:12px;">✕</button>
    </div>
  `).join('');

  container.querySelectorAll('[data-remove-draft]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.removeDraft;
      try {
        await fetch(`/api/vouches/draft/${encodeURIComponent(id)}`, { method: 'DELETE' });
      } catch (_) {}
      draftPhotos = draftPhotos.filter((p) => String(p.id) !== String(id));
      renderDraftPhotos();
      updateUploadStatus();
    });
  });
}

async function loadDraftPhotos() {
  try {
    const res = await fetch('/api/vouches/drafts');
    if (res.ok) {
      const d = await res.json();
      draftPhotos = d.photos || [];
      renderDraftPhotos();
      updateUploadStatus();
    }
  } catch (_) {}
}

const fileInput = document.getElementById('vouchImageInput');
if (fileInput) {
  fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    if (files.length > MAX_BATCH) {
      showVouchToast(`Maximum ${MAX_BATCH} photos per upload`, 'error');
      e.target.value = '';
      return;
    }

    const status = document.getElementById('vouchUploadStatus');
    if (status) status.textContent = `Uploading ${files.length} file${files.length > 1 ? 's' : ''}…`;

    const fd = new FormData();
    let validCount = 0;
    for (const file of files) {
      if (!ALLOWED_MIME.includes(file.type.toLowerCase())) {
        showVouchToast(`Skipped ${file.name}: only JPG, PNG, GIF, or WEBP allowed`, 'warning');
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        showVouchToast(`Skipped ${file.name}: max 10MB`, 'warning');
        continue;
      }
      fd.append('files', file);
      validCount++;
    }

    if (!validCount) {
      e.target.value = '';
      updateUploadStatus();
      return;
    }

    try {
      const resp = await fetch('/api/vouches/upload', { method: 'POST', body: fd });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Upload failed');
      for (const photo of data.photos || []) {
        if (!draftPhotos.some((p) => String(p.id) === String(photo.id))) {
          draftPhotos.push(photo);
        }
      }
      renderDraftPhotos();
      updateUploadStatus();
      showVouchToast(`Uploaded ${data.photos?.length || 0} photo(s)`, 'success');
    } catch (err) {
      showVouchToast(`Upload failed: ${err.message}`, 'error');
      updateUploadStatus();
    }

    e.target.value = '';
  });
}

const btnVouchDone = document.getElementById('btnVouchDone');
if (btnVouchDone) {
  btnVouchDone.addEventListener('click', async () => {
    if (!draftPhotos.length) {
      showVouchToast('Please upload at least one photo', 'warning');
      return;
    }

    btnVouchDone.textContent = 'Submitting…';
    btnVouchDone.disabled = true;

    try {
      const resp = await fetch('/api/vouches/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoIds: draftPhotos.map((p) => p.id) })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Submission failed');
      showVouchToast('Vouch submitted for review! Our team will approve it shortly.', 'success');
      draftPhotos = [];
      renderDraftPhotos();
      updateUploadStatus();
    } catch (err) {
      showVouchToast(err.message, 'error');
    } finally {
      btnVouchDone.textContent = 'Submit for Review';
      updateUploadStatus();
    }
  });
}

// ── Lightbox Logic ─────────────────────────────────────────────────────────────

function updateLightbox() {
  const box = document.getElementById('vouchLightbox');
  const img = document.getElementById('vouchLightboxImg');
  const counter = document.getElementById('vouchLightboxCounter');
  const prev = document.getElementById('vouchLightboxPrev');
  const next = document.getElementById('vouchLightboxNext');
  if (!box || !img || !galleryPhotos.length) return;

  const photo = galleryPhotos[lightboxIndex];
  img.src = photo.image_url || photo.url;
  if (counter) counter.textContent = `${lightboxIndex + 1} / ${galleryPhotos.length}`;
  if (prev) prev.disabled = lightboxIndex <= 0;
  if (next) next.disabled = lightboxIndex >= galleryPhotos.length - 1;
}

function openLightbox(index) {
  const box = document.getElementById('vouchLightbox');
  if (!box || !galleryPhotos.length) return;
  lightboxIndex = Math.max(0, Math.min(index, galleryPhotos.length - 1));
  box.hidden = false;
  box.setAttribute('aria-hidden', 'false');
  document.body.classList.add('vouch-lightbox-open');
  updateLightbox();
}

function closeLightbox() {
  const box = document.getElementById('vouchLightbox');
  const img = document.getElementById('vouchLightboxImg');
  if (!box) return;
  box.hidden = true;
  box.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('vouch-lightbox-open');
  if (img) img.src = '';
}

function stepLightbox(delta) {
  if (!galleryPhotos.length) return;
  const next = lightboxIndex + delta;
  if (next < 0 || next >= galleryPhotos.length) return;
  lightboxIndex = next;
  updateLightbox();
}

function renderGallery() {
  const area = document.getElementById('vouchGalleryArea');
  if (!area) return;

  if (!galleryPhotos.length) {
    area.innerHTML = '<div class="text-center py-5" style="color:rgba(255,255,255,.55);">No customer vouches published yet. Be the first to submit one!</div>';
    return;
  }

  area.innerHTML = `
    <div class="vouch-gallery-grid">
      ${galleryPhotos.map((photo, i) => `
        <button type="button" class="vouch-gallery-thumb" data-vouch-index="${i}" aria-label="View vouch ${i + 1}">
          <img src="${escHtml(photo.image_url || photo.url)}" alt="Vouch ${i + 1}" loading="lazy">
        </button>
      `).join('')}
    </div>
  `;

  area.querySelectorAll('[data-vouch-index]').forEach((btn) => {
    btn.addEventListener('click', () => openLightbox(Number(btn.dataset.vouchIndex)));
  });
}

async function loadGallery() {
  const area = document.getElementById('vouchGalleryArea');
  if (!area) return;
  try {
    const resp = await fetch('/api/vouches/gallery');
    if (resp.ok) {
      const d = await resp.json();
      galleryPhotos = d.photos || [];
      renderGallery();
    }
  } catch (err) {
    area.innerHTML = `<p class="text-danger text-center py-5">${escHtml(err.message)}</p>`;
  }
}

document.getElementById('vouchLightboxClose')?.addEventListener('click', closeLightbox);
document.getElementById('vouchLightboxBackdrop')?.addEventListener('click', closeLightbox);
document.getElementById('vouchLightboxPrev')?.addEventListener('click', () => stepLightbox(-1));
document.getElementById('vouchLightboxNext')?.addEventListener('click', () => stepLightbox(1));

document.addEventListener('keydown', (e) => {
  const box = document.getElementById('vouchLightbox');
  if (!box || box.hidden) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') stepLightbox(-1);
  if (e.key === 'ArrowRight') stepLightbox(1);
});

document.getElementById('tabVouchesLabel')?.addEventListener('shown.bs.tab', loadGallery);

document.addEventListener('DOMContentLoaded', () => {
  loadDraftPhotos();
  loadGallery();
});
