import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { DefaultFocus, SpatialNavigationFocusableView, SpatialNavigationRoot, SpatialNavigationView } from 'react-tv-space-navigation';
import { scaledPixels } from '../hooks/useScale';
import { RootStackParamList } from '../navigation/types';
import { useSession } from '../session/SessionContext';
import { PROFILES, launchParams } from '../session/config';
import { Avatar, brand, ui } from '../components/couch/ui';
import { colors } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

let deepLinkHandled = false; // StrictMode runs mount effects twice in dev

export default function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const isFocused = useIsFocused();
  const { setMe, joinSession } = useSession();

  const choose = (name: string) => {
    setMe(name);
    navigation.reset({ index: 0, routes: [{ name: 'DrawerNavigator' as never }] });
  };

  // Web deep link: ?name=Sam&code=123456 skips straight in (two-tab demos, judge links).
  useEffect(() => {
    if (!launchParams.name || deepLinkHandled) return;
    deepLinkHandled = true;
    const name = launchParams.name;
    setMe(name);
    setTimeout(() => {
      if (launchParams.code) {
        joinSession(launchParams.code, name);
        navigation.reset({ index: 1, routes: [{ name: 'DrawerNavigator' as never }, { name: 'Lobby' as never }] });
      } else {
        navigation.reset({ index: 0, routes: [{ name: 'DrawerNavigator' as never }] });
      }
    }, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SpatialNavigationRoot isActive={isFocused}>
      <View style={styles.container}>
        <Text style={styles.logo}>
          Couch<Text style={{ color: brand.accent }}>Link</Text>
        </Text>
        <Text style={[ui.h1, styles.title]}>Who's watching?</Text>
        <SpatialNavigationView direction="horizontal" style={styles.row}>
          {PROFILES.map((name, i) => {
            const tile = (
              <SpatialNavigationFocusableView key={name} onSelect={() => choose(name)}>
                {({ isFocused: f }) => (
                  <View style={[styles.tile, f && styles.tileFocused]}>
                    <Avatar name={name} size={160} />
                    <Text style={[styles.name, f && { color: '#fff' }]}>{name}</Text>
                  </View>
                )}
              </SpatialNavigationFocusableView>
            );
            return i === 0 ? <DefaultFocus key={name}>{tile}</DefaultFocus> : tile;
          })}
        </SpatialNavigationView>
        <Text style={[ui.caption, styles.hint]}>Watch together across homes, in perfect sync.</Text>
      </View>
    </SpatialNavigationRoot>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  logo: { position: 'absolute', top: scaledPixels(60), left: scaledPixels(90), color: '#fff', fontSize: scaledPixels(44), fontWeight: '900' },
  title: { marginBottom: scaledPixels(70) },
  row: { flexDirection: 'row' },
  tile: {
    alignItems: 'center',
    padding: scaledPixels(24),
    marginHorizontal: scaledPixels(14),
    borderRadius: scaledPixels(24),
    borderWidth: scaledPixels(4),
    borderColor: 'transparent',
  },
  tileFocused: { borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.08)', transform: [{ scale: 1.08 }] },
  name: { color: colors.textSecondary, fontSize: scaledPixels(32), fontWeight: '700', marginTop: scaledPixels(18) },
  hint: { marginTop: scaledPixels(70) },
});
