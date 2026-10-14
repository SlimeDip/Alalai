import express from 'express';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import db from '../database.js';

const router = express.Router();
const scrypt = promisify(crypto.scrypt);
const SESSION_COOKIE = 'tulong_bayan_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const HASH_BYTES = 64;

function publicUser(row) {
  return { id: row.user_id, name: row.full_name, email: row.email };
}

function setSessionCookie(res, token) {
  const production = process.env.NODE_ENV === 'production';
  const sameSite = production ? 'None' : 'Lax';
  const secure = production ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure}`
  );
}

function clearSessionCookie(res) {
  const production = process.env.NODE_ENV === 'production';
  const sameSite = production ? 'None' : 'Lax';
  const secure = production ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=0${secure}`
  );
}

function getSessionToken(req) {
  const cookieHeader = req.headers.cookie || '';
  const cookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return cookie ? cookie.slice(SESSION_COOKIE.length + 1) : null;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function csrfTokenFor(token) {
  return crypto.createHmac('sha256', token).update('tulong-bayan-csrf-v1').digest('base64url');
}

function hasMatchingCsrfToken(expected, supplied) {
  if (typeof supplied !== 'string') return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length
    && crypto.timingSafeEqual(expectedBytes, suppliedBytes);
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, HASH_BYTES);
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

async function verifyPassword(password, passwordHash) {
  const [algorithm, saltText, hashText] = (passwordHash || '').split('$');
  if (algorithm !== 'scrypt' || !saltText || !hashText) {
    await scrypt(password, 'invalid-password-hash', HASH_BYTES);
    return false;
  }

  const expected = Buffer.from(hashText, 'base64url');
  if (expected.length !== HASH_BYTES) return false;
  const actual = await scrypt(password, Buffer.from(saltText, 'base64url'), HASH_BYTES);
  return crypto.timingSafeEqual(actual, expected);
}

function expiryTimestamp() {
  return new Date(Date.now() + SESSION_TTL_MS)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  db.prepare('DELETE FROM auth_sessions WHERE expires_at <= CURRENT_TIMESTAMP').run();
  db.prepare(
    'INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)'
  ).run(tokenHash, userId, expiryTimestamp());
  return token;
}

export function requireAuthenticatedUser(req, res, next) {
  try {
    const token = getSessionToken(req);
    if (!token) {
      return res.status(401).json({ success: false, error: 'Authentication is required.' });
    }

    const session = db.prepare(`
      SELECT users.user_id, users.full_name, users.email
      FROM auth_sessions
      JOIN users ON users.user_id = auth_sessions.user_id
      WHERE auth_sessions.token_hash = ?
        AND auth_sessions.expires_at > CURRENT_TIMESTAMP
    `).get(hashToken(token));
    if (!session) {
      return res.status(401).json({ success: false, error: 'Authentication is required.' });
    }

    req.user = {
      user_id: session.user_id,
      name: session.full_name,
      email: session.email
    };
    req.csrfToken = csrfTokenFor(token);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)
      && !hasMatchingCsrfToken(req.csrfToken, req.get('x-csrf-token'))) {
      return res.status(403).json({ success: false, error: 'A valid CSRF token is required.' });
    }
    return next();
  } catch (error) {
    console.error('Error verifying authenticated session:', error);
    return res.status(500).json({ success: false, error: 'Unable to verify session.' });
  }
}

router.post('/register', async (req, res) => {
  try {
    const { fullName, email, password } = req.body || {};
    if (
      typeof fullName !== 'string'
      || fullName.trim().length < 2
      || fullName.trim().length > 120
      || typeof email !== 'string'
      || email.trim().length > 254
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      || typeof password !== 'string'
      || password.length < 12
      || password.length > 128
    ) {
      return res.status(400).json({
        success: false,
        error: 'Provide a valid full name, email address, and password of 12 to 128 characters.'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(normalizedEmail)) {
      return res.status(409).json({ success: false, error: 'Unable to register with those details.' });
    }
    const userId = `USR-${crypto.randomUUID()}`;
    const passwordHash = await hashPassword(password);
    const sessionToken = db.transaction(() => {
      db.prepare(`
        INSERT INTO users (user_id, full_name, email, password_hash)
        VALUES (?, ?, ?, ?)
      `).run(userId, fullName.trim(), normalizedEmail, passwordHash);
      return createSession(userId);
    })();
    setSessionCookie(res, sessionToken);

    return res.status(201).json({
      success: true,
      data: publicUser({ user_id: userId, full_name: fullName.trim(), email: normalizedEmail }),
      csrfToken: csrfTokenFor(sessionToken)
    });
  } catch (error) {
    console.error('Error registering user:', error);
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ success: false, error: 'Unable to register with those details.' });
    }
    return res.status(500).json({ success: false, error: 'Unable to register account.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
    const passwordMatches = await verifyPassword(password, user?.password_hash);
    if (!user || !passwordMatches) {
      return res.status(401).json({ success: false, error: 'Email or password is incorrect.' });
    }

    const sessionToken = createSession(user.user_id);
    setSessionCookie(res, sessionToken);
    return res.json({
      success: true,
      data: publicUser(user),
      csrfToken: csrfTokenFor(sessionToken)
    });
  } catch (error) {
    console.error('Error logging in:', error);
    return res.status(500).json({ success: false, error: 'Unable to log in.' });
  }
});

router.get('/me', requireAuthenticatedUser, (req, res) => {
  res.json({
    success: true,
    data: publicUser({
      user_id: req.user.user_id,
      full_name: req.user.name,
      email: req.user.email
    }),
    csrfToken: req.csrfToken
  });
});

router.post('/logout', requireAuthenticatedUser, (req, res) => {
  try {
    const token = getSessionToken(req);
    db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(hashToken(token));
    clearSessionCookie(res);
    return res.json({ success: true });
  } catch {
    console.error('Unable to revoke authenticated session during logout.');
    return res.status(500).json({ success: false, error: 'Unable to log out.' });
  }
});

export default router;
