import { Platform, Alert } from 'react-native';
import { Pedometer } from 'expo-sensors';

export type HealthSource =
  | 'apple_health'
  | 'google_fit'
  | 'health_connect'
  | 'simulated'
  | 'permission_denied'
  | 'unavailable';

export type MovementStatus =
  | 'verified'
  | 'no_movement'
  | 'permission_denied'
  | 'unavailable'
  | 'simulated';

export interface HealthCheckResult {
  status: MovementStatus;
  hasMovement: boolean;
  stepsInWindow: number;
  windowMinutes: number;
  source: HealthSource;
  confidence: 'high' | 'medium' | 'low';
  permissionGranted: boolean;
  title: string;
  detail: string;
}

const MOVEMENT_STEP_THRESHOLD = 15;
const CHECK_WINDOW_MINUTES = 10;

let _permissionStatus: 'granted' | 'denied' | 'unknown' = 'unknown';
let _prePromptShown = false;

function showPrePermissionPrompt(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Hareket İzni',
      'Adım sayma ve aktivite takibi için izin gerekiyor. Bu sayede antrenmanların otomatik olarak doğrulanır ve tam XP kazanırsın.',
      [
        { text: 'Şimdi Değil', style: 'cancel', onPress: () => resolve(false) },
        { text: 'İzin Ver', onPress: () => resolve(true) },
      ],
      { cancelable: false }
    );
  });
}

function showPermissionDeniedInfo(): void {
  Alert.alert(
    'İzin Verilmedi',
    'Bu özellik izin olmadan çalışmaz ama uygulamayı kullanmaya devam edebilirsin. Antrenmanların elle doğrulanacak.',
    [{ text: 'Tamam' }]
  );
}

export async function requestHealthPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') {
    _permissionStatus = 'granted';
    return true;
  }

  if (!_prePromptShown && _permissionStatus !== 'granted') {
    _prePromptShown = true;
    const userAgreed = await showPrePermissionPrompt();
    if (!userAgreed) {
      if (__DEV__) console.warn('[GymQuest Health] Kullanici on-izin ekraninda reddetti');
      _permissionStatus = 'denied';
      showPermissionDeniedInfo();
      return false;
    }
  }

  try {
    const { status } = await Pedometer.requestPermissionsAsync();
    _permissionStatus = status === 'granted' ? 'granted' : 'denied';
    if (_permissionStatus === 'denied') {
      if (__DEV__) console.warn('[GymQuest Health] Sistem izni reddedildi');
      showPermissionDeniedInfo();
    }
    return _permissionStatus === 'granted';
  } catch {
    if (__DEV__) console.warn('[GymQuest Health] Izin istegi basarisiz');
    _permissionStatus = 'denied';
    showPermissionDeniedInfo();
    return false;
  }
}

export async function isAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  try {
    return await Pedometer.isAvailableAsync();
  } catch {
    return false;
  }
}

async function getStepsInWindow(minutes: number): Promise<number | null> {
  try {
    const end = new Date();
    const start = new Date(end.getTime() - minutes * 60 * 1000);
    const result = await Pedometer.getStepCountAsync(start, end);
    return result.steps;
  } catch {
    return null;
  }
}

function simulateHealthCheck(suspicious: boolean): HealthCheckResult {
  const chance = suspicious ? 0.40 : 0.78;
  const detected = Math.random() < chance;
  const steps = detected
    ? Math.floor(Math.random() * 200) + MOVEMENT_STEP_THRESHOLD + 5
    : Math.floor(Math.random() * MOVEMENT_STEP_THRESHOLD);

  return {
    status: detected ? 'verified' : 'no_movement',
    hasMovement: detected,
    stepsInWindow: steps,
    windowMinutes: CHECK_WINDOW_MINUTES,
    source: 'simulated',
    confidence: 'low',
    permissionGranted: true,
    title: detected ? 'Sağlık Simülasyonu: Hareket Tespit Edildi' : 'Sağlık Simülasyonu: Hareket Yok',
    detail: detected
      ? `Son ${CHECK_WINDOW_MINUTES} dakikada ${steps} adım algılandı.`
      : `Son ${CHECK_WINDOW_MINUTES} dakikada yalnızca ${steps} adım tespit edildi.`,
  };
}

export async function checkRecentMovement(options?: {
  suspicious?: boolean;
}): Promise<HealthCheckResult> {
  const suspicious = options?.suspicious ?? false;

  if (Platform.OS === 'web') {
    return simulateHealthCheck(suspicious);
  }

  let available = false;
  try {
    available = await Pedometer.isAvailableAsync();
  } catch {
    available = false;
  }

  if (!available) {
    return {
      status: 'unavailable',
      hasMovement: true,
      stepsInWindow: 0,
      windowMinutes: CHECK_WINDOW_MINUTES,
      source: 'unavailable',
      confidence: 'low',
      permissionGranted: false,
      title: 'Sağlık Verisi Kullanılamıyor',
      detail: 'Cihazında adım sayacı desteklenmiyor. Antrenmanların elle doğrulanacak.',
    };
  }

  if (_permissionStatus === 'unknown') {
    try {
      const { status } = await Pedometer.getPermissionsAsync();
      _permissionStatus = status === 'granted' ? 'granted' : 'denied';
    } catch {
      _permissionStatus = 'denied';
    }
  }

  if (_permissionStatus !== 'granted') {
    const granted = await requestHealthPermissions();
    if (!granted) {
      return {
        status: 'permission_denied',
        hasMovement: true,
        stepsInWindow: 0,
        windowMinutes: CHECK_WINDOW_MINUTES,
        source: 'permission_denied',
        confidence: 'low',
        permissionGranted: false,
        title: 'İzin Verilmedi — Elle Devam',
        detail: Platform.OS === 'ios'
          ? 'Bu özellik izin olmadan çalışmaz ama uygulamayı kullanmaya devam edebilirsin. İzin vermek için: Ayarlar > Gizlilik > Hareket ve Fitness > GymQuest'
          : 'Bu özellik izin olmadan çalışmaz ama uygulamayı kullanmaya devam edebilirsin. İzin vermek için: Ayarlar > Uygulamalar > GymQuest > İzinler',
      };
    }
  }

  const steps = await getStepsInWindow(CHECK_WINDOW_MINUTES);

  if (steps === null) {
    return simulateHealthCheck(suspicious);
  }

  const hasMovement = steps >= MOVEMENT_STEP_THRESHOLD;
  const source: HealthSource = Platform.OS === 'ios' ? 'apple_health' : 'google_fit';

  return {
    status: hasMovement ? 'verified' : 'no_movement',
    hasMovement,
    stepsInWindow: steps,
    windowMinutes: CHECK_WINDOW_MINUTES,
    source,
    confidence: 'high',
    permissionGranted: true,
    title: hasMovement
      ? `${Platform.OS === 'ios' ? 'Apple Health' : 'Google Fit'}: Hareket Onaylandı`
      : `${Platform.OS === 'ios' ? 'Apple Health' : 'Google Fit'}: Hareket Bulunamadı`,
    detail: hasMovement
      ? `Son ${CHECK_WINDOW_MINUTES} dakikada ${steps} adım kaydedildi. XP tam olarak verilecek.`
      : `Son ${CHECK_WINDOW_MINUTES} dakikada yalnızca ${steps} adım kaydedildi (eşik: ${MOVEMENT_STEP_THRESHOLD} adım).`,
  };
}

export function getSourceLabel(source: HealthSource): string {
  const labels: Record<HealthSource, string> = {
    apple_health: 'Apple Health',
    google_fit: 'Google Fit',
    health_connect: 'Health Connect',
    simulated: 'Simüle Edildi',
    permission_denied: 'İzin Yok',
    unavailable: 'Kullanılamıyor',
  };
  return labels[source] || source;
}
