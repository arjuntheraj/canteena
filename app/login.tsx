import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { supabase } from '../src/lib/supabase';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  async function signInWithEmail() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) {
      Alert.alert('Login Failed', error.message);
    } else {
      await AsyncStorage.setItem('remember_me', rememberMe ? 'true' : 'false');
      if (rememberMe) {
        // Expire in 30 days
        const expiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
        await AsyncStorage.setItem('session_expiry', expiry.toString());
      }
    }
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-background justify-center items-center px-container-padding py-xl"
    >
      <StatusBar style="dark" />
      
      {/* Top Glow Effect */}
      <View className="absolute top-0 left-0 w-full h-1">
         <LinearGradient
            colors={['#b3290f', '#ff5f40', '#b3290f']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
      </View>

      {/* Logo Section */}
      <View className="mb-lg flex flex-col items-center">
        <View className="w-16 h-16 bg-primary-container rounded-xl flex items-center justify-center shadow-lg transform rotate-3 mb-2">
          <MaterialIcons name="restaurant" size={40} color="#5f0a00" />
        </View>
        <Text className="font-headline-lg-mobile text-3xl font-bold text-primary tracking-tight">Canteena</Text>
      </View>

      {/* Login Card */}
      <View className="w-full max-w-md bg-surface-container-lowest p-lg rounded-xl border border-outline-variant/30 shadow-lg" style={{ shadowColor: '#b3290f', shadowOpacity: 0.12, shadowRadius: 12, elevation: 5 }}>
        <View className="mb-md">
          <Text className="font-headline-md text-2xl font-bold text-on-surface">Welcome</Text>
          <Text className="font-body-md text-on-surface-variant mt-xs">Access the Canteena administration panel</Text>
        </View>

        <View className="space-y-4">
          {/* Admin Email */}
          <View>
            <Text className="font-label-md text-xs font-medium text-on-surface-variant ml-xs mb-1">Admin Email</Text>
            <View className="relative justify-center">
              <View className="absolute left-md z-10">
                <MaterialIcons name="alternate-email" size={20} color="#5a413b" />
              </View>
              <TextInput
                className="w-full h-12 bg-[#F1F5F9] rounded-lg pl-12 pr-md text-body-lg text-on-surface focus:bg-white focus:border focus:border-primary"
                onChangeText={setEmail}
                value={email}
                placeholder="admin@canteena.com"
                placeholderTextColor="#94a3b8"
                autoCapitalize={'none'}
                keyboardType="email-address"
              />
            </View>
          </View>
          
          {/* Password */}
          <View className="mt-4">
            <View className="flex-row justify-between items-center ml-xs mb-1">
              <Text className="font-label-md text-xs font-medium text-on-surface-variant">Password</Text>
            </View>
            <View className="relative justify-center">
              <View className="absolute left-md z-10">
                <MaterialIcons name="lock" size={20} color="#5a413b" />
              </View>
              <TextInput
                className="w-full h-12 bg-[#F1F5F9] rounded-lg pl-12 pr-12 text-body-lg text-on-surface focus:bg-white focus:border focus:border-primary"
                onChangeText={setPassword}
                value={password}
                secureTextEntry={!showPassword}
                placeholder="••••••••"
                placeholderTextColor="#94a3b8"
                autoCapitalize={'none'}
              />
              <TouchableOpacity 
                className="absolute right-md z-10"
                onPress={() => setShowPassword(!showPassword)}
              >
                <MaterialIcons name={showPassword ? "visibility-off" : "visibility"} size={20} color="#5a413b" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Remember Me */}
          <View className="flex-row items-center pt-xs mt-2">
            <TouchableOpacity 
              className={`w-5 h-5 rounded border items-center justify-center ${rememberMe ? 'bg-primary border-primary' : 'bg-[#F1F5F9] border-outline-variant'}`}
              onPress={() => setRememberMe(!rememberMe)}
            >
              {rememberMe && <MaterialIcons name="check" size={14} color="white" />}
            </TouchableOpacity>
            <Text className="font-body-md text-sm text-on-surface-variant ml-2">Keep me logged in for 30 days</Text>
          </View>

          {/* Sign In Button */}
          <TouchableOpacity 
            className={`w-full h-14 bg-primary rounded-xl shadow-md flex-row items-center justify-center mt-6 ${loading ? 'opacity-70' : ''}`}
            onPress={signInWithEmail}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Text className="text-white font-semibold text-lg mr-2">Sign In</Text>
                <MaterialIcons name="login" size={20} color="white" />
              </>
            )}
          </TouchableOpacity>
        </View>


      </View>

      {/* Powered By */}
      <View className="mt-8 items-center">
        <Text className="text-xs font-medium text-on-surface-variant/60 uppercase tracking-widest mb-2">
          Powered by <Text className="text-primary/70 font-bold">IdeaX Solutions © 2026</Text>
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
