// Public "Sync from FACEIT" — anyone can trigger it. Safety comes from three layers:
// a Firebase transaction lock (one sync at a time), a shared cooldown, and
// dedupe by Dota match id (double-imports are no-ops even if the other two fail).

const SYNC_COOLDOWN_MS   = 10 * 60 * 1000;
const SYNC_LOCK_STALE_MS = 3 * 60 * 1000;
const SYNC_LOOKBACK_DAYS = 14;      // how far back a sync searches for games
const SYNC_MAX_POLL      = 20;      // player histories fetched per sync
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
    status.textContent = `Synced ${Math.max(1, Math.round((Date.now() - last) / 60000))} min ago`;
  } else {
    btn.disabled = false;
    status.textContent = last ? `Last sync: ${new Date(last).toLocaleString()}` : '';
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

// Which accounts' histories to poll: recently active board players first,
// then remaining roster members, capped to stay inside OpenDota rate limits.
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
  Object.keys(roster).forEach(push);
  return list.slice(0, SYNC_MAX_POLL);
}

async function runFaceitSync() {
  if (syncRunning) return;
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
    const cutoff = Math.floor(Date.now() / 1000) - SYNC_LOOKBACK_DAYS * 86400;
    const pollList = buildPollList(roster);

    const candidates = new Map(); // matchId -> start_time
    for (let i = 0; i < pollList.length; i++) {
      setSyncStatus(`Checking players… ${i + 1}/${pollList.length}`);
      try {
        const ms = await odFetch(`/players/${pollList[i]}/matches?significant=0&date=${SYNC_LOOKBACK_DAYS}&project=start_time&project=lobby_type`);
        ms.forEach(m => {
          if (m.lobby_type === 1 && m.start_time >= cutoff && !knownMatchIds.has(m.match_id)) {
            candidates.set(m.match_id, m.start_time);
          }
        });
      } catch (e) { /* one player failing shouldn't kill the sync */ }
      await syncSleep(300);
    }

    const ordered = [...candidates.entries()].sort((a, b) => a[1] - b[1]).slice(0, SYNC_MAX_NEW);
    const isKnown = id => !!(id && (roster[id] || playerByAccount(id)));
    const newMatches = [];
    const newPlayers = [];

    for (let i = 0; i < ordered.length; i++) {
      setSyncStatus(`Fetching match ${i + 1}/${ordered.length}…`);
      let md;
      try { md = await odFetch(`/matches/${ordered[i][0]}`); }
      catch (e) { await syncSleep(1000); continue; }
      await syncSleep(600);

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
        startTime: md.start_time
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
