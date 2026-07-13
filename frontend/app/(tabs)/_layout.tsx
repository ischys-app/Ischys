import { Tabs } from 'expo-router';

import { TabBar } from '../../src/components/TabBar';
import { color } from '../../src/theme/tokens';

/** Tabs render unconditionally — the pure on-device build has no auth gate. */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: color.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
