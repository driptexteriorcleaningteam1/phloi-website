// Netlify Function: phloi.com newsletter -> beehiiv
// Receives { name, email } from the newsletter form and creates a beehiiv subscription.
// Secrets live in Netlify env vars, never in the page:
//   BEEHIIV_API_KEY        -> beehiiv > Settings > Integrations > API (starts with no fixed prefix)
//   BEEHIIV_PUBLICATION_ID -> looks like pub_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

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
  try {
    const ct = event.headers['content-type'] || event.headers['Content-Type'] || '';
    if (ct.includes('application/json')) {
      const b = JSON.parse(event.body || '{}');
      name = (b.name || '').trim();
      email = (b.email || '').trim();
    } else {
      const params = new URLSearchParams(event.body || '');
      name = (params.get('name') || '').trim();
      email = (params.get('email') || '').trim();
    }
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Bad request' }) };
  }

  // Basic email sanity check
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Please enter a valid email.' }) };
  }

  const endpoint = `https://api.beehiiv.com/v2/publications/${pubId}/subscriptions`;
  const auth = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

  const basePayload = {
    email,
    reactivate_existing: true,
    send_welcome_email: true,
    utm_source: 'phloi.com',
    referring_site: 'phloi.com/newsletter',
  };

  // Attempt with the First Name custom field; if beehiiv rejects it
  // (e.g. the custom field doesn't exist yet), retry without it so we
  // never lose a subscriber over the name.
  async function subscribe(includeName) {
    const payload = { ...basePayload };
    if (includeName && name) {
      payload.custom_fields = [{ name: 'First Name', value: name }];
    }
    return fetch(endpoint, { method: 'POST', headers: auth, body: JSON.stringify(payload) });
  }

  try {
    let res = await subscribe(true);
    if (!res.ok && name) {
      // retry without the custom field
      const retry = await subscribe(false);
      if (retry.ok) res = retry;
    }

    if (res.ok) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    const detail = await res.text();
    console.error('beehiiv error', res.status, detail);
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Could not subscribe right now.' }) };
  } catch (err) {
    console.error('subscribe function error', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Something went wrong.' }) };
  }
};
