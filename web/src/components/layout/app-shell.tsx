import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Bell, Building2, ChevronDown, ChevronRight, LogOut, Menu as MenuIcon, Search, Settings, Star, UserRound, X } from 'lucide-react';
import { GROUP_LABELS, MODULES, ROLE_LABELS, type ModuleGroup, type ModuleKey } from '@nexo/shared';
import { api } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { Icon } from '@/lib/icons';
import { cn, relativeTime } from '@/lib/utils';
import { Avatar, Badge, Menu } from '@/components/ui';
import { Logo } from './logo';

function NavItem({ k, onNavigate, compact }: { k: ModuleKey; onNavigate?: () => void; compact?: boolean }) {
  const m = MODULES[k];
  return (
    <NavLink to={m.path} end={k === 'dashboard'} onClick={onNavigate}
      className={({ isActive }) => cn('group flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors',
        isActive ? 'bg-white/10 text-white shadow-[inset_2px_0_0_var(--color-accent-400)]' : 'text-brand-100/75 hover:bg-white/5 hover:text-white', compact && 'py-1.5')}>
      {({ isActive }) => (<>
        <Icon name={m.icon} className={cn('size-[18px] shrink-0', isActive ? 'text-accent-400' : 'text-brand-300/70 group-hover:text-brand-200')} />
        <span className="truncate">{m.label}</span>
      </>)}
    </NavLink>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const me = useMe();
  const ws = me.workspace;
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const others = useMemo(() => {
    const g: Partial<Record<ModuleGroup, ModuleKey[]>> = {};
    for (const k of ws.otherModules) (g[MODULES[k].group] ??= []).push(k);
    return g;
  }, [ws.otherModules]);
  const location = useLocation();
  return (
    <nav className="flex h-full flex-col bg-brand-950 text-white" aria-label="Menu principal">
      <div className="flex h-16 shrink-0 items-center px-5"><Link to="/app" onClick={onNavigate}><Logo light size={30} /></Link></div>
      <div className="flex-1 space-y-6 overflow-y-auto px-3 pb-6 pt-2 scrollbar-thin [scrollbar-color:rgb(255_255_255/0.15)_transparent]">
        <div className="space-y-0.5">
          <NavItem k="dashboard" onNavigate={onNavigate} />
          <NavItem k="dicas" onNavigate={onNavigate} />
        </div>
        {ws.favorites.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-brand-300/60"><Star className="size-3" /> Favoritos</p>
            <div className="space-y-0.5">{ws.favorites.map((k) => <NavItem key={k} k={k} onNavigate={onNavigate} />)}</div>
          </div>
        )}
        <div>
          <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-accent-400/90">Principais para seu negócio</p>
          <div className="space-y-0.5">{ws.priorityModules.filter((k) => !ws.favorites.includes(k)).map((k) => <NavItem key={k} k={k} onNavigate={onNavigate} />)}</div>
        </div>
        <div>
          <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-brand-300/60">Outros módulos</p>
          {(Object.keys(others) as ModuleGroup[]).map((g) => {
            const items = others[g]!.filter((k) => !ws.favorites.includes(k));
            if (!items.length) return null;
            const active = items.some((k) => location.pathname.startsWith(MODULES[k].path));
            const open = openGroups[g] ?? active;
            return (
              <div key={g}>
                <button type="button" onClick={() => setOpenGroups((s) => ({ ...s, [g]: !open }))} aria-expanded={open}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[13px] font-medium text-brand-200/60 hover:text-brand-100">
                  {GROUP_LABELS[g]}<ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
                </button>
                {open && <div className="ml-2 space-y-0.5 border-l border-white/10 pl-1">{items.map((k) => <NavItem key={k} k={k} onNavigate={onNavigate} compact />)}</div>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="border-t border-white/10 p-3"><NavItem k="configuracoes" onNavigate={onNavigate} /></div>
    </nav>
  );
}

function Notifications() {
  const { data } = useQuery({ queryKey: ['notifications'], queryFn: () => api.get<{ data: any[] }>('/notifications'), refetchInterval: 120_000 });
  const items = data?.data ?? [];
  const critical = items.filter((i) => i.severity === 'critical').length;
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <button type="button" className="relative grid size-10 place-items-center rounded-lg text-ink-600 hover:bg-ink-100" aria-label={`Notificações (${items.length})`}>
          <Bell className="size-5" />
          {items.length > 0 && <span className={cn('absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold text-white', critical ? 'bg-red-500' : 'bg-amber-500')}>{items.length}</span>}
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content align="end" sideOffset={8} className="z-50 w-[min(92vw,380px)] rounded-xl border border-ink-200 bg-white shadow-pop animate-slide-up">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <p className="font-display font-bold">Alertas</p>
            <span className="text-xs text-ink-500">Calculados a partir dos seus dados</span>
          </div>
          <ul className="max-h-[60vh] divide-y divide-ink-100 overflow-y-auto">
            {items.map((a) => (
              <li key={a.key}>
                <PopoverPrimitive.Close asChild>
                  <Link to={a.href} className="flex gap-3 px-4 py-3 hover:bg-ink-50">
                    <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', a.severity === 'critical' ? 'bg-red-500' : a.severity === 'warning' ? 'bg-amber-500' : 'bg-sky-500')} />
                    <span className="min-w-0"><span className="block text-sm font-medium text-ink-900">{a.title}</span><span className="block truncate text-xs text-ink-500">{a.description}</span></span>
                  </Link>
                </PopoverPrimitive.Close>
              </li>
            ))}
            {!items.length && <li className="px-4 py-8 text-center text-sm text-ink-500">Tudo em dia. Nenhum alerta no momento.</li>}
          </ul>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [deb, setDeb] = useState('');
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  useEffect(() => { const t = setTimeout(() => setDeb(q), 200); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(true); } };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, []);
  const { data, isFetching } = useQuery({ queryKey: ['search', deb], queryFn: () => api.get<{ data: any[] }>(`/search?q=${encodeURIComponent(deb)}`), enabled: deb.length >= 2 });
  const results = data?.data ?? [];
  const go = (r: any) => { setOpen(false); setQ(''); navigate(r.href); };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="hidden h-10 w-72 items-center gap-2 rounded-lg border border-ink-200 bg-ink-50 px-3 text-sm text-ink-400 hover:border-ink-300 md:flex" aria-label="Buscar">
        <Search className="size-4" />Buscar clientes, produtos…<kbd className="ml-auto rounded border border-ink-200 bg-white px-1.5 text-[10px] font-semibold text-ink-500">Ctrl K</kbd>
      </button>
      <button type="button" onClick={() => setOpen(true)} className="grid size-10 place-items-center rounded-lg text-ink-600 hover:bg-ink-100 md:hidden" aria-label="Buscar"><Search className="size-5" /></button>
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink-950/40 animate-fade-in" />
          <DialogPrimitive.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl bg-white shadow-pop animate-slide-up">
            <DialogPrimitive.Title className="sr-only">Busca global</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Busque clientes, produtos, serviços e outros registros</DialogPrimitive.Description>
            <div className="flex items-center gap-3 border-b border-ink-100 px-4">
              <Search className="size-5 text-ink-400" />
              <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} placeholder="Buscar em todo o sistema…" className="h-14 w-full bg-transparent outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
                  if (e.key === 'Enter' && results[active]) go(results[active]);
                }} />
              <DialogPrimitive.Close className="rounded p-1 text-ink-400 hover:text-ink-700" aria-label="Fechar"><X className="size-4" /></DialogPrimitive.Close>
            </div>
            <ul className="max-h-[50vh] overflow-y-auto p-2">
              {results.map((r, i) => (
                <li key={r.type + r.id}>
                  <button type="button" onClick={() => go(r)} onMouseEnter={() => setActive(i)}
                    className={cn('flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left', i === active ? 'bg-brand-50' : '')}>
                    <span className="min-w-0"><span className="block truncate text-sm font-medium">{r.title}</span>{r.subtitle && <span className="block truncate text-xs text-ink-500">{r.subtitle}</span>}</span>
                    <Badge>{r.type}</Badge>
                  </button>
                </li>
              ))}
              {deb.length >= 2 && !results.length && !isFetching && <li className="px-3 py-8 text-center text-sm text-ink-500">Nada encontrado para "{deb}".</li>}
              {deb.length < 2 && <li className="px-3 py-6 text-center text-sm text-ink-500">Digite ao menos 2 letras.</li>}
            </ul>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}

function ProfileMenu() {
  const me = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const logout = async () => { await api.post('/auth/logout'); qc.clear(); navigate('/entrar'); };
  const switchTo = async (id: string) => { await api.post('/auth/switch-company', { companyId: id }); qc.clear(); window.location.href = '/app'; };
  return (
    <Menu label="Perfil" trigger={
      <button type="button" className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-ink-100" aria-label="Menu do perfil">
        <Avatar name={me.user.name} size={32} />
        <span className="hidden text-left lg:block"><span className="block text-sm font-semibold leading-tight">{me.user.name.split(' ')[0]}</span><span className="block text-[11px] text-ink-500">{ROLE_LABELS[me.role]}</span></span>
        <ChevronDown className="hidden size-4 text-ink-400 lg:block" />
      </button>
    } items={[
      { label: 'Meu perfil e senha', icon: <UserRound className="size-4" />, onSelect: () => navigate('/app/configuracoes?aba=perfil') },
      { label: 'Configurações', icon: <Settings className="size-4" />, onSelect: () => navigate('/app/configuracoes') },
      ...me.companies.filter((c) => c.company_id !== me.company.id).map((c) => ({ label: `Trocar para ${c.name}`, icon: <Building2 className="size-4" />, onSelect: () => switchTo(c.company_id) })),
      { label: 'Cadastrar outra empresa', icon: <Building2 className="size-4" />, onSelect: () => navigate('/configurar-empresa?nova=1') },
      { label: 'Sair', icon: <LogOut className="size-4" />, onSelect: logout, danger: true },
    ]} />
  );
}

export function AppShell() {
  const me = useMe();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  useEffect(() => { main.current?.focus({ preventScroll: true }); window.scrollTo(0, 0); }, [location.pathname]);
  return (
    <div className="min-h-dvh lg:pl-64">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-pop">Pular para o conteúdo</a>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block"><Sidebar /></aside>
      <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink-950/50 lg:hidden animate-fade-in" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] lg:hidden animate-slide-in-right">
            <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Navegação entre módulos</DialogPrimitive.Description>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-ink-200/80 bg-white/85 px-4 backdrop-blur-md sm:px-6">
        <button type="button" onClick={() => setMobileOpen(true)} className="grid size-10 place-items-center rounded-lg text-ink-700 hover:bg-ink-100 lg:hidden" aria-label="Abrir menu"><MenuIcon className="size-5" /></button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[15px] font-bold leading-tight text-ink-950">{me.company.name}</p>
          <p className="flex items-center gap-1 truncate text-xs text-ink-500"><Icon name={me.segment.icon} className="size-3.5 text-brand-600" />{me.company.segment_key === 'outro' && me.company.custom_segment ? me.company.custom_segment : me.segment.name}</p>
        </div>
        <GlobalSearch />
        <Notifications />
        <ProfileMenu />
      </header>
      <main id="conteudo" ref={main} tabIndex={-1} className="mx-auto max-w-[1400px] px-4 py-6 focus:outline-none sm:px-6 lg:px-8 lg:py-8">
        <Outlet />
      </main>
    </div>
  );
}

export { relativeTime };
