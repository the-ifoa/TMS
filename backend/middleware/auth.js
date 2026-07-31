const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is required');

// ─────────────────────────────────────────────
//  JWT middleware — works for both admin & airline
// ─────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded; // contains id, email, name, role, and airlineName for airlines
    // DEBUG: Log decoded token for airline users
    if (decoded.role === 'airline') {
      console.log('DEBUG authMiddleware: Airline JWT decoded', {
        id: decoded.id,
        airlineName: decoded.airlineName,
        role: decoded.role,
      });
    }
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

// Admin-only middleware
function adminOnly(req, res, next) {
  if (req.admin?.role !== 'admin' && req.admin?.role !== 'Administrator') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

// Token auth variant used by the certificate routes: accepts the JWT via the
// normal Authorization header OR a ?token= query param, so a certificate PDF
// can be opened directly in a browser tab / <img> / download link where custom
// headers aren't possible.
function certAuth(req, res, next) {
  if (req.query.token && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  return authMiddleware(req, res, next);
}

module.exports = { authMiddleware, adminOnly, certAuth };
