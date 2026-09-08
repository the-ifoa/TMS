// ─────────────────────────────────────────────────────────────────────────────
//  Permission catalog — shared by admin sub-users and airline sub-users
//  (departments). One flat catalog; the CEILING differs by who is granting:
//    • a top-level admin  can grant any of these to an admin sub-user
//    • a top-level airline can grant the airline-relevant subset to a department
//  See middleware/permissions.js for enforcement.
// ─────────────────────────────────────────────────────────────────────────────

// key → { label, group, scopes: ['admin' | 'airline'] }
const PERMISSIONS = {
  'participants.view':   { label: 'View participants',            group: 'Participants', scopes: ['admin', 'airline'] },
  'participants.create': { label: 'Add participants',             group: 'Participants', scopes: ['admin', 'airline'] },
  'participants.edit':   { label: 'Edit participants',            group: 'Participants', scopes: ['admin', 'airline'] },
  'participants.delete': { label: 'Delete participants',          group: 'Participants', scopes: ['admin', 'airline'] },

  'exams.author':        { label: 'Create & edit exams',         group: 'Exams',        scopes: ['admin', 'airline'] },
  'exams.assign':        { label: 'Assign exams to people',       group: 'Exams',        scopes: ['admin', 'airline'] },
  'exams.grade':         { label: 'Grade exam attempts',          group: 'Exams',        scopes: ['admin', 'airline'] },

  'attendance.view':     { label: 'View attendance',              group: 'Attendance',   scopes: ['admin'] },
  'attendance.manage':   { label: 'Manage attendance sheets',     group: 'Attendance',   scopes: ['admin'] },

  // ── Admin-only areas ──────────────────────────────────────────────────────
  'airlines.view':       { label: 'View airlines & submissions',  group: 'Airlines',      scopes: ['admin'] },
  'airlines.manage':     { label: 'Edit / delete airline accounts', group: 'Airlines',    scopes: ['admin'] },

  'certificates.generate': { label: 'Generate & revoke certificates', group: 'Certificates', scopes: ['admin'] },

  'contracts.manage':    { label: 'View & send contracts',         group: 'Contracts',     scopes: ['admin'] },

  'examResults.view':    { label: 'View exam result sheets',       group: 'Exam Results',  scopes: ['admin'] },
  'examResults.manage':  { label: 'Import / edit / issue results', group: 'Exam Results',  scopes: ['admin'] },

  'dgr.view':            { label: 'View DGR CBTA forms',           group: 'DGR CBTA',      scopes: ['admin'] },
  'dgr.manage':          { label: 'Create / edit / delete DGR forms', group: 'DGR CBTA',   scopes: ['admin'] },

  // Sub-user administration.
  'team.manage':         { label: 'Create & manage sub-users',    group: 'Team',         scopes: ['admin', 'airline'] },
};

const ALL_KEYS = Object.keys(PERMISSIONS);

const keysForScope = (scope) =>
  ALL_KEYS.filter((k) => PERMISSIONS[k].scopes.includes(scope));

// Grouped shape for the settings UI.
const catalogForScope = (scope) => {
  const out = {};
  keysForScope(scope).forEach((key) => {
    const { label, group } = PERMISSIONS[key];
    (out[group] = out[group] || []).push({ key, label });
  });
  return out;
};

// Clamp a requested permission list to what's valid for the scope AND to the
// granter's own ceiling. `granterCeiling` null/undefined = unrestricted.
const clampPermissions = (requested, scope, granterCeiling) => {
  const valid = new Set(keysForScope(scope));
  const ceiling = granterCeiling ? new Set(granterCeiling) : null;
  return [...new Set(requested || [])].filter(
    (k) => valid.has(k) && (!ceiling || ceiling.has(k)),
  );
};

module.exports = { PERMISSIONS, ALL_KEYS, keysForScope, catalogForScope, clampPermissions };
