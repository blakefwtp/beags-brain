// ══════════════════════════════════════════════
// BEAG'S BRAIN — Main Application Script
// ══════════════════════════════════════════════

// ── LOCAL STORAGE ──
const S = {
  get(k, fb) { try { const r = localStorage.getItem('bb_'+k); return r ? JSON.parse(r) : fb; } catch(e) { return fb; } },
  set(k, v) { try { localStorage.setItem('bb_'+k, JSON.stringify(v)); } catch(e) {} },
  del(k) { try { localStorage.removeItem('bb_'+k); } catch(e) {} }
};

// ── CLOUD SYNC (Supabase) ──
const SUPA_URL = 'https://tienyxdafspakjjuhufb.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpZW55eGRhZnNwYWtqanVodWZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMzAyMzIsImV4cCI6MjA4OTgwNjIzMn0.soYFcvGFJj4bXeTXm31qq3tLb52xnNIAy1dawaCH7mM';
const SUPA_HEADERS = { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };

// Keys to sync to cloud (skip chatHistory — session-only, skip husbandSub — device-specific)
const SYNC_KEYS = ['events','todos','groceries','ideas','colorBlocks','reminders','tanks','tankHistory','nextId','nextBlockId','husbandPhone'];

// Debounced write queue — batches rapid saves into one request
let _syncQueue = {};
let _syncTimer = null;

function syncToCloud(key, value) {
  if (!SYNC_KEYS.includes(key)) return;
  _syncQueue[key] = value;
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(flushSyncQueue, 500);
}

async function flushSyncQueue() {
  var keys = Object.keys(_syncQueue);
  if (keys.length === 0) return;
  var batch = keys.map(function(k) { return { key: k, value: _syncQueue[k] }; });
  _syncQueue = {};

  try {
    var resp = await fetch(SUPA_URL + '/rest/v1/app_data', {
      method: 'POST',
      headers: Object.assign({}, SUPA_HEADERS, { 'Prefer': 'resolution=merge-duplicates' }),
      body: JSON.stringify(batch)
    });
    updateSyncDot(resp.ok ? 'ok' : 'err');
  } catch(e) {
    // Offline — re-queue
    batch.forEach(function(item) { _syncQueue[item.key] = item.value; });
    updateSyncDot('off');
  }
}

// Pull all data from Supabase and merge
async function syncFromCloud() {
  try {
    var resp = await fetch(SUPA_URL + '/rest/v1/app_data?select=key,value,updated_at', { headers: SUPA_HEADERS });
    if (!resp.ok) { updateSyncDot('err'); return; }
    var rows = await resp.json();

    // If cloud is empty, push all local data as initial seed
    if (!Array.isArray(rows) || rows.length === 0) {
      pushAllToCloud();
      updateSyncDot('ok');
      return;
    }

    var changed = false;
    rows.forEach(function(row) {
      if (!SYNC_KEYS.includes(row.key)) return;
      var localRaw = localStorage.getItem('bb_' + row.key);
      var cloudStr = JSON.stringify(row.value);
      if (localRaw !== cloudStr) {
        localStorage.setItem('bb_' + row.key, cloudStr);
        changed = true;
      }
    });
    if (changed) reloadAppData();
    updateSyncDot('ok');
  } catch(e) {
    updateSyncDot('off');
  }
}

// Seed cloud with all local data (runs once when cloud is empty)
function pushAllToCloud() {
  SYNC_KEYS.forEach(function(key) {
    var raw = localStorage.getItem('bb_' + key);
    if (raw) {
      try { syncToCloud(key, JSON.parse(raw)); } catch(e) {}
    }
  });
}

function reloadAppData() {
  events = S.get('events', {});
  todos = S.get('todos', []);
  groceries = S.get('groceries', []);
  ideas = S.get('ideas', []);
  colorBlocks = S.get('colorBlocks', []);
  reminders = S.get('reminders', []);
  nextId = S.get('nextId', 1);
  nextBlockId = S.get('nextBlockId', 1);
  tankValues = S.get('tanks', { touch: 50, time: 50, help: 50, emotional: 50, _updated: null });
  tankHistory = S.get('tankHistory', []);
  // Re-render everything safely
  try {
    renderMiniMonth(); renderThisWeek(); renderTodos(); renderGsd();
    renderGroceries(); renderIdeas(); renderReminders();
    initTanks(); updatePulse(); updateDateLine(); updateSuggestions();
  } catch(e) {}
}

// Tiny sync status dot (top-right corner)
function updateSyncDot(status) {
  var dot = document.getElementById('syncDot');
  if (!dot) {
    dot = document.createElement('div');
    dot.id = 'syncDot';
    dot.style.cssText = 'position:fixed;top:10px;right:10px;width:8px;height:8px;border-radius:50%;z-index:9999;transition:background .3s,opacity .5s;opacity:0.6;pointer-events:none;';
    document.body.appendChild(dot);
  }
  dot.style.opacity = '0.6';
  if (status === 'ok') {
    dot.style.background = '#4CAF50';
    setTimeout(function() { dot.style.opacity = '0'; }, 2000);
  } else if (status === 'off') {
    dot.style.background = '#FF9800';
  } else {
    dot.style.background = '#f44336';
  }
}

// Sync when user returns to the app (tab focus / phone unlock)
document.addEventListener('visibilitychange', function() {
  if (!document.hidden) syncFromCloud();
});

// ── DATA STORES (localStorage + cloud backed) ──
let events = S.get('events', {});
let todos = S.get('todos', []);        // { id, text, done, doneAt, type:'todo'|'gsd', sub? }
let groceries = S.get('groceries', []); // { id, text, cat, done, doneAt }
let ideas = S.get('ideas', []);         // { id, title, body, tag, tagColor }
let colorBlocks = S.get('colorBlocks', []);
let nextId = S.get('nextId', 1);
let reminders = S.get('reminders', []); // { id, title, sub, day, minutes }
let tankValues = S.get('tanks', { touch: 50, time: 50, help: 50, emotional: 50, _updated: null });
let tankHistory = S.get('tankHistory', []); // { date: 'YYYY-MM-DD', touch, time, help, emotional }

// Save to localStorage AND push to cloud
function save(key, val) { S.set(key, val); syncToCloud(key, val); }
function getId() { const id = nextId++; save('nextId', nextId); return id; }

// ── HELPERS ──
function esc(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
function to12hr(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const hr = h % 12 || 12;
  return hr + (m > 0 ? ':' + String(m).padStart(2,'0') : '') + ampm;
}
function showToast(title, sub) {
  const toast = document.getElementById('orderToast');
  toast.querySelector('div > div:first-child').textContent = title;
  toast.querySelector('div > div:last-child').textContent = sub || '';
  toast.style.top = '20px';
  setTimeout(() => { toast.style.top = '-80px'; }, 2500);
}
function getTimeAgo(ts) {
  if (!ts) return 'just now';
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' hr ago';
  return Math.floor(h / 24) + ' day(s) ago';
}

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── TAB SWITCHING ──
function switchTab(tabName, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tabName).classList.add('active');
  if (btn) btn.classList.add('active');
  window.scrollTo(0, 0);
  closeFab();
}

// ── DATE SETUP ──
const NOW = new Date();
let currentMonth = NOW.getMonth();
let currentYear = NOW.getFullYear();

function updateDateLine() {
  const el = document.getElementById('dateLine');
  const todayEvents = events[currentYear + '-' + (NOW.getMonth()+1) + '-' + NOW.getDate()] || [];
  const todoCount = todos.filter(t => !t.done).length;
  const total = todayEvents.length + todoCount;
  el.textContent = DAYS[NOW.getDay()] + ', ' + MONTHS[NOW.getMonth()] + ' ' + NOW.getDate() + ' — you\'ve got ' + total + ' thing' + (total !== 1 ? 's' : '') + ' today';
}

// ── CALENDAR ──
function renderMiniMonth() {
  document.getElementById('monthTitle').textContent = MONTHS[currentMonth] + ' ' + currentYear;
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysInPrev = new Date(currentYear, currentMonth, 0).getDate();
  const grid = document.getElementById('miniGrid');
  grid.innerHTML = '';
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    const cell = document.createElement('div');
    cell.className = 'mini-cell';
    let dayNum, isOther = false;
    if (i < firstDay) { dayNum = daysInPrev - firstDay + i + 1; isOther = true; }
    else if (i >= firstDay + daysInMonth) { dayNum = i - firstDay - daysInMonth + 1; isOther = true; }
    else { dayNum = i - firstDay + 1; }
    if (isOther) cell.classList.add('other-month');

    const isToday = !isOther && dayNum === NOW.getDate() && currentMonth === NOW.getMonth() && currentYear === NOW.getFullYear();
    if (isToday) cell.classList.add('today');

    const dateDiv = document.createElement('div');
    dateDiv.className = 'mini-date';
    dateDiv.textContent = dayNum;
    cell.appendChild(dateDiv);

    if (!isOther) {
      const key = currentYear + '-' + (currentMonth + 1) + '-' + dayNum;
      applyBlockToCell(cell, key);
      const evts = events[key];
      if (evts) {
        evts.slice(0, 3).forEach(ev => {
          const evDiv = document.createElement('div');
          evDiv.className = 'mini-event ' + ev.c;
          evDiv.textContent = ev.t;
          cell.appendChild(evDiv);
        });
        if (evts.length > 3) {
          const more = document.createElement('div');
          more.style.cssText = 'font-size:8px; color:var(--text-light); text-align:center;';
          more.textContent = '+' + (evts.length - 3) + ' more';
          cell.appendChild(more);
        }
      }
    }
    grid.appendChild(cell);
  }
}

function navMonth(dir) {
  currentMonth += dir;
  if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  renderMiniMonth();
}

// ── FULL CALENDAR ──
let fullCalMonth = NOW.getMonth();
let fullCalYear = NOW.getFullYear();

function openFullCalendar() {
  switchTab('calendar', document.querySelector('.nav-item[data-nav="calendar"]'));
  fullCalMonth = currentMonth;
  fullCalYear = currentYear;
  renderFullCal();
}

function renderFullCal() {
  document.getElementById('fullCalTitle').textContent = MONTHS[fullCalMonth] + ' ' + fullCalYear;
  const firstDay = new Date(fullCalYear, fullCalMonth, 1).getDay();
  const daysInMonth = new Date(fullCalYear, fullCalMonth + 1, 0).getDate();
  const daysInPrev = new Date(fullCalYear, fullCalMonth, 0).getDate();
  const grid = document.getElementById('fullCalGrid');
  grid.innerHTML = '';
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  grid.className = 'fullcal-grid rows-' + (totalCells / 7);

  for (let i = 0; i < totalCells; i++) {
    const cell = document.createElement('div');
    cell.className = 'fullcal-cell';
    let dayNum, isOther = false;
    if (i < firstDay) { dayNum = daysInPrev - firstDay + i + 1; isOther = true; }
    else if (i >= firstDay + daysInMonth) { dayNum = i - firstDay - daysInMonth + 1; isOther = true; }
    else { dayNum = i - firstDay + 1; }
    if (isOther) cell.classList.add('other-month');

    const isToday = !isOther && dayNum === NOW.getDate() && fullCalMonth === NOW.getMonth() && fullCalYear === NOW.getFullYear();
    if (isToday) cell.classList.add('today');

    const dateDiv = document.createElement('div');
    dateDiv.className = 'fullcal-date';
    dateDiv.textContent = dayNum;
    cell.appendChild(dateDiv);

    const eventsDiv = document.createElement('div');
    eventsDiv.className = 'fullcal-events';

    if (!isOther) {
      const key = fullCalYear + '-' + (fullCalMonth + 1) + '-' + dayNum;
      const block = applyBlockToCell(cell, key);

      // Show color block as a tappable event-like chip
      if (block) {
        const blockDiv = document.createElement('div');
        blockDiv.className = 'fullcal-ev';
        blockDiv.style.cssText = 'background:' + block.color + '40;color:' + block.color + ';font-weight:600;border:1px solid ' + block.color + '80;';
        blockDiv.textContent = block.label || 'Color block';
        blockDiv.addEventListener('click', (e) => {
          e.stopPropagation();
          openBlockEditor(block.id, key);
        });
        eventsDiv.appendChild(blockDiv);
      }

      const evts = events[key];
      if (evts) {
        evts.forEach((ev, idx) => {
          const evDiv = document.createElement('div');
          evDiv.className = 'fullcal-ev ' + ev.c;
          evDiv.textContent = ev.t + (ev.n ? ' 📝' : '');
          evDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            openEventEditor(key, idx);
          });
          eventsDiv.appendChild(evDiv);
        });
      }
      // Tap empty area of a day to add event
      cell.addEventListener('click', () => {
        if (!cell.classList.contains('other-month')) {
          openQuickAddForDate(key);
        }
      });
    }
    cell.appendChild(eventsDiv);
    grid.appendChild(cell);
  }
  applyZoom(calZoom);
}

function navFullCal(dir) {
  fullCalMonth += dir;
  if (fullCalMonth > 11) { fullCalMonth = 0; fullCalYear++; }
  if (fullCalMonth < 0) { fullCalMonth = 11; fullCalYear--; }
  renderFullCal();
}

function goFullCalToday() {
  fullCalMonth = NOW.getMonth();
  fullCalYear = NOW.getFullYear();
  renderFullCal();
}

// ── ZOOM (slider + pinch-to-zoom with native zoom prevention) ──
let calZoom = 1;
let zoomHideTimer = null;
let pinchStartDist = 0;
let pinchStartZoom = 1;
let isPinching = false;

function getZoomConfig(z) {
  return {
    evFont: Math.round(8 + (z - 1) * 3.5),
    dateFont: Math.round(12 + (z - 1) * 4),
    todaySize: Math.round(20 + (z - 1) * 6),
    cellMinH: Math.round(60 + (z - 1) * 55),
    cellPad: Math.round(2 + (z - 1) * 3),
    evPad: Math.round(1 + (z - 1) * 2),
    evGap: Math.round(1 + (z - 1) * 1.5),
    wrap: z >= 1.8,
    evLineH: (1.35 + (z - 1) * 0.15).toFixed(2),
    gridWidth: Math.round(100 + (z - 1) * 45),
  };
}

function applyZoom(value) {
  calZoom = parseFloat(value);
  const c = getZoomConfig(calZoom);
  const grid = document.getElementById('fullCalGrid');
  const slider = document.getElementById('zoomSlider');
  const label = document.getElementById('zoomLabel');
  if (slider) slider.value = calZoom;
  if (label) label.textContent = calZoom.toFixed(1) + 'x';
  grid.style.width = c.gridWidth + '%';

  grid.querySelectorAll('.fullcal-cell').forEach(cell => {
    cell.style.minHeight = c.cellMinH + 'px';
    cell.style.padding = c.cellPad + 'px';
  });
  grid.querySelectorAll('.fullcal-date').forEach(d => {
    d.style.fontSize = c.dateFont + 'px';
  });
  grid.querySelectorAll('.fullcal-cell.today .fullcal-date').forEach(d => {
    d.style.width = c.todaySize + 'px';
    d.style.height = c.todaySize + 'px';
    d.style.fontSize = Math.round(c.dateFont * 0.8) + 'px';
  });
  grid.querySelectorAll('.fullcal-events').forEach(e => { e.style.gap = c.evGap + 'px'; });
  grid.querySelectorAll('.fullcal-ev').forEach(ev => {
    ev.style.fontSize = c.evFont + 'px';
    ev.style.padding = c.evPad + 'px ' + Math.round(c.evPad * 1.5) + 'px';
    ev.style.lineHeight = c.evLineH;
    ev.style.borderRadius = Math.round(2 + (calZoom - 1) * 2) + 'px';
    ev.style.whiteSpace = c.wrap ? 'normal' : 'nowrap';
    ev.style.wordBreak = c.wrap ? 'break-word' : 'normal';
  });

  const ind = document.getElementById('zoomIndicator');
  ind.textContent = calZoom.toFixed(1) + 'x';
  ind.classList.add('visible');
  clearTimeout(zoomHideTimer);
  zoomHideTimer = setTimeout(() => ind.classList.remove('visible'), 800);
}

// ── PINCH-TO-ZOOM GESTURE HANDLER ──
// Prevents native browser zoom inside calendar, handles it ourselves
(function setupCalendarPinch() {
  const wrapper = document.getElementById('fullCalWrapper');
  if (!wrapper) return;

  // Prevent native zoom on the calendar wrapper when 2 fingers detected
  wrapper.addEventListener('touchstart', function(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      isPinching = true;
      pinchStartDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchStartZoom = calZoom;
    }
  }, { passive: false });

  wrapper.addEventListener('touchmove', function(e) {
    if (e.touches.length === 2) {
      e.preventDefault(); // Block native zoom
      isPinching = true;
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const ratio = dist / pinchStartDist;
      const newZoom = Math.max(1, Math.min(5, pinchStartZoom * ratio));
      applyZoom(newZoom);
    }
  }, { passive: false });

  wrapper.addEventListener('touchend', function(e) {
    if (isPinching && e.touches.length < 2) {
      isPinching = false;
      // Snap to nearest 0.5
      const snapped = Math.max(1, Math.round(calZoom * 2) / 2);
      applyZoom(snapped);
    }
  });

  // Double-tap to toggle between 1x and 2.5x (ignore taps on events/blocks)
  let lastTap = 0;
  wrapper.addEventListener('touchend', function(e) {
    if (e.touches.length === 0 && !isPinching) {
      // Don't trigger zoom if tapping on an event chip or block chip
      var target = e.target;
      if (target.classList.contains('fullcal-ev') || target.closest('.fullcal-ev')) return;
      const now = Date.now();
      if (now - lastTap < 300) {
        applyZoom(calZoom > 1.1 ? 1 : 2.5);
      }
      lastTap = now;
    }
  });
})();

// ── COLOR BLOCKS ──
let nextBlockId = S.get('nextBlockId', 1);
let selectedBlockColor = '#E8B8A8';
let colorBlockTargetDate = null;

function selectBlockColor(swatch) {
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
  swatch.classList.add('selected');
  selectedBlockColor = swatch.dataset.color;
}

function selectPreset(btn, label) {
  document.querySelectorAll('.block-preset').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  document.getElementById('blockLabel').value = label;
  const presetColors = { 'Trip':'#A8C8D8', 'Hub out of town':'#8BB0C8', 'School break':'#A8D0A0', 'Visitors':'#C0A8D0', 'Solo parenting':'#D4A0A0', 'Holiday':'#D8C8A0' };
  if (presetColors[label]) {
    selectedBlockColor = presetColors[label];
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.toggle('selected', s.dataset.color === selectedBlockColor));
  }
}

function openColorBlockModal(dateStr) {
  colorBlockTargetDate = dateStr || null;
  const today = new Date();
  const iso = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
  document.getElementById('blockStartDate').value = iso;
  document.getElementById('blockEndDate').value = iso;
  document.getElementById('blockLabel').value = '';
  document.querySelectorAll('.block-preset').forEach(b => b.classList.remove('selected'));

  if (dateStr) {
    const existing = colorBlocks.find(b => isDateInRange(dateStr, b.startDate, b.endDate));
    if (existing) {
      const sp = existing.startDate.split('-'), ep = existing.endDate.split('-');
      document.getElementById('blockStartDate').value = sp[0]+'-'+sp[1].padStart(2,'0')+'-'+sp[2].padStart(2,'0');
      document.getElementById('blockEndDate').value = ep[0]+'-'+ep[1].padStart(2,'0')+'-'+ep[2].padStart(2,'0');
      document.getElementById('blockLabel').value = existing.label;
      selectedBlockColor = existing.color;
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.toggle('selected', s.dataset.color === existing.color));
    }
  }
  document.getElementById('colorBlockModal').classList.add('visible');
}

function closeColorBlockModal() { document.getElementById('colorBlockModal').classList.remove('visible'); }

function applyColorBlock() {
  const sv = document.getElementById('blockStartDate').value.split('-');
  const ev = document.getElementById('blockEndDate').value.split('-');
  const startStr = parseInt(sv[0])+'-'+parseInt(sv[1])+'-'+parseInt(sv[2]);
  const endStr = parseInt(ev[0])+'-'+parseInt(ev[1])+'-'+parseInt(ev[2]);
  const label = document.getElementById('blockLabel').value.trim();

  if (colorBlockTargetDate) colorBlocks = colorBlocks.filter(b => !isDateInRange(colorBlockTargetDate, b.startDate, b.endDate));
  colorBlocks.push({ id: nextBlockId++, color: selectedBlockColor, label, startDate: startStr, endDate: endStr });
  save('colorBlocks', colorBlocks); save('nextBlockId', nextBlockId);
  closeColorBlockModal();
  renderMiniMonth(); renderFullCal();
  showToast('Color block added!', label || 'Block');
}

function removeColorBlock() {
  if (colorBlockTargetDate) colorBlocks = colorBlocks.filter(b => !isDateInRange(colorBlockTargetDate, b.startDate, b.endDate));
  save('colorBlocks', colorBlocks);
  closeColorBlockModal();
  renderMiniMonth(); renderFullCal();
}

function isDateInRange(d, s, e) { const n = dateToNum(d); return n >= dateToNum(s) && n <= dateToNum(e); }
function dateToNum(s) { const p = s.split('-').map(Number); return p[0]*10000+p[1]*100+p[2]; }

function applyBlockToCell(cell, dateStr) {
  const block = colorBlocks.find(b => isDateInRange(dateStr, b.startDate, b.endDate));
  if (block) {
    cell.setAttribute('data-block-color', block.color);
    const fill = document.createElement('div');
    fill.className = 'day-block-fill';
    fill.style.background = block.color;
    cell.insertBefore(fill, cell.firstChild);
  }
  return block || null;
}

// ── THIS WEEK (auto-populated from events) ──
function renderThisWeek() {
  const body = document.getElementById('thisWeekBody');
  const badge = document.getElementById('weekBadge');
  const startOfWeek = new Date(NOW);
  startOfWeek.setDate(NOW.getDate() - NOW.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  badge.textContent = MONTHS_SHORT[startOfWeek.getMonth()] + ' ' + startOfWeek.getDate() + '–' + endOfWeek.getDate();

  const items = [];
  for (let d = new Date(startOfWeek); d <= endOfWeek; d.setDate(d.getDate() + 1)) {
    const key = d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate();
    const dayEvents = events[key] || [];
    const dayName = DAYS[d.getDay()].slice(0, 3);
    dayEvents.forEach((ev, idx) => {
      items.push({ text: ev.t, color: ev.c, day: dayName, date: new Date(d), dateKey: key, evIdx: idx, hasNotes: !!ev.n });
    });
  }

  if (items.length === 0) {
    body.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div>No events this week. Tap + to add one.</div>';
    return;
  }

  const colorMap = { pink: 'var(--soft-pink)', green: 'var(--soft-green)', blue: 'var(--soft-blue)', yellow: 'var(--soft-yellow)', lavender: 'var(--soft-lavender)' };
  body.innerHTML = items.map((it, i) =>
    '<div class="sched-item" data-datekey="' + it.dateKey + '" data-evidx="' + it.evIdx + '" style="cursor:pointer;"><div class="sched-dot" style="background:' + (colorMap[it.color] || 'var(--mid-gray)') + ';"></div><span>' + esc(it.text) + (it.hasNotes ? ' <span style="font-size:11px;color:var(--text-light);">📝</span>' : '') + '</span><span class="sched-time">' + it.day + '</span></div>'
  ).join('');

  // Make week items tappable
  body.querySelectorAll('.sched-item[data-datekey]').forEach(el => {
    el.addEventListener('click', () => {
      openEventEditor(el.dataset.datekey, parseInt(el.dataset.evidx));
    });
  });
}

// ── TO-DO / GSD RENDERING ──
const ARCHIVE_DAYS = 3;

function renderTodos() {
  const active = todos.filter(t => t.type === 'todo' && !t.done);
  const completed = todos.filter(t => t.type === 'todo' && t.done && !isArchived(t));
  const body = document.getElementById('todoBody');
  const badge = document.getElementById('todoBadge');
  badge.textContent = active.length + ' left';

  if (active.length === 0) {
    body.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div>All clear! Tap + to add a to-do.</div>';
  } else {
    body.innerHTML = active.map(t =>
      '<div class="check-row" data-id="' + t.id + '"><input type="checkbox" onchange="completeTodo(' + t.id + ')"><label>' + esc(t.text) + '</label></div>'
    ).join('');
  }

  // Completed section
  const toggle = document.getElementById('todoCompletedToggle');
  const section = document.getElementById('todoCompleted');
  document.getElementById('todoCompletedCount').textContent = completed.length;
  toggle.style.display = completed.length > 0 ? 'flex' : 'none';
  section.innerHTML = completed.map(t =>
    '<div class="check-row done"><input type="checkbox" checked onchange="uncompleteTodo(' + t.id + ')"><label style="text-decoration:line-through;color:var(--text-light);">' + esc(t.text) + '</label></div>'
  ).join('');
}

const GSD_SECTIONS = [
  { key: 'asap', label: 'ASAP', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4827A" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>', color: '#D4827A' },
  { key: 'gsd_day', label: 'GSD Day', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C8A88C" stroke-width="2.5" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>', color: '#C8A88C' },
  { key: 'around_house', label: 'Around the House', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8BB0C8" stroke-width="2.5" stroke-linecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>', color: '#8BB0C8' },
  { key: 'someday', label: 'Someday', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B8A0C8" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>', color: '#B8A0C8' }
];

function renderGsd() {
  const active = todos.filter(t => t.type === 'gsd' && !t.done);
  const completed = todos.filter(t => t.type === 'gsd' && t.done && !isArchived(t));
  const body = document.getElementById('gsdBody');

  if (active.length === 0) {
    body.innerHTML = GSD_SECTIONS.map(sec =>
      '<div class="gsd-section">' +
      '<div class="gsd-section-header" onclick="toggleGsdSection(\'' + sec.key + '\')">' +
      '<span>' + sec.icon + ' ' + sec.label + '</span>' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
      '<span class="gsd-section-count">0</span>' +
      '<button class="gsd-section-add" onclick="event.stopPropagation(); openGsdAdd(\'' + sec.key + '\')">+</button>' +
      '</div></div></div>'
    ).join('');
    return;
  }

  body.innerHTML = GSD_SECTIONS.map(sec => {
    const sectionTasks = active.filter(t => (t.section || 'asap') === sec.key);
    const collapsed = S.get('gsd_collapsed_' + sec.key, false);
    return '<div class="gsd-section">' +
      '<div class="gsd-section-header" onclick="toggleGsdSection(\'' + sec.key + '\')">' +
      '<span>' + sec.icon + ' ' + sec.label + '</span>' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
      '<span class="gsd-section-count">' + sectionTasks.length + '</span>' +
      '<button class="gsd-section-add" onclick="event.stopPropagation(); openGsdAdd(\'' + sec.key + '\')">+</button>' +
      '<span class="gsd-section-arrow" style="font-size:10px;color:var(--text-light);">' + (collapsed ? '▶' : '▼') + '</span>' +
      '</div></div>' +
      '<div class="gsd-section-body" style="' + (collapsed ? 'display:none;' : '') + '">' +
      (sectionTasks.length === 0
        ? '<div style="padding:12px 16px;font-size:13px;color:var(--text-light);text-align:center;">No tasks yet</div>'
        : sectionTasks.map(t =>
          '<div class="gsd-task-mobile" data-id="' + t.id + '">' +
          '<input type="checkbox" onchange="completeTodo(' + t.id + ')">' +
          '<div class="task-info"><div class="task-name">' + esc(t.text) + '</div>' +
          (t.sub ? '<div class="task-sub">' + esc(t.sub) + '</div>' : '') +
          '</div>' +
          '<button class="go-btn-small" onclick="event.stopPropagation(); openTimer(\'' + esc(t.text).replace(/'/g, "\\'") + '\', 15)">GO</button>' +
          '</div>'
        ).join('')) +
      '</div></div>';
  }).join('');

  const toggle = document.getElementById('gsdCompletedToggle');
  const section = document.getElementById('gsdCompleted');
  document.getElementById('gsdCompletedCount').textContent = completed.length;
  toggle.style.display = completed.length > 0 ? 'flex' : 'none';
  section.innerHTML = completed.map(t =>
    '<div class="gsd-task-mobile" style="opacity:0.5;" data-id="' + t.id + '"><input type="checkbox" checked onchange="uncompleteTodo(' + t.id + ')"><div class="task-info"><div class="task-name" style="text-decoration:line-through;">' + esc(t.text) + '</div></div><span class="est" style="background:var(--soft-green);color:#4A7A52;font-weight:600;">Done!</span></div>'
  ).join('');
}

function toggleGsdSection(key) {
  const collapsed = S.get('gsd_collapsed_' + key, false);
  S.set('gsd_collapsed_' + key, !collapsed);
  renderGsd();
}

let _gsdAddSection = 'asap';
function openGsdAdd(sectionKey) {
  _gsdAddSection = sectionKey;
  openQuickAdd('gsd');
  // Pre-select section in the picker
  setTimeout(() => {
    const sel = document.getElementById('gsdSectionPicker');
    if (sel) sel.value = sectionKey;
  }, 50);
}

function completeTodo(id) {
  const t = todos.find(x => x.id === id);
  if (t) { t.done = true; t.doneAt = Date.now(); save('todos', todos); }
  renderTodos(); renderGsd(); updateDateLine();
}

function uncompleteTodo(id) {
  const t = todos.find(x => x.id === id);
  if (t) { t.done = false; t.doneAt = null; save('todos', todos); }
  renderTodos(); renderGsd(); updateDateLine();
}

function isArchived(t) {
  if (!t.doneAt) return false;
  return (Date.now() - t.doneAt) > ARCHIVE_DAYS * 86400000;
}

// Auto-archive: clean up old completed items on load
function autoArchive() {
  const before = todos.length;
  todos = todos.filter(t => !isArchived(t));
  if (todos.length !== before) save('todos', todos);
  const beforeG = groceries.length;
  groceries = groceries.filter(g => !(g.done && g.doneAt && (Date.now() - g.doneAt) > ARCHIVE_DAYS * 86400000));
  if (groceries.length !== beforeG) save('groceries', groceries);
}

// ── COMMON GROCERY ITEMS (quick-add per category) ──
const COMMON_ITEMS = {
  dairy: ['Milk','Eggs','Butter','Cheese','Yogurt','Cream cheese','Sour cream','Heavy cream','Shredded cheese','Coffee creamer'],
  meat: ['Chicken breasts','Ground beef','Ground turkey','Bacon','Deli turkey','Sausage','Pork chops','Steak','Deli ham','Hot dogs'],
  produce: ['Bananas','Apples','Strawberries','Avocados','Tomatoes','Onions','Potatoes','Lettuce','Baby spinach','Lemons','Bell peppers','Garlic','Broccoli','Carrots','Sweet potatoes'],
  pantry: ['Bread','Rice','Pasta','Peanut butter','Goldfish crackers','Granola bars','Cereal','Chips','Tortillas','Canned beans','Chicken broth','Olive oil','Ketchup','Mac & cheese'],
  other: ['Paper towels','Toilet paper','Trash bags','Dish soap','Laundry detergent','Ziplock bags','Aluminum foil','Baby wipes','Diapers','Dog food']
};

function renderGroceryQuickAdd(cat) {
  const existing = groceries.filter(g => g.cat === cat).map(g => g.text.replace(/\s*\(.*\)$/, '').toLowerCase());
  const suggestions = COMMON_ITEMS[cat].filter(item => !existing.includes(item.toLowerCase()));
  if (suggestions.length === 0) return '';
  return '<div style="border-top:1px solid var(--cream);margin-top:4px;padding-top:4px;">' +
    '<button class="completed-toggle" onclick="toggleQuickAdd(\'' + cat + '\')" style="padding:4px 0;">' +
    '<span class="toggle-arrow" id="qaArrow_' + cat + '">▶</span> Quick add</button>' +
    '<div class="completed-section" id="qaSection_' + cat + '">' +
    '<div class="quick-add-chips">' +
    suggestions.map(item =>
      '<button class="quick-chip" onclick="quickAddGrocery(\'' + esc(item).replace(/'/g, "\\'") + '\', \'' + cat + '\', this)">+ ' + esc(item) + '</button>'
    ).join('') +
    '</div></div></div>';
}

function toggleQuickAdd(cat) {
  const section = document.getElementById('qaSection_' + cat);
  const arrow = document.getElementById('qaArrow_' + cat);
  if (section) section.classList.toggle('open');
  if (arrow) arrow.classList.toggle('open');
}

function quickAddGrocery(name, cat, btn) {
  // Show quantity picker inline
  if (btn.classList.contains('picked')) return;
  btn.classList.add('picked');
  btn.innerHTML = '<span style="font-weight:600;">' + esc(name) + '</span> <span class="qty-controls">' +
    '<button class="qty-btn" onclick="event.stopPropagation(); adjustQty(this, -1)">−</button>' +
    '<span class="qty-val">1</span>' +
    '<button class="qty-btn" onclick="event.stopPropagation(); adjustQty(this, 1)">+</button>' +
    '<button class="qty-confirm" onclick="event.stopPropagation(); confirmGroceryAdd(\'' + esc(name).replace(/'/g, "\\'") + '\', \'' + cat + '\', this)">Add</button>' +
    '</span>';
}

function adjustQty(btn, delta) {
  const valEl = btn.parentElement.querySelector('.qty-val');
  let val = parseInt(valEl.textContent) + delta;
  if (val < 1) val = 1;
  if (val > 20) val = 20;
  valEl.textContent = val;
}

function confirmGroceryAdd(name, cat, btn) {
  const qtyEl = btn.parentElement.querySelector('.qty-val');
  const qty = parseInt(qtyEl.textContent);
  const text = qty > 1 ? name + ' (' + qty + ')' : name;
  groceries.push({ id: getId(), text: text, cat: cat, done: false, doneAt: null, qty: qty });
  save('groceries', groceries);
  renderGroceries();
  showToast('Added!', text);
}

// ── GROCERY RENDERING ──
function renderGroceryItem(g) {
  const checked = g.done ? ' checked' : '';
  const strikeStyle = g.done ? 'text-decoration:line-through;color:var(--text-light);' : '';
  return '<div class="check-row' + (g.done ? ' done' : '') + '" data-id="' + g.id + '">' +
    '<input type="checkbox"' + checked + ' onchange="toggleGrocery(' + g.id + ')">' +
    '<label style="' + strikeStyle + 'flex:1;">' + esc(g.text) + '</label>' +
    '<button style="background:none;border:none;font-size:14px;cursor:pointer;padding:4px 8px;color:var(--text-light);" onclick="deleteGrocery(' + g.id + ')">✕</button>' +
    '</div>';
}

function renderGroceries() {
  const catMap = { dairy: 'groceryDairy', meat: 'groceryMeat', produce: 'groceryProduce', pantry: 'groceryPantry', other: 'groceryOther' };
  const countMap = { dairy: 'dairyCount', meat: 'meatCount', produce: 'produceCount', pantry: 'pantryCount', other: 'otherCount' };

  Object.keys(catMap).forEach(cat => {
    const el = document.getElementById(catMap[cat]);
    const allItems = groceries.filter(g => g.cat === cat);
    const activeItems = allItems.filter(g => !g.done);
    document.getElementById(countMap[cat]).textContent = activeItems.length + ' item' + (activeItems.length !== 1 ? 's' : '');

    // Show all items (active first, then checked) + quick add
    const active = allItems.filter(g => !g.done);
    const checked = allItems.filter(g => g.done);
    el.innerHTML = active.map(renderGroceryItem).join('') +
      checked.map(renderGroceryItem).join('') +
      renderGroceryQuickAdd(cat);
  });

  const total = groceries.filter(g => !g.done).length;
  const totalAll = groceries.length;
  document.getElementById('grocerySubtitle').textContent = total + ' item' + (total !== 1 ? 's' : '') + (total !== totalAll ? ' (' + (totalAll - total) + ' checked off)' : '');

  // Show/hide H-E-B order bar
  const hebBar = document.getElementById('hebOrderBar');
  if (hebBar) hebBar.style.display = total > 0 ? 'flex' : 'none';

  // Hide the old completed section (we show them inline now)
  const toggle = document.getElementById('groceryCompletedToggle');
  if (toggle) toggle.style.display = 'none';
  const section = document.getElementById('groceryCompleted');
  if (section) section.innerHTML = '';
}

function toggleGrocery(id) {
  const g = groceries.find(x => x.id === id);
  if (g) {
    g.done = !g.done;
    g.doneAt = g.done ? Date.now() : null;
    save('groceries', groceries);
  }
  renderGroceries();
}

function deleteGrocery(id) {
  groceries = groceries.filter(g => g.id !== id);
  save('groceries', groceries);
  renderGroceries();
}

// ── H-E-B / INSTACART INTEGRATION ──
function getGroceryListText() {
  const catLabels = { dairy: 'Dairy & Eggs', meat: 'Meat', produce: 'Produce', pantry: 'Pantry & Snacks', other: 'Other' };
  const active = groceries.filter(g => !g.done);
  if (active.length === 0) return '';
  let text = '';
  Object.keys(catLabels).forEach(cat => {
    const items = active.filter(g => g.cat === cat);
    if (items.length > 0) {
      text += catLabels[cat] + ':\n';
      items.forEach(g => { text += '  - ' + g.text + '\n'; });
      text += '\n';
    }
  });
  return text.trim();
}

function copyGroceryList() {
  const text = getGroceryListText();
  if (!text) { showToast('List is empty', 'Add items first'); return; }
  navigator.clipboard.writeText(text).then(() => {
    showToast('List copied!', groceries.filter(g => !g.done).length + ' items');
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('List copied!', groceries.filter(g => !g.done).length + ' items');
  });
}

async function sendToHeb() {
  const active = groceries.filter(g => !g.done);
  if (active.length === 0) { showToast('List is empty', 'Add items first'); return; }

  try {
    const resp = await fetch('/api/instacart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: active.map(g => ({ name: g.text, quantity: 1, unit: 'each' })),
        zipCode: '78666'
      })
    });
    const data = await resp.json();

    if (resp.ok && data.url) {
      showToast('Opening H-E-B on Instacart...', active.length + ' items');
      window.open(data.url, '_blank');
      return;
    }

    if (data.fallback) {
      hebBridgeFallback(active);
      return;
    }

    throw new Error(data.error || 'Unknown error');
  } catch (err) {
    hebBridgeFallback(active);
  }
}

function hebBridgeFallback(active) {
  const text = getGroceryListText();
  navigator.clipboard.writeText(text).then(() => {
    showToast('List copied!', 'Paste in H-E-B search');
    window.open('https://www.heb.com/shop', '_blank');
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('List copied!', 'Paste in H-E-B search');
    window.open('https://www.heb.com/shop', '_blank');
  });
}

// ── REMINDERS RENDERING ──
const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function renderReminders() {
  const body = document.getElementById('remindersBody');
  if (reminders.length === 0) {
    body.innerHTML = '<div class="empty-state"><div class="empty-icon">🔁</div>No reminders yet. Tap + below to add one.</div>' +
      '<div style="text-align:center;padding-bottom:8px;"><button class="go-btn" onclick="openAddReminder()">+ Add Reminder</button></div>';
    return;
  }
  body.innerHTML = reminders.map(r =>
    '<div class="reminder-item" data-id="' + r.id + '">' +
    '<div class="reminder-info"><div class="r-title">' + esc(r.title) + '</div>' +
    '<div class="r-sub">Every ' + (r.day || 'Sunday') + (r.sub ? ' — ' + esc(r.sub) : '') + '</div></div>' +
    '<button class="go-btn" onclick="openTimer(\'' + esc(r.title).replace(/'/g, "\\'") + '\', ' + (r.minutes || 10) + ')">GO</button>' +
    '<button style="background:none;border:none;font-size:16px;cursor:pointer;padding:4px 8px;color:var(--text-light);" onclick="deleteReminder(' + r.id + ')">✕</button>' +
    '</div>'
  ).join('') +
  '<div style="text-align:center;padding:8px 0;"><button class="go-btn" onclick="openAddReminder()">+ Add Reminder</button></div>';
}

function deleteReminder(id) {
  reminders = reminders.filter(r => r.id !== id);
  save('reminders', reminders);
  renderReminders();
}

function openAddReminder() {
  // Use the quick add modal with custom fields
  const modal = document.getElementById('quickAddModal');
  document.getElementById('quickAddTitle').textContent = 'Add Weekly Reminder';
  document.getElementById('quickAddInput').placeholder = 'e.g. Pick HelloFresh meals';
  document.getElementById('quickAddInput').value = '';
  document.getElementById('eventFields').style.display = 'none';
  document.getElementById('groceryFields').style.display = 'none';

  // Show reminder-specific fields
  let reminderFields = document.getElementById('reminderFields');
  if (!reminderFields) {
    reminderFields = document.createElement('div');
    reminderFields.id = 'reminderFields';
    reminderFields.innerHTML =
      '<div class="event-form-row">' +
      '<select id="reminderDay">' +
      DAY_NAMES.map(d => '<option value="' + d + '"' + (d === 'Sunday' ? ' selected' : '') + '>' + d + '</option>').join('') +
      '<option value="Daily">Daily</option>' +
      '</select>' +
      '<select id="reminderMinutes">' +
      '<option value="5">5 min timer</option>' +
      '<option value="10" selected>10 min timer</option>' +
      '<option value="15">15 min timer</option>' +
      '<option value="20">20 min timer</option>' +
      '<option value="30">30 min timer</option>' +
      '<option value="45">45 min timer</option>' +
      '<option value="60">60 min timer</option>' +
      '</select>' +
      '</div>' +
      '<input class="modal-input" id="reminderSub" type="text" placeholder="Details (optional) e.g. choose before midnight">';
    document.getElementById('quickAddInput').parentElement.insertBefore(reminderFields, document.getElementById('quickAddInput').nextSibling.nextSibling);
  }
  reminderFields.style.display = 'block';

  // Override the submit button for reminders
  currentQuickAddType = 'reminder';
  modal.classList.add('visible');
  setTimeout(() => document.getElementById('quickAddInput').focus(), 300);
}

// ── IDEAS RENDERING ──
function renderIdeas() {
  const body = document.getElementById('ideasBody');
  if (ideas.length === 0) {
    body.innerHTML = '<div class="empty-state"><div class="empty-icon">💡</div>Your brain is empty! Tap + to dump an idea.</div>';
    return;
  }
  body.innerHTML = ideas.map(idea =>
    '<div class="idea-card-mobile" data-id="' + idea.id + '"><h3>' + esc(idea.title) + '</h3>' +
    (idea.body ? '<p>' + esc(idea.body) + '</p>' : '') +
    '<span class="idea-tag-mobile" style="background:' + (idea.tagColor || 'var(--soft-yellow)') + '; color:#7A7040;">' + esc(idea.tag || 'Idea') + '</span></div>'
  ).join('');
}

// ── COMPLETED SECTION TOGGLES ──
function toggleCompleted(type) {
  const section = document.getElementById(type + 'Completed');
  const arrow = document.getElementById(type + 'ToggleArrow');
  const isOpen = section.classList.contains('open');
  section.classList.toggle('open');
  arrow.classList.toggle('open');
}

// ── FAB (center nav button) ──
let fabOpen = false;
function toggleFab() {
  fabOpen = !fabOpen;
  document.getElementById('fabBtn').classList.toggle('open', fabOpen);
  document.getElementById('fabMenu').classList.toggle('open', fabOpen);
  const overlay = document.getElementById('fabMenuOverlay');
  if (overlay) overlay.classList.toggle('open', fabOpen);
}
function closeFab() {
  fabOpen = false;
  document.getElementById('fabBtn').classList.remove('open');
  document.getElementById('fabMenu').classList.remove('open');
  const overlay = document.getElementById('fabMenuOverlay');
  if (overlay) overlay.classList.remove('open');
}

// ── QUICK ADD ──
let currentQuickAddType = '';
const addTitles = { grocery:'Add Grocery Item', todo:'Add To-Do', idea:'Brain Dump', event:'Add Event', gsd:'Add GSD Task' };
const addPlaceholders = { grocery:'e.g. Whole milk 2 gal', todo:'e.g. Call dentist', idea:'What\'s on your mind?', event:'e.g. Soccer practice', gsd:'e.g. Return Amazon packages' };

function openQuickAdd(type) {
  closeFab();
  currentQuickAddType = type;
  document.getElementById('quickAddTitle').textContent = addTitles[type];
  document.getElementById('quickAddInput').placeholder = addPlaceholders[type];
  document.getElementById('quickAddInput').value = '';
  document.getElementById('eventFields').style.display = type === 'event' ? 'block' : 'none';
  document.getElementById('groceryFields').style.display = type === 'grocery' ? 'block' : 'none';
  document.getElementById('gsdFields').style.display = type === 'gsd' ? 'block' : 'none';
  const rf = document.getElementById('reminderFields');
  if (rf) rf.style.display = 'none';

  if (type === 'event') {
    const today = new Date();
    document.getElementById('eventDate').value = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
    document.getElementById('eventTime').value = '';
  }

  document.getElementById('quickAddModal').classList.add('visible');
  setTimeout(() => document.getElementById('quickAddInput').focus(), 300);
}

function closeQuickAdd() { document.getElementById('quickAddModal').classList.remove('visible'); }

document.getElementById('quickAddSubmit').onclick = function() {
  const val = document.getElementById('quickAddInput').value.trim();
  if (!val) { closeQuickAdd(); return; }

  try { switch(currentQuickAddType) {
    case 'event': {
      const dateVal = document.getElementById('eventDate').value;
      if (!dateVal) { closeQuickAdd(); return; }
      const dp = dateVal.split('-');
      const key = parseInt(dp[0]) + '-' + parseInt(dp[1]) + '-' + parseInt(dp[2]);
      const timeVal = document.getElementById('eventTime').value;
      const color = document.getElementById('eventColor').value;
      const timeDisplay = to12hr(timeVal);
      const text = timeDisplay ? val + ' ' + timeDisplay : val;
      if (!events[key]) events[key] = [];
      events[key].push({ t: text, c: color });
      save('events', events);
      // Also add as to-do if checkbox is checked
      const alsoTodo = document.getElementById('eventAlsoTodo');
      if (alsoTodo && alsoTodo.checked) {
        todos.push({ id: getId(), text: text, done: false, doneAt: null, type: 'todo' });
        save('todos', todos);
        renderTodos();
      }
      renderMiniMonth(); renderThisWeek(); updateDateLine();
      if (document.getElementById('tab-calendar').classList.contains('active')) renderFullCal();
      showToast('Event added!', text);
      break;
    }
    case 'grocery': {
      const cat = document.getElementById('groceryCat').value;
      groceries.push({ id: getId(), text: val, cat, done: false, doneAt: null });
      save('groceries', groceries);
      renderGroceries();
      showToast('Added to grocery list!', val);
      break;
    }
    case 'todo': {
      todos.push({ id: getId(), text: val, done: false, doneAt: null, type: 'todo' });
      save('todos', todos);
      renderTodos(); updateDateLine();
      showToast('To-do added!', val);
      break;
    }
    case 'gsd': {
      const gsdSec = document.getElementById('gsdSectionPicker');
      const section = gsdSec ? gsdSec.value : (_gsdAddSection || 'asap');
      todos.push({ id: getId(), text: val, done: false, doneAt: null, type: 'gsd', section: section });
      save('todos', todos);
      renderGsd();
      const secLabel = (GSD_SECTIONS.find(s => s.key === section) || {}).label || section;
      showToast('GSD task added!', secLabel + ' — ' + val);
      _gsdAddSection = 'asap';
      break;
    }
    case 'idea': {
      ideas.push({ id: getId(), title: val, body: '', tag: 'New', tagColor: 'var(--soft-yellow)' });
      save('ideas', ideas);
      renderIdeas();
      showToast('Idea captured!', val);
      break;
    }
    case 'reminder': {
      const day = document.getElementById('reminderDay') ? document.getElementById('reminderDay').value : 'Sunday';
      const minutes = document.getElementById('reminderMinutes') ? parseInt(document.getElementById('reminderMinutes').value) : 10;
      const sub = document.getElementById('reminderSub') ? document.getElementById('reminderSub').value.trim() : '';
      reminders.push({ id: getId(), title: val, sub: sub, day: day, minutes: minutes });
      save('reminders', reminders);
      renderReminders();
      showToast('Reminder added!', val + ' — every ' + day);
      // Hide reminder fields
      const rf = document.getElementById('reminderFields');
      if (rf) rf.style.display = 'none';
      break;
    }
  } } catch(e) { console.error('Quick add error:', e); }
  closeQuickAdd();
};

// ── TIMER ──
let timerSeconds = 0, timerInterval = null, timerRunning = false;

function openTimer(task, minutes) {
  timerSeconds = minutes * 60;
  timerRunning = false;
  document.getElementById('timerTaskName').textContent = task;
  document.getElementById('timerStartBtn').textContent = 'Ready, Set, GO!';
  updateTimerDisplay();
  document.getElementById('timerModal').classList.add('visible');
}

function closeTimer() {
  clearInterval(timerInterval);
  timerRunning = false;
  document.getElementById('timerModal').classList.remove('visible');
}

function toggleRunTimer() {
  const btn = document.getElementById('timerStartBtn');
  if (timerRunning) {
    clearInterval(timerInterval);
    btn.textContent = 'Resume';
    timerRunning = false;
  } else {
    timerInterval = setInterval(() => {
      timerSeconds--;
      if (timerSeconds <= 0) { clearInterval(timerInterval); timerRunning = false; btn.textContent = 'Done!'; }
      updateTimerDisplay();
    }, 1000);
    btn.textContent = 'Pause';
    timerRunning = true;
  }
}

function updateTimerDisplay() {
  document.getElementById('timerTime').textContent =
    String(Math.floor(timerSeconds / 60)).padStart(2,'0') + ':' + String(timerSeconds % 60).padStart(2,'0');
}

// ── CALENDAR EVENT EDITOR ──
let editingEventKey = null;
let editingEventIdx = null;

function openBlockEditor(blockId, dateKey) {
  const block = colorBlocks.find(b => b.id === blockId);
  if (!block) return;

  const menu = document.getElementById('contextMenu');
  const overlay = document.getElementById('contextOverlay');

  const dateRange = block.startDate + ' to ' + block.endDate;
  menu.innerHTML =
    '<div style="padding:14px 18px 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-light);">' +
    esc(block.label || 'Color Block') + '<div style="font-weight:400;margin-top:2px;text-transform:none;letter-spacing:0;">' + dateRange + '</div></div>' +
    '<div class="context-menu-item" onclick="editBlockFromMenu(' + blockId + ')"><span class="cm-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span> Edit Block</div>' +
    '<div class="context-menu-item" style="color:var(--danger);" onclick="deleteBlockFromMenu(' + blockId + ')"><span class="cm-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></span> Remove Block</div>';

  overlay.classList.add('visible');
  menu.style.left = '50%';
  menu.style.top = '50%';
  menu.style.transform = 'translate(-50%, -50%)';
  requestAnimationFrame(() => menu.classList.add('visible'));
}

function editBlockFromMenu(blockId) {
  hideContext();
  const block = colorBlocks.find(b => b.id === blockId);
  if (!block) return;
  // Open color block modal pre-filled with this block's data
  colorBlockTargetDate = block.startDate;
  const sp = block.startDate.split('-'), ep = block.endDate.split('-');
  document.getElementById('blockStartDate').value = sp[0] + '-' + sp[1].padStart(2,'0') + '-' + sp[2].padStart(2,'0');
  document.getElementById('blockEndDate').value = ep[0] + '-' + ep[1].padStart(2,'0') + '-' + ep[2].padStart(2,'0');
  document.getElementById('blockLabel').value = block.label || '';
  selectedBlockColor = block.color;
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.toggle('selected', s.dataset.color === block.color));
  document.querySelectorAll('.block-preset').forEach(b => b.classList.remove('selected'));
  document.getElementById('colorBlockModal').classList.add('visible');
}

function deleteBlockFromMenu(blockId) {
  hideContext();
  colorBlocks = colorBlocks.filter(b => b.id !== blockId);
  save('colorBlocks', colorBlocks);
  renderMiniMonth();
  renderFullCal();
  showToast('Color block removed', '');
}

function openEventEditor(dateKey, eventIdx) {
  editingEventKey = dateKey;
  editingEventIdx = eventIdx;
  const ev = events[dateKey][eventIdx];

  // Parse date for display
  const parts = dateKey.split('-');
  const dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // Parse time from event text (e.g. "Dentist 2:30 PM" → extract time)
  const timeMatch = ev.t.match(/\s+(\d{1,2}:\d{2}\s*(?:AM|PM))$/i);
  let titleText = ev.t;
  let timeVal = '';
  if (timeMatch) {
    titleText = ev.t.replace(timeMatch[0], '').trim();
    // Convert 12hr to 24hr for input
    const t = timeMatch[1].trim();
    const tp = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (tp) {
      let h = parseInt(tp[1]);
      const m = tp[2];
      const ampm = tp[3].toUpperCase();
      if (ampm === 'PM' && h < 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
      timeVal = String(h).padStart(2, '0') + ':' + m;
    }
  }

  document.getElementById('eventDetailTitle').textContent = titleText;
  document.getElementById('eventDetailDate').textContent = dateStr;
  document.getElementById('eventEditTitle').value = titleText;
  document.getElementById('eventEditTime').value = timeVal;
  document.getElementById('eventEditColor').value = ev.c || 'blue';
  document.getElementById('eventEditNotes').value = ev.n || '';

  document.getElementById('eventDetailModal').classList.add('visible');
}

function closeEventDetail() {
  document.getElementById('eventDetailModal').classList.remove('visible');
  editingEventKey = null;
  editingEventIdx = null;
}

function saveEventDetail() {
  if (!editingEventKey || editingEventIdx === null) return;
  const title = document.getElementById('eventEditTitle').value.trim();
  if (!title) return;

  const timeVal = document.getElementById('eventEditTime').value;
  const color = document.getElementById('eventEditColor').value;
  const notes = document.getElementById('eventEditNotes').value.trim();

  const timeDisplay = to12hr(timeVal);
  const fullText = timeDisplay ? title + ' ' + timeDisplay : title;

  events[editingEventKey][editingEventIdx].t = fullText;
  events[editingEventKey][editingEventIdx].c = color;
  events[editingEventKey][editingEventIdx].n = notes;
  save('events', events);

  renderMiniMonth(); renderThisWeek(); renderFullCal();
  closeEventDetail();
  showToast('Event updated', fullText);
}

function deleteEventFromDetail() {
  if (!editingEventKey || editingEventIdx === null) return;
  events[editingEventKey].splice(editingEventIdx, 1);
  if (events[editingEventKey].length === 0) delete events[editingEventKey];
  save('events', events);
  renderMiniMonth(); renderThisWeek(); updateDateLine(); renderFullCal();
  closeEventDetail();
  showToast('Event deleted', '');
}

function openQuickAddForDate(dateKey) {
  openQuickAdd('event');
  // Pre-fill the date
  const parts = dateKey.split('-');
  const isoDate = parts[0] + '-' + parts[1].padStart(2, '0') + '-' + parts[2].padStart(2, '0');
  setTimeout(() => {
    document.getElementById('eventDate').value = isoDate;
  }, 100);
}

// ── CONTEXT MENU ──
function hideContext() {
  document.getElementById('contextOverlay').classList.remove('visible');
  const menu = document.getElementById('contextMenu');
  menu.classList.remove('visible');
  menu.style.transform = '';
}

// ── ESCAPE KEY ──
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeQuickAdd(); closeTimer(); hideContext(); closeFab(); closeColorBlockModal(); closeChat(); closeEventDetail(); }
});

// ── DAILY ENCOURAGEMENT ──
const encouragements = [
  { quip: "You're not behind. You're running a whole kingdom before 8 AM. Queens don't punch clocks.", verse: "She is clothed with strength and dignity; she can laugh at the days to come.", ref: "Proverbs 31:25" },
  { quip: "That laundry pile isn't going anywhere. But neither is the God who gave you the strength to tackle it like a boss.", verse: "I can do all things through Christ who strengthens me.", ref: "Philippians 4:13" },
  { quip: "You fed humans today. You kept them alive. Some CEOs can barely keep a plant going. You're elite.", verse: "She watches over the affairs of her household and does not eat the bread of idleness.", ref: "Proverbs 31:27" },
  { quip: "Messy bun. Cold coffee. Still the most important person in every room you walk into.", verse: "Charm is deceptive, and beauty is fleeting; but a woman who fears the Lord is to be praised.", ref: "Proverbs 31:30" },
  { quip: "God didn't give you these kids because you'd be perfect. He gave them to you because you'd be relentless.", verse: "Let us not become weary in doing good, for at the proper time we will reap a harvest if we do not give up.", ref: "Galatians 6:9" },
  { quip: "You're not 'just a mom.' You're the COO, CFO, head chef, Uber driver, therapist, and hype woman. With zero PTO.", verse: "Whatever you do, work at it with all your heart, as working for the Lord.", ref: "Colossians 3:23" },
  { quip: "Your patience has been tested more than any software on earth. And girl, you're still running.", verse: "But those who hope in the Lord will renew their strength. They will soar on wings like eagles.", ref: "Isaiah 40:31" },
  { quip: "The fact that everyone in this house is alive, dressed-ish, and semi-fed? That's the Holy Spirit working overtime through you.", verse: "For it is God who works in you to will and to act in order to fulfill his good purpose.", ref: "Philippians 2:13" },
  { quip: "You don't need to have it all together. You just need to show up. And you did. Again. Like a legend.", verse: "His mercies are new every morning; great is his faithfulness.", ref: "Lamentations 3:22-23" },
  { quip: "Your to-do list is terrifying. But so was Goliath. And we know how that ended.", verse: "The Lord who rescued me from the paw of the lion and the paw of the bear will rescue me.", ref: "1 Samuel 17:37" },
  { quip: "You're raising warriors, not wimps. The chaos is just combat training.", verse: "Train up a child in the way he should go; even when he is old he will not depart from it.", ref: "Proverbs 22:6" },
  { quip: "Somewhere between the school drop-off and the grocery store, you became the strongest person you know.", verse: "The Lord is my strength and my shield; my heart trusts in him, and he helps me.", ref: "Psalm 28:7" },
  { quip: "Crying in the bathroom counts as a prayer meeting. He hears you in there too.", verse: "The Lord is close to the brokenhearted and saves those who are crushed in spirit.", ref: "Psalm 34:18" },
  { quip: "You don't need permission to rest. Even God took a day off, and He's literally omnipotent.", verse: "Come to me, all you who are weary and burdened, and I will give you rest.", ref: "Matthew 11:28" },
  { quip: "Comparison is a thief, and Instagram is its getaway car. You're doing better than the highlight reel.", verse: "We do not dare to compare ourselves with some who commend themselves. They are not wise.", ref: "2 Corinthians 10:12" },
  { quip: "You showed up for your people today. That's not nothing. That's everything.", verse: "Greater love has no one than this: to lay down one's life for one's friends.", ref: "John 15:13" },
  { quip: "Nobody told you motherhood was a contact sport. But here you are — undefeated.", verse: "I have fought the good fight, I have finished the race, I have kept the faith.", ref: "2 Timothy 4:7" },
  { quip: "That tantrum didn't break you. That argument didn't define you. You're still standing.", verse: "We are hard pressed on every side, but not crushed; perplexed, but not in despair.", ref: "2 Corinthians 4:8" },
  { quip: "You're not failing. You're refining. Even gold has to walk through fire.", verse: "These trials have come so that the proven genuineness of your faith may result in praise, glory and honor.", ref: "1 Peter 1:7" },
  { quip: "Your kids won't remember if the house was clean. They'll remember that Mom was a force of nature.", verse: "Her children arise and call her blessed; her husband also, and he praises her.", ref: "Proverbs 31:28" },
  { quip: "You made 47 decisions before 9 AM. The Supreme Court does like 80 a year.", verse: "If any of you lacks wisdom, you should ask God, who gives generously to all.", ref: "James 1:5" },
  { quip: "Plot twist: the woman you're becoming while raising these kids? She's the whole point.", verse: "And we know that in all things God works for the good of those who love him.", ref: "Romans 8:28" },
  { quip: "You held someone's whole world together today. Don't you dare call that 'not enough.'", verse: "She opens her arms to the poor and extends her hands to the needy.", ref: "Proverbs 31:20" },
  { quip: "You don't need a cape. You've got a minivan, a prayer, and sheer audacity.", verse: "For God has not given us a spirit of fear, but of power and of love and of a sound mind.", ref: "2 Timothy 1:7" },
  { quip: "Some days you conquer the mountain. Some days you just survive the carpool lane. Both count.", verse: "The Lord himself goes before you and will be with you; he will never leave you nor forsake you.", ref: "Deuteronomy 31:8" },
  { quip: "The dinner was fine. The kids are fine. You are fine. And by 'fine' I mean a warrior in yoga pants.", verse: "Be strong and courageous. Do not be afraid; do not be discouraged.", ref: "Joshua 1:9" },
  { quip: "You're not just managing chaos — you're building a legacy. Even when it looks like mac and cheese.", verse: "Unless the Lord builds the house, the builders labor in vain.", ref: "Psalm 127:1" },
  { quip: "Every 'Mom!' screamed from another room is evidence that you are irreplaceable.", verse: "Many women do noble things, but you surpass them all.", ref: "Proverbs 31:29" },
  { quip: "The enemy wants you to believe you're not cut out for this. But God hand-picked you.", verse: "Before I formed you in the womb I knew you, before you were born I set you apart.", ref: "Jeremiah 1:5" },
  { quip: "Today's prayer: Lord, give me the confidence of a toddler who just said 'no' to broccoli and meant it.", verse: "Let us then approach God's throne of grace with confidence.", ref: "Hebrews 4:16" },
  { quip: "You are not behind schedule. You're on God's schedule. And He's never once panicked.", verse: "He has made everything beautiful in its time.", ref: "Ecclesiastes 3:11" },
];

let currentEncIdx = 0;

function setDailyEncouragement() {
  const dayOfYear = Math.floor((NOW - new Date(NOW.getFullYear(), 0, 0)) / 86400000);
  currentEncIdx = dayOfYear % encouragements.length;
  renderEncouragement();
}

function nextEncouragement() {
  currentEncIdx = (currentEncIdx + 1) % encouragements.length;
  const el = document.getElementById('dailyWord');
  el.style.opacity = '0'; el.style.transform = 'translateY(4px)';
  setTimeout(() => { renderEncouragement(); el.style.opacity = '1'; el.style.transform = 'translateY(0)'; }, 200);
}

function renderEncouragement() {
  const e = encouragements[currentEncIdx];
  document.getElementById('dwQuip').textContent = e.quip;
  document.getElementById('dwVerse').textContent = '"' + e.verse + '"';
  document.getElementById('dwRef').textContent = '— ' + e.ref;
}

// ── MARRIAGE DASHBOARD ──
const tankConfig = {
  touch: { name:'Touch & Romance', emoji:'🔥', color:'#E8B8A8', colorBg:'#F8E8E0',
    lowNotif: { title:"Her Touch tank is running low", body:"She's craving connection. A long hug, hold her hand, or just tell her she's beautiful." },
    suggestions: [
      { icon:'💋', text:'<strong>Kiss her</strong> — not the peck-on-the-way-out kind. A real one.', action:'Send hint' },
      { icon:'🛋️', text:'<strong>Initiate cuddling</strong> on the couch tonight. No phones.', action:'Send hint' },
      { icon:'💌', text:'<strong>Send her a text</strong>: "Just thinking about you."', action:'Send hint' },
    ]
  },
  time: { name:'Quality Time', emoji:'💬', color:'#A8C8D8', colorBg:'#E0EDF4',
    lowNotif: { title:"Her Quality Time tank needs a refill", body:"She misses you — not logistics-you, the real you." },
    suggestions: [
      { icon:'🍽️', text:'<strong>Plan a date night</strong> this week. Even takeout on the porch.', action:'Send hint' },
      { icon:'📱', text:'<strong>Put the phone down</strong> for 30 min tonight.', action:'Send hint' },
      { icon:'☕', text:'<strong>Morning coffee together</strong> before the chaos starts.', action:'Send hint' },
    ]
  },
  help: { name:'Help Around the House', emoji:'🏠', color:'#A8D0A0', colorBg:'#E0F0D8',
    lowNotif: { title:"She needs backup on the home front", body:"Handle bedtime, do the dishes, or just ask 'What can I take off your plate?'" },
    suggestions: [
      { icon:'🍳', text:'<strong>Handle dinner tonight.</strong> Even cereal counts.', action:'Send hint' },
      { icon:'🛏️', text:'<strong>Do bedtime solo.</strong> Tell her to go sit down.', action:'Send hint' },
      { icon:'🧹', text:'<strong>Clean the kitchen</strong> without being asked.', action:'Send hint' },
      { icon:'🗣️', text:'<strong>Ask her:</strong> "What can I take off your plate?"', action:'Send hint' },
    ]
  },
  emotional: { name:'Emotional Support', emoji:'💜', color:'#C0A8D0', colorBg:'#EDE0F0',
    lowNotif: { title:"She's feeling unseen right now", body:"Check in on her — not about the schedule, about HER." },
    suggestions: [
      { icon:'👂', text:'<strong>Ask how she\'s really doing</strong> — and just listen.', action:'Send hint' },
      { icon:'🌸', text:'<strong>Acknowledge something specific</strong> she did well this week.', action:'Send hint' },
      { icon:'📝', text:'<strong>Leave her a note</strong> — counter, mirror, steering wheel.', action:'Send hint' },
    ]
  }
};

function updateTank(type, value) {
  const v = parseInt(value);
  tankValues[type] = v;
  tankValues._updated = Date.now();
  save('tanks', tankValues);

  const slider = document.getElementById('tank' + type.charAt(0).toUpperCase() + type.slice(1));
  const label = document.getElementById('tank' + type.charAt(0).toUpperCase() + type.slice(1) + 'Label');
  const config = tankConfig[type];

  slider.style.background = 'linear-gradient(to right, ' + config.color + ' 0%, ' + config.color + ' ' + v + '%, ' + config.colorBg + ' ' + v + '%, ' + config.colorBg + ' 100%)';

  let levelText, levelClass;
  if (v >= 80) { levelText = 'Full'; levelClass = 'level-full'; }
  else if (v >= 60) { levelText = 'Good'; levelClass = 'level-good'; }
  else if (v >= 40) { levelText = 'Half Full'; levelClass = 'level-ok'; }
  else if (v >= 20) { levelText = 'Getting Low'; levelClass = 'level-low'; }
  else { levelText = 'Running on E'; levelClass = 'level-empty'; }

  label.textContent = levelText;
  label.className = 'tank-level-text ' + levelClass;

  // Update pulse
  const pf = document.getElementById('pulseFill' + type.charAt(0).toUpperCase() + type.slice(1));
  if (pf) pf.style.width = v + '%';

  // Update timestamp
  const upd = document.getElementById('tank' + type.charAt(0).toUpperCase() + type.slice(1) + 'Updated');
  if (upd) upd.textContent = 'Updated just now';

  updateNotifPreview();
  updateSuggestions();
  checkLowTankAlert(type, v);
}

// ── LOW TANK ALERT (soft nudge banner) ──
const LOW_THRESHOLD = 25;
let lowTankAlertedToday = S.get('lowTankAlerted', {});

function checkLowTankAlert(type, value) {
  const today = NOW.getFullYear() + '-' + (NOW.getMonth()+1) + '-' + NOW.getDate();

  // Reset alerts if it's a new day
  if (lowTankAlertedToday._date !== today) {
    lowTankAlertedToday = { _date: today };
    S.set('lowTankAlerted', lowTankAlertedToday);
  }

  const banner = document.getElementById('lowTankBanner');
  if (!banner) return;

  if (value <= LOW_THRESHOLD && !lowTankAlertedToday[type]) {
    // Show the banner
    const config = tankConfig[type];
    banner.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;">' +
      '<span style="font-size:20px;">' + config.emoji + '</span>' +
      '<div style="flex:1;"><div style="font-size:14px;font-weight:600;">Your ' + config.name + ' tank is running low</div>' +
      '<div style="font-size:12px;color:var(--text-light);margin-top:2px;">Want to send him a nudge?</div></div>' +
      '<button onclick="sendLowTankNudge(\'' + type + '\')" style="padding:8px 16px;background:var(--accent);color:white;border:none;border-radius:20px;font-family:DM Sans,sans-serif;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">Send Nudge</button>' +
      '<button onclick="dismissLowTankBanner(\'' + type + '\')" style="background:none;border:none;font-size:18px;color:var(--text-light);cursor:pointer;padding:4px 8px;">✕</button>' +
      '</div>';
    banner.style.display = 'block';
  } else if (value > LOW_THRESHOLD) {
    // If tank goes back above threshold, hide banner for this tank
    const currentBanner = banner.innerHTML;
    if (currentBanner.includes(tankConfig[type].name)) {
      banner.style.display = 'none';
    }
  }
}

function sendLowTankNudge(type) {
  const config = tankConfig[type];
  const phone = S.get('husbandPhone', null);
  if (!phone) {
    showToast('No phone number', 'Add his number first.');
    return;
  }
  const message = config.lowNotif.title + '\n\n' + config.lowNotif.body + '\n\n— Beag\'s Brain';
  window.location.href = 'sms:' + encodeURIComponent(phone) + '&body=' + encodeURIComponent(message);
  dismissLowTankBanner(type);
}

function dismissLowTankBanner(type) {
  const today = NOW.getFullYear() + '-' + (NOW.getMonth()+1) + '-' + NOW.getDate();
  lowTankAlertedToday[type] = true;
  lowTankAlertedToday._date = today;
  S.set('lowTankAlerted', lowTankAlertedToday);
  document.getElementById('lowTankBanner').style.display = 'none';
}

function updateNotifPreview() {
  let lowestType = 'help', lowestVal = 100;
  ['touch','time','help','emotional'].forEach(type => {
    if (tankValues[type] < lowestVal) { lowestVal = tankValues[type]; lowestType = type; }
  });
  document.getElementById('notifTitle').textContent = tankConfig[lowestType].lowNotif.title;
  document.getElementById('notifBody').textContent = tankConfig[lowestType].lowNotif.body;
}

function updateSuggestions() {
  let lowestType = 'help', lowestVal = 100;
  ['touch','time','help','emotional'].forEach(type => {
    if (tankValues[type] < lowestVal) { lowestVal = tankValues[type]; lowestType = type; }
  });
  const container = document.getElementById('suggestionCards');
  container.innerHTML = tankConfig[lowestType].suggestions.map(sug =>
    '<div class="suggestion-card"><span class="sug-icon">' + sug.icon + '</span><div class="sug-text">' + sug.text + '</div><button class="sug-send" onclick="event.stopPropagation(); sendNudge(this);">' + sug.action + '</button></div>'
  ).join('');
}

function sendNudge(btn) {
  const phone = S.get('husbandPhone', null);
  if (!phone) {
    showToast('No phone number', 'Add his number in the Us tab first.');
    return;
  }

  // Get the nudge text
  const card = btn.closest('.suggestion-card');
  const textEl = card ? card.querySelector('.sug-text') : null;
  const nudgeText = textEl ? textEl.textContent : 'Hey, your wife could use some help.';

  // Find which tank is lowest
  let lowestType = 'help', lowestVal = 100;
  ['touch','time','help','emotional'].forEach(type => {
    if (tankValues[type] < lowestVal) { lowestVal = tankValues[type]; lowestType = type; }
  });
  const title = tankConfig[lowestType].lowNotif.title;

  // Build message and open iMessage
  const message = title + '\n\n' + nudgeText + '\n\n— Beag\'s Brain';
  const smsUrl = 'sms:' + encodeURIComponent(phone) + '&body=' + encodeURIComponent(message);
  window.location.href = smsUrl;

  btn.textContent = 'Sent! ✓';
  btn.style.background = 'var(--success)';
  setTimeout(() => { btn.textContent = 'Send hint'; btn.style.background = ''; }, 2000);
}

// ── HUSBAND PHONE NUMBER SETUP ──
function renderNotifSetup() {
  const container = document.getElementById('notifSetupContent');
  if (!container) return;
  const phone = S.get('husbandPhone', null);

  if (phone) {
    container.innerHTML =
      '<h4>Nudge via Text</h4>' +
      '<div class="paired-status">&#10003; Connected — nudges text ' + esc(phone) + '</div>' +
      '<button class="setup-btn outline" onclick="setupHusbandPhone()" style="margin-top:8px;">Change Number</button>' +
      '<button class="setup-btn danger" onclick="disconnectHusband()" style="margin-top:4px;">Remove</button>';
  } else {
    container.innerHTML =
      '<h4>Nudge via Text</h4>' +
      '<p>Enter his phone number so nudges get sent as a text message.</p>' +
      '<button class="setup-btn" onclick="setupHusbandPhone()">Add His Phone Number</button>';
  }
}

function setupHusbandPhone() {
  const current = S.get('husbandPhone', '');
  const phone = prompt('Enter his phone number:', current);
  if (phone !== null && phone.trim()) {
    const clean = phone.trim();
    S.set('husbandPhone', clean);
    save('husbandPhone', clean);
    renderNotifSetup();
    showToast('Phone saved!', 'Nudges will text ' + clean);
  }
}

function copyPairLink() {
  const link = window.location.origin + '/pair.html';
  // iOS Safari clipboard fallback
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand('copy'); showToast('Link copied!', 'Text this to your husband'); }
    catch(e) { prompt('Copy this link and text it to your husband:', text); }
    document.body.removeChild(ta);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(link).then(() => {
      showToast('Link copied!', 'Text this to your husband. He opens it and taps Allow.');
    }).catch(() => fallbackCopy(link));
  } else {
    fallbackCopy(link);
  }
}

function openPairModal() {
  document.getElementById('pairModal').style.display = 'flex';
  document.getElementById('pairCodeInput').value = '';
  document.getElementById('pairError').textContent = '';
  document.getElementById('pairCodeInput').focus();
}

function closePairModal() {
  document.getElementById('pairModal').style.display = 'none';
}

function savePairCode() {
  const input = document.getElementById('pairCodeInput').value.trim();
  const errorEl = document.getElementById('pairError');
  errorEl.textContent = '';

  if (!input) {
    errorEl.textContent = 'Paste the code from your husband\'s phone.';
    return;
  }

  try {
    const decoded = JSON.parse(atob(input));
    if (!decoded.endpoint || !decoded.keys) {
      throw new Error('Invalid subscription format');
    }
    S.set('husbandSub', decoded);
    closePairModal();
    renderNotifSetup();
    showToast('Connected!', 'Nudges will now send push notifications to his phone.');
  } catch (err) {
    errorEl.textContent = 'Invalid code. Make sure you copied the full code from his phone.';
  }
}

function disconnectHusband() {
  S.del('husbandPhone');
  S.del('husbandSub');
  renderNotifSetup();
  showToast('Removed', 'Phone number cleared.');
}

function initTanks() {
  ['touch','time','help','emotional'].forEach(type => {
    const slider = document.getElementById('tank' + type.charAt(0).toUpperCase() + type.slice(1));
    slider.value = tankValues[type];
    updateTank(type, tankValues[type]);
  });
  if (tankValues._updated) {
    const ago = getTimeAgo(tankValues._updated);
    ['Touch','Time','Help','Emotional'].forEach(t => {
      const el = document.getElementById('tank' + t + 'Updated');
      if (el) el.textContent = 'Updated ' + ago;
    });
  }
}

// ── WEEKLY PULSE AVERAGING ──
function recordDailyTankSnapshot() {
  const today = NOW.getFullYear() + '-' + String(NOW.getMonth()+1).padStart(2,'0') + '-' + String(NOW.getDate()).padStart(2,'0');
  const existing = tankHistory.findIndex(h => h.date === today);
  const snapshot = { date: today, touch: tankValues.touch, time: tankValues.time, help: tankValues.help, emotional: tankValues.emotional };
  if (existing >= 0) tankHistory[existing] = snapshot;
  else tankHistory.push(snapshot);
  // Keep only last 30 days
  if (tankHistory.length > 30) tankHistory = tankHistory.slice(-30);
  save('tankHistory', tankHistory);
}

function getWeeklyAverage() {
  const startOfWeek = new Date(NOW);
  startOfWeek.setDate(NOW.getDate() - NOW.getDay());
  const weekStart = startOfWeek.getFullYear() + '-' + String(startOfWeek.getMonth()+1).padStart(2,'0') + '-' + String(startOfWeek.getDate()).padStart(2,'0');

  const weekEntries = tankHistory.filter(h => h.date >= weekStart);
  if (weekEntries.length === 0) return tankValues; // Use current if no history

  const avg = { touch: 0, time: 0, help: 0, emotional: 0 };
  weekEntries.forEach(e => { avg.touch += e.touch; avg.time += e.time; avg.help += e.help; avg.emotional += e.emotional; });
  const n = weekEntries.length;
  return { touch: Math.round(avg.touch/n), time: Math.round(avg.time/n), help: Math.round(avg.help/n), emotional: Math.round(avg.emotional/n) };
}

function updatePulse() {
  const avg = getWeeklyAverage();
  document.getElementById('pulseFillTouch').style.width = avg.touch + '%';
  document.getElementById('pulseFillTime').style.width = avg.time + '%';
  document.getElementById('pulseFillHelp').style.width = avg.help + '%';
  document.getElementById('pulseFillEmotional').style.width = avg.emotional + '%';
}

// ── SERVICE WORKER ──
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// ══════════════════════════════════════════════
// ── AI CHAT ASSISTANT ──
// ══════════════════════════════════════════════

let chatOpen = false;
let chatMessages = [];
let isRecording = false;
let recognition = null;

function toggleChat() {
  chatOpen = !chatOpen;
  document.getElementById('chatOverlay').classList.toggle('open', chatOpen);
  document.getElementById('chatFab').classList.toggle('active', chatOpen);
  if (chatOpen) {
    setTimeout(() => document.getElementById('chatInput').focus(), 350);
  } else {
    stopVoice();
  }
}

function closeChat() {
  if (!chatOpen) return;
  chatOpen = false;
  document.getElementById('chatOverlay').classList.remove('open');
  document.getElementById('chatFab').classList.remove('active');
  stopVoice();
}

function clearChatHistory() {
  chatHistory = [];
  save('chatHistory', chatHistory);
  const msgs = document.getElementById('chatMessages');
  const welcome = document.getElementById('chatWelcome');
  msgs.innerHTML = '';
  if (welcome) msgs.appendChild(welcome);
  welcome.style.display = '';
}

// Restore prior chat messages on load
function restoreChatHistory() {
  if (chatHistory.length === 0) return;
  const welcome = document.getElementById('chatWelcome');
  if (welcome) welcome.style.display = 'none';
  chatHistory.forEach(h => {
    addChatMessage(h.role, h.content);
  });
  // Auto-expire history after 2 hours of inactivity
  const lastMsg = chatHistory[chatHistory.length - 1];
  if (lastMsg && lastMsg._ts && (Date.now() - lastMsg._ts) > 2 * 60 * 60 * 1000) {
    clearChatHistory();
  }
}

function useChatSuggestion(text) {
  document.getElementById('chatInput').value = text;
  sendChat();
}

function getChatContext() {
  const now = new Date();
  const today = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate();

  // Get upcoming 7 days of events
  const upcoming = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const key = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    if (events[key] && events[key].length > 0) {
      upcoming[key] = events[key];
    }
  }

  // Get active tab
  let activeTab = 'home';
  document.querySelectorAll('.nav-item').forEach(btn => {
    if (btn.classList.contains('active') && btn.dataset.nav) activeTab = btn.dataset.nav;
  });

  return {
    today: today,
    activeTab: activeTab,
    todoCount: todos.filter(t => !t.done && t.type === 'todo').length,
    gsdCount: todos.filter(t => !t.done && t.type === 'gsd').length,
    groceryCount: groceries.filter(g => !g.done).length,
    upcomingEvents: upcoming,
    tankLevels: { touch: tankValues.touch, time: tankValues.time, help: tankValues.help, emotional: tankValues.emotional },
    todos: todos.filter(t => !t.done).map(t => ({ id: t.id, text: t.text, type: t.type, done: t.done })),
    groceries: groceries.filter(g => !g.done).map(g => ({ id: g.id, text: g.text, cat: g.cat, done: g.done }))
  };
}

function addChatMessage(role, text) {
  const welcome = document.getElementById('chatWelcome');
  if (welcome) welcome.style.display = 'none';

  const container = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'chat-msg ' + role;
  div.textContent = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  chatMessages.push({ role, text });
}

function addActionConfirm(text) {
  const container = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'chat-msg action-confirm';
  div.textContent = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function showTyping() {
  const container = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'chat-typing';
  div.id = 'chatTypingIndicator';
  div.innerHTML = '<span></span><span></span><span></span>';
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function hideTyping() {
  const el = document.getElementById('chatTypingIndicator');
  if (el) el.remove();
}

// Conversation history — persists to localStorage so follow-ups work across reloads
let chatHistory = S.get('chatHistory', []);

async function sendChat() {
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (!msg) return;

  input.value = '';
  addChatMessage('user', msg);
  chatHistory.push({ role: 'user', content: msg, _ts: Date.now() });
  save('chatHistory', chatHistory);
  showTyping();

  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, history: chatHistory.slice(-20), context: getChatContext() })
    });

    hideTyping();

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      addChatMessage('assistant', err.reply || 'Hmm, something went wrong. Try again?');
      return;
    }

    const data = await resp.json();
    const reply = data.reply || 'Done!';
    addChatMessage('assistant', reply);
    chatHistory.push({ role: 'assistant', content: reply, _ts: Date.now() });
    save('chatHistory', chatHistory);

    if (data.actions && data.actions.length > 0) {
      executeActions(data.actions);
    }
  } catch (err) {
    hideTyping();
    addChatMessage('assistant', 'Sorry, I couldn\'t connect. Check your internet and try again!');
  }
}

function executeActions(actions) {
  const confirmations = [];

  actions.forEach(action => {
    const p = action.params || {};

    switch (action.type) {
      case 'add_event': {
        const key = p.date || (NOW.getFullYear() + '-' + (NOW.getMonth() + 1) + '-' + NOW.getDate());
        const timeDisplay = p.time ? to12hr(p.time) : '';
        const text = timeDisplay ? p.text + ' ' + timeDisplay : (p.text || 'Event');
        if (!events[key]) events[key] = [];
        events[key].push({ t: text, c: p.color || 'blue' });
        save('events', events);
        renderMiniMonth(); renderThisWeek(); updateDateLine();
        if (document.getElementById('tab-calendar').classList.contains('active')) renderFullCal();
        confirmations.push('Added event: ' + text);
        break;
      }

      case 'add_todo': {
        todos.push({ id: getId(), text: p.text || 'To-do', done: false, doneAt: null, type: 'todo' });
        save('todos', todos);
        renderTodos(); updateDateLine();
        confirmations.push('Added to-do: ' + (p.text || 'To-do'));
        break;
      }

      case 'add_gsd': {
        const item = { id: getId(), text: p.text || 'Task', done: false, doneAt: null, type: 'gsd', section: p.section || 'asap' };
        if (p.sub) item.sub = p.sub;
        todos.push(item);
        save('todos', todos);
        renderGsd();
        confirmations.push('Added GSD task: ' + (p.text || 'Task'));
        break;
      }

      case 'add_grocery': {
        const gText = p.qty && p.qty > 1 ? (p.text || 'Item') + ' (' + p.qty + ')' : (p.text || 'Item');
        groceries.push({ id: getId(), text: gText, cat: p.cat || 'other', done: false, doneAt: null, qty: p.qty || 1 });
        save('groceries', groceries);
        renderGroceries();
        confirmations.push('Added to grocery list: ' + gText);
        break;
      }

      case 'add_idea': {
        ideas.push({ id: getId(), title: p.title || 'Idea', body: p.body || '', tag: p.tag || 'New', tagColor: 'var(--soft-yellow)' });
        save('ideas', ideas);
        renderIdeas();
        confirmations.push('Captured idea: ' + (p.title || 'Idea'));
        break;
      }

      case 'check_todo': {
        const searchText = (p.text || '').toLowerCase();
        const match = todos.find(t => !t.done && t.text.toLowerCase().includes(searchText));
        if (match) {
          match.done = true;
          match.doneAt = Date.now();
          save('todos', todos);
          renderTodos(); renderGsd(); updateDateLine();
          confirmations.push('Checked off: ' + match.text);
        } else {
          confirmations.push('Couldn\'t find a matching to-do for "' + p.text + '"');
        }
        break;
      }

      case 'check_grocery': {
        const gSearch = (p.text || '').toLowerCase();
        const gMatch = groceries.find(g => !g.done && g.text.toLowerCase().includes(gSearch));
        if (gMatch) {
          gMatch.done = true;
          gMatch.doneAt = Date.now();
          save('groceries', groceries);
          renderGroceries();
          confirmations.push('Checked off grocery: ' + gMatch.text);
        } else {
          confirmations.push('Couldn\'t find a matching grocery item for "' + p.text + '"');
        }
        break;
      }

      case 'set_timer': {
        openTimer(p.task || 'Focus', p.minutes || 15);
        confirmations.push('Timer set: ' + (p.task || 'Focus') + ' for ' + (p.minutes || 15) + ' min');
        break;
      }

      case 'switch_tab': {
        const tabBtn = document.querySelector('.nav-item[data-nav="' + (p.tab || 'home') + '"]');
        switchTab(p.tab || 'home', tabBtn);
        if (p.tab === 'calendar') renderFullCal();
        confirmations.push('Switched to ' + (p.tab || 'home') + ' tab');
        break;
      }

      case 'update_tank': {
        const tankType = p.tankType || p.type;
        if (tankType && typeof p.value === 'number') {
          updateTank(tankType, p.value);
          confirmations.push('Updated ' + tankType + ' tank to ' + p.value + '%');
        }
        break;
      }

      case 'add_color_block': {
        colorBlocks.push({
          id: nextBlockId++,
          color: p.color || '#A8C8D8',
          label: p.label || '',
          startDate: p.startDate,
          endDate: p.endDate
        });
        save('colorBlocks', colorBlocks);
        save('nextBlockId', nextBlockId);
        renderMiniMonth();
        if (document.getElementById('tab-calendar').classList.contains('active')) renderFullCal();
        confirmations.push('Added color block: ' + (p.label || 'Block'));
        break;
      }

      case 'read_calendar':
      case 'read_todos':
      case 'read_groceries':
        // These are informational — Claude already has the context
        break;

      case 'delete_todo': {
        const dSearch = (p.text || '').toLowerCase();
        const dIdx = todos.findIndex(t => t.text.toLowerCase().includes(dSearch));
        if (dIdx >= 0) {
          const removed = todos.splice(dIdx, 1)[0];
          save('todos', todos);
          renderTodos(); renderGsd(); updateDateLine();
          confirmations.push('Deleted: ' + removed.text);
        } else {
          confirmations.push('Couldn\'t find "' + p.text + '" to delete');
        }
        break;
      }

      case 'delete_grocery': {
        const dgSearch = (p.text || '').toLowerCase();
        const dgIdx = groceries.findIndex(g => g.text.toLowerCase().includes(dgSearch));
        if (dgIdx >= 0) {
          const removed = groceries.splice(dgIdx, 1)[0];
          save('groceries', groceries);
          renderGroceries();
          confirmations.push('Removed from groceries: ' + removed.text);
        } else {
          confirmations.push('Couldn\'t find "' + p.text + '" in groceries');
        }
        break;
      }

      case 'delete_idea': {
        const diSearch = (p.text || '').toLowerCase();
        const diIdx = ideas.findIndex(i => i.title.toLowerCase().includes(diSearch));
        if (diIdx >= 0) {
          const removed = ideas.splice(diIdx, 1)[0];
          save('ideas', ideas);
          renderIdeas();
          confirmations.push('Deleted idea: ' + removed.title);
        } else {
          confirmations.push('Couldn\'t find idea "' + p.text + '"');
        }
        break;
      }

      case 'delete_event': {
        const deSearch = (p.text || '').toLowerCase();
        let deleted = false;
        const dateKeys = p.date ? [p.date] : Object.keys(events);
        for (const key of dateKeys) {
          if (events[key]) {
            const evIdx = events[key].findIndex(ev => ev.t.toLowerCase().includes(deSearch));
            if (evIdx >= 0) {
              const removed = events[key].splice(evIdx, 1)[0];
              if (events[key].length === 0) delete events[key];
              save('events', events);
              renderMiniMonth(); renderThisWeek(); updateDateLine();
              if (document.getElementById('tab-calendar').classList.contains('active')) renderFullCal();
              confirmations.push('Deleted event: ' + removed.t);
              deleted = true;
              break;
            }
          }
        }
        if (!deleted) confirmations.push('Couldn\'t find event "' + p.text + '"');
        break;
      }

      case 'clear_groceries': {
        if (p.cat) {
          groceries = groceries.filter(g => g.cat !== p.cat);
          confirmations.push('Cleared all ' + p.cat + ' items');
        } else {
          groceries = [];
          confirmations.push('Cleared entire grocery list');
        }
        save('groceries', groceries);
        renderGroceries();
        break;
      }

      case 'add_reminder': {
        reminders.push({ id: getId(), title: p.title || 'Reminder', sub: p.sub || '', day: p.day || 'Sunday', minutes: p.minutes || 10 });
        save('reminders', reminders);
        renderReminders();
        confirmations.push('Added reminder: ' + (p.title || 'Reminder') + ' every ' + (p.day || 'Sunday'));
        break;
      }

      default:
        break;
    }
  });

  if (confirmations.length > 0) {
    addActionConfirm(confirmations.join(' | '));
  }
}

// ── VOICE INPUT (Web Speech API) ──
function toggleVoice() {
  if (isRecording) {
    stopVoice();
  } else {
    startVoice();
  }
}

function startVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast('Voice not supported', 'Use a different browser or type instead');
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = function() {
    isRecording = true;
    document.getElementById('voiceBtn').classList.add('recording');
    document.getElementById('chatListeningLabel').innerHTML = '<div class="chat-listening">Listening...</div>';
  };

  recognition.onresult = function(event) {
    const transcript = event.results[0][0].transcript;
    document.getElementById('chatInput').value = transcript;
    stopVoice();
    sendChat();
  };

  recognition.onerror = function(event) {
    stopVoice();
    if (event.error !== 'no-speech' && event.error !== 'aborted') {
      showToast('Voice error', event.error);
    }
  };

  recognition.onend = function() {
    stopVoice();
  };

  try {
    recognition.start();
  } catch (e) {
    stopVoice();
  }
}

function stopVoice() {
  isRecording = false;
  document.getElementById('voiceBtn').classList.remove('recording');
  document.getElementById('chatListeningLabel').innerHTML = '';
  if (recognition) {
    try { recognition.stop(); } catch (e) {}
    recognition = null;
  }
}

// ══════════════════════════════════════════════
// ── INIT ──
// ══════════════════════════════════════════════
autoArchive();
setDailyEncouragement();
updateDateLine();
renderMiniMonth();
renderThisWeek();
renderTodos();
renderGsd();
renderGroceries();
renderIdeas();
renderReminders();
initTanks();
updateSuggestions();
updatePulse();
renderNotifSetup();
recordDailyTankSnapshot();
restoreChatHistory();

// ── CLOUD SYNC ──
syncFromCloud(); // Pull latest on load
setInterval(syncFromCloud, 30000); // Sync every 30 seconds
