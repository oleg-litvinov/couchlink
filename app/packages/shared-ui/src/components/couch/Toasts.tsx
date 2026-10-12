import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { scaledPixels } from '../../hooks/useScale';
import { useSession } from '../../session/SessionContext';
import { Avatar, brand } from './ui';

/** "Sam paused" banners: everyone always knows who did what. */
export default function Toasts({ position = 'top' }: { position?: 'top' | 'bottom' }) {
  const { toasts, members } = useSession();
  if (!toasts.length) return null;
  return (
    <View style={[styles.wrap, position === 'bottom' && styles.bottom]} pointerEvents="none">
      {toasts.map((t) => {
        const who = members.find((m) => t.text.startsWith(m));
        return (
          <View key={t.id} style={styles.toast}>
            {who ? <Avatar name={who} size={40} /> : <View style={styles.dot} />}
            <Text style={styles.text}>{t.text}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: scaledPixels(40),
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  bottom: { top: undefined, bottom: scaledPixels(40) },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: brand.panel,
    borderColor: brand.panelBorder,
    borderWidth: 1,
    borderRadius: scaledPixels(40),
    paddingVertical: scaledPixels(12),
    paddingStart: scaledPixels(14),
    paddingEnd: scaledPixels(30),
    marginBottom: scaledPixels(10),
  },
  dot: {
    width: scaledPixels(20),
    height: scaledPixels(20),
    borderRadius: scaledPixels(10),
    backgroundColor: brand.accent,
    marginHorizontal: scaledPixels(10),
  },
  text: { color: '#fff', fontSize: scaledPixels(28), fontWeight: '700', marginStart: scaledPixels(14) },
});
