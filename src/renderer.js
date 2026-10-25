const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const items = []; // { id, file, name, kind, size, width, height, duration, state, progress, out, outSize, error, el }
let nextId = 1;
let busy = false;
let stopRequested = false;

const AUDIO_FORMATS = ['mp3', 'm4a', 'wav', 'flac', 'ogg'];
const ANIM_FORMATS = ['gif', 'webp-anim'];
const FRAME_FORMATS = ['frame-jpg', 'frame-png'];

const PRESETS = {
  small: { imgQuality: 60, vidQuality: 35, imgMaxDim: '1920', vidRes: '720', vidSpeed: 'small', vidAudio: '96' },
  balanced: { imgQuality: 80, vidQuality: 60, imgMaxDim: '0', vidRes: '0', vidSpeed: 'balanced', vidAudio: '128' },
  quality: { imgQuality: 92, vidQuality: 85, imgMaxDim: '0', vidRes: '0', vidSpeed: 'balanced', vidAudio: '192' },
};

const DEFAULTS = {
  lang: 'en', preset: 'balanced', tab: 'image',
  imgFormat: 'webp', imgQuality: 80, imgMaxDim: '0', imgMaxDimCustom: '', imgKeepMeta: false,
  vidFormat: 'mp4-h264', vidQuality: 60, vidRes: '0', gifWidth: '480', vidTarget: '', vidSpeed: 'balanced',
  vidFps: '0', vidAudio: '128', vidNoAudio: false, vidKeepMeta: false, trimStart: '', trimEnd: '',
  outMode: 'same', outDir: '', suffix: '_converted',
};

let S = { ...DEFAULTS };
try { S = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('settings') || '{}') }; } catch {}
const save = () => { try { localStorage.setItem('settings', JSON.stringify(S)); } catch {} };

// ---------- Words: English is the key, Greek the choice (as in the other Roar apps) ----------
const EL = {"Restart to update": "Επανεκκίνηση για ενημέρωση", "Every <b>format</b>.<br>A smaller <b>file</b>.": "Κάθε <b>μορφή</b>.<br>Μικρότερο <b>αρχείο</b>.", "Pictures, videos and sound: convert and compress them, all on your own computer.": "Εικόνες, βίντεο και ήχος: μετατροπή και συμπίεση, όλα τοπικά στον υπολογιστή σου.", "Drop pictures, videos, sound or folders here": "Σύρε εδώ εικόνες, βίντεο, ήχο ή φακέλους", "Choose files": "Επιλογή αρχείων", "+ Add": "+ Προσθήκη", "Clear finished": "Καθαρισμός ολοκληρωμένων", "Remove all": "Αφαίρεση όλων", "Compression": "Συμπίεση", "Small file": "Μικρό αρχείο", "Balanced": "Ισορροπία", "Quality": "Ποιότητα", "Save as": "Μορφή εξόδου", "Same as the original": "Ίδια με το αρχικό", "ICO (icon)": "ICO (εικονίδιο)", "Lower makes a smaller file. 100 is lossless (PNG, WebP, AVIF).": "Χαμηλότερη = μικρότερο αρχείο. 100 = χωρίς απώλειες (PNG, WebP, AVIF).", "Largest side": "Μέγιστη διάσταση (μεγάλη πλευρά)", "Original": "Αρχική", "Custom…": "Προσαρμοσμένη…", "Keep EXIF and metadata": "Διατήρηση EXIF και μεταδεδομένων", "Video": "Βίντεο", "MP4 · H.264 (plays everywhere)": "MP4 · H.264 (παίζει παντού)", "MP4 · H.265/HEVC (smaller)": "MP4 · H.265/HEVC (μικρότερο)", "MP4 · AV1 (smallest, slow)": "MP4 · AV1 (το μικρότερο, αργό)", "MOV · ProRes (for editing)": "MOV · ProRes (για μοντάζ)", "Moving picture": "Κινούμενη εικόνα", "WebP (animated)": "WebP (κινούμενο)", "Sound only": "Μόνο ήχος", "A still (one frame)": "Στιγμιότυπο (1 καρέ)", "Resolution": "Ανάλυση", "Width": "Πλάτος", "Target file size (optional)": "Στόχος μεγέθους αρχείου (προαιρετικό)", "e.g. 25": "π.χ. 25", "When set, the quality is left aside and the file aims at this size (25 MB for email or Discord, say).": "Αν οριστεί, αγνοείται η ποιότητα και η συμπίεση στοχεύει σε αυτό το μέγεθος (π.χ. 25 MB για email ή Discord).", "Encoding speed": "Ταχύτητα κωδικοποίησης", "Fast": "Γρήγορη", "Normal": "Κανονική", "Slow": "Αργή", "Sound": "Ήχος", "End": "Τέλος", "the end": "τέλος", "Remove the sound": "Αφαίρεση ήχου", "Keep metadata": "Διατήρηση μεταδεδομένων", "Save to": "Αποθήκευση σε", "Same folder": "Ίδιο φάκελο", "Another folder…": "Άλλο φάκελο…", "Added to the name": "Κατάληξη ονόματος", "Convert": "Μετατροπή", "Stop": "Διακοπή", "Next to the original file": "Δίπλα στο αρχικό αρχείο", "At": "Χρονική στιγμή", "Start": "Αρχή", "Pictures": "Εικόνες", "Video & Sound": "Βίντεο & Ήχος", "Converting… {p}": "Μετατροπή… {p}", "Waiting": "Σε αναμονή", "Open": "Άνοιγμα", "Show in the folder": "Εμφάνιση στον φάκελο", "Cancel": "Ακύρωση", "Remove": "Αφαίρεση", "{n} files · {size}": "{n} αρχεία · {size}", "{a}/{b} done · {before} → {after}": "{a}/{b} έτοιμα · {before} → {after}", "Cancelled": "Ακυρώθηκε", "The file has no sound": "Το αρχείο δεν έχει ήχο", "The file has no picture": "Το αρχείο δεν έχει εικόνα", "The file has no video": "Το αρχείο δεν έχει εικόνα βίντεο", "Cannot read the picture": "Δεν διαβάζεται η εικόνα", "Cannot save in this format": "Δεν γίνεται αποθήκευση σε αυτή τη μορφή", "Unknown format": "Άγνωστη μορφή"};
const t = (en, vars = {}) => {
  let s = (S.lang === 'el' && EL[en]) || en;
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
};
// errors from convert.js come in English, as "Message" or "Message: detail"
const tErr = (msg) => { const [head, ...rest] = String(msg).split(': '); return EL[head] ? [t(head), ...rest].join(': ') : msg; };

function applyLang() {
  document.documentElement.lang = S.lang;
  for (const el of $$('[data-i18n]')) { el.dataset.en ??= el.textContent; el.textContent = t(el.dataset.en); }
  for (const el of $$('[data-i18n-html]')) { el.dataset.en ??= el.innerHTML; el.innerHTML = t(el.dataset.en); }
  for (const el of $$('[data-i18n-ph]')) { el.dataset.en ??= el.placeholder; el.placeholder = t(el.dataset.en); }
  for (const el of $$('[data-i18n-label]')) { el.dataset.en ??= el.label; el.label = t(el.dataset.en); }
  $$('#lang button').forEach((b) => b.classList.toggle('on', b.dataset.v === S.lang));
  items.forEach(renderItem);
  refreshAll();
}

// ---------- Formatting ----------
function fmtSize(b) {
  if (b == null) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(i > 1 ? 1 : 0)} ${u[i]}`;
}
function fmtTime(s) {
  if (!s) return '';
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(sec).padStart(2, '0')}`;
}
function parseTime(t) {
  t = String(t || '').trim().replace(',', '.');
  if (!t) return 0;
  return t.split(':').reduce((acc, p) => acc * 60 + (parseFloat(p) || 0), 0);
}
function fileUrl(p) {
  const norm = p.replace(/\\/g, '/');
  const parts = norm.split('/').map((seg, i) => (i === 0 && /^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg)));
  return 'file://' + (norm.startsWith('/') ? '' : '/') + parts.join('/');
}
const ICON = {
  image: '<path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="9" cy="9.5" r="1.5"/><path d="M20 15l-5-5-9 9"/>',
  video: '<rect x="3" y="5" width="14" height="14" rx="2"/><path d="M17 10l4-2.5v9L17 14"/>',
  audio: '<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  open: '<path d="M8 5.5v13l10.5-6.5z"/>',
  reveal: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  cancel: '<rect x="7" y="7" width="10" height="10" rx="2"/>',
  remove: '<path d="M6 6l12 12M18 6L6 18"/>',
};
const svg = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- Settings ----------
function bindSettings() {
  for (const k of Object.keys(DEFAULTS)) {
    const el = document.getElementById(k);
    if (!el || el.classList.contains('seg')) continue;
    if (el.type === 'checkbox') el.checked = !!S[k];
    else el.value = S[k];
    el.addEventListener('input', () => {
      S[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value;
      if (['imgQuality', 'vidQuality', 'imgMaxDim', 'vidRes', 'vidAudio'].includes(k)) setPreset(null);
      refreshSettings();
      save();
    });
  }
  $('#lang').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    S.lang = b.dataset.v;
    save();
    applyLang();
  });
  for (const id of ['vidSpeed', 'outMode']) {
    $(`#${id}`).addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (id === 'outMode' && b.dataset.v === 'custom') {
        const dir = await window.api.pickFolder();
        if (!dir) return;
        S.outDir = dir;
      }
      S[id] = b.dataset.v;
      if (id === 'vidSpeed') setPreset(null);
      refreshSettings();
      save();
    });
  }
  $('#presets').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    Object.assign(S, PRESETS[b.dataset.preset]);
    setPreset(b.dataset.preset);
    for (const [k, v] of Object.entries(PRESETS[b.dataset.preset])) {
      const el = document.getElementById(k);
      if (el && !el.classList.contains('seg')) el.value = v;
    }
    refreshSettings();
    save();
  });
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    S.tab = b.dataset.tab;
    refreshSettings();
    save();
  });
}

function setPreset(p) { S.preset = p; }

function vidCategory() {
  if (AUDIO_FORMATS.includes(S.vidFormat)) return 'audio';
  if (ANIM_FORMATS.includes(S.vidFormat)) return 'anim';
  if (FRAME_FORMATS.includes(S.vidFormat)) return 'frame';
  return 'video';
}

function refreshSettings() {
  $$('#presets button').forEach((b) => b.classList.toggle('on', b.dataset.preset === S.preset));
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
  $$('.panel').forEach((p) => (p.hidden = p.dataset.panel !== S.tab));
  $$('#vidSpeed button').forEach((b) => b.classList.toggle('on', b.dataset.v === S.vidSpeed));
  $$('#outMode button').forEach((b) => b.classList.toggle('on', b.dataset.v === S.outMode));
  $('#outDir').textContent = S.outMode === 'custom' && S.outDir ? S.outDir : t('Next to the original file');
  $('#imgQualityVal').textContent = S.imgQuality;
  $('#vidQualityVal').textContent = S.vidQuality;
  $('#imgMaxDimCustom').hidden = S.imgMaxDim !== 'custom';

  const cat = vidCategory();
  $$('[data-show]').forEach((el) => (el.hidden = !el.dataset.show.split(' ').includes(cat)));
  $('#trimStartLabel').textContent = cat === 'frame' ? t('At') : t('Start');
  $('#vidQuality').disabled = cat === 'video' && !!S.vidTarget;

  // how many files each tab has
  const nImg = items.filter((i) => i.kind === 'image').length;
  const nVid = items.length - nImg;
  $('#tabs [data-tab=image]').innerHTML = `${t('Pictures')}${nImg ? `<small>${nImg}</small>` : ''}`;
  $('#tabs [data-tab=video]').innerHTML = `${t('Video & Sound')}${nVid ? `<small>${nVid}</small>` : ''}`;
  for (const r of $$('input[type=range]')) r.style.setProperty('--p', `${((r.value - r.min) / (r.max - r.min)) * 100}%`);
  placeLenses();
}

function optionsFor(item) {
  const common = {
    outputDir: S.outMode === 'custom' && S.outDir ? S.outDir : null,
    suffix: S.suffix,
  };
  if (item.kind === 'image') {
    const dim = S.imgMaxDim === 'custom' ? +S.imgMaxDimCustom || 0 : +S.imgMaxDim;
    return { ...common, format: S.imgFormat, quality: S.imgQuality, maxDim: dim, keepMetadata: S.imgKeepMeta };
  }
  let format = S.vidFormat;
  if (item.kind === 'audio' && !AUDIO_FORMATS.includes(format)) format = 'mp3'; // a sound file can only become sound
  return {
    ...common,
    format,
    quality: S.vidQuality,
    resolution: +S.vidRes,
    gifWidth: +S.gifWidth,
    targetSizeMB: +S.vidTarget || 0,
    speed: S.vidSpeed,
    fps: +S.vidFps,
    audioBitrate: +S.vidAudio,
    removeAudio: S.vidNoAudio,
    keepMetadata: S.vidKeepMeta,
    trimStart: parseTime(S.trimStart),
    trimEnd: parseTime(S.trimEnd),
  };
}

// ---------- The list ----------
async function addPaths(paths) {
  if (!paths.length) return;
  const existing = new Set(items.map((i) => i.file));
  const infos = await window.api.inspect(paths);
  for (const info of infos) {
    if (existing.has(info.file)) continue;
    const it = { id: nextId++, state: 'idle', progress: 0, ...info };
    items.push(it);
    renderItem(it);
  }
  // open the tab of what was just added
  if (infos.length && infos.every((i) => i.kind !== 'image')) S.tab = 'video';
  else if (infos.length && infos.every((i) => i.kind === 'image')) S.tab = 'image';
  refreshAll();
}

function thumbHtml(it) {
  if (it.kind === 'image' && !/\.(heic|heif|tga|ico)$/i.test(it.file)) return `<img src="${fileUrl(it.file)}" loading="lazy">`;
  if (it.kind === 'video') return `<video src="${fileUrl(it.file)}#t=1" preload="metadata" muted></video>`;
  return svg(it.kind);
}

function renderItem(it) {
  if (!it.el) {
    it.el = document.createElement('li');
    it.el.innerHTML = `<div class="thumb">${thumbHtml(it)}</div><div class="meta"></div><div class="actions"></div><div class="bar"></div>`;
    const media = it.el.querySelector('.thumb img, .thumb video');
    media?.addEventListener('error', () => (media.outerHTML = svg(it.kind)));
    $('#list').appendChild(it.el);
  }
  const tags = [];
  if (it.width) tags.push(`${it.width}×${it.height}`);
  if (it.duration) tags.push(fmtTime(it.duration));
  if (it.vcodec) tags.push(it.vcodec);
  let status = '';
  it.el.className = `item ${it.state}`;
  if (it.state === 'running') status = `<div class="status run">${t('Converting… {p}', { p: it.progress ? Math.round(it.progress * 100) + '%' : '' })}</div>`;
  else if (it.state === 'queued') status = `<div class="status">${t('Waiting')}</div>`;
  else if (it.state === 'done') {
    const pct = Math.round((1 - it.outSize / it.size) * 100);
    status = `<div class="status ok"><span class="chip tint saving ${pct < 0 ? 'bad' : ''}"><i></i>${pct >= 0 ? `−${pct}%` : `+${-pct}%`} · ${fmtSize(it.outSize)}</span><span class="out">${esc(it.out.split(/[\\/]/).pop())}</span></div>`;
  } else if (it.state === 'error') status = `<div class="status err">${esc(tErr(it.error))}</div>`;

  it.el.querySelector('.meta').innerHTML = `
    <div class="name" title="${esc(it.file)}">${esc(it.name)}</div>
    <div class="info"><span class="chip"><i></i>${it.name.split('.').pop().toUpperCase()}</span><span class="chip">${fmtSize(it.size)}</span>${tags.map((t) => `<span class="chip">${t}</span>`).join('')}</div>
    ${status}`;
  const acts = [];
  if (it.state === 'done') acts.push(`<button class="ib" data-act="open" title="${t('Open')}">${svg('open')}</button><button class="ib" data-act="reveal" title="${t('Show in the folder')}">${svg('reveal')}</button>`);
  if (it.state === 'running') acts.push(`<button class="ib" data-act="cancel" title="${t('Cancel')}">${svg('cancel')}</button>`);
  else acts.push(`<button class="ib" data-act="remove" title="${t('Remove')}">${svg('remove')}</button>`);
  it.el.querySelector('.actions').innerHTML = acts.join('');
  it.el.querySelector('.bar').style.width = it.state === 'running' ? `${Math.max(3, it.progress * 100)}%` : '0';
}

$('#list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const it = items.find((i) => i.el.contains(b));
  const act = b.dataset.act;
  if (act === 'open') window.api.open(it.out);
  if (act === 'reveal') window.api.reveal(it.out);
  if (act === 'cancel') window.api.cancel(it.id);
  if (act === 'remove') removeItem(it);
});

function removeItem(it) {
  it.el.remove();
  items.splice(items.indexOf(it), 1);
  refreshAll();
}

function refreshAll() {
  const has = items.length > 0;
  $('.left').classList.toggle('has-files', has);
  $('#drop').classList.toggle('compact', has);
  $('#listHead').hidden = !has;
  $('#count').textContent = t('{n} files · {size}', { n: items.length, size: fmtSize(items.reduce((a, i) => a + i.size, 0)) });
  $('#start').disabled = busy || !items.some((i) => i.state === 'idle' || i.state === 'error');
  $('#start').hidden = busy;
  $('#stop').hidden = !busy;
  const done = items.filter((i) => i.state === 'done');
  if (done.length) {
    const before = done.reduce((a, i) => a + i.size, 0);
    const after = done.reduce((a, i) => a + i.outSize, 0);
    $('#summary span').textContent = t('{a}/{b} done · {before} → {after}', { a: done.length, b: items.length, before: fmtSize(before), after: fmtSize(after) });
  }
  $('#summary').hidden = !done.length;
  refreshSettings();
}

// ---------- Converting ----------
window.api.onProgress(({ id, progress }) => {
  const it = items.find((i) => i.id === id);
  if (it && it.state === 'running') { it.progress = progress; renderItem(it); }
});

async function runOne(it) {
  if (stopRequested) { it.state = 'idle'; renderItem(it); return; }
  it.state = 'running';
  it.progress = 0;
  renderItem(it);
  const r = await window.api.convert({ id: it.id, file: it.file, kind: it.kind, options: optionsFor(it) });
  if (r.ok) Object.assign(it, { state: 'done', out: r.out, outSize: r.size });
  else Object.assign(it, { state: 'error', error: r.error });
  renderItem(it);
  refreshAll();
}

async function start() {
  const todo = items.filter((i) => i.state === 'idle' || i.state === 'error');
  if (!todo.length) return;
  busy = true;
  stopRequested = false;
  todo.forEach((i) => { i.state = 'queued'; renderItem(i); });
  refreshAll();

  // pictures three at a time; videos and sound one by one (ffmpeg already uses every core)
  const imgs = todo.filter((i) => i.kind === 'image');
  const media = todo.filter((i) => i.kind !== 'image');
  const imgWorker = async () => { while (imgs.length) await runOne(imgs.shift()); };
  await Promise.all([imgWorker(), imgWorker(), imgWorker()]);
  for (const m of media) await runOne(m);

  items.filter((i) => i.state === 'queued').forEach((i) => { i.state = 'idle'; renderItem(i); });
  busy = false;
  refreshAll();
}

$('#start').addEventListener('click', start);
$('#stop').addEventListener('click', () => {
  stopRequested = true;
  items.filter((i) => i.state === 'running').forEach((i) => window.api.cancel(i.id));
});
$('#browse').addEventListener('click', async () => addPaths(await window.api.pickFiles(S.lang)));
$('#addMore').addEventListener('click', async () => addPaths(await window.api.pickFiles(S.lang)));
$('#clearDone').addEventListener('click', () => items.filter((i) => i.state === 'done').forEach(removeItem));
$('#clearAll').addEventListener('click', () => items.filter((i) => i.state !== 'running').forEach(removeItem));

// drop anywhere on the window
let dragDepth = 0;
document.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; $('#drop').classList.add('over'); });
document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#drop').classList.remove('over'); } });
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  $('#drop').classList.remove('over');
  const paths = [...e.dataTransfer.files].map((f) => window.api.pathForFile(f)).filter(Boolean);
  addPaths(paths);
});

// the glass lens that slides to the chosen option of every .seg
function placeLenses() {
  for (const box of $$('.seg')) {
    let lens = box.querySelector('.lens');
    if (!lens) { lens = document.createElement('span'); lens.className = 'lens'; box.prepend(lens); }
    const on = box.querySelector('button.on');
    lens.hidden = !on;
    if (on && on.offsetWidth) { lens.style.left = on.offsetLeft + 'px'; lens.style.width = on.offsetWidth + 'px'; }
  }
}
const lensObserver = new ResizeObserver(() => placeLenses());
$$('.seg').forEach((box) => lensObserver.observe(box));

// a new version downloaded in the background: one tap restarts into it
const showUpdate = (u) => { $('#update').hidden = u?.status !== 'ready'; };
window.api.update.state().then(showUpdate);
window.api.update.on(showUpdate);
$('#update').addEventListener('click', () => window.api.update.install());

window.api.platform().then((p) => document.body.classList.add(p));
bindSettings();
applyLang();
