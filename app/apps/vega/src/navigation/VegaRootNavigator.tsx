import { createNativeStackNavigator } from '@amazon-devices/react-navigation__native-stack';
import { RootStackParamList } from './types';
import VegaDrawerNavigator from './VegaDrawerNavigator';
import { DetailsScreen, PlayerScreen, ProfileScreen, JoinScreen, LobbyScreen } from '@multi-tv/shared-ui';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function VegaRootNavigator() {
  return (
    <Stack.Navigator initialRouteName="Profile" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="DrawerNavigator" component={VegaDrawerNavigator} />
      <Stack.Screen name="Join" component={JoinScreen} />
      <Stack.Screen name="Lobby" component={LobbyScreen} />
      <Stack.Screen name="Details" component={DetailsScreen} />
      <Stack.Screen name="Player" component={PlayerScreen} />
    </Stack.Navigator>
  );
}
