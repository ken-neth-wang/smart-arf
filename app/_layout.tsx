/**
 * Root layout — providers (records + assessment) and the top-level Stack that
 * hosts the tab group plus the auxiliary routes (lookup / record / followup).
 */
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { RecordsProvider } from '@/state/RecordsContext';
import { AssessmentProvider } from '@/state/AssessmentContext';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <SafeAreaProvider>
      <RecordsProvider>
        <AssessmentProvider>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: Colors.primary },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: '800' },
              contentStyle: { backgroundColor: Colors.bg },
            }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="lookup" options={{ title: 'Patient Lookup' }} />
            <Stack.Screen name="record" options={{ title: 'Patient Record' }} />
            <Stack.Screen name="followup" options={{ title: 'Follow-Up Visit' }} />
          </Stack>
        </AssessmentProvider>
      </RecordsProvider>
    </SafeAreaProvider>
  );
}
