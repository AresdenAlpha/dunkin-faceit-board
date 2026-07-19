firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const dbRef = db.ref('deadstats');

function initFirebase() {
  document.getElementById('leaderboard-list').innerHTML =
    '<div class="empty-state" style="color:var(--c-muted)">Connecting...</div>';

  dbRef.on('value', snapshot => {
    const data = snapshot.val() || {};
    state.players        = data.players        || [];
    state.matches        = data.matches        || [];
    state.auditLog       = data.auditLog       || [];
    state.deletedMatches = data.deletedMatches || [];
    state.deletedPlayers = data.deletedPlayers || [];

    // Deduplicate players that differ only by casing
    const seen = {};
    state.players = state.players.filter(p => {
      const key = p.name.toLowerCase();
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });

    // Canonicalize match player names
    state.matches.forEach(m => {
      m.team1 = m.team1.map(n => {
        const p = state.players.find(p => p.name.toLowerCase() === n.toLowerCase());
        return p ? p.name : n;
      });
      m.team2 = m.team2.map(n => {
        const p = state.players.find(p => p.name.toLowerCase() === n.toLowerCase());
        return p ? p.name : n;
      });
    });

    render();
    renderMatchForm();
  });
}

function saveState() {
  dbRef.set({
    players:        state.players,
    matches:        state.matches,
    auditLog:       state.auditLog,
    deletedMatches: state.deletedMatches || [],
    deletedPlayers: state.deletedPlayers || []
  }).catch(err => {
    showToast('Save failed — check connection', true);
    console.error('Firebase save error:', err);
  });
}

function audit(type, message, data) {
  const entry = {
    id: Date.now() + Math.random(),
    ts: new Date().toISOString(),
    type,
    message,
    data: data || null
  };
  state.auditLog.unshift(entry);
  if (state.auditLog.length > 500) state.auditLog = state.auditLog.slice(0, 500);
}
