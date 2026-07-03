import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, TextInput, ActivityIndicator } from 'react-native';
import { supabase } from '../../src/lib/supabase';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SettingsScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleLogout() {
    Alert.alert('Confirm Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
        }
      }
    ]);
  }

  async function handleChangePassword() {
    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Success', 'Password updated successfully!');
      setModalVisible(false);
      setNewPassword('');
    }
  }

  const SettingsItem = ({ icon, title, subtitle, destructive = false, onPress }: { icon: any, title: string, subtitle?: string, destructive?: boolean, onPress?: () => void }) => (
    <TouchableOpacity 
      className="flex-row items-center justify-between p-4 bg-surface-container-lowest border-b border-outline-variant/30 active:bg-surface-container"
      onPress={onPress}
    >
      <View className="flex-row items-center">
        <View className={`w-10 h-10 rounded-full items-center justify-center mr-4 ${destructive ? 'bg-error-container' : 'bg-surface-variant'}`}>
          <MaterialIcons name={icon} size={20} color={destructive ? '#ba1a1a' : '#001f85'} />
        </View>
        <View>
          <Text className={`font-title-lg text-base font-bold ${destructive ? 'text-error' : 'text-on-surface'}`}>{title}</Text>
          {subtitle && <Text className="font-body-md text-sm text-on-surface-variant mt-0.5">{subtitle}</Text>}
        </View>
      </View>
      <MaterialIcons name="chevron-right" size={24} color="#8e706a" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="px-container-padding py-6 border-b border-outline-variant/30 bg-surface">
        <Text className="font-headline-md text-2xl font-bold text-on-surface">Settings</Text>
        <Text className="font-body-md text-on-surface-variant">Account management</Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
        <Text className="font-label-md text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3 ml-2">Account Options</Text>
        <View className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 overflow-hidden mb-6">
          <SettingsItem 
            icon="lock" 
            title="Change Password" 
            subtitle="Update your admin password" 
            onPress={() => setModalVisible(true)}
          />
          <SettingsItem 
            icon="logout" 
            title="Log Out" 
            subtitle="Sign out of admin portal" 
            destructive={true} 
            onPress={handleLogout} 
          />
        </View>
      </ScrollView>

      {/* Change Password Overlay */}
      {modalVisible && (
        <View className="absolute top-0 bottom-0 left-0 right-0 bg-black/50 justify-center items-center px-4 z-50">
          <View className="bg-surface w-full max-w-sm rounded-2xl p-6 shadow-lg" style={{ elevation: 5 }}>
            <View className="flex-row justify-between items-center mb-6">
              <Text className="font-headline-md text-xl font-bold text-on-surface">Change Password</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <MaterialIcons name="close" size={24} color="#1a1c1e" />
              </TouchableOpacity>
            </View>
            
            <View className="mb-6">
              <Text className="font-label-md font-bold text-on-surface mb-2">New Password</Text>
              <TextInput
                className="w-full bg-surface-variant p-4 rounded-xl text-on-surface font-body-md"
                placeholder="Enter new password"
                placeholderTextColor="#74777f"
                secureTextEntry
                value={newPassword}
                onChangeText={setNewPassword}
              />
            </View>

            <TouchableOpacity 
              className={`w-full py-4 rounded-xl items-center justify-center flex-row shadow-md ${saving ? 'bg-primary/70' : 'bg-primary'}`}
              onPress={handleChangePassword}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color="white" /> : <Text className="text-white font-title-lg font-bold">Update Password</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
