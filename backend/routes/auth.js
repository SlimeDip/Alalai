import express from 'express';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import rateLimit from 'express-rate-limit';
import db from '../database.js';

const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: { success: false, error: 'Too many login attempts. Please try again after 1 minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { success: false, error: 'Too many registration attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = express.Router();
const scrypt = promisify(crypto.scrypt);
const SESSION_COOKIE = 'tulong_bayan_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const HASH_BYTES = 64;

function publicUser(row) {
  const legacyParts = (row.full_name || '').trim().split(/\s+/).filter(Boolean);
  const firstName = row.first_name || legacyParts[0] || '';
  const lastName = row.last_name || (legacyParts.length > 1 ? legacyParts[legacyParts.length - 1] : '');
  const middleName = row.middle_name || (legacyParts.length > 2 ? legacyParts.slice(1, -1).join(' ') : '');
  return {
    id: row.user_id,
    name: row.full_name || [firstName, middleName, lastName].filter(Boolean).join(' '),
    firstName,
    middleName,
    lastName,
    email: row.email,
    mobile: row.mobile || '',
    province: row.province || '',
    cityMunicipality: row.city_municipality || '',
    barangay: row.barangay || '',
    purokStreet: row.purok_street || '',
    householdSize: row.household_size ?? '',
    civilStatus: row.civil_status || '',
    sex: row.sex || '',
    birthDate: row.birth_date || '',
    occupation: row.occupation || '',
    beneficiaryCategory: row.beneficiary_category || '',
    idNumber: row.valid_id_number || '',
    spouseName: row.spouse_name || '',
    childrenCount: row.children_count ?? ''
  };
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
      SELECT users.*, auth_sessions.created_at
      FROM auth_sessions
      JOIN users ON users.user_id = auth_sessions.user_id
      WHERE auth_sessions.token_hash = ?
        AND auth_sessions.expires_at > CURRENT_TIMESTAMP
    `).get(hashToken(token));
    if (!session) {
      return res.status(401).json({ success: false, error: 'Authentication is required.' });
    }

    // Sliding session renewal - refresh if past half TTL
    const halfTTL = SESSION_TTL_MS / 2;
    const sessionAge = Date.now() - new Date(session.created_at).getTime();
    if (sessionAge > halfTTL) {
      const newExpiry = new Date(Date.now() + SESSION_TTL_MS).toISOString();
      try {
        db.prepare('UPDATE auth_sessions SET expires_at = ? WHERE token_hash = ?').run(
          newExpiry.replace('T', ' ').slice(0, 19),
          hashToken(token)
        );
      } catch {}
      try {
        db.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?').run(newExpiry, token);
      } catch {}
      setSessionCookie(res, token);
    }

    req.user = {
      user_id: session.user_id,
      name: session.full_name,
      email: session.email,
      ...publicUser(session)
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

router.post('/register', registerLimiter, async (req, res) => {
  try {
    const {
      firstName = '', middleName = '', lastName = '', fullName,
      email, password, mobile = '', province = '', cityMunicipality = '',
      barangay = '', purokStreet = '', householdSize = '', civilStatus = '',
      sex = '', birthDate = '', occupation = '', beneficiaryCategory = '',
      idNumber = '', spouseName = '', childrenCount = ''
    } = req.body || {};
    const normalizedFirstName = typeof firstName === 'string' ? firstName.trim() : '';
    const normalizedMiddleName = typeof middleName === 'string' ? middleName.trim() : '';
    const normalizedLastName = typeof lastName === 'string' ? lastName.trim() : '';
    const composedName = [normalizedFirstName, normalizedMiddleName, normalizedLastName].filter(Boolean).join(' ');
    const nameForCompatibility = composedName || (typeof fullName === 'string' ? fullName.trim() : '');
    const optionalTextFields = {
      mobile, province, cityMunicipality, barangay, purokStreet, civilStatus,
      sex, birthDate, occupation, beneficiaryCategory, idNumber, spouseName
    };
    const normalizedOptionalTextFields = Object.fromEntries(
      Object.entries(optionalTextFields).map(([field, value]) => [field, typeof value === 'string' ? value.trim() : value])
    );
    const normalizedHouseholdSize = householdSize === '' || householdSize == null ? null : Number(householdSize);
    const normalizedChildrenCount = childrenCount === '' || childrenCount == null ? null : Number(childrenCount);
    if (
      nameForCompatibility.length < 2
      || nameForCompatibility.length > 120
      || (normalizedFirstName && normalizedFirstName.length < 2)
      || (normalizedLastName && normalizedLastName.length < 2)
      || typeof email !== 'string'
      || email.trim().length > 254
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      || Object.values(normalizedOptionalTextFields).some((value) => typeof value !== 'string' || value.length > 120)
      || (normalizedHouseholdSize != null
        && (!Number.isInteger(normalizedHouseholdSize) || normalizedHouseholdSize < 1 || normalizedHouseholdSize > 100))
      || (normalizedChildrenCount != null
        && (!Number.isInteger(normalizedChildrenCount) || normalizedChildrenCount < 0 || normalizedChildrenCount > 100))
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
        INSERT INTO users (
          user_id, full_name, first_name, middle_name, last_name, email, password_hash,
          mobile, province, city_municipality, barangay, purok_street, household_size,
          civil_status, sex, birth_date, occupation, beneficiary_category,
          valid_id_number, spouse_name, children_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId, nameForCompatibility, normalizedFirstName, normalizedMiddleName,
        normalizedLastName, normalizedEmail, passwordHash,
        normalizedOptionalTextFields.mobile, normalizedOptionalTextFields.province,
        normalizedOptionalTextFields.cityMunicipality, normalizedOptionalTextFields.barangay,
        normalizedOptionalTextFields.purokStreet, normalizedHouseholdSize,
        normalizedOptionalTextFields.civilStatus, normalizedOptionalTextFields.sex,
        normalizedOptionalTextFields.birthDate, normalizedOptionalTextFields.occupation,
        normalizedOptionalTextFields.beneficiaryCategory, normalizedOptionalTextFields.idNumber,
        normalizedOptionalTextFields.spouseName, normalizedChildrenCount
      );
      return createSession(userId);
    })();
    setSessionCookie(res, sessionToken);

    return res.status(201).json({
      success: true,
      data: publicUser({
        user_id: userId, full_name: nameForCompatibility,
        first_name: normalizedFirstName, middle_name: normalizedMiddleName,
        last_name: normalizedLastName, email: normalizedEmail,
        mobile: normalizedOptionalTextFields.mobile,
        province: normalizedOptionalTextFields.province,
        city_municipality: normalizedOptionalTextFields.cityMunicipality,
        barangay: normalizedOptionalTextFields.barangay,
        purok_street: normalizedOptionalTextFields.purokStreet,
        household_size: normalizedHouseholdSize,
        civil_status: normalizedOptionalTextFields.civilStatus,
        sex: normalizedOptionalTextFields.sex,
        birth_date: normalizedOptionalTextFields.birthDate,
        occupation: normalizedOptionalTextFields.occupation,
        beneficiary_category: normalizedOptionalTextFields.beneficiaryCategory,
        valid_id_number: normalizedOptionalTextFields.idNumber,
        spouse_name: normalizedOptionalTextFields.spouseName,
        children_count: normalizedChildrenCount
      }),
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

router.post('/login', loginLimiter, async (req, res) => {
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
  const user = db.prepare('SELECT * FROM users WHERE user_id = ?').get(req.user.user_id);
  res.json({
    success: true,
    data: publicUser(user),
    csrfToken: req.csrfToken
  });
});

router.patch('/me', requireAuthenticatedUser, (req, res) => {
  try {
    const body = req.body || {};
    const textFields = {
      first_name: body.firstName,
      middle_name: body.middleName,
      last_name: body.lastName,
      mobile: body.mobile,
      province: body.province,
      city_municipality: body.cityMunicipality,
      barangay: body.barangay,
      purok_street: body.purokStreet,
      civil_status: body.civilStatus,
      sex: body.sex,
      birth_date: body.birthDate,
      occupation: body.occupation,
      beneficiary_category: body.beneficiaryCategory,
      valid_id_number: body.idNumber,
      spouse_name: body.spouseName
    };
    if (typeof textFields.first_name !== 'string' || textFields.first_name.trim().length < 2
      || typeof textFields.last_name !== 'string' || textFields.last_name.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'First and last names must be at least 2 characters.' });
    }
    if (typeof textFields.mobile !== 'string' || textFields.mobile.trim().length > 40) {
      return res.status(400).json({ success: false, error: 'Please provide a valid contact number.' });
    }
    for (const [field, value] of Object.entries(textFields)) {
      if (field !== 'mobile' && value != null && typeof value !== 'string') {
        return res.status(400).json({ success: false, error: 'Profile fields must contain text values.' });
      }
    }
    const householdSize = body.householdSize === '' || body.householdSize == null
      ? null
      : Number(body.householdSize);
    const childrenCount = body.childrenCount === '' || body.childrenCount == null
      ? null
      : Number(body.childrenCount);
    if ((householdSize != null && (!Number.isInteger(householdSize) || householdSize < 1 || householdSize > 100))
      || (childrenCount != null && (!Number.isInteger(childrenCount) || childrenCount < 0 || childrenCount > 100))) {
      return res.status(400).json({ success: false, error: 'Household and children counts must be valid numbers.' });
    }
    db.prepare(`
      UPDATE users SET
        full_name = @full_name, first_name = @first_name, middle_name = @middle_name,
        last_name = @last_name, mobile = @mobile, province = @province,
        city_municipality = @city_municipality, barangay = @barangay,
        purok_street = @purok_street, household_size = @household_size,
        civil_status = @civil_status, sex = @sex, birth_date = @birth_date,
        occupation = @occupation, beneficiary_category = @beneficiary_category,
        valid_id_number = @valid_id_number, spouse_name = @spouse_name,
        children_count = @children_count, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = @user_id
    `).run({
      ...Object.fromEntries(Object.entries(textFields).map(([key, value]) => [key, value?.trim() || ''])),
      full_name: [textFields.first_name, textFields.middle_name, textFields.last_name]
        .filter(Boolean).join(' '),
      household_size: householdSize,
      children_count: childrenCount,
      user_id: req.user.user_id
    });
    const user = db.prepare('SELECT * FROM users WHERE user_id = ?').get(req.user.user_id);
    return res.json({ success: true, data: publicUser(user) });
  } catch (error) {
    console.error('Error updating user profile:', error);
    return res.status(500).json({ success: false, error: 'Unable to update profile.' });
  }
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
