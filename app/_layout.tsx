import { useEffect, useState } from 'react';
import { Slot, useRouter, useSegments, SplashScreen } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import '../global.css';

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      const rememberMe = await AsyncStorage.getItem('remember_me');
      if (rememberMe === 'false') {
        await supabase.auth.signOut();
        setSession(null);
        setInitialized(true);
        return;
      }
      
      const sessionExpiry = await AsyncStorage.getItem('session_expiry');
      if (sessionExpiry && Date.now() > parseInt(sessionExpiry)) {
        await supabase.auth.signOut();
        setSession(null);
        setInitialized(true);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setInitialized(true);
    };

    checkAuth();

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
  }, []);

  useEffect(() => {
    if (!initialized) return;

    const inAuthGroup = segments[0] === '(admin)';

    if (!session && inAuthGroup) {
      router.replace('/login');
    } else if (session && !inAuthGroup) {
      router.replace('/(admin)');
    } else if (!session && segments.length === (0 as number)) {
      router.replace('/login');
    }

    // Hide splash screen after navigation is determined
    setTimeout(() => {
      SplashScreen.hideAsync();
    }, 100);

  }, [session, initialized, segments]);

  if (!initialized) {
    return null;
  }

  return <Slot />;
}
