import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { supabase } from '../../src/lib/supabase';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

type MenuItem = {
  id: string;
  name: string;
  price: number;
  category: string;
};

export default function MenuScreen() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<MenuItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Form states for adding/editing
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formCategory, setFormCategory] = useState('');

  useEffect(() => {
    fetchMenu();

    const channel = supabase.channel('public:menu_items')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, () => {
        fetchMenu();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchMenu() {
    setLoading(true);
    const { data, error } = await supabase.from('menu_items').select('*').order('name');
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setItems(data || []);
      setFilteredItems(data || []);
    }
    setLoading(false);
  }

  function handleSearch(text: string) {
    setSearch(text);
    if (!text.trim()) {
      setFilteredItems(items);
      return;
    }
    const filtered = items.filter(item => item.name.toLowerCase().includes(text.toLowerCase()));
    setFilteredItems(filtered);
  }

  async function handleSave() {
    if (!formName || !formPrice) {
      Alert.alert('Validation Error', 'Name and Price are required');
      return;
    }

    setLoading(true);
    const payload = {
      name: formName,
      price: parseFloat(formPrice),
      category: formCategory,
    };

    if (editingId) {
      const { error } = await supabase.from('menu_items').update(payload).eq('id', editingId);
      if (error) Alert.alert('Error', error.message);
    } else {
      const { error } = await supabase.from('menu_items').insert([payload]);
      if (error) Alert.alert('Error', error.message);
    }

    resetForm();
    await fetchMenu();
  }

  async function handleDelete(id: string) {
    Alert.alert('Confirm', 'Are you sure you want to delete this item?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          const { error } = await supabase.from('menu_items').delete().eq('id', id);
          if (error) Alert.alert('Error', error.message);
          await fetchMenu();
        }
      }
    ]);
  }

  function handleEdit(item: MenuItem) {
    setIsEditing(true);
    setEditingId(item.id);
    setFormName(item.name);
    setFormPrice(item.price.toString());
    setFormCategory(item.category || '');
  }

  function resetForm() {
    setIsEditing(false);
    setEditingId(null);
    setFormName('');
    setFormPrice('');
    setFormCategory('');
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="px-container-padding py-6 border-b border-outline-variant/30 bg-surface">
        <View className="flex-row justify-between items-center mb-4">
          <View>
            <Text className="font-headline-md text-2xl font-bold text-on-surface">Menu Management</Text>
            <Text className="font-body-md text-on-surface-variant">Add, edit, or remove menu items</Text>
          </View>
          <TouchableOpacity 
            className="w-12 h-12 bg-primary text-on-primary rounded-xl items-center justify-center shadow-md active:bg-primary/90"
            onPress={() => setIsEditing(true)}
          >
            <MaterialIcons name="add" size={28} color="white" />
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View className="relative justify-center">
          <View className="absolute left-md z-10">
            <MaterialIcons name="search" size={24} color="#5a413b" />
          </View>
          <TextInput
            className="w-full h-12 bg-surface-container-lowest rounded-xl pl-12 pr-4 font-body-lg text-on-surface border border-outline-variant/30 shadow-sm focus:border-primary"
            placeholder="Search menu items..."
            placeholderTextColor="#8e706a"
            value={search}
            onChangeText={handleSearch}
          />
        </View>
      </View>

      {/* Loading Indicator */}
      {loading && (
        <View className="py-8 items-center justify-center">
          <ActivityIndicator size="large" color="#b3290f" />
        </View>
      )}

      {/* Menu List */}
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={() => (
          !loading ? (
             <Text className="font-label-md text-xs font-bold text-on-surface-variant uppercase mb-4 tracking-wider">
               {filteredItems.length} items found
             </Text>
          ) : null
        )}
        renderItem={({ item }) => (
          <View className="flex-row justify-between items-center bg-surface-container-lowest p-4 rounded-xl mb-3 shadow-sm border border-outline-variant/30">
            <View className="w-12 h-12 bg-surface-container-highest rounded-lg items-center justify-center mr-4">
               <MaterialIcons name="fastfood" size={24} color="#0b1c30" />
            </View>
            <View className="flex-1">
              <Text className="font-title-lg text-base font-bold text-on-surface">{item.name}</Text>
              <View className="flex-row items-center mt-1">
                 <Text className="font-label-md text-primary font-bold mr-3">₹{Number(item.price).toFixed(2)}</Text>
                 {item.category && (
                    <View className="bg-surface-variant px-2 py-0.5 rounded text-on-surface-variant">
                      <Text className="font-label-md text-[10px] uppercase font-bold">{item.category}</Text>
                    </View>
                 )}
              </View>
            </View>
            <View className="flex-row gap-2">
              <TouchableOpacity onPress={() => handleEdit(item)} className="w-10 h-10 bg-surface-container rounded-full items-center justify-center active:bg-surface-variant">
                <MaterialIcons name="edit" size={20} color="#001f85" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item.id)} className="w-10 h-10 bg-error-container rounded-full items-center justify-center active:bg-error/20">
                <MaterialIcons name="delete-outline" size={20} color="#ba1a1a" />
              </TouchableOpacity>
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
                 {editingId ? 'Edit Item' : 'Add New Item'}
               </Text>
               <TouchableOpacity onPress={resetForm} className="w-8 h-8 items-center justify-center bg-surface-container rounded-full">
                  <MaterialIcons name="close" size={20} color="#1a1c1e" />
               </TouchableOpacity>
            </View>

            <View className="space-y-4">
               <View>
                  <Text className="font-label-md text-xs font-medium text-on-surface-variant mb-1 ml-1">Item Name</Text>
                  <TextInput
                    className="w-full bg-surface-container-lowest border border-outline-variant/50 rounded-xl px-4 py-3 text-on-surface font-body-lg focus:border-primary"
                    placeholder="e.g. Grilled Chicken Salad"
                    placeholderTextColor="#8e706a"
                    value={formName}
                    onChangeText={setFormName}
                  />
               </View>

               <View className="flex-row gap-4">
                 <View className="flex-1">
                    <Text className="font-label-md text-xs font-medium text-on-surface-variant mb-1 ml-1">Price (₹)</Text>
                    <TextInput
                      className="w-full bg-surface-container-lowest border border-outline-variant/50 rounded-xl px-4 py-3 text-on-surface font-body-lg focus:border-primary"
                      placeholder="0.00"
                      placeholderTextColor="#8e706a"
                      value={formPrice}
                      onChangeText={setFormPrice}
                      keyboardType="decimal-pad"
                    />
                 </View>
                 <View className="flex-1">
                    <Text className="font-label-md text-xs font-medium text-on-surface-variant mb-1 ml-1">Category</Text>
                    <TextInput
                      className="w-full bg-surface-container-lowest border border-outline-variant/50 rounded-xl px-4 py-3 text-on-surface font-body-lg focus:border-primary"
                      placeholder="e.g. Meals"
                      placeholderTextColor="#8e706a"
                      value={formCategory}
                      onChangeText={setFormCategory}
                    />
                 </View>
               </View>

               <TouchableOpacity 
                  className="w-full h-14 bg-primary rounded-xl items-center justify-center shadow-md mt-4 active:bg-primary/90"
                  onPress={handleSave}
               >
                  <Text className="font-title-lg text-lg font-bold text-white">Save Item</Text>
               </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}
