function renamePlayer(idx) {
  if (!isAdmin) return;
  const p = state.players[idx];
  if (!p) return;
  showInputModal('Rename Player', `Current name: <strong>${escHtml(p.name)}</strong>`, p.name, 'Rename', (newName) => {
    newName = newName.trim();
    if (!newName || newName === p.name) return;
    if (state.players.find((pl, i) => i !== idx && pl.name.toLowerCase() === newName.toLowerCase())) {
      showToast('A player with that name already exists', true); return;
    }
    const oldName = p.name;
    state.players[idx].name = newName;
    state.matches.forEach(m => {
      m.team1 = m.team1.map(n => n === oldName ? newName : n);
      m.team2 = m.team2.map(n => n === oldName ? newName : n);
    });
    audit('add', `Renamed player "${oldName}" to "${newName}"`);
    saveState();
    render();
    showToast(`Renamed to ${newName}`);
  });
}

function removePlayer(idx) {
  if (!isAdmin) return;
  const p = state.players[idx];
  if (!p) return;
  showConfirm('Remove Player', `Remove <strong>${escHtml(p.name)}</strong>? Their match history stays intact.`, () => {
    if (!state.deletedPlayers) state.deletedPlayers = [];
    state.deletedPlayers.push({ ...p, deletedAt: new Date().toISOString() });
    audit('del', `Removed player "${p.name}"`, { player: p });
    state.players.splice(idx, 1);
    saveState(); render();
    showToast('Player removed');
  });
}

function deleteMatch(idx) {
  if (!isAdmin) return;
  const m = state.matches[idx];
  if (!m) return;
  const t1 = m.team1.join(', ');
  const t2 = m.team2.join(', ');
  const winner = m.winner === 'radiant' ? 'Radiant' : 'Dire';
  showConfirm('Delete Match',
    `Delete match: <strong>${escHtml(t1)}</strong> vs <strong>${escHtml(t2)}</strong>?<br><span style="color:var(--c-muted);font-size:12px">Winner: ${winner} — ${m.date || 'no date'}</span>`,
    () => {
      if (!state.deletedMatches) state.deletedMatches = [];
      state.deletedMatches.push({ ...m, deletedAt: new Date().toISOString() });
      audit('del', `Deleted match — ${winner} won (${m.date || 'no date'}). Teams: [${t1}] vs [${t2}]`, { match: m });
      state.matches.splice(idx, 1);
      saveState(); render();
      showToast('Match deleted');
    });
}

function exportDataConfirm() {
  showConfirm('Export Backup',
    'Download a full backup of all players and matches?',
    () => {
      const exportObj = {
        players: state.players,
        matches: state.matches,
        currentSeason: state.currentSeason || 1
      };
      const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `dunkin-faceit-backup-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Backup exported!');
    }, 'Export');
}

function exportMatch(idx) {
  const m = state.matches[idx];
  if (!m) return;
  const label = m.date ? `match on ${m.date}` : 'this match';
  showConfirm('Export Match',
    `Export ${label}?`,
    () => {
      const blob = new Blob([JSON.stringify(m, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `match-${m.date || 'unknown'}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Match exported!');
    }, 'Export');
}

function filterPlayers(query) {
  playerFilter = query.trim().toLowerCase();
  renderPlayers();
}

function newSeason() {
  showConfirm('New Season',
    `Start Season ${(state.currentSeason || 1) + 1}? Current season stats will be archived.`,
    () => {
      const archived = {
        season: state.currentSeason || 1,
        matches: state.matches.filter(m => (m.season || 1) === (state.currentSeason || 1)),
        archivedAt: new Date().toISOString()
      };
      if (!state.seasons) state.seasons = [];
      state.seasons.push(archived);
      state.currentSeason = (state.currentSeason || 1) + 1;
      state.seasonStart = Date.now(); // sync only imports games played after this
      audit('add', `Started Season ${state.currentSeason}`);
      saveState();
      showToast(`Season ${state.currentSeason} started!`);
    }, 'Start New Season');
}
