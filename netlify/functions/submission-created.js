// Netlify event function: runs after every verified (not spam) form submission on phloi.com.
// Enquiries, proposals sent back and dashboard briefs are passed to the Phloi Dashboard, which adds them to
// Leads (or to the notes of a lead with the same email). The email notification still goes out as before.
// Onboarding is not passed on: each client's page saves its answers to the dashboard itself.
// Env vars on this site: INTAKE_SECRET (the same value as on the dashboard site), INTAKE_URL (optional).

const FORMS = new Set(['phloi-inquiry', 'phloi-proposal', 'dashboard-brief', 'phloi-dashboard']);

exports.handler = async (event) => {
  let payload = null;
  try { payload = JSON.parse(event.body || '{}').payload; } catch (e) {}
  if (!payload || !FORMS.has(payload.form_name)) return { statusCode: 200, body: 'skipped' };

  const key = process.env.INTAKE_SECRET;
  const url = process.env.INTAKE_URL || 'https://phloi-dashboard.netlify.app/api/intake';
  if (!key) { console.error('INTAKE_SECRET is not set'); return { statusCode: 200, body: 'not set up' }; }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Intake-Key': key },
      body: JSON.stringify({ form: payload.form_name, id: payload.id, at: payload.created_at, data: payload.data || {} })
    });
    if (!res.ok) console.error('dashboard intake answered', res.status, await res.text());
  } catch (e) {
    console.error('dashboard intake failed', e);
  }
  return { statusCode: 200, body: 'ok' };
};
