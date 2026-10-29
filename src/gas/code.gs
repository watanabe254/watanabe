/**
 * ====================================================================
 * サロン・整体院向け Google Apps Script (GAS) 連携スクリプト
 * LINE公式アカウント & Googleカレンダー 予約システム用
 * ====================================================================
 * 
 * 【初期設定手順】
 * 1. Googleドライブから「新規」>「その他」>「Google Apps Script」を開きます。
 * 2. 本コードをすべてコピー＆ペーストして保存します。
 * 3. 必要に応じて「プロジェクトの設定」>「スクリプト プロパティ」に以下を登録します（任意）：
 *    - LINE_CHANNEL_ACCESS_TOKEN: LINE Messaging APIのチャネルアクセストークン（予約完了時にLINE自動返信する場合）
 * 4. 画面右上の「デプロイ」>「新しいデプロイ」をクリックします。
 * 5. 種類の選択:「ウェブアプリ」
 *    - 説明: 予約システムAPI v1
 *    - 次のユーザーとして実行: 自分（オーナーのアカウント）
 *    - アクセスできるユーザー: 「全員 (Anyone)」 ← ※必ず「全員」を選択してください！
 * 6. 発行された「ウェブアプリのURL」（https://script.google.com/macros/s/xxxx/exec）を
 *    React側の `GAS_URL` に設定します。
 */

// デフォルトのカレンダーID（パラメータで渡されない場合のフォールバック）
const DEFAULT_CALENDAR_ID = 'watanabe@harumicho-seitai.com';

/**
 * ------------------------------------------------------------------
 * 1. GET リクエスト処理：指定日の空き枠・予約済み時間帯を取得
 * ------------------------------------------------------------------
 * URL例: https://script.google.com/macros/s/.../exec?date=2026-10-25&calendarId=xxxx
 */
function doGet(e) {
  try {
    const params = e ? e.parameter : {};
    const dateStr = params.date; // 形式: "YYYY-MM-DD"
    const calendarId = params.calendarId || DEFAULT_CALENDAR_ID;

    if (!dateStr) {
      return createJsonResponse({
        status: 'error',
        message: 'パラメータ "date" (YYYY-MM-DD) が必要です。',
        bookedSlots: []
      });
    }

    const calendar = CalendarApp.getCalendarById(calendarId) || CalendarApp.getDefaultCalendar();
    if (!calendar) {
      return createJsonResponse({
        status: 'error',
        message: '指定されたカレンダーが見つかりませんでした: ' + calendarId,
        bookedSlots: []
      });
    }

    // 日本時間基準で該当日 00:00:00 〜 23:59:59 を設定
    const parts = dateStr.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);

    const startTime = new Date(year, month, day, 0, 0, 0);
    const endTime = new Date(year, month, day, 23, 59, 59);

    // カレンダーから既存イベントを取得（終日イベントを除く）
    const events = calendar.getEvents(startTime, endTime);
    const bookedSlots = [];
    const eventDetails = [];

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (ev.isAllDayEvent()) continue;

      const evStart = ev.getStartTime();
      const evEnd = ev.getEndTime();

      // "HH:mm" 形式にフォーマット
      const startStr = Utilities.formatDate(evStart, 'Asia/Tokyo', 'HH:mm');
      const endStr = Utilities.formatDate(evEnd, 'Asia/Tokyo', 'HH:mm');

      bookedSlots.push(startStr);
      eventDetails.push({
        title: ev.getTitle(),
        start: startStr,
        end: endStr,
        startTimestamp: evStart.getTime(),
        endTimestamp: evEnd.getTime()
      });
    }

    return createJsonResponse({
      status: 'success',
      date: dateStr,
      bookedSlots: bookedSlots,
      events: eventDetails
    });

  } catch (error) {
    return createJsonResponse({
      status: 'error',
      message: error.toString(),
      bookedSlots: []
    });
  }
}

/**
 * ------------------------------------------------------------------
 * 2. POST リクエスト処理：新規予約または予約変更をGoogleカレンダーに登録
 * ------------------------------------------------------------------
 */
function doPost(e) {
  try {
    let params = {};
    if (e && e.parameter && Object.keys(e.parameter).length > 0) {
      params = e.parameter;
    } else if (e && e.postData && e.postData.contents) {
      try {
        params = JSON.parse(e.postData.contents);
      } catch (err) {
        // URL-encoded fallback
        const raw = e.postData.contents;
        const pairs = raw.split('&');
        for (let i = 0; i < pairs.length; i++) {
          const kv = pairs[i].split('=');
          if (kv.length === 2) {
            params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1].replace(/\+/g, ' '));
          }
        }
      }
    }

    const type = params.type || '新規予約'; // '新規予約' or '予約の変更'
    const name = params.name || 'お客様';
    const tel = params.tel || '';
    const menu = params.menu || '整体コース';
    const duration = parseInt(params.duration, 10) || 60; // 所要時間枠 (分)
    const dateStr = params.date; // "YYYY-MM-DD"
    const timeStr = params.time; // "HH:mm"
    const lineUserId = params.lineUserId || '';
    const calendarId = params.calendarId || DEFAULT_CALENDAR_ID;
    const note = params.note || '';

    if (!dateStr || !timeStr) {
      return createJsonResponse({
        status: 'error',
        message: '日付と時間が指定されていません。'
      });
    }

    const calendar = CalendarApp.getCalendarById(calendarId) || CalendarApp.getDefaultCalendar();
    if (!calendar) {
      return createJsonResponse({
        status: 'error',
        message: 'Googleカレンダーが見つかりません: ' + calendarId
      });
    }

    // 日時オブジェクトの生成 (Asia/Tokyo)
    const dateParts = dateStr.split('-');
    const timeParts = timeStr.split(':');
    const startYear = parseInt(dateParts[0], 10);
    const startMonth = parseInt(dateParts[1], 10) - 1;
    const startDay = parseInt(dateParts[2], 10);
    const startHour = parseInt(timeParts[0], 10);
    const startMin = parseInt(timeParts[1], 10);

    const startDateTime = new Date(startYear, startMonth, startDay, startHour, startMin, 0);
    const endDateTime = new Date(startDateTime.getTime() + duration * 60 * 1000);

    // 【予約の変更】の場合、既存の予約を検索してキャンセル（削除）
    let canceledExistingCount = 0;
    if (type === '予約の変更' && lineUserId) {
      // 本日以降の未来のイベントから、該当LINE User IDまたは電話番号を含むものを検索
      const now = new Date();
      const futureLimit = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90日後まで
      const upcomingEvents = calendar.getEvents(now, futureLimit);

      for (let j = 0; j < upcomingEvents.length; j++) {
        const ev = upcomingEvents[j];
        const desc = ev.getDescription() || '';
        if (desc.indexOf(lineUserId) !== -1 || (tel && desc.indexOf(tel) !== -1)) {
          // 既存予約を削除（またはタイトルに【キャンセル済】と追記でも可）
          ev.deleteEvent();
          canceledExistingCount++;
        }
      }
    }

    // Googleカレンダーへイベント新規作成
    const eventTitle = `【${type}】${name}様（${menu}）`;
    const eventDescription = [
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `【${type}】サロン・整体院 Web予約`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `■ お名前: ${name} 様`,
      `■ お電話番号: ${tel}`,
      `■ ご希望メニュー: ${menu}`,
      `■ 所要枠: ${duration}分`,
      `■ ご予約日時: ${dateStr} ${timeStr} 〜 ${Utilities.formatDate(endDateTime, 'Asia/Tokyo', 'HH:mm')}`,
      `■ 予約種別: ${type}`,
      `■ LINE User ID: ${lineUserId}`,
      note ? `■ ご要望・症状メモ: ${note}` : `■ 備考: なし`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `※ 本予約はWeb予約システムより自動登録されました。`
    ].join('\n');

    const createdEvent = calendar.createEvent(eventTitle, startDateTime, endDateTime, {
      description: eventDescription
    });

    // オプション：LINE Messaging API が設定されている場合はプッシュ通知を送信
    sendLinePushNotification(lineUserId, {
      type: type,
      name: name,
      menu: menu,
      date: dateStr,
      time: timeStr,
      duration: duration
    });

    return createJsonResponse({
      status: 'success',
      message: '予約が正常に完了しました。',
      eventId: createdEvent.getId(),
      type: type,
      date: dateStr,
      time: timeStr,
      canceledPreviousCount: canceledExistingCount
    });

  } catch (error) {
    return createJsonResponse({
      status: 'error',
      message: '予約登録中にエラーが発生しました: ' + error.toString()
    });
  }
}

/**
 * 共通レスポンス生成ユーティリティ（CORS対応）
 */
function createJsonResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

/**
 * LINE公式アカウントへの自動プッシュ通知送信（任意）
 */
function sendLinePushNotification(userId, info) {
  if (!userId) return;

  const scriptProperties = PropertiesService.getScriptProperties();
  const token = scriptProperties.getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  if (!token) {
    // トークン未設定の場合はスキップ
    return;
  }

  const messageText = [
    `【ご予約${info.type === '予約の変更' ? '変更' : '完了'}のお知らせ】`,
    ``,
    `${info.name} 様`,
    `当院のご予約を承りました。以下の内容をご確認ください。`,
    ``,
    `■ ご予約日時: ${info.date} ${info.time}〜`,
    `■ コース: ${info.menu}`,
    `■ 所要時間枠: ${info.duration}分`,
    ``,
    `当日はご予約時間の5分前を目安にお越しください。`,
    `ご来院を心よりお待ち申し上げております。`
  ].join('\n');

  const payload = {
    to: userId,
    messages: [
      {
        type: 'text',
        text: messageText
      }
    ]
  };

  try {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (err) {
    Logger.log('LINEプッシュ通知エラー: ' + err.toString());
  }
}
