import { Link, NavLink } from 'react-router-dom';
import { Logo } from '@/components/layout/logo';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

export function PublicHeader({ dark }: { dark?: boolean }) {
  return (
    <header className={cn('sticky top-0 z-40 border-b backdrop-blur-md', dark ? 'border-white/10 bg-brand-950/80' : 'border-ink-200/70 bg-white/80')}>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link to="/" aria-label="Nexo Business — início"><Logo light={dark} /></Link>
        <nav className={cn('hidden items-center gap-6 text-sm font-medium md:flex', dark ? 'text-brand-100/80' : 'text-ink-600')} aria-label="Navegação do site">
          <NavLink to="/funcionalidades" className="hover:text-current hover:opacity-100">Funcionalidades</NavLink>
          <a href="/#segmentos" className="hover:opacity-100">Segmentos</a>
          <a href="/#dicas" className="hover:opacity-100">Dicas inteligentes</a>
          <a href="/#seguranca" className="hover:opacity-100">Segurança</a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link to="/entrar"><Button variant={dark ? 'ghost' : 'ghost'} className={dark ? 'text-white hover:bg-white/10' : ''}>Entrar</Button></Link>
          <Link to="/cadastro"><Button variant="primary">Começar agora</Button></Link>
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-ink-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-ink-500">Plataforma de gestão para MEIs, microempresas e prestadores de serviço. Todas as áreas do seu negócio conectadas, com ferramentas adaptadas à sua atividade.</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-ink-900">Produto</p>
          <ul className="mt-3 space-y-2 text-sm text-ink-500">
            <li><Link to="/funcionalidades" className="hover:text-ink-900">Funcionalidades</Link></li>
            <li><a href="/#segmentos" className="hover:text-ink-900">Segmentos atendidos</a></li>
            <li><a href="/#dicas" className="hover:text-ink-900">Dicas para meu negócio</a></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-ink-900">Conta</p>
          <ul className="mt-3 space-y-2 text-sm text-ink-500">
            <li><Link to="/cadastro" className="hover:text-ink-900">Criar conta</Link></li>
            <li><Link to="/entrar" className="hover:text-ink-900">Entrar</Link></li>
            <li><Link to="/esqueci-senha" className="hover:text-ink-900">Recuperar senha</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-ink-100 py-5 text-center text-xs text-ink-400">© {new Date().getFullYear()} Nexo Business. Nome provisório.</div>
    </footer>
  );
}
