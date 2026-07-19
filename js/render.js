function render() {
  updateSeasonUI();
  renderLeaderboard();
  renderMatches();
  renderPlayers();
  renderHeroStats();
  renderAuditLog();
}

function renderHeroStats() {
  const el = document.getElementById('hero-stats-list');
  const sub = document.getElementById('heroes-subtitle');
  if (!el) return;
  const season = state.currentSeason || 1;
  const drafted = state.matches.filter(m => (m.season || 1) === season && m.picksBans && m.picksBans.length);
  if (!drafted.length) {
    el.innerHTML = '<div class="empty-state">No draft data yet.<br>Stats appear after synced games.</div>';
    if (sub) sub.textContent = '';
    return;
  }
  if (sub) sub.textContent = `Season ${season} — ${drafted.length} drafted game${drafted.length > 1 ? 's' : ''}`;

  const hs = {}; // heroId -> {picks, bans, wins}
  drafted.forEach(m => {
    m.picksBans.forEach(pb => {
      const s = hs[pb.h] || (hs[pb.h] = { picks: 0, bans: 0, wins: 0 });
      if (pb.p) {
        s.picks++;
        const pickedByRadiant = pb.t === 0;
        if ((m.winner === 'radiant') === pickedByRadiant) s.wins++;
      } else {
        s.bans++;
      }
    });
  });

  const top = Object.entries(hs)
    .sort((a, b) => (b[1].picks + b[1].bans) - (a[1].picks + a[1].bans) || b[1].picks - a[1].picks)
    .slice(0, 15);

  el.innerHTML = top.map(([id, s], i) => {
    const contest = Math.round(((s.picks + s.bans) / drafted.length) * 100);
    const w = s.picks ? Math.round((s.wins / s.picks) * 100) : null;
    const h = heroById(parseInt(id));
    return `<div class="lb-row" style="grid-template-columns:36px 1fr 70px 70px 90px 80px">
      <div class="rank">#${i + 1}</div>
      <div class="player-name">${heroIconHtml(parseInt(id), 32)} ${escHtml(h ? h.name : 'Hero ' + id)}</div>
      <div class="stat-val win">${s.picks}</div>
      <div class="stat-val lose">${s.bans}</div>
      <div style="text-align:right;font-family:'Share Tech Mono',monospace;font-size:13px;color:var(--c-text)">${contest}%</div>
      <div style="text-align:right;font-family:'Share Tech Mono',monospace;font-size:13px;font-weight:600;${w === null ? 'color:var(--c-muted)' : 'color:' + wrColor(w)}">${w === null ? '—' : w + '%'}</div>
    </div>`;
  }).join('');
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
    el.innerHTML = '<div class="empty-state">No matches this season yet.<br>Click Sync from FACEIT after your first games.</div>';
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
    el.innerHTML = '<div class="empty-state">No matches this season yet.<br>Click Sync from FACEIT after your first games.</div>';
    return;
  }
  el.innerHTML = [...state.matches].reverse().map((m, ri) => {
    const realIdx = state.matches.length - 1 - ri;
    const winColor = m.winner === 'radiant' ? 'var(--c-radiant)' : 'var(--c-dire)';
    const winLabel = m.winner === 'radiant' ? 'Radiant' : 'Dire';
    const accToName = {};
    state.players.forEach(p => { if (p.accountId) accToName[p.accountId] = p.name; });
    const capName1 = m.captains ? accToName[m.captains.radiant] : null;
    const capName2 = m.captains ? accToName[m.captains.dire] : null;
    const capBadge = '<span class="cap-badge" title="Drafted this game">C</span>';
    const pills1 = m.team1.map((n, idx) => {
      const hid = m.heroes1 ? m.heroes1[idx] : null;
      const icon = hid ? heroIconHtml(hid, 22) : '';
      return `<span class="player-hero-pill">${icon}<span>${escHtml(n)}</span>${n === capName1 ? capBadge : ''}</span>`;
    }).join('');
    const pills2 = m.team2.map((n, idx) => {
      const hid = m.heroes2 ? m.heroes2[idx] : null;
      const icon = hid ? heroIconHtml(hid, 22) : '';
      return `<span class="player-hero-pill">${icon}<span>${escHtml(n)}</span>${n === capName2 ? capBadge : ''}</span>`;
    }).join('');
    const t1win = m.winner === 'radiant' ? '<span class="winner-tag">WIN</span>' : '';
    const t2win = m.winner === 'dire'    ? '<span class="winner-tag">WIN</span>' : '';
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
        <div class="match-team"><span class="team-label radiant">Radiant</span>${t1win} ${pills1}</div>
        <div class="match-team" style="margin-top:4px"><span class="team-label dire">Dire</span>${t2win} ${pills2}</div>
        ${m.notes ? `<div style="font-size:12px;color:var(--c-muted);margin-top:6px;font-style:italic">${escHtml(m.notes)}</div>` : ''}
      </div>
      <div class="match-meta">
        <div class="match-date">${m.date || ''}</div>
        ${m.duration ? `<div style="margin-top:4px">${escHtml(m.duration)}</div>` : ''}
        ${m.matchId ? `<a class="dotabuff-link" href="https://www.dotabuff.com/matches/${m.matchId}" target="_blank" rel="noopener" title="View on Dotabuff"><img src="https://www.dotabuff.com/favicon.ico" alt="Dotabuff" onerror="this.parentNode.textContent='DB'" /></a>` : ''}
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
    el.innerHTML = '<div class="empty-state">Players appear automatically after the first sync.</div>';
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
      </div>
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

