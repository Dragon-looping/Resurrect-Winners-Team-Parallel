import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, FontFamily, Radii, Spacing } from '../../theme/tokens';
import { useApp } from '../../context/AppContext';
import { BadgeVariant, StatusBadge } from './StatusBadge';

const LOGO_SOURCE = require('../../../assets/setuvyuha-logo.png');

export const MainTopBar: React.FC = () => {
  const {
    isOffline,
    pendingAndFailedCount,
    isDevSession,
    toggleOffline,
    navigate,
    signOut,
  } = useApp();

  const badgeLabel = isOffline
    ? `Offline · ${pendingAndFailedCount} Pending`
    : pendingAndFailedCount > 0
      ? `Online · ${pendingAndFailedCount} Pending`
      : 'Online · Synced';

  const badgeVariant: BadgeVariant = isOffline
    ? 'warning'
    : pendingAndFailedCount > 0
      ? 'warning'
      : 'success';

  return (
    <View style={styles.mainHeader}>
      <Pressable
        onPress={() => navigate('Dashboard')}
        accessibilityRole="button"
        accessibilityLabel="SETUVYUHA Home"
        style={styles.logoWrap}
      >
        <Image source={LOGO_SOURCE} style={styles.logo} resizeMode="contain" />
      </Pressable>
      <View style={styles.mainRight}>
        {isDevSession && (
          <StatusBadge label="DEV MODE" variant="warning" />
        )}
        <Pressable
          onPress={toggleOffline}
          accessibilityRole="button"
          accessibilityLabel="Toggle connectivity status"
        >
          <StatusBadge
            label={badgeLabel}
            variant={badgeVariant}
            icon={isOffline ? 'cloud-off' : 'cloud-done'}
          />
        </Pressable>
        <Pressable
          onPress={signOut}
          accessibilityRole="button"
          accessibilityLabel={isDevSession ? 'Exit Development Mode' : 'Sign out'}
          style={({ pressed }) => [
            styles.exitBtn,
            pressed && styles.exitBtnPressed,
          ]}
        >
          <MaterialIcons
            name="logout"
            size={18}
            color={Colors.inverseOnSurface}
          />
        </Pressable>
      </View>
    </View>
  );
};

interface SubScreenTopBarProps {
  eventId: string;
  title: string;
  badgeLabel: string;
  badgeVariant: BadgeVariant;
  badgeIcon?: keyof typeof MaterialIcons.glyphMap;
  badgeDot?: boolean;
  onBack: () => void;
}

export const SubScreenTopBar: React.FC<SubScreenTopBarProps> = ({
  eventId,
  title,
  badgeLabel,
  badgeVariant,
  badgeIcon,
  badgeDot,
  onBack,
}) => {
  const { isDevSession } = useApp();
  return (
    <View style={styles.subHeader}>
      <View style={styles.subLeft}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={({ pressed }) => [
            styles.backBtn,
            pressed && styles.backBtnPressed,
          ]}
        >
          <MaterialIcons name="arrow-back" size={20} color={Colors.onSurface} />
        </Pressable>
        <View style={styles.subTitleCol}>
          <Text style={styles.eventIdText} numberOfLines={1}>
            {eventId}
          </Text>
          <Text style={styles.subTitleText} numberOfLines={1}>
            {title}
          </Text>
        </View>
      </View>
      <View style={styles.subRight}>
        {isDevSession && <StatusBadge label="DEV MODE" variant="warning" />}
        <StatusBadge
          label={badgeLabel}
          variant={badgeVariant}
          icon={badgeIcon}
          dot={badgeDot}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  mainHeader: {
    backgroundColor: Colors.inverseSurface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
    paddingHorizontal: Spacing.pageMargin,
    paddingVertical: Spacing.gutterSm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.gutterSm,
    minHeight: 56,
  },
  logoWrap: {
    justifyContent: 'center',
    flexShrink: 1,
  },
  logo: {
    width: 124,
    height: 28,
  },
  mainRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.gutterXs,
    flexShrink: 0,
  },
  exitBtn: {
    width: 36,
    height: 36,
    borderRadius: Radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(246, 245, 240, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exitBtnPressed: {
    backgroundColor: 'rgba(246, 245, 240, 0.12)',
  },
  subRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.gutterXs,
    flexShrink: 0,
  },
  subHeader: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
    paddingHorizontal: Spacing.pageMargin,
    paddingVertical: Spacing.gutterSm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.gutterSm,
  },
  subLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.gutterMd,
    flex: 1,
    minWidth: 0,
  },
  backBtn: {
    width: 44,
    height: 44,
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Radii.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnPressed: {
    backgroundColor: Colors.surfaceContainerLow,
  },
  subTitleCol: {
    flex: 1,
    minWidth: 0,
  },
  eventIdText: {
    fontFamily: FontFamily.mono,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.onSurfaceVariant,
  },
  subTitleText: {
    fontFamily: FontFamily.title,
    fontSize: 16,
    lineHeight: 22,
    color: Colors.onSurface,
  },
});
