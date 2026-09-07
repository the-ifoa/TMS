// ─────────────────────────────────────────────────────────────────────────────
//  Permission / scope middleware
//
//  loadScope        — attaches req.scope, derived from the JWT claims + a light
//                     DB lookup for an airline's child departments. Safe to run
//                     after authMiddleware on any authenticated route.
//  requirePermission — route guard: `requirePermission('exams.author')`.
//
//  Access rules
//  ------------
//   • super admin  (role admin/Administrator, no parent_admin)  → everything
//   • sub-admin     → only its granted `permissions`
//   • top-level airline (no parent_airline)                     → every
//                     airline-scoped permission, and sees all its departments
//   • department (airline sub-user)                             → only its
//                     granted `permissions`, sees only its own data (results
//                     of other departments only with results.viewAll)
// ─────────────────────────────────────────────────────────────────────────────
const Airline = require('../models/Airline');
const Admin = require('../models/Admin');

function isAdminRole(role) {
  return role === 'admin' || role === 'Administrator';
}

async function loadScope(req, _res, next) {
  const c = req.admin || {};
  try {
    if (isAdminRole(c.role)) {
      const isSuperAdmin = !c.parentAdmin;
      // A sub-admin's granted permissions can change after the token was issued —
      // read them live from the DB so edits take effect without a re-login.
      let permissions = c.permissions || [];
      if (!isSuperAdmin) {
        const me = await Admin.findById(c.id).select('permissions account_status').lean();
        if (me) {
          if (me.account_status === 'disabled') {
            return _res.status(403).json({ error: 'This account has been disabled.' });
          }
          permissions = me.permissions || [];
        }
      }
      req.scope = {
        kind: 'admin',
        adminId: c.id,
        isSuperAdmin,
        permissions,
        canManageTeam: isSuperAdmin || permissions.includes('team.manage'),
      };
      return next();
    }

    // Airline side ------------------------------------------------------------
    const isDepartment = !!c.parentAirline;
    const topAirlineId = String(c.topAirlineId || c.parentAirline || c.id);
    let permissions = c.permissions || [];

    // A department's granted permissions / status can change after its token was
    // issued — read them live so an admin/airline edit applies without re-login.
    if (isDepartment) {
      const me = await Airline.findById(c.id).select('permissions account_status parent_airline').lean();
      if (me) {
        if (me.account_status === 'disabled') {
          return _res.status(403).json({ error: 'This account has been disabled.' });
        }
        permissions = me.permissions || [];
      }
    }

    // Department ids that belong to this airline tree (used for "see all").
    const siblings = await Airline.find({ parent_airline: topAirlineId })
      .select('_id')
      .lean();
    const departmentIds = siblings.map((d) => String(d._id));

    // A top-level airline may only manage sub-users / see all department results
    // if an admin granted it.
    let topCanCreateSubusers = false;
    let topCanViewAllResults = false;
    if (!isDepartment) {
      const me = await Airline.findById(c.id).select('can_create_subusers can_view_all_results').lean();
      topCanCreateSubusers = !!me?.can_create_subusers;
      topCanViewAllResults = !!me?.can_view_all_results;
    }

    let visibleAirlineIds;
    if (!isDepartment) {
      // Top-level account: its own data + every department's data.
      visibleAirlineIds = [topAirlineId, ...departmentIds];
    } else if (permissions.includes('results.viewAll')) {
      // Department granted cross-department visibility: the whole airline tree.
      visibleAirlineIds = [topAirlineId, ...departmentIds];
    } else {
      // Plain department: its own data + the shared parent airline account's
      // data (same airline), but NOT sibling departments'.
      visibleAirlineIds = [...new Set([String(c.id), topAirlineId])];
    }

    req.scope = {
      kind: 'airline',
      selfId: String(c.id),
      isDepartment,
      isTopLevel: !isDepartment,
      topAirlineId,
      departmentIds,
      permissions,
      visibleAirlineIds,
      topCanCreateSubusers,
      // Can this request see exam results beyond its own account?
      //  • department  → only with the results.viewAll grant
      //  • top-level   → only when an admin flipped can_view_all_results on
      canViewAllResults: isDepartment
        ? permissions.includes('results.viewAll')
        : topCanViewAllResults,
      canManageTeam: isDepartment
        ? permissions.includes('team.manage')
        : topCanCreateSubusers,
    };
    return next();
  } catch (err) {
    console.error('loadScope error:', err.message);
    req.scope = { kind: isAdminRole(c.role) ? 'admin' : 'airline' };
    return next();
  }
}

// Does the current request satisfy at least one of `keys`?
function hasPermission(req, keys) {
  const s = req.scope || {};
  const list = Array.isArray(keys) ? keys : [keys];
  if (s.kind === 'admin') {
    if (s.isSuperAdmin) return true;
    return list.some((k) => (s.permissions || []).includes(k));
  }
  if (s.kind === 'airline') {
    if (s.isTopLevel) return true; // implicit full airline access
    return list.some((k) => (s.permissions || []).includes(k));
  }
  return false;
}

function requirePermission(...keys) {
  return (req, res, next) => {
    if (!req.scope) {
      return res.status(500).json({ error: 'Scope not loaded. loadScope must run first.' });
    }
    if (hasPermission(req, keys)) return next();
    return res.status(403).json({ error: 'You do not have permission to do that.' });
  };
}

// Team management needs an explicit grant even for a top-level airline
// (an admin flips can_create_subusers). Super admins always pass.
function requireTeamAccess(req, res, next) {
  if (!req.scope) return res.status(500).json({ error: 'Scope not loaded.' });
  if (req.scope.canManageTeam) return next();
  return res.status(403).json({ error: 'Sub-user management is not enabled for your account.' });
}

module.exports = { loadScope, requirePermission, requireTeamAccess, hasPermission, isAdminRole };
