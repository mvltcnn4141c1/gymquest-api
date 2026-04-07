import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
  Modal,
  Animated,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGame, apiPost, apiGet } from '@/context/GameContext';
import { useNetwork } from '@/context/NetworkContext';
import { COLORS } from '@/constants/colors';
import { useQueryClient } from '@tanstack/react-query';
import { XPGainOverlay } from '@/components/feedback/XPGainOverlay';
import {
  checkRecentMovement,
  requestHealthPermissions,
  getSourceLabel,
  type HealthCheckResult,
  type HealthSource,
} from '@/services/HealthService';
import {
  ALL_EXERCISES,
  EXERCISE_MAP,
  EXERCISE_CATEGORIES,
  EXERCISES_BY_CATEGORY,
  getExerciseXP,
  getExerciseCal,
  type ExerciseDef,
  type ExerciseCategory,
} from '@/constants/exercises';
import {
  validateWorkout,
  type WorkoutMode,
  type WorkoutExerciseEntry,
} from '@/constants/workout-validation';

const COOLDOWN_MS = 10 * 60 * 1000;
const LAST_WORKOUT_KEY = 'gymquest_last_workout_ts';

type Exercise = ExerciseDef & { maxReps?: number; maxSets?: number; maxMinutes?: number; maxKm?: number };

function formatSeconds(secs: number) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function clampNum(val: string, max: number) {
  const n = parseInt(val, 10);
  if (isNaN(n)) return val;
  return Math.min(n, max).toString();
}

function clampFloat(val: string, max: number) {
  const n = parseFloat(val);
  if (isNaN(n)) return val;
  return Math.min(n, max).toString();
}

function isSuspicious(ex: ExerciseDef, sets: string, reps: string, duration: string, km: string): boolean {
  if (ex.unit === 'km') return parseFloat(km) > (ex.maxKm ?? 42) * 0.9;
  if (ex.unit === 'minutes') return parseInt(duration) > (ex.maxMinutes ?? 240) * 0.9;
  return parseInt(reps) > (ex.maxReps ?? 100) * 0.95 || parseInt(sets) > (ex.maxSets ?? 20) * 0.95;
}

const MIN_SETS_CLIENT = 3;
const MIN_DUR_CLIENT = 5;

function estimateDurationMin(ex: ExerciseDef, sets: string, reps: string, duration: string, km: string): number {
  if (ex.unit === 'km') return Math.round(parseFloat(km || '0') * 6);
  if (ex.unit === 'minutes') return parseInt(duration) || 0;
  const s = parseInt(sets) || 1;
  const r = parseInt(reps) || 0;
  const secPerRep = ex.tempoSec || 3;
  return Math.round((s * r * secPerRep + s * 60) / 60);
}

function checkClientEffort(ex: ExerciseDef, sets: string, reps: string, duration: string, km: string): string | null {
  const s = parseInt(sets) || 1;
  const dur = estimateDurationMin(ex, sets, reps, duration, km);
  if (ex.unit === 'minutes' || ex.unit === 'km') {
    if (dur < MIN_DUR_CLIENT) return `Antrenman en az ${MIN_DUR_CLIENT} dakika olmali`;
    return null;
  }
  if (s < MIN_SETS_CLIENT && dur < MIN_DUR_CLIENT) return `En az ${MIN_SETS_CLIENT} set veya ${MIN_DUR_CLIENT} dakika gerekli`;
  if (s < MIN_SETS_CLIENT) return `En az ${MIN_SETS_CLIENT} set gerekli`;
  if (dur < MIN_DUR_CLIENT) return `Antrenman en az ${MIN_DUR_CLIENT} dakika olmali`;
  return null;
}

function estimateXP(ex: ExerciseDef, sets: string, reps: string, duration: string, km: string) {
  return getExerciseXP(ex.id, parseInt(sets) || 1, parseInt(reps) || 0, parseInt(duration) || 0, parseFloat(km) || 0);
}

function estimateCal(ex: ExerciseDef, sets: string, reps: string, duration: string, km: string) {
  return getExerciseCal(ex.id, parseInt(sets) || 1, parseInt(reps) || 0, parseInt(duration) || 0, parseFloat(km) || 0);
}

interface HealthStatusBadgeProps {
  result: HealthCheckResult | null;
  isChecking: boolean;
}

function HealthStatusBadge({ result, isChecking }: HealthStatusBadgeProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isChecking) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [isChecking]);

  if (!result && !isChecking) {
    return (
      <View style={[styles.healthBadge, { borderColor: COLORS.border }]}>
        <MaterialCommunityIcons name="heart-pulse" size={14} color={COLORS.textMuted} />
        <Text style={styles.healthBadgeText}>
          {Platform.OS === 'ios' ? 'Apple Health' : Platform.OS === 'android' ? 'Google Fit' : 'Sağlık'} kontrol edilmedi
        </Text>
      </View>
    );
  }

  if (isChecking) {
    return (
      <Animated.View style={[styles.healthBadge, { borderColor: COLORS.info + '60', transform: [{ scale: pulseAnim }] }]}>
        <ActivityIndicator size={12} color={COLORS.info} />
        <Text style={[styles.healthBadgeText, { color: COLORS.info }]}>
          {Platform.OS === 'ios' ? 'Apple Health' : Platform.OS === 'android' ? 'Google Fit' : 'Sağlık'} kontrol ediliyor...
        </Text>
      </Animated.View>
    );
  }

  if (!result) return null;

  const statusConfig = {
    verified:         { icon: 'check-decagram', color: COLORS.success, bg: COLORS.success + '18' },
    no_movement:      { icon: 'alert-circle',   color: COLORS.warning, bg: COLORS.warning + '18' },
    permission_denied:{ icon: 'lock-outline',   color: COLORS.textMuted, bg: COLORS.surface },
    unavailable:      { icon: 'information-outline', color: COLORS.textMuted, bg: COLORS.surface },
    simulated:        {
      icon: result.hasMovement ? 'check-circle-outline' : 'alert-outline',
      color: result.hasMovement ? COLORS.success : COLORS.warning,
      bg: result.hasMovement ? COLORS.success + '12' : COLORS.warning + '12',
    },
  };

  const cfg = statusConfig[result.status] || statusConfig.unavailable;

  return (
    <View style={[styles.healthBadge, { borderColor: cfg.color + '55', backgroundColor: cfg.bg }]}>
      <MaterialCommunityIcons name={cfg.icon as any} size={14} color={cfg.color} />
      <Text style={[styles.healthBadgeText, { color: cfg.color }]} numberOfLines={1}>
        {result.title}
      </Text>
      {result.stepsInWindow > 0 && (
        <Text style={[styles.healthBadgeSteps, { color: cfg.color + 'AA' }]}>
          {result.stepsInWindow} adım
        </Text>
      )}
    </View>
  );
}

interface HealthWarningModalProps {
  visible: boolean;
  result: HealthCheckResult;
  onProceed: () => void;
  onCancel: () => void;
  estimatedXP: number;
}

function HealthWarningModal({ visible, result, onProceed, onCancel, estimatedXP }: HealthWarningModalProps) {
  const slideAnim = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (visible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 10 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 300, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible]);

  const sourceLabel = getSourceLabel(result.source);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel}>
      <View style={styles.modalOverlay}>
        <Animated.View style={[styles.modalCard, { transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.modalWarningIcon}>
            <MaterialCommunityIcons name="alert-circle" size={36} color={COLORS.warning} />
          </View>

          <Text style={styles.modalTitle}>Hareketlilik Tespit Edilemedi</Text>

          <View style={styles.modalDetailCard}>
            <View style={styles.modalDetailRow}>
              <MaterialCommunityIcons name="heart-pulse" size={16} color={COLORS.warning} />
              <Text style={styles.modalDetailLabel}>{sourceLabel}</Text>
            </View>
            <Text style={styles.modalDetailText}>{result.detail}</Text>
          </View>

          <View style={styles.modalInfoBox}>
            <MaterialCommunityIcons name="information-outline" size={16} color={COLORS.info} />
            <Text style={styles.modalInfoText}>
              Verilerin sağlık uygulamasıyla eşleşmiyor. Manuel girişlerde XP %50 azalır. Antrenman onay kuyruğuna alınır.
            </Text>
          </View>

          <View style={styles.modalXpCompare}>
            <View style={styles.xpCompareItem}>
              <Text style={styles.xpCompareLabel}>Tam XP</Text>
              <Text style={[styles.xpCompareValue, { color: COLORS.textMuted, textDecorationLine: 'line-through' }]}>
                +{estimatedXP}
              </Text>
            </View>
            <MaterialCommunityIcons name="arrow-right" size={16} color={COLORS.textMuted} />
            <View style={styles.xpCompareItem}>
              <Text style={styles.xpCompareLabel}>Verilecek XP</Text>
              <Text style={[styles.xpCompareValue, { color: COLORS.warning }]}>
                +{Math.floor(estimatedXP * 0.5)}
              </Text>
            </View>
          </View>

          <Text style={styles.modalHint}>
            Antrenmanı gerçekten yaptıysan sağlık uygulamasından (
            {Platform.OS === 'ios' ? 'Apple Health' : 'Google Fit / Health Connect'}) izin verildiğinde
            tam XP alabilirsin.
          </Text>

          <View style={styles.modalButtons}>
            <Pressable style={styles.modalCancelBtn} onPress={onCancel}>
              <Text style={styles.modalCancelText}>İptal</Text>
            </Pressable>
            <Pressable style={styles.modalProceedBtn} onPress={onProceed}>
              <MaterialCommunityIcons name="check" size={18} color="#000" />
              <Text style={styles.modalProceedText}>Yine de Kaydet ({Math.floor(estimatedXP * 0.5)} XP)</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

interface DisclaimerModalProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

function DisclaimerModal({ visible, onAccept, onDecline }: DisclaimerModalProps) {
  const slideAnim = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 10 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 400, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDecline}>
      <View style={styles.modalOverlay}>
        <Animated.View style={[styles.disclaimerCard, { transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.disclaimerIconWrap}>
            <MaterialCommunityIcons name="shield-alert-outline" size={40} color={COLORS.info} />
          </View>
          <Text style={styles.disclaimerTitle}>Saglik Uyarisi</Text>
          <View style={styles.disclaimerBody}>
            <Text style={styles.disclaimerText}>
              Bu uygulama genel fitness rehberligi saglar ve tibbi tavsiye degildir.
              Herhangi bir saglik sorununuz varsa veya yeni bir egzersiz programina
              baslamadan once mutlaka bir saglik uzmanina danisin.
            </Text>
          </View>
          <View style={styles.disclaimerNote}>
            <MaterialCommunityIcons name="information-outline" size={16} color={COLORS.textMuted} />
            <Text style={styles.disclaimerNoteText}>
              Devam ederek bu uyariyi kabul etmis olursunuz. Antrenman programlari
              kisisel saglik durumunuza gore uyarlanmamistir.
            </Text>
          </View>
          <View style={styles.modalButtons}>
            <Pressable style={styles.modalCancelBtn} onPress={onDecline}>
              <Text style={styles.modalCancelText}>Vazgec</Text>
            </Pressable>
            <Pressable style={styles.disclaimerAcceptBtn} onPress={onAccept}>
              <MaterialCommunityIcons name="check" size={18} color="#000" />
              <Text style={styles.disclaimerAcceptText}>Kabul Ediyorum</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

interface ValidationWarningsProps {
  warnings: string[];
}

function ValidationWarnings({ warnings }: ValidationWarningsProps) {
  if (warnings.length === 0) return null;
  return (
    <View style={styles.warningsCard}>
      <View style={styles.warningsHeader}>
        <MaterialCommunityIcons name="alert-outline" size={18} color={COLORS.warning} />
        <Text style={styles.warningsTitle}>Uyarilar ({warnings.length})</Text>
      </View>
      {warnings.map((w, i) => (
        <View key={i} style={styles.warningRow}>
          <MaterialCommunityIcons name="circle-small" size={20} color={COLORS.warning} />
          <Text style={styles.warningText}>{w}</Text>
        </View>
      ))}
      <Text style={styles.warningsHint}>
        Bu uyarilar bilgilendirme amaclidir. Antrenmaninizi kaydetmenizi engellemez.
      </Text>
    </View>
  );
}

export default function LogWorkoutScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ exerciseType?: string; exerciseName?: string }>();
  const { userId, setCharacter } = useGame();

  const defaultEx = params.exerciseType
    ? EXERCISE_MAP[params.exerciseType] || null
    : null;

  const [selectedExercise, setSelectedExercise] = useState<ExerciseDef | null>(defaultEx || null);
  const [selectedCategory, setSelectedCategory] = useState<ExerciseCategory | null>(
    defaultEx ? defaultEx.category as ExerciseCategory : null
  );
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [sets, setSets] = useState('3');
  const [reps, setReps] = useState('10');
  const [duration, setDuration] = useState('30');
  const [km, setKm] = useState('5');
  const [weight, setWeight] = useState('');
  const [isLogging, setIsLogging] = useState(false);
  const [xpOverlay, setXpOverlay] = useState<{ visible: boolean; xp: number; coins?: number; gems?: number }>({ visible: false, xp: 0 });
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  const [healthResult, setHealthResult] = useState<HealthCheckResult | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [showHealthWarning, setShowHealthWarning] = useState(false);
  const [pendingLog, setPendingLog] = useState(false);

  const [hasAcceptedDisclaimer, setHasAcceptedDisclaimer] = useState<boolean | null>(null);
  const [disclaimerLoaded, setDisclaimerLoaded] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [workoutMode, setWorkoutMode] = useState<WorkoutMode>('free');
  const [wasRecommendedUsed, setWasRecommendedUsed] = useState(false);
  const [wasModified, setWasModified] = useState(false);
  const [userEditedValues, setUserEditedValues] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    checkCooldown();
    requestHealthPermissions();
    loadDisclaimerStatus();
  }, []);

  useEffect(() => {
    if (userEditedValues && workoutMode === 'recommended') {
      setWorkoutMode('custom');
      setWasModified(true);
    }
  }, [userEditedValues]);

  async function loadDisclaimerStatus() {
    try {
      const char = await apiGet<{ hasAcceptedDisclaimer?: boolean }>('/character');
      setHasAcceptedDisclaimer(char.hasAcceptedDisclaimer === true);
    } catch {
      setHasAcceptedDisclaimer(false);
    }
    setDisclaimerLoaded(true);
  }

  async function acceptDisclaimer() {
    try {
      const res = await apiPost<any>('/character/accept-disclaimer', {});
      if (!res.ok) {
        Alert.alert('Hata', res.error || 'Feragatname kabul edilemedi');
        return;
      }
      setHasAcceptedDisclaimer(true);
      setShowDisclaimer(false);
      handleLog(true);
    } catch (e: any) {
      Alert.alert('Hata', e.message || 'Feragatname kabul edilemedi');
    }
  }

  function handleSetsChange(v: string) {
    setSets(clampNum(v, selectedExercise?.maxSets ?? 20));
    setUserEditedValues(true);
  }

  function handleRepsChange(v: string) {
    setReps(clampNum(v, selectedExercise?.maxReps ?? 100));
    setUserEditedValues(true);
  }

  function handleDurationChange(v: string) {
    setDuration(clampNum(v, selectedExercise?.maxMinutes ?? 300));
    setUserEditedValues(true);
  }

  function handleKmChange(v: string) {
    setKm(clampFloat(v, selectedExercise?.maxKm ?? 10));
    setUserEditedValues(true);
  }

  const checkCooldown = useCallback(async () => {
    const lastTs = await AsyncStorage.getItem(LAST_WORKOUT_KEY);
    if (!lastTs) return;
    const elapsed = Date.now() - parseInt(lastTs, 10);
    const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
    if (remaining > 0) setCooldownRemaining(remaining);
  }, []);

  useEffect(() => {
    if (cooldownRemaining <= 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) { clearInterval(timerRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [cooldownRemaining]);

  const isTimeUnit = selectedExercise?.unit === 'minutes';
  const isKmUnit = selectedExercise?.unit === 'km';
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const suspicious = selectedExercise
    ? isSuspicious(selectedExercise, sets, reps, duration, km)
    : false;

  const effortError = selectedExercise
    ? checkClientEffort(selectedExercise, sets, reps, duration, km)
    : null;

  const xpEst = selectedExercise ? estimateXP(selectedExercise, sets, reps, duration, km) : 0;
  const calEst = selectedExercise ? estimateCal(selectedExercise, sets, reps, duration, km) : 0;

  async function runHealthCheck(): Promise<HealthCheckResult> {
    setIsCheckingHealth(true);
    setHealthResult(null);
    try {
      await new Promise((r) => setTimeout(r, 1200 + Math.random() * 1000));
      const result = await checkRecentMovement({ suspicious });
      setHealthResult(result);
      return result;
    } finally {
      setIsCheckingHealth(false);
    }
  }

  async function handleLog(disclaimerJustAccepted = false) {
    if (!selectedExercise || cooldownRemaining > 0) return;

    if (!disclaimerJustAccepted && hasAcceptedDisclaimer !== true) {
      setShowDisclaimer(true);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    const health = await runHealthCheck();

    if (!health.hasMovement && health.status !== 'permission_denied' && health.status !== 'unavailable') {
      setPendingLog(true);
      setShowHealthWarning(true);
      return;
    }

    await executeLog(health);
  }

  async function executeLog(health: HealthCheckResult, forceManual = false) {
    if (!selectedExercise) return;
    setIsLogging(true);
    setShowHealthWarning(false);
    setPendingLog(false);

    let apiDuration = 0, apiReps = 0, apiSets = 1;
    if (isKmUnit) {
      apiDuration = Math.round(parseFloat(km) * 6);
    } else if (isTimeUnit) {
      apiDuration = parseInt(duration) || 0;
    } else {
      apiSets = parseInt(sets) || 1;
      apiReps = parseInt(reps) || 0;
    }

    const healthOverride = forceManual || (!health.hasMovement);

    try {
      const res = await apiPost<any>('/workouts', {
        exerciseType: selectedExercise.id,
        exerciseName: selectedExercise.name,
        exerciseCategory: selectedExercise.category,
        xpPerUnit: selectedExercise.xpPerUnit,
        tempoSec: selectedExercise.tempoSec,
        sets: apiSets,
        reps: apiReps,
        duration: apiDuration,
        weight: weight ? parseFloat(weight) : undefined,
        healthSource: health.source,
        clientHealthVerified: health.hasMovement && !healthOverride,
        mode: workoutMode,
        wasRecommendedUsed,
        wasModified,
      });

      if (!res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        if (res.code === 'COOLDOWN_ACTIVE') {
          const secs = res.remainingSeconds || Math.ceil(COOLDOWN_MS / 1000);
          setCooldownRemaining(secs);
          Alert.alert('Dinlenme Suresi', res.error);
        } else if (res.code === 'DISCLAIMER_REQUIRED') {
          setShowDisclaimer(true);
        } else if (res.code === 'INSUFFICIENT_EFFORT') {
          Alert.alert('Yetersiz Antrenman', res.error || 'Antrenman en az 5 dakika olmali');
        } else {
          Alert.alert('Hata', res.error || 'Antrenman kaydedilemedi');
        }
        return;
      }

      const result = res.data;
      await AsyncStorage.setItem(LAST_WORKOUT_KEY, Date.now().toString());
      setCooldownRemaining(Math.ceil(COOLDOWN_MS / 1000));

      if (result.character) setCharacter(result.character);
      await queryClient.invalidateQueries({ queryKey: ['workouts', userId] });
      await queryClient.invalidateQueries({ queryKey: ['leaderboard'] });

      if (result.leveledUp) {
        router.replace({ pathname: '/level-up', params: { level: result.newLevel, xp: result.xpEarned } });
      } else {
        setXpOverlay({
          visible: true,
          xp: result.xpEarned || xpEst,
          coins: result.gymCoinsEarned || 0,
          gems: 0,
        });
      }
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Hata', e.message || 'Antrenman kaydedilemedi');
    } finally {
      setIsLogging(false);
    }
  }

  const { isOnline } = useNetwork();
  const isCoolingDown = cooldownRemaining > 0;
  const isDisabled = !selectedExercise || isLogging || isCoolingDown || isCheckingHealth || !disclaimerLoaded || !!effortError || !isOnline;
  const showXpReduced = suspicious || (healthResult && !healthResult.hasMovement);

  const validationEntries: WorkoutExerciseEntry[] = selectedExercise
    ? [{ exercise: selectedExercise, sets: parseInt(sets) || 1, reps: parseInt(reps) || 0 }]
    : [];
  const { warnings: validationWarnings } = validateWorkout(validationEntries);

  return (
    <View style={[styles.screen, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="close" size={24} color={COLORS.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Antrenman Kaydet</Text>
        <View style={{ width: 40 }} />
      </View>

      {isCoolingDown && (
        <View style={styles.cooldownBanner}>
          <MaterialCommunityIcons name="timer-sand" size={20} color={COLORS.fire} />
          <View style={{ flex: 1 }}>
            <Text style={styles.cooldownTitle}>Dinlenme Süresi</Text>
            <Text style={styles.cooldownSub}>Bir sonraki antrenman için kalan süre</Text>
          </View>
          <Text style={styles.cooldownTimer}>{formatSeconds(cooldownRemaining)}</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: botPad + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Kas Grubu Seç</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={styles.categoryRow}>
          {(Object.entries(EXERCISE_CATEGORIES) as [ExerciseCategory, { label: string; icon: string; color: string }][]).map(([catKey, cat]) => {
            const isSelCat = selectedCategory === catKey;
            return (
              <Pressable
                key={catKey}
                style={[styles.categoryChip, isSelCat && { backgroundColor: cat.color + '22', borderColor: cat.color }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedCategory(catKey);
                  setSelectedExercise(null);
                  setExerciseSearch('');
                  setHealthResult(null);
                }}
              >
                <MaterialCommunityIcons name={cat.icon as any} size={16} color={isSelCat ? cat.color : COLORS.textMuted} />
                <Text style={[styles.categoryChipText, isSelCat && { color: cat.color }]}>{cat.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {selectedCategory && (
          <>
            <View style={styles.searchRow}>
              <MaterialCommunityIcons name="magnify" size={18} color={COLORS.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Egzersiz ara..."
                placeholderTextColor={COLORS.textMuted}
                value={exerciseSearch}
                onChangeText={setExerciseSearch}
              />
              {exerciseSearch.length > 0 && (
                <Pressable onPress={() => setExerciseSearch('')}>
                  <MaterialCommunityIcons name="close-circle" size={18} color={COLORS.textMuted} />
                </Pressable>
              )}
            </View>
            <View style={styles.exerciseGrid}>
              {(EXERCISES_BY_CATEGORY[selectedCategory] || [])
                .filter((ex) => exerciseSearch.length === 0 || ex.name.toLowerCase().includes(exerciseSearch.toLowerCase()) || ex.nameEn.toLowerCase().includes(exerciseSearch.toLowerCase()))
                .map((ex) => {
                  const isSelected = selectedExercise?.id === ex.id;
                  const catColor = EXERCISE_CATEGORIES[selectedCategory]?.color || COLORS.gold;
                  return (
                    <Pressable
                      key={ex.id}
                      style={[styles.exCard, isSelected && [styles.exCardSelected, { borderColor: catColor }]]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedExercise(ex);
                        setHealthResult(null);
                      }}
                    >
                      <MaterialCommunityIcons
                        name={ex.icon as any}
                        size={22}
                        color={isSelected ? catColor : COLORS.textSecondary}
                      />
                      <Text style={[styles.exName, isSelected && { color: catColor }]} numberOfLines={2}>{ex.name}</Text>
                      <Text style={styles.exSubMuscle} numberOfLines={1}>{ex.subMuscle}</Text>
                      <View style={[styles.exDiffBadge, { backgroundColor: ex.difficulty === 'ileri' ? COLORS.danger + '20' : ex.difficulty === 'orta' ? COLORS.warning + '20' : COLORS.success + '20' }]}>
                        <Text style={[styles.exDiffText, { color: ex.difficulty === 'ileri' ? COLORS.danger : ex.difficulty === 'orta' ? COLORS.warning : COLORS.success }]}>{ex.difficulty}</Text>
                      </View>
                    </Pressable>
                  );
                })}
            </View>
          </>
        )}

        {!selectedCategory && (
          <View style={styles.noCategoryHint}>
            <MaterialCommunityIcons name="gesture-tap" size={40} color={COLORS.textMuted} />
            <Text style={styles.noCategoryText}>Yukarıdan bir kas grubu seç</Text>
            <Text style={styles.noCategorySubText}>141+ egzersiz arasından birini bul</Text>
          </View>
        )}

        {selectedExercise && (
          <>
            <HealthStatusBadge result={healthResult} isChecking={isCheckingHealth} />

            <View style={styles.instructionCard}>
              <View style={styles.instructionHeader}>
                <MaterialCommunityIcons name="information-outline" size={16} color={COLORS.info} />
                <Text style={styles.instructionTitle}>Nasıl Yapılır?</Text>
                <View style={[styles.exDiffBadge, { backgroundColor: selectedExercise.difficulty === 'ileri' ? COLORS.danger + '20' : selectedExercise.difficulty === 'orta' ? COLORS.warning + '20' : COLORS.success + '20', marginLeft: 'auto' }]}>
                  <Text style={[styles.exDiffText, { color: selectedExercise.difficulty === 'ileri' ? COLORS.danger : selectedExercise.difficulty === 'orta' ? COLORS.warning : COLORS.success }]}>{selectedExercise.difficulty}</Text>
                </View>
              </View>
              <View style={styles.instructionMeta}>
                <View style={styles.instructionTag}>
                  <MaterialCommunityIcons name="dumbbell" size={12} color={COLORS.textMuted} />
                  <Text style={styles.instructionTagText}>{selectedExercise.equipment.filter(e => e !== 'yok').join(', ') || 'Yok'}</Text>
                </View>
                <View style={styles.instructionTag}>
                  <MaterialCommunityIcons name="human-male" size={12} color={COLORS.textMuted} />
                  <Text style={styles.instructionTagText}>{selectedExercise.subMuscle}</Text>
                </View>
                <View style={styles.instructionTag}>
                  <MaterialCommunityIcons name="rotate-orbit" size={12} color={COLORS.textMuted} />
                  <Text style={styles.instructionTagText}>{selectedExercise.joint}</Text>
                </View>
              </View>
              {selectedExercise.instructions.map((step, i) => (
                <View key={i} style={styles.instructionStep}>
                  <View style={styles.instructionNum}>
                    <Text style={styles.instructionNumText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.instructionStepText}>{step}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Detaylar</Text>
            <View style={styles.detailsCard}>
              {isKmUnit ? (
                <>
                  <View style={styles.inputRow}>
                    <View>
                      <Text style={styles.inputLabel}>Mesafe (km)</Text>
                      <Text style={styles.limitHint}>Maks. {selectedExercise.maxKm} km</Text>
                    </View>
                    <TextInput
                      style={styles.input}
                      value={km}
                      onChangeText={handleKmChange}
                      keyboardType="decimal-pad"
                      maxLength={4}
                      selectTextOnFocus
                    />
                  </View>
                  <View style={[styles.inputRow, styles.borderTop]}>
                    <Text style={styles.inputLabel}>Tahmini Süre</Text>
                    <Text style={styles.derivedValue}>~{Math.round(parseFloat(km) * 6 || 0)} dk</Text>
                  </View>
                </>
              ) : isTimeUnit ? (
                <View style={styles.inputRow}>
                  <View>
                    <Text style={styles.inputLabel}>Süre (dakika)</Text>
                    <Text style={styles.limitHint}>Maks. {selectedExercise.maxMinutes} dk</Text>
                  </View>
                  <TextInput
                    style={styles.input}
                    value={duration}
                    onChangeText={handleDurationChange}
                    keyboardType="numeric"
                    maxLength={4}
                    selectTextOnFocus
                  />
                </View>
              ) : (
                <>
                  <View style={styles.inputRow}>
                    <View>
                      <Text style={styles.inputLabel}>Set Sayısı</Text>
                      <Text style={styles.limitHint}>Maks. {selectedExercise.maxSets}</Text>
                    </View>
                    <TextInput
                      style={styles.input}
                      value={sets}
                      onChangeText={handleSetsChange}
                      keyboardType="numeric"
                      maxLength={3}
                      selectTextOnFocus
                    />
                  </View>
                  <View style={[styles.inputRow, styles.borderTop]}>
                    <View>
                      <Text style={styles.inputLabel}>Tekrar (set başına)</Text>
                      <Text style={styles.limitHint}>Maks. {selectedExercise.maxReps} tekrar</Text>
                    </View>
                    <TextInput
                      style={styles.input}
                      value={reps}
                      onChangeText={handleRepsChange}
                      keyboardType="numeric"
                      maxLength={3}
                      selectTextOnFocus
                    />
                  </View>
                  <View style={[styles.inputRow, styles.borderTop]}>
                    <Text style={styles.inputLabel}>Ağırlık (kg, opsiyonel)</Text>
                    <TextInput
                      style={styles.input}
                      value={weight}
                      onChangeText={setWeight}
                      keyboardType="decimal-pad"
                      maxLength={6}
                      placeholder="0"
                      placeholderTextColor={COLORS.textMuted}
                      selectTextOnFocus
                    />
                  </View>
                </>
              )}
            </View>

            {suspicious && (
              <View style={styles.suspiciousAlert}>
                <MaterialCommunityIcons name="alert-circle" size={18} color={COLORS.warning} />
                <Text style={styles.suspiciousText}>
                  Bu değer normalin üzerinde. Sağlık verisiyle doğrulanamıyorsa XP %50 azalır.
                </Text>
              </View>
            )}

            <View style={styles.xpPreview}>
              <View style={styles.xpPreviewItem}>
                <MaterialCommunityIcons name="lightning-bolt" size={22} color={COLORS.gold} />
                <Text style={styles.xpPreviewLabel}>Tahmini XP</Text>
                <Text style={styles.xpPreviewValue}>
                  {showXpReduced ? `+${Math.floor(xpEst * 0.5)} XP (yarı)` : `+${xpEst} XP`}
                </Text>
              </View>
              <View style={styles.xpDivider} />
              <View style={styles.xpPreviewItem}>
                <MaterialCommunityIcons name="fire" size={22} color={COLORS.fire} />
                <Text style={styles.xpPreviewLabel}>Kalori</Text>
                <Text style={[styles.xpPreviewValue, { color: COLORS.fire }]}>~{calEst} kal</Text>
              </View>
            </View>

            <ValidationWarnings warnings={validationWarnings} />

            <View style={[styles.healthInfoBox, {
              borderColor: Platform.OS === 'ios'
                ? '#FF375F55'
                : Platform.OS === 'android'
                  ? '#4285F455'
                  : COLORS.border,
            }]}>
              <MaterialCommunityIcons
                name={Platform.OS === 'ios' ? 'heart-circle' : Platform.OS === 'android' ? 'google-fit' : 'heart-pulse'}
                size={18}
                color={Platform.OS === 'ios' ? '#FF375F' : Platform.OS === 'android' ? '#4285F4' : COLORS.textMuted}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.healthInfoTitle}>
                  {Platform.OS === 'ios' ? 'Apple Health Entegrasyonu' :
                   Platform.OS === 'android' ? 'Google Fit Entegrasyonu' :
                   'Sağlık Entegrasyonu'}
                </Text>
                <Text style={styles.healthInfoDetail}>
                  {Platform.OS === 'ios'
                    ? 'Kaydettiğinde son 10 dakikanın adım verisi Apple Health üzerinden kontrol edilir.'
                    : Platform.OS === 'android'
                      ? 'Kaydettiğinde son 10 dakikanın adım verisi Google Fit üzerinden kontrol edilir.'
                      : 'Web modunda sağlık verisi simüle edilir.'}
                </Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: botPad + 16 }]}>
        {effortError && !isCoolingDown && (
          <View style={styles.effortWarning}>
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color={COLORS.fire} />
            <Text style={styles.effortWarningText}>{effortError}</Text>
          </View>
        )}
        {isCoolingDown ? (
          <View style={styles.cooldownBtn}>
            <MaterialCommunityIcons name="timer-sand" size={20} color={COLORS.fire} />
            <Text style={styles.cooldownBtnText}>Dinlenme — {formatSeconds(cooldownRemaining)}</Text>
          </View>
        ) : (
          <Pressable
            style={[styles.logBtn, isDisabled && styles.logBtnDisabled]}
            onPress={() => handleLog()}
            disabled={isDisabled}
          >
            {isLogging || isCheckingHealth ? (
              <>
                <ActivityIndicator color="#000" />
                <Text style={styles.logBtnText}>
                  {isCheckingHealth ? 'Sağlık verisi kontrol ediliyor...' : 'Kaydediliyor...'}
                </Text>
              </>
            ) : (
              <>
                <MaterialCommunityIcons name={!isOnline ? "wifi-off" : "dumbbell"} size={20} color="#000" />
                <Text style={styles.logBtnText}>
                  {!isOnline ? 'Cevrimdisi — Kayit Yapilamaz' : suspicious ? 'Kaydet (Onay Bekleyebilir)' : 'Kaydet & XP Kazan'}
                </Text>
              </>
            )}
          </Pressable>
        )}
      </View>

      <XPGainOverlay
        visible={xpOverlay.visible}
        xpAmount={xpOverlay.xp}
        coinsEarned={xpOverlay.coins}
        gemsEarned={xpOverlay.gems}
        onDismiss={() => {
          setXpOverlay(p => ({ ...p, visible: false }));
          router.back();
        }}
      />

      {healthResult && (
        <HealthWarningModal
          visible={showHealthWarning}
          result={healthResult}
          estimatedXP={xpEst}
          onProceed={() => executeLog(healthResult, true)}
          onCancel={() => {
            setShowHealthWarning(false);
            setPendingLog(false);
          }}
        />
      )}

      <DisclaimerModal
        visible={showDisclaimer}
        onAccept={acceptDisclaimer}
        onDecline={() => {
          setShowDisclaimer(false);
          router.back();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 17, color: COLORS.text },

  cooldownBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.fire + '15',
    borderBottomWidth: 1, borderBottomColor: COLORS.fire + '40',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  cooldownTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, color: COLORS.fire },
  cooldownSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  cooldownTimer: { fontFamily: 'Inter_700Bold', fontSize: 26, color: COLORS.fire, letterSpacing: 1 },

  scroll: { padding: 20 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, color: COLORS.text, marginBottom: 12, marginTop: 8 },
  categoryScroll: { marginBottom: 12, marginHorizontal: -16 },
  categoryRow: { paddingHorizontal: 16, gap: 8, flexDirection: 'row' },
  categoryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.surface, borderRadius: 20,
    paddingVertical: 8, paddingHorizontal: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  categoryChipText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: COLORS.textMuted },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.surface, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 12,
  },
  searchInput: {
    flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.text,
    padding: 0,
  },
  exerciseGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  exCard: {
    width: '47%', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.surface, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  exCardSelected: { borderColor: COLORS.gold, backgroundColor: COLORS.gold + '15' },
  exName: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: COLORS.textSecondary, textAlign: 'center' },
  exSubMuscle: { fontFamily: 'Inter_400Regular', fontSize: 10, color: COLORS.textMuted, textAlign: 'center' },
  exDiffBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  exDiffText: { fontFamily: 'Inter_600SemiBold', fontSize: 9 },
  noCategoryHint: { alignItems: 'center', paddingVertical: 50, gap: 10 },
  noCategoryText: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: COLORS.textSecondary },
  noCategorySubText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: COLORS.textMuted },

  healthBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, marginBottom: 4,
  },
  healthBadgeText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: COLORS.textMuted, flex: 1 },
  healthBadgeSteps: { fontFamily: 'Inter_700Bold', fontSize: 11 },

  instructionCard: {
    backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1,
    borderColor: COLORS.info + '33', padding: 14, marginBottom: 12, gap: 10,
  },
  instructionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  instructionTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, color: COLORS.text },
  instructionMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  instructionTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.surfaceElevated, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  instructionTagText: { fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.textMuted },
  instructionStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  instructionNum: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: COLORS.info + '22', borderWidth: 1, borderColor: COLORS.info + '44',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
  },
  instructionNumText: { fontFamily: 'Inter_700Bold', fontSize: 11, color: COLORS.info },
  instructionStepText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: COLORS.textSecondary, flex: 1, lineHeight: 20 },
  detailsCard: {
    backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1,
    borderColor: COLORS.border, overflow: 'hidden', marginBottom: 12,
  },
  borderTop: { borderTopWidth: 1, borderTopColor: COLORS.border },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  inputLabel: { fontFamily: 'Inter_500Medium', fontSize: 15, color: COLORS.text },
  limitHint: { fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  derivedValue: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: COLORS.textSecondary },
  input: {
    backgroundColor: COLORS.surfaceElevated, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8, color: COLORS.text,
    fontFamily: 'Inter_700Bold', fontSize: 16, minWidth: 80, textAlign: 'center',
  },

  suspiciousAlert: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.warning + '15', borderRadius: 12, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.warning + '40',
  },
  suspiciousText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.warning, flex: 1 },

  xpPreview: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.gold + '10', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: COLORS.gold + '30', marginBottom: 12,
  },
  xpPreviewItem: { flex: 1, alignItems: 'center', gap: 4 },
  xpDivider: { width: 1, height: 40, backgroundColor: COLORS.border },
  xpPreviewLabel: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.textSecondary },
  xpPreviewValue: { fontFamily: 'Inter_700Bold', fontSize: 18, color: COLORS.gold },

  healthInfoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 14,
    borderWidth: 1,
  },
  healthInfoTitle: { fontFamily: 'Inter_700Bold', fontSize: 13, color: COLORS.text },
  healthInfoDetail: { fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.textSecondary, lineHeight: 16 },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16, backgroundColor: COLORS.background,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  logBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.gold, padding: 18, borderRadius: 16, gap: 10,
  },
  logBtnDisabled: { opacity: 0.4 },
  logBtnText: { fontFamily: 'Inter_700Bold', fontSize: 17, color: '#000' },
  effortWarning: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.fire + '18', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
    marginBottom: 10,
  },
  effortWarningText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: COLORS.fire, flex: 1 },
  cooldownBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.fire + '20', borderWidth: 2, borderColor: COLORS.fire + '60',
    padding: 18, borderRadius: 16, gap: 10,
  },
  cooldownBtnText: { fontFamily: 'Inter_700Bold', fontSize: 17, color: COLORS.fire },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 36, gap: 14,
    borderTopWidth: 1, borderColor: COLORS.warning + '40',
  },
  modalWarningIcon: { alignSelf: 'center', marginBottom: 4 },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, color: COLORS.text, textAlign: 'center' },
  modalDetailCard: {
    backgroundColor: COLORS.warning + '10', borderRadius: 12, padding: 14, gap: 6,
    borderWidth: 1, borderColor: COLORS.warning + '30',
  },
  modalDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalDetailLabel: { fontFamily: 'Inter_700Bold', fontSize: 13, color: COLORS.warning },
  modalDetailText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.textSecondary, lineHeight: 17 },
  modalInfoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: COLORS.info + '10', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: COLORS.info + '30',
  },
  modalInfoText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.info, flex: 1, lineHeight: 17 },
  modalXpCompare: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    backgroundColor: COLORS.surfaceElevated, borderRadius: 12, padding: 14,
  },
  xpCompareItem: { alignItems: 'center', gap: 4 },
  xpCompareLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.textMuted },
  xpCompareValue: { fontFamily: 'Inter_700Bold', fontSize: 22 },
  modalHint: { fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.textMuted, textAlign: 'center', lineHeight: 16 },
  modalButtons: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: {
    flex: 1, padding: 15, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  modalCancelText: { fontFamily: 'Inter_700Bold', fontSize: 15, color: COLORS.textSecondary },
  modalProceedBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.warning, padding: 15, borderRadius: 14,
  },
  modalProceedText: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#000' },

  disclaimerCard: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 36, gap: 14,
    borderTopWidth: 1, borderColor: COLORS.info + '40',
  },
  disclaimerIconWrap: { alignSelf: 'center', marginBottom: 4 },
  disclaimerTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, color: COLORS.text, textAlign: 'center' },
  disclaimerBody: {
    backgroundColor: COLORS.info + '10', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: COLORS.info + '30',
  },
  disclaimerText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.textSecondary, lineHeight: 22 },
  disclaimerNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: COLORS.surfaceElevated, borderRadius: 10, padding: 12,
  },
  disclaimerNoteText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.textMuted, flex: 1, lineHeight: 17 },
  disclaimerAcceptBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.info, padding: 15, borderRadius: 14,
  },
  disclaimerAcceptText: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#000' },

  warningsCard: {
    backgroundColor: COLORS.warning + '10', borderRadius: 14, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.warning + '30', gap: 6,
  },
  warningsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  warningsTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, color: COLORS.warning },
  warningRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 2, paddingLeft: 4 },
  warningText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.textSecondary, flex: 1, lineHeight: 18 },
  warningsHint: { fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.textMuted, marginTop: 4, fontStyle: 'italic' },
});
