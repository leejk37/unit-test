// 학교 구글 계정 로그인 + Apps Script API 호출
(function () {
  const C = window.APP_CONFIG;
  let token = null;
  try { token = sessionStorage.getItem('idToken'); } catch (e) {}
  let waiters = [];
  let inited = false;

  function expOf(t) {
    try {
      let p = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      while (p.length % 4) p += '=';
      return JSON.parse(atob(p)).exp * 1000;
    } catch (e) { return 0; }
  }
  function valid() { return !!token && expOf(token) > Date.now() + 60000; }

  const gisReady = new Promise(function (res) {
    if (window.__gis) return res();
    window.addEventListener('gis-loaded', res, { once: true });
  });

  const css = document.createElement('style');
  css.textContent = '#login-ov{position:fixed;inset:0;background:rgba(20,30,50,.45);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px}' +
    '#login-ov[hidden]{display:none}#login-ov .box{background:#fff;color:#1f2a44;border-radius:14px;padding:26px 24px;max-width:380px;width:100%;text-align:center}' +
    '#login-ov h2{margin:0 0 6px;font-size:22px}#login-ov p{margin:0 0 16px;color:#5b6478}#login-ov .slot{display:flex;justify-content:center;min-height:44px}';
  document.head.appendChild(css);

  function overlay() {
    let ov = document.getElementById('login-ov');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'login-ov';
      ov.innerHTML = '<div class="box" role="dialog" aria-modal="true" aria-labelledby="login-title">' +
        '<h2 id="login-title">로그인</h2><p class="msg"></p><div class="slot"></div></div>';
      document.body.appendChild(ov);
    }
    return ov;
  }

  function onCredential(r) {
    token = r.credential;
    try { sessionStorage.setItem('idToken', token); } catch (e) {}
    overlay().hidden = true;
    const w = waiters; waiters = [];
    w.forEach(function (f) { f(); });
  }

  async function showLogin(msg) {
    const ov = overlay();
    ov.querySelector('.msg').textContent = msg || '학교 구글 계정(@' + C.DOMAIN + ')으로 로그인해 주세요.';
    ov.hidden = false;
    await gisReady;
    if (!inited) {
      google.accounts.id.initialize({ client_id: C.CLIENT_ID, callback: onCredential, hd: C.DOMAIN,
        auto_select: true, ux_mode: 'popup', use_fedcm_for_prompt: true });
      inited = true;
    }
    const slot = ov.querySelector('.slot');
    slot.innerHTML = '';
    google.accounts.id.renderButton(slot, { theme: 'outline', size: 'large', text: 'signin_with', locale: 'ko' });
    google.accounts.id.prompt();
  }

  function needLogin(msg) {
    return new Promise(function (res) { waiters.push(res); showLogin(msg); });
  }

  async function post(action, args) {
    const r = await fetch(C.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // 사전 요청(CORS preflight)을 피하려고 text/plain
      body: JSON.stringify({ action: action, args: args, idToken: token })
    });
    if (!r.ok) throw new Error('서버에 연결하지 못했어요. (' + r.status + ')');
    return r.json();
  }

  window.api = async function (action) {
    const args = Array.prototype.slice.call(arguments, 1);
    if (!valid()) await needLogin();
    let r = await post(action, args);
    if (!r.ok && r.code === 'auth') {
      token = null;
      try { sessionStorage.removeItem('idToken'); } catch (e) {}
      await needLogin(r.error);
      r = await post(action, args);
    }
    if (!r.ok) throw new Error(r.error);
    return r.data;
  };

  window.signOut = function () {
    token = null;
    try { sessionStorage.removeItem('idToken'); } catch (e) {}
    if (window.google && google.accounts) google.accounts.id.disableAutoSelect();
    location.reload();
  };
})();
