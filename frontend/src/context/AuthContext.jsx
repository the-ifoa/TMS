import { createContext, useContext, useState, useEffect } from 'react';
import { getMe } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

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
        .then((res) => setAdmin(res.data))
        .catch(() => {
          localStorage.removeItem('token');
          setAdmin(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const loginAdmin = (token, adminData) => {
    localStorage.setItem('token', token);
    setAdmin(adminData);
  };

  const updateAdmin = (token, adminData) => {
    if (token) localStorage.setItem('token', token);
    setAdmin(adminData);
  };

  const logout = () => {
    localStorage.removeItem('token');
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
  const can = (perm) => {
    if (!admin) return false;
    if (isSuperAdmin) return true;
    if (isTopLevelAirline) return true;
    return permissions.includes(perm);
  };

  const canManageTeam = isSuperAdmin
    || (isTopLevelAirline && !!admin?.can_create_subusers)
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
