import React, { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { DefaultFocus, SpatialNavigationFocusableView, SpatialNavigationRoot, SpatialNavigationView } from 'react-tv-space-navigation';
import { scaledPixels } from '../hooks/useScale';
import { RootStackParamList } from '../navigation/types';
import { useSession } from '../session/SessionContext';
import { brand, ui } from '../components/couch/ui';
import { colors } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'join'];

export default function JoinScreen() {
  const navigation = useNavigation<Nav>();
  const isFocused = useIsFocused();
  const { joinSession, code: sessionCode, error, joining, clearError } = useSession();
  const [digits, setDigits] = useState('');

  const press = useCallback(
    (k: string) => {
      clearError();
      if (k === 'del') setDigits((d) => d.slice(0, -1));
      else if (k === 'join') {
        if (digits.length === 6) joinSession(digits);
      } else setDigits((d) => (d.length < 6 ? d + k : d));
    },
    [digits, joinSession, clearError],
  );

  // Physical keyboard on web / number keys on some remotes.
  useEffect(() => {
    if (Platform.OS !== 'web' || !isFocused) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press, isFocused]);

  useEffect(() => {
    if (digits.length === 6 && !joining && !error) joinSession(digits);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits]);

  useEffect(() => {
    if (sessionCode && isFocused) navigation.replace('Lobby');
  }, [sessionCode, isFocused, navigation]);

  return (
    <SpatialNavigationRoot isActive={isFocused}>
      <View style={styles.container}>
        <View style={styles.left}>
          <Text style={ui.h1}>Join a watch party</Text>
          <Text style={[ui.body, { marginTop: scaledPixels(16), maxWidth: scaledPixels(700) }]}>
            Enter the 6-digit code shown on the other TV.
          </Text>
          <View style={styles.slots}>
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={[styles.slot, i === digits.length && styles.slotActive]}>
                <Text style={styles.slotText}>{digits[i] || ''}</Text>
              </View>
            ))}
          </View>
          {joining && <Text style={ui.body}>Connecting...</Text>}
          {error && <Text style={[ui.body, { color: colors.error }]}>{error}</Text>}
        </View>
        <SpatialNavigationView direction="vertical" style={styles.pad}>
          {[0, 1, 2, 3].map((r) => (
            <SpatialNavigationView key={r} direction="horizontal" style={styles.padRow}>
              {KEYS.slice(r * 3, r * 3 + 3).map((k) => {
                const key = (
                  <SpatialNavigationFocusableView key={k} onSelect={() => press(k)}>
                    {({ isFocused: f }) => (
                      <View style={[styles.key, k === 'join' && styles.keyJoin, f && styles.keyFocused]}>
                        <Text style={[styles.keyText, k === 'join' && { color: '#1A0E0A' }, f && { color: '#000' }]}>
                          {k === 'del' ? 'Delete' : k === 'join' ? 'Join' : k}
                        </Text>
                      </View>
                    )}
                  </SpatialNavigationFocusableView>
                );
                return k === '1' ? <DefaultFocus key={k}>{key}</DefaultFocus> : key;
              })}
            </SpatialNavigationView>
          ))}
        </SpatialNavigationView>
      </View>
    </SpatialNavigationRoot>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scaledPixels(120),
  },
  left: { flex: 1 },
  slots: { flexDirection: 'row', marginVertical: scaledPixels(50) },
  slot: {
    width: scaledPixels(100),
    height: scaledPixels(130),
    borderRadius: scaledPixels(16),
    backgroundColor: colors.card,
    marginEnd: scaledPixels(18),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: scaledPixels(3),
    borderColor: 'transparent',
  },
  slotActive: { borderColor: brand.accent },
  slotText: { color: '#fff', fontSize: scaledPixels(72), fontWeight: '800' },
  pad: {},
  padRow: { flexDirection: 'row' },
  key: {
    width: scaledPixels(150),
    height: scaledPixels(110),
    margin: scaledPixels(10),
    borderRadius: scaledPixels(16),
    backgroundColor: colors.cardElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: scaledPixels(3),
    borderColor: 'transparent',
  },
  keyJoin: { backgroundColor: brand.accent },
  keyFocused: { backgroundColor: '#fff', borderColor: '#fff', transform: [{ scale: 1.08 }] },
  keyText: { color: '#fff', fontSize: scaledPixels(40), fontWeight: '700' },
});
