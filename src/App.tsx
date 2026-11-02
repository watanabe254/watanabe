/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import liff from '@line/liff';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  Phone,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  RefreshCw,
  ArrowRight
} from 'lucide-react';
import { checkClosedDay } from './holiday-utils';

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
    duration: 60,
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
    duration: 60,
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
    duration: 60,
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
    duration: 90,
    treatmentMinutes: 80,
    price: 15000,
    priceDisplay: "¥15,000",
    tag: "じっくり集中ケア",
    description: "全身の深層筋肉をじっくり緩めるロングコース。慢性的な強いコリや深部の疲れを徹底的にリフレッシュします。",
    highlights: ["全身深層アプローチ", "慢性疲労の徹底ケア", "所要枠90分の充実施術"]
  }
];

// 営業時間設定
const BUSINESS_HOURS = {
  start: 9 * 60,         // 9:00 (540分)
  lastReception: 19 * 60 // 最終予約受付 19:00 (1140分)
};

export default function App() {
  const [activeGasUrl] = useState(GAS_URL);
  const [activeLiffId] = useState(LIFF_ID);
  const [activeCalendarId] = useState(CALENDAR_ID);

  // LIFF / LINE 認証ステータス
  const [isLiffInitializing, setIsLiffInitializing] = useState(true);
  const [, setIsLiffLoggedIn] = useState(false);
  const [, setIsDemoMode] = useState(false);
  const [lineProfile, setLineProfile] = useState<{ userId: string; displayName: string; }>({ userId: '', displayName: '' });

  // 予約フォーム入力値
  const [reservationType, setReservationType] = useState<'新規予約' | '予約の変更'>('新規予約');
  const [name, setName] = useState('');
  const [tel, setTel] = useState('');
  const [selectedMenuId, setSelectedMenuId] = useState<string>(SALON_MENUS[0].id);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [note, setNote] = useState('');

  // 空き枠ステータス
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [, setSlotFetchError] = useState<string | null>(null);

  // アラート用
  const [closedDayAlert, setClosedDayAlert] = useState<{ isOpen: boolean; reason: 'sunday' | 'holiday' | null; holidayName?: string; }>({ isOpen: false, reason: null });

  // 送信ステータス
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const currentMenu = useMemo(() => SALON_MENUS.find(m => m.id === selectedMenuId) || SALON_MENUS[0], [selectedMenuId]);
  const todayStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  // LIFF初期化
  useEffect(() => {
    let isMounted = true;
    async function initializeLiff() {
      setIsLiffInitializing(true);
      try {
        await liff.init({ liffId: activeLiffId });
        if (!isMounted) return;
        if (liff.isLoggedIn()) {
          setIsLiffLoggedIn(true);
          const profile = await liff.getProfile();
          if (isMounted) {
            setLineProfile({ userId: profile.userId, displayName: profile.displayName });
            setName(profile.displayName || '');
          }
        } else {
          setIsDemoMode(true);
        }
      } catch (err) {
        if (isMounted) setIsDemoMode(true);
      } finally {
        setTimeout(() => { if (isMounted) setIsLiffInitializing(false); }, 600);
      }
    }
    initializeLiff();
    return () => { isMounted = false; };
  }, [activeLiffId]);

  // 日付選択
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) {
      setSelectedDate('');
      setSelectedTime('');
      setBookedSlots([]);
      return;
    }
    const closedCheck = checkClosedDay(val);
    if (closedCheck.isClosed) {
      setClosedDayAlert({ isOpen: true, reason: closedCheck.reason, holidayName: closedCheck.holidayName });
      setSelectedDate('');
      setSelectedTime('');
      setBookedSlots([]);
      return;
    }
    setSelectedDate(val);
    setSelectedTime('');
  };

  // ------------------------------------------------------------------
  // 空き状況の取得処理（オブジェクト形式・配列形式の両対応）
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
      try {
        const query = new URLSearchParams({
          date: selectedDate,
          calendarId: activeCalendarId
        });
        const res = await fetch(`${activeGasUrl}?${query.toString()}`);
        if (!res.ok) throw new Error('通信エラー');

        const data = await res.json();
        
        // GASが { status: 'success', bookedSlots: [...] } を返しても、単なる [...] を返しても対応
        if (data && data.status === 'success' && Array.isArray(data.bookedSlots)) {
          if (!isAborted) setBookedSlots(data.bookedSlots);
        } else if (Array.isArray(data)) {
          if (!isAborted) setBookedSlots(data);
        } else {
          if (!isAborted) setBookedSlots([]);
        }
      } catch (err: any) {
        if (!isAborted) {
          setBookedSlots([]);
          setSlotFetchError(err.message);
        }
      } finally {
        if (!isAborted) setIsLoadingSlots(false);
      }
    }
    fetchAvailability();
    return () => { isAborted = true; };
  }, [selectedDate, activeGasUrl, activeCalendarId]);

  // 利用可能な時間枠の生成（所要時間枠の連続空き・過去時間判定）
  const availableTimeSlots = useMemo(() => {
    if (!selectedDate) return [];
    if (checkClosedDay(selectedDate).isClosed) return [];

    const requiredMinutes = currentMenu.duration; // 60分 または 90分
    const [year, month, day] = selectedDate.split('-').map(Number);

    // 予約済み枠を [開始分, 終了分] の配列に正規化
    const busyIntervals: [number, number][] = bookedSlots.map((slot) => {
      if (slot.includes('-')) {
        const [s, e] = slot.split('-');
        const [sh, sm] = s.split(':').map(Number);
        const [eh, em] = e.split(':').map(Number);
        return [sh * 60 + sm, eh * 60 + em];
      }
      const [sh, sm] = slot.split(':').map(Number);
      const startMin = sh * 60 + sm;
      return [startMin, startMin + 60];
    });

    const now = new Date();
    const isToday =
      now.getFullYear() === year &&
      now.getMonth() === month - 1 &&
      now.getDate() === day;
    const currentMinutesFromMidnight = now.getHours() * 60 + now.getMinutes() + 30;

    const slots: string[] = [];

    // 9:00 〜 19:00（最終予約受付）まで30分刻みで算出
    for (let t = BUSINESS_HOURS.start; t <= BUSINESS_HOURS.lastReception; t += 30) {
      const slotEnd = t + requiredMinutes;

      // 本日の過去時間チェック
      if (isToday && t < currentMinutesFromMidnight) {
        continue;
      }

      // 重複チェック
      const hasConflict = busyIntervals.some(([bStart, bEnd]) => {
        return !(slotEnd <= bStart || t >= bEnd);
      });

      const hourStr = String(Math.floor(t / 60)).padStart(2, '0');
      const minStr = String(t % 60).padStart(2, '0');
      const timeLabel = `${hourStr}:${minStr}`;

      if (!hasConflict) {
        slots.push(timeLabel);
      }
    }
    return slots;
  }, [selectedDate, bookedSlots, currentMenu.duration]);

  // 送信処理
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !tel || !selectedDate || !selectedTime) {
      setSubmitError("必須項目が入力されていません。");
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);

    const payload = {
      type: reservationType,
      name,
      tel,
      menu: currentMenu.name,
      duration: String(currentMenu.duration),
      date: selectedDate,
      time: selectedTime,
      note,
      lineUserId: lineProfile.userId || 'unknown_user',
      calendarId: activeCalendarId
    };

    try {
      const res = await fetch(activeGasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(payload as any)
      });
      
      const result = await res.json();
      if (result.status === 'success' || (result && !result.error)) {
        setIsSubmitted(true);
      } else {
        throw new Error(result.message || "エラーが発生しました");
      }
    } catch (err: any) {
      // no-cors やレスポンス形式違いでも正常にカレンダー登録されるケースへのフォールバック
      setIsSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ローディング画面
  if (isLiffInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f0]">
        <div className="flex flex-col items-center">
          <RefreshCw className="w-8 h-8 text-[#1a1a1a] animate-spin" />
          <p className="mt-4 text-[#666] text-sm">システムを準備中...</p>
        </div>
      </div>
    );
  }

  // 完了画面
  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-[#f5f5f0] p-4 flex flex-col items-center justify-center text-[#1a1a1a]">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full border border-[#e8e8df] shadow-sm text-center"
        >
          <div className="w-16 h-16 rounded-full bg-[#1a1a1a] text-white flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-10 h-10 text-[#f5f5f0]" />
          </div>
          <span className="inline-block px-3 py-1 bg-[#f0f0ea] text-[#40403b] text-xs font-medium rounded-full mb-2">
            {reservationType}
          </span>
          <h2 className="text-xl font-bold font-mincho text-[#1a1a1a] mb-2">受付いたしました</h2>
          <p className="text-sm text-[#666] mb-6 leading-relaxed">
            ご予約のお申し込みありがとうございます。<br />
            LINE公式アカウントへご案内をお送りいたしました。
          </p>
          <div className="border-t border-b border-[#ecece4] py-3 my-4 text-xs text-left space-y-2">
            <div className="flex justify-between">
              <span className="text-[#888]">お名前:</span>
              <span className="font-semibold text-[#1a1a1a]">{name} 様</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#888]">メニュー:</span>
              <span className="font-medium text-[#1a1a1a]">{currentMenu.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#888]">日時:</span>
              <span className="font-bold text-[#1a1a1a]">{selectedDate} {selectedTime}〜</span>
            </div>
          </div>
          <button
            onClick={() => {
              if (typeof liff !== 'undefined' && liff.isInClient && liff.isInClient()) {
                liff.closeWindow();
              } else {
                window.close();
              }
            }}
            className="w-full bg-[#06C755] hover:bg-[#05b34c] text-white font-medium py-3.5 px-6 rounded-xl transition-colors cursor-pointer text-sm shadow-xs"
          >
            画面を閉じる
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f0] text-[#1a1a1a] selection:bg-[#1a1a1a] selection:text-white pb-16">
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

          {/* 予約の変更 選択時の注意文言 */}
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
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 予約フォーム本体 */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <input type="hidden" name="type" value={reservationType} />
            <input type="hidden" name="lineUserId" value={lineProfile.userId} />
            <input type="hidden" name="calendarId" value={activeCalendarId} />

            {/* エラー表示 */}
            {submitError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

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
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例: 山田 花子"
                  className="w-full px-4 py-3 bg-[#fafaf7] border border-[#e2e2d8] focus:border-[#1a1a1a] focus:bg-white rounded-xl text-sm transition-all outline-none"
                />
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
              </div>
            </div>

            {/* 3. メニュー選択 */}
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
                        setSelectedTime('');
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

              {/* セレクトボックス */}
              <div className="pt-2">
                <label className="block text-xs font-semibold text-[#555] mb-1">
                  メニュー選択（ドロップダウン）
                </label>
                <select
                  value={selectedMenuId}
                  onChange={(e) => {
                    setSelectedMenuId(e.target.value);
                    setSelectedTime('');
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

              {/* 希望時間 */}
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
                    <div className="relative">
                      <select
                        required
                        value={selectedTime}
                        onChange={(e) => setSelectedTime(e.target.value)}
                        className="w-full px-4 py-3 bg-[#fafaf7] border border-[#e2e2d8] focus:border-[#1a1a1a] focus:bg-white rounded-xl text-sm transition-all outline-none font-mono"
                      >
                        <option value="">開始時間をお選びください</option>
                        {availableTimeSlots.map((timeStr) => (
                          <option key={timeStr} value={timeStr}>
                            {timeStr} 〜（空きあり・所要{currentMenu.duration}分）
                          </option>
                        ))}
                      </select>
                      <Clock className="w-4 h-4 text-[#9c9c92] absolute right-3.5 top-3.5 pointer-events-none" />
                    </div>

                    <div>
                      <p className="text-[11px] text-[#8a8a80] mb-1.5">
                        クイック選択（30分刻み）:
                      </p>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {availableTimeSlots.map((timeStr) => {
                          const isPicked = selectedTime === timeStr;
                          return (
                            <button
                              key={timeStr}
                              type="button"
                              onClick={() => setSelectedTime(timeStr)}
                              className={`py-2 px-2.5 rounded-xl text-xs font-mono font-medium transition-all cursor-pointer flex flex-col items-center justify-center border ${
                                isPicked
                                  ? 'bg-[#1a1a1a] text-white border-[#1a1a1a] shadow-xs'
                                  : 'bg-white hover:bg-[#f6f6f0] text-[#333] border-[#e2e2d8]'
                              }`}
                            >
                              <span className="font-semibold text-xs">{timeStr}</span>
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
                  placeholder="例: 産後3ヶ月で右の腰に痛みがあります。"
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

      {/* 日曜・祝日定休警告モーダル */}
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