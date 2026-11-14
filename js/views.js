/* ===========================================================
   轻声 LightTodo · 页面渲染（清单 / 详情 / 人设 / 通知 / 复盘 / 设置 / 权限）
   =========================================================== */
(function () {
  'use strict';

  const U = window.U;
  const esc = U.esc;
  const Views = {};

  /* =====================================================================
     1. 待办清单
     ===================================================================== */
  let listFilter = 'today';
  Views.listFilter = function (f) { listFilter = f; };

  function byDue(a, b) {
    const av = a.dueAt || 0, bv = b.dueAt || 0;
    return av - bv;
  }

  /** 只给日期标签，具体时刻由行尾 task-time 展示，避免重复 */
  function dateOnly(ts) {
    if (!ts) return '未安排时间';
    const diff = Math.round((U.startOfDay(ts) - U.startOfDay(Date.now())) / U.DAY);
    if (diff === 0) return '今天';
    if (diff === 1) return '明天';
    if (diff === 2) return '后天';
    if (diff === -1) return '昨天';
    return U.dateCn(ts) + ' 周' + U.weekdayCn(ts);
  }

  function taskItemHtml(t) {
    const overdue = t.status === 'pending' && t.dueAt && t.dueAt < Date.now();
    return '' +
      '<div class="task-item' + (t.status === 'done' ? ' is-done' : '') +
        (overdue ? ' is-overdue' : '') + (t.paused ? ' is-paused' : '') + '"' +
        ' data-action="openTask" data-id="' + t.id + '">' +
        '<button class="task-check" data-action="toggleTask" data-id="' + t.id + '" aria-label="标记完成">' +
          '<svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5"/></svg>' +
        '</button>' +
        '<div class="task-main">' +
          '<div class="task-title">' + esc(t.title) + '</div>' +
          '<div class="task-when">' + esc(dateOnly(t.dueAt)) +
            (overdue ? ' <span class="warn">· 已逾期</span>' : '') +
            (t.paused ? ' · 提醒已暂停' : '') +
          '</div>' +
          '<div class="task-tags">' +
            (t.priority === 'urgent' ? '<span class="tag red">紧急</span>' : '') +
            (t.repeat !== 'none' ? '<span class="tag">' + esc(Store.repeatLabel(t)) + '</span>' : '') +
            (t.breakDnd ? '<span class="tag warm">可突破免打扰</span>' : '') +
            ((t.snoozeCount || 0) > 0 ? '<span class="tag grey">延后 ' + t.snoozeCount + ' 次</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="task-side"><span class="task-time">' + (t.dueAt ? U.hm(t.dueAt) : '') + '</span></div>' +
      '</div>';
  }

  Views.list = function () {
    const body = document.getElementById('listBody');
    if (!body) return;
    const now = Date.now();
    const t0 = U.startOfDay(now);
    const weekEnd = t0 + 7 * U.DAY;
    const all = Store.tasks;

    let items = [];
    if (listFilter === 'done') {
      items = all.filter(function (t) { return t.status === 'done'; })
        .sort(function (a, b) { return (b.doneAt || 0) - (a.doneAt || 0); }).slice(0, 40);
    } else if (listFilter === 'all') {
      items = all.filter(function (t) { return t.status === 'pending'; }).sort(byDue);
    } else if (listFilter === 'week') {
      items = all.filter(function (t) {
        return t.status === 'pending' && t.dueAt && t.dueAt >= t0 && t.dueAt < weekEnd;
      }).sort(byDue);
    } else {
      items = all.filter(function (t) {
        return t.status === 'pending' && t.dueAt && t.dueAt < t0 + U.DAY;
      }).sort(byDue);
    }

    const pendingToday = all.filter(function (t) {
      return t.status === 'pending' && t.dueAt && t.dueAt < t0 + U.DAY;
    }).length;
    const doneToday = all.filter(function (t) {
      return t.status === 'done' && t.doneAt && U.isSameDay(t.doneAt, now);
    }).length;

    let html = '' +
      '<div class="list-summary">' +
        '<div><div class="ls-num">' + pendingToday + '<small>件</small></div>' +
        '<div class="ls-text">今天待办</div></div>' +
        '<div style="flex:1"></div>' +
        '<div style="text-align:right"><div class="ls-num" style="color:#C08447">' + doneToday + '<small>件</small></div>' +
        '<div class="ls-text">今天已完成</div></div>' +
      '</div>';

    if (!items.length) {
      const tips = {
        today: ['今天没有待办', '要不要跟我说一件？'],
        week: ['本周还没有安排', '试着说「周五下午三点交实验报告」'],
        all: ['清单是空的', '在对话里说一句就能新建'],
        done: ['还没有完成记录', '完成一件就会出现在这里']
      };
      const tip = tips[listFilter] || tips.today;
      body.innerHTML = html +
        '<div class="empty"><span class="emoji">🍃</span><p>' + tip[0] + '</p><p class="sub">' + tip[1] + '</p></div>';
      return;
    }

    if (listFilter === 'done' || listFilter === 'today') {
      html += items.map(taskItemHtml).join('');
    } else {
      let lastKey = null;
      items.forEach(function (t) {
        const key = t.dueAt ? U.dayKey(t.dueAt) : 'none';
        if (key !== lastKey) {
          let label = '未安排时间';
          if (t.dueAt) {
            const diff = Math.round((U.startOfDay(t.dueAt) - U.startOfDay(Date.now())) / U.DAY);
            const prefix = diff === 0 ? '今天 · ' : diff === 1 ? '明天 · ' : diff === 2 ? '后天 · ' : '';
            label = prefix + U.dateCn(t.dueAt) + ' 周' + U.weekdayCn(t.dueAt);
          }
          html += '<div class="day-label">' + label + '</div>';
          lastKey = key;
        }
        html += taskItemHtml(t);
      });
    }
    body.innerHTML = html;
  };

  /* =====================================================================
     2. 任务详情 / 编辑
     ===================================================================== */
  let edit = null;

  function newTaskDraft() {
    const base = U.startOfDay(Date.now()) + U.DAY + 9 * U.HOUR;
    return {
      title: '',
      note: '',
      dueAt: base,
      repeat: 'none',
      repeatDays: [],
      pre: [10],
      followUp: { min: Store.settings.followUpMin || 15, max: Store.settings.followUpMax || 3 },
      tone: Store.settings.persona,
      priority: 'normal',
      paused: false,
      breakDnd: false,
      voice: Store.settings.voiceOn,
      status: 'pending',
      source: 'manual'
    };
  }

  Views.task = function (id) {
    const body = document.getElementById('taskBody');
    if (!body) return;
    let source;
    if (id === 'new') {
      source = newTaskDraft();
      edit = { id: 'new', data: source, task: null };
      document.getElementById('taskHeadTitle').textContent = '新建任务';
      const del = document.querySelector('[data-action="deleteTask"]');
      if (del) del.hidden = true;
    } else {
      const t = Store.getTask(id);
      if (!t) { App.go('list'); return; }
      edit = { id: id, data: JSON.parse(JSON.stringify(t)), task: t };
      document.getElementById('taskHeadTitle').textContent = '任务详情';
      const del = document.querySelector('[data-action="deleteTask"]');
      if (del) del.hidden = false;
    }
    renderTaskForm();
  };

  function chipRow(list, current, action, dataKey, prefix) {
    return list.map(function (o) {
      const active = String(current) === String(o.value);
      return '<button class="chip' + (active ? ' active' : '') + '" data-action="' + action + '" data-' + dataKey + '="' + o.value + '">' + (prefix || '') + o.label + '</button>';
    }).join('');
  }

  function renderTaskForm() {
    const body = document.getElementById('taskBody');
    if (!body || !edit) return;
    const d = edit.data;
    const isNew = edit.id === 'new';
    const meta = edit.task;

    const repeatOptions = [
      { value: 'none', label: '不重复' },
      { value: 'daily', label: '每天' },
      { value: 'weekly', label: '每周' },
      { value: 'workday', label: '工作日' },
      { value: 'monthly', label: '每月' }
    ];
    const preOptions = [0, 5, 10, 30, 60].map(function (m) {
      return { value: m, label: m === 0 ? '不预提醒' : m + ' 分钟' };
    });
    const toneOptions = Persona.list().map(function (p) {
      return { value: p.id, label: p.emoji + ' ' + p.tag };
    });

    let html = '' +
      '<input class="detail-title-input" id="taskTitle" value="' + esc(d.title) + '" placeholder="要做什么？" />' +
      '<div class="field">' +
        '<label class="field-label">提醒时间</label>' +
        '<input class="input" type="datetime-local" id="taskTime" value="' + (d.dueAt ? U.toLocalInput(d.dueAt) : '') + '" />' +
      '</div>' +
      '<div class="field">' +
        '<label class="field-label">重复</label>' +
        '<div class="chips-row wrap">' + chipRow(repeatOptions, d.repeat, 'setRepeat', 'repeat') + '</div>' +
        '<div class="chips-row wrap" style="padding-top:6px">' +
          ['一', '二', '三', '四', '五', '六', '日'].map(function (w, i) {
            const day = i === 6 ? 0 : i + 1;
            const on = (d.repeatDays || []).indexOf(day) >= 0;
            return '<button class="chip' + (on ? ' active' : '') + '" data-action="toggleRepeatDay" data-day="' + day + '">周' + w + '</button>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<div class="field">' +
        '<label class="field-label">提前提醒</label>' +
        '<div class="chips-row wrap">' + chipRow(preOptions, (d.pre || [])[0], 'setPre', 'min') + '</div>' +
      '</div>' +
      '<div class="group">' +
        '<div class="form-row">' +
          '<div><div class="fr-label">超时追加提醒</div><div class="fr-sub">没完成就按间隔再提醒一次，默认 ' + d.followUp.min + ' 分钟</div></div>' +
          '<div class="fr-value">' +
            '<select class="input" id="selFollowMin" style="width:82px;padding:6px 6px;font-size:12.5px">' +
              [5, 10, 15, 30].map(function (m) { return '<option value="' + m + '"' + (d.followUp.min === m ? ' selected' : '') + '>' + m + '分</option>'; }).join('') +
            '</select>' +
            '<select class="input" id="selFollowMax" style="width:96px;padding:6px 6px;font-size:12.5px">' +
              [1, 2, 3, 5].map(function (m) { return '<option value="' + m + '"' + (d.followUp.max === m ? ' selected' : '') + '>最多' + m + '次</option>'; }).join('') +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div class="form-row">' +
          '<div><div class="fr-label">紧急任务</div><div class="fr-sub">自动切换严肃语气，可突破免打扰</div></div>' +
          '<label class="switch"><input type="checkbox" id="swUrgent"' + (d.priority === 'urgent' ? ' checked' : '') + '><span></span></label>' +
        '</div>' +
        '<div class="form-row">' +
          '<div><div class="fr-label">突破免打扰</div><div class="fr-sub">免打扰时段也照常提醒</div></div>' +
          '<label class="switch"><input type="checkbox" id="swBreakDnd"' + (d.breakDnd ? ' checked' : '') + '><span></span></label>' +
        '</div>' +
        '<div class="form-row">' +
          '<div><div class="fr-label">语音朗读</div><div class="fr-sub">提醒到达时朗读话术</div></div>' +
          '<label class="switch"><input type="checkbox" id="swVoice"' + (d.voice ? ' checked' : '') + '><span></span></label>' +
        '</div>' +
        '<div class="form-row">' +
          '<div><div class="fr-label">暂停提醒</div><div class="fr-sub">任务保留，只是暂时不提醒</div></div>' +
          '<label class="switch"><input type="checkbox" id="swPaused"' + (d.paused ? ' checked' : '') + '><span></span></label>' +
        '</div>' +
      '</div>' +
      '<div class="field">' +
        '<label class="field-label">提醒语气</label>' +
        '<div class="chips-row wrap">' + chipRow(toneOptions, d.tone, 'setTone', 'tone') + '</div>' +
      '</div>' +
      '<div class="field">' +
        '<label class="field-label">备注（可选）</label>' +
        '<textarea class="textarea" id="taskNote" placeholder="例如：在第 3 章，交之前检查一遍">' + esc(d.note || '') + '</textarea>' +
      '</div>';

    if (meta) {
      html += '' +
        '<div class="mini-stat">' +
          '<div><b>' + (meta.snoozeCount || 0) + '</b><span>延后次数</span></div>' +
          '<div><b>' + (meta.ignoreCount || 0) + '</b><span>被忽略</span></div>' +
          '<div><b>' + (meta.repeat !== 'none' ? '周期' : '单次') + '</b><span>提醒类型</span></div>' +
        '</div>' +
        '<div class="hint-card"><span class="hi">🕘</span><div>创建于 ' + U.fmtDue(meta.createdAt) +
          (meta.doneAt ? '，完成于 ' + U.fmtDue(meta.doneAt) : '') + '。提醒走「本地通知 + 系统闹钟兜底」，App 未打开也会尽量送达。</div></div>';
    }

    html += '' +
      '<div style="display:flex;gap:8px;margin-top:6px">' +
        '<button class="btn btn-primary" data-action="saveTask">' + (isNew ? '创建任务' : '保存修改') + '</button>' +
      '</div>' +
      (isNew ? '' : '<div style="display:flex;gap:8px;margin-top:8px">' +
        '<button class="btn" data-action="completeTask" data-id="' + edit.id + '">' + (d.status === 'done' ? '已完成' : '标记完成') + '</button>' +
        '<button class="btn" data-action="previewTask">试听提醒</button>' +
      '</div>');

    body.innerHTML = html;

    const $ = function (id) { return body.querySelector('#' + id); };
    const titleEl = $('taskTitle');
    if (titleEl) {
      titleEl.addEventListener('input', function () { edit.data.title = titleEl.value; });
    }
    const timeEl = $('taskTime');
    if (timeEl) {
      timeEl.addEventListener('change', function () {
        const ts = U.fromLocalInput(timeEl.value);
        if (ts) edit.data.dueAt = ts;
      });
    }
    const minEl = $('selFollowMin'), maxEl = $('selFollowMax');
    if (minEl && maxEl) {
      const sync = function () {
        edit.data.followUp = {
          min: parseInt(minEl.value, 10),
          max: parseInt(maxEl.value, 10)
        };
      };
      minEl.addEventListener('change', sync);
      maxEl.addEventListener('change', sync);
    }
    bindSwitch(body, 'swUrgent', function (v) {
      edit.data.priority = v ? 'urgent' : 'normal';
      if (v) edit.data.breakDnd = true;
    });
    bindSwitch(body, 'swBreakDnd', function (v) { edit.data.breakDnd = v; });
    bindSwitch(body, 'swVoice', function (v) { edit.data.voice = v; });
    bindSwitch(body, 'swPaused', function (v) { edit.data.paused = v; });
    const noteEl = $('taskNote');
    if (noteEl) noteEl.addEventListener('input', function () { edit.data.note = noteEl.value; });
  }

  function bindSwitch(root, id, cb) {
    const el = (root || document).querySelector('#' + id);
    if (!el) return;
    el.addEventListener('change', function () { cb(el.checked); });
  }

  Views.setRepeat = function (v) {
    if (!edit) return;
    edit.data.repeat = v;
    if (v !== 'weekly') edit.data.repeatDays = [];
    renderTaskForm();
  };
  Views.toggleRepeatDay = function (day) {
    if (!edit) return;
    const d = parseInt(day, 10);
    if (edit.data.repeat !== 'weekly') edit.data.repeat = 'weekly';
    const arr = edit.data.repeatDays || [];
    const i = arr.indexOf(d);
    if (i >= 0) arr.splice(i, 1); else arr.push(d);
    edit.data.repeatDays = arr.sort();
    renderTaskForm();
  };
  Views.setPre = function (min) {
    if (!edit) return;
    const m = parseInt(min, 10);
    edit.data.pre = m > 0 ? [m] : [];
    renderTaskForm();
  };
  Views.setTone = function (tone) {
    if (!edit) return;
    edit.data.tone = tone;
    renderTaskForm();
  };

  Views.saveTask = function () {
    if (!edit) return;
    const d = edit.data;
    d.title = (document.getElementById('taskTitle') || {}).value || d.title;
    if (!d.title || !d.title.trim()) {
      App.toast('先给任务起个名字');
      return;
    }
    if (!d.dueAt) { App.toast('请选择提醒时间'); return; }
    d.priority = d.priority === 'urgent' ? 'urgent' : 'normal';
    if (d.priority === 'urgent') d.breakDnd = true;

    if (edit.id === 'new') {
      const t = Store.addTask(d);
      Chat.lastTaskId = t.id;
      App.toast('已创建「' + t.title + '」');
      App.go('list');
    } else {
      Store.updateTask(edit.id, d);
      App.toast('已保存');
      App.go('list');
    }
  };

  Views.previewTask = function () {
    if (!edit) return;
    const tone = edit.data.priority === 'urgent' ? 'sharp' : edit.data.tone;
    const p = Persona.get(tone);
    const text = Persona.say('onTime', { title: edit.data.title || '这件事', task: edit.data }, p);
    Chat.push({ role: 'reminder', text: text, persona: p.id });
    Voice.speak(text, p.id);
    App.go('chat');
  };

  /* =====================================================================
     3. 人设与语气
     ===================================================================== */
  Views.persona = function () {
    const body = document.getElementById('personaBody');
    if (!body) return;
    const cur = Persona.current();
    const s = Store.settings;

    let html = '' +
      '<div class="preview-bubble"><b>当前助手 · ' + cur.emoji + ' ' + esc(cur.name) + '（' + cur.tag + '语气）</b>' +
        esc(cur.sample) + '</div>' +
      '<div class="group">' +
        '<div class="row" data-action="openAssistant"><div class="row-icon accent">🎨</div>' +
          '<div class="row-main"><div class="row-title">自定义助手档案</div>' +
          '<div class="row-sub">助手 ID、头像（表情 / 上传图片）、性格</div></div>' +
          '<div class="row-arrow"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></div></div>' +
      '</div>' +
      '<div class="hint-card"><span class="hi">🎭</span><div>切换人设会同时改变所有待办的提醒话术与语调；单个任务可在任务详情里单独指定语气。紧急任务始终使用「Aki · 干练」的严肃口吻。</div></div>' +
      '<div class="section-label">选择一个助手</div>' +
      '<div class="persona-grid">' +
      Persona.list().map(function (p) {
        return '' +
          '<div class="persona-card' + (p.id === cur.id ? ' active' : '') + '" data-action="setPersona" data-id="' + p.id + '">' +
            '<div class="persona-top">' +
              '<div class="avatar">' + p.emoji + '</div>' +
              '<div style="flex:1"><h4>' + p.name +
                (p.id === cur.id ? '<span class="tag">使用中</span>' : '') +
                (p.id === 'sharp' ? '<span class="tag red">紧急任务自动使用</span>' : '') +
              '</h4><p>' + p.tag + ' · ' + p.desc + '</p></div>' +
            '</div>' +
            '<div class="persona-sample">' + esc(p.sample) + '</div>' +
          '</div>';
      }).join('') +
      '</div>' +
      '<div class="group">' +
        '<div class="row" data-action="tryVoice"><div class="row-icon">🔊</div>' +
          '<div class="row-main"><div class="row-title">试听这个语气</div><div class="row-sub">用当前人设朗读一句提醒</div></div>' +
          '<div class="row-arrow"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></div></div>' +
        '<div class="row" data-action="go" data-to="notify"><div class="row-icon accent">🌙</div>' +
          '<div class="row-main"><div class="row-title">免打扰与通知</div><div class="row-sub">静默时段、追加提醒、闹钟兜底</div></div>' +
          '<div class="row-arrow"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></div></div>' +
      '</div>' +
      '<div class="field">' +
        '<label class="field-label">自定义开场白（留空使用人设默认）</label>' +
        '<textarea class="textarea" id="customGreet" placeholder="例如：早，今天先做哪件？">' + esc(s.customLines.greet || '') + '</textarea>' +
      '</div>' +
      '<div class="field">' +
        '<label class="field-label">自定义提醒后缀（每次提醒都会带上）</label>' +
        '<textarea class="textarea" id="customSuffix" placeholder="例如：先做十分钟就好。">' + esc(s.customLines.suffix || '') + '</textarea>' +
      '</div>' +
      '<button class="btn btn-primary" data-action="saveCustomLines">保存自定义话术</button>';

    body.innerHTML = html;
  };

  Views.saveCustomLines = function () {
    const greet = (document.getElementById('customGreet') || {}).value || '';
    const suffix = (document.getElementById('customSuffix') || {}).value || '';
    Store.settings.customLines = { greet: greet.trim(), suffix: suffix.trim() };
    Store.save();
    App.toast('自定义话术已保存');
  };

  Views.setPersona = function (id) {
    if (!Persona.all[id]) return;
    Store.settings.persona = id;
    // 整套提醒话术跟随人设：现有待办一并切换语气（紧急任务仍自动严肃）
    Store.tasks.forEach(function (t) {
      if (t.status === 'pending') t.tone = id;
    });
    Store.save();
    App.refreshBadges();
    Views.persona();
    const p = Persona.all[id];
    App.toast('语气基底已换成「' + p.tag + '」· 助手 ID 与头像保持不变');
    if (Store.settings.voiceOn) Voice.speak(p.sample, id);
  };

  Views.tryVoice = function () {
    const p = Persona.current();
    const text = Persona.say('onTime', { title: '高数作业' }, p);
    if (!Voice.speak(text, p.id)) App.toast('当前浏览器不支持语音播报');
    else App.toast('正在用「' + p.name + '」的声音朗读');
  };

  /* =====================================================================
     4. 免打扰与通知
     ===================================================================== */
  Views.notify = function () {
    const body = document.getElementById('notifyBody');
    if (!body) return;
    const s = Store.settings;
    const dnd = s.dnd;

    body.innerHTML = '' +
      '<div class="hint-card"><span class="hi">🛡</span><div>提醒优先走「本地通知 + 系统闹钟通道」，即使后台被清理也能尽量送达；免打扰时段的提醒会静默保存，结束后一次性补发。</div></div>' +

      '<div class="group">' +
        '<div class="form-row"><div><div class="fr-label">免打扰模式</div><div class="fr-sub">时段内提醒静默保存，不弹窗不朗读</div></div>' +
          '<label class="switch"><input type="checkbox" id="swDnd"' + (dnd.on ? ' checked' : '') + '><span></span></label></div>' +
        '<div class="time-range">' +
          '<input type="time" id="dndStart" value="' + dnd.start + '"><span>至</span>' +
          '<input type="time" id="dndEnd" value="' + dnd.end + '">' +
        '</div>' +
        '<div class="form-row"><div><div class="fr-label">紧急任务突破免打扰</div><div class="fr-sub">标记为紧急的任务照常提醒</div></div>' +
          '<label class="switch"><input type="checkbox" id="swAllowUrgent"' + (dnd.allowUrgent ? ' checked' : '') + '><span></span></label></div>' +
        '<div class="form-row"><div><div class="fr-label">当前状态</div><div class="fr-sub">' +
          (Reminder.isDnd() ? '正在免打扰时段，提醒会静默保存' : '不在免打扰时段，提醒正常弹出') +
          '</div></div><span class="tag ' + (Reminder.isDnd() ? 'warm' : '') + '">' +
          (Reminder.isDnd() ? '静默中' : '正常提醒') + '</span></div>' +
      '</div>' +

      '<div class="section-label">提醒节奏</div>' +
      '<div class="group">' +
        '<div class="form-row"><div><div class="fr-label">默认提前提醒</div><div class="fr-sub">新建任务时使用，可在任务里单独改</div></div>' +
          '<span class="tag">' + ((s.defaultPre || [])[0] || 0) + ' 分钟前</span></div>' +
        '<div class="time-range" style="gap:6px;flex-wrap:wrap">' +
          [0, 5, 10, 30, 60].map(function (m) {
            const on = (s.defaultPre || []).indexOf(m) >= 0;
            return '<button class="chip' + (on ? ' active' : '') + '" data-action="setDefaultPre" data-min="' + m + '">' +
              (m === 0 ? '不预提醒' : m + ' 分钟') + '</button>';
          }).join('') +
        '</div>' +
        '<div class="form-row"><div><div class="fr-label">超时追加提醒</div><div class="fr-sub">到点未完成后，每隔一段时间再提醒</div></div>' +
          '<div class="fr-value">' +
            '<select class="input" id="selFollowMin" style="width:82px;padding:6px 6px;font-size:12.5px">' +
              [5, 10, 15, 30].map(function (m) { return '<option value="' + m + '"' + (s.followUpMin === m ? ' selected' : '') + '>' + m + '分</option>'; }).join('') +
            '</select>' +
            '<select class="input" id="selFollowMax" style="width:96px;padding:6px 6px;font-size:12.5px">' +
              [1, 2, 3, 5].map(function (m) { return '<option value="' + m + '"' + (s.followUpMax === m ? ' selected' : '') + '>最多' + m + '次</option>'; }).join('') +
            '</select>' +
          '</div></div>' +
      '</div>' +

      '<div class="section-label">声音与兜底</div>' +
      '<div class="group">' +
        '<div class="form-row"><div><div class="fr-label">语音朗读</div><div class="fr-sub">' + (Voice.supported ? '用系统语音朗读提醒话术' : '当前浏览器不支持语音合成') + '</div></div>' +
          '<label class="switch"><input type="checkbox" id="swVoice"' + (s.voiceOn ? ' checked' : '') + '><span></span></label></div>' +
        '<div class="form-row"><div><div class="fr-label">提示音</div><div class="fr-sub">提醒到达时播放短提示音</div></div>' +
          '<label class="switch"><input type="checkbox" id="swSound"' + (s.soundOn ? ' checked' : '') + '><span></span></label></div>' +
        '<div class="form-row"><div><div class="fr-label">系统闹钟兜底</div><div class="fr-sub">原生版：同时写入系统闹钟通道，避免后台推送失效</div></div>' +
          '<label class="switch"><input type="checkbox" id="swAlarm"' + (s.alarmFallback ? ' checked' : '') + '><span></span></label></div>' +
        '<div class="row" data-action="go" data-to="about"><div class="row-icon">🔐</div>' +
          '<div class="row-main"><div class="row-title">权限清单</div><div class="row-sub">通知、闹钟、麦克风、日历</div></div>' +
          '<div class="row-arrow"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></div></div>' +
      '</div>' +

      '<div class="section-label">演示</div>' +
      '<button class="btn" data-action="demoTask">10 秒后弹一条提醒（演示用）</button>';

    bindSwitch(body, 'swDnd', function (v) { Store.settings.dnd.on = v; Store.save(); Views.notify(); });
    bindSwitch(body, 'swAllowUrgent', function (v) { Store.settings.dnd.allowUrgent = v; Store.save(); });
    bindSwitch(body, 'swVoice', function (v) { Store.settings.voiceOn = v; Store.save(); });
    bindSwitch(body, 'swSound', function (v) { Store.settings.soundOn = v; Store.save(); });
    bindSwitch(body, 'swAlarm', function (v) {
      Store.settings.alarmFallback = v;
      Store.save();
      App.toast(v ? '已开启闹钟兜底（原生版生效）' : '已关闭闹钟兜底');
    });

    const ds = body.querySelector('#dndStart');
    const de = body.querySelector('#dndEnd');
    if (ds) ds.addEventListener('change', function () { Store.settings.dnd.start = ds.value; Store.save(); Views.notify(); });
    if (de) de.addEventListener('change', function () { Store.settings.dnd.end = de.value; Store.save(); Views.notify(); });

    const minEl = body.querySelector('#selFollowMin');
    const maxEl = body.querySelector('#selFollowMax');
    const sync = function () {
      Store.settings.followUpMin = parseInt(minEl.value, 10);
      Store.settings.followUpMax = parseInt(maxEl.value, 10);
      Store.save();
      App.toast('追加提醒设置已更新');
    };
    if (minEl && maxEl) {
      minEl.addEventListener('change', sync);
      maxEl.addEventListener('change', sync);
    }
  };

  Views.setDefaultPre = function (m) {
    Store.settings.defaultPre = [parseInt(m, 10)];
    Store.save();
    Views.notify();
  };

  /* =====================================================================
     5. 数据复盘
     ===================================================================== */
  Views.review = function () {
    const body = document.getElementById('reviewBody');
    if (!body) return;
    const st = Store.stats();
    const C = 2 * Math.PI * 40;
    const offset = C * (1 - st.rate / 100);
    const maxBar = Math.max(1, Math.max.apply(null, st.bars.map(function (b) { return b.n; })));

    let html = '' +
      '<div class="stat-hero">' +
        '<div class="ring"><svg width="96" height="96" viewBox="0 0 96 96">' +
          '<defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">' +
            '<stop offset="0%" stop-color="#A8DCC6"/><stop offset="100%" stop-color="#6FBD9F"/>' +
          '</linearGradient></defs>' +
          '<circle class="ring-bg" cx="48" cy="48" r="40"/>' +
          '<circle class="ring-fg" cx="48" cy="48" r="40" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + offset.toFixed(1) + '"/>' +
        '</svg><div class="ring-center"><div><b>' + st.rate + '%</b><small>近 7 天完成率</small></div></div></div>' +
        '<div class="stat-hero-info">' +
          '<h3>这周的状态</h3>' +
          '<div class="kv"><span>完成 / 应完成</span><b>' + st.doneCount + ' / ' + st.totalCount + '</b></div>' +
          '<div class="kv"><span>逾期未完成</span><b>' + st.overdueCount + ' 件</b></div>' +
          '<div class="kv"><span>连续完成</span><b>' + st.streak + ' 天</b></div>' +
        '</div>' +
      '</div>' +

      '<div class="card" style="margin-bottom:14px">' +
        '<div class="card-title"><h3>近 7 天完成量</h3><span>共 ' + st.weekDone + ' 件</span></div>' +
        '<div class="bars">' +
        st.bars.map(function (b) {
          const h = Math.max(5, Math.round(b.n / maxBar * 100));
          return '<div class="bar-col' + (b.today ? ' today' : '') + '">' +
            '<div class="bar-num">' + (b.n || '') + '</div>' +
            '<div class="bar-track"><div class="bar-fill" style="height:' + h + '%"></div></div>' +
            '<div class="bar-label">' + b.label.replace('周', '') + '</div></div>';
        }).join('') +
        '</div>' +
      '</div>' +

      '<div class="mini-stat">' +
        '<div><b>' + st.avgDelay + '</b><span>平均延后（分钟）</span></div>' +
        '<div><b>' + st.snoozeTotal + '</b><span>累计延后次数</span></div>' +
        '<div><b>' + st.pendingCount + '</b><span>手上待办</span></div>' +
      '</div>' +

      '<div class="card" style="margin-bottom:14px">' +
        '<div class="card-title"><h3>拖延榜</h3><span>' + (st.topDelay.length ? '按延后次数排序' : '暂无拖延记录') + '</span></div>' +
        (st.topDelay.length
          ? st.topDelay.map(function (d) {
              return '<div class="delay-row" data-action="openTask" data-id="' + d.id + '">' +
                '<span class="dr-title">' + esc(d.title) + '</span>' +
                '<span class="dr-num">延后 ' + d.n + ' 次</span></div>';
            }).join('')
          : '<div class="delay-row"><span class="dr-title" style="color:#95A6A0">这周没有拖延记录，很稳。</span></div>') +
      '</div>' +

      '<div class="hint-card"><span class="hi">🌿</span><div>复盘只统计你已有的任务，不额外增加打卡负担。想看助手怎么读这份数据，点右上角「让助手解读」。</div></div>' +
      '<button class="btn btn-primary" data-action="genReview">让助手解读这周</button>';

    body.innerHTML = html;
  };

  Views.genReview = function () {
    const st = Store.stats();
    Chat.push({ role: 'report', stats: st });
    Chat.botSay(Persona.say('review', st, Persona.current()), { chips: ['打开复盘页', '今天还有什么'] });
    App.go('chat');
  };

  /* =====================================================================
     6. 我的 / 设置
     ===================================================================== */
  Views.settings = function () {
    const body = document.getElementById('settingsBody');
    if (!body) return;
    const s = Store.settings;
    const p = Persona.current();
    const st = Store.stats();
    const calCount = Store.tasks.filter(function (t) { return t.source === 'calendar'; }).length;
    const nativeCal = !!nativeCalendarApi();

    body.innerHTML = '' +
      '<div class="profile-card" data-action="openAssistant">' +
        '<div class="avatar">' + Persona.avatarHTML(p) + '</div>' +
        '<div style="flex:1"><h2>' + esc(p.name) + ' · ' + esc(p.tag) + '</h2>' +
          '<p>点击自定义助手 ID、头像与性格</p></div>' +
        '<div class="row-arrow"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></div>' +
      '</div>' +

      '<div class="section-label">提醒</div>' +
      '<div class="group">' +
        '<div class="row" data-action="go" data-to="notify"><div class="row-icon">🌙</div>' +
          '<div class="row-main"><div class="row-title">免打扰与通知</div>' +
          '<div class="row-sub">' + (s.dnd.on ? '免打扰 ' + s.dnd.start + ' - ' + s.dnd.end : '免打扰已关闭') +
          ' · 提前 ' + ((s.defaultPre || [])[0] || 0) + ' 分钟</div></div>' +
          '<div class="row-arrow"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></div></div>' +
        '<div class="row" data-action="go" data-to="persona"><div class="row-icon">🎭</div>' +
          '<div class="row-main"><div class="row-title">人设与语气</div><div class="row-sub">温柔 / 俏皮 / 干练 / 简约</div></div>' +
          '<div class="row-arrow"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></div></div>' +
        '<div class="row" data-action="demoTask"><div class="row-icon accent">⏱</div>' +
          '<div class="row-main"><div class="row-title">演示一条提醒</div><div class="row-sub">10 秒后弹出气泡并播报</div></div>' +
          '<div class="row-arrow"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></div></div>' +
      '</div>' +

      '<div class="section-label">扩展</div>' +
      '<div class="group">' +
        '<div class="form-row"><div><div class="fr-label">桌面小组件</div><div class="fr-sub">原生版：在桌面显示今日待办与完成率</div></div>' +
          '<label class="switch"><input type="checkbox" id="swWidget"' + (s.widgetOn ? ' checked' : '') + '><span></span></label></div>' +
        '<div class="row" data-action="importCalendar"><div class="row-icon accent">📅</div>' +
          '<div class="row-main"><div class="row-title">' + (nativeCal ? '从系统日历导入' : '从日历文件导入') + '</div>' +
          '<div class="row-sub">' + (calCount ? '已导入 ' + calCount + ' 条（来自日历）' : (nativeCal ? '自动读取未来 14 天的日程，确认后导入' : '选择日历导出的 .ics 文件，本地解析')) + '</div></div>' +
          '<div class="row-arrow"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></div></div>' +
        '<div class="row" data-action="installApp"><div class="row-icon">📲</div>' +
          '<div class="row-main"><div class="row-title">安装到桌面</div>' +
          '<div class="row-sub">' + ((typeof App !== 'undefined' && App.isStandalone && App.isStandalone()) ? '已作为独立 App 运行' : '添加到主屏幕，全屏打开、断网可用（PWA）') + '</div></div>' +
          '<div class="row-arrow"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></div></div>' +
        '<div class="row" data-action="go" data-to="about"><div class="row-icon">🔐</div>' +
          '<div class="row-main"><div class="row-title">权限与说明</div><div class="row-sub">通知 / 闹钟 / 麦克风 / 日历</div></div>' +
          '<div class="row-arrow"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></div></div>' +
      '</div>' +

      '<div class="section-label">数据</div>' +
      '<div class="group">' +
        '<div class="row" data-action="resetData"><div class="row-icon">🧹</div>' +
          '<div class="row-main"><div class="row-title">清空并重置演示数据</div><div class="row-sub">当前有 ' + Store.tasks.length + ' 条任务记录</div></div>' +
          '<div class="row-arrow"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></div></div>' +
        '<div class="row" data-action="replayGuide"><div class="row-icon">👋</div>' +
          '<div class="row-main"><div class="row-title">重新看新手引导</div><div class="row-sub">三步了解怎么用</div></div>' +
          '<div class="row-arrow"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></div></div>' +
      '</div>' +

      '<div class="about-text">轻声 LightTodo · v0.1 原型<br>' +
        '完成率 ' + st.rate + '% · 任务 ' + Store.tasks.length + ' 条 · 数据仅保存在本机浏览器。</div>';

    bindSwitch(body, 'swWidget', function (v) {
      Store.settings.widgetOn = v;
      Store.save();
      App.toast(v ? '小组件已添加到桌面（原生版生效）' : '已移除小组件');
    });
  };

  /* =====================================================================
     6.5 从系统日历导入
     App（Capacitor）版：原生只读查询未来 14 天日程，预览确认后写入；
     网页版没有系统日历权限，改为解析用户主动选择的 .ics 文件。
     两种情况都不会悄悄往清单里塞日程。
     ===================================================================== */
  let icsDraft = null;        // 本次读出的待导入日程
  let icsSourceLabel = '';    // 预览页显示的来源
  let icsRawLabel = '';       // 写入任务时记录的 rawText
  let calSettingsAutoOpened = false;   // 本次会话是否已自动跳过系统权限页
  let calResumeHandler = null;         // 从权限页返回时的自动重读监听

  /** 原生壳里才能读系统日历；网页返回 null，走 .ics 通道 */
  function nativeCalendarApi() {
    const cap = (typeof window !== 'undefined') ? window.Capacitor : null;
    if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return null;
    if (typeof cap.nativePromise !== 'function') return null;
    return cap;
  }

  function icsUnescape(s) {
    return String(s || '')
      .replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
      .trim();
  }

  function icsParseDate(val, dateOnly) {
    const v = String(val || '').trim();
    if (dateOnly || /^\d{8}$/.test(v)) {
      const m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
      if (!m) return null;
      // 全天日程没有具体时刻，记到当天 9:00
      return new Date(+m[1], +m[2] - 1, +m[3], 9, 0).getTime();
    }
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
    if (!m) return null;
    if (m[7]) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
  }

  function icsParse(text) {
    const LF = String.fromCharCode(10);
    const lines = String(text)
      .split(String.fromCharCode(13) + LF).join(LF)
      .replace(new RegExp(LF + '[ ' + String.fromCharCode(9) + ']', 'g'), '')
      .split(LF);
    const events = [];
    let cur = null;
    lines.forEach(function (line) {
      const upper = line.trim().toUpperCase();
      if (upper === 'BEGIN:VEVENT') { cur = {}; return; }
      if (upper === 'END:VEVENT') {
        if (cur && cur.dtstart && cur.summary) events.push(cur);
        cur = null;
        return;
      }
      if (!cur) return;
      const sep = line.indexOf(':');
      if (sep < 0) return;
      const head = line.slice(0, sep).split(';');
      const key = head[0].toUpperCase();
      const params = head.slice(1).join(';').toUpperCase();
      const val = line.slice(sep + 1);
      if (key === 'SUMMARY') cur.summary = icsUnescape(val);
      else if (key === 'DTSTART') cur.dtstart = icsParseDate(val, /VALUE=DATE(;|$)/.test(params));
      else if (key === 'RRULE') cur.rrule = val.trim();
      else if (key === 'LOCATION') cur.location = icsUnescape(val);
    });
    return events;
  }

  /** 展开未来 14 天内的日程（重复日程按 RRULE 展开），并与已导入的同类任务去重 */
  function icsExpand(events) {
    const now = Date.now();
    const from = now - 5 * U.MIN;
    const to = U.startOfDay(now) + 14 * U.DAY;
    const existing = Store.tasks.filter(function (t) { return t.source === 'calendar'; });
    const out = [];
    const seen = {};

    events.forEach(function (ev) {
      const rule = /^FREQ=(DAILY|WEEKLY)/i.test(ev.rrule || '') ? String(ev.rrule).toUpperCase() : '';
      const untilM = /UNTIL=([0-9TZ]+)/.exec(rule);
      const until = untilM ? (icsParseDate(untilM[1], /^\d{8}$/.test(untilM[1])) || 0) : 0;
      const bydayM = /BYDAY=([A-Z,]+)/.exec(rule);
      const byday = bydayM ? bydayM[1].split(',').map(function (d) {
        return ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].indexOf(d);
      }).filter(function (d) { return d >= 0; }) : [];
      const daily = /FREQ=DAILY/.test(rule);
      const weekly = /FREQ=WEEKLY/.test(rule);
      const startDay = U.startOfDay(ev.dtstart);
      const timeOfDay = ev.dtstart - startDay;

      const push = function (ts) {
        if (ts < from || ts > to) return;
        const key = ev.summary + '|' + ts;
        if (seen[key]) return;
        if (existing.some(function (t) { return t.title === ev.summary && Math.abs((t.dueAt || 0) - ts) < U.MIN; })) return;
        seen[key] = 1;
        out.push({ title: ev.summary, dueAt: ts, repeat: daily ? 'daily' : (weekly ? 'weekly' : 'none') });
      };

      if (!rule) { push(ev.dtstart); return; }
      for (let i = 0, day = startDay; day <= to && i < 120; i++, day += U.DAY) {
        const ts = day + timeOfDay;
        if (until && ts > until) break;
        const wd = new Date(day).getDay();
        const weekMatch = byday.length ? byday.indexOf(wd) >= 0 : ((day - startDay) / U.DAY) % 7 === 0;
        if (daily ? (!byday.length || byday.indexOf(wd) >= 0) : (weekly && weekMatch)) push(ts);
      }
    });

    return out.sort(function (a, b) { return a.dueAt - b.dueAt; }).slice(0, 50);
  }

  function icsSheet(html) {
    const layer = document.getElementById('layer');
    if (!layer) return null;
    layer.innerHTML = '<div class="mask" data-action="closeSheet"></div>' + html;
    return layer;
  }

  Views.importCalendar = function () {
    const cap = nativeCalendarApi();
    if (cap) { readNativeCalendar(cap); return; }
    Views.importCalendarIcs();
  };

  /* 网页版：选择 .ics 文件 → 本机解析 → 预览 */
  Views.importCalendarIcs = function () {
    stopResumeRetry();
    const layer = icsSheet(
      '<div class="reminder-sheet cal-sheet">' +
        '<div class="sheet-grab"></div>' +
        '<h3>从日历文件导入</h3>' +
        '<p class="cal-desc">网页版没有系统日历权限。请先在手机「日历」里把日程导出为 <b>.ics</b> 文件，再在这里选择；文件只在本机解析，不会上传。装 App 版即可自动读取系统日历。</p>' +
        '<div class="cal-steps">① 打开系统日历 → 设置 / 分享 → 导出 .ics<br>② 回到这里点下面的按钮选择文件<br>③ 核对预览后勾选要导入的日程</div>' +
        '<button class="btn btn-primary" data-action="pickIcs">选择 .ics 文件</button>' +
        '<button class="btn btn-ghost" data-action="closeSheet">取消</button>' +
        '<input type="file" id="icsFile" accept=".ics,text/calendar,text/plain" hidden>' +
      '</div>'
    );
    if (!layer) return;
    const input = layer.querySelector('#icsFile');
    if (!input) return;
    input.addEventListener('change', function () {
      const f = input.files && input.files[0];
      if (!f) return;
      const name = f.name || '日历.ics';
      const reader = new FileReader();
      reader.onload = function () {
        let items = [];
        try { items = icsExpand(icsParse(String(reader.result || ''))); } catch (e) { items = []; }
        if (!items.length) { App.toast('没读到未来 14 天内可导入的日程'); return; }
        showIcsPreview(items, name, '从日历文件导入：' + name);
      };
      reader.onerror = function () { App.toast('文件读取失败，换个文件试试'); };
      reader.readAsText(f, 'utf-8');
    });
  };

  /* App 版：原生只读查询系统日历（首次会弹系统权限） */
  function readNativeCalendar(cap) {
    stopResumeRetry();
    icsSheet(
      '<div class="reminder-sheet cal-sheet">' +
        '<div class="sheet-grab"></div>' +
        '<h3>正在读取系统日历</h3>' +
        '<p class="cal-desc">只读未来 14 天的日程，不会修改你的日历。第一次使用会弹出系统权限请求，请选择「允许」。</p>' +
        '<div class="cal-loading"><span class="cal-spinner"></span>读取中…</div>' +
        '<button class="btn btn-ghost" data-action="closeSheet">取消</button>' +
      '</div>'
    );
    const from = Date.now() - 5 * U.MIN;
    const to = U.startOfDay(Date.now()) + 14 * U.DAY;
    cap.nativePromise('CalendarReader', 'list', { start: from, end: to }).then(function (res) {
      const layer = document.getElementById('layer');
      if (!layer || !layer.querySelector('.cal-loading')) return;   // 弹层已被关掉
      const items = nativeEventsToItems((res && res.events) || []);
      if (!items.length) {
        calSettingsAutoOpened = false;
        calendarFallback('未来 14 天没有读到日程。可以先在系统日历里加一条，或改用 .ics 文件导入。', false);
        return;
      }
      calSettingsAutoOpened = false;
      showIcsPreview(items, '系统日历 · 未来 14 天', '从系统日历读取');
    }).catch(function (err) {
      const layer = document.getElementById('layer');
      if (!layer || !layer.querySelector('.cal-loading')) return;
      const msg = String((err && (err.message || err.errorMessage || err.error)) || '');
      const denied = /deni|permission|权限|grant/i.test(msg);
      if (!denied) {
        calendarFallback('读取日历失败' + (msg ? '：' + msg : '，稍后再试。'), false);
        return;
      }
      // 拒绝权限：直接打开本应用的系统权限页，回来后自动重读，不让用户自己找路径
      const hint = calSettingsAutoOpened
        ? '日历权限还没开。点下面的「打开权限设置」，在「日历」里选「允许」，返回后会自动重新读取。'
        : '日历权限被拒绝了。已为你打开「应用权限」页：点「日历」→「允许」，返回后会自动重新读取。';
      calendarFallback(hint, true);
      if (!calSettingsAutoOpened) {
        calSettingsAutoOpened = true;
        openCalendarSettings(cap);
        listenResumeRetry(cap);
      }
    });
  }

  function calendarFallback(msg, withSettings) {
    icsSheet(
      '<div class="reminder-sheet cal-sheet">' +
        '<div class="sheet-grab"></div>' +
        '<h3>' + (withSettings ? '需要日历权限' : '没能自动读取') + '</h3>' +
        '<p class="cal-desc">' + esc(msg) + '</p>' +
        '<button class="btn btn-primary" data-action="retryNativeCalendar">重新读取</button>' +
        (withSettings ? '<button class="btn" data-action="openCalSettings">打开权限设置</button>' : '') +
        '<button class="btn" data-action="pickIcsFallback">改用 .ics 文件导入</button>' +
        '<button class="btn btn-ghost" data-action="closeSheet">取消</button>' +
      '</div>'
    );
  }

  /** 直接跳到本应用的系统权限页 */
  function openCalendarSettings(cap) {
    if (!cap) return;
    try {
      cap.nativePromise('CalendarReader', 'openAppSettings', {}).catch(function () {});
    } catch (e) { /* 旧版本包没有这个方法时忽略 */ }
  }

  function stopResumeRetry() {
    if (calResumeHandler) {
      document.removeEventListener('visibilitychange', calResumeHandler);
      calResumeHandler = null;
    }
  }

  /** 从系统权限页回来后自动重读一次（只自动试一次，避免反复跳转） */
  function listenResumeRetry(cap) {
    stopResumeRetry();
    calResumeHandler = function () {
      if (document.visibilityState !== 'visible') return;
      if (!document.querySelector('.cal-sheet')) { stopResumeRetry(); return; }
      stopResumeRetry();
      readNativeCalendar(cap);
    };
    document.addEventListener('visibilitychange', calResumeHandler);
  }

  Views.openCalendarSettings = function () {
    const cap = nativeCalendarApi();
    if (!cap) return;
    openCalendarSettings(cap);
    listenResumeRetry(cap);
  };

  /** 原生日程 → 待办草稿：全天记到 9:00，过去的不导入，按「标题 + 时间」去重 */
  function nativeEventsToItems(events) {
    const now = Date.now();
    const from = now - 5 * U.MIN;
    const to = U.startOfDay(now) + 14 * U.DAY;
    const existing = Store.tasks.filter(function (t) { return t.source === 'calendar'; });
    const out = [];
    const seen = {};
    events.forEach(function (ev) {
      const title = String((ev && ev.title) || '').trim();
      if (!title) return;
      let ts = Number(ev.start) || 0;
      if (ev.allDay) ts = U.startOfDay(ts) + 9 * U.HOUR;
      if (ts < from || ts > to) return;
      const key = title + '|' + ts;
      if (seen[key]) return;
      if (existing.some(function (t) { return t.title === title && Math.abs((t.dueAt || 0) - ts) < U.MIN; })) return;
      seen[key] = 1;
      out.push({ title: title, dueAt: ts, repeat: 'none', where: String(ev.calendar || '') });
    });
    return out.sort(function (a, b) { return a.dueAt - b.dueAt; }).slice(0, 50);
  }

  function showIcsPreview(items, sourceLabel, rawLabel) {
    icsDraft = items;
    icsSourceLabel = sourceLabel || '';
    icsRawLabel = rawLabel || '从日历导入';
    const rows = items.map(function (it, i) {
      const meta = [U.fmtDue(it.dueAt), it.repeat === 'daily' ? '每天' : (it.repeat === 'weekly' ? '每周' : ''), it.where]
        .filter(Boolean).join(' · ');
      return '<label class="ics-item">' +
        '<input type="checkbox" class="ics-check" data-idx="' + i + '" checked>' +
        '<span class="it-main"><span class="it-title">' + esc(it.title) + '</span>' +
        '<span class="it-meta">' + esc(meta) + '</span></span></label>';
    }).join('');
    icsSheet(
      '<div class="reminder-sheet cal-sheet">' +
        '<div class="sheet-grab"></div>' +
        '<h3>识别到 ' + items.length + ' 条日程</h3>' +
        '<p class="cal-desc">来源：' + esc(icsSourceLabel) + '（仅列出未来 14 天）。取消勾选不想导入的。</p>' +
        '<div class="ics-list">' + rows + '</div>' +
        '<button class="btn btn-primary" data-action="importIcsConfirm">导入所选日程</button>' +
        '<button class="btn btn-ghost" data-action="closeSheet">取消</button>' +
      '</div>'
    );
  }

  Views.importIcsConfirm = function () {
    const layer = document.getElementById('layer');
    if (!layer || !icsDraft) return;
    const picks = [];
    layer.querySelectorAll('.ics-check').forEach(function (box) {
      if (!box.checked) return;
      const it = icsDraft[parseInt(box.dataset.idx, 10)];
      if (it) picks.push(it);
    });
    if (!picks.length) { App.toast('一条也没勾选'); return; }
    picks.forEach(function (it) {
      Store.addTask({
        title: it.title,
        dueAt: it.dueAt,
        repeat: it.repeat,
        tone: 'minimal',
        pre: [15],
        source: 'calendar',
        rawText: icsRawLabel
      });
    });
    icsDraft = null;
    icsSourceLabel = '';
    icsRawLabel = '';
    App.closeReminder();
    Views.settings();
    App.toast('已导入 ' + picks.length + ' 条日程');
  };

  /* =====================================================================
     7. 权限与说明
     ===================================================================== */
  const PERMISSIONS = [
    {
      icon: '🔔', name: '通知权限', state: '原型内模拟', on: true,
      desc: '发送到点与追加提醒。原生版首次新建任务时申请；拒绝后仅在打开 App 时以对话气泡提醒。'
    },
    {
      icon: '⏰', name: '精确闹钟（Android）', state: '兜底通道', on: true,
      desc: '用系统闹钟通道写入提醒，规避后台推送被清理导致漏提醒；iOS 对应本地通知 + 关键警报。'
    },
    {
      icon: '🎙', name: '麦克风', state: '使用时询问', on: false,
      desc: '仅用于语音输入任务，不录音、不上传、不留存；拒绝后用键盘输入即可。'
    },
    {
      icon: '📅', name: '日历读取（仅 App）', state: '导入时申请', on: false,
      desc: '只读未来 14 天的系统日程用于生成待办，不改动日历、不上传；拒绝时会直接跳到系统权限页，返回后自动重试。'
    },
    {
      icon: '🔊', name: '语音合成（TTS）', state: '系统能力', on: true,
      desc: '朗读人设话术，语速与音调随人设变化；可在通知设置里关闭。'
    },
    {
      icon: '🔋', name: '忽略电池优化', state: '可选', on: false,
      desc: 'Android 建议开启，提升后台提醒存活率；不开启时依赖闹钟兜底。'
    }
  ];

  Views.about = function () {
    const body = document.getElementById('aboutBody');
    if (!body) return;
    body.innerHTML = '' +
      '<div class="hint-card"><span class="hi">📌</span><div>本原型不请求真实系统权限，以下清单用于说明原生版本需要哪些权限、何时申请、被拒绝后如何降级。</div></div>' +
      '<div class="group" style="margin-bottom:14px">' +
      PERMISSIONS.map(function (p) {
        return '<div class="perm-item">' +
          '<div class="pi-icon">' + p.icon + '</div>' +
          '<div style="flex:1"><h5>' + p.name + '<span class="pi-state' + (p.on ? ' on' : '') + '">' + p.state + '</span></h5>' +
          '<p>' + p.desc + '</p></div></div>';
      }).join('') +
      '</div>' +

      '<div class="section-label">提醒可靠送达策略</div>' +
      '<div class="group" style="padding:12px 14px">' +
        '<div class="report-line"><span>① 前台</span><b>每秒扫描 + 对话气泡</b></div>' +
        '<div class="report-line"><span>② 后台</span><b>本地通知 / 精确闹钟</b></div>' +
        '<div class="report-line"><span>③ 兜底</span><b>系统闹钟通道 + 静默队列补发</b></div>' +
        '<div class="report-line"><span>④ 免打扰</span><b>静默保存，结束后一次性补发</b></div>' +
      '</div>' +

      '<div class="section-label">必选 / 备选</div>' +
      '<div class="group" style="padding:12px 14px">' +
        '<div class="report-line"><span>必选</span><b>对话建任务 · 定时提醒 · 人设语气 · 清单视图</b></div>' +
        '<div class="report-line"><span>备选</span><b>位置触发 · 跨端同步 · 桌面小组件深度定制</b></div>' +
      '</div>' +
      '<div class="about-text">优先级：对话体验 &gt; 提醒可靠性 &gt; 统计拓展。</div>';
  };

  window.Views = Views;
})();
