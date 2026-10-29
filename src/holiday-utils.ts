/**
 * 日本の国民の祝日・休日判定ロジック
 * - 固定祝日 (元日、建国記念の日、天皇誕生日、憲法記念日、みどりの日、こどもの日、山の日、文化の日、勤労感謝の日)
 * - ハッピーマンデー (成人の日、海の日、敬老の日、スポーツの日)
 * - 天文計算による春分の日・秋分の日 (1980〜2099年対応)
 * - 振替休日 (日曜日に重なった場合の翌平日)
 * - 国民の休日 (祝日と祝日に挟まれた平日)
 */

export function getJapaneseHoliday(year: number, month: number, day: number): string | null {
  // month: 1..12, day: 1..31
  const d = new Date(year, month - 1, day);
  const dayOfWeek = d.getDay(); // 0: Sun, 1: Mon, ...

  // 第N月曜日を算出するヘルパー
  const getNthMonday = (y: number, m: number, n: number) => {
    const firstDay = new Date(y, m - 1, 1).getDay();
    const firstMonday = 1 + ((8 - firstDay) % 7 === 7 ? 0 : (8 - firstDay) % 7);
    return firstMonday + (n - 1) * 7;
  };

  // 春分の日・秋分の日の計算式 (1980〜2099年)
  const vernalEquinox = Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  const autumnEquinox = Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));

  // 基本となる祝日の判定
  const isBaseHoliday = (y: number, m: number, dt: number): string | null => {
    if (m === 1 && dt === 1) return '元日';
    if (m === 1 && dt === getNthMonday(y, 1, 2)) return '成人の日';
    if (m === 2 && dt === 11) return '建国記念の日';
    if (m === 2 && dt === 23) return '天皇誕生日';
    if (m === 3 && dt === vernalEquinox) return '春分の日';
    if (m === 4 && dt === 29) return '昭和の日';
    if (m === 5 && dt === 3) return '憲法記念日';
    if (m === 5 && dt === 4) return 'みどりの日';
    if (m === 5 && dt === 5) return 'こどもの日';
    if (m === 7 && dt === getNthMonday(y, 7, 3)) return '海の日';
    if (m === 8 && dt === 11) return '山の日';
    if (m === 9 && dt === getNthMonday(y, 9, 3)) return '敬老の日';
    if (m === 9 && dt === autumnEquinox) return '秋分の日';
    if (m === 10 && dt === getNthMonday(y, 10, 2)) return 'スポーツの日';
    if (m === 11 && dt === 3) return '文化の日';
    if (m === 11 && dt === 23) return '勤労感謝の日';
    return null;
  };

  const base = isBaseHoliday(year, month, day);
  if (base) return base;

  // 振替休日判定:
  // 当日が月曜日で、前日（日曜日）が祝日の場合
  if (dayOfWeek === 1) {
    const prevDate = new Date(year, month - 1, day - 1);
    const prevHoliday = isBaseHoliday(prevDate.getFullYear(), prevDate.getMonth() + 1, prevDate.getDate());
    if (prevHoliday) return '振替休日';
  }
  // 5月6日の振替休日特例 (5月3, 4, 5日のいずれかが日曜日の場合)
  if (month === 5 && day === 6) {
    const may3 = new Date(year, 4, 3).getDay();
    const may4 = new Date(year, 4, 4).getDay();
    const may5 = new Date(year, 4, 5).getDay();
    if (may3 === 0 || may4 === 0 || may5 === 0) {
      return '振替休日';
    }
  }

  // 国民の休日 (祝日と祝日に挟まれた平日、例: 9月のシルバーウィーク)
  if (month === 9 && dayOfWeek !== 0) {
    const prev = isBaseHoliday(year, 9, day - 1);
    const next = isBaseHoliday(year, 9, day + 1);
    if (prev && next) {
      return '国民の休日';
    }
  }

  return null;
}

/**
 * 日曜日または日本の祝日かどうかを判定
 */
export function checkClosedDay(dateStr: string): {
  isClosed: boolean;
  reason: 'sunday' | 'holiday' | null;
  holidayName?: string;
} {
  if (!dateStr) return { isClosed: false, reason: null };
  const [year, month, day] = dateStr.split('-').map(Number);
  const dateObj = new Date(year, month - 1, day);

  // 日曜日判定
  if (dateObj.getDay() === 0) {
    return { isClosed: true, reason: 'sunday' };
  }

  // 祝日判定
  const holidayName = getJapaneseHoliday(year, month, day);
  if (holidayName) {
    return { isClosed: true, reason: 'holiday', holidayName };
  }

  return { isClosed: false, reason: null };
}
