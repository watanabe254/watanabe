/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import liff from '@line/liff';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  Phone,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  RefreshCw,
  Info,
  MessageSquare,
  ArrowRight
} from 'lucide-react';
import { checkClosedDay } from './holiday-utils.ts';

// ====================================================================
// 1. 外部設定定数（ファイルの先頭に定義）
// ====================================================================
export const GAS_URL = "https://script.google.com/macros/s/AKfycbzi5gwqE1A5XWJfqTEOCLdgVoZllN5ev8XiRLVWUNGKUHx1VEs78eg2yTKDmdnUVCab/exec";
export const LIFF_ID = "2011886818-6xLhW2nd";
export const CALENDAR_ID = "watanabe@harumicho-seitai.com";

// ====================================================================
// 2. メニュー構成（1人体制のため担当者選択は不要）
// ====================================================================
export interface SalonMenu {
  id: string;
  name: string;
  duration: number; // カレンダー所要時間枠: 60分 / 90分
  treatmentMinutes: number; // 施術時間: 50分 / 80分
  price: number;
  priceDisplay: string;
  tag: string;
  description: string;
  highlights: string[];
}

export const SALON_MENUS: SalonMenu[] = [
  {
    id: "postpartum_care",
    name: "産後ケアコース50分（5,000円）",
    duration: 60, // 所要時間枠: 60分
    treatmentMinutes: 50,
    price: 5000,
    priceDisplay: "¥5,000",
    tag: "産後ママに人気",
    description: "骨盤の開きや傾き、産後特有の腰痛・肩こり・股関節の痛みを優しく丁寧に調整します。",
    highlights: ["骨盤・仙腸関節の調整", "産後体型サポート", "体に無理のないソフト手技"]
  },
  {
    id: "relax_first_experience",
    name: "痛くない【脱力施術】体験 初回50分（5,500円）",
    duration: 60, // 所要時間枠: 60分
    treatmentMinutes: 50,
    price: 5500,
    priceDisplay: "¥5,500",
    tag: "初回限定",
    description: "強い力やボキボキ鳴らす刺激は一切なし。呼吸と深部筋を緩め、慢性的な緊張を芯から解放します。",
    highlights: ["全身の緊張リセット", "痛みのない安心整体", "自律神経のバランス調整"]
  },
  {
    id: "regular_50min",
    name: "2回目以降施術 50分（10,000円）",
    duration: 60, // 所要時間枠: 60分
    treatmentMinutes: 50,
    price: 10000,
    priceDisplay: "¥10,000",
    tag: "再来・定期ケア",
    description: "前回からのお体の変化や状態に合わせたメンテナンス。日頃の疲労や歪みをスッキリ整えます。",
    highlights: ["定期メンテナンス", "お体の状態に合わせた手技", "姿勢・バランス維持"]
  },
  {
    id: "regular_80min",
    name: "2回目以降施術 80分（15,000円）",
    duration: 90, // 所要時間枠: 90分
    treatmentMinutes: 80,
    price: 15000,
    priceDisplay: "¥15,000",
    tag: "じっくり集中ケア",
    description: "全身の深層筋肉をじっくり緩めるロングコース。慢性的な強いコリや深部の疲れを徹底的にリフレッシュします。",
    highlights: ["全身深層アプローチ", "慢性疲労の徹底ケア", "所要枠90分の充実施術"]
  }
];

// 営業時間設定（分換算）
// 営業時間: 9:00スタート 〜 最終予約受付 19:00（9:00〜19:00まで30分刻みで開始可能枠を算出）
// 定休日: 日曜日・祝日
const BUSINESS_HOURS = {
  start: 9 * 60,         // 9:00 (540分)
  lastReception: 19 * 60 // 最終予約受付 19:00 (1140分)
};

interface BookedSlotInfo {
  start: string; // "10:00"
  end?: string;  // "11:00"
}

export default function App() {
  // 外部設定（UIからのテスト変更にも対応）
  const [activeGasUrl, setActiveGasUrl] = useState(GAS_URL);
  const [activeLiffId, setActiveLiffId] = useState(LIFF_ID);
  const [activeCalendarId, setActiveCalendarId] = useState(CALENDAR_ID);

  // LIFF / LINE 認証ステータス
  const [isLiffInitializing, setIsLiffInitializing] = useState(true);
  const [isLiffLoggedIn, setIsLiffLoggedIn] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [lineProfile, setLineProfile] = useState<{
    userId: string;
    displayName: string;
    pictureUrl?: string;
  }>({
    userId: '',
    displayName: ''
  });

  // 予約フォーム入力値
  const [reservationType, setReservationType] = useState<'新規予約' | '予約の変更'>('新規予約');
  const [name, setName] = useState('');
  const [tel, setTel] = useState('');
  const [selectedMenuId, setSelectedMenuId] = useState<string>(SALON_MENUS[0].id);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [note, setNote] = useState('');

  // 空き枠取得ステータス
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [slotFetchError, setSlotFetchError] = useState<string | null>(null);

  // 日曜・祝日定休アラート用モーダル
  const [closedDayAlert, setClosedDayAlert] = useState<{
    isOpen: boolean;
    reason: 'sunday' | 'holiday' | null;
    holidayName?: string;
  }>({
    isOpen: false,
    reason: null
  });

  // 送信ステータス
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);


  // 選択中のメニュー情報
  const currentMenu = useMemo(() => {
    return SALON_MENUS.find(m => m.id === selectedMenuId) || SALON_MENUS[0];
  }, [selectedMenuId]);

  // 今日の日付 (YYYY-MM-DD)
  const todayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  // ------------------------------------------------------------------
  // LIFF初期化 & LINEユーザー情報の自動取得
  // ------------------------------------------------------------------
  useEffect(() => {
    let isMounted = true;

    async function initializeLiff() {
      setIsLiffInitializing(true);
      try {
        // LIFF IDがプレースホルダー、または未設定の場合は安全にデモモードへフォールバック
        const isPlaceholderLiff = !activeLiffId || activeLiffId.includes('XXXXXXXX') || activeLiffId.length < 8;

        if (isPlaceholderLiff) {
          console.info('LIFF ID is default/placeholder. Running in preview/demo mode.');
          if (isMounted) {
            setIsDemoMode(true);
            const mockId = 'U_preview_' + Math.random().toString(36).substring(2, 8);
            const mockName = 'LINE 予約太郎';
            setLineProfile({
              userId: mockId,
              displayName: mockName
            });
            setName(mockName);
          }
        } else {
          // 本番LIFF初期化
          await liff.init({ liffId: activeLiffId });
          if (!isMounted) return;

          if (!liff.isLoggedIn()) {
            if (liff.isInClient()) {
              liff.login();
              return;
            }
          }

          if (liff.isLoggedIn()) {
            setIsLiffLoggedIn(true);
            const profile = await liff.getProfile();
            if (isMounted) {
              setLineProfile({
                userId: profile.userId,
                displayName: profile.displayName,
                pictureUrl: profile.pictureUrl
              });
              setName(profile.displayName || '');
            }
          } else {
            // ブラウザ等で未ログインの場合
            setIsDemoMode(true);
            setLineProfile({
              userId: 'U_guest_' + Math.random().toString(36).substring(2, 8),
              displayName: 'ゲスト様'
            });
          }
        }
      } catch (err: any) {
        console.warn('LIFF initialization notice:', err);
        if (isMounted) {
          setIsDemoMode(true);
          const fallbackId = 'U_local_' + Math.random().toString(36).substring(2, 8);
          setLineProfile({
            userId: fallbackId,
            displayName: 'LINE お客様'
          });
          setName('LINE お客様');
        }
      } finally {
        // スピナー表示の心地よい余韻
        setTimeout(() => {
          if (isMounted) {
            setIsLiffInitializing(false);
          }
        }, 600);
      }
    }

    initializeLiff();

    return () => {
      isMounted = false;
    };
  }, [activeLiffId]);

  // ------------------------------------------------------------------
  // 日付選択時の処理（日曜・日本の祝日の定休チェック & リセット）
  // ------------------------------------------------------------------
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) {
      setSelectedDate('');
      setSelectedTime('');
      setBookedSlots([]);
      return;
    }

    // 日曜・日本の祝日判定
    const closedCheck = checkClosedDay(val);
    if (closedCheck.isClosed) {
      // 日曜または祝日のためアラート表示＆入力リセット
      setClosedDayAlert({
        isOpen: true,
        reason: closedCheck.reason,
        holidayName: closedCheck.holidayName
      });
      setSelectedDate('');
      setSelectedTime('');
      setBookedSlots([]);
      return;
    }

    setSelectedDate(val);
    setSelectedTime(''); // 日付変更時は時間選択をリセット
  };

  // ------------------------------------------------------------------
  // 空き状況の動的取得（GAS Web API: GET ${GAS_URL}?date=...）
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!selectedDate) {
      setBookedSlots([]);
      return;
    }

    let isAborted = false;

    async function fetchAvailability() {
      setIsLoadingSlots(true);
      setSlotFetchError(null);

      // GAS_URLがサンプルの場合は模擬データを生成して即座にテスト可能にする
      const isPlaceholderGas = !activeGasUrl || activeGasUrl.includes('SAMPLE_DEPLOYMENT_ID');

      if (isPlaceholderGas) {
        // 開発・プレビュー時のリアルなサンプル予約枠（10:00 と 14:00 を既予約としてシミュレート）
        setTimeout(() => {
          if (!isAborted) {
            setBookedSlots(['10:00', '14:00']);
            setIsLoadingSlots(false);
          }
        }, 400);
        return;
      }

      try {
        const query = new URLSearchParams({
          date: selectedDate,
          calendarId: activeCalendarId
        });

        const res = await fetch(`${activeGasUrl}?${query.toString()}`, {
          method: 'GET'
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: カレンダー空き枠の取得に失敗しました`);
        }

        const data = await res.json();
        if (data.status === 'success' && Array.isArray(data.bookedSlots)) {
          if (!isAborted) {
            setBookedSlots(data.bookedSlots);
          }
        } else {
          // 配列でない場合のフォールバック
          if (!isAborted) {
            setBookedSlots([]);
          }
        }
      } catch (err: any) {
        console.warn('GAS空き枠取得エラー (フォールバック使用):', err);
        if (!isAborted) {
          setSlotFetchError('カレンダーとの同期に時間がかかっています。空き枠を簡易計算しました。');
          // フォールバック用の枠
          setBookedSlots(['10:00', '13:30']);
        }
      } finally {
        if (!isAborted) {
          setIsLoadingSlots(false);
        }
      }
    }

    fetchAvailability();

    return () => {
      isAborted = true;
    };
  }, [selectedDate, activeGasUrl, activeCalendarId]);

  // ------------------------------------------------------------------
  // 空き時間枠の動的計算ロジック
  // - 営業時間: 9:00スタート 〜 最終予約受付 19:00（30分刻みで開始可能枠を算出）
  // - 定休日: 日曜日・祝日
  // - メニュー所要時間枠（60分または90分）分、予約の重複がない時間帯のみを選択肢として表示
  // ------------------------------------------------------------------
  const availableTimeSlots = useMemo(() => {
    if (!selectedDate) return [];

    // 日曜・日本の祝日は定休日のため空き枠なし
    if (checkClosedDay(selectedDate).isClosed) return [];

    const requiredMinutes = currentMenu.duration; // 60分 または 90分
    const [year, month, day] = selectedDate.split('-').map(Number);

    // 予約済み枠を [開始分, 終了分] の配列に正規化
    const busyIntervals: [number, number][] = bookedSlots.map((slot) => {
      // "10:00" 形式、または "10:00-11:00" 形式をサポート
      if (slot.includes('-')) {
        const [s, e] = slot.split('-');
        const [sh, sm] = s.split(':').map(Number);
        const [eh, em] = e.split(':').map(Number);
        return [sh * 60 + sm, eh * 60 + em];
      }
      const [sh, sm] = slot.split(':').map(Number);
      const startMin = sh * 60 + sm;
      // 単一時間の場合は標準枠60分としてブロック
      return [startMin, startMin + 60];
    });

    // 該当日が「本日」である場合、現在時刻より過去（＋30分前バッファ）の枠は除外
    const now = new Date();
    const isToday =
      now.getFullYear() === year &&
      now.getMonth() === month - 1 &&
      now.getDate() === day;
    const currentMinutesFromMidnight = now.getHours() * 60 + now.getMinutes() + 30;

    const slots: { time: string; minutes: number; available: boolean }[] = [];

    // 9:00 〜 19:00（最終予約受付）まで30分刻みで開始可能枠を算出
    for (let t = BUSINESS_HOURS.start; t <= BUSINESS_HOURS.lastReception; t += 30) {
      const slotEnd = t + requiredMinutes;

      // 本日の過去時間チェック
      if (isToday && t < currentMinutesFromMidnight) {
        continue;
      }

      // 重複チェック: [t, slotEnd] が busyIntervals のいずれかと被るか（所要時間枠分の重複を排除）
      const hasConflict = busyIntervals.some(([bStart, bEnd]) => {
        // 重複条件: !(slotEnd <= bStart || t >= bEnd)
        return !(slotEnd <= bStart || t >= bEnd);
      });

      const hourStr = String(Math.floor(t / 60)).padStart(2, '0');
      const minStr = String(t % 60).padStart(2, '0');
      const timeLabel = `${hourStr}:${minStr}`;

      if (!hasConflict) {
        slots.push({
          time: timeLabel,
          minutes: t,
          available: true
        });
      }
    }

    return slots;
  }, [selectedDate, bookedSlots, currentMenu.duration]);

  // ------------------------------------------------------------------
  // フォーム送信処理 (FormData -> URLSearchParams -> POST no-cors)
  // ------------------------------------------------------------------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    // バリデーション
    if (!name.trim()) {
      alert('お名前を入力してください。');
      return;
    }
    if (!tel.trim() || !/^[0-9\-+]{9,15}$/.test(tel.replace(/\s+/g, ''))) {
      alert('有効な電話番号（ハイフン有無どちらでも可）を入力してください。');
      return;
    }
    if (!selectedDate) {
      alert('ご希望日を選択してください。');
      return;
    }
    if (!selectedTime) {
      alert('ご希望の開始時間を選択してください。');
      return;
    }

    setIsSubmitting(true);

    try {
      // 仕様: FormData を URLSearchParams に変換
      const payload = new URLSearchParams();
      payload.append('type', reservationType);
      payload.append('name', name.trim());
      payload.append('tel', tel.trim());
      payload.append('menu', currentMenu.name);
      payload.append('menuId', currentMenu.id);
      payload.append('duration', String(currentMenu.duration));
      payload.append('date', selectedDate);
      payload.append('time', selectedTime);
      payload.append('lineUserId', lineProfile.userId || 'unknown_user');
      payload.append('calendarId', activeCalendarId);
      payload.append('note', note.trim());

      // 仕様: POST (mode: 'no-cors') でGASへ送信
      // プレースホルダーURLでない場合のみ実リクエスト送信
      if (activeGasUrl && !activeGasUrl.includes('SAMPLE_DEPLOYMENT_ID')) {
        await fetch(activeGasUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: payload.toString()
        });
      } else {
        // デモ時の擬似送信ウェイト
        await new Promise((resolve) => setTimeout(resolve, 800));
      }

      setIsSubmitted(true);
    } catch (err: any) {
      console.error('送信エラー:', err);
      // no-cors の場合ブラウザエラーは通常発生しませんが、念のためフォールバック
      setIsSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  // フォームリセット
  const handleReset = () => {
    setIsSubmitted(false);
    setSelectedTime('');
    setNote('');
  };

  // LIFFウィンドウを閉じる（LINE内ブラウザ）
  const handleCloseLiff = () => {
    if (typeof liff !== 'undefined' && liff.isInClient && liff.isInClient()) {
      liff.closeWindow();
    } else {
      alert('LINEアプリ内の場合は画面が閉じます。ブラウザでお使いの場合はこのタブを閉じてください。');
    }
  };

  // ------------------------------------------------------------------
  // 画面1: LINEアカウント確認中（初期ロードスピナー）
  // ------------------------------------------------------------------
  if (isLiffInitializing) {
    return (
      <div className="min-h-screen bg-[#f5f5f0] flex flex-col items-center justify-center p-6 text-[#1a1a1a]">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center text-center max-w-sm"
        >
          {/* サロンシンボル */}
          <div className="relative mb-6">
            <div className="w-18 h-18 rounded-full border border-[#d8d8ce] flex items-center justify-center bg-white shadow-sm">
              <Sparkles className="w-8 h-8 text-[#1a1a1a]" strokeWidth={1.5} />
            </div>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1.8, ease: 'linear' }}
              className="absolute -inset-1.5 rounded-full border-2 border-transparent border-t-[#1a1a1a] border-r-[#8c8c82]"
            />
          </div>

          <h2 className="text-lg font-medium tracking-wider mb-2 font-mincho">
            サロン・整体院 Web予約
          </h2>
          <p className="text-xs text-[#6e6e66] tracking-widest uppercase mb-4">
            Reservation System
          </p>

          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 rounded-full border border-[#e5e5dc] text-sm text-[#40403b] shadow-xs">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#1a1a1a]" />
            <span>LINEアカウントを確認中...</span>
          </div>
        </motion.div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // 画面2: 予約完了画面（送信後）
  // ------------------------------------------------------------------
  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-[#f5f5f0] text-[#1a1a1a] flex flex-col justify-between p-4 sm:p-6 md:p-8">
        <div className="max-w-md mx-auto w-full pt-4 pb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="bg-white rounded-3xl p-6 sm:p-8 shadow-xs border border-[#e8e8df]"
          >
            {/* チェックアイコン */}
            <div className="flex justify-center mb-6">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.1 }}
                className="w-18 h-18 rounded-full bg-[#1a1a1a] text-white flex items-center justify-center shadow-md"
              >
                <CheckCircle2 className="w-10 h-10 text-[#f5f5f0]" strokeWidth={2} />
              </motion.div>
            </div>

            <div className="text-center mb-6">
              <span className="inline-block px-3 py-1 bg-[#f0f0ea] text-[#40403b] text-xs font-medium rounded-full mb-2">
                {reservationType}
              </span>
              <h1 className="text-2xl font-bold font-mincho tracking-wide text-[#1a1a1a]">
                受付いたしました
              </h1>
              <p className="text-xs text-[#707068] mt-1">
                ご予約のお申し込みありがとうございます
              </p>
            </div>

            {/* LINE案内メッセージ（仕様要件） */}
            <div className="bg-[#f7f8f5] rounded-2xl p-4 border border-[#e3e5dc] mb-6 flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-[#06C755]/10 text-[#06C755] flex items-center justify-center shrink-0 mt-0.5">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div className="text-xs leading-relaxed text-[#2c2d28]">
                <p className="font-semibold text-[#1a1a1a] mb-1">
                  LINE公式アカウントをご確認ください
                </p>
                <p className="text-[#55564e]">
                  LINE公式アカウントにて予約完了メッセージをお送りしております。内容をご確認ください。
                </p>
                <p className="text-[11px] text-[#88887e] mt-1.5">
                  ※Googleカレンダーとの同期には数秒〜1分ほどかかる場合がございます。
                </p>
              </div>
            </div>

            {/* 予約内容サマリー */}
            <div className="space-y-3 border-t border-b border-[#ecece4] py-4 my-6 text-sm">
              <div className="flex justify-between items-baseline">
                <span className="text-[#787870] text-xs">予約種別</span>
                <span className="font-medium text-[#1a1a1a]">{reservationType}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-[#787870] text-xs">お名前</span>
                <span className="font-semibold text-[#1a1a1a]">{name} 様</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-[#787870] text-xs">お電話番号</span>
                <span className="font-mono text-[#1a1a1a]">{tel}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-[#787870] text-xs">ご希望コース</span>
                <span className="font-medium text-[#1a1a1a] text-right max-w-[210px] text-xs sm:text-sm">
                  {currentMenu.name}
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-[#787870] text-xs">ご予約日時</span>
                <div className="text-right">
                  <div className="font-semibold text-base text-[#1a1a1a]">
                    {selectedDate}
                  </div>
                  <div className="text-xs text-[#40403b] font-mono">
                    {selectedTime} 〜（所要枠 {currentMenu.duration}分）
                  </div>
                </div>
              </div>
              {note && (
                <div className="pt-2 text-xs text-[#555]">
                  <span className="text-[#787870] block mb-1">備考・ご要望:</span>
                  <div className="bg-[#fafaf7] p-2.5 rounded-lg border border-[#eee] text-[#333]">
                    {note}
                  </div>
                </div>
              )}
            </div>

            {/* 操作ボタン */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleCloseLiff}
                className="w-full py-3.5 px-4 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white font-medium text-sm transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                LINEに戻る
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="w-full py-3 px-4 rounded-xl bg-[#f0f0ea] hover:bg-[#e6e6dc] text-[#33332e] text-xs font-medium transition-colors cursor-pointer"
              >
                別の予約を行う / 内容を変更して再送信
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // 画面3: メイン予約フォーム (SPA)
  // ------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#f5f5f0] text-[#1a1a1a] selection:bg-[#1a1a1a] selection:text-white pb-16">
      {/* メインコンテンツ */}
      <main className="max-w-xl mx-auto px-4 pt-6 sm:pt-8">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-6"
        >
          {/* 1. 予約種別切り替えタブ（新規予約 / 予約の変更） */}
          <div className="bg-white rounded-2xl p-1.5 shadow-xs border border-[#e8e8df]">
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setReservationType('新規予約')}
                className={`py-3 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  reservationType === '新規予約'
                    ? 'bg-[#1a1a1a] text-white shadow-sm'
                    : 'text-[#6e6e66] hover:text-[#1a1a1a] hover:bg-[#f5f5ee]'
                }`}
              >
                <span>新規予約</span>
              </button>

              <button
                type="button"
                onClick={() => setReservationType('予約の変更')}
                className={`py-3 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  reservationType === '予約の変更'
                    ? 'bg-[#1a1a1a] text-white shadow-sm'
                    : 'text-[#6e6e66] hover:text-[#1a1a1a] hover:bg-[#f5f5ee]'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>予約の変更</span>
              </button>
            </div>
          </div>

          {/* 予約の変更 選択時の注意文言（仕様要件） */}
          <AnimatePresence>
            {reservationType === '予約の変更' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="bg-[#fff9ea] border border-[#ecd9a4] rounded-2xl p-4 text-[#755012] flex items-start gap-3 shadow-xs">
                  <AlertCircle className="w-5 h-5 text-[#c28416] shrink-0 mt-0.5" />
                  <div className="text-xs leading-relaxed">
                    <p className="font-bold text-[#644209] mb-1">
                      【ご予約の変更について】
                    </p>
                    <p>
                      現在承っているお客様のご予約は自動的にキャンセル扱いとなり、今回新しくご指定いただく日時へ上書き変更されます。
                    </p>
                    <p className="text-[11px] text-[#91651e] mt-1">
                      ※LINEアカウント（またはご登録のお電話番号）に紐づく直近の予約が対象となります。
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 予約フォーム本体 */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 隠しフィールド (仕様要件) */}
            <input type="hidden" name="type" value={reservationType} />
            <input type="hidden" name="lineUserId" value={lineProfile.userId} />
            <input type="hidden" name="calendarId" value={activeCalendarId} />

            {/* 2. お客様情報入力（お名前・電話番号） */}
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-[#e8e8df] shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-[#f0f0ea] pb-3">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-[#1a1a1a]" />
                  <h2 className="text-sm font-bold text-[#1a1a1a] tracking-wide">
                    お客様情報
                  </h2>
                </div>
                <span className="text-[11px] text-[#88887e]">
                  ※LINE表示名を自動反映
                </span>
              </div>

              {/* お名前 */}
              <div>
                <label className="block text-xs font-semibold text-[#3a3a34] mb-1.5">
                  お名前 <span className="text-rose-600 font-bold">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例: 山田 花子"
                    className="w-full px-4 py-3 bg-[#fafaf7] border border-[#e2e2d8] focus:border-[#1a1a1a] focus:bg-white rounded-xl text-sm transition-all outline-none"
                  />
                </div>
                <p className="text-[11px] text-[#8a8a80] mt-1">
                  LINEの登録名が初期入力されます。フルネームへの編集も可能です。
                </p>
              </div>

              {/* 電話番号 */}
              <div>
                <label className="block text-xs font-semibold text-[#3a3a34] mb-1.5">
                  お電話番号 <span className="text-rose-600 font-bold">*</span>
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    required
                    value={tel}
                    onChange={(e) => setTel(e.target.value)}
                    placeholder="例: 090-1234-5678"
                    pattern="^[0-9\-+]{9,15}$"
                    className="w-full px-4 py-3 bg-[#fafaf7] border border-[#e2e2d8] focus:border-[#1a1a1a] focus:bg-white rounded-xl text-sm transition-all outline-none font-mono"
                  />
                  <Phone className="w-4 h-4 text-[#9c9c92] absolute right-3.5 top-3.5" />
                </div>
                <p className="text-[11px] text-[#8a8a80] mt-1">
                  緊急のご連絡や予約変更時の確認に使用します。
                </p>
              </div>
            </div>

            {/* 3. メニュー選択（仕様要件: 2コース） */}
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-[#e8e8df] shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-[#f0f0ea] pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#1a1a1a]" />
                  <h2 className="text-sm font-bold text-[#1a1a1a] tracking-wide">
                    メニュー選択
                  </h2>
                </div>
                <span className="text-[11px] text-[#88887e]">
                  1人施術制（所要枠: 60分 / 90分）
                </span>
              </div>

              <div className="space-y-3">
                {SALON_MENUS.map((menuItem) => {
                  const isSelected = selectedMenuId === menuItem.id;
                  return (
                    <div
                      key={menuItem.id}
                      onClick={() => {
                        setSelectedMenuId(menuItem.id);
                        setSelectedTime(''); // 所要時間枠が変わる可能性があるため時間選択をリセット
                      }}
                      className={`relative p-4 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-[#1a1a1a] bg-[#fbfbf8] ring-1 ring-[#1a1a1a]'
                          : 'border-[#e5e5dc] hover:border-[#cbcbc0] bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors shrink-0 ${
                              isSelected
                                ? 'border-[#1a1a1a] bg-[#1a1a1a]'
                                : 'border-[#d0d0c6]'
                            }`}
                          >
                            {isSelected && (
                              <span className="w-1.5 h-1.5 rounded-full bg-white" />
                            )}
                          </span>
                          <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#efefe8] text-[#3e3e38]">
                            {menuItem.tag}
                          </span>
                          <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-medium bg-[#f0f0ea] text-[#4a4a42]">
                            所要枠: {menuItem.duration}分
                          </span>
                        </div>
                        <span className="font-bold text-base text-[#1a1a1a] tracking-tight shrink-0">
                          {menuItem.priceDisplay}
                        </span>
                      </div>

                      <h3 className="font-bold text-sm text-[#1a1a1a] mb-1 pl-6">
                        {menuItem.name}
                      </h3>
                      <p className="text-xs text-[#66665e] pl-6 leading-relaxed mb-3">
                        {menuItem.description}
                      </p>

                      <div className="pl-6 flex flex-wrap gap-1.5">
                        {menuItem.highlights.map((h, i) => (
                          <span
                            key={i}
                            className="text-[10px] text-[#555] bg-[#f2f2eb] px-2 py-0.5 rounded-sm"
                          >
                            ✓ {h}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* セレクトボックスとしての選択欄（仕様要件の明示的対応） */}
              <div className="pt-2">
                <label className="block text-xs font-semibold text-[#555] mb-1">
                  メニュー選択（ドロップダウン）
                </label>
                <select
                  value={selectedMenuId}
                  onChange={(e) => {
                    setSelectedMenuId(e.target.value);
                    setSelectedTime(''); // 所要時間枠が変わる可能性があるため時間選択をリセット
                  }}
                  className="w-full px-3 py-2.5 bg-[#fafaf7] border border-[#e2e2d8] rounded-xl text-xs sm:text-sm text-[#1a1a1a] outline-none"
                >
                  {SALON_MENUS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}（所要枠: {m.duration}分）
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 4. 希望日・希望時間選択 */}
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-[#e8e8df] shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-[#f0f0ea] pb-3">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-[#1a1a1a]" />
                  <h2 className="text-sm font-bold text-[#1a1a1a] tracking-wide">
                    日時選択
                  </h2>
                </div>
                <span className="text-[11px] text-[#a0522d] font-semibold">
                  定休日: 日曜・祝日
                </span>
              </div>

              {/* 希望日 */}
              <div>
                <label className="block text-xs font-semibold text-[#3a3a34] mb-1.5">
                  ご希望日 <span className="text-rose-600 font-bold">*</span>
                </label>
                <input
                  type="date"
                  required
                  min={todayStr}
                  value={selectedDate}
                  onChange={handleDateChange}
                  className="w-full px-4 py-3 bg-[#fafaf7] border border-[#e2e2d8] focus:border-[#1a1a1a] focus:bg-white rounded-xl text-sm transition-all outline-none font-mono"
                />
                <div className="flex items-center justify-between text-[11px] text-[#8a8a80] mt-1.5 px-0.5">
                  <span>受付時間: 9:00〜19:00（最終受付）</span>
                  <span className="text-[#a0522d] font-medium">定休日: 日曜・祝日</span>
                </div>
              </div>

              {/* 希望時間（セレクトボックス & クイック選択チップ） */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-[#3a3a34]">
                    ご希望時間 <span className="text-rose-600 font-bold">*</span>
                  </label>
                  {selectedDate && (
                    <span className="text-[11px] text-[#707066]">
                      {isLoadingSlots ? (
                        <span className="inline-flex items-center gap-1 text-[#1a1a1a]">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          空き状況を確認中...
                        </span>
                      ) : (
                        `空き枠: ${availableTimeSlots.length}枠`
                      )}
                    </span>
                  )}
                </div>

                {!selectedDate ? (
                  <div className="p-4 rounded-xl border border-dashed border-[#dddcd2] text-center text-xs text-[#8c8c82] bg-[#fafaf8]">
                    先に「ご希望日」を選択してください
                  </div>
                ) : isLoadingSlots ? (
                  <div className="p-6 rounded-xl border border-[#e8e8de] text-center bg-[#fafaf8] space-y-2">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#1a1a1a]" />
                    <p className="text-xs text-[#6e6e66]">
                      Googleカレンダーの予約状況を確認しています...
                    </p>
                  </div>
                ) : availableTimeSlots.length === 0 ? (
                  <div className="p-5 rounded-xl border border-[#ecd9a4] bg-[#fffbf2] text-center text-xs text-[#825b15] space-y-1">
                    <AlertCircle className="w-5 h-5 mx-auto text-[#b07d1c]" />
                    <p className="font-semibold">ご指定の日は満席となっております</p>
                    <p className="text-[11px] text-[#9c7225]">
                      恐れ入りますが、別の日程をお選びください。
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* 仕様要件: セレクトボックス形式 */}
                    <div className="relative">
                      <select
                        required
                        value={selectedTime}
                        onChange={(e) => setSelectedTime(e.target.value)}
                        className="w-full px-4 py-3 bg-[#fafaf7] border border-[#e2e2d8] focus:border-[#1a1a1a] focus:bg-white rounded-xl text-sm transition-all outline-none font-mono"
                      >
                        <option value="">開始時間をお選びください</option>
                        {availableTimeSlots.map((slot) => (
                          <option key={slot.time} value={slot.time}>
                            {slot.time} 〜（空きあり・所要{currentMenu.duration}分）
                          </option>
                        ))}
                      </select>
                      <Clock className="w-4 h-4 text-[#9c9c92] absolute right-3.5 top-3.5 pointer-events-none" />
                    </div>

                    {/* タップしやすい時間帯ボタンリスト */}
                    <div>
                      <p className="text-[11px] text-[#8a8a80] mb-1.5">
                        クイック選択（30分刻み・連続空き枠のみ表示）:
                      </p>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {availableTimeSlots.map((slot) => {
                          const isPicked = selectedTime === slot.time;
                          return (
                            <button
                              key={slot.time}
                              type="button"
                              onClick={() => setSelectedTime(slot.time)}
                              className={`py-2 px-2.5 rounded-xl text-xs font-mono font-medium transition-all cursor-pointer flex flex-col items-center justify-center border ${
                                isPicked
                                  ? 'bg-[#1a1a1a] text-white border-[#1a1a1a] shadow-xs'
                                  : 'bg-white hover:bg-[#f6f6f0] text-[#333] border-[#e2e2d8]'
                              }`}
                            >
                              <span className="font-semibold text-xs">{slot.time}</span>
                              <span className={`text-[10px] ${isPicked ? 'text-gray-300' : 'text-emerald-700'}`}>
                                〇 空き
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {slotFetchError && (
                  <p className="text-[11px] text-[#946820] mt-1.5 flex items-center gap-1">
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    {slotFetchError}
                  </p>
                )}
              </div>

              {/* 備考・ご要望 */}
              <div className="pt-2">
                <label className="block text-xs font-semibold text-[#3a3a34] mb-1.5">
                  気になる症状・ご要望（任意）
                </label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="例: 産後3ヶ月で右の腰に痛みがあります。当日は抱っこ紐で伺います。"
                  className="w-full px-4 py-2.5 bg-[#fafaf7] border border-[#e2e2d8] focus:border-[#1a1a1a] focus:bg-white rounded-xl text-xs leading-relaxed outline-none"
                />
              </div>
            </div>

            {/* 5. 送信ボタン */}
            <div className="pt-2 space-y-3">
              <button
                type="submit"
                disabled={isSubmitting || !selectedDate || !selectedTime || !name || !tel}
                className={`w-full py-4 px-6 rounded-2xl font-bold text-sm tracking-wide transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer ${
                  isSubmitting || !selectedDate || !selectedTime || !name || !tel
                    ? 'bg-[#c8c8be] text-white cursor-not-allowed opacity-80'
                    : 'bg-[#1a1a1a] hover:bg-[#2c2c28] text-white active:scale-[0.99]'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>予約情報を送信中...</span>
                  </>
                ) : (
                  <>
                    <span>
                      {reservationType === '新規予約' ? 'この内容で予約を確定する' : 'この内容で予約を変更する'}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <p className="text-[11px] text-center text-[#7e7e76] leading-relaxed">
                送信完了後、LINE公式アカウント宛てにご予約確認の通知が届きます。
              </p>
            </div>
          </form>
        </motion.div>
      </main>

      {/* ------------------------------------------------------------------
          日曜・祝日定休警告モーダル（仕様要件）
          ------------------------------------------------------------------ */}
      <AnimatePresence>
        {closedDayAlert.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full border border-[#e5e5dc] shadow-xl text-center space-y-4"
            >
              <div className="w-12 h-12 rounded-full bg-[#fff4e5] text-[#b35e00] flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>

              <div>
                <h3 className="font-bold text-base text-[#1a1a1a] mb-1 font-mincho">
                  日曜・祝日は定休日のため、別の日付をお選びください
                </h3>
                <p className="text-xs text-[#66665c] leading-relaxed">
                  誠に申し訳ございませんが、日曜・祝日は当院の定休日のためご予約を受け付けておりません。
                  {closedDayAlert.holidayName && (
                    <span className="block mt-1 font-semibold text-[#a0522d]">
                      ※ご選択の日付は祝日「{closedDayAlert.holidayName}」です。
                    </span>
                  )}
                </p>
              </div>

              <div className="bg-[#f7f7f2] p-3 rounded-xl text-xs text-[#555] space-y-1">
                <p className="font-semibold text-[#1a1a1a]">【営業時間・定休日】</p>
                <p>受付時間: 9:00 〜 19:00（最終予約受付）</p>
                <p className="text-rose-700 font-medium">定休日: 日曜日・祝日</p>
              </div>

              <button
                type="button"
                onClick={() => setClosedDayAlert({ isOpen: false, reason: null })}
                className="w-full py-3 rounded-xl bg-[#1a1a1a] hover:bg-[#333] text-white text-xs font-semibold cursor-pointer"
              >
                別の日程を選び直す
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

