/* ===========================================================
   轻声 LightTodo · 提醒调度引擎
   预提醒 → 到点提醒 → 超时追加；免打扰静默队列；拖延升级
   =========================================================== */
(function () {
  'use strict';

  const MIN = 60000;
  const U = window.U;

  let timer = null;
  let activeTaskId = null;

  /* ------------------------------ 免打扰判断 ------------------------------ */
  function toMin(hhmm) {
    const p = String(hhmm || '00:00').split(':');
    return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
  }

  function isDnd(ts) {
    const dnd = Store.settings.dnd;
    if (!dnd || !dnd.on) return false;
    const d = new Date(ts || Date.now());
    const cur = d.getHours() * 60 + d.getMinutes();
    const s = toMin(dnd.start), e = toMin(dnd.end);
    if (s === e) return false;
    if (s < e) return cur >= s && cur < e;
    return cur >= s || cur < e; // 跨天，例如 23:00 - 07:00
  }

  function canBreakDnd(task) {
    const dnd = Store.settings.dnd || {};
    if (task.breakDnd) return true;
    if (task.priority === 'urgent' && dnd.allowUrgent) return true;
    return false;
  }

  /* ------------------------------ 话术组装 ------------------------------ */
  function buildText(task, kind, extra) {
    // 多次被忽略后自动升级为严肃口吻（轻度拖延干预）
    const escalate = kind === 'followUp' && (task.ignoreCount || 0) >= 2;
    const persona = escalate ? Persona.get('sharp') : Persona.effective(task);
    const ctx = {
      title: task.title,
      task: task,
      when: task.dueAt ? U.fmtDue(task.dueAt) : '',
      repeat: Store.repeatLabel(task),
      tone: persona.tag,
      left: (extra && extra.leftMin ? extra.leftMin : 10) + ' 分钟'
    };
    let key = kind;
    if (kind === 'followUp' && task.fired.followUp >= 2) key = 'followUp2';
    return { text: Persona.say(key, ctx, persona), persona: persona };
  }

  /* ------------------------------ 触发 ------------------------------ */
  function fire(task, kind, extra) {
    const now = Date.now();
    const built = buildText(task, kind, extra);

    // 免打扰：静默保存，不打断
    if (isDnd(now) && !canBreakDnd(task)) {
      Store.pushSilent({ taskId: task.id, kind: kind, text: built.text, at: now });
      if (window.Chat && Chat.pushSilentNotice) Chat.pushSilentNotice(task, kind, built.text);
      updateSilentBadge();
      return;
    }

    activeTaskId = task.id;
    if (window.App && App.showReminder) {
      App.showReminder(task, kind, built.text, built.persona, extra);
    }
    if (window.Voice) Voice.speak(built.text, built.persona.id);
    if (navigator.vibrate) { try { navigator.vibrate([40, 60, 40]); } catch (e) { /* ignore */ } }
    if (window.NativeNotify) NativeNotify.remind(task, built.text);
    updateSilentBadge();
  }

  function updateSilentBadge() {
    if (window.App && App.updateSilentBadge) App.updateSilentBadge();
  }

  /* ------------------------------ 主循环 ------------------------------ */
  function tick() {
    const now = Date.now();
    let changed = false;

    Store.state.tasks.forEach(function (t) {
      if (!t.dueAt || t.status !== 'pending' || t.paused) return;

      /* 预提醒（按提醒点触发，70 秒容差内只触发一次） */
      const pres = (t.pre || []).slice().sort(function (a, b) { return b - a; });
      pres.forEach(function (p) {
        const at = t.dueAt - p * MIN;
        if (t.fired.pre.indexOf(p) < 0 && now >= at && now - at < 70000 && now < t.dueAt) {
          t.fired.pre.push(p);
          changed = true;
          fire(t, 'pre', { leftMin: p });
        }
      });

      /* 到点提醒 */
      if (now >= t.dueAt && !t.fired.onTime) {
        t.fired.onTime = 1;
        const gap = (t.followUp && t.followUp.min) || 15;
        t.nextFollowAt = now + gap * MIN;
        changed = true;
        fire(t, 'onTime');
        return;
      }

      /* 超时追加提醒 */
      if (t.fired.onTime && t.nextFollowAt && now >= t.nextFollowAt) {
        // 弹层还没被处理时不重复飙弹，只往后顺延
        if (activeTaskId === t.id) { t.nextFollowAt = now + 60000; return; }
        const max = (t.followUp && t.followUp.max) || 3;
        if (t.fired.followUp < max) {
          t.fired.followUp += 1;
          t.ignoreCount = (t.ignoreCount || 0) + 1;
          const gap = (t.followUp && t.followUp.min) || 15;
          t.nextFollowAt = now + gap * MIN;
          changed = true;
          fire(t, 'followUp');
        } else {
          if (t.nextFollowAt) { t.nextFollowAt = 0; changed = true; }
        }
      }
    });

    /* 免打扰结束后补发 */
    if (Store.state.silentQueue.length && !isDnd(now)) {
      flushSilent(true);
      changed = true;
    }

    if (changed) Store.save();
    updateSilentBadge();
    tickClock();
  }

  function tickClock() {
    const el = document.getElementById('statusClock');
    if (el) {
      const d = new Date();
      el.textContent = U.pad(d.getHours()) + ':' + U.pad(d.getMinutes());
    }
  }

  /* ------------------------------ 静默队列 ------------------------------ */
  function flushSilent(auto) {
    const queue = Store.state.silentQueue.slice();
    if (!queue.length) return 0;
    Store.clearSilent();

    const last = queue[queue.length - 1];
    const task = Store.getTask(last.taskId);
    if (task && task.status === 'pending') {
      activeTaskId = task.id;
      const built = buildText(task, last.kind);
      if (window.Chat) {
        Chat.push({
          role: 'system',
          text: '免打扰已结束，补发 ' + queue.length + ' 条静默提醒' + (auto ? '' : '')
        });
      }
      if (window.App && App.showReminder) App.showReminder(task, last.kind, built.text, built.persona);
      if (window.Voice) Voice.speak(built.text, built.persona.id);
      if (window.NativeNotify) NativeNotify.remind(task, built.text);
    }
    updateSilentBadge();
    return queue.length;
  }

  /* ------------------------------ 演示 ------------------------------ */
  function demo(seconds) {
    const sec = seconds || 10;
    const p = Persona.current();
    const t = Store.addTask({
      title: '演示：' + sec + ' 秒后提醒',
      rawText: '演示模式',
      dueAt: Date.now() + sec * 1000,
      tone: p.id,
      pre: [],
      followUp: { min: 1, max: 3 },
      source: 'demo',
      isDemo: true
    });
    return t;
  }

  function start() {
    if (timer) return;
    timer = setInterval(tick, 1000);
    tick();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  window.Reminder = {
    start: start,
    stop: stop,
    tick: tick,
    isDnd: isDnd,
    canBreakDnd: canBreakDnd,
    flushSilent: flushSilent,
    demo: demo,
    get activeTaskId() { return activeTaskId; },
    clearActive: function () { activeTaskId = null; }
  };
})();
