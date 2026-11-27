import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, FontFamily, Radii, Spacing } from '../../theme/tokens';
import { getApiBaseUrl } from '../../services/config';
import {
  DevEndpointDiagnosticResult,
  runDevEndpointDiagnostic,
} from '../../services/apiClient';
import { StatusBadge } from '../ui/StatusBadge';

interface DevApiDiagnosticsModalProps {
  visible: boolean;
  onClose: () => void;
}

const DIAGNOSTIC_ENDPOINTS: Array<{
  key: DevEndpointDiagnosticResult['endpointKey'];
  label: string;
  path: string;
}> = [
  { key: 'health', label: 'Backend Health', path: '/health' },
  { key: 'stock', label: 'Stock Balances', path: '/stock' },
  { key: 'events', label: 'Event History', path: '/events?limit=50&offset=0' },
  { key: 'feeds', label: 'Feed Status', path: '/feeds/status' },
];

export const DevApiDiagnosticsModal: React.FC<DevApiDiagnosticsModalProps> = ({
  visible,
  onClose,
}) => {
  const [results, setResults] = useState<
    Partial<Record<DevEndpointDiagnosticResult['endpointKey'], DevEndpointDiagnosticResult>>
  >({});
  const [runningKey, setRunningKey] = useState<string | null>(null);

  const runSingle = async (
    key: DevEndpointDiagnosticResult['endpointKey'],
    path: string
  ) => {
    setRunningKey(key);
    try {
      const res = await runDevEndpointDiagnostic(key, path);
      setResults((prev) => ({ ...prev, [key]: res }));
    } finally {
      setRunningKey(null);
    }
  };

  const runAll = async () => {
    setRunningKey('all');
    try {
      const next: Partial<
        Record<DevEndpointDiagnosticResult['endpointKey'], DevEndpointDiagnosticResult>
      > = {};
      for (const ep of DIAGNOSTIC_ENDPOINTS) {
        next[ep.key] = await runDevEndpointDiagnostic(ep.key, ep.path);
      }
      setResults(next);
    } finally {
      setRunningKey(null);
    }
  };

  const resolvedBaseUrl = getApiBaseUrl() || '(empty)';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>DEV-ONLY RUNTIME DIAGNOSTICS</Text>
            <Text style={styles.title}>Expo Go API Probe</Text>
            <Text style={styles.mono}>Base URL: {resolvedBaseUrl}</Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
            <MaterialIcons name="close" size={22} color={Colors.onSurface} />
          </Pressable>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <View style={styles.actionsGrid}>
            <Pressable
              onPress={runAll}
              disabled={runningKey !== null}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.pressed,
                runningKey !== null && styles.disabled,
              ]}
            >
              <Text style={styles.primaryBtnText}>
                {runningKey === 'all' ? 'Running All 4 Checks...' : 'Run All 4 Checks'}
              </Text>
            </Pressable>

            <View style={styles.btnRow}>
              {DIAGNOSTIC_ENDPOINTS.map((ep) => (
                <Pressable
                  key={ep.key}
                  onPress={() => runSingle(ep.key, ep.path)}
                  disabled={runningKey !== null}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    pressed && styles.pressed,
                    runningKey !== null && styles.disabled,
                  ]}
                >
                  <Text style={styles.secondaryBtnText}>
                    {runningKey === ep.key ? 'Testing...' : ep.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {DIAGNOSTIC_ENDPOINTS.map((ep) => {
            const res = results[ep.key];
            return (
              <View key={ep.key} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>
                    GET {ep.path}
                  </Text>
                  {res ? (
                    <StatusBadge
                      label={res.classification}
                      variant={res.classification === 'SUCCESS' ? 'success' : 'error'}
                    />
                  ) : (
                    <StatusBadge label="NOT RUN" variant="neutral" />
                  )}
                </View>

                {res && (
                  <View style={styles.details}>
                    <Text style={styles.mono}>Base URL: {res.resolvedBaseUrl}</Text>
                    <Text style={styles.mono}>Request: {res.method} {res.requestUrl}</Text>
                    <Text style={styles.mono}>
                      Status: {res.status !== null ? `HTTP ${res.status}` : 'None (fetch failed)'} · {res.durationMs} ms
                    </Text>
                    <Text style={styles.mono}>Started: {res.startedAt}</Text>
                    <Text style={styles.mono}>Completed: {res.completedAt}</Text>
                    {res.nativeErrorName && (
                      <Text style={styles.errorText}>
                        Native Error: {res.nativeErrorName}: {res.nativeErrorMessage}
                      </Text>
                    )}
                    {res.responseBodyPreview !== null && (
                      <View style={styles.bodyBox}>
                        <Text style={styles.mono}>{res.responseBodyPreview}</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  header: {
    paddingTop: 52,
    paddingHorizontal: Spacing.pageMargin,
    paddingBottom: Spacing.gutterMd,
    backgroundColor: Colors.surfaceContainerLowest,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.gutterMd,
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  eyebrow: {
    fontFamily: FontFamily.monoSemiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: Colors.primary,
  },
  title: {
    fontFamily: FontFamily.headlineSemiBold,
    fontSize: 20,
    color: Colors.onSurface,
  },
  closeBtn: {
    padding: 6,
    borderRadius: Radii.sm,
    backgroundColor: Colors.surfaceContainer,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: Spacing.pageMargin,
    paddingBottom: Spacing.gutterXl,
    gap: Spacing.gutterMd,
  },
  actionsGrid: {
    gap: Spacing.gutterSm,
  },
  btnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.gutterSm,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: Radii.sm,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontFamily: FontFamily.label,
    fontSize: 14,
    color: Colors.onPrimary,
  },
  secondaryBtn: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: Radii.sm,
  },
  secondaryBtnText: {
    fontFamily: FontFamily.label,
    fontSize: 13,
    color: Colors.onSurface,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.55,
  },
  card: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Radii.md,
    padding: Spacing.gutterMd,
    gap: Spacing.gutterSm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.gutterSm,
  },
  cardTitle: {
    flex: 1,
    fontFamily: FontFamily.monoSemiBold,
    fontSize: 12,
    color: Colors.onSurface,
  },
  details: {
    gap: 4,
  },
  mono: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    lineHeight: 16,
    color: Colors.onSurfaceVariant,
  },
  errorText: {
    fontFamily: FontFamily.monoSemiBold,
    fontSize: 11,
    lineHeight: 16,
    color: Colors.error,
  },
  bodyBox: {
    marginTop: 4,
    padding: 8,
    borderRadius: Radii.sm,
    backgroundColor: Colors.surfaceContainer,
  },
});
