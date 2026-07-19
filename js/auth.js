async function tryAdminLogin() {
  const pw = document.getElementById('pw-input').value;
  if (!pw) return;
  const encoder = new TextEncoder();
  const data = encoder.encode(pw);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  const snapshot = await db.ref('adminHash').get();
  const storedHash = snapshot.val();
  if (hashHex !== storedHash) {
    document.getElementById('pw-error').textContent = 'Wrong password';
    document.getElementById('pw-input').select();
    setTimeout(() => { document.getElementById('pw-error').textContent = ''; }, 2000);
    return;
  }
  setAdminMode(true);
  localStorage.setItem(ADMIN_SESSION_KEY, '1');
  document.getElementById('pw-input').value = '';
  showToast('Admin mode enabled');
}

function adminLogout() {
  showConfirm('Log Out', 'Exit admin mode?', () => {
    setAdminMode(false);
    localStorage.removeItem(ADMIN_SESSION_KEY);
    showTab('leaderboard');
  }, 'Log Out');
}

function setAdminMode(on) {
  isAdmin = on;
  if (on) {
    document.body.classList.add('is-admin');
    document.getElementById('admin-input-area').style.display = 'none';
    document.getElementById('admin-badge-area').style.display = 'flex';
  } else {
    document.body.classList.remove('is-admin');
    document.getElementById('admin-input-area').style.display = 'flex';
    document.getElementById('admin-badge-area').style.display = 'none';
  }
  updateSeasonUI();
  render();
  if (on) renderMatchForm();
}
