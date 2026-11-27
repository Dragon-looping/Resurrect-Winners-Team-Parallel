import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  useFonts,
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
} from '@expo-google-fonts/archivo';
import {
  PTSans_400Regular,
  PTSans_700Bold,
} from '@expo-google-fonts/pt-sans';
import {
  SplineSansMono_400Regular,
  SplineSansMono_500Medium,
  SplineSansMono_600SemiBold,
} from '@expo-google-fonts/spline-sans-mono';

import { Colors } from './src/theme/tokens';
import { AppProvider, useApp } from './src/context/AppContext';
import { LoginScreen } from './src/screens/LoginScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { PlantSkuSelectionScreen } from './src/screens/PlantSkuSelectionScreen';
import { GoodsReceivedScreen } from './src/screens/GoodsReceivedScreen';
import { GoodsDispatchScreen } from './src/screens/GoodsDispatchScreen';
import { PhysicalStockCorrectionScreen } from './src/screens/PhysicalStockCorrectionScreen';
import { InventoryEventHistoryScreen } from './src/screens/InventoryEventHistoryScreen';
import { EventDetailsRetryScreen } from './src/screens/EventDetailsRetryScreen';

const RootNavigator: React.FC = () => {
  const { isHydrated, isAuthenticated, currentScreen } = useApp();

  if (!isHydrated) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!isAuthenticated || currentScreen === 'Login') {
    return <LoginScreen />;
  }

  switch (currentScreen) {
    case 'Dashboard':
      return <DashboardScreen />;
    case 'PlantSkuSelection':
      return <PlantSkuSelectionScreen />;
    case 'GoodsReceived':
      return <GoodsReceivedScreen />;
    case 'GoodsDispatch':
      return <GoodsDispatchScreen />;
    case 'PhysicalStockCorrection':
      return <PhysicalStockCorrectionScreen />;
    case 'InventoryEventHistory':
      return <InventoryEventHistoryScreen />;
    case 'EventDetailsRetry':
      return <EventDetailsRetryScreen />;
    default:
      return <DashboardScreen />;
  }
};

export default function App() {
  const [fontsLoaded] = useFonts({
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    PTSans_400Regular,
    PTSans_700Bold,
    SplineSansMono_400Regular,
    SplineSansMono_500Medium,
    SplineSansMono_600SemiBold,
  });

  if (!fontsLoaded) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        <AppProvider>
          <RootNavigator />
        </AppProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  loadingWrap: {
    flex: 1,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
