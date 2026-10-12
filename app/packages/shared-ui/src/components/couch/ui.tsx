import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { SpatialNavigationFocusableView } from 'react-tv-space-navigation';
import { scaledPixels } from '../../hooks/useScale';
import { colors } from '../../theme';

export const brand = {
  accent: '#FF7A59',
  accentSoft: 'rgba(255,122,89,0.18)',
  violet: '#8B7CFF',
  panel: 'rgba(20,20,24,0.92)',
  panelBorder: 'rgba(255,255,255,0.08)',
  avatar: ['#FF7A59', '#8B7CFF', '#2EC4B6', '#FFB547', '#4DA3FF', '#F25F9A'],
};

export function avatarColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return brand.avatar[h % brand.avatar.length];
}

export function Avatar({ name, size = 64, dim = false }: { name: string; size?: number; dim?: boolean }) {
  const s = scaledPixels(size);
  return (
    <View
      style={{
        width: s,
        height: s,
        borderRadius: s / 2,
        backgroundColor: avatarColor(name),
        alignItems: 'center',
        justifyContent: 'center',
        opacity: dim ? 0.4 : 1,
      }}
    >
      <Text style={{ color: '#111', fontWeight: '800', fontSize: s * 0.45 }}>{name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

interface ButtonProps {
  label: string;
  onSelect: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  style?: ViewStyle;
  size?: 'md' | 'lg';
  disabled?: boolean;
  onFocus?: () => void;
}

export function CouchButton({ label, onSelect, variant = 'secondary', style, size = 'md', disabled, onFocus }: ButtonProps) {
  return (
    <SpatialNavigationFocusableView onSelect={disabled ? undefined : onSelect} onFocus={onFocus}>
      {({ isFocused }) => (
        <View
          style={[
            ui.button,
            size === 'lg' && ui.buttonLg,
            variant === 'primary' && ui.buttonPrimary,
            variant === 'ghost' && ui.buttonGhost,
            isFocused && ui.buttonFocused,
            disabled && { opacity: 0.4 },
            style,
          ]}
        >
          <Text
            style={[
              ui.buttonText,
              size === 'lg' && ui.buttonTextLg,
              variant === 'primary' && ui.buttonTextPrimary,
              isFocused && ui.buttonTextFocused,
            ]}
          >
            {label}
          </Text>
        </View>
      )}
    </SpatialNavigationFocusableView>
  );
}

export function Pill({ text, tone = 'default' }: { text: string; tone?: 'default' | 'accent' | 'success' }) {
  return (
    <View
      style={[
        ui.pill,
        tone === 'accent' && { backgroundColor: brand.accentSoft, borderColor: brand.accent },
        tone === 'success' && { backgroundColor: 'rgba(52,199,89,0.18)', borderColor: colors.success },
      ]}
    >
      <Text style={ui.pillText}>{text}</Text>
    </View>
  );
}

export const ui = StyleSheet.create({
  button: {
    paddingVertical: scaledPixels(18),
    paddingHorizontal: scaledPixels(36),
    borderRadius: scaledPixels(14),
    backgroundColor: colors.cardElevated,
    borderWidth: scaledPixels(3),
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: scaledPixels(20),
  },
  buttonLg: {
    paddingVertical: scaledPixels(26),
    paddingHorizontal: scaledPixels(48),
  },
  buttonPrimary: { backgroundColor: brand.accent },
  buttonGhost: { backgroundColor: 'rgba(255,255,255,0.06)' },
  buttonFocused: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
    transform: [{ scale: 1.06 }],
    shadowColor: '#fff',
    shadowOpacity: 0.5,
    shadowRadius: scaledPixels(16),
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  buttonText: { color: colors.text, fontSize: scaledPixels(26), fontWeight: '700' },
  buttonTextLg: { fontSize: scaledPixels(32) },
  buttonTextPrimary: { color: '#1A0E0A' },
  buttonTextFocused: { color: '#000' },
  pill: {
    paddingVertical: scaledPixels(6),
    paddingHorizontal: scaledPixels(16),
    borderRadius: scaledPixels(40),
    borderWidth: scaledPixels(2),
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginEnd: scaledPixels(10),
    marginBottom: scaledPixels(10),
  },
  pillText: { color: colors.text, fontSize: scaledPixels(22), fontWeight: '600' },
  h1: { color: colors.text, fontSize: scaledPixels(64), fontWeight: '800' },
  h2: { color: colors.text, fontSize: scaledPixels(40), fontWeight: '800' },
  h3: { color: colors.text, fontSize: scaledPixels(30), fontWeight: '700' },
  body: { color: colors.textSecondary, fontSize: scaledPixels(26), lineHeight: scaledPixels(38) },
  caption: { color: colors.textTertiary, fontSize: scaledPixels(22) },
  panel: {
    backgroundColor: brand.panel,
    borderRadius: scaledPixels(24),
    borderWidth: 1,
    borderColor: brand.panelBorder,
    padding: scaledPixels(36),
  },
});
