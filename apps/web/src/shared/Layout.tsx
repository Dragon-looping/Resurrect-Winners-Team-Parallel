import React from 'react';


interface LayoutProps {
  children: React.ReactNode;
  orderRef?: string;
  statusBadge?: React.ReactNode;
  activeRoute?: string;
  onNavigate?: (route: string) => void;
}

export const Layout: React.FC<LayoutProps> = ({children, orderRef, statusBadge, activeRoute = '/customer/request', onNavigate}) => {
  const destinations = [
    ['Request intake', '/customer/request', '/customer/request'],
    ['Order portal', '/customer/orders/' + (orderRef || 'ORD-2026-MANIPAL-50'), '/customer/orders'],
    ['Planner', orderRef ? '/planner/orders/' + orderRef : '/planner', '/planner'],
    ['Evaluation', '/evaluation', '/eval'],
    ['Case steering', '/cases/steering', '/cases'],
    ['Procurement', '/procurement', '/procurement'],
  ];
  return <div className="dispatch-shell">
    <header className="network-header">
      <button className="network-brand" onClick={() => onNavigate?.('/customer/request')}>
        <svg aria-hidden="true" viewBox="0 0 34 32" width="34" height="32" fill="none" stroke="currentColor" strokeWidth="3"><path d="M2 25 13 6h8l-11 19zm12 0L25 6h7L21 25z"/></svg>
        SETUVYUHA
      </button>
      <nav aria-label="Workspaces">{destinations.map(([name, path, prefix]) =>
        <a key={name} href={path} aria-current={activeRoute.startsWith(prefix) ? 'page' : undefined}
          onClick={e => {if (onNavigate && !e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); onNavigate(path); }}}>{name}</a>)}</nav>
      <span className="network-context">{orderRef || 'Regional fulfilment'} {statusBadge}</span>
    </header>
    <main className="dispatch-main">{children}</main>
    <footer className="dispatch-footer">SETUVYUHA · Regional fulfilment network</footer>
  </div>;
};
