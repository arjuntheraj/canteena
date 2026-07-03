import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal } from 'react-native';
import { supabase } from '../../src/lib/supabase';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import { shareAsync } from 'expo-sharing';
import { useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';

type Order = {
  id: string;
  order_number: number;
  total_amount: number;
  payment_method: string;
  created_at: string;
  companies: { name: string } | null;
  company_id: string | null;
};

type Company = {
  id: string;
  name: string;
};

export default function ReportsScreen() {
  const params = useLocalSearchParams<{ type?: 'general' | 'cash_only' | 'coupon_sale', filter?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom' }>();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom'>(params.filter as any || 'daily');
  
  // Custom Date States
  const [customStartDate, setCustomStartDate] = useState(new Date());
  const [customEndDate, setCustomEndDate] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const [reportType, setReportType] = useState<'general' | 'cash_only' | 'coupon_sale'>(params.type || 'general');
  const [companies, setCompanies] = useState<Company[]>([]);
  
  // Multi-select for companies
  const [companyModalVisible, setCompanyModalVisible] = useState(false);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);
  
  const [stats, setStats] = useState({
    total: 0,
    cash: 0,
    coupon: 0,
    companyBreakdown: {} as Record<string, number>
  });

  useEffect(() => {
    fetchCompanies();
  }, []);

  // Sync params when navigating from dashboard
  useEffect(() => {
    if (params.type) setReportType(params.type);
    if (params.filter) setFilter(params.filter as any);
  }, [params.type, params.filter]);

  useEffect(() => {
    fetchReports();

    const channel = supabase.channel('public:orders_reports')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchReports();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [filter, reportType, selectedCompanyIds, customStartDate, customEndDate]);

  async function fetchCompanies() {
    const { data } = await supabase.from('companies').select('id, name').order('name');
    if (data) {
      setCompanies(data);
      // Pre-select all by default
      setSelectedCompanyIds(data.map(c => c.id));
    }
  }

  async function fetchReports() {
    setLoading(true);
    let query = supabase.from('orders').select(`
      id, order_number, total_amount, payment_method, created_at, company_id,
      companies (name)
    `).order('created_at', { ascending: false });

    // Apply Report Type Filters
    if (reportType === 'cash_only') {
      query = query.in('payment_method', ['cash', 'gpay']);
    } else if (reportType === 'coupon_sale') {
      query = query.eq('payment_method', 'coupon');
      if (selectedCompanyIds.length > 0) {
        query = query.in('company_id', selectedCompanyIds);
      } else {
        // If NO companies are selected, we shouldn't return any coupon orders
        // Supabase `.in` with empty array might error or return all. 
        // We ensure it returns nothing by using an impossible condition:
        query = query.eq('id', '00000000-0000-0000-0000-000000000000');
      }
    }

    // Apply Date Range Filter
    const now = new Date();
    if (filter === 'daily') {
      now.setHours(0, 0, 0, 0);
      query = query.gte('created_at', now.toISOString());
    } else if (filter === 'weekly') {
      now.setDate(now.getDate() - 7);
      query = query.gte('created_at', now.toISOString());
    } else if (filter === 'monthly') {
      now.setMonth(now.getMonth() - 1);
      query = query.gte('created_at', now.toISOString());
    } else if (filter === 'quarterly') {
      now.setMonth(now.getMonth() - 3);
      query = query.gte('created_at', now.toISOString());
    } else if (filter === 'yearly') {
      now.setFullYear(now.getFullYear() - 1);
      query = query.gte('created_at', now.toISOString());
    } else if (filter === 'custom') {
      const start = new Date(customStartDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(customEndDate);
      end.setHours(23, 59, 59, 999);
      query = query.gte('created_at', start.toISOString()).lte('created_at', end.toISOString());
    }

    const { data, error } = await query;
    
    if (error) {
      console.error(error);
    } else if (data) {
      setOrders(data as unknown as Order[]);
      
      let t = 0;
      let c = 0;
      let cp = 0;
      const breakdown: Record<string, number> = {};

      data.forEach((o: any) => {
        t += Number(o.total_amount);
        if (o.payment_method === 'cash' || o.payment_method === 'gpay') c += Number(o.total_amount);
        if (o.payment_method === 'coupon') {
          cp += Number(o.total_amount);
          const cName = o.companies?.name || 'Unknown Company';
          breakdown[cName] = (breakdown[cName] || 0) + Number(o.total_amount);
        }
      });

      setStats({ total: t, cash: c, coupon: cp, companyBreakdown: breakdown });
    }
    setLoading(false);
  }

  async function handleDownload() {
    try {
      const breakdownHtml = Object.entries(stats.companyBreakdown).map(([name, amount]) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${name}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">₹${amount.toFixed(2)}</td>
        </tr>
      `).join('');

      const ordersHtml = orders.map(order => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${order.order_number ? '#' + order.order_number : order.id.substring(0, 8)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${new Date(order.created_at).toLocaleString()}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${order.payment_method.toUpperCase()}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${order.companies?.name || '-'}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">₹${Number(order.total_amount).toFixed(2)}</td>
        </tr>
      `).join('');

      const titles = {
        'general': 'General Financial Report',
        'cash_only': 'Cash Sales Report',
        'coupon_sale': 'Coupon Sales Report'
      };

      const title = titles[reportType] || 'Financial Report';

      // Describe selected companies if it's a coupon report
      let companiesSelectedText = 'All Companies';
      if (reportType === 'coupon_sale') {
        if (selectedCompanyIds.length === companies.length) {
          companiesSelectedText = 'All Companies';
        } else if (selectedCompanyIds.length === 0) {
          companiesSelectedText = 'No Companies Selected';
        } else {
          const names = companies.filter(c => selectedCompanyIds.includes(c.id)).map(c => c.name);
          companiesSelectedText = names.join(', ');
        }
      }

      const html = `
        <html>
          <body style="font-family: sans-serif; padding: 40px; color: #333;">
            <h1 style="text-align: center; color: #b3290f;">${title}</h1>
            <p style="text-align: center; color: #666; margin-bottom: 5px;">Generated on: ${new Date().toLocaleString()}</p>
            <p style="text-align: center; color: #666; margin-bottom: 5px;">Time Range: ${filter.toUpperCase()}</p>
            ${reportType === 'coupon_sale' ? `<p style="text-align: center; color: #666; margin-bottom: 40px; font-weight: bold;">Companies: ${companiesSelectedText}</p>` : '<div style="margin-bottom: 40px;"></div>'}

            <h2 style="border-bottom: 2px solid #b3290f; padding-bottom: 10px;">Summary</h2>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 40px;">
              <tr>
                <td style="padding: 10px; font-weight: bold; background: #f9f9f9;">Total Revenue</td>
                <td style="padding: 10px; text-align: right; font-weight: bold; background: #f9f9f9;">₹${stats.total.toFixed(2)}</td>
              </tr>
              ${reportType !== 'coupon_sale' ? `
              <tr>
                <td style="padding: 10px;">Cash / GPay</td>
                <td style="padding: 10px; text-align: right;">₹${stats.cash.toFixed(2)}</td>
              </tr>
              ` : ''}
              ${reportType !== 'cash_only' ? `
              <tr>
                <td style="padding: 10px;">Coupons</td>
                <td style="padding: 10px; text-align: right;">₹${stats.coupon.toFixed(2)}</td>
              </tr>
              ` : ''}
            </table>

            ${(reportType === 'general' || reportType === 'coupon_sale') && Object.keys(stats.companyBreakdown).length > 0 ? `
              <h2 style="border-bottom: 2px solid #b3290f; padding-bottom: 10px;">Coupon Breakdown</h2>
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 40px;">
                ${breakdownHtml}
              </table>
            ` : ''}

            <h2 style="border-bottom: 2px solid #b3290f; padding-bottom: 10px;">Order History</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background: #f0f0f0;">
                  <th style="padding: 10px; text-align: left;">Order ID</th>
                  <th style="padding: 10px; text-align: left;">Date / Time</th>
                  <th style="padding: 10px; text-align: left;">Payment Method</th>
                  <th style="padding: 10px; text-align: left;">Company</th>
                  <th style="padding: 10px; text-align: right;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${ordersHtml}
              </tbody>
            </table>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      await shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (e: any) {
      console.error(e);
      Alert.alert('Error', 'Failed to generate report PDF');
    }
  }

  const FilterButton = ({ label, value }: { label: string, value: any }) => (
    <TouchableOpacity 
      className={`px-4 py-2 rounded-full mr-2 border ${filter === value ? 'bg-primary border-primary' : 'bg-surface-container-lowest border-outline-variant/30'}`}
      onPress={() => setFilter(value)}
    >
      <Text className={`font-label-md font-bold ${filter === value ? 'text-on-primary' : 'text-on-surface-variant'}`}>{label}</Text>
    </TouchableOpacity>
  );

  const ReportTypePill = ({ label, value }: { label: string, value: any }) => (
    <TouchableOpacity 
      className={`px-4 py-2 rounded-full mr-2 border ${reportType === value ? 'bg-tertiary border-tertiary' : 'bg-surface-container-lowest border-outline-variant/30'}`}
      onPress={() => {
        setReportType(value);
        if (value === 'coupon_sale') {
          setCompanyModalVisible(true);
        }
      }}
    >
      <Text className={`font-label-md font-bold ${reportType === value ? 'text-on-tertiary' : 'text-on-surface-variant'}`}>{label}</Text>
    </TouchableOpacity>
  );

  const toggleCompany = (id: string) => {
    setSelectedCompanyIds(prev => 
      prev.includes(id) ? prev.filter(cId => cId !== id) : [...prev, id]
    );
  };

  const toggleAllCompanies = () => {
    if (selectedCompanyIds.length === companies.length) {
      setSelectedCompanyIds([]);
    } else {
      setSelectedCompanyIds(companies.map(c => c.id));
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="px-container-padding py-4 border-b border-outline-variant/30 bg-surface">
        <View className="flex-row justify-between items-center mb-4">
          <View>
            <Text className="font-headline-md text-2xl font-bold text-on-surface">Financial Reports</Text>
            <Text className="font-body-md text-on-surface-variant">View sales data.</Text>
          </View>
          <TouchableOpacity onPress={handleDownload} className="w-10 h-10 bg-surface-container rounded-full items-center justify-center border border-outline-variant/30">
            <MaterialIcons name="file-download" size={20} color="#1a1c1e" />
          </TouchableOpacity>
        </View>

        {/* Report Type Selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row mb-3">
          <ReportTypePill label="General" value="general" />
          <ReportTypePill label="Cash Sale" value="cash_only" />
          <ReportTypePill label="Coupon Sale" value="coupon_sale" />
        </ScrollView>
        
        {/* Selected Companies Label for Coupon Sale */}
        {reportType === 'coupon_sale' && (
          <View className="mb-3 flex-row items-center justify-between bg-surface-variant px-3 py-2 rounded-xl">
             <Text className="font-body-md text-on-surface-variant flex-1" numberOfLines={1}>
                {selectedCompanyIds.length === companies.length 
                  ? 'All Companies Selected' 
                  : selectedCompanyIds.length === 0
                    ? 'No Companies Selected'
                    : `${selectedCompanyIds.length} Companies Selected`}
             </Text>
             <TouchableOpacity onPress={() => setCompanyModalVisible(true)} className="bg-surface-container-high px-3 py-1 rounded-full">
               <Text className="font-label-md font-bold text-on-surface">Edit</Text>
             </TouchableOpacity>
          </View>
        )}

        {/* Date Filter Selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
          <FilterButton label="Daily" value="daily" />
          <FilterButton label="Weekly" value="weekly" />
          <FilterButton label="Monthly" value="monthly" />
          <FilterButton label="Quarterly" value="quarterly" />
          <FilterButton label="Yearly" value="yearly" />
          <FilterButton label="Custom" value="custom" />
        </ScrollView>

        {filter === 'custom' && (
          <View className="flex-row items-center mt-3 gap-2">
            <TouchableOpacity 
              className="flex-1 bg-surface-container-lowest p-2 rounded-lg border border-outline-variant/30 items-center"
              onPress={() => setShowStartPicker(true)}
            >
              <Text className="font-label-md text-on-surface-variant">From Date</Text>
              <Text className="font-body-md text-on-surface font-bold">{customStartDate.toLocaleDateString()}</Text>
            </TouchableOpacity>
            <Text className="font-body-md text-on-surface-variant">-</Text>
            <TouchableOpacity 
              className="flex-1 bg-surface-container-lowest p-2 rounded-lg border border-outline-variant/30 items-center"
              onPress={() => setShowEndPicker(true)}
            >
              <Text className="font-label-md text-on-surface-variant">To Date</Text>
              <Text className="font-body-md text-on-surface font-bold">{customEndDate.toLocaleDateString()}</Text>
            </TouchableOpacity>
          </View>
        )}

        {showStartPicker && Platform.OS !== 'web' && (
          <DateTimePicker
            value={customStartDate}
            mode="date"
            display="default"
            onChange={(event, date) => {
              setShowStartPicker(Platform.OS === 'ios');
              if (date) setCustomStartDate(date);
            }}
          />
        )}
        
        {showEndPicker && Platform.OS !== 'web' && (
          <DateTimePicker
            value={customEndDate}
            mode="date"
            display="default"
            onChange={(event, date) => {
              setShowEndPicker(Platform.OS === 'ios');
              if (date) setCustomEndDate(date);
            }}
          />
        )}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
           <ActivityIndicator size="large" color="#b3290f" />
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
          {/* Main Revenue Card */}
          <View className="w-full rounded-2xl overflow-hidden mb-6 shadow-md" style={{ elevation: 4 }}>
            <LinearGradient
              colors={['#b3290f', '#ff5f40']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              className="p-6"
            >
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-white/80 font-label-md font-bold uppercase tracking-wider">Total Revenue</Text>
                <MaterialIcons name="trending-up" size={24} color="white" />
              </View>
              <Text className="text-white font-display-lg text-4xl font-bold">₹{stats.total.toFixed(2)}</Text>
            </LinearGradient>
          </View>

          {/* Breakdown Cards */}
          {reportType === 'general' && (
            <View className="flex-row justify-between mb-6">
              <View className="w-[48%] bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-outline-variant/30">
                <View className="w-8 h-8 bg-surface-variant rounded-full items-center justify-center mb-3">
                  <MaterialIcons name="payments" size={18} color="#001f85" />
                </View>
                <Text className="text-on-surface-variant font-label-md text-xs mb-1">Cash / GPay</Text>
                <Text className="text-on-surface font-title-lg text-xl font-bold">₹{stats.cash.toFixed(2)}</Text>
              </View>
              <View className="w-[48%] bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-outline-variant/30">
                <View className="w-8 h-8 bg-tertiary-fixed rounded-full items-center justify-center mb-3">
                  <MaterialIcons name="local-activity" size={18} color="#001159" />
                </View>
                <Text className="text-on-surface-variant font-label-md text-xs mb-1">Coupon Revenue</Text>
                <Text className="text-on-surface font-title-lg text-xl font-bold">₹{stats.coupon.toFixed(2)}</Text>
              </View>
            </View>
          )}

          {reportType === 'cash_only' && (
             <View className="w-full bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-outline-variant/30 mb-6">
                <View className="w-8 h-8 bg-surface-variant rounded-full items-center justify-center mb-3">
                  <MaterialIcons name="payments" size={18} color="#001f85" />
                </View>
                <Text className="text-on-surface-variant font-label-md text-xs mb-1">Cash / GPay</Text>
                <Text className="text-on-surface font-title-lg text-xl font-bold">₹{stats.cash.toFixed(2)}</Text>
              </View>
          )}

          {reportType === 'coupon_sale' && (
             <View className="w-full bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-outline-variant/30 mb-6">
                <View className="w-8 h-8 bg-tertiary-fixed rounded-full items-center justify-center mb-3">
                  <MaterialIcons name="local-activity" size={18} color="#001159" />
                </View>
                <Text className="text-on-surface-variant font-label-md text-xs mb-1">Coupon Revenue</Text>
                <Text className="text-on-surface font-title-lg text-xl font-bold">₹{stats.coupon.toFixed(2)}</Text>
              </View>
          )}

          {/* Company Breakdown */}
          {(reportType === 'general' || reportType === 'coupon_sale') && Object.keys(stats.companyBreakdown).length > 0 && (
            <View className="bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-outline-variant/30 mb-6">
              <Text className="font-title-lg text-lg font-bold text-on-surface mb-4">Corporate Settlements</Text>
              {Object.entries(stats.companyBreakdown).map(([name, amount], index, arr) => (
                <View key={index} className={`flex-row justify-between items-center py-3 ${index !== arr.length - 1 ? 'border-b border-outline-variant/20' : ''}`}>
                  <View className="flex-row items-center">
                    <View className="w-8 h-8 bg-surface-variant rounded-full items-center justify-center mr-3">
                      <MaterialIcons name="business" size={16} color="#001f85" />
                    </View>
                    <Text className="font-body-md text-on-surface font-semibold">{name}</Text>
                  </View>
                  <Text className="font-label-md font-bold text-primary">₹{amount.toFixed(2)}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Recent Transactions */}
          <Text className="font-title-lg text-lg font-bold text-on-background mb-4">Transaction History</Text>
          <View className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 overflow-hidden mb-8">
            {orders.slice(0, 50).map((order, index) => (
              <View key={order.id} className={`p-4 flex-row justify-between items-center ${index !== orders.length - 1 ? 'border-b border-outline-variant/20' : ''}`}>
                <View className="flex-row items-center">
                   <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${order.payment_method === 'coupon' ? 'bg-tertiary-fixed' : 'bg-primary-fixed'}`}>
                      <MaterialIcons name={order.payment_method === 'coupon' ? 'local-activity' : 'payments'} size={20} color={order.payment_method === 'coupon' ? '#001159' : '#3e0400'} />
                   </View>
                   <View>
                     <View className="flex-row items-center gap-2">
                       <Text className="font-title-lg text-base font-bold text-on-surface">₹{Number(order.total_amount).toFixed(2)}</Text>
                       <Text className="font-label-md text-xs font-bold text-primary bg-primary-container px-1.5 py-0.5 rounded-sm">{order.order_number ? '#' + order.order_number : order.id.substring(0, 8)}</Text>
                     </View>
                     <Text className="font-label-md text-xs text-on-surface-variant mt-0.5">{new Date(order.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} • {new Date(order.created_at).toLocaleDateString()}</Text>
                   </View>
                </View>
                <View className="items-end">
                  <View className={`px-2.5 py-1 rounded-full ${order.payment_method === 'coupon' ? 'bg-tertiary-fixed-dim' : 'bg-surface-variant'}`}>
                    <Text className={`font-label-md text-[10px] font-bold uppercase ${order.payment_method === 'coupon' ? 'text-on-tertiary-fixed-variant' : 'text-on-surface-variant'}`}>
                      {order.payment_method}
                    </Text>
                  </View>
                  {order.payment_method === 'coupon' && order.companies && (
                    <Text className="font-label-md text-[10px] text-on-surface-variant mt-1 max-w-[80px]" numberOfLines={1}>
                      {order.companies.name}
                    </Text>
                  )}
                </View>
              </View>
            ))}
            {orders.length === 0 && (
              <View className="p-8 items-center justify-center">
                <MaterialIcons name="receipt-long" size={32} color="#8e706a" />
                <Text className="font-body-md text-on-surface-variant mt-2">No transactions found.</Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* Company Multi-Select Modal */}
      <Modal
        visible={companyModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setCompanyModalVisible(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-surface rounded-t-3xl pt-6 pb-8 px-6 max-h-[80%]">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="font-headline-md text-xl font-bold text-on-surface">Select Companies</Text>
              <TouchableOpacity onPress={() => setCompanyModalVisible(false)} className="w-8 h-8 items-center justify-center bg-surface-variant rounded-full">
                <MaterialIcons name="close" size={20} color="#1a1c1e" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              className="flex-row items-center py-3 border-b border-outline-variant/30 mb-2"
              onPress={toggleAllCompanies}
            >
               <MaterialIcons 
                  name={selectedCompanyIds.length === companies.length ? "check-box" : "check-box-outline-blank"} 
                  size={24} 
                  color={selectedCompanyIds.length === companies.length ? "#b3290f" : "#74777f"} 
                />
                <Text className="font-title-lg text-base ml-3 font-bold text-on-surface">All Companies</Text>
            </TouchableOpacity>

            <ScrollView className="mb-6">
              {companies.map((c) => {
                const isSelected = selectedCompanyIds.includes(c.id);
                return (
                  <TouchableOpacity 
                    key={c.id} 
                    className="flex-row items-center py-3 border-b border-outline-variant/10"
                    onPress={() => toggleCompany(c.id)}
                  >
                    <MaterialIcons 
                      name={isSelected ? "check-box" : "check-box-outline-blank"} 
                      size={24} 
                      color={isSelected ? "#b3290f" : "#74777f"} 
                    />
                    <Text className={`font-body-md text-base ml-3 ${isSelected ? 'text-on-surface font-semibold' : 'text-on-surface-variant'}`}>
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            
            <TouchableOpacity 
              className="w-full bg-primary py-4 rounded-xl items-center shadow-md"
              onPress={() => setCompanyModalVisible(false)}
            >
              <Text className="text-white font-title-lg font-bold">Apply Filters</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
