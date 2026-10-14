import { createContext, useContext, useState, useEffect } from 'react';
import { getMe } from '../api';

const AuthContext = createContext(null);

// Last /me response, cached so a reload can render the app straight away
// instead of blocking on a full-screen spinner until /me answers. /me still
// runs on every load and replaces it; the server enforces permissions anyway.
const USER_CACHE_KEY = 'authUser';

function readCachedUser() {
  try {
    if (!localStorage.getItem('token')) return null;
    const raw = localStorage.getItem(USER_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCachedUser(user) {
  try {
    if (user) localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_CACHE_KEY);
  } catch { /* storage unavailable — cache is optional */ }
}

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(readCachedUser);
  // Only block rendering when there is a token but nothing cached to show yet.
  const [loading, setLoading] = useState(() => !!localStorage.getItem('token') && !readCachedUser());

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      // Decode role from JWT payload (no verify — just read claims)
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        // Pre-set role from token so UI renders correctly before /me resolves
        if (payload?.role) {
          setAdmin((prev) => prev ? prev : { role: payload.role });
        }
      } catch { /* ignore decode errors */ }

      getMe()
        .then((res) => {
          setAdmin(res.data);
          writeCachedUser(res.data);
        })
        .catch(() => {
          localStorage.removeItem('token');
          writeCachedUser(null);
          setAdmin(null);
        })
        .finally(() => setLoading(false));
    } else {
      writeCachedUser(null);
      setLoading(false);
    }
  }, []);

  const loginAdmin = (token, adminData) => {
    localStorage.setItem('token', token);
    writeCachedUser(adminData);
    setAdmin(adminData);
  };

  const updateAdmin = (token, adminData) => {
    if (token) localStorage.setItem('token', token);
    writeCachedUser(adminData);
    setAdmin(adminData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    writeCachedUser(null);
    setAdmin(null);
  };

  const isAdmin   = admin?.role === 'admin' || admin?.role === 'Administrator';
  const isAirline = admin?.role === 'airline';

  // ── Sub-user / department awareness ───────────────────────────────────────
  const isSubAdmin        = isAdmin   && !!admin?.parent_admin;
  const isSuperAdmin      = isAdmin   && !admin?.parent_admin;
  const isDepartment      = isAirline && !!admin?.parent_airline;
  const isTopLevelAirline = isAirline && !admin?.parent_airline;
  const permissions       = Array.isArray(admin?.permissions) ? admin.permissions : [];

  // can(perm) — a top-level admin or top-level airline implicitly has everything
  // in their own realm; sub-users are limited to their granted permission keys.
  // Airline keys that also need an admin switch on the (parent) airline — for a
  // department, /me reports the parent's switch in the same field.
  const ADMIN_GATED = {
    'internalCerts.manage': 'can_upload_internal_certs',
    'internalAssessments.manage': 'can_manage_internal_assessments',
  };
  const can = (perm) => {
    if (!admin) return false;
    if (isSuperAdmin) return true;
    if (isAirline && ADMIN_GATED[perm] && !admin[ADMIN_GATED[perm]]) return false;
    // An additional login the airline limited holds only its ticked powers.
    // Powers outside the tickable list (login_power_keys) are never withheld.
    if (isTopLevelAirline && admin.login_restricted && (admin.login_power_keys || []).includes(perm)) {
      return (admin.login_permissions || []).includes(perm);
    }
    if (isTopLevelAirline) return true;
    return permissions.includes(perm);
  };

  const canManageTeam = isSuperAdmin
    || (isTopLevelAirline && !!admin?.can_create_subusers
      && (!admin.login_restricted || (admin.login_permissions || []).includes('team.manage')))
    || permissions.includes('team.manage');

  return (
    <AuthContext.Provider value={{
      admin, loading, loginAdmin, updateAdmin, logout,
      isAdmin, isAirline,
      isSubAdmin, isSuperAdmin, isDepartment, isTopLevelAirline,
      permissions, can, canManageTeam,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
