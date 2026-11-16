/* ===========================================================
   轻声 LightTodo · 原生通知桥（仅 Android App 生效）
   通知栏 / 顶部横幅 / 锁屏 / 铃声 / 桌面角标 / 系统闹钟计划
   =========================================================== */
(function () {
  'use strict';

  const MIN = 60000;
  const HORIZON = 40 * 60 * MIN; // 只给未来 40 小时排闹钟

  function plugin() {
    const Cap = window.Capacitor;
    return (Cap && Cap.Plugins && Cap.Plugins.NotificationEx) || null;
  }

  function call(method, args) {
    const p = plugin();
    if (!p || typeof p[method] !== 'function') return Promise.resolve(null);
    try {
      return p[method](args || {}).catch(function () { return null; });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  let isNative = !!plugin();
  let cfg = {
    bar: true, headsUp: true, lock: true, badge: true,
    sound: 'default', vibe: 'normal', fullscreen: true, canFullscreen: true,
    customName: '', granted: true, exact: true, batteryOpt: false
  };
  let lastBadge = -1;
  let posted = {};
  let schedTimer = null;

  /* ------------------------------ 今日未完成数量 ------------------------------ */
  function todayCount() {
    if (!window.Store || !window.U) return 0;
    const t0 = U.startOfDay(Date.now());
    const t1 = t0 + U.DAY;
    let n = 0;
    Store.tasks.forEach(function (t) {
      if (t.status !== 'pending' || t.paused) return;
      if (!t.dueAt || t.dueAt < t0 || t.dueAt >= t1) return;
      n += 1;
    });
    return n;
  }

  /* ------------------------------ 角标同步 ------------------------------ */
  function syncBadge(force) {
    if (!isNative) return;
    const n = todayCount();
    if (!force && n === lastBadge) return;
    lastBadge = n;
    call('setBadge', { count: n });
  }

  /* ------------------------------ 任务快照 ------------------------------ */
  function taskSnapshot() {
    return Store.tasks.map(function (t) {
      return {
        id: t.id,
        title: t.title || '',
        dueAt: t.dueAt || 0,
        status: t.status,
        paused: !!t.paused
      };
    });
  }

  /** 通知里的发送者：当前助手名，没初始化时用「小满」 */
  function personaName() {
    try {
      if (window.Persona && Persona.current) return Persona.current().name || '小满';
    } catch (e) { }
    return '小满';
  }

  /** 把任务快照交给原生层：App 关闭、跨天、闹钟到点时系统自己也能算角标 */
  function syncTasks() {
    if (!isNative || !window.Store) return;
    lastBadge = todayCount();
    call('syncTasks', { tasks: taskSnapshot() });
  }

  /* ------------------------------ 提醒通知 ------------------------------ */
  function remind(task, text) {
    if (!isNative || !task || !task.id) return;
    if (!cfg.bar) return;
    posted[task.id] = 1;
    call('showReminder', {
      id: task.id,
      title: personaName(),
      body: text || ('待办提醒：' + (task.title || '有一条待办到点了')),
      count: todayCount()
    });
  }

  function cancel(taskId) {
    if (!isNative || !taskId) return;
    delete posted[taskId];
    call('cancel', { id: taskId });
  }

  /* ------------------------------ 闹钟计划 ------------------------------ */
  function buildSchedule() {
    const now = Date.now();
    const count = todayCount();
    const who = personaName();
    const items = [];
    Store.tasks.forEach(function (t) {
      if (!t.dueAt || t.status !== 'pending' || t.paused) return;
      if (t.dueAt < now - MIN || t.dueAt > now + HORIZON) return;

      (t.pre || []).slice().sort(function (a, b) { return a - b; }).forEach(function (p) {
        const at = t.dueAt - p * MIN;
        if (at <= now + 15000 || at > now + HORIZON) return;
        items.push({
          id: t.id + '#pre' + p,
          at: at,
          title: who,
          body: '待办提醒：「' + t.title + '」还有 ' + p + ' 分钟到期',
          count: count
        });
      });

      if (t.dueAt > now + 15000) {
        items.push({
          id: t.id + '#due',
          at: t.dueAt,
          title: who,
          body: '待办提醒：「' + t.title + '」到点了，去完成它',
          count: count
        });
      }
    });
    items.sort(function (a, b) { return a.at - b.at; });
    return items.slice(0, 80);
  }

  function syncSchedule() {
    if (!isNative) return;
    call('syncSchedule', { items: buildSchedule() });
  }

  function scheduleSoon() {
    if (!isNative) return;
    if (schedTimer) clearTimeout(schedTimer);
    schedTimer = setTimeout(syncSchedule, 1500);
  }

  /* ------------------------------ 任务变化联动 ------------------------------ */
  function onTasksChanged() {
    if (!isNative) return;
    const pending = [];
    Object.keys(posted).forEach(function (id) {
      const t = Store.getTask(id);
      if (!t || t.status !== 'pending' || t.paused) cancel(id);
      else pending.push(id);
    });
    call('prune', { pending: pending });
    syncTasks();
    scheduleSoon();
  }

  /* ------------------------------ 配置 ------------------------------ */
  function refreshConfig() {
    if (!isNative) return Promise.resolve(cfg);
    return call('getConfig').then(function (res) {
      if (res) cfg = Object.assign(cfg, res);
      return cfg;
    });
  }

  function setConfig(patch) {
    if (!isNative) return Promise.resolve(cfg);
    return call('setConfig', patch).then(function (res) {
      if (res) cfg = Object.assign(cfg, res);
      return cfg;
    });
  }

  function setSound(key) {
    if (key === 'custom' && !cfg.customName) {
      if (window.App) App.toast('先选择一首自定义铃声');
      return Promise.resolve(cfg);
    }
    return setConfig({ sound: key });
  }

  /** 震动模式：off / light / normal / strong / pulse */
  function setVibe(key) {
    return setConfig({ vibe: key });
  }

  function setFullscreen(on) {
    return setConfig({ fullscreen: !!on });
  }

  /** 全屏提醒页上点的「完成 / 延后」，回到 App 时补执行 */
  function applyOps() {
    if (!isNative) return Promise.resolve(0);
    return call('takeOps').then(function (res) {
      if (!res || !res.ops) return 0;
      let list = [];
      try { list = JSON.parse(res.ops) || []; } catch (e) { return 0; }
      let done = 0;
      list.forEach(function (o) {
        if (!o || !o.id || !window.Store) return;
        const t = Store.getTask(o.id);
        if (!t) return;
        if (o.op === 'complete') {
          if (window.Chat && Chat.completeFlow) Chat.completeFlow(t, false);
          else Store.completeTask(t.id);
          done++;
        } else if (o.op === 'snooze') {
          if (window.Chat && Chat.snoozeFlow) Chat.snoozeFlow(t, 10);
          else Store.snoozeTask(t.id, 10);
          done++;
        }
      });
      if (done) {
        if (window.App && App.refreshBadges) App.refreshBadges();
        if (window.App && App.toast) App.toast('已同步提醒页里的 ' + done + ' 条操作');
      }
      return done;
    });
  }

  function saveCustomSound(name, base64) {
    return call('saveCustomSound', { name: name, data: base64 }).then(function (res) {
      if (res && res.ok) {
        cfg.customName = res.name || name;
        cfg.sound = 'custom';
      }
      return res;
    });
  }

  function ensurePermission() {
    if (!isNative) return Promise.resolve(cfg);
    return call('ensurePermission').then(function (res) {
      if (res) cfg.granted = !!res.granted;
      return cfg;
    });
  }

  /* ------------------------------ 初始化 ------------------------------ */
  function init() {
    const p = plugin();
    if (!p) return;
    isNative = true;
    refreshConfig().then(function () {
      ensurePermission();
      syncTasks();
      syncSchedule();
      applyOps();
      setTimeout(syncSchedule, 4000);
    });
  }

  // 回到前台时重算角标与闹钟，并补执行提醒页里点过的操作
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || !isNative) return;
    syncTasks();
    scheduleSoon();
    applyOps();
  });

  window.NativeNotify = {
    get isNative() { return isNative; },
    get cfg() { return cfg; },
    todayCount: todayCount,
    init: init,
    remind: remind,
    cancel: cancel,
    syncBadge: syncBadge,
    syncTasks: syncTasks,
    syncSchedule: syncSchedule,
    onTasksChanged: onTasksChanged,
    refreshConfig: refreshConfig,
    setConfig: setConfig,
    setSound: setSound,
    setVibe: setVibe,
    setFullscreen: setFullscreen,
    previewVibe: function () { return call('previewVibe'); },
    applyOps: applyOps,
    openFullScreenSettings: function () { return call('openFullScreenSettings'); },
    saveCustomSound: saveCustomSound,
    ensurePermission: ensurePermission,
    preview: function () { return call('previewSound'); },
    test: function () { return call('testNotification', { count: todayCount() }); },
    openSystemSettings: function () { return call('openNotificationSettings'); },
    openExactSettings: function () { return call('openExactSettings'); },
    openAppSettings: function () { return call('openAppSettings'); },
    requestIgnoreBattery: function () { return call('requestIgnoreBattery'); },
    pinWidget: function () {
      const p = plugin();
      if (!p || typeof p.pinWidget !== 'function') return Promise.resolve(null);
      try {
        return p.pinWidget({}).catch(function () { return { ok: false }; });
      } catch (e) {
        return Promise.resolve({ ok: false });
      }
    },
    updateWidget: function () { return call('updateWidget'); },
    _buildSchedule: buildSchedule
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }
})();
