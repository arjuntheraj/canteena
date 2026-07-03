import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { supabase } from '../../src/lib/supabase';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DashboardScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalSales: 0,
    cashSales: 0,
    couponSales: 0,
  });

  useEffect(() => {
    fetchTodayStats();
    
    // Subscribe to real-time changes on orders
    const channel = supabase.channel('public:orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchTodayStats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchTodayStats() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('orders')
        .select('total_amount, payment_method')
        .gte('created_at', today.toISOString());

      if (error) throw error;

      let total = 0;
      let cash = 0;
      let coupon = 0;

      data.forEach((order) => {
        total += Number(order.total_amount);
        if (order.payment_method === 'cash' || order.payment_method === 'gpay') cash += Number(order.total_amount);
        if (order.payment_method === 'coupon') coupon += Number(order.total_amount);
      });

      setStats({
        totalSales: total,
        cashSales: cash,
        couponSales: coupon,
      });
    } catch (error) {
      console.error('Error fetching stats', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 justify-center items-center bg-background">
        <ActivityIndicator size="large" color="#b3290f" />
      </SafeAreaView>
    );
  }

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

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Header */}
      <View className="mb-6 flex-row justify-between items-center">
        <View>
          <Text className="font-headline-md text-2xl font-bold text-on-background">Live Dashboard</Text>
          <Text className="font-body-md text-on-surface-variant">Real-time overview of today's sales</Text>
        </View>
        <View className="flex-row gap-2">
          <TouchableOpacity onPress={handleLogout} className="w-10 h-10 bg-error-container rounded-full items-center justify-center">
            <MaterialIcons name="logout" size={20} color="#ba1a1a" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Metric Card */}
      <View className="w-full rounded-2xl overflow-hidden mb-6 shadow-md" style={{ elevation: 4 }}>
        <LinearGradient
          colors={['#b3290f', '#ff5f40']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="p-6"
        >
          <View className="flex-row justify-between items-start mb-4">
            <View className="w-12 h-12 bg-white/20 rounded-xl items-center justify-center">
              <MaterialIcons name="point-of-sale" size={28} color="white" />
            </View>
            <View className="bg-white/20 px-3 py-1 rounded-full">
              <Text className="text-white font-label-md text-xs font-bold uppercase">Today</Text>
            </View>
          </View>
          <Text className="text-white/80 font-body-md mb-1">Total Gross Sales</Text>
          <Text className="text-white font-display-lg text-4xl font-bold">₹{stats.totalSales.toFixed(2)}</Text>
        </LinearGradient>
      </View>

      {/* Secondary Metrics Row */}
      <View className="flex-row justify-between mb-6">
        {/* Cash Metric */}
        <TouchableOpacity 
          className="w-[48%] bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/30 shadow-sm active:bg-surface-container"
          onPress={() => router.push('/(admin)/reports?type=cash_only&filter=daily')}
        >
          <View className="w-8 h-8 bg-surface-variant rounded-full items-center justify-center mb-3">
            <MaterialIcons name="payments" size={18} color="#001f85" />
          </View>
          <Text className="text-on-surface-variant font-label-md text-xs mb-1">Cash</Text>
          <Text className="text-on-surface font-title-lg text-xl font-bold">₹{stats.cashSales.toFixed(2)}</Text>
        </TouchableOpacity>

        {/* Coupon Metric */}
        <TouchableOpacity 
          className="w-[48%] bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/30 shadow-sm active:bg-surface-container"
          onPress={() => router.push('/(admin)/reports?type=coupon_sale&filter=daily')}
        >
          <View className="w-8 h-8 bg-tertiary-fixed rounded-full items-center justify-center mb-3">
            <MaterialIcons name="local-activity" size={18} color="#001159" />
          </View>
          <Text className="text-on-surface-variant font-label-md text-xs mb-1">Coupons Redeemed</Text>
          <Text className="text-on-surface font-title-lg text-xl font-bold">₹{stats.couponSales.toFixed(2)}</Text>
        </TouchableOpacity>
      </View>

      {/* Quick Actions */}
      <Text className="font-title-lg text-lg font-bold text-on-background mb-4">Quick Actions</Text>
      <View className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 overflow-hidden shadow-sm">
        <TouchableOpacity 
          className="flex-row items-center p-4 border-b border-outline-variant/30 active:bg-surface-container"
          onPress={() => router.push('/(admin)/menu')}
        >
          <View className="w-10 h-10 bg-primary-fixed rounded-full items-center justify-center mr-4">
            <MaterialIcons name="restaurant-menu" size={20} color="#3e0400" />
          </View>
          <View className="flex-1">
            <Text className="font-title-lg text-base font-semibold text-on-surface">Manage Menu</Text>
            <Text className="font-body-md text-sm text-on-surface-variant">Add or update food items</Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color="#8e706a" />
        </TouchableOpacity>

        <TouchableOpacity 
          className="flex-row items-center p-4 border-b border-outline-variant/30 active:bg-surface-container"
          onPress={() => router.push('/(admin)/companies')}
        >
          <View className="w-10 h-10 bg-tertiary-fixed rounded-full items-center justify-center mr-4">
            <MaterialIcons name="business" size={20} color="#001159" />
          </View>
          <View className="flex-1">
            <Text className="font-title-lg text-base font-semibold text-on-surface">Company Limits</Text>
            <Text className="font-body-md text-sm text-on-surface-variant">Manage daily coupon allocations</Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color="#8e706a" />
        </TouchableOpacity>

        <TouchableOpacity 
          className="flex-row items-center p-4 active:bg-surface-container"
          onPress={() => router.push('/(admin)/reports')}
        >
          <View className="w-10 h-10 bg-surface-variant rounded-full items-center justify-center mr-4">
            <MaterialIcons name="receipt-long" size={20} color="#0b1c30" />
          </View>
          <View className="flex-1">
            <Text className="font-title-lg text-base font-semibold text-on-surface">View Reports</Text>
            <Text className="font-body-md text-sm text-on-surface-variant">Detailed sales and settlements</Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color="#8e706a" />
        </TouchableOpacity>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}
