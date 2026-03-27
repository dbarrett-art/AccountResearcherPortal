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

  const applySession = useCallback(async (sess: Session | null) => {
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
    let mounted = true;

    // Register listener first — supabase-js v2 replays current auth state
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, sess) => {
        if (mounted) applySession(sess);
      }
    );

    // Also explicitly check — handles cases where the event already fired
    // before our listener was registered (race with _initialize())
    const init = async () => {
      // Wait for supabase internal _initialize() to complete.
      // In v2, getSession() awaits the internal initialization lock,
      // so it returns the correct session even after hash processing.
      const { data: { session: sess } } = await supabase.auth.getSession();

      if (mounted) {
        if (sess) {
          applySession(sess);
        } else if (window.location.hash.includes('access_token')) {
          // Hash is present but getSession() returned null.
          // _initialize() may have failed or is somehow stuck.
          // Give it one more chance with a retry.
          setTimeout(async () => {
            if (!mounted) return;
            const { data: { session: retrySession } } = await supabase.auth.getSession();
            if (mounted) applySession(retrySession);
          }, 1000);
        } else {
          applySession(null);
        }
      }
    };

    init();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [applySession]);

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
