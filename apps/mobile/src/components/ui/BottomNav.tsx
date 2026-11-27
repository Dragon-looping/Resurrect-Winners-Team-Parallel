import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, FontFamily, Radii, Spacing } from '../../theme/tokens';
import { useApp } from '../../context/AppContext';
import { ScreenName } from '../../types/inventory';

interface NavTab {
  screen: ScreenName;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  showCount?: boolean;
}

const TABS: NavTab[] = [
  { screen: 'Dashboard', label: 'Dashboard', icon: 'dashboard' },
  { screen: 'PlantSkuSelection', label: 'Plant & SKU', icon: 'inventory-2' },
  {
    screen: 'InventoryEventHistory',
    label: 'History',
    icon: 'history',
    showCount: true,
  },
];

export const BottomNav: React.FC = () => {
  const { currentScreen, navigate, pendingAndFailedCount } = useApp();

  return (
    <View style={styles.container} accessibilityRole="tablist">
      {TABS.map((tab) => {
        const isActive = currentScreen === tab.screen;
        const color = isActive ? Colors.primary : Colors.onSurfaceVariant;
        return (
          <Pressable
            key={tab.screen}
            onPress={() => navigate(tab.screen)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            style={[
              styles.tab,
              isActive && styles.tabActive,
            ]}
          >
            <View style={styles.iconRow}>
              <MaterialIcons name={tab.icon} size={20} color={color} />
              {tab.showCount && pendingAndFailedCount > 0 && (
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{pendingAndFailedCount}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.label, { color }]} numberOfLines={1}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.outlineVariant,
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    minHeight: 56,
    paddingVertical: Spacing.gutterXs,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 2,
    borderTopColor: 'transparent',
    gap: 2,
  },
  tabActive: {
    borderTopColor: Colors.primary,
    backgroundColor: Colors.surfaceContainerLowest,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  countBadge: {
    marginLeft: 4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    backgroundColor: Colors.warning,
    borderRadius: Radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    lineHeight: 14,
    color: Colors.onWarning,
    fontVariant: ['tabular-nums'],
  },
  label: {
    fontFamily: FontFamily.label,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.2,
  },
});
