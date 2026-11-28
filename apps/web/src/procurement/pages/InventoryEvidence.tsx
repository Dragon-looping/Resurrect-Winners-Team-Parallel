import {useEffect, useState} from 'react';

interface CountEvent { quantity: number; occurred_at: string; external_event_id: string }
interface Evidence { count?: CountEvent; ledger?: number; asOf: string }

const base = ((import.meta as unknown as {env?: Record<string,string>}).env?.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export function InventoryEvidence({plant, sku, unit}: {plant:number; sku:number; unit:string}) {
  const [evidence,setEvidence] = useState<Evidence | null>(null);
  const [error,setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    async function get(path:string) {
      const response = await fetch(base + path,{signal:controller.signal});
      if (!response.ok) throw new Error('Inventory record unavailable');
      return response.json();
    }
    async function load() {
      const events = await get(`/events?plant_id=${plant}&sku_id=${sku}&event_type=PHYSICAL_COUNT&limit=1`);
      const count:CountEvent | undefined = events.items[0];
      // Request the ledger snapshot immediately before the physical count.
      const stamp = count?.occurred_at;
      const utcStamp = stamp && (/(Z|[+-]\d\d:\d\d)$/i.test(stamp) ? stamp : stamp + 'Z');
      let when = new Date().toISOString();
      if (utcStamp) {
        const milliseconds = Date.parse(utcStamp);
        const fraction = (utcStamp.match(/\.(\d+)/)?.[1] || '').padEnd(6, '0');
        const remainder = Number(fraction.slice(3, 6));
        const previous = new Date(remainder ? milliseconds : milliseconds - 1);
        const micros = String(remainder ? remainder - 1 : 999).padStart(3, '0');
        when = previous.toISOString().replace('Z', micros + 'Z');
      }
      const stock = await get(`/stock/${plant}/${sku}?as_of=${encodeURIComponent(when)}`);
      if (!controller.signal.aborted) setEvidence({count,ledger:stock.physical_stock,asOf:when});
    }
    setEvidence(null);setError(false);
    load().catch(() => {if (!controller.signal.aborted) setError(true);});
    return () => controller.abort();
  },[plant,sku]);
  if (!evidence) return <p className="evidence-note">{error ? 'Count and ledger records unavailable.' : 'Loading inventory evidence…'}</p>;
  return <div className="count-evidence"><div><small>Physical count</small><b>{evidence.count ? evidence.count.quantity + ' ' + unit : 'No count recorded'}</b></div>
    <div><small>{evidence.count ? 'Ledger before count' : 'Ledger balance'}</small><b>{evidence.ledger} {unit}</b></div>
    {evidence.count && <small>{evidence.count.external_event_id} · {evidence.count.occurred_at}</small>}
  </div>;
}
