import { resolveWorkspace, type CompanyPreferences, type Role, type SegmentConfig, PERMISSIONS } from '@nexo/shared';
import type { Db } from '../db/pool';
import type { MaybeCtx } from '../middleware/auth';

export async function getSegment(db: Db, key: string) {
  const r = await db.query(`SELECT key, name, icon, description, config FROM business_segments WHERE key = $1`, [key]);
  return r.rows[0] as { key: string; name: string; icon: string; description: string; config: SegmentConfig } | undefined;
}

export async function buildMe(db: Db, auth: MaybeCtx) {
  const companies = (await db.query(`SELECT * FROM list_user_companies()`)).rows;
  const base = { user: auth.user, companies, company: null, role: null, permissions: null, workspace: null, segment: null };
  if (!auth.company || !auth.role) return base;
  const segment = await getSegment(db, auth.company.segment_key);
  if (!segment) return base;
  const c = auth.company as any;
  const workspace = resolveWorkspace({
    segment: segment.config,
    goals: c.goals ?? [],
    difficulties: c.difficulties ?? [],
    preferences: (c.preferences ?? {}) as CompanyPreferences,
    role: auth.role as Role,
  });
  return {
    ...base,
    company: c,
    role: auth.role,
    employeeId: auth.employeeId,
    permissions: PERMISSIONS[auth.role as Role],
    workspace,
    segment: { key: segment.key, name: segment.name, icon: segment.icon, terms: segment.config.terms ?? {} },
  };
}
