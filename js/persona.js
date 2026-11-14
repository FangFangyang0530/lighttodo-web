/* ===========================================================
   轻声 LightTodo · 人设话术库 + 语音朗读
   =========================================================== */
(function () {
  'use strict';

  const PERSONAS = {
    gentle: {
      id: 'gentle',
      name: '小满',
      emoji: '🌱',
      tag: '温柔',
      sub: '温柔提醒 · 随时都在',
      desc: '轻声细语，先共情再推进',
      rate: 0.92,
      pitch: 1.08,
      sample: '到点啦，「高数作业」。慢慢来，但别忘了呀。',
      lines: {
        greet: function () { return '我在呢，慢慢说就好。'; },
        query: function (c) { return '手上一共 ' + c.count + ' 件，今天 ' + c.today + ' 件，我陪你一件件来：'; },
        askTime: function (c) { return '好呀，「' + c.title + '」我记下了。你想让我什么时候提醒你？'; },
        askTitle: function () { return '时间我记好了。要提醒你做什么呢？'; },
        confirm: function (c) {
          return '记下啦：' + c.title + '，' + c.when + ' 提醒你（' + c.repeat + '·' + c.tone + '语气）。到点我会轻声叫你。';
        },
        pre: function (c) { return '还有 ' + c.left + ' 就是「' + c.title + '」了，要不要先准备一下？'; },
        onTime: function (c) { return '到点啦，「' + c.title + '」。慢慢来，但别忘了呀。'; },
        followUp: function (c) { return '刚刚的「' + c.title + '」还在等你哦，先做 5 分钟也算开始。'; },
        followUp2: function (c) { return '我知道现在有点难开始…「' + c.title + '」要不要只做第一小步？'; },
        done: [
          '辛苦啦，已完成 ✓',
          '做完了，给你一点小小的掌声。',
          '这一步走完啦，很稳。'
        ],
        encourage: function (c) {
          return '先别自责，拖延不是能力问题，是启动太难。把「' + c.title + '」拆成三小步，我陪你走第一步。';
        },
        unknown: function () { return '嗯…我没太听清，是想新建一个提醒吗？'; },
        review: function (s) {
          return '这周你完成了 ' + s.doneCount + ' 件事，完成率 ' + s.rate + '%。' +
            (s.rate >= 70 ? '节奏很稳，记得给自己留点休息。' : '别急，我们把最想推进的那一件放在明天上午。');
        }
      }
    },

    playful: {
      id: 'playful',
      name: '豆豆',
      emoji: '🍋',
      tag: '俏皮',
      sub: '俏皮催办 · 不许装看不见',
      desc: '轻松有梗，催得动又不过分',
      rate: 1.08,
      pitch: 1.16,
      sample: '叮咚！「高数作业」时间到，快冲！',
      lines: {
        greet: function () { return '来啦来啦，今天要记点啥？'; },
        query: function (c) { return '报告！' + c.count + ' 件在排队，今天 ' + c.today + ' 件要搞定：'; },
        askTime: function (c) { return '收到！「' + c.title + '」安排上？几点喊你比较好？'; },
        askTitle: function () { return '时间收到～那要提醒你干点啥？'; },
        confirm: function (c) {
          return '好嘞～' + c.when + ' 我会蹦出来喊你：「' + c.title + '」！' + c.repeat + '，' + c.tone + '模式已开启。';
        },
        pre: function (c) { return c.left + '后见！「' + c.title + '」先热个身～'; },
        onTime: function (c) { return '叮咚！「' + c.title + '」时间到，快冲！'; },
        followUp: function (c) { return '喂喂，「' + c.title + '」还在原地等你，别装看不见嘛。'; },
        followUp2: function (c) { return '再拖下去它就要长蘑菇了 🍄 「' + c.title + '」先来 5 分钟？'; },
        done: [
          '搞定！你就是今天的效率小能手。',
          '芜湖，完成！给自己加个鸡腿。',
          '完成打卡 ✓ 保持这个手感。'
        ],
        encourage: function (c) {
          return '拖延小怪兽又来敲门啦。把「' + c.title + '」切成三小块，一次只打一只，打完回来找我报喜。';
        },
        unknown: function () { return '呃…这句我没接住，是想新建提醒，还是查今天的任务？'; },
        review: function (s) {
          return '本周战绩：完成 ' + s.doneCount + ' 件，完成率 ' + s.rate + '%，连击 ' + s.streak + ' 天！' +
            (s.overdueCount ? '不过还有 ' + s.overdueCount + ' 件在装死，明天先收拾它们。' : '暂时没有装死的任务，漂亮。');
        }
      }
    },

    sharp: {
      id: 'sharp',
      name: 'Aki',
      emoji: '🧊',
      tag: '干练',
      sub: '干练直接 · 只讲执行',
      desc: '短句下达，不给拖延留空间',
      rate: 1.0,
      pitch: 0.94,
      sample: '「高数作业」到时间了，立刻开始。',
      lines: {
        greet: function () { return '说任务，我给时间表。'; },
        query: function (c) { return '待办 ' + c.count + ' 项，今日 ' + c.today + ' 项：'; },
        askTime: function (c) { return '「' + c.title + '」已登记。执行时间？'; },
        askTitle: function () { return '时间已锁定。任务内容？'; },
        confirm: function (c) {
          return '已设定：' + c.title + ' · ' + c.when + ' · ' + c.repeat + ' · ' + c.tone + '语气。到点提醒，不解释。';
        },
        pre: function (c) { return '提醒：' + c.left + '后执行「' + c.title + '」，现在开始准备。'; },
        onTime: function (c) { return '「' + c.title + '」到时间了，立刻开始。'; },
        followUp: function (c) { return '「' + c.title + '」已超时，请立即处理。'; },
        followUp2: function (c) { return '第二次提醒：「' + c.title + '」仍未标记完成。现在开始 10 分钟。'; },
        done: [
          '完成，记录已更新。',
          '干得干净。',
          '按计划交付，保持。'
        ],
        encourage: function (c) {
          return '拖延只会压缩你的可选项。把「' + c.title + '」拆成三段，先做 10 分钟，再决定是否继续。';
        },
        unknown: function () { return '指令未识别。请说明是新建任务、完成、延后，还是查询。'; },
        review: function (s) {
          return '本周完成 ' + s.doneCount + '/' + s.totalCount + '，完成率 ' + s.rate + '%。' +
            '逾期 ' + s.overdueCount + ' 件，平均延后 ' + s.avgDelay + ' 分钟。优先砍掉重复延后的任务。';
        }
      }
    },

    minimal: {
      id: 'minimal',
      name: 'Momo',
      emoji: '🗒',
      tag: '简约',
      sub: '简约正式 · 只给结论',
      desc: '字少事清，正式但不冷',
      rate: 1.0,
      pitch: 1.0,
      sample: '现在：高数作业',
      lines: {
        greet: function () { return '需要记录什么？'; },
        query: function (c) { return '待办 ' + c.count + '｜今日 ' + c.today; },
        askTime: function (c) { return '「' + c.title + '」。时间？'; },
        askTitle: function () { return '时间已记录。任务内容？'; },
        confirm: function (c) {
          return '已记录：' + c.title + '｜' + c.when + '｜' + c.repeat + '｜' + c.tone + '。';
        },
        pre: function (c) { return c.left + '后：' + c.title; },
        onTime: function (c) { return '现在：' + c.title; },
        followUp: function (c) { return '待办未完成：' + c.title; },
        followUp2: function (c) { return '再次提醒：' + c.title + '。建议先完成 10 分钟。'; },
        done: [
          '已标记完成。',
          '记录完成。',
          '已完成，归档。'
        ],
        encourage: function (c) {
          return '建议拆分「' + c.title + '」：第一步只做 5 分钟，降低启动成本。';
        },
        unknown: function () { return '未能识别。可新建提醒、完成、延后或查询。'; },
        review: function (s) {
          return '近 7 天完成率 ' + s.rate + '%（' + s.doneCount + '/' + s.totalCount + '），逾期 ' +
            s.overdueCount + ' 件，平均延后 ' + s.avgDelay + ' 分钟。';
        }
      }
    }
  };

  const ORDER = ['gentle', 'playful', 'sharp', 'minimal'];
  const REMIND_KINDS = ['pre', 'onTime', 'followUp', 'followUp2'];

  function current() {
    const id = (window.Store && Store.settings.persona) || 'gentle';
    return decorate(PERSONAS[id] || PERSONAS.gentle);
  }

  /* ------------------------------ 助手档案（自定义 ID / 头像 / 性格） ------------------------------ */
  function profile() {
    const a = (window.Store && Store.settings.assistant) || {};
    return {
      name: String(a.name || '').trim(),
      avatar: String(a.avatar || '').trim(),
      photo: a.photo || '',
      personality: String(a.personality || '').trim()
    };
  }

  /** 把自定义档案盖在基底人设上：只换身份与措辞入口，话术模板仍是基底人设 */
  function decorate(p) {
    const a = profile();
    if (!a.name && !a.avatar && !a.photo && !a.personality) return p;
    const out = Object.assign({}, p);
    if (a.name) out.name = a.name;
    if (a.avatar) out.emoji = a.avatar;
    if (a.personality) { out.sub = a.personality; out.desc = a.personality; }
    out.custom = a;
    return out;
  }

  /** 头像渲染：上传图片 > 自定义表情 > 人设默认表情 */
  function avatarHTML(p) {
    const a = profile();
    const esc = (window.U && U.esc) || function (s) { return s; };
    if (a.photo) return '<img class="av-img" src="' + esc(a.photo) + '" alt="">';
    if (a.avatar) return esc(a.avatar);
    return esc((p && p.emoji) || PERSONAS.gentle.emoji);
  }

  /** 紧急任务自动切换严肃风格 */
  function effective(task) {
    if (task && task.priority === 'urgent') return decorate(PERSONAS.sharp);
    const id = (task && task.tone) || current().id;
    return decorate(PERSONAS[id] || current());
  }

  function pick(arr) {
    if (!Array.isArray(arr)) return arr;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * 生成话术
   * @param {string} kind pre | onTime | followUp | followUp2 | done | ...
   * @param {object} ctx  { title, when, repeat, tone, left, task }
   * @param {object} persona 可指定人设
   */
  function say(kind, ctx, persona) {
    const p = persona || current();
    const lines = p.lines || {};
    let fn = lines[kind] || PERSONAS.gentle.lines[kind];
    if (!fn) return '';
    const c = ctx || {};
    let text = typeof fn === 'function' ? fn(c) : pick(fn);

    // 自定义话术：开场白替换 / 提醒后缀追加
    const custom = (window.Store && Store.settings.customLines) || {};
    if (kind === 'greet' && custom.greet) text = custom.greet;
    if (REMIND_KINDS.indexOf(kind) >= 0) {
      if (custom.suffix) text += ' ' + custom.suffix;
      const task = c.task;
      if (task && task.note) text += '\n小提示：' + task.note;
    }
    return text;
  }

  function nameOf(id) { return (PERSONAS[id] || PERSONAS.gentle).name; }

  /** 按 id 取一套话术，并带上自定义身份（供严肃升级等场景使用） */
  function get(id) { return decorate(PERSONAS[id] || PERSONAS.gentle); }

  /* ------------------------------ 语音 ------------------------------ */
  const Voice = {
    supported: typeof window !== 'undefined' && 'speechSynthesis' in window,
    _voice: null,
    pickVoice: function () {
      if (!this.supported) return null;
      if (this._voice) return this._voice;
      const list = window.speechSynthesis.getVoices() || [];
      const zh = list.filter(function (v) { return /zh|cmn|Chinese/i.test(v.lang + ' ' + v.name); });
      this._voice = zh.find(function (v) { return /zh-CN/i.test(v.lang); }) || zh[0] || null;
      return this._voice;
    },
    speak: function (text, personaId) {
      if (!this.supported) return false;
      if (window.Store && !Store.settings.voiceOn) return false;
      if (!text) return false;
      const p = PERSONAS[personaId] || current();
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(String(text).replace(/[「」“”*#_]/g, '').replace(/\n/g, '，'));
        u.lang = 'zh-CN';
        u.rate = p.rate || 1;
        u.pitch = p.pitch || 1;
        u.volume = 1;
        const v = this.pickVoice();
        if (v) u.voice = v;
        window.speechSynthesis.speak(u);
        return true;
      } catch (e) {
        console.warn('[voice] 播报失败', e);
        return false;
      }
    },
    stop: function () {
      if (this.supported) window.speechSynthesis.cancel();
    },
    listen: function (onResult, onError) {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return null;
      const rec = new SR();
      rec.lang = 'zh-CN';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.continuous = false;
      rec.onresult = function (e) {
        const text = e.results && e.results[0] && e.results[0][0] ? e.results[0][0].transcript : '';
        onResult && onResult(text);
      };
      rec.onerror = function (e) { onError && onError(e); };
      try { rec.start(); } catch (e) { onError && onError(e); }
      return rec;
    }
  };

  window.Persona = {
    all: PERSONAS,
    order: ORDER,
    list: function () { return ORDER.map(function (id) { return PERSONAS[id]; }); },
    current: current,
    effective: effective,
    get: get,
    say: say,
    nameOf: nameOf,
    profile: profile,
    avatarHTML: avatarHTML,
    REMIND_KINDS: REMIND_KINDS
  };
  window.Voice = Voice;

  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = function () { Voice._voice = null; };
  }
})();
