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
import { SubScreenTopBar } from '../components/ui/TopBar';
import { QuantityStepper } from '../components/ui/QuantityStepper';
import { Button } from '../components/ui/Button';
import { generateStableEventId } from '../services/eventService';

const REASON_CODES = [
  'CC-01 · Cycle Count Variance',
  'DM-02 · Damaged / Scrap',
  'MP-03 · Misplaced Bin Transfer',
  'UM-04 · Unit Conversion Error',
];

export const PhysicalStockCorrectionScreen: React.FC = () => {
  const {
    activePlant,
    activeSku,
    events,
    editingEvent,
    isOffline,
    goBack,
    navigate,
    recordOperation,
  } = useApp();

  const systemQty = activeSku.onHand;

  const [draftEventId] = useState(
    () => editingEvent?.eventId ?? generateStableEventId(events.length)
  );
  const [counted, setCounted] = useState<number>(() => {
    if (
      editingEvent &&
      editingEvent.operation === 'stock_correction' &&
      typeof editingEvent.newQty === 'number'
    ) {
      return editingEvent.newQty;
    }
    return Math.max(0, systemQty - 15);
  });
  const [reasonCode, setReasonCode] = useState(
    editingEvent?.referenceValue ?? REASON_CODES[0]
  );
  const [reasonDropdownOpen, setReasonDropdownOpen] = useState(false);
  const [auditNote, setAuditNote] = useState(
    editingEvent?.auditNote ?? 'Bin M-04 lower rack recount verified'
  );
  const [submitting, setSubmitting] = useState(false);

  const variance = useMemo(() => counted - systemQty, [counted, systemQty]);
  const variancePrefix = variance > 0 ? '+' : '';
  const varianceColor =
    variance < 0
      ? Colors.error
      : variance > 0
        ? Colors.primary
        : Colors.onSurfaceVariant;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await recordOperation({
        operation: 'stock_correction',
        plantId: activePlant.id,
        skuId: activeSku.id,
        qty: counted,
        referenceValue: reasonCode,
        destinationOrBin: activeSku.bin,
        auditNote: auditNote.trim() || undefined,
        existingEventId: editingEvent?.eventId ?? draftEventId,
      });
      navigate('InventoryEventHistory');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <SubScreenTopBar
        eventId={draftEventId}
        title="Stock Correction"
        badgeLabel={isOffline ? 'Offline' : 'Online'}
        badgeVariant={isOffline ? 'warning' : 'success'}
        badgeIcon={isOffline ? 'cloud-off' : 'cloud-done'}
        onBack={goBack}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.responsiveColumn}>
          {/* Locked Plant & SKU Context Card */}
          <View style={styles.contextCard}>
            <View style={styles.contextInfo}>
              <Text style={styles.monoSub}>
                {activePlant.id} · {activePlant.name.toUpperCase()} · {activeSku.bin}
              </Text>
              <Text style={styles.titleMd} numberOfLines={1}>
                {activeSku.id} · {activeSku.name}
              </Text>
            </View>
            <Pressable
              onPress={() => navigate('PlantSkuSelection')}
              hitSlop={8}
            >
              <Text style={styles.changeLink}>Change</Text>
            </Pressable>
          </View>

          {/* Hero Physical Count Input Card */}
          <View style={styles.heroCard}>
            <View style={styles.heroHeader}>
              <Text style={styles.heroEyebrow}>Actual Physical Count (EA)</Text>
              <View style={styles.replaceBadge}>
                <Text style={styles.replaceBadgeText}>Replaces System</Text>
              </View>
            </View>

            <QuantityStepper value={counted} onChange={setCounted} min={0} hero />

            <View style={styles.ruleBanner}>
              <MaterialIcons
                name="swap-horiz"
                size={16}
                color={Colors.primary}
                style={{ marginTop: 2 }}
              />
              <Text style={styles.ruleBannerText}>
                Physical count <Text style={styles.bold}>replaces</Text> system stock (
                <Text style={styles.monoInline}>
                  {systemQty.toLocaleString()} → {counted.toLocaleString()} EA
                </Text>
                ). It does not add to existing stock.
              </Text>
            </View>
          </View>

          {/* System vs Physical Comparison Ledger */}
          <View style={styles.comparisonCard}>
            <View style={[styles.compCell, styles.compBorderRight]}>
              <Text style={styles.compLabel}>System</Text>
              <Text style={styles.compMonoMuted}>
                {systemQty.toLocaleString()}
              </Text>
            </View>
            <View style={[styles.compCell, styles.compBorderRight]}>
              <Text style={styles.compLabel}>Counted</Text>
              <Text style={styles.compMono}>{counted.toLocaleString()}</Text>
            </View>
            <View
              style={[
                styles.compCell,
                variance < 0
                  ? { backgroundColor: 'rgba(249, 226, 226, 0.5)' }
                  : variance > 0
                    ? { backgroundColor: 'rgba(220, 231, 222, 0.5)' }
                    : undefined,
              ]}
            >
              <Text
                style={[
                  styles.compLabel,
                  variance < 0 && { color: Colors.onErrorContainer },
                ]}
              >
                Variance
              </Text>
              <Text style={[styles.compMono, { color: varianceColor }]}>
                {variancePrefix}
                {variance} EA
              </Text>
            </View>
          </View>

          {/* Reason & Audit Note */}
          <View style={styles.card}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Correction Reason Code</Text>
              <Pressable
                onPress={() => setReasonDropdownOpen((prev) => !prev)}
                style={styles.selectBox}
              >
                <Text style={styles.bodySelectText} numberOfLines={1}>
                  {reasonCode}
                </Text>
                <MaterialIcons
                  name={reasonDropdownOpen ? 'expand-less' : 'expand-more'}
                  size={20}
                  color={Colors.onSurfaceVariant}
                />
              </Pressable>
              {reasonDropdownOpen && (
                <View style={styles.dropdownList}>
                  {REASON_CODES.map((opt) => (
                    <Pressable
                      key={opt}
                      onPress={() => {
                        setReasonCode(opt);
                        setReasonDropdownOpen(false);
                      }}
                      style={[
                        styles.dropdownItem,
                        reasonCode === opt && styles.dropdownItemActive,
                      ]}
                    >
                      <Text style={styles.dropdownText}>{opt}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Audit Note (Optional)</Text>
              <TextInput
                value={auditNote}
                onChangeText={setAuditNote}
                placeholder="e.g. Lower rack recount verified"
                placeholderTextColor={Colors.onSurfaceVariant}
                style={styles.textInput}
              />
            </View>
          </View>

          {/* Bottom Action Bar */}
          <View style={styles.bottomBar}>
            <Button
              label={
                submitting
                  ? 'Submitting...'
                  : `Set Balance to ${counted.toLocaleString()} EA (${variancePrefix}${variance})`
              }
              onPress={handleSubmit}
              loading={submitting}
              disabled={submitting}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.surface },
  scroll: { flex: 1 },
  content: { padding: Spacing.pageMargin, paddingBottom: 32, alignItems: 'center' },
  responsiveColumn: { width: '100%', maxWidth: 680, gap: Spacing.gutterLg },
  contextCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Radii.md,
    padding: Spacing.gutterMd,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.gutterSm,
  },
  contextInfo: { flex: 1, gap: 2, minWidth: 0 },
  monoSub: {
    fontFamily: FontFamily.mono,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.onSurfaceVariant,
  },
  titleMd: {
    fontFamily: FontFamily.title,
    fontSize: 16,
    lineHeight: 22,
    color: Colors.onSurface,
  },
  changeLink: {
    fontFamily: FontFamily.label,
    fontSize: 12,
    color: Colors.primary,
    textDecorationLine: 'underline',
  },
  heroCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: Radii.md,
    padding: Spacing.gutterLg,
    gap: Spacing.gutterMd,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.gutterSm,
  },
  heroEyebrow: {
    fontFamily: FontFamily.label,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: Colors.primary,
  },
  replaceBadge: {
    backgroundColor: Colors.secondaryContainer,
    paddingHorizontal: Spacing.gutterSm,
    paddingVertical: Spacing.gutterXs,
    borderRadius: Radii.sm,
  },
  replaceBadgeText: {
    fontFamily: FontFamily.label,
    fontSize: 11,
    color: Colors.primary,
  },
  ruleBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.gutterSm,
    backgroundColor: 'rgba(220, 231, 222, 0.5)',
    paddingHorizontal: Spacing.gutterMd,
    paddingVertical: Spacing.gutterSm,
    borderRadius: Radii.sm,
  },
  ruleBannerText: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.onSecondaryContainer,
  },
  bold: {
    fontFamily: FontFamily.bodyBold,
  },
  monoInline: {
    fontFamily: FontFamily.mono,
    fontSize: 13,
  },
  comparisonCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Radii.md,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  compCell: {
    flex: 1,
    padding: Spacing.gutterMd,
    gap: Spacing.gutterXs,
  },
  compBorderRight: {
    borderRightWidth: 1,
    borderRightColor: Colors.outlineVariant,
  },
  compLabel: {
    fontFamily: FontFamily.label,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: Colors.onSurfaceVariant,
  },
  compMonoMuted: {
    fontFamily: FontFamily.mono,
    fontSize: 16,
    lineHeight: 22,
    color: Colors.onSurfaceVariant,
    fontVariant: ['tabular-nums'],
  },
  compMono: {
    fontFamily: FontFamily.mono,
    fontSize: 16,
    lineHeight: 22,
    color: Colors.onSurface,
    fontVariant: ['tabular-nums'],
  },
  card: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Radii.md,
    padding: Spacing.gutterLg,
    gap: Spacing.gutterLg,
  },
  fieldGroup: { gap: Spacing.gutterXs },
  label: {
    fontFamily: FontFamily.label,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.2,
    color: Colors.onSurface,
  },
  selectBox: {
    minHeight: 48,
    paddingHorizontal: Spacing.gutterMd,
    backgroundColor: Colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Radii.default,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bodySelectText: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: Colors.onSurface,
  },
  dropdownList: {
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Radii.default,
    backgroundColor: Colors.surfaceContainerLowest,
    overflow: 'hidden',
  },
  dropdownItem: {
    minHeight: 44,
    paddingHorizontal: Spacing.gutterMd,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  dropdownItemActive: { backgroundColor: Colors.secondaryContainer },
  dropdownText: { fontFamily: FontFamily.body, fontSize: 14, color: Colors.onSurface },
  textInput: {
    minHeight: 48,
    paddingHorizontal: Spacing.gutterMd,
    backgroundColor: Colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Radii.default,
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: Colors.onSurface,
  },
  bottomBar: {
    paddingTop: Spacing.gutterMd,
    borderTopWidth: 1,
    borderTopColor: Colors.outlineVariant,
  },
});
