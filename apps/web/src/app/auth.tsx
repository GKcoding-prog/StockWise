import type { PermissionKey } from '@stockwise/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, onSessionChange, refreshSession, setSession, type Session } from '@/lib/api';
import type { Me } from '@/lib/types';

type Status = 'loading' | 'anonymous' | 'authenticated';

interface AuthValue {
  status: Status;
  session: Session | null;
  me: Me | undefined;
  signIn: (session: Session) => void;
  signOut: () => Promise<void>;
  switchBusiness: (businessId: string) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setLocalSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    const off = onSessionChange((s) => {
      setLocalSession(s);
      setStatus(s ? 'authenticated' : 'anonymous');
    });
    // Silent refresh restores the session from the cookie after a reload.
    void refreshSession();
    return () => {
      off();
    };
  }, []);

  const businessId = session?.activeBusinessId ?? null;
  const meQuery = useQuery({
    queryKey: ['me', session?.user.id, businessId],
    queryFn: () => api<Me>('/me'),
    enabled: status === 'authenticated',
    staleTime: 60_000,
  });

  const signIn = useCallback(
    (s: Session) => {
      queryClient.clear();
      setSession(s);
    },
    [queryClient],
  );

  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setSession(null);
    queryClient.clear();
  }, [queryClient]);

  const switchBusiness = useCallback(
    async (id: string) => {
      const next = await api<Session>('/auth/switch-business', {
        method: 'POST',
        body: { businessId: id },
      });
      // Query keys are namespaced by business, but clear anyway so nothing stale can flash.
      queryClient.clear();
      setSession(next);
    },
    [queryClient],
  );

  const value = useMemo<AuthValue>(
    () => ({ status, session, me: meQuery.data, signIn, signOut, switchBusiness }),
    [status, session, meQuery.data, signIn, signOut, switchBusiness],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthValue {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** The loaded /me. Only call below <ProtectedRoute>, which waits for it. */
export function useMe(): Me {
  const { me } = useAuth();
  if (!me) throw new Error('useMe called before /me loaded');
  return me;
}

/** UX only: the API enforces every permission (docs/06 §1). */
export function useCan(): (permission: PermissionKey) => boolean {
  const { me } = useAuth();
  return useCallback((p: PermissionKey) => me?.permissions.includes(p) ?? false, [me]);
}

export function Can({ perm, children }: { perm: PermissionKey; children: ReactNode }) {
  return useCan()(perm) ? children : null;
}

/** Query-key prefix so cached data can never cross businesses. */
export function useBusinessKey(): string {
  const { session } = useAuth();
  return session?.activeBusinessId ?? 'none';
}
