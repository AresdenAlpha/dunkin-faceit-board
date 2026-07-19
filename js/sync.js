// Public "Sync from FACEIT" — anyone can trigger it. Safety comes from three layers:
// a Firebase transaction lock (one sync at a time), a shared cooldown, and
// dedupe by Dota match id (double-imports are no-ops even if the other two fail).

const SYNC_COOLDOWN_MS   = 10 * 60 * 1000;
const SYNC_LOCK_STALE_MS = 3 * 60 * 1000;
const SYNC_MAX_LOOKBACK_DAYS = 30;  // hard cap; the real boundary is state.seasonStart
const SYNC_MAX_POLL      = 45;      // player histories fetched per sync (spaced to respect OpenDota's 60/min)
const SYNC_MAX_NEW       = 60;      // match details fetched per sync
const SYNC_MIN_KNOWN     = 6;       // players already in roster for a game to count as ours

const syncRef = db.ref('sync');
const rosterRef = db.ref('roster');
let syncInfo = {};
let syncRunning = false;

syncRef.on('value', s => { syncInfo = s.val() || {}; renderSyncBar(); });
setInterval(renderSyncBar, 30 * 1000);

function renderSyncBar() {
  const btn = document.getElementById('sync-btn');
  const status = document.getElementById('sync-status');
  if (!btn) return;
  if (syncRunning) return; // progress text owns the bar during a sync
  const last = syncInfo.lastSyncAt || 0;
  const remaining = SYNC_COOLDOWN_MS - (Date.now() - last);
  if (remaining > 0) {
    btn.disabled = true;
    status.textContent = `Next sync in ${Math.max(1, Math.ceil(remaining / 60000))} min`;
  } else {
    btn.disabled = false;
    status.textContent = last ? `Last sync: ${new Date(last).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '';
  }
}

function setSyncStatus(text) {
  const status = document.getElementById('sync-status');
  if (status) status.textContent = text;
}

const syncSleep = ms => new Promise(r => setTimeout(r, ms));

async function odFetch(path) {
  const res = await fetch('https://api.opendota.com/api' + path);
  if (!res.ok) throw new Error('OpenDota ' + res.status);
  return res.json();
}

function playerByAccount(accountId) {
  return state.players.find(p => String(p.accountId) === String(accountId)) || null;
}

// Which accounts' histories to poll, most-recently-active first: players from
// recent matches, then remaining board players, then a random rotation of the
// rest of the roster. Order matters — the poll loop stops early once a long
// streak of polls stops discovering new games, so actives must come first.
function buildPollList(roster) {
  const seen = new Set();
  const list = [];
  const push = id => { const k = String(id); if (!seen.has(k)) { seen.add(k); list.push(k); } };
  const nameToAccount = {};
  state.players.forEach(p => { if (p.accountId) nameToAccount[p.name] = p.accountId; });
  [...state.matches].reverse().forEach(m => {
    [...m.team1, ...m.team2].forEach(n => { if (nameToAccount[n]) push(nameToAccount[n]); });
  });
  state.players.forEach(p => { if (p.accountId) push(p.accountId); });
  const fill = Object.keys(roster).filter(id => !seen.has(String(id)));
  for (let i = fill.length - 1; i > 0; i--) { // shuffle so unpolled members rotate in over time
    const j = Math.floor(Math.random() * (i + 1));
    [fill[i], fill[j]] = [fill[j], fill[i]];
  }
  fill.forEach(id => { if (list.length < SYNC_MAX_POLL) push(id); });
  return list;
}

async function runFaceitSync() {
  if (syncRunning) return;
  if (!dbLoaded) { showToast('Still connecting — try again in a moment', true); return; }
  const last = syncInfo.lastSyncAt || 0;
  if (Date.now() - last < SYNC_COOLDOWN_MS) { showToast('Already synced recently', true); return; }

  // Claim the lock — exactly one client wins; stale locks (crashed tab) are reclaimed
  const lockResult = await syncRef.child('lock').transaction(cur => {
    if (cur && Date.now() - cur < SYNC_LOCK_STALE_MS) return; // abort: someone else is syncing
    return Date.now();
  });
  if (!lockResult.committed) { showToast('A sync is already running', true); return; }

  syncRunning = true;
  const btn = document.getElementById('sync-btn');
  if (btn) btn.disabled = true;
  try {
    setSyncStatus('Reading roster…');
    const roster = (await rosterRef.get()).val() || {};

    const knownMatchIds = new Set(state.matches.map(m => m.matchId).filter(Boolean));
    // Only import games from the current season; seasonStart is stamped by "New Season"
    const maxCutoff = Math.floor(Date.now() / 1000) - SYNC_MAX_LOOKBACK_DAYS * 86400;
    const cutoff = state.seasonStart ? Math.max(Math.floor(state.seasonStart / 1000), maxCutoff) : maxCutoff;
    const lookbackDays = Math.min(SYNC_MAX_LOOKBACK_DAYS, Math.ceil((Date.now() / 1000 - cutoff) / 86400) + 1);
    const pollList = buildPollList(roster);

    // Every game is discoverable through any of its 10 players, and games
    // cluster among recent actives — so once this many consecutive polls
    // (in recency order) find nothing new, the rest of the list is skipped.
    const EMPTY_POLL_STREAK_STOP = 12;
    const candidates = new Map(); // matchId -> start_time
    let emptyStreak = 0;
    for (let i = 0; i < pollList.length; i++) {
      setSyncStatus(`Checking players… ${i + 1}/${pollList.length}`);
      const before = candidates.size;
      try {
        const ms = await odFetch(`/players/${pollList[i]}/matches?significant=0&date=${lookbackDays}&project=start_time&project=lobby_type`);
        ms.forEach(m => {
          if (m.lobby_type === 1 && m.start_time >= cutoff && !knownMatchIds.has(m.match_id)) {
            candidates.set(m.match_id, m.start_time);
          }
        });
        emptyStreak = candidates.size > before ? 0 : emptyStreak + 1;
        if (emptyStreak >= EMPTY_POLL_STREAK_STOP) break;
      } catch (e) { /* one player failing shouldn't kill the sync */ }
      await syncSleep(1000); // stay under OpenDota's 60 calls/min

    }

    // Newest first: latest games land on the board immediately; older ones backfill on later syncs
    const ordered = [...candidates.entries()].sort((a, b) => b[1] - a[1]).slice(0, SYNC_MAX_NEW);
    const isKnown = id => !!(id && (roster[id] || playerByAccount(id)));
    const newMatches = [];
    const newPlayers = [];

    for (let i = 0; i < ordered.length; i++) {
      setSyncStatus(`Fetching match ${i + 1}/${ordered.length}…`);
      let md = null;
      for (let attempt = 0; attempt < 2 && !md; attempt++) {
        try { md = await odFetch(`/matches/${ordered[i][0]}`); }
        catch (e) { await syncSleep(2000); }
      }
      if (!md) continue;
      await syncSleep(1000);

      if (!md.players || md.players.length !== 10) continue;
      if (!(md.leagueid > 0)) continue; // must carry a tournament ticket
      if (md.players.filter(p => isKnown(p.account_id)).length < SYNC_MIN_KNOWN) continue;

      const resolveName = p => {
        if (p.account_id) {
          const existing = playerByAccount(p.account_id);
          if (existing) return existing.name;
          const name = roster[p.account_id] || p.personaname || `Player ${p.account_id}`;
          if (!state.players.find(pl => pl.name === name)) {
            const created = { name, accountId: p.account_id };
            state.players.push(created);
            newPlayers.push(created);
          } else {
            const byName = state.players.find(pl => pl.name === name);
            if (!byName.accountId) byName.accountId = p.account_id;
          }
          return name;
        }
        return p.personaname || 'Anonymous';
      };

      const radiant = md.players.filter(p => p.player_slot < 128);
      const dire    = md.players.filter(p => p.player_slot >= 128);
      newMatches.push({
        team1: radiant.map(resolveName),
        team2: dire.map(resolveName),
        heroes1: radiant.map(p => p.hero_id),
        heroes2: dire.map(p => p.hero_id),
        winner: md.radiant_win ? 'radiant' : 'dire',
        date: new Date(md.start_time * 1000).toISOString().slice(0, 10),
        duration: `${Math.round(md.duration / 60)} min`,
        notes: '',
        season: state.currentSeason || 1,
        matchId: md.match_id,
        startTime: md.start_time,
        // draft data: h=hero, p=1 pick/0 ban, t=0 radiant/1 dire, o=order
        picksBans: (md.picks_bans || []).map(pb => ({ h: pb.hero_id, p: pb.is_pick ? 1 : 0, t: pb.team, o: pb.order })),
        captains: { radiant: md.radiant_captain || null, dire: md.dire_captain || null }
      });
    }

    if (newMatches.length) {
      state.matches.push(...newMatches);
      state.matches.sort((a, b) => (a.startTime || Date.parse(a.date) / 1000 || 0) - (b.startTime || Date.parse(b.date) / 1000 || 0));
      audit('log', `FACEIT sync imported ${newMatches.length} match(es)` +
        (newPlayers.length ? `, added ${newPlayers.length} player(s): ${newPlayers.map(p => p.name).join(', ')}` : ''));
      saveState();
      showToast(`Imported ${newMatches.length} new match${newMatches.length > 1 ? 'es' : ''}!`);
    } else {
      showToast('No new matches found');
    }
    await syncRef.child('lastSyncAt').set(Date.now());
  } catch (e) {
    console.error('Sync failed:', e);
    showToast('Sync failed — try again later', true);
  } finally {
    syncRunning = false;
    syncRef.child('lock').remove();
    renderSyncBar();
  }
}
