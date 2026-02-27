// =============================================
// LYZY VISUALIZER - app.js v3
// =============================================

const _a = atob('bHl6eUBhZG1pbmFjY291bnQ=');
const _b = atob('bHl6eTEyMw==');

// =============================================
// STATE
// =============================================
let currentUser = null;
let isPremium = false;
let isAdminLoggedIn = false;
let audioContext = null;
let analyser = null;
let gainNode = null;
let eqFilters = [];
let micStream = null;
let audioSource = null;
let audioBuffer = null;
let animationId = null;
let isMicActive = false;
let bgImageUrl = null;
let uiHidden = false;
let audioPaused = false;
let audioStartTime = 0;
let audioOffset = 0;
let bpmHistory = [];
let lastBeat = 0;
let bpmFlashTimeout = null;
let stars = [];
let starsInitialized = false;

let overlayState = {
  showArtist: false, showSong: false, showWatermark: true,
  artist: '', song: '', position: 'bottom-left', textSize: 16,
};

let settings = {
  mode: 'bars', theme: 'neon', color1: '#00ffcc', color2: '#ff00ff',
  bgColor: '#0a0a0f', bgType: 'color', bgOpacity: 80,
  sensitivity: 5, smoothing: 80, barCount: 64, lineWidth: 2,
  rotSpeed: 3, glow: true, mirror: false, beatPulse: true,
  gradient: true, stars: false, flash: false, eq: 'flat',
};

let adminSettings = {
  price: 99, gcashNumber: '09538728759', gcashName: 'Lyzy Premium', announcement: '',
};

// =============================================
// STORAGE
// =============================================
const DB = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => { localStorage.setItem(k, JSON.stringify(v)); },
  getUsers: () => DB.get('lyzy_users') || [],
  saveUsers: (u) => DB.set('lyzy_users', u),
  getPayments: () => DB.get('lyzy_payments') || [],
  savePayments: (p) => DB.set('lyzy_payments', p),
  getActivity: () => DB.get('lyzy_activity') || [],
  saveActivity: (a) => DB.set('lyzy_activity', a),
  getSession: () => DB.get('lyzy_current_session'),
  saveSession: (u) => DB.set('lyzy_current_session', u),
  clearSession: () => localStorage.removeItem('lyzy_current_session'),
};

function logActivity(msg) {
  const log = DB.getActivity();
  log.unshift({ msg, time: new Date().toLocaleString() });
  if (log.length > 50) log.pop();
  DB.saveActivity(log);
}

// =============================================
// SPLASH SCREEN
// =============================================
function hideSplash() {
  const splash = document.getElementById('splash-screen');
  if (!splash) return;
  setTimeout(() => {
    splash.style.opacity = '0';
    splash.style.transition = 'opacity 0.6s ease';
    setTimeout(() => { splash.style.display = 'none'; }, 650);
  }, 1800);
}

// =============================================
// MOBILE CONTROLS
// =============================================
function toggleMobileControls() {
  const panel = document.getElementById('controls-panel');
  const backdrop = document.getElementById('panel-backdrop');
  panel.classList.toggle('open');
  backdrop.classList.toggle('show');
}

function closeMobileControls() {
  const panel = document.getElementById('controls-panel');
  const backdrop = document.getElementById('panel-backdrop');
  panel.classList.remove('open');
  backdrop.classList.remove('show');
}

function toggleMobileMenu() {
  document.getElementById('mobile-menu').classList.toggle('open');
}

function closeMobileMenu() {
  document.getElementById('mobile-menu').classList.remove('open');
}

// =============================================
// PAGE NAVIGATION
// =============================================
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById(id);
  if (page) page.classList.add('active');
  if (id === 'app-page') { setupAppCanvas(); updateUserDisplay(); }
  if (id === 'admin-panel-page' && isAdminLoggedIn) refreshAdminPanel();
  if (id === 'landing-page') startPreviewAnimation();
  closeMobileMenu();
}

// =============================================
// GOOGLE LOGIN
// =============================================
function handleGoogleLogin() {
  const CLIENT_ID = '957527068234-7glmq1efb9ujgrd5l49k0iu5oi2lvip8.apps.googleusercontent.com';
  if (typeof google === 'undefined' || !google.accounts) {
    showToast('⚠️ Google script loading, try again shortly.', 'error'); return;
  }
  google.accounts.id.initialize({
    client_id: CLIENT_ID,
    callback: (resp) => {
      const payload = parseJwt(resp.credential);
      loginUser(payload.name, payload.email, 'google');
    }
  });
  google.accounts.id.prompt();
}

function parseJwt(token) {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(base64));
}

// =============================================
// AUTH
// =============================================
function handleSignup() {
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const errEl = document.getElementById('signup-error');
  if (!name || !email || !password) { errEl.textContent = 'Please fill all fields.'; return; }
  if (!email.includes('@')) { errEl.textContent = 'Enter a valid email.'; return; }
  if (password.length < 6) { errEl.textContent = 'Password must be 6+ characters.'; return; }
  const users = DB.getUsers();
  if (users.find(u => u.email === email)) { errEl.textContent = 'Email already registered.'; return; }
  const user = { id: Date.now().toString(), name, email, password: btoa(unescape(encodeURIComponent(password))), plan: 'free', joined: new Date().toLocaleDateString() };
  users.push(user);
  DB.saveUsers(users);
  logActivity(`New user: ${name} (${email})`);
  errEl.textContent = '';
  loginUser(name, email, 'email');
}

function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  const users = DB.getUsers();
  const user = users.find(u => {
    try { return u.email === email && decodeURIComponent(escape(atob(u.password))) === password; }
    catch { return u.email === email && atob(u.password) === password; }
  });
  if (!user) { errEl.textContent = 'Invalid email or password.'; return; }
  errEl.textContent = '';
  logActivity(`Login: ${user.name}`);
  loginUser(user.name, email, 'email');
}

function loginUser(name, email, method) {
  const users = DB.getUsers();
  let user = users.find(u => u.email === email);
  if (!user && method === 'google') {
    user = { id: Date.now().toString(), name, email, password: '', plan: 'free', joined: new Date().toLocaleDateString() };
    users.push(user);
    DB.saveUsers(users);
    logActivity(`New Google user: ${name}`);
  }
  currentUser = { name: user ? user.name : name, email, plan: user ? user.plan : 'free' };
  isPremium = currentUser.plan === 'premium';
  DB.saveSession(currentUser);
  showPage('app-page');
  showToast(`Welcome, ${currentUser.name}! 🎵`, 'success');
}

function logout() {
  currentUser = null; isPremium = false;
  stopAudio(); DB.clearSession(); showPage('landing-page');
}

function checkSession() {
  const saved = DB.getSession();
  if (saved) {
    const users = DB.getUsers();
    const freshUser = users.find(u => u.email === saved.email);
    currentUser = freshUser ? { name: freshUser.name, email: freshUser.email, plan: freshUser.plan } : saved;
    isPremium = currentUser.plan === 'premium';
    return true;
  }
  return false;
}

// =============================================
// ADMIN LOGIN
// =============================================
function handleAdminLogin() {
  const u = document.getElementById('admin-username').value;
  const p = document.getElementById('admin-password').value;
  const err = document.getElementById('admin-login-error');
  if (u === _a && p === _b) {
    isAdminLoggedIn = true; err.textContent = '';
    document.getElementById('admin-username').value = '';
    document.getElementById('admin-password').value = '';
    showPage('admin-panel-page'); refreshAdminPanel();
  } else { err.textContent = 'Invalid credentials.'; }
}

function adminLogout() { isAdminLoggedIn = false; showPage('landing-page'); }

function checkAdminRoute() {
  if (window.location.hash === '#admin') showPage('admin-login-page');
}

// =============================================
// ADMIN PANEL
// =============================================
function showAdminTab(tab, btn) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  if (btn) btn.classList.add('active');
  refreshAdminPanel();
}

function refreshAdminPanel() {
  const users = DB.getUsers(), payments = DB.getPayments(), activity = DB.getActivity();
  const premiumUsers = users.filter(u => u.plan === 'premium');
  const pendingPayments = payments.filter(p => p.status === 'pending');
  const approvedPayments = payments.filter(p => p.status === 'approved');
  document.getElementById('stat-users').textContent = users.length;
  document.getElementById('stat-premium').textContent = premiumUsers.length;
  document.getElementById('stat-revenue').textContent = '₱' + (approvedPayments.length * (adminSettings.price || 99));
  document.getElementById('stat-pending').textContent = pendingPayments.length;

  const actEl = document.getElementById('activity-log');
  actEl.innerHTML = activity.length === 0
    ? '<p class="no-data">No recent activity</p>'
    : activity.slice(0, 10).map(a => `<div class="activity-item"><span style="color:var(--text-muted);font-size:0.75rem;min-width:120px;flex-shrink:0">${a.time}</span><span>${a.msg}</span></div>`).join('');

  renderUsersTable(users); renderPaymentsTable(payments);
  document.getElementById('admin-price').value = adminSettings.price;
  document.getElementById('admin-gcash').value = adminSettings.gcashNumber;
  document.getElementById('admin-gcash-name').value = adminSettings.gcashName;
  document.getElementById('admin-announcement').value = adminSettings.announcement || '';
}

function renderUsersTable(users) {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;
  tbody.innerHTML = users.length === 0
    ? '<tr><td colspan="5" class="no-data">No users yet</td></tr>'
    : users.map(u => `<tr>
        <td>${escHtml(u.name)}</td><td>${escHtml(u.email)}</td>
        <td><span class="status-badge ${u.plan === 'premium' ? 'status-approved' : 'status-pending'}">${u.plan}</span></td>
        <td>${u.joined}</td>
        <td style="display:flex;gap:0.3rem;flex-wrap:wrap">
          ${u.plan === 'free'
            ? `<button class="btn-primary small" onclick="grantPremium('${escHtml(u.email)}')">Grant 💎</button>`
            : `<button class="btn-ghost small" onclick="revokePremium('${escHtml(u.email)}')">Revoke</button>`}
          <button class="btn-ghost small" onclick="deleteUser('${escHtml(u.email)}')" style="color:var(--error)">Del</button>
        </td>
      </tr>`).join('');
}

function renderPaymentsTable(payments) {
  const tbody = document.getElementById('payments-table-body');
  if (!tbody) return;
  tbody.innerHTML = payments.length === 0
    ? '<tr><td colspan="6" class="no-data">No payments yet</td></tr>'
    : payments.map((p, i) => `<tr>
        <td>${escHtml(p.email)}</td><td>₱99</td>
        <td><code>${escHtml(p.ref)}</code></td><td>${p.date}</td>
        <td><span class="status-badge status-${p.status}">${p.status}</span></td>
        <td>${p.status === 'pending'
          ? `<button class="btn-primary small" onclick="approvePayment(${i})">✓</button>
             <button class="btn-ghost small" onclick="rejectPayment(${i})" style="color:var(--error)">✗</button>`
          : '—'}</td>
      </tr>`).join('');
}

function filterUsers(q) {
  const users = DB.getUsers().filter(u => u.name.toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase()));
  renderUsersTable(users);
}

function filterPayments(status, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  let payments = DB.getPayments();
  if (status !== 'all') payments = payments.filter(p => p.status === status);
  renderPaymentsTable(payments);
}

function grantPremium(email) {
  const users = DB.getUsers();
  const u = users.find(u => u.email === email);
  if (u) {
    u.plan = 'premium'; DB.saveUsers(users);
    if (currentUser && currentUser.email === email) { currentUser.plan = 'premium'; isPremium = true; DB.saveSession(currentUser); }
    logActivity(`Granted lifetime premium to ${email}`);
    showToast('Premium granted! ✅', 'success'); refreshAdminPanel();
  }
}

function revokePremium(email) {
  const users = DB.getUsers();
  const u = users.find(u => u.email === email);
  if (u) {
    u.plan = 'free'; DB.saveUsers(users);
    if (currentUser && currentUser.email === email) { currentUser.plan = 'free'; isPremium = false; DB.saveSession(currentUser); }
    logActivity(`Revoked premium from ${email}`);
    showToast('Revoked.'); refreshAdminPanel();
  }
}

function deleteUser(email) {
  if (!confirm(`Delete ${email}?`)) return;
  DB.saveUsers(DB.getUsers().filter(u => u.email !== email));
  logActivity(`Deleted: ${email}`);
  showToast('Deleted.'); refreshAdminPanel();
}

function approvePayment(i) {
  const payments = DB.getPayments();
  payments[i].status = 'approved'; DB.savePayments(payments);
  grantPremium(payments[i].email);
  logActivity(`Payment approved: ${payments[i].email}`);
  showToast('Approved! Premium granted 🎉', 'success'); refreshAdminPanel();
}

function rejectPayment(i) {
  const payments = DB.getPayments();
  payments[i].status = 'rejected'; DB.savePayments(payments);
  logActivity(`Payment rejected: ${payments[i].email}`);
  showToast('Rejected.'); refreshAdminPanel();
}

function saveAdminSettings() {
  adminSettings.price = parseInt(document.getElementById('admin-price').value) || 99;
  adminSettings.gcashNumber = document.getElementById('admin-gcash').value;
  adminSettings.gcashName = document.getElementById('admin-gcash-name').value;
  adminSettings.announcement = document.getElementById('admin-announcement').value;
  DB.set('lyzy_admin_settings', adminSettings);
  showToast('Settings saved! ✅', 'success');
}

function loadAdminSettings() {
  const saved = DB.get('lyzy_admin_settings');
  if (saved) adminSettings = { ...adminSettings, ...saved };
}

// =============================================
// GCASH PAYMENT
// =============================================
function showGcashModal() {
  document.getElementById('gcash-modal').classList.add('open');
  document.getElementById('gcash-display-number').textContent = adminSettings.gcashNumber;
  document.getElementById('gcash-display-name').textContent = adminSettings.gcashName;
  if (currentUser) document.getElementById('payment-email').value = currentUser.email;
}

function closeGcashModal(e) {
  if (!e || e.target === document.getElementById('gcash-modal'))
    document.getElementById('gcash-modal').classList.remove('open');
}

function submitPayment() {
  const email = document.getElementById('payment-email').value.trim();
  const ref = document.getElementById('payment-ref').value.trim();
  const errEl = document.getElementById('payment-error');
  if (!email || !ref) { errEl.textContent = 'Please fill all fields.'; return; }
  if (!email.includes('@')) { errEl.textContent = 'Enter a valid email.'; return; }
  if (ref.length < 6) { errEl.textContent = 'Enter a valid reference number.'; return; }
  const payments = DB.getPayments();
  if (payments.find(p => p.ref === ref)) { errEl.textContent = 'Reference already submitted.'; return; }
  payments.push({ email, ref, date: new Date().toLocaleDateString(), status: 'pending' });
  DB.savePayments(payments);
  logActivity(`Payment submitted by ${email}`);
  errEl.textContent = '';
  document.getElementById('payment-ref').value = '';
  closeGcashModal();
  showToast('Submitted! Verification within 24hrs 🎉', 'success');
}

// =============================================
// AUDIO ENGINE
// =============================================
async function toggleMic() {
  if (isMicActive) {
    stopAudio();
    document.getElementById('mic-btn').textContent = '🎤 Use Microphone'; return;
  }
  try {
    await initAudioContext();
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioSource = audioContext.createMediaStreamSource(micStream);
    connectSource(audioSource);
    isMicActive = true;
    document.getElementById('mic-btn').textContent = '⏹ Stop Mic';
    document.getElementById('viz-overlay').classList.add('hidden');
    document.getElementById('audio-player').style.display = 'none';
    startVisualization();
    closeMobileControls();
  } catch (err) { showToast('Microphone access denied.', 'error'); }
}

function loadAudioFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  document.getElementById('upload-label').textContent = 'Loading...';
  const reader = new FileReader();
  reader.onload = async (e) => {
    await initAudioContext();
    stopAudio();
    try {
      audioBuffer = await audioContext.decodeAudioData(e.target.result);
      playFromBuffer(0);
      document.getElementById('upload-label').textContent = `▶ ${file.name.substring(0, 25)}`;
      document.getElementById('viz-overlay').classList.add('hidden');
      document.getElementById('audio-player').style.display = 'block';
      document.getElementById('now-playing-bar').textContent = file.name.substring(0, 30);
      startVisualization();
      closeMobileControls();
    } catch { showToast('Could not decode audio.', 'error'); document.getElementById('upload-label').textContent = 'Click to browse'; }
  };
  reader.readAsArrayBuffer(file);
}

function playFromBuffer(offset) {
  if (!audioBuffer || !audioContext) return;
  if (audioSource) { try { audioSource.disconnect(); audioSource.stop(); } catch {} }
  audioSource = audioContext.createBufferSource();
  audioSource.buffer = audioBuffer;
  connectSource(audioSource);
  audioSource.start(0, offset);
  audioStartTime = audioContext.currentTime - offset;
  audioOffset = offset;
  audioPaused = false;
  document.getElementById('pause-btn').textContent = '⏸';
  audioSource.onended = () => {
    if (!audioPaused) {
      document.getElementById('audio-player').style.display = 'none';
      document.getElementById('upload-label').textContent = 'Click to browse';
    }
  };
}

function connectSource(source) {
  if (!analyser) return;
  source.connect(analyser);
  if (gainNode) analyser.connect(gainNode);
  else analyser.connect(audioContext.destination);
}

async function initAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = settings.smoothing / 100;
    gainNode = audioContext.createGain();
    gainNode.gain.value = 0.8;
    gainNode.connect(audioContext.destination);
    setupEQ();
  }
  if (audioContext.state === 'suspended') await audioContext.resume();
}

function togglePause() {
  if (!audioBuffer) return;
  if (audioPaused) {
    playFromBuffer(audioOffset);
    document.getElementById('pause-btn').textContent = '⏸';
  } else {
    audioOffset = audioContext.currentTime - audioStartTime;
    try { audioSource.stop(); } catch {}
    audioPaused = true;
    document.getElementById('pause-btn').textContent = '▶';
  }
}

function seekAudio() {
  if (!audioBuffer) return;
  const pct = document.getElementById('audio-seek').value / 100;
  playFromBuffer(pct * audioBuffer.duration);
}

function updateVolume() {
  const v = parseInt(document.getElementById('volume').value) / 100;
  document.getElementById('volume-val').textContent = document.getElementById('volume').value;
  if (gainNode) gainNode.gain.value = v;
}

function stopAudio() {
  if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  if (audioSource) { try { audioSource.disconnect(); audioSource.stop(); } catch {} audioSource = null; }
  isMicActive = false; audioPaused = false; audioBuffer = null;
  document.getElementById('viz-overlay')?.classList.remove('hidden');
  document.getElementById('audio-player').style.display = 'none';
  document.getElementById('mic-btn').textContent = '🎤 Use Microphone';
  document.getElementById('upload-label').textContent = 'Click to browse';
  document.getElementById('now-playing-bar').textContent = '';
}

// Audio time display updater
function updateAudioProgress() {
  if (!audioBuffer || audioPaused) return;
  const elapsed = audioContext.currentTime - audioStartTime;
  const pct = Math.min(elapsed / audioBuffer.duration, 1) * 100;
  document.getElementById('audio-seek').value = pct;
  const secs = Math.floor(elapsed);
  const m = Math.floor(secs / 60), s = secs % 60;
  document.getElementById('audio-time').textContent = `${m}:${s.toString().padStart(2,'0')}`;
}

// =============================================
// EQUALIZER
// =============================================
function setupEQ() {
  if (!audioContext) return;
  const freqs = [60, 250, 1000, 4000, 12000];
  eqFilters = freqs.map(freq => {
    const f = audioContext.createBiquadFilter();
    f.type = 'peaking'; f.frequency.value = freq; f.Q.value = 1; f.gain.value = 0;
    return f;
  });
  // Chain filters
  for (let i = 0; i < eqFilters.length - 1; i++) eqFilters[i].connect(eqFilters[i + 1]);
  if (eqFilters.length > 0) eqFilters[eqFilters.length - 1].connect(audioContext.destination);
}

function setEQ(preset, btn) {
  document.querySelectorAll('.eq-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  settings.eq = preset;
  if (eqFilters.length === 0) return;
  const presets = {
    flat:   [0, 0, 0, 0, 0],
    bass:   [8, 5, 0, -2, -3],
    treble: [-3, -2, 0, 5, 8],
    vocal:  [-2, 0, 5, 4, -1],
  };
  const gains = presets[preset] || presets.flat;
  eqFilters.forEach((f, i) => { f.gain.value = gains[i] || 0; });
}

// =============================================
// BACKGROUND
// =============================================
function setBgType(type, btn) {
  document.querySelectorAll('.bg-opt-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  settings.bgType = type;
  document.getElementById('bg-image-area').style.display = type === 'image' ? 'block' : 'none';
  document.getElementById('bg-video-area').style.display = type === 'video' ? 'block' : 'none';
  const bgLayer = document.getElementById('bg-layer');
  const bgVideo = document.getElementById('bg-video');
  if (type === 'color') { bgLayer.style.backgroundImage = 'none'; bgVideo.style.display = 'none'; }
  else if (type === 'image') { bgVideo.style.display = 'none'; if (bgImageUrl) { bgLayer.style.backgroundImage = `url(${bgImageUrl})`; bgLayer.style.opacity = settings.bgOpacity / 100; } }
  else if (type === 'video') { if (!isPremium) { showToast('🔒 Video background is Premium!', 'error'); setBgType('color', document.querySelector('.bg-opt-btn')); return; } }
}

function loadBgImage(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    bgImageUrl = e.target.result;
    const bgLayer = document.getElementById('bg-layer');
    bgLayer.style.backgroundImage = `url(${bgImageUrl})`;
    bgLayer.style.opacity = settings.bgOpacity / 100;
    showToast('Background set! 🖼️', 'success');
  };
  reader.readAsDataURL(file);
}

function loadBgVideo(event) {
  if (!isPremium) { showToast('🔒 Premium feature!', 'error'); return; }
  const file = event.target.files[0]; if (!file) return;
  const vid = document.getElementById('bg-video');
  vid.src = URL.createObjectURL(file);
  vid.style.display = 'block'; vid.play();
  showToast('Background video set! 🎬', 'success');
}

function updateBgOpacity() {
  settings.bgOpacity = parseInt(document.getElementById('bg-opacity').value);
  document.getElementById('bg-opacity-val').textContent = settings.bgOpacity;
  document.getElementById('bg-layer').style.opacity = settings.bgOpacity / 100;
}

function checkPremiumThen(fn) {
  if (!isPremium) { showToast('🔒 Premium feature! Upgrade to unlock.', 'error'); return; }
  fn();
}

// =============================================
// OVERLAY
// =============================================
function updateOverlay() {
  overlayState.showArtist = document.getElementById('show-artist').checked;
  overlayState.showSong = document.getElementById('show-song').checked;
  overlayState.showWatermark = document.getElementById('show-watermark').checked;
  overlayState.artist = document.getElementById('artist-name').value;
  overlayState.song = document.getElementById('song-name').value;
  overlayState.position = document.getElementById('overlay-position').value;
  overlayState.textSize = parseInt(document.getElementById('text-size').value) || 16;
  document.getElementById('text-size-val').textContent = overlayState.textSize;

  const el = document.getElementById('viz-text-overlay');
  el.className = overlayState.position;
  let html = '';
  if (overlayState.showArtist && overlayState.artist)
    html += `<div class="overlay-artist" style="font-size:${overlayState.textSize}px">${escHtml(overlayState.artist)}</div>`;
  if (overlayState.showSong && overlayState.song)
    html += `<div class="overlay-song" style="font-size:${overlayState.textSize * 0.75}px">${escHtml(overlayState.song)}</div>`;
  if (overlayState.showWatermark)
    html += `<div class="overlay-watermark">lyzy music visualizer</div>`;
  el.innerHTML = html;
}

// =============================================
// HIDE UI
// =============================================
function toggleHideUI() {
  uiHidden = !uiHidden;
  document.body.classList.toggle('ui-hidden', uiHidden);
  document.getElementById('show-ui-btn').style.display = uiHidden ? 'block' : 'none';
  if (uiHidden) showToast('UI hidden — tap "Show UI" to restore', 'success');
}

// =============================================
// BPM DETECTOR
// =============================================
let bpmSamples = [];
function detectBPM(dataArray) {
  const bass = dataArray.slice(0, 8).reduce((a, b) => a + b, 0) / 8;
  const now = Date.now();
  if (bass > 180 && now - lastBeat > 250) {
    if (lastBeat > 0) {
      const interval = now - lastBeat;
      bpmSamples.push(60000 / interval);
      if (bpmSamples.length > 12) bpmSamples.shift();
      const avgBpm = Math.round(bpmSamples.reduce((a, b) => a + b) / bpmSamples.length);
      if (avgBpm > 40 && avgBpm < 220) {
        document.getElementById('bpm-display').textContent = avgBpm;
      }
    }
    lastBeat = now;
    const dot = document.getElementById('bpm-dot');
    dot.classList.add('beat');
    clearTimeout(bpmFlashTimeout);
    bpmFlashTimeout = setTimeout(() => dot.classList.remove('beat'), 80);
  }
}

// =============================================
// STAR BACKGROUND
// =============================================
function initStars(W, H) {
  stars = [];
  for (let i = 0; i < 150; i++) {
    stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.5 + 0.3, speed: Math.random() * 0.3 + 0.1, opacity: Math.random() });
  }
  starsInitialized = true;
}

function drawStars(ctx, W, H) {
  stars.forEach(s => {
    s.opacity += (Math.random() - 0.5) * 0.05;
    s.opacity = Math.max(0.1, Math.min(0.9, s.opacity));
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${s.opacity})`; ctx.fill();
  });
}

// =============================================
// VISUALIZATION ENGINE
// =============================================
let mainCanvas, ctx;
let rotAngle = 0;

function setupAppCanvas() {
  mainCanvas = document.getElementById('main-canvas');
  if (!mainCanvas) return;
  ctx = mainCanvas.getContext('2d');
  resizeCanvas();
}

function resizeCanvas() {
  if (!mainCanvas) return;
  mainCanvas.width = mainCanvas.offsetWidth * devicePixelRatio;
  mainCanvas.height = mainCanvas.offsetHeight * devicePixelRatio;
  if (ctx) { ctx.resetTransform(); ctx.scale(devicePixelRatio, devicePixelRatio); }
  starsInitialized = false;
}

window.addEventListener('resize', resizeCanvas);

let beatValue = 0;
let flashAlpha = 0;

function startVisualization() {
  if (animationId) cancelAnimationFrame(animationId);
  if (!mainCanvas || !ctx || !analyser) return;
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function draw() {
    animationId = requestAnimationFrame(draw);
    analyser.getByteFrequencyData(dataArray);
    if (audioBuffer && !audioPaused) updateAudioProgress();
    detectBPM(dataArray);

    const W = mainCanvas.offsetWidth, H = mainCanvas.offsetHeight;
    if (!starsInitialized && settings.stars) initStars(W, H);

    if (settings.bgType === 'color') { ctx.fillStyle = settings.bgColor; ctx.fillRect(0, 0, W, H); }
    else { ctx.clearRect(0, 0, W, H); }

    if (settings.stars) drawStars(ctx, W, H);

    const avg = dataArray.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
    beatValue = settings.beatPulse ? avg / 255 : 0;
    rotAngle += (settings.rotSpeed / 1000);

    const sens = settings.sensitivity;
    const n = Math.min(settings.barCount, bufferLength);

    switch (settings.mode) {
      case 'bars':     drawBars(dataArray, W, H, n, sens); break;
      case 'wave':     drawWave(dataArray, W, H, bufferLength, sens); break;
      case 'circular': drawCircular(dataArray, W, H, n, sens); break;
      case 'mirror':   drawMirrorBars(dataArray, W, H, n, sens); break;
      case 'scope':    drawScope(dataArray, W, H, bufferLength, sens); break;
      case 'particles': drawParticles(dataArray, W, H, n, sens); break;
      case 'tunnel':   drawTunnel(dataArray, W, H, n, sens); break;
      case 'liquid':   drawLiquid(dataArray, W, H, bufferLength, sens); break;
      case 'fractal':  drawFractal(dataArray, W, H, n, sens); break;
      case 'matrix':   drawMatrix(dataArray, W, H, n, sens); break;
      case 'dna':      drawDNA(dataArray, W, H, bufferLength, sens); break;
      case 'galaxy_mode': drawGalaxy(dataArray, W, H, n, sens); break;
    }

    // Beat flash effect
    if (settings.flash && beatValue > 0.7) flashAlpha = 0.12;
    if (flashAlpha > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`;
      ctx.fillRect(0, 0, W, H);
      flashAlpha = Math.max(0, flashAlpha - 0.01);
    }
  }
  draw();
}

function makeGrad(x1, y1, x2, y2) {
  const g = ctx.createLinearGradient(x1, y1, x2, y2);
  g.addColorStop(0, settings.color1); g.addColorStop(1, settings.color2); return g;
}
function setGlow(on, color) { ctx.shadowBlur = on ? 14 : 0; ctx.shadowColor = color || settings.color1; }

// 1. BARS
function drawBars(data, W, H, n, sens) {
  for (let i = 0; i < n; i++) {
    const val = (data[i] / 255) * sens * 0.2;
    const h = Math.max(2, val * H);
    const x = (W / n) * i + (W / n) * 0.075, barW = (W / n) * 0.85, y = H - h;
    if (settings.glow) setGlow(true, settings.color1);
    ctx.fillStyle = settings.gradient ? makeGrad(x, y, x, y + h) : settings.color1;
    ctx.fillRect(x, y, barW, h);
    // Reflection
    ctx.globalAlpha = 0.2;
    ctx.fillRect(x, H, barW, h * 0.3);
    ctx.globalAlpha = 1;
  }
  setGlow(false);
}

// 2. WAVE
function drawWave(data, W, H, bufLen, sens) {
  ctx.lineWidth = settings.lineWidth;
  ctx.strokeStyle = settings.gradient ? makeGrad(0, 0, W, 0) : settings.color1;
  if (settings.glow) setGlow(true);
  ctx.beginPath();
  for (let i = 0; i < bufLen; i++) {
    const v = (data[i] / 128) * sens * 0.2;
    const x = (W / bufLen) * i, y = H / 2 + (v - 1) * H * 0.4;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
  if (settings.mirror) {
    ctx.beginPath();
    for (let i = 0; i < bufLen; i++) {
      const v = (data[i] / 128) * sens * 0.2;
      const x = (W / bufLen) * i, y = H / 2 - (v - 1) * H * 0.4;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  setGlow(false);
}

// 3. CIRCULAR/RADIAL
function drawCircular(data, W, H, n, sens) {
  const cx = W / 2, cy = H / 2;
  const baseR = Math.min(W, H) * 0.22 + beatValue * 18;
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2 + rotAngle;
    const val = (data[i] / 255) * sens * 0.5;
    const len = val * Math.min(W, H) * 0.28;
    const x1 = cx + Math.cos(angle) * baseR, y1 = cy + Math.sin(angle) * baseR;
    const x2 = cx + Math.cos(angle) * (baseR + len), y2 = cy + Math.sin(angle) * (baseR + len);
    const hue = (i / n) * 360;
    ctx.strokeStyle = settings.gradient ? `hsl(${hue}, 100%, 60%)` : settings.color1;
    ctx.lineWidth = settings.lineWidth;
    if (settings.glow) setGlow(true, ctx.strokeStyle);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  setGlow(false);
}

// 4. MIRROR BARS
function drawMirrorBars(data, W, H, n, sens) {
  const half = H / 2;
  for (let i = 0; i < n; i++) {
    const val = (data[i] / 255) * sens * 0.2;
    const h = Math.max(2, val * half);
    const x = (W / n) * i + (W / n) * 0.075, barW = (W / n) * 0.85;
    if (settings.glow) setGlow(true, settings.color1);
    ctx.fillStyle = settings.gradient ? makeGrad(x, half - h, x, half + h) : settings.color1;
    ctx.fillRect(x, half - h, barW, h); // top
    ctx.fillRect(x, half, barW, h); // bottom
  }
  setGlow(false);
}

// 5. SCOPE (oscilloscope)
function drawScope(data, W, H, bufLen, sens) {
  const analyserTime = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(analyserTime);
  ctx.lineWidth = settings.lineWidth + 1;
  ctx.strokeStyle = settings.gradient ? makeGrad(0, 0, W, 0) : settings.color1;
  if (settings.glow) setGlow(true);
  ctx.beginPath();
  for (let i = 0; i < analyserTime.length; i++) {
    const v = analyserTime[i] / 128;
    const x = (W / analyserTime.length) * i, y = (v * H / 2);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke(); setGlow(false);
}

// 6. PARTICLES
const particles = [];
function drawParticles(data, W, H, n, sens) {
  const avg = data.slice(0, n).reduce((a, b) => a + b) / n;
  if (avg > 100 && particles.length < 300) {
    for (let i = 0; i < 3; i++) {
      particles.push({
        x: W / 2 + (Math.random() - 0.5) * 150, y: H / 2 + (Math.random() - 0.5) * 150,
        vx: (Math.random() - 0.5) * sens * 2.5, vy: (Math.random() - 0.5) * sens * 2.5 - 1.5,
        life: 1, size: Math.random() * 5 + 2, hue: Math.random() * 80 + 150,
      });
    }
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.04; p.life -= 0.012;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    ctx.globalAlpha = p.life;
    ctx.fillStyle = settings.gradient ? `hsl(${p.hue}, 100%, 65%)` : settings.color1;
    if (settings.glow) setGlow(true, ctx.fillStyle);
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1; setGlow(false);
}

// 7. TUNNEL
function drawTunnel(data, W, H, n, sens) {
  const cx = W / 2, cy = H / 2;
  for (let ring = 0; ring < 12; ring++) {
    const r = ring * (Math.min(W, H) / 24) + beatValue * 12;
    const idx = Math.floor((ring / 12) * n);
    const val = data[idx] / 255;
    const hue = (ring * 30 + rotAngle * 200) % 360;
    ctx.strokeStyle = settings.gradient ? `hsl(${hue}, 100%, ${40 + val * 30}%)` : settings.color1;
    ctx.lineWidth = settings.lineWidth + val * 2; ctx.globalAlpha = 0.4 + val * 0.6;
    if (settings.glow) setGlow(true, ctx.strokeStyle);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rotAngle + ring * 0.15);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const amp = r + (data[i] / 255) * sens * 15;
      const x = Math.cos(a) * amp, y = Math.sin(a) * amp;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.stroke(); ctx.restore();
  }
  ctx.globalAlpha = 1; setGlow(false);
}

// 8. LIQUID
function drawLiquid(data, W, H, bufLen, sens) {
  const step = W / bufLen;
  for (let layer = 0; layer < 3; layer++) {
    ctx.lineWidth = settings.lineWidth + 2;
    ctx.strokeStyle = layer === 0 ? settings.color1 : layer === 1 ? settings.color2 : '#ffffff44';
    ctx.globalAlpha = 1 - layer * 0.3;
    if (settings.glow) setGlow(true, ctx.strokeStyle);
    ctx.beginPath();
    for (let i = 0; i < bufLen; i++) {
      const v = (data[i] / 255) * sens * 0.3;
      const x = step * i, y = (H * 0.5) + (layer * 25) + (v - 0.5) * H * 0.5 * Math.sin(i * 0.05 + layer + rotAngle);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1; setGlow(false);
}

// 9. FRACTAL
let fractalTime = 0;
function drawFractal(data, W, H, n, sens) {
  fractalTime += 0.02;
  const avg = data.slice(0, 32).reduce((a, b) => a + b) / 32 / 255;
  function branch(x, y, len, angle, depth) {
    if (depth === 0 || len < 2) return;
    const nx = x + Math.cos(angle) * len, ny = y - Math.sin(angle) * len;
    const hue = (depth * 40 + fractalTime * 30) % 360;
    ctx.strokeStyle = settings.gradient ? `hsl(${hue}, 100%, 60%)` : settings.color1;
    ctx.lineWidth = depth * 0.5; ctx.globalAlpha = depth / 8;
    if (settings.glow) setGlow(true, ctx.strokeStyle);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
    branch(nx, ny, len * 0.67, angle - 0.4 + avg * 0.4, depth - 1);
    branch(nx, ny, len * 0.67, angle + 0.4 - avg * 0.4, depth - 1);
  }
  branch(W / 2, H, H * 0.25, Math.PI / 2, 7);
  ctx.globalAlpha = 1; setGlow(false);
}

// 10. MATRIX
const matrixDrops = [];
function drawMatrix(data, W, H, n, sens) {
  const cols = Math.floor(W / 16);
  while (matrixDrops.length < cols) matrixDrops.push(Math.random() * H);
  ctx.fillStyle = 'rgba(10,10,15,0.15)'; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < cols; i++) {
    const val = data[i % n] / 255;
    const speed = 2 + val * sens * 2;
    ctx.fillStyle = settings.gradient ? `hsl(${140 + val * 60}, 100%, ${40 + val * 30}%)` : settings.color1;
    if (settings.glow) setGlow(true, ctx.fillStyle);
    ctx.font = '14px monospace';
    ctx.fillText(String.fromCharCode(0x30A0 + Math.random() * 96), i * 16, matrixDrops[i]);
    if (matrixDrops[i] > H && Math.random() > 0.975) matrixDrops[i] = 0;
    matrixDrops[i] += speed;
  }
  setGlow(false);
}

// 11. DNA HELIX
let dnaTime = 0;
function drawDNA(data, W, H, bufLen, sens) {
  dnaTime += 0.04;
  const cx = W / 2;
  const n = Math.min(120, bufLen);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 4 + dnaTime;
    const x = cx + Math.sin(t) * (W * 0.25);
    const y = (i / n) * H;
    const val = data[i] / 255;
    const r = 4 + val * sens * 2;
    const hue = (i / n) * 200 + 160;
    ctx.fillStyle = settings.gradient ? `hsl(${hue}, 100%, 60%)` : settings.color1;
    if (settings.glow) setGlow(true, ctx.fillStyle);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    // Mirror strand
    const x2 = cx - Math.sin(t) * (W * 0.25);
    ctx.fillStyle = settings.gradient ? `hsl(${hue + 120}, 100%, 60%)` : settings.color2;
    ctx.beginPath(); ctx.arc(x2, y, r, 0, Math.PI * 2); ctx.fill();
    // Connecting rungs every few nodes
    if (i % 5 === 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y); ctx.stroke();
    }
  }
  setGlow(false);
}

// 12. GALAXY
const galaxyParticles = [];
let galaxyInit = false;
function drawGalaxy(data, W, H, n, sens) {
  if (!galaxyInit) {
    for (let i = 0; i < 200; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * Math.min(W, H) * 0.45;
      galaxyParticles.push({ angle, radius, speed: 0.002 + Math.random() * 0.003, size: Math.random() * 2 + 0.5, hue: Math.random() * 60 + 200 });
    }
    galaxyInit = true;
  }
  const cx = W / 2, cy = H / 2;
  const avg = data.slice(0, n).reduce((a, b) => a + b) / n / 255;
  galaxyParticles.forEach((p, i) => {
    p.angle += p.speed * (1 + avg * 2);
    const x = cx + Math.cos(p.angle) * p.radius * (1 + avg * 0.2);
    const y = cy + Math.sin(p.angle) * p.radius * 0.4 * (1 + avg * 0.2);
    const val = data[i % n] / 255;
    ctx.fillStyle = settings.gradient ? `hsl(${p.hue + val * 40}, 100%, ${50 + val * 30}%)` : settings.color1;
    ctx.globalAlpha = 0.6 + val * 0.4;
    if (settings.glow) setGlow(true, ctx.fillStyle);
    ctx.beginPath(); ctx.arc(x, y, p.size + val * sens * 0.5, 0, Math.PI * 2); ctx.fill();
  });
  ctx.globalAlpha = 1; setGlow(false);
}

// =============================================
// PREVIEW ANIMATION
// =============================================
let previewAnim = null, previewTime = 0;
function startPreviewAnimation() {
  const c = document.getElementById('preview-canvas');
  if (!c) return;
  c.width = c.offsetWidth * devicePixelRatio;
  c.height = c.offsetHeight * devicePixelRatio;
  const pctx = c.getContext('2d');
  pctx.scale(devicePixelRatio, devicePixelRatio);
  const W = c.offsetWidth, H = c.offsetHeight;
  if (previewAnim) cancelAnimationFrame(previewAnim);
  function drawPreview() {
    previewAnim = requestAnimationFrame(drawPreview);
    previewTime += 0.04;
    pctx.fillStyle = '#0a0a0f'; pctx.fillRect(0, 0, W, H);
    const n = 64;
    for (let i = 0; i < n; i++) {
      const v = (Math.sin(previewTime + i * 0.2) * 0.5 + 0.5) * (Math.sin(previewTime * 0.5 + i * 0.1) * 0.3 + 0.7);
      const h = v * H * 0.75, x = (W / n) * i, barW = (W / n) * 0.8;
      const hue = (i / n) * 180 + 160;
      const g = pctx.createLinearGradient(x, H - h, x, H);
      g.addColorStop(0, `hsl(${hue}, 100%, 65%)`);
      g.addColorStop(1, `hsl(${hue + 60}, 100%, 40%)`);
      pctx.fillStyle = g; pctx.shadowBlur = 8; pctx.shadowColor = `hsl(${hue}, 100%, 65%)`;
      pctx.fillRect(x, H - h, barW, h);
    }
    pctx.shadowBlur = 0;
  }
  drawPreview();
}

// =============================================
// CONTROLS
// =============================================
function setMode(mode) {
  const premiumModes = ['particles', 'tunnel', 'liquid', 'fractal', 'matrix', 'dna', 'galaxy_mode'];
  if (premiumModes.includes(mode) && !isPremium) {
    showToast('🔒 Premium mode! Upgrade to unlock.', 'error');
    showPage('pricing-page'); return;
  }
  settings.mode = mode;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-mode="${mode}"]`)?.classList.add('active');
}

function setTheme(theme) {
  const premiumThemes = ['galaxy_t', 'sunset', 'acid', 'ice'];
  if (premiumThemes.includes(theme) && !isPremium) { showToast('🔒 Premium theme!', 'error'); return; }
  const themes = {
    neon: ['#00ffcc', '#ff00ff'], fire: ['#ff4500', '#ffcc00'],
    ocean: ['#0066ff', '#00ffcc'], blood: ['#ff0033', '#880022'],
    mint: ['#00ff88', '#00cc44'], galaxy_t: ['#6600ff', '#ff00ff'],
    sunset: ['#ff6b35', '#f7c59f'], acid: ['#39ff14', '#ffff00'],
    ice: ['#a8edea', '#fed6e3'],
  };
  if (themes[theme]) {
    settings.color1 = themes[theme][0]; settings.color2 = themes[theme][1];
    document.getElementById('color1').value = themes[theme][0];
    document.getElementById('color2').value = themes[theme][1];
  }
  settings.theme = theme;
  document.querySelectorAll('.theme-swatch').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-theme="${theme}"]`)?.classList.add('active');
}

function updateCustomColor() {
  settings.color1 = document.getElementById('color1').value;
  settings.color2 = document.getElementById('color2').value;
}

function updateBgColor() { settings.bgColor = document.getElementById('bgColor').value; }

function updateSettings() {
  settings.sensitivity = parseInt(document.getElementById('sensitivity').value);
  settings.smoothing = parseInt(document.getElementById('smoothing').value);
  settings.barCount = parseInt(document.getElementById('barcount').value);
  settings.lineWidth = parseInt(document.getElementById('linewidth').value);
  settings.rotSpeed = parseInt(document.getElementById('rotspeed').value);
  settings.glow = document.getElementById('glow-toggle').checked;
  settings.mirror = document.getElementById('mirror-toggle').checked;
  settings.beatPulse = document.getElementById('beat-toggle').checked;
  settings.gradient = document.getElementById('gradient-toggle').checked;
  settings.stars = document.getElementById('stars-toggle').checked;
  settings.flash = document.getElementById('flash-toggle').checked;
  document.getElementById('sensitivity-val').textContent = settings.sensitivity;
  document.getElementById('smoothing-val').textContent = settings.smoothing;
  document.getElementById('barcount-val').textContent = settings.barCount;
  document.getElementById('linewidth-val').textContent = settings.lineWidth;
  document.getElementById('rotspeed-val').textContent = settings.rotSpeed;
  if (analyser) analyser.smoothingTimeConstant = settings.smoothing / 100;
  if (!settings.stars) starsInitialized = false;
}

function updateUserDisplay() {
  const nameEl = document.getElementById('user-name-display');
  const badgeEl = document.getElementById('premium-badge');
  const upgradeBtn = document.getElementById('upgrade-btn');
  if (!currentUser) return;
  if (nameEl) nameEl.textContent = currentUser.name;
  if (isPremium) {
    if (badgeEl) badgeEl.style.display = 'inline-flex';
    if (upgradeBtn) upgradeBtn.style.display = 'none';
    document.querySelectorAll('.premium-mode').forEach(b => { b.style.opacity = '1'; });
    document.querySelectorAll('.premium-swatch').forEach(b => { b.style.opacity = '1'; });
  } else {
    if (badgeEl) badgeEl.style.display = 'none';
    if (upgradeBtn) upgradeBtn.style.display = 'inline-flex';
  }
}

function takeScreenshot() {
  if (!mainCanvas) return;
  const link = document.createElement('a');
  link.download = 'lyzy-screenshot.png';
  link.href = mainCanvas.toDataURL('image/png');
  link.click();
  showToast('Screenshot saved! 📸', 'success');
}

// =============================================
// TOAST
// =============================================
let toastTimeout;
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast show ${type}`;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { t.className = 'toast'; }, 3000);
}

// =============================================
// HELPERS
// =============================================
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// =============================================
// INIT
// =============================================
window.addEventListener('load', () => {
  // Add panel backdrop for mobile
  const backdrop = document.createElement('div');
  backdrop.id = 'panel-backdrop';
  backdrop.className = 'panel-backdrop';
  backdrop.onclick = closeMobileControls;
  document.body.appendChild(backdrop);

  loadAdminSettings();

  // Check admin route BEFORE session check so #admin still works
  if (window.location.hash === '#admin') {
    showPage('admin-login-page');
  } else if (checkSession()) {
    showPage('app-page');
  } else {
    // ✅ FIX: showPage('landing-page') also calls startPreviewAnimation internally
    showPage('landing-page');
  }

  hideSplash();

  window.addEventListener('hashchange', () => {
    if (window.location.hash === '#admin') showPage('admin-login-page');
  });

  const ro = new ResizeObserver(resizeCanvas);
  const c = document.getElementById('main-canvas');
  if (c) ro.observe(c);

  document.getElementById('viz-text-overlay').classList.add('bottom-left');

  // Handle Enter key on login/signup forms
  document.getElementById('login-password')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
  document.getElementById('signup-password')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleSignup(); });
  document.getElementById('admin-password')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleAdminLogin(); });
});
