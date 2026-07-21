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
