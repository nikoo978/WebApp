export default async function handler(req, res) {
  res.setHeader('Set-Cookie', 'shift_auth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.status(200).json({ ok: true });
}
