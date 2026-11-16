/* ===========================================================
   轻声 LightTodo · 聊天交互（渲染 / 指令分发 / 新建流程）
   =========================================================== */
(function () {
  'use strict';

  const U = window.U;
  const esc = U.esc;

  const Chat = {
    pending: null,
    lastTaskId: null,
    lastDeleted: null
  };

  let rendered = new Set();
  let lastDayKey = null;
  let queue = Promise.resolve();
  let typingEl = null;

  /* ------------------------------ 小工具 ------------------------------ */
  function toneLabel(id) {
    return (Persona.all[id] || Persona.all.gentle).tag;
  }

  function currentPersona() {
    return Persona.current();
  }

  function streamEl() { return document.getElementById('chatStream'); }

  function scrollBottom() {
    const el = streamEl();
    if (el) el.scrollTop = el.scrollHeight;
  }

  /* ------------------------------ 渲染 ------------------------------ */
  function dayNode(key) {
    const d = new Date(key.replace(/-/g, '/'));
    const isToday = U.dayKey(Date.now()) === key;
    const div = document.createElement('div');
    div.className = 'chat-day';
    div.textContent = isToday ? '今天' : (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + U.weekdayCn(d.getTime());
    return div;
  }

  function avatarNode(personaId) {
    const p = Persona.all[personaId] || currentPersona();
    const el = document.createElement('div');
    el.className = 'msg-avatar';
    el.innerHTML = Persona.avatarHTML(p);
    el.title = p.name;
    return el;
  }

  function bubbleNode(cls, innerHTML, chips, personaId, withAvatar) {
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + cls;
    if (withAvatar !== false) wrap.appendChild(avatarNode(personaId));
    const col = document.createElement('div');
    col.className = 'msg-col';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = innerHTML;
    col.appendChild(bubble);
    if (chips && chips.length) {
      const c = document.createElement('div');
      c.className = 'msg-chips';
      chips.forEach(function (chip) {
        const b = document.createElement('button');
        b.className = 'chip';
        b.type = 'button';
        b.dataset.chip = chip;
        b.textContent = chip;
        c.appendChild(b);
      });
      col.appendChild(c);
    }
    wrap.appendChild(col);
    return wrap;
  }

  function taskCardNode(task) {
    const urgent = task.priority === 'urgent';
    const done = task.status === 'done';
    const el = document.createElement('div');
    el.className = 'task-card' + (urgent ? ' urgent' : '') + (done ? ' is-done' : '');
    el.dataset.taskId = task.id;
    el.innerHTML =
      '<div class="tc-head">' +
        '<div class="tc-title">' + esc(task.title) + '</div>' +
        (done ? '<span class="tag">已完成</span>' : '') +
        (urgent && !done ? '<span class="tag red">紧急</span>' : '') +
        (task.paused && !done ? '<span class="tag grey">已暂停</span>' : '') +
      '</div>' +
      '<div class="tc-when">⏰ ' + esc(U.fmtDue(task.dueAt)) + '</div>' +
      '<div class="tc-meta">' +
        '<span class="tag">' + esc(Store.repeatLabel(task)) + '</span>' +
        '<span class="tag">' + esc(toneLabel(task.priority === 'urgent' ? 'sharp' : task.tone)) + '</span>' +
        (task.pre && task.pre.length ? '<span class="tag">提前 ' + task.pre[0] + ' 分钟</span>' : '') +
      '</div>' +
      '<div class="tc-actions">' +
        (done
          ? '<button data-action="openTask" data-id="' + task.id + '">查看详情</button>'
          : '<button class="done-btn" data-action="completeTask" data-id="' + task.id + '">完成</button>' +
            '<button data-action="snoozeTask" data-id="' + task.id + '">延后 10 分</button>' +
            '<button data-action="openTask" data-id="' + task.id + '">详情</button>') +
      '</div>';
    return el;
  }

  /** 任务变化后刷新对话里的任务卡，避免显示旧时间 */
  Chat.refreshCards = function () {
    document.querySelectorAll('.task-card[data-task-id]').forEach(function (el) {
      const t = Store.getTask(el.dataset.taskId);
      if (!t) return;
      const fresh = taskCardNode(t);
      if (el.parentNode) el.parentNode.replaceChild(fresh, el);
    });
  };

  function reportNode(stats) {
    const el = document.createElement('div');
    el.className = 'report-card';
    el.innerHTML =
      '<h4>近 7 天复盘</h4>' +
      '<div class="report-line"><span>完成率</span><b>' + stats.rate + '%</b></div>' +
      '<div class="report-line"><span>完成 / 应完成</span><b>' + stats.doneCount + ' / ' + stats.totalCount + '</b></div>' +
      '<div class="report-line"><span>逾期未完成</span><b>' + stats.overdueCount + ' 件</b></div>' +
      '<div class="report-line"><span>平均延后</span><b>' + stats.avgDelay + ' 分钟</b></div>' +
      '<div class="report-tip">' + (stats.overdueCount
        ? '拖延最多的是：' + esc((stats.topDelay[0] || {}).title || '暂无') + '，建议明天上午先做 10 分钟。'
        : '本周没有明显拖延，继续保持。') + '</div>';
    return el;
  }

  function nodeFor(m) {
    const personaId = m.persona;

    if (m.role === 'system') {
      const wrap = document.createElement('div');
      wrap.className = 'msg system';
      wrap.innerHTML = '<div class="sys-pill">' + esc(m.text) + '</div>';
      return wrap;
    }

    if (m.role === 'user') {
      return bubbleNode('user', esc(m.text).replace(/\n/g, '<br>'), m.chips, null, false);
    }

    if (m.role === 'card') {
      const task = Store.getTask(m.taskId);
      const wrap = document.createElement('div');
      wrap.className = 'msg bot';
      wrap.appendChild(avatarNode(personaId || (task ? task.tone : null)));
      const col = document.createElement('div');
      col.className = 'msg-col';
      if (task) {
        col.appendChild(taskCardNode(task));
      } else {
        const b = document.createElement('div');
        b.className = 'bubble';
        b.textContent = '（这条任务已被删除）';
        col.appendChild(b);
      }
      wrap.appendChild(col);
      return wrap;
    }

    if (m.role === 'ach') {
      const wrap = document.createElement('div');
      wrap.className = 'msg bot';
      wrap.appendChild(avatarNode(personaId));
      const col = document.createElement('div');
      col.className = 'msg-col';
      const card = document.createElement('div');
      card.className = 'ach-card';
      card.innerHTML = '<span class="ach-icon">' + (m.icon || '✨') + '</span><div><b>' + esc(m.title || '成就') + '</b>' + esc(m.text || '') + '</div>';
      col.appendChild(card);
      wrap.appendChild(col);
      return wrap;
    }

    if (m.role === 'report') {
      const wrap = document.createElement('div');
      wrap.className = 'msg bot';
      wrap.appendChild(avatarNode(personaId));
      const col = document.createElement('div');
      col.className = 'msg-col';
      col.appendChild(reportNode(m.stats || Store.stats()));
      wrap.appendChild(col);
      return wrap;
    }

    if (m.role === 'reminder') {
      return bubbleNode('reminder', esc(m.text).replace(/\n/g, '<br>'), m.chips, personaId);
    }

    return bubbleNode('bot', esc(m.text).replace(/\n/g, '<br>'), m.chips, personaId);
  }

  function render(force) {
    const el = streamEl();
    if (!el) return;
    if (force) {
      el.innerHTML = '';
      rendered = new Set();
      lastDayKey = null;
      el.classList.add('no-anim');
      setTimeout(function () { el.classList.remove('no-anim'); }, 40);
    }
    Store.messages.forEach(function (m) {
      if (rendered.has(m.id)) return;
      rendered.add(m.id);
      const k = U.dayKey(m.at || Date.now());
      if (k !== lastDayKey) {
        el.appendChild(dayNode(k));
        lastDayKey = k;
      }
      el.appendChild(nodeFor(m));
    });
    scrollBottom();
  }

  /* ------------------------------ 气泡输出 ------------------------------ */
  function push(msg) {
    const m = Store.addMessage(msg);
    render();
    return m;
  }

  function showTyping() {
    hideTyping();
    const el = streamEl();
    if (!el) return;
    typingEl = document.createElement('div');
    typingEl.className = 'msg bot';
    typingEl.appendChild(avatarNode());
    const col = document.createElement('div');
    col.className = 'msg-col';
    col.innerHTML = '<div class="bubble typing"><i></i><i></i><i></i></div>';
    typingEl.appendChild(col);
    el.appendChild(typingEl);
    scrollBottom();
  }

  function hideTyping() {
    if (typingEl && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
    typingEl = null;
  }

  function botSay(text, opts) {
    opts = opts || {};
    queue = queue.then(function () {
      return new Promise(function (resolve) {
        showTyping();
        setTimeout(function () {
          hideTyping();
          push({ role: 'bot', text: text, chips: opts.chips || [], persona: opts.persona });
          resolve();
        }, opts.delay == null ? 380 : opts.delay);
      });
    });
    return queue;
  }

  function sayNow(text, opts) {
    opts = opts || {};
    return push({ role: 'bot', text: text, chips: opts.chips || [], persona: opts.persona });
  }

  function systemSay(text) {
    return push({ role: 'system', text: text });
  }

  Chat.push = push;
  Chat.botSay = botSay;
  Chat.sayNow = sayNow;
  Chat.systemSay = systemSay;
  Chat.render = render;

  /* ------------------------------ 快捷指令 ------------------------------ */
  function defaultChips() {
    const p = currentPersona();
    return ['明天十点提醒我交高数作业', '今天还有什么', '本周复盘', '演示 10 秒后提醒'];
  }

  function setChips(items) {
    const box = document.getElementById('chatChips');
    if (!box) return;
    box.innerHTML = '';
    (items && items.length ? items : defaultChips()).forEach(function (t) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.type = 'button';
      b.dataset.chip = t;
      b.textContent = t;
      box.appendChild(b);
    });
  }
  Chat.setChips = setChips;

  function timeChips(draft) {
    const w = draft.when || {};
    if (w.dayTs) {
      const base = w.dayTs;
      const fmt = function (h, m) { return U.fmtDue(base + h * U.HOUR + (m || 0) * U.MIN); };
      return [fmt(9), fmt(14), fmt(19, 30), '30 分钟后'];
    }
    return ['30 分钟后', '今晚 20:00', '明天 09:00', '明天 14:00'];
  }

  /* ------------------------------ 任务匹配 ------------------------------ */
  function matchTask(text) {
    const pool = Store.tasks.filter(function (t) { return t.status === 'pending'; });
    if (!pool.length) return null;
    const q = String(text || '').replace(/\s/g, '');
    if (!q) return null;

    let best = null, bestScore = 0;
    pool.forEach(function (t) {
      const title = String(t.title || '').replace(/\s/g, '');
      if (!title) return;
      let score = 0;
      if (title.length >= 2 && q.indexOf(title) >= 0) score += 4;
      const chars = Array.from(new Set(title.split('')));
      let hit = 0;
      chars.forEach(function (ch) { if (q.indexOf(ch) >= 0) hit++; });
      score += (hit / Math.max(3, chars.length)) * 2;
      if (t.id === Chat.lastTaskId) score += 0.5;
      if (t.dueAt && t.dueAt < Date.now()) score += 0.2;
      if (score > bestScore) { bestScore = score; best = t; }
    });
    if (bestScore < 0.9) return null;
    return best;
  }
  Chat.matchTask = matchTask;

  /** 先按名字匹配；目标为空或只剩时间词时，回退到最近讨论过的任务 */
  function resolveTask(target) {
    const q = String(target || '').replace(/\s/g, '');
    if (!q || /^[\d一二两三四五六七八九十半分钟个小时]+$/.test(q)) {
      return Chat.lastTaskId ? Store.getTask(Chat.lastTaskId) : null;
    }
    return matchTask(q);
  }

  /* ------------------------------ 新建任务 ------------------------------ */
  function draftFrom(r) {
    return {
      raw: r.raw,
      title: r.title,
      dueAt: r.dueAt,
      repeat: r.repeat,
      repeatDays: r.repeatDays,
      tone: r.tone || Store.settings.persona,
      urgent: r.urgent,
      when: r.when
    };
  }

  function askTime(draft) {
    Chat.pending = { type: 'time', draft: draft };
    const p = currentPersona();
    botSay(Persona.say('askTime', { title: draft.title, task: draft }, p), { chips: timeChips(draft) });
  }

  function askTitle(draft) {
    Chat.pending = { type: 'title', draft: draft };
    botSay(Persona.say('askTitle', {}, currentPersona()), { chips: ['交作业', '取快递', '开班会', '背单词'] });
  }

  function finalize(draft) {
    const t = Store.addTask({
      title: draft.title,
      rawText: draft.raw,
      dueAt: draft.dueAt,
      repeat: draft.repeat || 'none',
      repeatDays: draft.repeatDays || [],
      pre: (Store.settings.defaultPre || [10]).slice(),
      followUp: { min: Store.settings.followUpMin || 15, max: Store.settings.followUpMax || 3 },
      tone: draft.tone || Store.settings.persona,
      priority: draft.urgent ? 'urgent' : 'normal',
      breakDnd: !!draft.urgent,
      voice: Store.settings.voiceOn,
      source: 'chat'
    });
    Chat.lastTaskId = t.id;
    Chat.pending = null;

    const persona = Persona.effective(t);
    const ctx = {
      title: t.title,
      when: U.fmtDue(t.dueAt),
      repeat: Store.repeatLabel(t),
      tone: persona.tag,
      task: t
    };
    botSay(Persona.say('confirm', ctx, persona), {
      chips: ['完成它', '延后 10 分钟', '打开清单', '再设一个']
    }).then(function () {
      push({ role: 'card', taskId: t.id });
      if (t.priority === 'urgent') {
        systemSay('已识别为紧急任务：自动切换为「' + Persona.get('sharp').name + '」的严肃话术，并允许突破免打扰');
      }
      if (window.App && App.refreshBadges) App.refreshBadges();
    });
    return t;
  }

  /* ------------------------------ 意图分发 ------------------------------ */
  function dispatch(r, raw) {
    switch (r.intent) {
      case 'cancel':
        Chat.pending = null;
        botSay('好，这次就先不设了。需要的时候随时叫我。', { chips: defaultChips().slice(0, 3) });
        return;

      case 'help':
        botSay('你可以这样说：\n· 明天十点提醒我交高数作业\n· 每周一三五晚八点提醒我背单词\n· 高数作业完成了\n· 延后 10 分钟\n· 改到明晚七点\n· 把高数作业改名叫交数学作业\n· 每周一三五改成每周二四\n· 提醒提前改成 30 分钟\n· 删除取快递这个任务\n· 温柔一点\n· 本周复盘', { chips: ['明天十点提醒我交高数作业', '删除取快递这个任务', '本周复盘'] });
        return;

      case 'greet':
        botSay('在的。直接把要做的事说给我听就行，时间我自己会记。', { chips: defaultChips() });
        return;

      case 'review': {
        const st = Store.stats();
        push({ role: 'report', stats: st });
        botSay(Persona.say('review', st, currentPersona()), { chips: ['打开复盘页', '今天还有什么'] });
        return;
      }

      case 'query': {
        const list = Store.tasks.filter(function (t) { return t.status === 'pending'; })
          .sort(function (a, b) { return (a.dueAt || 0) - (b.dueAt || 0); });
        const today = list.filter(function (t) { return t.dueAt && U.isSameDay(t.dueAt, Date.now()); });
        if (!list.length) {
          botSay('目前没有待办，要不要现在记一件？', { chips: ['新建提醒', '看示例指令'] });
          return;
        }
        let text = Persona.say('query', { count: list.length, today: today.length }, currentPersona());
        list.slice(0, 3).forEach(function (t, i) {
          text += '\n' + (i + 1) + '. ' + t.title + ' · ' + U.fmtDue(t.dueAt);
        });
        if (list.length > 3) text += '\n…还有 ' + (list.length - 3) + ' 件，去清单看全部。';
        botSay(text, { chips: ['打开清单', '本周复盘'] });
        return;
      }

      case 'complete': {
        const t = resolveTask(r.target);
        if (!t) {
          botSay('没找到要标记完成的任务，告诉我是哪一件？', { chips: pendingTitles(3) });
          return;
        }
        completeFlow(t, true);
        return;
      }

      case 'snooze': {
        const t = resolveTask(r.target);
        if (!t) {
          botSay('要延后哪一件？告诉我任务名就好。', { chips: pendingTitles(3) });
          return;
        }
        snoozeFlow(t, r.snoozeMin || 10);
        return;
      }

      case 'reschedule': {
        const t = resolveTask(r.target);
        if (!t) {
          botSay('要改哪一件的时间？', { chips: pendingTitles(3) });
          return;
        }
        if (!r.dueAt) {
          Chat.pending = { type: 'time', draft: { title: t.title, when: r.when, repeat: t.repeat, repeatDays: t.repeatDays, tone: t.tone, rescheduleId: t.id } };
          botSay('想改到什么时候？', { chips: timeChips({ when: r.when }) });
          return;
        }
        Store.updateTask(t.id, {
          dueAt: r.dueAt,
          status: 'pending',
          paused: false,
          fired: { pre: [], onTime: 0, followUp: 0 },
          nextFollowAt: 0
        });
        Chat.lastTaskId = t.id;
        botSay('改好了：「' + t.title + '」现在是 ' + U.fmtDue(r.dueAt) + '。', { chips: ['完成它', '再延后 10 分钟'] });
        return;
      }

      case 'delete': {
        const t = resolveTask(r.target);
        if (!t) {
          botSay('要删除哪一件？告诉我任务名，或者直接说「删除 高数作业」。', { chips: pendingTitles(3) });
          return;
        }
        Chat.lastDeleted = JSON.parse(JSON.stringify(t));
        Store.removeTask(t.id);
        if (Chat.lastTaskId === t.id) Chat.lastTaskId = null;
        botSay('好，已删除「' + t.title + '」。删错了说「撤销删除」，我把它放回来。', { chips: ['撤销删除', '今天还有什么'] });
        if (window.App) {
          App.toast('已删除「' + t.title + '」');
          if (App.refreshBadges) App.refreshBadges();
        }
        return;
      }

      case 'rename': {
        const t = resolveTask(r.target);
        if (!t) { botSay('要改哪一件的名字？', { chips: pendingTitles(3) }); return; }
        const oldTitle = t.title;
        Store.updateTask(t.id, { title: r.newTitle });
        Chat.lastTaskId = t.id;
        botSay('改好了：「' + oldTitle + '」→「' + r.newTitle + '」。', { chips: ['完成它', '改到明天 9 点', '打开清单'] });
        if (window.App && App.refreshBadges) App.refreshBadges();
        return;
      }

      case 'repeat': {
        const t = resolveTask(r.target);
        if (!t) { botSay('要改哪一件的提醒频次？', { chips: pendingTitles(3) }); return; }
        const patch = {
          repeat: r.repeat || 'none',
          repeatDays: (r.repeatDays || []).slice(),
          fired: { pre: [], onTime: 0, followUp: 0 },
          nextFollowAt: 0
        };
        // 改成每周：把下一次时间对齐到最近的重复日，保留原本的时分
        if (patch.repeat === 'weekly' && patch.repeatDays.length && t.dueAt) {
          const d = new Date(t.dueAt);
          const minutes = d.getHours() * 60 + d.getMinutes();
          for (let i = 0; i < 14; i++) {
            const cand = U.startOfDay(Date.now()) + i * U.DAY + minutes * U.MIN;
            if (cand <= Date.now()) continue;
            if (patch.repeatDays.indexOf(new Date(cand).getDay()) >= 0) { patch.dueAt = cand; break; }
          }
        }
        Store.updateTask(t.id, patch);
        Chat.lastTaskId = t.id;
        const label = Store.repeatLabel(Store.getTask(t.id));
        botSay('好，「' + t.title + '」的提醒频次改成：' + label + '。', { chips: ['完成它', '今天还有什么', '打开清单'] });
        if (window.App && App.refreshBadges) App.refreshBadges();
        return;
      }

      case 'pre': {
        const t = resolveTask(r.target);
        if (!t) { botSay('要给哪一件改提前提醒？', { chips: pendingTitles(3) }); return; }
        Store.updateTask(t.id, { pre: [r.preMin], fired: { pre: [], onTime: 0, followUp: 0 } });
        Chat.lastTaskId = t.id;
        botSay('改好了：「' + t.title + '」会提前 ' + r.preMin + ' 分钟提醒你。', { chips: ['完成它', '打开清单'] });
        return;
      }

      case 'pause': {
        const t = resolveTask(r.target);
        if (!t) { botSay('要暂停哪一件的提醒？', { chips: pendingTitles(3) }); return; }
        Store.updateTask(t.id, { paused: true, nextFollowAt: 0 });
        Chat.lastTaskId = t.id;
        botSay('好，「' + t.title + '」的提醒先停一停，任务本身还在清单里。想说「继续提醒」我就恢复。', { chips: ['继续提醒', '打开清单'] });
        return;
      }

      case 'resume': {
        const t = resolveTask(r.target);
        if (!t) { botSay('要恢复哪一件？', { chips: pendingTitles(3) }); return; }
        Store.updateTask(t.id, { paused: false, fired: { pre: [], onTime: 0, followUp: 0 }, nextFollowAt: 0 });
        Chat.lastTaskId = t.id;
        botSay('已恢复「' + t.title + '」的提醒。', { chips: ['完成它', '本周复盘'] });
        return;
      }

      case 'tone': {
        Store.settings.persona = r.tone;
        Store.save();
        if (window.App && App.refreshBadges) App.refreshBadges();
        const p = currentPersona();
        botSay(p.lines.greet ? Persona.say('greet', {}, p) + ' 现在由「' + p.name + '」来提醒你，语气：' + p.tag + '。' : '已切换语气。', {
          chips: ['温柔一点', '俏皮一点', '干练一点', '简约正式']
        });
        if (window.Voice && Store.settings.voiceOn) Voice.speak(Persona.say('greet', {}, p), p.id);
        return;
      }

      /* 新建任务 */
      default: {
        if (!r.title && r.hasTime) {
          askTitle(draftFrom(r));
          return;
        }
        if (!r.title && !r.hasTime) {
          botSay(Persona.say('unknown', {}, currentPersona()), {
            chips: ['明天十点提醒我交高数作业', '打开手动表单', '看示例指令']
          });
          return;
        }
        const draft = draftFrom(r);
        if (!r.hasTime) { askTime(draft); return; }
        finalize(draft);
      }
    }
  }

  function pendingTitles(n) {
    return Store.tasks.filter(function (t) { return t.status === 'pending'; })
      .slice(0, n).map(function (t) { return t.title; });
  }

  /* ------------------------------ 各类流程 ------------------------------ */
  function completeFlow(task, withChat) {
    if (task.status === 'done') {
      botSay('「' + task.title + '」已经是完成状态啦。');
      return;
    }
    const res = Store.completeTask(task.id);
    Chat.lastTaskId = null;
    const p = currentPersona();
    const praise = Persona.say('done', { title: task.title, task: task }, p);
    if (withChat && praise) sayNow(praise);

    const st = Store.stats();
    const remainToday = Store.tasks.filter(function (t) {
      return t.status === 'pending' && t.dueAt && U.isSameDay(t.dueAt, Date.now());
    }).length;

    let icon = '✨', title = '完成 +1', text = '今天已完成 ' + st.todayDone + ' 件';
    if (remainToday === 0 && st.todayDone > 0) {
      icon = '🎉'; title = '今日清零'; text = '今天的待办全部完成，去休息一下吧';
    } else if (st.streak >= 2) {
      icon = '🌿'; title = '连续 ' + st.streak + ' 天有进展'; text = '节奏很稳，别把自己逼太紧';
    }
    push({ role: 'ach', icon: icon, title: title, text: text });

    if (res && res.spawned) {
      systemSay('周期任务已自动安排下一次：' + U.fmtDue(res.spawned.dueAt));
    }
    if (window.App) {
      App.toast('已完成「' + task.title + '」');
      if (App.refreshBadges) App.refreshBadges();
    }
  }
  Chat.completeFlow = completeFlow;

  function snoozeFlow(task, minutes) {
    Store.snoozeTask(task.id, minutes);
    Chat.lastTaskId = task.id;
    botSay('好，我把「' + task.title + '」挪到 ' + U.fmtDue(task.dueAt) + '，' + minutes + ' 分钟后再叫你。', {
      chips: ['完成它', '暂停提醒', '打开清单']
    });
    if (window.App && App.refreshBadges) App.refreshBadges();
  }
  Chat.snoozeFlow = snoozeFlow;

  function changeTaskTone(task, toneId) {
    Store.updateTask(task.id, { tone: toneId });
    Chat.lastTaskId = task.id;
    botSay('「' + task.title + '」改成' + toneLabel(toneId) + '语气了，下次提醒会换个说法。', {
      chips: ['温柔一点', '俏皮一点', '干练一点', '简约正式']
    });
  }
  Chat.changeTaskTone = changeTaskTone;

  /* ------------------------------ 静默提醒 ------------------------------ */
  Chat.pushSilentNotice = function (task, kind, text) {
    push({
      role: 'system',
      text: '免打扰中，已静默保存 1 条提醒：' + task.title + '（' + U.fmtDue(task.dueAt) + '）'
    });
  };

  /* ------------------------------ 演示 ------------------------------ */
  function doDemo(seconds) {
    const sec = seconds || 10;
    if (Reminder.isDnd()) {
      App.toast('当前处于免打扰时段，演示提醒会被静默保存');
    }
    Reminder.demo(sec);
    systemSay('演示已启动：' + sec + ' 秒后会弹出提醒气泡' + (Store.settings.voiceOn ? '，并语音播报' : '') + '。');
  }

  /* ------------------------------ 输入 ------------------------------ */
  /** 恢复最近一次删除（对话「撤销删除」与清单页撤销按钮共用） */
  function restoreDeleted() {
    const snap = Chat.lastDeleted;
    if (!snap) return null;
    if (Store.getTask(snap.id)) Store.removeTask(snap.id);
    const t = Store.addTask(snap);
    Chat.lastDeleted = null;
    Chat.lastTaskId = t.id;
    return t;
  }
  Chat.restoreDeleted = restoreDeleted;

  const SPECIAL = {
    '打开清单': function () { App.go('list'); },
    '打开复盘页': function () { App.go('review'); },
    '打开手动表单': function () { App.openNewTask(); },
    '看示例指令': function () { dispatch({ intent: 'help' }, '帮助'); },
    '新建提醒': function () { dispatch({ intent: 'help' }, '帮助'); },
    '再设一个': function () { botSay('好，接着说下一件事。', { chips: defaultChips().slice(0, 3) }); },
    '撤销删除': function () {
      const t = restoreDeleted();
      if (!t) { botSay('现在没有可撤销的删除。', { chips: defaultChips().slice(0, 2) }); return; }
      botSay('已恢复「' + t.title + '」，时间还是 ' + U.fmtDue(t.dueAt) + '。', { chips: ['完成它', '打开清单'] });
      if (window.App) {
        App.toast('已撤销删除');
        if (App.refreshBadges) App.refreshBadges();
      }
    },
    '完成它': function () {
      const t = Chat.lastTaskId ? Store.getTask(Chat.lastTaskId) : null;
      if (!t) { botSay('要完成哪一件？说个任务名就行。', { chips: pendingTitles(3) }); return; }
      completeFlow(t, true);
    },
    '拆成三步': function () {
      botSay('好，把它拆成三步：\n1. 先打开资料或文件，只做 5 分钟\n2. 写出主干的 3 个要点\n3. 补齐细节再检查一遍\n要我把第一步设成 10 分钟后的提醒吗？', {
        chips: ['10 分钟后提醒我做第一步', '完成它']
      });
    },
    '演示 10 秒后提醒': function () { doDemo(10); }
  };

  function handlePending(raw, p) {
    const r = NLU.parse(raw);
    if (r.intent === 'cancel') {
      Chat.pending = null;
      botSay('好，那就先放着，需要时再叫我。', { chips: defaultChips().slice(0, 3) });
      return;
    }
    const draft = p.draft;

    if (p.type === 'time') {
      // 追问时间时，用户又抛来一条「新任务名 + 时间」：当作新指令，不吞掉当前追问
      if (!draft.rescheduleId && r.intent === 'create' && r.title && r.hasTime && r.title !== draft.title) {
        Chat.pending = null;
        dispatch(r, raw);
        return;
      }
      let ts = null;
      if (/随便|都行|你定|看着办|都可以/.test(raw)) {
        ts = U.startOfDay(Date.now()) + U.DAY + 9 * U.HOUR;
      } else {
        const w = NLU.parseWhen(raw);
        ts = w.ts;
      }
      if (!ts) {
        botSay('我还是没抓到具体时间，可以说「明天 9 点」这种～', { chips: timeChips(draft) });
        return;
      }
      if (draft.rescheduleId) {
        const t = Store.getTask(draft.rescheduleId);
        Chat.pending = null;
        if (t) {
          Store.updateTask(t.id, { dueAt: ts, status: 'pending', paused: false, fired: { pre: [], onTime: 0, followUp: 0 }, nextFollowAt: 0 });
          Chat.lastTaskId = t.id;
          botSay('改好了：「' + t.title + '」现在是 ' + U.fmtDue(ts) + '。', { chips: ['完成它', '再延后 10 分钟'] });
        }
        return;
      }
      draft.dueAt = ts;
      finalize(draft);
      return;
    }

    if (p.type === 'title') {
      const title = NLU.extractTitle(raw) || raw.replace(/[，,。.！!]/g, '');
      if (!title) {
        botSay('要提醒你做什么呢？一句话就行。', { chips: ['交作业', '取快递'] });
        return;
      }
      draft.title = title;
      finalize(draft);
    }
  }

  function submit(text) {
    const raw = String(text || '').trim();
    if (!raw) return;

    /* 特殊按钮指令 */
    if (SPECIAL[raw]) {
      push({ role: 'user', text: raw });
      SPECIAL[raw]();
      return;
    }

    push({ role: 'user', text: raw });

    if (/^(好的|好|嗯|嗯嗯|收到|ok|OK|行|可以|知道了)[。！!]*$/.test(raw)) {
      botSay('嗯，我记着呢。需要调整就说一声。', { chips: defaultChips().slice(0, 2) });
      return;
    }

    const p = Chat.pending;
    if (p) { handlePending(raw, p); return; }

    const r = NLU.parse(raw);
    dispatch(r, raw);
  }
  Chat.submit = submit;

  /* ------------------------------ 语音输入 ------------------------------ */
  function voiceInput() {
    const btn = document.querySelector('[data-action="voiceInput"]');
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      App.toast('当前浏览器不支持语音输入，直接打字也可以');
      return;
    }
    if (btn) btn.classList.add('recording');
    const rec = Voice.listen(function (text) {
      if (btn) btn.classList.remove('recording');
      if (text) submit(text);
      else App.toast('没听清，再说一次？');
    }, function (e) {
      if (btn) btn.classList.remove('recording');
      App.toast('语音输入不可用：' + ((e && e.error) || '请检查麦克风权限'));
    });
    if (!rec && btn) btn.classList.remove('recording');
  }
  Chat.voiceInput = voiceInput;

  /* ------------------------------ 初始化 ------------------------------ */
  Chat.init = function () {
    Store.onChange(function () { if (Chat.refreshCards) Chat.refreshCards(); });
    window.addEventListener('hashchange', function () {
      if (document.activeElement && document.activeElement.id === 'chatInput') document.activeElement.blur();
    });
    const stream = streamEl();
    if (stream) {
      stream.addEventListener('click', function (e) {
        const chip = e.target.closest('[data-chip]');
        if (chip) { submit(chip.dataset.chip); return; }
      });
    }
    const input = document.getElementById('chatInput');
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); submit(input.value); input.value = ''; }
      });

      /* 键盘弹起时收起底部导航（对话页），键盘关闭后再显现。
         主信号看输入框焦点：手机上 focus 就等于键盘弹起，不依赖各内核是否上报
         visualViewport 高度；同时给 #tabbar 直接加 kb-hidden，避免样式继承被覆盖。 */
      const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      const tabbarEl = document.getElementById('tabbar');
      const setKb = function (on) {
        const open = !!on;
        document.body.classList.toggle('kb-open', open);
        if (tabbarEl) tabbarEl.classList.toggle('kb-hidden', open);
      };
      const isPhoneLike = function () { return coarse || window.innerWidth <= 560; };
      const syncKb = function () {
        setKb(isPhoneLike() && document.activeElement === input);
      };
      input.addEventListener('focus', function () {
        syncKb();
        /* 键盘动画完成后补一次，顺便把对话滚动到底 */
        setTimeout(syncKb, 120);
        setTimeout(syncKb, 420);
        setTimeout(scrollBottom, 280);
      });
      input.addEventListener('blur', function () { setTimeout(syncKb, 180); });
      window.addEventListener('resize', function () { setTimeout(syncKb, 60); });
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', function () { setTimeout(syncKb, 60); });
        window.visualViewport.addEventListener('scroll', function () { setTimeout(syncKb, 60); });
      }
      window.addEventListener('orientationchange', function () {
        setTimeout(function () { setKb(false); }, 350);
      });
    }
    setChips();
    render(true);
    if (!Store.messages.length) {
      botSay('嗨，我是' + currentPersona().name + '。把要做的事说给我听就好。', { chips: defaultChips() });
    }
  };

  window.Chat = Chat;
})();
