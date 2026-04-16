/**
 * Auth Context — manages login state across the app.
 */
import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

// Role hierarchy (higher index = more permissions)
const ROLE_HIERARCHY = ['EMPLOYEE', 'MANAGER', 'HR_MANAGER', 'SUPER_ADMIN'];

// Roles that have a dual portal (personal + managerial)
const DUAL_PORTAL_ROLES = ['MANAGER', 'HR_MANAGER'];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // 'managerial' | 'personal' — persisted in sessionStorage so page refresh keeps it
  const [portalMode, setPortalModeState] = useState(() => {
    return sessionStorage.getItem('eraots_portal_mode') || 'managerial';
  });

  useEffect(() => {
    const token = localStorage.getItem('eraots_token');
    if (token) {
      authAPI.getMe()
        .then(res => setUser(res.data))
        .catch(() => {
          localStorage.removeItem('eraots_token');
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const res = await authAPI.login(email, password);
    const { access_token } = res.data;
    localStorage.setItem('eraots_token', access_token);
    
    // Fetch full user info
    const meRes = await authAPI.getMe();
    const userData = meRes.data;
    setUser(userData);

    // Default portal mode based on role
    const defaultMode = DUAL_PORTAL_ROLES.includes(userData.role) ? 'managerial' : 'personal';
    setPortalModeState(defaultMode);
    sessionStorage.setItem('eraots_portal_mode', defaultMode);
    
    return userData;
  };

  const logout = () => {
    localStorage.removeItem('eraots_token');
    sessionStorage.removeItem('eraots_portal_mode');
    setUser(null);
  };

  const refreshUser = async () => {
    const meRes = await authAPI.getMe();
    setUser(meRes.data);
    return meRes.data;
  };

  const setPortalMode = (mode) => {
    setPortalModeState(mode);
    sessionStorage.setItem('eraots_portal_mode', mode);
  };

  const togglePortalMode = () => {
    const next = portalMode === 'managerial' ? 'personal' : 'managerial';
    setPortalMode(next);
  };

  // Role helper functions
  const roleHelpers = useMemo(() => {
    const role = user?.role || 'EMPLOYEE';
    const roleIndex = ROLE_HIERARCHY.indexOf(role);
    
    return {
      // Check if user has exact role
      hasRole: (roleName) => user?.role === roleName,
      
      // Check if user has at least this role level
      hasMinRole: (minRole) => {
        const minIndex = ROLE_HIERARCHY.indexOf(minRole);
        return roleIndex >= minIndex;
      },
      
      // Quick role checks
      isEmployee: role === 'EMPLOYEE',
      isDeptManager: role === 'MANAGER',
      isManager: role === 'MANAGER' || user?.is_manager,
      isHR: role === 'HR_MANAGER',
      isSuperAdmin: role === 'SUPER_ADMIN',
      isAdmin: roleIndex >= ROLE_HIERARCHY.indexOf('HR_MANAGER'),
      
      // Dual portal eligibility
      hasDualPortal: DUAL_PORTAL_ROLES.includes(role),
      
      // Check specific permission
      hasPermission: (permission) => {
        const perms = user?.permissions || {};
        return perms.all === true || perms[permission] === true;
      },
      
      // Get managed department (for managers)
      getManagedDepartmentId: () => user?.managed_department_id,
    };
  }, [user]);

  return (
    <AuthContext.Provider value={{ 
      user, 
      login, 
      logout, 
      loading, 
      refreshUser,
      portalMode,
      setPortalMode,
      togglePortalMode,
      ...roleHelpers 
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

