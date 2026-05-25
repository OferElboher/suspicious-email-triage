import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getJson, getStoredToken, postJson, setStoredToken } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return null;
    }
    try {
      const data = await getJson("/auth/me");
      setUser(data.user);
      return data.user;
    } catch (err) {
      if (err.unauthorized) {
        setStoredToken(null);
      }
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProfile().catch(() => setLoading(false));
  }, [refreshProfile]);

  const login = useCallback(async (email, password) => {
    const data = await postJson("/auth/login", { email, password }, { auth: false });
    setStoredToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    setStoredToken(null);
    setUser(null);
  }, []);

  const hasPermission = useCallback(
    (permission) => Boolean(user?.permissions?.includes(permission)),
    [user]
  );

  const hasRole = useCallback(
    (role) => Boolean(user?.roles?.includes(role)),
    [user]
  );

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      refreshProfile,
      hasPermission,
      hasRole,
      isAuthenticated: Boolean(user),
    }),
    [user, loading, login, logout, refreshProfile, hasPermission, hasRole]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
