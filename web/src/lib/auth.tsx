import { createContext, useContext } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { can, type AccessLevel, type ModuleKey, type ResolvedWorkspace, type Role } from '@nexo/shared';
import { api, ApiError } from './api';

export interface Me {
  user: { id: string; name: string; email: string; phone: string | null };
  companies: { company_id: string; name: string; segment_key: string; role: Role }[];
  company: null | {
    id: string; name: string; segment_key: string; custom_segment: string | null; timezone: string; city: string | null; state: string | null;
    goals: string[]; difficulties: string[]; preferences: Record<string, any>; opening_hours: Record<string, { open: string; close: string } | null>;
    [k: string]: any;
  };
  role: Role | null;
  employeeId?: string | null;
  permissions: Record<ModuleKey, AccessLevel> | null;
  workspace: ResolvedWorkspace | null;
  segment: { key: string; name: string; icon: string; terms: Record<string, string> } | null;
}

export function useMeQuery() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try { return (await api.get<{ data: Me }>('/auth/me')).data; }
      catch (e) { if (e instanceof ApiError && e.status === 401) return null; throw e; }
    },
    staleTime: 60_000,
    retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2,
  });
}

export const MeContext = createContext<Me | null>(null);
/** Usuário autenticado com empresa ativa (somente dentro da área logada). */
export function useMe() {
  const me = useContext(MeContext);
  if (!me || !me.company || !me.role) throw new Error('useMe fora da área autenticada');
  return me as Me & { company: NonNullable<Me['company']>; role: Role; workspace: ResolvedWorkspace; segment: NonNullable<Me['segment']> };
}
export function useCan() {
  const me = useMe();
  return (module: ModuleKey, level: 'read' | 'write' = 'read') => can(me.role, module, level);
}
export function useTimezone() {
  return useMe().company.timezone || 'America/Sao_Paulo';
}
export function useTerm(key: 'sale' | 'sales' | 'customer' | 'customers' | 'appointment', fallback: string) {
  const me = useContext(MeContext);
  return me?.segment?.terms?.[key] ?? fallback;
}
export function useRefreshMe() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['me'] });
}
