let heroes = [];

async function loadHeroes() {
  try {
    const res = await fetch('https://assets.deadlock-api.com/v2/heroes?only_active=true');
    const data = await res.json();
    heroes = data
      .filter(h => h.name && !h.name.startsWith('hero_'))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(h => ({
        id: h.id,
        name: h.name,
        icon: h.images?.icon_hero_card_webp || h.images?.minimap_image || null
      }));
    renderMatchForm();
  } catch(e) {
    console.warn('Failed to load heroes:', e);
  }
}

function heroById(id) {
  return heroes.find(h => h.id == id) || null;
}

function heroIconHtml(id, size = 22) {
  const h = heroById(id);
  if (!h || !h.icon) return `<div class="hero-icon-placeholder" style="width:${size}px;height:${size}px"></div>`;
  return `<img class="hero-icon-sm" src="${h.icon}" title="${escHtml(h.name)}" style="width:${size}px;height:${size}px" onerror="this.style.display='none'" />`;
}

function topHeroes(playerName, season) {
  const counts = {};
  const seasonMatches = state.matches.filter(m => (m.season || 1) === season);
  seasonMatches.forEach(m => {
    const idx1 = m.team1.indexOf(playerName);
    const idx2 = m.team2.indexOf(playerName);
    let heroId = null;
    if (idx1 >= 0 && m.heroes1) heroId = m.heroes1[idx1];
    else if (idx2 >= 0 && m.heroes2) heroId = m.heroes2[idx2];
    if (heroId) counts[heroId] = (counts[heroId] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => parseInt(id));
}
