import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  ActivityIndicator, Modal, Animated, Alert, Platform,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useGame, apiGet, apiPost } from '@/context/GameContext';
import { COLORS } from '@/constants/colors';

type ItemType = 'aura' | 'boost';
type Currency = 'gym_coin' | 'gem';

interface StoreItem {
  id: string;
  name: string;
  description: string;
  type: ItemType;
  currency: Currency;
  price: number;
  levelRequired: number;
  icon: string;
  color: string;
  boostMultiplier?: number;
  boostDurationHours?: number;
  isConsumable: boolean;
}

interface ActiveBoost {
  id: string;
  itemId: string;
  multiplier: number;
  expiresAt: string;
}

interface StoreData {
  catalog: StoreItem[];
  ownedItemIds: string[];
  activeBoosts: ActiveBoost[];
  gymCoins: number;
  gems: number;
  equippedAura: string | null;
}

const SECTION_AURAS_COIN = 'coin_auras';
const SECTION_AURAS_GEM = 'gem_auras';
const SECTION_BOOSTS_COIN = 'coin_boosts';
const SECTION_BOOSTS_GEM = 'gem_boosts';

function formatTimeLeft(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Süresi doldu';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}s ${m}dk kaldı`;
  return `${m}dk kaldı`;
}

interface ActiveBoostBannerProps {
  boosts: ActiveBoost[];
  catalog: StoreItem[];
}

function ActiveBoostBanner({ boosts, catalog }: ActiveBoostBannerProps) {
  if (boosts.length === 0) return null;
  const best = boosts.reduce((a, b) => (a.multiplier > b.multiplier ? a : b));
  const item = catalog.find((i) => i.id === best.itemId);

  return (
    <View style={styles.activeBoostBanner}>
      <View style={[styles.activeBoostGlow, { borderColor: item?.color || COLORS.xpBar }]} />
      <MaterialCommunityIcons name="lightning-bolt" size={20} color={item?.color || COLORS.xpBar} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.activeBoostTitle, { color: item?.color || COLORS.xpBar }]}>
          XP Takviyesi Aktif — x{(best.multiplier / 100).toFixed(1)}
        </Text>
        <Text style={styles.activeBoostSub}>{formatTimeLeft(best.expiresAt)}</Text>
      </View>
      <View style={[styles.activePill, { backgroundColor: (item?.color || COLORS.xpBar) + '25' }]}>
        <Text style={[styles.activePillText, { color: item?.color || COLORS.xpBar }]}>AKTİF</Text>
      </View>
    </View>
  );
}

interface ItemCardProps {
  item: StoreItem;
  owned: boolean;
  equipped: boolean;
  gymCoins: number;
  gems: number;
  characterLevel: number;
  onBuy: (item: StoreItem) => void;
  onEquip: (itemId: string | null) => void;
  activeBoosts: ActiveBoost[];
}

function ItemCard({ item, owned, equipped, gymCoins, gems, characterLevel, onBuy, onEquip, activeBoosts }: ItemCardProps) {
  const locked = characterLevel < item.levelRequired;
  const hasEnough = item.currency === 'gym_coin' ? gymCoins >= item.price : gems >= item.price;
  const isBoostActive = item.type === 'boost' && activeBoosts.some((b) => b.itemId === item.id);

  return (
    <View style={[styles.itemCard, equipped && { borderColor: item.color, borderWidth: 2 }]}>
      {locked && (
        <View style={styles.lockOverlay}>
          <MaterialCommunityIcons name="lock" size={20} color={COLORS.textMuted} />
          <Text style={styles.lockText}>Seviye {item.levelRequired} gerekli</Text>
        </View>
      )}

      <View style={[styles.itemIconBg, { backgroundColor: item.color + '20' }]}>
        <MaterialCommunityIcons name={item.icon as any} size={30} color={item.color} />
      </View>

      <View style={styles.itemInfo}>
        <View style={styles.itemNameRow}>
          <Text style={styles.itemName}>{item.name}</Text>
          {isBoostActive && (
            <View style={[styles.boostActivePill, { backgroundColor: item.color + '25' }]}>
              <Text style={[styles.boostActivePillText, { color: item.color }]}>AKTİF</Text>
            </View>
          )}
          {equipped && (
            <View style={[styles.equippedPill, { backgroundColor: item.color + '25' }]}>
              <Text style={[styles.equippedPillText, { color: item.color }]}>GİYİLİ</Text>
            </View>
          )}
        </View>
        <Text style={styles.itemDesc} numberOfLines={2}>{item.description}</Text>
        <View style={styles.itemMeta}>
          <View style={styles.priceTag}>
            <MaterialCommunityIcons
              name={item.currency === 'gym_coin' ? 'circle-multiple' : 'diamond'}
              size={13}
              color={item.currency === 'gym_coin' ? COLORS.gold : '#B9F2FF'}
            />
            <Text style={[styles.priceText, {
              color: item.currency === 'gym_coin' ? COLORS.gold : '#B9F2FF',
            }]}>
              {item.price.toLocaleString()}
            </Text>
          </View>
          {item.levelRequired > 1 && (
            <View style={styles.levelTag}>
              <MaterialCommunityIcons name="shield-star" size={11} color={COLORS.textMuted} />
              <Text style={styles.levelTagText}>Lv.{item.levelRequired}+</Text>
            </View>
          )}
          {item.boostDurationHours && (
            <View style={styles.durationTag}>
              <MaterialCommunityIcons name="timer-outline" size={11} color={COLORS.textSecondary} />
              <Text style={styles.durationText}>{item.boostDurationHours}s</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.itemAction}>
        {locked ? (
          <View style={styles.actionBtnDisabled}>
            <MaterialCommunityIcons name="lock" size={16} color={COLORS.textMuted} />
          </View>
        ) : owned && item.type === 'aura' ? (
          <Pressable
            style={[styles.actionBtn, { backgroundColor: equipped ? item.color + '30' : COLORS.surfaceElevated }]}
            onPress={() => onEquip(equipped ? null : item.id)}
          >
            <Text style={[styles.actionBtnText, { color: equipped ? item.color : COLORS.textSecondary }]}>
              {equipped ? 'Çıkar' : 'Giy'}
            </Text>
          </Pressable>
        ) : item.type === 'boost' && !item.isConsumable && owned ? (
          <View style={[styles.actionBtnOwned]}>
            <MaterialCommunityIcons name="check-circle" size={16} color={COLORS.success} />
          </View>
        ) : (
          <Pressable
            style={[styles.actionBtn, { backgroundColor: hasEnough ? item.color + '20' : COLORS.border }]}
            onPress={() => !locked && onBuy(item)}
            disabled={locked}
          >
            <Text style={[styles.actionBtnText, { color: hasEnough ? item.color : COLORS.textMuted }]}>
              {item.type === 'boost' && isBoostActive ? 'Tekrar' : 'Al'}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

interface ConfirmModalProps {
  item: StoreItem | null;
  gymCoins: number;
  gems: number;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModal({ item, gymCoins, gems, onConfirm, onCancel }: ConfirmModalProps) {
  const slideAnim = useRef(new Animated.Value(300)).current;

  React.useEffect(() => {
    if (item) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 300, duration: 180, useNativeDriver: true }).start();
    }
  }, [item]);

  if (!item) return null;

  const balance = item.currency === 'gym_coin' ? gymCoins : gems;
  const afterBalance = balance - item.price;

  return (
    <Modal visible={!!item} transparent animationType="none" onRequestClose={onCancel}>
      <View style={styles.modalOverlay}>
        <Animated.View style={[styles.modalCard, { transform: [{ translateY: slideAnim }] }]}>
          <View style={[styles.confirmIconWrap, { backgroundColor: item.color + '20' }]}>
            <MaterialCommunityIcons name={item.icon as any} size={40} color={item.color} />
          </View>

          <Text style={styles.confirmTitle}>{item.name}</Text>
          <Text style={styles.confirmDesc}>{item.description}</Text>

          <View style={styles.confirmPriceRow}>
            <View style={styles.confirmPriceBox}>
              <Text style={styles.confirmPriceLabel}>Mevcut</Text>
              <View style={styles.confirmPriceVal}>
                <MaterialCommunityIcons
                  name={item.currency === 'gym_coin' ? 'circle-multiple' : 'diamond'}
                  size={16}
                  color={item.currency === 'gym_coin' ? COLORS.gold : '#B9F2FF'}
                />
                <Text style={[styles.confirmPriceNum, { color: item.currency === 'gym_coin' ? COLORS.gold : '#B9F2FF' }]}>
                  {balance.toLocaleString()}
                </Text>
              </View>
            </View>
            <MaterialCommunityIcons name="minus" size={16} color={COLORS.textMuted} />
            <View style={styles.confirmPriceBox}>
              <Text style={styles.confirmPriceLabel}>Fiyat</Text>
              <Text style={[styles.confirmPriceNum, { color: item.color }]}>{item.price.toLocaleString()}</Text>
            </View>
            <MaterialCommunityIcons name="equal" size={16} color={COLORS.textMuted} />
            <View style={styles.confirmPriceBox}>
              <Text style={styles.confirmPriceLabel}>Kalan</Text>
              <Text style={[styles.confirmPriceNum, { color: afterBalance < 0 ? COLORS.danger : COLORS.text }]}>
                {afterBalance.toLocaleString()}
              </Text>
            </View>
          </View>

          {afterBalance < 0 && (
            <View style={styles.notEnoughWarn}>
              <MaterialCommunityIcons name="alert-circle" size={15} color={COLORS.danger} />
              <Text style={styles.notEnoughText}>
                Yetersiz {item.currency === 'gym_coin' ? 'Gym Coin' : 'Gem'}.
                {item.currency === 'gym_coin' ? ' Antrenman yaparak coin kazan!' : ' Gem satın al!'}
              </Text>
            </View>
          )}

          {item.type === 'boost' && (
            <View style={styles.boostInfo}>
              <MaterialCommunityIcons name="clock-fast" size={14} color={COLORS.info} />
              <Text style={styles.boostInfoText}>
                Kullanıldığında {item.boostDurationHours} saat boyunca XP x{(item.boostMultiplier! / 100).toFixed(1)} olur.
              </Text>
            </View>
          )}

          <View style={styles.confirmButtons}>
            <Pressable style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelBtnText}>İptal</Text>
            </Pressable>
            <Pressable
              style={[styles.buyBtn, { backgroundColor: afterBalance < 0 ? COLORS.border : item.color, opacity: afterBalance < 0 ? 0.5 : 1 }]}
              onPress={afterBalance >= 0 ? onConfirm : onCancel}
            >
              <MaterialCommunityIcons name="cart" size={16} color={afterBalance < 0 ? COLORS.textMuted : '#000'} />
              <Text style={[styles.buyBtnText, { color: afterBalance < 0 ? COLORS.textMuted : '#000' }]}>
                Satın Al
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const SECTION_PREMIUM = 'premium';

interface PremiumProduct {
  id: string;
  name: string;
  description: string;
  type: string;
  priceUSD: number;
  originalPriceUSD: number | null;
  priceDisplay: string;
  originalPriceDisplay: string | null;
  gemsAmount: number;
  bonusGems: number;
  totalGems: number;
  includesBattlePass: boolean;
  includesBoost: string | null;
  includesAura: string | null;
  tag: string | null;
}

interface DailyOffer {
  productId: string;
  discountPercent: number;
  discountedPriceUSD: number;
  discountedPriceDisplay: string;
  expiresAt: string;
}

interface PremiumData {
  products: PremiumProduct[];
  hasPurchased: boolean;
  firstPurchaseBonus: boolean;
  dailyOffer: DailyOffer | null;
  freeUserPenalty: boolean;
}

const TAG_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  OZEL: { label: 'OZEL', color: '#FF4DFF', icon: 'crown' },
  EN_POPULER: { label: 'EN POPULER', color: '#FFD700', icon: 'fire' },
  EN_IYI_DEGER: { label: 'EN IYI DEGER', color: '#4ECDC4', icon: 'star-four-points' },
  FIRSAT: { label: 'FIRSAT', color: '#FF6B35', icon: 'tag' },
};

function CountdownTimer({ expiresAt }: { expiresAt: string }) {
  const [timeLeft, setTimeLeft] = useState('');

  React.useEffect(() => {
    function update() {
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (ms <= 0) { setTimeLeft('Suresi doldu'); return; }
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setTimeLeft(`${h}s ${m}dk ${s}sn`);
    }
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return (
    <View style={pStyles.timerRow}>
      <MaterialCommunityIcons name="timer-sand" size={13} color={COLORS.danger} />
      <Text style={pStyles.timerText}>{timeLeft}</Text>
    </View>
  );
}

function PremiumProductCard({ product, isFirstPurchase, dailyOffer, onBuy }: {
  product: PremiumProduct;
  isFirstPurchase: boolean;
  dailyOffer: DailyOffer | null;
  onBuy: (productId: string) => void;
}) {
  const tagInfo = product.tag ? TAG_LABELS[product.tag] : null;
  const isDailyOffer = dailyOffer && dailyOffer.productId === product.id;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const isWhale = product.id === 'whale_pack';
  const borderColor = isWhale ? '#FF4DFF' : tagInfo ? tagInfo.color + '60' : COLORS.border;

  return (
    <Pressable
      onPressIn={() => Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start()}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onBuy(product.id);
      }}
    >
      <Animated.View style={[pStyles.productCard, { borderColor, transform: [{ scale: scaleAnim }] }]}>
        {tagInfo && (
          <View style={[pStyles.tagBadge, { backgroundColor: tagInfo.color }]}>
            <MaterialCommunityIcons name={tagInfo.icon as any} size={10} color="#000" />
            <Text style={pStyles.tagText}>{tagInfo.label}</Text>
          </View>
        )}

        {isFirstPurchase && product.totalGems > 0 && (
          <View style={pStyles.firstPurchaseBadge}>
            <MaterialCommunityIcons name="star-circle" size={11} color="#000" />
            <Text style={pStyles.firstPurchaseText}>ILK ALIM 2X GEM!</Text>
          </View>
        )}

        <View style={pStyles.productTop}>
          <View style={[pStyles.gemIconBg, { backgroundColor: isWhale ? '#FF4DFF15' : '#B9F2FF15' }]}>
            <MaterialCommunityIcons
              name={isWhale ? 'crown' : 'diamond'}
              size={28}
              color={isWhale ? '#FF4DFF' : '#B9F2FF'}
            />
          </View>

          <View style={pStyles.productInfo}>
            <Text style={pStyles.productName}>{product.name}</Text>
            <Text style={pStyles.productDesc} numberOfLines={2}>{product.description}</Text>

            <View style={pStyles.productIncludes}>
              <View style={pStyles.includeChip}>
                <MaterialCommunityIcons name="diamond" size={12} color="#B9F2FF" />
                <Text style={pStyles.includeText}>
                  {product.totalGems > 0
                    ? (isFirstPurchase ? `${product.totalGems * 2}` : `${product.totalGems}`)
                    : '0'}
                  {product.bonusGems > 0 && ` (+${product.bonusGems})`}
                </Text>
              </View>
              {product.includesBattlePass && (
                <View style={[pStyles.includeChip, { borderColor: COLORS.gold + '40' }]}>
                  <MaterialCommunityIcons name="ticket-confirmation" size={12} color={COLORS.gold} />
                  <Text style={[pStyles.includeText, { color: COLORS.gold }]}>Sezon Pasi</Text>
                </View>
              )}
              {product.includesBoost && (
                <View style={[pStyles.includeChip, { borderColor: '#4ECDC440' }]}>
                  <MaterialCommunityIcons name="lightning-bolt" size={12} color="#4ECDC4" />
                  <Text style={[pStyles.includeText, { color: '#4ECDC4' }]}>Boost</Text>
                </View>
              )}
              {product.includesAura && (
                <View style={[pStyles.includeChip, { borderColor: '#FF4DFF40' }]}>
                  <MaterialCommunityIcons name="shimmer" size={12} color="#FF4DFF" />
                  <Text style={[pStyles.includeText, { color: '#FF4DFF' }]}>Aura</Text>
                </View>
              )}
            </View>
          </View>

          <View style={pStyles.priceCol}>
            {(product.originalPriceDisplay || isDailyOffer) && (
              <Text style={pStyles.originalPrice}>
                {isDailyOffer ? `$${((dailyOffer as DailyOffer).discountedPriceUSD / 100 * 100 / (100 - (dailyOffer as DailyOffer).discountPercent) / 100).toFixed(2)}` : product.originalPriceDisplay}
              </Text>
            )}
            <Text style={[pStyles.currentPrice, isWhale && { color: '#FF4DFF' }]}>
              {isDailyOffer ? (dailyOffer as DailyOffer).discountedPriceDisplay : product.priceDisplay}
            </Text>
            {isDailyOffer && (
              <View style={pStyles.discountBadge}>
                <Text style={pStyles.discountText}>-%{(dailyOffer as DailyOffer).discountPercent}</Text>
              </View>
            )}
          </View>
        </View>

        {isDailyOffer && (
          <View style={pStyles.dailyOfferBar}>
            <MaterialCommunityIcons name="clock-alert-outline" size={14} color={COLORS.danger} />
            <Text style={pStyles.dailyOfferLabel}>Gunluk Teklif</Text>
            <CountdownTimer expiresAt={(dailyOffer as DailyOffer).expiresAt} />
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

function PurchaseSuccessOverlay({ visible, onDismiss, gemsGranted }: { visible: boolean; onDismiss: () => void; gemsGranted: number }) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 50, friction: 7 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
      const timer = setTimeout(onDismiss, 3000);
      return () => clearTimeout(timer);
    } else {
      scaleAnim.setValue(0);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[pStyles.successOverlay, { opacity: opacityAnim }]}>
      <Animated.View style={[pStyles.successCard, { transform: [{ scale: scaleAnim }] }]}>
        <MaterialCommunityIcons name="check-decagram" size={60} color={COLORS.success} />
        <Text style={pStyles.successTitle}>Satin Alma Basarili!</Text>
        {gemsGranted > 0 && (
          <View style={pStyles.successGemsRow}>
            <MaterialCommunityIcons name="diamond" size={22} color="#B9F2FF" />
            <Text style={pStyles.successGems}>+{gemsGranted} Gem</Text>
          </View>
        )}
        <Text style={pStyles.successSub}>Odulleriniz hesabiniza eklendi</Text>
      </Animated.View>
    </Animated.View>
  );
}

export default function StoreScreen() {
  const insets = useSafeAreaInsets();
  const { userId, character } = useGame();
  const queryClient = useQueryClient();

  const [activeSection, setActiveSection] = useState<string>(SECTION_PREMIUM);
  const [selectedItem, setSelectedItem] = useState<StoreItem | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isEquipping, setIsEquipping] = useState(false);
  const [isTopping, setIsTopping] = useState(false);
  const [showPurchaseSuccess, setShowPurchaseSuccess] = useState(false);
  const [lastGemsGranted, setLastGemsGranted] = useState(0);

  const { data, isLoading, refetch, isRefetching } = useQuery<StoreData>({
    queryKey: ['store', userId],
    queryFn: () => apiGet<StoreData>(`/store`),
    enabled: !!userId,
    staleTime: 10000,
  });

  const { data: premiumData } = useQuery<PremiumData>({
    queryKey: ['premium-products', userId],
    queryFn: () => apiGet<PremiumData>(`/shop/products`),
    enabled: !!userId,
    staleTime: 30000,
  });

  const gymCoins = data?.gymCoins ?? 0;
  const gems = data?.gems ?? 0;
  const ownedIds = data?.ownedItemIds ?? [];
  const activeBoosts = data?.activeBoosts ?? [];
  const equippedAura = data?.equippedAura ?? null;
  const catalog = data?.catalog ?? [];

  const level = character?.level ?? 1;

  const sections = [
    { key: SECTION_PREMIUM, label: 'Premium', icon: 'crown' as const },
    { key: SECTION_AURAS_COIN, label: 'Auralar', icon: 'shimmer' as const },
    { key: SECTION_BOOSTS_COIN, label: 'Boostlar', icon: 'lightning-bolt' as const },
    { key: SECTION_BOOSTS_GEM, label: 'Gem Boost', icon: 'rocket-launch' as const },
  ];

  const filteredItems = catalog.filter((item) => {
    if (activeSection === SECTION_AURAS_COIN) return item.type === 'aura';
    if (activeSection === SECTION_BOOSTS_COIN) return item.type === 'boost' && item.currency === 'gym_coin';
    if (activeSection === SECTION_BOOSTS_GEM) return item.type === 'boost' && item.currency === 'gem';
    return false;
  });

  async function handleBuy() {
    if (!selectedItem || isPurchasing) return;
    setIsPurchasing(true);
    try {
      const res = await apiPost('/store/purchase', { itemId: selectedItem.id });
      if (!res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Hata', res.error || 'Satin alma basarisiz');
        setSelectedItem(null);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await queryClient.invalidateQueries({ queryKey: ['store', userId] });
      await queryClient.invalidateQueries({ queryKey: ['character', userId] });
      setSelectedItem(null);
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Hata', e.message || 'Satin alma basarisiz');
      setSelectedItem(null);
    } finally {
      setIsPurchasing(false);
    }
  }

  async function handlePremiumBuy(productId: string) {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      const res = await apiPost<{ sessionUrl: string; product: any }>('/payment/create-session', { productId });
      if (!res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Hata', res.error || 'Odeme olusturulamadi');
        return;
      }
      if (res.data.sessionUrl) {
        const product = premiumData?.products.find((p) => p.id === productId);
        const totalGems = product?.totalGems ?? 0;
        setLastGemsGranted(premiumData?.firstPurchaseBonus ? totalGems * 2 : totalGems);
        if (Platform.OS === 'web') {
          window.open(res.data.sessionUrl, '_blank');
        } else {
          await Linking.openURL(res.data.sessionUrl);
        }
        setShowPurchaseSuccess(true);
      }
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Hata', e.message || 'Odeme olusturulamadi');
    }
  }

  async function handleDevTopup() {
    if (isTopping) return;
    setIsTopping(true);
    try {
      const res = await apiPost('/store/dev-topup', { coins: 5000, gems: 100 });
      if (!res.ok) {
        Alert.alert('Hata', res.error || 'Yukleme basarisiz');
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await queryClient.invalidateQueries({ queryKey: ['store', userId] });
    } catch (e: any) {
      Alert.alert('Hata', e.message || 'Yukleme basarisiz');
    } finally {
      setIsTopping(false);
    }
  }

  async function handleEquip(itemId: string | null) {
    if (isEquipping) return;
    setIsEquipping(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const res = await apiPost('/store/equip-aura', { itemId });
      if (!res.ok) {
        Alert.alert('Hata', res.error || 'Aura degistirilemedi');
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['store', userId] });
      await queryClient.invalidateQueries({ queryKey: ['character', userId] });
    } catch (e: any) {
      Alert.alert('Hata', e.message || 'Aura degistirilemedi');
    } finally {
      setIsEquipping(false);
    }
  }

  const topPad = Platform.OS === 'web' ? 20 : insets.top;
  const botPad = Platform.OS === 'web' ? 80 : insets.bottom + 80;

  return (
    <View style={[styles.screen, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Market</Text>
        <View style={styles.walletRow}>
          <View style={styles.walletChip}>
            <MaterialCommunityIcons name="circle-multiple" size={14} color={COLORS.gold} />
            <Text style={styles.walletAmount}>{gymCoins.toLocaleString()}</Text>
          </View>
          <View style={[styles.walletChip, { borderColor: '#B9F2FF40' }]}>
            <MaterialCommunityIcons name="diamond" size={14} color="#B9F2FF" />
            <Text style={[styles.walletAmount, { color: '#B9F2FF' }]}>{gems.toLocaleString()}</Text>
          </View>
          <Pressable style={styles.topupBtn} onPress={handleDevTopup} disabled={isTopping}>
            {isTopping
              ? <ActivityIndicator size={12} color={COLORS.success} />
              : <MaterialCommunityIcons name="plus-circle" size={18} color={COLORS.success} />
            }
          </Pressable>
        </View>
      </View>

      {activeBoosts.length > 0 && (
        <ActiveBoostBanner boosts={activeBoosts} catalog={catalog} />
      )}

      <View style={styles.sectionTabs}>
        {sections.map((s) => {
          const isActive = activeSection === s.key;
          return (
            <Pressable
              key={s.key}
              style={[styles.sectionTab, isActive && styles.sectionTabActive,
                s.key === SECTION_PREMIUM && isActive && { borderColor: '#FF4DFF60', backgroundColor: '#FF4DFF12' }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActiveSection(s.key);
              }}
            >
              <MaterialCommunityIcons
                name={s.icon}
                size={14}
                color={isActive ? (s.key === SECTION_PREMIUM ? '#FF4DFF' : COLORS.gold) : COLORS.textMuted}
              />
              <Text style={[styles.sectionTabText,
                isActive && { color: s.key === SECTION_PREMIUM ? '#FF4DFF' : COLORS.gold }]}>
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {activeSection !== SECTION_PREMIUM && (
        <View style={styles.coinHintRow}>
          <MaterialCommunityIcons name="information-outline" size={13} color={COLORS.textMuted} />
          <Text style={styles.coinHint}>
            {activeSection === SECTION_BOOSTS_GEM
              ? 'Gem ile premium iceriklere aninda eris.'
              : 'Antrenman yaptikca Gym Coin kazanirsin.'}
          </Text>
        </View>
      )}

      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={COLORS.gold} size="large" />
          <Text style={styles.loadingText}>Market yukleniyor...</Text>
        </View>
      ) : activeSection === SECTION_PREMIUM ? (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: botPad }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.gold} />}
        >
          {premiumData?.firstPurchaseBonus && (
            <View style={pStyles.firstPurchaseBanner}>
              <MaterialCommunityIcons name="star-circle" size={20} color="#FFD700" />
              <View style={{ flex: 1 }}>
                <Text style={pStyles.firstBannerTitle}>Ilk Alimda 2X Gem!</Text>
                <Text style={pStyles.firstBannerSub}>Ilk satin aliminizda gem miktari iki katina cikar</Text>
              </View>
            </View>
          )}

          {premiumData?.freeUserPenalty && (
            <View style={pStyles.softPaywallBanner}>
              <MaterialCommunityIcons name="shield-alert-outline" size={16} color={COLORS.warning} />
              <Text style={pStyles.softPaywallText}>
                Premium olmadan XP kazanimi daha yavas. Herhangi bir paket alarak hizlan!
              </Text>
            </View>
          )}

          {(premiumData?.products ?? []).map((product) => (
            <PremiumProductCard
              key={product.id}
              product={product}
              isFirstPurchase={premiumData?.firstPurchaseBonus ?? false}
              dailyOffer={premiumData?.dailyOffer ?? null}
              onBuy={handlePremiumBuy}
            />
          ))}

          <View style={pStyles.currencySinkSection}>
            <Text style={pStyles.sinkTitle}>Hizli Islemler</Text>
            <Text style={pStyles.sinkSub}>Gem harcayarak avantaj kazan</Text>
            <View style={pStyles.sinkRow}>
              <Pressable style={pStyles.sinkCard} onPress={async () => {
                try {
                  const res = await apiPost('/shop/reroll-quest', {});
                  if (!res.ok) { Alert.alert('Hata', res.error || 'Basarisiz'); return; }
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  Alert.alert('Basarili', 'Gorevler yenilendi!');
                  queryClient.invalidateQueries({ queryKey: ['store', userId] });
                  queryClient.invalidateQueries({ queryKey: ['character', userId] });
                } catch (e: any) { Alert.alert('Hata', e.message || 'Basarisiz'); }
              }}>
                <MaterialCommunityIcons name="dice-multiple" size={22} color="#4ECDC4" />
                <Text style={pStyles.sinkLabel}>Gorev Yenile</Text>
                <View style={pStyles.sinkCost}>
                  <MaterialCommunityIcons name="diamond" size={11} color="#B9F2FF" />
                  <Text style={pStyles.sinkCostText}>50</Text>
                </View>
              </Pressable>
              <Pressable style={pStyles.sinkCard} onPress={async () => {
                try {
                  const res = await apiPost('/shop/skip-cooldown', {});
                  if (!res.ok) { Alert.alert('Hata', res.error || 'Basarisiz'); return; }
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  Alert.alert('Basarili', 'Bekleme suresi atlanildi!');
                  queryClient.invalidateQueries({ queryKey: ['store', userId] });
                } catch (e: any) { Alert.alert('Hata', e.message || 'Basarisiz'); }
              }}>
                <MaterialCommunityIcons name="timer-off" size={22} color="#FF6B35" />
                <Text style={pStyles.sinkLabel}>Bekleme Atla</Text>
                <View style={pStyles.sinkCost}>
                  <MaterialCommunityIcons name="diamond" size={11} color="#B9F2FF" />
                  <Text style={pStyles.sinkCostText}>30</Text>
                </View>
              </Pressable>
              <Pressable style={pStyles.sinkCard} onPress={async () => {
                try {
                  const res = await apiPost('/shop/instant-boost', {});
                  if (!res.ok) { Alert.alert('Hata', res.error || 'Basarisiz'); return; }
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  Alert.alert('Basarili', '30dk XP x1.5 aktif!');
                  queryClient.invalidateQueries({ queryKey: ['store', userId] });
                } catch (e: any) { Alert.alert('Hata', e.message || 'Basarisiz'); }
              }}>
                <MaterialCommunityIcons name="flash" size={22} color="#9B59B6" />
                <Text style={pStyles.sinkLabel}>Anlik Boost</Text>
                <View style={pStyles.sinkCost}>
                  <MaterialCommunityIcons name="diamond" size={11} color="#B9F2FF" />
                  <Text style={pStyles.sinkCostText}>20</Text>
                </View>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: botPad }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.gold} />}
        >
          {filteredItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              owned={ownedIds.includes(item.id)}
              equipped={equippedAura === item.id}
              gymCoins={gymCoins}
              gems={gems}
              characterLevel={level}
              activeBoosts={activeBoosts}
              onBuy={(i) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setSelectedItem(i);
              }}
              onEquip={handleEquip}
            />
          ))}
        </ScrollView>
      )}

      {isPurchasing && (
        <View style={styles.purchasingOverlay}>
          <ActivityIndicator color={COLORS.gold} />
          <Text style={styles.purchasingText}>Isleniyor...</Text>
        </View>
      )}

      <ConfirmModal
        item={selectedItem}
        gymCoins={gymCoins}
        gems={gems}
        onConfirm={handleBuy}
        onCancel={() => setSelectedItem(null)}
      />

      <PurchaseSuccessOverlay
        visible={showPurchaseSuccess}
        onDismiss={() => setShowPurchaseSuccess(false)}
        gemsGranted={lastGemsGranted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, color: COLORS.text },
  walletRow: { flexDirection: 'row', gap: 8 },
  walletChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.surface, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: COLORS.gold + '40',
  },
  walletAmount: { fontFamily: 'Inter_700Bold', fontSize: 13, color: COLORS.gold },
  topupBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },

  activeBoostBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginTop: 10, padding: 12,
    backgroundColor: COLORS.xpBar + '12', borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.xpBar + '40',
  },
  activeBoostGlow: {
    position: 'absolute', inset: -1, borderRadius: 14, borderWidth: 1, opacity: 0.4,
  },
  activeBoostTitle: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  activeBoostSub: { fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  activePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  activePillText: { fontFamily: 'Inter_700Bold', fontSize: 10 },

  sectionTabs: {
    flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, gap: 6,
  },
  sectionTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 8, borderRadius: 10,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  sectionTabActive: { borderColor: COLORS.gold + '60', backgroundColor: COLORS.gold + '12' },
  sectionTabText: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: COLORS.textMuted },

  coinHintRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4,
  },
  coinHint: { fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.textMuted },

  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.textMuted },

  list: { padding: 16, gap: 10 },

  itemCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surface, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  lockOverlay: {
    position: 'absolute', inset: 0, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 2,
    alignItems: 'center', justifyContent: 'center', gap: 4,
    flexDirection: 'row',
  },
  lockText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: COLORS.textMuted },
  itemIconBg: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  itemInfo: { flex: 1, gap: 3 },
  itemNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  itemName: { fontFamily: 'Inter_700Bold', fontSize: 14, color: COLORS.text },
  equippedPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  equippedPillText: { fontFamily: 'Inter_700Bold', fontSize: 9 },
  boostActivePill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  boostActivePillText: { fontFamily: 'Inter_700Bold', fontSize: 9 },
  itemDesc: { fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.textSecondary, lineHeight: 15 },
  itemMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  priceTag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  priceText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  levelTag: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: COLORS.surfaceElevated, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2,
  },
  levelTagText: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: COLORS.textMuted },
  durationTag: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  durationText: { fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.textSecondary },
  itemAction: { alignItems: 'center', justifyContent: 'center', minWidth: 52 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  actionBtnDisabled: { width: 40, height: 36, alignItems: 'center', justifyContent: 'center' },
  actionBtnOwned: { width: 40, height: 36, alignItems: 'center', justifyContent: 'center' },
  actionBtnText: { fontFamily: 'Inter_700Bold', fontSize: 13 },

  purchasingOverlay: {
    position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  purchasingText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: COLORS.text },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 36, gap: 14,
    borderTopWidth: 1, borderColor: COLORS.border,
  },
  confirmIconWrap: {
    width: 80, height: 80, borderRadius: 20, alignSelf: 'center',
    alignItems: 'center', justifyContent: 'center',
  },
  confirmTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, color: COLORS.text, textAlign: 'center' },
  confirmDesc: { fontFamily: 'Inter_400Regular', fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 19 },
  confirmPriceRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: COLORS.surfaceElevated, borderRadius: 14, padding: 14,
  },
  confirmPriceBox: { alignItems: 'center', gap: 4, minWidth: 64 },
  confirmPriceLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.textMuted },
  confirmPriceVal: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  confirmPriceNum: { fontFamily: 'Inter_700Bold', fontSize: 18, color: COLORS.text },
  notEnoughWarn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.danger + '15', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: COLORS.danger + '30',
  },
  notEnoughText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.danger, flex: 1 },
  boostInfo: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.info + '12', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: COLORS.info + '30',
  },
  boostInfoText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.info, flex: 1 },
  confirmButtons: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1, padding: 15, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { fontFamily: 'Inter_700Bold', fontSize: 15, color: COLORS.textSecondary },
  buyBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 15, borderRadius: 14,
  },
  buyBtnText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
});

const pStyles = StyleSheet.create({
  firstPurchaseBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFD70012', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#FFD70040', marginBottom: 8,
  },
  firstBannerTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#FFD700' },
  firstBannerSub: { fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },

  softPaywallBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.warning + '12', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: COLORS.warning + '30', marginBottom: 8,
  },
  softPaywallText: { fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.warning, flex: 1 },

  productCard: {
    backgroundColor: COLORS.surface, borderRadius: 16, padding: 14,
    borderWidth: 1.5, marginBottom: 10, overflow: 'hidden',
  },
  tagBadge: {
    position: 'absolute', top: 0, right: 16, paddingHorizontal: 8, paddingVertical: 3,
    borderBottomLeftRadius: 8, borderBottomRightRadius: 8,
    flexDirection: 'row', alignItems: 'center', gap: 3, zIndex: 2,
  },
  tagText: { fontFamily: 'Inter_700Bold', fontSize: 9, color: '#000' },

  firstPurchaseBadge: {
    position: 'absolute', top: 0, left: 16, paddingHorizontal: 8, paddingVertical: 3,
    borderBottomLeftRadius: 8, borderBottomRightRadius: 8,
    backgroundColor: '#4ECDC4', flexDirection: 'row', alignItems: 'center', gap: 3, zIndex: 2,
  },
  firstPurchaseText: { fontFamily: 'Inter_700Bold', fontSize: 8, color: '#000' },

  productTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  gemIconBg: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  productInfo: { flex: 1, gap: 4 },
  productName: { fontFamily: 'Inter_700Bold', fontSize: 15, color: COLORS.text },
  productDesc: { fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.textSecondary, lineHeight: 15 },
  productIncludes: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 4 },
  includeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
    borderWidth: 1, borderColor: '#B9F2FF30',
  },
  includeText: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: '#B9F2FF' },

  priceCol: { alignItems: 'flex-end', gap: 2 },
  originalPrice: {
    fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.textMuted,
    textDecorationLine: 'line-through',
  },
  currentPrice: { fontFamily: 'Inter_700Bold', fontSize: 18, color: COLORS.success },
  discountBadge: {
    backgroundColor: COLORS.danger, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1,
  },
  discountText: { fontFamily: 'Inter_700Bold', fontSize: 9, color: '#fff' },

  dailyOfferBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  dailyOfferLabel: { fontFamily: 'Inter_700Bold', fontSize: 11, color: COLORS.danger },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  timerText: { fontFamily: 'Inter_700Bold', fontSize: 11, color: COLORS.danger },

  currencySinkSection: { marginTop: 16, gap: 6 },
  sinkTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, color: COLORS.text },
  sinkSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.textMuted },
  sinkRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  sinkCard: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: 14, padding: 14,
    alignItems: 'center', gap: 6, borderWidth: 1, borderColor: COLORS.border,
  },
  sinkLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: COLORS.text, textAlign: 'center' },
  sinkCost: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sinkCostText: { fontFamily: 'Inter_700Bold', fontSize: 11, color: '#B9F2FF' },

  successOverlay: {
    position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
  successCard: {
    backgroundColor: COLORS.surface, borderRadius: 24, padding: 32,
    alignItems: 'center', gap: 12, borderWidth: 1, borderColor: COLORS.success + '40',
  },
  successTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, color: COLORS.success },
  successGemsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  successGems: { fontFamily: 'Inter_700Bold', fontSize: 24, color: '#B9F2FF' },
  successSub: { fontFamily: 'Inter_400Regular', fontSize: 13, color: COLORS.textSecondary },
});
