// Netlify Edge Function: keeps phloi.com/onboarding private.
// Nobody sees the form without the code in the ONBOARDING_CODE env var (set in Netlify, redeploy after changing it).
// A link with ?k=<code> lets a client straight in. Otherwise they get a code box.
// Either way a signed 30 day cookie remembers them. Changing the code locks out every old cookie and link.
// With no code set, the page stays locked for everyone.

const COOKIE = '__Host-phloi-onb';
const DAYS = 30;
const enc = new TextEncoder();

const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

async function mac(code, exp) {
  const key = await crypto.subtle.importKey('raw', enc.encode('phloi-onboarding:' + code), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(String(exp))));
  let s = ''; for (const b of sig) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function readCookie(request, name) {
  const all = request.headers.get('cookie') || '';
  for (const part of all.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}
async function valid(cookie, code) {
  const [exp, sig] = cookie.split('.');
  if (!exp || !sig || !(Number(exp) > Date.now())) return false;
  return same(sig, await mac(code, exp));
}
// only ever back to /onboarding, keeping the prefill params and dropping the code
function back(search) {
  const q = new URLSearchParams(search || '');
  q.delete('k');
  const s = q.toString();
  return '/onboarding' + (s ? '?' + s : '');
}
const PRIVATE = { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer' };

async function letIn(code, to) {
  const exp = Date.now() + DAYS * 864e5;
  return new Response(null, { status: 303, headers: { ...PRIVATE, location: to,
    'set-cookie': `${COOKIE}=${exp}.${await mac(code, exp)}; Path=/; Max-Age=${DAYS * 86400}; Secure; HttpOnly; SameSite=Lax` } });
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function lockPage(status, { next = '', wrong = false, closed = false } = {}) {
  const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Launch Day Onboarding · Phloi</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" type="image/png" sizes="512x512" href="/favicon.png">
<meta name="theme-color" content="#f5f2ea">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;600&family=Space+Mono&display=swap">
<style>
  :root{--paper:#f5f2ea;--card:#fffdf7;--ink:#0f0f0d;--ink-2:#55514a;--ink-3:#6a675e;--line:rgba(15,15,13,.22);--accent:#b9ff4a;--accent-deep:#4f6f0a;--fill-bg:rgba(185,255,74,.45);color-scheme:light}
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);font-family:"Inter",system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;font-size:15px;line-height:24px;-webkit-font-smoothing:antialiased}
  .bar{border-bottom:1px solid var(--line)}
  .bar-in,.doc{max-width:760px;margin:0 auto;padding:0 24px}
  .bar-in{display:flex;align-items:center;min-height:57px}
  .wordmark{font-family:"Space Grotesk","Helvetica Neue",Arial,sans-serif;font-weight:700;font-size:18px;letter-spacing:-.04em;text-decoration:none;color:inherit}
  .wordmark b{color:var(--accent-deep)}
  .eyebrow{margin-left:auto;font-family:"Space Mono",ui-monospace,Menlo,Consolas,monospace;font-size:11px;line-height:16px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-2)}
  h1{font-family:"Space Grotesk","Helvetica Neue",Arial,sans-serif;font-weight:600;font-size:44px;line-height:46px;letter-spacing:-.03em;margin:56px 0 28px}
  form{display:flex;flex-direction:column;gap:8px;max-width:360px}
  label{font-weight:600}
  .row{display:flex;gap:8px}
  input{font:inherit;font-size:16px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:4px;padding:8px 12px;height:44px;flex:1;min-width:0;-webkit-appearance:none;appearance:none}
  input:focus{outline:none;border-color:var(--ink);box-shadow:0 0 0 2px var(--fill-bg)}
  button{font-family:"Space Grotesk","Helvetica Neue",Arial,sans-serif;font-weight:600;font-size:15px;height:44px;padding:0 20px;border-radius:4px;border:1px solid var(--ink);background:var(--ink);color:var(--paper);cursor:pointer}
  button:hover{background:var(--accent);border-color:var(--accent);color:#0f0f0d}
  button:focus-visible{outline:2px solid var(--accent-deep);outline-offset:2px}
  .err{color:#a1260d;font-size:14px;line-height:20px}
  .note{color:var(--ink-2)}
  @media (max-width:640px){.bar-in,.doc{padding:0 16px}.bar-in{min-height:49px}h1{font-size:34px;line-height:38px;margin:36px 0 22px}}
</style>
</head>
<body>
<div class="bar"><div class="bar-in"><a class="wordmark" href="/" aria-label="Phloi home">Phloi<b>.</b></a><span class="eyebrow">Launch Day onboarding</span></div></div>
<main class="doc">
  <h1>Before we sit down.</h1>
  ${closed ? '<p class="note">This page is not open yet. Email <a href="mailto:contact@phloi.com">contact@phloi.com</a>.</p>' : `<form method="POST" action="/onboarding">
    <input type="hidden" name="next" value="${esc(next)}">
    <label for="code">The code I sent you</label>
    <div class="row"><input id="code" name="code" type="text" required autocomplete="off" autocapitalize="characters" spellcheck="false" autofocus${wrong ? ' aria-invalid="true" aria-describedby="err"' : ''}><button type="submit">Open</button></div>
    ${wrong ? '<p class="err" id="err">That code is not right.</p>' : ''}
  </form>`}
</main>
</body>
</html>`;
  return new Response(html, { status, headers: { ...PRIVATE, 'content-type': 'text/html; charset=utf-8' } });
}

export default async (request, context) => {
  const url = new URL(request.url);
  const code = norm(Netlify.env.get('ONBOARDING_CODE'));
  if (code.length < 6) return lockPage(503, { closed: true });

  if (request.method === 'POST') {
    let entered = '', next = '';
    try { const f = await request.formData(); entered = norm(f.get('code')); next = String(f.get('next') || ''); } catch (e) {}
    if (entered && same(entered, code)) return letIn(code, back(next));
    await new Promise((r) => setTimeout(r, 600));
    return lockPage(401, { next, wrong: true });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: PRIVATE });

  const k = url.searchParams.get('k');
  if (k != null) {
    if (same(norm(k), code)) return letIn(code, back(url.search));
    return lockPage(401, { next: back(url.search).replace('/onboarding', ''), wrong: true });
  }

  if (await valid(readCookie(request, COOKIE), code)) {
    const res = await context.next();
    const out = new Response(res.body, res);
    for (const [h, v] of Object.entries(PRIVATE)) out.headers.set(h, v);
    return out;
  }
  return lockPage(401, { next: url.search });
};

export const config = { path: ['/onboarding', '/onboarding/', '/onboarding.html'] };
