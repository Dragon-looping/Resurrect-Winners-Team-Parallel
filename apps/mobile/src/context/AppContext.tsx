import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AuthUser,
  EventOperation,
  FeedHealthSummary,
  InboundShipment,
  InventoryEvent,
  Plant,
  ScreenName,
  SkuItem,
} from '../types/inventory';
import { SEED_EVENTS, SEED_INBOUND_SHIPMENTS, SEED_PLANTS, SEED_SKUS } from '../data/seedFixtures';
import { authService, AuthResult } from '../services/authService';
import { isApiConfigured, isDevModeEnabled } from '../services/config';
import {
  formatIstTime,
  formatShortIstTime,
  generateStableEventId,
  syncInventoryEvent,
} from '../services/eventService';
import { allocateNextSourceSequence } from '../services/sequenceStore';
import {
  fetchEventHistory,
  fetchFeedHealth,
  fetchStockBalances,
  mergeLocalAndRemoteEvents,
} from '../services/inventoryService';

const STORAGE_KEYS = {
  events: '@setuvyuha/events_v1',
  plants: '@setuvyuha/plants_v1',
  skus: '@setuvyuha/skus_v1',
  feedHealth: '@setuvyuha/feed_health_v1',
  activePlant: '@setuvyuha/active_plant_v1',
  activeSku: '@setuvyuha/active_sku_v1',
  authUser: '@setuvyuha/auth_user_v1',
} as const;

export interface RecordOperationPayload {
  operation: EventOperation;
  skuId: string;
  plantId: string;
  qty: number; // For receive: +qty; for dispatch: +qty (stored as -qty); for correction: actual counted qty
  referenceValue: string;
  destinationOrBin?: string;
  conditionOrHandler?: string;
  auditNote?: string;
  existingEventId?: string; // If editing a failed/pending event payload
}

interface AppContextValue {
  isHydrated: boolean;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isDevSession: boolean;
  currentScreen: ScreenName;
  screenHistory: ScreenName[];
  selectedEventId: string;
  editingEvent: InventoryEvent | null;
  isOffline: boolean;
  lastSyncIst: string;
  heartbeatIst: string;
  isSyncingLiveData: boolean;
  liveDataError: string | null;
  dataSourceMode: 'seed' | 'cached' | 'live';
  feedHealth: FeedHealthSummary | null;
  eventsPagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };

  plants: Plant[];
  activePlant: Plant;
  skus: SkuItem[];
  plantSkus: SkuItem[];
  activeSku: SkuItem;
  inboundShipments: InboundShipment[];
  events: InventoryEvent[];
  pendingAndFailedCount: number;
  failedCount: number;

  navigate: (screen: ScreenName, options?: { eventId?: string; editEventId?: string }) => void;
  goBack: () => void;
  selectPlant: (plantId: string) => void;
  selectSku: (skuId: string) => void;
  toggleOffline: () => void;

  signIn: (email: string, password: string) => Promise<AuthResult>;
  enterDevMode: () => Promise<void>;
  signOut: () => Promise<void>;

  recordOperation: (payload: RecordOperationPayload) => Promise<InventoryEvent>;
  retryEvent: (eventId: string) => Promise<boolean>;
  retryAllEvents: () => Promise<{ attempted: number; succeeded: number }>;
  discardEvent: (eventId: string) => void;
  refreshLiveData: () => Promise<void>;
  loadMoreEvents: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isHydrated, setIsHydrated] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [currentScreen, setCurrentScreen] = useState<ScreenName>('Login');
  const [screenHistory, setScreenHistory] = useState<ScreenName[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('EVT-2026-9041');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState<boolean>(!isApiConfigured());
  const [lastSyncIst, setLastSyncIst] = useState<string>('14:18 IST');
  const [heartbeatIst, setHeartbeatIst] = useState<string>('14:24 IST');
  const [isSyncingLiveData, setIsSyncingLiveData] = useState<boolean>(false);
  const [liveDataError, setLiveDataError] = useState<string | null>(null);
  const [dataSourceMode, setDataSourceMode] = useState<'seed' | 'cached' | 'live'>('seed');
  const [feedHealth, setFeedHealth] = useState<FeedHealthSummary | null>(null);
  const [eventsPagination, setEventsPagination] = useState({
    total: 0,
    limit: 50,
    offset: 0,
    hasMore: false,
  });

  const [plants, setPlants] = useState<Plant[]>(SEED_PLANTS);
  const [activePlantId, setActivePlantId] = useState<string>('PLT-MGL');
  const [skus, setSkus] = useState<SkuItem[]>(SEED_SKUS);
  const [activeSkuId, setActiveSkuId] = useState<string>('SKU-MTR-402');
  const [inboundShipments] = useState<InboundShipment[]>(SEED_INBOUND_SHIPMENTS);
  const [events, setEvents] = useState<InventoryEvent[]>(SEED_EVENTS);

  // Hydrate persisted state on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [
          savedEvents,
          savedPlants,
          savedSkus,
          savedFeedHealth,
          savedPlant,
          savedSku,
          savedUser,
        ] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.events),
          AsyncStorage.getItem(STORAGE_KEYS.plants),
          AsyncStorage.getItem(STORAGE_KEYS.skus),
          AsyncStorage.getItem(STORAGE_KEYS.feedHealth),
          AsyncStorage.getItem(STORAGE_KEYS.activePlant),
          AsyncStorage.getItem(STORAGE_KEYS.activeSku),
          AsyncStorage.getItem(STORAGE_KEYS.authUser),
        ]);
        if (!mounted) return;
        if (savedEvents) setEvents(JSON.parse(savedEvents));
        if (savedPlants) setPlants(JSON.parse(savedPlants));
        if (savedSkus) {
          setSkus(JSON.parse(savedSkus));
          setDataSourceMode('cached');
        }
        if (savedFeedHealth) setFeedHealth(JSON.parse(savedFeedHealth));
        if (savedPlant) setActivePlantId(savedPlant);
        if (savedSku) setActiveSkuId(savedSku);
        if (savedUser) {
          const parsedUser = JSON.parse(savedUser) as AuthUser;
          if (!parsedUser.isDevMode || isDevModeEnabled()) {
            setUser(parsedUser);
            setCurrentScreen('Dashboard');
          }
        }
      } catch {
        // Fallback to seed fixtures on storage read error
      } finally {
        if (mounted) setIsHydrated(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Persist events & skus when updated
  useEffect(() => {
    if (!isHydrated) return;
    AsyncStorage.setItem(STORAGE_KEYS.events, JSON.stringify(events)).catch(() => {});
  }, [events, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    AsyncStorage.setItem(STORAGE_KEYS.skus, JSON.stringify(skus)).catch(() => {});
  }, [skus, isHydrated]);

  const activePlant = useMemo(
    () => plants.find((p) => p.id === activePlantId) ?? plants[0] ?? SEED_PLANTS[0],
    [plants, activePlantId]
  );

  const plantSkus = useMemo(
    () => skus.filter((s) => s.plantId === activePlant.id),
    [skus, activePlant.id]
  );

  const activeSku = useMemo(
    () => plantSkus.find((s) => s.id === activeSkuId) ?? plantSkus[0] ?? skus[0] ?? SEED_SKUS[0],
    [plantSkus, activeSkuId, skus]
  );

  const editingEvent = useMemo(
    () => (editingEventId ? events.find((e) => e.eventId === editingEventId) ?? null : null),
    [editingEventId, events]
  );

  const pendingAndFailedCount = useMemo(
    () => events.filter((e) => e.status === 'pending' || e.status === 'failed').length,
    [events]
  );

  const failedCount = useMemo(
    () => events.filter((e) => e.status === 'failed').length,
    [events]
  );

  const navigate = useCallback(
    (screen: ScreenName, options?: { eventId?: string; editEventId?: string }) => {
      if (options?.eventId) {
        setSelectedEventId(options.eventId);
      }
      setEditingEventId(options?.editEventId ?? null);
      setScreenHistory((prev) => [...prev, currentScreen]);
      setCurrentScreen(screen);
    },
    [currentScreen]
  );

  const goBack = useCallback(() => {
    setEditingEventId(null);
    setScreenHistory((prev) => {
      if (prev.length === 0) {
        setCurrentScreen('Dashboard');
        return [];
      }
      const next = [...prev];
      const previous = next.pop() ?? 'Dashboard';
      setCurrentScreen(previous === 'Login' && user ? 'Dashboard' : previous);
      return next;
    });
  }, [user]);

  const selectPlant = useCallback(
    (plantId: string) => {
      setActivePlantId(plantId);
      AsyncStorage.setItem(STORAGE_KEYS.activePlant, plantId).catch(() => {});
      const firstForPlant = skus.find((s) => s.plantId === plantId);
      if (firstForPlant) {
        setActiveSkuId(firstForPlant.id);
        AsyncStorage.setItem(STORAGE_KEYS.activeSku, firstForPlant.id).catch(() => {});
      }
    },
    [skus]
  );

  const selectSku = useCallback((skuId: string) => {
    setActiveSkuId(skuId);
    AsyncStorage.setItem(STORAGE_KEYS.activeSku, skuId).catch(() => {});
  }, []);

  const toggleOffline = useCallback(() => {
    setIsOffline((prev) => {
      const next = !prev;
      setHeartbeatIst(formatShortIstTime());
      if (!next) {
        setLastSyncIst(formatShortIstTime());
      }
      return next;
    });
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const result = await authService.signIn(email, password);
    if (result.ok && result.user) {
      setUser(result.user);
      await AsyncStorage.setItem(STORAGE_KEYS.authUser, JSON.stringify(result.user)).catch(() => {});
      setScreenHistory([]);
      setCurrentScreen('Dashboard');
    }
    return result;
  }, []);

  const enterDevMode = useCallback(async () => {
    if (!isDevModeEnabled()) return;
    const devUser: AuthUser = {
      email: 'dev-session@local',
      name: 'Development Session',
      role: 'Local Dev Operator',
      isDevMode: true,
    };
    setUser(devUser);
    await AsyncStorage.setItem(STORAGE_KEYS.authUser, JSON.stringify(devUser)).catch(() => {});
    setScreenHistory([]);
    setCurrentScreen('Dashboard');
  }, []);

  const signOut = useCallback(async () => {
    await authService.signOut();
    setUser(null);
    await AsyncStorage.removeItem(STORAGE_KEYS.authUser).catch(() => {});
    setScreenHistory([]);
    setCurrentScreen('Login');
  }, []);

  const recordOperation = useCallback(
    async (payload: RecordOperationPayload): Promise<InventoryEvent> => {
      const plant = plants.find((p) => p.id === payload.plantId) ?? activePlant;
      const sku =
        skus.find((s) => s.id === payload.skuId && s.plantId === plant.id) ?? activeSku;

      const eventId =
        payload.existingEventId ?? generateStableEventId(events.length);
      const existingMatch = payload.existingEventId
        ? events.find((e) => e.eventId === payload.existingEventId)
        : undefined;
      const sourceSequence =
        existingMatch?.sourceSequence ?? (await allocateNextSourceSequence());
      const now = new Date();
      const nowFullIst = formatIstTime(now);
      const nowShortIst = formatShortIstTime(now);

      let qtyDelta = payload.qty;
      let previousQty: number | undefined;
      let newQty: number | undefined;
      let operationLabel = 'Goods Received';
      let referenceLabel = 'Delivery Note / PO';

      if (payload.operation === 'goods_received') {
        qtyDelta = Math.abs(payload.qty);
        previousQty = sku.onHand;
        newQty = sku.onHand + qtyDelta;
        operationLabel = 'Goods Received';
        referenceLabel = 'Delivery Note / PO';
      } else if (payload.operation === 'goods_dispatch') {
        qtyDelta = -Math.abs(payload.qty);
        previousQty = sku.onHand;
        newQty = Math.max(0, sku.onHand + qtyDelta);
        operationLabel = 'Goods Dispatch';
        referenceLabel = 'Work Order';
      } else {
        previousQty = sku.onHand;
        newQty = Math.max(0, payload.qty);
        qtyDelta = newQty - previousQty;
        operationLabel = 'Stock Correction';
        referenceLabel = 'Reason Code';
      }

      // Apply local stock update immediately for floor accuracy
      setSkus((prev) =>
        prev.map((item) => {
          if (item.id === sku.id && item.plantId === plant.id) {
            return { ...item, onHand: newQty ?? item.onHand };
          }
          return item;
        })
      );

      const draftEvent: InventoryEvent = {
        eventId,
        operation: payload.operation,
        operationLabel,
        plantId: plant.id,
        backendPlantId: plant.backendId,
        plantName: plant.name,
        bin: payload.destinationOrBin || sku.bin,
        skuId: sku.id,
        backendSkuId: sku.backendId,
        skuName: sku.name,
        qtyDelta,
        previousQty,
        newQty,
        sourceSequence,
        referenceLabel,
        referenceValue: payload.referenceValue,
        destinationOrBin: payload.destinationOrBin,
        conditionOrHandler: payload.conditionOrHandler,
        auditNote: payload.auditNote,
        status: 'pending',
        createdAtIso: now.toISOString(),
        timestampIst: nowShortIst,
        attempts: [
          {
            timeIst: nowFullIst,
            label: isOffline ? 'Recorded Locally (Offline)' : 'Recorded Locally',
            detail: `Assigned ${eventId}`,
            tone: 'primary',
          },
        ],
      };

      const { event: syncedEvent, synced } = await syncInventoryEvent(
        draftEvent,
        isOffline,
        user?.token
      );

      if (synced) {
        setLastSyncIst(nowShortIst);
      }

      setEvents((prev) => {
        const filtered = prev.filter((e) => e.eventId !== syncedEvent.eventId);
        return [syncedEvent, ...filtered];
      });
      setEditingEventId(null);

      return syncedEvent;
    },
    [plants, activePlant, skus, activeSku, events.length, isOffline, user?.token]
  );

  const retryEvent = useCallback(
    async (eventId: string): Promise<boolean> => {
      const target = events.find((e) => e.eventId === eventId);
      if (!target) return false;

      const { event: updated, synced } = await syncInventoryEvent(
        target,
        isOffline,
        user?.token
      );

      if (synced) {
        setLastSyncIst(formatShortIstTime());
      }

      setEvents((prev) => prev.map((e) => (e.eventId === eventId ? updated : e)));
      return synced;
    },
    [events, isOffline, user?.token]
  );

  const retryAllEvents = useCallback(async (): Promise<{
    attempted: number;
    succeeded: number;
  }> => {
    const targets = events.filter(
      (e) => (e.status === 'failed' || e.status === 'pending') && !e.quarantined
    );
    let succeeded = 0;

    const updatedMap = new Map<string, InventoryEvent>();
    for (const target of targets) {
      const { event: updated, synced } = await syncInventoryEvent(
        target,
        isOffline,
        user?.token
      );
      updatedMap.set(target.eventId, updated);
      if (synced) succeeded += 1;
    }

    if (succeeded > 0) {
      setLastSyncIst(formatShortIstTime());
    }

    setEvents((prev) => prev.map((e) => updatedMap.get(e.eventId) ?? e));
    return { attempted: targets.length, succeeded };
  }, [events, isOffline, user?.token]);

  const discardEvent = useCallback((eventId: string) => {
    setEvents((prev) => prev.filter((e) => e.eventId !== eventId));
  }, []);

  const refreshLiveData = useCallback(async () => {
    if (isOffline || !isApiConfigured()) {
      return;
    }

    setIsSyncingLiveData(true);
    setLiveDataError(null);

    try {
      const [stockRes, eventsRes, feedRes] = await Promise.all([
        fetchStockBalances(plants, skus, user?.token),
        fetchEventHistory({ limit: 50, offset: 0, token: user?.token }, plants, skus),
        fetchFeedHealth(user?.token),
      ]);

      const errors: string[] = [];
      let nextPlants = plants;
      let nextSkus = skus;

      if (stockRes.ok) {
        // Never silently replace empty backend stock with seed fixtures
        nextPlants = stockRes.plants.length > 0 ? stockRes.plants : [];
        nextSkus = stockRes.skus;
        setPlants(nextPlants);
        setSkus(nextSkus);
        setDataSourceMode('live');
        AsyncStorage.setItem(STORAGE_KEYS.plants, JSON.stringify(nextPlants)).catch(() => {});
        AsyncStorage.setItem(STORAGE_KEYS.skus, JSON.stringify(nextSkus)).catch(() => {});
        if (nextPlants.length > 0 && !nextPlants.some((p) => p.id === activePlantId)) {
          setActivePlantId(nextPlants[0].id);
        }
      } else {
        errors.push(`Stock: ${stockRes.error}`);
      }

      if (eventsRes.ok) {
        setEvents((prev) => mergeLocalAndRemoteEvents(prev, eventsRes.items));
        setEventsPagination({
          total: eventsRes.total,
          limit: eventsRes.limit,
          offset: eventsRes.offset,
          hasMore: eventsRes.offset + eventsRes.items.length < eventsRes.total,
        });
      } else {
        errors.push(`Events: ${eventsRes.error}`);
      }

      if (feedRes.ok) {
        setFeedHealth(feedRes.summary);
        if (feedRes.summary?.lastHeartbeatIst) {
          setHeartbeatIst(feedRes.summary.lastHeartbeatIst);
        }
        if (feedRes.summary?.lastEventIst) {
          setLastSyncIst(feedRes.summary.lastEventIst);
        }
        AsyncStorage.setItem(STORAGE_KEYS.feedHealth, JSON.stringify(feedRes.summary)).catch(() => {});
      } else {
        errors.push(`Feeds: ${feedRes.error}`);
      }

      if (errors.length > 0) {
        setLiveDataError(errors.join(' | '));
      } else {
        setLastSyncIst(formatShortIstTime());
      }
    } finally {
      setIsSyncingLiveData(false);
    }
  }, [isOffline, plants, skus, user?.token, activePlantId]);

  const loadMoreEvents = useCallback(async () => {
    if (isOffline || !isApiConfigured() || !eventsPagination.hasMore || isSyncingLiveData) {
      return;
    }
    const nextOffset = eventsPagination.offset + eventsPagination.limit;
    setIsSyncingLiveData(true);
    try {
      const res = await fetchEventHistory(
        { limit: eventsPagination.limit, offset: nextOffset, token: user?.token },
        plants,
        skus
      );
      if (res.ok) {
        setEvents((prev) => mergeLocalAndRemoteEvents(prev, res.items));
        setEventsPagination({
          total: res.total,
          limit: res.limit,
          offset: res.offset,
          hasMore: res.offset + res.items.length < res.total,
        });
      } else {
        setLiveDataError(res.error);
      }
    } finally {
      setIsSyncingLiveData(false);
    }
  }, [isOffline, eventsPagination, isSyncingLiveData, user?.token, plants, skus]);

  useEffect(() => {
    if (isHydrated && user && !isOffline && isApiConfigured()) {
      refreshLiveData();
    }
    // Trigger initial live sync when transitioning to online/authenticated
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, Boolean(user), isOffline]);

  const value: AppContextValue = {
    isHydrated,
    user,
    isAuthenticated: Boolean(user),
    isDevSession: Boolean(user?.isDevMode),
    currentScreen,
    screenHistory,
    selectedEventId,
    editingEvent,
    isOffline,
    lastSyncIst,
    heartbeatIst,
    isSyncingLiveData,
    liveDataError,
    dataSourceMode,
    feedHealth,
    eventsPagination,
    plants,
    activePlant,
    skus,
    plantSkus,
    activeSku,
    inboundShipments,
    events,
    pendingAndFailedCount,
    failedCount,
    navigate,
    goBack,
    selectPlant,
    selectSku,
    toggleOffline,
    signIn,
    enterDevMode,
    signOut,
    recordOperation,
    retryEvent,
    retryAllEvents,
    discardEvent,
    refreshLiveData,
    loadMoreEvents,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used inside AppProvider');
  }
  return ctx;
}
