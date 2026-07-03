
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Linking, RefreshControl, SafeAreaView, ScrollView, StatusBar as RNStatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'https://chamabebidas.com.br/api';

type Order = {
  id: number;
  status: string;
  storeName?: string;
  store_name?: string;
  storeAddress?: string;
  store_address?: string;
  customerName?: string;
  customer_name?: string;
  customerPhone?: string;
  customer_phone?: string;
  phone?: string;
  address?: string;
  delivery_address?: string;
  total?: number;
  total_amount?: number;
  deliveryFee?: number;
  delivery_fee?: number;
  pickupCode?: string;
  pickup_code?: string;
  deliveryCode?: string;
  delivery_code?: string;
};

const DEMO: Order[] = [
  { id: 2001, status: 'calling_driver', storeName: 'Adega Didi', storeAddress: 'Centro - Tatuí', customerName: 'Cliente Teste', customerPhone: '15999999999', address: 'Rua Exemplo, 123 - Tatuí', total: 87.9, deliveryFee: 8, pickupCode: '12345', deliveryCode: '54321' },
  { id: 2002, status: 'ready', storeName: 'Adega Central', storeAddress: 'Rua 11 de Agosto - Tatuí', customerName: 'Pedido Demonstração', customerPhone: '15988888888', address: 'Jardim Santa Rita - Tatuí', total: 129.8, deliveryFee: 10, pickupCode: '99887', deliveryCode: '77889' }
];

export default function App() {
  const [screen, setScreen] = useState<'login' | 'orders' | 'active' | 'settings'>('login');
  const [driverId, setDriverId] = useState('');
  const [driverName, setDriverName] = useState('');
  const [password, setPassword] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [usingDemo, setUsingDemo] = useState(false);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [deliveryCodeInput, setDeliveryCodeInput] = useState('');

  const totals = useMemo(() => ({
    available: orders.length,
    fee: orders.reduce((s, o) => s + fee(o), 0)
  }), [orders]);

  useEffect(() => { boot(); }, []);
  useEffect(() => {
    if (screen === 'orders') {
      loadOrders();
      const timer = setInterval(loadOrders, 15000);
      return () => clearInterval(timer);
    }
  }, [screen]);

  async function boot() {
    try {
      const r = await fetch(API_URL.replace('/api', '/'));
      setApiOnline(r.ok);
    } catch {
      setApiOnline(false);
    }
    const id = await AsyncStorage.getItem('driverId');
    const name = await AsyncStorage.getItem('driverName');
    if (id) {
      setDriverId(id);
      setDriverName(name || `Entregador #${id}`);
      setScreen('orders');
    }
  }

  async function login() {
    if (!driverId.trim()) return Alert.alert('Atenção', 'Digite o ID ou telefone do entregador.');
    setLoading(true);
    try {
      const name = driverName.trim() || `Entregador #${driverId.trim()}`;
      try {
        await fetch(`${API_URL}/drivers/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ driverId, phone: driverId, password }) });
      } catch {}
      await AsyncStorage.setItem('driverId', driverId.trim());
      await AsyncStorage.setItem('driverName', name);
      setDriverName(name);
      setScreen('orders');
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await AsyncStorage.removeItem('driverId');
    await AsyncStorage.removeItem('driverName');
    setDriverId(''); setDriverName(''); setPassword(''); setOrders([]); setActiveOrder(null); setScreen('login');
  }

  async function loadOrders() {
    setLoading(true);
    try {
      const urls = [`${API_URL}/orders/available`, `${API_URL}/deliveries/available`, `${API_URL}/orders?status=ready`, `${API_URL}/orders`];
      let list: Order[] | null = null;
      for (const url of urls) {
        try {
          const r = await fetch(url);
          if (!r.ok) continue;
          const d = await r.json();
          const arr = Array.isArray(d) ? d : d.orders || d.deliveries || d.data;
          if (Array.isArray(arr)) { list = arr; break; }
        } catch {}
      }
      if (list) {
        setOrders(list.filter(o => ['ready', 'calling_driver', 'driver_available', 'pending'].includes(o.status)));
        setUsingDemo(false);
      } else {
        setOrders(DEMO); setUsingDemo(true);
      }
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(order: Order, status: string) {
    if (usingDemo) {
      const updated = { ...order, status };
      setOrders(p => p.map(o => o.id === order.id ? updated : o));
      setActiveOrder(updated);
      return true;
    }
    setActionLoading(order.id);
    try {
      const r = await fetch(`${API_URL}/orders/${order.id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, driverId, driverName }) });
      if (!r.ok) throw new Error('erro');
      await loadOrders();
      return true;
    } catch {
      Alert.alert('Erro', 'Não foi possível atualizar o pedido.');
      return false;
    } finally {
      setActionLoading(null);
    }
  }

  async function accept(order: Order) {
    const ok = await updateStatus(order, 'driver_accepted');
    if (ok) { setActiveOrder({ ...order, status: 'driver_accepted' }); setScreen('active'); }
  }

  async function sendLocation(order: Order) {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return Alert.alert('Localização', 'Permissão negada.');
    const pos = await Location.getCurrentPositionAsync({});
    if (!usingDemo) {
      await fetch(`${API_URL}/orders/${order.id}/location`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ driverId, latitude: pos.coords.latitude, longitude: pos.coords.longitude }) }).catch(() => {});
    }
    Alert.alert('Localização enviada', 'Sua posição foi atualizada.');
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert('Câmera', 'Permissão negada.');
    const r = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!r.canceled && r.assets?.[0]?.uri) setProofImage(r.assets[0].uri);
  }

  async function finish(order: Order) {
    const code = deliveryCode(order);
    if (code && deliveryCodeInput.trim() && deliveryCodeInput.trim() !== code) return Alert.alert('Código incorreto', 'Confira o código do cliente.');
    if (!proofImage) return Alert.alert('Foto obrigatória', 'Tire uma foto da entrega.');
    await updateStatus(order, 'delivered');
    setProofImage(null); setDeliveryCodeInput(''); setActiveOrder(null); setScreen('orders');
    Alert.alert('Entrega finalizada', 'Pedido entregue.');
  }

  function store(o: Order) { return o.storeName || o.store_name || 'Adega não informada'; }
  function storeAddr(o: Order) { return o.storeAddress || o.store_address || 'Endereço da adega não informado'; }
  function customer(o: Order) { return o.customerName || o.customer_name || 'Cliente não informado'; }
  function phone(o: Order) { return o.customerPhone || o.customer_phone || o.phone || ''; }
  function addr(o: Order) { return o.address || o.delivery_address || 'Endereço do cliente não informado'; }
  function total(o: Order) { return Number(o.total ?? o.total_amount ?? 0); }
  function fee(o: Order) { return Number(o.deliveryFee ?? o.delivery_fee ?? 0); }
  function pickupCode(o: Order) { return o.pickupCode || o.pickup_code || ''; }
  function deliveryCode(o: Order) { return o.deliveryCode || o.delivery_code || ''; }
  function maps(a: string) { Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}`); }
  function zap(p: string) { if (!p) return Alert.alert('Telefone não informado'); const c = p.replace(/\D/g, ''); Linking.openURL(`https://wa.me/${c.startsWith('55') ? c : '55' + c}`); }

  function renderOrder({ item }: { item: Order }) {
    return <View style={styles.card}>
      <View style={styles.row}><View><Text style={styles.orderTitle}>Pedido #{item.id}</Text><Text style={styles.small}>{item.status}</Text></View><View style={styles.fee}><Text style={styles.feeText}>R$ {fee(item).toFixed(2)}</Text></View></View>
      <View style={styles.divider} />
      <Info label="Retirada" value={store(item)} /><Info label="Endereço da adega" value={storeAddr(item)} /><Info label="Cliente" value={customer(item)} /><Info label="Entrega" value={addr(item)} />
      <Text style={styles.total}>Pedido: R$ {total(item).toFixed(2)}</Text>
      <View style={styles.actions}><Secondary title="Rota até adega" onPress={() => maps(storeAddr(item))} /><Secondary title="Rota até cliente" onPress={() => maps(addr(item))} /><Button title="Aceitar entrega" green loading={actionLoading === item.id} onPress={() => accept(item)} /></View>
    </View>;
  }

  if (screen === 'login') return <SafeAreaView style={styles.login}><StatusBar style="light" /><RNStatusBar barStyle="light-content" backgroundColor="#111" /><ScrollView contentContainerStyle={styles.loginContent}>
    <View style={styles.circle}><Text style={styles.circleText}>🏍️</Text></View><Text style={styles.logo}>Chama Bebidas</Text><Text style={styles.subtitle}>App do Entregador</Text>
    <View style={styles.api}><Text style={styles.apiText}>API: {apiOnline === null ? 'verificando...' : apiOnline ? 'online' : 'não confirmada'}</Text></View>
    <TextInput style={styles.input} placeholder="ID ou telefone" placeholderTextColor="#777" value={driverId} onChangeText={setDriverId} keyboardType="phone-pad" />
    <TextInput style={styles.input} placeholder="Nome do entregador" placeholderTextColor="#777" value={driverName} onChangeText={setDriverName} />
    <TextInput style={styles.input} placeholder="Senha" placeholderTextColor="#777" value={password} onChangeText={setPassword} secureTextEntry />
    <TouchableOpacity style={styles.loginButton} onPress={login}>{loading ? <ActivityIndicator color="#111" /> : <Text style={styles.loginText}>Entrar</Text>}</TouchableOpacity>
    <Text style={styles.hint}>Se a API ainda não tiver rotas do entregador, o app abre com pedidos de demonstração.</Text>
  </ScrollView></SafeAreaView>;

  if (screen === 'settings') return <SafeAreaView style={styles.light}><Header title="Configurações" subtitle={driverName || driverId} rightText="Voltar" onRight={() => setScreen('orders')} /><View style={styles.card}><Info label="API" value={API_URL} /><Info label="Entregador" value={driverName || driverId} /><Info label="Demonstração" value={usingDemo ? 'Sim' : 'Não'} /><Button title="Sair da conta" red onPress={logout} /></View></SafeAreaView>;

  if (screen === 'active' && activeOrder) return <SafeAreaView style={styles.light}><Header title="Entrega ativa" subtitle={`Pedido #${activeOrder.id}`} rightText="Lista" onRight={() => setScreen('orders')} /><ScrollView contentContainerStyle={{ padding: 16 }}>
    <View style={styles.card}><Text style={styles.orderTitle}>Retirada</Text><Info label="Adega" value={store(activeOrder)} /><Info label="Endereço" value={storeAddr(activeOrder)} /><Info label="Código retirada" value={pickupCode(activeOrder) || 'Não informado'} /><View style={styles.actions}><Secondary title="Abrir rota até adega" onPress={() => maps(storeAddr(activeOrder))} /><Button title="Confirmar retirada" onPress={() => updateStatus(activeOrder, 'picked_up')} /></View></View>
    <View style={styles.card}><Text style={styles.orderTitle}>Entrega</Text><Info label="Cliente" value={customer(activeOrder)} /><Info label="Telefone" value={phone(activeOrder) || 'Não informado'} /><Info label="Endereço" value={addr(activeOrder)} /><Info label="Código cliente" value={deliveryCode(activeOrder) || 'Não informado'} /><TextInput style={styles.inputLight} placeholder="Digite o código do cliente" placeholderTextColor="#777" value={deliveryCodeInput} onChangeText={setDeliveryCodeInput} keyboardType="numeric" />{proofImage && <Image source={{ uri: proofImage }} style={styles.photo} />}<View style={styles.actions}><Secondary title="WhatsApp do cliente" onPress={() => zap(phone(activeOrder))} /><Secondary title="Abrir rota até cliente" onPress={() => maps(addr(activeOrder))} /><Button title="Enviar localização" onPress={() => sendLocation(activeOrder)} /><Button title="Tirar foto da entrega" onPress={takePhoto} /><Button title="Finalizar entrega" green onPress={() => finish(activeOrder)} /></View></View>
  </ScrollView></SafeAreaView>;

  return <SafeAreaView style={styles.light}><Header title="Chama Entregador" subtitle={driverName || driverId} rightText="Config" onRight={() => setScreen('settings')} />{usingDemo && <View style={styles.warn}><Text style={styles.warnText}>Mostrando entregas de exemplo.</Text></View>}<View style={styles.stats}><Stat title="Disponíveis" value={String(totals.available)} /><Stat title="Ganhos" value={`R$ ${totals.fee.toFixed(2)}`} /></View>{activeOrder && <TouchableOpacity style={styles.active} onPress={() => setScreen('active')}><Text style={styles.activeText}>Continuar entrega #{activeOrder.id}</Text></TouchableOpacity>}<FlatList data={orders} keyExtractor={i => String(i.id)} renderItem={renderOrder} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={loadOrders} />} ListEmptyComponent={<View style={styles.empty}>{loading ? <ActivityIndicator /> : <Text>Nenhuma entrega disponível.</Text>}</View>} /></SafeAreaView>;
}

function Header({ title, subtitle, rightText, onRight }: any) { return <View style={styles.header}><View><Text style={styles.headerTitle}>{title}</Text><Text style={styles.headerSub}>{subtitle}</Text></View><TouchableOpacity style={styles.headerButton} onPress={onRight}><Text style={styles.headerButtonText}>{rightText}</Text></TouchableOpacity></View>; }
function Info({ label, value }: any) { return <View style={{ marginTop: 10 }}><Text style={styles.label}>{label}</Text><Text style={styles.text}>{value}</Text></View>; }
function Stat({ title, value }: any) { return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statTitle}>{title}</Text></View>; }
function Button({ title, onPress, green, red, loading }: any) { return <TouchableOpacity style={[styles.button, green && styles.green, red && styles.red]} onPress={onPress} disabled={loading}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{title}</Text>}</TouchableOpacity>; }
function Secondary({ title, onPress }: any) { return <TouchableOpacity style={styles.secondary} onPress={onPress}><Text style={styles.secondaryText}>{title}</Text></TouchableOpacity>; }

const styles = StyleSheet.create({
  login: { flex: 1, backgroundColor: '#111' }, light: { flex: 1, backgroundColor: '#f3f3f3' }, loginContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  circle: { width: 94, height: 94, borderRadius: 47, backgroundColor: '#f5a400', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 18 }, circleText: { fontSize: 42 },
  logo: { fontSize: 34, fontWeight: '900', color: '#fff', textAlign: 'center' }, subtitle: { fontSize: 18, color: '#ccc', textAlign: 'center', marginBottom: 22 },
  api: { backgroundColor: '#1f1f1f', borderRadius: 14, padding: 12, marginBottom: 14 }, apiText: { color: '#ddd', textAlign: 'center', fontWeight: '700' },
  input: { backgroundColor: '#fff', padding: 16, borderRadius: 14, marginBottom: 14, fontSize: 16, color: '#111' }, inputLight: { backgroundColor: '#f2f2f2', padding: 16, borderRadius: 14, marginTop: 14, fontSize: 16, color: '#111' },
  loginButton: { backgroundColor: '#f5a400', padding: 16, borderRadius: 14, marginTop: 4 }, loginText: { color: '#111', fontWeight: '900', textAlign: 'center', fontSize: 16 }, hint: { marginTop: 16, color: '#aaa', fontSize: 13, textAlign: 'center', lineHeight: 19 },
  header: { backgroundColor: '#111', padding: 18, paddingTop: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, headerTitle: { color: '#fff', fontSize: 23, fontWeight: '900' }, headerSub: { color: '#ccc', fontSize: 14 }, headerButton: { backgroundColor: '#f5a400', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12 }, headerButtonText: { color: '#111', fontWeight: '900' },
  warn: { backgroundColor: '#fff3cd', padding: 12 }, warnText: { color: '#6b4f00', fontWeight: '700', textAlign: 'center' }, stats: { flexDirection: 'row', padding: 16, gap: 10 }, stat: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14, alignItems: 'center' }, statValue: { fontSize: 22, fontWeight: '900', color: '#111' }, statTitle: { color: '#666', fontWeight: '800' },
  active: { marginHorizontal: 16, backgroundColor: '#128c4a', padding: 14, borderRadius: 16 }, activeText: { color: '#fff', textAlign: 'center', fontWeight: '900' },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, margin: 16, marginBottom: 0, borderWidth: 1, borderColor: '#e0e0e0' }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, orderTitle: { fontSize: 21, fontWeight: '900', color: '#111' }, small: { color: '#777', marginTop: 2, fontWeight: '700' }, fee: { backgroundColor: '#d1f7dc', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 }, feeText: { color: '#137333', fontWeight: '900' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 12 }, label: { fontSize: 13, fontWeight: '900', color: '#555' }, text: { fontSize: 15, color: '#222', marginTop: 2 }, total: { marginTop: 14, fontSize: 20, fontWeight: '900', color: '#111' }, actions: { marginTop: 14, gap: 10 },
  button: { backgroundColor: '#111', padding: 15, borderRadius: 14 }, green: { backgroundColor: '#128c4a' }, red: { backgroundColor: '#c0392b' }, buttonText: { color: '#fff', textAlign: 'center', fontWeight: '900', fontSize: 15 }, secondary: { backgroundColor: '#eee', padding: 14, borderRadius: 14 }, secondaryText: { color: '#111', textAlign: 'center', fontWeight: '900', fontSize: 14 },
  photo: { width: '100%', height: 220, borderRadius: 16, marginTop: 14, backgroundColor: '#ddd' }, empty: { marginTop: 70, alignItems: 'center' }
});
