import React, { useState, useEffect } from 'react';
import { Layout } from './shared/Layout.tsx';
import { IntakePage } from './customer/pages/IntakePage.tsx';
import { OrderPortalPage } from './customer/pages/OrderPortalPage.tsx';
import { CaseSteeringPage } from './cases/CaseSteeringPage.tsx';
import { PlannerWorkspacePage } from './planner/pages/PlannerWorkspacePage.tsx';

export const App: React.FC = () => {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    const hash = window.location.hash.replace(/^#/, '');
    if (hash) return hash;
    return window.location.pathname || '/customer/request';
  });

  useEffect(() => {
    const handlePopState = () => {
      const hash = window.location.hash.replace(/^#/, '');
      setCurrentPath(hash || window.location.pathname || '/customer/request');
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    window.location.hash = path;
    setCurrentPath(path);
  };

  // Determine active view
  let content = null;
  let orderRef = undefined;

  if (currentPath.startsWith('/cases/steering')) {
    content = <CaseSteeringPage />;
  } else if (currentPath.startsWith('/planner')) {
    const id = currentPath.startsWith('/planner/orders/')
      ? currentPath.replace('/planner/orders/', '').split(/[?#]/)[0] || 'ORD-2026-MANIPAL-50'
      : 'ORD-2026-MANIPAL-50';
    orderRef = id;
    content = <PlannerWorkspacePage orderId={id} onNavigate={navigate} />;
  } else if (currentPath.startsWith('/customer/orders/')) {
    const id = currentPath.replace('/customer/orders/', '').split(/[?#]/)[0] || 'ORD-2026-MANIPAL-50';
    orderRef = id;
    content = <OrderPortalPage orderId={id} onNavigate={navigate} />;
  } else {
    // Default to intake
    content = <IntakePage onNavigate={navigate} />;
  }

  return (
    <Layout activeRoute={currentPath} onNavigate={navigate} orderRef={orderRef}>
      {content}
    </Layout>
  );
};
