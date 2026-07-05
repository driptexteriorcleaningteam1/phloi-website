// Netlify Function: phloi.com newsletter -> beehiiv
// Receives { name, email } from the newsletter form and creates a beehiiv subscription.
// If the email is already on the list, it does NOT add them again or re-send the
// welcome email — it returns { ok:true, alreadySubscribed:true } so the page can
// show a "you're already subscribed" message instead of a fresh signup.
// Secrets live in Netlify env vars, never in the page:
//   BEEHIIV_API_KEY
//   BEEHIIV_PUBLICATION_ID  -> looks like pub_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.BEEHIIV_API_KEY;
  const pubId = process.env.BEEHIIV_PUBLICATION_ID;
  if (!apiKey || !pubId) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server not configured' }) };
  }

  // Parse body (supports JSON or form-encoded)
  let name = '';
  let email = '';
  let botField = '';
  try {
    const ct = event.headers['content-type'] || event.headers['Content-Type'] || '';
    if (ct.includes('application/json')) {
      const b = JSON.parse(event.body || '{}');
      name = (b.name || '').trim();
      email = (b.email || '').trim();
      botField = (b['bot-field'] || '').trim();
    } else {
      const params = new URLSearchParams(event.body || '');
      name = (params.get('name') || '').trim();
      email = (params.get('email') || '').trim();
      botField = (params.get('bot-field') || '').trim();
    }
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Bad request' }) };
  }

  // Server-side honeypot: real users never fill bot-field. Bots that POST
  // straight to the function (bypassing the browser check) get a fake success
  // so they stop retrying, but nothing is subscribed.
  if (botField) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  // Cap name length before it becomes a beehiiv custom field.
  if (name.length > 100) name = name.slice(0, 100);

  // Basic email sanity check
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Please enter a valid email.' }) };
  }

  const base = `https://api.beehiiv.com/v2/publications/${pubId}`;
  const auth = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

  // Statuses that mean "already on the list" — we won't re-add or re-welcome these.
  const ON_LIST = ['active', 'validating', 'pending'];

  try {
    // 1) Already subscribed? Look the email up first.
    const lookup = await fetch(`${base}/subscriptions/by_email/${encodeURIComponent(email)}`, { headers: auth });
    if (lookup.ok) {
      const data = await lookup.json().then(d => (d && d.data) || d).catch(() => ({}));
      const status = (data && data.status) || '';
      if (ON_LIST.includes(status)) {
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, alreadySubscribed: true }) };
      }
      // invalid / inactive: let them through to re-subscribe (reactivate) below.
    }
    // 404 (not found) or any non-ok lookup: treat as a new subscriber and continue.

    // 2) New (or reactivating) subscriber.
    const basePayload = {
      email,
      reactivate_existing: true,
      send_welcome_email: true,
      utm_source: 'phloi.com',
      referring_site: 'phloi.com/newsletter',
    };

    // Try with the First Name custom field; if beehiiv rejects it, retry without
    // it so we never lose a subscriber over the name.
    async function subscribe(includeName) {
      const payload = { ...basePayload };
      if (includeName && name) {
        payload.custom_fields = [{ name: 'First Name', value: name }];
      }
      return fetch(`${base}/subscriptions`, { method: 'POST', headers: auth, body: JSON.stringify(payload) });
    }

    let res = await subscribe(true);
    if (!res.ok && name) {
      const retry = await subscribe(false);
      if (retry.ok) res = retry;
    }

    if (res.ok) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, alreadySubscribed: false }) };
    }

    const detail = await res.text();
    console.error('beehiiv error', res.status, detail);
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Could not subscribe right now.' }) };
  } catch (err) {
    console.error('subscribe function error', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Something went wrong.' }) };
  }
};
