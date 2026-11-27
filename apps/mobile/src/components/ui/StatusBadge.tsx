import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, FontFamily, Radii, Spacing } from '../../theme/tokens';

export type BadgeVariant = 'success' | 'warning' | 'error' | 'neutral';

interface StatusBadgeProps {
  label: string;
  variant: BadgeVariant;
  icon?: keyof typeof MaterialIcons.glyphMap;
  dot?: boolean;
}

const VARIANT_STYLES: Record<
  BadgeVariant,
  { bg: string; text: string; dotColor: string }
> = {
  success: {
    bg: Colors.successContainer,
    text: Colors.onSuccessContainer,
    dotColor: Colors.success,
  },
  warning: {
    bg: Colors.warningContainer,
    text: Colors.onWarningContainer,
    dotColor: Colors.warning,
  },
  error: {
    bg: Colors.errorContainer,
    text: Colors.onErrorContainer,
    dotColor: Colors.error,
  },
  neutral: {
    bg: Colors.surfaceContainerLow,
    text: Colors.onSurfaceVariant,
    dotColor: Colors.outline,
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  variant,
  icon,
  dot = false,
}) => {
  const palette = VARIANT_STYLES[variant];
  return (
    <View
      accessibilityRole="text"
      style={[styles.container, { backgroundColor: palette.bg }]}
    >
      {dot && (
        <View style={[styles.dot, { backgroundColor: palette.dotColor }]} />
      )}
      {icon && (
        <MaterialIcons name={icon} size={14} color={palette.text} />
      )}
      <Text style={[styles.label, { color: palette.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.gutterXs,
    paddingHorizontal: Spacing.gutterSm,
    paddingVertical: Spacing.gutterXs,
    borderRadius: Radii.sm,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: Radii.full,
  },
  label: {
    fontFamily: FontFamily.label,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
