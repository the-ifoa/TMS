const bcrypt = require('bcryptjs');
const Airline = require('../models/Airline');
const Admin = require('../models/Admin');

// ─── Secondary logins ──────────────────────────────────────────────────────────
// Extra email + password pairs that sign in to the SAME airline account. Only a
// top-level airline the admin has granted `can_have_secondary_logins` can have
// them, and only someone signed in with the PRIMARY credential can manage them
// (a secondary login can't add, change or remove logins).

// True when no admin, airline or secondary login already uses this email.
async function emailAvailable(email, { exceptSecondaryId = null } = {}) {
  if (await Admin.findOne({ email }).select('_id').lean()) return false;
  if (await Airline.findOne({ email }).select('_id').lean()) return false;
  const holder = await Airline.findOne({ 'secondary_logins.email': email }).select('secondary_logins').lean();
  if (!holder) return true;
  const hit = holder.secondary_logins.find((l) => l.email === email);
  return !!(hit && exceptSecondaryId && String(hit._id) === String(exceptSecondaryId));
}
exports.emailAvailable = emailAvailable;

async function loadOwner(req, res) {
  if (req.admin?.role !== 'airline') { res.status(403).json({ error: 'Airline access required.' }); return null; }
  if (req.admin.secondaryLoginId) {
    res.status(403).json({ error: 'Sign in with the main account credentials to manage additional logins.' }); return null;
  }
  const airline = await Airline.findById(req.admin.id);
  if (!airline || airline.parent_airline) { res.status(403).json({ error: 'Not available for this account.' }); return null; }
  if (!airline.can_have_secondary_logins) {
    res.status(403).json({ error: 'Additional logins are not enabled for your account. Ask an IFOA administrator.' }); return null;
  }
  return airline;
}

// Powers a limited login can be given, with the plain-language explanation the
// Profile page shows. `needs` = admin-granted airline flag the power depends on
// (hidden while that flag is off). Enforced by middleware/permissions.js
// (scope.loginPermissions) — except `dgr.view`, which only hides the menu entry.
const LOGIN_POWERS = [
  { key: 'participants.view',   group: 'Participants', label: 'View participants',   hint: 'See the Participants and My Submissions lists, and IFOA certificates.' },
  { key: 'participants.create', group: 'Participants', label: 'Add participants',    hint: 'Submit new enrollments.' },
  { key: 'participants.edit',   group: 'Participants', label: 'Edit participants',   hint: 'Change details of existing participants.' },
  { key: 'participants.delete', group: 'Participants', label: 'Delete participants', hint: 'Remove participants permanently.' },
  { key: 'exams.author', group: 'Exams', needs: 'can_author_exams', label: 'Create & edit exams',    hint: 'Build, publish and delete exams and their attempts.' },
  { key: 'exams.assign', group: 'Exams', needs: 'can_author_exams', label: 'Assign exams to people', hint: 'Assign exams and email exam links to candidates.' },
  { key: 'exams.grade',  group: 'Exams', needs: 'can_author_exams', label: 'Grade exam attempts',    hint: 'Mark written answers and finalise scores.' },
  { key: 'internalCerts.manage', group: 'Certificates', needs: 'can_upload_internal_certs', label: 'Upload internal certificates', hint: "Upload and delete the airline's own certificate PDFs per candidate." },
  { key: 'internalAssessments.manage', group: 'Certificates', needs: 'can_manage_internal_assessments', label: 'Manage internal assessments', hint: 'Create internal assessments, add candidates and upload their certificates.' },
  { key: 'dgr.view', group: 'Other', label: 'View DGR CBTA forms', hint: 'Open the DGR CBTA area.' },
  { key: 'team.manage', group: 'Other', needs: 'can_create_subusers', label: 'Manage departments', hint: 'Create department logins and set what each may do.' },
];

// Only these keys are ever withheld from a limited login; anything else (e.g.
// attendance) stays as open as it is for the main credential.
exports.LOGIN_POWER_KEYS = LOGIN_POWERS.map((p) => p.key);

const grantable = (airline) => LOGIN_POWERS.filter((p) => !p.needs || airline[p.needs]);

// Read `full_access` / `permissions` off a request body onto a login.
function applyAccess(login, body, airline) {
  if (typeof body.full_access === 'boolean') login.full_access = body.full_access;
  if (Array.isArray(body.permissions)) {
    const allowed = new Set(grantable(airline).map((p) => p.key));
    login.permissions = [...new Set(body.permissions)].filter((k) => allowed.has(k));
  }
}

const safe = (l) => ({
  id: String(l._id), email: l.email, label: l.label || '', created_at: l.created_at, last_login: l.last_login,
  full_access: l.full_access !== false, permissions: l.permissions || [],
});

// Powers this airline can hand to a limited login.
exports.powers = async (req, res) => {
  try {
    const airline = await loadOwner(req, res);
    if (!airline) return;
    res.json(grantable(airline).map(({ key, group, label, hint }) => ({ key, group, label, hint })));
  } catch (err) {
    console.error('GET secondary-logins/powers error:', err.message);
    res.status(500).json({ error: 'Server error.' });
  }
};

exports.list = async (req, res) => {
  try {
    const airline = await loadOwner(req, res);
    if (!airline) return;
    res.json(airline.secondary_logins.map(safe));
  } catch (err) {
    console.error('GET secondary-logins error:', err.message);
    res.status(500).json({ error: 'Server error.' });
  }
};

exports.create = async (req, res) => {
  try {
    const airline = await loadOwner(req, res);
    if (!airline) return;
    const email = String(req.body.email || '').toLowerCase().trim();
    const password = String(req.body.password || '');
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    if (airline.secondary_logins.length >= 10) return res.status(400).json({ error: 'You can add up to 10 additional logins.' });
    if (!(await emailAvailable(email))) return res.status(400).json({ error: 'This email is already used by another login.' });

    airline.secondary_logins.push({
      email, label: String(req.body.label || '').trim(), password: await bcrypt.hash(password, 12),
    });
    applyAccess(airline.secondary_logins[airline.secondary_logins.length - 1], req.body, airline);
    await airline.save();
    res.status(201).json(safe(airline.secondary_logins[airline.secondary_logins.length - 1]));
  } catch (err) {
    console.error('POST secondary-logins error:', err.message);
    res.status(500).json({ error: 'Server error.' });
  }
};

exports.update = async (req, res) => {
  try {
    const airline = await loadOwner(req, res);
    if (!airline) return;
    const login = airline.secondary_logins.id(req.params.id);
    if (!login) return res.status(404).json({ error: 'Login not found.' });
    if (req.body.label !== undefined) login.label = String(req.body.label || '').trim();
    applyAccess(login, req.body, airline);
    if (req.body.password) {
      if (String(req.body.password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
      login.password = await bcrypt.hash(String(req.body.password), 12);
    }
    await airline.save();
    res.json(safe(login));
  } catch (err) {
    console.error('PATCH secondary-logins error:', err.message);
    res.status(500).json({ error: 'Server error.' });
  }
};

exports.remove = async (req, res) => {
  try {
    const airline = await loadOwner(req, res);
    if (!airline) return;
    const login = airline.secondary_logins.id(req.params.id);
    if (!login) return res.status(404).json({ error: 'Login not found.' });
    login.deleteOne();
    await airline.save();
    res.json({ message: 'Login removed.' });
  } catch (err) {
    console.error('DELETE secondary-logins error:', err.message);
    res.status(500).json({ error: 'Server error.' });
  }
};
