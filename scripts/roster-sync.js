// Refreshes the FACEIT hub roster into Firebase and keeps board player names
// aligned with FACEIT nicknames. Runs nightly via GitHub Actions, or locally:
//   node scripts/roster-sync.js
//
// No secrets required: the FACEIT endpoints are public and the RTDB rules are open.

const HUB_ID = '6a0eed4c-933f-44f4-b6b2-b500028030a6';
const DB_URL = 'https://dunkin-faceit-board-default-rtdb.europe-west1.firebasedatabase.app';
const FACEIT = 'https://www.faceit.com/api';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJson(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function fetchHubMembers() {
  const members = [];
  for (let offset = 0; ; offset += 100) {
    const page = await getJson(`${FACEIT}/hubs/v1/hub/${HUB_ID}/membership?offset=${offset}&limit=100`);
    const items = page.payload?.items || [];
    members.push(...items.map(i => i.user));
    if (members.length >= (page.payload?.total || 0) || items.length === 0) break;
  }
  return members;
}

// FACEIT stores the Dota account as a Steam ID3 string like "[U:1:125192641]"
function accountIdFromGameId(gameId) {
  const m = /\[U:1:(\d+)\]/.exec(gameId || '');
  return m ? parseInt(m[1], 10) : null;
}

async function main() {
  const members = await fetchHubMembers();
  console.log(`hub members: ${members.length}`);

  const roster = {};
  for (const u of members) {
    try {
      const profile = await getJson(`${FACEIT}/users/v1/users/${u.guid}`);
      const accountId = accountIdFromGameId(profile.payload?.games?.dota2?.game_id);
      if (accountId) roster[accountId] = profile.payload.nickname;
    } catch (e) {
      console.warn(`skipping ${u.nickname}: ${e.message}`);
    }
    await sleep(250);
  }
  console.log(`resolved dota accounts: ${Object.keys(roster).length}`);

  await getJson(`${DB_URL}/roster.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(roster),
  });
  console.log('roster node updated');

  // Rename existing board players whose FACEIT nickname changed
  const data = (await getJson(`${DB_URL}/dotastats.json`)) || {};
  const players = data.players || [];
  const matches = data.matches || [];
  let renamed = 0;
  for (const p of players) {
    const nickname = p.accountId && roster[p.accountId];
    if (nickname && nickname !== p.name) {
      const oldName = p.name;
      p.name = nickname;
      matches.forEach(m => {
        m.team1 = (m.team1 || []).map(n => (n === oldName ? nickname : n));
        m.team2 = (m.team2 || []).map(n => (n === oldName ? nickname : n));
      });
      console.log(`renamed: ${oldName} -> ${nickname}`);
      renamed++;
    }
  }
  if (renamed) {
    await getJson(`${DB_URL}/dotastats.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ players, matches }),
    });
    console.log(`players/matches updated (${renamed} renames)`);
  } else {
    console.log('no renames needed');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
