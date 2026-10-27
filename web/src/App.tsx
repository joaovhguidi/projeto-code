import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { MeContext, useMeQuery } from './lib/auth';
import { AppShell } from './components/layout/app-shell';
import { ErrorState, PageLoader, Spinner } from './components/ui';
import { LogoMark } from './components/layout/logo';

const Landing = lazy(() => import('./pages/public/landing'));
const Features = lazy(() => import('./pages/public/features'));
const Login = lazy(() => import('./pages/public/auth').then((m) => ({ default: m.Login })));
const Register = lazy(() => import('./pages/public/auth').then((m) => ({ default: m.Register })));
const Forgot = lazy(() => import('./pages/public/auth').then((m) => ({ default: m.Forgot })));
const Reset = lazy(() => import('./pages/public/auth').then((m) => ({ default: m.Reset })));
const Onboarding = lazy(() => import('./pages/onboarding/wizard'));
const Dashboard = lazy(() => import('./pages/app/dashboard'));
const Tips = lazy(() => import('./pages/app/tips'));
const Customers = lazy(() => import('./pages/app/customers').then((m) => ({ default: m.Customers })));
const CustomerDetail = lazy(() => import('./pages/app/customers').then((m) => ({ default: m.CustomerDetail })));
const Pets = lazy(() => import('./pages/app/simple').then((m) => ({ default: m.Pets })));
const Vehicles = lazy(() => import('./pages/app/simple').then((m) => ({ default: m.Vehicles })));
const Services = lazy(() => import('./pages/app/simple').then((m) => ({ default: m.Services })));
const Agenda = lazy(() => import('./pages/app/agenda'));
const Products = lazy(() => import('./pages/app/products').then((m) => ({ default: m.Products })));
const ProductDetail = lazy(() => import('./pages/app/products').then((m) => ({ default: m.ProductDetail })));
const Sales = lazy(() => import('./pages/app/sales').then((m) => ({ default: m.Sales })));
const NewSale = lazy(() => import('./pages/app/sales').then((m) => ({ default: m.NewSale })));
const SaleDetail = lazy(() => import('./pages/app/sales').then((m) => ({ default: m.SaleDetail })));
const Quotes = lazy(() => import('./pages/app/quotes').then((m) => ({ default: m.Quotes })));
const QuoteEditor = lazy(() => import('./pages/app/quotes').then((m) => ({ default: m.QuoteEditor })));
const QuoteView = lazy(() => import('./pages/app/quotes').then((m) => ({ default: m.QuoteView })));
const WorkOrders = lazy(() => import('./pages/app/work-orders').then((m) => ({ default: m.WorkOrders })));
const WorkOrderEditor = lazy(() => import('./pages/app/work-orders').then((m) => ({ default: m.WorkOrderEditor })));
const Finance = lazy(() => import('./pages/app/finance').then((m) => ({ default: m.Finance })));
const Receivables = lazy(() => import('./pages/app/finance').then((m) => ({ default: m.Receivables })));
const Deliveries = lazy(() => import('./pages/app/deliveries'));
const Suppliers = lazy(() => import('./pages/app/suppliers').then((m) => ({ default: m.Suppliers })));
const SupplierDetail = lazy(() => import('./pages/app/suppliers').then((m) => ({ default: m.SupplierDetail })));
const Tasks = lazy(() => import('./pages/app/tasks'));
const Team = lazy(() => import('./pages/app/team').then((m) => ({ default: m.Team })));
const EmployeeDetail = lazy(() => import('./pages/app/team').then((m) => ({ default: m.EmployeeDetail })));
const Shifts = lazy(() => import('./pages/app/shifts'));
const Maintenance = lazy(() => import('./pages/app/maintenance'));
const Waste = lazy(() => import('./pages/app/waste'));
const Feedbacks = lazy(() => import('./pages/app/feedbacks'));
const Loyalty = lazy(() => import('./pages/app/loyalty'));
const Reports = lazy(() => import('./pages/app/reports'));
const Documents = lazy(() => import('./pages/app/documents'));
const Issues = lazy(() => import('./pages/app/issues'));
const Settings = lazy(() => import('./pages/app/settings'));

function FullLoader() {
  return (
    <div className="grid min-h-dvh place-items-center bg-ink-50">
      <div className="flex flex-col items-center gap-4 animate-fade-in"><LogoMark size={48} /><Spinner /></div>
    </div>
  );
}

function RequireAuth({ needCompany = true, children }: { needCompany?: boolean; children: React.ReactNode }) {
  const { data: me, isLoading, error, refetch } = useMeQuery();
  const location = useLocation();
  if (isLoading) return <FullLoader />;
  if (error) return <div className="p-8"><ErrorState error={error} onRetry={() => refetch()} /></div>;
  if (!me) return <Navigate to={`/entrar?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (needCompany && !me.company) return <Navigate to="/configurar-empresa" replace />;
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}

function GuestOnly({ children }: { children: React.ReactNode }) {
  const { data: me, isLoading } = useMeQuery();
  if (isLoading) return <FullLoader />;
  if (me) return <Navigate to={me.company ? '/app' : '/configurar-empresa'} replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Suspense fallback={<FullLoader />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/funcionalidades" element={<Features />} />
        <Route path="/entrar" element={<GuestOnly><Login /></GuestOnly>} />
        <Route path="/cadastro" element={<GuestOnly><Register /></GuestOnly>} />
        <Route path="/esqueci-senha" element={<Forgot />} />
        <Route path="/redefinir-senha" element={<Reset />} />
        <Route path="/configurar-empresa" element={<RequireAuth needCompany={false}><Onboarding /></RequireAuth>} />
        <Route path="/app" element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route element={<Suspense fallback={<PageLoader />}><OutletWrapper /></Suspense>}>
            <Route index element={<Dashboard />} />
            <Route path="dicas" element={<Tips />} />
            <Route path="clientes" element={<Customers />} />
            <Route path="clientes/:id" element={<CustomerDetail />} />
            <Route path="animais" element={<Pets />} />
            <Route path="veiculos" element={<Vehicles />} />
            <Route path="servicos" element={<Services />} />
            <Route path="agenda" element={<Agenda />} />
            <Route path="estoque" element={<Products />} />
            <Route path="estoque/:id" element={<ProductDetail />} />
            <Route path="vendas" element={<Sales />} />
            <Route path="vendas/nova" element={<NewSale />} />
            <Route path="vendas/:id" element={<SaleDetail />} />
            <Route path="orcamentos" element={<Quotes />} />
            <Route path="orcamentos/novo" element={<QuoteEditor />} />
            <Route path="orcamentos/:id/editar" element={<QuoteEditor />} />
            <Route path="orcamentos/:id" element={<QuoteView />} />
            <Route path="ordens-servico" element={<WorkOrders />} />
            <Route path="ordens-servico/nova" element={<WorkOrderEditor />} />
            <Route path="ordens-servico/:id" element={<WorkOrderEditor />} />
            <Route path="financeiro" element={<Finance />} />
            <Route path="cobrancas" element={<Receivables />} />
            <Route path="entregas" element={<Deliveries />} />
            <Route path="fornecedores" element={<Suppliers />} />
            <Route path="fornecedores/:id" element={<SupplierDetail />} />
            <Route path="tarefas" element={<Tasks />} />
            <Route path="equipe" element={<Team />} />
            <Route path="equipe/:id" element={<EmployeeDetail />} />
            <Route path="escalas" element={<Shifts />} />
            <Route path="manutencao" element={<Maintenance />} />
            <Route path="desperdicios" element={<Waste />} />
            <Route path="avaliacoes" element={<Feedbacks />} />
            <Route path="fidelizacao" element={<Loyalty />} />
            <Route path="relatorios" element={<Reports />} />
            <Route path="documentos" element={<Documents />} />
            <Route path="solicitacoes" element={<Issues />} />
            <Route path="configuracoes" element={<Settings />} />
            <Route path="*" element={<NotFoundInApp />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

import { Outlet, Link } from 'react-router-dom';
function OutletWrapper() { return <Outlet />; }
function NotFoundInApp() {
  return <div className="py-20 text-center"><h1 className="text-2xl font-bold">Página não encontrada</h1><Link to="/app" className="mt-4 inline-block text-brand-700 underline">Voltar ao painel</Link></div>;
}
