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
import { AlertBanner } from '../components/ui/AlertBanner';
import { Button } from '../components/ui/Button';
import { generateStableEventId } from '../services/eventService';

const BIN_OPTIONS = [
  { value: 'BIN M-04', label: 'BIN M-04 · Motor Rack' },
  { value: 'BIN M-05', label: 'BIN M-05 · Overflow' },
  { value: 'QC-HOLD-01', label: 'QC-HOLD-01 · Inspection Bay' },
];

export const GoodsReceivedScreen: React.FC = () => {
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

  const [draftEventId] = useState(
    () => editingEvent?.eventId ?? generateStableEventId(events.length)
  );
  const [qty, setQty] = useState<number>(
    editingEvent && editingEvent.operation === 'goods_received'
      ? Math.max(1, Math.abs(editingEvent.qtyDelta))
      : 240
  );
  const [poNumber, setPoNumber] = useState(
    editingEvent?.referenceValue ?? 'PO-2026-88412'
  );
  const [targetBin, setTargetBin] = useState(
    editingEvent?.destinationOrBin ?? activeSku.bin
  );
  const [binDropdownOpen, setBinDropdownOpen] = useState(false);
  const [condition, setCondition] = useState<'Intact / Pass' | 'Hold / QC'>(
    editingEvent?.conditionOrHandler === 'Hold / QC'
      ? 'Hold / QC'
      : 'Intact / Pass'
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const newBalance = useMemo(() => activeSku.onHand + qty, [activeSku.onHand, qty]);

  const handleSubmit = async () => {
    setFormError(null);
    if (!poNumber.trim()) {
      setFormError('Delivery Note / PO Number is required.');
      return;
    }
    if (qty < 1) {
      setFormError('Quantity received must be at least 1 EA.');
      return;
    }

    setSubmitting(true);
    try {
      await recordOperation({
        operation: 'goods_received',
        plantId: activePlant.id,
        skuId: activeSku.id,
        qty,
        referenceValue: poNumber.trim(),
        destinationOrBin: targetBin,
        conditionOrHandler: condition,
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
        title="Goods Received"
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
              <Text style={styles.monoSub}>
                {activeSku.category === 'motor' ? 'Raw Material' : 'Finished Good'} · Current:{' '}
                {activeSku.onHand.toLocaleString()} EA
              </Text>
            </View>
            <Pressable
              onPress={() => navigate('PlantSkuSelection')}
              hitSlop={8}
            >
              <Text style={styles.changeLink}>Change</Text>
            </Pressable>
          </View>

          {formError && <AlertBanner tone="error" message={formError} />}

          {/* Prominent Quantity Input (Additive) */}
          <View style={styles.card}>
            <View style={styles.qtyHeader}>
              <Text style={styles.eyebrow}>Quantity Received (EA)</Text>
              <Text style={styles.newBalText}>
                New: <Text style={styles.newBalBold}>{newBalance.toLocaleString()}</Text> EA
              </Text>
            </View>

            <QuantityStepper value={qty} onChange={setQty} min={1} />

            <Text style={styles.ruleText}>
              Increases inventory: {activeSku.onHand.toLocaleString()} + {qty.toLocaleString()} ={' '}
              {newBalance.toLocaleString()} EA
            </Text>
          </View>

          {/* Reference & Destination Fields */}
          <View style={styles.card}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Delivery Note / PO Number</Text>
              <View style={styles.inputWithIconWrap}>
                <TextInput
                  value={poNumber}
                  onChangeText={setPoNumber}
                  placeholder="PO-2026-XXXXX"
                  placeholderTextColor={Colors.onSurfaceVariant}
                  style={[styles.monoInput, { paddingRight: 44 }]}
                />
                <View style={styles.trailingIcon}>
                  <MaterialIcons
                    name="qr-code-scanner"
                    size={20}
                    color={Colors.primary}
                  />
                </View>
              </View>
              <Text style={styles.helperText}>
                Inbound shipment reference or supplier delivery challan
              </Text>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Target Storage Bin</Text>
              <Pressable
                onPress={() => setBinDropdownOpen((prev) => !prev)}
                style={styles.selectBox}
              >
                <Text style={styles.monoSelectText}>
                  {BIN_OPTIONS.find((b) => b.value === targetBin)?.label ?? targetBin}
                </Text>
                <MaterialIcons
                  name={binDropdownOpen ? 'expand-less' : 'expand-more'}
                  size={20}
                  color={Colors.onSurfaceVariant}
                />
              </Pressable>
              {binDropdownOpen && (
                <View style={styles.dropdownList}>
                  {BIN_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.value}
                      onPress={() => {
                        setTargetBin(opt.value);
                        setBinDropdownOpen(false);
                      }}
                      style={[
                        styles.dropdownItem,
                        targetBin === opt.value && styles.dropdownItemActive,
                      ]}
                    >
                      <Text style={styles.dropdownText}>{opt.label}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              <Text style={styles.helperText}>
                Default assigned bin for {activeSku.id}
              </Text>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Receiving Inspection</Text>
              <View style={styles.radioRow}>
                {(['Intact / Pass', 'Hold / QC'] as const).map((option) => {
                  const selected = condition === option;
                  return (
                    <Pressable
                      key={option}
                      onPress={() => setCondition(option)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      style={[
                        styles.radioCard,
                        selected ? styles.radioCardActive : styles.radioCardInactive,
                      ]}
                    >
                      <MaterialIcons
                        name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
                        size={18}
                        color={selected ? Colors.primary : Colors.onSurfaceVariant}
                      />
                      <Text style={styles.radioLabel}>{option}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Bottom Action Bar */}
          <View style={styles.bottomBar}>
            {isOffline && (
              <AlertBanner
                tone="warning"
                message={`Offline: queues ${draftEventId} locally until reconnect.`}
              />
            )}
            <Button
              label={
                submitting
                  ? 'Recording...'
                  : `Record Receipt (+${qty.toLocaleString()} EA)`
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
  card: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Radii.md,
    padding: Spacing.gutterLg,
    gap: Spacing.gutterMd,
  },
  qtyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    fontFamily: FontFamily.label,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: Colors.onSurfaceVariant,
  },
  newBalText: {
    fontFamily: FontFamily.mono,
    fontSize: 12,
    color: Colors.primary,
  },
  newBalBold: {
    fontFamily: FontFamily.monoSemiBold,
  },
  ruleText: {
    fontFamily: FontFamily.mono,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.primary,
    textAlign: 'center',
  },
  fieldGroup: { gap: Spacing.gutterXs },
  label: {
    fontFamily: FontFamily.label,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.2,
    color: Colors.onSurface,
  },
  inputWithIconWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  monoInput: {
    minHeight: 48,
    paddingHorizontal: Spacing.gutterMd,
    backgroundColor: Colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Radii.default,
    fontFamily: FontFamily.mono,
    fontSize: 13,
    color: Colors.onSurface,
  },
  trailingIcon: {
    position: 'absolute',
    right: 4,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helperText: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.onSurfaceVariant,
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
  monoSelectText: {
    fontFamily: FontFamily.mono,
    fontSize: 13,
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
  dropdownText: { fontFamily: FontFamily.mono, fontSize: 13, color: Colors.onSurface },
  radioRow: { flexDirection: 'row', gap: Spacing.gutterSm },
  radioCard: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: Spacing.gutterMd,
    borderRadius: Radii.default,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.gutterSm,
  },
  radioCardActive: {
    backgroundColor: 'rgba(220, 231, 222, 0.45)',
    borderColor: Colors.primary,
  },
  radioCardInactive: {
    backgroundColor: Colors.surfaceContainerLow,
    borderColor: Colors.outlineVariant,
  },
  radioLabel: {
    fontFamily: FontFamily.label,
    fontSize: 12,
    color: Colors.onSurface,
  },
  bottomBar: {
    paddingTop: Spacing.gutterMd,
    borderTopWidth: 1,
    borderTopColor: Colors.outlineVariant,
    gap: Spacing.gutterSm,
  },
});
