import crypto from 'node:crypto';

function sign(pin) {
  const secret = process.env.APP_SECRET || process.env.APP_PIN || '6426';
  return crypto.createHmac('sha256', secret).update(String(pin)).digest('hex');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const expectedPin = process.env.APP_PIN || '6426';
  const { pin } = req.body || {};

  if (String(pin || '') !== String(expectedPin)) {
    res.status(401).json({ error: 'PIN incorrecto' });
    return;
  }

  const token = sign(expectedPin);
  const secure = process.env.VERCEL ? '; Secure' : '';
  res.setHeader('Set-Cookie', `shift_auth=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`);
  res.status(200).json({ ok: true });
}

export { sign };
