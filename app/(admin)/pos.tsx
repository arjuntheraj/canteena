import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, Alert, ActivityIndicator, ScrollView, Modal, StyleSheet } from 'react-native';
import { supabase } from '../../src/lib/supabase';
import { MaterialIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import { shareAsync } from 'expo-sharing';
import { SafeAreaView } from 'react-native-safe-area-context';

type MenuItem = { id: string; name: string; price: number; category?: string };
type Company = { id: string; name: string; is_eligible: boolean; daily_coupon_limit: number };
type CartItem = MenuItem & { quantity: number };

export default function PosScreen() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [companyUsages, setCompanyUsages] = useState<Record<string, number>>({});

  // New Modals state
  const [couponModalVisible, setCouponModalVisible] = useState(false);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [completedOrderInfo, setCompletedOrderInfo] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  useEffect(() => {
    fetchData();

    const channel = supabase.channel('public:pos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, () => {
        fetchData(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'companies' }, () => {
        fetchData(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchData(true);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchData(background = false) {
    if (!background) setLoading(true);
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const [menuRes, compRes, usageRes] = await Promise.all([
      supabase.from('menu_items').select('*').order('name'),
      supabase.from('companies').select('*').order('name'),
      supabase.from('orders').select('company_id').eq('payment_method', 'coupon').gte('created_at', today.toISOString())
    ]);

    if (menuRes.data) setMenuItems(menuRes.data);
    if (compRes.data) setCompanies(compRes.data);
    
    if (usageRes.data) {
      const usages: Record<string, number> = {};
      usageRes.data.forEach((o: any) => {
        if (o.company_id) {
          usages[o.company_id] = (usages[o.company_id] || 0) + 1;
        }
      });
      setCompanyUsages(usages);
    }
    
    if (!background) setLoading(false);
  }

  function addToCart(item: MenuItem) {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        return prev.map((i) => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  }

  function removeFromCart(id: string) {
    setCart((prev) => {
      return prev.map((i) => {
        if (i.id === id) {
          return { ...i, quantity: i.quantity - 1 };
        }
        return i;
      }).filter((i) => i.quantity > 0);
    });
  }

  const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  async function handleCheckout(paymentMethod: 'cash' | 'gpay' | 'coupon') {
    if (cart.length === 0) return Alert.alert('Error', 'Cart is empty');
    
    if (paymentMethod === 'coupon') {
      setSelectedCompanyId(null);
      setCouponModalVisible(true);
      return;
    }
    
    await processOrder(paymentMethod);
  }

  async function processOrder(paymentMethod: 'cash' | 'gpay' | 'coupon') {
    if (paymentMethod === 'coupon' && !selectedCompanyId) {
      return Alert.alert('Error', 'Please select a company for this coupon');
    }

    setProcessing(true);

    try {
      if (paymentMethod === 'coupon' && selectedCompanyId) {
        const today = new Date();
        today.setHours(0,0,0,0);
        
        // Count today's coupon usages for this company
        const { count, error: countError } = await supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .eq('payment_method', 'coupon')
          .eq('company_id', selectedCompanyId)
          .gte('created_at', today.toISOString());

        if (countError) throw countError;

        const company = companies.find(c => c.id === selectedCompanyId);
        if (company && count !== null && count >= company.daily_coupon_limit) {
          setProcessing(false);
          return Alert.alert('Limit Exceeded', `Daily coupon limit of ${company.daily_coupon_limit} reached for ${company.name}`);
        }
      }

      // Insert Order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert([{ 
          total_amount: totalAmount, 
          payment_method: paymentMethod,
          company_id: paymentMethod === 'coupon' ? selectedCompanyId : null
        }])
        .select()
        .single();

      if (orderError) throw orderError;

      const orderItems = cart.map(item => ({
        order_id: order.id,
        menu_item_id: item.id,
        quantity: item.quantity,
        price_at_time: item.price
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
      if (itemsError) throw itemsError;

      // DO NOT auto print. Store info and show success modal.
      setCompletedOrderInfo({
        orderId: order.id,
        orderNumber: order.order_number, // Requires SQL schema change applied
        paymentMethod,
        amount: totalAmount,
        cartSnapshot: [...cart]
      });

      setCart([]);
      setCouponModalVisible(false);
      setSuccessModalVisible(true);

    } catch (error: any) {
      Alert.alert('Checkout Error', error.message);
    } finally {
      setProcessing(false);
    }
  }

  async function printReceipt(info: any) {
    const itemsHtml = info.cartSnapshot.map((item: any) => `
      <tr>
        <td style="padding: 4px 0;">${item.name} x${item.quantity}</td>
        <td style="text-align: right;">₹${(item.price * item.quantity).toFixed(2)}</td>
      </tr>
    `).join('');

    const dateStr = new Date().toLocaleString();
    const orderDisplay = info.orderNumber ? `#${info.orderNumber}` : info.orderId.substring(0, 8);

    const html = `
      <html>
        <body style="font-family: monospace; width: 300px; padding: 20px;">
          <h2 style="text-align: center; margin-bottom: 0;">CANTEENA</h2>
          <p style="text-align: center; margin-top: 5px; font-size: 12px;">Smart POS System</p>
          <hr style="border-top: 1px dashed #000;" />
          <p>Order: ${orderDisplay}</p>
          <p>Date: ${dateStr}</p>
          <hr style="border-top: 1px dashed #000;" />
          <table style="width: 100%; font-size: 14px;">
            ${itemsHtml}
          </table>
          <hr style="border-top: 1px dashed #000;" />
          <h3 style="text-align: right; margin: 10px 0;">TOTAL: ₹${info.amount.toFixed(2)}</h3>
          <p style="text-align: right; margin: 5px 0;">Paid via: ${info.paymentMethod.toUpperCase()}</p>
          <hr style="border-top: 1px dashed #000;" />
          <p style="text-align: center; margin-top: 20px;">Thank you!</p>
        </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html });
      await shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (e: any) {
      console.error('Detailed Print Error:', e);
      Alert.alert('Print Error', e?.message || 'Could not generate receipt.');
    }
  }

  if (loading) {
    return <SafeAreaView className="flex-1 justify-center items-center bg-background"><ActivityIndicator size="large" color="#b3290f" /></SafeAreaView>;
  }

  return (
    <SafeAreaView className="flex-1 flex-row bg-background">
      
      {/* Left Side: Menu Items */}
      <View className="flex-1 border-r border-outline-variant/30 bg-surface px-2 py-4">
        <View className="mb-4">
          <Text className="font-headline-md text-2xl font-bold text-on-surface mb-2">Menu</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
            {['All', 'Meals', 'Drinks'].map(cat => (
              <TouchableOpacity 
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-full mr-2 ${selectedCategory === cat ? 'bg-primary-container' : 'bg-surface-container-lowest border border-outline-variant/30'}`}
              >
                <Text className={`font-label-md ${selectedCategory === cat ? 'text-on-primary-container font-bold' : 'text-on-surface-variant'}`}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <FlatList
          data={selectedCategory === 'All' ? menuItems : menuItems.filter(item => item.category === selectedCategory)}
          keyExtractor={item => item.id}
          numColumns={2}
          renderItem={({ item }) => (
            <TouchableOpacity 
              className="flex-1 m-1 p-2 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm items-center justify-center h-28 active:bg-surface-container"
              onPress={() => addToCart(item)}
              style={{ elevation: 2 }}
            >
              <Text className="font-title-lg text-sm font-bold text-on-surface text-center mb-1" numberOfLines={2}>{item.name}</Text>
              <View className="bg-primary-fixed px-2 py-1 rounded-full mt-1">
                <Text className="text-on-primary-fixed font-label-md text-xs font-bold">₹{Number(item.price).toFixed(2)}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Right Side: Cart & Checkout */}
      <View className="flex-1 bg-surface-container-low flex-col">
        <View className="p-3 border-b border-outline-variant/30 bg-surface-container-lowest flex-row justify-between items-center">
          <Text className="font-title-lg text-base font-bold text-on-surface flex-1" numberOfLines={1}>Current Order</Text>
          <View className="w-6 h-6 bg-error-container rounded-full items-center justify-center ml-2">
            <Text className="text-error font-label-md text-xs font-bold">{cart.length}</Text>
          </View>
        </View>

        <ScrollView className="flex-1 p-4">
          {cart.map(item => (
            <View key={item.id} className="flex-row justify-between items-center mb-3 bg-surface-container-lowest p-3 rounded-xl border border-outline-variant/30 shadow-sm">
              <View className="flex-1">
                <Text className="font-title-lg text-base font-bold text-on-surface">{item.name}</Text>
                <Text className="text-primary font-label-md font-bold mt-1">₹{Number(item.price).toFixed(2)}</Text>
              </View>
              <View className="flex-row items-center bg-surface-container rounded-full overflow-hidden border border-outline-variant/30">
                <TouchableOpacity onPress={() => removeFromCart(item.id)} className="w-8 h-8 items-center justify-center active:bg-surface-variant">
                  <MaterialIcons name="remove" size={16} color="#1a1c1e" />
                </TouchableOpacity>
                <View className="w-8 items-center justify-center bg-surface-container-lowest h-8">
                  <Text className="font-label-md font-bold text-on-surface">{item.quantity}</Text>
                </View>
                <TouchableOpacity onPress={() => addToCart(item)} className="w-8 h-8 items-center justify-center active:bg-surface-variant">
                  <MaterialIcons name="add" size={16} color="#1a1c1e" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {cart.length === 0 && (
            <View className="flex-1 items-center justify-center mt-12 opacity-50">
              <MaterialIcons name="shopping-cart" size={48} color="#8e706a" />
              <Text className="font-body-md text-on-surface-variant mt-4">Cart is empty</Text>
            </View>
          )}
        </ScrollView>

        {/* Checkout Section */}
        <View className="p-3 bg-surface-container-lowest border-t border-outline-variant/30 shadow-lg">
          <View className="flex-row justify-between items-center mb-3 bg-surface-variant p-3 rounded-xl border border-outline-variant/30">
            <Text className="font-title-lg text-sm font-bold text-on-surface-variant">Total</Text>
            <Text className="font-display-lg text-xl font-bold text-primary">₹{totalAmount.toFixed(2)}</Text>
          </View>

          {/* Payment Buttons */}
          <View className="flex-row gap-2">
            <TouchableOpacity 
              className={`flex-1 flex-col bg-tertiary py-3 rounded-xl items-center justify-center shadow-md ${processing || cart.length === 0 ? 'opacity-50' : ''}`}
              onPress={() => handleCheckout('cash')}
              disabled={processing || cart.length === 0}
            >
              <MaterialIcons name="payments" size={24} color="white" />
              <Text className="text-white font-label-md text-xs font-bold mt-1 text-center">Cash/GPay</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              className={`flex-1 flex-col bg-primary-container py-3 rounded-xl items-center justify-center shadow-md ${cart.length === 0 ? 'opacity-50' : ''}`}
              onPress={() => handleCheckout('coupon')}
              disabled={processing || cart.length === 0}
            >
              <MaterialIcons name="local-activity" size={24} color="#5f0a00" />
              <Text className="text-on-primary-container font-label-md text-xs font-bold mt-1 text-center">Coupon</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Coupon Company Selection Modal */}
      <Modal visible={couponModalVisible} animationType="fade" transparent={true}>
        <View className="flex-1 justify-center items-center bg-black/60 px-4">
          <View className="w-full max-w-sm bg-surface-container-lowest rounded-3xl p-6 shadow-xl">
            <View className="flex-row justify-between items-center mb-4">
               <Text className="font-headline-md text-xl font-bold text-on-surface">Select Company</Text>
               <TouchableOpacity onPress={() => setCouponModalVisible(false)} className="w-8 h-8 items-center justify-center bg-surface-container rounded-full">
                  <MaterialIcons name="close" size={20} color="#1a1c1e" />
               </TouchableOpacity>
            </View>
            <Text className="font-body-md text-on-surface-variant mb-4">Who is providing the coupon for this order?</Text>
            
            <ScrollView className="max-h-60 mb-6">
              {companies.filter(c => c.is_eligible).map(c => {
                const remaining = c.daily_coupon_limit - (companyUsages[c.id] || 0);
                const isZero = remaining <= 0;
                return (
                  <TouchableOpacity 
                    key={c.id} 
                    onPress={() => {
                      if (!isZero) setSelectedCompanyId(c.id);
                    }}
                    disabled={isZero}
                    className={`flex-row items-center p-4 mb-2 rounded-xl border ${selectedCompanyId === c.id ? 'bg-primary-container border-primary' : 'bg-surface border-outline-variant/30'} ${isZero ? 'opacity-50' : ''}`}
                  >
                    <MaterialIcons name={selectedCompanyId === c.id ? "radio-button-checked" : "radio-button-unchecked"} size={20} color={selectedCompanyId === c.id ? "#b3290f" : "#8e706a"} />
                    <View className="ml-3 flex-1">
                      <Text className={`font-title-lg text-base font-bold ${selectedCompanyId === c.id ? 'text-on-primary-container' : 'text-on-surface'}`}>{c.name}</Text>
                    </View>
                    <View className={`px-2 py-1 rounded-full ${isZero ? 'bg-error-container' : 'bg-tertiary-fixed'}`}>
                      <Text className={`font-label-md text-xs font-bold ${isZero ? 'text-on-error-container' : 'text-on-tertiary-fixed'}`}>
                        {Math.max(0, remaining)} left
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity 
              className={`w-full py-4 rounded-xl items-center justify-center shadow-md ${!selectedCompanyId || processing ? 'bg-surface-variant' : 'bg-primary'}`}
              onPress={() => processOrder('coupon')}
              disabled={!selectedCompanyId || processing}
            >
              {processing ? (
                 <ActivityIndicator color="white" />
              ) : (
                 <Text className={`font-title-lg font-bold ${!selectedCompanyId ? 'text-on-surface-variant' : 'text-white'}`}>Confirm & Pay</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal visible={successModalVisible} animationType="slide" transparent={true}>
        <View className="flex-1 justify-center items-center bg-black/60 px-4">
          <View className="w-full max-w-sm bg-surface-container-lowest rounded-3xl p-6 shadow-xl items-center">
            <View className="w-16 h-16 bg-primary-container rounded-full items-center justify-center mb-4">
              <MaterialIcons name="check" size={36} color="#b3290f" />
            </View>
            <Text className="font-headline-md text-2xl font-bold text-on-surface mb-1">Sale Complete!</Text>
            {completedOrderInfo?.orderNumber && (
              <Text className="font-title-lg text-primary font-bold mb-1">Order #{completedOrderInfo.orderNumber}</Text>
            )}
            <Text className="font-body-md text-on-surface-variant mb-6 text-center">The order has been successfully recorded.</Text>
            
            <View className="w-full flex-row gap-3">
              <TouchableOpacity 
                className="flex-1 py-3 bg-surface-container border border-outline-variant/30 rounded-xl items-center justify-center"
                onPress={() => setSuccessModalVisible(false)}
              >
                <Text className="font-title-lg font-bold text-on-surface">New Sale</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className="flex-1 py-3 bg-primary rounded-xl items-center justify-center shadow-md"
                onPress={() => {
                  setSuccessModalVisible(false);
                  setTimeout(() => {
                    printReceipt(completedOrderInfo);
                  }, 500);
                }}
              >
                <Text className="font-title-lg font-bold text-white">Print Bill</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
