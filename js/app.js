/* ===========================================================
   轻声 LightTodo · 路由 / 弹层 / 全局事件
   =========================================================== */
(function () {
  'use strict';

  const U = window.U;
  const esc = U.esc;
  const App = {};

  const SUB_PAGES = ['persona', 'notify', 'about', 'task'];
  const KIND_LABEL = { pre: '提前提醒', onTime: '到点提醒', followUp: '超时追加提醒' };
  let lastReminder = null;
  let toastTimer = null;

  /* ------------------------------ 路由 ------------------------------ */
  function parseHash() {
    const h = String(location.hash || '').replace(/^#\/?/, '');
    const parts = h.split('/');
    return { name: parts[0] || 'chat', arg: parts[1] || '' };
  }

  App.go = function (name, arg) {
    const hash = '#/' + name + (arg ? '/' + arg : '');
    if (location.hash === hash) { route(); return; }
    location.hash = hash;
  };

  App.back = function () {
    if (history.length > 1) history.back();
    else App.go('chat');
  };

  function route() {
    const r = parseHash();
    const key = r.name === 'task' ? 'task' : r.name;
    const screen = document.querySelector('.screen[data-screen="' + key + '"]');
    if (!screen) { App.go('chat'); return; }

    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.toggle('active', s === screen);
    });

    const isSub = SUB_PAGES.indexOf(key) >= 0;
    const tabbar = document.getElementById('tabbar');
    if (tabbar) tabbar.classList.toggle('hidden', isSub);
    document.querySelectorAll('.tabbar button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === key);
    });

    switch (key) {
      case 'chat':
        Chat.render(false);
        setTimeout(function () {
          const s = document.getElementById('chatStream');
          if (s) s.scrollTop = s.scrollHeight;
        }, 30);
        break;
      case 'list':
        Views.list();
        break;
      case 'review':
        Views.review();
        break;
      case 'settings':
        Views.settings();
        break;
      case 'persona':
        Views.persona();
        break;
      case 'notify':
        Views.notify();
        break;
      case 'about':
        Views.about();
        break;
      case 'task':
        if (!r.arg) { App.go('list'); return; }
        Views.task(r.arg);
        break;
      default:
        App.go('chat');
    }
    App.refreshBadges();
  }

  /* ------------------------------ 顶部信息 ------------------------------ */
  App.refreshBadges = function () {
    const p = Persona.current();
    const head = document.getElementById('headAvatar');
    if (head) head.innerHTML = Persona.avatarHTML(p);
    const name = document.getElementById('headName');
    if (name) name.textContent = p.name;
    const sub = document.getElementById('headSub');
    if (sub) {
      const dnd = window.Reminder && Reminder.isDnd();
      sub.textContent = p.sub + (dnd ? ' · 免打扰中' : '');
    }
    App.updateSilentBadge();
  };

  App.updateSilentBadge = function () {
    const badge = document.getElementById('silentBadge');
    if (!badge) return;
    const n = Store.state.silentQueue.length;
    badge.hidden = n === 0;
    badge.textContent = '静默 ' + n;
  };

  /* ------------------------------ Toast ------------------------------ */
  App.toast = function (text) {
    const layer = document.getElementById('layer');
    if (!layer) return;
    const old = layer.querySelector('.toast');
    if (old) old.remove();
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    layer.appendChild(el);
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.remove(); }, 2200);
  };

  /* ------------------------------ 确认弹层与撤销条 ------------------------------ */
  App.closeLayer = function () {
    const layer = document.getElementById('layer');
    if (layer) layer.innerHTML = '';
  };

  /** 底部撤销条：删除后 6 秒内可一键找回 */
  App.snackbar = function (text, actionLabel, onAct) {
    const layer = document.getElementById('layer');
    if (!layer) return;
    const old = layer.querySelector('.snackbar');
    if (old) old.remove();
    const el = document.createElement('div');
    el.className = 'snackbar';
    const span = document.createElement('span');
    span.className = 'snackbar-text';
    span.textContent = text;
    el.appendChild(span);
    if (actionLabel) {
      const btn = document.createElement('button');
      btn.className = 'snackbar-btn';
      btn.textContent = actionLabel;
      btn.addEventListener('click', function () {
        el.remove();
        if (typeof onAct === 'function') onAct();
      });
      el.appendChild(btn);
    }
    layer.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.remove(); }, 6000);
  };

  /** 应用内删除确认：不依赖 WebView 的 confirm，各端表现一致 */
  App.confirmDeleteTask = function (task) {
    const layer = document.getElementById('layer');
    if (!layer) return;
    layer.innerHTML = '' +
      '<div class="mask" data-action="closeLayer"></div>' +
      '<div class="confirm-sheet">' +
        '<div class="cs-title">删除「' + esc(task.title) + '」？</div>' +
        '<div class="cs-text">删除后 6 秒内可以点「撤销」，也可以在对话里说「撤销删除」找回。</div>' +
        '<div class="cs-actions">' +
          '<button class="btn btn-ghost" data-action="closeLayer">再想想</button>' +
          '<button class="btn btn-danger" data-action="deleteTaskConfirm" data-id="' + task.id + '">删除</button>' +
        '</div>' +
      '</div>';
  };

  /* ------------------------------ 新建任务 ------------------------------ */
  App.openNewTask = function () { App.go('task', 'new'); };

  /* ------------------------------ 提醒弹层 ------------------------------ */
  App.showReminder = function (task, kind, text, persona, extra) {
    const layer = document.getElementById('layer');
    if (!layer) return;
    // 提醒优先级高于正在编辑的助手档案：直接接管弹层并告知用户
    const tookOver = !!layer.querySelector('.assistant-sheet');
    if (tookOver) asDraft = null;
    const p = persona || Persona.effective(task);
    lastReminder = { task: task, text: text, persona: p };

    // 同步在对话里留一条气泡，保证记录连续
    Chat.push({ role: 'reminder', text: text, persona: p.id });
    // 让对话里的「延后 10 分钟」等指令默认指向这条提醒
    if (window.Chat) Chat.lastTaskId = task.id;

    const isUrgent = task.priority === 'urgent';
    const meta = [
      Store.repeatLabel(task),
      (task.pre && task.pre.length) ? '提前 ' + task.pre[0] + ' 分钟' : '',
      (task.tone ? (Persona.effective(task) || {}).tag : '') || ''
    ].filter(Boolean);

    layer.innerHTML = '' +
      '<div class="mask"></div>' +
      '<div class="reminder-sheet">' +
        '<div class="rs-head">' +
          '<div class="avatar">' + Persona.avatarHTML(p) + '</div>' +
          '<div class="rs-meta"><b>' + esc(p.name) + (isUrgent ? ' · 严肃模式' : '') + '</b>' +
            '<small>待办提醒 · ' + (KIND_LABEL[kind] || '提醒') + ' · ' + esc(U.fmtDue(task.dueAt)) + '</small></div>' +
          '<button class="rs-close" data-action="reminderIgnore" data-id="' + task.id + '" aria-label="关闭">✕</button>' +
        '</div>' +
        '<div class="rs-text">' + esc(text).replace(/\n/g, '<br>') + '</div>' +
        '<div class="rs-task">' +
          '<div class="rst-title">' + esc(task.title) + '</div>' +
          '<div class="rst-meta">' + meta.map(function (m) { return '<span>' + esc(m) + '</span>'; }).join('') +
            (task.paused ? '<span>已暂停</span>' : '') + '</div>' +
        '</div>' +
        '<button class="rs-audio" data-action="speakReminder">' +
          '<svg viewBox="0 0 24 24"><path d="M11 5L6.5 9H3v6h3.5L11 19V5zM16 9.5a4 4 0 0 1 0 5M19 7a7 7 0 0 1 0 10"/></svg>' +
          '语音播报</button>' +
        '<div class="rs-actions">' +
          '<button class="primary" data-action="reminderComplete" data-id="' + task.id + '">完成它</button>' +
          '<button data-action="reminderSnooze" data-id="' + task.id + '">延后 10 分钟</button>' +
          '<button data-action="reminderReschedule" data-id="' + task.id + '">修改时间</button>' +
          '<button data-action="reminderTone" data-id="' + task.id + '">换语气</button>' +
          '<button data-action="reminderPause" data-id="' + task.id + '">暂停提醒</button>' +
        '</div>' +
      '</div>';

    if (tookOver) App.toast('有提醒到达，助手档案已暂时收起');
  };

  function closeReminder() {
    const layer = document.getElementById('layer');
    if (!layer) return;
    layer.querySelectorAll('.mask, .reminder-sheet').forEach(function (n) { n.remove(); });
    if (window.Reminder) Reminder.clearActive();
  }
  App.closeReminder = closeReminder;

  function showTonePicker(task) {
    const layer = document.getElementById('layer');
    if (!layer) return;
    layer.querySelectorAll('.reminder-sheet').forEach(function (n) { n.remove(); });
    const sheet = document.createElement('div');
    sheet.className = 'reminder-sheet';
    sheet.innerHTML = '' +
      '<div class="sheet-grab"></div>' +
      '<h3 style="font-size:15px;margin-bottom:10px">把「' + esc(task.title) + '」换成哪种语气？</h3>' +
      '<div class="chips-row wrap">' +
        Persona.list().map(function (p) {
          return '<button class="chip" data-action="tonePick" data-id="' + task.id + '" data-tone="' + p.id + '">' +
            p.emoji + ' ' + p.tag + '</button>';
        }).join('') +
      '</div>' +
      '<button class="btn btn-ghost" data-action="closeSheet" style="margin-top:8px">取消</button>';
    layer.appendChild(sheet);
  }
  App.showTonePicker = showTonePicker;

  /* ------------------------------ 助手档案：自定义 ID / 头像 / 性格 ------------------------------ */
  const AVATAR_CHOICES = ['🌱', '🍋', '🧊', '🗒', '🐰', '🐱', '🐻', '🦊', '🐧', '🌻', '🌙', '⭐', '🍀', '☁️', '🎧', '📚'];
  let asDraft = null;

  function draftFromSettings() {
    const a = Persona.profile();
    const base = Persona.all[Store.settings.persona] || Persona.all.gentle;
    return { name: a.name, avatar: a.avatar, photo: a.photo, personality: a.personality, base: base.id };
  }

  /** 只重画预览区，不重建输入框（避免输入时失焦） */
  function asPreview() {
    const layer = document.getElementById('layer');
    if (!layer || !asDraft) return;
    const base = Persona.all[asDraft.base] || Persona.all.gentle;
    const box = layer.querySelector('#asAvatar');
    if (box) {
      box.innerHTML = asDraft.photo
        ? '<img class="av-img" src="' + esc(asDraft.photo) + '" alt="">'
        : esc(asDraft.avatar || base.emoji);
    }
    const name = layer.querySelector('#asNameOut');
    if (name) name.textContent = asDraft.name || base.name;
    const tag = layer.querySelector('#asTag');
    if (tag) tag.textContent = base.tag + '语气';
    const sub = layer.querySelector('#asSubOut');
    if (sub) sub.textContent = asDraft.personality || base.sub;
    const sample = layer.querySelector('#asSample');
    if (sample) sample.textContent = Persona.say('onTime', { title: '高数作业' }, base);
    layer.querySelectorAll('[data-action="pickBase"]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.id === asDraft.base);
    });
    layer.querySelectorAll('[data-action="pickAvatar"]').forEach(function (b) {
      b.classList.toggle('active', !asDraft.photo && b.dataset.emoji === (asDraft.avatar || base.emoji));
    });
    const state = layer.querySelector('#asPhotoState');
    if (state) state.textContent = asDraft.photo ? '已选用上传图片' : '或用上传图片';
    const clear = layer.querySelector('#asClearPhoto');
    if (clear) clear.hidden = !asDraft.photo;
  }

  function compressImage(file, cb) {
    const reader = new FileReader();
    reader.onload = function () {
      const img = new Image();
      img.onload = function () {
        try {
          const size = 160;
          const c = document.createElement('canvas');
          c.width = size; c.height = size;
          const ctx = c.getContext('2d');
          const s = Math.min(img.width, img.height) || size;
          ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
          cb(c.toDataURL('image/jpeg', 0.82));
        } catch (e) { cb(null); }
      };
      img.onerror = function () { cb(null); };
      img.src = reader.result;
    };
    reader.onerror = function () { cb(null); };
    reader.readAsDataURL(file);
  }

  App.showAssistant = function (draft) {
    const layer = document.getElementById('layer');
    if (!layer) return;
    asDraft = draft || draftFromSettings();
    const base = Persona.all[asDraft.base] || Persona.all.gentle;

    layer.innerHTML = '' +
      '<div class="mask" data-action="closeSheet"></div>' +
      '<div class="reminder-sheet assistant-sheet">' +
        '<div class="sheet-grab"></div>' +
        '<div class="as-scroll">' +
          '<div class="as-head">' +
            '<div class="avatar as-avatar" id="asAvatar"></div>' +
            '<div class="as-id">' +
              '<div class="as-name"><b id="asNameOut"></b><span class="tag" id="asTag"></span></div>' +
              '<small id="asSubOut"></small>' +
            '</div>' +
            '<button class="rs-close" data-action="closeSheet" aria-label="关闭">✕</button>' +
          '</div>' +
          '<div class="as-label">选一个头像</div>' +
          '<div class="as-emoji">' +
            AVATAR_CHOICES.map(function (e) {
              return '<button class="as-emoji-btn" data-action="pickAvatar" data-emoji="' + e + '">' + e + '</button>';
            }).join('') +
          '</div>' +
          '<div class="as-photo-row">' +
            '<button class="chip" data-action="pickPhoto">上传图片</button>' +
            '<span class="as-photo-state" id="asPhotoState"></span>' +
            '<button class="chip" data-action="clearPhoto" id="asClearPhoto" hidden>移除图片</button>' +
          '</div>' +
          '<input type="file" id="asFile" accept="image/*" hidden>' +
          '<div class="field" style="margin-top:10px">' +
            '<label class="field-label">助手 ID（名字，最多 8 字）</label>' +
            '<input class="input" id="asNameInput" maxlength="8" placeholder="' + esc(base.name) + '" value="' + esc(asDraft.name) + '" />' +
          '</div>' +
          '<div class="field">' +
            '<label class="field-label">性格（一句话，显示在头像下方）</label>' +
            '<input class="input" id="asPersonaInput" maxlength="18" placeholder="' + esc(base.sub) + '" value="' + esc(asDraft.personality) + '" />' +
          '</div>' +
          '<div class="as-label">语气基底（决定话术模板，紧急任务仍用严肃）</div>' +
          '<div class="chips-row wrap">' +
            Persona.list().map(function (p) {
              return '<button class="chip" data-action="pickBase" data-id="' + p.id + '">' + p.emoji + ' ' + p.name + ' · ' + p.tag + '</button>';
            }).join('') +
          '</div>' +
          '<div class="as-sample" id="asSample"></div>' +
        '</div>' +
        '<div class="as-actions">' +
          '<button class="btn" data-action="resetAssistant">恢复默认</button>' +
          '<button class="btn btn-primary" data-action="saveAssistant">保存</button>' +
        '</div>' +
        '<button class="as-more" data-action="openPersonaPage">开场白 / 提醒后缀 / 试听 →</button>' +
      '</div>';

    const nameInput = layer.querySelector('#asNameInput');
    if (nameInput) nameInput.addEventListener('input', function () { asDraft.name = nameInput.value.trim(); asPreview(); });
    const personaInput = layer.querySelector('#asPersonaInput');
    if (personaInput) personaInput.addEventListener('input', function () { asDraft.personality = personaInput.value.trim(); asPreview(); });
    const fileInput = layer.querySelector('#asFile');
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        const f = fileInput.files && fileInput.files[0];
        if (!f) return;
        compressImage(f, function (data) {
          if (!data) { App.toast('这张图片读不出来，换一张试试'); return; }
          asDraft.photo = data;
          App.toast('头像已就绪，点「保存」生效');
          asPreview();
        });
      });
    }
    asPreview();
  };

  function saveAssistant() {
    if (!asDraft) return;
    const base = Persona.all[asDraft.base] || Persona.all.gentle;
    Store.settings.assistant = {
      name: asDraft.name,
      avatar: asDraft.avatar,
      photo: asDraft.photo,
      personality: asDraft.personality
    };
    // 语气基底与人设保持一致：现有待办一并跟随（紧急任务仍自动严肃）
    if (Store.settings.persona !== base.id) {
      Store.settings.persona = base.id;
      Store.tasks.forEach(function (t) {
        if (t.status === 'pending') t.tone = base.id;
      });
    }
    Store.save();
    asDraft = null;
    closeReminder();
    App.refreshBadges();
    if (document.querySelector('.screen[data-screen="persona"].active')) Views.persona();
    if (document.querySelector('.screen[data-screen="settings"].active')) Views.settings();
    Chat.render(true);
    App.toast('助手档案已保存');

    const who = Persona.current();
    const custom = Persona.profile();
    Chat.botSay('我是「' + who.name + '」' + (custom.personality ? '，' + custom.personality : '') + '。以后就由我来提醒你。', {
      chips: ['明天十点提醒我交高数作业', '本周复盘']
    });
  }

  function resetAssistant() {
    const base = Persona.all[Store.settings.persona] || Persona.all.gentle;
    App.showAssistant({ name: '', avatar: '', photo: '', personality: '', base: base.id });
    App.toast('已恢复默认，点「保存」生效');
  }

  /* ------------------------------ 新手引导 ------------------------------ */
  const OB_STEPS = [
    {
      title: '像聊天一样记待办',
      text: '不用填表。直接说「明天十点提醒我交高数作业」，我会识别任务、时间、重复和语气。',
      items: ['明天十点提醒我交高数作业', '每周一三五晚八点背单词', '信息不全我会追问你']
    },
    {
      title: '提醒会自己找上门',
      text: '提前提醒、到点提醒、超时追加三层保障。免打扰时段静默保存，结束后一次性补发。',
      items: ['提前 10 分钟先提醒一次', '没完成就按间隔追加', '紧急任务可突破免打扰']
    },
    {
      title: '免打扰与提示',
      text: '在「我的 → 通知与免打扰」里统一管理：免打扰时段、默认提前提醒、提示音与振动。装成 App 后还能开启通知栏消息、锁屏提醒与桌面角标，并把自启动打开，不点开应用也能收到提醒。',
      items: ['免打扰时段：期间的提醒先静默保存，结束后补发', '紧急任务可突破免打扰，重要事不会漏', '通知栏 / 锁屏 / 角标 / 自启动一页里开关'],
      link: '去通知与免打扰设置看看 →'
    },
    {
      title: '不满意，用嘴改',
      text: '「延后 10 分钟」「改到明晚七点」「改名成交数学作业」「改成每周一三五」「提前提醒改成 30 分钟」，甚至直接说「删除」，都能改。',
      items: ['完成 / 延后 / 改时间', '改名、改频次、改提前提醒', '删错了说「撤销删除」就能找回']
    }
  ];
  let obStep = 0;

  function renderOnboarding() {
    const layer = document.getElementById('layer');
    if (!layer) return;
    const step = OB_STEPS[obStep];
    const isLast = obStep === OB_STEPS.length - 1;
    layer.innerHTML = '' +
      '<div class="mask"></div>' +
      '<div class="onboard-sheet">' +
        '<div class="ob-avatar">' + Persona.avatarHTML(Persona.current()) + '</div>' +
        '<h3>' + step.title + '</h3>' +
        '<p>' + step.text + '</p>' +
        '<div class="ob-list">' +
          step.items.map(function (t, i) {
            return '<div class="ob-item"><span class="ob-num">' + (i + 1) + '</span>' + esc(t) + '</div>';
          }).join('') +
        '</div>' +
        '<div class="ob-dots">' + OB_STEPS.map(function (_, i) {
          return '<i class="' + (i === obStep ? 'on' : '') + '"></i>';
        }).join('') + '</div>' +
        (step.link ? '<button class="btn btn-ghost ob-link" data-action="obGoNotify">' + esc(step.link) + '</button>' : '') +
        '<div class="ob-actions">' +
          '<button class="btn" data-action="obSkip">跳过</button>' +
          '<button class="btn btn-primary" data-action="' + (isLast ? 'obDone' : 'obNext') + '">' +
            (isLast ? '开始使用' : '下一步') + '</button>' +
        '</div>' +
      '</div>';
  }

  function finishOnboarding() {
    Store.settings.onboarded = true;
    Store.save();
    const layer = document.getElementById('layer');
    if (layer) layer.innerHTML = '';
    App.go('chat');
  }

  App.showOnboarding = function () {
    obStep = 0;
    renderOnboarding();
  };

  /* ------------------------------ 演示 ------------------------------ */
  App.demoTask = function () {
    if (Reminder.isDnd()) App.toast('当前处于免打扰时段，这条提醒会被静默保存');
    Reminder.demo(10);
    Chat.systemSay('演示已启动：10 秒后弹出提醒气泡' + (Store.settings.voiceOn ? '，并语音播报' : '') + '。');
    App.toast('10 秒后提醒，可切到对话页查看');
  };

  /* ------------------------------ 安装到桌面（PWA） ------------------------------ */
  let deferredInstall = null;

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredInstall = e;
    document.documentElement.classList.add('can-install');
    if (document.querySelector('.screen[data-screen="settings"].active')) Views.settings();
  });

  function isStandalone() {
    const mm = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    return !!mm || navigator.standalone === true;
  }

  App.installApp = function () {
    if (isStandalone()) { App.toast('已经在独立窗口里运行啦'); return; }
    if (!deferredInstall) {
      App.toast('用浏览器菜单里的「添加到主屏幕」也能安装');
      return;
    }
    deferredInstall.prompt();
    deferredInstall.userChoice.then(function (res) {
      if (res && res.outcome === 'accepted') App.toast('已添加到主屏幕');
      deferredInstall = null;
      document.documentElement.classList.remove('can-install');
    });
  };
  App.isStandalone = isStandalone;

  /* ------------------------------ 全局事件 ------------------------------ */
  function onAction(action, el, e) {
    const id = el.dataset.id;
    const task = id ? Store.getTask(id) : null;

    switch (action) {
      case 'go': App.go(el.dataset.to); break;
      case 'back': App.back(); break;
      case 'send': {
        const input = document.getElementById('chatInput');
        if (input && input.value.trim()) { Chat.submit(input.value); input.value = ''; }
        break;
      }
      case 'voiceInput': Chat.voiceInput(); break;
      case 'newTask': App.openNewTask(); break;

      /* 助手档案 */
      case 'openAssistant': App.showAssistant(); break;
      case 'pickAvatar':
        if (asDraft) { asDraft.avatar = el.dataset.emoji; asDraft.photo = ''; asPreview(); }
        break;
      case 'pickPhoto': {
        const f = document.getElementById('asFile');
        if (f) f.click();
        break;
      }
      case 'clearPhoto':
        if (asDraft) { asDraft.photo = ''; asPreview(); }
        break;
      case 'pickBase':
        if (asDraft) { asDraft.base = el.dataset.id; asPreview(); }
        break;
      case 'saveAssistant': saveAssistant(); break;
      case 'resetAssistant': resetAssistant(); break;
      case 'openPersonaPage': closeReminder(); App.go('persona'); break;

      case 'toggleTask':
        if (task) Chat.completeFlow(task, false);
        if (document.querySelector('.screen[data-screen="list"].active')) Views.list();
        break;
      case 'openTask': App.go('task', id); break;
      case 'completeTask': {
        if (!task) break;
        const onTaskScreen = document.querySelector('.screen[data-screen="task"].active');
        Chat.completeFlow(task, true);
        if (onTaskScreen) App.go('list');
        else if (document.querySelector('.screen[data-screen="list"].active')) Views.list();
        break;
      }
      case 'snoozeTask':
        if (task) Chat.snoozeFlow(task, 10);
        break;
      case 'deleteTask': {
        /* 依次尝试：按钮自带的 data-id → 当前路由 → 详情页正在编辑的任务 */
        let target = task;
        if (!target) {
          const r = parseHash();
          if (r.name === 'task' && r.arg && r.arg !== 'new') target = Store.getTask(r.arg);
        }
        if (!target && window.Views && Views.currentTaskId) target = Store.getTask(Views.currentTaskId);
        if (!target) { App.toast('这个任务已经不在了'); App.go('list'); break; }
        App.confirmDeleteTask(target);
        break;
      }
      case 'deleteTaskConfirm': {
        const t = task || (id ? Store.getTask(id) : null);
        if (!t) { App.closeLayer(); App.toast('任务已经不在了'); App.go('list'); break; }
        Chat.lastDeleted = JSON.parse(JSON.stringify(t));
        Store.removeTask(t.id);
        if (Chat.lastTaskId === t.id) Chat.lastTaskId = null;
        App.closeLayer();
        App.go('list');
        if (App.refreshBadges) App.refreshBadges();
        App.snackbar('已删除「' + t.title + '」', '撤销', function () {
          const back = Chat.restoreDeleted ? Chat.restoreDeleted() : null;
          if (back) {
            App.toast('已恢复「' + back.title + '」');
            App.go('list');
            if (App.refreshBadges) App.refreshBadges();
          }
        });
        break;
      }
      case 'closeLayer': App.closeLayer(); break;
      case 'saveTask': Views.saveTask(); break;
      case 'setRepeat': Views.setRepeat(el.dataset.repeat); break;
      case 'toggleRepeatDay': Views.toggleRepeatDay(el.dataset.day); break;
      case 'setPre': Views.setPre(el.dataset.min); break;
      case 'setTone': Views.setTone(el.dataset.tone); break;
      case 'previewTask': Views.previewTask(); break;
      case 'setDefaultPre': Views.setDefaultPre(el.dataset.min); break;

      case 'setPersona': Views.setPersona(el.dataset.id); break;
      case 'tryVoice': Views.tryVoice(); break;
      case 'saveCustomLines': Views.saveCustomLines(); break;

      case 'genReview': Views.genReview(); break;
      case 'importCalendar': Views.importCalendar(); break;
      case 'pickIcs': {
        const icsInput = document.getElementById('icsFile');
        if (icsInput) icsInput.click();
        break;
      }
      case 'importIcsConfirm': Views.importIcsConfirm(); break;
      case 'retryNativeCalendar': Views.importCalendar(); break;
      case 'pickIcsFallback': Views.importCalendarIcs(); break;
      case 'openCalSettings': Views.openCalendarSettings(); break;
      case 'resetData':
        if (confirm('会清空当前所有任务与对话，恢复演示数据。继续？')) {
          Store.resetAll();
          Chat.pending = null;
          Chat.render(true);
          App.go('chat');
          App.toast('已重置演示数据');
        }
        break;
      case 'replayGuide':
        Store.settings.onboarded = false;
        Store.save();
        App.showOnboarding();
        break;
      case 'demoTask': App.demoTask(); break;

      case 'flushSilent': {
        const n = Reminder.flushSilent(false);
        if (!n) App.toast('没有静默消息');
        break;
      }

      /* 提醒弹层 */
      case 'speakReminder':
        if (lastReminder) {
          const ok = Voice.speak(lastReminder.text, lastReminder.persona.id);
          if (!ok) App.toast('当前浏览器不支持语音播报');
        }
        break;
      case 'reminderComplete':
        closeReminder();
        if (task) Chat.completeFlow(task, true);
        break;
      case 'reminderSnooze':
        closeReminder();
        if (task) Chat.snoozeFlow(task, 10);
        break;
      case 'reminderReschedule':
        closeReminder();
        App.go('task', id);
        break;
      case 'reminderTone':
        if (task) showTonePicker(task);
        break;
      case 'tonePick':
        if (task) {
          Store.updateTask(task.id, { tone: el.dataset.tone });
          closeReminder();
          Chat.changeTaskTone(task, el.dataset.tone);
        }
        break;
      case 'reminderPause':
        closeReminder();
        if (task) {
          Store.updateTask(task.id, { paused: true, nextFollowAt: 0 });
          Chat.systemSay('已暂停「' + task.title + '」的提醒，任务仍在清单里。');
          App.toast('提醒已暂停');
        }
        break;
      case 'reminderIgnore': {
        closeReminder();
        if (task) {
          task.ignoreCount = (task.ignoreCount || 0) + 1;
          const gap = (task.followUp && task.followUp.min) || 15;
          task.nextFollowAt = Date.now() + gap * 60000;
          Store.save();
          if (task.ignoreCount >= 2) {
            const p = Persona.get('sharp');
            Chat.botSay(Persona.say('encourage', { title: task.title, task: task }, p), {
              chips: ['拆成三步', '完成它', '延后 10 分钟']
            });
          } else {
            Chat.systemSay('已忽略这次提醒，' + gap + ' 分钟后会追加一次');
          }
        }
        break;
      }
      case 'notifySound':
        if (window.NativeNotify) {
          NativeNotify.setSound(el.dataset.key).then(function () { Views.notify(); });
        }
        break;
      case 'notifyPickCustom': {
        const f = document.getElementById('customSoundFile');
        if (f) f.click();
        break;
      }
      case 'notifyPreview':
        if (window.NativeNotify) NativeNotify.preview();
        break;
      case 'notifyVibe':
        if (window.NativeNotify) {
          NativeNotify.setVibe(el.dataset.key).then(function () { Views.notify(); });
        }
        break;
      case 'notifyVibePreview':
        if (window.NativeNotify) {
          NativeNotify.previewVibe();
          App.toast('已按当前震动模式试一下');
        } else {
          App.toast('装成 App 后才能设置震动');
        }
        break;
      case 'notifyFullScreenSettings':
        if (window.NativeNotify) NativeNotify.openFullScreenSettings();
        break;
      case 'notifyTest':
        if (window.NativeNotify) NativeNotify.test();
        break;
      case 'pinWidget':
        if (!window.NativeNotify || !NativeNotify.isNative) {
          App.toast('装成 App 后可以把「今日待办」放到桌面');
          break;
        }
        NativeNotify.pinWidget().then(function (res) {
          if (res && res.ok) App.toast('按桌面提示完成添加即可');
          else App.toast('请长按桌面空白处，添加「今日待办」小组件');
        });
        break;
      case 'notifySettings':
        if (window.NativeNotify) NativeNotify.openSystemSettings();
        break;
      case 'notifyExact':
        if (window.NativeNotify) NativeNotify.openExactSettings();
        break;
      case 'notifyAppSettings':
        if (window.NativeNotify) NativeNotify.openAppSettings();
        break;
      case 'notifyBattery':
        if (window.NativeNotify) {
          NativeNotify.requestIgnoreBattery();
          App.toast('允许「忽略电池优化」后提醒会更准');
        }
        break;
      case 'installApp': App.installApp(); break;
      case 'closeSheet': closeReminder(); break;
      case 'obNext': obStep = Math.min(obStep + 1, OB_STEPS.length - 1); renderOnboarding(); break;
      case 'obGoNotify':
        finishOnboarding();
        App.go('notify');
        break;
      case 'obSkip':
      case 'obDone': finishOnboarding(); break;
      case 'noop': break;
      default: break;
    }
  }

  function bindGlobal() {
    document.addEventListener('click', function (e) {
      const chip = e.target.closest('[data-chip]');
      if (chip && !chip.closest('#chatStream')) {
        Chat.submit(chip.dataset.chip);
        return;
      }
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const action = el.dataset.action;
      if (!action) return;
      onAction(action, el, e);
    });

    document.getElementById('tabbar').addEventListener('click', function (e) {
      const btn = e.target.closest('[data-tab]');
      if (btn) App.go(btn.dataset.tab);
    });

    const seg = document.getElementById('listSeg');
    if (seg) {
      seg.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-filter]');
        if (!btn) return;
        seg.querySelectorAll('button').forEach(function (b) { b.classList.toggle('active', b === btn); });
        Views.listFilter(btn.dataset.filter);
        Views.list();
      });
    }

    window.addEventListener('hashchange', route);
  }

  /* ------------------------------ 启动 ------------------------------ */
  function init() {
    Chat.init();
    bindGlobal();
    App.refreshBadges();
    Reminder.start();

    if (!location.hash || location.hash === '#') {
      history.replaceState(null, '', '#/chat');
    }
    route();

    if (!Store.settings.onboarded) {
      setTimeout(function () { App.showOnboarding(); }, 480);
    }
  }

  window.App = App;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
