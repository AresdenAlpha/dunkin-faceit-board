const dropdownState = {};

function makeCsd(id, items, placeholder) {
  dropdownState[id] = { value: '', label: '', items, filtered: items, open: false, focusIdx: -1 };
  return `<div class="csd-wrap" id="csd-wrap-${id}">
    <input class="csd-input" id="csd-input-${id}" placeholder="${placeholder}"
           autocomplete="off" readonly
           onfocus="csdOpen('${id}')"
           oninput="csdFilter('${id}', this.value)"
           onkeydown="csdKey(event, '${id}')" />
    <div class="csd-list" id="csd-list-${id}"></div>
  </div>`;
}

function csdRenderList(id) {
  const ds = dropdownState[id];
  const el = document.getElementById('csd-list-' + id);
  if (!el) return;
  if (!ds.filtered.length) {
    el.innerHTML = '<div class="csd-empty">No results</div>';
    return;
  }
  el.innerHTML = ds.filtered.map((item, i) => {
    const icon = item.icon
      ? `<img src="${item.icon}" onerror="this.style.display='none'" />`
      : `<div class="csd-placeholder-icon"></div>`;
    return `<div class="csd-item${i === ds.focusIdx ? ' focused' : ''}"
      data-csd-id="${id}" data-idx="${i}">${icon}<span>${escHtml(item.label)}</span></div>`;
  }).join('');
}

function csdOpen(id) {
  Object.keys(dropdownState).forEach(k => { if (k !== id) csdClose(k); });
  const ds = dropdownState[id];
  ds.open = true;
  ds.filtered = ds.items;
  ds.focusIdx = -1;
  const inp = document.getElementById('csd-input-' + id);
  if (inp) { inp.readOnly = false; inp.value = ''; }
  const list = document.getElementById('csd-list-' + id);
  if (list) list.classList.add('open');
  csdRenderList(id);
}

function csdClose(id) {
  const ds = dropdownState[id];
  if (!ds) return;
  ds.open = false;
  const list = document.getElementById('csd-list-' + id);
  if (list) list.classList.remove('open');
  const inp = document.getElementById('csd-input-' + id);
  if (inp) { inp.readOnly = true; inp.value = ds.label; }
}

function csdFilter(id, query) {
  const ds = dropdownState[id];
  const q = query.toLowerCase();
  ds.filtered = ds.items.filter(item => item.label.toLowerCase().includes(q));
  ds.focusIdx = -1;
  csdRenderList(id);
}

function csdSelect(id, value, label) {
  const ds = dropdownState[id];
  ds.value = value;
  ds.label = label;
  csdClose(id);
}

function csdKey(e, id) {
  const ds = dropdownState[id];
  if (!ds.open) { if (e.key === 'Enter' || e.key === ' ') csdOpen(id); return; }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    ds.focusIdx = Math.min(ds.focusIdx + 1, ds.filtered.length - 1);
    csdRenderList(id);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    ds.focusIdx = Math.max(ds.focusIdx - 1, 0);
    csdRenderList(id);
  } else if (e.key === 'Enter' && ds.focusIdx >= 0) {
    const item = ds.filtered[ds.focusIdx];
    if (item) csdSelect(id, item.value, item.label);
  } else if (e.key === 'Escape') {
    csdClose(id);
  }
}

function csdGetValue(id) {
  return dropdownState[id] ? dropdownState[id].value : '';
}

function csdReset(id) {
  const ds = dropdownState[id];
  if (!ds) return;
  ds.value = ''; ds.label = ''; ds.filtered = ds.items; ds.open = false; ds.focusIdx = -1;
  const inp = document.getElementById('csd-input-' + id);
  if (inp) inp.value = '';
  const list = document.getElementById('csd-list-' + id);
  if (list) list.classList.remove('open');
}

// Handle dropdown item clicks and outside-click closing via delegation
document.addEventListener('mousedown', e => {
  const item = e.target.closest('.csd-item[data-csd-id]');
  if (item) {
    const id = item.dataset.csdId;
    const idx = parseInt(item.dataset.idx);
    const ds = dropdownState[id];
    if (ds && ds.filtered[idx]) {
      const picked = ds.filtered[idx];
      csdSelect(id, picked.value, picked.label);
    }
    return;
  }
  Object.keys(dropdownState).forEach(id => {
    const wrap = document.getElementById('csd-wrap-' + id);
    if (wrap && !wrap.contains(e.target)) csdClose(id);
  });
});
