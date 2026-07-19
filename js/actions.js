function addPlayer() {
  if (!isAdmin) return;
  const inp = document.getElementById('new-player-name');
  const name = inp.value.trim();
  if (!name) return;
  if (state.players.find(p => p.name.toLowerCase() === name.toLowerCase())) {
    showToast('Player already exists', true); return;
  }
  state.players.push({ name });
  audit('add', `Added player "${name}"`);
  playerFilter = '';
  saveState(); renderPlayers(); renderAuditLog();
  inp.value = '';
  showToast(`${name} added`);
}

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
  const winner = m.winner === 'amber' ? 'Amber' : 'Blue';
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

function selectWinner(team) {
  selectedWinner = team;
  document.getElementById('win-btn-amber').className = 'win-btn' + (team === 'amber' ? ' selected-amber' : '');
  document.getElementById('win-btn-blue').className  = 'win-btn' + (team === 'blue'  ? ' selected-blue'  : '');
}

function logMatch() {
  if (!isAdmin) return;
  const date     = document.getElementById('match-date').value;
  const duration = document.getElementById('match-duration').value.trim();
  const notes    = document.getElementById('match-notes').value.trim();

  const team1 = [], team2 = [], heroes1 = [], heroes2 = [];
  for (let i = 0; i < 6; i++) {
    team1.push(csdGetValue(`t1p${i}`));
    heroes1.push(csdGetValue(`t1h${i}`) ? parseInt(csdGetValue(`t1h${i}`)) : null);
    team2.push(csdGetValue(`t2p${i}`));
    heroes2.push(csdGetValue(`t2h${i}`) ? parseInt(csdGetValue(`t2h${i}`)) : null);
  }

  if (team1.some(p => !p)) { showToast('All 6 Amber players must be selected', true); return; }
  if (team2.some(p => !p)) { showToast('All 6 Blue players must be selected', true); return; }
  if (!selectedWinner) { showToast('Select the winning team', true); return; }

  const allPlayers = [...team1, ...team2];
  const unique = new Set(allPlayers);
  if (unique.size !== allPlayers.length) { showToast('A player cannot appear twice in the same match', true); return; }

  if (heroes1.some(h => !h)) { showToast('All 6 Amber heroes must be selected', true); return; }
  if (heroes2.some(h => !h)) { showToast('All 6 Blue heroes must be selected', true); return; }

  const match = {
    team1, team2, heroes1, heroes2,
    winner: selectedWinner, date, duration, notes,
    season: state.currentSeason || 1
  };
  state.matches.push(match);
  const winner = selectedWinner === 'amber' ? 'Amber' : 'Blue';
  audit('log', `Logged match — ${winner} won. Amber: [${team1.join(', ')}] vs Blue: [${team2.join(', ')}]${date ? ' on ' + date : ''}`, { match });
  saveState();

  for (let i = 0; i < 6; i++) {
    csdReset(`t1p${i}`); csdReset(`t1h${i}`);
    csdReset(`t2p${i}`); csdReset(`t2h${i}`);
  }
  document.getElementById('match-duration').value = '';
  document.getElementById('match-notes').value = '';
  selectedWinner = null;
  document.getElementById('win-btn-amber').className = 'win-btn';
  document.getElementById('win-btn-blue').className  = 'win-btn';

  showToast('Match logged!');
  showTab('matches');
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
      a.download = `mystic-league-backup-${new Date().toISOString().slice(0,10)}.json`;
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

function importMatchIntoForm(e) {
  if (!isAdmin) return;
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const m = JSON.parse(ev.target.result);
      if (!m.team1 || !m.team2 || !m.winner) throw new Error('Invalid format');
      if (m.team1.length !== 6 || m.team2.length !== 6) throw new Error('Must be 6v6');
      document.getElementById('match-date').value = m.date || '';
      document.getElementById('match-duration').value = m.duration || '';
      document.getElementById('match-notes').value = m.notes || '';
      selectWinner(m.winner);
      for (let i = 0; i < 6; i++) {
        const pName1 = m.team1[i] || '';
        const pName2 = m.team2[i] || '';
        const hId1 = m.heroes1 ? m.heroes1[i] : null;
        const hId2 = m.heroes2 ? m.heroes2[i] : null;
        const pItem1 = dropdownState[`t1p${i}`]?.items.find(p => p.value === pName1);
        const pItem2 = dropdownState[`t2p${i}`]?.items.find(p => p.value === pName2);
        const hItem1 = hId1 ? dropdownState[`t1h${i}`]?.items.find(h => String(h.value) === String(hId1)) : null;
        const hItem2 = hId2 ? dropdownState[`t2h${i}`]?.items.find(h => String(h.value) === String(hId2)) : null;
        if (pItem1) { dropdownState[`t1p${i}`].value = pItem1.value; dropdownState[`t1p${i}`].label = pItem1.label; document.getElementById('csd-input-t1p' + i).value = pItem1.label; }
        if (pItem2) { dropdownState[`t2p${i}`].value = pItem2.value; dropdownState[`t2p${i}`].label = pItem2.label; document.getElementById('csd-input-t2p' + i).value = pItem2.label; }
        if (hItem1) { dropdownState[`t1h${i}`].value = hItem1.value; dropdownState[`t1h${i}`].label = hItem1.label; document.getElementById('csd-input-t1h' + i).value = hItem1.label; }
        if (hItem2) { dropdownState[`t2h${i}`].value = hItem2.value; dropdownState[`t2h${i}`].label = hItem2.label; document.getElementById('csd-input-t2h' + i).value = hItem2.label; }
      }
      showToast('Match loaded into form!');
    } catch(err) {
      showToast('Invalid match file', true);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
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
      audit('add', `Started Season ${state.currentSeason}`);
      saveState();
      showToast(`Season ${state.currentSeason} started!`);
    }, 'Start New Season');
}
