// ============================================================
// Constants
// ============================================================
const COLORS = ['#a855f7','#3a9eff','#34c97a','#e84040','#a78bfa','#f97316','#06b6d4','#ec4899','#84cc16','#f59e0b'];
const BGS    = ['rgba(168,85,247,.2)','rgba(58,158,255,.2)','rgba(52,201,122,.2)','rgba(232,64,64,.2)','rgba(167,139,250,.2)','rgba(249,115,22,.2)','rgba(6,182,212,.2)','rgba(236,72,153,.2)','rgba(132,204,22,.2)','rgba(245,158,11,.2)'];
const ADMIN_SESSION_KEY = 'deadstats-admin';

// ============================================================
// State
// ============================================================
let state = { players: [], matches: [], auditLog: [], currentSeason: 1, seasons: [] };
let isAdmin = false;
let selectedWinner = null;
let playerFilter = '';

// ============================================================
// Helpers
// ============================================================
function initials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function getColor(name) {
  const idx = state.players.findIndex(p => p.name === name);
  const i = (idx >= 0 ? idx : 0) % COLORS.length;
  return { color: COLORS[i], bg: BGS[i] };
}

function computeStats() {
  const season = state.currentSeason || 1;
  const stats = {};
  state.players.forEach(p => { stats[p.name] = { wins: 0, losses: 0, games: 0 }; });
  state.matches
    .filter(m => (m.season || 1) === season)
    .forEach(m => {
      const winners = m.winner === 'amber' ? m.team1 : m.team2;
      const losers  = m.winner === 'amber' ? m.team2 : m.team1;
      winners.forEach(n => {
        if (!stats[n]) stats[n] = { wins: 0, losses: 0, games: 0 };
        stats[n].wins++; stats[n].games++;
      });
      losers.forEach(n => {
        if (!stats[n]) stats[n] = { wins: 0, losses: 0, games: 0 };
        stats[n].losses++; stats[n].games++;
      });
    });
  return stats;
}

function wr(s) { return s.games > 0 ? Math.round((s.wins / s.games) * 100) : 0; }

function wrColor(w) {
  const clamp = v => Math.max(0, Math.min(1, v));
  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  const raw = clamp((w - 20) / 60);
  const t = raw < 0.5
    ? 0.5 * Math.pow(raw * 2, 2.8)
    : 1 - 0.5 * Math.pow((1 - raw) * 2, 2.8);
  let r, g, b;
  if (t <= 0.5) {
    const u = t / 0.5;
    r = lerp(232, 139, u); g = lerp(64, 143, u); b = lerp(64, 168, u);
  } else {
    const u = (t - 0.5) / 0.5;
    r = lerp(139, 52, u); g = lerp(143, 201, u); b = lerp(168, 122, u);
  }
  return `rgb(${r},${g},${b})`;
}

function wrClass(w) { return w >= 55 ? 'wr-high' : w <= 45 ? 'wr-low' : 'wr-mid'; }

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'2-digit' })
           + ' ' + d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
  } catch { return iso; }
}
