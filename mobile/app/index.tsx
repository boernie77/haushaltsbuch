import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';

export default function Index() {
  const { isAuthenticated, isLoading, loadStoredAuth } = useAuthStore();

  useEffect(() => {
    loadStoredAuth();
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#E91E8C" />
      </View>
    );
  }

  return <Redirect href={isAuthenticated ? '/(tabs)' : '/(auth)/login'} />;
}
