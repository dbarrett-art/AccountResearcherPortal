import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: 'ae' | 'manager' | 'admin';
  credits_remaining: number;
  manager_id: string | null;
  feedback_gate_enabled?: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userProfile: UserProfile | null;
  realUserProfile: UserProfile | null;
  isImpersonating: boolean;
  loading: boolean;
  authError: string | null;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearAuthError: () => void;
  impersonate: (profile: UserProfile) => void;
  stopImpersonating: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchOrCreateProfile(user: User): Promise<UserProfile | null> {
  // Try to fetch existing profile
  const { data, error } = await supabase
    .from('users')
    .select('id, email, name, role, credits_remaining, manager_id, feedback_gate_enabled')
    .eq('id', user.id)
    .single();

  if (data) return data as UserProfile;

  // If not found (PGRST116 = no rows), auto-provision
  if (error?.code === 'PGRST116') {
    const name = user.user_metadata?.name
      || user.email?.split('@')[0]
      || 'User';
    const { data: created, error: insertErr } = await supabase
      .from('users')
      .insert({
        id: user.id,
        email: user.email,
        name,
        role: 'ae',
        credits_remaining: 5,
      })
      .select('id, email, name, role, credits_remaining, manager_id, feedback_gate_enabled')
      .single();
    if (insertErr) {
      console.error('Failed to create user profile:', insertErr);
      return null;
    }
    return created as UserProfile;
  }

  // RLS or other error
  if (error) {
    console.error('Profile fetch error:', error);
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [impersonatedProfile, setImpersonatedProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const impersonate = useCallback((profile: UserProfile) => {
    setImpersonatedProfile(profile);
  }, []);

  const stopImpersonating = useCallback(() => {
    setImpersonatedProfile(null);
  }, []);

  const applySession = useCallback(async (sess: Session | null) => {
    if (sess?.user) {
      setUser(sess.user);
      setSession(sess);
      const profile = await fetchOrCreateProfile(sess.user);
      setUserProfile(profile);
      if (!profile) {
        setAuthError('Unable to load your profile. Please try signing out and back in.');
      }
    } else {
      setUser(null);
      setSession(null);
      setUserProfile(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, sess) => {
        if (mounted) applySession(sess);
      }
    );

    const init = async () => {
      const { data: { session: sess } } = await supabase.auth.getSession();
      if (mounted) {
        if (sess) {
          applySession(sess);
        } else if (window.location.hash.includes('access_token')) {
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
    setImpersonatedProfile(null);
    setAuthError(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) {
      const profile = await fetchOrCreateProfile(session.user);
      setUserProfile(profile);
    }
  }, [session]);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  return (
    <AuthContext.Provider value={{
      user, session,
      userProfile: impersonatedProfile || userProfile,
      realUserProfile: userProfile,
      isImpersonating: !!impersonatedProfile,
      loading, authError,
      signOut, refreshProfile, clearAuthError,
      impersonate, stopImpersonating,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
