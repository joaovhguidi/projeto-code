import { CUSTOMER_RELATIONSHIP, PET_SIZE, PET_SPECIES, formatBRL, formatDate, formatPhone, petSchema, serviceSchema, vehicleSchema } from '@nexo/shared';
import { Link } from 'react-router-dom';
import { PawPrint, Car, Scissors } from 'lucide-react';
import { ResourcePage } from '@/components/resource-page';
import { Badge } from '@/components/ui';
import { useCan } from '@/lib/auth';
export { CUSTOMER_RELATIONSHIP };

export function Pets() {
  return (
    <ResourcePage<any>
      title="Animais" description="Pets dos clientes, com porte, alergias e próximo retorno." module="animais" endpoint="/pets" entity="animal" newLabel="Cadastrar animal"
      help={<><p>Cadastre os animais vinculados ao tutor. Informe alergias e porte para um atendimento seguro.</p><p>A data de <b>próximo retorno</b> gera alertas e dicas para você entrar em contato.</p></>}
      softDelete defaultSort={{ key: 'name', dir: 'asc' }}
      filters={[{ key: 'species', label: 'Espécie', options: PET_SPECIES }, { key: 'returns_due', label: 'Retorno', options: { '1': 'Retorno nos próximos 7 dias' }, allLabel: 'Todos os retornos' }]}
      empty={{ title: 'Nenhum animal cadastrado', description: 'Cadastre os pets dos seus clientes para agendar banho, tosa e consultas.', icon: <PawPrint className="size-6" /> }}
      columns={[
        { key: 'name', header: 'Nome', sortKey: 'name', primary: true, render: (r) => <span className="font-semibold text-ink-900">{r.name}</span> },
        { key: 'species', header: 'Espécie', render: (r) => `${PET_SPECIES[r.species as keyof typeof PET_SPECIES]}${r.breed ? ` · ${r.breed}` : ''}` },
        { key: 'customer', header: 'Tutor', sortKey: 'customer', render: (r) => <Link to={`/app/clientes/${r.customer_id}`} onClick={(e) => e.stopPropagation()} className="text-brand-700 hover:underline">{r.customer_name}</Link> },
        { key: 'size', header: 'Porte', hideOnMobile: true, render: (r) => (r.size ? PET_SIZE[r.size as keyof typeof PET_SIZE] : '—') },
        { key: 'allergies', header: 'Alergias', hideOnMobile: true, render: (r) => (r.allergies ? <Badge tone="warning">{r.allergies}</Badge> : '—') },
        { key: 'next_return', header: 'Próximo retorno', sortKey: 'next_return', render: (r) => formatDate(r.next_return) },
      ]}
      schema={petSchema}
      defaults={() => ({ species: 'cachorro' })}
      fields={[
        { name: 'customer_id', label: 'Tutor (cliente)', type: 'entity', endpoint: '/customers/options', required: true, span: 2 },
        { name: 'name', label: 'Nome do animal', required: true },
        { name: 'species', label: 'Espécie', type: 'select', options: PET_SPECIES, required: true },
        { name: 'breed', label: 'Raça' },
        { name: 'size', label: 'Porte', type: 'select', options: PET_SIZE },
        { name: 'birth_date', label: 'Nascimento', type: 'date' },
        { name: 'weight_kg', label: 'Peso (kg)', type: 'number', step: 0.1 },
        { name: 'allergies', label: 'Alergias e cuidados', span: 2 },
        { name: 'next_return', label: 'Próximo retorno', type: 'date' },
        { name: 'notes', label: 'Observações', type: 'textarea' },
      ]}
    />
  );
}

export function Vehicles() {
  return (
    <ResourcePage<any>
      title="Veículos" description="Veículos dos clientes e histórico de serviços." module="veiculos" endpoint="/vehicles" entity="veículo" newLabel="Cadastrar veículo"
      help={<p>Vincule cada veículo ao cliente. Ao abrir uma ordem de serviço, selecione o veículo para manter o histórico completo de manutenções.</p>}
      softDelete defaultSort={{ key: 'plate', dir: 'asc' }}
      empty={{ title: 'Nenhum veículo cadastrado', description: 'Cadastre os veículos para manter o histórico de cada um.', icon: <Car className="size-6" /> }}
      columns={[
        { key: 'plate', header: 'Placa', sortKey: 'plate', primary: true, render: (r) => <span className="rounded bg-ink-900 px-2 py-0.5 font-mono text-xs font-bold tracking-wider text-white">{r.plate}</span> },
        { key: 'model', header: 'Veículo', sortKey: 'model', render: (r) => <span className="font-medium text-ink-900">{[r.brand, r.model, r.year].filter(Boolean).join(' ')}</span> },
        { key: 'color', header: 'Cor', hideOnMobile: true },
        { key: 'customer', header: 'Cliente', sortKey: 'customer', render: (r) => <Link to={`/app/clientes/${r.customer_id}`} onClick={(e) => e.stopPropagation()} className="text-brand-700 hover:underline">{r.customer_name}</Link> },
        { key: 'mileage', header: 'Km', align: 'right', hideOnMobile: true, render: (r) => (r.mileage ? r.mileage.toLocaleString('pt-BR') : '—') },
      ]}
      schema={vehicleSchema}
      fields={[
        { name: 'customer_id', label: 'Cliente', type: 'entity', endpoint: '/customers/options', required: true, span: 2 },
        { name: 'plate', label: 'Placa', type: 'plate', required: true },
        { name: 'brand', label: 'Marca' },
        { name: 'model', label: 'Modelo', required: true },
        { name: 'year', label: 'Ano', type: 'number' },
        { name: 'color', label: 'Cor' },
        { name: 'mileage', label: 'Quilometragem', type: 'number' },
        { name: 'notes', label: 'Observações', type: 'textarea' },
      ]}
    />
  );
}

export function Services() {
  const can = useCan();
  return (
    <ResourcePage<any>
      title="Serviços" description="Catálogo com preço, duração e custo estimado." module="servicos" endpoint="/services" entity="serviço" newLabel="Novo serviço"
      help={<><p>A <b>duração</b> é usada pela agenda para calcular horários livres e evitar conflitos.</p><p>O <b>custo estimado</b> (materiais por atendimento) permite calcular a margem de cada serviço.</p></>}
      softDelete defaultSort={{ key: 'name', dir: 'asc' }}
      filters={[{ key: 'active', label: 'Situação', options: { '1': 'Ativos', '0': 'Inativos' } }]}
      empty={{ title: 'Nenhum serviço cadastrado', description: 'Cadastre seus serviços para agendar e vender com rapidez.', icon: <Scissors className="size-6" /> }}
      columns={[
        { key: 'name', header: 'Serviço', sortKey: 'name', primary: true, render: (r) => <div><p className="font-semibold text-ink-900">{r.name}</p>{r.category && <p className="text-xs text-ink-500">{r.category}</p>}</div> },
        { key: 'duration_minutes', header: 'Duração', sortKey: 'duration_minutes', render: (r) => `${r.duration_minutes} min` },
        { key: 'price', header: 'Preço', sortKey: 'price', align: 'right', render: (r) => <span className="tabular font-medium">{formatBRL(r.price)}</span> },
        ...(can('financeiro') ? [{ key: 'margin', header: 'Margem est.', align: 'right' as const, hideOnMobile: true, render: (r: any) => (r.estimated_cost > 0 && r.price > 0 ? `${Math.round(((r.price - r.estimated_cost) / r.price) * 100)}%` : <span className="text-ink-400">sem custo</span>) }] : []),
        { key: 'done_30d', header: 'Realizados (30 dias)', sortKey: 'done_30d', align: 'right', hideOnMobile: true },
        { key: 'active', header: 'Situação', render: (r) => (r.active ? <Badge tone="success">Ativo</Badge> : <Badge>Inativo</Badge>) },
      ]}
      schema={serviceSchema}
      defaults={() => ({ duration_minutes: 30, price: 0, estimated_cost: 0, active: true })}
      fields={[
        { name: 'name', label: 'Nome do serviço', required: true, span: 2 },
        { name: 'category', label: 'Categoria' },
        { name: 'duration_minutes', label: 'Duração (minutos)', type: 'number', required: true, step: 5 },
        { name: 'price', label: 'Preço', type: 'money', required: true },
        { name: 'estimated_cost', label: 'Custo estimado de materiais', type: 'money', hint: 'Usado para estimar a margem' },
        { name: 'active', label: 'Disponível para agendamento', type: 'switch' },
        { name: 'description', label: 'Descrição', type: 'textarea' },
      ]}
    />
  );
}
export { formatPhone };
