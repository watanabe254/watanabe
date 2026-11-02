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
  Info,
  MessageSquare,
  ArrowRight
} from 'lucide-react';
import { checkClosedDay } from './holiday-utils';

// ====================================================================
// 1. 外部設定定数
// ====================================================================
export const GAS_URL = "https://script.google.com/macros/s/AKfycbzi5gwqE1A5XWJfqTEOCLdgVoZllN5ev8XiRLVWUNGKUHx1VEs78eg2yTKDmdnUVCab/exec";
export const LIFF_ID = "2011886818-6xLhW2nd";
export const CALENDAR_ID = "watanabe@harumicho-seitai.com";

// ====================================================================
// 2. メニュー構成
// ====================================================================
export interface SalonMenu {
  id: string;
  name: string;
  duration: number; // カレンダー所要時間枠: 60分 / 90分
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
  start: 9 * 60,         // 9:00 
  lastReception: 19 * 60 // 最終予約受付 19:00 
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
  const [selectedMenuId, setSelectedMenuId] = useState<string>(SALON_MENUS[0].id);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [note, setNote] = useState('');

  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [rawEvents, setRawEvents] = useState<any[]>([]); // 分単位計算用の詳細データ
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [closedDayAlert, setClosedDayAlert] = useState<{ isOpen: boolean; reason: 'sunday' | 'holiday' | null; holidayName?: string; }>({ isOpen: false, reason: null });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const currentMenu = useMemo(() => SALON_MENUS.find(m => m.id === selectedMenuId) || SALON_MENUS[0], [selectedMenuId]);
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

  // 【最重要】分単位での空き枠判定ロジック
  const availableTimeSlots = useMemo(() => {
    if (!selectedDate) return [];
    const slots = [];
    const requiredMins = currentMenu.duration; // メニューの所要時間（60または90）

    for (let m = BUSINESS_HOURS.start; m <= BUSINESS_HOURS.lastReception; m += 30) {
      let isAvailable = true;

      // パターンA：GASから予定の詳細な開始・終了時間が届いている場合（分単位で正確に判定）
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

            // 予定の開始が「枠の終了」より前であり、かつ予定の終了が「枠の開始」より後である場合＝重複（予約不可）
            if (evStartMin < slotEnd && evEndMin > slotStart) {
              isAvailable = false;
              break;
            }
          }
        }
      } 
      // パターンB：配列のみ届いている場合の代替判定（30分ブロックチェック）
      else {
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
    if (!name || !tel || !selectedDate || !selectedTime) return;
    setIsSubmitting(true);
    setSubmitError(null);

    const payload = {
      type: reservationType,
      name,
      tel,
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />