function showTab(tab) {
  const tabs = ['leaderboard','matches','players','add','log'];
  tabs.forEach(t => {
    const el = document.getElementById('tab-' + t);
    if (el) el.classList.toggle('visible', t === tab);
  });
  document.querySelectorAll('.nav button').forEach((b, i) => {
    const tabNames = isAdmin
      ? ['leaderboard','matches','players','add','log']
      : ['leaderboard','matches','players'];
    b.classList.toggle('active', tabNames[i] === tab);
  });
}

function showToast(msg, err = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (err ? ' error' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 2800);
}

let modalResolve = () => {};
function showConfirm(title, msg, onConfirm, confirmLabel = 'Delete') {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-msg').innerHTML = msg;
  document.getElementById('modal-confirm-btn').textContent = confirmLabel;
  document.getElementById('modal-overlay').classList.add('show');
  modalResolve = (confirmed) => {
    document.getElementById('modal-overlay').classList.remove('show');
    modalResolve = () => {};
    if (confirmed) onConfirm();
  };
}

function showInputModal(title, msg, defaultValue, confirmLabel, onConfirm) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-msg').innerHTML = msg;
  document.getElementById('modal-confirm-btn').textContent = confirmLabel;
  const inp = document.getElementById('modal-input');
  inp.value = defaultValue;
  inp.style.display = 'block';
  inp.style.marginBottom = '16px';
  document.getElementById('modal-overlay').classList.add('show');
  setTimeout(() => { inp.focus(); inp.select(); }, 50);
  inp.onkeydown = e => { if (e.key === 'Enter') modalResolve(true); };
  modalResolve = (confirmed) => {
    document.getElementById('modal-overlay').classList.remove('show');
    inp.style.display = 'none';
    inp.onkeydown = null;
    modalResolve = () => {};
    if (confirmed) onConfirm(inp.value);
  };
}

function updateSeasonUI() {
  const s = state.currentSeason || 1;
  const lbl = document.getElementById('season-label');
  if (lbl) lbl.textContent = `Season ${s}`;
  const btn = document.querySelector('.season-banner .btn-sm');
  if (btn) btn.style.display = isAdmin ? 'inline-block' : 'none';
}
