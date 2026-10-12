import React, { useEffect, StrictMode } from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { Platform } from 'react-native';
import { MenuProvider } from '../components/MenuContext';
import { GoBackConfiguration } from '../app/remote-control/GoBackConfiguration';
import RootNavigator from './RootNavigator';
import SessionAutoNav, { navigationRef } from './SessionAutoNav';
import { SessionProvider } from '../session/SessionContext';

export interface AppNavigatorProps {
  fontsLoaded?: boolean;
  onReady?: () => void;
}

export default function AppNavigator({ fontsLoaded = true, onReady }: AppNavigatorProps) {
  useEffect(() => {
    // Import remote control config for TV platforms
    if (Platform.isTV) {
      try {
        require('../app/configureRemoteControl');
      } catch (error) {
        console.warn('Remote control configuration not available:', error);
      }
    }
  }, []);

  useEffect(() => {
    if (fontsLoaded && onReady) {
      onReady();
    }
  }, [fontsLoaded, onReady]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <StrictMode>
      <SessionProvider>
        <NavigationContainer theme={DarkTheme} ref={navigationRef}>
          <MenuProvider>
            <GoBackConfiguration />
            <SessionAutoNav />
            <RootNavigator />
          </MenuProvider>
        </NavigationContainer>
      </SessionProvider>
    </StrictMode>
  );
}
