import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Colors, FontFamily, Radii, Spacing } from '../../theme/tokens';

interface QuantityStepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  hero?: boolean;
}

const DELTAS = [-10, -1, 1, 10] as const;

export const QuantityStepper: React.FC<QuantityStepperProps> = ({
  value,
  onChange,
  min = 0,
  max,
  hero = false,
}) => {
  const clamp = (n: number) => {
    let next = Math.max(min, n);
    if (typeof max === 'number') {
      next = Math.min(max, next);
    }
    return next;
  };

  const handleTextChange = (raw: string) => {
    const cleaned = raw.replace(/[^0-9]/g, '');
    if (!cleaned) {
      onChange(min);
      return;
    }
    onChange(clamp(parseInt(cleaned, 10)));
  };

  return (
    <View style={styles.container}>
      <TextInput
        value={String(value)}
        onChangeText={handleTextChange}
        keyboardType="number-pad"
        accessibilityLabel="Quantity input"
        style={[
          styles.input,
          hero ? styles.inputHero : styles.inputStandard,
        ]}
      />
      <View style={styles.stepperRow}>
        {DELTAS.map((delta) => (
          <Pressable
            key={delta}
            onPress={() => onChange(clamp(value + delta))}
            accessibilityRole="button"
            accessibilityLabel={`Adjust quantity by ${delta > 0 ? `+${delta}` : delta}`}
            style={({ pressed }) => [
              styles.stepBtn,
              pressed && styles.stepBtnPressed,
            ]}
          >
            <Text style={styles.stepLabel}>
              {delta > 0 ? `+${delta}` : String(delta)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: Spacing.gutterSm,
  },
  input: {
    width: '100%',
    paddingHorizontal: Spacing.gutterMd,
    backgroundColor: Colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Radii.default,
    fontFamily: FontFamily.mono,
    fontSize: 28,
    lineHeight: 34,
    color: Colors.onSurface,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  inputStandard: {
    minHeight: 56,
  },
  inputHero: {
    minHeight: 64,
  },
  stepperRow: {
    flexDirection: 'row',
    gap: Spacing.gutterXs,
  },
  stepBtn: {
    flex: 1,
    minHeight: 48,
    backgroundColor: Colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Radii.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnPressed: {
    backgroundColor: Colors.surfaceContainer,
  },
  stepLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.onSurface,
  },
});
