import React, { useMemo, useState } from 'react';
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
import { EventStatus } from '../types/inventory';

type StatusFilter = 'all' | EventStatus;

export const InventoryEventHistoryScreen: React.FC = () => {
  const {
    activePlant,
    events,
    lastSyncIst,
    isOffline,
    isSyncingLiveData,
    eventsPagination,
    navigate,
    retryAllEvents,
    loadMoreEvents,
  } = useApp();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [retryingAll, setRetryingAll] = useState(false);
  const [syncNotice, setSyncNotice] = useState<{
    tone: 'warning' | 'success' | 'error';
    message: string;
  } | null>(null);

  const counts = useMemo(() => {
    const failed = events.filter((e) => e.status === 'failed').length;
    const pending = events.filter((e) => e.status === 'pending').length;
    const submitted = events.filter((e) => e.status === 'submitted').length;
    return { all: events.length, failed, pending, submitted };
  }, [events]);

  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return events.filter((e) => {
      const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
      const matchesQuery =
        !q ||
        e.eventId.toLowerCase().includes(q) ||
        e.skuId.toLowerCase().includes(q) ||
        e.operationLabel.toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [events, statusFilter, searchQuery]);

  const handleRetryAll = async () => {
    setSyncNotice(null);
    if (counts.failed + counts.pending === 0) {
      setSyncNotice({
        tone: 'success',
        message: 'All events are already synced.',
      });
      return;
    }
    setRetryingAll(true);
    try {
      const { attempted, succeeded } = await retryAllEvents();
      if (isOffline) {
        setSyncNotice({
          tone: 'warning',
          message: `Device is offline. ${attempted} event(s) remain safely queued with stable IDs.`,
        });
      } else if (succeeded === attempted) {
        setSyncNotice({
          tone: 'success',
          message: `Synced ${succeeded} of ${attempted} event(s) to backend.`,
        });
      } else {
        setSyncNotice({
          tone: 'error',
          message: `Synced ${succeeded} of ${attempted} event(s). Failed events retained for retry.`,
        });
      }
    } finally {
      setRetryingAll(false);
    }
  };

  return (
    <View style={styles.root}>
      <MainTopBar />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.responsiveColumn}>
          {/* Ledger Header & Retry All Action */}
          <View style={styles.headerCard}>
            <View style={styles.headerInfo}>
              <Text style={styles.headlineMd}>Event History</Text>
              <Text style={styles.monoSub}>
                {activePlant.id} · Last sync {lastSyncIst}
              </Text>
            </View>
            <Pressable
              onPress={handleRetryAll}
              disabled={retryingAll}
              accessibilityRole="button"
              accessibilityLabel="Retry all pending and failed events"
              style={({ pressed }) => [
                styles.retryAllBtn,
                pressed && styles.pressedSurface,
                retryingAll && { opacity: 0.7 },
              ]}
            >
              <MaterialIcons name="sync" size={16} color={Colors.onSurface} />
              <Text style={styles.retryAllText}>
                {retryingAll ? 'Syncing...' : 'Retry All'}
              </Text>
            </Pressable>
          </View>

          {syncNotice && (
            <AlertBanner tone={syncNotice.tone} message={syncNotice.message} />
          )}

          {/* Search Input */}
          <View style={styles.searchWrap}>
            <MaterialIcons
              name="search"
              size={18}
              color={Colors.onSurfaceVariant}
              style={styles.searchIcon}
            />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Filter by event ID, SKU, or operation..."
              placeholderTextColor={Colors.onSurfaceVariant}
              style={styles.searchInput}
            />
          </View>

          {/* Status Filter Tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsRow}
          >
            {(
              [
                { key: 'all', label: `All (${counts.all})`, textColor: Colors.onSurface },
                { key: 'failed', label: `Failed (${counts.failed})`, textColor: Colors.error },
                { key: 'pending', label: `Pending (${counts.pending})`, textColor: Colors.warning },
                { key: 'submitted', label: `Submitted (${counts.submitted})`, textColor: Colors.onSurface },
              ] as const
            ).map((tab) => {
              const active = statusFilter === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => setStatusFilter(tab.key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.tabChip,
                    active ? styles.tabActive : styles.tabInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.tabText,
                      { color: active ? Colors.onPrimary : tab.textColor },
                    ]}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Compact Operational Ledger */}
          <View style={styles.ledgerCard}>
            <View style={styles.ledgerSectionHeader}>
              <Text style={styles.eyebrow}>Today · 27 Nov 2026</Text>
              <Text style={styles.monoSub}>Stable Event IDs</Text>
            </View>

            {filteredEvents.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>
                  No inventory events match this filter.
                </Text>
              </View>
            ) : (
              filteredEvents.map((evt, index) => {
                const isFailed = evt.status === 'failed';
                const badgeVariant: BadgeVariant = isFailed
                  ? 'error'
                  : evt.status === 'pending'
                    ? 'warning'
                    : 'success';
                const badgeLabel = isFailed
                  ? 'Retry'
                  : evt.status === 'pending'
                    ? 'Pending'
                    : 'Submitted';
                const deltaPrefix = evt.qtyDelta > 0 ? '+' : '';
                const isLast = index === filteredEvents.length - 1;

                return (
                  <Pressable
                    key={evt.eventId}
                    onPress={() =>
                      navigate('EventDetailsRetry', { eventId: evt.eventId })
                    }
                    style={({ pressed }) => [
                      styles.eventRow,
                      isFailed && styles.failedRow,
                      pressed && styles.pressedSurface,
                      !isLast && styles.rowBorder,
                    ]}
                  >
                    <View style={styles.eventMain}>
                      <View style={styles.eventTopLine}>
                        <Text
                          style={[
                            styles.eventId,
                            isFailed && { color: Colors.error },
                          ]}
                        >
                          {evt.eventId}
                        </Text>
                        <Text style={styles.eventTitle} numberOfLines={1}>
                          {evt.operationLabel}
                        </Text>
                      </View>
                      <Text style={styles.monoSub} numberOfLines={1}>
                        {evt.skuId} · {deltaPrefix}
                        {evt.qtyDelta} EA · {evt.timestampIst} ·{' '}
                        {evt.serverConfirmed ? 'Server' : 'Local'}
                      </Text>
                    </View>

                    <View style={styles.eventRight}>
                      <StatusBadge label={badgeLabel} variant={badgeVariant} />
                      <MaterialIcons
                        name="chevron-right"
                        size={18}
                        color={isFailed ? Colors.error : Colors.onSurfaceVariant}
                      />
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>

          {eventsPagination.hasMore && (
            <Pressable
              onPress={loadMoreEvents}
              disabled={isSyncingLiveData}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.loadMoreBtn,
                pressed && styles.pressedSurface,
                isSyncingLiveData && { opacity: 0.65 },
              ]}
            >
              <Text style={styles.loadMoreText}>
                {isSyncingLiveData
                  ? 'Loading events...'
                  : `Load More (${events.length} of ${eventsPagination.total})`}
              </Text>
            </Pressable>
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
  responsiveColumn: { width: '100%', maxWidth: 680, gap: Spacing.gutterLg },
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
  headerInfo: { flex: 1, gap: Spacing.gutterXs },
  headlineMd: {
    fontFamily: FontFamily.headlineSemiBold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.15,
    color: Colors.onSurface,
  },
  monoSub: {
    fontFamily: FontFamily.mono,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.onSurfaceVariant,
    fontVariant: ['tabular-nums'],
  },
  retryAllBtn: {
    minHeight: 48,
    paddingHorizontal: Spacing.gutterMd,
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Radii.default,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.gutterXs,
  },
  retryAllText: {
    fontFamily: FontFamily.label,
    fontSize: 12,
    color: Colors.onSurface,
  },
  pressedSurface: {
    backgroundColor: Colors.surfaceContainerLow,
  },
  searchWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: Spacing.gutterMd,
    zIndex: 1,
  },
  searchInput: {
    minHeight: 44,
    paddingLeft: 38,
    paddingRight: Spacing.gutterMd,
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Radii.default,
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: Colors.onSurface,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: Spacing.gutterXs,
  },
  tabChip: {
    minHeight: 36,
    paddingHorizontal: Spacing.gutterMd,
    borderRadius: Radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: Colors.primary,
  },
  tabInactive: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  tabText: {
    fontFamily: FontFamily.label,
    fontSize: 12,
    lineHeight: 16,
  },
  ledgerCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Radii.md,
    overflow: 'hidden',
  },
  ledgerSectionHeader: {
    paddingHorizontal: Spacing.gutterLg,
    paddingVertical: Spacing.gutterSm,
    backgroundColor: Colors.surfaceContainerLow,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    fontFamily: FontFamily.label,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: Colors.onSurfaceVariant,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.gutterMd,
    paddingHorizontal: Spacing.gutterLg,
    paddingVertical: Spacing.gutterMd,
    minHeight: 72,
  },
  failedRow: {
    backgroundColor: 'rgba(249, 226, 226, 0.25)',
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  eventMain: {
    flex: 1,
    gap: Spacing.gutterXs,
    minWidth: 0,
  },
  eventTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.gutterXs,
  },
  eventId: {
    fontFamily: FontFamily.mono,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.onSurfaceVariant,
    flexShrink: 0,
  },
  eventTitle: {
    fontFamily: FontFamily.title,
    fontSize: 16,
    lineHeight: 22,
    color: Colors.onSurface,
    flexShrink: 1,
  },
  eventRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.gutterXs,
  },
  emptyState: {
    padding: Spacing.gutterXl,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: Colors.onSurfaceVariant,
  },
  loadMoreBtn: {
    minHeight: 44,
    borderRadius: Radii.default,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreText: {
    fontFamily: FontFamily.label,
    fontSize: 13,
    color: Colors.primary,
  },
});
