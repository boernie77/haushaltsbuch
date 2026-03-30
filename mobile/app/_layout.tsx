import { Stack } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '../src/store/authStore';
import { getTheme } from '../src/themes';

export default function RootLayout() {
  const { user } = useAuthStore();
  const theme = getTheme(user?.theme || 'feminine');

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider theme={theme}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="household" />
            <Stack.Screen name="budget" />
            <Stack.Screen name="invite" />
            <Stack.Screen name="admin" />
            <Stack.Screen name="paperless-settings" />
            <Stack.Screen name="transaction-detail" />
          </Stack>
          <Toast />
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
