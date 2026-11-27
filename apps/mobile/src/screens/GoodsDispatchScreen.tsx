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

const DOCK_OPTIONS = [
  'Outbound Dock B — Mangaluru',
  'Fan Assembly Line 2',
  'Inter-Plant Transfer — Udupi',
];

export const GoodsDispatchScreen: React.FC = () => {
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

  const availableQty = useMemo(
    () => Math.max(0, activeSku.onHand - activeSku.reserved),
    [activeSku.onHand, activeSku.reserved]
  );

  const [draftEventId] = useState(
    () => editingEvent?.eventId ?? generateStableEventId(events.length)
  );
  const [qty, setQty] = useState<number>(() => {
    const initial =
      editingEvent && editingEvent.operation === 'goods_dispatch'
        ? Math.abs(editingEvent.qtyDelta)
        : 180;
    return availableQty > 0 ? Math.min(availableQty, Math.max(1, initial)) : 0;
  });
  const [workOrder, setWorkOrder] = useState(
    editingEvent?.referenceValue ?? 'WO-7731-B'
  );
  const [destination, setDestination] = useState(
    editingEvent?.destinationOrBin ?? DOCK_OPTIONS[0]
  );
  const [dockDropdownOpen, setDockDropdownOpen] = useState(false);
  const [handlerId, setHandlerId] = useState(
    editingEvent?.conditionOrHandler ?? 'TUG-09 · R. Shetty'
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const remaining = Math.max(0, availableQty - qty);

  const handleSubmit = async () => {
    setFormError(null);
    if (availableQty <= 0) {
      setFormError('No unreserved stock available to dispatch for this SKU.');
      return;
    }
    if (qty < 1 || qty > availableQty) {
      setFormError(
        `Dispatch quantity must be between 1 and ${availableQty.toLocaleString()} EA.`
      );
      return;
    }
    if (!workOrder.trim()) {
      setFormError('Work Order / Dispatch Reference is required.');
      return;
    }

    setSubmitting(true);
    try {
      await recordOperation({
        operation: 'goods_dispatch',
        plantId: activePlant.id,
        skuId: activeSku.id,
        qty,
        referenceValue: workOrder.trim(),
        destinationOrBin: destination,
        conditionOrHandler: handlerId.trim(),
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
        title="Goods Dispatch"
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
              <Text style={styles.availSub}>
                {activeSku.category === 'fan' ? 'Finished Good' : 'Raw Material'} · Avail:{' '}
                {availableQty.toLocaleString()} EA ({activeSku.reserved.toLocaleString()} Rsv)
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

          {/* Prominent Quantity Input */}
          <View style={styles.card}>
            <View style={styles.qtyHeader}>
              <Text style={styles.eyebrow}>Quantity to Dispatch (EA)</Text>
              <Pressable
                onPress={() => setQty(availableQty)}
                hitSlop={8}
              >
                <Text style={styles.maxLink}>
                  Max {availableQty.toLocaleString()}
                </Text>
              </Pressable>
            </View>

            <QuantityStepper
              value={qty}
              onChange={setQty}
              min={availableQty > 0 ? 1 : 0}
              max={availableQty}
            />

            <Text style={styles.remainingText}>
              Remaining available after dispatch: {remaining.toLocaleString()} EA
            </Text>
          </View>

          {/* Reference & Destination Fields */}
          <View style={styles.card}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Work Order / Dispatch Reference</Text>
              <View style={styles.inputWithIconWrap}>
                <TextInput
                  value={workOrder}
                  onChangeText={setWorkOrder}
                  placeholder="WO-XXXX-X"
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
                Production work order or outbound gate pass
              </Text>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Destination Line / Dock</Text>
              <Pressable
                onPress={() => setDockDropdownOpen((prev) => !prev)}
                style={styles.selectBox}
              >
                <Text style={styles.bodySelectText} numberOfLines={1}>
                  {destination}
                </Text>
                <MaterialIcons
                  name={dockDropdownOpen ? 'expand-less' : 'expand-more'}
                  size={20}
                  color={Colors.onSurfaceVariant}
                />
              </Pressable>
              {dockDropdownOpen && (
                <View style={styles.dropdownList}>
                  {DOCK_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt}
                      onPress={() => {
                        setDestination(opt);
                        setDockDropdownOpen(false);
                      }}
                      style={[
                        styles.dropdownItem,
                        destination === opt && styles.dropdownItemActive,
                      ]}
                    >
                      <Text style={styles.dropdownText}>{opt}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Handler / Tugger ID</Text>
              <TextInput
                value={handlerId}
                onChangeText={setHandlerId}
                placeholder="TUG-09 · Operator"
                placeholderTextColor={Colors.onSurfaceVariant}
                style={styles.monoInput}
              />
            </View>
          </View>

          {/* Bottom Action Bar */}
          <View style={styles.bottomBar}>
            <Button
              label={
                submitting
                  ? 'Dispatching...'
                  : `Dispatch Stock (-${qty.toLocaleString()} EA)`
              }
              onPress={handleSubmit}
              loading={submitting}
              disabled={submitting || availableQty <= 0}
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
  availSub: {
    fontFamily: FontFamily.mono,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.primary,
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
  maxLink: {
    fontFamily: FontFamily.label,
    fontSize: 12,
    color: Colors.primary,
    textDecorationLine: 'underline',
  },
  remainingText: {
    fontFamily: FontFamily.mono,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.onSurfaceVariant,
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
  bottomBar: {
    paddingTop: Spacing.gutterMd,
    borderTopWidth: 1,
    borderTopColor: Colors.outlineVariant,
  },
});
