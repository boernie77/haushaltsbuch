import { Tabs, Redirect } from 'expo-router';
import { useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/authStore';

export default function TabsLayout() {
  const { isAuthenticated } = useAuthStore();
  const theme = useTheme() as any;

  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: {
        backgroundColor: theme.colors.tabBar,
        borderTopColor: theme.colors.outline,
        elevation: 8,
        shadowOpacity: 0.1,
        height: 60,
        paddingBottom: 8,
      },
      tabBarActiveTintColor: theme.colors.tabBarActive,
      tabBarInactiveTintColor: theme.colors.tabBarInactive,
      tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
    }}>
      <Tabs.Screen name="index" options={{
        title: 'Übersicht',
        tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="home" color={color} size={size} />
      }} />
      <Tabs.Screen name="transactions" options={{
        title: 'Ausgaben',
        tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="receipt" color={color} size={size} />
      }} />
      <Tabs.Screen name="add" options={{
        title: 'Hinzufügen',
        tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="plus-circle" color={color} size={size + 8} />,
        tabBarIconStyle: { marginTop: -4 },
      }} />
      <Tabs.Screen name="statistics" options={{
        title: 'Statistiken',
        tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="chart-bar" color={color} size={size} />
      }} />
      <Tabs.Screen name="settings" options={{
        title: 'Einstellungen',
        tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="cog" color={color} size={size} />
      }} />
    </Tabs>
  );
}
