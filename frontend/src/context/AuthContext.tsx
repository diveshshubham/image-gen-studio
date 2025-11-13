import React, { createContext, useCallback, useEffect, useState } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

type AuthContextType = {
  token: string | null;
  login: (email: string, password: string) => Promise<string>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));

  // keep localStorage in sync across tabs (optional)
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === 'token') setToken(e.newValue);
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const save = useCallback((t: string | null) => {
    if (t) localStorage.setItem('token', t);
    else localStorage.removeItem('token');
    setToken(t);
  }, []);

  const signup = useCallback(async (email: string, password: string) => {
    await axios.post(`${API}/auth/signup`, { email, password });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await axios.post(`${API}/auth/login`, { email, password });
    const t = res.data.token as string;
    save(t);
    return t;
  }, [save]);

  const logout = useCallback(() => {
    save(null);
  }, [save]);

  return (
    <AuthContext.Provider value={{ token, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
