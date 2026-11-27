import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Colors, FontFamily, Radii, Spacing } from '../theme/tokens';
import { useApp } from '../context/AppContext';
import { SubScreenTopBar } from '../components/ui/TopBar';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Button } from '../components/ui/Button';
import { BadgeVariant } from '../components/ui/StatusBadge';

export const EventDetailsRetryScreen: React.FC = () => {
  const {
    events,
    selectedEventId,
    isOffline,
    goBack,
    navigate,
    retryEvent,
    discardEvent,
    selectPlant,
    selectSku,
  } = useApp();

  const event = useMemo(
    () => events.find((e) => e.eventId === selectedEventId) ?? events[0],
    [events, selectedEventId]
  );

  const [retrying, setRetrying] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  if (!event) {
    return (
      <View style={styles.root}>
        <SubScreenTopBar
          eventId="NO EVENT"
          title="Event Details"
          badgeLabel="Empty"
          badgeVariant="neutral"
          onBack={goBack}
        />
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>Event not found.</Text>
        </View>
      </View>
    );
  }

  const badgeVariant: BadgeVariant =
    event.status === 'failed'
      ? 'error'
      : event.status === 'pending'
        ? 'warning'
        : 'success';

  const badgeLabel =
    event.status === 'failed'
      ? 'Failed'
      : event.status === 'pending'
        ? 'Pending'
        : 'Submitted';

  const deltaPrefix = event.qtyDelta > 0 ? '+' : '';

  const handleRetry = async () => {
    setFeedback(null);
    setRetrying(true);
    try {
      const synced = await retryEvent(event.eventId);
      if (synced) {
        setFeedback({
          tone: 'success',
          message: `Event ${event.eventId} synced successfully via idempotent POST /events.`,
        });
      } else if (isOffline) {
        setFeedback({
          tone: 'warning',
          message: `Device is offline. ${event.eventId} remains queued locally.`,
        });
      } else {
        setFeedback({
          tone: 'error',
          message: `Retry failed for ${event.eventId}. Check backend connectivity and try again.`,
        });
      }
    } finally {
      setRetrying(false);
    }
  };

  const handleEditPayload = () => {
    selectPlant(event.plantId);
    selectSku(event.skuId);
    const targetScreen =
      event.operation === 'goods_received'
        ? 'GoodsReceived'
        : event.operation === 'goods_dispatch'
          ? 'GoodsDispatch'
          : 'PhysicalStockCorrection';
    navigate(targetScreen, { editEventId: event.eventId });
  };

  const handleDiscard = () => {
    discardEvent(event.eventId);
    navigate('InventoryEventHistory');
  };

  return (
    <View style={styles.root}>
      <SubScreenTopBar
        eventId={event.eventId}
        title="Event Details"
        badgeLabel={badgeLabel}
        badgeVariant={badgeVariant}
        badgeDot
        onBack={goBack}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.responsiveColumn}>
          {/* Status / Failure Diagnostics Banner */}
          {event.status === 'failed' && event.errorDiagnostics && (
            <AlertBanner
              tone="error"
              title={
                event.quarantined
                  ? `Event Quarantined · ${event.errorDiagnostics.code}`
                  : `Backend Sync Failed · ${event.errorDiagnostics.code}`
              }
              message={event.errorDiagnostics.message}
            />
          )}

          {event.status === 'pending' && (
            <AlertBanner
              tone="warning"
              title="Queued Locally · Pending Sync"
              message={`Event ${event.eventId} is stored locally and will sync idempotently without duplicate stock changes.`}
            />
          )}

          {event.status === 'submitted' && (
            <AlertBanner
              tone="success"
              title="Synced & Verified"
              message={`Event ${event.eventId} was acknowledged by the backend inventory ledger.`}
            />
          )}

          {feedback && (
            <AlertBanner tone={feedback.tone} message={feedback.message} />
          )}

          {/* Submission Timeline */}
          <View style={styles.card}>
            <Text style={styles.eyebrow}>Submission Timeline</Text>
            <View style={styles.timelineList}>
              {event.attempts.map((attempt, idx) => {
                const dotColor =
                  attempt.tone === 'error'
                    ? Colors.error
                    : attempt.tone === 'warning'
                      ? Colors.warning
                      : Colors.primary;
                const isError = attempt.tone === 'error';
                const isLast = idx === event.attempts.length - 1;

                return (
                  <View
                    key={`${attempt.timeIst}-${idx}`}
                    style={[
                      styles.timelineItem,
                      !isLast && styles.timelineSpacing,
                    ]}
                  >
                    <View
                      style={[styles.timelineDot, { backgroundColor: dotColor }]}
                    />
                    <Text
                      style={[
                        styles.timelineTitle,
                        isError && { color: Colors.error },
                      ]}
                    >
                      {attempt.label}
                    </Text>
                    <Text
                      style={[
                        styles.monoSub,
                        isError && { color: Colors.error },
                      ]}
                    >
                      {attempt.timeIst} · {attempt.detail}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Transaction Payload Ledger */}
          <View style={styles.payloadCard}>
            <View style={styles.payloadHeader}>
              <Text style={styles.eyebrow}>Transaction Payload</Text>
            </View>

            <PayloadRow label="Stable Event ID" value={event.eventId} mono />
            <PayloadRow label="Operation" value={event.operationLabel} title />
            <PayloadRow
              label="Plant / Bin"
              value={`${event.plantId} · ${event.bin}`}
              mono
            />
            <PayloadRow label="SKU" value={event.skuId} mono />
            <PayloadRow
              label="Quantity Delta"
              value={`${deltaPrefix}${event.qtyDelta} EA`}
              monoLg
              valueColor={
                event.qtyDelta < 0
                  ? Colors.error
                  : event.qtyDelta > 0
                    ? Colors.primary
                    : Colors.onSurface
              }
            />
            <PayloadRow
              label={event.referenceLabel}
              value={event.referenceValue}
              mono
              isLast={!event.auditNote}
            />
            {event.auditNote && (
              <PayloadRow label="Audit Note" value={event.auditNote} isLast />
            )}
          </View>

          {/* Recovery Actions */}
          {event.status !== 'submitted' && (
            <View style={styles.recoveryBar}>
              {!event.quarantined && (
                <Button
                  label={
                    retrying
                      ? `Retrying ${event.eventId}...`
                      : `Retry ${event.eventId}`
                  }
                  leftIcon="sync"
                  onPress={handleRetry}
                  loading={retrying}
                  disabled={retrying}
                />
              )}

              <View style={styles.secondaryRow}>
                <Button
                  label="Edit Payload"
                  variant={event.quarantined ? 'primary' : 'secondary'}
                  onPress={handleEditPayload}
                  style={styles.halfBtn}
                />
                <Button
                  label="Discard Event"
                  variant="destructive"
                  onPress={handleDiscard}
                  style={styles.halfBtn}
                />
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

interface PayloadRowProps {
  label: string;
  value: string;
  mono?: boolean;
  monoLg?: boolean;
  title?: boolean;
  valueColor?: string;
  isLast?: boolean;
}

const PayloadRow: React.FC<PayloadRowProps> = ({
  label,
  value,
  mono,
  monoLg,
  title,
  valueColor = Colors.onSurface,
  isLast = false,
}) => (
  <View style={[styles.payloadRow, !isLast && styles.rowBorder]}>
    <Text style={styles.payloadLabel}>{label}</Text>
    <Text
      style={[
        title
          ? styles.payloadTitleVal
          : monoLg
            ? styles.payloadMonoLgVal
            : mono
              ? styles.payloadMonoVal
              : styles.payloadBodyVal,
        { color: valueColor },
      ]}
    >
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.surface },
  scroll: { flex: 1 },
  content: { padding: Spacing.pageMargin, paddingBottom: 48, alignItems: 'center' },
  responsiveColumn: { width: '100%', maxWidth: 680, gap: Spacing.gutterLg },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontFamily: FontFamily.body, fontSize: 14, color: Colors.onSurfaceVariant },
  card: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Radii.md,
    padding: Spacing.gutterLg,
    gap: Spacing.gutterMd,
  },
  eyebrow: {
    fontFamily: FontFamily.label,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: Colors.onSurfaceVariant,
  },
  timelineList: {
    borderLeftWidth: 1,
    borderLeftColor: Colors.outlineVariant,
    marginLeft: 6,
  },
  timelineItem: {
    paddingLeft: Spacing.gutterLg,
    position: 'relative',
    gap: 2,
  },
  timelineSpacing: {
    paddingBottom: Spacing.gutterMd,
  },
  timelineDot: {
    position: 'absolute',
    left: -5,
    top: 4,
    width: 10,
    height: 10,
    borderRadius: Radii.full,
  },
  timelineTitle: {
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
  },
  payloadCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Radii.md,
    overflow: 'hidden',
  },
  payloadHeader: {
    paddingHorizontal: Spacing.gutterLg,
    paddingVertical: Spacing.gutterSm,
    backgroundColor: Colors.surfaceContainerLow,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  payloadRow: {
    paddingHorizontal: Spacing.gutterLg,
    paddingVertical: Spacing.gutterMd,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.gutterMd,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  payloadLabel: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.onSurfaceVariant,
  },
  payloadMonoVal: {
    fontFamily: FontFamily.mono,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'right',
    flexShrink: 1,
  },
  payloadMonoLgVal: {
    fontFamily: FontFamily.mono,
    fontSize: 16,
    lineHeight: 22,
    fontVariant: ['tabular-nums'],
  },
  payloadTitleVal: {
    fontFamily: FontFamily.title,
    fontSize: 16,
    lineHeight: 22,
  },
  payloadBodyVal: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'right',
    flexShrink: 1,
  },
  recoveryBar: {
    paddingTop: Spacing.gutterMd,
    borderTopWidth: 1,
    borderTopColor: Colors.outlineVariant,
    gap: Spacing.gutterSm,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: Spacing.gutterSm,
  },
  halfBtn: {
    flex: 1,
  },
});
