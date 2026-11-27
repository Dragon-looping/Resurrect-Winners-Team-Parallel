import React, { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, FontFamily, Radii, Spacing } from '../theme/tokens';
import { useApp } from '../context/AppContext';
import { isDevModeEnabled } from '../services/config';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Button } from '../components/ui/Button';
import { NetworkSchematicSvg } from '../components/ui/NetworkSchematicSvg';

const LOGO_SOURCE = require('../../assets/setuvyuha-logo.png');

export const LoginScreen: React.FC = () => {
  const { signIn, enterDevMode } = useApp();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const devModeAllowed = isDevModeEnabled();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setEmailError(null);
    setPasswordError(null);
    setBannerError(null);

    const trimmedEmail = email.trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    let valid = true;

    if (!trimmedEmail) {
      setEmailError('Email address is required.');
      valid = false;
    } else if (!emailPattern.test(trimmedEmail)) {
      setEmailError('Enter a valid work email address.');
      valid = false;
    }

    if (!password) {
      setPasswordError('Password is required.');
      valid = false;
    }

    if (!valid) return;

    setLoading(true);
    try {
      const result = await signIn(trimmedEmail, password);
      if (!result.ok) {
        setBannerError(
          result.error ??
            'Incorrect email or password. Verify your credentials and try again.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.layout, isDesktop && styles.layoutDesktop]}>
        {/* Mobile Compact Brand Header */}
        {!isDesktop && (
          <View style={styles.mobileHeader}>
            <Image
              source={LOGO_SOURCE}
              style={styles.mobileLogo}
              resizeMode="contain"
            />
          </View>
        )}

        {/* Desktop Left Brand Panel */}
        {isDesktop && (
          <View style={styles.desktopAside}>
            <Image
              source={LOGO_SOURCE}
              style={styles.desktopLogo}
              resizeMode="contain"
            />

            <View style={styles.asideCenter}>
              <View style={styles.asideCopy}>
                <Text style={styles.asideHeadline}>
                  One network. Every commitment.
                </Text>
                <Text style={styles.asideBody}>
                  Intelligent inventory, fulfilment and recovery — coordinated
                  across every plant.
                </Text>
              </View>

              <View style={styles.schematicWrap}>
                <NetworkSchematicSvg />
              </View>
            </View>

            <View style={styles.asideFooter}>
              <Text style={styles.asideFooterText}>
                SETUVYUHA ENTERPRISE OPS
              </Text>
              <Text style={styles.asideFooterText}>MGL · UDP · MNP</Text>
            </View>
          </View>
        )}

        {/* Right / Main Login Card Panel */}
        <ScrollView
          contentContainerStyle={styles.mainScroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Welcome back</Text>
              <Text style={styles.cardSubtitle}>
                Sign in to your operations workspace.
              </Text>
            </View>

            {bannerError && (
              <AlertBanner tone="error" message={bannerError} />
            )}

            <View style={styles.form}>
              {/* Email Address */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Email address</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Enter your work email"
                  placeholderTextColor={Colors.onSurfaceVariant}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  editable={!loading}
                  accessibilityLabel="Email address"
                  style={[
                    styles.input,
                    emailError ? styles.inputError : undefined,
                  ]}
                />
                {emailError && (
                  <Text style={styles.fieldError}>{emailError}</Text>
                )}
              </View>

              {/* Password with Show/Hide Toggle */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Password</Text>
                <View style={styles.passwordWrap}>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Enter your password"
                    placeholderTextColor={Colors.onSurfaceVariant}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="password"
                    editable={!loading}
                    accessibilityLabel="Password"
                    style={[
                      styles.input,
                      styles.passwordInput,
                      passwordError ? styles.inputError : undefined,
                    ]}
                  />
                  <Pressable
                    onPress={() => setShowPassword((prev) => !prev)}
                    accessibilityRole="button"
                    accessibilityLabel={
                      showPassword ? 'Hide password' : 'Show password'
                    }
                    style={styles.eyeBtn}
                  >
                    <MaterialIcons
                      name={showPassword ? 'visibility-off' : 'visibility'}
                      size={20}
                      color={Colors.onSurfaceVariant}
                    />
                  </Pressable>
                </View>
                {passwordError && (
                  <Text style={styles.fieldError}>{passwordError}</Text>
                )}
              </View>

              {/* Sign In Button */}
              <View style={styles.submitGroup}>
                <Button
                  label={loading ? 'Signing in...' : 'Sign in'}
                  onPress={handleSubmit}
                  loading={loading}
                  disabled={loading}
                />
                <Text style={styles.footerNotice}>
                  Authorized personnel only.
                </Text>

                {devModeAllowed && (
                  <View style={styles.devModeBox}>
                    <Button
                      label="Continue in Development Mode"
                      variant="secondary"
                      leftIcon="developer-mode"
                      onPress={enterDevMode}
                      disabled={loading}
                    />
                    <Text style={styles.devModeHint}>
                      Local development access only · bypasses server auth
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  layout: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  layoutDesktop: {
    flexDirection: 'row',
  },
  mobileHeader: {
    backgroundColor: Colors.inverseSurface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
    paddingHorizontal: Spacing.pageMargin,
    paddingVertical: Spacing.gutterMd,
  },
  mobileLogo: {
    width: 150,
    height: 34,
  },
  desktopAside: {
    flex: 1,
    backgroundColor: Colors.inverseSurface,
    padding: 40,
    borderRightWidth: 1,
    borderRightColor: Colors.outlineVariant,
    justifyContent: 'space-between',
  },
  desktopLogo: {
    width: 172,
    height: 38,
  },
  asideCenter: {
    gap: Spacing.gutterXl,
  },
  asideCopy: {
    gap: Spacing.gutterMd,
  },
  asideHeadline: {
    fontFamily: FontFamily.display,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.5,
    color: Colors.inverseOnSurface,
  },
  asideBody: {
    fontFamily: FontFamily.body,
    fontSize: 16,
    lineHeight: 24,
    color: Colors.surfaceDim,
    maxWidth: 420,
  },
  schematicWrap: {
    paddingTop: Spacing.gutterLg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(83, 91, 85, 0.4)',
  },
  asideFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  asideFooterText: {
    fontFamily: FontFamily.mono,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.2,
    color: Colors.surfaceDim,
  },
  mainScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.pageMargin,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Radii.md,
    padding: Spacing.gutterXl,
    gap: Spacing.gutterXl,
  },
  cardHeader: {
    gap: Spacing.gutterXs,
  },
  cardTitle: {
    fontFamily: FontFamily.headline,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.25,
    color: Colors.onSurface,
  },
  cardSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.onSurfaceVariant,
  },
  form: {
    gap: Spacing.gutterLg,
  },
  fieldGroup: {
    gap: Spacing.gutterXs,
  },
  label: {
    fontFamily: FontFamily.label,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.2,
    color: Colors.onSurface,
  },
  input: {
    width: '100%',
    minHeight: 48,
    paddingHorizontal: Spacing.gutterMd,
    backgroundColor: Colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Radii.default,
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.onSurface,
  },
  inputError: {
    borderColor: Colors.error,
  },
  passwordWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  passwordInput: {
    paddingRight: 48,
  },
  eyeBtn: {
    position: 'absolute',
    right: 4,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.sm,
  },
  fieldError: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.error,
  },
  submitGroup: {
    gap: Spacing.gutterMd,
    paddingTop: Spacing.gutterXs,
  },
  footerNotice: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
  },
  devModeBox: {
    marginTop: Spacing.gutterXs,
    paddingTop: Spacing.gutterMd,
    borderTopWidth: 1,
    borderTopColor: Colors.outlineVariant,
    gap: Spacing.gutterXs,
  },
  devModeHint: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    lineHeight: 15,
    color: Colors.warning,
    textAlign: 'center',
  },
});
