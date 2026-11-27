import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, FontFamily, Radii, Spacing } from '../../theme/tokens';

export type BannerTone = 'error' | 'warning' | 'success';

interface AlertBannerProps {
  tone: BannerTone;
  title?: string;
  message: string;
  icon?: keyof typeof MaterialIcons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
}

const TONE_MAP: Record<
  BannerTone,
  {
    bg: string;
    border: string;
    text: string;
    defaultIcon: keyof typeof MaterialIcons.glyphMap;
  }
> = {
  error: {
    bg: Colors.errorContainer,
    border: 'rgba(158, 42, 43, 0.3)',
    text: Colors.onErrorContainer,
    defaultIcon: 'error-outline',
  },
  warning: {
    bg: Colors.warningContainer,
    border: 'rgba(133, 82, 0, 0.3)',
    text: Colors.onWarningContainer,
    defaultIcon: 'info-outline',
  },
  success: {
    bg: Colors.successContainer,
    border: 'rgba(18, 61, 50, 0.3)',
    text: Colors.onSuccessContainer,
    defaultIcon: 'check-circle-outline',
  },
};

export const AlertBanner: React.FC<AlertBannerProps> = ({
  tone,
  title,
  message,
  icon,
  actionLabel,
  onAction,
}) => {
  const palette = TONE_MAP[tone];
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.container,
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}
    >
      <MaterialIcons
        name={icon ?? palette.defaultIcon}
        size={18}
        color={palette.text}
        style={styles.icon}
      />
      <View style={styles.textCol}>
        {title && (
          <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
        )}
        <Text style={[styles.message, { color: palette.text }]}>{message}</Text>
      </View>
      {actionLabel && onAction && (
        <Pressable
          onPress={onAction}
          hitSlop={8}
          accessibilityRole="button"
          style={styles.actionBtn}
        >
          <Text style={[styles.actionLabel, { color: palette.text }]}>
            {actionLabel}
          </Text>
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.gutterSm,
    paddingHorizontal: Spacing.gutterMd,
    paddingVertical: Spacing.gutterMd,
    borderRadius: Radii.md,
    borderWidth: 1,
  },
  icon: {
    marginTop: 1,
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: FontFamily.label,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  message: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 20,
  },
  actionBtn: {
    alignSelf: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  actionLabel: {
    fontFamily: FontFamily.label,
    fontSize: 12,
    textDecorationLine: 'underline',
  },
});
