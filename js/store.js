/* ===========================================================
   轻声 LightTodo · 数据层（状态 / 持久化 / 统计 / 种子数据）
   =========================================================== */
(function () {
  'use strict';

  const KEY = 'campus_todo_v1';
  const MIN = 60000;
  const HOUR = 3600000;
  const DAY = 86400000;

  /* ---------------------------- 时间与格式化工具 ---------------------------- */
  const U = {
    MIN, HOUR, DAY,
    uid(prefix) {
      return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
    },
    clamp(v, a, b) { return Math.min(b, Math.max(a, v)); },
    pad(n) { return String(n).padStart(2, '0'); },
    startOfDay(ts) {
      const d = new Date(ts);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    },
    dayKey(ts) {
      const d = new Date(ts);
      return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate());
    },
    isSameDay(a, b) { return U.dayKey(a) === U.dayKey(b); },
    hm(ts) { const d = new Date(ts); return U.pad(d.getHours()) + ':' + U.pad(d.getMinutes()); },
    weekdayCn(ts) { return '日一二三四五六'[new Date(ts).getDay()]; },
    dateCn(ts) {
      const d = new Date(ts);
      return (d.getMonth() + 1) + '月' + d.getDate() + '日';
    },
    /** 今天 10:00 / 明天 09:00 / 周三 19:00 / 11月20日 08:00 */
    fmtDue(ts, withTime) {
      if (!ts) return '未设置时间';
      const today = U.startOfDay(Date.now());
      const d = U.startOfDay(ts);
      const diff = Math.round((d - today) / DAY);
      const time = withTime === false ? '' : ' ' + U.hm(ts);
      if (diff === 0) return '今天' + time;
      if (diff === 1) return '明天' + time;
      if (diff === 2) return '后天' + time;
      if (diff === -1) return '昨天' + time;
      if (diff > 2 && diff < 7) return '周' + U.weekdayCn(ts) + time;
      if (diff < 0) return U.dateCn(ts) + time;
      return U.dateCn(ts) + time;
    },
    /** 距离目标时间的自然语言描述 */
    leftText(ts) {
      const d = ts - Date.now();
      const abs = Math.abs(d);
      let text;
      if (abs < MIN) text = '不到 1 分钟';
      else if (abs < HOUR) text = Math.round(abs / MIN) + ' 分钟';
      else if (abs < DAY) {
        const h = Math.floor(abs / HOUR);
        const m = Math.round((abs % HOUR) / MIN);
        text = h + ' 小时' + (m ? ' ' + m + ' 分钟' : '');
      } else text = Math.round(abs / DAY) + ' 天';
      return d >= 0 ? '还有 ' + text : '已超时 ' + text;
    },
    /** 转为 datetime-local 输入需要的字符串 */
    toLocalInput(ts) {
      const d = new Date(ts);
      return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate()) +
        'T' + U.pad(d.getHours()) + ':' + U.pad(d.getMinutes());
    },
    fromLocalInput(v) {
      const ts = new Date(v).getTime();
      return isNaN(ts) ? null : ts;
    },
    nextTimeInDay(ts, dayOffset, hour, minute) {
      return U.startOfDay(ts) + dayOffset * DAY + hour * HOUR + (minute || 0) * MIN;
    },
    esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
  };
  window.U = U;

  /* ---------------------------- 默认设置 ---------------------------- */
  const DEFAULT_SETTINGS = {
    persona: 'gentle',
    voiceOn: true,
    soundOn: true,
    dnd: { on: true, start: '23:00', end: '07:00', allowUrgent: true },
    alarmFallback: true,
    defaultPre: [10],
    followUpMin: 15,
    followUpMax: 3,
    customLines: { greet: '', suffix: '' },
    // 助手档案：ID（名字）/ 头像（emoji）/ 照片 / 性格，留空则用人设默认
    assistant: { name: '', avatar: '', photo: '', personality: '' },
    onboarded: false,
    widgetOn: true,
    ignoreGuide: true
  };

  const REPEAT_LABEL = {
    none: '不重复',
    daily: '每天',
    workday: '工作日',
    weekly: '每周',
    monthly: '每月'
  };

  function taskDefaults(patch) {
    const now = Date.now();
    return Object.assign({
      id: U.uid('t'),
      title: '',
      note: '',
      rawText: '',
      dueAt: null,
      repeat: 'none',
      repeatDays: [],
      pre: [10],
      followUp: { min: 15, max: 3 },
      tone: 'gentle',
      priority: 'normal',
      paused: false,
      breakDnd: false,
      voice: true,
      status: 'pending',
      createdAt: now,
      doneAt: null,
      snoozeCount: 0,
      ignoreCount: 0,
      fired: { pre: [], onTime: 0, followUp: 0 },
      nextFollowAt: 0,
      source: 'chat',
      isDemo: false
    }, patch || {});
  }

  /* ---------------------------- 种子数据 ---------------------------- */
  function seed() {
    const t0 = U.startOfDay(Date.now());
    const now = Date.now();
    const tasks = [
      taskDefaults({
        title: '高数作业 5.3 节',
        rawText: '明天上午十点提醒我交高数作业，语气温柔点',
        dueAt: t0 + DAY + 10 * HOUR,
        tone: 'gentle',
        pre: [30, 10],
        source: 'chat'
      }),
      taskDefaults({
        title: '英语打卡 30 分钟',
        rawText: '每天晚上八点提醒我英语打卡',
        dueAt: t0 + 20 * HOUR > now ? t0 + 20 * HOUR : t0 + DAY + 20 * HOUR,
        repeat: 'daily',
        tone: 'playful',
        pre: [5],
        source: 'chat'
      }),
      taskDefaults({
        title: '班会（A301 教室）',
        rawText: '后天晚上七点班会，这事很紧急必须提醒我',
        dueAt: t0 + 2 * DAY + 19 * HOUR,
        priority: 'urgent',
        tone: 'sharp',
        pre: [60, 15],
        breakDnd: true,
        source: 'chat'
      }),
      taskDefaults({
        title: '近代史读书笔记',
        rawText: '三天后下午三点前写完近代史读书笔记',
        dueAt: t0 + 3 * DAY + 15 * HOUR,
        tone: 'minimal',
        pre: [10],
        source: 'chat'
      })
    ];

    const messages = [
      {
        id: U.uid('m'),
        role: 'bot',
        text: '嗨，我是小满 🌱 你把要做的事直接说给我听，时间、重复、提醒语气我都会记下来。',
        chips: ['明天十点提醒我交高数作业', '每天晚上八点提醒我背单词', '后天班会很重要，别忘了'],
        at: now - 1000 * 60 * 3
      },
      {
        id: U.uid('m'),
        role: 'bot',
        text: '不用填表，像发消息一样告诉我就行～ 想看看我怎么做事的，可以点下面的示范指令。',
        chips: [],
        at: now - 1000 * 60 * 2
      }
    ];

    return {
      version: 2,
      createdAt: now,
      settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
      tasks,
      messages,
      silentQueue: []
    };
  }

  /* 旧版演示数据清理（version 1 → 2）：
     早期种子预置了 5 条「已完成」历史任务，只为给复盘页凑演示数据，导致新用户完成率不是 0%；
     另有 1 条过期任务和硬编码的「从系统日历导入」假日程。这里按精确特征一次性清掉，不动用户自己建的任务。 */
  const LEGACY_DONE_TITLES = ['线性代数习题 3.2', '物理实验报告初稿', '社团例会', '四级单词 50 个', '体育校园跑打卡'];

  function migrate(data) {
    if ((data.version || 1) >= 2) return data;
    const before = (data.tasks || []).length;
    data.tasks = (data.tasks || []).filter(function (t) {
      if (t.source === 'calendar' && t.rawText === '从系统日历导入') return false;
      if (LEGACY_DONE_TITLES.indexOf(t.title) >= 0 && !t.rawText) return false;
      if (t.rawText === '昨天下午四点提醒我提交选课确认') return false;
      return true;
    });
    data.version = 2;
    if (before !== data.tasks.length) {
      console.info('[store] 已清理 ' + (before - data.tasks.length) + ' 条旧版演示数据');
    }
    return data;
  }

  function normalize(data) {
    data.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings || {});
    data.settings.dnd = Object.assign({}, DEFAULT_SETTINGS.dnd, data.settings.dnd || {});
    data.settings.customLines = Object.assign({}, DEFAULT_SETTINGS.customLines, data.settings.customLines || {});
    data.settings.assistant = Object.assign({}, DEFAULT_SETTINGS.assistant, data.settings.assistant || {});
    migrate(data);
    data.tasks = (data.tasks || []).map(function (t) {
      const merged = Object.assign(taskDefaults({}), t);
      merged.followUp = Object.assign({ min: 15, max: 3 }, t.followUp || {});
      merged.fired = Object.assign({ pre: [], onTime: 0, followUp: 0 }, t.fired || {});
      if (!Array.isArray(merged.fired.pre)) merged.fired.pre = [];
      return merged;
    });
    // 清洗旧版本残留的空消息（曾因双重 pick 产生无文字气泡）
    data.messages = (data.messages || []).filter(function (m) {
      if (!m) return false;
      const needsText = m.role === 'bot' || m.role === 'reminder' || m.role === 'system' || m.role === 'user';
      return !needsText || String(m.text || '').trim() !== '';
    });
    data.silentQueue = data.silentQueue || [];
    return data;
  }

  /* ---------------------------- 状态 ---------------------------- */
  let state;
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? normalize(JSON.parse(raw)) : seed();
  } catch (e) {
    console.warn('[store] 读取本地数据失败，使用种子数据', e);
    state = seed();
  }

  let saveTimer = null;
  function save() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch (e) {
        console.warn('[store] 保存失败', e);
      }
    }, 80);
  }

  /** 任务变动后通知原生层：同步角标、撤销过期通知、重排闹钟 */
  function notifyNative() {
    if (window.NativeNotify && window.NativeNotify.onTasksChanged) {
      try { window.NativeNotify.onTasksChanged(); } catch (e) { /* 原生通知失败不影响主流程 */ }
    }
  }

  const listeners = [];
  function emit() {
    listeners.forEach(function (fn) { try { fn(); } catch (e) { console.warn(e); } });
  }

  /* ---------------------------- 统计 ---------------------------- */
  function stats() {
    const now = Date.now();
    const t0 = U.startOfDay(now);
    const from = t0 - 6 * DAY;
    const to = t0 + DAY;
    const all = state.tasks;

    const scoped = all.filter(function (t) {
      if (!t.dueAt) return false;
      if (t.dueAt < to && t.dueAt >= from) return true;
      return t.status === 'pending' && t.dueAt < from; // 更早的逾期仍计入
    });
    const done = scoped.filter(function (t) { return t.status === 'done'; });
    const overdue = all.filter(function (t) { return t.status === 'pending' && t.dueAt && t.dueAt < now; });
    const pending = all.filter(function (t) { return t.status === 'pending'; });
    const rate = scoped.length ? Math.round(done.length / scoped.length * 100) : 0;

    const todayStart = t0;
    const todayTasks = all.filter(function (t) { return t.dueAt && t.dueAt >= todayStart && t.dueAt < to; });
    const todayDone = todayTasks.filter(function (t) { return t.status === 'done'; }).length;

    const bars = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = t0 - i * DAY;
      const key = U.dayKey(dayStart);
      const n = all.filter(function (t) {
        return t.status === 'done' && t.doneAt && U.dayKey(t.doneAt) === key;
      }).length;
      bars.push({ label: '周' + U.weekdayCn(dayStart), n: n, key: key, today: i === 0 });
    }

    let streak = 0;
    for (let i = 0; i < 30; i++) {
      const key = U.dayKey(t0 - i * DAY);
      const n = all.filter(function (t) { return t.status === 'done' && t.doneAt && U.dayKey(t.doneAt) === key; }).length;
      if (n > 0) streak++;
      else if (i > 0) break;
      else if (i === 0) continue;
    }

    const delays = all.filter(function (t) {
      return t.status === 'done' && t.doneAt && t.dueAt && t.doneAt - t.dueAt > 0;
    }).map(function (t) { return t.doneAt - t.dueAt; });
    const avgDelay = delays.length ? Math.round(delays.reduce(function (a, b) { return a + b; }, 0) / delays.length / MIN) : 0;

    const snoozeTotal = all.reduce(function (s, t) { return s + (t.snoozeCount || 0); }, 0);
    const topDelay = all.filter(function (t) { return (t.snoozeCount || 0) > 0; })
      .sort(function (a, b) { return b.snoozeCount - a.snoozeCount; })
      .slice(0, 3)
      .map(function (t) { return { id: t.id, title: t.title, n: t.snoozeCount }; });

    return {
      rate: rate,
      doneCount: done.length,
      totalCount: scoped.length,
      pendingCount: pending.length,
      overdueCount: overdue.length,
      todayTotal: todayTasks.length,
      todayDone: todayDone,
      bars: bars,
      streak: streak,
      avgDelay: avgDelay,
      snoozeTotal: snoozeTotal,
      topDelay: topDelay,
      weekDone: done.length
    };
  }

  /* ---------------------------- 任务操作 ---------------------------- */
  function getTask(id) {
    return state.tasks.find(function (t) { return t.id === id; }) || null;
  }

  function addTask(patch) {
    const t = taskDefaults(patch);
    state.tasks.unshift(t);
    save(); emit(); notifyNative();
    return t;
  }

  function updateTask(id, patch) {
    const t = getTask(id);
    if (!t) return null;
    Object.assign(t, patch);
    save(); emit(); notifyNative();
    return t;
  }

  function removeTask(id) {
    const i = state.tasks.findIndex(function (t) { return t.id === id; });
    if (i >= 0) { state.tasks.splice(i, 1); save(); emit(); notifyNative(); }
  }

  /** 计算下一次重复的时间 */
  function nextOccurrence(task) {
    if (!task.dueAt || task.repeat === 'none') return null;
    const d = new Date(task.dueAt);
    if (task.repeat === 'daily') return task.dueAt + DAY;
    if (task.repeat === 'workday') {
      let next = task.dueAt + DAY;
      let guard = 0;
      while (guard++ < 10) {
        const wd = new Date(next).getDay();
        if (wd !== 0 && wd !== 6) return next;
        next += DAY;
      }
      return next;
    }
    if (task.repeat === 'weekly') {
      if (task.repeatDays && task.repeatDays.length) {
        let next = task.dueAt + DAY;
        for (let i = 0; i < 14; i++) {
          if (task.repeatDays.indexOf(new Date(next).getDay()) >= 0) return next;
          next += DAY;
        }
        return next;
      }
      return task.dueAt + 7 * DAY;
    }
    if (task.repeat === 'monthly') {
      const nd = new Date(d.getTime());
      nd.setMonth(nd.getMonth() + 1);
      return nd.getTime();
    }
    return null;
  }

  /** 完成任务；周期任务会自动生成下一次 */
  function completeTask(id) {
    const t = getTask(id);
    if (!t) return null;
    const now = Date.now();
    t.status = 'done';
    t.doneAt = now;
    t.paused = false;
    t.nextFollowAt = 0;
    let spawned = null;
    if (t.repeat !== 'none') {
      const nextAt = nextOccurrence(t);
      if (nextAt) {
        spawned = addTask({
          title: t.title,
          rawText: t.rawText,
          dueAt: nextAt,
          repeat: t.repeat,
          repeatDays: t.repeatDays.slice(),
          pre: t.pre.slice(),
          followUp: Object.assign({}, t.followUp),
          tone: t.tone,
          priority: t.priority,
          breakDnd: t.breakDnd,
          voice: t.voice,
          source: 'repeat'
        });
      }
    }
    save(); emit(); notifyNative();
    return { task: t, spawned: spawned };
  }

  function snoozeTask(id, minutes) {
    const t = getTask(id);
    if (!t) return null;
    const m = minutes || 10;
    // 未来的任务在原定时间上顺延；已到点的任务从现在开始顺延
    const base = Math.max(t.dueAt || 0, Date.now());
    t.dueAt = base + m * MIN;
    t.snoozeCount = (t.snoozeCount || 0) + 1;
    t.status = 'pending';
    // 已经手动延后过，不再补发提前提醒
    t.fired = { pre: (t.pre || []).slice(), onTime: 0, followUp: 0 };
    t.nextFollowAt = 0;
    save(); emit(); notifyNative();
    return t;
  }

  function resetAll() {
    state = seed();
    state.settings.onboarded = true;
    save(); emit(); notifyNative();
  }

  /* ---------------------------- 外抛 ---------------------------- */
  window.Store = {
    get state() { return state; },
    get settings() { return state.settings; },
    get tasks() { return state.tasks; },
    get messages() { return state.messages; },
    save: save,
    onChange: function (fn) { listeners.push(fn); },
    getTask: getTask,
    addTask: addTask,
    updateTask: updateTask,
    removeTask: removeTask,
    completeTask: completeTask,
    snoozeTask: snoozeTask,
    nextOccurrence: nextOccurrence,
    stats: stats,
    resetAll: resetAll,
    addMessage: function (msg) {
      const m = Object.assign({ id: U.uid('m'), at: Date.now(), chips: [] }, msg);
      state.messages.push(m);
      save();
      return m;
    },
    clearMessages: function (keep) {
      state.messages = keep || [];
      save();
    },
    pushSilent: function (item) {
      state.silentQueue.push(Object.assign({ at: Date.now() }, item));
      save();
    },
    clearSilent: function () {
      state.silentQueue = [];
      save();
    },
    repeatLabel: function (t) {
      if (!t || !t.repeat || t.repeat === 'none') return '不重复';
      if (t.repeat === 'weekly' && t.repeatDays && t.repeatDays.length) {
        const map = ['日', '一', '二', '三', '四', '五', '六'];
        return '每周' + t.repeatDays.map(function (d) { return map[d]; }).join('');
      }
      return REPEAT_LABEL[t.repeat] || '不重复';
    },
    REPEAT_LABEL: REPEAT_LABEL
  };
})();
