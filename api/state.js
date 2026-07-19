import { Redis } from '@upstash/redis';
import fs from 'node:fs/promises';
import path from 'node:path';
import { sign } from './auth.js';

const KEY = process.env.REDIS_STATE_KEY || 'shift-manager:state:v1';

function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';')
      .map(v => v.trim())
      .filter(Boolean)
      .map(v => {
        const idx = v.indexOf('=');
        return [v.slice(0, idx), decodeURIComponent(v.slice(idx + 1))];
      })
  );
}

function isAuthorized(req) {
  const expectedPin = process.env.APP_PIN || '6426';
  const cookies = parseCookies(req.headers.cookie || '');
  return cookies.shift_auth === sign(expectedPin);
}

function redisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

async function seedState() {
  const seedPath = path.join(process.cwd(), 'seed-state.json');
  const text = await fs.readFile(seedPath, 'utf8');
  return JSON.parse(text);
}

async function localPath() {
  return path.join('/tmp', 'shift-manager-state.json');
}

async function getState() {
  const redis = redisClient();
  if (redis) {
    const data = await redis.get(KEY);
    if (data) return data;
    const seed = await seedState();
    await redis.set(KEY, seed);
    return seed;
  }

  try {
    return JSON.parse(await fs.readFile(await localPath(), 'utf8'));
  } catch {
    const seed = await seedState();
    await fs.writeFile(await localPath(), JSON.stringify(seed, null, 2));
    return seed;
  }
}

async function setState(data) {
  const redis = redisClient();
  if (redis) {
    await redis.set(KEY, data);
    return;
  }
  await fs.writeFile(await localPath(), JSON.stringify(data, null, 2));
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }

  if (req.method === 'GET') {
    const data = await getState();
    res.status(200).json(data);
    return;
  }

  if (req.method === 'PUT') {
    const data = req.body;
    if (!data || typeof data !== 'object') {
      res.status(400).json({ error: 'Estado inválido' });
      return;
    }
    data.updated_at = new Date().toISOString();
    await setState(data);
    res.status(200).json({ ok: true, updated_at: data.updated_at });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
