import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: 'ae' | 'manager' | 'admin';
  credits_remaining: number;
  manager_id: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, name, role, credits_remaining, manager_id')
    .eq('id', userId)
    .single();
  if (error || !data) return null;
  return data as UserProfile;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (sess: Session | null) => {
    if (sess?.user) {
      setUser(sess.user);
      setSession(sess);
      const profile = await fetchProfile(sess.user.id);
      setUserProfile(profile);
    } else {
      setUser(null);
      setSession(null);
      setUserProfile(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Check if there's an auth token in the URL hash (magic link callback)
    const hasAuthHash = window.location.hash.includes('access_token');

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      loadProfile(s);
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      // If there's a hash token, wait for onAuthStateChange to handle it
      // instead of resolving with null immediately
      if (!s && hasAuthHash) return;
      loadProfile(s);
    });

    // Safety timeout: if hash processing hasn't resolved after 3s, stop loading
    let timeout: ReturnType<typeof setTimeout> | undefined;
    if (hasAuthHash) {
      timeout = setTimeout(() => setLoading(false), 3000);
    }

    return () => {
      subscription.unsubscribe();
      if (timeout) clearTimeout(timeout);
    };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setUserProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) {
      const profile = await fetchProfile(session.user.id);
      setUserProfile(profile);
    }
  }, [session]);

  return (
    <AuthContext.Provider value={{ user, session, userProfile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
