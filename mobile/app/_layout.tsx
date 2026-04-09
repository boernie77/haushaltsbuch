import { Stack } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { PaperProvider } from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { transactionAPI } from "../src/services/api";
import { offlineQueue } from "../src/services/offlineStore";
import { useAuthStore } from "../src/store/authStore";
import { getTheme } from "../src/themes";

async function flushOfflineQueue() {
  const queue = await offlineQueue.getAll();
  if (queue.length === 0) {
    return;
  }
  let synced = 0;
  for (const tx of queue) {
    try {
      const form = new FormData();
      form.append("amount", tx.amount);
      form.append("description", tx.description || "");
      form.append("merchant", tx.merchant || "");
      form.append("date", tx.date);
      form.append("type", tx.type);
      form.append("householdId", tx.householdId);
      if (tx.categoryId) {
        form.append("categoryId", tx.categoryId);
      }
      await transactionAPI.create(form);
      await offlineQueue.remove(tx._offlineId);
      synced++;
    } catch {
      break; // Noch offline — aufhören
    }
  }
  if (synced > 0) {
    Toast.show({
      type: "success",
      text1: `${synced} offline Buchung(en) synchronisiert`,
    });
  }
}

export default function RootLayout() {
  const { user } = useAuthStore();
  const theme = getTheme(user?.theme || "feminine");
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    flushOfflineQueue();
    const sub = AppState.addEventListener("change", (next) => {
      if (appState.current.match(/inactive|background/) && next === "active") {
        flushOfflineQueue();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, []);

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
