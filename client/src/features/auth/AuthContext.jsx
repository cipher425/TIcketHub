import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { http, refreshSession, setAccessToken, setSessionExpiredHandler } from '../../lib/api';
import { queryClient } from '../../lib/queryClient';
import { resetSocket } from '../../lib/socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // 'loading' until we know whether the refresh cookie gives us a session.
  const [state, setState] = useState({ status: 'loading', user: null });

  useEffect(() => {
    refreshSession()
      .then((d) => setState({ status: 'authenticated', user: d.user }))
      .catch(() => setState({ status: 'anonymous', user: null }));
    setSessionExpiredHandler(() => {
      setState({ status: 'anonymous', user: null });
      queryClient.clear();
    });
  }, []);

  const startSession = useCallback((data) => {
    setAccessToken(data.accessToken);
    resetSocket(); // reconnect with the new identity
    setState({ status: 'authenticated', user: data.user });
    return data.user;
  }, []);

  const login = useCallback(async (values) => startSession((await http.post('/auth/login', values)).data), [startSession]);
  const register = useCallback(async (values) => startSession((await http.post('/auth/register', values)).data), [startSession]);

  const logout = useCallback(async () => {
    try {
      await http.post('/auth/logout');
    } finally {
      setAccessToken(null);
      resetSocket();
      queryClient.clear();
      setState({ status: 'anonymous', user: null });
    }
  }, []);

  const reloadUser = useCallback(async () => {
    const { data } = await http.get('/auth/me');
    setState({ status: 'authenticated', user: data });
    return data;
  }, []);

  const value = useMemo(
    () => ({ ...state, isAuthenticated: state.status === 'authenticated', login, register, logout, reloadUser }),
    [state, login, register, logout, reloadUser]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
