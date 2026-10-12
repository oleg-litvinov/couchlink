import React, { useCallback, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { DrawerActions, useIsFocused, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  DefaultFocus,
  SpatialNavigationFocusableView,
  SpatialNavigationNode,
  SpatialNavigationRoot,
  SpatialNavigationScrollView,
  SpatialNavigationView,
  SpatialNavigationVirtualizedList,
} from 'react-tv-space-navigation';
import { Direction } from '@bam.tech/lrud';
import { useMenuContext } from '../components/MenuContext';
import { scaledPixels } from '../hooks/useScale';
import { RootStackParamList } from '../navigation/types';
import { Title, minutes, rows, titles } from '../data/catalog';
import { colors, safeZones } from '../theme';
import PlatformLinearGradient from '../components/PlatformLinearGradient';
import { getOpenDrawerDirection } from '../utils/rtl';
import { useSession } from '../session/SessionContext';
import { Avatar, CouchButton, Pill, brand, ui } from '../components/couch/ui';
import Toasts from '../components/couch/Toasts';

type Nav = NativeStackNavigationProp<RootStackParamList, 'DrawerNavigator'>;

const TitleCard = React.memo(({ item, isFocused }: { item: Title; isFocused: boolean }) => {
  const source = useMemo(() => ({ uri: item.posterUrl }), [item.posterUrl]);
  return (
    <View style={[styles.card, isFocused && styles.cardFocused]}>
      <Image source={source} style={styles.cardImage} resizeMode="cover" />
      <View style={styles.cardLabel}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {item.title}
        </Text>
      </View>
    </View>
  );
});

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const { isOpen: isMenuOpen, toggleMenu } = useMenuContext();
  const isFocused = useIsFocused();
  const s = useSession();
  const [focused, setFocused] = useState<Title>(titles.find((t) => t.hero) || titles[0]);
  const inParty = !!s.code;

  const onSelectTitle = useCallback(
    (item: Title) => {
      if (inParty) {
        s.load(item.id); // starts on every TV after a short countdown
      } else {
        navigation.navigate('Details', {
          mediaId: item.id,
          title: item.title,
          description: item.tagline,
          headerImage: item.posterUrl,
          movie: item.videoUrl,
          genres: item.genres,
          releaseYear: item.year,
          duration: item.durationSec,
        });
      }
    },
    [inParty, s, navigation],
  );

  const onDirectionHandledWithoutMovement = useCallback(
    (movement: Direction) => {
      if (movement === getOpenDrawerDirection()) {
        navigation.dispatch(DrawerActions.openDrawer());
        toggleMenu(true);
      }
    },
    [toggleMenu, navigation],
  );

  const renderItem = useCallback(
    ({ item }: { item: Title }) => (
      <SpatialNavigationFocusableView onSelect={() => onSelectTitle(item)} onFocus={() => setFocused(item)}>
        {({ isFocused: f }) => <TitleCard item={item} isFocused={f} />}
      </SpatialNavigationFocusableView>
    ),
    [onSelectTitle],
  );

  return (
    <SpatialNavigationRoot isActive={isFocused && !isMenuOpen} onDirectionHandledWithoutMovement={onDirectionHandledWithoutMovement}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Image style={styles.headerImage} source={{ uri: focused.posterUrl }} resizeMode="cover" />
          <PlatformLinearGradient
            colors={['rgba(0,0,0,0.95)', 'rgba(0,0,0,0.75)', 'rgba(0,0,0,0.2)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientLeft}
          />
          <PlatformLinearGradient
            colors={['transparent', 'rgba(0,0,0,1)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.gradientBottom}
          />
          <View style={styles.headerText}>
            <Text style={styles.logo}>
              Couch<Text style={{ color: brand.accent }}>Link</Text>
            </Text>
            <Text style={styles.title}>{focused.title}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: scaledPixels(12) }}>
              <Pill text={String(focused.year)} />
              <Pill text={minutes(focused)} />
              {focused.genres.slice(0, 3).map((g) => (
                <Pill key={g} text={g} />
              ))}
            </View>
            <Text style={styles.description} numberOfLines={3}>
              {focused.tagline}
            </Text>
          </View>
        </View>

        <SpatialNavigationScrollView offsetFromStart={scaledPixels(60)} style={styles.scroll}>
          <SpatialNavigationView direction="horizontal" style={styles.actions}>
            {inParty ? (
              <>
                <View style={styles.partyBadge}>
                  {s.members.map((m) => (
                    <View key={m} style={{ marginEnd: scaledPixels(-12) }}>
                      <Avatar name={m} size={56} />
                    </View>
                  ))}
                  <Text style={[ui.h3, { marginStart: scaledPixels(30) }]}>
                    Party {s.code} <Text style={ui.caption}> Select any title to start it for everyone</Text>
                  </Text>
                </View>
                <DefaultFocus>
                  <CouchButton label="Back to party" variant="primary" onSelect={() => navigation.navigate('Lobby')} />
                </DefaultFocus>
                <CouchButton label="Leave" variant="ghost" onSelect={s.leaveSession} />
              </>
            ) : (
              <>
                <DefaultFocus>
                  <CouchButton
                    label="Start a watch party"
                    variant="primary"
                    size="lg"
                    onSelect={() => {
                      s.createSession();
                      navigation.navigate('Lobby');
                    }}
                  />
                </DefaultFocus>
                <CouchButton label="Join a party" size="lg" onSelect={() => navigation.navigate('Join')} />
                <Text style={[ui.caption, { alignSelf: 'center', marginStart: scaledPixels(10) }]}>
                  Watching as {s.me}
                </Text>
              </>
            )}
          </SpatialNavigationView>

          {rows.map((row) => (
            <View key={row.title} style={styles.row}>
              <Text style={styles.rowTitle}>{row.title}</Text>
              <SpatialNavigationNode>
                <SpatialNavigationVirtualizedList
                  data={row.items}
                  orientation="horizontal"
                  renderItem={renderItem}
                  itemSize={scaledPixels(440)}
                  onEndReachedThresholdItemsNumber={3}
                />
              </SpatialNavigationNode>
            </View>
          ))}
          <Text style={[ui.caption, styles.credits]}>
            Films: Blender Foundation open movies (CC BY) and public-domain classics via the Internet Archive.
          </Text>
        </SpatialNavigationScrollView>
        <Toasts />
      </View>
    </SpatialNavigationRoot>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { position: 'absolute', top: 0, left: 0, right: 0, height: scaledPixels(720) },
  headerImage: { width: '100%', height: '100%' },
  gradientLeft: { position: 'absolute', start: 0, top: 0, bottom: 0, width: '70%' },
  gradientBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: scaledPixels(260) },
  headerText: {
    position: 'absolute',
    start: scaledPixels(safeZones.titleSafe.horizontal),
    top: scaledPixels(safeZones.titleSafe.vertical),
    width: '50%',
  },
  logo: { color: '#fff', fontSize: scaledPixels(40), fontWeight: '900', marginBottom: scaledPixels(60) },
  title: { color: colors.text, fontSize: scaledPixels(72), fontWeight: '900', marginBottom: scaledPixels(16) },
  description: { color: colors.text, fontSize: scaledPixels(28), lineHeight: scaledPixels(40), fontWeight: '500' },
  scroll: { flex: 1, marginTop: scaledPixels(480) },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scaledPixels(safeZones.titleSafe.horizontal),
    paddingVertical: scaledPixels(24),
  },
  partyBadge: { flexDirection: 'row', alignItems: 'center', marginEnd: scaledPixels(30) },
  row: { paddingHorizontal: scaledPixels(safeZones.actionSafe.horizontal), height: scaledPixels(380) },
  rowTitle: { color: colors.text, fontSize: scaledPixels(36), fontWeight: '800', marginVertical: scaledPixels(16) },
  card: {
    width: scaledPixels(420),
    height: scaledPixels(236),
    marginEnd: scaledPixels(20),
    borderRadius: scaledPixels(14),
    borderWidth: scaledPixels(5),
    borderColor: 'transparent',
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  cardFocused: { borderColor: '#fff', transform: [{ scale: 1.08 }] },
  cardImage: { width: '100%', height: '100%' },
  cardLabel: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: scaledPixels(14), backgroundColor: 'rgba(0,0,0,0.65)' },
  cardTitle: { color: '#fff', fontSize: scaledPixels(24), fontWeight: '700' },
  credits: { paddingHorizontal: scaledPixels(safeZones.titleSafe.horizontal), paddingBottom: scaledPixels(60) },
});
