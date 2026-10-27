import { useEffect, useMemo } from 'react';
import { Controller, useForm, type FieldValues, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ZodTypeAny } from 'zod';
import { toast } from 'sonner';
import { utcToZonedParts, zonedToUtcISO } from '@nexo/shared';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button, EntitySelect, Field, Input, MoneyInput, NumberInput, Rating, Select, Sheet, Switch, Textarea } from '@/components/ui';

export type FieldType = 'text' | 'email' | 'tel' | 'document' | 'textarea' | 'number' | 'money' | 'date' | 'datetime' | 'time' | 'select' | 'entity' | 'switch' | 'rating' | 'color' | 'plate';

export interface FieldDef {
  name: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  placeholder?: string;
  hint?: React.ReactNode;
  options?: Record<string, string>;
  emptyOption?: string;
  endpoint?: string;
  extraParams?: (values: any) => string | undefined;
  span?: 1 | 2;
  step?: number;
  showIf?: (values: any) => boolean;
  disabled?: boolean | ((values: any) => boolean);
  section?: string;
  onChangeEffect?: (value: any, form: UseFormReturn<any>, option?: any) => void;
}

const onlyDigits = (s: string) => s.replace(/\D/g, '');
export function maskPhone(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
export function maskDocument(v: string) {
  const d = onlyDigits(v).slice(0, 14);
  if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
}

/** Converte valores de data/hora vindos da API para o formato dos inputs, no fuso da empresa. */
export function toFormValues(fields: FieldDef[], row: Record<string, any>, tz: string) {
  const out: Record<string, any> = {};
  for (const f of fields) {
    let v = row[f.name];
    if (f.type === 'datetime' && v) { const p = utcToZonedParts(v, tz); v = `${p.date}T${p.time}`; }
    if (f.type === 'time' && v) v = String(v).slice(0, 5);
    if (f.type === 'tel' && v) v = maskPhone(v);
    if (f.type === 'document' && v) v = maskDocument(v);
    if (f.type === 'switch') v = !!v;
    out[f.name] = v ?? (f.type === 'switch' ? false : f.type === 'money' ? 0 : '');
  }
  return out;
}

export function fromFormValues(fields: FieldDef[], values: Record<string, any>, tz: string) {
  const out = { ...values };
  for (const f of fields) {
    const v = values[f.name];
    if (f.type === 'datetime' && v) { const [d, t] = String(v).split('T'); out[f.name] = zonedToUtcISO(d, t, tz); }
    if (f.showIf && !f.showIf(values)) delete out[f.name];
  }
  return out;
}

/** Aplica erros de validação do servidor aos campos do formulário. */
export function applyServerErrors(form: UseFormReturn<any>, err: unknown) {
  if (err instanceof ApiError && err.fields) {
    for (const [k, msg] of Object.entries(err.fields)) form.setError(k as any, { message: msg });
    toast.error(err.message);
    return true;
  }
  toast.error(err instanceof Error ? err.message : 'Não foi possível salvar.');
  return false;
}

export function FormFields({ fields, form, autoFocus = true }: { fields: FieldDef[]; form: UseFormReturn<any>; autoFocus?: boolean }) {
  const values = form.watch();
  const { errors } = form.formState;
  const sections = useMemo(() => {
    const out: { name?: string; fields: FieldDef[] }[] = [];
    for (const f of fields) {
      const last = out[out.length - 1];
      if (!last || (f.section && f.section !== last.name)) out.push({ name: f.section, fields: [f] });
      else last.fields.push(f);
    }
    return out;
  }, [fields]);
  let first = autoFocus;
  return (
    <div className="space-y-6">
      {sections.map((s, si) => (
        <fieldset key={si} className="space-y-4">
          {s.name && <legend className="mb-1 text-xs font-bold uppercase tracking-wider text-brand-700">{s.name}</legend>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {s.fields.map((f) => {
              if (f.showIf && !f.showIf(values)) return null;
              const id = `f-${f.name}`;
              const err = (errors as any)[f.name]?.message as string | undefined;
              const disabled = typeof f.disabled === 'function' ? f.disabled(values) : f.disabled;
              const focus = first && !disabled && !['select', 'entity', 'switch', 'rating'].includes(f.type ?? 'text');
              if (focus) first = false;
              return (
                <Field key={f.name} label={f.label} required={f.required} error={err} hint={f.hint} htmlFor={id}
                  className={cn((f.span === 2 || f.type === 'textarea') && 'sm:col-span-2', f.type === 'switch' && 'flex flex-col justify-end')}>
                  <Controller name={f.name} control={form.control} render={({ field }) => {
                    const set = (v: any, opt?: any) => { field.onChange(v); f.onChangeEffect?.(v, form, opt); };
                    switch (f.type) {
                      case 'textarea': return <Textarea id={id} {...field} value={field.value ?? ''} invalid={!!err} placeholder={f.placeholder} disabled={disabled} rows={3} />;
                      case 'money': return <MoneyInput id={id} value={field.value} onChange={set} invalid={!!err} disabled={disabled} />;
                      case 'number': return <NumberInput id={id} value={field.value} onChange={set} step={f.step ?? 1} invalid={!!err} disabled={disabled} />;
                      case 'select': return (
                        <Select id={id} value={field.value ?? ''} onChange={(e) => set(e.target.value)} invalid={!!err} disabled={disabled}>
                          {(f.emptyOption !== undefined || !f.required) && <option value="">{f.emptyOption ?? 'Selecione…'}</option>}
                          {Object.entries(f.options ?? {}).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </Select>);
                      case 'entity': return <EntitySelect id={id} endpoint={f.endpoint!} value={field.value || null} onChange={(v, o) => set(v ?? '', o)} invalid={!!err} placeholder={f.placeholder} disabled={disabled}
                        extraParams={f.extraParams?.(values)} />;
                      case 'switch': return <div className="flex h-10 items-center"><Switch id={id} checked={!!field.value} onCheckedChange={set} disabled={disabled} label={f.label} /></div>;
                      case 'rating': return <Rating value={field.value || null} onChange={(v) => set(v ?? '')} />;
                      case 'color': return <div className="flex items-center gap-2"><input id={id} type="color" value={field.value || '#0E9670'} onChange={(e) => set(e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg border border-ink-200 bg-white p-1" /><span className="text-xs text-ink-500">{field.value}</span></div>;
                      case 'tel': return <Input id={id} {...field} value={field.value ?? ''} onChange={(e) => set(maskPhone(e.target.value))} inputMode="tel" placeholder={f.placeholder ?? '(00) 00000-0000'} invalid={!!err} disabled={disabled} autoFocus={focus} />;
                      case 'document': return <Input id={id} {...field} value={field.value ?? ''} onChange={(e) => set(maskDocument(e.target.value))} inputMode="numeric" placeholder={f.placeholder ?? 'CPF ou CNPJ'} invalid={!!err} disabled={disabled} autoFocus={focus} />;
                      case 'plate': return <Input id={id} {...field} value={field.value ?? ''} onChange={(e) => set(e.target.value.toUpperCase())} placeholder="ABC1D23" maxLength={8} invalid={!!err} disabled={disabled} autoFocus={focus} />;
                      default: {
                        const type = f.type === 'datetime' ? 'datetime-local' : f.type ?? 'text';
                        return <Input id={id} type={type} {...field} value={field.value ?? ''} placeholder={f.placeholder} invalid={!!err} disabled={disabled} autoFocus={focus} />;
                      }
                    }
                  }} />
                </Field>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

export function useEntityForm<T extends FieldValues>(schema: ZodTypeAny, defaultValues: Record<string, any>) {
  return useForm<T>({ resolver: zodResolver(schema as any) as any, defaultValues: defaultValues as any, mode: 'onTouched' });
}

/** Formulário em painel lateral, gerado a partir da definição de campos. */
export function FormSheet({ open, onOpenChange, title, description, fields, schema, initial, onSubmit, submitLabel = 'Salvar', tz, wide, children }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string; fields: FieldDef[]; schema: ZodTypeAny;
  initial: Record<string, any>; onSubmit: (values: Record<string, any>) => Promise<unknown>; submitLabel?: string; tz: string; wide?: boolean; children?: React.ReactNode;
}) {
  const form = useEntityForm(schema, toFormValues(fields, initial, tz));
  useEffect(() => { if (open) form.reset(toFormValues(fields, initial, tz)); /* eslint-disable-next-line */ }, [open, initial]);
  const submit = form.handleSubmit(async (values) => {
    try { await onSubmit(fromFormValues(fields, { ...values }, tz)); }
    catch (e) { applyServerErrors(form, e); }
  }, () => toast.error('Verifique os campos destacados.'));
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description={description} wide={wide}
      footer={<>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button variant="primary" loading={form.formState.isSubmitting} onClick={submit}>{submitLabel}</Button>
      </>}>
      <form onSubmit={submit} noValidate>
        <FormFields fields={fields} form={form} />
        {children}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Sheet>
  );
}
