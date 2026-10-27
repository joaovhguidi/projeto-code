import { cn } from '@/lib/utils';

/** Marca Nexo: três nós conectados formando um "N" — áreas do negócio ligadas numa só plataforma. */
export function LogoMark({ size = 32, className, inverted }: { size?: number; className?: string; inverted?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden>
      <rect width="40" height="40" rx="11" fill={inverted ? '#bdf05a' : '#06362b'} />
      <path d="M12 28V12l16 16V12" fill="none" stroke={inverted ? '#06362b' : '#bdf05a'} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3.2" fill={inverted ? '#06362b' : '#ffffff'} />
      <circle cx="28" cy="28" r="3.2" fill={inverted ? '#06362b' : '#ffffff'} />
    </svg>
  );
}

export function Logo({ className, light, size = 32 }: { className?: string; light?: boolean; size?: number }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={size} inverted={light} />
      <span className={cn('font-display text-[19px] font-extrabold tracking-tight', light ? 'text-white' : 'text-ink-950')}>
        nexo<span className={light ? 'text-accent-400' : 'text-brand-600'}>.</span><span className={cn('ml-1 font-semibold', light ? 'text-white/70' : 'text-ink-500')}>business</span>
      </span>
    </span>
  );
}
