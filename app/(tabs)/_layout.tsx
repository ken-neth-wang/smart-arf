/**
 * Bottom tab navigation — mirrors `.bottom-nav` in smart-arf-app.html:
 * Home · Assess · BPG · Records · Settings.
 *
 * Mirrors the HTML's navTo()/confirmLeaveAssessment() (L2239–2260): tapping any
 * tab *other than Assess* while mid-assessment prompts for confirmation; the
 * Assess tab always starts a fresh assessment (startNewAssessment/reset).
 */
import { Tabs } from 'expo-router';
import { Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useAssessment } from '@/state/AssessmentContext';

export default function TabLayout() {
  const { reset, inAssessmentFlow } = useAssessment();

  // HTML confirmLeaveAssessment message (L2251).
  const guard = () => {
    if (!inAssessmentFlow()) return true;
    return new Promise<boolean>((resolve) => {
      Alert.alert(
        'Leave the current assessment?',
        'Your in-progress assessment will be saved if you have reached the scoring screen.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Leave', style: 'destructive', onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    });
  };

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
        listeners={{ tabPress: async (e) => { if (await guard() === false) e.preventDefault(); } }}
      />
      <Tabs.Screen
        name="assess"
        options={{ title: 'Assess', headerShown: false, tabBarIcon: ({ color }) => <Ionicons name="add-circle" size={26} color={color} /> }}
        listeners={{ tabPress: (e) => { e.preventDefault(); reset(); } }}
      />
      <Tabs.Screen
        name="bpg"
        options={{ title: 'BPG', tabBarIcon: ({ color }) => <Ionicons name="medkit" size={24} color={color} /> }}
        listeners={{ tabPress: async (e) => { if (await guard() === false) e.preventDefault(); } }}
      />
      <Tabs.Screen
        name="records"
        options={{ title: 'Records', tabBarIcon: ({ color }) => <Ionicons name="list" size={24} color={color} /> }}
        listeners={{ tabPress: async (e) => { if (await guard() === false) e.preventDefault(); } }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: ({ color }) => <Ionicons name="settings" size={24} color={color} /> }}
      />
    </Tabs>
  );
}
