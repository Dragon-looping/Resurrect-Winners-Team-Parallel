import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { PlannerOrder } from '../types/planner.ts';

const hubs: Record<string, [number, number]> = {
  UDUPI: [13.341, 74.742], MANIPAL: [13.353, 74.792], KUNDAPURA: [13.625, 74.69],
  MANGALORE: [12.87, 74.843], HASSAN: [13.007, 76.101], BRAHMAVAR: [13.431, 74.746]
};
const city: Record<string,string> = {UDUPI:'Udupi',MANIPAL:'Manipal',KUNDAPURA:'Kundapura',MANGALORE:'Mangaluru',HASSAN:'Hassan',BRAHMAVAR:'Brahmavar'};
const strategyNames = {wait:'Wait', spare_sourcing:'Spare stock', swap:'Swap'};
interface Props {
  order: PlannerOrder;
  orders?: PlannerOrder[];
  onSelectOrder?: (id: string) => void;
  onSelectCandidate: (id: string) => void;
  children?: React.ReactNode;
}

export const GodownRouteMap = ({order, orders, onSelectOrder, onSelectCandidate, children}: Props) => {
  const container = useRef<HTMLDivElement>(null);
  const [search,setSearch] = useState('');
  const selected = order.candidates.find(c => c.candidateId === order.selectedCandidateId) ?? order.candidates[0];
  useEffect(() => {
    if (!container.current) return;
    const map = L.map(container.current, {zoomControl:false, zoomAnimation:false, fadeAnimation:false, scrollWheelZoom:false, zoomSnap:.25, minZoom:5, maxZoom:17});
    L.control.zoom({position:'topright'}).addTo(map);
    // A geographically anchored coastline keeps the network readable offline.
    map.createPane('coast').style.zIndex = '190';
    const coast: L.LatLngTuple[] = [[15,73.95],[14.4,74.39],[13.92,74.58],[13.65,74.657],[13.56,74.675],[13.36,74.697],[13.2,74.73],[13.02,74.79],[12.86,74.817],[12.4,74.98],[11,75.8]];
    L.polygon([...coast,[11,80],[15,80]],{pane:'coast',stroke:false,fillColor:'#e3e8cc',fillOpacity:1,interactive:false}).addTo(map);
    const tiles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
      attribution:'Tiles © Esri, HERE, Garmin, USGS, OpenStreetMap contributors', maxNativeZoom:16
    }).addTo(map);
    tiles.on('tileerror', e => { (e.tile as HTMLElement).style.visibility = 'hidden'; });
    L.marker([13.26,74.23], {interactive:false, keyboard:false, icon:L.divIcon({className:'sea-label',html:'Arabian Sea',iconSize:[100,22]})}).addTo(map);
    const bounds = L.latLngBounds([]);
    const ids = new Set<string>();
    for (const leg of selected?.routeLegs ?? []) {
      const a = hubs[leg.fromNodeId], b = hubs[leg.toNodeId];
      if (!a || !b) continue;
      bounds.extend(a).extend(b); ids.add(leg.fromNodeId); ids.add(leg.toNodeId);
      const replacement = Boolean(selected?.donorOrderId && leg.affectedOrderId === selected.donorOrderId);
      L.polyline([a,b],{weight:8,color:'#fff',opacity:1}).addTo(map);
      const line = L.polyline([a,b],{weight:4,color:replacement ? '#c17b08' : '#164de2',dashArray:replacement ? '8 6' : undefined,opacity:1}).addTo(map);
      const label = document.createElement('span');
      label.textContent = (replacement ? 'Replacement · ' : '') + leg.units + ' ' + order.unitLabel;
      line.bindTooltip(label,{permanent:true,direction:'right',className:replacement ? 'leg-label replacement' : 'leg-label',offset:[0,leg.fromNodeId === 'UDUPI' && !replacement ? 24 : 0]});
    }
    if (!bounds.isValid()) {bounds.extend(hubs.MANIPAL).extend(hubs.MANGALORE);}
    ids.forEach(id => L.circleMarker(hubs[id],{radius:5,color:'#14223b',fillColor:'white',fillOpacity:1,weight:2}).addTo(map)
      .bindTooltip(city[id],{permanent:true,direction:id === 'UDUPI' ? 'left':'right',className:'map-city'}));
    const fit = () => {
      const wide = map.getSize().x > 740;
      map.fitBounds(bounds,{paddingTopLeft:wide ? [320,65] : [55,48],paddingBottomRight:wide ? [155,85] : [90,45],maxZoom:12});
    };
    const observer = new ResizeObserver(() => {map.invalidateSize();fit();});
    observer.observe(container.current); fit();
    return () => {observer.disconnect();map.remove();};
  }, [order.unitLabel, selected]);
  return <section className="map-workspace">
    <div className="geo-map" ref={container} aria-label="Coastal Karnataka route map"/>
    <div className="order-overlay"><small>Dispatch planner</small><h2>{order.destination.split(',')[0]}</h2><p>{order.quantity} {order.unitLabel} · {order.telemetry.agreedArrival}</p>
      {orders && onSelectOrder && <label>Find order<input type="search" list="map-orders" placeholder={order.orderId} value={search} onChange={e => {
        const value = e.target.value;
        setSearch(value);
        const match = orders.find(o => o.orderId.toLowerCase() === value.trim().toLowerCase());
        if (match) { onSelectOrder(match.orderId); setSearch(''); }
      }}/><datalist id="map-orders">{orders.map(o => <option key={o.orderId} value={o.orderId}>{o.destination}</option>)}</datalist></label>}
    </div>
    <div className="cutoff-sheet"><div className="plan-switch">{order.candidates.map(c => <button key={c.candidateId} title={c.title} aria-pressed={selected?.candidateId === c.candidateId} onClick={() => onSelectCandidate(c.candidateId)}>{strategyNames[c.strategy]}</button>)}</div>{children}</div>
    <details className="route-key"><summary>Route legs · schematic</summary>{selected?.routeLegs.map(l => <p key={l.legId}>{l.fromLabel} → {l.toLabel} · {l.units} {order.unitLabel} · {l.departTime}–{l.arriveTime}</p>)}<p>{selected?.summary}</p></details>
  </section>;
};
