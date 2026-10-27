import { forwardRef, useEffect, useId, useState } from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { Search, Star, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const base = 'w-full rounded-lg border bg-white text-sm text-ink-900 placeholder:text-ink-400 transition-colors focus:outline-none focus:ring-3 focus:ring-brand-500/15 focus:border-brand-500 disabled:bg-ink-50 disabled:text-ink-500';
const tone = (invalid?: boolean) => (invalid ? 'border-red-400 focus:border-red-500 focus:ring-red-500/15' : 'border-ink-200 hover:border-ink-300');

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ className, invalid, ...p }, ref) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={cn(base, tone(invalid), 'h-10 px-3', className)} {...p} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea({ className, invalid, ...p }, ref) {
  return <textarea ref={ref} aria-invalid={invalid || undefined} className={cn(base, tone(invalid), 'px-3 py-2 min-h-[84px] resize-y', className)} {...p} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select({ className, invalid, children, ...p }, ref) {
  return (
    <select ref={ref} aria-invalid={invalid || undefined}
      className={cn(base, tone(invalid), 'h-10 pl-3 pr-8 appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 fill=%27none%27 stroke=%27%236b737b%27 stroke-width=%272%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E")] bg-no-repeat bg-[right_0.6rem_center]', className)} {...p}>
      {children}
    </select>
  );
});

/** Campo monetário: digitação preenche os centavos da direita para a esquerda (padrão brasileiro). */
export function MoneyInput({ value, onChange, invalid, id, disabled, placeholder, className, autoFocus }: {
  value: number | string | null | undefined; onChange: (v: number) => void; invalid?: boolean; id?: string; disabled?: boolean; placeholder?: string; className?: string; autoFocus?: boolean;
}) {
  const num = Number(value ?? 0) || 0;
  const display = num === 0 && (value === '' || value === undefined || value === null) ? '' : num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div className={cn('relative', className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">R$</span>
      <input
        id={id} inputMode="numeric" disabled={disabled} autoFocus={autoFocus} placeholder={placeholder ?? '0,00'} aria-invalid={invalid || undefined}
        className={cn(base, tone(invalid), 'h-10 pl-9 pr-3 text-right tabular')}
        value={display}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 13);
          onChange(digits ? Number(digits) / 100 : 0);
        }}
      />
    </div>
  );
}

export function NumberInput({ value, onChange, step = 1, min, invalid, id, className, disabled }: {
  value: number | string | null | undefined; onChange: (v: number | '') => void; step?: number; min?: number; invalid?: boolean; id?: string; className?: string; disabled?: boolean;
}) {
  return (
    <Input id={id} type="number" inputMode="decimal" step={step} min={min} invalid={invalid} disabled={disabled} className={cn('tabular', className)}
      value={value === null || value === undefined ? '' : value}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
  );
}

export function Switch({ checked, onCheckedChange, id, disabled, label }: { checked: boolean; onCheckedChange: (v: boolean) => void; id?: string; disabled?: boolean; label?: string }) {
  return (
    <SwitchPrimitive.Root id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-label={label}
      className="relative h-6 w-11 shrink-0 rounded-full bg-ink-200 transition-colors data-[state=checked]:bg-brand-600 disabled:opacity-50">
      <SwitchPrimitive.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
    </SwitchPrimitive.Root>
  );
}

export function Checkbox({ checked, onChange, label, description, id }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; description?: string; id?: string }) {
  const auto = useId();
  const cid = id ?? auto;
  return (
    <label htmlFor={cid} className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
      checked ? 'border-brand-500 bg-brand-50/60' : 'border-ink-200 hover:border-ink-300 bg-white')}>
      <input id={cid} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 accent-brand-600" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink-800">{label}</span>
        {description && <span className="block text-xs text-ink-500 mt-0.5">{description}</span>}
      </span>
    </label>
  );
}

export function Rating({ value, onChange, readOnly, size = 18 }: { value: number | null | undefined; onChange?: (v: number | null) => void; readOnly?: boolean; size?: number }) {
  return (
    <div className="flex items-center gap-0.5" role={readOnly ? undefined : 'radiogroup'} aria-label="Avaliação">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={readOnly} aria-label={`${n} estrela${n > 1 ? 's' : ''}`} aria-checked={value === n} role={readOnly ? undefined : 'radio'}
          onClick={() => onChange?.(value === n ? null : n)} className={cn('p-0.5 rounded', !readOnly && 'hover:scale-110 transition-transform')}>
          <Star style={{ width: size, height: size }} className={cn(n <= (value ?? 0) ? 'fill-amber-400 text-amber-400' : 'text-ink-300')} />
        </button>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Buscar…', className, delay = 300 }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; delay?: number }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  useEffect(() => {
    if (local === value) return;
    const t = setTimeout(() => onChange(local), delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
      <Input value={local} onChange={(e) => setLocal(e.target.value)} placeholder={placeholder} className="pl-9 pr-8" aria-label={placeholder} type="search" />
      {local && (
        <button type="button" onClick={() => { setLocal(''); onChange(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 hover:text-ink-700" aria-label="Limpar busca">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function Field({ label, error, hint, required, children, htmlFor, className, action }: {
  label?: React.ReactNode; error?: string; hint?: React.ReactNode; required?: boolean; children: React.ReactNode; htmlFor?: string; className?: string; action?: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5 min-w-0', className)}>
      {label && (
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={htmlFor} className="text-sm font-medium text-ink-700">
            {label}{required && <span className="text-red-500 ml-0.5" aria-hidden>*</span>}
          </label>
          {action}
        </div>
      )}
      {children}
      {error ? <p className="text-xs font-medium text-red-600" role="alert">{error}</p> : hint ? <p className="text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}
