import React, { useState, useEffect, useCallback } from 'react';
import {
  getPlannerAdapter,
  getPlannerConfig,
  setPlannerConfig,
  resetPlannerFixtures
} from '../adapters/plannerAdapter.ts';
import {
  PlannerIntakeRequest,
  PlannerOrder,
  TelemetrySnapshot
} from '../types/planner.ts';
import { OrderQueuePanel } from '../components/OrderQueuePanel.tsx';
import { TelemetryStrip } from '../components/TelemetryStrip.tsx';
import { AlertIcon, RotateCcwIcon } from '../../shared/icons.tsx';

interface PlannerWorkspacePageProps {
  orderId?: string;
  onNavigate: (route: string) => void;
}

export const PlannerWorkspacePage: React.FC<PlannerWorkspacePageProps> = ({
  orderId = 'ORD-2026-MANIPAL-50',
  onNavigate
}) => {
  const [orders, setOrders] = useState<PlannerOrder[]>([]);
  const [activeOrder, setActiveOrder] = useState<PlannerOrder | null>(null);
  const [liveTelemetry, setLiveTelemetry] = useState<TelemetrySnapshot | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState(getPlannerConfig());

  const loadWorkspace = useCallback(async () => {
    setError(null);
    try {
      const adapter = getPlannerAdapter();
      const [list, current] = await Promise.all([
        adapter.listOrders(),
        adapter.getOrder(orderId)
      ]);
      setOrders(list);
      setActiveOrder(current);
      setLiveTelemetry(current.telemetry);
    } catch (err: any) {
      setError(err.message || 'Failed to load planner workspace.');
    }
  }, [orderId]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    setStreamError(null);
    const adapter = getPlannerAdapter();
    const unsubscribe = adapter.subscribeTelemetryStream(
      orderId,
      snapshot => setLiveTelemetry(snapshot),
      msg => setStreamError(msg)
    );
    return unsubscribe;
  }, [orderId, config.mode]);

  const toggleMode = (mode: 'fixture' | 'live') => {
    setPlannerConfig({ mode });
    setConfig(getPlannerConfig());
    loadWorkspace();
  };

  const handleReset = () => {
    resetPlannerFixtures();
    onNavigate('/planner/orders/ORD-2026-MANIPAL-50');
    loadWorkspace();
  };

  const handleCreateOrder = async (req: PlannerIntakeRequest) => {
    setError(null);
    try {
      const created = await getPlannerAdapter().createPlannerOrder(req);
      await loadWorkspace();
      onNavigate(`/planner/orders/${created.orderId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create planner order.');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--rule)', paddingBottom: '1.25rem', marginBottom: '1.5rem' }}>
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            PLANNER CONTROL TOWER · RECOVERY &amp; ALLOCATION
          </p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.4rem', fontWeight: 700, textTransform: 'uppercase', lineHeight: 1.1 }}>
            {activeOrder ? `${activeOrder.orderId} · ${activeOrder.quantity} ${activeOrder.unitLabel}` : 'Planner Workspace'}
          </h1>
          {activeOrder && (
            <p style={{ color: 'var(--ink-secondary)', marginTop: '0.35rem' }}>
              {activeOrder.itemName} ({activeOrder.itemSku}) → {activeOrder.destination}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--rule)', background: 'var(--surface)', padding: '0.25rem', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
            <span style={{ padding: '0.2rem 0.5rem', color: 'var(--ink-muted)' }}>MODE:</span>
            <button
              type="button"
              onClick={() => toggleMode('fixture')}
              style={{
                padding: '0.25rem 0.6rem',
                background: config.mode === 'fixture' ? 'var(--ink)' : 'transparent',
                color: config.mode === 'fixture' ? 'var(--surface)' : 'var(--ink)',
                fontWeight: config.mode === 'fixture' ? 600 : 400
              }}
            >
              FIXTURE
            </button>
            <button
              type="button"
              onClick={() => toggleMode('live')}
              style={{
                padding: '0.25rem 0.6rem',
                background: config.mode === 'live' ? 'var(--oxide-red)' : 'transparent',
                color: config.mode === 'live' ? 'var(--surface)' : 'var(--ink)',
                fontWeight: config.mode === 'live' ? 600 : 400
              }}
            >
              LIVE API
            </button>
          </div>

          <button type="button" className="btn-secondary" onClick={handleReset} style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}>
            <RotateCcwIcon size={14} />
            <span>Reset Fixtures</span>
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '1rem', background: 'var(--oxide-red-subtle)', border: '1px solid var(--oxide-red)', color: 'var(--oxide-red)', marginBottom: '1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <AlertIcon size={18} color="var(--oxide-red)" />
          <span>{error}</span>
        </div>
      )}

      <OrderQueuePanel
        orders={orders}
        activeOrderId={orderId}
        onSelectOrder={id => onNavigate(`/planner/orders/${id}`)}
        onCreateOrder={handleCreateOrder}
      />

      {activeOrder && (
        <TelemetryStrip
          order={activeOrder}
          telemetry={liveTelemetry || activeOrder.telemetry}
          streamError={streamError}
        />
      )}
    </div>
  );
};
