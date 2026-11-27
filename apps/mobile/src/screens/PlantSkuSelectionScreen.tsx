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
import { SkuCategory } from '../types/inventory';

type FilterMode = 'all' | SkuCategory;

export const PlantSkuSelectionScreen: React.FC = () => {
  const {
    plants,
    activePlant,
    plantSkus,
    activeSku,
    selectPlant,
    selectSku,
    navigate,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [plantDropdownOpen, setPlantDropdownOpen] = useState(false);

  const counts = useMemo(() => {
    const motors = plantSkus.filter((s) => s.category === 'motor').length;
    const fans = plantSkus.filter((s) => s.category === 'fan').length;
    return { all: plantSkus.length, motor: motors, fan: fans };
  }, [plantSkus]);

  const filteredSkus = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return plantSkus.filter((sku) => {
      const matchesFilter = filter === 'all' || sku.category === filter;
      const matchesQuery =
        !q ||
        sku.id.toLowerCase().includes(q) ||
        sku.name.toLowerCase().includes(q) ||
        sku.bin.toLowerCase().includes(q) ||
        sku.shortDesc.toLowerCase().includes(q);
      return matchesFilter && matchesQuery;
    });
  }, [plantSkus, filter, searchQuery]);

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
          {/* Plant Context Card */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.headlineMd}>Plant & SKU Selection</Text>
              <Text style={styles.monoSub}>{plants.length} Plants</Text>
            </View>

            <Text style={styles.eyebrow}>Active Manufacturing Plant</Text>

            <Pressable
              onPress={() => setPlantDropdownOpen((prev) => !prev)}
              accessibilityRole="button"
              accessibilityLabel="Select active manufacturing plant"
              style={styles.selectBox}
            >
              <Text style={styles.selectText} numberOfLines={1}>
                {activePlant.id} · {activePlant.name} ({activePlant.godownLabel})
              </Text>
              <MaterialIcons
                name={plantDropdownOpen ? 'expand-less' : 'expand-more'}
                size={22}
                color={Colors.onSurfaceVariant}
              />
            </Pressable>

            {plantDropdownOpen && (
              <View style={styles.dropdownList}>
                {plants.map((plant) => {
                  const selected = plant.id === activePlant.id;
                  return (
                    <Pressable
                      key={plant.id}
                      onPress={() => {
                        selectPlant(plant.id);
                        setPlantDropdownOpen(false);
                      }}
                      style={[
                        styles.dropdownItem,
                        selected && styles.dropdownItemActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dropdownItemText,
                          selected && styles.dropdownItemTextActive,
                        ]}
                      >
                        {plant.id} · {plant.name} ({plant.godownLabel})
                      </Text>
                      {selected && (
                        <MaterialIcons
                          name="check"
                          size={18}
                          color={Colors.primary}
                        />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          {/* SKU Search & Category Filter */}
          <View style={styles.searchSection}>
            <View style={styles.searchWrap}>
              <MaterialIcons
                name="search"
                size={20}
                color={Colors.onSurfaceVariant}
                style={styles.searchIcon}
              />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search motors, fans, or bin..."
                placeholderTextColor={Colors.onSurfaceVariant}
                accessibilityLabel="Search SKU or Bin"
                style={styles.searchInput}
              />
              {searchQuery.length > 0 ? (
                <Pressable
                  onPress={() => setSearchQuery('')}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  style={styles.trailingIconBtn}
                >
                  <MaterialIcons
                    name="close"
                    size={18}
                    color={Colors.onSurfaceVariant}
                  />
                </Pressable>
              ) : (
                <View style={styles.trailingIconBtn}>
                  <MaterialIcons
                    name="qr-code-scanner"
                    size={20}
                    color={Colors.primary}
                  />
                </View>
              )}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
            >
              {(
                [
                  { key: 'all', label: `All (${counts.all})` },
                  { key: 'motor', label: `Motors · Raw (${counts.motor})` },
                  { key: 'fan', label: `Fans · Finished (${counts.fan})` },
                ] as const
              ).map((chip) => {
                const active = filter === chip.key;
                return (
                  <Pressable
                    key={chip.key}
                    onPress={() => setFilter(chip.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[
                      styles.chip,
                      active ? styles.chipActive : styles.chipInactive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        active ? styles.chipTextActive : styles.chipTextInactive,
                      ]}
                    >
                      {chip.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Compact SKU Stock Ledger */}
          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, styles.colSku]}>
                SKU / Category
              </Text>
              <Text style={[styles.tableHeaderText, styles.colStock]}>
                Stock
              </Text>
              <Text style={[styles.tableHeaderText, styles.colAction]}>
                Action
              </Text>
            </View>

            {filteredSkus.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>
                  No SKUs match "{searchQuery}" in {activePlant.id}.
                </Text>
              </View>
            ) : (
              filteredSkus.map((sku, index) => {
                const isSelected = sku.id === activeSku.id;
                const isLow =
                  typeof sku.minThreshold === 'number' &&
                  sku.onHand < sku.minThreshold;
                const isLast = index === filteredSkus.length - 1;

                return (
                  <View
                    key={`${sku.plantId}-${sku.id}`}
                    style={[
                      styles.tableRow,
                      isSelected && styles.tableRowActive,
                      !isLast && styles.rowBorder,
                    ]}
                  >
                    <View style={styles.colSku}>
                      <Text style={styles.skuCode}>{sku.id}</Text>
                      <Text style={styles.skuDesc} numberOfLines={1}>
                        {sku.shortDesc}
                      </Text>
                    </View>

                    <View style={styles.colStock}>
                      <Text
                        style={[
                          styles.stockQty,
                          isLow && { color: Colors.error },
                        ]}
                      >
                        {sku.onHand.toLocaleString()}
                      </Text>
                      <Text
                        style={[
                          styles.stockSub,
                          isLow && { color: Colors.error },
                        ]}
                      >
                        {isLow
                          ? `Min ${sku.minThreshold}`
                          : `${sku.reserved.toLocaleString()} rsv`}
                      </Text>
                    </View>

                    <View style={styles.colAction}>
                      <Pressable
                        onPress={() => {
                          selectSku(sku.id);
                          navigate(
                            isLow
                              ? 'PhysicalStockCorrection'
                              : sku.category === 'motor'
                                ? 'GoodsReceived'
                                : 'GoodsDispatch'
                          );
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Select ${sku.id}`}
                        style={[
                          styles.actionBtn,
                          isSelected
                            ? styles.actionBtnActive
                            : styles.actionBtnDefault,
                        ]}
                      >
                        <Text
                          style={[
                            styles.actionBtnText,
                            isSelected
                              ? styles.actionBtnTextActive
                              : styles.actionBtnTextDefault,
                          ]}
                        >
                          {isSelected ? 'Active' : 'Select'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
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
    gap: Spacing.gutterSm,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
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
  },
  eyebrow: {
    fontFamily: FontFamily.label,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
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
    gap: Spacing.gutterSm,
  },
  selectText: {
    flex: 1,
    fontFamily: FontFamily.title,
    fontSize: 15,
    lineHeight: 20,
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
    paddingVertical: Spacing.gutterSm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  dropdownItemActive: {
    backgroundColor: Colors.secondaryContainer,
  },
  dropdownItemText: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: Colors.onSurface,
  },
  dropdownItemTextActive: {
    fontFamily: FontFamily.bodyBold,
    color: Colors.primary,
  },
  searchSection: {
    gap: Spacing.gutterSm,
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
    minHeight: 48,
    paddingLeft: 40,
    paddingRight: 48,
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Radii.default,
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.onSurface,
  },
  trailingIconBtn: {
    position: 'absolute',
    right: 4,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipsRow: {
    flexDirection: 'row',
    gap: Spacing.gutterXs,
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: Spacing.gutterMd,
    borderRadius: Radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: Colors.primary,
  },
  chipInactive: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  chipText: {
    fontFamily: FontFamily.label,
    fontSize: 12,
    lineHeight: 16,
  },
  chipTextActive: {
    color: Colors.onPrimary,
  },
  chipTextInactive: {
    color: Colors.onSurface,
  },
  tableCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Radii.md,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLow,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
    paddingVertical: Spacing.gutterSm,
    paddingHorizontal: Spacing.gutterMd,
  },
  tableHeaderText: {
    fontFamily: FontFamily.label,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: Colors.onSurfaceVariant,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.gutterMd,
    paddingHorizontal: Spacing.gutterMd,
  },
  tableRowActive: {
    backgroundColor: 'rgba(220, 231, 222, 0.45)',
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  colSku: {
    flex: 1.5,
    paddingRight: Spacing.gutterSm,
  },
  colStock: {
    flex: 0.9,
    alignItems: 'flex-end',
    paddingRight: Spacing.gutterSm,
  },
  colAction: {
    width: 76,
    alignItems: 'flex-end',
  },
  skuCode: {
    fontFamily: FontFamily.mono,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.onSurface,
  },
  skuDesc: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.onSurfaceVariant,
  },
  stockQty: {
    fontFamily: FontFamily.mono,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.onSurface,
    fontVariant: ['tabular-nums'],
  },
  stockSub: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    lineHeight: 15,
    color: Colors.onSurfaceVariant,
    fontVariant: ['tabular-nums'],
  },
  actionBtn: {
    minHeight: 40,
    paddingHorizontal: Spacing.gutterMd,
    borderRadius: Radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnActive: {
    backgroundColor: Colors.primary,
  },
  actionBtnDefault: {
    backgroundColor: Colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  actionBtnText: {
    fontFamily: FontFamily.label,
    fontSize: 12,
    lineHeight: 16,
  },
  actionBtnTextActive: {
    color: Colors.onPrimary,
  },
  actionBtnTextDefault: {
    color: Colors.onSurface,
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
});
