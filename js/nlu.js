/* ===========================================================
   轻声 LightTodo · 自然语言解析（时间 / 重复 / 语气 / 意图）
   纯规则实现，无外部依赖，便于前端直接跑起来
   =========================================================== */
(function () {
  'use strict';

  const MIN = 60000, HOUR = 3600000, DAY = 86400000;
  const U = window.U;

  function normalize(input) {
    return String(input == null ? '' : input)
      .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 65248); })
      .replace(/[：]/g, ':')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const CN = { '零': 0, '〇': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };

  function cn2num(str) {
    if (str == null) return NaN;
    const s = String(str).trim();
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    if (s === '半') return 30;
    let total = 0, cur = 0, matched = false;
    for (const ch of s) {
      if (CN[ch] !== undefined) { cur = CN[ch]; matched = true; }
      else if (ch === '十') { total += (cur || 1) * 10; cur = 0; matched = true; }
      else return NaN;
    }
    return matched ? total + cur : NaN;
  }

  const DAY_WORDS = [
    ['大后天', 3], ['大前天', -3], ['后天', 2], ['明晚', 1], ['明早', 1], ['明天', 1], ['明日', 1],
    ['今晚', 0], ['今早', 0], ['今天', 0], ['今日', 0]
  ];

  const PERIOD_DEFAULT = [
    ['凌晨', 6], ['清晨', 7], ['明早', 8], ['今早', 7], ['早上', 7], ['上午', 9],
    ['中午', 12], ['下午', 15], ['傍晚', 18], ['明晚', 20], ['今晚', 20], ['晚上', 20], ['晚', 19]
  ];

  function resolveWeekday(prefix, ch, now) {
    const targetIdx = (ch === '日' || ch === '天') ? 7 : '一二三四五六'.indexOf(ch) + 1;
    if (!targetIdx) return null;
    const dow = new Date(now).getDay() || 7;
    const t0 = U.startOfDay(now);
    const mondayThis = t0 - (dow - 1) * DAY;
    if (prefix === '下下') return mondayThis + 14 * DAY + (targetIdx - 1) * DAY;
    if (prefix === '下') return mondayThis + 7 * DAY + (targetIdx - 1) * DAY;
    let diff = targetIdx - dow;
    if (diff < 0) diff += 7;
    return t0 + diff * DAY;
  }

  /**
   * 解析时间表达
   * @returns {{ts:number|null, hasDate:boolean, hasHour:boolean, dayTs:number|null, hour:number|null, minute:number, kind:string}}
   */
  function parseWhen(input, base) {
    const s = normalize(input);
    const now = base || Date.now();
    const t0 = U.startOfDay(now);
    const res = { ts: null, hasDate: false, hasHour: false, dayTs: null, hour: null, minute: 0, kind: 'none' };
    let dayTs = null;
    let dayOffset = null;
    let m;

    /* 1. 相对时间 */
    m = s.match(/(半|\d{1,3}|[一二两三四五六七八九十]{1,3})\s*个?\s*(分钟|分)\s*(后|之后|以后)/);
    if (m) {
      const n = m[1] === '半' ? 30 : cn2num(m[1]);
      if (!isNaN(n)) return { ts: now + n * MIN, hasDate: true, hasHour: true, dayTs: null, hour: null, minute: n, kind: 'relative' };
    }
    m = s.match(/(半|\d{1,3}|[一二两三四五六七八九十]{1,3})\s*个?\s*(小时|钟头)\s*(后|之后|以后)/);
    if (m) {
      const n = m[1] === '半' ? 0.5 : cn2num(m[1]);
      if (!isNaN(n)) return { ts: now + n * HOUR, hasDate: true, hasHour: true, dayTs: null, hour: null, minute: 0, kind: 'relative' };
    }
    m = s.match(/(\d{1,3}|[一二两三四五六七八九十]{1,3})\s*天\s*(后|之后|以后)/);
    if (m) {
      const n = cn2num(m[1]);
      if (!isNaN(n)) { dayTs = t0 + n * DAY; res.kind = 'relative'; }
    }
    if (!dayTs && /(待会儿|待会|过会儿|稍后|一会儿|晚点|马上|立刻)/.test(s)) {
      return { ts: now + 30 * MIN, hasDate: true, hasHour: true, dayTs: null, hour: null, minute: 30, kind: 'relative' };
    }

    /* 2. 日期词 */
    for (let i = 0; i < DAY_WORDS.length; i++) {
      if (s.indexOf(DAY_WORDS[i][0]) >= 0) {
        dayOffset = DAY_WORDS[i][1];
        dayTs = t0 + dayOffset * DAY;
        res.hasDate = true;
        break;
      }
    }

    /* 3. 周几 */
    const wm = s.match(/(下下|下|这|本)?\s*(?:周|星期|礼拜)\s*([一二三四五六日天])/);
    if (wm) {
      const d = resolveWeekday(wm[1], wm[2], now);
      if (d != null) { dayTs = d; dayOffset = Math.round((d - t0) / DAY); res.hasDate = true; }
    }

    /* 4. 绝对日期 */
    const dm = s.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/);
    if (dm) {
      const mo = parseInt(dm[1], 10) - 1, dd = parseInt(dm[2], 10);
      const y = new Date(now).getFullYear();
      let d = new Date(y, mo, dd, 0, 0, 0, 0).getTime();
      if (d < t0) d = new Date(y + 1, mo, dd, 0, 0, 0, 0).getTime();
      dayTs = d; dayOffset = Math.round((d - t0) / DAY); res.hasDate = true;
    }

    /* 5. 小时 */
    let hour = null, minute = 0;
    const hmm = s.match(/(\d{1,2})\s*:\s*(\d{1,2})/);
    if (hmm) {
      hour = parseInt(hmm[1], 10);
      minute = parseInt(hmm[2], 10);
      if (hour > 23 || minute > 59) { hour = null; minute = 0; }
    } else {
      const hmRe = /(上午|中午|下午|傍晚|晚上|凌晨|早上|清晨|今晚|明晚|晚)?\s*([\d一二两三四五六七八九十]{1,3})\s*[点時时]\s*(半|\d{1,2}\s*分?|[一二三四五六七八九十]{1,2}\s*分)?/;
      const hm = s.match(hmRe);
      if (hm) {
        const period = hm[1] || '';
        let h = cn2num(hm[2]);
        let mi = 0;
        if (hm[3]) mi = hm[3] === '半' ? 30 : cn2num(String(hm[3]).replace(/分/g, ''));
        if (!isNaN(h)) {
          if (/下午|傍晚|晚上|今晚|明晚|晚/.test(period) && h < 12) h += 12;
          if (/中午/.test(period) && h < 12) h += 12;
          if (/凌晨/.test(period) && h === 12) h = 0;
          hour = h;
          minute = isNaN(mi) ? 0 : mi;
        }
      }
    }

    /* 6. 只有时段（早上/中午/晚上…）时给默认时刻 */
    if (hour === null) {
      for (let i = 0; i < PERIOD_DEFAULT.length; i++) {
        if (s.indexOf(PERIOD_DEFAULT[i][0]) >= 0) {
          hour = PERIOD_DEFAULT[i][1];
          minute = 0;
          break;
        }
      }
    }

    if (hour === null || hour > 23) {
      res.dayTs = dayTs;
      res.hasHour = false;
      res.hour = null;
      return res;
    }

    const day = dayTs !== null ? dayTs : t0;
    let ts = day + hour * HOUR + minute * MIN;

    if (dayTs === null) {
      if (ts <= now + 30000) ts += DAY; // 只说了时刻，已过则顺延到明天
    } else if (ts <= now - 30000 && dayOffset === 0) {
      ts += DAY; // 说了今天/今晚但时间已过，顺延一天
      dayOffset = 1;
    }

    res.ts = ts;
    res.hasDate = true;
    res.hasHour = true;
    res.dayTs = U.startOfDay(ts);
    res.hour = hour;
    res.minute = minute;
    res.kind = res.kind || 'absolute';
    res.dayOffset = dayOffset;
    return res;
  }

  /* ------------------------------ 标题清洗 ------------------------------ */
  const STRIP_RULES = [
    /(大后天|大前天|后天|明晚|明早|明天|明日|今晚|今早|今天|今日)/g,
    // 「每周一三五」必须排在「周几」之前，否则「周一」会先被吃掉
    /每(?:个)?(?:周|星期|礼拜)[一二三四五六日天、和及,]*/g,
    /(下下|下|这|本)?\s*(?:周|星期|礼拜)\s*[一二三四五六日天]/g,
    /(每天|每日|天天|工作日|每个月|每月|隔天|每年)/g,
    /(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/g,
    /(半|\d{1,3}|[一二两三四五六七八九十]{1,3})\s*个?\s*(分钟|分|小时|钟头|天)\s*(后|之后|以后)/g,
    /(上午|中午|下午|傍晚|晚上|凌晨|早上|清晨|今晚|明晚|晚)?\s*[\d一二两三四五六七八九十]{1,3}\s*[点時时]\s*(半|\d{1,2}\s*分?|[一二三四五六七八九十]{1,2}\s*分)?/g,
    /\d{1,2}\s*:\s*\d{1,2}/g,
    /(上午|中午|下午|傍晚|晚上|凌晨|早上|清晨|待会儿|待会|过会儿|稍后|一会儿)/g,
    /(之后|以后|之前|以前|左右|前后|整点|准时)/g,
    /(温柔|轻声|温暖|体贴|俏皮|可爱|活泼|有趣|调皮|幽默|严肃|严格|严厉|干练|简洁|简约|正式)/g,
    /(一点|一些|语气|人设|风格|模式)/g,
    /(紧急|急事|很急|务必|必须|一定要|马上|立刻|ddl|deadline|重要|别忘了)/gi,
    /(提醒我|提醒一下|提醒|记得|帮我记一下|帮我记|设置一个|设置|新建|添加|记一下|别忘了|别忘记)/g,
    /(可以吗|行吗|好不好|谢谢|拜托|这事|这件事|那件事|这个事)/g
  ];

  function extractTitle(input) {
    let t = ' ' + normalize(input) + ' ';
    STRIP_RULES.forEach(function (re) { t = t.replace(re, ' '); });
    t = t.replace(/[，,。.、；;：:！!？?~～"'“”‘’()（）【】\[\]]/g, ' ');
    // 先合并空白，后面 ^ / $ 的修饰词清理才能生效
    t = t.replace(/\s+/g, ' ').trim();
    t = t.replace(/^(请|麻烦|帮我|帮忙|我要|我想|我需要|需要|要|我|给)+/, '');
    t = t.replace(/(吧|啊|呀|哦|呢|嘛|哈|啦|了|一下|点|很|超级|比较)+$/, '');
    t = t.replace(/^[前后]/, '');
    t = t.replace(/\s+/g, '').trim();
    return t;
  }

  function targetOf(input) {
    // 「完成了 / 写完了」必须排在「完成 / 写完」前，否则会残留一个「了」字
    return extractTitle(input.replace(/(完成了|做完了|写完了|搞定了|弄完了|写好了|完成|做完|写好|搞定|弄完|交了|打卡|延后|推迟|晚点|再给|往后|暂停一下|暂停|别提醒了|恢复提醒|继续提醒|改到|改成|调到|延到|换到|定在|把|帮我|一下)/g, ' '));
  }

  /* ------------------------------ 语气 / 重复 ------------------------------ */
  function detectTone(s) {
    if (/(温柔|轻声|温暖|暖一点|体贴|轻柔)/.test(s)) return 'gentle';
    if (/(俏皮|可爱|活泼|有趣|调皮|幽默|好玩|轻松点)/.test(s)) return 'playful';
    if (/(严肃|严格|严厉|干练|凶一点|直接一点|认真|强硬)/.test(s)) return 'sharp';
    if (/(简洁|简约|正式|简短|冷静|少废话|克制)/.test(s)) return 'minimal';
    return null;
  }

  function stripTone(s) {
    return s
      .replace(/(换成|换个|换|用|改成|来点|来一个|来|给我|请|麻烦)/g, '')
      .replace(/(温柔|轻声|温暖|暖|体贴|俏皮|可爱|活泼|有趣|调皮|幽默|严肃|严格|严厉|干练|简洁|简约|正式)/g, '')
      .replace(/(的)?(语气|人设|风格|模式|声音)/g, '')
      .replace(/(一点|一些|点|吧|呢|啊|呀|嘛|啦|哈|一下|谢谢|～|~)/g, '')
      .replace(/[，,。.！!？?、\s]/g, '');
  }

  function detectRepeat(s) {
    let repeat = 'none';
    const days = [];
    if (/(每天|每日|天天|每一天)/.test(s)) repeat = 'daily';
    if (/(工作日|周一到周五|周一至周五|上课日)/.test(s)) repeat = 'workday';
    if (/(每月|每个月)/.test(s)) repeat = 'monthly';
    if (/(隔天|隔一天|两天一次)/.test(s)) repeat = 'daily';
    if (/每(?:个)?(?:周|星期|礼拜)/.test(s) && repeat !== 'workday') {
      repeat = 'weekly';
      const start = s.search(/每(?:个)?(?:周|星期|礼拜)/);
      const seg = s.slice(start).replace(/每(?:个)?(?:周|星期|礼拜)/, ' ');
      const chars = seg.match(/[一二三四五六日天]/g) || [];
      chars.forEach(function (c) {
        const n = (c === '日' || c === '天') ? 0 : '一二三四五六'.indexOf(c) + 1;
        if (n >= 0 && n <= 6 && days.indexOf(n) < 0) days.push(n);
      });
      if (!days.length) {
        const wm = s.match(/(?:周|星期|礼拜)\s*([一二三四五六日天])/);
        if (wm) {
          const n = (wm[1] === '日' || wm[1] === '天') ? 0 : '一二三四五六'.indexOf(wm[1]) + 1;
          if (n >= 0) days.push(n);
        }
      }
    }
    return { repeat: repeat, repeatDays: days };
  }

  /* ------------------------------ 主解析 ------------------------------ */
  function parse(input) {
    const raw = String(input == null ? '' : input).trim();
    const s = normalize(raw);
    const now = Date.now();
    const out = {
      intent: 'create', raw: raw, text: s,
      when: null, dueAt: null, hasTime: false,
      repeat: 'none', repeatDays: [],
      tone: detectTone(s), urgent: false,
      title: '', target: '', snoozeMin: null, confidence: 1
    };

    out.urgent = /(紧急|急事|很急|务必|必须|一定要|马上|立刻|ddl|deadline|十万火急)/i.test(s);
    const rep = detectRepeat(s);
    out.repeat = rep.repeat;
    out.repeatDays = rep.repeatDays;

    /* 取消当前对话 */
    if (/^(算了|不用了|取消|先不要|没事了|不弄了|先这样|不要了)[吧啊呀。！!]*$/.test(s)) {
      out.intent = 'cancel';
      return out;
    }

    /* 帮助 */
    if (/(帮助|怎么用|能做什么|有什么功能|使用说明|教程)/.test(s)) {
      out.intent = 'help';
      return out;
    }

    /* 打招呼 */
    if (/^(你好|您好|hi|hello|嗨|在吗|在不在|早|晚上好|早安)[呀啊哈喽。！!~～]*$/i.test(s)) {
      out.intent = 'greet';
      return out;
    }

    /* 复盘 */
    if (/(复盘|统计|完成率|周报|报表|数据|总结|我最近|表现如何|进度如何)/.test(s)) {
      out.intent = 'review';
      return out;
    }

    /* 暂停 / 恢复 */
    if (/(恢复提醒|继续提醒|重新提醒|开启提醒|打开提醒)/.test(s)) {
      out.intent = 'resume';
      out.target = targetOf(s);
      return out;
    }
    if (/(暂停|别提醒|先别提醒|不要提醒|取消提醒|消停|静音)/.test(s)) {
      out.intent = 'pause';
      out.target = targetOf(s);
      return out;
    }

    /* 修改时间 */
    if (/(改到|改成|改一下时间|换个时间|调到|提前到|推迟到|延到|定在|时间改)/.test(s)) {
      out.intent = 'reschedule';
      out.target = targetOf(s);
      const w = parseWhen(s, now);
      out.when = w;
      out.dueAt = w.ts;
      out.hasTime = !!w.ts;
      return out;
    }

    /* 延后 */
    if (/(延后|推迟|晚点|再给|往后|再等|过一会)/.test(s)) {
      out.intent = 'snooze';
      out.target = targetOf(s);
      const mm = s.match(/(半|\d{1,3}|[一二两三四五六七八九十]{1,3})\s*(分钟|分|小时)/);
      if (mm) {
        const n = mm[1] === '半' ? 30 : cn2num(mm[1]);
        out.snoozeMin = /小时/.test(mm[2]) ? n * 60 : n;
      }
      if (!out.snoozeMin) {
        const w = parseWhen(s, now);
        if (w.ts && w.ts > now) out.snoozeMin = Math.max(1, Math.round((w.ts - now) / MIN));
      }
      if (!out.snoozeMin) out.snoozeMin = 10;
      return out;
    }

    /* 完成 */
    if (/(完成|做完|搞定|弄完|写好|写完了|交了|打卡|去过了|办完了|check)/.test(s) && !/(提醒我|记得|帮我记|设置提醒)/.test(s)) {
      out.intent = 'complete';
      out.target = targetOf(s);
      return out;
    }

    /* 切换人设 / 语气 */
    if (out.tone && stripTone(s).length === 0) {
      out.intent = 'tone';
      return out;
    }

    /* 查询 */
    if (/(有什么|有哪些|还有什么|多少个|几件|几条|清单|列表|待办|进度|今天要|明天要|查一下|看看)/.test(s)) {
      out.intent = 'query';
      return out;
    }

    /* 默认：新建任务 */
    const w = parseWhen(s, now);
    out.when = w;
    out.dueAt = w.ts;
    out.hasTime = !!w.ts;
    out.kind = w.kind;
    out.title = extractTitle(s);

    // 只给了时间 / 太短 → 需要追问内容
    if (!out.title || out.title.length < 1) {
      out.title = '';
      out.confidence = 0.4;
    }

    // 周重复对齐到最近的重复日
    if (out.repeat === 'weekly' && out.repeatDays.length && out.dueAt) {
      const d = new Date(out.dueAt);
      const minutes = d.getHours() * 60 + d.getMinutes();
      for (let i = 0; i < 14; i++) {
        const cand = U.startOfDay(now) + i * DAY + minutes * MIN;
        if (cand <= now) continue;
        if (out.repeatDays.indexOf(new Date(cand).getDay()) >= 0) { out.dueAt = cand; break; }
      }
    }
    return out;
  }

  window.NLU = {
    parse: parse,
    parseWhen: parseWhen,
    extractTitle: extractTitle,
    normalize: normalize,
    cn2num: cn2num,
    detectTone: detectTone,
    detectRepeat: detectRepeat
  };
})();
