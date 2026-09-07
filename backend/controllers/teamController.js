// ─────────────────────────────────────────────────────────────────────────────
//  Team / sub-user management
//
//  Two creators, two ceilings:
//   • A top-level ADMIN   creates sub-admins (admin scope) and airline sub-users
//     / departments (airline scope). A sub-admin may do the same but only within
//     its own granted permissions.
//   • A top-level AIRLINE (with can_create_subusers) — or a department with
//     team.manage — creates departments under its own airline tree, granting a
//     subset of its OWN effective permissions.
// ─────────────────────────────────────────────────────────────────────────────
const Admin = require('../models/Admin');
const Airline = require('../models/Airline');
const { catalogForScope, clampPermissions, keysForScope } = require('../config/permissions');

// Effective permission ceiling for the caller, per target scope.
// Returns null when unrestricted (super admin / top-level airline).
function ceilingFor(req, targetScope) {
  const s = req.scope;
  if (s.kind === 'admin') return s.isSuperAdmin ? null : (s.permissions || []);
  // airline caller
  if (s.isTopLevel) return null;
  return s.permissions || [];
}

function canManage(req, targetScope) {
  const s = req.scope;
  if (s.kind === 'admin') {
    if (s.isSuperAdmin) return true;
    return (s.permissions || []).includes('team.manage');
  }
  // airline caller
  if (targetScope !== 'airline') return false;
  if (s.isTopLevel) return true; // gated again below by can_create_subusers
  return (s.permissions || []).includes('team.manage');
}

// ─── GET /api/team/catalog — grantable permissions for this caller ────────────
exports.catalog = async (req, res) => {
  const s = req.scope;
  const scopesAllowed = s.kind === 'admin' ? ['admin', 'airline'] : ['airline'];
  const out = {};
  for (const sc of scopesAllowed) {
    let groups = catalogForScope(sc);
    const ceiling = ceilingFor(req, sc);
    if (ceiling) {
      const set = new Set(ceiling);
      groups = Object.fromEntries(
        Object.entries(groups)
          .map(([g, items]) => [g, items.filter((i) => set.has(i.key))])
          .filter(([, items]) => items.length),
      );
    }
    out[sc] = groups;
  }
  res.json({ catalog: out });
};

// ─── GET /api/team/airlines — top-level airlines (admin: dept parent picker) ──
exports.airlines = async (req, res) => {
  if (req.scope.kind !== 'admin')
    return res.status(403).json({ error: 'Admin only.' });
  const airlines = await Airline.find({ parent_airline: null, emailVerified: true })
    .select('_id airlineName email can_create_subusers')
    .sort({ airlineName: 1 })
    .lean();
  res.json(airlines.map((a) => ({ ...a, _id: String(a._id) })));
};

// ─── GET /api/team/members — sub-users this caller manages ───────────────────
exports.list = async (req, res) => {
  const s = req.scope;
  try {
    if (s.kind === 'admin') {
      const adminQ = s.isSuperAdmin ? { parent_admin: { $ne: null } } : { parent_admin: s.adminId };
      const airlineQ = s.isSuperAdmin
        ? { created_by_admin: { $ne: null } }
        : { created_by_admin: s.adminId };
      const [subAdmins, deptUsers] = await Promise.all([
        Admin.find(adminQ).sort({ createdAt: -1 }),
        Airline.find(airlineQ).sort({ createdAt: -1 }),
      ]);
      return res.json({
        subAdmins: subAdmins.map((a) => ({ ...a.toJSON(), memberScope: 'admin' })),
        departments: deptUsers.map((a) => ({ ...a.toJSON(), memberScope: 'airline' })),
      });
    }

    // airline caller — its own departments
    const depts = await Airline.find({ parent_airline: s.topAirlineId })
      .sort({ createdAt: -1 });
    return res.json({
      subAdmins: [],
      departments: depts.map((a) => ({ ...a.toJSON(), memberScope: 'airline' })),
    });
  } catch (err) {
    console.error('GET /team/members error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /api/team/members — create a sub-user ──────────────────────────────
exports.create = async (req, res) => {
  const s = req.scope;
  try {
    const {
      scope: targetScope, name, email, password,
      permissions = [], parentAirlineId, department_name,
    } = req.body;

    if (!['admin', 'airline'].includes(targetScope))
      return res.status(400).json({ error: 'scope must be "admin" or "airline".' });
    if (!name || !email || !password)
      return res.status(400).json({ error: 'Name, email and password are required.' });
    if (String(password).length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    if (!canManage(req, targetScope))
      return res.status(403).json({ error: 'You cannot create this kind of user.' });

    const cleanPerms = clampPermissions(permissions, targetScope, ceilingFor(req, targetScope));
    const lowerEmail = String(email).toLowerCase().trim();

    // ── Admin sub-user ──────────────────────────────────────────────────────
    if (targetScope === 'admin') {
      if (s.kind !== 'admin')
        return res.status(403).json({ error: 'Only admins can create admin sub-users.' });
      if (await Admin.findOne({ email: lowerEmail }))
        return res.status(400).json({ error: 'An admin with this email already exists.' });
      const doc = await Admin.create({
        name: name.trim(),
        email: lowerEmail,
        password,
        role: 'Administrator',
        parent_admin: s.adminId,
        permissions: cleanPerms,
      });
      return res.status(201).json({ member: { ...doc.toJSON(), memberScope: 'admin' } });
    }

    // ── Airline sub-user / department ───────────────────────────────────────
    let topAirlineId;
    if (s.kind === 'admin') {
      if (!parentAirlineId)
        return res.status(400).json({ error: 'parentAirlineId is required for an airline sub-user.' });
      const parent = await Airline.findById(parentAirlineId);
      if (!parent || parent.parent_airline)
        return res.status(400).json({ error: 'Parent airline not found or is itself a department.' });
      topAirlineId = String(parent._id);
    } else {
      // airline caller
      if (s.isTopLevel) {
        const me = await Airline.findById(s.selfId).select('can_create_subusers');
        if (!me?.can_create_subusers)
          return res.status(403).json({ error: 'Your airline has not been granted sub-user creation.' });
      }
      topAirlineId = s.topAirlineId;
    }

    if (await Airline.findOne({ email: lowerEmail }))
      return res.status(400).json({ error: 'An account with this email already exists.' });

    const parentDoc = await Airline.findById(topAirlineId).select('airlineName logo_url');
    const doc = await Airline.create({
      name: name.trim(),
      airlineName: parentDoc?.airlineName || name.trim(),
      email: lowerEmail,
      password,
      role: 'airline',
      emailVerified: true,
      parent_airline: topAirlineId,
      is_department: true,
      department_name: (department_name || name).trim(),
      // Departments inherit the parent airline's logo by default; the department
      // (or an admin) can change it later from Profile.
      logo_url: parentDoc?.logo_url || null,
      permissions: cleanPerms,
      can_author_exams: cleanPerms.includes('exams.author'),
      created_by_admin: s.kind === 'admin' ? s.adminId : null,
      created_by_airline: s.kind === 'airline' ? s.selfId : null,
    });
    return res.status(201).json({ member: { ...doc.toJSON(), memberScope: 'airline' } });
  } catch (err) {
    console.error('POST /team/members error:', err.message);
    const msg = err.code === 11000 ? 'That email is already in use.' : err.message;
    res.status(err.code === 11000 ? 400 : 500).json({ error: msg });
  }
};

// Locate a managed member + verify the caller owns it. Returns { doc, scope }.
async function findManaged(req, id) {
  const s = req.scope;
  const admin = await Admin.findById(id).catch(() => null);
  if (admin) {
    if (s.kind !== 'admin') return null;
    if (!s.isSuperAdmin && String(admin.parent_admin) !== String(s.adminId)) return null;
    if (!admin.parent_admin) return null; // never touch a top-level admin here
    return { doc: admin, scope: 'admin' };
  }
  const air = await Airline.findById(id).catch(() => null);
  if (air) {
    if (!air.parent_airline) return null; // never a top-level airline
    if (s.kind === 'admin') {
      if (!s.isSuperAdmin && String(air.created_by_admin) !== String(s.adminId)) return null;
    } else {
      if (String(air.parent_airline) !== String(s.topAirlineId)) return null;
      if (!s.isTopLevel && !(s.permissions || []).includes('team.manage')) return null;
    }
    return { doc: air, scope: 'airline' };
  }
  return null;
}

// ─── PATCH /api/team/members/:id ────────────────────────────────────────────
exports.update = async (req, res) => {
  try {
    const found = await findManaged(req, req.params.id);
    if (!found) return res.status(404).json({ error: 'Member not found or not yours to manage.' });
    const { doc, scope } = found;

    const { name, password, permissions, account_status, department_name } = req.body;
    if (name && name.trim()) doc.name = name.trim();
    if (password) {
      if (String(password).length < 6)
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
      doc.password = password;
    }
    if (Array.isArray(permissions)) {
      doc.permissions = clampPermissions(permissions, scope, ceilingFor(req, scope));
      if (scope === 'airline') doc.can_author_exams = doc.permissions.includes('exams.author');
    }
    if (account_status && ['active', 'disabled'].includes(account_status))
      doc.account_status = account_status;
    if (scope === 'airline' && department_name !== undefined)
      doc.department_name = (department_name || '').trim();

    await doc.save();
    res.json({ member: { ...doc.toJSON(), memberScope: scope } });
  } catch (err) {
    console.error('PATCH /team/members error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── DELETE /api/team/members/:id ──────────────────────────────────────────
exports.remove = async (req, res) => {
  try {
    const found = await findManaged(req, req.params.id);
    if (!found) return res.status(404).json({ error: 'Member not found or not yours to manage.' });
    await found.doc.deleteOne();
    res.json({ message: 'Member removed.' });
  } catch (err) {
    console.error('DELETE /team/members error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// NOTE: departments no longer share a participant pool with the main airline.
// Each department builds its own separate list by submitting enrollments while
// logged in (see participantsController.resolveOwnerOnCreate), so the old
// "assign participants to a department" endpoints have been removed.

module.exports.keysForScope = keysForScope;
