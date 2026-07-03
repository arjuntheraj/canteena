import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, Alert, ActivityIndicator, Switch, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { supabase } from '../../src/lib/supabase';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

type Company = {
  id: string;
  name: string;
  daily_coupon_limit: number;
  is_eligible: boolean;
};

export default function CompaniesScreen() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formLimit, setFormLimit] = useState('');
  const [formEligible, setFormEligible] = useState(true);

  // Settlements states
  const [settlementsModalVisible, setSettlementsModalVisible] = useState(false);
  const [settlementsTab, setSettlementsTab] = useState<'pending' | 'history'>('pending');
  const [pendingSettlements, setPendingSettlements] = useState<any[]>([]);
  const [historicalSettlements, setHistoricalSettlements] = useState<any[]>([]);
  const [loadingSettlements, setLoadingSettlements] = useState(false);
  const [processingSettlementId, setProcessingSettlementId] = useState<string | null>(null);

  useEffect(() => {
    fetchCompanies();

    const channel = supabase.channel('public:companies_orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'companies' }, () => {
        fetchCompanies();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchSettlements(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements' }, () => {
        fetchSettlements(true);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchCompanies() {
    setLoading(true);
    const { data, error } = await supabase.from('companies').select('*').order('name');
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setCompanies(data || []);
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!formName) {
      Alert.alert('Validation Error', 'Company name is required');
      return;
    }

    setLoading(true);
    const payload = {
      name: formName,
      daily_coupon_limit: parseInt(formLimit) || 0,
      is_eligible: formEligible,
    };

    if (editingId) {
      const { error } = await supabase.from('companies').update(payload).eq('id', editingId);
      if (error) Alert.alert('Error', error.message);
    } else {
      const { error } = await supabase.from('companies').insert([payload]);
      if (error) Alert.alert('Error', error.message);
    }

    resetForm();
    await fetchCompanies();
  }

  function handleEdit(company: Company) {
    setIsEditing(true);
    setEditingId(company.id);
    setFormName(company.name);
    setFormLimit(company.daily_coupon_limit.toString());
    setFormEligible(company.is_eligible);
  }

  async function fetchSettlements(background = false) {
    if (!background) setLoadingSettlements(true);
    // Fetch pending
    const { data: pendingOrders } = await supabase
      .from('orders')
      .select('company_id, total_amount, created_at')
      .eq('payment_method', 'coupon')
      .eq('is_settled', false);

    const pendingMap: Record<string, any> = {};
    if (pendingOrders) {
      pendingOrders.forEach((o: any) => {
        if (!o.company_id) return;
        if (!pendingMap[o.company_id]) {
          pendingMap[o.company_id] = {
            company_id: o.company_id,
            start_date: o.created_at,
            end_date: o.created_at,
            total_amount: 0,
            coupon_count: 0
          };
        }
        const p = pendingMap[o.company_id];
        if (new Date(o.created_at) < new Date(p.start_date)) p.start_date = o.created_at;
        if (new Date(o.created_at) > new Date(p.end_date)) p.end_date = o.created_at;
        p.total_amount += Number(o.total_amount);
        p.coupon_count += 1;
      });
    }

    const pendingArr = Object.values(pendingMap).map(p => {
      const c = companies.find(comp => comp.id === p.company_id);
      return { ...p, company_name: c ? c.name : 'Unknown' };
    });
    setPendingSettlements(pendingArr);

    // Fetch history
    const { data: historyData } = await supabase
      .from('settlements')
      .select('*, companies(name)')
      .order('created_at', { ascending: false });
    
    setHistoricalSettlements(historyData || []);
    if (!background) setLoadingSettlements(false);
  }

  async function handleMarkPaid(p: any) {
    setProcessingSettlementId(p.company_id);
    try {
      const { data: settlement, error: sErr } = await supabase.from('settlements').insert([{
        company_id: p.company_id,
        start_date: p.start_date,
        end_date: p.end_date,
        total_amount: p.total_amount,
        coupon_count: p.coupon_count,
        status: 'settled'
      }]).select().single();
      
      if (sErr) throw sErr;

      const { error: oErr } = await supabase.from('orders')
        .update({ is_settled: true, settlement_id: settlement.id })
        .eq('company_id', p.company_id)
        .eq('payment_method', 'coupon')
        .eq('is_settled', false)
        .lte('created_at', p.end_date);
      
      if (oErr) throw oErr;
      
      Alert.alert('Success', `Settlement marked as paid for ${p.company_name}`);
      fetchSettlements();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setProcessingSettlementId(null);
    }
  }

  function resetForm() {
    setIsEditing(false);
    setEditingId(null);
    setFormName('');
    setFormLimit('');
    setFormEligible(true);
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="px-container-padding py-6 border-b border-outline-variant/30 bg-surface">
        <View className="flex-row justify-between items-center">
          <View className="flex-1 mr-4">
            <Text className="font-headline-md text-2xl font-bold text-on-surface" numberOfLines={1}>Companies</Text>
            <Text className="font-body-md text-on-surface-variant" numberOfLines={1}>Manage corporate accounts</Text>
          </View>
          <View className="flex-row gap-2 items-center">
            <TouchableOpacity 
              className="w-12 h-12 bg-tertiary-container rounded-xl items-center justify-center shadow-sm"
              onPress={() => { setSettlementsModalVisible(true); fetchSettlements(); }}
            >
              <MaterialIcons name="receipt-long" size={24} color="#31111d" />
            </TouchableOpacity>

            <TouchableOpacity 
              className="w-12 h-12 bg-primary text-on-primary rounded-xl items-center justify-center shadow-md active:bg-primary/90"
              onPress={() => setIsEditing(true)}
            >
              <MaterialIcons name="business" size={24} color="white" />
              <View className="absolute bottom-2 right-2 bg-white rounded-full">
                 <MaterialIcons name="add" size={10} color="#b3290f" />
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Loading Indicator */}
      {loading && (
        <View className="py-8 items-center justify-center">
          <ActivityIndicator size="large" color="#b3290f" />
        </View>
      )}

      {/* Companies List */}
      <FlatList
        data={companies}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={() => (
          !loading ? (
             <Text className="font-label-md text-xs font-bold text-on-surface-variant uppercase mb-4 tracking-wider">
               {companies.length} Registered Companies
             </Text>
          ) : null
        )}
        renderItem={({ item }) => (
          <View className="bg-surface-container-lowest p-4 rounded-xl mb-3 shadow-sm border border-outline-variant/30">
            <View className="flex-row justify-between items-start mb-3">
              <View className="flex-row items-center">
                <View className="w-10 h-10 bg-surface-variant rounded-full items-center justify-center mr-3">
                  <MaterialIcons name="business-center" size={20} color="#001f85" />
                </View>
                <View>
                  <Text className="font-title-lg text-lg font-bold text-on-surface">{item.name}</Text>
                  <View className="flex-row items-center mt-1">
                    <View className={`w-2 h-2 rounded-full mr-2 ${item.is_eligible ? 'bg-primary' : 'bg-outline-variant'}`} />
                    <Text className="font-label-md text-xs text-on-surface-variant uppercase font-bold">
                      {item.is_eligible ? 'Active' : 'Disabled'}
                    </Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity onPress={() => handleEdit(item)} className="w-8 h-8 bg-surface-container rounded-full items-center justify-center active:bg-surface-variant">
                <MaterialIcons name="edit" size={16} color="#0b1c30" />
              </TouchableOpacity>
            </View>
            <View className="bg-surface-container rounded-lg p-3 flex-row justify-between items-center border border-outline-variant/20">
              <Text className="font-body-md text-on-surface-variant">Daily Coupon Limit</Text>
              <Text className="font-title-lg text-primary font-bold">{item.daily_coupon_limit}</Text>
            </View>
          </View>
        )}
      />

      {/* Editor Form Modal */}
      <Modal visible={isEditing} animationType="slide" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 justify-end bg-black/50">
          <View className="bg-surface-container-lowest rounded-t-3xl p-6 pb-12 shadow-xl">
            <View className="flex-row justify-between items-center mb-6">
               <Text className="font-headline-md text-xl font-bold text-on-surface">
                 {editingId ? 'Edit Company' : 'New Company'}
               </Text>
               <TouchableOpacity onPress={resetForm} className="w-8 h-8 items-center justify-center bg-surface-container rounded-full">
                  <MaterialIcons name="close" size={20} color="#1a1c1e" />
               </TouchableOpacity>
            </View>

            <View className="space-y-4">
               <View>
                  <Text className="font-label-md text-xs font-medium text-on-surface-variant mb-1 ml-1">Company Name</Text>
                  <TextInput
                    className="w-full bg-surface-container-lowest border border-outline-variant/50 rounded-xl px-4 py-3 text-on-surface font-body-lg focus:border-primary"
                    placeholder="e.g. Acme Corp"
                    placeholderTextColor="#8e706a"
                    value={formName}
                    onChangeText={setFormName}
                  />
               </View>

               <View className="flex-row gap-4 items-center">
                 <View className="flex-1">
                    <Text className="font-label-md text-xs font-medium text-on-surface-variant mb-1 ml-1">Daily Limit</Text>
                    <TextInput
                      className="w-full bg-surface-container-lowest border border-outline-variant/50 rounded-xl px-4 py-3 text-on-surface font-body-lg focus:border-primary"
                      placeholder="e.g. 50"
                      placeholderTextColor="#8e706a"
                      value={formLimit}
                      onChangeText={setFormLimit}
                      keyboardType="number-pad"
                    />
                 </View>
                 <View className="flex-1 justify-center items-center bg-surface-container rounded-xl border border-outline-variant/30 h-14 mt-5">
                    <View className="flex-row items-center w-full justify-between px-4">
                      <Text className="font-label-md text-on-surface font-bold">Eligible</Text>
                      <Switch 
                        value={formEligible} 
                        onValueChange={setFormEligible} 
                        trackColor={{ false: '#e3beb7', true: '#ffdad3' }}
                        thumbColor={formEligible ? '#b3290f' : '#f8f9ff'}
                      />
                    </View>
                 </View>
               </View>

               <TouchableOpacity 
                  className="w-full h-14 bg-primary rounded-xl items-center justify-center shadow-md mt-6 active:bg-primary/90"
                  onPress={handleSave}
               >
                  <Text className="font-title-lg text-lg font-bold text-white">Save Company</Text>
               </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {/* Settlements Modal */}
      <Modal visible={settlementsModalVisible} animationType="slide" transparent={true}>
        <View className="flex-1 bg-surface pt-12">
          <View className="flex-row justify-between items-center px-4 pb-4 border-b border-outline-variant/30">
            <Text className="font-headline-md text-2xl font-bold text-on-surface">Coupon Settlements</Text>
            <TouchableOpacity onPress={() => setSettlementsModalVisible(false)} className="w-8 h-8 items-center justify-center bg-surface-container rounded-full">
              <MaterialIcons name="close" size={20} color="#1a1c1e" />
            </TouchableOpacity>
          </View>
          
          <View className="flex-row px-4 py-3 bg-surface-container-lowest">
            <TouchableOpacity 
              className={`flex-1 py-2 rounded-lg items-center ${settlementsTab === 'pending' ? 'bg-primary' : 'bg-surface-variant'}`}
              onPress={() => setSettlementsTab('pending')}
            >
              <Text className={`font-label-md font-bold ${settlementsTab === 'pending' ? 'text-on-primary' : 'text-on-surface-variant'}`}>Pending</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              className={`flex-1 py-2 rounded-lg items-center ml-2 ${settlementsTab === 'history' ? 'bg-primary' : 'bg-surface-variant'}`}
              onPress={() => setSettlementsTab('history')}
            >
              <Text className={`font-label-md font-bold ${settlementsTab === 'history' ? 'text-on-primary' : 'text-on-surface-variant'}`}>History</Text>
            </TouchableOpacity>
          </View>

          {loadingSettlements ? (
             <View className="flex-1 justify-center items-center"><ActivityIndicator size="large" color="#b3290f" /></View>
          ) : (
            <FlatList 
              data={settlementsTab === 'pending' ? pendingSettlements : historicalSettlements}
              keyExtractor={(item, index) => item.id || index.toString()}
              contentContainerStyle={{ padding: 16 }}
              ListEmptyComponent={<Text className="text-center font-body-md text-on-surface-variant mt-10">No records found.</Text>}
              renderItem={({ item }) => (
                <View className="bg-surface-container-lowest p-4 rounded-xl mb-3 shadow-sm border border-outline-variant/30">
                  <View className="flex-row justify-between items-start mb-2">
                    <Text className="font-title-lg font-bold text-on-surface">{settlementsTab === 'pending' ? item.company_name : item.companies?.name}</Text>
                    <View className={`px-2 py-1 rounded ${settlementsTab === 'pending' ? 'bg-tertiary-container' : 'bg-primary-container'}`}>
                      <Text className={`font-label-md text-[10px] font-bold uppercase ${settlementsTab === 'pending' ? 'text-on-tertiary-container' : 'text-on-primary-container'}`}>
                        {settlementsTab === 'pending' ? 'Pending' : 'Settled'}
                      </Text>
                    </View>
                  </View>
                  <Text className="font-body-sm text-on-surface-variant mb-3">
                    {new Date(item.start_date).toLocaleDateString()} - {new Date(item.end_date).toLocaleDateString()}
                  </Text>
                  <View className="flex-row justify-between items-center bg-surface-container p-3 rounded-lg">
                    <View>
                      <Text className="font-label-md text-xs text-on-surface-variant">Coupons</Text>
                      <Text className="font-title-md font-bold text-on-surface">{item.coupon_count}</Text>
                    </View>
                    <View>
                      <Text className="font-label-md text-xs text-on-surface-variant text-right">Amount</Text>
                      <Text className="font-title-md font-bold text-primary">₹{Number(item.total_amount).toFixed(2)}</Text>
                    </View>
                  </View>
                  
                  {settlementsTab === 'pending' && (
                    <TouchableOpacity 
                      className={`mt-4 py-3 rounded-xl items-center shadow-sm ${processingSettlementId === item.company_id ? 'bg-surface-variant' : 'bg-primary'}`}
                      onPress={() => handleMarkPaid(item)}
                      disabled={processingSettlementId !== null}
                    >
                       <Text className={`font-label-md font-bold ${processingSettlementId === item.company_id ? 'text-on-surface-variant' : 'text-white'}`}>
                         {processingSettlementId === item.company_id ? 'Processing...' : 'Mark Paid'}
                       </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            />
          )}
        </View>
      </Modal>

    </SafeAreaView>
  );
}
