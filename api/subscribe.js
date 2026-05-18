// Vercel serverless function: receives newsletter signups from the site
// and forwards them to Brevo. The Brevo API key never reaches the browser.
//
// Required Vercel env vars:
//   BREVO_API_KEY  - xkeysib-... from Brevo > SMTP & API > API Keys
//   BREVO_LIST_ID  - numeric ID of the target contact list (e.g. 56)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { name, email } = req.body || {};

    if (typeof name !== 'string' || typeof email !== 'string') {
        return res.status(400).json({ error: 'Invalid payload' });
    }

    const trimmedName = name.trim().slice(0, 200);
    const trimmedEmail = email.trim().slice(0, 320);

    if (!trimmedName || !EMAIL_RE.test(trimmedEmail)) {
        return res.status(400).json({ error: 'Invalid name or email' });
    }

    const apiKey = process.env.BREVO_API_KEY;
    const listId = parseInt(process.env.BREVO_LIST_ID, 10);

    if (!apiKey || !listId) {
        console.error('Missing BREVO_API_KEY or BREVO_LIST_ID');
        return res.status(500).json({ error: 'Server misconfigured' });
    }

    try {
        const brevoRes = await fetch('https://api.brevo.com/v3/contacts', {
            method: 'POST',
            headers: {
                'api-key': apiKey,
                'Content-Type': 'application/json',
                'accept': 'application/json',
            },
            body: JSON.stringify({
                email: trimmedEmail,
                attributes: { FIRSTNAME: trimmedName },
                listIds: [listId],
                updateEnabled: true,
            }),
        });

        // Brevo returns 201 (created) or 204 (updated) on success.
        if (brevoRes.status === 201 || brevoRes.status === 204) {
            return res.status(200).json({ ok: true });
        }

        // Treat "contact already exists" as success — common case for resubmits.
        const body = await brevoRes.json().catch(() => ({}));
        if (body && body.code === 'duplicate_parameter') {
            return res.status(200).json({ ok: true });
        }

        console.error('Brevo error:', brevoRes.status, body && body.code);
        return res.status(502).json({ error: 'Upstream error' });
    } catch (err) {
        console.error('Subscribe handler error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
}
