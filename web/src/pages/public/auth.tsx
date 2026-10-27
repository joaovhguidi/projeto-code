import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { CheckCircle2, Eye, EyeOff, Info, MailWarning } from 'lucide-react';
import { forgotSchema, loginSchema, password as passwordSchema, registerSchema } from '@nexo/shared';
import { api, ApiError } from '@/lib/api';
import { Logo } from '@/components/layout/logo';
import { Button, Field, Input } from '@/components/ui';
import { applyServerErrors, maskPhone } from '@/components/form/form';

function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-brand-950 p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:44px_44px]" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 size-[460px] rounded-full bg-brand-600/30 blur-3xl" />
        <Link to="/" className="relative"><Logo light /></Link>
        <div className="relative mt-auto max-w-md">
          <h2 className="text-4xl font-extrabold leading-tight">Seu negócio organizado, do jeito que ele funciona.</h2>
          <p className="mt-4 text-brand-100/75">Agenda, clientes, estoque, vendas e financeiro conectados — com um painel montado para o seu segmento.</p>
          <ul className="mt-8 space-y-3 text-sm text-brand-100/85">
            {['Painel personalizado por atividade', 'Dicas práticas baseadas nos seus dados', 'Dados protegidos e separados por empresa'].map((t) => (
              <li key={t} className="flex items-center gap-2.5"><CheckCircle2 className="size-4 text-accent-400" />{t}</li>
            ))}
          </ul>
        </div>
      </aside>
      <main className="flex flex-col justify-center px-5 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-md animate-slide-up">
          <Link to="/" className="mb-10 inline-block lg:hidden"><Logo /></Link>
          <h1 className="text-3xl font-extrabold text-ink-950">{title}</h1>
          {subtitle && <p className="mt-2 text-ink-500">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-center text-sm text-ink-500">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? 'text' : 'password'} className="pr-10" />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-ink-400 hover:text-ink-700" aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}>
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function Login() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [sp] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });
  const submit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      await api.post('/auth/login', v);
      await qc.invalidateQueries({ queryKey: ['me'] });
      const next = sp.get('next');
      navigate(next && next.startsWith('/app') ? next : '/app', { replace: true });
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Não foi possível entrar.'); }
  });
  const { errors, isSubmitting } = form.formState;
  return (
    <AuthLayout title="Entrar" subtitle="Acesse o painel da sua empresa." footer={<>Ainda não tem conta? <Link to="/cadastro" className="font-semibold text-brand-700 hover:underline">Criar conta</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">{error}</p>}
        <Field label="E-mail" htmlFor="email" error={errors.email?.message}><Input id="email" type="email" autoComplete="email" autoFocus invalid={!!errors.email} {...form.register('email')} /></Field>
        <Field label="Senha" htmlFor="password" error={errors.password?.message}
          action={<Link to="/esqueci-senha" className="text-xs font-medium text-brand-700 hover:underline">Esqueci minha senha</Link>}>
          <PasswordInput id="password" autoComplete="current-password" invalid={!!errors.password} {...form.register('password')} />
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>Entrar</Button>
      </form>
    </AuthLayout>
  );
}

const registerForm = registerSchema.extend({ confirm: z.string(), terms: z.literal(true, { errorMap: () => ({ message: 'Aceite para continuar' }) }) })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'As senhas não conferem' });

export function Register() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const form = useForm<any>({ resolver: zodResolver(registerForm), defaultValues: { name: '', email: '', phone: '', password: '', confirm: '', terms: false } });
  const submit = form.handleSubmit(async (v) => {
    try {
      await api.post('/auth/register', { name: v.name, email: v.email, phone: v.phone, password: v.password });
      await qc.invalidateQueries({ queryKey: ['me'] });
      navigate('/configurar-empresa', { replace: true });
    } catch (e) { applyServerErrors(form, e); }
  });
  const { errors, isSubmitting } = form.formState;
  const err = (k: string) => (errors as any)[k]?.message as string | undefined;
  return (
    <AuthLayout title="Criar conta" subtitle="Em seguida, você vai configurar sua empresa." footer={<>Já tem conta? <Link to="/entrar" className="font-semibold text-brand-700 hover:underline">Entrar</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Seu nome" htmlFor="name" required error={err('name')}><Input id="name" autoComplete="name" autoFocus invalid={!!err('name')} {...form.register('name')} /></Field>
        <Field label="E-mail" htmlFor="email" required error={err('email')}><Input id="email" type="email" autoComplete="email" invalid={!!err('email')} {...form.register('email')} /></Field>
        <Field label="Telefone" htmlFor="phone" error={err('phone')} hint="Opcional">
          <Input id="phone" inputMode="tel" placeholder="(00) 00000-0000" invalid={!!err('phone')} {...form.register('phone', { onChange: (e) => form.setValue('phone', maskPhone(e.target.value)) })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Senha" htmlFor="password" required error={err('password')} hint="Mínimo 8 caracteres, com letras e números">
            <PasswordInput id="password" autoComplete="new-password" invalid={!!err('password')} {...form.register('password')} />
          </Field>
          <Field label="Confirme a senha" htmlFor="confirm" required error={err('confirm')}><PasswordInput id="confirm" autoComplete="new-password" invalid={!!err('confirm')} {...form.register('confirm')} /></Field>
        </div>
        <label className="flex items-start gap-2.5 text-sm text-ink-600">
          <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" {...form.register('terms')} />
          <span>Concordo com o uso dos meus dados para operar a plataforma.{err('terms') && <span className="block text-xs font-medium text-red-600">{err('terms')}</span>}</span>
        </label>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>Criar conta e continuar</Button>
      </form>
    </AuthLayout>
  );
}

export function Forgot() {
  const [result, setResult] = useState<{ emailConfigured: boolean; message: string } | null>(null);
  const form = useForm<{ email: string }>({ resolver: zodResolver(forgotSchema), defaultValues: { email: '' } });
  const submit = form.handleSubmit(async (v) => {
    try { setResult(await api.post('/auth/forgot', v)); } catch (e) { applyServerErrors(form, e); }
  });
  return (
    <AuthLayout title="Recuperar senha" subtitle="Informe o e-mail da sua conta." footer={<Link to="/entrar" className="font-semibold text-brand-700 hover:underline">Voltar para o login</Link>}>
      {result ? (
        <div role="status" className={`flex gap-3 rounded-xl p-4 text-sm ${result.emailConfigured ? 'bg-brand-50 text-brand-900' : 'bg-amber-50 text-amber-900'}`}>
          {result.emailConfigured ? <CheckCircle2 className="size-5 shrink-0" /> : <MailWarning className="size-5 shrink-0" />}
          <div><p className="font-semibold">{result.emailConfigured ? 'Solicitação registrada' : 'Envio de e-mail não configurado'}</p><p className="mt-1">{result.message}</p></div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="E-mail" htmlFor="email" error={form.formState.errors.email?.message}><Input id="email" type="email" autoFocus {...form.register('email')} /></Field>
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={form.formState.isSubmitting}>Enviar link de redefinição</Button>
        </form>
      )}
    </AuthLayout>
  );
}

const resetForm = z.object({ password: passwordSchema, confirm: z.string() }).refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'As senhas não conferem' });
export function Reset() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const token = sp.get('token') ?? '';
  const [done, setDone] = useState(false);
  const form = useForm<z.infer<typeof resetForm>>({ resolver: zodResolver(resetForm), defaultValues: { password: '', confirm: '' } });
  const submit = form.handleSubmit(async (v) => {
    try { await api.post('/auth/reset', { token, password: v.password }); setDone(true); setTimeout(() => navigate('/entrar'), 2500); }
    catch (e) { applyServerErrors(form, e); }
  });
  const { errors } = form.formState;
  return (
    <AuthLayout title="Criar nova senha" footer={<Link to="/entrar" className="font-semibold text-brand-700 hover:underline">Voltar para o login</Link>}>
      {!token ? <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><Info className="size-4 shrink-0" />Link inválido. Solicite uma nova redefinição.</p>
        : done ? <p role="status" className="flex gap-2 rounded-lg bg-brand-50 p-3 text-sm text-brand-900"><CheckCircle2 className="size-4" />Senha alterada! Redirecionando para o login…</p>
          : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <Field label="Nova senha" htmlFor="password" error={errors.password?.message} hint="Mínimo 8 caracteres, com letras e números"><PasswordInput id="password" autoFocus {...form.register('password')} /></Field>
              <Field label="Confirme a nova senha" htmlFor="confirm" error={errors.confirm?.message}><PasswordInput id="confirm" {...form.register('confirm')} /></Field>
              <Button type="submit" variant="primary" size="lg" className="w-full" loading={form.formState.isSubmitting}>Salvar nova senha</Button>
            </form>
          )}
    </AuthLayout>
  );
}
