/**
 * Root layout — AuthProvider (outermost) → auth gate → records + assessment
 * providers → the top-level Stack.
 *
 * Auth gate (cloud mode only): no session → /login; approved user on /login →
 * the app; unapproved user stays on /login (which shows a "pending" message).
 * Local mode skips the gate entirely (no auth).
 *
 * The gate runs in a useEffect + router.replace() rather than a render-time
 * <Redirect> — the latter races with useSegments() on web and can tight-loop.
 */
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { RecordsProvider } from '@/state/RecordsContext';
import { AssessmentProvider } from '@/state/AssessmentContext';
import { AUTH_GATE_ACTIVE, AuthProvider, useAuth } from '@/state/AuthContext';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function RootLayoutNav() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  // Auth gate: navigate (not render-time <Redirect>) to avoid a web redirect
  // race. Runs after each render once the deps settle.
  useEffect(() => {
    if (!AUTH_GATE_ACTIVE || loading) return;
    const inAuthRoute = segments[0] === 'login';
    if (!user && !inAuthRoute) {
      router.replace('/login');
    } else if (user && user.profile.approved && inAuthRoute) {
      router.replace('/');
    } else if (user && !user.profile.approved && !inAuthRoute) {
      // logged in but not approved → send to /login (shows the pending screen)
      router.replace('/login');
    }
  }, [user, loading, segments, router]);

  if (AUTH_GATE_ACTIVE && loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
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
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="record" options={{ title: 'Patient Record' }} />
          <Stack.Screen name="followup" options={{ title: 'Follow-Up Visit' }} />
          <Stack.Screen name="admin" options={{ title: 'Admin' }} />
        </Stack>
      </AssessmentProvider>
    </RecordsProvider>
  );
}
