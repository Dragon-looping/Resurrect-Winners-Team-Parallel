import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, FontFamily, Radii, Spacing } from '../theme/tokens';
import { useApp } from '../context/AppContext';
import { MainTopBar } from '../components/ui/TopBar';
import { BottomNav } from '../components/ui/BottomNav';
import { AlertBanner } from '../components/ui/AlertBanner';
import { BadgeVariant, StatusBadge } from '../components/ui/StatusBadge';
import { Button } from '../components/ui/Button';
import {
  InterWarehouseRequest,
  NetworkAvailabilityItem,
} from '../types/inventory';
import {
  approveStockRequest,
  createStockRequest,
  dispatchStockRequest,
  fetchNetworkAvailability,
  fetchNetworkRequests,
  receiveStockRequest,
  rejectStockRequest,
} from '../services/networkService';

type NetworkTab = 'availability' | 'incoming' | 'outgoing';

function statusBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case 'IN_STOCK':
    case 'APPROVED':
    case 'FULFILLED':
      return 'success';
    case 'LOW_STOCK':
    case 'PENDING':
    case 'PARTIALLY_APPROVED':
    case 'DISPATCHED':
    case 'PARTIALLY_FULFILLED':
      return 'warning';
    case 'OUT_OF_STOCK':
    case 'REJECTED':
      return 'error';
    default:
      return 'neutral';
  }
}

export const WarehouseNetworkScreen: React.FC = () => {
  const { user, activePlant, isOffline, refreshLiveData } = useApp();
  const [tab, setTab] = useState<NetworkTab>('availability');
  const [availability, setAvailability] = useState<NetworkAvailabilityItem[]>([]);
  const [requests, setRequests] = useState<InterWarehouseRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);

  // Request Stock form state
  const [selectedItem, setSelectedItem] = useState<NetworkAvailabilityItem | null>(null);
  const [requestQty, setRequestQty] = useState('10');
  const [requestReason, setRequestReason] = useState('');

  // Approve/Reject inline state
  const [actionTargetId, setActionTargetId] = useState<number | null>(null);
  const [approveQtyInput, setApproveQtyInput] = useState('');
  const [rejectReasonInput, setRejectReasonInput] = useState('');

  const loadNetworkData = useCallback(async () => {
    if (!user?.token || isOffline) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const [availRes, reqRes] = await Promise.all([
        fetchNetworkAvailability(user.token),
        fetchNetworkRequests(user.token, 'all'),
      ]);
      if (availRes.ok) {
        setAvailability(availRes.items);
      } else {
        setErrorMsg(availRes.error ?? 'Unable to load network stock availability.');
      }
      if (reqRes.ok) {
        setRequests(reqRes.items);
      } else if (!availRes.ok) {
        setErrorMsg(reqRes.error ?? 'Unable to load stock requests.');
      }
    } finally {
      setLoading(false);
    }
  }, [user?.token, isOffline]);

  useEffect(() => {
    loadNetworkData();
  }, [loadNetworkData]);

  const incomingRequests = useMemo(
    () => requests.filter((r) => r.supplying_plant_id === activePlant.backendId),
    [requests, activePlant.backendId]
  );

  const outgoingRequests = useMemo(
    () => requests.filter((r) => r.requesting_plant_id === activePlant.backendId),
    [requests, activePlant.backendId]
  );

  const handleSubmitRequest = async () => {
    if (!selectedItem || !user?.token) return;
    setErrorMsg(null);
    setNoticeMsg(null);
    const qty = parseInt(requestQty, 10);
    if (!Number.isFinite(qty) || qty <= 0) {
      setErrorMsg('Enter a valid positive quantity to request.');
      return;
    }
    const idempotencyKey = `mob-req-${activePlant.backendId}-${selectedItem.plant_id}-${selectedItem.sku_id}-${Date.now()}`;
    const res = await createStockRequest(
      {
        supplying_plant_id: selectedItem.plant_id,
        sku_id: selectedItem.sku_id,
        requested_qty: qty,
        reason: requestReason.trim() || undefined,
        idempotency_key: idempotencyKey,
      },
      user.token
    );
    if (!res.ok) {
      setErrorMsg(res.error ?? 'Failed to submit stock request.');
      return;
    }
    setNoticeMsg(`Request ${res.request?.request_code} sent to ${selectedItem.plant_name}.`);
    setSelectedItem(null);
    setRequestReason('');
    setTab('outgoing');
    await loadNetworkData();
  };

  const handleApprove = async (req: InterWarehouseRequest) => {
    if (!user?.token) return;
    setErrorMsg(null);
    setNoticeMsg(null);
    const qty = parseInt(approveQtyInput || String(req.requested_qty), 10);
    if (!Number.isFinite(qty) || qty <= 0 || qty > req.requested_qty) {
      setErrorMsg(`Approved quantity must be between 1 and ${req.requested_qty}.`);
      return;
    }
    const res = await approveStockRequest(req.id, qty, user.token);
    if (!res.ok) {
      setErrorMsg(res.error ?? 'Approval failed.');
      return;
    }
    setActionTargetId(null);
    setNoticeMsg(`Request ${req.request_code} approved for ${qty} ${req.unit}.`);
    await loadNetworkData();
  };

  const handleReject = async (req: InterWarehouseRequest) => {
    if (!user?.token) return;
    setErrorMsg(null);
    setNoticeMsg(null);
    if (rejectReasonInput.trim().length < 2) {
      setErrorMsg('Enter a rejection reason.');
      return;
    }
    const res = await rejectStockRequest(req.id, rejectReasonInput.trim(), user.token);
    if (!res.ok) {
      setErrorMsg(res.error ?? 'Rejection failed.');
      return;
    }
    setActionTargetId(null);
    setRejectReasonInput('');
    setNoticeMsg(`Request ${req.request_code} rejected.`);
    await loadNetworkData();
  };

  const handleDispatch = async (req: InterWarehouseRequest) => {
    if (!user?.token) return;
    setErrorMsg(null);
    setNoticeMsg(null);
    const res = await dispatchStockRequest(req.id, user.token);
    if (!res.ok) {
      setErrorMsg(res.error ?? 'Dispatch failed.');
      return;
    }
    setNoticeMsg(`Dispatched ${res.request?.dispatched_qty} ${req.unit} for ${req.request_code}.`);
    await Promise.all([loadNetworkData(), refreshLiveData()]);
  };

  const handleReceive = async (req: InterWarehouseRequest) => {
    if (!user?.token) return;
    setErrorMsg(null);
    setNoticeMsg(null);
    const res = await receiveStockRequest(req.id, user.token);
    if (!res.ok) {
      setErrorMsg(res.error ?? 'Receipt confirmation failed.');
      return;
    }
    setNoticeMsg(`Received ${res.request?.received_qty} ${req.unit} for ${req.request_code}.`);
    await Promise.all([loadNetworkData(), refreshLiveData()]);
  };

  return (
    <View style={styles.root}>
      <MainTopBar />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.responsiveColumn}>
          <View style={styles.headerCard}>
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>READ-ONLY NETWORK & REQUESTS</Text>
              <Text style={styles.headlineMd}>Warehouse Network</Text>
              <Text style={styles.monoSub}>
                Signed in as {activePlant.name} (Plant #{activePlant.backendId})
              </Text>
            </View>
            <Pressable
              onPress={loadNetworkData}
              disabled={loading || !user?.token}
              style={styles.refreshBtn}
            >
              <MaterialIcons name="refresh" size={18} color={Colors.primary} />
              <Text style={styles.refreshText}>{loading ? 'Loading' : 'Sync'}</Text>
            </Pressable>
          </View>

          {!user?.token && (
            <AlertBanner
              tone="warning"
              title="Warehouse Account Required"
              message="Developer Mode has no authenticated warehouse token. Sign in with a warehouse account (e.g. wh-mangaluru, wh-udupi, or wh-manipal) to view live network availability and send requests."
            />
          )}

          {errorMsg && <AlertBanner tone="error" message={errorMsg} />}
          {noticeMsg && <AlertBanner tone="success" message={noticeMsg} />}

          <View style={styles.tabRow}>
            {(
              [
                { key: 'availability', label: 'Other Warehouses' },
                { key: 'incoming', label: `Incoming (${incomingRequests.length})` },
                { key: 'outgoing', label: `Outgoing (${outgoingRequests.length})` },
              ] as const
            ).map((item) => {
              const active = tab === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => setTab(item.key)}
                  style={[styles.tabPill, active && styles.tabPillActive]}
                >
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {tab === 'availability' && (
            <View style={styles.section}>
              {selectedItem && (
                <View style={styles.formCard}>
                  <Text style={styles.eyebrow}>REQUEST STOCK</Text>
                  <Text style={styles.titleMd}>
                    {selectedItem.sku_name} from {selectedItem.plant_name}
                  </Text>
                  <Text style={styles.monoSub}>
                    Available at {selectedItem.plant_name}: {selectedItem.available_stock}{' '}
                    {selectedItem.unit}
                  </Text>
                  <TextInput
                    value={requestQty}
                    onChangeText={setRequestQty}
                    keyboardType="number-pad"
                    placeholder="Requested quantity"
                    placeholderTextColor={Colors.onSurfaceVariant}
                    style={styles.input}
                  />
                  <TextInput
                    value={requestReason}
                    onChangeText={setRequestReason}
                    placeholder="Reason or note (optional)"
                    placeholderTextColor={Colors.onSurfaceVariant}
                    style={styles.input}
                  />
                  <View style={styles.actionRow}>
                    <Button label="Submit Request" onPress={handleSubmitRequest} />
                    <Button
                      label="Cancel"
                      variant="secondary"
                      onPress={() => setSelectedItem(null)}
                    />
                  </View>
                </View>
              )}

              {availability.length === 0 ? (
                <View style={styles.card}>
                  <Text style={styles.monoSub}>
                    {user?.token
                      ? 'No other warehouse stock records returned.'
                      : 'Sign in with a warehouse account to view other warehouses.'}
                  </Text>
                </View>
              ) : (
                availability.map((item) => (
                  <View key={`${item.plant_id}-${item.sku_id}`} style={styles.card}>
                    <View style={styles.rowBetween}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.titleMd}>
                          {item.plant_name} · {item.sku_name}
                        </Text>
                        <Text style={styles.monoSub}>
                          {item.sku_code} · Avail: {item.available_stock} {item.unit}
                        </Text>
                        <Text style={styles.monoSub}>
                          Updated: {item.updated_at ? item.updated_at.slice(0, 16).replace('T', ' ') : 'N/A'}
                        </Text>
                      </View>
                      <StatusBadge
                        label={item.availability_status}
                        variant={statusBadgeVariant(item.availability_status)}
                      />
                    </View>
                    <Pressable
                      onPress={() => {
                        setSelectedItem(item);
                        setRequestQty(item.available_stock > 0 ? String(Math.min(10, item.available_stock)) : '10');
                      }}
                      style={styles.requestBtn}
                    >
                      <Text style={styles.requestBtnText}>Request Stock</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </View>
          )}

          {tab === 'incoming' && (
            <View style={styles.section}>
              {incomingRequests.length === 0 ? (
                <View style={styles.card}>
                  <Text style={styles.monoSub}>No incoming requests addressed to {activePlant.name}.</Text>
                </View>
              ) : (
                incomingRequests.map((req) => (
                  <View key={req.id} style={styles.card}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.titleMd}>
                        {req.request_code} · From {req.requesting_plant_name}
                      </Text>
                      <StatusBadge label={req.status} variant={statusBadgeVariant(req.status)} />
                    </View>
                    <Text style={styles.monoSub}>
                      {req.sku_name} ({req.sku_code}) · Requested: {req.requested_qty} {req.unit}
                      {req.approved_qty !== null ? ` · Approved: ${req.approved_qty}` : ''}
                    </Text>
                    {req.reason && <Text style={styles.monoSub}>Note: {req.reason}</Text>}
                    {req.rejection_reason && (
                      <Text style={styles.errorText}>Rejected: {req.rejection_reason}</Text>
                    )}

                    {req.status === 'PENDING' && (
                      <View style={{ gap: 8, marginTop: 6 }}>
                        {actionTargetId === req.id ? (
                          <>
                            <TextInput
                              value={approveQtyInput}
                              onChangeText={setApproveQtyInput}
                              keyboardType="number-pad"
                              placeholder={`Approve qty (max ${req.requested_qty})`}
                              placeholderTextColor={Colors.onSurfaceVariant}
                              style={styles.input}
                            />
                            <TextInput
                              value={rejectReasonInput}
                              onChangeText={setRejectReasonInput}
                              placeholder="Rejection reason (if rejecting)"
                              placeholderTextColor={Colors.onSurfaceVariant}
                              style={styles.input}
                            />
                            <View style={styles.actionRow}>
                              <Button label="Confirm Approve" onPress={() => handleApprove(req)} />
                              <Button
                                label="Confirm Reject"
                                variant="secondary"
                                onPress={() => handleReject(req)}
                              />
                            </View>
                          </>
                        ) : (
                          <Pressable
                            onPress={() => {
                              setActionTargetId(req.id);
                              setApproveQtyInput(String(req.requested_qty));
                            }}
                            style={styles.requestBtn}
                          >
                            <Text style={styles.requestBtnText}>Review (Approve / Reject)</Text>
                          </Pressable>
                        )}
                      </View>
                    )}

                    {(req.status === 'APPROVED' || req.status === 'PARTIALLY_APPROVED') && (
                      <View style={{ marginTop: 8 }}>
                        <Button
                          label={`Dispatch ${req.approved_qty ?? req.requested_qty} ${req.unit}`}
                          onPress={() => handleDispatch(req)}
                        />
                      </View>
                    )}
                  </View>
                ))
              )}
            </View>
          )}

          {tab === 'outgoing' && (
            <View style={styles.section}>
              {outgoingRequests.length === 0 ? (
                <View style={styles.card}>
                  <Text style={styles.monoSub}>No outgoing requests created by {activePlant.name}.</Text>
                </View>
              ) : (
                outgoingRequests.map((req) => (
                  <View key={req.id} style={styles.card}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.titleMd}>
                        {req.request_code} · To {req.supplying_plant_name}
                      </Text>
                      <StatusBadge label={req.status} variant={statusBadgeVariant(req.status)} />
                    </View>
                    <Text style={styles.monoSub}>
                      {req.sku_name} ({req.sku_code}) · Req: {req.requested_qty}
                      {req.approved_qty !== null ? ` · Appr: ${req.approved_qty}` : ''}
                      {req.dispatched_qty > 0 ? ` · Disp: ${req.dispatched_qty}` : ''}
                      {req.received_qty > 0 ? ` · Recv: ${req.received_qty}` : ''} {req.unit}
                    </Text>
                    {req.rejection_reason && (
                      <Text style={styles.errorText}>Rejection: {req.rejection_reason}</Text>
                    )}
                    {req.status === 'DISPATCHED' && (
                      <View style={{ marginTop: 8 }}>
                        <Button
                          label={`Confirm Receipt (${req.dispatched_qty} ${req.unit})`}
                          onPress={() => handleReceive(req)}
                        />
                      </View>
                    )}
                  </View>
                ))
              )}
            </View>
          )}
        </View>
      </ScrollView>
      <BottomNav />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.surface },
  scroll: { flex: 1 },
  content: { padding: Spacing.pageMargin, paddingBottom: Spacing.gutterXl, alignItems: 'center' },
  responsiveColumn: { width: '100%', maxWidth: 680, gap: Spacing.gutterMd },
  headerCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Radii.md,
    padding: Spacing.gutterLg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.gutterMd,
  },
  headerText: { flex: 1, gap: 2 },
  eyebrow: {
    fontFamily: FontFamily.monoSemiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: Colors.primary,
  },
  headlineMd: {
    fontFamily: FontFamily.headlineSemiBold,
    fontSize: 20,
    color: Colors.onSurface,
  },
  titleMd: {
    fontFamily: FontFamily.title,
    fontSize: 15,
    color: Colors.onSurface,
  },
  monoSub: {
    fontFamily: FontFamily.mono,
    fontSize: 12,
    color: Colors.onSurfaceVariant,
  },
  errorText: {
    fontFamily: FontFamily.mono,
    fontSize: 12,
    color: Colors.error,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: Radii.sm,
    backgroundColor: Colors.surfaceContainer,
  },
  refreshText: {
    fontFamily: FontFamily.label,
    fontSize: 12,
    color: Colors.primary,
  },
  tabRow: {
    flexDirection: 'row',
    gap: Spacing.gutterSm,
  },
  tabPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radii.sm,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainerLowest,
    alignItems: 'center',
  },
  tabPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tabText: {
    fontFamily: FontFamily.label,
    fontSize: 12,
    color: Colors.onSurface,
  },
  tabTextActive: {
    color: Colors.onPrimary,
  },
  section: { gap: Spacing.gutterMd },
  card: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Radii.md,
    padding: Spacing.gutterMd,
    gap: 6,
  },
  formCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: Radii.md,
    padding: Spacing.gutterMd,
    gap: Spacing.gutterSm,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.gutterSm,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: Colors.onSurface,
    backgroundColor: Colors.surface,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.gutterSm,
  },
  requestBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radii.sm,
    backgroundColor: Colors.primary,
  },
  requestBtnText: {
    fontFamily: FontFamily.label,
    fontSize: 12,
    color: Colors.onPrimary,
  },
});
