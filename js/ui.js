function showTab(tab) {
  const tabs = ['leaderboard','matches','players','heroes','log'];
  tabs.forEach(t => {
    const el = document.getElementById('tab-' + t);
    if (el) el.classList.toggle('visible', t === tab);
  });
  document.querySelectorAll('.nav button').forEach((b, i) => {
    const tabNames = isAdmin
      ? ['leaderboard','matches','players','heroes','log']
      : ['leaderboard','matches','players','heroes'];
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

function updateSeasonUI() {
  const s = state.currentSeason || 1;
  const lbl = document.getElementById('season-label');
  if (lbl) lbl.textContent = `Season ${s}`;
  const btn = document.querySelector('.season-banner .btn-sm');
  if (btn) btn.style.display = isAdmin ? 'inline-block' : 'none';
}
