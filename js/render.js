function render() {
  updateSeasonUI();
  renderLeaderboard();
  renderMatches();
  renderPlayers();
  renderAuditLog();
}

function renderLeaderboard() {
  const stats = computeStats();
  const sorted = Object.entries(stats)
    .filter(([, s]) => s.games > 0)
    .sort((a, b) => {
      const diff = wr(b[1]) - wr(a[1]);
      return diff !== 0 ? diff : b[1].wins - a[1].wins;
    });

  const el = document.getElementById('leaderboard-list');
  if (!sorted.length) {
    el.innerHTML = '<div class="empty-state">No matches logged yet.<br>Log your first match to see the standings.</div>';
    return;
  }
  el.innerHTML = sorted.map(([name, s], i) => {
    const av = getColor(name);
    const w = wr(s);
    const rankClass = ['gold','silver','bronze'][i] || '';
    const rowClass  = ['rank1','rank2','rank3'][i] || '';
    const season = state.currentSeason || 1;
    const top3 = topHeroes(name, season);
    const heroIcons = `<div class="hero-icons-row">${top3.map(id => heroIconHtml(id, 32)).join('') || '<span style="font-size:11px;color:var(--c-muted)">—</span>'}</div>`;
    return `<div class="lb-row ${rowClass}" style="grid-template-columns:36px 1fr 80px 60px 60px 80px 80px">
      <div class="rank ${rankClass}">#${i+1}</div>
      <div class="player-name">
        <div class="avatar" style="background:${av.bg};color:${av.color}">${initials(name)}</div>
        ${escHtml(name)}
      </div>
      ${heroIcons}
      <div class="stat-val win">${s.wins}</div>
      <div class="stat-val lose">${s.losses}</div>
      <div style="text-align:right;font-family:'Share Tech Mono',monospace;font-size:14px;font-weight:600;color:${wrColor(w)}">${w}%</div>
      <div class="stat-val" style="color:var(--c-muted)">${s.games}</div>
    </div>`;
  }).join('');
}

function renderMatches() {
  const el = document.getElementById('matches-list');
  if (!state.matches.length) {
    el.innerHTML = '<div class="empty-state">No matches yet.<br>Log your first match!</div>';
    return;
  }
  el.innerHTML = [...state.matches].reverse().map((m, ri) => {
    const realIdx = state.matches.length - 1 - ri;
    const winColor = m.winner === 'amber' ? 'var(--c-accent)' : 'var(--c-accent2)';
    const winLabel = m.winner === 'amber' ? 'Amber' : 'Blue';
    const pills1 = m.team1.map((n, idx) => {
      const hid = m.heroes1 ? m.heroes1[idx] : null;
      const icon = hid ? heroIconHtml(hid, 22) : '';
      return `<span class="player-hero-pill">${icon}<span>${escHtml(n)}</span></span>`;
    }).join('');
    const pills2 = m.team2.map((n, idx) => {
      const hid = m.heroes2 ? m.heroes2[idx] : null;
      const icon = hid ? heroIconHtml(hid, 22) : '';
      return `<span class="player-hero-pill">${icon}<span>${escHtml(n)}</span></span>`;
    }).join('');
    const t1win = m.winner === 'amber' ? '<span class="winner-tag">WIN</span>' : '';
    const t2win = m.winner === 'blue'  ? '<span class="winner-tag">WIN</span>' : '';
    const delBtn = isAdmin
      ? `<button class="btn-danger del-match" data-idx="${realIdx}">del</button>`
      : '';
    const expBtn = isAdmin
      ? `<button class="btn-sm exp-match" data-idx="${realIdx}" style="font-size:10px;padding:2px 6px;margin-top:4px">export</button>`
      : '';
    return `<div class="match-card">
      <div>
        <div class="match-result" style="color:${winColor}">${escHtml(winLabel)}</div>
        <div class="match-score">Victory</div>
        <div style="margin-top:8px;text-align:center;display:flex;flex-direction:column;gap:4px;align-items:center">${delBtn}${expBtn}</div>
      </div>
      <div class="match-teams">
        <div class="match-team"><span class="team-label amber">Amber</span>${t1win} ${pills1}</div>
        <div class="match-team" style="margin-top:4px"><span class="team-label blue">Blue</span>${t2win} ${pills2}</div>
        ${m.notes ? `<div style="font-size:12px;color:var(--c-muted);margin-top:6px;font-style:italic">${escHtml(m.notes)}</div>` : ''}
      </div>
      <div class="match-meta">
        <div class="match-date">${m.date || ''}</div>
        ${m.duration ? `<div style="margin-top:4px">${escHtml(m.duration)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

function renderPlayers() {
  const stats = computeStats();
  const el = document.getElementById('players-grid');
  const filtered = playerFilter
    ? state.players.filter(p => p.name.toLowerCase().startsWith(playerFilter))
    : state.players;

  if (!state.players.length) {
    el.innerHTML = '<div class="empty-state">Add players to get started.</div>';
    return;
  }
  if (!filtered.length) {
    el.innerHTML = '<div class="empty-state">No players match "' + escHtml(playerFilter) + '"</div>';
    return;
  }
  el.innerHTML = filtered.map(p => {
    const idx = state.players.indexOf(p);
    const av = getColor(p.name);
    const s = stats[p.name] || { wins: 0, losses: 0, games: 0 };
    const w = wr(s);
    const delBtn = isAdmin
      ? `<button class="btn-danger del-player" data-idx="${idx}">x</button>`
      : '';
    const renameBtn = isAdmin
      ? `<button class="btn-sm rename-player" data-idx="${idx}" style="font-size:10px;padding:2px 8px">rename</button>`
      : '';
    const season = state.currentSeason || 1;
    const top3 = topHeroes(p.name, season);
    const heroIcons = top3.map(id => heroIconHtml(id, 36)).join('') || '<span style="font-size:11px;color:var(--c-muted)">No heroes yet</span>';
    return `<div class="player-card">
      <div class="player-card-header">
        <div class="avatar-lg" style="background:${av.bg};color:${av.color}">${initials(p.name)}</div>
        <div style="flex:1;min-width:0">
          <div class="player-card-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(p.name)}</div>
          <span class="wr-badge" style="color:${wrColor(w)};background:${wrColor(w)}1a">${w}% WR</span>
        </div>
        ${delBtn}
      </div>
      ${renameBtn ? `<div style="margin-bottom:8px">${renameBtn}</div>` : ''}
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:10px">${heroIcons}</div>
      <div class="player-stats-row">
        <div class="mini-stat"><div class="mini-stat-val" style="color:var(--c-win)">${s.wins}</div><div class="mini-stat-label">Wins</div></div>
        <div class="mini-stat"><div class="mini-stat-val" style="color:var(--c-lose)">${s.losses}</div><div class="mini-stat-label">Losses</div></div>
        <div class="mini-stat"><div class="mini-stat-val">${s.games}</div><div class="mini-stat-label">Games</div></div>
      </div>
    </div>`;
  }).join('');
}

function renderAuditLog() {
  const el = document.getElementById('audit-list');
  const countEl = document.getElementById('log-count');
  if (!state.auditLog || !state.auditLog.length) {
    el.innerHTML = '<div class="empty-state">No actions recorded yet.</div>';
    countEl.textContent = '';
    return;
  }
  countEl.textContent = state.auditLog.length + ' entries';
  el.innerHTML = state.auditLog.map(e => {
    const typeLabel = {add:'ADD',del:'DELETE',log:'MATCH'}[e.type] || e.type.toUpperCase();
    return `<div class="log-entry">
      <div class="log-time">${fmtDate(e.ts)}</div>
      <div class="log-action">
        <span class="log-type ${e.type}">${typeLabel}</span>
        ${escHtml(e.message)}
      </div>
    </div>`;
  }).join('');
}

function renderMatchForm() {
  const playerItems = state.players.map(p => ({ value: p.name, label: p.name, icon: null }));
  const heroItems = heroes.map(h => ({ value: h.id, label: h.name, icon: h.icon }));

  ['team1-rows', 'team2-rows'].forEach((containerId, ti) => {
    const el = document.getElementById(containerId);
    if (!el) return;
    const existing = {};
    for (let i = 0; i < 6; i++) {
      const pid = `t${ti+1}p${i}`, hid = `t${ti+1}h${i}`;
      existing[pid] = csdGetValue(pid);
      existing[hid] = csdGetValue(hid);
    }
    const rows = Array.from({length: 6}, (_, i) => {
      const pid = `t${ti+1}p${i}`, hid = `t${ti+1}h${i}`;
      return `<div class="player-hero-row">
        ${makeCsd(pid, playerItems, '— Player —')}
        ${makeCsd(hid, heroItems, '— Hero —')}
      </div>`;
    }).join('');
    el.innerHTML = rows;
    for (let i = 0; i < 6; i++) {
      const pid = `t${ti+1}p${i}`, hid = `t${ti+1}h${i}`;
      if (existing[pid]) {
        const item = playerItems.find(p => p.value === existing[pid]);
        if (item) { dropdownState[pid].value = item.value; dropdownState[pid].label = item.label;
          const inp = document.getElementById('csd-input-' + pid); if (inp) inp.value = item.label; }
      }
      if (existing[hid]) {
        const item = heroItems.find(h => String(h.value) === String(existing[hid]));
        if (item) { dropdownState[hid].value = item.value; dropdownState[hid].label = item.label;
          const inp = document.getElementById('csd-input-' + hid); if (inp) inp.value = item.label; }
      }
    }
  });
}
