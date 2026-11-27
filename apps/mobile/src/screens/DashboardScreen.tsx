import React, { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, FontFamily, Radii, Spacing } from '../theme/tokens';
import { useApp } from '../context/AppContext';
import { MainTopBar } from '../components/ui/TopBar';
import { BottomNav } from '../components/ui/BottomNav';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Button } from '../components/ui/Button';
import { BadgeVariant, StatusBadge } from '../components/ui/StatusBadge';

export const DashboardScreen: React.FC = () => {
  const {
    activePlant,
    plantSkus,
    activeSku,
    inboundShipments,
    events,
    isOffline,
    lastSyncIst,
    heartbeatIst,
    pendingAndFailedCount,
    failedCount,
    navigate,
    selectSku,
  } = useApp();

  const totals = useMemo(() => {
    const onHand = plantSkus.reduce((acc, s) => acc + s.onHand, 0);
    const reserved = plantSkus.reduce((acc, s) => acc + s.reserved, 0);
    return {
      onHand,
      reserved,
      netAvail: Math.max(0, onHand - reserved),
      skuCount: plantSkus.length,
    };
  }, [plantSkus]);

  const stockOutSku = useMemo(
    () =>
      plantSkus.find(
        (s) => typeof s.minThreshold === 'number' && s.onHand < s.minThreshold
      ),
    [plantSkus]
  );

  const inbound = useMemo(
    () => inboundShipments.find((s) => s.plantId === activePlant.id),
    [inboundShipments, activePlant.id]
  );

  const recentEvents = useMemo(() => events.slice(0, 4), [events]);

  const firstFailedEvent = useMemo(
    () => events.find((e) => e.status === 'failed'),
    [events]
  );

  return (
    <View style={styles.root}>
      <MainTopBar />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.responsiveColumn}>
          {/* Assigned-Plant Command Header & Feed Status */}
          <View style={styles.card}>
            <View style={styles.plantHeaderRow}>
              <View style={styles.plantInfo}>
                <Text style={styles.eyebrow}>Assigned Manufacturing Plant</Text>
                <Text style={styles.headlineMd}>
                  {activePlant.id} · {activePlant.name}
                </Text>
                <Text style={styles.monoSub}>{activePlant.sublabel}</Text>
              </View>
              <Pressable
                onPress={() => navigate('PlantSkuSelection')}
                accessibilityRole="button"
                accessibilityLabel="Switch plant or SKU"
                style={({ pressed }) => [
                  styles.switchBtn,
                  pressed && styles.pressedSurface,
                ]}
              >
                <Text style={styles.switchBtnText}>Switch</Text>
              </Pressable>
            </View>

            <View style={styles.feedDivider}>
              <View style={styles.feedTopRow}>
                <View style={styles.feedStatusRow}>
                  <MaterialIcons
                    name={isOffline ? 'pause-circle-outline' : 'check-circle-outline'}
                    size={16}
                    color={isOffline ? Colors.warning : Colors.success}
                  />
                  <Text
                    style={[
                      styles.feedStatusLabel,
                      { color: isOffline ? Colors.onWarningContainer : Colors.onSuccessContainer },
                    ]}
                  >
                    {isOffline
                      ? 'Warehouse Feed Paused · Stale'
                      : 'Warehouse Feed Live · Synced'}
                  </Text>
                </View>
                <Pressable
                  onPress={() => navigate('InventoryEventHistory')}
                  hitSlop={8}
                >
                  <Text style={styles.primaryLink}>
                    Queue ({pendingAndFailedCount})
                  </Text>
                </Pressable>
              </View>

              <View style={styles.feedMetaRow}>
                <Text style={styles.monoSub}>Heartbeat: {heartbeatIst}</Text>
                <Text style={styles.monoSub}>Last sync: {lastSyncIst}</Text>
              </View>
              {isOffline && (
                <Text style={styles.staleNotice}>
                  Last usable update: {lastSyncIst}
                </Text>
              )}
            </View>
          </View>

          {/* Stock-Out Risk Warning (Separate from Feed/Sync Warnings) */}
          {stockOutSku && (
            <AlertBanner
              tone="error"
              icon="warning"
              title="Stock-Out Warning · Raw Material"
              message={`${stockOutSku.id} · ${stockOutSku.onHand} EA (Min ${stockOutSku.minThreshold})`}
              actionLabel="Inspect"
              onAction={() => {
                selectSku(stockOutSku.id);
                navigate('PlantSkuSelection');
              }}
            />
          )}

          {/* Stock & Queue Ledger Grid */}
          <View style={styles.ledgerCard}>
            <View style={styles.ledgerRowTop}>
              <View style={[styles.ledgerCell, styles.ledgerCellLeft]}>
                <Text style={styles.eyebrow}>On-Hand Stock</Text>
                <Text style={styles.kpiValue}>
                  {totals.onHand.toLocaleString()}
                </Text>
                <Text style={styles.monoSub}>
                  Motors & Fans · {totals.skuCount} SKUs
                </Text>
              </View>
              <View style={styles.ledgerCell}>
                <Text style={styles.eyebrow}>Reserved Stock</Text>
                <Text style={styles.kpiValue}>
                  {totals.reserved.toLocaleString()}
                </Text>
                <Text style={styles.monoSub}>EA · Production WO</Text>
              </View>
            </View>

            <View style={styles.ledgerRowBottom}>
              <View style={[styles.ledgerBottomCell, styles.ledgerCellLeft]}>
                <Text style={styles.eyebrow}>Net Avail</Text>
                <Text style={styles.netAvailValue}>
                  {totals.netAvail.toLocaleString()}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  if (firstFailedEvent) {
                    navigate('EventDetailsRetry', {
                      eventId: firstFailedEvent.eventId,
                    });
                  } else {
                    navigate('InventoryEventHistory');
                  }
                }}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.ledgerBottomCell,
                  pressed && styles.pressedSurface,
                ]}
              >
                <Text
                  style={[
                    styles.eyebrow,
                    { color: failedCount > 0 ? Colors.error : Colors.onSurfaceVariant },
                  ]}
                >
                  {failedCount} Failed
                </Text>
                <Text
                  style={[
                    styles.retryLink,
                    { color: failedCount > 0 ? Colors.error : Colors.primary },
                  ]}
                >
                  {failedCount > 0 ? 'Retry' : 'Ledger'}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Inbound Motor Shipment Card */}
          {inbound && (
            <View style={styles.card}>
              <View style={styles.inboundHeader}>
                <Text style={styles.eyebrow}>Inbound Motor Shipment</Text>
                <StatusBadge
                  label={inbound.status === 'delayed' ? 'Delayed' : 'On Time'}
                  variant={inbound.status === 'delayed' ? 'warning' : 'success'}
                />
              </View>
              <View style={styles.inboundBody}>
                <View style={styles.inboundTextCol}>
                  <Text style={styles.titleMd}>
                    {inbound.skuId} · +{inbound.qty} EA
                  </Text>
                  <Text style={styles.monoSub}>
                    Expected {inbound.expectedTime} · ETA {inbound.etaTime}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    selectSku(inbound.skuId);
                    navigate('GoodsReceived');
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.primaryLink}>Receive</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Primary Operational Actions */}
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.eyebrow}>Record Warehouse Activity</Text>
              <Pressable
                onPress={() => navigate('PlantSkuSelection')}
                hitSlop={8}
              >
                <Text style={styles.activeSkuLink}>{activeSku.id}</Text>
              </Pressable>
            </View>

            <Button
              label="Record Goods Received"
              variant="with-icon"
              leftIcon="move-to-inbox"
              rightIcon="arrow-forward"
              onPress={() => navigate('GoodsReceived')}
            />

            <View style={styles.secondaryActionRow}>
              <Button
                label="Dispatch Stock"
                variant="secondary"
                leftIcon="local-shipping"
                onPress={() => navigate('GoodsDispatch')}
                style={styles.halfBtn}
              />
              <Button
                label="Stock Count"
                variant="secondary"
                leftIcon="fact-check"
                onPress={() => navigate('PhysicalStockCorrection')}
                style={styles.halfBtn}
              />
            </View>
          </View>

          {/* Recent Activity Timeline */}
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.eyebrow}>Activity Timeline · Today</Text>
              <Pressable
                onPress={() => navigate('InventoryEventHistory')}
                hitSlop={8}
              >
                <Text style={styles.primaryLink}>Full Ledger</Text>
              </Pressable>
            </View>

            <View style={styles.card}>
              <View style={styles.timelineList}>
                {recentEvents.map((evt, idx) => {
                  const dotColor =
                    evt.status === 'failed'
                      ? Colors.error
                      : evt.status === 'pending'
                        ? Colors.warning
                        : Colors.success;
                  const badgeVariant: BadgeVariant =
                    evt.status === 'failed'
                      ? 'error'
                      : evt.status === 'pending'
                        ? 'warning'
                        : 'success';
                  const badgeLabel =
                    evt.status === 'failed'
                      ? 'Failed'
                      : evt.status === 'pending'
                        ? 'Pending'
                        : 'Submitted';
                  const deltaPrefix = evt.qtyDelta > 0 ? '+' : '';
                  const opShort =
                    evt.operation === 'goods_received'
                      ? 'Received'
                      : evt.operation === 'goods_dispatch'
                        ? 'Dispatch'
                        : 'Correction';

                  return (
                    <Pressable
                      key={evt.eventId}
                      onPress={() =>
                        navigate('EventDetailsRetry', { eventId: evt.eventId })
                      }
                      style={[
                        styles.timelineRow,
                        idx < recentEvents.length - 1 && styles.timelineSpacing,
                      ]}
                    >
                      <View style={[styles.timelineDot, { backgroundColor: dotColor }]} />
                      <View style={styles.timelineContent}>
                        <View style={styles.timelineTextCol}>
                          <Text style={styles.titleMd} numberOfLines={1}>
                            {opShort} · {evt.skuId}
                          </Text>
                          <Text style={styles.monoSub} numberOfLines={1}>
                            {evt.eventId} · {deltaPrefix}
                            {evt.qtyDelta} EA · {evt.timestampIst}
                          </Text>
                        </View>
                        <StatusBadge label={badgeLabel} variant={badgeVariant} />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      <BottomNav />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: Spacing.pageMargin,
    paddingBottom: Spacing.gutterXl,
    alignItems: 'center',
  },
  responsiveColumn: {
    width: '100%',
    maxWidth: 680,
    gap: Spacing.gutterLg,
  },
  card: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Radii.md,
    padding: Spacing.gutterLg,
    gap: Spacing.gutterMd,
  },
  plantHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.gutterMd,
  },
  plantInfo: {
    flex: 1,
    gap: Spacing.gutterXs,
  },
  eyebrow: {
    fontFamily: FontFamily.label,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: Colors.onSurfaceVariant,
  },
  headlineMd: {
    fontFamily: FontFamily.headlineSemiBold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.15,
    color: Colors.onSurface,
  },
  titleMd: {
    fontFamily: FontFamily.title,
    fontSize: 16,
    lineHeight: 22,
    color: Colors.onSurface,
  },
  monoSub: {
    fontFamily: FontFamily.mono,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.onSurfaceVariant,
    fontVariant: ['tabular-nums'],
  },
  switchBtn: {
    minHeight: 48,
    paddingHorizontal: Spacing.gutterMd,
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Radii.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchBtnText: {
    fontFamily: FontFamily.label,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.onSurface,
  },
  pressedSurface: {
    backgroundColor: Colors.surfaceContainer,
  },
  feedDivider: {
    paddingTop: Spacing.gutterSm,
    borderTopWidth: 1,
    borderTopColor: Colors.outlineVariant,
    gap: Spacing.gutterXs,
  },
  feedTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.gutterSm,
  },
  feedStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.gutterXs,
  },
  feedStatusLabel: {
    fontFamily: FontFamily.label,
    fontSize: 12,
    lineHeight: 16,
  },
  primaryLink: {
    fontFamily: FontFamily.label,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.primary,
    textDecorationLine: 'underline',
  },
  activeSkuLink: {
    fontFamily: FontFamily.mono,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.primary,
  },
  feedMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  staleNotice: {
    fontFamily: FontFamily.mono,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.onWarningContainer,
  },
  ledgerCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Radii.md,
    overflow: 'hidden',
  },
  ledgerRowTop: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  ledgerCell: {
    flex: 1,
    padding: Spacing.gutterLg,
    gap: Spacing.gutterXs,
  },
  ledgerCellLeft: {
    borderRightWidth: 1,
    borderRightColor: Colors.outlineVariant,
  },
  kpiValue: {
    fontFamily: FontFamily.display,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.25,
    color: Colors.onSurface,
    fontVariant: ['tabular-nums'],
  },
  ledgerRowBottom: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceContainerLow,
  },
  ledgerBottomCell: {
    flex: 1,
    paddingHorizontal: Spacing.gutterLg,
    paddingVertical: Spacing.gutterMd,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.gutterXs,
  },
  netAvailValue: {
    fontFamily: FontFamily.mono,
    fontSize: 16,
    lineHeight: 22,
    color: Colors.primary,
    fontVariant: ['tabular-nums'],
  },
  retryLink: {
    fontFamily: FontFamily.mono,
    fontSize: 12,
    lineHeight: 16,
    textDecorationLine: 'underline',
  },
  inboundHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.gutterSm,
  },
  inboundBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.gutterSm,
  },
  inboundTextCol: {
    flex: 1,
    gap: Spacing.gutterXs,
  },
  sectionBlock: {
    gap: Spacing.gutterSm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  secondaryActionRow: {
    flexDirection: 'row',
    gap: Spacing.gutterSm,
  },
  halfBtn: {
    flex: 1,
  },
  timelineList: {
    borderLeftWidth: 1,
    borderLeftColor: Colors.outlineVariant,
    marginLeft: 6,
  },
  timelineRow: {
    paddingLeft: Spacing.gutterLg,
    position: 'relative',
  },
  timelineSpacing: {
    paddingBottom: Spacing.gutterLg,
  },
  timelineDot: {
    position: 'absolute',
    left: -5,
    top: 5,
    width: 10,
    height: 10,
    borderRadius: Radii.full,
  },
  timelineContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.gutterSm,
  },
  timelineTextCol: {
    flex: 1,
    gap: 2,
  },
});
