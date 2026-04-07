import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Animated,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, CLASS_COLORS } from '@/constants/colors';
import { useGame, apiPost, setAuthToken, CharacterClass } from '@/context/GameContext';
import { RACES, Race } from '@/constants/races';
import { DND_CLASSES, DND_CLASS_ICONS } from '@/constants/dnd-classes';

const REGIONS = [
  { value: 'global',      label: 'Global'   },
  { value: 'europe',      label: 'Avrupa'   },
  { value: 'americas',    label: 'Amerika'  },
  { value: 'asia',        label: 'Asya'     },
  { value: 'middle east', label: 'Orta Doğu'},
  { value: 'africa',      label: 'Afrika'   },
];

const TOTAL_STEPS = 5;

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { userId, setCharacter, completeOnboarding } = useGame();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [selectedRace, setSelectedRace] = useState<Race | null>(null);
  const [selectedClass, setSelectedClass] = useState<CharacterClass | null>(null);
  const [selectedRegion, setSelectedRegion] = useState(REGIONS[0]);
  const [isCreating, setIsCreating] = useState(false);
  const [referralCode, setReferralCode] = useState('');

  const slideAnim = useRef(new Animated.Value(0)).current;

  function nextStep() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([
      Animated.timing(slideAnim, { toValue: -30, duration: 150, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
    setStep((s) => s + 1);
  }

  async function createCharacter() {
    if (!selectedClass || !name.trim()) return;
    setIsCreating(true);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const res = await apiPost<any>('/character', {
        userId,
        name: name.trim(),
        class: selectedClass,
        race: selectedRace?.id || 'yuce_insan',
        region: selectedRegion.value,
      });
      if (!res.ok) {
        Alert.alert('Hata', res.error || 'Karakter olusturulamadi');
        return;
      }
      if (res.data.authToken) await setAuthToken(res.data.authToken);
      setCharacter(res.data);
      if (referralCode.trim()) {
        try {
          const refRes = await apiPost('/referral/apply', { referralCode: referralCode.trim() });
          if (!refRes.ok) {
            if (__DEV__) console.log('Referral apply failed (non-blocking):', refRes.error);
          }
        } catch (refErr) {
          if (__DEV__) console.log('Referral apply failed (non-blocking):', refErr);
        }
      }
      completeOnboarding();
      router.replace('/(tabs)');
    } catch (e: any) {
      Alert.alert('Hata', e.message || 'Baglanti hatasi');
    } finally {
      setIsCreating(false);
    }
  }

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  return (
    <View style={[styles.screen, { paddingTop: topPad }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: botPad + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ transform: [{ translateX: slideAnim }] }}>

          {step === 0 && (
            <View style={styles.stepContainer}>
              <View style={styles.heroIcon}>
                <MaterialCommunityIcons name="sword-cross" size={64} color={COLORS.gold} />
              </View>
              <Text style={styles.heroTitle}>GymQuest</Text>
              <Text style={styles.heroSubtitle}>
                Antrenmanlarını epik maceralara dönüştür. XP kazan, karakterini güçlendir, sıralamada zirveye çık!
              </Text>

              <View style={styles.featureList}>
                {[
                  { icon: 'lightning-bolt',   text: 'Her tekrar ve set için XP kazan' },
                  { icon: 'trophy',            text: 'Lig sisteminde zirveye tırman (Demir → Şampiyonluk)' },
                  { icon: 'account-group',     text: 'Maceracı grubu kur, boss\'ları birlikte yen' },
                  { icon: 'shield-star',       text: 'Karakterin seviye atladıkça görsel olarak evrimleşir' },
                ].map((f) => (
                  <View key={f.icon} style={styles.featureItem}>
                    <MaterialCommunityIcons name={f.icon as any} size={20} color={COLORS.gold} />
                    <Text style={styles.featureText}>{f.text}</Text>
                  </View>
                ))}
              </View>

              <Pressable style={styles.primaryBtn} onPress={nextStep}>
                <Text style={styles.primaryBtnText}>Maceraya Başla</Text>
                <MaterialCommunityIcons name="arrow-right" size={20} color="#000" />
              </Pressable>
            </View>
          )}

          {step === 1 && (
            <View style={styles.stepContainer}>
              <Text style={styles.stepTitle}>Kahramanının Adı</Text>
              <Text style={styles.stepSubtitle}>
                Rakiplerine korku salacak — ya da seni motive edecek — bir isim seç.
              </Text>

              <TextInput
                style={styles.nameInput}
                value={name}
                onChangeText={setName}
                placeholder="Kahraman adını gir..."
                placeholderTextColor={COLORS.textMuted}
                maxLength={20}
                autoFocus
                returnKeyType="done"
              />

              <Pressable
                style={[styles.primaryBtn, !name.trim() && styles.btnDisabled]}
                onPress={name.trim() ? nextStep : undefined}
              >
                <Text style={styles.primaryBtnText}>Devam Et</Text>
                <MaterialCommunityIcons name="arrow-right" size={20} color="#000" />
              </Pressable>
            </View>
          )}

          {step === 2 && (
            <View style={styles.stepContainer}>
              <Text style={styles.stepTitle}>Irkını Seç</Text>
              <Text style={styles.stepSubtitle}>
                Irk, başlangıç istatistiklerini ve XP bonuslarını belirler.
              </Text>

              <View style={styles.raceList}>
                {RACES.map((race) => {
                  const isSelected = selectedRace?.id === race.id;
                  return (
                    <Pressable
                      key={race.id}
                      style={[
                        styles.raceCard,
                        {
                          borderColor: isSelected ? race.color : COLORS.border,
                          backgroundColor: isSelected ? race.color + '15' : COLORS.surface,
                        },
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedRace(race);
                      }}
                    >
                      <View style={[styles.raceIconBox, {
                        backgroundColor: race.color + '20',
                        borderColor: race.color + '50',
                      }]}>
                        <MaterialCommunityIcons name={race.icon as any} size={26} color={race.color} />
                      </View>

                      <View style={styles.raceInfo}>
                        <Text style={[styles.raceName, isSelected && { color: race.color }]}>{race.name}</Text>
                        <Text style={styles.raceAbility} numberOfLines={2}>{race.specialAbility}</Text>
                        <View style={styles.raceBonusRow}>
                          {race.bonuses.filter((b) => b.delta !== 0).map((b) => (
                            <View key={b.stat} style={[styles.raceBonusTag, {
                              backgroundColor: (b.delta > 0 ? COLORS.success : COLORS.error) + '20',
                              borderColor: (b.delta > 0 ? COLORS.success : COLORS.error) + '50',
                            }]}>
                              <Text style={[styles.raceBonusText, { color: b.delta > 0 ? COLORS.success : COLORS.error }]}>
                                {b.delta > 0 ? '+' : ''}{b.delta} {
                                  b.stat === 'strength' ? 'GÜÇ' :
                                  b.stat === 'agility' ? 'ÇEV' : 'DAY'
                                }
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>

                      {isSelected && (
                        <MaterialCommunityIcons name="check-circle" size={22} color={race.color} />
                      )}
                    </Pressable>
                  );
                })}
              </View>

              {selectedRace && (
                <View style={[styles.raceLoreCard, { borderColor: selectedRace.color + '40' }]}>
                  <MaterialCommunityIcons name="book-open-variant" size={16} color={selectedRace.color} />
                  <Text style={[styles.raceLoreText, { color: selectedRace.color + 'CC' }]}>
                    {selectedRace.lore}
                  </Text>
                </View>
              )}

              <Pressable
                style={[styles.primaryBtn, !selectedRace && styles.btnDisabled]}
                onPress={selectedRace ? nextStep : undefined}
              >
                <Text style={styles.primaryBtnText}>Devam Et</Text>
                <MaterialCommunityIcons name="arrow-right" size={20} color="#000" />
              </Pressable>
            </View>
          )}

          {step === 3 && (
            <View style={styles.stepContainer}>
              <Text style={styles.stepTitle}>Sınıfını Seç</Text>
              <Text style={styles.stepSubtitle}>
                Sınıfın, hangi egzersizlerden daha fazla XP kazanacağını belirler.
              </Text>

              {selectedRace && (
                <View style={[styles.raceHint, { borderColor: selectedRace.color + '44', backgroundColor: selectedRace.color + '10' }]}>
                  <MaterialCommunityIcons name={selectedRace.icon as any} size={14} color={selectedRace.color} />
                  <Text style={[styles.raceHintText, { color: selectedRace.color }]}>
                    {selectedRace.name} olarak{' '}
                    {selectedRace.classAffinity.map((c) => {
                      const cls = DND_CLASSES.find((x) => x.id === c);
                      return cls?.name;
                    }).filter(Boolean).join(', ')} sınıflarıyla daha güçlüsün.
                  </Text>
                </View>
              )}

              <View style={styles.classGrid}>
                {DND_CLASSES.map((cls) => {
                  const isSelected = selectedClass === cls.id;
                  const color = CLASS_COLORS[cls.id] || cls.color;
                  const isAffinity = selectedRace?.classAffinity.includes(cls.id);
                  return (
                    <Pressable
                      key={cls.id}
                      style={[
                        styles.classCard,
                        {
                          borderColor: isSelected ? color : isAffinity ? color + '66' : COLORS.border,
                          backgroundColor: isSelected ? color + '15' : COLORS.surface,
                        },
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedClass(cls.id);
                      }}
                    >
                      {isAffinity && (
                        <View style={[styles.affinityBadge, { backgroundColor: color + '20' }]}>
                          <MaterialCommunityIcons name="star" size={9} color={color} />
                        </View>
                      )}
                      <View style={[styles.classIconWrapper, { backgroundColor: color + '20', borderColor: color + '44' }]}>
                        <MaterialCommunityIcons name={cls.icon as any} size={28} color={color} />
                      </View>
                      <Text style={[styles.className, isSelected && { color }]}>{cls.name}</Text>
                      <Text style={styles.classDesc}>{cls.description}</Text>
                      <View style={styles.classBonusRow}>
                        <MaterialCommunityIcons name="sword" size={9} color={color + 'CC'} />
                        <Text style={[styles.classBonus, { color: color + 'CC' }]}>{cls.attributeLabel}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                style={[styles.primaryBtn, !selectedClass && styles.btnDisabled]}
                onPress={selectedClass ? nextStep : undefined}
              >
                <Text style={styles.primaryBtnText}>Devam Et</Text>
                <MaterialCommunityIcons name="arrow-right" size={20} color="#000" />
              </Pressable>
            </View>
          )}

          {step === 4 && (
            <View style={styles.stepContainer}>
              <Text style={styles.stepTitle}>Bölgeni Seç</Text>
              <Text style={styles.stepSubtitle}>
                Bölge liderlik tablosunda zirveye tırman.
              </Text>

              <View style={styles.regionList}>
                {REGIONS.map((region) => {
                  const isSelected = selectedRegion.value === region.value;
                  return (
                    <Pressable
                      key={region.value}
                      style={[
                        styles.regionItem,
                        isSelected && { borderColor: COLORS.gold, backgroundColor: COLORS.gold + '11' },
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedRegion(region);
                      }}
                    >
                      <MaterialCommunityIcons
                        name={isSelected ? 'map-marker' : 'map-marker-outline'}
                        size={20}
                        color={isSelected ? COLORS.gold : COLORS.textSecondary}
                      />
                      <Text style={[styles.regionText, isSelected && { color: COLORS.gold }]}>
                        {region.label}
                      </Text>
                      {isSelected && (
                        <MaterialCommunityIcons
                          name="check-circle"
                          size={18}
                          color={COLORS.gold}
                          style={{ marginLeft: 'auto' }}
                        />
                      )}
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.summaryCard}>
                <View style={[
                  styles.summaryIcon,
                  {
                    backgroundColor: selectedClass ? CLASS_COLORS[selectedClass] + '20' : COLORS.surfaceElevated,
                    borderColor: selectedClass ? CLASS_COLORS[selectedClass] + '50' : COLORS.border,
                  },
                ]}>
                  <MaterialCommunityIcons
                    name={(selectedClass ? DND_CLASS_ICONS[selectedClass] || 'sword' : 'sword') as any}
                    size={28}
                    color={selectedClass ? CLASS_COLORS[selectedClass] : COLORS.textMuted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.summaryName}>{name}</Text>
                  <Text style={styles.summaryInfo}>
                    {selectedRace?.name} {selectedClass ? DND_CLASSES.find((c) => c.id === selectedClass)?.name : ''} · {selectedRegion.label}
                  </Text>
                </View>
              </View>

              <View style={styles.referralRow}>
                <MaterialCommunityIcons name="gift-outline" size={18} color={COLORS.arcane} />
                <TextInput
                  style={styles.referralInput}
                  placeholder="Referans kodu (istege bagli)"
                  placeholderTextColor={COLORS.textMuted}
                  value={referralCode}
                  onChangeText={setReferralCode}
                  autoCapitalize="characters"
                  maxLength={7}
                />
              </View>

              <Pressable style={styles.primaryBtn} onPress={createCharacter} disabled={isCreating}>
                {isCreating ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="sword" size={20} color="#000" />
                    <Text style={styles.primaryBtnText}>Arenaya Gir!</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}
        </Animated.View>
      </ScrollView>

      <View style={styles.dots}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 24 },
  stepContainer: { alignItems: 'center', gap: 20 },
  heroIcon: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: COLORS.gold + '15', borderWidth: 2, borderColor: COLORS.gold + '44',
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  heroTitle: { fontFamily: 'Inter_700Bold', fontSize: 42, color: COLORS.gold, letterSpacing: 2 },
  heroSubtitle: {
    fontFamily: 'Inter_400Regular', fontSize: 16, color: COLORS.textSecondary,
    textAlign: 'center', lineHeight: 24,
  },
  featureList: { width: '100%', gap: 12 },
  featureItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surface, padding: 14, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  featureText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: COLORS.text, flex: 1 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.gold, paddingVertical: 16, paddingHorizontal: 32,
    borderRadius: 16, gap: 8, width: '100%', marginTop: 8,
  },
  btnDisabled: { opacity: 0.4 },
  primaryBtnText: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#000', letterSpacing: 0.5 },
  stepTitle: { fontFamily: 'Inter_700Bold', fontSize: 28, color: COLORS.text, textAlign: 'center' },
  stepSubtitle: {
    fontFamily: 'Inter_400Regular', fontSize: 15, color: COLORS.textSecondary,
    textAlign: 'center', lineHeight: 22,
  },
  nameInput: {
    width: '100%', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 16, padding: 18, color: COLORS.text, fontFamily: 'Inter_600SemiBold',
    fontSize: 18, textAlign: 'center',
  },
  raceList: { width: '100%', gap: 10 },
  raceCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 14, borderWidth: 2,
  },
  raceIconBox: {
    width: 48, height: 48, borderRadius: 24, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  raceInfo: { flex: 1, gap: 4 },
  raceName: { fontFamily: 'Inter_700Bold', fontSize: 15, color: COLORS.text },
  raceAbility: { fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.textSecondary, lineHeight: 16 },
  raceBonusRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap', marginTop: 2 },
  raceBonusTag: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1,
  },
  raceBonusText: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  raceLoreCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: COLORS.surface, padding: 14, borderRadius: 12,
    borderWidth: 1, width: '100%',
  },
  raceLoreText: { fontFamily: 'Inter_400Regular', fontSize: 12, flex: 1, lineHeight: 18 },
  raceHint: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 10, borderRadius: 10, borderWidth: 1, width: '100%',
  },
  raceHintText: { fontFamily: 'Inter_500Medium', fontSize: 12, flex: 1 },
  affinityBadge: {
    position: 'absolute', top: 6, right: 6,
    padding: 3, borderRadius: 6,
  },
  classGrid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  classCard: { width: '47%', padding: 12, borderRadius: 16, borderWidth: 2, alignItems: 'center', gap: 6, position: 'relative' },
  classIconWrapper: {
    width: 52, height: 52, borderRadius: 26, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  className: { fontFamily: 'Inter_700Bold', fontSize: 13, color: COLORS.text, textAlign: 'center' },
  classDesc: { fontFamily: 'Inter_400Regular', fontSize: 10, color: COLORS.textSecondary, textAlign: 'center' },
  classBonusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  classBonus: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  regionList: { width: '100%', gap: 8 },
  regionItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surface, padding: 16, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  regionText: { fontFamily: 'Inter_500Medium', fontSize: 15, color: COLORS.text },
  summaryCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: COLORS.surface, padding: 16, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.gold + '44', width: '100%',
  },
  summaryIcon: {
    width: 56, height: 56, borderRadius: 28, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  summaryName: { fontFamily: 'Inter_700Bold', fontSize: 18, color: COLORS.gold },
  summaryInfo: { fontFamily: 'Inter_400Regular', fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  referralRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.surface, padding: 12, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.arcane + '30', width: '100%',
  },
  referralInput: {
    flex: 1, fontFamily: 'Inter_500Medium', fontSize: 14, color: COLORS.text,
    paddingVertical: 2,
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 20 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.border },
  dotActive: { backgroundColor: COLORS.gold, width: 24 },
});
