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
  RefreshCw,
  MessageSquare,
  ArrowRight,
  Sparkles,
  Info
} from 'lucide-react';
import { checkClosedDay } from './holiday-utils';

// ====================================================================
export const GAS_URL = "https://script.google.com/macros/s/AKfycbwLjyz1Y-KzVWdctaa_6_aOKC06N4ShPyv2XPZKGkSDATJywhXHsPISPoQeMKqk1Q0h/exec";
export const LIFF_ID = "2011886818-6xLhW2nd";
export const CALENDAR_ID = "watanabe@harumicho-seitai.com";

// ====================================================================
export interface SalonMenu {
  id: string;
  name: string;
  duration: number;
  treatmentMinutes: number; 
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

const BUSINESS_HOURS = {
  start: 9 * 60,         
  lastReception: 19 * 60 
};

export default function App() {
  const [activeGasUrl] = useState(GAS_URL);
  const [activeLiffId] = useState(LIFF_ID);
  const [activeCalendarId] = useState(CALENDAR_ID);

  const [isLiffInitializing, setIsLiffInitializing] = useState(true);
  const [lineProfile, setLineProfile] = useState<{ userId: string; displayName: string; }>({ userId: '', displayName: '' });

  const [reservationType, setReservationType] = useState<'新規予約' | '予約の変更'>('新規予約');
  const [name, setName] = useState('');
  const [tel, setTel] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [selectedMenuId, setSelectedMenuId] = useState<string>(SALON_MENUS[0].id);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [note, setNote] = useState('');

  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [rawEvents, setRawEvents] = useState<any[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [closedDayAlert, setClosedDayAlert] = useState<{ isOpen: boolean; reason: 'sunday' | 'holiday' | null; holidayName?: string; }>({ isOpen: false, reason: null });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const currentMenu = useMemo(() => SALON_MENUS.find(m => m.id === selectedMenuId) || SALON_MENUS[0], [selectedMenuId]);
  const isSecondVisitOrMore = selectedMenuId === 'regular_50min' || selectedMenuId === 'regular_80min';
  const requiresBirthDate = reservationType === '新規予約' && !isSecondVisitOrMore;

  const birthYearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let y = currentYear; y >= 1925; y--) {
      years.push(y);
    }
    return years;
  }, []);

  const birthDayOptions = useMemo(() => {
    const y = birthYear ? Number(birthYear) : 2000;
    const m = birthMonth ? Number(birthMonth) : 1;
    const maxDays = new Date(y, m, 0).getDate();
    return Array.from({ length: maxDays }, (_, idx) => idx + 1);
  }, [birthYear, birthMonth]);

  useEffect(() => {
    if (birthDay && Number(birthDay) > birthDayOptions.length) {
      setBirthDay('');
    }
  }, [birthDay, birthDayOptions.length]);

  const birthDate = useMemo(() => {
    if (!birthYear || !birthMonth || !birthDay) return '';
    return `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`;
  }, [birthYear, birthMonth, birthDay]);

  const birthDateDisplay = useMemo(() => {
    if (!birthYear || !birthMonth || !birthDay) return '';
    return `${birthYear}年${birthMonth}月${birthDay}日`;
  }, [birthYear, birthMonth, birthDay]);

  const todayStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function initializeLiff() {
      setIsLiffInitializing(true);
      try {
        await liff.init({ liffId: activeLiffId });
        if (!isMounted) return;
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          if (isMounted) {
            setLineProfile({ userId: profile.userId, displayName: profile.displayName });
            setName(profile.displayName || '');
          }
        }
      } catch (err) {
      } finally {
        setTimeout(() => { if (isMounted) setIsLiffInitializing(false); }, 600);
      }
    }
    initializeLiff();
    return () => { isMounted = false; };
  }, [activeLiffId]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) {
      setSelectedDate('');
      setSelectedTime('');
      setBookedSlots([]);
      setRawEvents([]);
      return;
    }
    const closedCheck = checkClosedDay(val);
    if (closedCheck.isClosed) {
      setClosedDayAlert({ isOpen: true, reason: closedCheck.reason, holidayName: closedCheck.holidayName });
      setSelectedDate('');
      setSelectedTime('');
      setBookedSlots([]);
      setRawEvents([]);
      return;
    }
    setSelectedDate(val);
    setSelectedTime('');
  };

  useEffect(() => {
    if (!selectedDate) {
      setBookedSlots([]);
      setRawEvents([]);
      return;
    }
    let isAborted = false;

    async function fetchAvailability() {
      setIsLoadingSlots(true);
      try {
        const query = new URLSearchParams({ date: selectedDate, calendarId: activeCalendarId });
        const res = await fetch(`${activeGasUrl}?${query.toString()}`);
        if (!res.ok) throw new Error('通信エラー');

        const data = await res.json();
        
        if (data.status === 'success') {
          if (!isAborted) {
            setRawEvents(Array.isArray(data.events) ? data.events : []);
            setBookedSlots(Array.isArray(data.bookedSlots) ? data.bookedSlots : []);
          }
        } else if (Array.isArray(data)) {
          if (!isAborted) {
            setRawEvents([]);
            setBookedSlots(data);
          }
        } else {
          if (!isAborted) {
            setRawEvents([]);
            setBookedSlots([]);
          }
        }
      } catch (err) {
        if (!isAborted) {
          setBookedSlots([]);
          setRawEvents([]);
        }
      } finally {
        if (!isAborted) setIsLoadingSlots(false);
      }
    }
    fetchAvailability();
    return () => { isAborted = true; };
  }, [selectedDate, activeGasUrl, activeCalendarId]);

  const availableTimeSlots = useMemo(() => {
    if (!selectedDate) return [];
    const slots = [];
    const requiredMins = currentMenu.duration;

    for (let m = BUSINESS_HOURS.start; m <= BUSINESS_HOURS.lastReception; m += 30) {
      let isAvailable = true;

      if (rawEvents && rawEvents.length > 0) {
        const slotStart = m;
        const slotEnd = m + requiredMins;

        for (let i = 0; i < rawEvents.length; i++) {
          const ev = rawEvents[i];
          if (ev.start && ev.end) {
            const [evStartH, evStartM] = ev.start.split(':').map(Number);
            const evStartMin = evStartH * 60 + evStartM;

            const [evEndH, evEndM] = ev.end.split(':').map(Number);
            const evEndMin = evEndH * 60 + evEndM;

            if (evStartMin < slotEnd && evEndMin > slotStart) {
              isAvailable = false;
              break;
            }
          }
        }
      } else {
        const requiredBlocks = Math.ceil(requiredMins / 30);
        for (let i = 0; i < requiredBlocks; i++) {
          const checkM = m + (i * 30);
          const hh = String(Math.floor(checkM / 60)).padStart(2, '0');
          const mm = String(checkM % 60).padStart(2, '0');
          const timeStr = `${hh}:${mm}`;
          if (bookedSlots.includes(timeStr)) {
            isAvailable = false;
            break;
          }
        }
      }

      if (isAvailable) {
        const startHH = String(Math.floor(m / 60)).padStart(2, '0');
        const startMM = String(m % 60).padStart(2, '0');
        slots.push(`${startHH}:${startMM}`);
      }
    }
    return slots;
  }, [selectedDate, bookedSlots, rawEvents, currentMenu.duration]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !tel || (requiresBirthDate && !birthDate) || !selectedDate || !selectedTime) return;
    setIsSubmitting(true);
    setSubmitError(null);

    const payload = {
      type: reservationType,
      name,
      tel,
      birthDate: requiresBirthDate ? birthDate : '',
      menu: currentMenu.name,
      duration: currentMenu.duration,
      date: selectedDate,
      time: selectedTime,
      note,
      lineUserId: lineProfile.userId,
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
        
        // 【追加】LINEトーク画面にお客様の発言として黄色い吹き出しを自動送信
        if (liff.isInClient()) {
          try {
            const messageText = [
              reservationType === '新規予約' ? `【ご予約お申し込み】` : `【ご予約変更お申し込み】`,
              `■お名前: ${name} 様`,
              `■LINE名: ${lineProfile.displayName || '取得不可'}`,
              ...(requiresBirthDate && birthDateDisplay ? [`■生年月日: ${birthDateDisplay}`] : []),
              `■希望日: ${selectedDate}`,
              `■開始時間: ${selectedTime}`,
              `■メニュー: ${currentMenu.name}`,
              `■電話番号: ${tel}`,
              `■その他ご要望:\n${note || '特になし'}`
            ].join('\n');

            await liff.sendMessages([
              {
                type: 'text',
                text: messageText
              }
            ]);
          } catch (e) {
            console.error('LINE送信エラー', e);
          }
        }

        setIsSubmitted(true);
      } else {
        throw new Error();
      }
    } catch (err) {
      setSubmitError("送信に失敗しました。もう一度お試しください。");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLiffInitializing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
        <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mb-3" />
        <p className="text-slate-600 font-medium text-sm">予約システムを準備中...</p>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-slate-50 py-10 px-4 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-150 p-6 md:p-8"
        >
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <h2 className="text-xl md:text-2xl font-bold text-slate-800 text-center mb-2">
            {reservationType === '新規予約' ? 'ご予約を送信しました' : '予約変更を送信しました'}
          </h2>
          <p className="text-slate-600 text-center text-sm mb-6 leading-relaxed">
            ご予約リクエストを受け付けました。<br />
            Googleカレンダーおよび公式LINEにて確認後、確定またはご連絡いたします。
          </p>

          <div className="bg-slate-50 rounded-xl p-4 md:p-5 border border-slate-200 text-sm space-y-3 mb-6">
            <div className="flex justify-between items-start border-b border-slate-200/80 pb-2.5">
              <span className="text-slate-500">予約区分</span>
              <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-xs border border-emerald-200">
                {reservationType}
              </span>
            </div>
            <div className="flex justify-between items-start border-b border-slate-200/80 pb-2.5">
              <span className="text-slate-500">お名前</span>
              <span className="font-semibold text-slate-800">{name} 様</span>
            </div>
            <div className="flex justify-between items-start border-b border-slate-200/80 pb-2.5">
              <span className="text-slate-500">お電話番号</span>
              <span className="font-semibold text-slate-800">{tel}</span>
            </div>
            {requiresBirthDate && birthDateDisplay && (
              <div className="flex justify-between items-start border-b border-slate-200/80 pb-2.5">
                <span className="text-slate-500">生年月日</span>
                <span className="font-semibold text-slate-800">{birthDateDisplay}</span>
              </div>
            )}
            <div className="flex justify-between items-start border-b border-slate-200/80 pb-2.5">
              <span className="text-slate-500">ご希望日時</span>
              <span className="font-semibold text-slate-800">{selectedDate} {selectedTime}〜</span>
            </div>
            <div className="flex flex-col border-b border-slate-200/80 pb-2.5">
              <div className="flex justify-between items-center mb-1">
                <span className="text-slate-500">選択コース</span>
                <span className="font-bold text-slate-900">{currentMenu.priceDisplay}</span>
              </div>
              <p className="font-medium text-slate-800">{currentMenu.name}</p>
              <span className="text-xs text-slate-500 mt-0.5">（所要時間枠: {currentMenu.duration}分）</span>
            </div>
            {note && (
              <div className="pt-1">
                <span className="text-slate-500 block mb-1 text-xs">ご要望・症状など</span>
                <p className="text-slate-700 whitespace-pre-wrap bg-white p-2.5 rounded-lg border border-slate-200 text-xs">
                  {note}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-3">
            {liff.isInClient() && (
              <button
                onClick={() => liff.closeWindow()}
                className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition shadow-md shadow-emerald-600/20 active:scale-[0.99]"
              >
                LINEに戻る
              </button>
            )}
            <button
              onClick={() => {
                setIsSubmitted(false);
                setSelectedDate('');
                setSelectedTime('');
                setNote('');
              }}
              className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition text-sm"
            >
              続けて別の予約を行う
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/80 py-6 px-3 sm:px-4 md:py-10">
      <div className="w-full max-w-xl mx-auto">
        {/* 予約区分タブ */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-1.5 flex gap-1 mb-4">
          <button
            type="button"
            onClick={() => setReservationType('新規予約')}
            className={`flex-1 py-2.5 text-center font-bold text-sm rounded-xl transition-all ${
              reservationType === '新規予約'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            新規予約
          </button>
          <button
            type="button"
            onClick={() => setReservationType('予約の変更')}
            className={`flex-1 py-2.5 text-center font-bold text-sm rounded-xl transition-all ${
              reservationType === '予約の変更'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            予約の変更
          </button>
        </div>

        {reservationType === '予約の変更' && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-800 flex items-start gap-2"
          >
            <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p>
              既存予約の変更や日時変更のご希望はこちらから送信してください。担当者が確認のうえ折り返しLINE等でご連絡いたします。
            </p>
          </motion.div>
        )}

        {submitError && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3.5 text-xs text-red-700 flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{submitError}</span>
          </motion.div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 md:p-7">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 1. お客様情報 */}
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
                <User className="w-4 h-4 text-emerald-600" />
                <span>お客様情報</span>
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    お名前 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例: 山田 花子"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    お電話番号 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={tel}
                    onChange={(e) => setTel(e.target.value)}
                    placeholder="例: 090-1234-5678"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition"
                  />
                </div>
                <AnimatePresence initial={false}>
                  {requiresBirthDate && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-1">
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-semibold text-slate-600">
                            生年月日 <span className="text-red-500">*</span>
                          </label>
                          <span className="text-[11px] text-emerald-700 font-medium">
                            初回のみ必須（2回目以降は不要）
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <select
                            required={requiresBirthDate}
                            value={birthYear}
                            onChange={(e) => setBirthYear(e.target.value)}
                            aria-label="生年"
                            className="w-full px-2.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition cursor-pointer"
                          >
                            <option value="">年</option>
                            {birthYearOptions.map((y) => (
                              <option key={y} value={String(y)}>
                                {y}年
                              </option>
                            ))}
                          </select>
                          <select
                            required={requiresBirthDate}
                            value={birthMonth}
                            onChange={(e) => setBirthMonth(e.target.value)}
                            aria-label="生月"
                            className="w-full px-2.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition cursor-pointer"
                          >
                            <option value="">月</option>
                            {Array.from({ length: 12 }, (_, idx) => idx + 1).map((m) => (
                              <option key={m} value={String(m)}>
                                {m}月
                              </option>
                            ))}
                          </select>
                          <select
                            required={requiresBirthDate}
                            value={birthDay}
                            onChange={(e) => setBirthDay(e.target.value)}
                            aria-label="生日"
                            className="w-full px-2.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition cursor-pointer"
                          >
                            <option value="">日</option>
                            {birthDayOptions.map((d) => (
                              <option key={d} value={String(d)}>
                                {d}日
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <hr className="border-slate-100" />

            {/* 2. メニュー選択 */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <span>メニュー選択</span>
                </h3>
                <span className="text-xs text-slate-500">全4コース</span>
              </div>

              {/* セレクトボックス */}
              <div className="mb-3">
                <select
                  value={selectedMenuId}
                  onChange={(e) => {
                    setSelectedMenuId(e.target.value);
                    setSelectedTime('');
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition cursor-pointer"
                >
                  {SALON_MENUS.map((menu) => (
                    <option key={menu.id} value={menu.id}>
                      {menu.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* カード一覧で詳細確認 */}
              <div className="space-y-2.5">
                {SALON_MENUS.map((menu) => {
                  const isSelected = menu.id === selectedMenuId;
                  return (
                    <div
                      key={menu.id}
                      onClick={() => {
                        setSelectedMenuId(menu.id);
                        setSelectedTime('');
                      }}
                      className={`cursor-pointer rounded-xl p-3.5 border transition-all text-left ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-50/40 ring-1 ring-emerald-600'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-slate-900">{menu.name}</span>
                          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                            {menu.tag}
                          </span>
                        </div>
                        <span className="font-bold text-slate-900 text-sm whitespace-nowrap">
                          {menu.priceDisplay}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed mb-2">
                        {menu.description}
                      </p>
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <div className="flex items-center gap-2">
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium">
                            施術 {menu.treatmentMinutes}分
                          </span>
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium">
                            所要時間枠: {menu.duration}分
                          </span>
                        </div>
                        {isSelected && (
                          <span className="text-emerald-700 font-semibold flex items-center gap-1">
                            選択中
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <hr className="border-slate-100" />

            {/* 3. 日付と空き枠 */}
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-2">
                <CalendarIcon className="w-4 h-4 text-emerald-600" />
                <span>ご希望日</span>
              </h3>
              <p className="text-xs text-slate-500 mb-2.5">
                営業時間: 9:00〜19:00（最終受付） / 定休日: 日曜・祝日
              </p>
              <input
                type="date"
                required
                min={todayStr}
                value={selectedDate}
                onChange={handleDateChange}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition"
              />
            </div>

            {/* 4. ご希望時間 */}
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-emerald-600" />
                <span>ご希望時間（30分刻み）</span>
              </h3>

              {!selectedDate && (
                <div className="text-xs text-slate-500 bg-slate-50 p-4 rounded-xl border border-dashed border-slate-200 text-center">
                  先に上記でご希望日を選択してください
                </div>
              )}

              {selectedDate && isLoadingSlots && (
                <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
                  <RefreshCw className="w-4 h-4 text-emerald-600 animate-spin" />
                  <span>空き枠を確認中...</span>
                </div>
              )}

              {selectedDate && !isLoadingSlots && availableTimeSlots.length === 0 && (
                <div className="text-xs text-amber-700 bg-amber-50 p-4 rounded-xl border border-amber-200 text-center leading-relaxed">
                  選択された日は所要枠（{currentMenu.duration}分）の空きがございません。<br />
                  恐れ入りますが別の日付をお選びください。
                </div>
              )}

              {selectedDate && !isLoadingSlots && availableTimeSlots.length > 0 && (
                <div>
                  <p className="text-[11px] text-slate-500 mb-2">
                    空き枠一覧（{currentMenu.duration}分枠が確保可能な開始時刻）:
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {availableTimeSlots.map((time) => {
                      const isSelected = selectedTime === time;
                      return (
                        <button
                          key={time}
                          type="button"
                          onClick={() => setSelectedTime(time)}
                          className={`py-2 px-1 text-center font-semibold text-xs rounded-lg transition-all border ${
                            isSelected
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/30'
                          }`}
                        >
                          {time}
                        </button>
                      );
                    })}
                  </div>
                  {selectedTime && (
                    <div className="mt-2.5 text-xs text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex items-center justify-between">
                      <span>選択した開始時間: {selectedTime}</span>
                      <span className="text-[11px] font-normal text-emerald-800">
                        （所要枠 {currentMenu.duration}分）
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <hr className="border-slate-100" />

            {/* 5. 備考・ご要望 */}
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-2">
                <MessageSquare className="w-4 h-4 text-emerald-600" />
                <span>ご要望・症状など（任意）</span>
              </h3>
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="痛む箇所やお悩み、気になる点がございましたらご記入ください。"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition"
              />
            </div>

            {/* 送信ボタン */}
            <button
              type="submit"
              disabled={!name || !tel || (requiresBirthDate && !birthDate) || !selectedDate || !selectedTime || isSubmitting}
              className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-sm ${
                !name || !tel || (requiresBirthDate && !birthDate) || !selectedDate || !selectedTime || isSubmitting
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-[0.99] shadow-emerald-600/20 shadow-md'
              }`}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>送信中...</span>
                </>
              ) : (
                <>
                  <span>{reservationType === '新規予約' ? '予約をリクエストする' : '予約変更をリクエストする'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* 日曜・祝日定休日アラートモーダル */}
      <AnimatePresence>
        {closedDayAlert.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 text-center"
            >
              <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-3">
                <AlertCircle className="w-7 h-7" />
              </div>
              <h4 className="text-base font-bold text-slate-800 mb-2">
                定休日のご案内
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed mb-5">
                {closedDayAlert.reason === 'holiday' && closedDayAlert.holidayName
                  ? `ご指定いただいた日は祝日（${closedDayAlert.holidayName}）のため定休日となっております。`
                  : '日曜・祝日は定休日のため、別の日付をお選びください。'}
              </p>
              <button
                type="button"
                onClick={() => setClosedDayAlert({ isOpen: false, reason: null })}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs transition"
              >
                了解しました
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}