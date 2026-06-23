/**
 * Bottom tab navigation — mirrors `.bottom-nav` in smart-arf-app.html:
 * Home · Assess · BPG · Records · Settings.
 *
 * Tapping any tab navigates immediately (no leave-confirmation). The Assess tab
 * always starts a fresh assessment (startNewAssessment/reset); the others just
 * show their content, leaving any in-progress draft in memory.
 */
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useAssessment } from '@/state/AssessmentContext';

export default function TabLayout() {
  const { reset } = useAssessment();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '700' },
        tabBarStyle: { height: 58, paddingBottom: 4 },
        headerStyle: { backgroundColor: Colors.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '800' },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', headerShown: false, tabBarIcon: ({ color }) => <Ionicons name="home" size={24} color={color} /> }}
      />
      <Tabs.Screen
        name="assess"
        options={{ title: 'Assess', headerShown: false, tabBarIcon: ({ color }) => <Ionicons name="add-circle" size={26} color={color} /> }}
        listeners={{ tabPress: () => reset() }}
      />
      <Tabs.Screen
        name="bpg"
        options={{ title: 'BPG', tabBarIcon: ({ color }) => <Ionicons name="medkit" size={24} color={color} /> }}
      />
      <Tabs.Screen
        name="records"
        options={{ title: 'Records', tabBarIcon: ({ color }) => <Ionicons name="list" size={24} color={color} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: ({ color }) => <Ionicons name="settings" size={24} color={color} /> }}
      />
    </Tabs>
  );
}
