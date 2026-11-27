import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, FontFamily, Radii, Spacing } from '../../theme/tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'with-icon';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  leftIcon?: keyof typeof MaterialIcons.glyphMap;
  rightIcon?: keyof typeof MaterialIcons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export const Button: React.FC<ButtonProps> = ({
  label,
  onPress,
  variant = 'primary',
  leftIcon,
  rightIcon,
  disabled = false,
  loading = false,
  style,
  accessibilityLabel,
}) => {
  const isPrimary = variant === 'primary' || variant === 'with-icon';
  const isDestructive = variant === 'destructive';

  const bgColor = isPrimary
    ? Colors.primary
    : Colors.surfaceContainerLowest;
  const textColor = isPrimary
    ? Colors.onPrimary
    : isDestructive
      ? Colors.error
      : Colors.onSurface;
  const borderColor = isPrimary
    ? Colors.primary
    : isDestructive
      ? Colors.error
      : Colors.outlineVariant;

  const isWithIcon = variant === 'with-icon' && rightIcon;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.base,
        isWithIcon ? styles.withIconLayout : styles.centeredLayout,
        {
          backgroundColor: bgColor,
          borderColor,
          opacity: disabled ? 0.55 : pressed ? 0.9 : 1,
          transform: [{ scale: pressed && !disabled ? 0.988 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <View style={styles.contentRow}>
          {leftIcon && (
            <MaterialIcons name={leftIcon} size={18} color={textColor} />
          )}
          <Text
            style={[
              styles.label,
              isPrimary ? styles.labelLg : styles.labelMd,
              { color: textColor },
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </View>
      )}
      {isWithIcon && !loading && (
        <MaterialIcons name={rightIcon} size={18} color={textColor} />
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: Spacing.gutterLg,
    borderRadius: Radii.default,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  centeredLayout: {
    justifyContent: 'center',
  },
  withIconLayout: {
    minHeight: 52,
    justifyContent: 'space-between',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.gutterSm,
  },
  label: {
    fontFamily: FontFamily.label,
  },
  labelLg: {
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: 0.1,
  },
  labelMd: {
    fontSize: 13,
    lineHeight: 17,
    letterSpacing: 0.2,
  },
});
