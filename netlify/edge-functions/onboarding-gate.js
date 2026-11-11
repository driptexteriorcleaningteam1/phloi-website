// Netlify Edge Function: phloi.com/onboarding is retired. Onboarding now lives on each client's own page
// (phloi.com/c/<their link>, served by the Phloi Dashboard), where the answers land on their client record.
// onboarding.html stays in the site only so Netlify keeps the phloi-onboarding form, which emails the answers
// each client page sends. Nobody can open it: every request here goes to the home page.

export default async () => new Response(null, {
  status: 302,
  headers: { location: '/', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' }
});

export const config = { path: ['/onboarding', '/onboarding/', '/onboarding.html'] };
