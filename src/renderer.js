const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const items = []; // { id, file, name, kind, size, width, height, duration, state, progress, out, outSize, error, el }
let nextId = 1;
let busy = false;
let stopRequested = false;
let platform = '';

// ---------- What can be made ----------
// [value, name, what it is for, 'mac' when only a Mac can make it]
const IMG_FORMATS = [
  ['original', 'Same', 'as original'],
  ['jpeg', 'JPG', 'photos'],
  ['webp', 'WebP', 'web'],
  ['avif', 'AVIF', 'smallest'],
  ['heic', 'HEIC', 'Apple', 'mac'],
  ['png', 'PNG', 'transparency'],
  ['tiff', 'TIFF', 'print'],
  ['gif', 'GIF', 'moving'],
  ['bmp', 'BMP', 'uncompressed'],
  ['ico', 'ICO', 'icon'],
];
const VID_GROUPS = [
  ['Share', [
    ['mp4-h264', 'MP4', 'H.264'],
    ['mp4-h265', 'MP4', 'H.265'],
    ['mp4-av1', 'MP4', 'AV1'],
    ['webm-vp9', 'WebM', 'VP9'],
    ['mov-h264', 'MOV', 'H.264'],
    ['mkv-h265', 'MKV', 'H.265'],
    ['mkv-h264', 'MKV', 'H.264'],
    ['avi', 'AVI', 'MPEG-4'],
    ['mpg-mpeg2', 'MPG', 'MPEG-2'],
  ]],
  ['Edit', [
    ['mov-prores', 'ProRes', 'MOV'],
    ['mov-dnxhr', 'DNxHR', 'MOV'],
    ['mxf-dnxhr', 'DNxHR', 'MXF · Avid'],
    ['mxf-mpeg2', 'XDCAM', 'MXF · 50 Mb/s'],
    ['mkv-ffv1', 'FFV1', 'lossless'],
  ]],
  ['Moving', [
    ['gif', 'GIF', 'from a clip'],
    ['webp-anim', 'WebP', 'animated'],
  ]],
  ['Sound', [
    ['mp3', 'MP3', 'everywhere'],
    ['m4a', 'M4A', 'AAC'],
    ['wav24', 'WAV', '24-bit'],
    ['wav', 'WAV', '16-bit'],
    ['aiff', 'AIFF', '24-bit'],
    ['alac', 'ALAC', 'lossless'],
    ['flac', 'FLAC', 'lossless'],
    ['ogg', 'OGG', 'Opus'],
  ]],
  ['Still', [
    ['frame-jpg', 'JPG', 'one frame'],
    ['frame-png', 'PNG', 'one frame'],
  ]],
];
const NOTES = {
  original: 'Keeps each picture’s own format, only smaller.',
  jpeg: 'The safest choice for photos: every phone, browser and app opens it.',
  webp: 'About a third smaller than JPG, for websites.',
  avif: 'The smallest for the web; recent browsers only.',
  heic: 'What iPhones use: half the size of JPG. Made with the Mac’s own tools.',
  png: 'Sharp edges and transparency, for logos and screenshots.',
  tiff: 'For print and retouching.',
  gif: 'Few colours; use WebP for anything new.',
  bmp: 'Uncompressed, for old software.',
  ico: 'An icon up to 256 px, for Windows and websites.',
  'mp4-h264': 'Plays everywhere: phones, the web, every editor.',
  'mp4-h265': 'Half the size of H.264 for the same picture; every recent phone and computer plays it.',
  'mp4-av1': 'The smallest of all, slow to make; recent browsers and phones.',
  'webm-vp9': 'For websites; Chrome, Firefox and Edge.',
  'mov-h264': 'H.264 in QuickTime’s own file.',
  'mkv-h265': 'H.265 in MKV, for media players and archives.',
  'mkv-h264': 'H.264 in MKV, for media players.',
  avi: 'For old players and TVs.',
  'mpg-mpeg2': 'MPEG-2, for DVD authoring and old TV systems.',
  'mov-prores': 'Apple’s editing codec: Final Cut, Premiere, Resolve. Big files, light to edit.',
  'mov-dnxhr': 'Avid’s editing codec in a QuickTime file, for Resolve and Premiere.',
  'mxf-dnxhr': 'DNxHR in MXF, as Avid Media Composer likes it. Sound at 24-bit 48 kHz.',
  'mxf-mpeg2': 'XDCAM HD422, 50 Mbit/s: what broadcasters ask for. Sound at 24-bit 48 kHz.',
  'mkv-ffv1': 'Lossless, for an archive: every frame exactly as it was, smaller than uncompressed.',
  'webp-anim': 'A moving picture far smaller than GIF.',
  mp3: 'Plays everywhere.',
  m4a: 'AAC: smaller than MP3 at the same quality.',
  wav24: 'For the mix: 24-bit, 48 kHz, uncompressed.',
  wav: 'CD quality, uncompressed.',
  aiff: 'Uncompressed, the Mac’s own; 24-bit.',
  alac: 'Lossless and half the size of WAV; Apple Music and iPhone.',
  flac: 'Lossless and half the size of WAV.',
  ogg: 'Opus: the smallest for speech and music.',
  'frame-jpg': 'One frame as a JPG, at the moment you set in More options.',
  'frame-png': 'One frame as a PNG, at the moment you set in More options.',
};
const PROFILES = {
  prores: [['proxy', 'Proxy'], ['lt', 'LT'], ['422', '422'], ['hq', 'HQ'], ['4444', '4444']],
  dnxhr: [['lb', 'LB'], ['sq', 'SQ'], ['hq', 'HQ'], ['hqx', 'HQX'], ['444', '444']],
};
const RESOLUTIONS = [['0', 'Original'], ['2160', '4K'], ['1440', '1440p'], ['1080', '1080p'], ['720', '720p'], ['480', '480p'], ['custom', 'Custom…']];
const ASPECTS = [['', 'Original'], ['16:9', '16:9'], ['9:16', '9:16'], ['1:1', '1:1'], ['4:5', '4:5'], ['2.39:1', '2.39:1']];
const DESQUEEZE = [['0', 'None'], ['1.33', '1.33×'], ['1.5', '1.5×'], ['1.8', '1.8×'], ['2', '2×']];
const LOUDNESS = [['0', 'Off'], ['-14', '−14 LUFS · web'], ['-16', '−16 · podcast'], ['-23', '−23 · TV']];
const CHANNELS = [['0', 'Original'], ['2', 'Stereo'], ['1', 'Mono']];
const RATES = [['0', 'Original'], ['44100', '44.1 kHz'], ['48000', '48 kHz']];
const IMG_DIMS = [['0', 'Original'], ['3840', '4K'], ['2560', '2560'], ['1920', '1920'], ['1080', '1080'], ['800', '800'], ['custom', 'Custom…']];
const GIF_WIDTHS = [['320', '320'], ['480', '480'], ['640', '640'], ['800', '800'], ['1080', '1080']];

const AUDIO_FORMATS = ['mp3', 'm4a', 'wav', 'wav24', 'aiff', 'alac', 'flac', 'ogg'];
const LOSSLESS_AUDIO = ['wav', 'wav24', 'aiff', 'alac', 'flac'];
const HW_FORMATS = ['mp4-h264', 'mp4-h265', 'mov-h264', 'mkv-h264', 'mkv-h265'];
const PRO = { 'mov-prores': 'prores', 'mov-dnxhr': 'dnxhr', 'mxf-dnxhr': 'dnxhr' };
const FIXED = ['mxf-mpeg2', 'mkv-ffv1'];

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
  proresProfile: '422', dnxhrProfile: 'hq', hw: false,
  vidWidth: '', vidHeight: '', hdrToSdr: true, lutPath: '', aspect: '', reframe: 'crop', desqueeze: '0',
  loudness: '0', channels: '0', sampleRate: '0', bitrateMbps: '', twoPass: false, keyframes: '',
  outMode: 'same', outDir: '', suffix: '_converted',
};

let S = { ...DEFAULTS };
try { S = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('settings') || '{}') }; } catch {}
const save = () => { try { localStorage.setItem('settings', JSON.stringify(S)); } catch {} };

// ---------- Words: English is the key, Greek the choice (as in the other Roar apps) ----------
const EL = {"Restart to update": "Επανεκκίνηση για ενημέρωση", "Every <b>format</b>.<br>A smaller <b>file</b>.": "Κάθε <b>μορφή</b>.<br>Μικρότερο <b>αρχείο</b>.", "Pictures, videos and sound: convert and compress them, all on your own computer.": "Εικόνες, βίντεο και ήχος: μετατροπή και συμπίεση, όλα τοπικά στον υπολογιστή σου.", "Drop pictures, videos, sound or folders here": "Σύρε εδώ εικόνες, βίντεο, ήχο ή φακέλους", "Choose files": "Επιλογή αρχείων", "Add": "Προσθήκη", "Clear finished": "Καθαρισμός ολοκληρωμένων", "Remove all": "Αφαίρεση όλων", "Drop more anywhere on the window": "Ρίξε κι άλλα οπουδήποτε στο παράθυρο", "Drop to add": "Άφησέ τα για να προστεθούν", "Compression": "Συμπίεση", "Small file": "Μικρό αρχείο", "Balanced": "Ισορροπία", "Quality": "Ποιότητα", "Save as": "Μορφή εξόδου", "Profile": "Προφίλ", "Largest side": "Μεγάλη πλευρά", "Resolution": "Ανάλυση", "Width": "Πλάτος", "Original": "Αρχική", "Custom…": "Δική σου…", "Keep EXIF and metadata": "Διατήρηση EXIF και μεταδεδομένων", "Mac hardware encoding": "Κωδικοποίηση με το hardware του Mac", "Several times faster, a little bigger.": "Πολλές φορές πιο γρήγορα, λίγο μεγαλύτερο αρχείο.", "More options": "Περισσότερες επιλογές", "Target file size": "Στόχος μεγέθους αρχείου", "e.g. 25": "π.χ. 25", "When set, the quality is left aside and the file aims at this size (25 MB for email or Discord, say).": "Αν οριστεί, αγνοείται η ποιότητα και η συμπίεση στοχεύει σε αυτό το μέγεθος (π.χ. 25 MB για email ή Discord).", "Encoding speed": "Ταχύτητα κωδικοποίησης", "Fast": "Γρήγορη", "Normal": "Κανονική", "Slow": "Αργή", "Sound": "Ήχος", "End": "Τέλος", "the end": "τέλος", "Remove the sound": "Αφαίρεση ήχου", "Keep metadata": "Διατήρηση μεταδεδομένων", "Save to": "Αποθήκευση σε", "Same folder": "Ίδιο φάκελο", "Another folder…": "Άλλο φάκελο…", "Added to the name": "Κατάληξη ονόματος", "Stop": "Διακοπή", "Next to the original file": "Δίπλα στο αρχικό αρχείο", "At": "Χρονική στιγμή", "Start": "Αρχή", "Pictures": "Εικόνες", "Video & Sound": "Βίντεο & Ήχος", "Waiting": "Σε αναμονή", "Open": "Άνοιγμα", "Show in the folder": "Εμφάνιση στον φάκελο", "Cancel": "Ακύρωση", "Remove": "Αφαίρεση", "{n} files · {size}": "{n} αρχεία · {size}", "{a}/{b} done · saved {s}": "{a}/{b} έτοιμα · κερδήθηκαν {s}", "Convert": "Μετατροπή", "Convert 1 file": "Μετατροπή 1 αρχείου", "Convert {n} files": "Μετατροπή {n} αρχείων", "Ready · {f}": "Έτοιμο · {f}", "Cancelled": "Ακυρώθηκε", "The file has no sound": "Το αρχείο δεν έχει ήχο", "The file has no picture": "Το αρχείο δεν έχει εικόνα", "The file has no video": "Το αρχείο δεν έχει εικόνα βίντεο", "Cannot read the picture": "Δεν διαβάζεται η εικόνα", "Cannot save in this format": "Δεν γίνεται αποθήκευση σε αυτή τη μορφή", "Unknown format": "Άγνωστη μορφή", "Opens only on a Mac for now": "Ανοίγει μόνο σε Mac προς το παρόν", "HEIC can be saved only on a Mac": "Το HEIC σώζεται μόνο σε Mac", "<b>{n} left out:</b> {names}. Roarverter does not read these files.": "<b>{n} έμειναν έξω:</b> {names}. Το Roarverter δεν διαβάζει αυτά τα αρχεία.", "<b>{n} left out:</b> {names}. RAW, JPEG XL and PDF open only on a Mac for now.": "<b>{n} έμειναν έξω:</b> {names}. Τα RAW, JPEG XL και PDF ανοίγουν μόνο σε Mac προς το παρόν.", "Same": "Ίδια", "print": "εκτύπωση", "uncompressed": "χωρίς συμπίεση", "from a clip": "από ένα clip", "animated": "κινούμενο", "everywhere": "παντού", "lossless": "χωρίς απώλειες", "one frame": "ένα καρέ", "Keeps each picture’s own format, only smaller.": "Κρατά τη μορφή κάθε εικόνας, μόνο μικρότερη.", "The safest choice for photos: every phone, browser and app opens it.": "Η πιο σίγουρη επιλογή για φωτογραφίες: την ανοίγει κάθε κινητό, browser και εφαρμογή.", "About a third smaller than JPG, for websites.": "Περίπου ένα τρίτο μικρότερο από το JPG, για sites.", "The smallest for the web; recent browsers only.": "Το μικρότερο για το web· μόνο σε πρόσφατους browsers.", "What iPhones use: half the size of JPG. Made with the Mac’s own tools.": "Αυτό που χρησιμοποιούν τα iPhone: το μισό του JPG. Φτιάχνεται με τα εργαλεία του ίδιου του Mac.", "Sharp edges and transparency, for logos and screenshots.": "Καθαρές άκρες και διαφάνεια, για λογότυπα και screenshots.", "For print and retouching.": "Για εκτύπωση και ρετούς.", "Few colours; use WebP for anything new.": "Λίγα χρώματα· για κάτι καινούργιο προτίμησε WebP.", "Uncompressed, for old software.": "Χωρίς συμπίεση, για παλιά προγράμματα.", "An icon up to 256 px, for Windows and websites.": "Εικονίδιο ως 256 px, για Windows και sites.", "Plays everywhere: phones, the web, every editor.": "Παίζει παντού: κινητά, web, κάθε πρόγραμμα μοντάζ.", "Half the size of H.264 for the same picture; every recent phone and computer plays it.": "Το μισό του H.264 για την ίδια εικόνα· το παίζει κάθε πρόσφατο κινητό και υπολογιστής.", "The smallest of all, slow to make; recent browsers and phones.": "Το μικρότερο απ’ όλα, αργό στη δημιουργία· πρόσφατοι browsers και κινητά.", "For websites; Chrome, Firefox and Edge.": "Για sites· Chrome, Firefox και Edge.", "H.264 in QuickTime’s own file.": "H.264 στο αρχείο του QuickTime.", "H.265 in MKV, for media players and archives.": "H.265 σε MKV, για media players και αρχεία.", "H.264 in MKV, for media players.": "H.264 σε MKV, για media players.", "For old players and TVs.": "Για παλιά players και τηλεοράσεις.", "MPEG-2, for DVD authoring and old TV systems.": "MPEG-2, για DVD και παλιά τηλεοπτικά συστήματα.", "Apple’s editing codec: Final Cut, Premiere, Resolve. Big files, light to edit.": "Ο codec μοντάζ της Apple: Final Cut, Premiere, Resolve. Μεγάλα αρχεία, ελαφριά στο μοντάζ.", "Avid’s editing codec in a QuickTime file, for Resolve and Premiere.": "Ο codec μοντάζ της Avid σε αρχείο QuickTime, για Resolve και Premiere.", "DNxHR in MXF, as Avid Media Composer likes it. Sound at 24-bit 48 kHz.": "DNxHR σε MXF, όπως το θέλει το Avid Media Composer. Ήχος 24-bit 48 kHz.", "XDCAM HD422, 50 Mbit/s: what broadcasters ask for. Sound at 24-bit 48 kHz.": "XDCAM HD422, 50 Mbit/s: αυτό που ζητούν τα κανάλια. Ήχος 24-bit 48 kHz.", "Lossless, for an archive: every frame exactly as it was, smaller than uncompressed.": "Χωρίς απώλειες, για αρχειοθέτηση: κάθε καρέ ακριβώς όπως ήταν, μικρότερο από ασυμπίεστο.", "A moving picture far smaller than GIF.": "Κινούμενη εικόνα πολύ μικρότερη από GIF.", "Plays everywhere.": "Παίζει παντού.", "AAC: smaller than MP3 at the same quality.": "AAC: μικρότερο από MP3 στην ίδια ποιότητα.", "For the mix: 24-bit, 48 kHz, uncompressed.": "Για τη μίξη: 24-bit, 48 kHz, ασυμπίεστο.", "CD quality, uncompressed.": "Ποιότητα CD, ασυμπίεστο.", "Uncompressed, the Mac’s own; 24-bit.": "Ασυμπίεστο, του Mac· 24-bit.", "Lossless and half the size of WAV; Apple Music and iPhone.": "Χωρίς απώλειες και το μισό του WAV· Apple Music και iPhone.", "Lossless and half the size of WAV.": "Χωρίς απώλειες και το μισό του WAV.", "Opus: the smallest for speech and music.": "Opus: το μικρότερο για ομιλία και μουσική.", "One frame as a JPG, at the moment you set in More options.": "Ένα καρέ σε JPG, τη στιγμή που ορίζεις στις Περισσότερες επιλογές.", "One frame as a PNG, at the moment you set in More options.": "Ένα καρέ σε PNG, τη στιγμή που ορίζεις στις Περισσότερες επιλογές.", "as original": "όπως το αρχικό", "photos": "φωτογραφίες", "web": "web", "smallest": "το μικρότερο", "transparency": "διαφάνεια", "moving": "κινούμενο", "icon": "εικονίδιο", "Share": "Κοινοποίηση", "Edit": "Μοντάζ", "Moving": "Κίνηση", "Still": "Στιγμιότυπο", "{a}/{b} done": "{a}/{b} έτοιμα", "Look & frame": "Εικόνα & κάδρο", "HDR to Rec.709": "HDR σε Rec.709", "iPhone and HDR videos look right everywhere, not grey.": "Τα βίντεο HDR και του iPhone φαίνονται σωστά παντού, όχι γκρίζα.", "LUT": "LUT", "Choose a .cube…": "Διάλεξε ένα .cube…", "Frame": "Κάδρο", "Crop": "Κόψιμο", "Fit, blurred edges": "Ολόκληρο, θολές άκρες", "fit": "ολόκληρο", "Anamorphic": "Anamorphic", "None": "Κανένα", "Loudness": "Ένταση", "Off": "Όχι", "−14 LUFS · web": "−14 LUFS · web", "−16 · podcast": "−16 · podcast", "−23 · TV": "−23 · TV", "Channels": "Κανάλια", "Stereo": "Στέρεο", "Mono": "Μονό", "Sample rate": "Συχνότητα", "Bitrate": "Bitrate", "Target size": "Στόχος μεγέθους", "Or a bitrate": "Ή bitrate", "e.g. 8": "π.χ. 8", "When either is set, the quality is left aside: a size for email or Discord, a bitrate as Resolve’s “Restrict to”.": "Όταν οριστεί ένα από τα δύο, αγνοείται η ποιότητα: μέγεθος για email ή Discord, bitrate όπως το «Restrict to» του Resolve.", "Two passes": "Δύο περάσματα", "Lands on the size or bitrate, takes twice as long.": "Πέφτει ακριβώς στο μέγεθος ή στο bitrate, θέλει διπλό χρόνο.", "Keyframe every": "Keyframe κάθε", "frames": "καρέ", "auto": "αυτόματα"};
const t = (en, vars = {}) => {
  let s = (S.lang === 'el' && EL[en]) || en;
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
};
// errors from convert.js come in English, as "Message" or "Message: detail"
const tErr = (msg) => { const [head, ...rest] = String(msg).split(': '); return EL[head] ? [t(head), ...rest].join(': ') : msg; };

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
function parseTime(v) {
  v = String(v || '').trim().replace(',', '.');
  if (!v) return 0;
  return v.split(':').reduce((acc, p) => acc * 60 + (parseFloat(p) || 0), 0);
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
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};
const svg = (name) => `<svg viewBox="0 0 24 24">${ICON[name]}</svg>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- What is chosen ----------
function vidCategory(f = S.vidFormat) {
  if (AUDIO_FORMATS.includes(f)) return 'audio';
  if (f === 'gif' || f === 'webp-anim') return 'anim';
  if (f.startsWith('frame-')) return 'frame';
  if (PRO[f]) return 'pro';
  if (FIXED.includes(f)) return 'fixed';
  return 'video';
}
const vidLabel = (f) => { for (const [, list] of VID_GROUPS) for (const [v, n, d] of list) if (v === f) return `${n} · ${t(d)}`; return f; };
const imgLabel = (f) => (IMG_FORMATS.find(([v]) => v === f) || [, f])[1];
const isMac = () => platform === 'darwin';

// ---------- Drawing the choices ----------
const fmtTile = ([v, n, d, only], on) =>
  `<button class="fmt${on ? ' on' : ''}${only ? ' mac' : ''}" data-v="${v}" title="${esc(t(NOTES[v] || ''))}"><b>${n}</b><small>${esc(t(d))}</small></button>`;
// the video formats show one group at a time; the group of the chosen format opens by itself
let vidGroup = null;
const groupOf = (f) => VID_GROUPS.find(([, list]) => list.some(([v]) => v === f))?.[0] || VID_GROUPS[0][0];
function drawFormats() {
  $('#imgGrid').innerHTML = IMG_FORMATS.filter((f) => f[3] !== 'mac' || isMac()).map((f) => fmtTile(f, f[0] === S.imgFormat)).join('');
  const g = vidGroup || groupOf(S.vidFormat);
  const here = groupOf(S.vidFormat);
  setButtons($('#vidGroups'), VID_GROUPS.map(([name]) => `<button data-v="${name}" class="${name === g ? 'on' : ''}">${esc(t(name))}${name === here && name !== g ? '<i></i>' : ''}</button>`).join(''));
  $('#vidGrid').innerHTML = `<div class="grid">${VID_GROUPS.find(([name]) => name === g)[1].map((f) => fmtTile(f, f[0] === S.vidFormat)).join('')}</div>`;
  $('#imgNote').textContent = t(NOTES[S.imgFormat] || '');
  $('#vidNote').textContent = t(NOTES[S.vidFormat] || '');
}
// redraws a row of buttons and keeps a .seg's glass lens, so it slides instead of jumping
const setButtons = (el, html) => { const lens = el.querySelector(':scope > .lens'); el.innerHTML = html; if (lens) el.prepend(lens); };
const chipRow = (el, list, value) => { setButtons(el, list.map(([v, l]) => `<button data-v="${v}" class="${v === String(value) ? 'on' : ''}">${esc(t(l))}</button>`).join('')); };
function drawChips() {
  chipRow($('#imgDims'), IMG_DIMS, S.imgMaxDim);
  chipRow($('#vidRes'), RESOLUTIONS, S.vidRes);
  chipRow($('#gifWidth'), GIF_WIDTHS.map(([v, l]) => [v, `${l} px`]), S.gifWidth);
  chipRow($('#aspect'), ASPECTS, S.aspect);
  chipRow($('#desqueeze'), DESQUEEZE, S.desqueeze);
  chipRow($('#loudness'), LOUDNESS, S.loudness);
  chipRow($('#channels'), CHANNELS, S.channels);
  chipRow($('#sampleRate'), RATES, S.sampleRate);
  const pro = PRO[S.vidFormat];
  if (pro) {
    const cur = pro === 'prores' ? S.proresProfile : S.dnxhrProfile;
    setButtons($('#profile'), PROFILES[pro].map(([v, l]) => `<button data-v="${v}" class="${v === cur ? 'on' : ''}">${l}</button>`).join(''));
  }
  for (const box of $$('[data-presets]')) {
    setButtons(box, [['small', 'Small file'], ['balanced', 'Balanced'], ['quality', 'Quality']]
      .map(([v, l]) => `<button data-v="${v}" class="${v === S.preset ? 'on' : ''}">${esc(t(l))}</button>`).join(''));
  }
}

function applyLang() {
  document.documentElement.lang = S.lang;
  for (const el of $$('[data-i18n]')) { el.dataset.en ??= el.textContent; el.textContent = t(el.dataset.en); }
  for (const el of $$('[data-i18n-html]')) { el.dataset.en ??= el.innerHTML; el.innerHTML = t(el.dataset.en); }
  for (const el of $$('[data-i18n-ph]')) { el.dataset.en ??= el.placeholder; el.placeholder = t(el.dataset.en); }
  $$('#lang button').forEach((b) => b.classList.toggle('on', b.dataset.v === S.lang));
  items.forEach(renderItem);
  refreshAll();
}

// ---------- Settings ----------
function bindSettings() {
  for (const k of Object.keys(DEFAULTS)) {
    const el = document.getElementById(k);
    if (!el || !['INPUT', 'SELECT'].includes(el.tagName)) continue;
    if (el.type === 'checkbox') el.checked = !!S[k];
    else el.value = S[k];
    el.addEventListener('input', () => {
      S[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value;
      if (['imgQuality', 'vidQuality', 'vidAudio'].includes(k)) S.preset = null;
      refreshSettings();
      save();
    });
  }
  const pick = (sel, fn) => $(sel).addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (b) { fn(b.dataset.v); refreshSettings(); save(); } });
  pick('#lang', (v) => { S.lang = v; applyLang(); });
  pick('#imgGrid', (v) => { S.imgFormat = v; });
  pick('#vidGrid', (v) => { S.vidFormat = v; vidGroup = null; });
  $('#vidGroups').addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (b) { vidGroup = b.dataset.v; refreshSettings(); } });
  pick('#imgDims', (v) => { S.imgMaxDim = v; S.preset = null; });
  pick('#vidRes', (v) => { S.vidRes = v; S.preset = null; });
  pick('#gifWidth', (v) => { S.gifWidth = v; });
  pick('#profile', (v) => { if (PRO[S.vidFormat] === 'prores') S.proresProfile = v; else S.dnxhrProfile = v; });
  pick('#vidSpeed', (v) => { S.vidSpeed = v; S.preset = null; });
  pick('#aspect', (v) => { S.aspect = v; });
  pick('#reframe', (v) => { S.reframe = v; });
  pick('#desqueeze', (v) => { S.desqueeze = v; });
  pick('#loudness', (v) => { S.loudness = v; });
  pick('#channels', (v) => { S.channels = v; });
  pick('#sampleRate', (v) => { S.sampleRate = v; });
  $('#lutPick').addEventListener('click', async () => { const f = await window.api.pickLut(); if (f) { S.lutPath = f; refreshSettings(); save(); } });
  $('#lutClear').addEventListener('click', () => { S.lutPath = ''; refreshSettings(); save(); });
  for (const box of $$('[data-presets]')) {
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      Object.assign(S, PRESETS[b.dataset.v]);
      S.preset = b.dataset.v;
      for (const [k, v] of Object.entries(PRESETS[b.dataset.v])) { const el = document.getElementById(k); if (el && el.tagName !== 'DIV') el.value = v; }
      refreshSettings();
      save();
    });
  }
  $('#outMode').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    if (b.dataset.v === 'custom') {
      const dir = await window.api.pickFolder();
      if (!dir) return;
      S.outDir = dir;
    }
    S.outMode = b.dataset.v;
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

function refreshSettings() {
  drawFormats();
  drawChips();
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
  $$('.panel').forEach((p) => (p.hidden = p.dataset.panel !== S.tab));
  $$('#vidSpeed button').forEach((b) => b.classList.toggle('on', b.dataset.v === S.vidSpeed));
  $$('#reframe button').forEach((b) => b.classList.toggle('on', b.dataset.v === S.reframe));
  $$('#outMode button').forEach((b) => b.classList.toggle('on', b.dataset.v === S.outMode));
  $('#outDir').textContent = S.outMode === 'custom' && S.outDir ? S.outDir : t('Next to the original file');
  $('#imgQualityVal').textContent = S.imgQuality;
  $('#vidQualityVal').textContent = S.vidQuality;
  $('#imgMaxDimCustom').hidden = S.imgMaxDim !== 'custom';

  const cat = vidCategory();
  $$('[data-show]').forEach((el) => (el.hidden = !el.dataset.show.split(' ').includes(cat)));
  $('#hwRow').hidden = !(isMac() && HW_FORMATS.includes(S.vidFormat));
  $('#bitrateRow').hidden = !(cat === 'video' || (cat === 'audio' && !LOSSLESS_AUDIO.includes(S.vidFormat)));
  $('#trimStartLabel').textContent = cat === 'frame' ? t('At') : t('Start');
  $('#vidQuality').disabled = cat === 'video' && !!(S.vidTarget || S.bitrateMbps);
  $('#customSize').hidden = S.vidRes !== 'custom';
  $('#reframe').hidden = !S.aspect;
  // two passes only when a size or a bitrate is set, and not with the Mac's own encoder (it has no second pass)
  const hwOn = isMac() && S.hw && HW_FORMATS.includes(S.vidFormat);
  $('#twoPassRow').hidden = $('#twoPassRow').hidden || !(S.vidTarget || S.bitrateMbps) || hwOn;
  $('#lutChip').hidden = !S.lutPath;
  $('#lutPick').hidden = !!S.lutPath;
  $('#lutName').textContent = S.lutPath.split(/[\\/]/).pop();
  // what each closed box holds, in a few words
  $('#lookSum').textContent = lookWords().join(' · ');
  $('#soundSum').textContent = soundWords().join(' · ');

  // how many files each tab has
  const nImg = items.filter((i) => i.kind === 'image').length;
  const nVid = items.length - nImg;
  $('#tabs [data-tab=image]').innerHTML = `${t('Pictures')}${nImg ? `<small>${nImg}</small>` : ''}`;
  $('#tabs [data-tab=video]').innerHTML = `${t('Video & Sound')}${nVid ? `<small>${nVid}</small>` : ''}`;
  for (const r of $$('input[type=range]')) r.style.setProperty('--p', `${((r.value - r.min) / (r.max - r.min)) * 100}%`);
  placeLenses();
  refreshStart();
}

function lookWords() {
  const w = [];
  if (S.lutPath) w.push('LUT');
  if (S.aspect) w.push(`${S.aspect}${S.reframe === 'fit' ? ` ${t('fit')}` : ''}`);
  if (+S.desqueeze) w.push(`${S.desqueeze}×`);
  return w;
}
function soundWords() {
  const w = [];
  if (+S.loudness) w.push(`${S.loudness.replace('-', '−')} LUFS`);
  if (+S.channels) w.push(t(S.channels === '1' ? 'Mono' : 'Stereo'));
  if (+S.sampleRate) w.push(`${+S.sampleRate / 1000} kHz`);
  return w;
}

function optionsFor(item) {
  const common = { outputDir: S.outMode === 'custom' && S.outDir ? S.outDir : null, suffix: S.suffix };
  if (item.kind === 'image') {
    const dim = S.imgMaxDim === 'custom' ? +S.imgMaxDimCustom || 0 : +S.imgMaxDim;
    return { ...common, format: S.imgFormat, quality: S.imgQuality, maxDim: dim, keepMetadata: S.imgKeepMeta };
  }
  let format = S.vidFormat;
  if (item.kind === 'audio' && !AUDIO_FORMATS.includes(format)) format = 'mp3'; // a sound file can only become sound
  const pro = PRO[format];
  return {
    ...common,
    format,
    quality: S.vidQuality,
    profile: pro === 'prores' ? S.proresProfile : pro === 'dnxhr' ? S.dnxhrProfile : undefined,
    hw: S.hw && HW_FORMATS.includes(format),
    resolution: S.vidRes === 'custom' ? 0 : +S.vidRes,
    width: S.vidRes === 'custom' ? +S.vidWidth || 0 : 0,
    height: S.vidRes === 'custom' ? +S.vidHeight || 0 : 0,
    hdrToSdr: S.hdrToSdr,
    lut: S.lutPath || null,
    aspect: S.aspect,
    reframe: S.reframe,
    desqueeze: +S.desqueeze,
    loudness: +S.loudness,
    channels: +S.channels,
    sampleRate: +S.sampleRate,
    bitrateMbps: +S.bitrateMbps || 0,
    twoPass: S.twoPass,
    keyframes: +S.keyframes || 0,
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
function targetLabel(item) {
  if (item.kind === 'image') return S.imgFormat === 'original' ? t('Same') : imgLabel(S.imgFormat);
  const o = optionsFor(item);
  const pro = PRO[o.format];
  const extra = vidCategory(o.format) === 'audio' ? soundWords() : [...lookWords(), ...(item.kind === 'video' ? soundWords() : [])];
  return vidLabel(o.format) + (pro ? ` ${PROFILES[pro].find(([v]) => v === o.profile)?.[1] || ''}` : '') + (extra.length ? ` · ${extra.join(' · ')}` : '');
}

// ---------- The list ----------
let toastTimer;
function toast(html) {
  const el = $('#toast');
  el.innerHTML = html;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 7000);
}

async function addPaths(paths) {
  if (!paths.length) return;
  const existing = new Set(items.map((i) => i.file));
  const { files, skipped } = await window.api.inspect(paths);
  for (const info of files) {
    if (existing.has(info.file)) continue;
    const it = { id: nextId++, state: 'idle', progress: 0, ...info };
    items.push(it);
    renderItem(it);
  }
  if (skipped.length) {
    const names = esc(skipped.slice(0, 4).map((s) => s.name).join(', ') + (skipped.length > 4 ? '…' : ''));
    const mac = skipped.every((s) => s.macOnly);
    toast(t(mac ? '<b>{n} left out:</b> {names}. RAW, JPEG XL and PDF open only on a Mac for now.' : '<b>{n} left out:</b> {names}. Roarverter does not read these files.', { n: skipped.length, names }));
  }
  // open the tab of what was just added
  if (files.length && files.every((i) => i.kind !== 'image')) S.tab = 'video';
  else if (files.length && files.every((i) => i.kind === 'image')) S.tab = 'image';
  refreshAll();
}

function thumbHtml(it) {
  if (it.kind === 'image' && /\.(jpe?g|jfif|png|webp|avif|gif|bmp|svg)$/i.test(it.file)) return `<img src="${fileUrl(it.file)}" loading="lazy">`;
  if (it.kind === 'video') return `<video src="${fileUrl(it.file)}#t=1" preload="metadata" muted></video>`;
  return svg(it.kind);
}

function ring(p, wait) {
  const off = 113.1 * (1 - (p || 0));
  return `<div class="prog${wait ? ' wait' : ''}"><svg viewBox="0 0 44 44"><circle class="t" cx="22" cy="22" r="18"/><circle class="p" cx="22" cy="22" r="18" style="stroke-dashoffset:${wait ? 0 : off}"/></svg><b>${wait ? '' : Math.round((p || 0) * 100) + '%'}</b></div>`;
}

function renderItem(it) {
  if (!it.el) {
    it.el = document.createElement('li');
    it.el.innerHTML = `<div class="thumb">${thumbHtml(it)}</div><div class="meta"></div><div class="side"></div><div class="actions"></div>`;
    const media = it.el.querySelector('.thumb img, .thumb video');
    media?.addEventListener('error', () => (media.outerHTML = svg(it.kind)));
    $('#list').appendChild(it.el);
  }
  it.el.className = `item ${it.state}`;
  const tags = [];
  if (it.width) tags.push(`${it.width}×${it.height}`);
  if (it.duration) tags.push(fmtTime(it.duration));
  if (it.vcodec) tags.push(it.vcodec);
  let status = '';
  if (it.state === 'idle') status = `<div class="status">${esc(t('Ready · {f}', { f: targetLabel(it) }))}</div>`;
  else if (it.state === 'queued') status = `<div class="status">${esc(t('Waiting'))} · ${esc(it.target || targetLabel(it))}</div>`;
  else if (it.state === 'running') status = `<div class="status"><span class="to">${esc(it.target || targetLabel(it))}</span></div>`;
  else if (it.state === 'done') status = `<div class="status"><span class="to">${esc(it.out.split(/[\\/]/).pop())}</span></div>`;
  else if (it.state === 'error') status = `<div class="status err">${esc(tErr(it.error))}</div>`;
  it.el.querySelector('.meta').innerHTML = `
    <div class="name" title="${esc(it.file)}">${esc(it.name)}</div>
    <div class="info"><span class="chip"><i></i>${esc(it.name.split('.').pop().toUpperCase())}</span><span class="chip">${fmtSize(it.size)}</span>${tags.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>
    ${status}`;

  let side = '';
  if (it.state === 'running') side = ring(it.progress, !it.progress);
  else if (it.state === 'queued') side = ring(0, true);
  else if (it.state === 'done') {
    const ratio = it.outSize / it.size;
    const pct = Math.round((1 - ratio) * 100);
    const bad = pct < 0 && !it.grows;
    const cls = pct < 0 ? (it.grows ? 'grow' : 'bad') : '';
    side = `<div class="result"><span class="chip tint pct ${cls}"><i></i>${pct < 0 ? `+${-pct}%` : `−${pct}%`}</span>
      <span class="sizes">${fmtSize(it.size)} → <b>${fmtSize(it.outSize)}</b></span>
      <span class="bars ${cls}"><i style="width:${Math.max(2, Math.min(100, ratio * 100))}%"></i></span></div>`;
  }
  it.el.querySelector('.side').innerHTML = side;

  const acts = [];
  if (it.state === 'done') acts.push(`<button class="ib" data-act="open" title="${esc(t('Open'))}">${svg('open')}</button><button class="ib" data-act="reveal" title="${esc(t('Show in the folder'))}">${svg('reveal')}</button>`);
  if (it.state === 'running') acts.push(`<button class="ib" data-act="cancel" title="${esc(t('Cancel'))}">${svg('cancel')}</button>`);
  else acts.push(`<button class="ib" data-act="remove" title="${esc(t('Remove'))}">${svg('remove')}</button>`);
  it.el.querySelector('.actions').innerHTML = acts.join('');
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

function refreshStart() {
  const n = items.filter((i) => i.state === 'idle' || i.state === 'error').length;
  const b = $('#start');
  b.disabled = busy || !n;
  b.innerHTML = `${svg('arrow')}<span>${esc(n === 0 ? t('Convert') : n === 1 ? t('Convert 1 file') : t('Convert {n} files', { n }))}</span>`;
  b.hidden = busy;
  $('#stop').hidden = !busy;
}

function refreshAll() {
  const has = items.length > 0;
  $('#home').hidden = has;
  $('#work').hidden = !has;
  $('#count').textContent = t('{n} files · {size}', { n: items.length, size: fmtSize(items.reduce((a, i) => a + i.size, 0)) });
  const done = items.filter((i) => i.state === 'done');
  $('#summary').hidden = !done.length;
  if (done.length) {
    const saved = done.reduce((a, i) => a + i.size - i.outSize, 0);
    $('#summary span').textContent = saved > 0
      ? t('{a}/{b} done · saved {s}', { a: done.length, b: items.length, s: fmtSize(saved) })
      : t('{a}/{b} done', { a: done.length, b: items.length });
  }
  items.filter((i) => i.state === 'idle').forEach(renderItem); // their "Ready · format" follows the settings
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
  const r = await window.api.convert({ id: it.id, file: it.file, kind: it.kind, options: it.options || optionsFor(it) });
  // editing and lossless formats are meant to be bigger: no warning colour for them
  const grows = !!(it.options && (PRO[it.options.format] || FIXED.includes(it.options.format) || LOSSLESS_AUDIO.includes(it.options.format)));
  if (r.ok) Object.assign(it, { state: 'done', out: r.out, outSize: r.size, options: null, grows });
  else Object.assign(it, { state: 'error', error: r.error, options: null, target: null });
  renderItem(it);
  refreshAll();
}

async function start() {
  const todo = items.filter((i) => i.state === 'idle' || i.state === 'error');
  if (!todo.length) return;
  busy = true;
  stopRequested = false;
  todo.forEach((i) => { i.state = 'queued'; i.target = targetLabel(i); i.options = optionsFor(i); renderItem(i); });
  refreshAll();

  // pictures three at a time; videos and sound one by one (ffmpeg already uses every core)
  const imgs = todo.filter((i) => i.kind === 'image');
  const media = todo.filter((i) => i.kind !== 'image');
  const imgWorker = async () => { while (imgs.length) await runOne(imgs.shift()); };
  await Promise.all([imgWorker(), imgWorker(), imgWorker()]);
  for (const m of media) await runOne(m);

  items.filter((i) => i.state === 'queued').forEach((i) => { i.state = 'idle'; i.options = null; i.target = null; renderItem(i); });
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
const dragOff = () => { dragDepth = 0; document.body.classList.remove('dragging'); $('#drop').classList.remove('over'); };
document.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; document.body.classList.add('dragging'); $('#drop').classList.add('over'); });
document.addEventListener('dragleave', () => { if (--dragDepth <= 0) dragOff(); });
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragOff();
  addPaths([...e.dataTransfer.files].map((f) => window.api.pathForFile(f)).filter(Boolean));
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

window.api.platform().then((p) => {
  platform = p;
  document.body.classList.add(p);
  if (S.imgFormat === 'heic' && !isMac()) S.imgFormat = 'jpeg';
  refreshAll();
});
bindSettings();
applyLang();
