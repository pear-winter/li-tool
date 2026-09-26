/**
 * 🍐 梨梨工作台 v3.6 无书摘版 by梨梨
 * 合并：预设工作台 v1.1 / 世界书工作台 v2.7 / 聊天工作台 v3.4.0（聊天档案馆 + 回复分支）
 * 适配目标：SillyTavern 1.19.0 / 酒馆助手 4.9.3
 * 一个入口、一个面板、顶部四页切换；入口、悬浮图与美化统一共享。
 * 无外部依赖，不修改全局 alert 和 confirm。
 */
export function startWorkbench() {
  'use strict';

  const W = window;
  const DOC = W.document;
  const OWNER = '__cyll_pear_hub_v1__';
  const KEY = 'cyll-pear-hub-v1';
  const OLD_CHAT_KEY = 'cyll-workbench-v3';
  const PRESET_KEY = 'preset-workbench-v1';
  const WORLD_KEY = 'worldbook-workbench-v2';
  const PEAR_SWITCH_IMAGE = 'https://s1.oururl.cn/autoupload/cgoqf/20260922/0ExZ/265X251/%E6%B2%90%E6%9E%9C%E7%B4%A0%E6%9D%90_%2831%29.png';
  const ARCHIVE_KEY = 'ca-archive-settings-v2';
  const HISTORY_KEY = 'sb-settings-v1';
  const BRANCH_KEY = 'sb-branches-v1';

  // 新脚本接管：顺手关掉旧的三个独立脚本，避免出现重复图标
  for (const owner of [
    OWNER, '__cyll_chat_workbench_v3__', '__preset_workbench_v1__', '__worldbook_workbench_v2__'
  ]) {
    try { W[owner]?.dispose?.(); } catch {}
  }

  let disposed = false;
  let switching = false;
  let writing = false;
  let observer;
  let fab;
  let top;
  let hub = null;
  let hubBody = null;
  let activeTab = null;
  const pages = new Map();
  const modules = {};
  const cleanups = [];
  const dialogs = new Map();

  function read(key, fallback) {
    try {
      return JSON.parse(W.localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  }

  function object(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function node(tag, cls, text) {
    const el = DOC.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    if (tag === 'div' && cls === 'cw-empty' && /^(?:正在读取|加载(?:角色|存档|消息)|读取(?:背景|酒馆主题))/.test(String(text || '')) && !/失败/.test(text)) {
      el.classList.add('cw-loading'); el.setAttribute('role','status'); el.prepend(waveDots());
    }
    return el;
  }

  function waveDots() {
    const dots = DOC.createElement('span'); dots.className='cw-wave-dots'; dots.setAttribute('aria-hidden','true');
    for(let i=0;i<3;i++){const dot=DOC.createElement('i');dot.style.setProperty('--dot',i);dots.append(dot);}
    return dots;
  }
  function loadingStatus(text) { const box=node('div','cw-loading');box.setAttribute('role','status');box.append(waveDots(),node('span','',text));return box; }
  function button(text, action, cls = '') {
    const el = node('button', 'cw-button' + (cls ? ' ' + cls : ''), text);
    el.type = 'button';
    el.addEventListener('click', action);
    return el;
  }

  function field(label, control) {
    const el = node('label', 'cw-field');
    el.append(node('span', '', label), control);
    return el;
  }

  function input(placeholder = '', value = '') {
    const el = node('input');
    el.type = 'text';
    el.placeholder = placeholder;
    el.value = value;
    return el;
  }

  function actions(...children) {
    const row = node('div', 'cw-actions');
    row.append(...children);
    return row;
  }

  function context() {
    return W.SillyTavern?.getContext();
  }

  function sleep(ms) {
    return new Promise(resolve => W.setTimeout(resolve, ms));
  }

  function cssPresets(value) {
    return Array.isArray(value)
      ? value
          .filter(p => p && typeof p.name === 'string' && typeof p.css === 'string')
          .map(p => ({ name: p.name, css: p.css }))
      : [];
  }

  const firstRun = W.localStorage.getItem(KEY) === null;
  const cfg = Object.assign({
    lastTab: 'preset',
    tabIcons: {},
    tabOrder: [],
    tabNames: {},
    tabHidden: [],
    transApi: {},
    apiConfigs: [],
    themeShots: {},
    themeFavs: [],
    themeUsed: {},
    themeSort: 'name',
    reader: {},
    barFold: true,
    uiZoom: 100,
    fontScale: 100,
    themesMigrated: false,
    themeCss: '',
    themePresets: [],
    top: true,
    topImage: '',
    topSize: 26,
    floating: true,
    image: '',
    size: 56,
    x: null,
    y: null,
    presets: []
  }, object(read(KEY, null) ?? read(OLD_CHAT_KEY, {})));

  cfg.top = cfg.top !== false;
  cfg.floating = cfg.floating !== false;
  if (!cfg.top && !cfg.floating) cfg.floating = true;
  cfg.themeCss = typeof cfg.themeCss === 'string' ? cfg.themeCss : '';
  cfg.image = typeof cfg.image === 'string' ? cfg.image : '';
  cfg.topImage = typeof cfg.topImage === 'string' ? cfg.topImage : '';
  cfg.size = Math.max(32, Math.min(120, Number(cfg.size) || 56));
  cfg.topSize = Math.max(16, Math.min(48, Number(cfg.topSize) || 26));
  cfg.themePresets = cssPresets(cfg.themePresets);
  cfg.barFold = cfg.barFold !== false;
  cfg.uiZoom = Math.max(70, Math.min(140, Math.round(Number(cfg.uiZoom) || 100)));
  // v3.5 的整体缩放在部分手机上会把界面推出屏幕：升级后先恢复 100%
  if (!cfg.zoomFixV36) { cfg.uiZoom = 100; cfg.zoomFixV36 = true; }
  cfg.fontScale = Math.max(70, Math.min(170, Math.round(Number(cfg.fontScale) || 100)));
  cfg.presets = Array.isArray(cfg.presets)
    ? cfg.presets.filter(p => p && typeof p.name === 'string')
    : [];

  if (firstRun) {
    for (const [key, from] of [[PRESET_KEY, '预设'], [WORLD_KEY, '世界书']]) {
      const old = object(read(key, {}));
      for (const p of Array.isArray(old.imagePresets) ? old.imagePresets : []) {
        if (!p || typeof p.name !== 'string' || typeof p.url !== 'string') continue;
        if (cfg.presets.some(q => q.image === p.url && q.name.startsWith(p.name))) continue;
        let name = p.name, n = 2;
        while (cfg.presets.some(q => q.name === name)) name = p.name + '（' + from + (n++ > 2 ? n - 1 : '') + '）';
        cfg.presets.push({ name, image: p.url, size: Math.max(32, Math.min(120, Number(p.size) || 56)), x: null, y: null });
      }
    }
  }
  cfg.lastTab = ['preset', 'api', 'sttheme', 'worldbook', 'archive', 'history', 'tools', 'beauty'].includes(cfg.lastTab) ? cfg.lastTab : 'preset';
  cfg.tabNames = object(cfg.tabNames);
  cfg.tabOrder = Array.isArray(cfg.tabOrder) ? cfg.tabOrder.filter(n => typeof n === 'string') : [];
  cfg.transApi = object(cfg.transApi);
  cfg.tabHidden = Array.isArray(cfg.tabHidden) ? cfg.tabHidden.filter(n => typeof n === 'string' && n !== 'beauty') : [];
  cfg.apiConfigs = Array.isArray(cfg.apiConfigs) ? cfg.apiConfigs : [];
  cfg.themeShots = object(cfg.themeShots);
  cfg.themeFavs = Array.isArray(cfg.themeFavs) ? cfg.themeFavs.filter(n => typeof n === 'string') : [];
  cfg.themeUsed = object(cfg.themeUsed);
  cfg.tabIcons = Object.fromEntries(Object.entries(object(cfg.tabIcons))
    .filter(([k, v]) => ['preset', 'api', 'sttheme', 'worldbook', 'archive', 'history', 'tools', 'beauty'].includes(k) && typeof v === 'string' && /^https?:\/\//i.test(v)));

  const oldPos = read('ca-fab-pos', null);
  if (cfg.x === null && oldPos) {
    cfg.x = oldPos.x;
    cfg.y = oldPos.y;
  }

  function saveCfg() {
    try {
      W.localStorage.setItem(KEY, JSON.stringify(cfg));
      return true;
    } catch {
      notice('设置未保存：浏览器存储空间不足或已被禁用。');
      return false;
    }
  }

  function dialog(message, kind = 'alert', value = '') {
    if (disposed) return Promise.resolve(kind === 'prompt' ? null : false);

    return new Promise(resolve => {
      const d = node('dialog', 'cw-dialog');
      const title = kind === 'prompt'
        ? '✎ 填写内容'
        : kind === 'confirm'
          ? '🌿 请确认'
          : '☕ 温馨提示';

      d.setAttribute('aria-label', title);
      d.append(
        node('div', 'cw-dialog-title', title),
        node('div', 'cw-dialog-message', String(message))
      );

      let editor;
      if (kind === 'prompt' || kind === 'copy') {
        editor = node(kind === 'copy' ? 'textarea' : 'input');
        editor.value = String(value);
        editor.readOnly = kind === 'copy';
        d.append(editor);
      }

      let finished = false;
      const previousFocus = DOC.activeElement;

      function done(result) {
        if (finished) return;
        finished = true;
        dialogs.delete(d);
        if (d.open) d.close();
        d.remove();
        if (previousFocus?.isConnected) {
          try { previousFocus.focus(); } catch {}
        }
        resolve(result);
      }

      const cancelValue = kind === 'prompt' ? null : false;
      dialogs.set(d, () => done(cancelValue));

      const row = actions();
      if (kind === 'confirm' || kind === 'prompt') {
        row.append(button('取消', () => done(cancelValue)));
      }
      row.append(button(
        kind === 'copy' ? '关闭' : '确定',
        () => done(kind === 'prompt' ? editor.value : true),
        'cw-primary'
      ));
      d.append(row);

      d.addEventListener('cancel', event => {
        event.preventDefault();
        done(cancelValue);
      });
      d.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.key === 'Enter' && kind === 'prompt' && !event.isComposing) {
          event.preventDefault();
          done(editor.value);
        }
      });

      DOC.body.append(d);
      try {
        d.showModal();
        (editor || row.firstElementChild).focus();
        editor?.select();
      } catch {
        done(cancelValue);
      }
    });
  }

  function notice(message) {
    void dialog(message);
  }

  const ask = message => dialog(message, 'confirm');

  async function copyText(value) {
    const text = String(value ?? '');
    try {
      if (W.navigator.clipboard?.writeText) {
        await W.navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}

    const area = node('textarea');
    area.value = text;
    area.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;';
    const previousFocus = DOC.activeElement;
    const openDialogs = [...DOC.querySelectorAll('dialog[open]')];
    (openDialogs.at(-1) || DOC.body).append(area);
    area.focus();
    area.select();
    area.setSelectionRange(0, text.length);

    let copied = false;
    try { copied = DOC.execCommand('copy'); } catch {}
    area.remove();
    try { previousFocus?.focus(); } catch {}

    if (copied) return true;
    await dialog('浏览器未允许自动复制。请全选下面的内容后手动复制。', 'copy', text);
    return false;
  }

  function download(filename, text, type = 'text/plain;charset=utf-8') {
    const url = W.URL.createObjectURL(new W.Blob([text], { type }));
    const a = node('a');
    a.href = url;
    a.download = filename.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_');
    DOC.body.append(a);
    a.click();
    a.remove();
    W.setTimeout(() => W.URL.revokeObjectURL(url), 10000);
  }

  // 多选一对话框：options = [[值, 按钮文字, 说明?], ...]；取消返回 null
  function choose(message, options, title = '✿ 请选择') {
    if (disposed) return Promise.resolve(null);
    return new Promise(resolve => {
      const d = node('dialog', 'cw-dialog cw-choose');
      d.setAttribute('aria-label', title);
      d.append(node('div', 'cw-dialog-title', title), node('div', 'cw-dialog-message', String(message)));
      let finished = false;
      function done(result) {
        if (finished) return;
        finished = true;
        dialogs.delete(d);
        if (d.open) d.close();
        d.remove();
        resolve(result);
      }
      dialogs.set(d, () => done(null));
      const list = node('div', 'cw-choose-list');
      for (const [value, label, note] of options) {
        const b = button('', () => done(value), 'cw-choose-option');
        b.append(node('span', 'cw-choose-label', label));
        if (note) b.append(node('span', 'cw-choose-note', note));
        list.append(b);
      }
      d.append(list, actions(button('取消', () => done(null))));
      d.addEventListener('cancel', event => { event.preventDefault(); done(null); });
      d.addEventListener('keydown', event => event.stopPropagation());
      DOC.body.append(d);
      d.showModal();
    });
  }

  // ── token 计数：优先用酒馆当前分词器，缺失时按字数估算（带 ≈） ──
  const tokenCache = new Map();
  let tokenEstimated = false;
  function estimateTokens(text) {
    const cjk = (text.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\uf900-\ufaff]/g) || []).length;
    return Math.ceil(cjk * 1.1 + (text.length - cjk) / 3.7);
  }
  async function countTokens(text) {
    text = String(text ?? '');
    if (!text) return 0;
    if (tokenCache.has(text)) return tokenCache.get(text);
    const ctx = context();
    let n = NaN;
    try {
      if (typeof ctx?.getTokenCountAsync === 'function') n = Number(await ctx.getTokenCountAsync(text));
      else if (typeof ctx?.getTokenCount === 'function') n = Number(ctx.getTokenCount(text));
    } catch {}
    if (!Number.isFinite(n)) { n = estimateTokens(text); tokenEstimated = true; }
    if (tokenCache.size > 8000) tokenCache.clear();
    tokenCache.set(text, n);
    return n;
  }
  async function sumTokens(texts) {
    let total = 0;
    for (const text of texts) total += await countTokens(text);
    return total;
  }
  function fmtTok(n) {
    return (tokenEstimated ? '≈' : '') + Number(n || 0).toLocaleString('zh-CN');
  }

  // 楼层号输入解析：「1-5, 8, 10到12」
  function parseFloors(text, total) {
    const out = new Set();
    for (const part of String(text || '').split(/[,，、;；\s]+/).filter(Boolean)) {
      const m = part.match(/^(\d+)(?:\s*(?:-|~|～|到|至)\s*(\d+))?$/);
      if (!m) throw Error('看不懂「' + part + '」，请写成 1-5, 8 这样的格式。');
      let a = Number(m[1]), b = m[2] === undefined ? a : Number(m[2]);
      if (a > b) [a, b] = [b, a];
      if (b >= total) throw Error('楼层 ' + b + ' 不存在（当前最后一层是 #' + (total - 1) + '）。');
      for (let i = a; i <= b; i++) out.add(i);
    }
    if (!out.size) throw Error('没有填写楼层。');
    return [...out].sort((x, y) => x - y);
  }
  function floorText(list) {
    const sorted = [...list].sort((a, b) => a - b), parts = [];
    for (let i = 0; i < sorted.length; i++) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
      parts.push(i === j ? '#' + sorted[i] : '#' + sorted[i] + '-' + sorted[j]);
      i = j;
    }
    return parts.join('、');
  }

  // 控制台：token 汇总
  async function collectTokenStats() {
    const ctx = context();
    const chat = Array.isArray(ctx?.chat) ? ctx.chat : [];
    const shown = chat.filter(m => m && typeof m.mes === 'string' && !m.is_system);
    const hidden = chat.filter(m => m && typeof m.mes === 'string' && m.is_system).length;
    const result = { chat: { tokens: await sumTokens(shown.map(m => m.mes)), count: shown.length, hidden }, preset: null, books: [] };

    try {
      const manager = ctx?.getPresetManager?.('openai');
      const name = manager?.getSelectedPresetName?.();
      const data = manager?.getPresetList?.();
      const raw = data?.presets?.[data?.preset_names?.[name]];
      if (raw && Array.isArray(raw.prompts)) {
        const block = (raw.prompt_order || []).find(g => String(g.character_id) === '100001') || raw.prompt_order?.[0];
        const byId = new Map(raw.prompts.map(p => [p.identifier, p]));
        const enabled = (block?.order || []).filter(o => o.enabled !== false).map(o => byId.get(o.identifier))
          .filter(p => p && typeof p.content === 'string' && p.content);
        result.preset = { name, count: enabled.length, tokens: await sumTokens(enabled.map(p => p.content)) };
      }
    } catch {}

    const getBook = helperFn('getWorldbook');
    if (getBook) {
      const sources = new Map();
      const add = (name, label) => {
        if (typeof name !== 'string' || !name) return;
        sources.set(name, [...(sources.get(name) || []), label]);
      };
      try { for (const name of await helperFn('getGlobalWorldbookNames')?.() || []) add(name, '全局'); } catch {}
      try {
        const c = await helperFn('getCharWorldbookNames')?.('current');
        add(c?.primary, '角色');
        for (const name of c?.additional || []) add(name, '角色附加');
      } catch {}
      try { add(await helperFn('getChatWorldbookName')?.('current'), '聊天'); } catch {}
      for (const [name, labels] of sources) {
        try {
          const entries = (await getBook(name)) || [];
          const on = entries.filter(e => e?.enabled);
          const rows = [];
          let constant = 0, selective = 0;
          for (const e of on) {
            const t = await countTokens(e.content);
            const blue = e.strategy?.type === 'constant';
            blue ? constant += t : selective += t;
            rows.push({ name: e.name || '未命名条目', tokens: t, blue, uid: e.uid });
          }
          rows.sort((a, b) => b.tokens - a.tokens);
          result.books.push({ name, labels, total: entries.length, rows, constant, selective });
        } catch (error) {
          result.books.push({ name, labels, error: error.message, rows: [], constant: 0, selective: 0 });
        }
      }
    }
    return result;
  }

  async function disableEntry(book, uid) {
    const update = helperFn('updateWorldbookWith');
    if (typeof update !== 'function') throw Error('酒馆助手没有提供写入世界书的接口');
    let found = false;
    await update(book, entries => entries.map(entry => {
      if (entry?.uid !== uid) return entry;
      found = true;
      return { ...entry, enabled: false };
    }));
    if (!found) throw Error('没有找到这条条目，可能已被改动');
  }

  function buildTokenBoard() {
    const box = node('details', 'cw-token-board');
    box.open = true;
    box.append(node('summary', '', 'Token 统计'));
    const tiles = node('div', 'cw-tiles');
    const detail = node('div', 'cw-token-detail');
    const note = node('p', 'cw-note', '');
    box.append(tiles, actions(button('重新统计', () => run())), detail, note);
    let rev = 0;
    function tile(label, value, sub) {
      const t = node('div', 'cw-tile');
      t.append(node('div', 'cw-tile-label', label), node('div', 'cw-tile-value', value), node('div', 'cw-tile-sub', sub || ''));
      return t;
    }
    async function run() {
      const my = ++rev;
      tiles.replaceChildren(node('div', 'cw-empty', '正在统计…'));
      detail.replaceChildren();
      try {
        const r = await collectTokenStats();
        if (my !== rev || !box.isConnected) return;
        const bookConst = r.books.reduce((a, b) => a + b.constant, 0);
        const bookSel = r.books.reduce((a, b) => a + b.selective, 0);
        const fixed = r.chat.tokens + (r.preset?.tokens || 0) + bookConst;
        tiles.replaceChildren(
          tile('当前对话', fmtTok(r.chat.tokens), r.chat.count + ' 层' + (r.chat.hidden ? ' · 隐藏 ' + r.chat.hidden + ' 层不计' : '')),
          tile('预设', r.preset ? fmtTok(r.preset.tokens) : '—', r.preset ? r.preset.name + ' · 启用 ' + r.preset.count + ' 条' : '未读到正在使用的预设'),
          tile('世界书（开启）', fmtTok(bookConst + bookSel), r.books.length + ' 本 · 蓝灯 ' + fmtTok(bookConst) + ' · 绿灯 ' + fmtTok(bookSel)),
          tile('合计', fmtTok(fixed), '对话 + 预设 + 蓝灯；绿灯最多再加 ' + fmtTok(bookSel))
        );
        if (!r.books.length) detail.append(node('div', 'cw-note', '当前没有开启的世界书。'));
        for (const book of r.books) {
          const d = node('details', 'cw-token-book');
          const head = node('summary', '');
          head.append(node('span', 'cw-token-book-name', '♢ ' + book.name),
            node('span', 'cw-token-book-meta', book.error ? '读取失败' : book.labels.join('/') + ' · 开启 ' + book.rows.length + '/' + book.total + ' 条 · ' + fmtTok(book.constant + book.selective)));
          d.append(head);
          if (book.error) d.append(node('div', 'cw-note', book.error));
          else {
            const bar = node('div', 'cw-token-split');
            bar.append(node('span', '', '蓝灯常驻 ' + fmtTok(book.constant) + ' · 绿灯（触发时才发送）' + fmtTok(book.selective)),
              button('在世界书页打开', () => gotoWorldbook(book.name), 'cw-token-btn'));
            d.append(bar);
            const list = node('div', 'cw-token-rows');
            for (const rowItem of book.rows) {
              const line = node('div', 'cw-token-row');
              const off = button('关闭', async () => {
                off.disabled = true;
                off.textContent = '关闭中…';
                try {
                  await disableEntry(book.name, rowItem.uid);
                  line.classList.add('is-off');
                  off.textContent = '已关闭';
                } catch (error) {
                  off.disabled = false;
                  off.textContent = '关闭';
                  notice('关闭失败：' + error.message);
                }
              }, 'cw-token-btn');
              off.title = '把这条世界书条目停用';
              line.append(node('span', 'cw-token-mode', rowItem.blue ? '蓝灯' : '绿灯'), node('span', 'cw-token-name', rowItem.name), node('span', 'cw-token-num', fmtTok(rowItem.tokens)), off);
              list.append(line);
            }
            if (!book.rows.length) list.append(node('div', 'cw-note', '这本书没有开启的条目。'));
            d.append(list);
          }
          detail.append(d);
        }
        note.textContent = (tokenEstimated ? '部分数字为按字数估算（≈）。' : '按酒馆当前分词器计算。') +
          '预设按默认顺序组统计启用条目的正文；绿灯条目只在关键词触发时才发送，所以实际占用通常比世界书合计少。';
      } catch (error) {
        if (my === rev) tiles.replaceChildren(node('div', 'cw-empty', '统计失败：' + error.message));
      }
    }
    W.setTimeout(run, 0);
    return box;
  }

  // 大尺寸编辑窗：默认占屏幕 80%，可切换全屏
  function openSheet(title) {
    const d = node('dialog', 'cw-dialog cw-sheet');
    d.setAttribute('aria-label', title);
    const head = node('div', 'cw-sheet-head');
    const full = button('全屏', () => {
      const on = d.classList.toggle('is-full');
      full.textContent = on ? '退出全屏' : '全屏';
    });
    head.append(node('div', 'cw-dialog-title cw-sheet-title', title), full);
    const tools = node('div', 'cw-sheet-tools');
    const body = node('div', 'cw-sheet-body');
    const foot = node('div', 'cw-actions cw-sheet-foot');
    d.append(head, tools, body, foot);
    let closed = false;
    const listeners = [];
    const sheet = {
      d, tools, body, foot,
      requestClose: null,
      onClose(fn) { listeners.push(fn); },
      close() {
        if (closed) return;
        closed = true;
        dialogs.delete(d);
        if (d.open) d.close();
        d.remove();
        for (const fn of listeners) fn();
      }
    };
    dialogs.set(d, () => sheet.close());
    d.addEventListener('cancel', event => {
      event.preventDefault();
      if (sheet.requestClose) void sheet.requestClose();
      else sheet.close();
    });
    d.addEventListener('keydown', event => event.stopPropagation());
    DOC.body.append(d);
    d.showModal();
    return sheet;
  }

  function countLiteral(text, query) {
    if (!query) return 0;
    return String(text ?? '').split(query).length - 1;
  }

  // 查找 / 替换 工具条（字面匹配，不当作正则）
  function findReplaceBar(parent, { next, prev, replaceOne, replaceAll }) {
    const q = input('查找内容');
    const r = input('替换为（留空即删除）');
    const status = node('span', 'cw-sheet-status', '');
    const run = async (fn, needQuery = true) => {
      if (needQuery && !q.value) { status.textContent = '请先填写查找内容'; return; }
      const text = await fn(q.value, r.value);
      if (typeof text === 'string') status.textContent = text;
    };
    q.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); void run(next); }
    });
    const nav = node('div', 'cw-find-nav');
    const prevBtn = button('‹ 上一个', () => run(prev));
    const nextBtn = button('下一个 ›', () => run(next));
    nav.append(prevBtn, nextBtn);
    parent.append(q, r, nav,
      button('替换当前', () => run(replaceOne)),
      button('全部替换', () => run(replaceAll)),
      status);
    return { q, r, status };
  }

  // 单段文字编辑：返回新文字；取消返回 null
  function editText(title, value, { readOnly = false } = {}) {
    return new Promise(resolve => {
      const sheet = openSheet(title);
      const area = node('textarea', 'cw-sheet-text');
      area.value = String(value ?? '');
      area.spellcheck = false;
      area.readOnly = readOnly;
      let dirty = false, result = null;
      area.addEventListener('input', () => { dirty = true; });
      if (!readOnly) {
        function positions(query) {
          const list = [];
          let at = area.value.indexOf(query);
          while (at >= 0) {
            list.push(at);
            at = area.value.indexOf(query, at + Math.max(1, query.length));
          }
          return list;
        }
        function focusAt(at, query, list) {
          area.focus();
          area.setSelectionRange(at, at + query.length);
          const line = area.value.slice(0, at).split('\n').length - 1;
          const lh = parseFloat(W.getComputedStyle(area).lineHeight) || 20;
          area.scrollTop = Math.max(0, line * lh - area.clientHeight / 3);
          return '第 ' + (list.indexOf(at) + 1) + ' / ' + list.length + ' 处';
        }
        findReplaceBar(sheet.tools, {
          next(query) {
            const list = positions(query);
            if (!list.length) return '没有找到';
            const at = list.find(pos => pos >= area.selectionEnd) ?? list[0];
            return focusAt(at, query, list);
          },
          prev(query) {
            const list = positions(query);
            if (!list.length) return '没有找到';
            const before = list.filter(pos => pos < area.selectionStart);
            const at = before.length ? before[before.length - 1] : list[list.length - 1];
            return focusAt(at, query, list);
          },
          replaceOne(query, replacement) {
            const list = positions(query);
            if (!list.length) return '没有找到';
            let at = area.selectionStart;
            if (area.value.slice(area.selectionStart, area.selectionEnd) !== query) {
              at = list.find(pos => pos >= area.selectionEnd) ?? list[0];
            }
            area.value = area.value.slice(0, at) + replacement + area.value.slice(at + query.length);
            dirty = true;
            area.selectionStart = area.selectionEnd = at + replacement.length;
            const rest = positions(query);
            if (!rest.length) return '已替换，剩 0 处';
            const nextAt = rest.find(pos => pos >= area.selectionEnd) ?? rest[0];
            focusAt(nextAt, query, rest);
            return '已替换 1 处，还剩 ' + rest.length + ' 处';
          },
          replaceAll(query, replacement) {
            const n = countLiteral(area.value, query);
            if (!n) return '没有找到';
            area.value = area.value.split(query).join(replacement);
            dirty = true;
            return '已替换 ' + n + ' 处';
          }
        });
      }
      sheet.body.classList.add('is-text');
      sheet.body.append(area);
      sheet.requestClose = async () => {
        if (dirty && !await ask('有修改还没保存，确定放弃吗？')) return;
        sheet.close();
      };
      sheet.foot.append(button(readOnly ? '关闭' : '取消', () => sheet.requestClose()));
      if (!readOnly) sheet.foot.append(button('保存', () => { result = area.value; sheet.close(); }, 'cw-primary'));
      sheet.onClose(() => resolve(result));
    });
  }

  // 条目列表编辑（正则 / 脚本）：直接修改 entries 里的对象；保存返回 true，取消返回 false
  function editList({ title, entries, nameOf, isOn, setOn, fields, empty, onAdd, onRemove }) {
    return new Promise(resolve => {
      const sheet = openSheet(title);
      let dirty = false, saved = false, query = '';
      const open = new Set();
      const list = node('div', 'cw-list');
      const count = node('span', 'cw-sheet-status', '');
      const matches = item => !query || fields.some(([key]) => String(item[key] ?? '').includes(query));

      function paint() {
        list.replaceChildren();
        const shown = entries.filter(matches);
        count.textContent = query ? '匹配 ' + shown.length + ' / ' + entries.length + ' 条' : '共 ' + entries.length + ' 条';
        if (!shown.length) {
          list.append(node('div', 'cw-empty', entries.length ? '没有匹配的条目' : (empty || '没有条目')));
          return;
        }
        for (const item of shown) {
          const card = node('div', 'cw-list-item' + (isOn(item) ? '' : ' is-off'));
          const head = node('div', 'cw-list-head');
          const toggle = heartSwitch(isOn(item), '启用「' + nameOf(item) + '」');
          toggle.addEventListener('change', () => {
            setOn(item, toggle.checked);
            card.classList.toggle('is-off', !toggle.checked);
            dirty = true;
          });
          const expanded = open.has(item) || !!query;
          const name = button((expanded ? '▾ ' : '▸ ') + nameOf(item), () => {
            open.has(item) ? open.delete(item) : open.add(item);
            paint();
          }, 'cw-list-name');
          head.append(toggle, name, node('span', 'cw-list-state', isOn(item) ? '已启用' : '已停用'));
          card.append(head);
          if (expanded) {
            const body = node('div', 'cw-list-body');
            if (onRemove) {
              const bar = node('div', 'cw-list-bar');
              bar.append(button('删除这一条', async () => {
                if (!await ask('删除「' + nameOf(item) + '」？\n保存后才会真正写入角色卡。')) return;
                onRemove(item);
                const at = entries.indexOf(item);
                if (at >= 0) entries.splice(at, 1);
                open.delete(item);
                dirty = true;
                paint();
              }, 'cw-danger cw-list-mini'));
              body.append(bar);
            }
            for (const [key, label, rows] of fields) {
              const area = node('textarea');
              area.rows = rows;
              area.spellcheck = false;
              area.value = String(item[key] ?? '');
              area.addEventListener('input', () => { item[key] = area.value; dirty = true; });
              const hit = query ? countLiteral(area.value, query) : 0;
              const fieldHead = node('div', 'cw-list-field-head');
              fieldHead.append(node('span', '', label + (hit ? ' · ' + hit + ' 处匹配' : '')),
                button('全屏编辑', async () => {
                  const next = await editText(nameOf(item) + ' · ' + label, area.value);
                  if (next === null) return;
                  item[key] = next;
                  area.value = next;
                  dirty = true;
                }, 'cw-list-mini'));
              const box = node('label', 'cw-list-field');
              box.append(fieldHead, area);
              body.append(box);
            }
            card.append(body);
          }
          list.append(card);
        }
      }

      let cursor = -1;
      function hits(value) {
        return entries.filter(item => fields.some(([key]) => countLiteral(String(item[key] ?? ''), value)));
      }
      function focusHit(list, index) {
        cursor = (index + list.length) % list.length;
        const item = list[cursor];
        query = '';
        open.add(item);
        paint();
        const at = entries.filter(matches).indexOf(item);
        W.requestAnimationFrame(() => {
          const cards = sheet.body.querySelectorAll('.cw-list-item');
          const target = cards[at];
          if (target) {
            target.classList.add('is-hit');
            target.scrollIntoView({ block: 'center' });
            W.setTimeout(() => target.classList.remove('is-hit'), 1200);
          }
        });
        return '第 ' + (cursor + 1) + ' / ' + list.length + ' 条（' + nameOf(item) + '）';
      }
      findReplaceBar(sheet.tools, {
        next(value) {
          const list = hits(value);
          if (!list.length) return '没有找到';
          return focusHit(list, cursor + 1);
        },
        prev(value) {
          const list = hits(value);
          if (!list.length) return '没有找到';
          return focusHit(list, cursor - 1);
        },
        replaceOne(value, replacement) {
          const list = hits(value);
          if (!list.length) return '没有找到';
          const item = list[Math.max(0, Math.min(cursor, list.length - 1))];
          let n = 0;
          for (const [key] of fields) {
            const text = String(item[key] ?? '');
            const count2 = countLiteral(text, value);
            if (count2) { item[key] = text.split(value).join(replacement); n += count2; }
          }
          if (n) { dirty = true; paint(); }
          const rest = hits(value);
          return '已替换这一条的 ' + n + ' 处，还有 ' + rest.length + ' 条含有它';
        },
        replaceAll(value, replacement) {
          let n = 0;
          for (const item of entries) {
            for (const [key] of fields) {
              const text = String(item[key] ?? '');
              const hit = countLiteral(text, value);
              if (hit) { item[key] = text.split(value).join(replacement); n += hit; }
            }
          }
          if (n) { dirty = true; query = ''; cursor = -1; paint(); }
          return n ? '已替换 ' + n + ' 处' : '没有找到';
        }
      });
      sheet.tools.append(button('只看匹配的', () => {
        const value = sheet.tools.querySelector('input')?.value || '';
        query = query ? '' : value;
        paint();
      }));
      if (onAdd) {
        sheet.tools.append(button('＋ 新增', async () => {
          const item = await onAdd();
          if (!item) return;
          entries.push(item);
          open.add(item);
          query = '';
          dirty = true;
          paint();
        }, 'cw-primary'));
      }
      sheet.body.append(list);
      sheet.requestClose = async () => {
        if (dirty && !await ask('有修改还没保存，确定放弃吗？')) return;
        sheet.close();
      };
      sheet.foot.append(count, button('取消', () => sheet.requestClose()),
        button('保存', () => { saved = true; sheet.close(); }, 'cw-primary'));
      sheet.onClose(() => resolve(saved && dirty));
      paint();
    });
  }

  // 打开系统文件选择；取消时返回空数组
  function pickFiles(accept, multiple = false) {
    return new Promise(resolve => {
      const picker = node('input');
      picker.type = 'file';
      picker.accept = accept;
      picker.multiple = multiple;
      picker.hidden = true;
      let settled = false;
      const done = files => {
        if (settled) return;
        settled = true;
        picker.remove();
        resolve(files);
      };
      picker.addEventListener('change', () => done([...(picker.files || [])]), { once: true });
      picker.addEventListener('cancel', () => done([]), { once: true });
      (hub || DOC.body).append(picker);
      picker.click();
    });
  }

  async function fileText(file) {
    return String(await file.text()).replace(/^\uFEFF/, '');
  }

  function uniqueName(base, taken) {
    let name = base, n = 2;
    while (taken.includes(name)) name = base + ' (' + n++ + ')';
    return name;
  }

  // multipart 上传到酒馆后端（不能带 JSON 的 Content-Type）
  async function apiUpload(path, fields) {
    const ctx = context();
    const headers = typeof ctx?.getRequestHeaders === 'function' ? { ...ctx.getRequestHeaders() } : {};
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'content-type') delete headers[key];
    }
    const form = new W.FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value && typeof value === 'object') form.append(key, value, value.name || 'upload');
      else form.append(key, String(value ?? ''));
    }
    const response = await W.fetch(path, { method: 'POST', headers, body: form });
    if (!response.ok) throw Error('HTTP ' + response.status);
    const text = await response.text();
    try { return JSON.parse(text); } catch { return text; }
  }

  // 酒馆有些接口只回 200 / "OK"，不返回 JSON
  async function apiPostRaw(path, body) {
    const ctx = context();
    const headers = typeof ctx?.getRequestHeaders === 'function'
      ? ctx.getRequestHeaders()
      : { 'Content-Type': 'application/json' };
    const response = await W.fetch(path, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!response.ok) throw Error('HTTP ' + response.status);
    return response.text();
  }

  function helperFn(name) {
    return [globalThis[name], W[name], globalThis.TavernHelper?.[name], W.TavernHelper?.[name]]
      .find(fn => typeof fn === 'function');
  }

  function validImage(value) {
    value = String(value || '').trim();
    if (!value) return '';
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw Error('请填写 http 或 https 图片直链。');
    }
    return url.href;
  }

  // 只按用户填的屏蔽标签过滤，不再只截取 <content>
  function hiddenTags() {
    return String(object(cfg.reader).hideTags || '');
  }
  function visibleText(value) {
    let out = String(value || '').replace(/<!--[\s\S]*?(?:-->|$)/g, '');
    for (const raw of hiddenTags().split(/[,，、\s]+/).filter(Boolean)) {
      const tag = raw.replace(/[^\w-]/g, '');
      if (!tag) continue;
      out = out.replace(new RegExp('<' + tag + '\\b[^>]*>[\\s\\S]*?<\\/' + tag + '\\s*>', 'gi'), '')
        .replace(new RegExp('<' + tag + '\\b[^>]*\\/?>', 'gi'), '')
        .replace(new RegExp('\\[' + tag + '\\b[^\\]]*\\][\\s\\S]*?\\[\\/' + tag + '\\]', 'gi'), '');
    }
    return out.replace(/\n{3,}/g, '\n\n').trim();
  }

  // ── 译文：存在本地，默认保留 ──
  const TRANS_KEY = 'cyll-pear-trans-v1';
  let transCache = null;
  const DEFAULT_TRANS_PROMPT = '把用户发来的内容翻译成简体中文。只输出译文本身，不要加说明、不要解释，保留原有的换行、标签和结构。';
  function transStore() {
    if (!transCache) transCache = object(read(TRANS_KEY, {}));
    return transCache;
  }
  function transGet(key) {
    return key ? String(transStore()[key] || '') : '';
  }
  function transSet(key, value) {
    if (!key) return true;
    const store = transStore();
    if (value) store[key] = value; else delete store[key];
    try {
      W.localStorage.setItem(TRANS_KEY, JSON.stringify(store));
      return true;
    } catch {
      notice('译文保存失败，浏览器存储可能已满。');
      return false;
    }
  }

  // ── 翻译：优先用控制台里配置的副 API，否则用酒馆当前连着的模型 ──
  async function translateText(text) {
    const conf = object(cfg.transApi);
    const prompt = String(conf.prompt || DEFAULT_TRANS_PROMPT);
    if (conf.enabled && conf.url && conf.model) {
      const base = String(conf.url).replace(/\/+$/, '');
      const endpoint = /\/chat\/completions$/.test(base) ? base : base + '/chat/completions';
      const response = await W.fetch(endpoint, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, conf.key ? { Authorization: 'Bearer ' + conf.key } : {}),
        body: JSON.stringify({
          model: conf.model,
          messages: [{ role: 'system', content: prompt }, { role: 'user', content: text }],
          temperature: 0.2,
          stream: false
        })
      });
      if (!response.ok) throw Error('副 API 返回 HTTP ' + response.status);
      const data = await response.json();
      const out = data?.choices?.[0]?.message?.content;
      if (!out) throw Error('副 API 没有返回译文');
      return String(out).trim();
    }
    const ctx = context();
    const full = prompt + '\n\n' + text;
    if (typeof ctx?.generateQuietPrompt === 'function') {
      const out = await ctx.generateQuietPrompt(full, false, true);
      if (out) return String(out).trim();
    }
    const raw = helperFn('generateRaw');
    if (raw) {
      const out = await raw({ ordered_prompts: [{ role: 'user', content: full }], should_stream: false });
      if (out) return String(out).trim();
    }
    throw Error('没有可用的翻译接口，可以在控制台里配置翻译副 API。');
  }

  async function fetchTransModels(url, key) {
    const base = String(url).replace(/\/+$/, '');
    const endpoint = /\/models$/.test(base) ? base : base + '/models';
    const response = await W.fetch(endpoint, {
      headers: key ? { Authorization: 'Bearer ' + key } : {}
    });
    if (!response.ok) throw Error('HTTP ' + response.status);
    const data = await response.json();
    const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    return list.map(item => String(item?.id || item)).filter(Boolean);
  }

  // 给任意条目挂一个译文区：翻译、手写译文、删除译文；译文默认留着
  function translateBox(getText, storeKey, title = '译文') {
    const wrap = node('div', 'cw-tr');
    const head = node('div', 'cw-tr-head');
    const out = node('div', 'cw-tr-text');
    const saved = transGet(storeKey);
    out.textContent = saved;
    out.hidden = !saved;

    function show(text) {
      out.textContent = text;
      out.hidden = !text;
      go.textContent = text ? '重新翻译' : '翻译';
      del.hidden = !text;
      fold.hidden = !text;
    }
    const go = button(saved ? '重新翻译' : '翻译', async () => {
      const text = String(getText() || '').trim();
      if (!text) { notice('这里没有可翻译的内容。'); return; }
      go.disabled = true;
      go.textContent = '翻译中…';
      out.hidden = false;
      out.textContent = '正在翻译…';
      try {
        const result = await translateText(text);
        transSet(storeKey, result);
        show(result);
      } catch (error) {
        show('翻译失败：' + error.message);
      } finally {
        go.disabled = false;
      }
    }, 'ca-sec-btn');
    const write = button('自己写译文', async () => {
      const next = await editText(title, transGet(storeKey) || '');
      if (next === null) return;
      transSet(storeKey, next.trim());
      show(next.trim());
    }, 'ca-sec-btn');
    const del = button('删除译文', () => {
      transSet(storeKey, '');
      show('');
    }, 'ca-sec-btn');
    const fold = button('收起', () => {
      out.hidden = !out.hidden;
      fold.textContent = out.hidden ? '展开译文' : '收起';
    }, 'ca-sec-btn');
    del.hidden = !saved;
    fold.hidden = !saved;
    head.append(node('span', 'cw-tr-label', title), go, write, fold, del);
    wrap.append(head, out);
    return wrap;
  }

  function parseContent(value) {
    const text = String(value || '').replace(/<!--[\s\S]*?(?:-->|$)/g, '');
    const parts = [];
    const pattern = /<content\b[^>]*>([\s\S]*?)(?:<\/content\s*>|$)/gi;
    let match;
    while ((match = pattern.exec(text))) parts.push(match[1].trim());
    return parts.length ? parts.join('\n\n') : text;
  }

  function preview(value, max = 50) {
    const text = String(value || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\{\{[^}]*\}\}/g, ' ')
      .replace(/[#*`>~_|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text ? text.slice(0, max) + (text.length > max ? '…' : '') : '空内容';
  }

  function stamp(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (!value) return 0;
    const s = String(value);
    if (/^\d{10,13}$/.test(s)) return Number(s) * (s.length === 10 ? 1000 : 1);
    const date = Date.parse(s);
    if (Number.isFinite(date)) return date;
    const m = s.match(/(\d{4})-(\d{2})-(\d{2})@(\d{2})h(\d{2})m(\d{2})s/);
    return m
      ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime()
      : 0;
  }

  const collator = new Intl.Collator('zh-Hans-CN-u-co-pinyin', {
    numeric: true,
    sensitivity: 'base'
  });

  function sortName(character) {
    return String(character.name || '')
      .normalize('NFKC')
      .replace(/^[^\p{L}\p{N}]+/u, '')
      .trim();
  }

  function initial(character) {
    const ch = Array.from(sortName(character))[0] || '';
    if (/[a-z]/i.test(ch)) return ch.toUpperCase();
    if (/[0-9]/.test(ch)) return '0';
    if (/\p{Script=Han}/u.test(ch)) {
      const boundaries = '阿八嚓咑妸发旮哈丌咔垃妈拏噢妑七呥仨他屲夕丫帀';
      const letters = 'ABCDEFGHJKLMNOPQRSTWXYZ';
      let result = 'A';
      for (let i = 0; i < boundaries.length; i++) {
        if (collator.compare(ch, boundaries[i]) < 0) break;
        result = letters[i] || result;
      }
      return result;
    }
    return '#';
  }

  function alphaCompare(a, b) {
    const rank = s => s === '#' ? 99 : s === '0' ? 98 : s.charCodeAt(0) - 65;
    return rank(initial(a)) - rank(initial(b))
      || collator.compare(sortName(a), sortName(b))
      || String(a.avatar).localeCompare(String(b.avatar));
  }

  function currentIdentity(ctx = context()) {
    return [
      ctx?.groupId ?? '',
      ctx?.characterId ?? '',
      ctx?.getCurrentChatId?.() ?? ctx?.chatId ?? ''
    ].join('::');
  }

  function isGenerating(ctx = context()) {
    const generating = typeof ctx?.isGenerating === 'function'
      ? ctx.isGenerating()
      : ctx?.isGenerating;
    return !!generating
      || !!(
        ctx?.streamingProcessor
        && !ctx.streamingProcessor.isFinished
        && !ctx.streamingProcessor.isStopped
      )
      || !!DOC.querySelector('#mes_stop')?.getClientRects().length;
  }

  async function apiPost(path, body) {
    const ctx = context();
    const headers = typeof ctx?.getRequestHeaders === 'function'
      ? ctx.getRequestHeaders()
      : { 'Content-Type': 'application/json' };
    const response = await W.fetch(path, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    if (!response.ok) throw Error('HTTP ' + response.status);
    return response.json();
  }

  function stableString(value) {
    if (Array.isArray(value)) return '[' + value.map(stableString).join(',') + ']';
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort()
        .filter(key => value[key] !== undefined)
        .map(key => JSON.stringify(key) + ':' + stableString(value[key]))
        .join(',') + '}';
    }
    return JSON.stringify(value);
  }

  async function commitChat(ctx, next) {
    if (typeof ctx?.saveChat !== 'function') {
      throw Error('酒馆未提供即时保存接口，未修改聊天。');
    }
    if (isGenerating(ctx)) throw Error('请等当前生成结束后再操作。');

    const identity = currentIdentity(ctx);
    if (currentIdentity() !== identity) throw Error('聊天已切换，请刷新后重试。');

    const file = ctx.getCurrentChatId?.() || ctx.chatId;
    if (!file) throw Error('当前聊天没有有效的存档名称。');

    const character = ctx.characters?.[ctx.characterId];
    const group = ctx.groupId != null;
    const previous = ctx.chat.slice();
    const expected = clone(next);
    const body = group
      ? { id: file }
      : { ch_name: character?.name, avatar_url: character?.avatar, file_name: file };

    ctx.chat.splice(0, ctx.chat.length, ...expected);

    let saveReturned = false;
    try {
      await ctx.saveChat();
      saveReturned = true;
      const data = await apiPost(group ? '/api/chats/group/get' : '/api/chats/get', body);
      const messages = Array.isArray(data)
        ? data.filter(m => m && typeof m.mes === 'string')
        : null;
      const wanted = expected.filter(m => m && typeof m.mes === 'string');
      if (!messages || stableString(messages) !== stableString(wanted)) {
        throw Error('服务器存档与修改结果不一致，请重新打开原聊天核对。');
      }
      if (currentIdentity() !== identity) {
        throw Error('保存期间聊天已切换，请重新打开原聊天核对。');
      }
    } catch (error) {
      if (!saveReturned && currentIdentity() === identity) {
        ctx.chat.splice(0, ctx.chat.length, ...previous);
      }
      if (saveReturned) {
        error.message = '保存请求已提交，但结果未能确认。' + error.message;
      }
      throw error;
    }
  }

  async function refreshChat(ctx) {
    try {
      if (!ctx.chat.length && typeof ctx.clearChat === 'function' && typeof ctx.printMessages === 'function') {
        await ctx.clearChat({ clearData: false });
        await ctx.printMessages();
      } else if (typeof ctx.reloadCurrentChat === 'function') {
        await ctx.reloadCurrentChat();
      } else {
        notice('聊天已保存，请重新打开当前聊天以刷新显示。');
      }
    } catch (error) {
      notice('聊天已保存，但刷新显示失败：' + error.message);
    }
  }

  function applySwipe(message, selected) {
    if (selected === undefined) return;
    const swipes = message.swipes?.length ? message.swipes : [message.mes];
    if (!Number.isInteger(selected) || selected < 0 || selected >= swipes.length) throw Error('回复版本不存在。');
    const old = Number(message.swipe_id) || 0;
    if (old === selected) return;
    message.swipes = swipes;
    message.swipes[old] = message.mes;
    message.swipe_info ||= [];
    message.swipe_info[old] = {
      send_date: message.send_date, gen_started: message.gen_started,
      gen_finished: message.gen_finished, extra: clone(message.extra || {})
    };
    const info = message.swipe_info[selected] || {};
    message.swipe_id = selected;
    message.mes = swipes[selected];
    for (const key of ['send_date', 'gen_started', 'gen_finished']) {
      if (info[key] !== undefined) message[key] = info[key];
      else delete message[key];
    }
    message.extra = clone(info.extra || {});
  }

  async function saveNewArchive(character, source, metadata = {}) {
    const file = '分支-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + W.crypto.randomUUID();
    const data = clone(source);
    const header = data[0] && !('mes' in data[0]) ? data.shift() : {
      user_name: 'unused', character_name: 'unused', chat_metadata: clone(metadata || {})
    };
    header.chat_metadata ||= {};
    header.chat_metadata.integrity = W.crypto.randomUUID();
    delete header.chat_metadata.main_chat;
    const payload = [header, ...data];
    const body = { ch_name: character.name, avatar_url: character.avatar, file_name: file };
    const result = await apiPost('/api/chats/save', { ...body, chat: payload });
    if (!result?.ok) throw Error('服务器未确认新档保存。');
    const saved = await apiPost('/api/chats/get', body);
    if (stableString(saved) !== stableString(payload)) throw Error('新档写入未能核对，请在存档列表检查「' + file + '」。');
    return file;
  }

  // 爱心勾选按钮：与预设 / 世界书的启用开关同款；对外表现像复选框（checked + change 事件）
  function heartSwitch(checked = false, label = '选择') {
    const control = node('button', 'cw-heart');
    control.type = 'button';
    control.setAttribute('role', 'checkbox');
    const art = node('span', 'cw-heart-art');
    art.setAttribute('aria-hidden', 'true');
    art.style.cssText = 'all: initial !important; display: block !important; width: 22px !important; height: 22px !important; pointer-events: none !important;';
    control.append(art);
    const root = art.attachShadow({ mode: 'open' });
    const style = node('style');
    style.textContent = `
      :host { -webkit-tap-highlight-color: transparent; }
      .frame { all: initial; box-sizing: border-box; width: 22px; height: 22px; display: grid; place-items: center; border: 1px solid var(--cw-border, #808080); border-radius: 4px; background: transparent; pointer-events: none; }
      img, .heart { all: initial; grid-area: 1 / 1; width: 20px; height: 20px; pointer-events: none; }
      img { display: block; object-fit: contain; }
      .heart { display: grid; place-items: center; color: #ed8eae; -webkit-text-stroke: .5px #75465b; font: 19px/20px sans-serif; }
      [hidden] { display: none !important; }
    `;
    const frame = node('span', 'frame');
    const image = node('img');
    image.alt = '';
    image.draggable = false;
    const fallback = node('span', 'heart', '♥');
    let state = !!checked, loaded = false;
    function paint() {
      control.setAttribute('aria-checked', String(state));
      control.setAttribute('aria-label', label + (state ? '（已选）' : ''));
      control.title = label;
      image.hidden = !state || !loaded;
      fallback.hidden = !state || loaded;
    }
    image.addEventListener('load', () => { loaded = true; paint(); });
    image.addEventListener('error', () => { loaded = false; paint(); });
    Object.defineProperty(control, 'checked', {
      get: () => state,
      set(value) { state = !!value; paint(); }
    });
    frame.append(image, fallback);
    root.append(style, frame);
    paint();
    image.src = PEAR_SWITCH_IMAGE;
    control.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (control.disabled) return;
      control.checked = !state;
      control.dispatchEvent(new W.Event('change'));
    });
    return control;
  }

  function selectionBox(set, id, disabled = false) {
    const wrap = node('span', 'cw-check cw-select');
    const check = heartSwitch(set.has(id), '选择');
    check.disabled = disabled;
    check.addEventListener('change', () => check.checked ? set.add(id) : set.delete(id));
    wrap.append(check);
    return wrap;
  }

  function deletionSet(ids, length, tail) {
    const selected = [...ids].filter(i => Number.isInteger(i) && i >= 0 && i < length);
    if (!selected.length) throw Error('请先勾选楼层。');
    return new Set(tail ? Array.from({ length: length - Math.min(...selected) }, (_, i) => i + Math.min(...selected)) : selected);
  }

  function remapBranches(key, removed) {
    const all = object(read(BRANCH_KEY, {}));
    if (!Array.isArray(all[key])) return;
    all[key] = all[key].filter(b => !removed.has(b.branchPoint)).map(b => ({
      ...b, branchPoint: b.branchPoint - [...removed].filter(i => i < b.branchPoint).length
    }));
    try { W.localStorage.setItem(BRANCH_KEY, JSON.stringify(all)); }
    catch { notice('楼层已保存，但旧分支索引未能更新。'); }
  }

  const THEME_SELECTOR = ':is(#cw-hub, .cw-dialog, .pw-dialog, .wb-dialog)';
  const OLD_THEME_SELECTOR = ':is(#cw-home, #ca-panel, #sb-panel, .cw-dialog)';
  const CW_SCOPE = ':is(#cw-tabs, #cw-settings-page, #ca-panel, #sb-panel, #api-panel, #st-panel, #tl-panel, .cw-dialog)';
  const THEME_TEMPLATE = `/* ♡ 四页统一美化：预设 / 世界书 / 聊天档案馆 / 回复分支 / 设置
   下面的颜色变量对全部页面和弹窗生效。
   单独调整某一页时可用：#pw-panel（预设）、#wb-panel（世界书）、
   #ca-panel（聊天档案馆）、#sb-panel（回复分支）、#cw-tabs（顶部切页栏）。 */
${THEME_SELECTOR} {
  /* 颜色默认跟随酒馆主题；线框用正文色混出来，任何主题下都看得见 */
  --cw-bg: var(--SmartThemeBlurTintColor, transparent);
  --cw-bg2: color-mix(in srgb, var(--SmartThemeBodyColor, #888) 5%, transparent);
  --cw-surface: var(--SmartThemeBlurTintColor, transparent);
  --cw-text: var(--SmartThemeBodyColor, inherit);
  --cw-text-dim: var(--SmartThemeBodyColor, inherit);
  --cw-text-light: var(--SmartThemeBodyColor, inherit);
  --cw-border: color-mix(in srgb, var(--SmartThemeBodyColor, #d9dfeb) 48%, #64748b);
  --cw-border-light: color-mix(in srgb, var(--SmartThemeBodyColor, #d9dfeb) 48%, #64748b);
  --cw-accent: var(--SmartThemeQuoteColor, var(--SmartThemeBorderColor, currentColor));
  --cw-accent-soft: color-mix(in srgb, var(--SmartThemeBodyColor, #888) 10%, transparent);
  --cw-accent-text: var(--SmartThemeBodyColor, inherit);
  --cw-danger: var(--SmartThemeBodyColor, inherit);
  --cw-radius: 0px;
  --cw-line: 1px solid var(--cw-border);

  /* 悬浮窗方案与统一美化方案 */
  --cw-preset-bg: var(--cw-surface);
  --cw-preset-text: var(--cw-text);
  --cw-preset-border: var(--cw-border);
  --cw-preset-radius: var(--cw-radius);

  /* 顶栏图标和悬浮图的预览区 */
  --cw-preview-bg: var(--cw-accent-soft);
  --cw-preview-border: var(--cw-border-light);
}

/* 全局：所有条目、卡片、列表项都是直角线框 */
:is(#pw-panel .pw-entry, #pw-panel .pw-book, #pw-panel .pw-box, #pw-panel .pw-field,
  #wb-panel .wb-entry, #wb-panel .wb-book, #wb-panel .wb-box, #wb-panel .wb-field,
  #ca-panel .ca-chat-item, #ca-panel .ca-msg, #sb-panel .sb-msg, #sb-panel .sb-branch-row,
  #cw-settings-page details, .cw-preset-box, .pw-stitch-item, .wb-stitch-item,
  #ca-panel .ca-card, #ca-panel .ca-hero, #ca-panel .ca-sec, .cw-list-item,
  #api-panel .api-card, #api-panel .api-saved-row, #st-panel .st-card, #st-panel .ca-sec) {
  border: var(--cw-line) !important;
  border-radius: var(--cw-radius) !important;
}

/* 全局：按钮与输入框同一套线框 */
:is(#cw-hub, .cw-dialog, .pw-dialog, .wb-dialog) :is(.cw-button, .pw-button, .wb-button, input:not([type=range]), select, textarea) {
  border-color: var(--cw-border);
  border-radius: var(--cw-radius);
}

/* 顶部切页栏 */
#cw-tabs {
  background: var(--cw-surface);
  border-bottom-color: var(--cw-border);
}

#cw-tabs .cw-tab[aria-selected=true] {
  background:var(--cw-accent-soft);color:var(--cw-text);border-color:var(--cw-border);box-shadow:inset 0 0 0 1px var(--cw-border);
}

/* 方案选择区域 */
${CW_SCOPE} .cw-preset-box {
  padding: 12px;
  margin-top: 14px;
  background: var(--cw-preset-bg);
  color: var(--cw-preset-text);
  border: 1px solid var(--cw-preset-border);
  border-radius: var(--cw-preset-radius);
}

${CW_SCOPE} .cw-preset-select {
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  background: var(--cw-preset-bg);
  color: var(--cw-preset-text);
  border: 1px solid var(--cw-preset-border);
  border-radius: var(--cw-preset-radius);
}

${CW_SCOPE} .cw-preset-select option {
  background: var(--cw-preset-bg);
  color: var(--cw-preset-text);
}

${CW_SCOPE} .cw-preset-select:focus-visible {
  outline: 2px solid var(--cw-accent);
  outline-offset: 2px;
}

${CW_SCOPE} .cw-preset-box .cw-button {
  background: var(--cw-preset-bg);
  color: var(--cw-preset-text);
  border-color: var(--cw-preset-border);
  border-radius: var(--cw-preset-radius);
}

/* 悬浮窗方案按钮 */
#cw-settings-page #cw-fab-preset-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

#cw-settings-page #cw-fab-preset-actions .cw-button {
  flex: 1 1 110px;
}

/* 图片预览 */
#cw-settings-page .cw-image-preview {
  display: grid;
  place-items: center;
  width: 76px;
  height: 76px;
  padding: 8px;
  margin: 12px auto;
  font-size: calc(30px * var(--cw-fs, 1));
  background: var(--cw-preview-bg);
  border: 1px solid var(--cw-preview-border);
  border-radius: var(--cw-radius);
}

#cw-settings-page .cw-image-preview img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* 确认、输入、提示、复制弹窗 */
.cw-dialog {
  --cw-dialog-bg: var(--cw-bg);
  --cw-dialog-text: var(--cw-text);
  --cw-dialog-border: var(--cw-border);
  --cw-dialog-accent: var(--cw-accent);
  --cw-dialog-radius: 18px;
  --cw-dialog-shadow: 0 18px 70px #0008;
}

/* 所有选择栏统一美化 */
${CW_SCOPE} select {
  background-color: var(--cw-surface);
  color: var(--cw-text);
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius);
  background-image:
    linear-gradient(45deg, transparent 50%, var(--cw-text-dim) 50%),
    linear-gradient(135deg, var(--cw-text-dim) 50%, transparent 50%);
  background-position: calc(100% - 16px) 50%, calc(100% - 11px) 50%;
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
}

${CW_SCOPE} select:hover {
  border-color: var(--cw-accent);
}

${CW_SCOPE} select option {
  background: var(--cw-surface);
  color: var(--cw-text);
}

/* 所有可点击元素的轮廓线 */
${CW_SCOPE} .cw-button:hover,
${CW_SCOPE} .ca-rename-btn:hover,
${CW_SCOPE} .ca-chat-name:hover {
  border-color: var(--cw-accent);
}

${CW_SCOPE} :is(.cw-button, select, input, textarea, summary):focus-visible {
  outline: 2px solid var(--cw-accent);
  outline-offset: 2px;
}

/* 文本编辑器工具栏 */
.cw-edit-toolbar {
  background: var(--cw-bg2);
  border: 1px solid var(--cw-border-light);
  border-radius: var(--cw-radius);
}

/* 文本编辑区 */
.cw-edit-area {
  background: var(--cw-surface);
  color: var(--cw-text);
  border: 1px solid var(--cw-border-light);
  border-radius: var(--cw-radius);
}

.cw-dialog::backdrop {
  background: #0007;
  backdrop-filter: blur(5px);
}

.cw-dialog .cw-dialog-message {
  line-height: 1.8;
}
`;

  const baseStyle = node('style');
  baseStyle.id = 'cw-style';
  baseStyle.textContent = `
${CW_SCOPE}{
  box-sizing:border-box;
  font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
  font-size:calc(14px * var(--cw-fs, 1));line-height:1.6;
  color:var(--cw-text);
}
${CW_SCOPE} *{box-sizing:border-box}
#cw-hub{
  position:fixed;inset:0;z-index:2147483500;
  display:flex;flex-direction:column;
  width:100%;height:100vh;height:100dvh;
  max-width:none;max-height:none;
  padding:0;margin:0;border:0;border-radius:0;
  overflow:hidden;background:var(--cw-bg);color:var(--cw-text);
  backdrop-filter:blur(18px);
  box-sizing:border-box;
  font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
  font-size:calc(14px * var(--cw-fs, 1));line-height:1.6;
}
#cw-hub[hidden]{display:none!important}
#cw-tabs{
  display:flex;align-items:center;gap:5px;flex-shrink:0;
  padding:6px 8px;padding-top:max(8px,env(safe-area-inset-top));
  border-bottom:1px solid var(--cw-border);background:var(--cw-surface);
}
#cw-tabs .cw-tab-list{
  display:flex;gap:5px;flex:1;min-width:0;
  overflow-x:auto;overflow-y:hidden;scrollbar-width:none;
  -webkit-overflow-scrolling:touch;
}
#cw-tabs .cw-tab-list::-webkit-scrollbar{display:none}
#cw-tabs .cw-tab{
  flex:1 1 auto;display:inline-flex;align-items:center;justify-content:center;gap:5px;
  min-height:36px;padding:5px 8px;white-space:nowrap;font-weight:600;letter-spacing:0;
}
#cw-tabs .cw-tab-label{letter-spacing:0}
#cw-tabs .cw-tab[aria-selected=true]{
  background:var(--cw-accent-soft);color:var(--cw-text);border-color:var(--cw-border);box-shadow:inset 0 0 0 1px var(--cw-border);
}
#cw-tabs .cw-tab-icon{display:inline-grid;place-items:center;width:19px;height:19px;max-height:100%;flex:0 0 19px;font-size:calc(15px * var(--cw-fs, 1));line-height:1}
#cw-tabs .cw-tab-icon img{display:block;width:100%;height:100%;object-fit:contain;pointer-events:none}
#cw-settings-page .cw-icon-row{padding:10px 0;border-bottom:1px dashed var(--cw-border)}
#cw-settings-page .cw-icon-row:last-child{border-bottom:0}
#cw-settings-page .cw-tab-preview{width:56px;height:56px;margin:6px 0 10px}
#cw-tabs .cw-tab-tool{flex:0 0 auto;min-width:38px;min-height:38px;padding:6px 10px}

${CW_SCOPE} button.cw-heart{all:unset;box-sizing:border-box;display:inline-grid;place-items:center;
  width:32px;height:32px;flex:0 0 32px;cursor:pointer;margin-right:6px}
${CW_SCOPE} button.cw-heart:focus-visible{outline:2px solid var(--cw-border);outline-offset:1px}
${CW_SCOPE} button.cw-heart:disabled{opacity:.55;cursor:default}
.cw-select{display:inline-flex;margin:0;flex-shrink:0}
#ca-panel .cw-toolbar .cw-check{margin:0;white-space:nowrap;font-size:calc(12px * var(--cw-fs, 1))}
#cw-hub-body{
  position:relative;display:flex;flex-direction:column;
  flex:1;min-height:0;overflow:hidden;
}
#cw-hub-body>[hidden]{display:none!important}
#cw-hub-body>:is(#pw-panel,#wb-panel,#ca-panel,#sb-panel,#tl-panel){
  position:relative!important;inset:auto!important;z-index:auto!important;
  flex:1 1 auto;min-height:0;width:100%;height:auto!important;
  background:transparent!important;backdrop-filter:none!important;
  display:flex;flex-direction:column;overflow:hidden;
}
#cw-hub-body :is(.pw-head,.wb-head){padding-top:10px!important}
#cw-hub-body>:is(#api-panel,#st-panel){
  position:relative;flex:1 1 auto;min-height:0;width:100%;
  display:flex;flex-direction:column;overflow:auto;overscroll-behavior:contain;
  padding:14px 16px;gap:14px;box-sizing:border-box;
}
#api-panel .api-card,#st-panel .ca-sec{display:block}
.api-card{border:var(--cw-line);border-radius:var(--cw-radius);background:var(--cw-surface);padding:12px 14px;display:grid;gap:10px}
.api-rows{display:grid;gap:6px}
.api-row{display:flex;gap:10px;font-size:calc(13px * var(--cw-fs, 1));align-items:baseline}
.api-row-label{flex:0 0 88px;opacity:.75;font-size:calc(12px * var(--cw-fs, 1))}
.api-row-value{flex:1;min-width:0;overflow-wrap:anywhere}
.api-form{display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px 14px;align-items:center}
.api-form>.api-label{justify-self:start}
#api-panel .api-form>input,#api-panel .api-form>select,.cw-dialog .api-form>input,.cw-dialog .api-form>select{min-height:38px;padding:8px 12px}
.api-form-wrap{display:grid;gap:10px}
.api-key-row{display:flex;gap:8px;align-items:center;min-width:0}
.api-key-row>button{white-space:nowrap;flex:0 0 auto;min-height:38px}
.cw-dialog .api-form-wrap{gap:12px}
#api-panel .api-key-row>:first-child{flex:1;min-width:0}
#api-panel .api-key-row>button{flex:0 0 auto;white-space:nowrap}
#api-panel .api-key-row>select,.cw-dialog .api-key-row>select{min-height:38px}
.api-source{font-size:calc(12px * var(--cw-fs, 1));opacity:.75;white-space:nowrap}
.api-extra{border:var(--cw-line);border-radius:var(--cw-radius);padding:8px 10px}
.api-extra>summary{cursor:pointer;font-weight:650;font-size:calc(13px * var(--cw-fs, 1))}
.api-extra-field{display:grid;gap:4px;margin-top:8px}
#api-panel .api-extra-text{width:100%;box-sizing:border-box;font:calc(12px * var(--cw-fs, 1))/1.6 ui-monospace,Menlo,Consolas,monospace;resize:vertical}
#st-panel .st-card-star{
  all:unset;box-sizing:border-box;display:grid;place-items:center;cursor:pointer;
  width:24px;height:24px;flex:0 0 24px;border:var(--cw-line);border-radius:0;
  background:var(--cw-surface);font-size:calc(12px * var(--cw-fs, 1));line-height:1;
}
#api-panel .api-pin.is-on{background:var(--cw-accent-soft);box-shadow:inset 0 0 0 1px var(--cw-border)}
.cw-sheet-body:not(.is-text)>*+*{margin-top:14px}
#st-panel .st-card-star{position:absolute;top:8px;right:8px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.api-saved-row.is-fav,.st-card.is-fav{box-shadow:inset 0 0 0 1px var(--cw-border)}
#st-panel .st-sort{flex:0 0 auto!important;width:auto!important;min-width:0!important;max-width:200px}
.st-bg-grid>.cw-empty{grid-column:1/-1}
.api-label{font-size:calc(12px * var(--cw-fs, 1));opacity:.8;white-space:nowrap}
#api-panel .api-form input,#api-panel .api-form select{width:100%;box-sizing:border-box}
.api-models{display:grid;gap:8px}
.api-model-list{display:grid;gap:6px;max-height:320px;overflow:auto;overscroll-behavior:contain}
.api-model-row{display:flex;align-items:center;gap:8px;border:var(--cw-line);border-radius:var(--cw-radius);padding:6px 10px}
#api-panel .api-model-name{flex:1;min-width:0;text-align:left;justify-content:flex-start;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:calc(12.5px * var(--cw-fs, 1))}
.api-saved{display:grid;gap:8px}
.api-saved-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;border:var(--cw-line);border-radius:var(--cw-radius);padding:8px 10px}
.api-saved-info{flex:1;min-width:140px}
.api-saved-name{font-weight:650;overflow-wrap:anywhere}
.api-saved-meta{font-size:calc(11.5px * var(--cw-fs, 1));opacity:.72;overflow-wrap:anywhere}
.api-saved-acts{display:flex;gap:6px;flex-wrap:wrap}
.st-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px}
.st-card{position:relative;border:var(--cw-line);border-radius:var(--cw-radius);background:var(--cw-surface);overflow:hidden;display:flex;flex-direction:column}
.st-card.is-current{box-shadow:inset 0 0 0 1px var(--cw-border),0 0 0 3px var(--cw-bg),0 0 0 4px var(--cw-border)}
#st-panel .st-card-pic{
  all:unset;box-sizing:border-box;display:grid;place-items:center;cursor:pointer;
  width:100%;aspect-ratio:16/10;background:var(--cw-bg);border-bottom:var(--cw-line);overflow:hidden;
}
.st-card-pic img{display:block;width:100%;height:100%;object-fit:cover}
.st-card-note{font-size:calc(34px * var(--cw-fs, 1));color:var(--cw-text);opacity:.75}
.st-card-foot{display:grid;gap:8px;padding:9px 10px 10px}
.st-card-name{font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.st-card-acts{display:grid;grid-template-columns:1fr 1fr;gap:6px}
#st-panel .st-card-acts .cw-button{font-size:calc(12px * var(--cw-fs, 1));min-height:30px;padding:4px 6px}
.st-card-tag{position:absolute;top:8px;left:8px}
.st-editor{display:grid;gap:12px}
.st-shot{border:var(--cw-line);border-radius:var(--cw-radius);background:var(--cw-bg);aspect-ratio:16/10;display:grid;place-items:center;overflow:hidden}
.st-shot img{display:block;width:100%;height:100%;object-fit:cover}
.st-color-row,.st-num-row{display:flex;align-items:center;gap:8px;padding:5px 0;flex-wrap:wrap}
.st-color-label{flex:0 0 104px;font-size:calc(12.5px * var(--cw-fs, 1))}
#st-panel .st-color-row input[type=color]{flex:0 0 46px;width:46px;height:30px;padding:2px}
#st-panel .st-color-row input[type=range],#st-panel .st-num-row input[type=range]{flex:1 1 90px;min-width:80px}
#st-panel .st-color-row input[type=text]{flex:2 1 150px;min-width:120px;font-size:calc(12px * var(--cw-fs, 1))}
.st-num-value{flex:0 0 52px;text-align:right;font-variant-numeric:tabular-nums}
#st-panel .st-css{width:100%;box-sizing:border-box;font:calc(12.5px * var(--cw-fs, 1))/1.6 ui-monospace,Menlo,Consolas,monospace}
.st-bg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px;max-height:260px;overflow:auto;overscroll-behavior:contain}
#st-panel .st-bg{all:unset;box-sizing:border-box;cursor:pointer;border:var(--cw-line);aspect-ratio:16/10;overflow:hidden;display:block}
.st-bg img{display:block;width:100%;height:100%;object-fit:cover}
#st-panel input[type=range],#api-panel input[type=range]{accent-color:var(--cw-accent)}
#st-panel input[type=color]{border:var(--cw-line);border-radius:var(--cw-radius);background:var(--cw-surface);cursor:pointer}
.cw-taborder{display:grid;gap:6px;margin:6px 0}
.cw-taborder-row{display:flex;align-items:center;gap:8px;border:var(--cw-line);border-radius:var(--cw-radius);padding:6px 8px;background:var(--cw-surface)}
.cw-taborder-row.is-dragging{opacity:.5}
.cw-taborder-row.is-over{box-shadow:inset 0 0 0 2px var(--cw-border)}
.cw-taborder-grip{cursor:grab;opacity:.7;font-size:calc(16px * var(--cw-fs, 1));line-height:1}
.cw-taborder-icon{display:inline-grid;place-items:center;width:22px;height:22px;flex:0 0 22px}
.cw-taborder-icon img{width:100%;height:100%;object-fit:contain}
#cw-settings-page .cw-taborder-row input{flex:1;min-width:0}
#cw-hub-body .wb-head-note{flex:1;margin:0}
#wb-panel .wb-book-title-row{display:flex;align-items:center;gap:6px;min-width:0}
#wb-panel .wb-book-title-row button.cw-heart,#wb-panel .wb-bulk-pick button.cw-heart{all:unset;box-sizing:border-box;display:inline-grid;place-items:center;width:32px;height:32px;flex:0 0 32px;cursor:pointer}
#wb-panel .wb-bulk-pick{display:flex;align-items:center;flex:0 0 auto}
#wb-panel .wb-bulk-bar{display:grid;gap:8px;margin:8px 0}
#wb-panel .wb-bulk-bar:empty{display:none}
#pw-panel .pw-book-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
#pw-panel .pw-book-title-row{display:flex;align-items:center;gap:8px;min-width:0}
#pw-panel .pw-book-title-row .pw-book-name{flex:1;min-width:0}
#pw-panel .pw-book-title-row button.cw-heart{all:unset;box-sizing:border-box;display:inline-grid;place-items:center;width:32px;height:32px;flex:0 0 32px;cursor:pointer}
#pw-panel .pw-bulk-bar,#wb-panel .wb-books>.wb-bulk-bar{display:grid;gap:6px;margin:10px 0 4px}
#pw-panel .pw-bulk-bar .pw-row,#wb-panel .wb-books>.wb-bulk-bar .wb-row{margin-top:0}
#pw-panel .pw-bulk-bar .pw-row>.pw-button,#wb-panel .wb-books>.wb-bulk-bar .wb-row>.wb-button{flex:1 1 auto}
#pw-panel .pw-main>.pw-row{gap:12px;margin:14px 0 6px}
#pw-panel .pw-token,#wb-panel .wb-token{margin:8px 0 4px;padding:8px 12px;border:var(--cw-line);border-radius:var(--cw-radius);background:var(--cw-surface);font-variant-numeric:tabular-nums}
#wb-panel .wb-tok{font-variant-numeric:tabular-nums}
#wb-panel .wb-main>.wb-row{gap:12px}
#wb-panel .wb-book .wb-row,#pw-panel .pw-book .pw-row{gap:10px}
#pw-panel .pw-book,#wb-panel .wb-book{padding:12px 14px}
#wb-panel .wb-danger{font-weight:650;border-style:dashed}
#pw-panel .pw-danger{font-weight:650;border-style:dashed}
.cw-hub-error{flex:1;overflow:auto;padding:30px 20px;text-align:center}
.cw-hub-error .cw-actions{justify-content:center}
${CW_SCOPE} .cw-button{
  font:inherit;line-height:1.4;
  min-height:36px;padding:8px 12px;
  color:var(--cw-text);background:var(--cw-surface);
  border:1px solid var(--cw-border);
  border-radius:var(--cw-radius);cursor:pointer;
  box-shadow:none;
}
${CW_SCOPE} .cw-button:hover{filter:brightness(1.08)}
${CW_SCOPE} .cw-button:disabled{opacity:.45;cursor:default}
${CW_SCOPE} .cw-danger{color:var(--cw-danger);border-color:var(--cw-danger)}
${CW_SCOPE} .cw-primary{
  background:var(--cw-accent-soft);color:var(--cw-text);border-color:var(--cw-border);box-shadow:inset 0 0 0 1px var(--cw-border);
}
.cw-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:12px}
.cw-field{display:block;margin:12px 0 0}
.cw-field>span{display:block;margin-bottom:5px}
${CW_SCOPE} :is(input,select,textarea){
  box-sizing:border-box;font:inherit;color:var(--cw-text);
  background:var(--cw-surface);border:1px solid var(--cw-border-light);
  border-radius:var(--cw-radius);padding:10px;max-width:100%;
}
${CW_SCOPE} :is(input[type=text],input[type=url],select,textarea){width:100%}
${CW_SCOPE} select{
  -webkit-appearance:none;-moz-appearance:none;appearance:none;
  padding-right:34px;cursor:pointer;
  background-image:linear-gradient(45deg,transparent 50%,var(--cw-text-dim) 50%),linear-gradient(135deg,var(--cw-text-dim) 50%,transparent 50%);
  background-position:calc(100% - 16px) 50%,calc(100% - 11px) 50%;
  background-size:5px 5px,5px 5px;background-repeat:no-repeat;
}
${CW_SCOPE} select option{background:var(--cw-surface);color:var(--cw-text)}
${CW_SCOPE} select option:checked{background:var(--cw-accent-soft);color:var(--cw-text)}
${CW_SCOPE} .cw-button:focus-visible,${CW_SCOPE} select:focus-visible,
${CW_SCOPE} input:focus-visible,${CW_SCOPE} textarea:focus-visible,
${CW_SCOPE} summary:focus-visible{outline:2px solid var(--cw-accent);outline-offset:2px}
${CW_SCOPE} .cw-button{transition:border-color .15s,background .15s}
${CW_SCOPE} .ca-rename-btn:hover,${CW_SCOPE} .ca-chat-name:hover{border-color:var(--cw-accent)}
.sb-msg-acts .cw-button:hover,.ca-msg-acts .cw-button:hover{border-color:var(--cw-accent);background:var(--cw-accent-soft)}
.sb-swipe-btn:hover{border-color:var(--cw-accent)}
.sb-branch-row .cw-button:hover{border-color:var(--cw-accent)}
.cw-edit-toolbar{
  display:flex;gap:6px;align-items:center;flex-wrap:wrap;
  padding:8px 10px;background:var(--cw-bg2);border:1px solid var(--cw-border-light);
  border-radius:var(--cw-radius);margin-bottom:8px;
}
.cw-edit-toolbar input[type=text]{flex:1;min-width:80px;width:auto;padding:6px 8px;font-size:calc(13px * var(--cw-fs, 1))}
.cw-edit-toolbar .cw-button{font-size:calc(12px * var(--cw-fs, 1));min-height:30px;padding:4px 10px}
.cw-edit-toolbar .cw-match-info{font-size:calc(12px * var(--cw-fs, 1));color:var(--cw-text-dim);white-space:nowrap}
.cw-edit-area{width:100%;min-height:200px;padding:10px;font:calc(14px * var(--cw-fs, 1))/1.8 inherit;
  resize:vertical;white-space:pre-wrap;overflow-wrap:anywhere;
  color:var(--cw-text);background:var(--cw-surface);
  border:1px solid var(--cw-border-light);border-radius:var(--cw-radius);
}
${CW_SCOPE} input[type=checkbox]{width:auto;margin:0 8px 0 0;accent-color:var(--cw-accent)}
${CW_SCOPE} input[type=range]{width:100%;accent-color:var(--cw-accent)}
${CW_SCOPE} textarea{min-height:180px;resize:vertical;line-height:1.65}
${CW_SCOPE} .cw-css-editor{font:calc(13px * var(--cw-fs, 1))/1.65 ui-monospace,Consolas,monospace}
#cw-settings-page{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;
  padding:16px;padding-bottom:max(20px,env(safe-area-inset-bottom))}
#cw-settings-page details{
  margin:0 0 16px;padding:14px 16px;background:var(--cw-surface);
  border:1px solid var(--cw-border-light);border-radius:var(--cw-radius);
}
#cw-settings-page summary{cursor:pointer;font-weight:600}
.cw-note{color:var(--cw-text-dim);font-size:calc(13px * var(--cw-fs, 1));line-height:1.7}
.cw-check{display:flex;align-items:center;margin:12px 0}
#cw-settings-page .cw-nav{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 18px}
#cw-settings-page .cw-nav .cw-button{flex:1;min-height:48px}
.cw-preset-title{font-weight:600;margin:0 0 8px}
.cw-theme-quick{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.cw-theme-quick .cw-button[aria-pressed=true]{
  border-color:var(--cw-accent);background:var(--cw-accent-soft);
  color:var(--cw-accent-text);
}
.cw-settings{
  flex-shrink:0;max-height:46dvh;overflow:auto;
  padding:12px 16px;border-bottom:1px solid var(--cw-border);
  background:var(--cw-surface);
}
.cw-settings[hidden]{display:none}
.cw-toolbar{
  display:flex;gap:8px;align-items:center;flex-wrap:wrap;
  padding:10px 16px;border-bottom:1px solid var(--cw-border-light);
  background:var(--cw-surface);flex-shrink:0;
}
.cw-toolbar input,.cw-toolbar select{flex:1;min-width:100px;width:auto}
.cw-toolbar .cw-button{font-size:calc(12px * var(--cw-fs, 1))}
.cw-footer{
  flex-shrink:0;padding:8px 16px;
  padding-bottom:max(8px,env(safe-area-inset-bottom));
  border-top:1px solid var(--cw-border);
  background:var(--cw-surface);font-size:calc(11px * var(--cw-fs, 1));color:var(--cw-text-light);
}
.cw-empty{padding:30px;text-align:center;color:var(--cw-text-light)}
.ca-body{display:flex;flex:1;min-height:0;overflow:hidden}
#ca-panel .ca-body[hidden],#ca-panel .ca-gallery[hidden]{display:none!important}
#ca-panel .ca-gallery{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}
#ca-panel .ca-reader{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;position:relative}
#ca-panel .ca-reader[hidden]{display:none!important}
#ca-panel .rd-bar .rd-chat{flex:1 1 160px;min-width:0}
.rd-page{
  flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;
  background-color:var(--cw-bg);
  padding:18px 20px 40px;display:grid;gap:18px;align-content:start;
  font-family:var(--rd-font,inherit);font-size:var(--rd-size,17px);line-height:var(--rd-line,1.9);
}
.rd-floor{display:grid;gap:8px;padding-bottom:14px;border-bottom:1px dashed var(--cw-border)}
.rd-floor:last-child{border-bottom:0}
.rd-floor.is-hit{background:var(--cw-accent-soft)}
.rd-floor.is-hidden{opacity:.55}
.rd-floor-head{display:flex;align-items:center;gap:8px;font-size:calc(12px * var(--cw-fs, 1));opacity:.85}
.rd-idx{font-variant-numeric:tabular-nums;opacity:.7}
.rd-name{flex:1;min-width:0;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#ca-panel .rd-star{
  all:unset;box-sizing:border-box;display:grid;place-items:center;cursor:pointer;
  width:24px;height:24px;flex:0 0 24px;border:var(--cw-line);background:var(--cw-surface);font-size:calc(12px * var(--cw-fs, 1));
}
.rd-text{white-space:pre-wrap;overflow-wrap:anywhere}
.rd-text .rd-p{margin:0 0 .85em;white-space:pre-wrap;text-indent:2em}
.rd-text.is-rendered .rd-line{display:block;text-indent:2em;margin:0 0 .85em}
.rd-text.is-rendered .rd-line:last-child{margin-bottom:0}
.rd-page,.rd-page *{text-shadow:none!important}
.rd-page{opacity:1;-webkit-font-smoothing:antialiased}
#cw-hub.cw-immersive #cw-tabs,
#cw-hub.cw-immersive #ca-toolbar,
#cw-hub.cw-immersive .rd-bar,
#cw-hub.cw-immersive #ca-panel .cw-footer{display:none!important}
#cw-hub.cw-immersive .rd-page{
  padding:max(28px,env(safe-area-inset-top)) max(22px,calc((100% - 44em) / 2)) 64px;
}
#cw-hub.cw-immersive .rd-floor-head :is(.rd-star,.cw-button){opacity:0;pointer-events:none;transition:opacity .2s}
#cw-hub.cw-immersive .rd-drawer-on .rd-floor-head :is(.rd-star,.cw-button){opacity:1;pointer-events:auto}
#cw-hub.cw-immersive .rd-nav{border-top:0;background:transparent;opacity:.35;transition:opacity .2s}
#cw-hub.cw-immersive .rd-nav:hover{opacity:1}
#ca-panel .rd-handle{
  position:absolute;left:0;top:50%;transform:translateY(-50%);z-index:7;
  width:26px;height:64px;min-height:0;padding:0;display:grid;place-items:center;
  border:var(--cw-line);border-left:0;background:var(--cw-bg);opacity:.55;font-size:calc(14px * var(--cw-fs, 1));
}
#ca-panel .rd-handle:hover,#ca-panel .rd-drawer-on .rd-handle{opacity:1}
.rd-shade{position:absolute;inset:0;z-index:7;background:rgba(0,0,0,.22);opacity:0;pointer-events:none;transition:opacity .2s}
.rd-drawer-on .rd-shade{opacity:1;pointer-events:auto}
.rd-drawer{
  position:absolute;left:0;top:0;bottom:0;z-index:8;width:min(340px,86%);
  display:flex;flex-direction:column;gap:12px;overflow:auto;overscroll-behavior:contain;
  padding:max(14px,env(safe-area-inset-top)) 14px 18px;box-sizing:border-box;
  background:#fbfaf7;border-right:var(--cw-line);
  transform:translateX(-102%);transition:transform .22s ease;
}
.rd-drawer-on .rd-drawer{transform:translateX(0)}
.rd-drawer-head{display:flex;align-items:center;gap:8px}
.rd-cover{display:grid;grid-template-columns:96px 1fr;gap:12px;align-items:end;padding-bottom:12px;border-bottom:1px dashed var(--cw-border)}
#ca-panel .rd-cover-pic{all:unset;box-sizing:border-box;cursor:pointer;display:grid;place-items:center;aspect-ratio:2/3;width:96px;border:var(--cw-line);overflow:hidden;background:var(--cw-bg2);box-shadow:3px 4px 0 color-mix(in srgb,var(--cw-border) 45%,transparent)}
.rd-cover-pic img{display:block;width:100%;height:100%;object-fit:cover}
.rd-cover-info{display:grid;gap:6px;min-width:0}
.rd-cover-name{font-size:calc(17px * var(--cw-fs, 1));font-weight:700;overflow-wrap:anywhere}
.rd-cover-meta{font-size:calc(11.5px * var(--cw-fs, 1));opacity:.72;overflow-wrap:anywhere}
#ca-panel .rd-cover-info .cw-button{justify-self:start;min-height:30px;font-size:calc(12px * var(--cw-fs, 1));padding:4px 10px}
.rd-shelf{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:8px;max-height:30vh;overflow:auto;overscroll-behavior:contain}
#ca-panel .rd-shelf-item{all:unset;box-sizing:border-box;cursor:pointer;display:grid;gap:3px;min-width:0}
.rd-shelf-item img{display:block;width:100%;aspect-ratio:2/3;object-fit:cover;border:var(--cw-line)}
.rd-shelf-item.is-on img{box-shadow:0 0 0 2px var(--cw-border)}
.rd-shelf-item .ca-card-initial{display:grid;place-items:center;aspect-ratio:2/3;border:var(--cw-line);font-size:calc(22px * var(--cw-fs, 1))}
.rd-shelf-name{font-size:calc(11px * var(--cw-fs, 1));overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center}
.rd-drawer-head .ca-sec-title{flex:1}
.rd-drawer-tools{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.rd-drawer-sec{display:grid;gap:6px}
.rd-drawer-label{font-size:calc(12px * var(--cw-fs, 1));opacity:.75}
#ca-panel .rd-drawer-select,#ca-panel .rd-drawer input{width:100%;box-sizing:border-box}
.rd-drawer-list{display:grid;gap:5px;max-height:34vh;overflow:auto;overscroll-behavior:contain}
#ca-panel .rd-drawer-item{justify-content:flex-start;text-align:left;font-size:calc(12.5px * var(--cw-fs, 1));min-height:32px;padding:5px 9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ca-panel .rd-drawer-item.is-on{background:var(--cw-accent-soft);box-shadow:inset 0 0 0 1px var(--cw-border)}
#ca-panel .rd-drawer-floor{display:flex;gap:6px;align-items:baseline}
.rd-drawer-name{font-weight:650;flex:0 0 auto}
.rd-drawer-pv{opacity:.7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.rd-text .rd-html{display:contents}
.rd-text .rd-frame{display:block;width:100%;border:0;margin:.4em 0;background:transparent;color-scheme:normal}
.rd-text .rd-code{white-space:pre-wrap;font:calc(12.5px * var(--cw-fs, 1))/1.6 ui-monospace,Menlo,Consolas,monospace;border:var(--cw-line);padding:10px 12px;overflow:auto}
.rd-text details{margin:.4em 0}
.rd-text details>summary{cursor:pointer}
.rd-text .rd-p:last-child{margin-bottom:0}
.rd-text.is-rendered{white-space:normal}
.rd-floor.is-user .rd-text{opacity:.9}
.rd-mark{border-radius:2px}
.rd-k-underline{text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px}
.rd-k-bold{font-weight:700}
.rd-k-mark{padding:0 1px;background:var(--rd-hl,#ffd76e);color:#2c2a26}
.rd-k-mark .rd-k-mark{padding:0;background:transparent}
.rd-mark[data-mark-id]{cursor:pointer}
.rd-selbar-tip{flex:0 0 auto;font-size:calc(12px * var(--cw-fs, 1));opacity:.75;white-space:nowrap;padding:0 4px}
.rd-text.is-rendered{white-space:normal}
.rd-text.is-rendered img{max-width:100%;height:auto}
.rd-k-fav{box-shadow:inset 0 -2px 0 var(--cw-border)}
.rd-nav{display:flex;align-items:center;gap:10px;justify-content:center;padding:10px 16px;border-top:var(--cw-line)}
.rd-progress{font-size:calc(12px * var(--cw-fs, 1));opacity:.75;font-variant-numeric:tabular-nums}
.rd-selbar{
  position:absolute;left:50%;transform:translateX(-50%);top:max(10px,env(safe-area-inset-top));bottom:auto;z-index:9;
  display:flex;gap:6px;flex-wrap:nowrap;align-items:center;max-width:96%;
  overflow-x:auto;overscroll-behavior:contain;scrollbar-width:none;
  padding:8px 10px;border:var(--cw-line);background:var(--cw-bg);
  box-shadow:0 6px 24px rgba(0,0,0,.18);
}
.rd-selbar::-webkit-scrollbar{display:none}
.rd-selbar-sep{flex:0 0 1px;align-self:stretch;background:var(--cw-border);margin:0 2px}
#cw-hub-body>#be-panel{
  position:relative!important;inset:auto!important;top:auto!important;right:auto!important;left:auto!important;
  width:100%!important;max-width:none!important;max-height:none!important;height:auto!important;
  flex:1 1 auto;min-height:0;margin:0!important;z-index:auto!important;
  border:0!important;border-radius:0!important;box-shadow:none!important;
  backdrop-filter:none!important;-webkit-backdrop-filter:none!important;
  font-family:inherit!important;
  --be-panel-bg:transparent!important;
  --be-panel-fg:var(--cw-text)!important;
  --be-panel-sub:var(--cw-text-dim)!important;
  --be-panel-empty-fg:var(--cw-text-dim)!important;
  --be-panel-tab-fg:var(--cw-text)!important;
  --be-panel-row-bg:var(--cw-surface)!important;
  --be-panel-row-bg-hover:var(--cw-accent-soft)!important;
  --be-panel-divider:var(--cw-border)!important;
  --be-panel-border:var(--cw-border)!important;
  --be-panel-input-bg:var(--cw-surface)!important;
  --be-panel-input-border:var(--cw-border)!important;
  --be-panel-placeholder:var(--cw-text-dim)!important;
}
#cw-hub-body>#be-panel #be-p-close{display:none!important}
#cw-hub-body>#be-panel :is(button,.be-btn,input,select,textarea){border-radius:var(--cw-radius)!important;box-shadow:none!important}
#cw-hub-body>#be-panel :is(.be-note-card,.be-char-card){border:var(--cw-line)!important;border-radius:var(--cw-radius)!important;box-shadow:none!important}
#ca-panel .rd-selbar .cw-button{flex:0 0 auto;white-space:nowrap;font-size:calc(12px * var(--cw-fs, 1));min-height:32px;padding:5px 10px}
.rd-marklist{display:grid;gap:8px}
.rd-mark-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;border:var(--cw-line);padding:8px 10px}
.rd-mark-kind{font-size:calc(11px * var(--cw-fs, 1));border:var(--cw-line);padding:1px 6px;white-space:nowrap}
.rd-mark-text{flex:1;min-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:calc(13px * var(--cw-fs, 1))}
.rd-mark-acts{display:flex;gap:6px;flex-wrap:wrap}
#ca-panel.ca-view-gallery #ca-toolbar>:not(#ca-char-sel):not(#ca-gallery-toggle):not(#ca-char-sort){display:none!important}
#ca-panel #ca-gallery-toggle[aria-pressed=true]{background:var(--cw-accent-soft);box-shadow:inset 0 0 0 1px var(--cw-border)}
.ca-gallery-count{font-size:calc(12px * var(--cw-fs, 1));color:var(--cw-text-light);white-space:nowrap}
.ca-grid{
  flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;
  display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));
  grid-auto-rows:max-content;gap:14px;padding:14px 16px;align-content:start;
}
.ca-grid>.cw-empty{grid-column:1/-1}
.ca-card{
  position:relative;display:flex;flex-direction:column;min-width:0;
  border:var(--cw-line);border-radius:var(--cw-radius);
  background:var(--cw-surface);overflow:hidden;
}
.ca-card.is-pinned{box-shadow:inset 0 0 0 1px var(--cw-border),0 0 0 3px var(--cw-bg),0 0 0 4px var(--cw-border)}
.ca-card.is-current .ca-card-name{text-decoration:underline;text-underline-offset:4px}
.ca-card.is-picked{background:var(--cw-accent-soft)}
#ca-panel .ca-card-pic{
  all:unset;box-sizing:border-box;display:grid;place-items:center;cursor:pointer;
  width:100%;aspect-ratio:2/3;flex:0 0 auto;background:var(--cw-bg2);overflow:hidden;
  border-bottom:var(--cw-line);
}
#ca-panel .ca-card-pic:focus-visible{outline:2px solid var(--cw-border);outline-offset:-4px}
.ca-card-pic img{display:block;width:100%;height:100%;object-fit:cover;pointer-events:none}
.ca-card.is-picked .ca-card-pic img{opacity:.72}
.ca-card-initial{font-size:calc(42px * var(--cw-fs, 1));font-weight:650;opacity:.45}
.ca-card-badges{position:absolute;top:8px;left:8px;right:48px;display:flex;flex-wrap:wrap;gap:5px;pointer-events:none}
.ca-tag{
  display:inline-block;padding:2px 7px;font-size:calc(11px * var(--cw-fs, 1));line-height:1.5;
  color:var(--cw-text);background:var(--cw-surface);
  border:var(--cw-line);border-radius:var(--cw-radius);
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
}
#ca-panel .ca-card .ca-pin{
  position:absolute;top:8px;right:8px;width:32px;height:32px;min-height:32px;padding:0;
  display:grid;place-items:center;font-size:calc(16px * var(--cw-fs, 1));line-height:1;
  background:var(--cw-surface);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
}
#ca-panel .ca-card .ca-pin[aria-pressed=false]{opacity:.78}
#ca-panel .ca-card button.cw-heart.ca-card-pick{
  position:absolute;top:6px;right:6px;margin:0;
  background:var(--cw-surface);border:var(--cw-line);border-radius:var(--cw-radius);
  width:36px;height:36px;flex-basis:36px;
}
.ca-card-foot{display:grid;gap:8px;padding:9px 10px 10px}
.ca-page-crumb{font-size:calc(12px * var(--cw-fs, 1));color:var(--cw-text-light);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.ca-char-page{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:16px;display:grid;gap:14px;align-content:start}
.ca-hero{display:grid;grid-template-columns:minmax(150px,230px) 1fr;gap:18px;align-items:start;padding:14px;border:var(--cw-line);border-radius:var(--cw-radius);background:var(--cw-surface)}
.ca-hero-pic{aspect-ratio:2/3;border:var(--cw-line);border-radius:var(--cw-radius);background:var(--cw-bg2);overflow:hidden;display:grid;place-items:center}
.ca-hero-pic img{display:block;width:100%;height:100%;object-fit:cover}
.ca-hero-info{display:grid;gap:8px;align-content:start;min-width:0}
.ca-hero-name{font-size:calc(21px * var(--cw-fs, 1));font-weight:700;letter-spacing:.03em;overflow-wrap:anywhere}
.ca-chips{display:flex;flex-wrap:wrap;gap:6px}
.ca-chips:empty{display:none}
.ca-tag.is-soft{background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none;opacity:.85}
.ca-hero-meta{font-size:calc(12px * var(--cw-fs, 1));color:var(--cw-text-light)}
.ca-hero-acts{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px;margin-top:6px}
#ca-panel .ca-hero-acts .cw-button{min-height:36px;white-space:nowrap}
#ca-panel .ca-hero-acts .ca-act-wide{grid-column:1/-1}
.ca-sec{border:var(--cw-line);border-radius:var(--cw-radius);background:var(--cw-surface);padding:12px 14px}
.ca-sec-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.ca-sec-title{flex:1;font-weight:650;letter-spacing:.03em}
#ca-panel .ca-sec-btn{min-height:28px;padding:3px 10px;font-size:calc(12px * var(--cw-fs, 1))}
.ca-sec-text{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7;font-size:calc(13px * var(--cw-fs, 1));max-height:11.9em;overflow:hidden}
.ca-sec-text.is-open{max-height:none}
.ca-sec-text.is-empty{opacity:.55;font-size:calc(12px * var(--cw-fs, 1))}
.ca-sec-note{font-size:calc(12px * var(--cw-fs, 1));color:var(--cw-text-light);margin-top:6px}
.ca-world-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.ca-world-name{flex:1;min-width:0;font-weight:600;overflow-wrap:anywhere}
.ca-sec-tools{display:flex;gap:6px}
.ca-card-name{font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ca-card-namerow{display:flex;align-items:center;gap:6px;min-width:0}
.ca-card-namerow .ca-card-name{flex:1;min-width:0}
#ca-panel .ca-card-read{flex:0 0 auto;min-height:26px;padding:2px 8px;font-size:calc(11.5px * var(--cw-fs, 1))}
.ca-card-acts{display:grid;grid-template-columns:1fr 1fr;gap:6px}
#ca-panel .ca-card-acts .cw-button{font-size:calc(12px * var(--cw-fs, 1));min-height:30px;padding:4px 6px}
#ca-panel .ca-card-acts .cw-button{white-space:nowrap;min-width:0}
.ca-sidebar{
  flex-shrink:0;width:230px;padding:8px;overflow:auto;
  background:var(--cw-bg2);border-right:1px solid var(--cw-border);
}
.ca-chat-item{
  display:flex;align-items:center;gap:5px;padding:8px;
  margin-bottom:7px;border:1px solid var(--cw-border-light);
  border-radius:var(--cw-radius);background:var(--cw-surface);
}
.ca-chat-item.ca-active{border-color:var(--cw-accent);background:var(--cw-accent-soft)}
#ca-panel .ca-chat-name{
  flex:1;min-width:0;text-align:left;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;
  border:0;background:transparent;padding:4px;min-height:32px;
}
#ca-panel .ca-rename-btn{font-size:calc(11px * var(--cw-fs, 1));padding:4px 6px;min-height:30px}
.ca-main{display:flex;flex-direction:column;flex:1;min-width:0;min-height:0;overflow:hidden}
.ca-main-title{padding:10px 14px;border-bottom:1px solid var(--cw-border-light)}
.ca-msgs,.sb-msgs{flex:1;min-height:0;overflow:auto;padding:10px 14px;overscroll-behavior:contain}
.ca-msg,.sb-msg{
  margin-bottom:8px;border:1px solid var(--cw-border-light);
  border-radius:var(--cw-radius);background:var(--cw-surface);overflow:hidden;
}
.ca-msg-user,.sb-msg-user{background:var(--cw-bg2)}
.ca-msg-hd,.sb-msg-hd{
  display:flex;align-items:center;gap:7px;padding:10px;
  cursor:pointer;user-select:none;list-style:none;
}
.ca-msg-hd::-webkit-details-marker,.sb-msg-hd::-webkit-details-marker{display:none}
.ca-msg-hd::after,.sb-msg-hd::after{content:'▶';font-size:calc(10px * var(--cw-fs, 1));color:var(--cw-text-light)}
details[open]>.ca-msg-hd::after,details[open]>.sb-msg-hd::after{content:'▼'}
.ca-idx,.sb-idx{font-size:calc(11px * var(--cw-fs, 1));min-width:26px;color:var(--cw-text-light)}
.ca-sender,.sb-sender{font-weight:600;color:var(--cw-accent-text);flex-shrink:0}
.ca-pv,.sb-pv{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--cw-text-dim)}
.ca-msg-bd,.sb-msg-bd{padding:10px;border-top:1px dashed var(--cw-border-light)}
.ca-msg-text,.sb-msg-text{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.8;margin-top:10px}
.ca-msg-acts,.sb-msg-acts{display:flex;gap:7px;flex-wrap:wrap;padding-bottom:9px;border-bottom:1px dotted var(--cw-border-light)}
.ca-msg-acts .cw-button,.sb-msg-acts .cw-button{font-size:calc(12px * var(--cw-fs, 1))}
.sb-badge{font-size:calc(11px * var(--cw-fs, 1));padding:1px 6px;border-radius:9px;background:var(--cw-accent-soft);color:var(--cw-accent-text);white-space:nowrap}
.sb-has-swipes{border-left:3px solid var(--cw-accent)}
.sb-has-branch{border-right:3px solid var(--cw-accent)}
.sb-swipe-nav{display:flex;align-items:center;flex-wrap:wrap;gap:5px;margin-top:10px}
#sb-panel .sb-swipe-btn{min-width:30px;min-height:30px;padding:4px 8px;font-size:calc(12px * var(--cw-fs, 1))}
#sb-panel .sb-swipe-active{background:var(--cw-accent-soft);color:var(--cw-text);box-shadow:inset 0 0 0 1px var(--cw-border)}
#sb-panel .sb-swipe-current{box-shadow:0 0 0 2px var(--cw-accent-soft)}
.sb-branch-list{margin-top:12px;padding-top:10px;border-top:1px solid var(--cw-accent)}
.sb-branch-row{padding:10px;margin:6px 0;border:1px solid var(--cw-accent);border-radius:var(--cw-radius);background:var(--cw-accent-soft)}
.sb-branch-name{font-weight:600;color:var(--cw-accent-text)}
.sb-branch-info,.sb-branch-preview{font-size:calc(12px * var(--cw-fs, 1));color:var(--cw-text-dim);overflow-wrap:anywhere}
.sb-edit-bar{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:9px 16px;background:var(--cw-accent-soft);border-bottom:1px solid var(--cw-accent)}
.sb-edit-bar[hidden]{display:none}
.sb-edit-hint{flex:1}
.sb-move-box{display:flex;gap:4px;margin-left:auto}
#sb-panel .sb-move-btn{min-width:32px;min-height:32px;padding:3px 7px}
.cw-dialog{
  position:fixed;width:min(460px,calc(100vw - 28px));max-height:85dvh;
  padding:22px;overflow:auto;
  background:var(--cw-dialog-bg,var(--cw-bg));
  color:var(--cw-dialog-text,var(--cw-text));
  border:1px solid var(--cw-dialog-border,var(--cw-border));
  border-radius:var(--cw-dialog-radius,18px);
  box-shadow:var(--cw-dialog-shadow,0 18px 70px #0008);
  backdrop-filter:blur(18px);
}
.cw-dialog-title{font-size:calc(18px * var(--cw-fs, 1));font-weight:700;margin-bottom:12px}
.cw-dialog-message{white-space:pre-wrap;overflow-wrap:anywhere;margin-bottom:16px}
.cw-dialog .cw-actions{justify-content:flex-end}
.cw-choose-list{display:grid;gap:10px;margin:4px 0 14px}
#cw-settings-page .cw-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin:6px 0 12px}
#cw-settings-page .cw-tile{border:var(--cw-line);border-radius:var(--cw-radius);background:var(--cw-surface);padding:10px 12px;display:grid;gap:3px;min-width:0}
#cw-settings-page .cw-tile-label{font-size:calc(12px * var(--cw-fs, 1));opacity:.75}
#cw-settings-page .cw-tile-value{font-size:calc(22px * var(--cw-fs, 1));font-weight:700;letter-spacing:.02em;font-variant-numeric:tabular-nums}
#cw-settings-page .cw-tile-sub{font-size:calc(11px * var(--cw-fs, 1));opacity:.7;overflow-wrap:anywhere}
#cw-settings-page .cw-token-detail{display:grid;gap:8px;margin-top:10px}
#cw-settings-page .cw-token-book{border:var(--cw-line);border-radius:var(--cw-radius);background:var(--cw-surface);padding:0}
#cw-settings-page .cw-token-book>summary{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;padding:10px 12px;cursor:pointer}
#cw-settings-page .cw-token-book-name{font-weight:650;flex:1;min-width:0;overflow-wrap:anywhere}
#cw-settings-page .cw-token-book-meta,#cw-settings-page .cw-token-split{font-size:calc(12px * var(--cw-fs, 1));opacity:.8}
#cw-settings-page .cw-token-split{padding:0 12px 8px}
#cw-settings-page .cw-token-rows{display:grid;border-top:1px dashed var(--cw-border);padding:6px 12px 10px}
#cw-settings-page .cw-token-row{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px dotted color-mix(in srgb,var(--cw-border) 55%,transparent);font-size:calc(13px * var(--cw-fs, 1))}
#cw-settings-page .cw-token-row:last-child{border-bottom:0}
#cw-settings-page .cw-token-mode{font-size:calc(11px * var(--cw-fs, 1));padding:0 6px;border:var(--cw-line);border-radius:var(--cw-radius);white-space:nowrap}
#cw-settings-page .cw-token-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#cw-settings-page .cw-token-num{font-variant-numeric:tabular-nums;white-space:nowrap}
#cw-settings-page .cw-token-row.is-off{opacity:.5;text-decoration:line-through}
#cw-settings-page .cw-token-split{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
#cw-settings-page .cw-token-split>span{flex:1;min-width:0}
#cw-settings-page .cw-token-btn{min-height:26px;padding:2px 9px;font-size:calc(11px * var(--cw-fs, 1));white-space:nowrap}
#sb-panel .sb-msg.sb-is-hidden{border-style:dashed!important}
#sb-panel .sb-msg.sb-is-hidden .sb-pv,#sb-panel .sb-msg.sb-is-hidden .sb-sender{opacity:.55}
#sb-panel .sb-hidden-badge{
  border:1px dashed var(--cw-border)!important;border-radius:0!important;
  padding:1px 7px;background:transparent;letter-spacing:.06em;
}
#ca-panel #ca-search{flex:0 1 180px;min-width:110px}
#ca-panel #ca-scope{flex:0 0 auto;min-width:0;width:auto}
.ca-search-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;font-size:calc(12px * var(--cw-fs, 1));color:var(--cw-text-light)}
.ca-search-head>span{flex:1;min-width:0}
.ca-hit{border:var(--cw-line);border-radius:var(--cw-radius);background:var(--cw-surface);padding:10px 12px;margin-bottom:8px;display:grid;gap:6px}
.ca-hit-top{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;font-size:calc(12px * var(--cw-fs, 1))}
.ca-hit-char{font-weight:650}
.ca-hit-file{opacity:.75;overflow-wrap:anywhere}
.ca-hit-text{font-size:calc(13px * var(--cw-fs, 1));line-height:1.6;overflow-wrap:anywhere}
.ca-hit-acts{display:flex;gap:8px;flex-wrap:wrap}
.ca-hero-tok{display:grid;gap:6px}
.ca-hero-tok-total{font-weight:650;font-size:calc(13px * var(--cw-fs, 1))}
.cw-dialog.cw-sheet{width:80vw;height:80vh;height:80dvh;max-width:none;max-height:none;padding:0;overflow:hidden;display:none}
.cw-dialog.cw-sheet[open]{display:flex;flex-direction:column}
.cw-dialog.cw-sheet.is-full{width:100vw;height:100vh;height:100dvh;max-width:100vw;max-height:100dvh;margin:0;inset:0;border-radius:0}
.cw-sheet-head{display:flex;align-items:center;gap:10px;padding:14px 18px;padding-top:max(14px,env(safe-area-inset-top));border-bottom:var(--cw-line)}
.cw-dialog .cw-sheet-title{flex:1;margin:0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cw-sheet-tools{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 18px;border-bottom:var(--cw-line)}
.cw-sheet-tools:empty{display:none}
.cw-dialog .cw-sheet-tools input{flex:1 1 150px;min-width:0;width:auto}
.cw-sheet-status{font-size:calc(12px * var(--cw-fs, 1));opacity:.75;white-space:nowrap}
.cw-find-nav{display:flex;gap:6px;flex:0 0 auto}
.cw-tr{display:grid;gap:8px;margin-top:10px;border-top:1px dashed var(--cw-border);padding-top:10px}
.cw-tr-head{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.cw-tr-label{flex:1;min-width:60px;font-size:calc(12px * var(--cw-fs, 1));opacity:.8}
.cw-tr-text{white-space:pre-wrap;overflow-wrap:anywhere;font-size:calc(13px * var(--cw-fs, 1));line-height:1.75;padding:10px 12px;border:var(--cw-line);background:var(--cw-bg2)}
:is(#pw-panel,#wb-panel) .cw-tr .cw-button{
  all:unset;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;
  border:var(--cw-line);border-radius:var(--cw-radius);background:var(--cw-surface);color:var(--cw-text);
  font:inherit;font-size:calc(12px * var(--cw-fs, 1));min-height:28px;padding:4px 11px;cursor:pointer;white-space:nowrap;
}
:is(#pw-panel,#wb-panel) .cw-tr .cw-button:hover{background:var(--cw-accent-soft)}
:is(#pw-panel,#wb-panel) .cw-tr .cw-button:focus-visible{outline:2px solid var(--cw-border);outline-offset:1px}
:is(#pw-panel,#wb-panel) .cw-tr .cw-button:disabled{opacity:.6;cursor:default}
#api-panel #api-search{flex:1 1 150px;min-width:110px}
.cw-dialog .cw-find-nav .cw-button{white-space:nowrap}
.cw-list-item.is-hit{box-shadow:inset 0 0 0 2px var(--cw-border)}
.cw-sheet-body{flex:1;min-height:0;overflow:auto;padding:14px 18px;overscroll-behavior:contain}
.cw-sheet-body.is-text{display:flex;overflow:hidden}
.cw-dialog .cw-sheet-text{flex:1;width:100%;height:100%;min-height:0;resize:none;box-sizing:border-box;font:calc(13px * var(--cw-fs, 1))/1.7 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap}
.cw-dialog .cw-sheet-foot{padding:10px 18px;padding-bottom:max(10px,env(safe-area-inset-bottom));border-top:var(--cw-line);margin:0;align-items:center}
.cw-sheet-foot .cw-sheet-status{margin-right:auto}
.cw-list-item{border:var(--cw-line);border-radius:var(--cw-radius);background:var(--cw-surface);margin-bottom:10px}
.cw-list-item.is-off .cw-list-name{opacity:.62}
.cw-list-head{display:flex;align-items:center;gap:8px;padding:8px 10px}
.cw-dialog .cw-list-name{flex:1;min-width:0;text-align:left;justify-content:flex-start;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.cw-list-state{font-size:calc(11px * var(--cw-fs, 1));opacity:.7;white-space:nowrap}
.cw-list-body{display:grid;gap:12px;padding:4px 12px 12px;border-top:1px dashed var(--cw-border)}
.cw-list-field{display:grid;gap:6px}
.cw-list-field-head{display:flex;align-items:center;gap:8px;font-size:calc(12px * var(--cw-fs, 1));opacity:.85}
.cw-list-field-head>span{flex:1}
.cw-dialog .cw-list-mini{min-height:28px;padding:3px 8px;font-size:calc(11px * var(--cw-fs, 1))}
.cw-list-bar{display:flex;justify-content:flex-end}
.cw-dialog .cw-list-field textarea{width:100%;box-sizing:border-box;resize:vertical;font:calc(12.5px * var(--cw-fs, 1))/1.6 ui-monospace,Menlo,Consolas,monospace}
.cw-dialog .cw-list-field textarea[rows="1"]{min-height:0;height:auto;resize:none}
@media(max-width:650px){.cw-dialog.cw-sheet{width:94vw;height:86dvh}.cw-sheet-head,.cw-sheet-tools,.cw-sheet-body,.cw-dialog .cw-sheet-foot{padding-left:12px;padding-right:12px}}
.cw-dialog .cw-choose-option{display:grid;gap:3px;justify-items:start;text-align:left;width:100%;padding:12px 14px}
.cw-choose-label{font-weight:650}
.cw-choose-note{font-size:calc(12px * var(--cw-fs, 1));opacity:.72;line-height:1.45}
.cw-dialog .cw-primary{background:var(--cw-accent-soft);box-shadow:inset 0 0 0 1px var(--cw-border)}
#cw-fab{
  position:fixed;z-index:2147483400;display:grid;place-items:center;
  padding:0;border:0;background:transparent;cursor:grab;touch-action:none;
  filter:drop-shadow(0 3px 7px #0005);font-size:calc(32px * var(--cw-fs, 1));line-height:1;
}
#cw-fab img{width:100%;height:100%;object-fit:contain;pointer-events:none}
#cw-top{
  display:inline-flex;align-items:center;justify-content:center;
  flex-shrink:0;align-self:center;padding:5px;
  border:0;background:transparent;color:var(--SmartThemeBodyColor,inherit);
  cursor:pointer;line-height:1;font-family:Arial,sans-serif;
}
#cw-top img{display:block;width:100%;height:100%;object-fit:contain;pointer-events:none}
@media(max-width:650px){
  #cw-tabs{padding:6px 8px;padding-top:max(6px,env(safe-area-inset-top));gap:4px}
  #cw-tabs .cw-tab{padding:6px 9px;font-size:calc(13px * var(--cw-fs, 1))}
  #cw-tabs .cw-tab-icon{width:16px;height:16px;flex-basis:16px}
  #cw-hub-body>:is(#api-panel,#st-panel){padding:10px 12px}
  .rd-page{padding:12px 14px 32px;gap:14px}
  .st-grid{grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px}
  .api-row-label{flex-basis:70px}
  .api-form{grid-template-columns:1fr;gap:6px 0}
  .api-form>.api-label{margin-top:6px}
  .st-color-label{flex-basis:76px}
  #cw-tabs .cw-tab-tool{min-width:34px;padding:6px 8px}
  #cw-settings-page{padding:12px}
  #cw-settings-page details{padding:12px}
  .cw-settings,.cw-toolbar{padding:10px 12px}
  .ca-body{flex-direction:column}
  .ca-grid{grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:10px;padding:10px 12px}
  .ca-hero{grid-template-columns:118px 1fr;gap:12px;padding:10px}
  .ca-char-page{padding:10px 12px}
  .ca-hero-name{font-size:calc(18px * var(--cw-fs, 1))}
  .ca-hero-acts{grid-template-columns:1fr 1fr}
  #ca-panel .ca-card-acts .cw-button{font-size:calc(11px * var(--cw-fs, 1));padding:4px 2px;letter-spacing:0}
  .ca-sidebar{
    width:100%;max-height:116px;display:flex;gap:6px;
    overflow-x:auto;overflow-y:hidden;
    border-right:0;border-bottom:1px solid var(--cw-border);
  }
  .ca-chat-item{flex:0 0 auto;max-width:210px;margin:0}
  .ca-msgs,.sb-msgs{padding:8px 10px}
}
`;

  const sharedStyle = node('style');
  sharedStyle.id = 'cw-shared-style';
  const aliases = [
    'bg', 'bg2', 'surface', 'text', 'text-dim', 'text-light',
    'border', 'border-light', 'accent', 'accent-soft',
    'accent-text', 'danger', 'radius'
  ].flatMap(name => ['ca', 'sb'].map(prefix =>
    '--' + prefix + '-' + name + ':var(--cw-' + name + ');'
  )).join('');

  sharedStyle.textContent = THEME_TEMPLATE + `
${THEME_SELECTOR}{
  ${aliases}
  --sb-swipe:var(--cw-accent);
  --sb-swipe-soft:var(--cw-accent-soft);
}
`;

  const sharedCustom = node('style');
  sharedCustom.id = 'cw-shared-custom';
  sharedCustom.textContent = cfg.themeCss;
  // sharedCustom 最后插入（在预设 / 世界书样式之后），保证用户美化优先
  DOC.head.append(baseStyle);

  function normalizeCss(css) {
    let result = String(css || '').split(OLD_THEME_SELECTOR).join(THEME_SELECTOR)
      .replace(/#cw-home\b/g, '#cw-settings-page')
      .replace(
      /--(?:ca|sb)-(bg2?|surface|text(?:-dim|-light)?|border(?:-light)?|accent(?:-soft|-text)?|danger|radius)\b/g,
      '--cw-$1'
    );
    if (!result.includes(THEME_SELECTOR)) {
      result = result.replace(/#(?:ca|sb)-panel\b/g, THEME_SELECTOR);
    }
    return result;
  }

  function syncThemeUi() {
    DOC.querySelectorAll('[data-cw-theme-editor]').forEach(el => {
      el.value = cfg.themeCss;
    });
    DOC.querySelectorAll('[data-cw-theme-select]').forEach(select => {
      select.replaceChildren();
      const placeholder = node('option', '', '选择方案即可切换');
      placeholder.value = '';
      select.append(placeholder);
      cfg.themePresets.forEach((preset, index) => {
        const option = node('option', '', preset.name);
        option.value = String(index);
        select.append(option);
      });
      const match = cfg.themePresets.findIndex(p => normalizeCss(p.css) === cfg.themeCss);
      select.value = match >= 0 ? String(match) : '';
    });
    DOC.querySelectorAll('[data-cw-theme-quick]').forEach(box => {
      box.replaceChildren();
      cfg.themePresets.forEach((preset, index) => {
        const b = button(preset.name, () => applyThemePreset(index));
        b.setAttribute('aria-pressed', String(normalizeCss(preset.css) === cfg.themeCss));
        box.append(b);
      });
      if (!cfg.themePresets.length) {
        box.append(node('div', 'cw-note', '保存方案后，这里会出现一键切换按钮。'));
      }
    });
  }

  function setSharedCss(css) {
    const previous = cfg.themeCss;
    cfg.themeCss = normalizeCss(css);
    if (!saveCfg()) {
      cfg.themeCss = previous;
      return false;
    }
    sharedCustom.textContent = cfg.themeCss;
    syncThemeUi();
    return true;
  }

  function applyThemePreset(index) {
    const preset = cfg.themePresets[index];
    if (preset) setSharedCss(preset.css);
  }

  function replaceThemePresets(next) {
    const previous = cfg.themePresets;
    cfg.themePresets = next;
    if (!saveCfg()) {
      cfg.themePresets = previous;
      return false;
    }
    syncThemeUi();
    return true;
  }

  async function saveThemePreset(editor, selectedName = '') {
    const css = editor.value;
    const value = await dialog(
      '给这套统一美化起个名字：',
      'prompt',
      selectedName || '统一美化 ' + (cfg.themePresets.length + 1)
    );
    if (!value?.trim() || disposed) return;
    const name = value.trim();
    const index = cfg.themePresets.findIndex(p => p.name === name);
    if (index >= 0 && !await ask('覆盖统一美化方案「' + name + '」？')) return;
    if (disposed) return;
    const next = cfg.themePresets.map(p => ({ ...p }));
    const preset = { name, css: normalizeCss(css) };
    if (index >= 0) next[index] = preset;
    else next.push(preset);
    if (replaceThemePresets(next) && setSharedCss(preset.css)) {
      notice('已保存并应用统一美化方案「' + name + '」。');
    }
  }

  function uniquePresetName(name, list) {
    const base = String(name || '导入方案');
    let result = base;
    let number = 2;
    while (list.some(p => p.name === result)) result = base + ' · ' + number++;
    return result;
  }

  function addThemeEditor(body, prefix = 'cw') {
    const section = node('div', 'cw-theme-editor-section');
    section.append(node(
      'p',
      'cw-note',
      '预设、世界书、档案馆、回复分支、美化五页和所有弹窗共用这份 CSS。「填入默认模板」即是全局默认美化，可在它的基础上修改；保存方案后可一键切换。'
    ));

    const editor = node('textarea', 'cw-css-editor');
    editor.id = prefix === 'cw' ? 'cw-theme-editor' : prefix + '-css-editor';
    editor.dataset.cwThemeEditor = '1';
    editor.spellcheck = false;
    editor.value = cfg.themeCss;
    editor.placeholder = '留空时跟随酒馆主题。填入默认模板后可自行调整。';
    section.append(editor);

    section.append(actions(
      button('保存应用', () => {
        if (setSharedCss(editor.value)) notice('五页与弹窗的美化已同步保存。');
      }),
      button('恢复默认', () => setSharedCss('')),
      button('填入默认模板', () => { editor.value = THEME_TEMPLATE; }),
      button('复制默认模板', async () => {
        if (await copyText(THEME_TEMPLATE)) notice('默认模板已复制。');
      })
    ));

    const presetBox = node('div', 'cw-preset-box');
    presetBox.append(node('div', 'cw-preset-title', '统一美化方案'));
    const select = node('select', 'cw-preset-select');
    select.dataset.cwThemeSelect = '1';
    select.id = prefix + '-theme-presets';
    select.setAttribute('aria-label', '统一美化方案');
    select.addEventListener('change', () => {
      if (select.value !== '') applyThemePreset(Number(select.value));
    });

    presetBox.append(select);
    const row = actions(
      button('保存为方案', () => {
        const chosen = cfg.themePresets[Number(select.value)];
        return saveThemePreset(editor, select.value === '' ? '' : chosen?.name);
      }),
      button('应用所选', () => {
        if (select.value !== '') applyThemePreset(Number(select.value));
      }),
      button('删除所选', async () => {
        if (select.value === '') return;
        const preset = cfg.themePresets[Number(select.value)];
        if (!preset || !await ask('删除统一美化方案「' + preset.name + '」？')) return;
        replaceThemePresets(cfg.themePresets.filter(p => p !== preset));
      }, 'cw-danger')
    );
    row.id = prefix + '-theme-preset-actions';
    presetBox.append(row);

    const quick = node('div', 'cw-theme-quick');
    quick.dataset.cwThemeQuick = '1';
    presetBox.append(quick);
    section.append(presetBox);

    const fileInput = node('input');
    fileInput.type = 'file';
    fileInput.accept = '.css,.json';
    fileInput.hidden = true;

    section.append(actions(
      button('导入 CSS / JSON', () => fileInput.click()),
      button('导出当前 CSS', () => {
        download('梨梨工作台美化.css', editor.value, 'text/css;charset=utf-8');
      }),
      button('备份全部方案', () => {
        download('梨梨工作台_统一美化方案.json', JSON.stringify({
          type: 'cw-theme-presets',
          version: 1,
          currentCss: editor.value,
          presets: cfg.themePresets
        }, null, 2), 'application/json;charset=utf-8');
      }),
      button('导入旧脚本方案', () => importOldThemes(false))
    ), fileInput);

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      try {
        const text = (await file.text()).replace(/^\uFEFF/, '');
        if (disposed || !section.isConnected) return;
        let imported;
        if (/\.css$/i.test(file.name)) {
          imported = [{ name: file.name.replace(/\.css$/i, ''), css: text }];
        } else {
          const data = JSON.parse(text);
          imported = cssPresets(data?.presets);
          if (!imported.length && typeof data?.currentCss === 'string') {
            imported.push({ name: file.name.replace(/\.json$/i, ''), css: data.currentCss });
          }
        }
        if (!imported?.length) throw Error('文件中没有有效的 CSS 方案。');
        const next = cfg.themePresets.map(p => ({ ...p }));
        for (const preset of imported) {
          next.push({
            name: uniquePresetName(preset.name, next),
            css: normalizeCss(preset.css)
          });
        }
        if (replaceThemePresets(next)) notice('已导入 ' + imported.length + ' 套美化方案。');
      } catch (error) {
        notice('导入失败：' + error.message);
      }
    });

    body.append(section);
  }

  function importOldThemes(silent) {
        const next = cfg.themePresets.map(p => ({ ...p }));
        let count = 0;
        const sources = [];
        for (const key of [ARCHIVE_KEY, HISTORY_KEY]) {
          sources.push(...cssPresets(object(read(key, {})).cssPresets));
        }
        sources.push(...cssPresets(object(read(OLD_CHAT_KEY, {})).themePresets));
        for (const [key, label] of [[PRESET_KEY, '预设'], [WORLD_KEY, '世界书']]) {
          const old = object(read(key, {}));
          for (const theme of cssPresets(old.themes)) sources.push({ name: label + '·' + theme.name, css: theme.css });
          if (typeof old.css === 'string' && old.css.trim()) sources.push({ name: label + '·当前美化', css: old.css });
        }
        for (const preset of sources) {
          const css = normalizeCss(preset.css);
          if (next.some(p => normalizeCss(p.css) === css)) continue;
          next.push({ name: uniquePresetName(preset.name, next), css });
          count++;
        }
        if (!count) {
          if (!silent) notice('没有需要导入的新方案。旧脚本的方案仍保留在浏览器中。');
        } else if (replaceThemePresets(next)) {
          if (!silent) notice('已导入 ' + count + ' 套旧脚本方案（预设、世界书、聊天工作台）。');
        }
  }


  function paintImage(target, url, fallback, reportError = false) {
    target.replaceChildren();
    if (!url) {
      target.textContent = fallback;
      return;
    }
    const img = node('img');
    img.alt = '梨梨工作台图标';
    img.src = url;
    img.addEventListener('error', () => {
      if (img.parentNode !== target) return;
      target.textContent = fallback;
      if (reportError) target.title = '图片加载失败，请检查链接或防盗链限制。';
    }, { once: true });
    target.title = '';
    target.append(img);
  }

  function positionFab() {
    if (!fab) return;
    const width = W.innerWidth;
    const height = W.innerHeight;
    const x = Math.max(0, Math.min(
      Number.isFinite(cfg.x) ? cfg.x : width - cfg.size - 18,
      Math.max(0, width - cfg.size)
    ));
    const y = Math.max(0, Math.min(
      Number.isFinite(cfg.y) ? cfg.y : height - cfg.size - 130,
      Math.max(0, height - cfg.size)
    ));
    fab.style.left = x + 'px';
    fab.style.top = y + 'px';
  }

  function renderEntrances() {
    if (disposed) return;
    const bar = DOC.querySelector('#top-settings-holder');
    if (cfg.top && bar) {
      if (!top) {
        top = button('', () => toggleHub());
        top.id = 'cw-top';
        top.className = '';
        top.title = '梨梨工作台';
        top.setAttribute('aria-label', '梨梨工作台');
      }
      if (top.parentNode !== bar) bar.append(top);
      top.style.width = cfg.topSize + 10 + 'px';
      top.style.height = cfg.topSize + 10 + 'px';
      top.style.fontSize = cfg.topSize + 'px';
      if (top.dataset.image !== cfg.topImage) {
        top.dataset.image = cfg.topImage;
        paintImage(top, cfg.topImage, '♡');
        top.title = '梨梨工作台';
      }
    } else {
      top?.remove();
      top = null;
    }

    const showFab = cfg.floating || (cfg.top && !bar);
    if (!showFab) {
      fab?.remove();
      fab = null;
      return;
    }

    if (!fab) {
      fab = node('button');
      fab.type = 'button';
      fab.id = 'cw-fab';
      fab.title = '梨梨工作台，拖动可保存位置';
      fab.setAttribute('aria-label', '梨梨工作台');
      DOC.body.append(fab);
      let drag = null;
      let suppressClick = false;

      fab.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        const rect = fab.getBoundingClientRect();
        drag = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          dx: event.clientX - rect.left,
          dy: event.clientY - rect.top,
          moved: false
        };
        suppressClick = false;
        fab.setPointerCapture(event.pointerId);
      });
      fab.addEventListener('pointermove', event => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 6) drag.moved = true;
        if (!drag.moved) return;
        cfg.x = event.clientX - drag.dx;
        cfg.y = event.clientY - drag.dy;
        positionFab();
      });
      fab.addEventListener('pointerup', event => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        suppressClick = drag.moved;
        if (drag.moved) {
          const rect = fab.getBoundingClientRect();
          cfg.x = rect.left;
          cfg.y = rect.top;
          saveCfg();
        }
        drag = null;
      });
      fab.addEventListener('pointercancel', () => {
        drag = null;
        suppressClick = true;
      });
      fab.addEventListener('click', event => {
        if (suppressClick && event.detail !== 0) {
          suppressClick = false;
          return;
        }
        toggleHub();
      });
    }

    fab.style.width = cfg.size + 'px';
    fab.style.height = cfg.size + 'px';
    if (fab.dataset.image !== cfg.image) {
      fab.dataset.image = cfg.image;
      paintImage(fab, cfg.image, '☕');
      fab.title = '梨梨工作台，拖动可保存位置';
    }
    positionFab();
  }

  /* ═════════════ 🍐 四页切换外壳 ═════════════ */
  const TABS = [
    ['preset', '📖', '预设'],
    ['api', '🔌', 'API'],
    ['sttheme', '🎨', '酒馆美化'],
    ['worldbook', '♢', '世界书'],
    ['archive', '☕', '聊天档案馆'],
    ['history', '🌿', '回复分支'],
    ['tools', '🧰', '工具'],
    ['beauty', '🎀', '控制台']
  ];
  const TAB_NAMES = TABS.map(t => t[0]);
  function tabDef(name) { return TABS.find(t => t[0] === name); }
  function tabLabel(name) { return cfg.tabNames[name] || tabDef(name)?.[2] || name; }
  function orderedTabs(all) {
    const order = (Array.isArray(cfg.tabOrder) ? cfg.tabOrder : []).filter(n => TAB_NAMES.includes(n));
    for (const name of TAB_NAMES) {
      if (order.includes(name)) continue;
      const at = order.indexOf('beauty');
      if (at >= 0) order.splice(at, 0, name); else order.push(name);
    }
    return all ? order : order.filter(name => name === 'beauty' || !cfg.tabHidden.includes(name));
  }
  const DEFAULT_TAB_ICONS = {
    tools: 'https://s1.oururl.cn/autoupload/cgoqf/20260922/mh3k/315X398/%E6%B2%90%E6%9E%9C%E7%B4%A0%E6%9D%90_%28136%29.png',
    api: 'https://s1.oururl.cn/autoupload/cgoqf/20260923/oPWM/204X238/%E6%B2%90%E6%9E%9C%E7%B4%A0%E6%9D%90_%28115%29.png',
    sttheme: 'https://s1.oururl.cn/autoupload/cgoqf/20260923/ogkh/369X285/%E6%B2%90%E6%9E%9C%E7%B4%A0%E6%9D%90_%2833%29.png',
    preset: 'https://s1.oururl.cn/autoupload/cgoqf/20260922/hJAs/346X369/%E6%B2%90%E6%9E%9C%E7%B4%A0%E6%9D%90_%2816%29.png',
    worldbook: 'https://s1.oururl.cn/autoupload/cgoqf/20260922/lDPE/241X245/%E6%B2%90%E6%9E%9C%E7%B4%A0%E6%9D%90_%2864%29.png',
    archive: 'https://s1.oururl.cn/autoupload/cgoqf/20260922/RdtU/331X326/%E6%B2%90%E6%9E%9C%E7%B4%A0%E6%9D%90_%28154%29.png',
    history: 'https://s1.oururl.cn/autoupload/cgoqf/20260922/rQaV/242X321/%E6%B2%90%E6%9E%9C%E7%B4%A0%E6%9D%90_%28139%29.png',
    beauty: 'https://s1.oururl.cn/autoupload/cgoqf/20260922/GSv2/322X212/%E6%B2%90%E6%9E%9C%E7%B4%A0%E6%9D%90_%2842%29.png'
  };

  function tabIconUrl(name) {
    return cfg.tabIcons[name] || DEFAULT_TAB_ICONS[name];
  }

  function paintTabIcon(target, name, url = tabIconUrl(name)) {
    const emoji = TABS.find(t => t[0] === name)?.[1] || '♡';
    target.replaceChildren();
    const img = node('img');
    img.alt = '';
    img.draggable = false;
    img.src = url;
    img.addEventListener('error', () => {
      if (img.parentNode === target) target.textContent = emoji;
    }, { once: true });
    target.append(img);
  }

  function paintTabList(list) {
    list.replaceChildren();
    for (const name of orderedTabs()) {
      const label = tabLabel(name);
      const b = button('', () => navigate(name), 'cw-tab');
      b.dataset.tab = name;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(name === activeTab));
      b.title = label;
      const iconBox = node('span', 'cw-tab-icon');
      iconBox.setAttribute('aria-hidden', 'true');
      paintTabIcon(iconBox, name);
      b.append(iconBox, node('span', 'cw-tab-label', label));
      list.append(b);
    }
  }

  function rebuildTabs() {
    const list = hub?.querySelector('#cw-tab-list');
    if (list) { paintTabList(list); markTabs(); }
  }

  function refreshTabIcons() {
    hub?.querySelectorAll('.cw-tab[data-tab] .cw-tab-icon').forEach(icon => {
      paintTabIcon(icon, icon.closest('[data-tab]').dataset.tab);
    });
  }

  function hubVisible() {
    return !!hub?.isConnected && !hub.hidden;
  }

  function toggleHub() {
    if (disposed) return;
    if (hubVisible()) return requestHubClose();
    return openHub();
  }

  function markTabs() {
    hub?.querySelectorAll('[data-tab]').forEach(tab => {
      const selected = tab.dataset.tab === activeTab;
      tab.setAttribute('aria-selected', String(selected));
      if (selected && tab.classList.contains('cw-tab') && tab.scrollIntoView) {
        tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    });
  }

  function openHub(tab) {
    if (disposed) return;
    if (hub?.isConnected) {
      // 曾经因跳转聊天而暂时收起：保留预设 / 世界书的草稿，直接重新显示
      hub.hidden = false;
      return navigate(tab || (activeTab ? activeTab : cfg.lastTab));
    }

    hub = node('section');
    hub.id = 'cw-hub';
    hub.setAttribute('aria-label', '梨梨工作台');

    const bar = node('div');
    bar.id = 'cw-tabs';
    const list = node('div', 'cw-tab-list');
    list.setAttribute('role', 'tablist');
    list.id = 'cw-tab-list';
    paintTabList(list);
    const shut = button('✕', () => requestHubClose(), 'cw-tab-tool');
    shut.title = '关闭';
    shut.setAttribute('aria-label', '关闭');
    bar.append(list, shut);

    hubBody = node('div');
    hubBody.id = 'cw-hub-body';
    hub.append(bar, hubBody);
    applyUiScale();
    const foldWatch = new W.MutationObserver(() => enhanceBars(foldWatch.hub));
    foldWatch.hub = hub;
    foldWatch.observe(hub, { childList: true, subtree: true });
    cleanups.push(() => foldWatch.disconnect());
    hub.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.stopPropagation();
      event.preventDefault();
      void requestHubClose();
    });
    DOC.body.append(hub);
    activeTab = null;
    return navigate(tab || cfg.lastTab);
  }

  function showError(name, error) {
    const box = node('div', 'cw-hub-error');
    box.append(
      node('p', 'cw-note', '这一页没能打开：' + (error?.message || String(error))),
      actions(button('重试', () => {
        pages.get(name)?.remove();
        pages.delete(name);
        activeTab = null;
        navigate(name);
      }))
    );
    hubBody.append(box);
    pages.set(name, box);
  }

  async function navigate(name) {
    if (disposed || switching || !hub?.isConnected) return;
    if (name === activeTab && pages.get(name)?.isConnected) {
      pages.get(name).hidden = false;
      markTabs();
      return;
    }
    if (writing) {
      notice('正在保存聊天，请稍后切换。');
      return;
    }
    switching = true;
    try {
      // 离开当前页：预设 / 世界书只隐藏（保留草稿）；聊天两页按原逻辑确认后关闭
      if (activeTab) {
        const page = pages.get(activeTab);
        const module = modules[activeTab];
        if (module && page?.dataset.cwModule) {
          if (module.keep) {
            page.hidden = true;
          } else {
            if (!await module.canLeave()) return;
            module.close();
            pages.delete(activeTab);
          }
        } else {
          page?.remove();
          pages.delete(activeTab);
        }
      }
      if (disposed || !hub?.isConnected) return;

      activeTab = name;
      markTabs();

      // 记住最后停留的页面，下次打开直接回到这里
      if (cfg.lastTab !== name) {
        cfg.lastTab = name;
        try { W.localStorage.setItem(KEY, JSON.stringify(cfg)); } catch {}
      }

      if (name === 'beauty') {
        pages.set(name, buildSettings(hubBody));
        return;
      }

      const kept = pages.get(name);
      if (kept?.isConnected) {
        kept.hidden = false;
        return;
      }
      pages.delete(name);

      const module = modules[name];
      try {
        const pending = module.open(hubBody);
        const el = module.element();
        if (el) {
          el.dataset.cwModule = '1';
          pages.set(name, el);
        }
        Promise.resolve(pending).catch(error => notice('打开失败：' + error.message));
      } catch (error) {
        showError(name, error);
      }
    } catch (error) {
      notice('切换失败：' + error.message);
    } finally {
      switching = false;
    }
  }

  async function requestHubClose() {
    if (disposed || switching || !hub?.isConnected) return;
    if (writing) {
      notice('正在保存聊天，请稍后关闭。');
      return;
    }
    switching = true;
    try {
      for (const [name, page] of pages) {
        const module = modules[name];
        if (module && page.dataset.cwModule && !await module.canLeave()) return;
        if (disposed || !hub?.isConnected) return;
      }
      for (const [name] of pages) modules[name]?.close();
      pages.clear();
      hub.remove();
      hub = hubBody = null;
      activeTab = null;
    } finally {
      switching = false;
    }
  }

  async function gotoWorldbook(name) {
    await navigate('worldbook');
    if (activeTab === 'worldbook') await modules.worldbook.showBook?.(name);
  }

  // 聊天两页跳转到聊天后调用：收起面板露出聊天，预设 / 世界书的草稿继续保留
  function dismissHub() {
    for (const [name, page] of [...pages]) {
      if (!page.isConnected) pages.delete(name);
    }
    if (activeTab && !pages.has(activeTab)) activeTab = null;
    if (!hub?.isConnected) return;
    const hasKept = [...pages.keys()].some(name => modules[name]?.keep);
    if (hasKept) {
      hub.hidden = true;
      return;
    }
    for (const [, page] of pages) page.remove();
    pages.clear();
    hub.remove();
    hub = hubBody = null;
    activeTab = null;
  }


  /* ─── 功能栏收起成一行 ─── */
  const FOLD_BARS = '.cw-toolbar, .pw-head, .wb-head';
  function enhanceBars(root) {
    if (!root?.isConnected) return;
    for (const bar of root.querySelectorAll(FOLD_BARS)) {
      if (bar.closest('.cw-dialog, .pw-dialog, .wb-dialog, .rd-selbar')) continue;
      let btn = bar.querySelector(':scope > .cw-fold-btn');
      if (!btn) {
        btn = node('button', 'cw-button cw-fold-btn');
        btn.type = 'button';
        btn.addEventListener('click', event => {
          event.stopPropagation();
          cfg.barFold = !cfg.barFold;
          saveCfg();
          syncBars();
          if (!cfg.barFold) return;
          bar.scrollLeft = 0;
        });
        bar.append(btn);
      } else if (btn !== bar.lastElementChild) {
        bar.append(btn);
      }
      const want = cfg.barFold;
      if (bar.classList.contains('cw-bar-folded') !== want) bar.classList.toggle('cw-bar-folded', want);
      const label = want ? '⋯' : '▴';
      if (btn.textContent !== label) btn.textContent = label;
      const tip = want ? '展开功能栏' : '收起成一行';
      if (btn.title !== tip) { btn.title = tip; btn.setAttribute('aria-label', tip); }
    }
  }
  function syncBars() {
    if (hub) enhanceBars(hub);
  }

  /* ─── 文字大小与整体缩放 ─── */
  function applyUiScale() {
    const root = DOC.documentElement;
    root.style.setProperty('--cw-fs', String((cfg.fontScale || 100) / 100));
    root.style.setProperty('--cw-zoom', String((cfg.uiZoom || 100) / 100));
    hub?.classList.toggle('cw-zoomed', cfg.uiZoom !== 100);
    DOC.body.classList.toggle('cw-ui-zoomed', cfg.uiZoom !== 100);
  }
  cleanups.push(() => {
    DOC.documentElement.style.removeProperty('--cw-fs');
    DOC.documentElement.style.removeProperty('--cw-zoom');
    DOC.body.classList.remove('cw-ui-zoomed');
  });

  // 改完整体缩放：屏幕最上层弹出确认，10 秒内不点「保留」就自动恢复，界面缩坏了也能回来
  let zoomKeep = 100, zoomTimer = 0;
  function zoomGuard(zoom) {
    DOC.querySelector('.cw-zoom-guard')?.remove();
    W.clearInterval(zoomTimer);
    if (cfg.uiZoom === zoomKeep) return;
    const box = DOC.createElement('div');
    box.className = 'cw-zoom-guard';
    const text = DOC.createElement('span');
    let left = 10;
    const paint = () => { text.textContent = '界面缩放 ' + cfg.uiZoom + '%，保留吗？' + left + ' 秒后自动恢复'; };
    const finish = keep => {
      W.clearInterval(zoomTimer);
      box.remove();
      if (keep) { zoomKeep = cfg.uiZoom; saveCfg(); return; }
      cfg.uiZoom = zoomKeep;
      saveCfg();
      applyUiScale();
      if (zoom?.range?.isConnected) { zoom.range.value = String(zoomKeep); zoom.value.textContent = zoomKeep + '%'; }
    };
    const keep = DOC.createElement('button'); keep.type = 'button'; keep.className = 'is-keep'; keep.textContent = '保留';
    const back = DOC.createElement('button'); back.type = 'button'; back.textContent = '恢复';
    keep.addEventListener('click', () => finish(true));
    back.addEventListener('click', () => finish(false));
    box.append(text, keep, back);
    (DOC.querySelector('dialog[open]') || DOC.body).append(box);
    paint();
    zoomTimer = W.setInterval(() => { left--; if (left <= 0) finish(false); else paint(); }, 1000);
  }
  cleanups.push(() => { W.clearInterval(zoomTimer); DOC.querySelector('.cw-zoom-guard')?.remove(); });

  function buildScaleSection() {
    zoomKeep = cfg.uiZoom;
    const box = node('details');
    box.open = true;
    box.append(node('summary', '', '文字大小与界面缩放'),
      node('p', 'cw-note', '只影响梨梨工作台自己的界面（包括弹窗），不改酒馆。阅读器正文字号在阅读器「样式」里单独调。'));
    const slider = (label, key, min, max, step) => {
      const range = node('input');
      range.type = 'range';
      range.min = String(min); range.max = String(max); range.step = String(step);
      range.value = String(cfg[key]);
      const value = node('span', 'st-num-value', cfg[key] + '%');
      const row = node('div', 'api-key-row cw-scale-row');
      row.append(range, value);
      let timer = 0;
      range.addEventListener('input', () => {
        value.textContent = range.value + '%';
        cfg[key] = Number(range.value);
        applyUiScale();
        if (key === 'uiZoom') return;
        W.clearTimeout(timer);
        timer = W.setTimeout(saveCfg, 300);
      });
      range.addEventListener('change', () => { cfg[key] = Number(range.value); if (key !== 'uiZoom') saveCfg(); });
      return { range, value, wrap: field(label, row) };
    };
    const font = slider('文字大小', 'fontScale', 70, 170, 5);
    const zoom = slider('整体界面缩放（按钮、间距、图标一起缩放）', 'uiZoom', 70, 140, 5);
    zoom.range.addEventListener('change', () => zoomGuard(zoom));
    const fold = heartSwitch(cfg.barFold, '功能栏默认收起成一行');
    const foldRow = node('label', 'cw-check');
    foldRow.append(fold, DOC.createTextNode('各页顶部功能栏收起成一行（左右滑动查看，点 ⋯ 展开）'));
    fold.addEventListener('change', () => { cfg.barFold = fold.checked; saveCfg(); syncBars(); });
    box.append(font.wrap, zoom.wrap, foldRow, actions(button('恢复默认', () => {
      cfg.fontScale = 100; cfg.uiZoom = 100; zoomKeep = 100;
      font.range.value = '100'; zoom.range.value = '100';
      font.value.textContent = '100%'; zoom.value.textContent = '100%';
      applyUiScale(); saveCfg();
    })));
    return box;
  }

  function buildSettings(container) {
    const body = node('div', 'cw-home-body');
    body.id = 'cw-settings-page';
    body.append(node('p', 'cw-note', '白川 & 陈野 & 梨梨 · 控制台：token 统计，以及顶栏图标、悬浮图、切页图标和全局 CSS（五页共享）。'));

    body.append(buildTokenBoard());
    body.append(buildScaleSection());

    const entrances = node('details');
    entrances.open = true;
    entrances.append(node('summary', '', '入口显示'));
    const topCheck = heartSwitch(cfg.top, '显示顶栏入口');
    const fabCheck = heartSwitch(cfg.floating, '显示悬浮入口');

    for (const [control, text] of [
      [topCheck, '显示顶栏入口'],
      [fabCheck, '显示悬浮入口']
    ]) {
      const label = node('label', 'cw-check');
      label.append(control, DOC.createTextNode(text));
      entrances.append(label);
      control.addEventListener('change', () => {
        if (!topCheck.checked && !fabCheck.checked) {
          control.checked = true;
          notice('至少保留一个入口。');
          return;
        }
        cfg.top = topCheck.checked;
        cfg.floating = fabCheck.checked;
        saveCfg();
        renderEntrances();
      });
    }
    body.append(entrances);

    const topSection = node('details');
    topSection.open = true;
    topSection.append(node('summary', '', '顶栏入口图标'));
    const topUrl = input('图片直链 https://…', cfg.topImage);
    topUrl.type = 'url';
    const topPreview = node('div', 'cw-image-preview');
    topPreview.id = 'cw-top-preview';
    paintImage(topPreview, cfg.topImage, '♡', true);

    const topSize = node('input');
    topSize.type = 'range';
    topSize.min = '16';
    topSize.max = '48';
    topSize.value = cfg.topSize;
    const topSizeLabel = field('图标大小：' + cfg.topSize + ' px', topSize);
    topSize.addEventListener('input', () => {
      topSizeLabel.firstElementChild.textContent = '图标大小：' + topSize.value + ' px';
    });

    function applyTop() {
      try {
        const url = validImage(topUrl.value);
        cfg.topImage = url;
        cfg.topSize = Number(topSize.value);
        if (!saveCfg()) return;
        paintImage(topPreview, url, '♡', true);
        renderEntrances();
      } catch (error) {
        notice(error.message);
      }
    }

    topSection.append(
      field('顶栏图标图片链接', topUrl),
      topPreview,
      topSizeLabel,
      actions(
        button('预览 / 保存', applyTop),
        button('恢复默认图标', () => {
          topUrl.value = '';
          topSize.value = '26';
          topSizeLabel.firstElementChild.textContent = '图标大小：26 px';
          applyTop();
        })
      ),
      node('p', 'cw-note', '图片链接与大小保存在当前浏览器。图片加载失败时自动显示默认爱心。')
    );
    body.append(topSection);

    const floating = node('details');
    floating.open = true;
    floating.append(node('summary', '', '悬浮图与方案'));
    const fabUrl = input('图片直链 https://…', cfg.image);
    fabUrl.type = 'url';
    const fabPreview = node('div', 'cw-image-preview');
    fabPreview.id = 'cw-preview';
    paintImage(fabPreview, cfg.image, '☕', true);
    const fabSize = node('input');
    fabSize.type = 'range';
    fabSize.min = '32';
    fabSize.max = '120';
    fabSize.value = cfg.size;
    const fabSizeLabel = field('悬浮图大小：' + cfg.size + ' px', fabSize);
    fabSize.addEventListener('input', () => {
      fabSizeLabel.firstElementChild.textContent = '悬浮图大小：' + fabSize.value + ' px';
    });

    function applyFab() {
      try {
        cfg.image = validImage(fabUrl.value);
        cfg.size = Number(fabSize.value);
        if (!saveCfg()) return false;
        paintImage(fabPreview, cfg.image, '☕', true);
        renderEntrances();
        return true;
      } catch (error) {
        notice(error.message);
        return false;
      }
    }

    floating.append(
      field('悬浮图图片链接', fabUrl),
      fabPreview,
      fabSizeLabel,
      actions(
        button('预览 / 保存', applyFab),
        button('恢复默认图', () => { fabUrl.value = ''; applyFab(); }),
        button('重置位置', () => {
          cfg.x = null;
          cfg.y = null;
          saveCfg();
          positionFab();
        })
      )
    );

    const presetBox = node('div', 'cw-preset-box');
    presetBox.id = 'cw-fab-preset-box';
    presetBox.append(node('div', 'cw-preset-title', '悬浮窗存储方案'));
    const select = node('select', 'cw-preset-select');
    select.id = 'cw-fab-presets';
    select.setAttribute('aria-label', '悬浮窗方案');

    function renderFabPresets(selected = '') {
      select.replaceChildren();
      const placeholder = node('option', '', '选择悬浮窗方案即可应用');
      placeholder.value = '';
      select.append(placeholder);
      cfg.presets.forEach((preset, index) => {
        const option = node('option', '', preset.name);
        option.value = String(index);
        select.append(option);
      });
      select.value = selected;
    }

    function applyFabPreset() {
      if (select.value === '') return;
      const preset = cfg.presets[Number(select.value)];
      if (!preset) return;
      try {
        cfg.image = validImage(preset.image);
        cfg.size = Math.max(32, Math.min(120, Number(preset.size) || 56));
        cfg.x = Number.isFinite(preset.x) ? preset.x : null;
        cfg.y = Number.isFinite(preset.y) ? preset.y : null;
        if (!saveCfg()) return;
        fabUrl.value = cfg.image;
        fabSize.value = cfg.size;
        fabSizeLabel.firstElementChild.textContent = '悬浮图大小：' + cfg.size + ' px';
        paintImage(fabPreview, cfg.image, '☕', true);
        renderEntrances();
      } catch (error) {
        notice(error.message);
      }
    }

    select.addEventListener('change', applyFabPreset);
    renderFabPresets();
    presetBox.append(select);

    const presetActions = actions(
      button('保存为方案', async () => {
        if (!applyFab()) return;
        const value = await dialog(
          '给这套悬浮窗起个名字：',
          'prompt',
          '悬浮窗 ' + (cfg.presets.length + 1)
        );
        if (!value?.trim() || disposed) return;
        const name = value.trim();
        const index = cfg.presets.findIndex(preset => preset.name === name);
        if (index >= 0 && !await ask('覆盖悬浮窗方案「' + name + '」？')) return;
        const preset = {
          name,
          image: cfg.image,
          size: cfg.size,
          x: cfg.x,
          y: cfg.y
        };
        const previous = cfg.presets.slice();
        if (index >= 0) cfg.presets[index] = preset;
        else cfg.presets.push(preset);
        if (!saveCfg()) {
          cfg.presets = previous;
          return;
        }
        renderFabPresets(String(index >= 0 ? index : cfg.presets.length - 1));
      }),
      button('应用方案', applyFabPreset),
      button('删除方案', async () => {
        if (select.value === '') return;
        const preset = cfg.presets[Number(select.value)];
        if (!preset || !await ask('删除悬浮窗方案「' + preset.name + '」？')) return;
        const previous = cfg.presets;
        cfg.presets = cfg.presets.filter(item => item !== preset);
        if (!saveCfg()) cfg.presets = previous;
        renderFabPresets();
      }, 'cw-danger')
    );
    presetActions.id = 'cw-fab-preset-actions';
    presetBox.append(presetActions);
    floating.append(presetBox);
    body.append(floating);

    const trans = node('details');
    trans.append(node('summary', '', '翻译接口（副 API）'),
      node('p', 'cw-note', '填一个 OpenAI 兼容接口专门用来翻译，预设和世界书里的「翻译」就会走它，不占用你正在聊天的模型。留空或关掉就用酒馆当前连着的模型。'));
    const tconf = object(cfg.transApi);
    const tOn = heartSwitch(!!tconf.enabled, '启用副 API 翻译');
    const tOnRow = node('div', 'api-key-row');
    tOnRow.append(tOn, node('span', 'cw-note', '启用后翻译走下面这个接口'));
    const tUrl = input('接口网址 https://…/v1', tconf.url || '');
    const tKey = input('密钥 sk-…', tconf.key || '');
    tKey.type = 'password';
    const tModel = node('select');
    function paintTransModels(list) {
      tModel.replaceChildren();
      const all = list.slice();
      if (tconf.model && !all.includes(tconf.model)) all.unshift(tconf.model);
      if (!all.length) {
        const option = node('option', '', '（先点「拉取模型」）');
        option.value = tconf.model || '';
        tModel.append(option);
      }
      for (const item of all) {
        const option = node('option', '', item);
        option.value = item;
        tModel.append(option);
      }
      tModel.value = tconf.model || all[0] || '';
    }
    paintTransModels([]);
    const tFetch = button('拉取模型', async () => {
      if (!tUrl.value.trim()) { notice('请先填翻译接口的网址。'); return; }
      tFetch.disabled = true;
      tFetch.textContent = '拉取中…';
      try {
        const list = await fetchTransModels(tUrl.value.trim(), tKey.value);
        paintTransModels(list);
        notice(list.length ? '拉到 ' + list.length + ' 个模型。' : '没有拉到模型，检查网址和密钥。');
      } catch (error) {
        notice('拉取失败：' + error.message + '\n（浏览器可能因为跨域拦截了这个接口）');
      } finally {
        tFetch.disabled = false;
        tFetch.textContent = '拉取模型';
      }
    });
    const tModelRow = node('div', 'api-key-row');
    tModelRow.append(tModel, tFetch);
    const tPrompt = node('textarea', 'api-extra-text');
    tPrompt.rows = 3;
    tPrompt.value = tconf.prompt || DEFAULT_TRANS_PROMPT;
    const tGrid = node('div', 'api-form');
    tGrid.append(node('label', 'api-label', '启用'), tOnRow,
      node('label', 'api-label', '网址'), tUrl,
      node('label', 'api-label', '密钥'), tKey,
      node('label', 'api-label', '模型'), tModelRow,
      node('label', 'api-label', '翻译提示词'), tPrompt);
    trans.append(tGrid, actions(
      button('保存', () => {
        const previous = cfg.transApi;
        cfg.transApi = {
          enabled: tOn.checked, url: tUrl.value.trim(), key: tKey.value,
          model: tModel.value, prompt: tPrompt.value.trim() || DEFAULT_TRANS_PROMPT
        };
        if (!saveCfg()) { cfg.transApi = previous; return; }
        notice('翻译接口已保存。');
      }, 'cw-primary'),
      button('测试翻译', async () => {
        try {
          notice('测试结果：' + await translateText('The wind was soft today.'));
        } catch (error) {
          notice('测试失败：' + error.message);
        }
      })));
    body.append(trans);

    const layout = node('details');
    layout.open = true;
    layout.append(node('summary', '', '切页顺序与名称'),
      node('p', 'cw-note', '按住 ⠿ 拖动可以调整顺序，手机上用 ▲ ▼ 也行；名字改完按回车或点别处即可保存。爱心是这一页的开关，关掉就不出现在顶栏；控制台不能关。'));
    const rows = node('div', 'cw-taborder');
    let dragging = null;
    function paintRows() {
      rows.replaceChildren();
      const order = orderedTabs(true);
      order.forEach((name, index) => {
        const row = node('div', 'cw-taborder-row');
        row.draggable = true;
        row.dataset.tab = name;
        const icon = node('span', 'cw-taborder-icon');
        paintTabIcon(icon, name);
        const field = input(tabDef(name)?.[2] || name, cfg.tabNames[name] || '');
        field.addEventListener('change', () => {
          const value = field.value.trim();
          const previous = { ...cfg.tabNames };
          if (value && value !== tabDef(name)?.[2]) cfg.tabNames[name] = value;
          else delete cfg.tabNames[name];
          if (!saveCfg()) { cfg.tabNames = previous; return; }
          rebuildTabs();
        });
        const up = button('▲', () => move(index, -1));
        up.disabled = index === 0;
        const down = button('▼', () => move(index, 1));
        down.disabled = index === order.length - 1;
        const power = heartSwitch(!cfg.tabHidden.includes(name), '显示「' + (tabDef(name)?.[2] || name) + '」页');
        if (name === 'beauty') {
          power.disabled = true;
          power.title = '控制台不能关掉';
        }
        power.addEventListener('change', () => {
          const previous = cfg.tabHidden.slice();
          cfg.tabHidden = power.checked ? cfg.tabHidden.filter(item => item !== name) : [...cfg.tabHidden, name];
          if (!saveCfg()) { cfg.tabHidden = previous; return; }
          if (!power.checked && activeTab === name) navigate('beauty');
          rebuildTabs();
        });
        row.append(node('span', 'cw-taborder-grip', '⠿'), icon, field, power, up, down);
        row.addEventListener('dragstart', event => {
          dragging = name;
          row.classList.add('is-dragging');
          try { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', name); } catch {}
        });
        row.addEventListener('dragend', () => { dragging = null; row.classList.remove('is-dragging'); });
        row.addEventListener('dragover', event => { event.preventDefault(); row.classList.add('is-over'); });
        row.addEventListener('dragleave', () => row.classList.remove('is-over'));
        row.addEventListener('drop', event => {
          event.preventDefault();
          row.classList.remove('is-over');
          if (!dragging || dragging === name) return;
          const next = orderedTabs(true).filter(item => item !== dragging);
          next.splice(next.indexOf(name), 0, dragging);
          commit(next);
        });
        rows.append(row);
      });
    }
    function move(index, step) {
      const next = orderedTabs(true);
      const target = index + step;
      if (target < 0 || target >= next.length) return;
      [next[index], next[target]] = [next[target], next[index]];
      commit(next);
    }
    function commit(next) {
      const previous = cfg.tabOrder;
      cfg.tabOrder = next;
      if (!saveCfg()) { cfg.tabOrder = previous; return; }
      paintRows();
      rebuildTabs();
    }
    paintRows();
    layout.append(rows, actions(button('恢复默认顺序与名称', () => {
      cfg.tabOrder = [];
      cfg.tabNames = {};
      cfg.tabHidden = [];
      if (!saveCfg()) return;
      paintRows();
      rebuildTabs();
    })));
    body.append(layout);

    const icons = node('details');
    icons.open = true;
    icons.append(
      node('summary', '', '切页图标'),
      node('p', 'cw-note', '填入图片直链后会先预览，点「应用」才生效；留空并应用即恢复默认图标。')
    );
    for (const [name, , label] of TABS) {
      const box = node('div', 'cw-icon-row');
      const preview = node('div', 'cw-image-preview cw-tab-preview');
      paintTabIcon(preview, name);
      const url = input('图片直链 https://…', cfg.tabIcons[name] || '');
      url.type = 'url';
      const refreshPreview = () => {
        try {
          paintTabIcon(preview, name, validImage(url.value) || DEFAULT_TAB_ICONS[name]);
        } catch {
          preview.textContent = '✕';
        }
      };
      url.addEventListener('input', refreshPreview);
      box.append(
        node('div', 'cw-preset-title', label),
        preview,
        url,
        actions(
          button('预览', refreshPreview),
          button('应用', () => {
            try {
              const value = validImage(url.value);
              const previous = { ...cfg.tabIcons };
              if (value) cfg.tabIcons[name] = value;
              else delete cfg.tabIcons[name];
              if (!saveCfg()) { cfg.tabIcons = previous; return; }
              refreshTabIcons();
              refreshPreview();
            } catch (error) {
              notice(error.message);
            }
          }, 'cw-primary'),
          button('恢复默认', () => {
            url.value = '';
            const previous = { ...cfg.tabIcons };
            delete cfg.tabIcons[name];
            if (!saveCfg()) { cfg.tabIcons = previous; return; }
            refreshTabIcons();
            refreshPreview();
          })
        )
      );
      icons.append(box);
    }
    body.append(icons);

    const theme = node('details');
    theme.open = true;
    theme.append(node('summary', '', '全局美化 CSS'));
    addThemeEditor(theme);
    body.append(theme);

    container.append(body);
    syncThemeUi();
    return body;
  }

  async function scrollToMessage(index, guard = () => true) {
    for (let attempt = 0; attempt < 60; attempt++) {
      if (disposed || !guard()) throw Error('聊天已切换，已停止跳转。');
      const target = DOC.querySelector('#chat .mes[mesid="' + index + '"]');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const outline = target.style.outline;
        target.style.outline = '2px solid #b7a6cf';
        W.setTimeout(() => { target.style.outline = outline; }, 2500);
        return true;
      }
      const more = DOC.querySelector('#show_more_messages');
      if (!more?.getClientRects().length) break;
      more.click();
      await sleep(150);
    }
    notice('已打开聊天，但未找到消息 #' + index + '。');
    return false;
  }

  /* 聊天档案馆 */
  (function () {
    const saved = object(read(ARCHIVE_KEY, {}));
    const settings = {
      ...saved,
      bodyOnly: !!saved.bodyOnly,
      charSort: saved.charSort === 'recent' ? 'recent' : 'alpha',
      chatSort: saved.chatSort === 'asc' ? 'asc' : 'desc',
      pinned: Array.isArray(saved.pinned) ? saved.pinned.filter(item => typeof item === 'string') : []
    };
    let view = 'archive';                 // archive = 存档浏览；gallery = 角色图库
    let searchScope = 'file';             // file = 本存档；char = 本角色；all = 所有角色
    let searchResults = null;
    let searchToken = 0;
    let galleryQuery = '';
    const charBulk = { on: false, selected: new Set() };
    const thumbStamp = {};
    let pageAvatar = null, pageCard = null, pageError = '', pageRequest = 0;
    const charTok = new Map();
    const tokJobs = [];
    let tokWorkers = 0;
    const CHAR_FIELDS = [['description', '描述'], ['personality', '性格'], ['scenario', '场景'], ['first_mes', '开场白'], ['mes_example', '示例']];

    const bookTok = new Map();
    async function bookTokens(name) {
      if (bookTok.has(name)) return bookTok.get(name);
      let total = 0;
      try {
        const entries = (await helperFn('getWorldbook')?.(name)) || [];
        total = await sumTokens(entries.filter(e => e?.enabled).map(e => String(e.content ?? '')));
      } catch {
        total = 0;
      }
      bookTok.set(name, total);
      return total;
    }

    async function charTokenInfo(character, full = null) {
      if (!full && charTok.has(character.avatar)) return charTok.get(character.avatar);
      let card = full || character;
      const has = key => typeof card?.data?.[key] === 'string' || typeof card?.[key] === 'string';
      if (!full && !has('description') && !has('first_mes')) card = await apiPost('/api/characters/get', { avatar_url: character.avatar });
      const parts = [];
      for (const [key, label] of CHAR_FIELDS) parts.push([label, await countTokens(String(card?.data?.[key] ?? card?.[key] ?? ''))]);
      const self = parts.reduce((a, [, n]) => a + n, 0);
      const world = String(card?.data?.extensions?.world || '');
      const worldTokens = world ? await bookTokens(world) : 0;
      if (world) parts.push(['世界书《' + world + '》', worldTokens]);
      const info = { total: self + worldTokens, self, world, worldTokens, parts };
      charTok.set(character.avatar, info);
      return info;
    }

    function queueCharTokens(character, target) {
      const cached = charTok.get(character.avatar);
      if (cached) { target.textContent = fmtTok(cached.total) + ' tokens'; return; }
      tokJobs.push([character, target]);
      W.setTimeout(pumpCharTokens, 0);
    }

    function pumpCharTokens() {
      while (tokWorkers < 2 && tokJobs.length) {
        tokWorkers++;
        void (async () => {
          try {
            while (tokJobs.length) {
              const [c, el] = tokJobs.shift();
              if (!el.isConnected) continue;
              try {
                const info = await charTokenInfo(c);
                if (el.isConnected) el.textContent = fmtTok(info.total) + ' tokens';
              } catch {
                if (el.isConnected) el.textContent = '— tokens';
              }
            }
          } finally {
            tokWorkers--;
          }
        })();
      }
    }

    let panel = null;
    let chars = [];
    let currentChar = null;
    let chats = [];
    let currentFile = null;
    let messages = [];
    let requestId = 0;
    let searchTimer;
    let jumping = false;
    let archiveData = [];
    const selectedFloors = new Set(), selectedFiles = new Set();

    function activeArchive(character, file) {
      const ctx = context();
      return ctx?.groupId == null && ctx?.characters?.[ctx.characterId]?.avatar === character.avatar
        && String(ctx?.getCurrentChatId?.() || ctx?.chatId || '').replace(/\.jsonl$/i, '') === file;
    }

    async function deleteFloors(ids = selectedFloors, tail = false) {
      if (writing || jumping || !currentFile) return;
      const character = currentChar, file = currentFile, owner = panel;
      const original = clone(archiveData);
      try {
        const first = original[0] && !('mes' in original[0]) ? 1 : 0;
        const removed = deletionSet(ids, original.length - first, tail);
        if (!await ask('确定从「' + file + '」删除 ' + removed.size + ' 层消息？' + (tail ? '\n从最早选中楼层删到最后。' : ''))) return;
        if (writing) return;
        if (panel !== owner || currentChar !== character || currentFile !== file) throw Error('预览已切换，请重新选择。');
        if (isGenerating()) throw Error('请等当前生成结束。');
        writing = true;
        const body = { ch_name: character.name, avatar_url: character.avatar, file_name: file };
        const fresh = await apiPost('/api/chats/get', body);
        if (stableString(fresh) !== stableString(original)) throw Error('存档已变化，请重新选择存档。');
        const next = original.filter((m, raw) => raw < first || !removed.has(raw - first));
        if (activeArchive(character, file)) {
          const ctx = context();
          if (stableString(ctx.chat) !== stableString(original.slice(first))) throw Error('当前聊天有更新，请保存后重新选择存档。');
          await commitChat(ctx, next.slice(first));
          await refreshChat(ctx);
        } else {
          const result = await apiPost('/api/chats/save', { ...body, chat: next });
          if (!result?.ok) throw Error('服务器未确认保存。');
          const saved = await apiPost('/api/chats/get', body);
          if (stableString(saved) !== stableString(next)) throw Error('保存结果未能核对，请重新打开检查。');
        }
        remapBranches(character.avatar + '::' + file, removed);
        if (panel === owner && currentChar === character && currentFile === file) await selectChat(file);
      } catch (error) { notice('删除失败：' + error.message); }
      finally { writing = false; }
    }

    async function deleteArchives() {
      if (writing || jumping || !currentChar) return;
      const character = currentChar, owner = panel;
      const files = chats.filter(c => selectedFiles.has(c.file)).map(c => c.file);
      if (!files.length) return notice('请先勾选存档。');
      if (!await ask('确定永久删除以下 ' + files.length + ' 个存档？\n' + files.join('\n'))) return;
      let done = 0;
      try {
        if (writing) return;
        if (panel !== owner || currentChar !== character) throw Error('角色已切换。');
        if (isGenerating()) throw Error('请等当前生成结束。');
        writing = true;
        // 先离开即将删除的活动档，避免随后自动保存将其重新生成。
        if (files.some(file => activeArchive(character, file))) {
          const survivor = chats.find(c => !files.includes(c.file));
          const file = survivor?.file || await saveNewArchive(character, [], {});
          await context().openCharacterChat(file);
          if (!activeArchive(character, file)) throw Error('无法离开当前存档，未执行删除。');
        }
        for (const file of files) {
          if (disposed || isGenerating() || activeArchive(character, file)) throw Error('聊天状态已变化，剩余存档未删除。');
          const result = await apiPost('/api/chats/delete', { avatar_url: character.avatar, chatfile: file + '.jsonl' });
          if (!result?.ok) throw Error('服务器未确认删除「' + file + '」。');
          selectedFiles.delete(file); done++;
        }
        notice('已删除 ' + done + ' 个存档。');
      } catch (error) { notice('已删除 ' + done + ' 个；' + error.message); }
      finally {
        writing = false;
        if (panel === owner && currentChar === character) {
          if (files.includes(currentFile)) { currentFile = null; messages = []; archiveData = []; selectedFloors.clear(); }
          try { chats = await loadChats(character); sortChats(); renderChats(); renderMessages(); }
          catch (error) { notice('列表刷新失败：' + error.message); }
        }
      }
    }

    async function newArchive() {
      if (writing || jumping || !currentChar) return;
      const character = currentChar;
      if (!await ask('为「' + character.name + '」开启一个全新对话档？')) return;
      try {
        if (isGenerating()) throw Error('请等当前生成结束。');
        writing = true;
        const file = await saveNewArchive(character, [], {});
        await jump(character, file, 0);
      } catch (error) { notice('开启新档失败：' + error.message); }
      finally { writing = false; }
    }

    function persist() {
      try {
        W.localStorage.setItem(ARCHIVE_KEY, JSON.stringify(settings));
      } catch {
        notice('档案馆设置未能保存。');
      }
    }

    function close() {
      rememberReading(); readerLoadId++; W.clearTimeout(readerProgressTimer);
      requestId++;
      W.clearTimeout(searchTimer);
      DOC.removeEventListener('selectionchange', onSelectionChange);
      DOC.removeEventListener('keydown', onImmersiveKey, true);
      if (immersive) { immersive = false; hub?.classList.remove('cw-immersive'); try { if (DOC.fullscreenElement) DOC.exitFullscreen?.(); } catch {} }
      (DOC.defaultView || W).removeEventListener('message', onFrameMessage);
      panel?.remove();
      panel = null;
    }

    function sortChats() {
      chats.sort((a, b) =>
        (settings.chatSort === 'asc' ? 1 : -1) * (a.lastTime - b.lastTime)
        || a.file.localeCompare(b.file, 'zh-CN', { numeric: true })
      );
    }

    async function loadChats(character) {
      const data = await apiPost('/api/characters/chats', { avatar_url: character.avatar });
      const list = Array.isArray(data) ? data : Object.values(data || {});
      return list.filter(item => item?.file_name).map(item => ({
        file: String(item.file_name).replace(/\.jsonl$/i, ''),
        count: item.chat_items || item.mes || 0,
        lastTime: stamp(item.last_mes || item.last_message_time || item.date_last_chat)
      }));
    }

    function renderChars() {
      if (!panel) return;
      const select = panel.querySelector('#ca-char-sel');
      select.replaceChildren();
      const placeholder = node('option', '', '选择角色');
      placeholder.value = '';
      select.append(placeholder);
      const sorted = sortedChars();
      const pinned = new Set(settings.pinned);
      sorted.forEach(character => {
        const option = node('option', '', (pinned.has(character.avatar) ? '✦ ' : '') + (
          settings.charSort === 'alpha' ? initial(character) + ' · ' : ''
        ) + (character.name || character.avatar));
        option.value = String(chars.indexOf(character));
        select.append(option);
      });
      select.value = currentChar ? String(chars.indexOf(currentChar)) : '';
      panel.querySelector('#ca-char-sort').textContent =
        settings.charSort === 'alpha' ? '角色：首字母 A→Z' : '角色：最近聊天';
      panel.querySelector('#ca-chat-sort').textContent =
        settings.chatSort === 'desc' ? '存档：新→旧' : '存档：旧→新';
      paintGallery();
    }

    function sortedChars() {
      const pinned = new Set(settings.pinned);
      return chars.slice().sort((a, b) =>
        (pinned.has(b.avatar) ? 1 : 0) - (pinned.has(a.avatar) ? 1 : 0)
        || (settings.charSort === 'alpha'
          ? alphaCompare(a, b)
          : stamp(b.date_last_chat) - stamp(a.date_last_chat) || alphaCompare(a, b)));
    }

    function liveAvatar() {
      const ctx = context();
      return ctx?.groupId == null ? ctx?.characters?.[ctx.characterId]?.avatar || null : null;
    }

    function thumbUrl(avatar) {
      return '/thumbnail?type=avatar&file=' + encodeURIComponent(avatar) + (thumbStamp[avatar] ? '&t=' + thumbStamp[avatar] : '');
    }

    // 原图（清晰）；加载失败时退回缩略图，再失败显示首字母
    function cardImage(character) {
      const img = node('img');
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.draggable = false;
      let step = 0;
      img.addEventListener('error', () => {
        if (step++ === 0) { img.src = thumbUrl(character.avatar); return; }
        const holder = img.parentNode;
        img.remove();
        holder?.append(node('span', 'ca-card-initial', initial(character)));
      });
      img.src = '/characters/' + encodeURIComponent(character.avatar) + (thumbStamp[character.avatar] ? '?t=' + thumbStamp[character.avatar] : '');
      return img;
    }


    /* ── 📖 小说阅读器 ── */
    const READER_KEY = 'cyll-pear-reader-v1';
    const FONTS = [
      ['', '跟随酒馆'],
      ['"Noto Serif SC","Source Han Serif SC",serif', '思源宋体 / 衬线'],
      ['"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif', '黑体 / 无衬线'],
      ['"KaiTi","STKaiti","Kaiti SC",serif', '楷体'],
      ['"FangSong","STFangsong",serif', '仿宋'],
      ['custom', '自定义字体']
    ];
    let reader = null;          // { file, messages, page }
    let readerMarks = null;

    const READER_BG = {
      auto: ['跟随酒馆（不透明）', '', ''],
      paper: ['纸白', '#f7f4ec', '#332f29'],
      cream: ['米黄', '#efe3c8', '#3a3228'],
      green: ['护眼绿', '#d9e7d4', '#2c352b'],
      night: ['夜黑', '#14161a', '#ddd8d0']
    };

    function readerCfg() {
      const base = {
        size: 17, mode: 'scroll', line: 1.9, font: '', customFamily: '', customCss: '',
        bg: 'auto', bgImage: '', veil: 0.55, imageDark: false, hideTags: '',
        hlColor: '#ffd76e', regex: true
      };
      return Object.assign(base, object(cfg.reader));
    }

    // 屏蔽标签的实现搬到了外层 visibleText
    function stripTags(text, list) {
      let out = String(text || '');
      for (const raw of String(list || '').split(/[,，、\s]+/).filter(Boolean)) {
        const tag = raw.replace(/[^\w-]/g, '');
        if (!tag) continue;
        out = out.replace(new RegExp('<' + tag + '\\b[^>]*>[\\s\\S]*?<\\/' + tag + '\\s*>', 'gi'), '')
          .replace(new RegExp('<' + tag + '\\b[^>]*\\/?>', 'gi'), '')
          .replace(new RegExp('\\[' + tag + '\\b[^\\]]*\\][\\s\\S]*?\\[\\/' + tag + '\\]', 'gi'), '');
      }
      return out.replace(/\n{3,}/g, '\n\n').trim();
    }

    function applyReaderBg(page) {
      const settings2 = readerCfg();
      const preset = READER_BG[settings2.bg] || READER_BG.auto;
      if (settings2.bg === 'image' && settings2.bgImage) {
        const veil = Math.max(0, Math.min(1, Number(settings2.veil) || 0));
        const base = settings2.imageDark ? '20,22,26' : '255,255,255';
        page.style.backgroundImage = 'linear-gradient(rgba(' + base + ',' + veil + '),rgba(' + base + ',' + veil + ')),url("' + settings2.bgImage + '")';
        page.style.backgroundSize = 'cover';
        page.style.backgroundPosition = 'center';
        page.style.backgroundAttachment = 'local';
        page.style.backgroundColor = settings2.imageDark ? '#14161a' : '#f7f4ec';
        page.style.color = settings2.imageDark ? '#e6e2da' : '#2c2a26';
        return;
      }
      page.style.backgroundImage = 'none';
      if (preset[1]) {
        page.style.backgroundColor = preset[1];
        page.style.color = preset[2];
      } else {
        // 跟随酒馆但补一层不透明底色，避免看到后面的聊天
        const dark = isDarkTheme();
        page.style.backgroundColor = dark ? '#15171b' : '#fbfaf7';
        page.style.color = dark ? '#e6e2da' : '#26241f';
      }
    }

    function isDarkTheme() {
      const color = W.getComputedStyle(DOC.documentElement).getPropertyValue('--SmartThemeBodyColor') || '';
      const m = color.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (!m) return false;
      const lum = (Number(m[1]) * 299 + Number(m[2]) * 587 + Number(m[3]) * 114) / 1000;
      return lum > 140;
    }

    async function shrinkReaderImage(file) {
      const url = URL.createObjectURL(file);
      try {
        const img = new W.Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = () => reject(Error('图片读取失败'));
          img.src = url;
        });
        const scale = Math.min(1, 1200 / (img.naturalWidth || 1200));
        const canvas = DOC.createElement('canvas');
        canvas.width = Math.round((img.naturalWidth || 1200) * scale);
        canvas.height = Math.round((img.naturalHeight || 800) * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.82);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    function saveReaderCfg(patch) {
      cfg.reader = Object.assign(readerCfg(), patch);
      saveCfg();
    }
    function markStore() {
      if (readerMarks) return readerMarks;
      readerMarks = object(read(READER_KEY, {}));
      return readerMarks;
    }
    function markKey(avatar, file) { return avatar + '|' + file; }
    function bookmarkKey(avatar, file) { return 'bm|' + avatar + '|' + file; }
    function bookmarksOf(avatar, file) {
      const list = markStore()[bookmarkKey(avatar, file)];
      return Array.isArray(list) ? list : [];
    }
    function writeBookmarks(avatar, file, list) {
      const store = markStore();
      store[bookmarkKey(avatar, file)] = list;
      try {
        W.localStorage.setItem(READER_KEY, JSON.stringify(store));
        return true;
      } catch {
        notice('书签保存失败，浏览器存储可能已满。');
        return false;
      }
    }
    function currentFloorInView() {
      if (readerCfg().mode === 'page') return reader?.messages[reader.page]?.index ?? 0;
      const page = panel?.querySelector('.rd-page');
      if (!page) return 0;
      const top = page.getBoundingClientRect().top + 60;
      for (const el of page.querySelectorAll('.rd-floor')) {
        if (el.getBoundingClientRect().bottom >= top) return Number(el.dataset.floor);
      }
      return reader?.messages[0]?.index ?? 0;
    }
    async function addBookmark() {
      const target = currentChar;
      if (!target || !reader?.file) return;
      const floor = currentFloorInView();
      const note = await dialog('给这个书签写一句备注（可留空）：', 'prompt', '#' + floor);
      if (note === null) return;
      const list = bookmarksOf(target.avatar, reader.file).filter(b => b.floor !== floor);
      list.push({ id: 'b' + Date.now(), floor, note: note.trim(), ts: Date.now() });
      if (writeBookmarks(target.avatar, reader.file, list)) { renderReader(); notice('书签已加在 #' + floor + '。'); }
    }
    function openBookmarks() {
      const target = currentChar;
      if(!target || !reader?.file)return;
      const sheet = openSheet('书签 · ' + reader.file);
      const body = node('div', 'rd-marklist');
      function paint() {
        const list = bookmarksOf(target.avatar, reader.file).slice().sort((a, b) => a.floor - b.floor);
        body.replaceChildren();
        if (!list.length) { body.append(node('div', 'cw-empty', '还没有书签，点阅读器上的「加书签」就会记下当前位置。')); return; }
        for (const item of list) {
          const row = node('div', 'rd-mark-row');
          row.append(node('span', 'rd-mark-kind', '书签'), node('span', 'rd-idx', '#' + item.floor),
            node('span', 'rd-mark-text', item.note || '（无备注）'));
          const acts = node('div', 'rd-mark-acts');
          acts.append(button('跳转', () => { sheet.close(); gotoFloor(item.floor); }),
            button('删除', () => {
              const next = bookmarksOf(target.avatar, reader.file).filter(b => b.id !== item.id);
              if (writeBookmarks(target.avatar, reader.file, next)) { paint(); renderReader(); }
            }, 'cw-danger'));
          row.append(acts);
          body.append(row);
        }
      }
      paint();
      sheet.body.append(body);
      sheet.foot.append(button('关闭', () => sheet.close()));
    }
    function marksOf(avatar, file) {
      const list = markStore()[markKey(avatar, file)];
      return Array.isArray(list) ? list : [];
    }
    function writeMarks(avatar, file, list) {
      const store = markStore();
      store[markKey(avatar, file)] = list;
      try {
        W.localStorage.setItem(READER_KEY, JSON.stringify(store));
        return true;
      } catch {
        notice('标注保存失败，浏览器存储可能已满。');
        return false;
      }
    }

    let readerLoadId = 0, readerProgressTimer = null, restoringReader = false;
    function rememberReading() {
      W.clearTimeout(readerProgressTimer);
      if (restoringReader || view !== 'reader' || !reader?.avatar || reader.loading || reader.error || !reader.messages.length) return;
      const page = panel?.querySelector('.rd-page');
      const floor = currentFloorInView(), el = page?.querySelector('[data-floor="' + floor + '"]');
      const value = { avatar: reader.avatar, name: reader.charName, file: reader.file, floor,
        offset: el && page ? el.getBoundingClientRect().top - page.getBoundingClientRect().top : 0,
        scrollTop: page?.scrollTop || 0, mode: readerCfg().mode, time: Date.now() };
      const store = markStore(); store.lastRead = value; store['last|' + value.avatar] = value;
      try { W.localStorage.setItem(READER_KEY, JSON.stringify(store)); } catch {}
    }
    function restoreReading(position) {
      if (!position || !reader?.messages.length || reader.file !== position.file || reader.avatar !== position.avatar) return;
      restoringReader = true;
      if (position.mode) saveReaderCfg({mode:position.mode === 'page' ? 'page' : 'scroll'});
      reader.page = Math.max(0, reader.messages.findIndex(m=>m.index === position.floor));
      renderReader();
      const page = panel?.querySelector('.rd-page');
      if (page && readerCfg().mode !== 'page') {
        const el = page.querySelector('[data-floor="' + position.floor + '"]');
        page.scrollTop = el ? page.scrollTop + el.getBoundingClientRect().top - page.getBoundingClientRect().top - (Number(position.offset)||0) : (Number(position.scrollTop)||0);
      }
      restoringReader = false;
      rememberReading();
    }
    function chooseResume(position) {
      return new Promise(resolve => {
        const sheet = openSheet('继续上次阅读？'); let result = 'cancel';
        sheet.body.append(node('p','cw-note', (position.name || '这个角色') + ' · ' + position.file + ' · 第 ' + position.floor + ' 层'));
        for (const [label,value] of [['继续阅读并加书签','bookmark'],['继续阅读，不加书签','resume'],['选择其他聊天','choose']]) {
          sheet.foot.append(button(label,()=>{ result=value; sheet.close(); }));
        }
        sheet.requestClose=()=>sheet.close(); sheet.onClose(()=>resolve(result));
      });
    }
    function readerChooser() {
      view = 'reader'; reader = {file:'',messages:[],page:0,loading:false};
      applyView(); setImmersive(true); drawerOpen = true; renderReader();
    }
    async function enterReader({useLast=false}={}) {
      rememberReading();
      if (!chars.length) {
        try { const data = await apiPost('/api/characters/all',{}); if (!panel) return; chars = Array.isArray(data)?data.filter(c=>c?.avatar):[]; renderChars(); }
        catch { readerChooser(); return; }
      }
      const selected = useLast ? null : currentChar;
      const position = selected ? markStore()['last|' + selected.avatar] : markStore().lastRead;
      if (!position?.avatar || !position.file) { readerChooser(); return; }
      const target = chars.find(c=>c.avatar === position.avatar);
      if (!target) { readerChooser(); return; }
      let choice = selected ? await chooseResume(position) : 'resume';
      if (!panel || choice === 'cancel') return;
      if (choice === 'choose') { readerChooser(); return; }
      await selectChar(chars.indexOf(target));
      if (!panel || currentChar !== target) return;
      if (!chats.some(c=>c.file === position.file)) { readerChooser(); return; }
      view='reader'; applyView(); await loadReader(position.file);
      if (!reader?.messages.length || reader.error) { setImmersive(true); drawerOpen=true;renderReader();return; }
      setImmersive(true); restoreReading(position);
      if (choice === 'bookmark') {
        const list = bookmarksOf(target.avatar, position.file).filter(b=>b.floor!==position.floor);
        list.push({id:'b'+Date.now(),floor:position.floor,note:'续读位置',ts:Date.now()});
        writeBookmarks(target.avatar,position.file,list);
      }
    }
    const flushReading = () => rememberReading();
    W.addEventListener('pagehide',flushReading);
    const readerVisibility = () => { if (DOC.hidden) rememberReading(); };
    DOC.addEventListener('visibilitychange',readerVisibility);
    cleanups.push(()=>{rememberReading();W.clearTimeout(readerProgressTimer);W.removeEventListener('pagehide',flushReading);DOC.removeEventListener('visibilitychange',readerVisibility);});

    async function openReader(file) {
      if (!file || !currentChar) return enterReader();
      rememberReading(); view='reader'; applyView(); await loadReader(file);
    }

    async function loadReader(file) {
      const target = currentChar;
      const ownerPanel = panel, loadId=++readerLoadId;
      rememberReading();
      if (!target) {readerChooser();return;}
      reader = { file, avatar:target.avatar, charName:target.name, messages: [], page: 0, loading: true };
      renderReader();
      try {
        await loadReaderRegex(target);
        const data = await apiPost('/api/chats/get', { ch_name: target.name, avatar_url: target.avatar, file_name: file });
        if (panel !== ownerPanel || view !== 'reader' || loadId!==readerLoadId || currentChar!==target) return;
        if (!Array.isArray(data)) throw Error('读取失败');
        archiveData = clone(data);
        const offsetN = data[0] && !('mes' in data[0]) ? 1 : 0;
        reader = {
          file, avatar:target.avatar, charName:target.name,
          offset: offsetN,
          page: 0,
          loading: false,
          messages: data.slice(offsetN).flatMap((message, index) =>
            message && typeof message.mes === 'string'
              ? [{ index, name: String(message.name || '未知'), is_user: !!message.is_user, mes: message.mes, hidden: !!message.is_system }]
              : [])
        };
      } catch (error) {
        if(panel!==ownerPanel || loadId!==readerLoadId || currentChar!==target)return;
        reader = { file, avatar:target.avatar, charName:target.name, messages: [], page: 0, loading: false, error: error.message };
      }
      renderReader();
    }

    function readerText(message) {
      return visibleText(message.mes);
    }

    // 收集当前角色能用到的「显示用」正则（局部 + 全局），只在阅读器里渲染，不改原文
    let readerRegex = { avatar: '', list: [] };
    async function loadReaderRegex(character) {
      if (!character || readerRegex.avatar === character.avatar) return;
      try {
        const card = await apiPost('/api/characters/get', { avatar_url: character.avatar });
        readerRegex = { avatar: character.avatar, list: card?.data?.extensions?.regex_scripts || [] };
      } catch {
        readerRegex = { avatar: character.avatar, list: [] };
      }
    }

    function readerPresetChoices() {
      const choices = [];
      const ctx = context();
      for (const api of ['openai', 'textgenerationwebui', 'kobold', 'novel']) {
        try {
          const data = ctx?.getPresetManager?.(api)?.getPresetList?.();
          for (const [name, index] of Object.entries(data?.preset_names || {})) {
            let preset = data.presets?.[index];
            if (typeof preset === 'string') preset = JSON.parse(preset);
            const rules = preset?.extensions?.regex_scripts;
            if (Array.isArray(rules) && rules.length) choices.push({key:api + ':' + name, name, api, rules});
          }
        } catch {}
      }
      return choices;
    }
    function readerRuleKey(rule, index) { return String(rule.id || index + ':' + (rule.scriptName || '')); }

    function displayRegexList() {
      const out = [];
      const ctx = context();
      const push = list => {
        for (const item of Array.isArray(list) ? list : []) {
          if (!item || item.disabled || item.promptOnly || !item.findRegex) continue;
          const places = Array.isArray(item.placement) ? item.placement : [];
          if (places.length && !places.includes(1) && !places.includes(2)) continue;
          out.push(item);
        }
      };
      try { push(ctx?.extensionSettings?.regex); } catch {}
      if (readerRegex.avatar === currentChar?.avatar) push(readerRegex.list);
      const setting = readerCfg();
      const preset = readerPresetChoices().find(p => p.key === setting.regexPreset);
      if (preset) push(preset.rules.filter((r,i) => (setting.regexPresetRules || []).includes(readerRuleKey(r,i))));
      return out;
    }

    function applyDisplayRegex(text, isUser) {
      let out = String(text || '');
      for (const item of displayRegexList()) {
        const places = Array.isArray(item.placement) ? item.placement : [];
        if (places.length && !places.includes(isUser ? 1 : 2)) continue;
        const match = String(item.findRegex).match(/^\/(.*)\/([gimsuy]*)$/s);
        let pattern;
        try {
          pattern = match ? new RegExp(match[1], match[2] || 'g') : new RegExp(item.findRegex, 'g');
        } catch { continue; }
        const replacement = String(item.replaceString ?? '').replace(/\{\{match\}\}/gi, '$&');
        try { out = out.replace(pattern, replacement); } catch {}
      }
      return out;
    }

    // 在已经渲染好的节点里给文字加标注（正则渲染后也能用）
    function markTextNodes(root, mine) {
      for (const mark of mine) {
        const walker = DOC.createTreeWalker(root, 4);
        let textNode;
        while ((textNode = walker.nextNode())) {
          if (textNode.parentElement?.closest('.rd-mark')) continue;
          const at = textNode.textContent.indexOf(mark.text);
          if (at < 0) continue;
          const tail = textNode.splitText(at);
          tail.splitText(mark.text.length);
          const span = node('span', 'rd-mark rd-k-' + mark.kind, mark.text);
          span.dataset.markId = mark.id;
          tail.parentNode.replaceChild(span, tail);
          break;
        }
      }
    }

    // 正则渲染后的 HTML：```html 代码块、整页 <html> 用独立小窗显示（脚本、按钮、折叠都能用）
    function htmlFrame(code) {
      const id = 'rdf' + Math.random().toString(36).slice(2, 10);
      const frame = node('iframe', 'rd-frame');
      frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-forms allow-modals');
      frame.dataset.rdFrame = id;
      frame.style.height = '48px';
      // flow-root contains collapsed child margins; measure content, not the iframe viewport.
      const reporter = '<style>html{min-height:0!important;height:auto!important}body{display:flow-root;min-height:0!important;height:auto!important}</style><script>(' + function(id) {
        let queued = false, last = 0;
        function measure() {
          queued = false;
          const body = document.body;
          if (!body) return;
          const rect = body.getBoundingClientRect(), css = getComputedStyle(body);
          let bottom = rect.bottom + (parseFloat(css.marginBottom) || 0);
          // Descendant overflow can extend beyond body; skip intentionally clipped/scrolled children.
          for (const el of body.querySelectorAll('*')) {
            if (/^(SCRIPT|STYLE|LINK|META)$/.test(el.tagName) || !el.getClientRects().length) continue;
            if (getComputedStyle(el).position === 'fixed') continue;
            let clipped = false;
            for (let p = el.parentElement; p && p !== body; p = p.parentElement) {
              if ((p.tagName === 'DETAILS' && !p.open && !p.querySelector(':scope > summary')?.contains(el)) || /(hidden|clip|auto|scroll)/.test(getComputedStyle(p).overflowY)) { clipped = true; break; }
            }
            if (!clipped) bottom = Math.max(bottom, el.getBoundingClientRect().bottom);
          }
          const h = Math.max(40, Math.ceil(bottom + window.scrollY + 8));
          if (h !== last) { last = h; parent.postMessage({rdFrame:id,h}, '*'); }
        }
        function schedule() { if (!queued) { queued = true; requestAnimationFrame(measure); } }
        function ready() {
          new ResizeObserver(schedule).observe(document.body);
          new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true,attributes:true,characterData:true});
          document.fonts?.ready.then(schedule);
          schedule();
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',ready,{once:true}); else ready();
        for (const name of ['load','resize','animationend','transitionend']) addEventListener(name,schedule,true);
        document.addEventListener('toggle',schedule,true);
      }.toString() + ')(' + JSON.stringify(id) + ')<\/script>';
      frame.srcdoc = /<\/body>/i.test(code) ? code.replace(/<\/body>/i, reporter + '</body>') : code + reporter;
      return frame;
    }

    function renderRich(box, html) {
      if (/<!doctype|<html[\s>]/i.test(html) && !/```/.test(html)) {
        box.append(htmlFrame(html));
        return;
      }
      const fence = /```([a-zA-Z]*)[ \t]*\n?([\s\S]*?)```/g;
      let last = 0, match;
      const pushHtml = chunk => {
        if (!chunk || !chunk.trim()) return;
        const holder = node('div', 'rd-html');
        holder.innerHTML = paragraphize(chunk);
        box.append(holder);
      };
      while ((match = fence.exec(html))) {
        pushHtml(html.slice(last, match.index));
        const lang = match[1].toLowerCase(), code = match[2];
        if (lang === 'html' || /<(!doctype|html|body|div|style|script|details|button|svg)\b/i.test(code)) box.append(htmlFrame(code));
        else box.append(node('pre', 'rd-code', code));
        last = fence.lastIndex;
      }
      pushHtml(html.slice(last));
    }

    // 按行分自然段：行内标签留在同一段里，块级标签和样式、脚本整块不动
    function paragraphize(html) {
      const keep = [];
      let work = String(html).replace(/<(style|script|pre|textarea|svg)\b[\s\S]*?<\/\1\s*>/gi, m => {
        keep.push(m);
        return '\u0000' + (keep.length - 1) + '\u0000';
      });
      const BLOCK = /^<\/?(div|p|details|summary|section|article|table|thead|tbody|tr|td|th|ul|ol|li|h[1-6]|blockquote|hr|br|figure|header|footer|nav|aside|center|iframe)\b/i;
      work = work.split('\n').map(line => {
        const t = line.replace(/^[\s\u3000]+/, '');
        if (!t) return '';
        if (BLOCK.test(t) || /^\u0000\d+\u0000$/.test(t)) return t;
        return '<p class="rd-p">' + t + '</p>';
      }).join('\n');
      return work.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[Number(i)]);
    }

    function onFrameMessage(event) {
      const data = event?.data;
      if (!data || typeof data.rdFrame !== 'string') return;
      const frame = DOC.querySelector('iframe[data-rd-frame="' + data.rdFrame + '"]');
      if (frame && event.source === frame.contentWindow && Number.isFinite(data.h) && data.h > 0) frame.style.height = Math.max(40, data.h) + 'px';
    }

    // 把渲染后正文里的换行变成一段一段（跳过样式、代码等块）
    function splitParagraphs(root) {
      const skip = el => el && el.closest && el.closest('style,script,pre,code,textarea,svg,details summary');
      const walker = DOC.createTreeWalker(root, 4);
      const nodes = [];
      let textNode;
      while ((textNode = walker.nextNode())) {
        if (!/\S/.test(textNode.textContent) || !textNode.textContent.includes('\n')) continue;
        if (skip(textNode.parentElement)) continue;
        nodes.push(textNode);
      }
      for (const item of nodes) {
        const parts = item.textContent.split(/\n+/).map(part => part.replace(/^[\s\u3000]+/, '')).filter(Boolean);
        const frag = DOC.createDocumentFragment();
        for (const part of parts) frag.append(node('span', 'rd-line', part));
        item.parentNode.replaceChild(frag, item);
      }
    }

    function paintFloorText(box, message, marks) {
      const text = readerText(message);
      const mine = marks.filter(m => m.floor === message.index && m.text && m.kind !== 'floor');
      box.replaceChildren();
      if (readerCfg().regex) {
        box.classList.add('is-rendered');
        renderRich(box, applyDisplayRegex(text, message.is_user));
      } else {
        box.classList.remove('is-rendered');
        for (const part of text.split(/\n+/)) {
          const clean = part.replace(/^[\s\u3000]+/, '');
          if (clean) box.append(node('p', 'rd-p', clean));
        }
      }
      markTextNodes(box, mine);
    }

    // 标注：忽略空白与换行来定位，可跨段落；同一段文字可以叠加多种标注（下划线 + 荧光 + 加粗）
    const MARK_ORDER = { mark: 0, bold: 1, underline: 2, fav: 3 };
    function squash(value) { return String(value || '').replace(/[\s\u3000]+/g, ''); }
    function textMap(root) {
      const walker = DOC.createTreeWalker(root, 4, {
        acceptNode: n => n.parentElement?.closest('script,style,iframe,textarea,.rd-code') ? 2 : 1
      });
      let str = '';
      const map = [];
      let t;
      while ((t = walker.nextNode())) {
        const v = t.textContent;
        for (let i = 0; i < v.length; i++) {
          const c = v[i];
          if (c === ' ' || c === '\n' || c === '\t' || c === '\r' || c === '\u3000' || c === '\u00a0') continue;
          str += c;
          map.push([t, i]);
        }
      }
      return { str, map };
    }
    function findNth(str, needle, nth) {
      let at = -1, first = -1;
      for (let n = 0; ; n++) {
        at = str.indexOf(needle, at + 1);
        if (at < 0) break;
        if (first < 0) first = at;
        if (n === nth) return at;
      }
      return first;
    }
    function markTextNodes(root, mine) {
      const list = mine.slice().sort((a, b) => (MARK_ORDER[a.kind] ?? 9) - (MARK_ORDER[b.kind] ?? 9));
      for (const mark of list) {
        const needle = squash(mark.text);
        if (!needle) continue;
        const { str, map } = textMap(root);
        const at = findNth(str, needle, Number.isInteger(mark.at) ? mark.at : 0);
        if (at < 0) continue;
        const [sNode, sOff] = map[at];
        const [eNode, eLast] = map[at + needle.length - 1];
        const nodes = [];
        const walker = DOC.createTreeWalker(root, 4);
        walker.currentNode = sNode;
        let t = sNode;
        while (t) {
          nodes.push(t);
          if (t === eNode) break;
          t = walker.nextNode();
        }
        for (const n of nodes) {
          const from = n === sNode ? sOff : 0;
          const to = n === eNode ? eLast + 1 : n.textContent.length;
          if (to <= from || !n.textContent.slice(from, to).trim()) continue;
          if (n.parentElement?.closest('script,style,iframe,textarea,.rd-code')) continue;
          let target = n;
          if (from > 0) target = target.splitText(from);
          if (to - from < target.textContent.length) target.splitText(to - from);
          const span = node('span', 'rd-mark rd-k-' + mark.kind);
          span.dataset.markId = mark.id;
          target.parentNode.insertBefore(span, target);
          span.append(target);
        }
      }
    }

    // 选区在本层文字里是第几次出现（重复句子也能标对位置）
    function occurrenceOf(textBox, range, text) {
      try {
        const pre = DOC.createRange();
        pre.setStart(textBox, 0);
        pre.setEnd(range.startContainer, range.startOffset);
        const before = squash(pre.toString()).length;
        const { str } = textMap(textBox);
        const needle = squash(text);
        let n = 0, at = -1, best = 0;
        while ((at = str.indexOf(needle, at + 1)) >= 0) {
          if (at <= before) best = n;
          n++;
        }
        return best;
      } catch { return 0; }
    }

    // 局部刷新一层：只重画这一层的文字和星标，不重建整个阅读器，阅读位置不动
    function repaintFloors(floors) {
      const target = currentChar;
      const page = panel?.querySelector('#ca-reader .rd-page');
      if (!page || !target || !reader) { renderReader(); return; }
      const top = page.scrollTop;
      const marks = marksOf(target.avatar, reader.file);
      for (const index of new Set(floors)) {
        const el = page.querySelector('.rd-floor[data-floor="' + index + '"]');
        const message = reader.messages.find(m => m.index === index);
        if (!el || !message) continue;
        const textBox = el.querySelector('.rd-text');
        if (textBox) paintFloorText(textBox, message, marks);
        const star = el.querySelector('.rd-star');
        if (star) {
          const fav = marks.some(m => m.kind === 'floor' && m.floor === index);
          star.textContent = fav ? '★' : '☆';
          star.title = fav ? '取消收藏这一层' : '收藏这一层';
        }
      }
      const count = panel.querySelector('#ca-reader .rd-marks-btn');
      if (count) count.textContent = '收藏与标注 · ' + marks.length;
      page.scrollTop = top;
      W.requestAnimationFrame(() => { if (page.isConnected && Math.abs(page.scrollTop - top) > 2) page.scrollTop = top; });
    }

    function renderReader() {
      const box = panel?.querySelector('#ca-reader');
      if (!box) return;
      box.replaceChildren();
      const target = currentChar;
      const settings2 = readerCfg();
      const marks = target ? marksOf(target.avatar, reader?.file || '') : [];

      const bar = node('div', 'cw-toolbar rd-bar');
      const chatSelect = node('select', 'rd-chat');
      for (const chat of chats) {
        const option = node('option', '', chat.file + ' · ' + (chat.count || '?') + ' 条');
        option.value = chat.file;
        chatSelect.append(option);
      }
      chatSelect.value = reader?.file || '';
      chatSelect.addEventListener('change', () => loadReader(chatSelect.value));
      const jump = input('跳到楼层 #', '');
      jump.style.maxWidth = '110px';
      jump.addEventListener('keydown', event => {
        if (event.key !== 'Enter' || event.isComposing) return;
        event.preventDefault();
        gotoFloor(Number(jump.value));
      });
      const modeBtn = button(settings2.mode === 'page' ? '翻页模式' : '上下滚动', () => {
        saveReaderCfg({ mode: settings2.mode === 'page' ? 'scroll' : 'page' });
        renderReader();
      });
      bar.append(button('← 返回存档', () => { if (immersive) setImmersive(false); view = 'archive'; applyView(); }), chatSelect, jump,
        button('跳转', () => gotoFloor(Number(jump.value))), modeBtn,
        button('沉浸阅读', () => setImmersive(true), 'cw-primary'),
        button('样式', () => openReaderStyle()),
        button('加书签', addBookmark),
        button('书签 · ' + (target ? bookmarksOf(target.avatar, reader?.file || '').length : 0), openBookmarks),
        button('收藏与标注 · ' + marks.length, () => openMarkList(), 'rd-marks-btn'));
      box.append(bar);

      const page = node('div', 'rd-page');
      page.style.setProperty('--rd-size', settings2.size + 'px');
      page.style.setProperty('--rd-line', String(settings2.line));
      page.style.setProperty('--rd-hl', settings2.hlColor || '#ffd76e');
      const family = settings2.font === 'custom' ? (settings2.customFamily || 'inherit') : settings2.font;
      if (family) page.style.setProperty('--rd-font', family);
      applyReaderBg(page);
      box.append(page);

      if (immersive) renderDrawer(box, page, settings2);
      if (!reader?.file) {page.append(node('div','cw-empty','从侧边栏选择角色和聊天，开始阅读。'));return;}
      if (reader?.loading) { page.append(node('div', 'cw-empty', '正在读取…')); return; }
      if (reader?.error) { page.append(node('div', 'cw-empty', '读取失败：' + reader.error)); return; }
      if (!reader?.messages.length) { page.append(node('div', 'cw-empty', '这个存档是空的')); return; }

      const list = settings2.mode === 'page'
        ? [reader.messages[Math.max(0, Math.min(reader.page, reader.messages.length - 1))]]
        : reader.messages;

      for (const message of list) {
        const floor = node('article', 'rd-floor' + (message.is_user ? ' is-user' : '') + (message.hidden ? ' is-hidden' : ''));
        floor.dataset.floor = String(message.index);
        const head = node('div', 'rd-floor-head');
        const favFloor = marks.some(m => m.kind === 'floor' && m.floor === message.index);
        const star = button(favFloor ? '★' : '☆', () => toggleFloorFav(message.index), 'rd-star');
        star.title = favFloor ? '取消收藏这一层' : '收藏这一层';
        head.append(node('span', 'rd-idx', '#' + message.index), node('span', 'rd-name', message.name),
          star, button('编辑', () => editFloor(message), 'ca-sec-btn'));
        const text = node('div', 'rd-text');
        paintFloorText(text, message, marks);
        floor.append(head, text);
        page.append(floor);
      }



      if (settings2.mode === 'page') {
        const nav = node('div', 'rd-nav');
        const at = Math.max(0, Math.min(reader.page, reader.messages.length - 1));
        if (immersive) {
          page.addEventListener('click', event => {
            if (event.target.closest('button,a,summary,iframe,input,textarea,select,.rd-mark')) return;
            if (String(DOC.getSelection()?.toString() || '').trim()) return;
            const rect = page.getBoundingClientRect();
            const x = event.clientX - rect.left;
            if (x < rect.width * 0.28) { event.stopImmediatePropagation(); reader.page = Math.max(0, at - 1); renderReader(); }
            else if (x > rect.width * 0.72) { event.stopImmediatePropagation(); reader.page = Math.min(reader.messages.length - 1, at + 1); renderReader(); }
          }, true);
        }
        nav.append(button('‹ 上一层', () => { reader.page = Math.max(0, at - 1); renderReader(); }),
          node('span', 'rd-progress', '#' + reader.messages[at].index + ' / ' + (reader.messages.length - 1)),
          button('下一层 ›', () => { reader.page = Math.min(reader.messages.length - 1, at + 1); renderReader(); }));
        box.append(nav);
      }
      page.addEventListener('scroll',()=>{W.clearTimeout(readerProgressTimer);readerProgressTimer=W.setTimeout(rememberReading,250);},{passive:true});
      if(!restoringReader) W.setTimeout(()=>{if(page.isConnected) rememberReading();},0);
      bindSelection(page);
    }

    let immersive = false;
    let drawerOpen = false;

    // 打开某个角色最近的存档来读（图库和抽屉都用它）
    async function readCharacter(character) {
      const index = chars.indexOf(character);
      if (index < 0 || !panel) return;
      pageAvatar = null;
      pageCard = null;
      panel.querySelector('#ca-char-sel').value = String(index);
      await selectChar(index);
      await enterReader();
    }

    function renderDrawer(box, page, settings2) {
      const target = currentChar;
      const handle = button('☰', () => { drawerOpen = !drawerOpen; box.classList.toggle('rd-drawer-on', drawerOpen); }, 'rd-handle');
      handle.title = '目录 / 退出';
      handle.setAttribute('aria-label', '打开阅读目录');
      const shade = node('div', 'rd-shade');
      shade.addEventListener('click', () => { drawerOpen = false; box.classList.remove('rd-drawer-on'); });
      const drawer = node('aside', 'rd-drawer');

      const head = node('div', 'rd-drawer-head');
      head.append(node('div', 'ca-sec-title', '阅读目录'),
        button('退出沉浸', () => setImmersive(false), 'cw-primary'));

      // 像读书软件一样的封面：点开就是角色资料页
      const cover = node('div', 'rd-cover');
      if(target){
      const coverPic = node('button', 'rd-cover-pic');
      coverPic.type = 'button';
      coverPic.title = '查看「' + (target.name || target.avatar) + '」的资料';
      coverPic.append(cardImage(target));
      const openProfile = () => {
        setImmersive(false);
        view = 'gallery';
        applyView();
        void openCharPage(target);
      };
      coverPic.addEventListener('click', openProfile);
      const coverInfo = node('div', 'rd-cover-info');
      coverInfo.append(node('div', 'rd-cover-name', target.name || target.avatar),
        node('div', 'rd-cover-meta', chats.length + ' 个存档 · 正在读 ' + reader.file),
        button('角色资料', openProfile));
      cover.append(coverPic, coverInfo);
      }else cover.append(node('div','rd-cover-name','选择一本聊天来读'));

      // 换角色：小图库
      const shelf = node('div', 'rd-shelf');
      const shelfFilter = input('找角色…', '');
      const paintShelf = () => {
        shelf.replaceChildren();
        const q = shelfFilter.value.trim().toLowerCase();
        for (const character of sortedChars()) {
          if (q && !String(character.name || character.avatar).toLowerCase().includes(q)) continue;
          const item = node('button', 'rd-shelf-item' + (character === target ? ' is-on' : ''));
          item.type = 'button';
          item.title = character.name || character.avatar;
          item.append(cardImage(character), node('span', 'rd-shelf-name', character.name || character.avatar));
          item.addEventListener('click', async () => {
            if (character === target) return;
            drawerOpen = true;
            await readCharacter(character);
          });
          shelf.append(item);
        }
        if (!shelf.children.length) shelf.append(node('div', 'cw-empty', '没有匹配的角色'));
      };
      shelfFilter.addEventListener('input', paintShelf);
      paintShelf();

      // 存档
      const files = node('div', 'rd-drawer-list');
      for (const chat of chats) {
        const item = button(chat.file + (chat.count ? ' · ' + chat.count + ' 条' : ''), async () => {
          drawerOpen = true;
          await loadReader(chat.file);
        }, 'rd-drawer-item' + (chat.file === reader?.file ? ' is-on' : ''));
        files.append(item);
      }

      // 楼层
      const floors = node('div', 'rd-drawer-list');
      const floorFilter = input('筛选楼层 / 内容…', '');
      const paintFloors = () => {
        floors.replaceChildren();
        const q = floorFilter.value.trim().toLowerCase();
        for (const message of reader?.messages || []) {
          const text = visibleText(message.mes);
          if (q && !('#' + message.index + message.name + text).toLowerCase().includes(q)) continue;
          const item = button('', () => {
            drawerOpen = false;
            box.classList.remove('rd-drawer-on');
            gotoFloor(message.index);
          }, 'rd-drawer-item rd-drawer-floor');
          item.append(node('span', 'rd-idx', '#' + message.index), node('span', 'rd-drawer-name', message.name),
            node('span', 'rd-drawer-pv', preview(text, 26)));
          floors.append(item);
        }
        if (!floors.children.length) floors.append(node('div', 'cw-empty', '没有匹配的楼层'));
      };
      floorFilter.addEventListener('input', paintFloors);
      paintFloors();

      const tools = node('div', 'rd-drawer-tools');
      tools.append(button('加书签', addBookmark), button('书签', openBookmarks), button('样式', () => openReaderStyle()),
        button('返回存档', () => { setImmersive(false); view = 'archive'; applyView(); }));

      const section = (title, ...children) => {
        const sec = node('div', 'rd-drawer-sec');
        sec.append(node('div', 'rd-drawer-label', title), ...children);
        return sec;
      };
      drawer.append(head, cover, tools,
        section('换个角色', shelfFilter, shelf),
        section('存档 · ' + chats.length, files),
        section('楼层 · ' + (reader?.messages?.length || 0), floorFilter, floors));
      drawer.style.backgroundColor = page.style.backgroundColor || (isDarkTheme() ? '#15171b' : '#fbfaf7');
      drawer.style.color = page.style.color || '';
      handle.style.backgroundColor = drawer.style.backgroundColor;
      box.append(shade, drawer, handle);
      box.classList.toggle('rd-drawer-on', drawerOpen);

      // 从左边缘往右滑打开，往左滑关上
      let startX = null, startY = 0;
      box.addEventListener('touchstart', event => {
        const t = event.touches[0];
        const left = box.getBoundingClientRect().left;
        startX = (drawerOpen || t.clientX - left < 28) ? t.clientX : null;
        startY = t.clientY;
      }, { passive: true });
      box.addEventListener('touchend', event => {
        if (startX === null) return;
        const t = event.changedTouches[0];
        const dx = t.clientX - startX, dy = Math.abs(t.clientY - startY);
        if (dy < 60 && dx > 50 && !drawerOpen) { drawerOpen = true; box.classList.add('rd-drawer-on'); }
        else if (dy < 60 && dx < -50 && drawerOpen) { drawerOpen = false; box.classList.remove('rd-drawer-on'); }
        startX = null;
      }, { passive: true });
      // 正文中间轻点也能呼出
      page.addEventListener('click', event => {
        if (event.target.closest('button,a,summary,iframe,input,textarea,select,.rd-mark')) return;
        if (String(DOC.getSelection()?.toString() || '').trim()) return;
        if (settings2.mode === 'page') {
          const rect = page.getBoundingClientRect();
          const x = event.clientX - rect.left;
          if (x < rect.width * 0.28 || x > rect.width * 0.72) return;
        }
        drawerOpen = !drawerOpen;
        box.classList.toggle('rd-drawer-on', drawerOpen);
      });
    }

    function setImmersive(on) {
      rememberReading();
      immersive = !!on;
      hub?.classList.toggle('cw-immersive', immersive);
      drawerOpen = false;
      try { if (!immersive && DOC.fullscreenElement) DOC.exitFullscreen?.().catch(() => {}); } catch {}
      renderReader();
    }

    function onImmersiveKey(event) {
      if (!immersive || event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setImmersive(false);
    }

    function gotoFloor(index) {
      if (!reader || !Number.isFinite(index)) return;
      const at = reader.messages.findIndex(m => m.index === index);
      if (at < 0) { notice('没有第 ' + index + ' 层。'); return; }
      if (readerCfg().mode === 'page') {
        reader.page = at;
        renderReader();
        return;
      }
      const el = panel?.querySelector('.rd-floor[data-floor="' + index + '"]');
      if (el) {
        el.scrollIntoView({ block: 'start' });
        W.setTimeout(rememberReading,50);
        el.classList.add('is-hit');
        W.setTimeout(() => el.classList.remove('is-hit'), 1200);
      }
    }

    let selectionTimer = 0;
    function onSelectionChange() {
      if (view !== 'reader' || !panel) return;
      W.clearTimeout(selectionTimer);
      selectionTimer = W.setTimeout(showSelectionBar, 260);
    }
    function bindSelection(page) {
      page.addEventListener('click', event => {
        const span = event.target.closest?.('.rd-mark[data-mark-id]');
        if (String(DOC.getSelection()?.toString() || '').trim()) return;
        if (!span) { panel?.querySelector('#ca-reader .rd-selbar[data-tap]')?.remove(); return; }
        showMarkBar(span);
      });
      page.addEventListener('mouseup', () => W.setTimeout(showSelectionBar, 10));
      page.addEventListener('touchend', () => W.setTimeout(showSelectionBar, 120));
    }

    const MARK_LABEL = { underline: '下划线', bold: '加粗', mark: '荧光', fav: '收藏' };
    function marksUnder(floorEl, range, fallbackIds = []) {
      const ids = new Set(fallbackIds);
      if (range) {
        for (const span of floorEl.querySelectorAll('.rd-mark[data-mark-id]')) {
          try { if (range.intersectsNode(span)) ids.add(span.dataset.markId); } catch {}
        }
      }
      return ids;
    }

    function showSelectionBar() {
      const box = panel?.querySelector('#ca-reader');
      const old = box?.querySelector('.rd-selbar');
      const dropOld = () => { if (old && !old.dataset.tap) old.remove(); };
      const selection = DOC.getSelection();
      const text = String(selection?.toString() || '').trim();
      if (!text || text.length > 400) { dropOld(); return; }
      const anchor = selection.anchorNode?.parentElement?.closest?.('.rd-floor');
      if (!anchor || !box?.contains(anchor)) { dropOld(); return; }
      old?.remove();
      const floor = Number(anchor.dataset.floor);
      const range = selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
      const textBox = anchor.querySelector('.rd-text');
      const at = range && textBox ? occurrenceOf(textBox, range, text) : 0;
      const bar = node('div', 'rd-selbar');
      const add = (label, kind) => button(label, () => {
        addMark({ kind, text, floor, at });
        selection.removeAllRanges();
        bar.remove();
      });
      const copyBtn = button('复制', async () => {
        if (await copyText(text)) {
          copyBtn.textContent = '已复制';
          W.setTimeout(() => { copyBtn.textContent = '复制'; }, 1200);
        }
      });
      const be = null; // 无书摘版
      const beCall = fn => () => {
        if (!be) { notice('书摘还没启动好，稍等一下再试。'); return; }
        const target = currentChar;
        be.setContext({
          charName: target?.name || '', charKey: target?.avatar || 'unknown', chatId: reader?.file || '',
          charAvatar: target?.avatar ? '/thumbnail?type=avatar&file=' + encodeURIComponent(target.avatar) : ''
        });
        fn();
        selection.removeAllRanges();
        bar.remove();
      };
      bar.append(copyBtn, add('下划线', 'underline'), add('加粗', 'bold'), add('荧光笔', 'mark'), add('收藏', 'fav'));
      appendRemoveButtons(bar, floor, marksUnder(anchor, range), () => selection.removeAllRanges());
      if (be) {
        bar.append(node('span', 'rd-selbar-sep'),
          button('书摘划线', beCall(() => { be.highlight(text, { msgId: floor, chatId: reader.file }); addMark({ kind: 'underline', text, floor, at }); })),
          button('想法', beCall(() => be.thought(text, { msgId: floor, chatId: reader.file }))),
          button('做书摘卡片', beCall(() => be.excerpt(text)), 'cw-primary'));
      }
      bar.append(button('取消', () => { selection.removeAllRanges(); bar.remove(); }));
      box.append(bar);
    }

    // 已有标注：按种类给出「取消下划线 / 取消荧光 …」，也能一次清掉
    function appendRemoveButtons(bar, floor, ids, after) {
      const target = currentChar;
      if (!target || !reader || !ids.size) return;
      const hit = marksOf(target.avatar, reader.file).filter(m => ids.has(m.id));
      if (!hit.length) return;
      const kinds = [...new Set(hit.map(m => m.kind))];
      bar.append(node('span', 'rd-selbar-sep'));
      for (const kind of kinds) {
        bar.append(button('取消' + (MARK_LABEL[kind] || kind), () => {
          removeMarks(hit.filter(m => m.kind === kind).map(m => m.id));
          after?.();
          bar.remove();
        }, 'rd-unmark'));
      }
      if (kinds.length > 1) {
        bar.append(button('清除全部标注', () => { removeMarks(hit.map(m => m.id)); after?.(); bar.remove(); }, 'cw-danger'));
      }
    }

    // 轻点已经标注的文字：弹出取消条
    function showMarkBar(span) {
      const box = panel?.querySelector('#ca-reader');
      const floorEl = span.closest('.rd-floor');
      if (!box || !floorEl) return;
      box.querySelector('.rd-selbar')?.remove();
      const ids = [];
      for (let el = span; el && el !== floorEl; el = el.parentElement) {
        if (el.classList?.contains('rd-mark') && el.dataset.markId) ids.push(el.dataset.markId);
      }
      for (const inner of span.querySelectorAll('.rd-mark[data-mark-id]')) ids.push(inner.dataset.markId);
      const bar = node('div', 'rd-selbar');
      bar.dataset.tap = '1';
      bar.append(node('span', 'rd-selbar-tip', '这段已标注'));
      appendRemoveButtons(bar, Number(floorEl.dataset.floor), new Set(ids));
      bar.append(button('关闭', () => bar.remove()));
      box.append(bar);
    }

    function addMark(mark) {
      const target = currentChar;
      if (!target || !reader) return;
      const list = marksOf(target.avatar, reader.file).slice();
      // 同一段同一种标注不重复叠加
      if (list.some(m => m.kind === mark.kind && m.floor === mark.floor && squash(m.text) === squash(mark.text) && (m.at ?? 0) === (mark.at ?? 0))) return;
      list.push({ id: 'm' + Date.now() + Math.random().toString(36).slice(2, 5), ts: Date.now(), ...mark });
      if (writeMarks(target.avatar, reader.file, list)) repaintFloors([mark.floor]);
    }

    function removeMarks(ids) {
      const target = currentChar;
      if (!target || !reader || !ids.length) return;
      const drop = new Set(ids);
      const list = marksOf(target.avatar, reader.file);
      const floors = list.filter(m => drop.has(m.id)).map(m => m.floor);
      if (writeMarks(target.avatar, reader.file, list.filter(m => !drop.has(m.id)))) repaintFloors(floors);
    }

    function toggleFloorFav(floor) {
      const target = currentChar;
      const list = marksOf(target.avatar, reader.file);
      const has = list.find(m => m.kind === 'floor' && m.floor === floor);
      const next = has ? list.filter(m => m !== has) : list.concat([{ id: 'm' + Date.now(), ts: Date.now(), kind: 'floor', floor, text: '' }]);
      if (writeMarks(target.avatar, reader.file, next)) repaintFloors([floor]);
    }

    function openMarkList() {
      const target = currentChar;
      if(!target || !reader?.file)return;
      const sheet = openSheet('收藏与标注 · ' + reader.file);
      const body = node('div', 'rd-marklist');
      function paint() {
        const list = marksOf(target.avatar, reader.file).slice().sort((a, b) => a.floor - b.floor);
        body.replaceChildren();
        if (!list.length) { body.append(node('div', 'cw-empty', '还没有收藏或标注。在正文里选中文字就能标。')); return; }
        for (const mark of list) {
          const row = node('div', 'rd-mark-row');
          const label = { floor: '楼层收藏', fav: '句子收藏', underline: '下划线', bold: '加粗', mark: '荧光笔' }[mark.kind] || mark.kind;
          row.append(node('span', 'rd-mark-kind', label), node('span', 'rd-idx', '#' + mark.floor),
            node('span', 'rd-mark-text', mark.text || '（整层）'));
          const acts = node('div', 'rd-mark-acts');
          acts.append(button('跳转', () => { sheet.close(); gotoFloor(mark.floor); }));
          acts.append(button('删除', () => {
            const next = marksOf(target.avatar, reader.file).filter(m => m.id !== mark.id);
            if (writeMarks(target.avatar, reader.file, next)) { paint(); repaintFloors([mark.floor]); }
          }, 'cw-danger'));
          row.append(acts);
          body.append(row);
        }
      }
      paint();
      sheet.body.append(body);
      sheet.foot.append(button('关闭', () => sheet.close()));
    }

    function openReaderStyle() {
      const settings2 = readerCfg();
      const sheet = openSheet('阅读器样式');
      const grid = node('div', 'api-form');
      const size = node('input');
      size.type = 'range';
      size.min = '12';
      size.max = '30';
      size.value = String(settings2.size);
      const sizeValue = node('span', 'st-num-value', settings2.size + 'px');
      const sizeRow = node('div', 'api-key-row');
      sizeRow.append(size, sizeValue);
      const line = node('input');
      line.type = 'range';
      line.min = '1.4';
      line.max = '2.6';
      line.step = '0.05';
      line.value = String(settings2.line);
      const lineValue = node('span', 'st-num-value', String(settings2.line));
      const lineRow = node('div', 'api-key-row');
      lineRow.append(line, lineValue);
      const font = node('select');
      for (const [value, label] of FONTS) {
        const option = node('option', '', label);
        option.value = value;
        font.append(option);
      }
      font.value = settings2.font;
      const family = input('字体名称，如 "LXGW WenKai"', settings2.customFamily);
      const cssLink = input('字体 CSS 链接 https://…', settings2.customCss);
      const bg = node('select');
      for (const [value, item] of Object.entries(READER_BG)) {
        const option = node('option', '', item[0]);
        option.value = value;
        bg.append(option);
      }
      const imageOption = node('option', '', '自定义图片');
      imageOption.value = 'image';
      bg.append(imageOption);
      bg.value = settings2.bg;
      const veil = node('input');
      veil.type = 'range';
      veil.min = '0';
      veil.max = '0.95';
      veil.step = '0.05';
      veil.value = String(settings2.veil);
      const veilValue = node('span', 'st-num-value', String(settings2.veil));
      veil.addEventListener('input', () => { veilValue.textContent = veil.value; });
      const veilRow = node('div', 'api-key-row');
      let pendingImage = settings2.bgImage;
      const darkText = heartSwitch(settings2.imageDark, '图片上用浅色文字');
      veilRow.append(veil, veilValue, button('上传图片', async () => {
        const files = await pickFiles('image/*');
        if (!files.length) return;
        try {
          pendingImage = await shrinkReaderImage(files[0]);
          bg.value = 'image';
          notice('图片已选好，点「保存」生效。');
        } catch (error) {
          notice('图片处理失败：' + error.message);
        }
      }), darkText);
      const hide = input('例如 image, thinking', settings2.hideTags);
      const hl = node('input');
      hl.type = 'color';
      hl.value = /^#[0-9a-f]{6}$/i.test(settings2.hlColor) ? settings2.hlColor : '#ffd76e';
      const hlRow = node('div', 'api-key-row');
      hlRow.append(hl, node('span', 'cw-note', '荧光笔的颜色'));
      const regexSwitch = heartSwitch(settings2.regex, '按正则渲染美化');
      const regexRow = node('div', 'api-key-row');
      regexRow.append(regexSwitch, node('span', 'cw-note', '用全局 / 角色 / 所选预设正则渲染正文（只影响阅读器显示）'));
      const presetSelect = node('select');
      const presetRules = node('div', 'rd-preset-rules');
      const choices = readerPresetChoices();
      const none = node('option', '', '不使用预设正则'); none.value = ''; presetSelect.append(none);
      for (const preset of choices) {
        const option = node('option', '', preset.name + ' · ' + preset.api);
        option.value = preset.key; presetSelect.append(option);
      }
      presetSelect.value = settings2.regexPreset || '';
      const selections = new Map();
      if (settings2.regexPreset) selections.set(settings2.regexPreset, new Set(settings2.regexPresetRules || []));
      function paintPresetRules() {
        presetRules.replaceChildren();
        const preset = choices.find(p => p.key === presetSelect.value);
        if (!preset) {
          presetRules.append(node('p', 'cw-note', choices.length ? '选择预设后，可勾选需要的正则。' : '当前未找到带正则的预设，请先在酒馆导入预设。'));
          return;
        }
        if (!selections.has(preset.key)) selections.set(preset.key, new Set(preset.rules.flatMap((r,i) => r.disabled || r.promptOnly ? [] : [readerRuleKey(r,i)])));
        const selected = selections.get(preset.key);
        const actions = node('div', 'api-key-row');
        actions.append(button('全选', () => { preset.rules.forEach((r,i) => { if (!r.disabled && !r.promptOnly) selected.add(readerRuleKey(r,i)); }); paintPresetRules(); }), button('取消全选', () => { selected.clear(); paintPresetRules(); }));
        presetRules.append(actions);
        preset.rules.forEach((rule,i) => {
          const detail = node('details');
          const summary = node('summary');
          const check = node('input'); check.type = 'checkbox'; check.style.accentColor = 'currentColor';
          check.checked = selected.has(readerRuleKey(rule,i)); check.disabled = !!(rule.disabled || rule.promptOnly);
          check.addEventListener('click', e => e.stopPropagation());
          check.addEventListener('change', () => { if (check.checked) selected.add(readerRuleKey(rule,i)); else selected.delete(readerRuleKey(rule,i)); });
          summary.append(check, DOC.createTextNode(' ' + (rule.scriptName || '未命名正则') + (check.disabled ? '（已禁用或仅提示词）' : '')));
          const preview = node('pre', 'rd-code', '查找：' + rule.findRegex + '\n替换：' + (rule.replaceString || ''));
          preview.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto';
          detail.append(summary, preview); presetRules.append(detail);
        });
      }
      presetSelect.addEventListener('change', paintPresetRules); paintPresetRules();
      grid.append(node('label', 'api-label', '字号'), sizeRow,
        node('label', 'api-label', '行距'), lineRow,
        node('label', 'api-label', '字体'), font,
        node('label', 'api-label', '自定义字体名'), family,
        node('label', 'api-label', '字体 CSS 链接'), cssLink,
        node('label', 'api-label', '阅读背景'), bg,
        node('label', 'api-label', '图片遮罩 / 深色文字'), veilRow,
        node('label', 'api-label', '屏蔽标签'), hide,
        node('label', 'api-label', '荧光笔颜色'), hlRow,
        node('label', 'api-label', '正则渲染'), regexRow,
        node('label', 'api-label', '预设正则'), presetSelect, node('label', 'api-label', '选择正则'), presetRules);
      size.addEventListener('input', () => { sizeValue.textContent = size.value + 'px'; });
      line.addEventListener('input', () => { lineValue.textContent = line.value; });
      sheet.body.append(grid,
        node('p', 'cw-note', '自定义字体：填一个字体 CSS 链接（比如字体站提供的 @font-face 样式），再把字体名填在上面一栏，然后把「字体」选成「自定义字体」。'),
        node('p', 'cw-note', '屏蔽标签：填标签名，多个用逗号隔开。填 image 就会把 <image>…</image> 整段藏起来，原文不会被改动。'));
      sheet.foot.append(button('取消', () => sheet.close()),
        button('保存', () => {
          saveReaderCfg({
            size: Number(size.value), line: Number(line.value), font: font.value,
            customFamily: family.value.trim(), customCss: cssLink.value.trim(),
            bg: bg.value, bgImage: pendingImage, veil: Number(veil.value), imageDark: darkText.checked,
            hideTags: hide.value.trim(), hlColor: hl.value, regex: regexSwitch.checked,
            regexPreset: presetSelect.value, regexPresetRules: [...(selections.get(presetSelect.value) || [])]
          });
          applyReaderFont();
          sheet.close();
          renderReader();
        }, 'cw-primary'));
    }

    function applyReaderFont() {
      const url = readerCfg().customCss;
      let link = DOC.getElementById('cw-reader-font');
      if (!url) { link?.remove(); return; }
      if (!link) {
        link = node('link');
        link.id = 'cw-reader-font';
        link.rel = 'stylesheet';
        DOC.head.append(link);
      }
      if (link.href !== url) link.href = url;
    }

    async function editFloor(message) {
      if (writing || !reader) return;
      const target = currentChar;
      const next = await editText('#' + message.index + ' · ' + message.name, message.mes);
      if (next === null || next === message.mes) return;
      writing = true;
      try {
        const live = liveAvatar() === target.avatar
          && String(context()?.getCurrentChatId?.() || context()?.chatId || '').replace(/\.jsonl$/i, '') === reader.file;
        let done = false;
        if (live) {
          const ctx = context();
          const first = ctx.chat.length - reader.messages.length;
          const item = first >= 0 ? ctx.chat[first + message.index] : null;
          // 只有内容对得上才直接改内存里的聊天，避免改错层
          if (item && item.mes === message.mes) {
            item.mes = next;
            await ctx.saveChat?.();
            await ctx.reloadCurrentChat?.();
            done = true;
          }
        }
        if (!done) {
          const at = reader.offset + message.index;
          if (!archiveData[at]) throw Error('存档内容已变化，请重新打开');
          archiveData[at] = { ...archiveData[at], mes: next };
          await apiPostRaw('/api/chats/save', {
            ch_name: target.name, avatar_url: target.avatar, file_name: reader.file, chat: archiveData
          });
        }
        message.mes = next;
        renderReader();
        notice('已保存这一层。');
      } catch (error) {
        notice('保存失败：' + error.message);
      } finally {
        writing = false;
      }
    }

    /* ── 角色详情页 ── */
    const FIELD_TOP = {
      description: 'description', personality: 'personality', scenario: 'scenario',
      first_mes: 'first_mes', mes_example: 'mes_example', creator_notes: 'creatorcomment'
    };

    function cardValue(card, key) {
      const value = card?.data?.[key] ?? card?.[FIELD_TOP[key] || key];
      return typeof value === 'string' ? value : '';
    }

    async function openLastChat(character) {
      if (jumping || writing) return;
      try {
        const list = await apiPost('/api/characters/chats', { avatar_url: character.avatar });
        if (!Array.isArray(list) || !list.length) { notice('「' + (character.name || character.avatar) + '」还没有聊天存档。'); return; }
        const latest = list.slice().sort((a, b) => stamp(b.last_mes) - stamp(a.last_mes))[0];
        const file = String(latest.file_name || '').replace(/\.jsonl$/i, '');
        if (!file) throw Error('存档名称无效');
        await jump(character, file, null);
      } catch (error) {
        notice('打开失败：' + error.message);
      }
    }

    async function openCharPage(character) {
      pageAvatar = character.avatar;
      pageCard = null;
      pageError = '';
      renderGallery();
      await loadPageCard();
    }

    async function loadPageCard() {
      const avatar = pageAvatar;
      const id = ++pageRequest;
      try {
        const full = await apiPost('/api/characters/get', { avatar_url: avatar });
        if (id !== pageRequest || pageAvatar !== avatar) return;
        if (!full || typeof full !== 'object') throw Error('角色数据格式错误');
        pageCard = full;
        pageError = '';
      } catch (error) {
        if (id !== pageRequest || pageAvatar !== avatar) return;
        pageError = error.message;
      }
      if (view === 'gallery') renderGallery();
    }

    function leavePage() {
      pageAvatar = null;
      pageCard = null;
      pageError = '';
      pageRequest++;
      renderGallery();
    }

    function scriptStore(card) {
      const ext = card?.data?.extensions || {};
      const th = ext.tavern_helper;
      if (th && !Array.isArray(th) && Array.isArray(th.scripts)) return { key: 'tavern_helper', value: th, list: th.scripts };
      if (Array.isArray(th)) {
        const pair = th.find(p => Array.isArray(p) && p[0] === 'scripts' && Array.isArray(p[1]));
        if (pair) return { key: 'tavern_helper', value: th, list: pair[1] };
      }
      if (Array.isArray(ext.TavernHelper_scripts)) return { key: 'TavernHelper_scripts', value: ext.TavernHelper_scripts, list: ext.TavernHelper_scripts };
      return null;
    }

    function flattenScripts(list) {
      const out = [];
      const walk = items => {
        for (const item of items || []) {
          if (item && item.type === 'folder' && Array.isArray(item.scripts)) walk(item.scripts);
          else if (item && typeof item === 'object' && 'content' in item) out.push(item);
        }
      };
      walk(list);
      return out;
    }

    async function writeCard(payload) {
      charTok.delete(pageAvatar);
      if (readerRegex.avatar === pageAvatar) readerRegex = { avatar: '', list: [] };
      await apiPostRaw('/api/characters/merge-attributes', { avatar: pageAvatar, ...payload });
      try { await context()?.getCharacters?.(); } catch {}
      await loadPageCard();
    }

    function liveNote() {
      return pageAvatar === liveAvatar() ? '\n这是正在聊天的角色，重新打开一次聊天后生效。' : '';
    }

    async function editCharField(label, key, index = null) {
      if (!pageCard || writing) return;
      const name = cardValue(pageCard, 'name') || pageCard.name || pageAvatar;
      const greetings = Array.isArray(pageCard.data?.alternate_greetings) ? pageCard.data.alternate_greetings : [];
      const current = index === null ? cardValue(pageCard, key) : String(greetings[index] ?? '');
      const next = await editText(name + ' · ' + label, current);
      if (next === null || next === current || !pageCard) return;
      writing = true;
      try {
        const payload = { data: {} };
        if (index === null) {
          payload.data[key] = next;
          if (FIELD_TOP[key]) payload[FIELD_TOP[key]] = next;
        } else {
          const list = clone(greetings);
          list[index] = next;
          payload.data.alternate_greetings = list;
        }
        await writeCard(payload);
        notice('「' + label + '」已保存。' + liveNote());
      } catch (error) {
        notice('保存失败：' + error.message);
      } finally {
        writing = false;
      }
    }

    function uuid() {
      try { return W.crypto.randomUUID(); } catch { return 'id-' + Date.now() + '-' + Math.floor(Math.random() * 1e6); }
    }

    // 酒馆的合并接口不会缩短数组：写入后核对，必要时把多出来的位置填成停用的空条目
    async function writeArrayField(list, write, read, tomb, label) {
      await write(list);
      const after = read(pageCard) || [];
      if (after.length <= list.length) return;
      await write(list.concat(Array.from({ length: after.length - list.length }, tomb)));
      notice('酒馆的写入接口不能缩短列表，多出来的位置已经改成停用的空' + label + '。');
    }

    async function editRegex() {
      if (!pageCard || writing) return;
      const list = clone(pageCard.data?.extensions?.regex_scripts || []);
      const name = pageCard.name || pageAvatar;
      const ok = await editList({
        title: name + ' · 局部正则',
        entries: list,
        empty: '这个角色还没有局部正则，点上面的「＋ 新增」来添加。',
        nameOf: r => r.scriptName || '未命名正则',
        isOn: r => !r.disabled,
        setOn: (r, on) => { r.disabled = !on; },
        fields: [['scriptName', '名称', 1], ['findRegex', '查找（正则表达式）', 3], ['replaceString', '替换为', 8]],
        onAdd: async () => {
          const title = await dialog('新正则的名称：', 'prompt', '新正则');
          if (title === null) return null;
          return {
            id: uuid(), scriptName: title.trim() || '新正则', findRegex: '', replaceString: '',
            trimStrings: [], placement: [1, 2], disabled: false, markdownOnly: true, promptOnly: false,
            runOnEdit: false, substituteRegex: 0, minDepth: null, maxDepth: null
          };
        },
        onRemove: item => {
          const at = list.indexOf(item);
          if (at >= 0) list.splice(at, 1);
        }
      });
      if (!ok) return;
      writing = true;
      try {
        await writeArrayField(list,
          arr => writeCard({ data: { extensions: { regex_scripts: arr } } }),
          card => card?.data?.extensions?.regex_scripts || [],
          () => ({ id: uuid(), scriptName: '（已删除）', findRegex: '', replaceString: '', trimStrings: [], placement: [1], disabled: true }), '正则');
        notice('局部正则已保存。' + liveNote());
      } catch (error) {
        notice('保存失败：' + error.message);
      } finally {
        writing = false;
      }
    }

    function removeScript(list, item) {
      for (const container of [list]) {
        const at = container.indexOf(item);
        if (at >= 0) { container.splice(at, 1); return true; }
      }
      for (const node0 of list) {
        if (node0 && node0.type === 'folder' && Array.isArray(node0.scripts) && removeScript(node0.scripts, item)) return true;
      }
      return false;
    }

    async function editScripts() {
      if (!pageCard || writing) return;
      const copy = clone(pageCard);
      let store = scriptStore(copy);
      if (!store) {
        copy.data = copy.data || {};
        copy.data.extensions = copy.data.extensions || {};
        copy.data.extensions.tavern_helper = { scripts: [] };
        store = scriptStore(copy);
      }
      const entries = flattenScripts(store.list);
      const name = pageCard.name || pageAvatar;
      const ok = await editList({
        title: name + ' · 角色脚本',
        entries,
        empty: '这个角色还没有脚本，点上面的「＋ 新增」来添加。',
        nameOf: item => item.name || '未命名脚本',
        isOn: item => item.enabled !== false,
        setOn: (item, on) => { item.enabled = on; },
        fields: [['name', '名称', 1], ['content', '脚本内容', 16], ['info', '作者备注', 4]],
        onAdd: async () => {
          const title = await dialog('新脚本的名称：', 'prompt', '新脚本');
          if (title === null) return null;
          const item = { type: 'script', id: uuid(), name: title.trim() || '新脚本', content: '', info: '', enabled: false, button: { enabled: false, buttons: [] }, data: {} };
          store.list.push(item);
          return item;
        },
        onRemove: item => { removeScript(store.list, item); }
      });
      if (!ok) return;
      writing = true;
      try {
        await writeArrayField(store.list.slice(),
          arr => {
            store.list.length = 0;
            store.list.push(...arr);
            return writeCard({ data: { extensions: { [store.key]: store.value } } });
          },
          card => scriptStore(card)?.list || [],
          () => ({ type: 'script', id: uuid(), name: '（已删除）', content: '', info: '', enabled: false }), '脚本');
        notice('角色脚本已保存。' + liveNote() + '\n酒馆助手的脚本库里如果还显示旧内容，刷新一下网页就好。');
      } catch (error) {
        notice('保存失败：' + error.message);
      } finally {
        writing = false;
      }
    }

    async function updateCard(character) {
      if (writing || jumping) return;
      const ownerPanel = panel;
      const files = await pickFiles('.png,.json,.charx,image/png,application/json');
      if (!files.length || disposed || panel !== ownerPanel) return;
      const name = character.name || character.avatar;
      if (!await ask('用「' + files[0].name + '」更新「' + name + '」？\n设定和卡面都会换成新文件里的内容；聊天存档保留。\n\n只想换图片的话请用「换卡面」。')) return;
      writing = true;
      try {
        const ext = (files[0].name.match(/\.([a-z0-9]+)$/i)?.[1] || 'png').toLowerCase();
        const result = await apiUpload('/api/characters/import', { avatar: files[0], file_type: ext, preserved_name: character.avatar });
        if (result && typeof result === 'object' && result.error) throw Error('酒馆拒绝了这个文件');
        thumbStamp[character.avatar] = Date.now();
        charTok.delete(character.avatar);
        try { await context()?.getCharacters?.(); } catch {}
        await loadCharList();
        if (pageAvatar === character.avatar) await loadPageCard();
        notice('「' + name + '」已更新。' + (character.avatar === liveAvatar() ? '\n这是正在聊天的角色，重新打开一次聊天后生效。' : ''));
      } catch (error) {
        notice('更新失败：' + error.message);
      } finally {
        writing = false;
      }
    }

    async function deleteOne(character) {
      if (writing || jumping) return;
      const name = character.name || character.avatar;
      if (character.avatar === liveAvatar()) { notice('「' + name + '」正在聊天中，请先切到别的聊天再删除。'); return; }
      const mode = await choose('删除「' + name + '」？删除后无法恢复。', [
        ['card', '只删角色卡', '聊天存档留在服务器里'],
        ['all', '角色卡和聊天存档一起删', '这个角色的全部存档也会删除']
      ], '🗑 删除角色');
      if (!mode || disposed) return;
      writing = true;
      try {
        await apiPostRaw('/api/characters/delete', { avatar_url: character.avatar, delete_chats: mode === 'all' });
        settings.pinned = settings.pinned.filter(avatar => avatar !== character.avatar);
        persist();
        try { await context()?.getCharacters?.(); } catch {}
        pageAvatar = null; pageCard = null;
        await loadCharList();
        if (!currentChar) await selectChar(-1);
        notice('已删除「' + name + '」。');
      } catch (error) {
        notice('删除失败：' + error.message);
      } finally {
        writing = false;
      }
      if (view === 'gallery') renderGallery();
    }

    async function linkWorld() {
      if (!pageCard || writing) return;
      let names = [];
      try { names = (await helperFn('getWorldbookNames')?.()) || []; } catch {}
      if (!names.length) { notice('没有读到世界书列表，请确认酒馆助手已启用。'); return; }
      const picked = await choose('给「' + (pageCard.name || pageAvatar) + '」链接哪一本世界书？',
        names.map(name => [name, name]), '♢ 链接世界书');
      if (!picked) return;
      writing = true;
      try {
        await writeCard({ data: { extensions: { world: picked } } });
        charTok.delete(pageAvatar);
        notice('已链接世界书「' + picked + '」。' + liveNote());
      } catch (error) {
        notice('链接失败：' + error.message);
      } finally {
        writing = false;
      }
    }

    async function unlinkWorld(world) {
      if (!pageCard || writing) return;
      if (!await ask('解除与世界书「' + world + '」的链接？\n世界书本身不会被删除。')) return;
      writing = true;
      try {
        await writeCard({ data: { extensions: { world: '' } } });
        charTok.delete(pageAvatar);
        notice('已解除链接。' + liveNote());
      } catch (error) {
        notice('解除失败：' + error.message);
      } finally {
        writing = false;
      }
    }

    // ── 开场白：新增 / 删除 / 上下移动 ──
    async function saveGreetings(list) {
      writing = true;
      try {
        const wanted = list;
        await writeCard({ data: { alternate_greetings: wanted } });
        const after = Array.isArray(pageCard?.data?.alternate_greetings) ? pageCard.data.alternate_greetings : [];
        if (after.length > wanted.length) {
          await writeCard({ data: { alternate_greetings: wanted.concat(Array.from({ length: after.length - wanted.length }, () => '')) } });
          notice('酒馆的写入接口不能缩短列表，多出来的位置已经留成空白开场白，可以在酒馆里再清理一次。');
        }
        charTok.delete(pageAvatar);
      } catch (error) {
        notice('保存失败：' + error.message);
      } finally {
        writing = false;
      }
    }

    function greetingList() {
      return Array.isArray(pageCard?.data?.alternate_greetings) ? clone(pageCard.data.alternate_greetings) : [];
    }

    async function addGreeting() {
      if (!pageCard || writing) return;
      const text = await editText((pageCard.name || pageAvatar) + ' · 新的备选开场白', '');
      if (text === null) return;
      const list = greetingList();
      list.push(text);
      await saveGreetings(list);
    }

    async function removeGreeting(index) {
      if (!pageCard || writing) return;
      if (!await ask('删除备选开场白 ' + (index + 1) + '？')) return;
      const list = greetingList();
      list.splice(index, 1);
      await saveGreetings(list);
    }

    async function moveGreeting(index, step) {
      if (!pageCard || writing) return;
      const list = greetingList();
      const target = index + step;
      if (target < 0 || target >= list.length) return;
      [list[index], list[target]] = [list[target], list[index]];
      await saveGreetings(list);
    }

    function textSection(title, text, onEdit, extra = null) {
      const sec = node('section', 'ca-sec');
      const head = node('div', 'ca-sec-head');
      head.append(node('div', 'ca-sec-title', title));
      if (extra) head.append(extra);
      const body = node('div', 'ca-sec-text', text || '');
      if (!text) { body.textContent = '（空）'; body.classList.add('is-empty'); }
      const more = button('展开', () => {
        const on = body.classList.toggle('is-open');
        more.textContent = on ? '收起' : '展开';
      }, 'ca-sec-btn');
      more.hidden = true;
      head.append(more);
      if (onEdit) head.append(button('编辑', onEdit, 'ca-sec-btn'));
      sec.append(head, body);
      W.requestAnimationFrame(() => { if (body.scrollHeight > body.clientHeight + 4) more.hidden = false; });
      return sec;
    }

    function renderCharPage(box) {
      const character = chars.find(c => c.avatar === pageAvatar);
      if (!character) { pageAvatar = null; renderGallery(); return; }
      const card = pageCard;
      const name = character.name || character.avatar;
      const live = character.avatar === liveAvatar();

      const bar = node('div', 'cw-toolbar ca-page-bar');
      bar.append(button('← 返回图库', leavePage), node('span', 'ca-page-crumb', '角色图库 / ' + name));
      const page = node('div', 'ca-char-page');
      box.append(bar, page);

      // 卡面 + 基本信息 + 操作
      const hero = node('div', 'ca-hero');
      const pic = node('div', 'ca-hero-pic');
      pic.append(cardImage(character));
      const info = node('div', 'ca-hero-info');
      const title = node('div', 'ca-hero-name', name);
      const tags = node('div', 'ca-chips');
      if (settings.pinned.includes(character.avatar)) tags.append(node('span', 'ca-tag', '✦ 置顶'));
      if (live) tags.append(node('span', 'ca-tag', '聊天中'));
      for (const tag of (Array.isArray(card?.tags) ? card.tags : card?.data?.tags || []).slice(0, 12)) tags.append(node('span', 'ca-tag is-soft', String(tag)));
      const meta = [];
      if (card?.data?.creator) meta.push('作者 ' + card.data.creator);
      if (card?.data?.character_version) meta.push('版本 ' + card.data.character_version);
      if (stamp(character.date_last_chat) > 946684800000) meta.push('最近聊天 ' + new Date(stamp(character.date_last_chat)).toLocaleDateString('zh-CN'));
      const regexCount = card?.data?.extensions?.regex_scripts?.length || 0;
      const store = card ? scriptStore(card) : null;
      const scriptCount = store ? flattenScripts(store.list).length : 0;

      const acts = node('div', 'ca-hero-acts');
      const pinned = settings.pinned.includes(character.avatar);
      acts.append(
        button('打开聊天档案馆', () => { pageAvatar = null; void openFromGallery(character); }, 'cw-primary'),
        button('继续上次聊天', () => openLastChat(character), 'cw-primary'),
        button('正则 · ' + regexCount, editRegex),
        button('脚本 · ' + scriptCount, editScripts),
        button(pinned ? '取消置顶' : '置顶', () => { togglePin(character); }),
        button('改名', async () => { await renameChar(character); if (pageAvatar === character.avatar) await loadPageCard(); }),
        button('换卡面', () => changeAvatar(character)),
        button('更新角色卡', () => updateCard(character)),
        button('删除角色', () => deleteOne(character), 'cw-danger')
      );
      if (!card) for (const b of acts.querySelectorAll('button')) if (/^(正则|脚本)/.test(b.textContent)) b.disabled = true;
      info.append(title, tags);
      if (meta.length) info.append(node('div', 'ca-hero-meta', meta.join(' · ')));
      info.append(acts);
      hero.append(pic, info);
      page.append(hero);

      if (!card) {
        page.append(node('div', 'cw-empty', pageError ? '读取角色失败：' + pageError : '正在读取角色资料…'));
        return;
      }

      page.append(textSection('简介', cardValue(card, 'creator_notes'), () => editCharField('简介', 'creator_notes')));

      // 链接的世界书
      const world = card.data?.extensions?.world;
      const bookCount = Array.isArray(card.data?.character_book?.entries) ? card.data.character_book.entries.length : 0;
      const wsec = node('section', 'ca-sec');
      const whead = node('div', 'ca-sec-head');
      whead.append(node('div', 'ca-sec-title', '链接世界书'));
      wsec.append(whead);
      const wbody = node('div', 'ca-world');
      if (world) {
        const rowEl = node('div', 'ca-world-row');
        rowEl.append(node('span', 'ca-world-name', '♢ ' + world),
          button('在世界书页打开', () => gotoWorldbook(world), 'ca-sec-btn'),
          button('解除链接', () => unlinkWorld(world), 'ca-sec-btn'));
        wbody.append(rowEl);
      } else {
        whead.append(button('链接世界书', linkWorld, 'ca-sec-btn'));
      }
      if (bookCount) wbody.append(node('div', 'ca-sec-note', '角色卡内嵌世界书 · ' + bookCount + ' 条（导入角色时酒馆会询问是否导入）'));
      if (!world && !bookCount) wbody.append(node('div', 'ca-sec-text is-empty', '没有链接世界书'));
      wsec.append(wbody);
      page.append(wsec);

      page.append(textSection('开场白', cardValue(card, 'first_mes'), () => editCharField('开场白', 'first_mes'),
        button('＋ 新增备选', addGreeting, 'ca-sec-btn')));
      const greetings = Array.isArray(card.data?.alternate_greetings) ? card.data.alternate_greetings : [];
      greetings.forEach((text, index) => {
        const tools = node('div', 'ca-sec-tools');
        const up = button('▲', () => moveGreeting(index, -1), 'ca-sec-btn');
        up.title = '上移';
        up.disabled = index === 0;
        const down = button('▼', () => moveGreeting(index, 1), 'ca-sec-btn');
        down.title = '下移';
        down.disabled = index === greetings.length - 1;
        const remove = button('删除', () => removeGreeting(index), 'ca-sec-btn cw-danger');
        tools.append(up, down, remove);
        page.append(textSection('备选开场白 ' + (index + 1), String(text ?? ''),
          () => editCharField('备选开场白 ' + (index + 1), 'alternate_greetings', index), tools));
      });
    }

    /* ── 角色图库 ── */
    function applyView() {
      if (!panel) return;
      const gallery = panel.querySelector('#ca-gallery');
      const body = panel.querySelector('.ca-body');
      const toggle = panel.querySelector('#ca-gallery-toggle');
      body.hidden = view !== 'archive';
      panel.classList.toggle('ca-view-gallery', view !== 'archive');
      const readerBox = panel.querySelector('#ca-reader');
      if (readerBox) readerBox.hidden = view !== 'reader';
      gallery.hidden = view !== 'gallery';
      if (view === 'reader') applyReaderFont();
      else if (immersive) { immersive = false; hub?.classList.remove('cw-immersive'); try { if (DOC.fullscreenElement) DOC.exitFullscreen?.(); } catch {} }
      if (toggle) {
        toggle.textContent = view === 'gallery' ? '返回存档' : '角色图库';
        toggle.setAttribute('aria-pressed', String(view === 'gallery'));
      }
      if (view === 'gallery') renderGallery();
    }

    function renderGallery() {
      const box = panel?.querySelector('#ca-gallery');
      if (!box) return;
      box.replaceChildren();
      if (pageAvatar && !charBulk.on) { renderCharPage(box); return; }
      const head = node('div', 'cw-toolbar ca-gallery-head');
      if (!charBulk.on) {
        const count = node('span', 'ca-gallery-count', '');
        count.id = 'ca-gallery-count';
        const search = input('搜索角色名…');
        search.value = galleryQuery;
        search.addEventListener('input', () => { galleryQuery = search.value; paintGallery(); });
        head.append(count, search,
          button('导入角色', importChars),
          button('批量删除角色', () => {
            if (writing) return;
            charBulk.on = true;
            charBulk.selected.clear();
            renderGallery();
          }));
      } else {
        const status = node('span', 'ca-gallery-count', '');
        status.id = 'ca-gallery-count';
        head.append(status,
          button('全选当前结果', () => { visibleChars().forEach(c => charBulk.selected.add(c.avatar)); paintGallery(); }),
          button('取消全选', () => { charBulk.selected.clear(); paintGallery(); }),
          button('删除选中', deleteChars, 'cw-danger'),
          button('退出', () => { charBulk.on = false; charBulk.selected.clear(); renderGallery(); }));
      }
      const grid = node('div', 'ca-grid');
      grid.id = 'ca-grid';
      box.append(head, grid);
      paintGallery();
    }

    function visibleChars() {
      const q = galleryQuery.trim().toLowerCase();
      return sortedChars().filter(c => !q || String(c.name || c.avatar).toLowerCase().includes(q));
    }

    function paintGallery() {
      if (!panel || view !== 'gallery') return;
      if (pageAvatar && !charBulk.on) { renderGallery(); return; }
      const grid = panel.querySelector('#ca-grid');
      const count = panel.querySelector('#ca-gallery-count');
      if (!grid) return;
      const list = visibleChars();
      for (const avatar of [...charBulk.selected]) if (!chars.some(c => c.avatar === avatar)) charBulk.selected.delete(avatar);
      if (count) {
        count.textContent = charBulk.on
          ? '批量删除 · 已选 ' + charBulk.selected.size + ' 个'
          : '全部角色 · ' + chars.length + ' 个' + (settings.pinned.length ? ' · 置顶 ' + chars.filter(c => settings.pinned.includes(c.avatar)).length : '');
      }
      grid.replaceChildren();
      if (!list.length) {
        grid.append(node('div', 'cw-empty', chars.length ? '没有匹配的角色' : '加载角色…'));
        return;
      }
      const live = liveAvatar();
      for (const character of list) grid.append(charCard(character, live));
    }

    function charCard(character, live) {
      const pinned = settings.pinned.includes(character.avatar);
      const picked = charBulk.selected.has(character.avatar);
      const card = node('div', 'ca-card'
        + (pinned ? ' is-pinned' : '')
        + (character === currentChar ? ' is-current' : '')
        + (charBulk.on && picked ? ' is-picked' : ''));
      const name = character.name || character.avatar;

      const pic = node('button', 'ca-card-pic');
      pic.type = 'button';
      pic.title = charBulk.on ? '选择「' + name + '」' : '查看「' + name + '」';
      pic.append(cardImage(character));

      const badges = node('div', 'ca-card-badges');
      if (pinned) badges.append(node('span', 'ca-tag', '✦ 置顶'));
      if (character.avatar === live) badges.append(node('span', 'ca-tag', '聊天中'));

      let pick = null;
      if (charBulk.on) {
        pick = heartSwitch(picked, '选择删除「' + name + '」');
        pick.classList.add('ca-card-pick');
        pick.addEventListener('change', () => {
          pick.checked ? charBulk.selected.add(character.avatar) : charBulk.selected.delete(character.avatar);
          card.classList.toggle('is-picked', pick.checked);
          const count = panel?.querySelector('#ca-gallery-count');
          if (count) count.textContent = '批量删除 · 已选 ' + charBulk.selected.size + ' 个';
        });
      }
      pic.addEventListener('click', () => {
        if (charBulk.on) { pick?.click(); return; }
        void openCharPage(character);
      });

      const pin = button(pinned ? '★' : '☆', () => togglePin(character), 'ca-pin');
      pin.title = pinned ? '取消置顶' : '置顶';
      pin.setAttribute('aria-label', pin.title);
      pin.setAttribute('aria-pressed', String(pinned));

      const foot = node('div', 'ca-card-foot');
      const nameRow = node('div', 'ca-card-namerow');
      nameRow.append(node('div', 'ca-card-name', name));
      if (!charBulk.on) nameRow.append(button('阅读', () => readCharacter(character), 'ca-card-read'));
      foot.append(nameRow);

      card.append(pic, badges, charBulk.on ? pick : pin, foot);
      return card;
    }

    async function openFromGallery(character) {
      if (!panel) return;
      pageAvatar = null;
      pageCard = null;
      view = 'archive';
      applyView();
      const index = chars.indexOf(character);
      if (index < 0) return;
      panel.querySelector('#ca-char-sel').value = String(index);
      await selectChar(index);
      renderChars();
    }

    function togglePin(character) {
      const list = settings.pinned.filter(item => item !== character.avatar);
      if (list.length === settings.pinned.length) list.unshift(character.avatar);
      settings.pinned = list;
      persist();
      renderChars();
    }

    async function loadCharList() {
      const data = await apiPost('/api/characters/all', {});
      if (!Array.isArray(data)) throw Error('角色列表格式错误。');
      const keep = currentChar?.avatar;
      chars = data.filter(c => c?.avatar);
      currentChar = keep ? chars.find(c => c.avatar === keep) || null : null;
      renderChars();
    }

    async function changeAvatar(character) {
      if (writing || jumping) return;
      const ownerPanel = panel;
      const files = await pickFiles('image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif');
      if (!files.length || disposed || panel !== ownerPanel) return;
      const name = character.name || character.avatar;
      if (!await ask('用「' + files[0].name + '」替换「' + name + '」的卡面？\n只换图片，角色设定和聊天存档都不变。')) return;
      writing = true;
      try {
        await apiUpload('/api/characters/edit-avatar', { avatar: files[0], avatar_url: character.avatar });
        thumbStamp[character.avatar] = Date.now();
        try { await context()?.getCharacters?.(); } catch {}
        if (view === 'gallery') renderGallery();
        notice('「' + name + '」的卡面已更换。\n酒馆角色列表里如果还是旧图，刷新一下网页就好。');
      } catch (error) {
        notice('换卡面失败：' + error.message);
      } finally {
        writing = false;
      }
    }

    async function importChars() {
      if (writing || jumping) return;
      const ownerPanel = panel;
      const files = await pickFiles('.png,.json,.charx,.yaml,.yml,.byaf,image/png,application/json', true);
      if (!files.length || disposed || panel !== ownerPanel) return;
      const done = [], failed = [];
      writing = true;
      try {
        for (const file of files) {
          try {
            const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || 'png').toLowerCase();
            const result = await apiUpload('/api/characters/import', { avatar: file, file_type: ext, preserved_name: file.name });
            if (result && typeof result === 'object' && result.error) throw Error('酒馆拒绝了这个文件');
            done.push(file.name);
          } catch (error) {
            failed.push(file.name + '：' + error.message);
          }
        }
        try { await context()?.getCharacters?.(); } catch {}
        if (panel === ownerPanel) await loadCharList();
      } catch (error) {
        failed.push('刷新角色列表：' + error.message);
      } finally {
        writing = false;
      }
      notice((done.length ? '已导入 ' + done.length + ' 个角色：\n' + done.map(n => '· ' + n).join('\n') : '没有导入成功的角色。') +
        (failed.length ? '\n\n失败：\n' + failed.join('\n') : ''));
    }

    async function deleteChars() {
      if (writing || jumping) return;
      const live = liveAvatar();
      let list = chars.filter(c => charBulk.selected.has(c.avatar));
      const skipped = list.find(c => c.avatar === live);
      list = list.filter(c => c.avatar !== live);
      if (!list.length) {
        notice(skipped ? '选中的只有正在聊天的角色，它不能在这里删除，请先切到别的聊天。' : '请先点爱心选择要删除的角色。');
        return;
      }
      const preview = list.slice(0, 12).map(c => '· ' + (c.name || c.avatar)).join('\n') + (list.length > 12 ? '\n……共 ' + list.length + ' 个' : '');
      const mode = await choose('删除这 ' + list.length + ' 个角色？删除后无法恢复。' +
        (skipped ? '\n（正在聊天的「' + (skipped.name || skipped.avatar) + '」会被跳过）' : '') + '\n\n' + preview, [
        ['card', '只删角色卡', '聊天存档留在服务器里'],
        ['all', '角色卡和聊天存档一起删', '这些角色的全部存档也会删除']
      ], '🗑 批量删除角色');
      if (!mode || disposed) return;
      const ownerPanel = panel;
      const failed = [];
      writing = true;
      try {
        for (const character of list) {
          try {
            await apiPostRaw('/api/characters/delete', { avatar_url: character.avatar, delete_chats: mode === 'all' });
          } catch (error) {
            failed.push((character.name || character.avatar) + '：' + error.message);
          }
        }
        const gone = new Set(list.map(c => c.avatar));
        settings.pinned = settings.pinned.filter(avatar => !gone.has(avatar));
        persist();
        charBulk.selected.clear();
        charBulk.on = false;
        try { await context()?.getCharacters?.(); } catch {}
        if (panel === ownerPanel) await loadCharList();
      } catch (error) {
        failed.push('刷新角色列表：' + error.message);
      } finally {
        writing = false;
      }
      if (panel === ownerPanel) {
        if (!currentChar) await selectChar(-1);
        renderGallery();
      }
      const ok = list.length - failed.length;
      notice((ok ? '已删除 ' + ok + ' 个角色。' : '没有删除任何角色。') +
        (skipped ? '\n正在聊天的「' + (skipped.name || skipped.avatar) + '」已跳过。' : '') +
        (failed.length ? '\n\n失败：\n' + failed.join('\n') : ''));
    }

    async function renameChar(target = currentChar) {
      const ownerPanel = panel;
      if (!target) { notice('请先在左边的下拉框里选择角色。'); return; }
      if (writing || jumping) return;
      const oldName = target.name || '';
      const value = await dialog('新的角色名字：\n只改角色卡里的名字；存档、聊天记录和群聊都不受影响。', 'prompt', oldName);
      if (value === null || disposed) return;
      const name = value.trim();
      if (!name) { notice('名字不能为空。'); return; }
      if (name === oldName) return;
      writing = true;
      try {
        const ctx = context();
        const headers = typeof ctx?.getRequestHeaders === 'function'
          ? ctx.getRequestHeaders()
          : { 'Content-Type': 'application/json' };
        const response = await W.fetch('/api/characters/merge-attributes', {
          method: 'POST',
          headers,
          body: JSON.stringify({ avatar: target.avatar, name, data: { name } })
        });
        if (!response.ok) throw Error('HTTP ' + response.status + '（可能是旧版 V1 角色卡，请在酒馆里编辑一次后再试）');
        target.name = name;
        try { await ctx?.getCharacters?.(); } catch {}
        if (panel === ownerPanel) renderChars();
        const live = ctx?.characters?.[ctx.characterId];
        notice('已改名为「' + name + '」。' + (live?.avatar === target.avatar
          ? '\n这是正在聊天的角色，重新打开一次聊天后界面会显示新名字；旧楼层里记录的发言名不会自动改。'
          : ''));
      } catch (error) {
        notice('改名失败：' + error.message);
      } finally {
        writing = false;
      }
    }

    async function renameChat(chat) {
      const target = currentChar;
      const ownerPanel = panel;
      if (!target) return;
      const value = await dialog('请输入新的存档名称：', 'prompt', chat.file);
      const name = value?.trim().replace(/\.jsonl$/i, '');
      if (!name || name === chat.file || !ownerPanel?.isConnected) return;
      if (/[\\/:*?"<>|\x00-\x1f]/.test(name)) {
        notice('名称中不能包含路径符号或文件名保留字符。');
        return;
      }

      try {
        const ctx = context();
        const activeFile = String(ctx?.getCurrentChatId?.() || ctx?.chatId || '')
          .replace(/\.jsonl$/i, '');
        const activeAvatar = ctx?.characters?.[ctx.characterId]?.avatar;
        if (ctx?.groupId == null && activeAvatar === target.avatar && activeFile === chat.file) {
          notice('这是酒馆当前正在使用的存档。请先打开另一份存档，再回到档案馆重命名。');
          return;
        }

        const result = await apiPost('/api/chats/rename', {
          is_group: false,
          ch_name: target.name,
          avatar_url: target.avatar,
          original_file: chat.file + '.jsonl',
          renamed_file: name + '.jsonl'
        });
        if (result?.error) throw Error(String(result.error));
        if (panel !== ownerPanel || currentChar !== target) return;
        chats = await loadChats(target);
        if (panel !== ownerPanel || currentChar !== target) return;
        sortChats();
        if (currentFile === chat.file) currentFile = name;
        renderChats();
        renderMessages();
      } catch (error) {
        notice('重命名失败：' + error.message);
      }
    }

    function renderChats() {
      if (!panel) return;
      const box = panel.querySelector('#ca-chats');
      box.replaceChildren();
      if (!chats.length) {
        box.append(node('div', 'cw-empty', currentChar ? '无存档' : '请先选择角色'));
        return;
      }
      for (const chat of chats) {
        const row = node('div', 'ca-chat-item' + (currentFile === chat.file ? ' ca-active' : ''));
        const name = button(
          chat.file + ' · ' + (chat.count || '?') + ' 条',
          () => selectChat(chat.file),
          'ca-chat-name'
        );
        name.title = chat.file;
        row.append(selectionBox(selectedFiles, chat.file, writing), name,
          button('重命名', () => renameChat(chat), 'ca-rename-btn'));
        box.append(row);
      }
    }

    // 跨存档搜索：逐个存档读取，结果可直接打开或跳转
    async function runWideSearch() {
      if (!panel) return;
      const box = panel.querySelector('#ca-msgs');
      const query = panel.querySelector('#ca-search').value.trim();
      const scope = searchScope;
      if (!query) { searchResults = null; renderMessages(); return; }
      const targets = scope === 'char' ? (currentChar ? [currentChar] : []) : chars.slice();
      if (!targets.length) { notice(scope === 'char' ? '请先选择角色。' : '还没有读到角色列表。'); return; }
      const id = ++searchToken;
      const ownerPanel = panel;
      const lower = query.toLowerCase();
      const found = [];
      const status = node('div', 'cw-empty', '正在搜索…');
      panel.querySelector('#ca-title').textContent = '搜索：' + query;
      box.replaceChildren(status);
      let scanned = 0;
      for (const character of targets) {
        if (id !== searchToken || panel !== ownerPanel || disposed) return;
        let list = [];
        try {
          list = await apiPost('/api/characters/chats', { avatar_url: character.avatar });
        } catch { continue; }
        for (const item of Array.isArray(list) ? list : []) {
          if (id !== searchToken || panel !== ownerPanel) return;
          const file = String(item.file_name || '').replace(/\.jsonl$/i, '');
          if (!file) continue;
          scanned++;
          status.textContent = '正在搜索… 已扫描 ' + scanned + ' 个存档，找到 ' + found.length + ' 条';
          try {
            const data = await apiPost('/api/chats/get', { ch_name: character.name, avatar_url: character.avatar, file_name: file });
            if (!Array.isArray(data)) continue;
            const offsetN = data[0] && !('mes' in data[0]) ? 1 : 0;
            data.slice(offsetN).forEach((message, index) => {
              if (!message || typeof message.mes !== 'string') return;
              const content = visibleText(message.mes);
              if (!content.toLowerCase().includes(lower) && !String(message.name || '').toLowerCase().includes(lower)) return;
              if (found.length < 300) found.push({ character, file, index, name: String(message.name || '未知'), content });
            });
          } catch {}
          if (found.length >= 300) break;
        }
        if (found.length >= 300) break;
      }
      if (id !== searchToken || panel !== ownerPanel) return;
      searchResults = { query, scope, list: found, scanned };
      renderMessages();
    }

    function renderSearchResults(box) {
      const { query, list, scanned, scope } = searchResults;
      box.replaceChildren();
      const head = node('div', 'ca-search-head');
      head.append(node('span', '', '「' + query + '」· ' + (scope === 'char' ? '本角色' : '所有角色') + ' · 扫描 ' + scanned + ' 个存档 · 命中 ' + list.length + ' 条' + (list.length >= 300 ? '（已达上限）' : '')),
        button('返回本存档', () => {
          searchResults = null;
          searchScope = 'file';
          const scopeSel = panel.querySelector('#ca-scope');
          if (scopeSel) scopeSel.value = 'file';
          renderMessages();
        }));
      box.append(head);
      if (!list.length) {
        box.append(node('div', 'cw-empty', '没有找到匹配的消息'));
        return;
      }
      for (const hit of list) {
        const card = node('div', 'ca-hit');
        const title = node('div', 'ca-hit-top');
        title.append(node('span', 'ca-hit-char', hit.character.name || hit.character.avatar),
          node('span', 'ca-hit-file', hit.file),
          node('span', 'ca-idx', '#' + hit.index));
        const acts = node('div', 'ca-hit-acts');
        acts.append(
          button('打开存档', async () => {
            const index = chars.indexOf(hit.character);
            if (index < 0) { notice('角色已不在列表里，请刷新。'); return; }
            searchResults = null;
            searchScope = 'file';
            const scopeSel = panel.querySelector('#ca-scope');
            if (scopeSel) scopeSel.value = 'file';
            panel.querySelector('#ca-char-sel').value = String(index);
            await selectChar(index);
            await selectChat(hit.file);
          }),
          button('跳转', () => jump(hit.character, hit.file, hit.index)));
        card.append(title, node('div', 'ca-hit-text', preview(hit.content, 160)), acts);
        box.append(card);
      }
    }

    function renderMessages() {
      if (!panel) return;
      const box = panel.querySelector('#ca-msgs');
      if (searchResults && searchScope !== 'file') {
        panel.querySelector('#ca-title').textContent = '搜索结果';
        renderSearchResults(box);
        return;
      }
      const query = panel.querySelector('#ca-search').value.trim().toLowerCase();
      panel.querySelector('#ca-title').textContent = currentFile
        ? (currentChar?.name || '未知') + ' · ' + currentFile
        : '消息预览';
      box.replaceChildren();
      box.append(actions(
        button('📖 阅读这份存档', () => openReader(), 'cw-primary'),
        button('全选楼层', () => { messages.forEach(m => selectedFloors.add(m.index)); renderMessages(); }),
        button('取消全选', () => { selectedFloors.clear(); renderMessages(); }),
        button('删除选中楼层', () => deleteFloors(), 'cw-danger'),
        button('选中起删到最后', () => deleteFloors(selectedFloors, true), 'cw-danger')));
      let count = 0;
      for (const message of messages) {
        const content = visibleText(message.mes);
        if (query && !content.toLowerCase().includes(query)
          && !String(message.name).toLowerCase().includes(query)) continue;
        count++;
        const card = node('details', 'ca-msg' + (message.is_user ? ' ca-msg-user' : ''));
        const header = node('summary', 'ca-msg-hd');
        header.append(selectionBox(selectedFloors, message.index, writing));
        header.append(
          node('span', 'ca-idx', '#' + message.index),
          node('span', 'ca-sender', message.name),
          node('span', 'ca-pv', preview(content))
        );
        const body = node('div', 'ca-msg-bd');
        const row = node('div', 'ca-msg-acts');
        const copy = button('复制', async () => {
          if (await copyText(content)) {
            copy.textContent = '已复制';
            W.setTimeout(() => { copy.textContent = '复制'; }, 1200);
          }
        });
        const target = currentChar;
        const file = currentFile;
        row.append(button('跳转', () => jump(target, file, message.index)), copy,
          button('删除本层', () => deleteFloors(new Set([message.index])), 'cw-danger'),
          button('从此层删到最后', () => deleteFloors(new Set([message.index]), true), 'cw-danger'));
        body.append(row, node('div', 'ca-msg-text', content));
        card.append(header, body);
        box.append(card);
      }
      if (!count) box.append(node('div', 'cw-empty',
        messages.length ? '无匹配消息' : currentFile ? '该存档无消息' : '请选择角色与存档'
      ));
    }

    async function selectChar(index) {
      rememberReading(); readerLoadId++;
      selectedFiles.clear(); selectedFloors.clear(); archiveData = [];
      const ownerPanel = panel;
      const id = ++requestId;
      currentChar = chars[index] || null;
      chats = [];
      currentFile = null;
      messages = [];
      ownerPanel.querySelector('#ca-search').value = '';
      renderChats();
      renderMessages();
      if (!currentChar) return;
      const target = currentChar;
      ownerPanel.querySelector('#ca-chats').replaceChildren(node('div', 'cw-empty', '加载存档…'));
      try {
        const result = await loadChats(target);
        if (disposed || panel !== ownerPanel || requestId !== id) return;
        chats = result;
        sortChats();
        renderChats();
      } catch (error) {
        if (panel === ownerPanel && requestId === id) {
          ownerPanel.querySelector('#ca-chats').replaceChildren(
            node('div', 'cw-empty', '加载失败：' + error.message)
          );
        }
      }
    }

    async function selectChat(file) {
      selectedFloors.clear(); archiveData = []; searchResults = null; searchToken++;
      const target = currentChar;
      const ownerPanel = panel;
      if (!target || !ownerPanel) return;
      const id = ++requestId;
      currentFile = file;
      messages = [];
      ownerPanel.querySelector('#ca-search').value = '';
      renderChats();
      ownerPanel.querySelector('#ca-msgs').replaceChildren(node('div', 'cw-empty', '加载消息…'));
      try {
        const data = await apiPost('/api/chats/get', {
          ch_name: target.name,
          avatar_url: target.avatar,
          file_name: file
        });
        if (!Array.isArray(data)) throw Error('消息格式错误。');
        if (disposed || panel !== ownerPanel || requestId !== id) return;
        archiveData = clone(data);
        const offset = data[0] && !('mes' in data[0]) ? 1 : 0;
        messages = data.slice(offset).flatMap((message, index) =>
          message && typeof message.mes === 'string'
            ? [{ ...message, index, name: String(message.name || '未知') }]
            : []
        );
        renderMessages();
      } catch (error) {
        if (panel === ownerPanel && requestId === id) {
          ownerPanel.querySelector('#ca-msgs').replaceChildren(
            node('div', 'cw-empty', '加载失败：' + error.message)
          );
        }
      }
    }

    async function jump(character, file, index) {
      if (jumping || !character || !file) return;
      jumping = true;
      try {
        let ctx = context();
        if (!ctx) throw Error('无法获取酒馆上下文。');
        if (isGenerating(ctx)) throw Error('请等当前生成结束后再跳转。');
        const targetId = ctx.characters?.findIndex(c => c?.avatar === character.avatar) ?? -1;
        if (targetId < 0) throw Error('角色未找到，请刷新酒馆。');
        close();
        dismissHub();

        if (ctx.groupId != null || String(ctx.characterId) !== String(targetId)) {
          if (typeof ctx.selectCharacterById === 'function') {
            await ctx.selectCharacterById(targetId);
          } else {
            const element = DOC.querySelector('.character_select[chid="' + targetId + '"]');
            if (!element) throw Error('无法自动切换角色，请手动打开。');
            element.click();
          }
          for (let i = 0; i < 60; i++) {
            if (disposed) return;
            ctx = context();
            if (ctx?.groupId == null && String(ctx.characterId) === String(targetId)) break;
            await sleep(100);
          }
        }

        ctx = context();
        if (ctx?.groupId != null || String(ctx?.characterId) !== String(targetId)) {
          throw Error('角色尚未切换完成，请重试。');
        }

        const getFile = () => String(context()?.getCurrentChatId?.() || context()?.chatId || '')
          .replace(/\.jsonl$/i, '');

        if (getFile() !== file) {
          if (typeof ctx.openCharacterChat !== 'function') {
            throw Error('酒馆未提供切换存档接口，请手动打开：' + file);
          }
          await ctx.openCharacterChat(file);
        }

        const matches = () => {
          const current = context();
          return current?.groupId == null
            && String(current?.characterId) === String(targetId)
            && getFile() === file;
        };
        if (!matches()) throw Error('目标存档未能打开，请重试。');
        await sleep(250);
        await scrollToMessage(index, matches);
      } catch (error) {
        notice('跳转失败：' + error.message);
      } finally {
        jumping = false;
      }
    }

    async function exportJsonl() {
      const target = currentChar;
      if (!target) { notice('请先选择角色。'); return; }
      const files = selectedFiles.size ? [...selectedFiles] : (currentFile ? [currentFile] : []);
      if (!files.length) { notice('请先打开一个存档，或用爱心选中要导出的存档。'); return; }
      try {
        for (const file of files) {
          const data = await apiPost('/api/chats/get', { ch_name: target.name, avatar_url: target.avatar, file_name: file });
          if (!Array.isArray(data)) throw Error('「' + file + '」读取失败');
          download(file + '.jsonl', data.map(item => JSON.stringify(item)).join('\n'), 'application/jsonl;charset=utf-8');
          if (files.length > 1) await new Promise(resolve => W.setTimeout(resolve, 350));
        }
      } catch (error) {
        notice('导出失败：' + error.message);
      }
    }

    async function importChats() {
      const target = currentChar;
      const ownerPanel = panel;
      if (!target) { notice('请先选择要导入到哪个角色。'); return; }
      if (writing || jumping) return;
      const files = await pickFiles('.jsonl,.json,.txt', true);
      if (!files.length || disposed || panel !== ownerPanel || currentChar !== target) return;
      const ctx = context();
      const done = [], failed = [];
      writing = true;
      try {
        for (const file of files) {
          try {
            const ext = (file.name.match(/\.(jsonl|json|txt)$/i)?.[1] || 'jsonl').toLowerCase();
            const result = await apiUpload('/api/chats/import', {
              avatar: file,
              file_type: ext,
              avatar_url: target.avatar,
              character_name: target.name || '',
              user_name: ctx?.name1 || 'User'
            });
            if (result && typeof result === 'object' && result.error) throw Error('酒馆拒绝了这个文件');
            done.push(file.name);
          } catch (error) {
            failed.push(file.name + '：' + error.message);
          }
        }
      } finally {
        writing = false;
      }
      if (panel === ownerPanel && currentChar === target) await selectChar(chars.indexOf(target));
      notice((done.length ? '已导入到「' + (target.name || target.avatar) + '」：\n' + done.map(n => '· ' + n).join('\n') : '没有导入成功的聊天记录。') +
        (failed.length ? '\n\n失败：\n' + failed.join('\n') : ''));
    }

    function exportAll() {
      if (!messages.length || !currentFile) {
        notice('请先选择有消息的存档。');
        return;
      }
      let text = settings.bodyOnly ? '' :
        '# ' + (currentChar?.name || '未知') + ' · ' + currentFile
        + '\n# ' + new Date().toLocaleString('zh-CN') + '\n\n';
      for (const message of messages) {
        const body = visibleText(message.mes);
        text += settings.bodyOnly
          ? body + '\n\n'
          : '[#' + message.index + '] ' + message.name + ':\n' + body + '\n\n';
      }
      download((currentChar?.name || 'chat') + '_' + currentFile + '.txt', '\uFEFF' + text);
    }

    async function open(container) {
      close();
      currentChar = null;
      currentFile = null;
      chats = [];
      messages = [];
      const p = node('section');
      panel = p;
      p.id = 'ca-panel';
      const bodyOnly = heartSwitch(settings.bodyOnly, 'TXT 仅导出正文');
      const label = node('label', 'cw-check');
      label.append(bodyOnly, DOC.createTextNode('TXT 仅导出正文'));
      bodyOnly.addEventListener('change', () => {
        settings.bodyOnly = bodyOnly.checked;
        persist();
      });

      const toolbar = node('div', 'cw-toolbar');
      const select = node('select');
      select.id = 'ca-char-sel';
      select.append(node('option', '', '加载角色…'));
      select.addEventListener('change', () => selectChar(select.value === '' ? -1 : Number(select.value)));

      const charSort = button('', () => {
        settings.charSort = settings.charSort === 'alpha' ? 'recent' : 'alpha';
        persist();
        renderChars();
      });
      charSort.id = 'ca-char-sort';

      const chatSort = button('', () => {
        settings.chatSort = settings.chatSort === 'desc' ? 'asc' : 'desc';
        persist();
        sortChats();
        renderChats();
        renderChars();
      });
      chatSort.id = 'ca-chat-sort';

      const search = input('搜索消息…');
      search.id = 'ca-search';
      search.addEventListener('input', () => {
        if (searchScope !== 'file') return;
        W.clearTimeout(searchTimer);
        searchTimer = W.setTimeout(() => { if (panel === p) renderMessages(); }, 180);
      });
      search.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.isComposing && searchScope !== 'file') {
          event.preventDefault();
          void runWideSearch();
        }
      });
      const scope = node('select', 'ca-scope');
      scope.id = 'ca-scope';
      for (const [value, label] of [['file', '范围：本存档'], ['char', '范围：本角色'], ['all', '范围：所有角色']]) {
        const option = node('option', '', label);
        option.value = value;
        scope.append(option);
      }
      scope.value = searchScope;
      scope.addEventListener('change', () => {
        searchScope = scope.value;
        searchResults = null;
        if (searchScope === 'file') renderMessages();
        else if (search.value.trim()) void runWideSearch();
        else renderMessages();
      });
      const searchGo = button('搜索', () => {
        if (searchScope === 'file') renderMessages();
        else void runWideSearch();
      });
      const galleryToggle = button('角色图库', () => {
        view = view === 'gallery' ? 'archive' : 'gallery';
        applyView();
      });
      galleryToggle.id = 'ca-gallery-toggle';
      toolbar.id = 'ca-toolbar';
      toolbar.append(select, galleryToggle, button('阅读器', () => openReader()), button('导入角色', importChars), button('改角色名', () => renameChar()), charSort, chatSort, search, scope, searchGo,
        button('开启新档', newArchive),
        button('全选存档', () => { chats.forEach(c => selectedFiles.add(c.file)); renderChats(); }),
        button('取消选档', () => { selectedFiles.clear(); renderChats(); }),
        button('批量删除存档', deleteArchives, 'cw-danger'),
        button('导入聊天记录', importChats),
        button('导出 JSONL', exportJsonl),
        button('导出 TXT', exportAll), label);

      const body = node('div', 'ca-body');
      const sidebar = node('div', 'ca-sidebar');
      sidebar.id = 'ca-chats';
      const main = node('div', 'ca-main');
      const title = node('div', 'ca-main-title', '消息预览');
      title.id = 'ca-title';
      const box = node('div', 'ca-msgs');
      box.id = 'ca-msgs';
      main.append(title, box);
      body.append(sidebar, main);

      const gallery = node('div', 'ca-gallery');
      gallery.id = 'ca-gallery';
      gallery.hidden = true;
      const readerBox = node('div', 'ca-reader');
      readerBox.id = 'ca-reader';
      readerBox.hidden = true;
      reader = null;
      DOC.addEventListener('selectionchange', onSelectionChange);
      DOC.addEventListener('keydown', onImmersiveKey, true);
      (DOC.defaultView || W).addEventListener('message', onFrameMessage);
      view = 'archive';
      pageAvatar = null; pageCard = null; pageError = '';
      charBulk.on = false;
      charBulk.selected.clear();
      galleryQuery = '';
      p.append(toolbar, body, gallery, readerBox,
        node('div', 'cw-footer', '☕ 聊天档案馆 · 梨梨工作台 v3.6 无书摘版'));
      container.append(p);
      syncThemeUi();
      renderChats();
      renderMessages();
      renderChars();

      const id = ++requestId;
      try {
        const data = await apiPost('/api/characters/all', {});
        if (!Array.isArray(data)) throw Error('角色列表格式错误。');
        if (disposed || panel !== p || requestId !== id) return;
        chars = data.filter(c => c?.avatar);
        renderChars();
      } catch (error) {
        if (panel === p && requestId === id) {
          select.replaceChildren(node('option', '', '加载失败：' + error.message));
        }
        return;
      }

      // 默认打开正在聊天的角色和它的当前存档
      try {
        const ctx = context();
        const live = liveAvatar();
        const index = live ? chars.findIndex(c => c.avatar === live) : -1;
        if (index < 0 || panel !== p || currentChar) return;
        select.value = String(index);
        await selectChar(index);
        if (panel !== p || currentChar !== chars[index]) return;
        renderChars();
        const file = String(ctx?.getCurrentChatId?.() || ctx?.chatId || '').replace(/\.jsonl$/i, '');
        if (file && chats.some(c => c.file === file)) await selectChat(file);
      } catch {}
    }

    modules.archive = { open, close, enterReader, setView(next) { if (!panel) return; rememberReading(); view = next === 'gallery' ? 'gallery' : 'archive'; if (view === 'gallery') { pageAvatar = null; pageCard = null; } applyView(); }, canLeave: async () => !jumping && !writing, element: () => panel };
  })();

  /* 回复历史与分支 */
  (function () {
    let panel = null;
    const selectedFloors = new Set();
    let selectionSignature = '';
    let panelIdentity = '';
    let panelSignature = '';
    let editMode = false;
    let editChat = null;
    let editDirty = false;
    let editSource = '';
    let editIdentity = '';
    let editOrder = [];
    let searchTimer;
    let viewOrder = object(read(HISTORY_KEY, {})).viewOrder === 'desc' ? 'desc' : 'asc';

    function chatKey(ctx = context()) {
      const file = ctx?.getCurrentChatId?.() || ctx?.chatId;
      if (!ctx || !file) return null;
      const avatar = ctx.characters?.[ctx.characterId]?.avatar || '';
      return (ctx.groupId != null ? 'group:' + ctx.groupId : avatar)
        + '::' + String(file).replace(/\.jsonl$/i, '');
    }

    function loadBranches() {
      return object(read(BRANCH_KEY, {}));
    }

    function getBranches(key = chatKey()) {
      const all = loadBranches();
      return key && Array.isArray(all[key]) ? all[key] : [];
    }

    function setBranches(branches, key = chatKey()) {
      if (!key) throw Error('当前聊天没有有效的分支存储标识。');
      const all = loadBranches();
      all[key] = branches;
      W.localStorage.setItem(BRANCH_KEY, JSON.stringify(all));
    }

    function offset(chat) {
      return chat[0] && !('mes' in chat[0]) ? 1 : 0;
    }

    function resetEdit() {
      editMode = false;
      editChat = null;
      editDirty = false;
      editSource = '';
      editIdentity = '';
      editOrder = [];
    }

    function close() {
      W.clearTimeout(searchTimer);
      panel?.remove();
      panel = null;
      resetEdit();
    }

    async function canLeave() {
      if (writing) {
        notice('正在保存聊天，请稍后操作。');
        return false;
      }
      return !editMode || !editDirty || await ask('有未保存的排序改动，确认离开？');
    }

    function assertCurrent(identity = panelIdentity, signature = panelSignature) {
      const ctx = context();
      if (currentIdentity(ctx) !== identity) throw Error('聊天已切换，请刷新回复历史。');
      if (signature !== JSON.stringify(ctx?.chat || [])) {
        throw Error('聊天内容已变化，请刷新回复历史后再操作。');
      }
      return ctx;
    }

    function makeBranch(point, name, messages) {
      return {
        name,
        createdAt: new Date().toLocaleString('zh-CN'),
        branchPoint: point,
        messageCount: messages.length,
        previewText: preview(parseContent(messages[0]?.mes || '')),
        messages: clone(messages)
      };
    }

    function updateEditUi() {
      if (!panel) return;
      panel.querySelector('#sb-search').disabled = editMode || writing;
      panel.querySelector('#sb-edit-bar').hidden = !editMode;
      panel.querySelector('#sb-edit-enter').hidden = editMode;
      panel.querySelector('#sb-refresh-btn').disabled = editMode || writing;
      const viewButton = panel.querySelector('#sb-view-order');
      viewButton.disabled = editMode || writing;
      viewButton.textContent = editMode ? '查看：顺序（编辑中）' : viewOrder === 'desc' ? '查看：倒序 ↓' : '查看：顺序 ↑';
      viewButton.setAttribute('aria-pressed', String(!editMode && viewOrder === 'desc'));
      viewButton.title = editMode ? '编辑排序时按真实楼层顺序显示，退出后恢复查看顺序' : '切换顺序／倒序查看，仅影响显示，不修改聊天';
      panel.querySelector('#sb-edit-save').disabled = writing;
      panel.querySelector('#sb-edit-cancel').disabled = writing;
    }

    function getMessages() {
      const chat = editMode ? editChat : context()?.chat;
      if (!Array.isArray(chat)) return [];
      const first = offset(chat);
      return chat.slice(first).flatMap((message, index) => {
        if (!message || typeof message.mes !== 'string') return [];
        const swipes = Array.isArray(message.swipes) && message.swipes.length
          ? message.swipes.slice()
          : [message.mes];
        const swipeId = Math.max(0, Math.min(swipes.length - 1, Math.trunc(Number(message.swipe_id) || 0)));
        swipes[swipeId] = message.mes;
        return [{
          index,
          rawIndex: index + first,
          name: String(message.name || '未知'),
          mes: message.mes,
          is_user: !!message.is_user,
          hidden: !!message.is_system,
          swipes,
          swipeId
        }];
      });
    }

    async function forkNewChat(messagesToKeep) {
      const ctx = context();
      if (ctx.groupId != null) throw Error('群聊暂不支持创建分支档。');
      const character = ctx.characters?.[ctx.characterId];
      if (!character) throw Error('角色未找到。');
      const identity = currentIdentity(ctx);
      const file = await saveNewArchive(character, messagesToKeep, ctx.chatMetadata);
      if (currentIdentity() !== identity) throw Error('新档已保存为「' + file + '」，聊天已切换，请手动打开新档。');
      close();
      dismissHub();
      await ctx.openCharacterChat(file);
      if (String(context()?.getCurrentChatId?.()).replace(/\.jsonl$/i, '') !== file) {
        throw Error('新档已保存为「' + file + '」，自动打开失败。');
      }
    }

    async function createBranch(message, identity, signature, selectedSwipe) {
      try {
        if (writing || editMode) return;
        const ctx = assertCurrent(identity, signature);
        if (isGenerating(ctx)) throw Error('请等当前生成结束。');
        const swipeLabel = message.swipes.length > 1
          ? '（当前选中第 ' + (selectedSwipe + 1) + ' 版回复）'
          : '';
        if (!await ask(
          '确定要从当前分支开启新对话吗？\n从 #' + message.index + ' 处创建新档。' + swipeLabel + '\n'
          + '将以第 0 条到第 ' + message.index + ' 条消息创建一个新的对话档。'
        )) return;
        if (disposed) return;
        assertCurrent(identity, signature);
        if (writing) return;
        writing = true;
        updateEditUi();
        const messagesToKeep = clone(ctx.chat.slice(0, message.rawIndex + 1));
        applySwipe(messagesToKeep[messagesToKeep.length - 1], selectedSwipe);
        await forkNewChat(messagesToKeep);
        notice('已创建新对话档。');
      } catch (error) {
        notice('创建分支失败：' + error.message);
      } finally {
        writing = false;
        updateEditUi();
      }
    }

    async function forkBranch(branch, identity, signature) {
      if (writing || editMode) return;
      try {
        const ctx = assertCurrent(identity, signature);
        if (isGenerating(ctx)) throw Error('请等当前生成结束。');
        const raw = branch.branchPoint + offset(ctx.chat);
        if (!Number.isInteger(raw) || raw < offset(ctx.chat) || raw >= ctx.chat.length) {
          throw Error('分支所在楼层已不存在。');
        }
        if (!Array.isArray(branch.messages) || !branch.messages.length) {
          throw Error('分支内容为空。');
        }
        if (!await ask(
          '从分支「' + branch.name + '」创建新对话档？\n'
          + '将以 #0 ~ #' + branch.branchPoint + ' + 分支内的 '
          + branch.messages.length + ' 条消息创建新档。'
        )) return;
        if (disposed) return;
        assertCurrent(identity, signature);
        if (writing) return;
        writing = true;
        updateEditUi();
        const head = clone(ctx.chat.slice(0, raw + 1));
        const tail = clone(branch.messages);
        await forkNewChat(head.concat(tail));
        notice('已从分支创建新对话档。');
      } catch (error) {
        notice('创建失败：' + error.message);
      } finally {
        writing = false;
        updateEditUi();
      }
    }

    async function restoreBranch(branch, identity, signature) {
      if (writing || editMode) return;
      try {
        const ctx = assertCurrent(identity, signature);
        const key = chatKey(ctx);
        const raw = branch.branchPoint + offset(ctx.chat);
        if (!Number.isInteger(raw) || raw < offset(ctx.chat) || raw >= ctx.chat.length) {
          throw Error('分支所在楼层已不存在。');
        }
        if (!Array.isArray(branch.messages)) throw Error('分支内容格式错误。');
        if (!await ask(
          '恢复分支「' + branch.name + '」？\n将替换 #' + branch.branchPoint
          + ' 后的消息。当前后续内容会先另存为一个分支。'
        )) return;
        if (disposed) return;
        assertCurrent(identity, signature);
        if (writing) return;
        writing = true;
        updateEditUi();

        const branches = getBranches(key);
        if (!branches.some(item => stableString(item) === stableString(branch))) {
          throw Error('分支列表已变化，请刷新后重试。');
        }
        const following = ctx.chat.slice(raw + 1);
        if (following.length) {
          branches.push(makeBranch(
            branch.branchPoint,
            '恢复前自动备份 ' + new Date().toLocaleString('zh-CN'),
            following
          ));
          setBranches(branches, key);
        }
        await commitChat(ctx, ctx.chat.slice(0, raw + 1).concat(clone(branch.messages)));
        close();
        dismissHub();
        await refreshChat(ctx);
      } catch (error) {
        notice('恢复失败：' + error.message);
      } finally {
        writing = false;
        updateEditUi();
      }
    }

    async function deleteBranch(branch, identity) {
      if (writing || editMode) return;
      try {
        if (currentIdentity() !== identity) throw Error('聊天已切换，请刷新。');
        const key = chatKey();
        if (!await ask('删除分支「' + branch.name + '」？')) return;
        if (disposed) return;
        if (currentIdentity() !== identity) throw Error('聊天已切换，请刷新。');
        const branches = getBranches(key);
        const index = branches.findIndex(item => stableString(item) === stableString(branch));
        if (index < 0) throw Error('分支已发生变化，请刷新。');
        branches.splice(index, 1);
        setBranches(branches, key);
        renderMessages();
      } catch (error) {
        notice('删除失败：' + error.message);
      }
    }

    async function cloneFloor(message, identity, signature) {
      if (writing || editMode) return;
      writing = true;
      updateEditUi();
      try {
        const ctx = assertCurrent(identity, signature);
        if (isGenerating(ctx)) throw Error('请等当前生成结束。');
        const source = ctx.chat[message.rawIndex];
        if (!source) throw Error('楼层不存在。');
        const copy = clone(source);
        if (Array.isArray(copy.swipes) && copy.swipes.length) {
          copy.swipe_id = Math.max(
            0, Math.min(copy.swipes.length - 1, Math.trunc(Number(copy.swipe_id) || 0))
          );
          copy.swipes[copy.swipe_id] = copy.mes;
          if (copy.swipe_info?.[copy.swipe_id]) {
            copy.swipe_info[copy.swipe_id].extra = clone(copy.extra || {});
          }
        }
        const key = chatKey(ctx);
        const targetIndex = ctx.chat.length - offset(ctx.chat);
        const oldBranches = getBranches(key);
        const attached = oldBranches
          .filter(branch => branch.branchPoint === message.index)
          .map(branch => ({ ...clone(branch), branchPoint: targetIndex }));

        const nextBranches = oldBranches.concat(attached);
        if (attached.length) setBranches(nextBranches, key);
        try {
          await commitChat(ctx, ctx.chat.concat([copy]));
        } catch (error) {
          if (attached.length && !error.message.startsWith('保存请求已提交')) {
            setBranches(oldBranches, key);
          }
          throw error;
        }

        await refreshChat(ctx);
        if (panel?.isConnected && currentIdentity() === identity) renderMessages();
        notice(
          '已将 #' + message.index + ' 克隆到 #' + targetIndex
          + '，保留 ' + (copy.swipes?.length || 1) + ' 个回复版本'
          + (attached.length ? '及 ' + attached.length + ' 个已保存分支' : '') + '。'
        );
      } catch (error) {
        notice('克隆失败：' + error.message);
      } finally {
        writing = false;
        updateEditUi();
      }
    }

    function enterEdit() {
      if (writing) return;
      try {
        const ctx = assertCurrent();
        if (!Array.isArray(ctx?.chat) || !ctx.chat.length) throw Error('当前没有聊天记录。');
        if (isGenerating(ctx)) throw Error('请等当前生成结束。');
        editChat = clone(ctx.chat);
        editSource = JSON.stringify(ctx.chat);
        editIdentity = currentIdentity(ctx);
        editOrder = ctx.chat.map((_, index) => index);
        editMode = true;
        editDirty = false;
        panel.querySelector('#sb-search').value = '';
        updateEditUi();
        renderMessages();
      } catch (error) {
        notice(error.message);
      }
    }

    async function cancelEdit() {
      if (writing) return;
      if (editDirty && !await ask('放弃未保存的排序改动？')) return;
      resetEdit();
      updateEditUi();
      renderMessages();
    }

    async function saveEdit() {
      if (writing || !editChat) return;
      if (!editDirty) {
        resetEdit();
        updateEditUi();
        renderMessages();
        return;
      }

      writing = true;
      updateEditUi();
      try {
        const ctx = assertCurrent(editIdentity, editSource);
        const key = chatKey(ctx);
        const first = offset(ctx.chat);
        const oldBranches = getBranches(key);
        const nextBranches = oldBranches.map(branch => {
          const raw = editOrder.indexOf(branch.branchPoint + first);
          if (raw < first) throw Error('某个分支的原楼层已不存在，请先核对分支。');
          return { ...branch, branchPoint: raw - first };
        });

        setBranches(nextBranches, key);
        try {
          await commitChat(ctx, editChat);
        } catch (error) {
          if (!error.message.startsWith('保存请求已提交')) setBranches(oldBranches, key);
          throw error;
        }

        const identity = editIdentity;
        resetEdit();
        await refreshChat(ctx);
        if (panel?.isConnected && currentIdentity() === identity) renderMessages();
        notice('排序已保存，分支所在楼层已同步更新。');
      } catch (error) {
        notice('排序保存失败：' + error.message);
      } finally {
        writing = false;
        updateEditUi();
      }
    }

    function move(raw, direction) {
      if (writing || !editChat) return;
      const min = offset(editChat);
      const max = editChat.length - 1;
      const destination = direction === 'up' ? raw - 1
        : direction === 'down' ? raw + 1
          : direction === 'top' ? min : max;
      if (destination < min || destination > max || destination === raw) return;
      editChat.splice(destination, 0, editChat.splice(raw, 1)[0]);
      editOrder.splice(destination, 0, editOrder.splice(raw, 1)[0]);
      editDirty = true;
      renderMessages(destination);
    }

    async function jump(message, identity, signature, selectedSwipe) {
      try {
        if (writing) return;
        const ctx = assertCurrent(identity, signature);
        if (editMode) {
          notice('请先保存或取消排序，再跳转到聊天。');
          return;
        }
        const chat = ctx?.chat;
        if (!Array.isArray(chat)) return;
        if (isGenerating(ctx)) throw Error('请等当前生成结束。');
        if (message.rawIndex < chat.length - 1) {
          await createBranch(message, identity, signature, selectedSwipe);
          return;
        }
        writing = true;
        try {
          const next = clone(chat);
          applySwipe(next[message.rawIndex], selectedSwipe);
          await commitChat(ctx, next);
          close();
          dismissHub();
          await refreshChat(ctx);
          await scrollToMessage(message.rawIndex, () => currentIdentity() === identity);
        } finally { writing = false; updateEditUi(); }

      } catch (error) {
        notice('跳转失败：' + error.message);
      }
    }

    // ─── 文本编辑器 ───
    async function openTextEditor(message, identity, signature, textNode, card) {
      // 如果已有编辑器打开，先关闭
      panel.querySelectorAll('.cw-text-editor-wrap').forEach(el => el.remove());

      const wrap = node('div', 'cw-text-editor-wrap');
      wrap.style.marginTop = '10px';

      // 查找替换工具栏
      const toolbar = node('div', 'cw-edit-toolbar');
      const findInput = input('查找关键词…');
      findInput.style.flex = '1'; findInput.style.width = 'auto';
      const replaceInput = input('替换为…');
      replaceInput.style.flex = '1'; replaceInput.style.width = 'auto';
      const matchInfo = node('span', 'cw-match-info', '0/0');
      const prevBtn = button('▲', () => navigateMatch(-1));
      const nextBtn = button('▼', () => navigateMatch(1));
      const replaceOne = button('替换', doReplaceOne);
      const replaceAll = button('全部替换', doReplaceAll);
      toolbar.append(findInput, matchInfo, prevBtn, nextBtn, replaceInput, replaceOne, replaceAll);

      // 文本编辑区
      const editor = node('textarea', 'cw-edit-area');
      editor.value = message.mes; // 编辑原始文本
      editor.rows = 12;

      // 操作按钮
      const editorActions = node('div', 'cw-actions');
      const saveBtn = button('保存编辑', async () => {
        try {
          assertCurrent(identity, signature);
          const ctx = context();
          if (!ctx?.chat?.[message.rawIndex]) { notice('消息不存在'); return; }
          ctx.chat[message.rawIndex].mes = editor.value;
          // 如果有swipes，也更新当前swipe
          if (Array.isArray(ctx.chat[message.rawIndex].swipes)) {
            const sid = ctx.chat[message.rawIndex].swipe_id || 0;
            ctx.chat[message.rawIndex].swipes[sid] = editor.value;
          }
          await commitChat(ctx, ctx.chat);
          textNode.textContent = parseContent(editor.value);
          wrap.remove();
          notice('文本已保存。');
        } catch(e) { notice('保存失败：' + e.message); }
      }, 'cw-primary');
      const cancelBtn = button('取消', () => wrap.remove());
      editorActions.append(saveBtn, cancelBtn);

      wrap.append(toolbar, editor, editorActions);

      // 插入到消息体中 textNode 之后
      textNode.after(wrap);
      card.open = true;
      editor.focus();

      // 查找匹配逻辑
      let matches = [];
      let matchIndex = -1;

      function findMatches() {
        const keyword = findInput.value;
        matches = [];
        matchIndex = -1;
        if (!keyword) { matchInfo.textContent = '0/0'; return; }
        const text = editor.value;
        const lower = text.toLowerCase();
        const kw = keyword.toLowerCase();
        let pos = 0;
        while (true) {
          const idx = lower.indexOf(kw, pos);
          if (idx === -1) break;
          matches.push(idx);
          pos = idx + 1;
        }
        matchInfo.textContent = matches.length ? '0/' + matches.length : '无匹配';
        if (matches.length) navigateMatch(1);
      }

      function navigateMatch(direction) {
        if (!matches.length) return;
        matchIndex = (matchIndex + direction + matches.length) % matches.length;
        matchInfo.textContent = (matchIndex + 1) + '/' + matches.length;
        const pos = matches[matchIndex];
        const keyword = findInput.value;
        editor.focus();
        editor.setSelectionRange(pos, pos + keyword.length);
        // 滚动到选中位置
        const lineHeight = 22;
        const linesBefore = editor.value.substring(0, pos).split('\n').length;
        editor.scrollTop = Math.max(0, (linesBefore - 3) * lineHeight);
      }

      function doReplaceOne() {
        if (matchIndex < 0 || !matches.length) { notice('请先查找关键词'); return; }
        const keyword = findInput.value;
        const replacement = replaceInput.value;
        const pos = matches[matchIndex];
        const val = editor.value;
        editor.value = val.substring(0, pos) + replacement + val.substring(pos + keyword.length);
        findMatches();
      }

      function doReplaceAll() {
        const keyword = findInput.value;
        if (!keyword) { notice('请先输入查找关键词'); return; }
        const replacement = replaceInput.value;
        // 全局替换（大小写不敏感匹配但保持原文大小写结构）
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        editor.value = editor.value.replace(new RegExp(escaped, 'gi'), replacement);
        findMatches();
        notice('已替换全部匹配项');
      }

      findInput.addEventListener('input', findMatches);
      findInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); navigateMatch(e.shiftKey ? -1 : 1); }
      });
    }

    async function deleteFloors(ids = selectedFloors, tail = false) {
      if (writing || editMode) return;
      try {
        const identity = panelIdentity, signature = panelSignature;
        const ctx = assertCurrent(identity, signature);
        const first = offset(ctx.chat);
        const removed = deletionSet(ids, ctx.chat.length - first, tail);
        if (!await ask('确定删除 ' + removed.size + ' 层消息？' + (tail ? '从最早选中楼层删到最后。' : '') + '\n此操作会保存到当前对话档。')) return;
        assertCurrent(identity, signature);
        if (writing) return;
        writing = true;
        await commitChat(ctx, ctx.chat.filter((m, raw) => raw < first || !removed.has(raw - first)));
        remapBranches(chatKey(ctx), removed);
        selectedFloors.clear();
        await refreshChat(ctx);
        renderMessages();
      } catch (error) { notice('删除失败：' + error.message); }
      finally { writing = false; updateEditUi(); }
    }

    let chatTokenRev = 0;

    async function setHidden(ids, hide) {
      if (writing || editMode) return;
      try {
        const identity = panelIdentity, signature = panelSignature;
        const ctx = assertCurrent(identity, signature);
        const first = offset(ctx.chat);
        const total = ctx.chat.length - first;
        const targets = [...ids].filter(i => Number.isInteger(i) && i >= 0 && i < total);
        if (!targets.length) { notice('请先用爱心选择楼层。'); return; }
        const changed = targets.filter(i => !!ctx.chat[i + first]?.is_system !== hide);
        if (!changed.length) { notice(hide ? '这些楼层已经是隐藏状态了。' : '这些楼层本来就没有隐藏。'); return; }
        if (changed.length > 1 && !await ask((hide ? '隐藏 ' : '取消隐藏 ') + changed.length + ' 层？\n' + floorText(changed) +
          (hide ? '\n\n隐藏后这些楼层不会发给 AI，但仍保留在记录里，随时可以取消隐藏。' : ''))) return;
        assertCurrent(identity, signature);
        if (writing) return;
        writing = true;
        const set = new Set(changed.map(i => i + first));
        await commitChat(ctx, ctx.chat.map((m, raw) => set.has(raw) ? { ...m, is_system: hide } : m));
        selectedFloors.clear();
        await refreshChat(ctx);
        renderMessages();
      } catch (error) {
        notice((hide ? '隐藏' : '取消隐藏') + '失败：' + error.message);
      } finally {
        writing = false;
        updateEditUi();
      }
    }

    async function hideByInput() {
      if (writing || editMode) return;
      const total = getMessages().length;
      if (!total) { notice('当前没有聊天记录。'); return; }
      const text = await dialog('输入楼层号（就是每层前面的 # 编号），可以写范围和单层，用逗号隔开。\n例如：1-5, 8, 10-12\n当前共 ' + total + ' 层（#0 到 #' + (total - 1) + '）。', 'prompt', '');
      if (text === null || !text.trim()) return;
      let floors;
      try { floors = parseFloors(text, total); } catch (error) { notice(error.message); return; }
      const mode = await choose('对 ' + floorText(floors) + ' 共 ' + floors.length + ' 层：', [
        ['hide', '隐藏', '不发给 AI，记录仍保留'],
        ['show', '取消隐藏', '恢复发送给 AI']
      ], '按楼层号处理');
      if (!mode) return;
      await setHidden(floors, mode === 'hide');
    }

    function renderMessages(expandRaw = null) {
      if (!panel) return;
      const ctx = context();
      if (!editMode) {
        panelIdentity = currentIdentity(ctx);
        panelSignature = JSON.stringify(ctx?.chat || []);
      }

      const identity = panelIdentity;
      const signature = panelSignature;
      if (selectionSignature !== identity + signature) { selectedFloors.clear(); selectionSignature = identity + signature; }
      const messages = getMessages();
      if (!editMode && viewOrder === 'desc') messages.reverse();
      const branches = getBranches();
      const box = panel.querySelector('#sb-msgs');
      const scrollTop = box.scrollTop;
      const oldOpen = new Set([...box.querySelectorAll('details[open]')]
        .map(el => el.dataset.raw));
      const query = editMode ? '' : panel.querySelector('#sb-search').value.trim().toLowerCase();
      box.replaceChildren();

      const characterName = ctx?.groupId != null
        ? '群聊'
        : ctx?.characters?.[ctx.characterId]?.name || '未知';
      panel.querySelector('#sb-info').textContent = characterName + ' · '
        + String(ctx?.getCurrentChatId?.() || ctx?.chatId || '').replace(/\.jsonl$/i, '');

      const branchMap = new Map();
      const first = offset(editMode ? editChat || [] : ctx?.chat || []);
      branches.forEach(branch => {
        const point = editMode
          ? editOrder.indexOf(branch.branchPoint + first) - first
          : branch.branchPoint;
        if (!branchMap.has(point)) branchMap.set(point, []);
        branchMap.get(point).push(branch);
      });

      let matched = 0;
      let swipeCount = 0;

      for (const message of messages) {
        if (message.swipes.length > 1) swipeCount++;
        if (query && !message.name.toLowerCase().includes(query)
          && !message.swipes.some(s => parseContent(s).toLowerCase().includes(query))) continue;
        matched++;

        const attached = branchMap.get(message.index) || [];
        const card = node('details', 'sb-msg'
          + (message.is_user ? ' sb-msg-user' : '')
          + (message.hidden ? ' sb-is-hidden' : '')
          + (message.swipes.length > 1 ? ' sb-has-swipes' : '')
          + (attached.length ? ' sb-has-branch' : '')
        );
        card.dataset.raw = String(message.rawIndex);
        card.open = expandRaw === message.rawIndex || oldOpen.has(String(message.rawIndex));

        const header = node('summary', 'sb-msg-hd');
        header.append(selectionBox(selectedFloors, message.index, editMode || writing));
        header.append(
          node('span', 'sb-idx', '#' + message.index),
          node('span', 'sb-sender', message.name)
        );
        if (message.swipes.length > 1) {
          header.append(node('span', 'sb-badge', message.swipes.length + ' 版'));
        }
        if (attached.length) header.append(node('span', 'sb-badge', '🌿 ' + attached.length));
        if (message.hidden) header.append(node('span', 'sb-badge sb-hidden-badge', '已隐藏'));
        header.append(node('span', 'sb-pv', preview(parseContent(message.mes))));

        const body = node('div', 'sb-msg-bd');
        const row = node('div', 'sb-msg-acts');
        let swipe = message.swipeId;
        const copy = button('复制', async () => {
          if (await copyText(message.swipes[swipe] ?? message.mes)) {
            copy.textContent = '已复制';
            W.setTimeout(() => { copy.textContent = '复制'; }, 1200);
          }
        });
        const branchButton = button(
          '🌿 从此创建分支',
          () => createBranch(message, identity, signature, swipe)
        );
        const cloneButton = button(
          '⧉ 整层克隆置底',
          () => cloneFloor(message, identity, signature)
        );
        const jumpButton = button('跳转', () => jump(message, identity, signature, swipe));
        const editTextBtn = button('✏️ 编辑文本', () => {
          if (editMode) { notice('请先保存或取消排序再编辑文本'); return; }
          openTextEditor(message, identity, signature, text, card);
        });
        branchButton.disabled = editMode;
        cloneButton.disabled = editMode;
        jumpButton.disabled = editMode;
        editTextBtn.disabled = editMode;
        row.append(jumpButton, copy, editTextBtn, branchButton, cloneButton,
          button(message.hidden ? '取消隐藏' : '隐藏本层', () => setHidden([message.index], !message.hidden)),
          button('隐藏此层及之前', () => setHidden(Array.from({ length: message.index + 1 }, (_, i) => i), true)),
          button('删除本层', () => deleteFloors(new Set([message.index])), 'cw-danger'),
          button('从此层删到最后', () => deleteFloors(new Set([message.index]), true), 'cw-danger'));

        if (editMode) {
          const moveBox = node('div', 'sb-move-box');
          for (const [label, title, direction] of [
            ['⏶', '置顶', 'top'],
            ['▲', '上移', 'up'],
            ['▼', '下移', 'down'],
            ['⏷', '置底', 'bottom']
          ]) {
            const b = button(label, () => move(message.rawIndex, direction), 'sb-move-btn');
            b.title = title;
            moveBox.append(b);
          }
          row.append(moveBox);
        }
        body.append(row);

        const text = node('div', 'sb-msg-text', parseContent(message.swipes[swipe]));
        if (message.swipes.length > 1) {
          const nav = node('div', 'sb-swipe-nav');
          const buttons = [];
          const label = node('span', 'cw-note');
          function selectSwipe(index) {
            if (index < 0 || index >= message.swipes.length) return;
            swipe = index;
            text.textContent = parseContent(message.swipes[index]);
            label.textContent = '回复版本 ' + (index + 1) + ' / ' + message.swipes.length;
            buttons.forEach((b, i) => b.classList.toggle('sb-swipe-active', i === index));
          }
          nav.append(button('◀', () => selectSwipe(swipe - 1), 'sb-swipe-btn'), label);
          message.swipes.forEach((_, index) => {
            const b = button(String(index + 1), () => selectSwipe(index), 'sb-swipe-btn');
            if (index === message.swipeId) b.classList.add('sb-swipe-current');
            buttons.push(b);
            nav.append(b);
          });
          nav.append(button('▶', () => selectSwipe(swipe + 1), 'sb-swipe-btn'));
          body.append(nav);
          selectSwipe(swipe);
        }
        body.append(text);

        if (attached.length) {
          const list = node('div', 'sb-branch-list');
          for (const branch of attached) {
            const item = node('div', 'sb-branch-row');
            item.append(
              node('div', 'sb-branch-name', '🌿 ' + String(branch.name || '未命名分支')),
              node('div', 'sb-branch-info',
                (branch.messageCount || branch.messages?.length || 0)
                + ' 条 · ' + String(branch.createdAt || '')
              ),
              node('div', 'sb-branch-preview', String(branch.previewText || ''))
            );
            const restore = button('恢复此分支', () => restoreBranch(branch, identity, signature));
            const fork = button('创建新档', () => forkBranch(branch, identity, signature));
            const remove = button('删除', () => deleteBranch(branch, identity), 'cw-danger');
            restore.disabled = editMode;
            fork.disabled = editMode;
            remove.disabled = editMode;
            item.append(actions(restore, fork, remove));
            list.append(item);
          }
          body.append(list);
        }

        card.append(header, body);
        box.append(card);
      }

      if (!matched) {
        box.append(node('div', 'cw-empty', messages.length ? '无匹配消息' : '当前没有聊天记录'));
      }
      const statusEl = panel.querySelector('#sb-status');
      const baseStatus = messages.length + ' 条消息'
        + ' · ' + swipeCount + ' 条有多版本'
        + ' · ' + branches.length + ' 个分支';
      statusEl.textContent = baseStatus;
      const hiddenCount = messages.filter(m => m.hidden).length;
      const tokenRev = ++chatTokenRev;
      void sumTokens(messages.filter(m => !m.hidden).map(m => m.mes)).then(total => {
        if (tokenRev !== chatTokenRev || !statusEl.isConnected) return;
        statusEl.textContent = baseStatus + ' · 聊天记录 ' + fmtTok(total) + ' tokens' + (hiddenCount ? '（已隐藏 ' + hiddenCount + ' 层不计）' : '');
      });

      box.scrollTop = scrollTop;
      if (expandRaw !== null) {
        box.querySelector('[data-raw="' + expandRaw + '"]')
          ?.scrollIntoView({ block: 'nearest' });
      }
      updateEditUi();
    }

    function open(container) {
      close();
      const p = node('section');
      p.id = 'sb-panel';
      panel = p;
      const refresh = button('刷新', () => { if (!editMode && !writing) renderMessages(); });
      refresh.id = 'sb-refresh-btn';

      const toolbar = node('div', 'cw-toolbar');
      const info = node('span', 'cw-note');
      info.id = 'sb-info';
      const search = input('搜索回复版本…');
      search.id = 'sb-search';
      search.addEventListener('input', () => {
        W.clearTimeout(searchTimer);
        searchTimer = W.setTimeout(() => { if (panel === p) renderMessages(); }, 180);
      });
      const edit = button('编辑排序', enterEdit);
      edit.id = 'sb-edit-enter';
      const viewButton = button('', () => {
        if (editMode || writing) return;
        const next = viewOrder === 'asc' ? 'desc' : 'asc';
        try {
          const saved = object(read(HISTORY_KEY, {}));
          saved.viewOrder = next;
          W.localStorage.setItem(HISTORY_KEY, JSON.stringify(saved));
        } catch {
          notice('查看顺序未保存：浏览器存储空间不足或已被禁用。');
          return;
        }
        viewOrder = next;
        renderMessages();
        panel.querySelector('#sb-msgs').scrollTop = 0;
      });
      viewButton.id = 'sb-view-order';
      toolbar.append(info, search, refresh, viewButton, edit,
        button('全选楼层', () => { if (!editMode && !writing) { getMessages().forEach(m => selectedFloors.add(m.index)); renderMessages(); } }),
        button('取消全选', () => { selectedFloors.clear(); renderMessages(); }),
        button('删除选中楼层', () => deleteFloors(), 'cw-danger'),
        button('选中起删到最后', () => deleteFloors(selectedFloors, true), 'cw-danger'),
        button('隐藏选中', () => setHidden(selectedFloors, true)),
        button('取消隐藏选中', () => setHidden(selectedFloors, false)),
        button('选中起往前全隐藏', () => {
          if (!selectedFloors.size) { notice('请先用爱心选择一层。'); return; }
          const top = Math.max(...selectedFloors);
          return setHidden(Array.from({ length: top + 1 }, (_, i) => i), true);
        }),
        button('按楼层号隐藏 / 取消…', hideByInput));

      const editBar = node('div', 'sb-edit-bar');
      editBar.id = 'sb-edit-bar';
      editBar.hidden = true;
      const save = button('✓ 确认保存', saveEdit, 'cw-primary');
      save.id = 'sb-edit-save';
      const cancel = button('✕ 取消', cancelEdit);
      cancel.id = 'sb-edit-cancel';
      editBar.append(
        node('span', 'sb-edit-hint', '排序编辑中，请用三角按钮调整顺序'),
        save,
        cancel
      );

      const box = node('div', 'sb-msgs');
      box.id = 'sb-msgs';
      const footer = node('div', 'cw-footer');
      const status = node('span');
      status.id = 'sb-status';
      footer.append(status, DOC.createTextNode(' · 🌿 回复分支 · 梨梨工作台 v3.6 无书摘版'));

      p.append(toolbar, editBar, box, footer);
      container.append(p);
      syncThemeUi();
      renderMessages();
    }

    modules.history = { open, close, canLeave, element: () => panel };
  })();

  /* ═════════════ 📖 预设工作台（白川 & 梨梨 v1.1） ═════════════ */
  function createPresetModule() {
    const D = DOC;
    let disposed = false, busy = false, panel = null;
    let current = '', names = [], work = null, baseline = null, manager = null;
    let groupId = '100001', entryQuery = '', bookQuery = '', viewMode = 'used';
    let ui = {}, closeEditor = null, dirty = false, undoRecord = null;
    const presetBulk = { on: false, selected: new Set() };
    const dialogs = new Map();
    let listRevision = 0;
    const ENABLE_IMAGE = PEAR_SWITCH_IMAGE;
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function el(tag, className = '', text) {
    const node = D.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(text, action, className = '') {
    const node = el('button', 'pw-button ' + className, text);
    node.type = 'button';
    node.addEventListener('click', () => {
      Promise.resolve()
        .then(action)
        .catch(error => notice(error?.message || String(error)));
    });
    return node;
  }

  function textInput(value = '', placeholder = '') {
    const node = el('input');
    node.type = 'text';
    node.value = value;
    node.placeholder = placeholder;
    return node;
  }

  function textArea(value = '', rows = 8) {
    const node = el('textarea');
    node.value = value;
    node.rows = rows;
    node.spellcheck = false;
    return node;
  }

  function row(...children) {
    const node = el('div', 'pw-row');
    node.append(...children);
    return node;
  }

  function field(label, control) {
    const node = el('label', 'pw-field');
    control.setAttribute('aria-label', label);
    node.append(el('span', '', label), control);
    return node;
  }

  function select(options, value) {
    const node = el('select');
    for (const [key, label] of options) {
      const option = el('option', '', label);
      option.value = key;
      node.append(option);
    }
    node.value = value;
    return node;
  }


  function createSwitch(entry, change) {
    // Native button keyboard behavior, checkbox semantics, isolated image rendering.
    // No input[type=checkbox], theme pseudo-checkmark, or built-in tick icon.
    const control = el('button', 'pw-check');
    control.type = 'button';
    control.setAttribute('role', 'checkbox');
    // A span is an allowed shadow host; HTMLButtonElement is not.
    const art = el('span', 'pw-check-art');
    art.setAttribute('aria-hidden', 'true');
    art.style.cssText = 'all: initial !important; display: block !important; width: 22px !important; height: 22px !important; pointer-events: none !important;';
    control.append(art);
    const root = art.attachShadow({ mode: 'open' });
    const style = el('style');
    style.textContent = `
      :host { -webkit-tap-highlight-color: transparent; }
      .frame { all: initial; box-sizing: border-box; width: 22px; height: 22px; display: grid; place-items: center; border: 1px solid var(--pw-border, #808080); border-radius: 4px; background: transparent; pointer-events: none; }
      img, .heart { all: initial; grid-area: 1 / 1; width: 20px; height: 20px; pointer-events: none; }
      img { display: block; object-fit: contain; }
      .heart { display: grid; place-items: center; color: #ed8eae; -webkit-text-stroke: .5px #75465b; font: 19px/20px sans-serif; }
      [hidden] { display: none !important; }
    `;
    const frame = el('span', 'frame');
    const image = el('img');
    image.alt = ''; image.draggable = false;
    const fallback = el('span', 'heart', '♥');
    fallback.setAttribute('aria-hidden', 'true');
    let checked = !!entry.enabled, loaded = false;
    function paint() {
      control.setAttribute('aria-checked', String(checked));
      control.setAttribute('aria-label', checked ? '已启用，点击停用条目' : '已停用，点击启用条目');
      control.title = checked ? '已启用，点击停用' : '已停用，点击启用';
      image.hidden = !checked || !loaded;
      fallback.hidden = !checked || loaded;
    }
    image.addEventListener('load', () => { loaded = true; paint(); });
    image.addEventListener('error', () => { loaded = false; paint(); });
    Object.defineProperty(control, 'checked', {
      get: () => checked,
      set(value) { checked = !!value; paint(); }
    });
    frame.append(image, fallback); root.append(style, frame);
    paint(); image.src = ENABLE_IMAGE;
    control.addEventListener('click', () => {
      if (control.disabled) return;
      control.checked = !checked;
      Promise.resolve().then(change).catch(error => {
        control.checked = !!entry.enabled;
        notice(error?.message || String(error));
      });
    });
    return control;
  }

  // Composite translucent theme layers into the same visible, opaque color.
  function opaqueSurface(source) {
    const canvas = D.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const layers = [];
    for (let node = source; node; node = node.parentElement) layers.push(W.getComputedStyle(node).backgroundColor);
    ctx.fillStyle = W.getComputedStyle(D.documentElement).colorScheme === 'dark' ? '#000' : '#fff';
    ctx.fillRect(0, 0, 1, 1);
    for (const color of layers.reverse()) { ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); }
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgb(${r}, ${g}, ${b})`;
  }

  function suspendEditorBackground() {
    const changes = [];
    function set(node, key, value) {
      if (!node) return;
      changes.push([node, key, node.style.getPropertyValue(key), node.style.getPropertyPriority(key)]);
      node.style.setProperty(key, value, 'important');
    }
    // The modal has its own opaque surface; keep the blurred workbench out of paint.
    set(hub || panel, 'visibility', 'hidden');
    for (const node of [D.documentElement, D.body]) {
      set(node, 'overflow-x', 'hidden');
      set(node, 'overflow-y', 'hidden');
      set(node, 'overscroll-behavior-x', 'none');
      set(node, 'overscroll-behavior-y', 'none');
    }
    let restored = false;
    return () => {
      if (restored) return;
      restored = true;
      for (const [node, key, value, priority] of changes.reverse()) {
        if (value) node.style.setProperty(key, value, priority);
        else node.style.removeProperty(key);
      }
    };
  }

  function openContentEditor(source, title) {
    closeEditor?.();
    const modal = el('dialog', 'pw-dialog pw-editor');
    const editor = textArea(source.value);
    editor.setAttribute('aria-label', '全屏正文');
    const search = textInput('', '搜索正文（区分大小写）');
    search.setAttribute('aria-label', '搜索正文');
    const status = el('span', 'pw-note', '输入文字查找');
    let matches = [], index = -1;
    let restoreBackground = () => {};
    let finished = false;
    function scan() {
      matches = []; index = -1;
      if (search.value) {
        let at = 0;
        while ((at = editor.value.indexOf(search.value, at)) !== -1) {
          matches.push(at); at += search.value.length;
        }
      }
      status.textContent = search.value ? '共 ' + matches.length + ' 处' : '输入文字查找';
    }
    function jump(step) {
      if (!matches.length) return;
      index = (index + step + matches.length) % matches.length;
      const at = matches[index];
      editor.focus(); editor.setSelectionRange(at, at + search.value.length);
      // Textarea selection is the native, editable search highlight.
      const before = editor.value.slice(0, at).split('\n');
      const style = W.getComputedStyle(editor);
      const columns = Math.max(1, Math.floor(editor.clientWidth / (parseFloat(style.fontSize) * .65)));
      const lines = before.slice(0, -1).reduce((n, line) => n + Math.max(1, Math.ceil(line.length / columns)), 0);
      editor.scrollTop = Math.max(0, (lines + Math.floor(before.at(-1).length / columns)) * parseFloat(style.lineHeight) - editor.clientHeight / 3);
      status.textContent = (index + 1) + ' / ' + matches.length;
    }
    function sync() {
      if (source.value !== editor.value) {
        source.value = editor.value;
        source.dispatchEvent(new W.Event('input', { bubbles: true }));
      }
    }
    function finish() {
      if (finished) return;
      finished = true;
      sync(); dialogs.delete(modal);
      restoreBackground();
      if (modal.open) modal.close();
      modal.remove();
      closeEditor = null;
      if (source.isConnected) source.focus({ preventScroll: true });
    }
    closeEditor = finish;
    dialogs.set(modal, finish);
    const heading = row(el('strong', '', title || '正文编辑'), button('退出全屏', finish, 'pw-primary'));
    heading.classList.add('pw-editor-head');
    const toolbar = row(search, button('上一处', () => jump(index < 0 ? 0 : -1)), button('下一处', () => jump(1)), status);
    toolbar.classList.add('pw-editor-search');
    modal.append(heading, toolbar, editor, el('div', 'pw-note', '正文已同步到草稿；退出后点击顶部「保存修改」写入预设。'));
    search.addEventListener('input', () => { scan(); jump(1); search.focus(); });
    editor.addEventListener('input', () => { sync(); scan(); });
    modal.addEventListener('cancel', e => { e.preventDefault(); finish(); });
    modal.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter' && e.target === search && !e.isComposing) { e.preventDefault(); jump(e.shiftKey ? (index < 0 ? 0 : -1) : 1); }
    });
    const sourceStyle = W.getComputedStyle(source);
    const panelStyle = W.getComputedStyle(panel);
    const surface = opaqueSurface(source);
    for (const key of ['--pw-border', '--pw-accent', '--pw-soft', '--pw-dim']) {
      modal.style.setProperty(key, panelStyle.getPropertyValue(key));
    }
    modal.style.setProperty('--pw-bg', surface);
    modal.style.setProperty('--pw-surface', surface);
    modal.style.setProperty('--pw-text', sourceStyle.color);
    editor.style.font = sourceStyle.font;
    editor.style.lineHeight = sourceStyle.lineHeight;
    D.body.append(modal);
    restoreBackground = suspendEditorBackground();
    try {
      modal.showModal();
      editor.focus({ preventScroll: true });
    } catch (error) {
      finish();
      throw error;
    }
  }

  function context() {
    const ctx = W.SillyTavern?.getContext?.();
    if (!ctx?.getPresetManager) throw Error('当前酒馆没有开放预设管理接口，请使用 SillyTavern 1.19.0 的聊天补全预设。');
    return ctx;
  }
  function connect() {
    manager = context().getPresetManager('openai');
    if (!manager?.getPresetList || !manager?.savePreset || !manager?.selectPreset) throw Error('聊天补全预设管理器尚未就绪。');
  }
  function savedPreset(name) {
    const data = manager.getPresetList();
    const index = data.preset_names[name];
    if (!Object.prototype.hasOwnProperty.call(data.preset_names, name) || !data.presets[index]) throw Error('预设「' + name + '」不存在，请刷新列表。');
    const preset = clone(data.presets[index]);
    if (!Array.isArray(preset.prompts)) throw Error('该文件不是可编辑的聊天补全预设。');
    return preset;
  }
  function same(a, b) {
    function stable(x) {
      if (Array.isArray(x)) return x.map(stable);
      if (x && typeof x === 'object') return Object.fromEntries(Object.keys(x).sort().map(k => [k, stable(x[k])]));
      return x;
    }
    return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
  }
  function groupOptions(raw) {
    const groups = Array.isArray(raw.prompt_order) ? raw.prompt_order : [];
    return groups.length ? groups.map(g => [String(g.character_id), Number(g.character_id) === 100001 ? '默认条目顺序' : '顺序组 ' + g.character_id]) : [['100001', '默认条目顺序']];
  }
  function orderFor(raw, id, create = false) {
    let block = raw.prompt_order?.find(g => String(g.character_id) === String(id));
    if (!block && create) {
      raw.prompt_order ||= [];
      block = { character_id: Number(id), order: [] };
      raw.prompt_order.push(block);
    }
    return block?.order || [];
  }
  function promptRows(raw, id, mode = 'all') {
    const registry = new Map(raw.prompts.map(p => [p.identifier, p]));
    const used = new Set(), rows = [];
    orderFor(raw, id).forEach((item, index) => {
      const prompt = registry.get(item.identifier);
      if (!prompt || used.has(item.identifier)) return;
      used.add(item.identifier);
      if (mode !== 'unused') rows.push({ prompt, item, index, used: true });
    });
    if (mode !== 'used') raw.prompts.forEach(prompt => {
      if (!used.has(prompt.identifier)) rows.push({ prompt, item: null, index: -1, used: false });
    });
    return rows;
  }
  function termsMatch(prompt, query) {
    const text = [prompt.name, prompt.content, prompt.identifier, ...(prompt.pw_source?.keys || [])].join('\n').toLocaleLowerCase();
    return query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).every(word => text.includes(word));
  }
  function labelPrompt(p) { return p.name || p.identifier || '未命名条目'; }
  function markDirty() { dirty = true; updateStatus(); schedulePresetTokens(900); }
  let presetTokenTimer = 0, presetTokenRev = 0;
  function schedulePresetTokens(delay) {
    W.clearTimeout(presetTokenTimer);
    presetTokenTimer = W.setTimeout(paintPresetTokens, delay);
  }
  async function paintPresetTokens() {
    const target = ui.tokenLine;
    if (!target?.isConnected || !work) return;
    const my = ++presetTokenRev;
    if (!target.textContent) target.textContent = 'Token 统计中…';
    try {
      const byId = new Map(work.prompts.map(p => [p.identifier, p]));
      const order = orderFor(work, groupId);
      const enabled = order.filter(o => o.enabled !== false).map(o => byId.get(o.identifier)).filter(p => p && typeof p.content === 'string');
      const on = await sumTokens(enabled.map(p => p.content));
      const all = await sumTokens(work.prompts.map(p => String(p.content ?? '')));
      if (my !== presetTokenRev || !target.isConnected) return;
      target.textContent = '当前顺序组 · 启用 ' + enabled.length + ' 条 · ' + fmtTok(on) + ' tokens ｜ 全部条目 ' + fmtTok(all) + ' tokens' + (dirty ? '（含未保存修改）' : '');
    } catch (error) {
      if (my === presetTokenRev) target.textContent = 'Token 统计失败：' + error.message;
    }
  }
  function updateStatus() {
    if (!ui.status) return;
    ui.status.textContent = busy ? '正在处理，请稍候…' : (current ? current + ' · ' + (work?.prompts.length || 0) + ' 个条目 · ' + (dirty ? '有未保存修改' : '已保存版本') : '请选择预设');
    if (ui.save) ui.save.textContent = dirty ? '保存修改 *' : '保存修改';
  }
  function setBusy(value) {
    busy = value;
    panel?.querySelectorAll('button,input,textarea,select').forEach(control => {
      if (value) { control.dataset.pwWasDisabled = control.disabled ? '1' : '0'; control.disabled = true; }
      else if (control.dataset.pwWasDisabled !== undefined) { control.disabled = control.dataset.pwWasDisabled === '1'; delete control.dataset.pwWasDisabled; }
    });
    updateStatus();
  }
  async function discardChanges() {
    if (busy) return false;
    if (dirty && !await ask('预设工作台有未保存修改，确认放弃？')) return false;
    return true;
  }
  function downloadFile(name, text, type = 'application/json;charset=utf-8') {
    const url = W.URL.createObjectURL(new W.Blob([text], { type }));
    const a = el('a'); a.href = url; a.download = name; D.body.append(a); a.click(); a.remove();
    W.setTimeout(() => W.URL.revokeObjectURL(url), 10000);
  }
  function validatePreset(raw) {
    const ids = new Set();
    for (const prompt of raw.prompts) {
      if (!prompt.identifier || ids.has(prompt.identifier)) throw Error('条目标识缺失或重复，已停止保存。');
      ids.add(prompt.identifier);
    }
  }
  async function persist(name, next, expected) {
    validatePreset(next);
    if (!same(savedPreset(name), expected)) throw Error('「' + name + '」已被其他页面修改。请先导出草稿，再刷新预设后重试。');
    // skipUpdate avoids selecting the preset or triggering the expensive native UI renderer.
    await manager.savePreset(name, clone(next), { skipUpdate: true });
    const data = manager.getPresetList();
    if (!Object.prototype.hasOwnProperty.call(data.preset_names, name)) throw Error('保存期间预设列表改变，请刷新酒馆确认保存结果。');
    data.presets[data.preset_names[name]] = clone(next);
  }
  async function saveWork() {
    if (busy || !work || !dirty) return !dirty;
    try { checkParams(); } catch(error) { notice(error.message); return false; }
    setBusy(true);
    try {
      await persist(current, work, baseline);
      baseline = clone(work); dirty = false;
      updateStatus(); return true;
    } catch (error) { notice('保存失败：' + error.message); return false; }
    finally { setBusy(false); }
  }
  async function choosePreset(name) {
    if (!await discardChanges()) return;
    const next = savedPreset(name);
    current = name; work = next; baseline = clone(next); dirty = false;
    const options = groupOptions(work); groupId = options.some(g => g[0] === '100001') ? '100001' : options[0][0];
    entryQuery = ''; viewMode = 'used';
    renderBooks(); renderMain(); updateStatus();
  }
  async function refreshCatalog() {
    if (!await discardChanges()) return;
    connect(); names = manager.getAllPresets().filter(name => name && name !== 'in_use');
    if (names.includes(current)) { work = savedPreset(current); baseline = clone(work); dirty = false; }
    else { current = ''; work = baseline = null; dirty = false; }
    renderBooks(); renderMain(); updateStatus();
  }
  async function renamePreset(name) {
    if (busy) return;
    if (name === current && dirty) { notice('这个预设还有未保存的修改，请先「保存修改」再改名。'); return; }
    const value = await dialog('新的预设名称：', 'prompt', name);
    if (value === null) return;
    const next = value.trim();
    if (!next || next === name) return;
    if (next === 'in_use') { notice('这个名字是酒馆保留的，请换一个。'); return; }
    if (/[\\/:*?"<>|]/.test(next)) { notice('名称里不能有 \\ / : * ? " < > | 这些字符。'); return; }
    connect();
    if (manager.getAllPresets().includes(next)) { notice('已经有一个叫「' + next + '」的预设了。'); return; }
    const wasSelected = manager.getSelectedPresetName() === name;
    setBusy(true);
    try {
      const helper = [globalThis.renamePreset, W.renamePreset, globalThis.TavernHelper?.renamePreset, W.TavernHelper?.renamePreset]
        .find(fn => typeof fn === 'function');
      if (helper) {
        const ok = await helper(name, next);
        if (ok === false) throw Error('酒馆助手未能完成改名。');
      } else {
        if (typeof manager.deletePreset !== 'function') throw Error('当前酒馆不支持删除预设，无法改名。');
        const data = manager.getPresetList();
        const raw = data.presets[data.preset_names[name]];
        if (!raw) throw Error('预设「' + name + '」不存在，请刷新列表。');
        await manager.savePreset(next, clone(raw));
        connect();
        if (!manager.getAllPresets().includes(next)) throw Error('新名称的预设没有写入成功，旧预设未删除。');
        if (wasSelected) {
          const value = manager.findPreset(next);
          if (value !== undefined && value !== null && value !== '') await manager.selectPreset(value);
        }
        await manager.deletePreset(name);
      }
      connect();
      const list = manager.getAllPresets();
      if (!list.includes(next)) throw Error('改名结果未能确认，请刷新后检查。');
      if (current === name) current = next;
      if (undoRecord?.name === name) undoRecord.name = next;
      names = list.filter(item => item && item !== 'in_use');
      if (current === next) { work = savedPreset(next); baseline = clone(work); dirty = false; }
    } finally {
      setBusy(false);
    }
    renderBooks(); renderMain(); updateStatus();
    const leftover = manager.getAllPresets().includes(name);
    notice('已改名为「' + next + '」。' + (leftover ? '\n旧名字的预设还在列表里，可以手动删除。' : '') +
      (wasSelected ? '\n酒馆正在使用的就是它，已自动切到新名字。' : ''));
  }

  function exportPreset(name) {
    connect();
    const data = manager.getPresetList();
    const raw = data.presets[data.preset_names[name]];
    if (!raw) throw Error('预设「' + name + '」不存在，请刷新列表。');
    downloadFile(name + '.json', JSON.stringify(raw, null, 2));
  }

  async function removePreset(name) {
    if (busy) return;
    connect();
    if (manager.getSelectedPresetName() === name) {
      notice('酒馆正在使用「' + name + '」，请先切换到别的预设再删除。');
      return;
    }
    if (!await ask('永久删除预设「' + name + '」？\n删除后无法恢复，需要的话先点「导出」备份。')) return;
    setBusy(true);
    try {
      const helper = helperFn('deletePreset');
      if (helper) {
        if (await helper(name) === false) throw Error('酒馆助手未能删除这个预设。');
      } else if (typeof manager.deletePreset === 'function') {
        await manager.deletePreset(name);
      } else {
        throw Error('当前酒馆不支持删除预设。');
      }
      connect();
      if (manager.getAllPresets().includes(name)) throw Error('删除结果未能确认，请刷新后检查。');
      names = manager.getAllPresets().filter(item => item && item !== 'in_use');
      if (current === name) { current = ''; work = baseline = null; dirty = false; }
      if (undoRecord?.name === name) undoRecord = null;
    } finally {
      setBusy(false);
    }
    renderBooks(); renderMain(); updateStatus();
    notice('已删除「' + name + '」。');
  }

  async function importPresets() {
    if (busy) return;
    const files = await pickFiles('.json,application/json', true);
    if (!files.length || disposed) return;
    connect();
    const helper = helperFn('importRawPreset');
    const done = [], failed = [];
    setBusy(true);
    try {
      for (const file of files) {
        try {
          const text = await fileText(file);
          const data = JSON.parse(text);
          if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('不是预设文件');
          if (!Array.isArray(data.prompts)) throw Error('没有 prompts，不像聊天补全预设');
          let name = file.name.replace(/\.json$/i, '').trim() || '导入的预设';
          const taken = manager.getAllPresets();
          if (taken.includes(name)) {
            if (name === current && dirty) name = uniqueName(name, taken);
            else if (!await ask('已经有叫「' + name + '」的预设了。\n确定 = 覆盖它；取消 = 另存为新名字。')) name = uniqueName(name, taken);
          }
          if (helper) {
            if (await helper(name + '.json', JSON.stringify(data)) === false) throw Error('酒馆助手导入失败');
          } else {
            await manager.savePreset(name, data);
          }
          connect();
          if (!manager.getAllPresets().includes(name)) throw Error('导入结果未能确认');
          done.push(name);
        } catch (error) {
          failed.push(file.name + '：' + error.message);
        }
      }
    } finally {
      setBusy(false);
    }
    names = manager.getAllPresets().filter(item => item && item !== 'in_use');
    if (current && done.includes(current) && !dirty) { work = savedPreset(current); baseline = clone(work); }
    renderBooks(); renderMain(); updateStatus();
    notice((done.length ? '已导入：\n' + done.map(n => '· ' + n).join('\n') : '没有导入成功的预设。') +
      (failed.length ? '\n\n失败：\n' + failed.join('\n') : ''));
  }

  async function usePreset() {
    if (busy || !current) return;
    const name = current;
    if (dirty && !await saveWork()) return;
    if (!await ask('切换使用「' + name + '」？\n将加载它的已保存内容，酒馆原页面尚未保存的预设修改会被覆盖。')) return;
    const value = manager.findPreset(name);
    if (value === undefined || value === null || value === '') throw Error('预设不在酒馆列表中，请刷新。');
    setBusy(true);
    try {
      await manager.selectPreset(value);
      if (manager.getSelectedPresetName() !== name) throw Error('切换未完成，请检查原酒馆页面。');
      renderBooks(); notice('已切换使用「' + name + '」。');
    } finally { setBusy(false); }
  }
  function updatePresetBulkStatus() {
    for (const name of [...presetBulk.selected]) if (!names.includes(name)) presetBulk.selected.delete(name);
    if (ui.presetBulkStatus) ui.presetBulkStatus.textContent = '已选 ' + presetBulk.selected.size + ' 个';
  }

  function renderPresetBulkBar() {
    const bar = ui.presetBulkBar;
    if (!bar) return;
    bar.replaceChildren();
    if (!presetBulk.on) {
      bar.append(row(button('导入预设', importPresets), button('批量删除预设', () => {
        if (busy) return;
        presetBulk.on = true;
        presetBulk.selected.clear();
        renderBooks();
      })));
      return;
    }
    const status = el('div', 'pw-note', '');
    ui.presetBulkStatus = status;
    bar.append(status, row(
      button('全选当前列表', () => {
        const q = bookQuery.toLocaleLowerCase();
        names.filter(name => name.toLocaleLowerCase().includes(q)).forEach(name => presetBulk.selected.add(name));
        renderBooks();
      }),
      button('取消全选', () => { presetBulk.selected.clear(); renderBooks(); }),
      button('删除选中', removePresets, 'pw-danger'),
      button('退出', () => { presetBulk.on = false; presetBulk.selected.clear(); renderBooks(); })
    ));
    updatePresetBulkStatus();
  }

  async function removePresets() {
    if (busy) return;
    connect();
    const inUse = manager.getSelectedPresetName();
    let list = [...presetBulk.selected].filter(name => names.includes(name));
    const skipped = list.includes(inUse);
    list = list.filter(name => name !== inUse);
    if (!list.length) {
      notice(skipped ? '选中的只有酒馆正在使用的预设，它不能删除，请先切换到别的预设。' : '请先点爱心选择要删除的预设。');
      return;
    }
    if (list.includes(current) && dirty && !await ask('「' + current + '」还有未保存的修改，删除后会一起丢掉。继续吗？')) return;
    const preview = list.slice(0, 12).map(name => '· ' + name).join('\n') + (list.length > 12 ? '\n……共 ' + list.length + ' 个' : '');
    if (!await ask('永久删除这 ' + list.length + ' 个预设？删除后无法恢复，需要的话先打开它点「导出此预设」备份。' +
      (skipped ? '\n（酒馆正在使用的「' + inUse + '」会被跳过）' : '') + '\n\n' + preview)) return;
    const helper = helperFn('deletePreset');
    const failed = [];
    setBusy(true);
    try {
      for (const name of list) {
        try {
          if (helper) {
            if (await helper(name) === false) throw Error('酒馆助手未能删除');
          } else if (typeof manager.deletePreset === 'function') {
            await manager.deletePreset(name);
          } else {
            throw Error('当前酒馆不支持删除预设');
          }
          connect();
          if (manager.getAllPresets().includes(name)) throw Error('删除结果未能确认');
          if (current === name) { current = ''; work = baseline = null; dirty = false; }
          if (undoRecord?.name === name) undoRecord = null;
        } catch (error) {
          failed.push(name + '：' + error.message);
        }
      }
      names = manager.getAllPresets().filter(item => item && item !== 'in_use');
      presetBulk.selected.clear();
      presetBulk.on = false;
    } finally {
      setBusy(false);
    }
    renderBooks(); renderMain(); updateStatus();
    const ok = list.length - failed.length;
    notice((ok ? '已删除 ' + ok + ' 个预设。' : '没有删除任何预设。') +
      (skipped ? '\n酒馆正在使用的「' + inUse + '」已跳过。' : '') +
      (failed.length ? '\n\n失败：\n' + failed.join('\n') : ''));
  }

  function renderBooks() {
    if (!ui.books) return;
    const selected = manager?.getSelectedPresetName?.();
    renderPresetBulkBar();
    ui.books.replaceChildren();
    names.filter(name => name.toLocaleLowerCase().includes(bookQuery.toLocaleLowerCase())).forEach(name => {
      const card = el('div', 'pw-book' + (name === current ? ' is-active' : ''));
      const acts = el('div', 'pw-book-actions');
      acts.append(button('浏览条目', () => choosePreset(name)));
      const titleRow = el('div', 'pw-book-title-row');
      if (presetBulk.on) {
        const pick = heartSwitch(presetBulk.selected.has(name), '选择删除「' + name + '」');
        pick.addEventListener('change', () => {
          pick.checked ? presetBulk.selected.add(name) : presetBulk.selected.delete(name);
          updatePresetBulkStatus();
        });
        titleRow.append(pick);
      }
      titleRow.append(el('div', 'pw-book-name', name));
      card.append(titleRow, el('div', 'pw-note', [name === selected ? '酒馆正在使用' : '', name === current ? '工作台当前查看' : ''].filter(Boolean).join(' · ') || '已保存预设'), presetBulk.on ? el('span') : acts);
      ui.books.append(card);
    });
    if (!ui.books.children.length) ui.books.append(el('div', 'pw-empty', '没有匹配预设'));
  }
  const PARAMS = [
    ['openai_max_context', '上下文长度（Token）', 1, null, 1],
    ['openai_max_tokens', '最大回复长度（Token）', 1, null, 1],
    ['n', '每次生成多个备选回复', 1, null, 1],
    ['temperature', '温度', 0, 2, .01],
    ['frequency_penalty', '频率惩罚', -2, 2, .01],
    ['presence_penalty', '存在惩罚', -2, 2, .01],
    ['top_p', 'Top P', 0, 1, .01]
  ];
  function numeric(value, min, max, integer, label) {
    if (String(value).trim() === '') throw Error(label + '不能为空');
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || (max !== null && n > max) || (integer && !Number.isSafeInteger(n))) throw Error(label + '数值无效');
    return n;
  }
  function renderParams(parent) {
    const box = el('details', 'pw-box'); box.append(el('summary', '', '预设设置 · 仅保留常用参数'));
    const grid = el('div', 'pw-fields-grid');
    const unlock = createSwitch({ enabled: !!work.max_context_unlocked }, () => { work.max_context_unlocked = unlock.checked; markDirty(); });
    const stream = createSwitch({ enabled: !!work.stream_openai }, () => { work.stream_openai = stream.checked; markDirty(); });
    grid.append(field('解锁上下文上限', unlock), field('流式传输', stream));
    for (const [key, label, min, max, step] of PARAMS) {
      const input = el('input'); input.type = 'number'; input.min = String(min); if (max !== null) input.max = String(max); input.step = String(step); input.value = String(work[key] ?? (key === 'n' ? 1 : key === 'top_p' ? 1 : key === 'openai_max_context' ? 4096 : key === 'openai_max_tokens' ? 1024 : 0));
      input.addEventListener('input', () => { ui.invalidParams.add(key); markDirty(); });
      input.addEventListener('change', () => {
        try { work[key] = numeric(input.value, min, max, step === 1, label); input.setCustomValidity(''); ui.invalidParams.delete(key); }
        catch (error) { input.setCustomValidity(error.message); notice(error.message); }
      });
      ui.paramInputs.set(key, input); grid.append(field(label, input));
    }
    box.append(grid, el('p', 'pw-note', '输入数字后点击顶部「保存修改」。解锁上下文只解除酒馆界面限制，不改变模型自身容量。'));
    parent.append(box);
  }
  function checkParams() {
    for (const [key, label, min, max, step] of PARAMS) {
      const input = ui.paramInputs?.get(key);
      if (input && ui.invalidParams?.has(key)) { work[key] = numeric(input.value, min, max, step === 1, label); ui.invalidParams.delete(key); }
    }
  }
  function movePrompt(id, anchor, side) {
    const order = orderFor(work, groupId, true), from = order.findIndex(p => p.identifier === id);
    if (from < 0) return;
    if (id === anchor) return;
    const [item] = order.splice(from, 1);
    let at = anchor === '__start' ? 0 : anchor === '__end' ? order.length : order.findIndex(p => p.identifier === anchor);
    if (at < 0) { order.splice(from, 0, item); throw Error('目标位置不存在'); }
    if (!['__start', '__end'].includes(anchor) && side === 'after') at++;
    order.splice(at, 0, item); markDirty(); renderList(id);
  }
  function renderPrompt(record) {
    const p = record.prompt, card = el('article', 'pw-entry' + (record.item?.enabled === false ? ' is-disabled' : ''));
    card.dataset.promptId = p.identifier;
    const head = el('div', 'pw-entry-head'), body = el('div', 'pw-entry-body'); body.hidden = true;
    let constructed = false;
    const enable = createSwitch({ enabled: record.used && record.item.enabled !== false }, () => {
      record.item.enabled = enable.checked; markDirty(); card.classList.toggle('is-disabled', !enable.checked);
    });
    enable.disabled = !record.used;
    const toggle = button('▸ ' + labelPrompt(p), () => {
      if (!constructed) { construct(); constructed = true; }
      body.hidden = !body.hidden;
      toggle.textContent = (body.hidden ? '▸ ' : '▾ ') + labelPrompt(p);
      toggle.setAttribute('aria-expanded', String(!body.hidden));
    }, 'pw-expand');
    toggle.setAttribute('aria-expanded', 'false');
    head.append(enable, toggle, el('span', 'pw-badge', p.marker ? '占位' : record.used ? String(record.index + 1) : '未加入'));
    card.append(head, body);
    function construct() {
      const title = textInput(p.name || '', '条目名称');
      title.addEventListener('input', () => { p.name = title.value; toggle.textContent = '▾ ' + labelPrompt(p); markDirty(); });
      const grid = el('div', 'pw-fields-grid'); grid.append(field('条目名称', title));
      body.append(grid);
      if (!p.marker) {
        const role = select([['system', '系统'], ['user', '用户'], ['assistant', '助手']], p.role || 'system');
        role.addEventListener('change', () => { p.role = role.value; markDirty(); }); grid.append(field('角色', role));
        const content = textArea(p.content || '', 9); content.className = 'pw-entry-content';
        content.addEventListener('input', () => { p.content = content.value; markDirty(); });
        body.append(field('正文', content), row(button('正文全屏', () => openContentEditor(content, p.name))),
          translateBox(() => content.value, 'preset|' + current + '|' + p.identifier, '译文 · ' + (p.name || '条目')));
        if (entryQuery.trim()) {
          const term = entryQuery.trim().split(/\s+/)[0], at = content.value.toLocaleLowerCase().indexOf(term.toLocaleLowerCase());
          if (at >= 0) content.setSelectionRange(at, at + term.length);
        }
      } else body.append(el('p', 'pw-note', '此项是角色卡、世界书或聊天记录的占位条目，正文由酒馆生成。'));
      const pos = el('details', 'pw-box'); pos.append(el('summary', '', '插入方式与位置'));
      const type = select([['0', '按列表相对顺序'], ['1', '插入聊天记录深度']], String(p.injection_type || 0));
      const depth = textInput(String(p.injection_depth ?? 4)); depth.type = 'number'; depth.min = '0'; depth.step = '1';
      const order = textInput(String(p.injection_order ?? 100)); order.type = 'number'; order.min = '0'; order.step = '1';
      type.addEventListener('change', () => { p.injection_type = Number(type.value); markDirty(); });
      for (const [input, key] of [[depth, 'injection_depth'], [order, 'injection_order']]) input.addEventListener('change', () => {
        try { p[key] = numeric(input.value, 0, null, true, '插入位置'); markDirty(); } catch (error) { input.value = String(p[key] ?? (key === 'injection_depth' ? 4 : 100)); notice(error.message); }
      });
      pos.append(field('方式', type), row(field('深度', depth), field('同深度顺序', order)));
      body.append(pos);
      if (record.used) {
        const up = button('上移一位', () => shiftPrompt(p.identifier, -1));
        const down = button('下移一位', () => shiftPrompt(p.identifier, 1));
        up.disabled = record.index === 0; down.disabled = record.index === orderFor(work, groupId).length - 1;
        body.append(row(up, down));
        const target = select([['__start', '列表最前'], ['__end', '列表最后'], ...promptRows(work, groupId, 'used').filter(r => r.prompt.identifier !== p.identifier).map(r => [r.prompt.identifier, (r.index + 1) + ' · ' + labelPrompt(r.prompt)])], '__end');
        const side = select([['before', '前面'], ['after', '后面']], 'before');
        body.append(row(target, side, button('移动到这里', () => movePrompt(p.identifier, target.value, side.value))), button('移出列表（保留条目）', async () => {
          if (!await ask('将「' + labelPrompt(p) + '」移到未加入条目？正文仍保留。')) return;
          const list = orderFor(work, groupId, true), i = list.findIndex(x => x.identifier === p.identifier); list.splice(i, 1); markDirty(); renderList();
        }));
      } else body.append(button('加入列表末尾', () => { orderFor(work, groupId, true).push({ identifier: p.identifier, enabled: true }); markDirty(); renderList(); }));
      body.append(button('删除条目', () => deletePrompt(p.identifier)));
      body.append(el('p', 'pw-note', '编辑结果为草稿，点击顶部「保存修改」统一保存。'));
    }
    return card;
  }
  function shiftPrompt(id, direction) {
    const list = orderFor(work, groupId), index = list.findIndex(p => p.identifier === id), next = index + direction;
    if (index < 0 || next < 0 || next >= list.length) return;
    movePrompt(id, list[next].identifier, direction < 0 ? 'before' : 'after');
  }
  async function createPrompt() {
    if (busy || !work) return;
    const name = await dialog('新条目名称', 'prompt', '新条目');
    if (name === null) return;
    if (!name.trim()) { notice('条目名称不能为空。'); return; }
    const id = newIdentifier(new Set(work.prompts.map(p => p.identifier)));
    work.prompts.push({ identifier: id, name: name.trim(), role: 'system', content: '', system_prompt: false, marker: false, injection_type: 0, injection_depth: 4, injection_order: 100 });
    orderFor(work, groupId, true).push({ identifier: id, enabled: true });
    entryQuery = ''; viewMode = 'used';
    if (ui.search) ui.search.value = '';
    if (ui.mode) ui.mode.value = 'used';
    markDirty(); renderList(id);
  }
  function removePrompt(raw, id) {
    raw.prompts = raw.prompts.filter(p => p.identifier !== id);
    for (const group of raw.prompt_order || []) group.order = (group.order || []).filter(p => p.identifier !== id);
  }
  async function deletePrompt(id) {
    if (busy || !work) return;
    const prompt = work.prompts.find(p => p.identifier === id);
    if (!prompt) return;
    const special = prompt.marker || SPECIAL.has(id);
    if (!await ask('删除「' + labelPrompt(prompt) + '」及其在所有顺序组中的引用？\n' + (special ? '这是系统/占位条目，删除会影响提示词结构。\n' : '') + '此操作先记入草稿，点击「保存修改」后才写入预设。')) return;
    removePrompt(work, id); markDirty(); renderList();
  }
  function renderList(revealId = null) {
    if (!ui.list || !work) return;
    const revision = ++listRevision, list = ui.list, count = ui.pager;
    const rows = promptRows(work, groupId, viewMode).filter(r => termsMatch(r.prompt, entryQuery));
    list.replaceChildren();
    count.replaceChildren(el('span', 'pw-note', '共 ' + rows.length + ' 个条目 · 同页显示'));
    if (!rows.length) { list.append(el('div', 'pw-empty', '没有匹配条目')); return; }
    let offset = 0;
    function appendChunk() {
      if (disposed || revision !== listRevision || !list.isConnected) return;
      const fragment = D.createDocumentFragment();
      const chunk = rows.slice(offset, offset + 40);
      let focusCard = null;
      for (const record of chunk) {
        const card = renderPrompt(record); fragment.append(card);
        if (record.prompt.identifier === revealId) focusCard = card;
      }
      list.append(fragment); offset += chunk.length;
      // Saving can overlap a frame; do not create interactive controls under the busy lock.
      if (busy) list.querySelectorAll('button,input,textarea,select').forEach(c => { if (c.dataset.pwWasDisabled === undefined) { c.dataset.pwWasDisabled = c.disabled ? '1' : '0'; c.disabled = true; } });
      if (focusCard) { focusCard.querySelector('.pw-expand').click(); focusCard.scrollIntoView({ block: 'center' }); }
      if (offset < rows.length) W.requestAnimationFrame(appendChunk);
    }
    appendChunk();
  }
  function renderMain() {
    if (!ui.main) return;
    ui.main.replaceChildren(); ui.paramInputs = new Map(); ui.invalidParams = new Set();
    if (!work) { ui.main.append(el('div', 'pw-empty', '选择预设后浏览条目，不会自动切换酒馆正在使用的预设。')); return; }
    ui.main.append(el('h2', 'pw-main-title', current), el('p', 'pw-note', '浏览与保存不会自动应用；需要生效时点击「切换使用」。条目按原始顺序显示。'));
    const exportButton = button('导出此预设', () => { checkParams(); downloadFile(current + '.json', JSON.stringify(work, null, 2)); });
    exportButton.title = '导出为酒馆可直接导入的 .json；工作台里未保存的修改也会一起导出';
    ui.main.append(row(button('创建条目', createPrompt), exportButton, button('改名', () => renamePreset(current))));
    ui.tokenLine = el('div', 'pw-note pw-token', '');
    ui.main.append(ui.tokenLine);
    schedulePresetTokens(0);
    renderParams(ui.main);
    const group = select(groupOptions(work), groupId);
    group.addEventListener('change', () => { groupId = group.value; renderList(); });
    const mode = select([['used', '已加入列表'], ['unused', '未加入条目'], ['all', '全部条目']], viewMode);
    mode.addEventListener('change', () => { viewMode = mode.value; renderList(); });
    const search = textInput(entryQuery, '搜索条目标题、正文或关键词（空格分隔）'); search.setAttribute('aria-label', '搜索条目');
    ui.search = search; ui.mode = mode;
    const searchNow = () => { entryQuery = search.value; renderList(); };
    search.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); searchNow(); } });
    ui.main.append(row(group, mode), row(search, button('搜索', searchNow), button('清空', () => { search.value = ''; searchNow(); })));
    ui.main.append(buildReplaceBox());
    ui.pager = row(); ui.pager.classList.add('pw-pager'); ui.list = el('div', 'pw-entry-list'); ui.main.append(ui.pager, ui.list); renderList();
  }
  // 条目查找与替换（名称 + 正文），改完记得点「保存修改」
  function buildReplaceBox() {
    const box = el('details', 'pw-box');
    box.append(el('summary', '', '当前预设条目查找与替换'));
    const find = textInput('', '要查找的内容');
    const repl = textInput('', '替换为（留空即删除）');
    const status = el('div', 'pw-note', '');
    const scope = select([['both', '名称 + 正文'], ['content', '只找正文'], ['name', '只找名称']], 'both');
    function fieldsOf() {
      return scope.value === 'content' ? ['content'] : scope.value === 'name' ? ['name'] : ['name', 'content'];
    }
    function count() {
      const value = find.value;
      if (!value) return { hits: 0, items: 0 };
      let hits = 0, items = 0;
      for (const p of work?.prompts || []) {
        let inThis = 0;
        for (const key of fieldsOf()) inThis += String(p[key] ?? '').split(value).length - 1;
        if (inThis) { items++; hits += inThis; }
      }
      return { hits, items };
    }
    box.append(row(scope), row(find, repl),
      row(button('查找', () => {
        if (!find.value) { status.textContent = '请先填写要查找的内容'; return; }
        const r = count();
        status.textContent = r.hits ? '共 ' + r.hits + ' 处，分布在 ' + r.items + ' 个条目里' : '没有找到';
      }), button('全部替换', async () => {
        if (!find.value) { status.textContent = '请先填写要查找的内容'; return; }
        const r = count();
        if (!r.hits) { status.textContent = '没有找到'; return; }
        if (!await ask('把 ' + r.items + ' 个条目里的 ' + r.hits + ' 处「' + find.value + '」替换成「' + repl.value + '」？\n替换后记得点「保存修改」。')) return;
        for (const p of work.prompts) {
          for (const key of fieldsOf()) {
            const text = String(p[key] ?? '');
            if (text.includes(find.value)) p[key] = text.split(find.value).join(repl.value);
          }
        }
        markDirty();
        renderList();
        status.textContent = '已替换 ' + r.hits + ' 处，记得保存修改';
      }, 'pw-danger')), status);
    const trStatus = el('div', 'pw-note', '');
    box.append(row(button('批量翻译本预设条目', async () => {
      const list = (work?.prompts || []).filter(p => String(p.content || '').trim());
      const todo = list.filter(p => !transGet('preset|' + current + '|' + p.identifier));
      if (!todo.length) { trStatus.textContent = list.length ? '这些条目都已经有译文了' : '没有可翻译的条目'; return; }
      if (!await ask('翻译 ' + todo.length + ' 个还没有译文的条目？\n会一条条请求翻译接口，可能要等一会儿。译文只显示，不会改原文。')) return;
      let done = 0, failed = 0;
      for (const p of todo) {
        trStatus.textContent = '翻译中… ' + (done + failed + 1) + ' / ' + todo.length;
        try {
          const out = await translateText(String(p.content));
          transSet('preset|' + current + '|' + p.identifier, out);
          done++;
        } catch (error) {
          failed++;
          trStatus.textContent = '出错：' + error.message;
          if (failed >= 3) break;
        }
      }
      renderList();
      trStatus.textContent = '完成 ' + done + ' 条' + (failed ? '，失败 ' + failed + ' 条' : '');
    }), button('清空本预设译文', async () => {
      if (!await ask('删除这个预设所有条目的译文？')) return;
      const store = transStore();
      for (const key of Object.keys(store)) if (key.startsWith('preset|' + current + '|')) delete store[key];
      transSet('', '');
      try { W.localStorage.setItem(TRANS_KEY, JSON.stringify(store)); } catch {}
      renderList();
      trStatus.textContent = '已清空';
    }, 'pw-danger')), trStatus);
    return box;
  }

  function newIdentifier(used) {
    let id;
    do { id = 'pw_' + (W.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2)); } while (used.has(id));
    used.add(id); return id;
  }
  const SPECIAL = new Set(['main','nsfw','jailbreak','enhanceDefinitions','worldInfoBefore','personaDescription','charDescription','charPersonality','scenario','worldInfoAfter','dialogueExamples','chatHistory']);
  function stitchPlan(source, sourceGroup, selected, target, targetGroup, anchor, side) {
    const next = clone(target), used = new Set(next.prompts.map(p => p.identifier)), inserted = [], skipped = [];
    const sourceRows = promptRows(source, sourceGroup, 'all').filter(r => selected.has(r.prompt.identifier));
    const dest = orderFor(next, targetGroup, true);
    let position = anchor === '__start' ? 0 : anchor === '__end' ? dest.length : dest.findIndex(r => r.identifier === anchor);
    if (position < 0) throw Error('插入位置已不存在，请重新选择。');
    if (!['__start','__end'].includes(anchor) && side === 'after') position++;
    for (const row of sourceRows) {
      const original = row.prompt;
      const special = original.marker || SPECIAL.has(original.identifier);
      if (special && used.has(original.identifier)) { skipped.push(labelPrompt(original)); continue; }
      const copy = clone(original);
      copy.identifier = special ? original.identifier : newIdentifier(used); used.add(copy.identifier);
      next.prompts.push(copy);
      inserted.push({ ...(row.item ? clone(row.item) : {}), identifier: copy.identifier, enabled: row.item?.enabled !== false });
    }
    dest.splice(position, 0, ...inserted);
    return { next, count: inserted.length, skipped, labels: sourceRows.filter(r => !skipped.includes(labelPrompt(r.prompt))).map(r => labelPrompt(r.prompt)) };
  }
  function worldApi(name) {
    const providers = [globalThis, W, globalThis.TavernHelper, W.TavernHelper];
    for (const provider of providers) if (typeof provider?.[name] === 'function') return provider[name].bind(provider);
    throw Error('缺少酒馆助手世界书接口「' + name + '」。请确认酒馆助手扩展已开启并更新到 4.10 或更新版。');
  }
  function worldbookSource(name, entries) {
    if (!Array.isArray(entries)) throw Error('世界书返回的数据不是条目列表');
    const prompts = entries.map((entry, index) => ({
      identifier: 'wb_source_' + index,
      name: entry.name || '世界书条目 ' + String(entry.uid ?? index),
      content: String(entry.content || ''), role: 'system', system_prompt: false, marker: false,
      injection_type: 0, injection_depth: 4, injection_order: 100,
      pw_source: { type: 'worldbook', name, uid: entry.uid, keys: [...(Array.isArray(entry.strategy?.keys) ? entry.strategy.keys : []), ...(Array.isArray(entry.strategy?.keys_secondary?.keys) ? entry.strategy.keys_secondary.keys : [])] }
    }));
    return { prompts, prompt_order: [{ character_id: 100001, order: prompts.map((p, index) => ({ identifier: p.identifier, enabled: entries[index].enabled !== false })) }] };
  }
  async function openStitch() {
    if (busy) return;
    if (!names.length) { notice('请先刷新并选择一本预设。'); return; }
    checkParams();
    if (dirty) { notice('请先保存当前草稿，再打开缝预设。'); return; }
    const modal = el('dialog', 'pw-dialog pw-stitch');
    const sourceType = select([['preset', '预设 → 预设'], ['worldbook', '世界书 → 预设']], 'preset');
    const sourceSelect = select(names.map(n => [n,n]), current || names[0]);
    const targetSelect = select(names.map(n => [n,n]), current || names[0]);
    const sourceGroup = select([], ''), targetGroup = select([], ''), anchor = select([], ''), side = select([['before','前面'],['after','后面']], 'before');
    const search = textInput('', '搜索来源条目标题或正文');
    const list = el('div','pw-stitch-list'), status = el('p','pw-note'), selected = new Set();
    let source = null, target = null, saving = false, sourceLoading = false, sourceRequest = 0, closed = false;
    const sourcePager = row();
    function options(selectNode, data, value) {
      selectNode.replaceChildren(...data.map(([id,label]) => { const o = el('option','',label); o.value = id; return o; }));
      selectNode.value = data.some(x=>x[0]===value) ? value : data[0]?.[0] || '';
    }
    async function loadSource() {
      const token = ++sourceRequest, kind = sourceType.value, name = sourceSelect.value;
      sourceLoading = true; source = null; selected.clear(); list.replaceChildren(); status.textContent = '正在读取来源…';
      try {
        if (!name) throw Error('没有可用的来源。');
        const data = kind === 'worldbook' ? worldbookSource(name, await worldApi('getWorldbook')(name)) : savedPreset(name);
        if (closed || token !== sourceRequest) return;
        source = data; options(sourceGroup, groupOptions(source), '100001'); renderSource();
      } catch (error) {
        if (!closed && token === sourceRequest) { status.textContent = '读取失败：' + error.message; list.replaceChildren(); }
      } finally { if (token === sourceRequest) sourceLoading = false; }
    }
    async function changeSourceType() {
      const token = ++sourceRequest;
      source = null; sourceLoading = true; selected.clear(); list.replaceChildren(); sourceSelect.disabled = true;
      status.textContent = '正在读取来源列表…';
      try {
        const all = sourceType.value === 'worldbook' ? await worldApi('getWorldbookNames')() : names;
        if (closed || token !== sourceRequest) return;
        if (!Array.isArray(all)) throw Error('来源列表格式不正确');
        options(sourceSelect, all.map(name => [String(name), String(name)]), sourceType.value === 'preset' ? current : '');
        sourceSelect.disabled = false;
        await loadSource();
      } catch (error) {
        if (!closed && token === sourceRequest) { sourceLoading = false; sourceSelect.disabled = false; options(sourceSelect, [], ''); status.textContent = error.message; }
      }
    }
    function loadTarget() { target = savedPreset(targetSelect.value); options(targetGroup,groupOptions(target),'100001'); renderAnchors(); }
    function renderAnchors() { options(anchor,[['__start','列表最前'],['__end','列表最后'],...promptRows(target,targetGroup.value,'used').map(r=>[r.prompt.identifier,(r.index+1)+' · '+labelPrompt(r.prompt)])],'__end'); }
    function renderSource() {
      if (!source) return;
      const rows = promptRows(source,sourceGroup.value,'all').filter(r=>termsMatch(r.prompt,search.value));
      list.replaceChildren();
      for(const rowData of rows) {
        const p=rowData.prompt, line=el('div','pw-stitch-item');
        const check=createSwitch({enabled:selected.has(p.identifier)},()=>{check.checked?selected.add(p.identifier):selected.delete(p.identifier);status.textContent='已选 '+selected.size+' 个来源条目';});
        check.setAttribute('aria-label','选择 '+labelPrompt(p));
        const text=el('details');text.append(el('summary','',labelPrompt(p)));
        let previewReady = false;
        text.addEventListener('toggle', () => { if(text.open && !previewReady) { previewReady = true; text.append(el('pre','pw-snippet',p.content || '没有固定正文')); } });
        line.append(check,text);list.append(line);
      }
      sourcePager.replaceChildren(el('span','pw-note','共 '+rows.length+' 个匹配条目 · 同页显示'));
      status.textContent='已选 '+selected.size+' 个来源条目';
    }
    function close() { if(saving)return; closed=true; sourceRequest++; dialogs.delete(modal);if(modal.open)modal.close();modal.remove(); }
    sourceType.addEventListener('change',changeSourceType);
    sourceSelect.addEventListener('change',loadSource);targetSelect.addEventListener('change',loadTarget);
    sourceGroup.addEventListener('change',()=>{selected.clear();renderSource();});targetGroup.addEventListener('change',renderAnchors);
    const controls=row(button('确认缝合并保存',async()=>{
      if(saving)return;
      if(sourceLoading || !source)throw Error('请等待来源读取完成。');
      if(!selected.size)throw Error('请先选择来源条目。');
      const plan=stitchPlan(source,sourceGroup.value,selected,target,targetGroup.value,anchor.value,side.value);
      if(!plan.count)throw Error('没有可插入条目；目标中已存在所选系统或占位条目。');
      const name=targetSelect.value;
      const positionText=anchor.options[anchor.selectedIndex]?.textContent || '';
      if(!await ask('从「'+sourceSelect.value+'」复制 '+plan.count+' 个条目到「'+name+'」\n位置：'+positionText+(anchor.value.startsWith('__')?'':'的'+(side.value==='before'?'前面':'后面'))+'\n'+(plan.skipped.length?'跳过重复系统/占位条目：'+plan.skipped.join('、')+'\n':'')+(sourceType.value === 'worldbook' ? '将名称与正文复制为预设提示词，保留启用状态；世界书关键词触发规则不转换。确认保存？' : '只复制条目，不复制来源的参数、脚本或正则。确认保存？')))return;
      saving=true;modal.querySelectorAll('button,input,select').forEach(c=>c.disabled=true);
      try {
        await persist(name,plan.next,target);undoRecord={name,before:clone(target),after:clone(plan.next)};
        if(current===name){work=clone(plan.next);baseline=clone(work);dirty=false;renderMain();updateStatus();}
        saving=false;close();notice('已插入 '+plan.count+' 个条目。目标预设已保存；点击「切换使用」后生效。');
      } catch(error) { saving=false;modal.querySelectorAll('button,input,select').forEach(c=>c.disabled=false);throw error; }
    },'pw-primary'),button('下载目标备份',()=>downloadFile(targetSelect.value+'_缝合前备份.json',JSON.stringify(target,null,2))),button('关闭',close));
    modal.append(el('h3','','缝预设 · 复制到指定位置'),field('来源类型',sourceType),field('A · 来源预设 / 世界书',sourceSelect),field('来源顺序组',sourceGroup),row(search,button('搜索',()=>{renderSource();})),sourcePager,list,status,
      field('B · 目标预设',targetSelect),field('目标顺序组',targetGroup),row(field('插入位置',anchor),field('相对位置',side)),
      el('p','pw-note','普通条目使用新标识；重复系统/占位条目跳过。世界书只读取，不修改；仅转入名称、正文与启用状态，不转换关键词触发规则。'),controls);
    modal.addEventListener('cancel',e=>{e.preventDefault();close();});modal.addEventListener('keydown',e=>e.stopPropagation());
    dialogs.set(modal,()=>{saving=false;close();});loadTarget();D.body.append(modal);modal.showModal();void loadSource();
  }
  async function undoStitch() {
    if(!undoRecord) { notice('本次运行还没有可撤销的缝合。');return; }
    if(dirty) { notice('请先保存当前草稿。');return; }
    if(!await ask('撤销刚才对「'+undoRecord.name+'」的缝合？'))return;
    setBusy(true);
    try { const record=undoRecord;await persist(record.name,record.before,record.after);undoRecord=null;if(current===record.name){work=clone(record.before);baseline=clone(work);renderMain();}notice('已撤销上次缝合。'); }
    finally {setBusy(false);}
  }

  const baseStyle = el('style');
  baseStyle.id = 'pw-style';

  baseStyle.textContent = `
:is(#pw-panel,.pw-dialog) {
  --pw-bg: var(--cw-bg);
  --pw-surface: var(--cw-surface);
  --pw-soft: var(--cw-accent-soft);
  --pw-text: var(--cw-text);
  --pw-dim: var(--cw-text-dim);
  --pw-border: var(--cw-border);
  --pw-accent: var(--cw-accent);
  --pw-danger: var(--cw-danger);
  --pw-radius: var(--cw-radius);
  color: var(--pw-text);
  font: calc(14px * var(--cw-fs, 1))/1.65 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
  box-sizing: border-box;
}

:is(#pw-panel,.pw-dialog) *,
:is(#pw-panel,.pw-dialog) *::before,
:is(#pw-panel,.pw-dialog) *::after {
  box-sizing: border-box;
}

#pw-panel {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  height: 100dvh;
  color: var(--pw-text);
  background: var(--pw-bg);
  overflow: hidden;
  backdrop-filter: blur(20px);
}

.pw-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  flex-shrink: 0;
  padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
  border-bottom: 1px solid var(--pw-border);
}

.pw-title {
  flex: 1;
  font-size: calc(18px * var(--cw-fs, 1));
  font-weight: 650;
}

.pw-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.pw-books {
  width: 280px;
  flex-shrink: 0;
  overflow: auto;
  padding: 12px;
  border-right: 1px solid var(--pw-border);
}

.pw-main {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 14px;
}

.pw-book,
.pw-box,
.pw-entry {
  border: 1px solid var(--pw-border);
  border-radius: 0;
  background: var(--pw-surface);
}

.pw-book {
  margin-top: 8px;
  padding: 10px;
}

.pw-book.is-active {
  border-color: var(--pw-accent);
  background: var(--pw-surface);
}

.pw-book-name {
  overflow-wrap: anywhere;
  font-weight: 650;
}

.pw-entry-list {
  margin-top: 12px;
}

.pw-entry {
  margin-bottom: 12px;
  padding: 12px;
}

.pw-entry.is-disabled {
  opacity: .68;
}

.pw-entry-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--pw-border);
}

.pw-entry-name {
  flex: 1;
  min-width: 160px;
}

.pw-entry-input {
  width: 100%;
}

.pw-entry-label {
  display: block;
  margin-top: 10px;
  color: var(--pw-dim);
  font-size: calc(12px * var(--cw-fs, 1));
}

.pw-entry-keys {
  width: 100%;
}

.pw-entry-content {
  display: block;
  width: 100%;
  min-height: 170px;
  margin-top: 5px;
  padding: 10px;
  color: var(--pw-text);
  background: transparent;
  border: 1px solid var(--pw-border);
  border-radius: 0;
  font: inherit;
  line-height: 1.8;
  resize: vertical;
}

.pw-entry-content:focus {
  border-color: var(--pw-accent);
}

.pw-button,
.pw-dialog button {
  min-height: 36px;
  padding: 8px 12px;
  color: var(--pw-text);
  background: var(--pw-surface);
  border: 1px solid var(--pw-border);
  border-radius: 0;
  font: inherit;
  cursor: pointer;
}

.pw-button:hover,
.pw-dialog button:hover {
  border-color: var(--pw-accent);
  background: var(--pw-surface);
}

.pw-button:disabled,
.pw-dialog button:disabled {
  opacity: .45;
  cursor: default;
}

.pw-primary {
  color: var(--pw-text);
  background: var(--pw-surface) !important;
  font-weight: 650;
  border-color: var(--pw-accent) !important;
}

.pw-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.pw-row > input[type="text"] {
  flex: 1;
  min-width: 120px;
  width: auto;
}

.pw-field {
  display: block;
  margin-top: 12px;
}

.pw-field > span {
  display: block;
  margin-bottom: 5px;
  color: var(--pw-dim);
}

:is(#pw-panel,.pw-dialog) input,
:is(#pw-panel,.pw-dialog) select,
:is(#pw-panel,.pw-dialog) textarea {
  max-width: 100%;
  padding: 9px;
  color: var(--pw-text);
  background: var(--pw-surface);
  border: 1px solid var(--pw-border);
  border-radius: 0;
  font: inherit;
}

:is(#pw-panel,.pw-dialog) input[type="text"],
:is(#pw-panel,.pw-dialog) select,
:is(#pw-panel,.pw-dialog) textarea {
  width: 100%;
}

:is(#pw-panel,.pw-dialog) textarea {
  resize: vertical;
  line-height: 1.75;
}

:is(#pw-panel,.pw-dialog) select {
  appearance: none;
  padding-right: 30px;
  background-image:
    linear-gradient(45deg, transparent 50%, var(--pw-dim) 50%),
    linear-gradient(135deg, var(--pw-dim) 50%, transparent 50%);
  background-position:
    calc(100% - 15px) 50%,
    calc(100% - 10px) 50%;
  background-size: 5px 5px;
  background-repeat: no-repeat;
}

:is(#pw-panel,.pw-dialog) option {
  color: var(--pw-text);
  background: var(--pw-bg);
}

:is(#pw-panel,.pw-dialog) :is(
  button,
  input,
  textarea,
  select,
  summary
):focus-visible {
  outline: 2px solid var(--pw-accent);
  outline-offset: 2px;
}

.pw-mode {
  width: auto !important;
  min-width: 120px;
}

.pw-entry-title,
.pw-entry-uid {
  color: var(--pw-dim);
  font-size: calc(12px * var(--cw-fs, 1));
}

.pw-note {
  color: var(--pw-dim);
  font-size: calc(12px * var(--cw-fs, 1));
  white-space: pre-wrap;
}

.pw-empty {
  padding: 30px 10px;
  color: var(--pw-dim);
  text-align: center;
}

.pw-box {
  margin-bottom: 12px;
  padding: 12px;
}

.pw-box summary {
  cursor: pointer;
  font-weight: 650;
}

.pw-settings {
  flex-shrink: 0;
  max-height: 55dvh;
  overflow: auto;
  padding: 14px;
  background: var(--pw-surface);
  border-bottom: 1px solid var(--pw-border);
}

.pw-settings[hidden] {
  display: none;
}

.pw-footer {
  flex-shrink: 0;
  padding: 8px 14px;
  padding-bottom: max(8px, env(safe-area-inset-bottom));
  color: var(--pw-dim);
  font-size: calc(12px * var(--cw-fs, 1));
  border-top: 1px solid var(--pw-border);
}

.pw-dialog {
  width: min(460px, calc(100vw - 28px));
  max-height: 85dvh;
  padding: 22px;
  overflow: auto;
  color: var(--pw-text);
  background: var(--pw-bg);
  border: 1px solid var(--pw-border);
  border-radius: 0;
  box-shadow: 0 18px 70px #0008;
}

.pw-dialog::backdrop {
  background: #0007;
  backdrop-filter: blur(4px);
}

.pw-dialog-title {
  margin-bottom: 12px;
  font-size: calc(18px * var(--cw-fs, 1));
  font-weight: 700;
}

.pw-dialog-message {
  margin-bottom: 14px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

#pw-top {
  display: inline-grid;
  place-items: center;
  align-self: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  margin-left: 14px !important;
  margin-right: 14px !important;
  padding: 3px;
  color: inherit;
  background: transparent;
  border: 0;
  cursor: pointer;
}


#pw-fab {
  position: fixed;
  z-index: 2147483645;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  font-size: calc(32px * var(--cw-fs, 1));
  touch-action: none;
  cursor: grab;
  filter: drop-shadow(0 3px 7px #0005);
}

:is(#pw-top,#pw-fab) img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
}

.pw-preview {
  display: grid;
  place-items: center;
  width: 86px;
  height: 86px;
  margin: 10px 0;
  padding: 8px;
  color: var(--pw-text);
  font-size: calc(34px * var(--cw-fs, 1));
  border: 1px solid var(--pw-border);
  background: var(--pw-surface);
}

.pw-preview img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.pw-css-editor {
  min-height: 220px;
  font: calc(13px * var(--cw-fs, 1))/1.65 ui-monospace, Consolas, monospace !important;
}

@media(max-width:680px) {
  .pw-body {
    flex-direction: column;
  }

  .pw-books {
    width: 100%;
    max-height: 30dvh;
    border-right: 0;
    border-bottom: 1px solid var(--pw-border);
  }

  .pw-main {
    padding: 10px;
  }

  .pw-head {
    padding: 10px;
  }

  .pw-entry-name {
    min-width: 140px;
  }
}
`;

  baseStyle.textContent += `
#pw-panel .pw-entry, #pw-panel .pw-book, #pw-panel .pw-box, .pw-settings-section {
  border: 1px solid var(--pw-border); border-radius: var(--pw-radius);
}
#pw-panel .pw-entry.is-disabled { opacity: 1; border-style: dashed; }
#pw-panel .pw-entry { padding: 8px; margin-bottom: 8px; }
#pw-panel .pw-entry-head { padding: 0; border: 0; flex-wrap: nowrap; }
#pw-panel .pw-expand { flex: 1; min-width: 0; text-align: left; overflow-wrap: anywhere; font-weight: 650; min-height: 32px; padding: 4px 8px; line-height: 1.4; }
#pw-panel .pw-entry-body { border-top: 1px solid var(--pw-border); margin-top: 12px; padding-top: 4px; }
#pw-panel [hidden] { display: none !important; }
#pw-panel .pw-enable-label { position: relative; display: flex; align-items: center; justify-content: center; min-width: 32px; min-height: 32px; margin: 0; flex-shrink: 0; cursor: pointer; }
#pw-panel .pw-enable-label span { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
#pw-panel input[type=checkbox] { width: 24px; height: 24px; cursor: pointer; }
#pw-panel button.pw-check {
  all: unset !important; box-sizing: border-box !important; display: inline-grid !important;
  place-items: center !important; width: 32px !important; height: 32px !important;
  min-width: 32px !important; min-height: 32px !important; flex: 0 0 32px !important;
  padding: 0 !important; margin: 0 !important; border: 0 !important;
  background: transparent !important; box-shadow: none !important;
  filter: none !important; transform: none !important; opacity: 1 !important;
  visibility: visible !important; cursor: pointer !important;
}
#pw-panel button.pw-check::before, #pw-panel button.pw-check::after,
#pw-panel .pw-check-art::before, #pw-panel .pw-check-art::after {
  content: none !important; display: none !important;
}
#pw-panel button.pw-check:focus-visible { outline: 2px solid var(--pw-border) !important; outline-offset: 1px !important; }
#pw-panel button.pw-check:disabled { opacity: .55 !important; cursor: wait !important; }
.pw-match-nav { position: sticky; top: 0; z-index: 3; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; padding: 8px; margin: 8px 0; border: 1px solid var(--pw-border); background: var(--pw-bg); backdrop-filter: blur(20px); }
.pw-match-nav > span { flex: 1; min-width: 90px; }
#pw-panel .pw-match-card { scroll-margin-top: 100px; outline: 2px solid var(--pw-accent); outline-offset: 2px; }
.pw-badge { border: 1px solid var(--pw-border); padding: 2px 7px; border-radius: 4px; font-size: calc(12px * var(--cw-fs, 1)); white-space: nowrap; }
.pw-fields-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
#pw-panel .pw-field { min-width: 0; padding: 10px; border: 1px solid var(--pw-border); border-radius: var(--pw-radius); }
#pw-panel .pw-enable-label { border: 0; padding: 0; }
#pw-panel .pw-mode { width: 100% !important; }
#pw-panel .pw-entry-name { min-width: 0; }
.pw-settings-section { padding: 14px; margin-bottom: 14px; }
.pw-settings-section h3 { margin: 0 0 10px; }
.pw-settings-section summary { cursor: pointer; font-weight: 650; }
#pw-panel input, #pw-panel textarea, #pw-panel select { border-radius: var(--pw-radius); }
.pw-dialog.pw-editor { position: fixed; inset: 0; width: 100vw; max-width: none; height: 100vh; height: 100dvh; max-height: none; margin: 0; padding: max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom)); background: var(--pw-bg) !important; color: var(--pw-text) !important; opacity: 1 !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; overflow: hidden !important; overscroll-behavior: none; box-shadow: none !important; animation: none !important; transition: none !important; }
.pw-dialog.pw-editor::backdrop { background: var(--pw-bg) !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; animation: none !important; transition: none !important; }
.pw-dialog.pw-editor[open] { display: flex; flex-direction: column; gap: 10px; }
.pw-editor-head, .pw-editor-search { margin: 0; flex-shrink: 0; padding: 8px; border: 1px solid var(--pw-border); }
.pw-editor-head strong { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.pw-dialog.pw-editor > textarea { flex: 1; min-height: 0; resize: none; overflow-y: auto; overscroll-behavior: none; scroll-behavior: auto; touch-action: pan-y pinch-zoom; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; animation: none !important; transition: none !important; background: var(--pw-surface) !important; color: var(--pw-text) !important; border: 1px solid var(--pw-border); line-height: 1.8; }
@media(max-width:680px) { .pw-fields-grid { grid-template-columns: 1fr; } .pw-entry-head .pw-entry-uid { display: none; } .pw-books { max-height: 24dvh; } .pw-title { flex-basis: 100%; } }
`;

  baseStyle.textContent += `
#pw-panel .pw-row > select { flex: 1; width: auto; min-width: 140px; }
#pw-panel input[type=number] { width: 100%; }
#pw-panel .pw-pager { position: sticky; top: 0; z-index: 2; padding: 8px; border: 1px solid var(--pw-border); background: var(--pw-surface); backdrop-filter: blur(18px); }
#pw-panel .pw-pager > span { flex: 1; text-align: center; }
#pw-panel .pw-entry-list { scroll-margin-top: 65px; }
.pw-stitch { width: min(850px, calc(100vw - 20px)); max-height: 92dvh; }
.pw-stitch-list { max-height: 36dvh; overflow: auto; border: 1px solid var(--pw-border); padding: 8px; }
.pw-stitch-item { display: flex; gap: 10px; align-items: flex-start; border: 1px solid var(--pw-border); padding: 8px; margin-bottom: 6px; }
.pw-stitch-item > details { flex: 1; min-width: 0; }
.pw-stitch summary { cursor: pointer; overflow-wrap: anywhere; }
.pw-snippet { font: inherit; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 160px; overflow: auto; }
.pw-stitch button.pw-check { all: unset; display: inline-grid; place-items: center; width: 32px; height: 32px; flex: 0 0 32px; cursor: pointer; }
.pw-stitch button.pw-check::before,.pw-stitch button.pw-check::after { content: none !important; }
.pw-stitch .pw-check-art { display: block; }
.pw-stitch button:focus-visible { outline: 2px solid var(--pw-border); }
.pw-stitch .pw-row > .pw-field { flex: 1; min-width: 120px; }
.pw-stitch .pw-row > input[type=text] { width: auto; }
.pw-stitch [hidden] { display: none !important; }
@media(max-width:680px){ #pw-panel .pw-head {gap:6px;} #pw-panel .pw-head button {padding:6px 8px;} #pw-panel .pw-books {max-height:21dvh;} }
`;

  const compatibilityStyle = el('style');
  compatibilityStyle.id = 'pw-compatibility-style';
  compatibilityStyle.textContent = `
#pw-panel .pw-book.is-active {
  background: var(--pw-surface) !important; color: var(--pw-text) !important;
  border-color: var(--pw-border) !important;
  box-shadow: inset 3px 0 0 var(--pw-border) !important;
}
#pw-panel .pw-book.is-active .pw-book-name { color: var(--pw-text) !important; }
#pw-panel .pw-book.is-active .pw-note { color: var(--pw-text) !important; }
:is(#pw-panel,.pw-dialog) .pw-button:is(:hover,:focus-visible),
:is(#pw-panel,.pw-dialog) .pw-primary {
  background: var(--pw-surface) !important; color: var(--pw-text) !important;
}
`;
    D.head.append(baseStyle, compatibilityStyle);

    function close() {
      listRevision++;
      closeEditor?.();
      panel?.remove();
      panel = null; ui = {}; work = baseline = null; dirty = false;
    }

    function open(container) {
      if (disposed) return;
      close();
      connect();
      panel = el('section'); panel.id = 'pw-panel'; panel.setAttribute('aria-label', '预设工作台');
      const header = el('div', 'pw-head');
      const save = button('保存修改', async () => { if (await saveWork()) notice('修改已保存。需要在聊天中生效时，点击「切换使用」。'); }, 'pw-primary');
      header.append(save, button('切换使用', usePreset), button('缝预设', openStitch), button('撤销缝合', undoStitch), button('刷新', refreshCatalog));
      const body = el('div', 'pw-body'), aside = el('aside', 'pw-books'), bookSearch = textInput(bookQuery, '搜索预设名称'), presetBulkBar = el('div', 'pw-bulk-bar'), books = el('div'), main = el('main', 'pw-main'), status = el('div', 'pw-footer');
      bookSearch.addEventListener('input', () => { bookQuery = bookSearch.value; renderBooks(); });
      aside.append(bookSearch, presetBulkBar, books); body.append(aside, main); ui = { books, presetBulkBar, main, status, save };
      presetBulk.on = false; presetBulk.selected.clear();
      panel.append(header, body, status);
      panel.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); void requestHubClose(); } });
      container.append(panel);
      void refreshCatalog().then(() => {
        if (!panel || current) return;
        const selected = manager.getSelectedPresetName(); if (names.includes(selected)) return choosePreset(selected);
      }).catch(error => notice(error.message));
    }

    function dispose() {
      if (disposed) return;
      disposed = true; listRevision++;
      for (const cancel of [...dialogs.values()]) cancel();
      closeEditor?.(); panel?.remove(); panel = null;
      baseStyle.remove(); compatibilityStyle.remove();
    }

    return { keep: true, open, close, dispose, canLeave: discardChanges, element: () => panel };
  }

  /* ═════════════ ♢ 世界书工作台（白川 & 梨梨 v2.7） ═════════════ */
  function createWorldbookModule() {
    const D = DOC;
  const API_NAMES = [
    'getWorldbookNames',
    'getWorldbook',
    'updateWorldbookWith',
    'getGlobalWorldbookNames',
    'rebindGlobalWorldbooks',
    'getCharWorldbookNames'
  ];

  const API = {};
  const OPTIONAL_API_NAMES = [
    'createWorldbook', 'createOrReplaceWorldbook', 'deleteWorldbook',
    'rebindCharWorldbooks', 'getChatWorldbookName', 'rebindChatWorldbook', 'importRawWorldbook'
  ];
  for (const name of [...API_NAMES, ...OPTIONAL_API_NAMES]) {
    const fn = globalThis[name] || W[name] || globalThis.TavernHelper?.[name] || W.TavernHelper?.[name];
    if (typeof fn === 'function') API[name] = fn;
  }

    let disposed = false;
    let busy = false;
    let panel = null;
    let current = '';
    let names = [];
    let globals = [];
    let characterBooks = [];
    let entries = [];
    let bookQuery = '';
    let entryQuery = '';
    let requestId = 0;
    let ui = {};
    const dialogs = new Map();
    const drafts = new Map();
    const batchState = { scope: 'all', query: '', replacement: '', index: -1, open: false };
    const bulk = { on: false, selected: new Set() };        // 条目批量删除
    const bookBulk = { on: false, selected: new Set() };    // 世界书批量删除
    const ENABLE_IMAGE = PEAR_SWITCH_IMAGE;
    let closeEditor = null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function el(tag, className = '', text) {
    const node = D.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(text, action, className = '') {
    const node = el('button', 'wb-button ' + className, text);
    node.type = 'button';
    node.addEventListener('click', () => {
      Promise.resolve()
        .then(action)
        .catch(error => notice(error?.message || String(error)));
    });
    return node;
  }

  function textInput(value = '', placeholder = '') {
    const node = el('input');
    node.type = 'text';
    node.value = value;
    node.placeholder = placeholder;
    return node;
  }

  function textArea(value = '', rows = 8) {
    const node = el('textarea');
    node.value = value;
    node.rows = rows;
    node.spellcheck = false;
    return node;
  }

  function row(...children) {
    const node = el('div', 'wb-row');
    node.append(...children);
    return node;
  }

  function field(label, control) {
    const node = el('label', 'wb-field');
    control.setAttribute('aria-label', label);
    node.append(el('span', '', label), control);
    return node;
  }

  function select(options, value) {
    const node = el('select');
    for (const [key, label] of options) {
      const option = el('option', '', label);
      option.value = key;
      node.append(option);
    }
    node.value = value;
    return node;
  }

  function setBusy(value) {
    busy = value;

    if (!panel) return;

    panel.querySelectorAll(
      'button,input,textarea,select'
    ).forEach(control => {
      control.disabled = value;
    });

    if (ui.status) {
      ui.status.textContent = value
        ? '正在处理，请稍候'
        : names.length + ' 本世界书 · 当前 ' + entries.length + ' 个条目';
    }
  }

  async function discardChanges() {
    if (busy) return false;

    if (ui.inlineDirty) {
      const ok = await ask('世界书当前条目有未保存修改，确认放弃？');
      if (!ok) return false;
      ui.inlineDirty = false;
      drafts.clear();
    }

    return true;
  }


  function characterBookNames(value) {
    const result = [];

    if (typeof value?.primary === 'string' && value.primary) {
      result.push(value.primary);
    }

    if (Array.isArray(value?.additional)) {
      result.push(...value.additional);
    }

    return [...new Set(
      result.filter(item => typeof item === 'string' && item)
    )];
  }

  async function refreshCatalog() {
    if (!await discardChanges()) return;

    setBusy(true);

    try {
      const [allNames, globalNames] = await Promise.all([
        API.getWorldbookNames(),
        API.getGlobalWorldbookNames()
      ]);

      names = [...new Set(
        Array.isArray(allNames) ? allNames.map(String) : []
      )];

      globals = Array.isArray(globalNames)
        ? [...new Set(globalNames.map(String))]
        : [];

      try {
        characterBooks = characterBookNames(
          await API.getCharWorldbookNames('current')
        );
      } catch {
        characterBooks = [];
      }

      if (!names.includes(current)) {
        current = '';
        entries = [];
      }

      if (current) {
        entries = await API.getWorldbook(current);
      }

      renderBooks();
      renderMain();
    } finally {
      setBusy(false);
    }
  }

  function bookRank(name) {
    if (globals.includes(name)) return 0;
    if (characterBooks.includes(name)) return 1;
    return 2;
  }

  function updateBookBulkStatus() {
    for (const selectedName of [...bookBulk.selected]) {
      if (!names.includes(selectedName)) bookBulk.selected.delete(selectedName);
    }
    if (ui.bookBulkStatus) ui.bookBulkStatus.textContent = '已选 ' + bookBulk.selected.size + ' 本';
  }

  function renderBookBulkBar() {
    if (!ui.bookBulkBar) return;
    ui.bookBulkBar.replaceChildren();
    if (!bookBulk.on) {
      ui.bookBulkBar.append(row(button('导入世界书', importBooks), button('批量删除世界书', () => {
        if (busy) return;
        bookBulk.on = true;
        bookBulk.selected.clear();
        renderBooks();
      })));
      return;
    }
    const status = el('div', 'wb-note', '');
    ui.bookBulkStatus = status;
    ui.bookBulkBar.append(
      status,
      row(
        button('全选当前列表', () => {
          const query = bookQuery.trim().toLowerCase();
          names.filter(name => name.toLowerCase().includes(query)).forEach(name => bookBulk.selected.add(name));
          renderBooks();
        }),
        button('取消全选', () => { bookBulk.selected.clear(); renderBooks(); }),
        button('删除选中', deleteBooks, 'wb-danger'),
        button('退出', () => { bookBulk.on = false; bookBulk.selected.clear(); renderBooks(); })
      )
    );
    updateBookBulkStatus();
  }

  async function exportCurrentBook() {
    if (busy || !current) return;
    const choice = await choose('「' + current + '」要导出成哪种格式？', [
      ['native', '酒馆格式', '和酒馆自带的导出一样，可以导入任何酒馆'],
      ['snapshot', '工作台快照', '保留工作台的条目结构，用本页「导入世界书」导回']
    ], '♢ 导出世界书');
    if (choice === 'native') await exportBook(current);
    else if (choice === 'snapshot') downloadSnapshot();
  }

  async function exportBook(name) {
    if (busy) return;
    setBusy(true);
    try {
      let data;
      try {
        data = await apiPost('/api/worldinfo/get', { name });
      } catch {
        data = null;
      }
      if (!data || typeof data !== 'object' || !data.entries) {
        // 后备：导出工作台快照（可用本页「导入世界书」导回）
        const list = await API.getWorldbook(name);
        data = { type: 'worldbook-workbench-snapshot', version: 2, name, entries: list };
      }
      downloadFile(name + '.json', JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
    } finally {
      setBusy(false);
    }
  }

  async function importBooks() {
    if (busy) return;
    const files = await pickFiles('.json,application/json', true);
    if (!files.length || disposed) return;
    if (!await discardChanges()) return;
    const create = API.createOrReplaceWorldbook || API.createWorldbook;
    const done = [], failed = [];
    let staleList = false;
    setBusy(true);
    try {
      for (const file of files) {
        try {
          const text = await fileText(file);
          const data = JSON.parse(text);
          if (!data || typeof data !== 'object') throw Error('不是世界书文件');
          const snapshot = data.type === 'worldbook-workbench-snapshot' && Array.isArray(data.entries);
          if (!snapshot && !data.entries) throw Error('没有 entries，不像世界书文件');
          let name = (snapshot && data.name ? String(data.name) : file.name.replace(/\.json$/i, '')).trim() || '导入的世界书';
          name = name.replace(/[\\/:*?"<>|]/g, '_');
          const taken = (await API.getWorldbookNames()).map(String);
          let overwrite = false;
          if (taken.includes(name)) {
            overwrite = await ask('已经有叫「' + name + '」的世界书了。\n确定 = 覆盖它；取消 = 另存为新名字。');
            if (!overwrite) name = uniqueName(name, taken);
          }
          if (snapshot) {
            const writer = overwrite ? API.createOrReplaceWorldbook : create;
            if (typeof writer !== 'function') throw Error('当前酒馆助手不支持创建世界书');
            await writer(name, clone(data.entries));
          } else {
            const raw = helperFn('importRawWorldbook');
            if (raw) {
              await raw(name + '.json', text);
            } else {
              const upload = new W.File([text], name + '.json', { type: 'application/json' });
              await apiUpload('/api/worldinfo/import', { avatar: upload });
              const ctx = context();
              if (typeof ctx?.updateWorldInfoList === 'function') await ctx.updateWorldInfoList();
              else staleList = true;
            }
          }
          done.push(name);
        } catch (error) {
          failed.push(file.name + '：' + error.message);
        }
      }
    } finally {
      setBusy(false);
    }
    await refreshCatalog();
    const missing = done.filter(name => !names.includes(name));
    notice((done.length ? '已导入：\n' + done.map(n => '· ' + n).join('\n') : '没有导入成功的世界书。') +
      (failed.length ? '\n\n失败：\n' + failed.join('\n') : '') +
      (missing.length || staleList ? '\n\n如果列表里还没出现，刷新一下酒馆网页就好。' : ''));
  }

  async function deleteBooks() {
    if (busy) return;
    if (typeof API.deleteWorldbook !== 'function') {
      notice('当前酒馆助手没有提供 deleteWorldbook 接口，请更新酒馆助手后再试。');
      return;
    }
    const list = [...bookBulk.selected].filter(name => names.includes(name));
    if (!list.length) { notice('请先点爱心选择要删除的世界书。'); return; }
    if (list.includes(current) && !await discardChanges()) return;
    const preview = list.slice(0, 12).map(name => '· ' + name).join('\n') + (list.length > 12 ? '\n……共 ' + list.length + ' 本' : '');
    if (!await ask('永久删除这 ' + list.length + ' 本世界书？删除后无法恢复，建议先「导出快照」。\n\n' + preview)) return;
    setBusy(true);
    const failed = [];
    try {
      // 先从全局挂载里摘掉，避免留下失效的全局引用
      try {
        const before = await API.getGlobalWorldbookNames();
        const next = before.filter(name => !list.includes(name));
        if (next.length !== before.length) await API.rebindGlobalWorldbooks(next);
      } catch {}
      for (const name of list) {
        try {
          await API.deleteWorldbook(name);
        } catch (error) {
          failed.push(name + '：' + error.message);
        }
      }
      if (list.includes(current)) {
        current = '';
        entries = [];
        drafts.clear();
        ui.inlineDirty = false;
      }
      bookBulk.selected.clear();
      bookBulk.on = false;
    } finally {
      setBusy(false);
    }
    await refreshCatalog();
    const remain = list.filter(name => names.includes(name));
    if (failed.length || remain.length) {
      notice('有 ' + Math.max(failed.length, remain.length) + ' 本未能删除：\n' + (failed.join('\n') || remain.join('\n')));
    } else {
      notice('已删除 ' + list.length + ' 本世界书。');
    }
  }

  async function renameBook(name) {
    if (busy) return;
    const create = API.createWorldbook || API.createOrReplaceWorldbook;
    if (typeof create !== 'function' || typeof API.deleteWorldbook !== 'function') {
      notice('当前酒馆助手缺少创建或删除世界书的接口，请更新酒馆助手后再试。');
      return;
    }
    if (name === current && !await discardChanges()) return;
    const value = await dialog('新的世界书名称：', 'prompt', name);
    if (value === null) return;
    const next = value.trim();
    if (!next || next === name) return;
    if (/[\\/:*?"<>|]/.test(next)) { notice('名称里不能有 \\ / : * ? " < > | 这些字符。'); return; }
    if (names.includes(next)) { notice('已经有一本叫「' + next + '」的世界书了。'); return; }

    setBusy(true);
    const warnings = [];
    try {
      const data = await API.getWorldbook(name);
      const source = Array.isArray(data) ? data : [];
      await create(next, clone(source));
      const copied = await API.getWorldbook(next);
      if (!Array.isArray(copied) || copied.length !== source.length) {
        throw Error('新世界书写入后条目数量不一致，旧世界书未删除，请检查「' + next + '」。');
      }

      // 迁移绑定：全局 / 当前角色 / 当前聊天
      const globalsNow = await API.getGlobalWorldbookNames();
      if (globalsNow.includes(name)) {
        await API.rebindGlobalWorldbooks(globalsNow.map(item => item === name ? next : item));
      }
      try {
        const charBooks = await API.getCharWorldbookNames('current');
        const additional = Array.isArray(charBooks?.additional) ? charBooks.additional : [];
        if (charBooks?.primary === name || additional.includes(name)) {
          if (typeof API.rebindCharWorldbooks !== 'function') throw Error('缺少 rebindCharWorldbooks');
          await API.rebindCharWorldbooks('current', {
            primary: charBooks.primary === name ? next : charBooks.primary,
            additional: additional.map(item => item === name ? next : item)
          });
        }
      } catch (error) {
        warnings.push('当前角色的绑定没能自动改过来（' + error.message + '），请手动重新绑定。');
      }
      try {
        if (typeof API.getChatWorldbookName === 'function' && await API.getChatWorldbookName('current') === name) {
          await API.rebindChatWorldbook('current', next);
        }
      } catch (error) {
        warnings.push('当前聊天的绑定没能自动改过来（' + error.message + '），请手动重新绑定。');
      }

      await API.deleteWorldbook(name);
      if (current === name) current = next;
      if (bookBulk.selected.delete(name)) bookBulk.selected.add(next);
    } finally {
      setBusy(false);
    }
    await refreshCatalog();
    notice('已改名为「' + next + '」。' + (warnings.length ? '\n\n' + warnings.join('\n') : '') +
      '\n\n提示：只迁移了全局、当前角色和当前聊天的绑定；其他角色卡如果也绑着旧名字，需要到那张卡里重新选一次。');
  }

  function renderBooks() {
    if (!panel) return;

    renderBookBulkBar();
    ui.books.replaceChildren();

    const query = bookQuery.trim().toLowerCase();

    const list = names
      .filter(name => name.toLowerCase().includes(query))
      .sort((a, b) =>
        bookRank(a) - bookRank(b) ||
        a.localeCompare(b, 'zh-CN', { numeric: true })
      );

    for (const name of list) {
      const book = el(
        'div',
        'wb-book' + (name === current ? ' is-active' : '')
      );

      const tags = [];

      if (name === current) tags.push('当前已选');
      if (globals.includes(name)) tags.push('全局');
      if (characterBooks.includes(name)) tags.push('当前角色');

      const openButton = button('打开', () => chooseBook(name));
      const globalButton = button(
        globals.includes(name) ? '取消全局' : '挂到全局',
        () => toggleGlobal(name)
      );

      const titleRow = el('div', 'wb-book-title-row');
      if (bookBulk.on) {
        const pick = heartSwitch(bookBulk.selected.has(name), '选择删除「' + name + '」');
        pick.addEventListener('change', () => {
          pick.checked ? bookBulk.selected.add(name) : bookBulk.selected.delete(name);
          updateBookBulkStatus();
        });
        titleRow.append(pick);
      }
      titleRow.append(el('div', 'wb-book-name', name));

      book.append(
        titleRow,
        el(
          'div',
          'wb-note',
          tags.length ? tags.join(' · ') : '普通世界书'
        ),
        bookBulk.on ? el('span') : row(openButton, globalButton)
      );

      ui.books.append(book);
    }

    if (!list.length) {
      ui.books.append(el('div', 'wb-empty', '没有找到世界书'));
    }
  }

  async function chooseBook(name) {
    if (!await discardChanges()) return;

    const id = ++requestId;
    setBusy(true);

    try {
      const data = await API.getWorldbook(name);

      if (disposed || !panel || id !== requestId) return;

      current = name;
      entries = Array.isArray(data) ? data : [];
      entryQuery = '';
      batchState.index = -1;
      bulk.on = false;
      bulk.selected.clear();
      renderBooks();
      renderMain();
      ui.main.scrollTop = 0;
    } finally {
      setBusy(false);
    }
  }

  async function toggleGlobal(name) {
    if (busy) return;

    setBusy(true);

    try {
      const before = await API.getGlobalWorldbookNames();

      const next = before.includes(name)
        ? before.filter(item => item !== name)
        : [...before, name];

      await API.rebindGlobalWorldbooks(next);

      globals = await API.getGlobalWorldbookNames();

      if (globals.includes(name) !== next.includes(name)) {
        throw Error('全局挂载结果未能确认，请刷新后检查。');
      }

      renderBooks();
    } finally {
      setBusy(false);
    }
  }

  async function commit(next, expected = entries, savedUid = null) {
    if (busy || !current) return false;

    const book = current;
    const baseline = JSON.stringify(expected);

    setBusy(true);

    try {
      await API.updateWorldbookWith(book, latest => {
        if (JSON.stringify(latest) !== baseline) {
          throw Error('世界书已经发生变化，请刷新后重新编辑。');
        }

        return clone(next);
      });

      const actual = await API.getWorldbook(book);

      if (disposed || current !== book) return false;

      entries = Array.isArray(actual) ? actual : [];
      if (savedUid === null) drafts.clear();
      else drafts.delete(savedUid);
      ui.inlineDirty = drafts.size > 0;
      renderMain();

      return true;
    } catch (error) {
      notice('保存失败：' + error.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function getKeys(entry, type) {
    if (type === 'primary') {
      return Array.isArray(entry.strategy?.keys)
        ? entry.strategy.keys
        : [];
    }

    return Array.isArray(entry.strategy?.keys_secondary?.keys)
      ? entry.strategy.keys_secondary.keys
      : [];
  }

  function keysToText(entry, type) {
    return getKeys(entry, type).join(', ');
  }

  function parseKeys(value) {
    return String(value || '')
      .split(/[，,]/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  function setKeys(entry, type, value) {
    entry.strategy ||= {};

    if (type === 'primary') {
      entry.strategy.keys = value;
      return;
    }

    entry.strategy.keys_secondary ||= {
      logic: 'and_any',
      keys: []
    };

    entry.strategy.keys_secondary.keys = value;
  }

  function replaceLiteral(text, search, replacement, all) {
    if (!search) {
      return {
        text,
        count: 0
      };
    }

    if (!all) {
      const index = text.indexOf(search);

      if (index < 0) {
        return {
          text,
          count: 0
        };
      }

      return {
        text:
          text.slice(0, index) +
          replacement +
          text.slice(index + search.length),
        count: 1
      };
    }

    const parts = text.split(search);

    return {
      text: parts.join(replacement),
      count: parts.length - 1
    };
  }

  function replaceEntryKeys(entry, scope, search, replacement, all) {
    let total = 0;

    const types = scope === 'both'
      ? ['primary', 'secondary']
      : [scope];

    for (const type of types) {
      const source = getKeys(entry, type);
      const result = [];

      for (const value of source) {
        if (!all && total > 0) {
          result.push(value);
          continue;
        }

        const changed = replaceLiteral(
          value,
          search,
          replacement,
          all
        );

        total += changed.count;

        if (changed.text.trim()) {
          result.push(changed.text.trim());
        }
      }

      setKeys(entry, type, result);
    }

    return total;
  }

  function modeLabel(type) {
    if (type === 'constant') return '蓝灯';
    if (type === 'selective') return '绿灯';
    if (type === 'vectorized') return '向量';
    return type || '未知';
  }

  function createSwitch(entry, change) {
    // Native button keyboard behavior, checkbox semantics, isolated image rendering.
    // No input[type=checkbox], theme pseudo-checkmark, or built-in tick icon.
    const control = el('button', 'wb-check');
    control.type = 'button';
    control.setAttribute('role', 'checkbox');
    // A span is an allowed shadow host; HTMLButtonElement is not.
    const art = el('span', 'wb-check-art');
    art.setAttribute('aria-hidden', 'true');
    art.style.cssText = 'all: initial !important; display: block !important; width: 22px !important; height: 22px !important; pointer-events: none !important;';
    control.append(art);
    const root = art.attachShadow({ mode: 'open' });
    const style = el('style');
    style.textContent = `
      :host { -webkit-tap-highlight-color: transparent; }
      .frame { all: initial; box-sizing: border-box; width: 22px; height: 22px; display: grid; place-items: center; border: 1px solid var(--wb-border, #808080); border-radius: 4px; background: transparent; pointer-events: none; }
      img, .heart { all: initial; grid-area: 1 / 1; width: 20px; height: 20px; pointer-events: none; }
      img { display: block; object-fit: contain; }
      .heart { display: grid; place-items: center; color: #ed8eae; -webkit-text-stroke: .5px #75465b; font: 19px/20px sans-serif; }
      [hidden] { display: none !important; }
    `;
    const frame = el('span', 'frame');
    const image = el('img');
    image.alt = ''; image.draggable = false;
    const fallback = el('span', 'heart', '♥');
    fallback.setAttribute('aria-hidden', 'true');
    let checked = !!entry.enabled, loaded = false;
    function paint() {
      control.setAttribute('aria-checked', String(checked));
      control.setAttribute('aria-label', checked ? '已启用，点击停用条目' : '已停用，点击启用条目');
      control.title = checked ? '已启用，点击停用' : '已停用，点击启用';
      image.hidden = !checked || !loaded;
      fallback.hidden = !checked || loaded;
    }
    image.addEventListener('load', () => { loaded = true; paint(); });
    image.addEventListener('error', () => { loaded = false; paint(); });
    Object.defineProperty(control, 'checked', {
      get: () => checked,
      set(value) { checked = !!value; paint(); }
    });
    frame.append(image, fallback); root.append(style, frame);
    paint(); image.src = ENABLE_IMAGE;
    control.addEventListener('click', () => {
      if (control.disabled) return;
      control.checked = !checked;
      Promise.resolve().then(change).catch(error => {
        control.checked = !!entry.enabled;
        notice(error?.message || String(error));
      });
    });
    return control;
  }

  // Composite translucent theme layers into the same visible, opaque color.
  function opaqueSurface(source) {
    const canvas = D.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const layers = [];
    for (let node = source; node; node = node.parentElement) layers.push(W.getComputedStyle(node).backgroundColor);
    ctx.fillStyle = W.getComputedStyle(D.documentElement).colorScheme === 'dark' ? '#000' : '#fff';
    ctx.fillRect(0, 0, 1, 1);
    for (const color of layers.reverse()) { ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); }
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgb(${r}, ${g}, ${b})`;
  }

  function suspendEditorBackground() {
    const changes = [];
    function set(node, key, value) {
      if (!node) return;
      changes.push([node, key, node.style.getPropertyValue(key), node.style.getPropertyPriority(key)]);
      node.style.setProperty(key, value, 'important');
    }
    // The modal has its own opaque surface; keep the blurred workbench out of paint.
    set(hub || panel, 'visibility', 'hidden');
    for (const node of [D.documentElement, D.body]) {
      set(node, 'overflow-x', 'hidden');
      set(node, 'overflow-y', 'hidden');
      set(node, 'overscroll-behavior-x', 'none');
      set(node, 'overscroll-behavior-y', 'none');
    }
    let restored = false;
    return () => {
      if (restored) return;
      restored = true;
      for (const [node, key, value, priority] of changes.reverse()) {
        if (value) node.style.setProperty(key, value, priority);
        else node.style.removeProperty(key);
      }
    };
  }

  function openContentEditor(source, title) {
    closeEditor?.();
    const modal = el('dialog', 'wb-dialog wb-editor');
    const editor = textArea(source.value);
    editor.setAttribute('aria-label', '全屏正文');
    const search = textInput('', '搜索正文（区分大小写）');
    search.setAttribute('aria-label', '搜索正文');
    const status = el('span', 'wb-note', '输入文字查找');
    let matches = [], index = -1;
    let restoreBackground = () => {};
    let finished = false;
    function scan() {
      matches = []; index = -1;
      if (search.value) {
        let at = 0;
        while ((at = editor.value.indexOf(search.value, at)) !== -1) {
          matches.push(at); at += search.value.length;
        }
      }
      status.textContent = search.value ? '共 ' + matches.length + ' 处' : '输入文字查找';
    }
    function jump(step) {
      if (!matches.length) return;
      index = (index + step + matches.length) % matches.length;
      const at = matches[index];
      editor.focus(); editor.setSelectionRange(at, at + search.value.length);
      // Textarea selection is the native, editable search highlight.
      const before = editor.value.slice(0, at).split('\n');
      const style = W.getComputedStyle(editor);
      const columns = Math.max(1, Math.floor(editor.clientWidth / (parseFloat(style.fontSize) * .65)));
      const lines = before.slice(0, -1).reduce((n, line) => n + Math.max(1, Math.ceil(line.length / columns)), 0);
      editor.scrollTop = Math.max(0, (lines + Math.floor(before.at(-1).length / columns)) * parseFloat(style.lineHeight) - editor.clientHeight / 3);
      status.textContent = (index + 1) + ' / ' + matches.length;
    }
    function sync() {
      if (source.value !== editor.value) {
        source.value = editor.value;
        source.dispatchEvent(new W.Event('input', { bubbles: true }));
      }
    }
    function finish() {
      if (finished) return;
      finished = true;
      sync(); dialogs.delete(modal);
      restoreBackground();
      if (modal.open) modal.close();
      modal.remove();
      closeEditor = null;
      if (source.isConnected) source.focus({ preventScroll: true });
    }
    closeEditor = finish;
    dialogs.set(modal, finish);
    const heading = row(el('strong', '', title || '正文编辑'), button('退出全屏', finish, 'wb-primary'));
    heading.classList.add('wb-editor-head');
    const toolbar = row(search, button('上一处', () => jump(index < 0 ? 0 : -1)), button('下一处', () => jump(1)), status);
    toolbar.classList.add('wb-editor-search');
    modal.append(heading, toolbar, editor, el('div', 'wb-note', '修改已同步到条目草稿；退出后点击「保存条目」写入世界书。'));
    search.addEventListener('input', () => { scan(); jump(1); search.focus(); });
    editor.addEventListener('input', () => { sync(); scan(); });
    modal.addEventListener('cancel', e => { e.preventDefault(); finish(); });
    modal.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter' && e.target === search && !e.isComposing) { e.preventDefault(); jump(e.shiftKey ? (index < 0 ? 0 : -1) : 1); }
    });
    const sourceStyle = W.getComputedStyle(source);
    const panelStyle = W.getComputedStyle(panel);
    const surface = opaqueSurface(source);
    for (const key of ['--wb-border', '--wb-accent', '--wb-soft', '--wb-dim']) {
      modal.style.setProperty(key, panelStyle.getPropertyValue(key));
    }
    modal.style.setProperty('--wb-bg', surface);
    modal.style.setProperty('--wb-surface', surface);
    modal.style.setProperty('--wb-text', sourceStyle.color);
    editor.style.font = sourceStyle.font;
    editor.style.lineHeight = sourceStyle.lineHeight;
    D.body.append(modal);
    restoreBackground = suspendEditorBackground();
    try {
      modal.showModal();
      editor.focus({ preventScroll: true });
    } catch (error) {
      finish();
      throw error;
    }
  }

  async function saveEntryFromControls(entry, controls) {
    if (busy || !current) return;

    const next = clone(entries);
    const target = next.find(item => item.uid === entry.uid);

    if (!target) {
      notice('条目不存在，请刷新后重试。');
      return;
    }

    const order = Number(controls.order.value);
    if (!controls.order.value.trim() || !Number.isSafeInteger(order) || order < 0) throw Error('顺序请输入大于等于 0 的整数。');
    const depth = Number(controls.depth.value);
    if (!controls.depth.value.trim() || !Number.isSafeInteger(depth) || depth < 0) throw Error('深度请输入大于等于 0 的整数。');
    target.position = { ...target.position, type: controls.position.value, role: controls.role.value, depth, order };
    target.name = controls.name.value;
    target.enabled = controls.enabled;
    target.content = controls.content.value;
    target.strategy ||= {};
    target.strategy.type = controls.mode.value;

    setKeys(
      target,
      'primary',
      parseKeys(controls.primary.value)
    );

    setKeys(
      target,
      'secondary',
      parseKeys(controls.secondary.value)
    );

    return await commit(next, entries, entry.uid);
  }

  function renderEntry(entry) {
    const card = el(
      'article',
      'wb-entry' + (entry.enabled ? '' : ' is-disabled')
    );

    const controls = {
      enabled: !!entry.enabled,
      order: textInput(String(entry.position?.order ?? 100), '顺序'),
      depth: textInput(String(entry.position?.depth ?? 0), '深度'),
      position: select(POSITIONS, entry.position?.type || 'before_character_definition'),
      role: select([['system','系统'],['user','用户'],['assistant','助手']], entry.position?.role || 'system'),
      name: textInput(entry.name || '', '条目名称'),
      primary: textInput(
        keysToText(entry, 'primary'),
        '主要关键词，使用逗号分隔'
      ),
      secondary: textInput(
        keysToText(entry, 'secondary'),
        '辅助关键词，使用逗号分隔'
      ),
      content: textArea(String(entry.content || ''), 9),
      mode: select([
        ['constant', '蓝灯常驻'],
        ['selective', '绿灯关键词'],
        ['vectorized', '向量匹配']
      ], entry.strategy?.type || 'selective')
    };

    const previousDraft = drafts.get(entry.uid);
    if (previousDraft) {
      for (const key of ['name', 'primary', 'secondary', 'content', 'mode', 'order', 'depth', 'position', 'role']) controls[key].value = previousDraft[key].value;
      controls.enabled = previousDraft.enabled;
      drafts.set(entry.uid, controls);
    }

    controls.name.className = 'wb-entry-name';
    controls.primary.className = 'wb-entry-input';
    controls.secondary.className = 'wb-entry-input';
    controls.content.className = 'wb-entry-content';
    controls.mode.className = 'wb-mode';

    const switcher = createSwitch(entry, async () => {
      if (busy) { switcher.checked = controls.enabled; return; }
      controls.enabled = switcher.checked;
      if (!await saveEntryFromControls(entry, controls)) {
        controls.enabled = !!entry.enabled; switcher.checked = controls.enabled;
      }
    });
    const fullButton = button('正文全屏', () => openContentEditor(controls.content, controls.name.value));


    const saveButton = button(
      '保存条目',
      () => saveEntryFromControls(entry, controls),
      'wb-primary'
    );

    const header = el('div', 'wb-entry-head');
    const body = el('div', 'wb-entry-body');
    body.hidden = !previousDraft;
    const expand = button((body.hidden ? '▸ ' : '▾ ') + (controls.name.value || '未命名条目'), () => {
      body.hidden = !body.hidden;
      expand.setAttribute('aria-expanded', String(!body.hidden));
      expand.textContent = (body.hidden ? '▸ ' : '▾ ') + (controls.name.value || '未命名条目');
    }, 'wb-expand');
    expand.setAttribute('aria-expanded', String(!body.hidden));
    if (previousDraft) saveButton.textContent = '保存条目 · 未保存';
    const enabledLabel = field(entry.enabled ? '已启用' : '已停用', switcher);
    enabledLabel.classList.add('wb-enable-label');
    enabledLabel.title = entry.enabled ? '已启用，点击停用' : '已停用，点击启用';
    header.append(bulk.on ? bulkPick(entry) : enabledLabel, expand, el('span', 'wb-badge', modeLabel(entry.strategy?.type)), el('span', 'wb-badge', '顺序 ' + (entry.position?.order ?? 100)), tokenBadge(entry.content), el('span', 'wb-entry-uid', 'UID ' + entry.uid));
    const grid = el('div', 'wb-fields-grid');
    grid.append(field('条目名称', controls.name), field('触发模式', controls.mode), field('主要关键词', controls.primary), field('辅助关键词', controls.secondary));
    grid.append(field('顺序（数值越大显示越靠前）', controls.order), field('插入位置', controls.position), field('插入深度（仅指定深度生效）', controls.depth), field('消息身份', controls.role));
    body.append(grid, field('正文', controls.content), row(fullButton, saveButton,
      button('复制／转移', () => openTransfer(entry)), button('删除条目', () => removeEntry(entry))),
      translateBox(() => controls.content.value, 'wb|' + current + '|' + entry.uid, '译文 · ' + (entry.name || '条目')));
    card.append(header, body);
    ui.entryViews.set(entry.uid, { card, controls, reveal() {
      body.hidden = false;
      expand.setAttribute('aria-expanded', 'true');
      expand.textContent = '▾ ' + (controls.name.value || '未命名条目');
    } });

    for (const control of [
      controls.name,
      controls.primary,
      controls.secondary,
      controls.mode,
      controls.content, controls.order, controls.depth, controls.position, controls.role
    ]) {
      control.addEventListener('input', () => {
        ui.inlineDirty = true;
        drafts.set(entry.uid, controls);
        saveButton.textContent = '保存条目 · 未保存';
      });
    }

    return card;
  }


  const POSITIONS = [
    ['before_character_definition','角色定义之前'], ['after_character_definition','角色定义之后'],
    ['before_example_messages','示例消息之前'], ['after_example_messages','示例消息之后'],
    ['before_author_note','作者注释之前'], ['after_author_note','作者注释之后'],
    ['at_depth','指定深度'], ['outlet','Outlet（保留原设置）']
  ];
  function noDrafts() {
    if (busy) return false;
    if (drafts.size) { notice('请先保存正在编辑的条目，再进行条目管理。'); return false; }
    return true;
  }
  function freshCopies(source, target) {
    const used = new Set(target.map(e => e.uid));
    let uid = 0;
    return source.map(e => {
      while (used.has(uid)) uid++;
      used.add(uid);
      return { ...clone(e), uid: uid++ };
    });
  }
  function blankEntry(name = '新条目') {
    return { uid: 0, name, enabled: false, content: '',
      strategy: { type: 'constant', keys: [], keys_secondary: {logic:'and_any',keys:[]}, scan_depth:'same_as_global' },
      position: {type:'at_depth',role:'system',depth:4,order:100}, probability:100,
      recursion: {prevent_incoming:false,prevent_outgoing:false,delay_until:null},
      effect: {sticky:null,cooldown:null,delay:null} };
  }
  async function createEntry() {
    if (!noDrafts()) return;
    const name = await dialog('新条目名称', 'prompt', '新条目');
    if (name === null || !noDrafts()) return;
    const item = freshCopies([blankEntry(name.trim() || '新条目')], entries)[0];
    if (await commit([...clone(entries), item])) {
      entryQuery = ''; renderMain();
      const view = ui.entryViews.get(item.uid); view?.reveal();
      view?.card.scrollIntoView({block:'nearest'}); view?.controls.name.focus();
    }
  }
  async function translateBook() {
    if (busy || !current) return;
    const list = entries.filter(e => String(e.content || '').trim() && !transGet('wb|' + current + '|' + e.uid));
    if (!list.length) { notice('这本世界书的条目都已经有译文了。'); return; }
    if (!await ask('翻译 ' + list.length + ' 个还没有译文的条目？\n会一条条请求翻译接口，译文只显示，不会改原文。')) return;
    setBusy(true);
    let done = 0, failed = 0;
    try {
      for (const entry of list) {
        ui.status.textContent = '翻译中… ' + (done + failed + 1) + ' / ' + list.length;
        try {
          transSet('wb|' + current + '|' + entry.uid, await translateText(String(entry.content)));
          done++;
        } catch (error) {
          failed++;
          if (failed >= 3) { notice('连续失败：' + error.message); break; }
        }
      }
    } finally {
      setBusy(false);
    }
    renderMain();
    notice('完成 ' + done + ' 条' + (failed ? '，失败 ' + failed + ' 条' : '') + '。');
  }

  let bookTokenRev = 0;
  async function paintBookTokens() {
    const target = ui.tokenLine, book = current, list = entries;
    const my = ++bookTokenRev;
    try {
      const on = list.filter(e => e.enabled);
      let blue = 0, green = 0;
      for (const e of on) {
        const t = await countTokens(e.content);
        e.strategy?.type === 'constant' ? blue += t : green += t;
      }
      if (my !== bookTokenRev || !target?.isConnected || current !== book) return;
      target.textContent = '已开启 ' + on.length + '/' + list.length + ' 条 · 共 ' + fmtTok(blue + green) + ' tokens（蓝灯常驻 ' + fmtTok(blue) + ' · 绿灯 ' + fmtTok(green) + '）';
    } catch (error) {
      if (target?.isConnected) target.textContent = 'Token 统计失败：' + error.message;
    }
  }

  function tokenBadge(text) {
    const badge = el('span', 'wb-badge wb-tok', '… tok');
    void countTokens(text).then(n => { badge.textContent = fmtTok(n) + ' tok'; });
    return badge;
  }

  function bulkPick(entry) {
    const pick = heartSwitch(bulk.selected.has(entry.uid), '选择删除「' + (entry.name || '未命名条目') + '」');
    pick.addEventListener('change', () => {
      pick.checked ? bulk.selected.add(entry.uid) : bulk.selected.delete(entry.uid);
      updateBulkStatus();
    });
    const wrap = el('div', 'wb-bulk-pick');
    wrap.append(pick);
    return wrap;
  }

  function updateBulkStatus() {
    const alive = new Set(entries.map(e => e.uid));
    for (const uid of [...bulk.selected]) if (!alive.has(uid)) bulk.selected.delete(uid);
    if (ui.bulkStatus) ui.bulkStatus.textContent = '批量删除 · 已选 ' + bulk.selected.size + ' 条';
  }

  function renderBulkBar(parent, visible) {
    if (!bulk.on) return;
    const bar = el('div', 'wb-box wb-bulk-bar');
    const status = el('div', 'wb-note', '');
    ui.bulkStatus = status;
    bar.append(status, row(
      button('全选当前结果', () => { visible.forEach(e => bulk.selected.add(e.uid)); renderMain(); }),
      button('取消全选', () => { bulk.selected.clear(); renderMain(); }),
      button('删除选中', removeSelected, 'wb-danger'),
      button('退出批量', () => { bulk.on = false; bulk.selected.clear(); renderMain(); })
    ));
    parent.append(bar);
    updateBulkStatus();
  }

  async function removeSelected() {
    if (!noDrafts()) return;
    const doomed = entries.filter(e => bulk.selected.has(e.uid));
    if (!doomed.length) { notice('请先点爱心选择要删除的条目。'); return; }
    const preview = doomed.slice(0, 12).map(e => '· ' + (e.name || '未命名条目')).join('\n') + (doomed.length > 12 ? '\n……共 ' + doomed.length + ' 条' : '');
    if (!await ask('删除这 ' + doomed.length + ' 条？此操作会保存到当前世界书。\n\n' + preview)) return;
    const uids = new Set(doomed.map(e => e.uid));
    if (await commit(entries.filter(e => !uids.has(e.uid)))) {
      bulk.selected.clear();
      bulk.on = false;
      renderMain();
      notice('已删除 ' + doomed.length + ' 条。');
    }
  }

  async function removeEntry(entry) {
    if (!noDrafts()) return;
    if (!await ask('删除「' + entry.name + '」？此操作会保存到当前世界书。')) return;
    await commit(entries.filter(e => e.uid !== entry.uid));
  }
  function managerDialog(title) {
    const node = el('dialog','wb-dialog');
    node.style.width = 'min(760px, 94vw)';
    node.style.maxHeight = '88dvh'; node.style.overflow = 'auto';
    const body = el('div'); let closed = false, locked = false;
    const close = () => { if (locked || closed) return; closed = true; dialogs.delete(node); node.close(); node.remove(); };
    const exit = button('关闭',close);
    node.append(row(el('h3','',title),exit),body);
    node.addEventListener('cancel', e => { e.preventDefault(); close(); });
    dialogs.set(node,close); D.body.append(node); node.showModal();
    return {node,body,close,get closed(){return closed;},lock(value){locked=value;node.querySelectorAll('button,input,select').forEach(e=>e.disabled=value);}};
  }
  async function verifiedWrite(book, expected, next) {
    await API.updateWorldbookWith(book, latest => {
      if (JSON.stringify(latest) !== JSON.stringify(expected)) throw Error('「'+book+'」已发生变化，请重新打开操作。');
      return clone(next);
    });
    const actual = await API.getWorldbook(book);
    // Compare requested fields while allowing helper-added defaults.
    const contains = (a,b) => b && typeof b === 'object'
      ? Object.keys(b).every(k => contains(a?.[k],b[k])) : a === b;
    if (!Array.isArray(actual) || actual.length !== next.length || !next.every(e => contains(actual.find(a=>a.uid===e.uid), e)))
      throw Error('「'+book+'」保存结果无法确认，请刷新检查后再操作，避免重复添加。');
    return actual;
  }
  async function openTransfer(entry) {
    if (!noDrafts()) return;
    const others = (await API.getWorldbookNames()).filter(n=>n!==current);
    if (!others.length) return notice('没有其他世界书可作为目标。');
    const sourceBook=current, source=clone(entries);
    const modal=managerDialog('复制／转移条目');
    const target=select(others.map(n=>[n,n]),others[0]);
    const mode=select([['copy','复制（保留来源）'],['move','转移（保存目标后删除来源）']],'copy');
    modal.body.append(field('目标世界书',target),field('操作',mode),el('p','wb-note','保留正文、关键词、深度和其他设置；目标 UID 自动重新分配。'),button('执行',async()=>{
      if (busy) return;
      const dest=target.value, moving=mode.value==='move';
      if (!await ask((moving?'转移':'复制')+'「'+entry.name+'」到「'+dest+'」？')) return;
      modal.lock(true); setBusy(true); let copied=false;
      try {
        const before=await API.getWorldbook(dest);
        await verifiedWrite(dest,before,[...clone(before),...freshCopies([entry],before)]);
        copied=true;
        if (moving) {
          const actual=await verifiedWrite(sourceBook,source,source.filter(e=>e.uid!==entry.uid));
          if(current===sourceBook){entries=actual;renderMain();}
        }
        modal.lock(false); modal.close(); notice(moving?'转移完成。':'复制完成。');
      } catch(error) {
        modal.lock(false); modal.close();
        notice((copied?'目标已保存。来源删除未能确认，请检查两本世界书，勿重复转移。\n':'目标保存未能确认，来源未删除；请检查目标后再试。\n')+error.message);
      } finally {setBusy(false);}
    }));
  }
  function presetSources() {
    const manager=W.SillyTavern?.getContext?.().getPresetManager?.('openai');
    if (!manager) throw Error('当前环境无法读取聊天补全预设，请确认已启用聊天补全。');
    return manager;
  }
  function fromPreset(raw) {
    const group=raw.prompt_order?.find(g=>g.character_id===100001)||raw.prompt_order?.[0];
    const order=group?.order||[];
    return (raw.prompts||[]).filter(p=>!p.marker).map(p=>{
      const e=blankEntry(p.name||p.identifier||'预设条目');
      e.content=String(p.content||''); e.enabled=order.find(o=>o.identifier===p.identifier)?.enabled===true;
      e.position.role=['system','user','assistant'].includes(p.role)?p.role:'system';
      e.position.type=p.injection_type===1?'at_depth':'before_character_definition';
      e.position.depth=Number.isSafeInteger(p.injection_depth)&&p.injection_depth>=0?p.injection_depth:4;
      e.position.order=Number.isFinite(p.injection_order)?p.injection_order:100;
      return e;
    });
  }
  async function openImport() {
    if (!noDrafts()) return;
    const destination=current, baseline=clone(entries), modal=managerDialog('缝合条目到「'+current+'」');
    const kind=select([['worldbook','其他世界书'],['preset','聊天补全预设']],'worldbook');
    const source=select([],''), query=textInput('','搜索来源标题、关键词、正文');
    const list=el('div','wb-entry-list'), status=el('p','wb-note');
    let rows=[], selected=new Set(), revision=0, loading=false;
    const draw=()=>{
      list.replaceChildren(); const q=query.value.toLowerCase();
      rows.forEach((e,i)=>{
        if (![e.name,e.content,...getKeys(e,'primary'),...getKeys(e,'secondary')].join('\n').toLowerCase().includes(q)) return;
        const check=createSwitch({enabled:selected.has(i)},()=>{check.checked?selected.add(i):selected.delete(i);status.textContent='已选 '+selected.size+' / '+rows.length;});
        const detail=el('details','wb-entry'); const summary=el('summary','',e.name||'未命名条目');
        detail.append(summary); detail.addEventListener('toggle',()=>{if(detail.open&&detail.childElementCount===1){const pre=el('pre','',e.content||'（空正文）');pre.style.whiteSpace='pre-wrap';detail.append(pre);}});
        list.append(row(check,detail));
      }); status.textContent='已选 '+selected.size+' / '+rows.length;
    };
    const load=async()=>{
      const token=++revision; loading=true; rows=[]; selected.clear(); draw();
      try {
        let result=[];
        if(source.value){
          if(kind.value==='worldbook') result=await API.getWorldbook(source.value);
          else {const d=presetSources().getPresetList(); const raw=d.presets[d.preset_names[source.value]];if(!raw)throw Error('预设不存在');result=fromPreset(clone(raw));}
        }
        if(token!==revision||modal.closed)return;
        rows=result; draw();
      } catch(e){if(token===revision)status.textContent=e.message;}
      finally{if(token===revision)loading=false;}
    };
    const catalog=async()=>{
      const catalogToken=++revision; rows=[];selected.clear();source.replaceChildren();draw();loading=true;
      try{
        const values=kind.value==='worldbook'?(await API.getWorldbookNames()).filter(n=>n!==destination):Object.keys(presetSources().getPresetList().preset_names);
        if(modal.closed || catalogToken!==revision)return;
        values.forEach(n=>{const o=el('option','',n);o.value=n;source.append(o);});await load();
      }catch(e){loading=false;status.textContent=e.message;}
    };
    kind.addEventListener('change',catalog);source.addEventListener('change',load);query.addEventListener('input',draw);
    modal.body.append(row(field('来源类型',kind),field('来源名称',source)),query,
      el('p','wb-note','世界书保留原设置。预设按蓝灯转换，保留正文和身份；动态占位条目跳过。新条目按顺序数值降序排列，不修改来源。'),
      row(button('全选搜索结果',()=>{const q=query.value.toLowerCase();rows.forEach((e,i)=>{if([e.name,e.content,...getKeys(e,'primary'),...getKeys(e,'secondary')].join('\n').toLowerCase().includes(q))selected.add(i);});draw();}),button('取消全选',()=>{selected.clear();draw();})),status,list,
      button('缝入当前世界书',async()=>{
        if(loading||busy||!selected.size)return;
        const chosen=rows.filter((e,i)=>selected.has(i));
        if(!await ask('将选中的 '+chosen.length+' 个条目缝入「'+destination+'」？'))return;
        modal.lock(true);setBusy(true);
        try{
          const next=[...clone(baseline),...freshCopies(chosen,baseline)];
          const actual=await verifiedWrite(destination,baseline,next);
          if(current===destination){entries=actual;renderMain();}
          modal.lock(false);modal.close();notice('已缝入 '+chosen.length+' 个条目。');
        }catch(e){modal.lock(false);modal.close();notice(e.message);}
        finally{setBusy(false);}
      },'wb-primary'));
    await catalog();
  }

  function orderedEntries(source) {
    const onFirst = !!cfg.wbEnabledFirst;
    return [...source].sort((a, b) => (onFirst ? Number(!!b.enabled) - Number(!!a.enabled) : 0)
      || (Number(b.position?.order ?? 100) || 0) - (Number(a.position?.order ?? 100) || 0)
      || Number(!!b.enabled) - Number(!!a.enabled));
  }

  function matchFields(entry, scope) {
    const fields = [];
    if (scope === 'all' || scope === 'name') fields.push({ field: 'name', label: '标题', text: String(entry.name || '') });
    for (const type of ['primary', 'secondary']) {
      if (!['all', 'keys', type].includes(scope)) continue;
      getKeys(entry, type).forEach((text, keyIndex) => fields.push({ field: type, keyIndex, label: type === 'primary' ? '主要关键词' : '辅助关键词', text: String(text) }));
    }
    if (scope === 'all' || scope === 'content') fields.push({ field: 'content', label: '正文', text: String(entry.content || '') });
    return fields;
  }

  function collectMatches(source, query, scope) {
    const hits = [];
    if (!query) return hits;
    for (const entry of orderedEntries(source)) {
      for (const field of matchFields(entry, scope)) {
        let start = 0;
        while ((start = field.text.indexOf(query, start)) !== -1) {
          hits.push({ ...field, uid: entry.uid, name: entry.name || '未命名条目', start, end: start + query.length });
          start += query.length;
        }
      }
    }
    return hits;
  }

  function replaceMatches(source, hits, replacement) {
    const next = clone(source);
    // Reverse offsets within each original field so replacements never shift later matches.
    const groups = new Map();
    for (const hit of hits) {
      const key = JSON.stringify([hit.uid, hit.field, hit.keyIndex]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(hit);
    }
    for (const group of groups.values()) {
      const hit = group[0];
      const entry = next.find(e => e.uid === hit.uid);
      const isKey = ['primary', 'secondary'].includes(hit.field);
      const keys = isKey ? [...getKeys(entry, hit.field)] : null;
      let value = isKey ? String(keys[hit.keyIndex]) : String(entry[hit.field] || '');
      for (const item of group.sort((a, b) => b.start - a.start)) value = value.slice(0, item.start) + replacement + value.slice(item.end);
      if (isKey) { keys[hit.keyIndex] = value; setKeys(entry, hit.field, keys); }
      else entry[hit.field] = value;
    }
    // Remove empty keywords only after all original keyword indices have been processed.
    for (const entry of next) {
      for (const type of ['primary', 'secondary']) {
        if (hits.some(h => h.uid === entry.uid && h.field === type)) setKeys(entry, type, getKeys(entry, type).filter(value => String(value).trim()));
      }
    }
    return next;
  }

  function searchableEntries() {
    return entries.map(entry => {
      const controls = drafts.get(entry.uid);
      if (!controls) return entry;
      const draft = clone(entry);
      draft.name = controls.name.value; draft.content = controls.content.value;
      setKeys(draft, 'primary', parseKeys(controls.primary.value));
      setKeys(draft, 'secondary', parseKeys(controls.secondary.value));
      return draft;
    });
  }

  function revealMatch(hit) {
    if (!hit || !panel) return;
    if (!ui.entryViews.has(hit.uid)) { entryQuery = ''; renderMain(); }
    const view = ui.entryViews.get(hit.uid);
    if (!view) return;
    ui.main.querySelectorAll('.wb-match-card').forEach(card => card.classList.remove('wb-match-card'));
    view.reveal(); view.card.classList.add('wb-match-card');
    const input = view.controls[hit.field];
    let offset = 0;
    if (['primary', 'secondary'].includes(hit.field)) {
      // Find the keyword in the editable comma-separated control, preserving draft spacing.
      const pieces = input.value.split(/[，,]/);
      let keyIndex = 0;
      for (const piece of pieces) {
        if (piece.trim()) {
          if (keyIndex === hit.keyIndex) { offset += piece.length - piece.trimStart().length; break; }
          keyIndex++;
        }
        offset += piece.length + 1;
      }
    }
    view.card.scrollIntoView({ block: 'start', behavior: 'smooth' });
    input.focus({ preventScroll: true });
    input.setSelectionRange(offset + hit.start, offset + hit.end);
    if (hit.field === 'content') {
      const style = W.getComputedStyle(input);
      const columns = Math.max(1, Math.floor(input.clientWidth / (parseFloat(style.fontSize) * .65)));
      const lines = input.value.slice(0, hit.start).split('\n');
      const visualLines = lines.reduce((n, line) => n + Math.max(1, Math.ceil(line.length / columns)), 0) - 1;
      input.scrollTop = Math.max(0, visualLines * parseFloat(style.lineHeight) - input.clientHeight / 3);
    }
  }

  function renderBatch(parent) {
    const box = el('details', 'wb-box');
    box.open = batchState.open;
    box.addEventListener('toggle', () => { batchState.open = box.open; });
    const scope = select([
      ['all', '标题、关键词和正文'], ['name', '仅标题'], ['keys', '主要和辅助关键词'],
      ['primary', '仅主要关键词'], ['secondary', '仅辅助关键词'], ['content', '仅正文']
    ], batchState.scope);
    const find = textInput(batchState.query, '输入要查找的文字');
    const replacement = textInput(batchState.replacement, '替换内容，留空就是删除');
    const status = el('div', 'wb-note');
    const dock = el('div', 'wb-match-nav');
    const dockStatus = el('span', 'wb-note');
    status.setAttribute('aria-live', 'polite');
    function hits() { return collectMatches(searchableEntries(), batchState.query, batchState.scope); }
    function refreshStatus() {
      const matches = hits(), count = new Set(matches.map(h => h.uid)).size;
      if (batchState.index >= matches.length) batchState.index = -1;
      const selected = matches[batchState.index];
      status.textContent = !batchState.query ? '查找区分大小写；逐处定位会展开条目并选中匹配文字。' :
        '共 ' + matches.length + ' 处 · ' + count + ' 个条目' + (selected ? '\n第 ' + (batchState.index + 1) + ' 处｜' + selected.name + '｜' + selected.label + '\n…' + selected.text.slice(Math.max(0, selected.start - 20), selected.end + 35) + '…' : '');
      dock.hidden = !batchState.query || !matches.length;
      dockStatus.textContent = selected ? (batchState.index + 1) + ' / ' + matches.length + ' · ' + selected.name + ' · ' + selected.label : matches.length + ' 处匹配';
      return matches;
    }
    function navigate(step) {
      const matches = hits();
      if (!matches.length) { refreshStatus(); return; }
      batchState.index = batchState.index < 0 ? (step < 0 ? matches.length - 1 : 0) : (batchState.index + step + matches.length) % matches.length;
      const hit = matches[batchState.index];
      refreshStatus(); revealMatch(hit);
    }
    find.addEventListener('input', () => { batchState.query = find.value; batchState.index = -1; refreshStatus(); });
    scope.addEventListener('change', () => { batchState.scope = scope.value; batchState.index = -1; refreshStatus(); });
    replacement.addEventListener('input', () => { batchState.replacement = replacement.value; });
    find.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); navigate(event.shiftKey ? -1 : 1); }
    });
    async function execute(all) {
      if (busy || !current) return;
      if (drafts.size) { notice('请先保存已编辑的条目，再执行替换；草稿仍为你保留。'); return; }
      const matches = collectMatches(entries, batchState.query, batchState.scope);
      if (!batchState.query) throw Error('请填写查找内容。');
      if (!matches.length) { refreshStatus(); return; }
      const index = Math.max(0, Math.min(batchState.index, matches.length - 1));
      const selected = all ? matches : [matches[index]];
      const count = new Set(selected.map(h => h.uid)).size;
      const expected = clone(entries);
      const next = replaceMatches(expected, selected, batchState.replacement);
      const label = all ? '将替换 ' + count + ' 个条目的 ' + selected.length + ' 处匹配' : '将替换「' + selected[0].name + '」的' + selected[0].label + '中这一处匹配';
      if (!await ask(label + '，并保存到世界书。确认？')) return;
      if (await commit(next, expected)) {
        const remaining = collectMatches(entries, batchState.query, batchState.scope);
        batchState.index = remaining.length ? Math.min(index, remaining.length - 1) : -1;
        renderMain();
        if (!all && remaining.length) revealMatch(remaining[batchState.index]);
        if (all) notice('已替换 ' + selected.length + ' 处，涉及 ' + count + ' 个条目。');
      }
    }
    const navigator = row(button('上一处', () => navigate(-1)), button('下一处 / 定位', () => navigate(1)));
    box.append(el('summary', '', '当前世界书条目查找与替换'), field('查找范围', scope), row(find, replacement), navigator,
      row(button('替换当前一处并保存', () => execute(false)), button('一键替换全部并保存', () => execute(true))), status);
    dock.append(dockStatus, button('上一处', () => navigate(-1)), button('下一处', () => navigate(1)));
    refreshStatus(); parent.append(box, dock);
  }

  function renderMain() {
    if (!panel) return;

    ui.main.replaceChildren();
    ui.entryViews = new Map();

    if (!current) {
      ui.main.append(
        el('div', 'wb-empty', '请先选择一本世界书')
      );
      return;
    }

    ui.main.append(
      el('h2', 'wb-main-title', current),
      el(
        'div',
        'wb-note',
        cfg.wbEnabledFirst
          ? '开启的条目排在前面，开启 / 未开启各自按顺序数值从大到小。点击标题展开；查找支持标题、关键词和正文。'
          : '按顺序数值从大到小显示，同顺序启用优先。点击标题展开；查找支持标题、关键词和正文。'
      )
    );
    const onFirstRow = el('label', 'wb-onfirst');
    const onFirst = heartSwitch(!!cfg.wbEnabledFirst, '开启的条目排在未开启的前面');
    onFirst.addEventListener('change', async () => {
      if (!await discardChanges()) { onFirst.checked = !!cfg.wbEnabledFirst; return; }
      cfg.wbEnabledFirst = onFirst.checked;
      saveCfg();
      renderMain();
    });
    onFirstRow.append(onFirst, D.createTextNode('开启的条目排在未开启的前面（整体仍按顺序数值从大到小）'));
    ui.main.append(onFirstRow);
    ui.tokenLine = el('div', 'wb-note wb-token', 'Token 统计中…');
    ui.main.append(ui.tokenLine);
    void paintBookTokens();

    ui.main.append(row(button('新增条目', createEntry), button('缝合条目', openImport),
      button(bulk.on ? '退出批量删除' : '批量删除条目', () => {
        if (!bulk.on && !noDrafts()) return;
        bulk.on = !bulk.on;
        bulk.selected.clear();
        renderMain();
      }, bulk.on ? 'wb-danger' : ''),
      button('改名', () => renameBook(current)), button('导出', () => exportCurrentBook()),
      button('批量翻译条目', translateBook)));
    renderBatch(ui.main);

    const search = textInput(
      entryQuery,
      '搜索条目名称、关键词或正文'
    );

    const doSearch = async () => {
      if (!await discardChanges()) return;
      entryQuery = search.value;
      renderMain();
    };

    search.addEventListener('keydown', event => {
      if (event.key === 'Enter') void doSearch();
    });

    ui.main.append(row(
      search,
      button('搜索', doSearch),
      button('清空', async () => {
        if (!await discardChanges()) return;
        entryQuery = '';
        renderMain();
      }),
    ));

    const list = el('div', 'wb-entry-list');
    const query = entryQuery.trim().toLowerCase();
    let count = 0;
    const visible = [];
    const bulkSlot = el('div');
    ui.main.append(bulkSlot);

    for (const entry of orderedEntries(entries)) {
      const text = [
        entry.name,
        entry.content,
        keysToText(entry, 'primary'),
        keysToText(entry, 'secondary')
      ].join('\n').toLowerCase();

      if (query && !text.includes(query)) continue;

      count++;
      visible.push(entry);
      list.append(renderEntry(entry));
    }

    if (!count) {
      list.append(
        el('div', 'wb-empty', '没有找到匹配条目')
      );
    }

    renderBulkBar(bulkSlot, visible);
    ui.main.append(list);
  }

  function downloadSnapshot() {
    if (!current) return;

    const blob = new W.Blob(
      [JSON.stringify({
        type: 'worldbook-workbench-snapshot',
        version: 2,
        name: current,
        entries
      }, null, 2)],
      { type: 'application/json;charset=utf-8' }
    );

    const url = W.URL.createObjectURL(blob);
    const link = el('a');

    link.href = url;
    link.download = current + '_世界书快照.json';
    D.body.append(link);
    link.click();
    link.remove();

    W.setTimeout(() => W.URL.revokeObjectURL(url), 10000);
  }

  function downloadFile(name, text, type) {
    const blob = new W.Blob([text], { type });
    const url = W.URL.createObjectURL(blob);
    const link = el('a');

    link.href = url;
    link.download = name;
    D.body.append(link);
    link.click();
    link.remove();

    W.setTimeout(() => W.URL.revokeObjectURL(url), 10000);
  }

  const baseStyle = el('style');
  baseStyle.id = 'wb-style';

  baseStyle.textContent = `
:is(#wb-panel,.wb-dialog) {
  --wb-bg: var(--cw-bg);
  --wb-surface: var(--cw-surface);
  --wb-soft: var(--cw-accent-soft);
  --wb-text: var(--cw-text);
  --wb-dim: var(--cw-text-dim);
  --wb-border: var(--cw-border);
  --wb-accent: var(--cw-accent);
  --wb-danger: var(--cw-danger);
  --wb-radius: var(--cw-radius);
  color: var(--wb-text);
  font: calc(14px * var(--cw-fs, 1))/1.65 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
  box-sizing: border-box;
}

:is(#wb-panel,.wb-dialog) *,
:is(#wb-panel,.wb-dialog) *::before,
:is(#wb-panel,.wb-dialog) *::after {
  box-sizing: border-box;
}

#wb-panel {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  height: 100dvh;
  color: var(--wb-text);
  background: var(--wb-bg);
  overflow: hidden;
  backdrop-filter: blur(20px);
}

.wb-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  flex-shrink: 0;
  padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
  border-bottom: 1px solid var(--wb-border);
}

.wb-title {
  flex: 1;
  font-size: calc(18px * var(--cw-fs, 1));
  font-weight: 650;
}

.wb-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.wb-books {
  width: 280px;
  flex-shrink: 0;
  overflow: auto;
  padding: 12px;
  border-right: 1px solid var(--wb-border);
}

.wb-main {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 14px;
}

.wb-book,
.wb-box,
.wb-entry {
  border: 1px solid var(--wb-border);
  border-radius: 0;
  background: var(--wb-surface);
}

.wb-book {
  margin-top: 8px;
  padding: 10px;
}

.wb-book.is-active {
  border-color: var(--wb-accent);
  background: var(--wb-surface);
}

.wb-book-name {
  overflow-wrap: anywhere;
  font-weight: 650;
}

.wb-entry-list {
  margin-top: 12px;
}

.wb-entry {
  margin-bottom: 12px;
  padding: 12px;
}

.wb-entry.is-disabled {
  opacity: .68;
}

.wb-entry-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--wb-border);
}

.wb-entry-name {
  flex: 1;
  min-width: 160px;
}

.wb-entry-input {
  width: 100%;
}

.wb-entry-label {
  display: block;
  margin-top: 10px;
  color: var(--wb-dim);
  font-size: calc(12px * var(--cw-fs, 1));
}

.wb-entry-keys {
  width: 100%;
}

.wb-entry-content {
  display: block;
  width: 100%;
  min-height: 170px;
  margin-top: 5px;
  padding: 10px;
  color: var(--wb-text);
  background: transparent;
  border: 1px solid var(--wb-border);
  border-radius: 0;
  font: inherit;
  line-height: 1.8;
  resize: vertical;
}

.wb-entry-content:focus {
  border-color: var(--wb-accent);
}

.wb-button,
.wb-dialog button {
  min-height: 36px;
  padding: 8px 12px;
  color: var(--wb-text);
  background: var(--wb-surface);
  border: 1px solid var(--wb-border);
  border-radius: 0;
  font: inherit;
  cursor: pointer;
}

.wb-button:hover,
.wb-dialog button:hover {
  border-color: var(--wb-accent);
  background: var(--wb-surface);
}

.wb-button:disabled,
.wb-dialog button:disabled {
  opacity: .45;
  cursor: default;
}

.wb-primary {
  color: var(--wb-text);
  background: var(--wb-surface) !important;
  font-weight: 650;
  border-color: var(--wb-accent) !important;
}

.wb-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.wb-row > input[type="text"] {
  flex: 1;
  min-width: 120px;
  width: auto;
}

.wb-field {
  display: block;
  margin-top: 12px;
}

.wb-field > span {
  display: block;
  margin-bottom: 5px;
  color: var(--wb-dim);
}

:is(#wb-panel,.wb-dialog) input,
:is(#wb-panel,.wb-dialog) select,
:is(#wb-panel,.wb-dialog) textarea {
  max-width: 100%;
  padding: 9px;
  color: var(--wb-text);
  background: var(--wb-surface);
  border: 1px solid var(--wb-border);
  border-radius: 0;
  font: inherit;
}

:is(#wb-panel,.wb-dialog) input[type="text"],
:is(#wb-panel,.wb-dialog) select,
:is(#wb-panel,.wb-dialog) textarea {
  width: 100%;
}

:is(#wb-panel,.wb-dialog) textarea {
  resize: vertical;
  line-height: 1.75;
}

:is(#wb-panel,.wb-dialog) select {
  appearance: none;
  padding-right: 30px;
  background-image:
    linear-gradient(45deg, transparent 50%, var(--wb-dim) 50%),
    linear-gradient(135deg, var(--wb-dim) 50%, transparent 50%);
  background-position:
    calc(100% - 15px) 50%,
    calc(100% - 10px) 50%;
  background-size: 5px 5px;
  background-repeat: no-repeat;
}

:is(#wb-panel,.wb-dialog) option {
  color: var(--wb-text);
  background: var(--wb-bg);
}

:is(#wb-panel,.wb-dialog) :is(
  button,
  input,
  textarea,
  select,
  summary
):focus-visible {
  outline: 2px solid var(--wb-accent);
  outline-offset: 2px;
}

.wb-mode {
  width: auto !important;
  min-width: 120px;
}

.wb-entry-title,
.wb-entry-uid {
  color: var(--wb-dim);
  font-size: calc(12px * var(--cw-fs, 1));
}

.wb-note {
  color: var(--wb-dim);
  font-size: calc(12px * var(--cw-fs, 1));
  white-space: pre-wrap;
}

.wb-empty {
  padding: 30px 10px;
  color: var(--wb-dim);
  text-align: center;
}

.wb-box {
  margin-bottom: 12px;
  padding: 12px;
}

.wb-box summary {
  cursor: pointer;
  font-weight: 650;
}

.wb-settings {
  flex-shrink: 0;
  max-height: 55dvh;
  overflow: auto;
  padding: 14px;
  background: var(--wb-surface);
  border-bottom: 1px solid var(--wb-border);
}

.wb-settings[hidden] {
  display: none;
}

.wb-footer {
  flex-shrink: 0;
  padding: 8px 14px;
  padding-bottom: max(8px, env(safe-area-inset-bottom));
  color: var(--wb-dim);
  font-size: calc(12px * var(--cw-fs, 1));
  border-top: 1px solid var(--wb-border);
}

.wb-dialog {
  width: min(460px, calc(100vw - 28px));
  max-height: 85dvh;
  padding: 22px;
  overflow: auto;
  color: var(--wb-text);
  background: var(--wb-bg);
  border: 1px solid var(--wb-border);
  border-radius: 0;
  box-shadow: 0 18px 70px #0008;
}

.wb-dialog::backdrop {
  background: #0007;
  backdrop-filter: blur(4px);
}

.wb-dialog-title {
  margin-bottom: 12px;
  font-size: calc(18px * var(--cw-fs, 1));
  font-weight: 700;
}

.wb-dialog-message {
  margin-bottom: 14px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

#wb-top {
  display: inline-grid;
  place-items: center;
  align-self: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  margin-left: 14px !important;
  margin-right: 14px !important;
  padding: 3px;
  color: inherit;
  background: transparent;
  border: 0;
  cursor: pointer;
}

#cw-top {
  margin-left: 14px !important;
  margin-right: 14px !important;
}

#wb-fab {
  position: fixed;
  z-index: 2147483645;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  font-size: calc(32px * var(--cw-fs, 1));
  touch-action: none;
  cursor: grab;
  filter: drop-shadow(0 3px 7px #0005);
}

:is(#wb-top,#wb-fab) img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
}

.wb-preview {
  display: grid;
  place-items: center;
  width: 86px;
  height: 86px;
  margin: 10px 0;
  padding: 8px;
  color: var(--wb-text);
  font-size: calc(34px * var(--cw-fs, 1));
  border: 1px solid var(--wb-border);
  background: var(--wb-surface);
}

.wb-preview img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.wb-css-editor {
  min-height: 220px;
  font: calc(13px * var(--cw-fs, 1))/1.65 ui-monospace, Consolas, monospace !important;
}

@media(max-width:680px) {
  .wb-body {
    flex-direction: column;
  }

  .wb-books {
    width: 100%;
    max-height: 30dvh;
    border-right: 0;
    border-bottom: 1px solid var(--wb-border);
  }

  .wb-main {
    padding: 10px;
  }

  .wb-head {
    padding: 10px;
  }

  .wb-entry-name {
    min-width: 140px;
  }
}
`;

  baseStyle.textContent += `
#wb-panel .wb-entry, #wb-panel .wb-book, #wb-panel .wb-box, .wb-settings-section {
  border: 1px solid var(--wb-border); border-radius: var(--wb-radius);
}
#wb-panel .wb-entry.is-disabled { opacity: 1; border-style: dashed; }
#wb-panel .wb-entry { padding: 8px; margin-bottom: 8px; }
#wb-panel .wb-entry-head { padding: 0; border: 0; flex-wrap: nowrap; }
#wb-panel .wb-expand { flex: 1; min-width: 0; text-align: left; overflow-wrap: anywhere; font-weight: 650; min-height: 32px; padding: 4px 8px; line-height: 1.4; }
#wb-panel .wb-entry-body { border-top: 1px solid var(--wb-border); margin-top: 12px; padding-top: 4px; }
#wb-panel [hidden] { display: none !important; }
#wb-panel .wb-enable-label { position: relative; display: flex; align-items: center; justify-content: center; min-width: 32px; min-height: 32px; margin: 0; flex-shrink: 0; cursor: pointer; }
#wb-panel .wb-enable-label span { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
#wb-panel input[type=checkbox] { width: 24px; height: 24px; cursor: pointer; }
#wb-panel button.wb-check {
  all: unset !important; box-sizing: border-box !important; display: inline-grid !important;
  place-items: center !important; width: 32px !important; height: 32px !important;
  min-width: 32px !important; min-height: 32px !important; flex: 0 0 32px !important;
  padding: 0 !important; margin: 0 !important; border: 0 !important;
  background: transparent !important; box-shadow: none !important;
  filter: none !important; transform: none !important; opacity: 1 !important;
  visibility: visible !important; cursor: pointer !important;
}
#wb-panel button.wb-check::before, #wb-panel button.wb-check::after,
#wb-panel .wb-check-art::before, #wb-panel .wb-check-art::after {
  content: none !important; display: none !important;
}
#wb-panel button.wb-check:focus-visible { outline: 2px solid var(--wb-border) !important; outline-offset: 1px !important; }
#wb-panel button.wb-check:disabled { opacity: .55 !important; cursor: wait !important; }
.wb-match-nav { position: sticky; top: 0; z-index: 3; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; padding: 8px; margin: 8px 0; border: 1px solid var(--wb-border); background: var(--wb-bg); backdrop-filter: blur(20px); }
.wb-match-nav > span { flex: 1; min-width: 90px; }
#wb-panel .wb-match-card { scroll-margin-top: 100px; outline: 2px solid var(--wb-accent); outline-offset: 2px; }
.wb-badge { border: 1px solid var(--wb-border); padding: 2px 7px; border-radius: 4px; font-size: calc(12px * var(--cw-fs, 1)); white-space: nowrap; }
.wb-fields-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
#wb-panel .wb-field { min-width: 0; padding: 10px; border: 1px solid var(--wb-border); border-radius: var(--wb-radius); }
#wb-panel .wb-enable-label { border: 0; padding: 0; }
#wb-panel .wb-mode { width: 100% !important; }
#wb-panel .wb-entry-name { min-width: 0; }
.wb-settings-section { padding: 14px; margin-bottom: 14px; }
.wb-settings-section h3 { margin: 0 0 10px; }
.wb-settings-section summary { cursor: pointer; font-weight: 650; }
#wb-panel input, #wb-panel textarea, #wb-panel select { border-radius: var(--wb-radius); }
.wb-dialog.wb-editor { position: fixed; inset: 0; width: 100vw; max-width: none; height: 100vh; height: 100dvh; max-height: none; margin: 0; padding: max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom)); background: var(--wb-bg) !important; color: var(--wb-text) !important; opacity: 1 !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; overflow: hidden !important; overscroll-behavior: none; box-shadow: none !important; animation: none !important; transition: none !important; }
.wb-dialog.wb-editor::backdrop { background: var(--wb-bg) !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; animation: none !important; transition: none !important; }
.wb-dialog.wb-editor[open] { display: flex; flex-direction: column; gap: 10px; }
.wb-editor-head, .wb-editor-search { margin: 0; flex-shrink: 0; padding: 8px; border: 1px solid var(--wb-border); }
.wb-editor-head strong { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.wb-dialog.wb-editor > textarea { flex: 1; min-height: 0; resize: none; overflow-y: auto; overscroll-behavior: none; scroll-behavior: auto; touch-action: pan-y pinch-zoom; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; animation: none !important; transition: none !important; background: var(--wb-surface) !important; color: var(--wb-text) !important; border: 1px solid var(--wb-border); line-height: 1.8; }
@media(max-width:680px) { .wb-fields-grid { grid-template-columns: 1fr; } .wb-entry-head .wb-entry-uid { display: none; } .wb-books { max-height: 24dvh; } .wb-title { flex-basis: 100%; } }
`;

  const compatibilityStyle = el('style');
  compatibilityStyle.id = 'wb-compatibility-style';
  compatibilityStyle.textContent = `
#wb-panel .wb-book.is-active {
  background: var(--wb-surface) !important; color: var(--wb-text) !important;
  border-color: var(--wb-border) !important;
  box-shadow: inset 3px 0 0 var(--wb-border) !important;
}
#wb-panel .wb-book.is-active .wb-book-name { color: var(--wb-text) !important; }
#wb-panel .wb-book.is-active .wb-note { color: var(--wb-text) !important; }
:is(#wb-panel,.wb-dialog) .wb-button:is(:hover,:focus-visible),
:is(#wb-panel,.wb-dialog) .wb-primary {
  background: var(--wb-surface) !important; color: var(--wb-text) !important;
}
`;
    D.head.append(baseStyle, compatibilityStyle);

    function close() {
      requestId++;
      closeEditor?.();
      panel?.remove();
      panel = null;
      ui = {};
    }

    function open(container) {
      if (disposed) return;
      close();
      const missing = API_NAMES.filter(name => typeof API[name] !== 'function');
      if (missing.length) {
        throw Error('缺少酒馆助手接口：\n' + missing.join('\n') + '\n\n请确认酒馆助手扩展已开启并更新到 4.10 或更新版。');
      }
      panel = el('section');
      panel.id = 'wb-panel';
      panel.setAttribute('aria-label', '世界书工作台');
      const header = el('div', 'wb-head');
      header.append(
        el('div', 'wb-note wb-head-note', '排序：全局世界书、当前角色世界书、其他世界书'),
        button('刷新', refreshCatalog)
      );
      const body = el('div', 'wb-body');
      const sidebar = el('aside', 'wb-books');
      const bookSearch = textInput(bookQuery, '搜索世界书');
      const bookBulkBar = el('div', 'wb-bulk-bar');
      const bookList = el('div');
      bookSearch.addEventListener('input', () => {
        bookQuery = bookSearch.value;
        renderBooks();
      });
      sidebar.append(bookSearch, bookBulkBar, bookList);
      const main = el('main', 'wb-main');
      body.append(sidebar, main);
      const status = el('div', 'wb-footer', '正在读取世界书');
      ui = { books: bookList, bookBulkBar, main, status, inlineDirty: false };
      bookBulk.on = false; bookBulk.selected.clear(); bulk.on = false; bulk.selected.clear();
      panel.append(header, body, status);
      panel.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          void requestHubClose();
        }
      });
      container.append(panel);
      void refreshCatalog().catch(error => {
        notice('读取世界书失败：' + error.message);
      });
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      requestId++;
      for (const cancel of [...dialogs.values()]) cancel();
      closeEditor?.();
      panel?.remove();
      panel = null;
      baseStyle.remove();
      compatibilityStyle.remove();
    }

    async function showBook(name) {
      for (let i = 0; i < 60 && panel && (busy || !names.includes(name)); i++) {
        await new Promise(resolve => W.setTimeout(resolve, 100));
      }
      if (!panel) return;
      if (!names.includes(name)) { notice('没有找到世界书「' + name + '」，可能已被改名或删除。'); return; }
      await chooseBook(name);
    }

    return { keep: true, open, close, dispose, canLeave: discardChanges, element: () => panel, showBook };
  }

  // Edit only the selected source span; keep a full-source fallback for rendered Markdown.
  function selectionMessage(range, frame) {
    const el = n => n?.nodeType === 1 ? n : n?.parentElement;
    const start = frame?.closest('.mes') || el(range?.startContainer)?.closest('.mes');
    const end = frame?.closest('.mes') || el(range?.endContainer)?.closest('.mes');
    if (!start || start !== end || !start.isConnected || start.ownerDocument !== DOC) throw Error('请重新选择同一条正文里的文字。');
    if (!frame && (el(range.startContainer)?.closest('.mes_reasoning') || el(range.endContainer)?.closest('.mes_reasoning'))) throw Error('请在正文中选取要修改的文字。');
    const id = Number(start.getAttribute('mesid'));
    if (!Number.isInteger(id) || id < 0) throw Error('没有找到对应楼层。');
    return id;
  }
  async function editSelectedBody(range, text, frame = null) {
    try {
      if (writing || isGenerating()) throw Error('请等当前生成或保存结束后再修改。');
      const id = selectionMessage(range, frame), ctx = context(), identity = currentIdentity(ctx);
      const original = ctx?.chat?.[id];
      if (!original || typeof original.mes !== 'string') throw Error('这条消息暂时无法编辑。');
      const snapshot = stableString(original), raw = original.mes, hits = [];
      for (let at = raw.indexOf(text); text && at >= 0; at = raw.indexOf(text, at + text.length)) hits.push(at);
      const partial = hits.length === 1;
      const sheet = openSheet('修改正文 · 第 ' + id + ' 层');
      const area = node('textarea', 'cw-sheet-text');
      area.value = partial ? text : raw; area.spellcheck = false;
      sheet.body.append(node('p', 'cw-note', partial ? '仅替换选中的文字，其他正文保持原样。' : '选区经过排版处理或在原文中重复出现，请在本层原文中修改，避免替换错位置。'), area);
      let saving = false;
      sheet.requestClose = async () => {
        if (saving) return;
        if (area.value !== (partial ? text : raw) && !await ask('放弃尚未保存的正文修改？')) return;
        sheet.close();
      };
      const save = button('保存修改', async () => {
        if (saving) return;
        try {
          if (disposed || currentIdentity() !== identity || stableString(context()?.chat?.[id]) !== snapshot) throw Error('聊天或消息已变化，请重新选中文字后修改。');
          if (writing || isGenerating()) throw Error('请等当前生成或保存结束。');
          const value = partial ? raw.slice(0, hits[0]) + area.value + raw.slice(hits[0] + text.length) : area.value;
          if (value === raw) { sheet.close(); return; }
          saving = true; writing = true; save.disabled = true;
          const live = context(), next = clone(live.chat), message = next[id];
          message.mes = value;
          if (Array.isArray(message.swipes) && Number.isInteger(message.swipe_id) && message.swipe_id >= 0 && message.swipe_id < message.swipes.length) message.swipes[message.swipe_id] = value;
          await commitChat(live, next);
          sheet.close();
          await refreshChat(live);
          notice('正文修改已保存。');
        } catch (error) { notice(error.message); }
        finally { if (saving) writing = false; saving = false; save.disabled = false; }
      }, 'cw-primary');
      sheet.foot.append(button('取消', () => sheet.requestClose()), save);
      W.setTimeout(() => { if (area.isConnected) { area.focus(); if (partial) area.select(); } }, 50);
    } catch (error) { notice(error.message); }
  }

  // Style native recent-chat nodes so their original navigation/actions remain attached.
  function installWelcomeShelf() {
    const style = node('style'); style.id = 'cw-welcome-style';
    style.textContent = `
.welcomePanel.cw-welcome{width:100%;max-width:100%;box-sizing:border-box;padding:16px;color:var(--SmartThemeBodyColor);}
.cw-welcome .recentChatList{display:flex!important;flex-direction:column!important;gap:12px;width:100%;}
.cw-welcome .recentChat:not(.hidden){display:flex!important;align-items:center;gap:14px;width:100%;min-height:108px;box-sizing:border-box;padding:14px;border:1px solid var(--SmartThemeBorderColor,#888);border-radius:14px;background:var(--SmartThemeBlurTintColor,rgba(128,128,128,.12));}
.cw-welcome .recentChat>.avatar{flex:0 0 70px;width:70px!important;height:94px!important;border-radius:8px!important;overflow:hidden;}
.cw-welcome .recentChat>.avatar img{width:100%!important;height:100%!important;object-fit:cover;border-radius:8px!important;}
.cw-welcome .recentChatInfo{flex:1;min-width:0;overflow:hidden;}
.cw-welcome .chatNameContainer{display:flex;flex-wrap:wrap;gap:6px;min-width:0;}
.cw-welcome .chatName{flex:1 1 100%;min-width:0;white-space:normal;overflow-wrap:anywhere;}
.cw-welcome .chatActions{margin-left:auto;display:flex;gap:5px;}
.cw-welcome .chatActions button{min-width:30px;min-height:30px;}
.cw-welcome .chatMessage{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:normal;overflow-wrap:anywhere;}
#chat .cw-welcome .cw-recent-portrait{display:flex!important;align-items:center;justify-content:center;visibility:visible!important;opacity:1!important;flex:0 0 70px;width:70px;height:94px;overflow:hidden;border-radius:8px;background:rgba(128,128,128,.1)}
#chat .cw-welcome .cw-recent-portrait img{display:block!important;visibility:visible!important;opacity:1!important;width:100%!important;height:100%!important;object-fit:cover!important}
#chat .cw-welcome .cw-has-portrait>.avatar{display:none!important}
@media(max-width:480px){#chat .cw-welcome .cw-recent-portrait{flex-basis:58px;width:58px;height:80px}}
.cw-welcome-links{display:grid;gap:12px;margin-top:20px;width:100%;}
.cw-welcome-links button{display:flex;align-items:center;gap:16px;width:100%;min-height:66px;padding:12px 18px;border:1px solid var(--SmartThemeBorderColor,#888);border-radius:12px;background:var(--SmartThemeBlurTintColor,rgba(128,128,128,.12));color:inherit;text-align:left;cursor:pointer;font:inherit;}
.cw-welcome-icon{display:grid;place-items:center;flex:0 0 36px;width:36px;height:36px;}
.cw-welcome-icon img{width:100%;height:100%;object-fit:contain;}
.cw-welcome-links button:focus-visible{outline:2px solid currentColor;outline-offset:3px;}
@media(max-width:480px){.welcomePanel.cw-welcome{padding:10px}.cw-welcome .recentChat:not(.hidden){padding:10px;gap:10px}.cw-welcome .recentChat>.avatar{flex-basis:58px;width:58px!important;height:80px!important}}
`;
    DOC.head.append(style);
    const decorate = () => {
      if (disposed) return;
      for (const root of DOC.querySelectorAll('.welcomePanel')) {
        root.classList.add('cw-welcome');
        for(const card of root.querySelectorAll('.recentChat')) {
          const avatar=card.dataset.avatar;
          if(!avatar || card.querySelector('.cw-recent-portrait')) continue;
          const character=context()?.characters?.find(c=>c.avatar===avatar);
          const portrait=node('span','cw-recent-portrait'),img=node('img');
          img.alt=character?.name || card.querySelector('.characterName')?.textContent || '角色头像';img.loading='lazy';
          let retry=false;img.onerror=()=>{if(!retry){retry=true;img.src='/thumbnail?type=avatar&file='+encodeURIComponent(avatar);}else{portrait.textContent=img.alt.slice(0,1);}};
          img.src='/characters/'+encodeURIComponent(avatar);portrait.append(img);card.prepend(portrait);card.classList.add('cw-has-portrait');
        }
        if (root.querySelector('.cw-welcome-links')) continue;
        const links = node('nav', 'cw-welcome-links'); links.setAttribute('aria-label', '梨梨工作台快捷入口');
        for (const [label, icon, target, view] of [['角色卡库','worldbook','archive','gallery'],['沉浸式阅读器','sttheme','archive','reader'],['聊天档案馆','archive','archive','archive'],['API 连接','api','api','']]) {
          const go = button('', async () => {
            await openHub(target);
            if(activeTab===target && view==='reader') await modules.archive.enterReader?.({useLast:true});
            else if (activeTab === target && view) modules.archive.setView?.(view);
          });
          const image = node('span','cw-welcome-icon'); paintTabIcon(image,icon);
          go.append(image,node('span','',label)); links.append(go);
        }
        root.append(links);
      }
    };
    let timer = null;
    const obs = new W.MutationObserver(() => {
      if (timer !== null) return;
      timer = W.setTimeout(() => { timer = null; decorate(); }, 100);
    });
    obs.observe(DOC.getElementById('chat') || DOC.body,{childList:true,subtree:true});
    decorate();
    cleanups.push(() => { obs.disconnect(); W.clearTimeout(timer); style.remove(); DOC.querySelectorAll('.cw-recent-portrait').forEach(n=>n.remove()); DOC.querySelectorAll('.cw-has-portrait').forEach(n=>n.classList.remove('cw-has-portrait')); DOC.querySelectorAll('.cw-welcome-links').forEach(n=>n.remove()); DOC.querySelectorAll('.cw-welcome').forEach(n=>n.classList.remove('cw-welcome')); });
  }

  /* ═════════════ 🔌 API 连接 ═════════════ */
  function createApiModule() {
    let panel = null, disposed = false, busy = false;
    const pickedConfigs = new Set();
    const FIELDS = {
      url: '#custom_api_url_text',
      key: '#api_key_custom',
      model: '#model_custom_select',
      post: '#custom_prompt_post_processing',
      includeBody: '#custom_include_body',
      excludeBody: '#custom_exclude_body',
      includeHeaders: '#custom_include_headers'
    };
    const POST_FALLBACK = [['', '未选择'], ['merge', '合并相同角色连续的发言'], ['semi', '半严格（强制对话角色交替）'],
      ['strict', '严格（强制对话角色交替、用户最先）'], ['single', '单一用户消息（无工具）']];

    const q = sel => DOC.querySelector(sel);
    function readField(key) {
      const el = q(FIELDS[key]);
      return el ? String(el.value ?? '') : '';
    }
    function setField(key, value) {
      const el = q(FIELDS[key]);
      if (!el) return false;
      el.value = value;
      el.dispatchEvent(new W.Event('input', { bubbles: true }));
      el.dispatchEvent(new W.Event('change', { bubbles: true }));
      return true;
    }
    function postChoices() {
      const el = q(FIELDS.post);
      if (el && el.options.length) return [...el.options].map(o => [o.value, o.textContent.trim()]);
      return POST_FALLBACK;
    }
    function postLabel(value) {
      return postChoices().find(p => p[0] === value)?.[1] || value || '未选择';
    }
    function hostOf(url) {
      try { return new W.URL(url).host; } catch { return String(url || '').replace(/^https?:\/\//, '').split('/')[0]; }
    }
    function currentConf() {
      return {
        url: readField('url'), key: readField('key'), model: readField('model'), post: readField('post'),
        includeBody: readField('includeBody'), excludeBody: readField('excludeBody'), includeHeaders: readField('includeHeaders')
      };
    }
    function stModels() {
      const select = q(FIELDS.model);
      return select ? [...select.options].map(o => String(o.value)).filter(Boolean) : [];
    }

    async function pushToTavern(conf, { connect = true } = {}) {
      const source = q('#chat_completion_source');
      if (source && source.value !== 'custom') {
        source.value = 'custom';
        source.dispatchEvent(new W.Event('change', { bubbles: true }));
        await sleep(200);
      }
      if (conf.url !== undefined && !setField('url', conf.url)) {
        throw Error('没找到酒馆的自定义接口地址输入框，请先在酒馆里把 API 选成「聊天补全 · 自定义」。');
      }
      if (conf.key !== undefined) setField('key', conf.key);
      for (const key of ['post', 'includeBody', 'excludeBody', 'includeHeaders']) {
        if (conf[key] !== undefined && conf[key] !== null) setField(key, conf[key]);
      }
      if (connect) {
        const btn = q('#api_button_openai');
        if (!btn) throw Error('没找到酒馆的「连接」按钮。');
        btn.click();
        for (let i = 0; i < 45; i++) {
          await sleep(200);
          if (stModels().length) break;
        }
      }
      if (conf.model) {
        const select = q(FIELDS.model);
        if (select) {
          if (![...select.options].some(o => o.value === conf.model)) {
            const option = node('option', '', conf.model);
            option.value = conf.model;
            select.append(option);
          }
          select.value = conf.model;
          select.dispatchEvent(new W.Event('change', { bubbles: true }));
        }
      }
    }

    function setBusy(on) {
      busy = on;
      if(panel){panel.setAttribute('aria-busy',String(on));panel.querySelector('.cw-api-busy')?.remove();if(on){const status=loadingStatus('正在连接…');status.classList.add('cw-api-busy');panel.prepend(status);}}
      panel?.querySelectorAll('button, input, select, textarea').forEach(el => { el.disabled = on; });
    }

    // 一份表单：当前配置和新建 / 编辑弹窗共用
    function buildForm(conf, { onModels, onReset } = {}) {
      let models = [], requestNumber = 0;
      const wrap = node('div', 'api-form-wrap');
      const grid = node('div', 'api-form');
      const url = input('接口网址 https://…', conf.url || '');
      const key = input('密钥 sk-…', conf.key || '');
      key.type = 'password';
      const showKey = button('显示', () => {
        key.type = key.type === 'password' ? 'text' : 'password';
        showKey.textContent = key.type === 'password' ? '显示' : '隐藏';
      });
      const keyRow = node('div', 'api-key-row');
      keyRow.append(key, showKey);
      const model = node('select');
      const post = node('select');
      for (const [value, label] of postChoices()) {
        const option = node('option', '', label);
        option.value = value;
        post.append(option);
      }
      post.value = conf.post || '';

      const modelFilter = input('筛选模型…', '');
      let filterText = '';
      modelFilter.addEventListener('input', () => { filterText = modelFilter.value.trim().toLowerCase(); paintModels(models, model.value); });
      function paintModels(list, keep) {
        models = list;
        model.replaceChildren();
        let all = list.slice();
        if (filterText) all = all.filter(item => item.toLowerCase().includes(filterText));
        if (keep && keep !== '' && !all.includes(keep)) all.unshift(keep);
        if (!all.length) {
          const option = node('option', '', '（先点「拉取模型」）');
          option.value = '';
          model.append(option);
        }
        for (const item of all) {
          const option = node('option', '', item);
          option.value = item;
          model.append(option);
        }
        model.value = keep && all.includes(keep) ? keep : (all[0] || '');
        onModels?.(models);
      }
      paintModels(conf.model ? [conf.model] : [], conf.model || '');
      function resetModels() { requestNumber++; models = []; onReset?.(); paintModels([], ''); }
      url.addEventListener('input', resetModels);
      key.addEventListener('input', resetModels);

      const fetchStatus = loadingStatus('正在读取模型…'); fetchStatus.hidden=true;
      const fetchBtn = button('拉取模型', async () => {
        if (!url.value.trim()) { notice('请先填网址。'); return; }
        const ticket = ++requestNumber, address = url.value.trim(), secret = key.value;
        fetchBtn.disabled = true; fetchStatus.hidden=false;
        onReset?.(); paintModels([], '');
        try {
          const parsed = new W.URL(address);
          if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) throw Error('请填写 HTTP/HTTPS 接口基础网址，不含账号、查询参数或片段。');
          const base = parsed.href.replace(/\/+$/, '').replace(/\/(?:models|chat\/completions)$/, '');
          const response = await apiPost('/api/backends/chat-completions/status', {
            chat_completion_source: 'openai', reverse_proxy: base, proxy_password: secret
          });
          if (ticket !== requestNumber || !wrap.isConnected) return;
          if (response?.error) throw Error('接口拒绝了请求，请检查网址和 Key。');
          const data = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : null;
          if (!data) throw Error('接口没有返回兼容的模型列表。');
          const list = [...new Set(data.map(item => typeof item === 'string' ? item : item?.id).filter(item => typeof item === 'string' && item.trim()))];
          paintModels(list, '');
          notice(list.length ? '已读取 ' + list.length + ' 个模型，可勾选多个保存。' : '接口返回空列表，也可以手动填写模型名称。');
        } catch (error) {
          if (ticket === requestNumber) notice('拉取失败：' + error.message);
        } finally { fetchBtn.disabled = false; fetchStatus.hidden=true; }
      });
      const manual = input('手动添加模型 ID，多个用逗号分隔');
      const manualAdd = button('添加模型', () => {
        const additions = manual.value.split(/[,，\n]/).map(v=>v.trim()).filter(Boolean);
        if (!additions.length) return;
        paintModels([...new Set([...models, ...additions])], model.value);
        manual.value = '';
      });
      const modelRow = node('div', 'api-key-row');
      modelRow.append(model, fetchBtn);

      grid.append(node('label', 'api-label', '网址'), url,
        node('label', 'api-label', '密钥'), keyRow,
        node('label', 'api-label', '筛选模型'), modelFilter,
        node('label', 'api-label', '模型'), modelRow,
        node('label', 'api-label', '提示词后处理'), post);
      wrap.append(grid, fetchStatus, actions(manual, manualAdd));

      const extra = node('details', 'api-extra');
      extra.append(node('summary', '', '附加参数'));
      const areas = {};
      for (const [key2, label, hint] of [
        ['includeBody', '包括主体参数', '聊天完成请求主体中要包含的参数（YAML 对象）\n例：\ntop_k: 20\nrepetition_penalty: 1.1'],
        ['excludeBody', '排除主体参数', '要从请求主体中排除的参数（YAML 数组）\n例：\n- frequency_penalty\n- presence_penalty'],
        ['includeHeaders', '包含请求标头', '附加的请求头（YAML 对象）\n例：\nCustomHeader: 自定义值']
      ]) {
        const area = node('textarea', 'api-extra-text');
        area.rows = 4;
        area.spellcheck = false;
        area.placeholder = hint;
        area.value = conf[key2] || '';
        areas[key2] = area;
        const box = node('label', 'api-extra-field');
        box.append(node('span', 'api-label', label), area);
        extra.append(box);
      }
      wrap.append(extra);

      return {
        el: wrap,
        read: () => ({
          url: url.value.trim().replace(/\/+$/, '').replace(/\/(?:models|chat\/completions)$/, ''), key: key.value, model: model.value, post: post.value,
          includeBody: areas.includeBody.value, excludeBody: areas.excludeBody.value, includeHeaders: areas.includeHeaders.value
        }),
        modelSelect: model
      };
    }

    let savedQuery = '';
    function matchConfig(conf) {
      const q = savedQuery.trim().toLowerCase();
      if (!q) return true;
      return [conf.name, conf.model, conf.url].some(v => String(v || '').toLowerCase().includes(q));
    }
    function sortedConfigs() {
      return cfg.apiConfigs.map((conf, index) => ({ conf, index }))
        .sort((a, b) => (b.conf.fav ? 1 : 0) - (a.conf.fav ? 1 : 0) || a.index - b.index)
        .map(item => item.conf);
    }

    function saveConfigs(next, revert) {
      const previous = cfg.apiConfigs;
      cfg.apiConfigs = next;
      if (!saveCfg()) { cfg.apiConfigs = revert || previous; return false; }
      return true;
    }

    function newId() {
      return 'api-' + Date.now() + '-' + Math.floor(Math.random() * 1e5);
    }

    // 弹窗：新建 / 编辑配置
    async function configDialog(source, title) {
      const sheet = openSheet(title);
      const base = source || { url: '', key: '', model: '', name: '' };
      const name = input('配置名称（留空就用模型名）', base.name || '');
      const form = buildForm(base);
      const nameBox = node('div', 'api-form');
      nameBox.append(node('label', 'api-label', '名称'), name);
      sheet.body.append(nameBox, form.el);
      let saved = false;
      sheet.requestClose = () => sheet.close();
      sheet.foot.append(button('取消', () => sheet.close()),
        button('保存', () => {
          const data = form.read();
          if (!data.url) { notice('请先填网址。'); return; }
          const list = cfg.apiConfigs.slice();
          const value = {
            ...(source || {}),
            id: source?.id || newId(),
            name: name.value.trim() || data.model || hostOf(data.url),
            ...data
          };
          if (source) {
            const at = list.findIndex(item => item.id === source.id);
            if (at >= 0) list[at] = value; else list.push(value);
          } else {
            list.push(value);
          }
          if (!saveConfigs(list)) return;
          saved = true;
          sheet.close();
        }, 'cw-primary'));
      await new Promise(resolve => sheet.onClose(resolve));
      if (saved) render();
    }

    async function multiAddDialog() {
      const sheet = openSheet('新建配置 · 可一次保存多个模型');
      const prefix = input('配置名前缀（可留空）', '');
      const list = node('div', 'api-model-list');
      const picked = new Set();
      let query = '';
      const search = input('筛选模型…', '');
      const count = node('span', 'ca-gallery-count', '');
      let latest = [];
      function paint() {
        list.replaceChildren();
        const visible = latest.filter(m => !query || m.toLowerCase().includes(query.toLowerCase()));
        count.textContent = '已选 ' + picked.size + ' 个 / 共 ' + latest.length + ' 个';
        if (!visible.length) { list.append(node('div', 'cw-empty', latest.length ? '没有匹配的模型' : '先点上面的「拉取模型」')); return; }
        for (const item of visible) {
          const row = node('div', 'api-model-row');
          const pick = heartSwitch(picked.has(item), '选择 ' + item);
          pick.addEventListener('change', () => {
            pick.checked ? picked.add(item) : picked.delete(item);
            count.textContent = '已选 ' + picked.size + ' 个 / 共 ' + latest.length + ' 个';
          });
          const label = button(item, () => { pick.checked = !pick.checked; pick.dispatchEvent(new W.Event('change')); }, 'api-model-name');
          row.append(pick, label);
          list.append(row);
        }
      }
      search.addEventListener('input', () => { query = search.value; paint(); });
      const form = buildForm({ url: '', key: '', model: '' }, { onModels: all => { latest = all; paint(); }, onReset: () => { picked.clear(); } });
      const bar = node('div', 'cw-toolbar');
      bar.append(count, search,
        button('全选当前', () => { latest.filter(m => !query || m.toLowerCase().includes(query.toLowerCase())).forEach(m => picked.add(m)); paint(); }),
        button('取消全选', () => { picked.clear(); paint(); }));
      const nameBox = node('div', 'api-form');
      nameBox.append(node('label', 'api-label', '名称前缀'), prefix);
      sheet.body.append(nameBox, form.el, bar, list);
      paint();
      let saved = 0;
      sheet.requestClose = () => sheet.close();
      sheet.foot.append(button('取消', () => sheet.close()),
        button('保存所选', () => {
          const data = form.read();
          if (!data.url) { notice('请先填网址。'); return; }
          const chosen = [...picked];
          if (!chosen.length) { notice('请先点爱心选择模型。'); return; }
          const base = prefix.value.trim();
          const list2 = cfg.apiConfigs.slice();
          for (const model of chosen) {
            list2.push({ ...data, id: newId(), name: (base ? base + ' · ' : '') + model, model });
          }
          if (!saveConfigs(list2)) return;
          saved = chosen.length;
          sheet.close();
        }, 'cw-primary'));
      await new Promise(resolve => sheet.onClose(resolve));
      if (saved) { notice('已保存 ' + saved + ' 个配置。'); render(); }
    }

    function moveConfig(conf, step) {
      const order = sortedConfigs();
      const at = order.indexOf(conf);
      const target = order[at + step];
      if (!target || !!target.fav !== !!conf.fav) return;
      const list = cfg.apiConfigs.slice();
      const a = list.indexOf(conf), b = list.indexOf(target);
      [list[a], list[b]] = [list[b], list[a]];
      if (saveConfigs(list)) render();
    }

    function render() {
      if (!panel) return;
      panel.replaceChildren();

      // 当前配置：直接编辑
      const now = node('section', 'api-card');
      const head = node('div', 'ca-sec-head');
      const source = q('#chat_completion_source');
      head.append(node('div', 'ca-sec-title', '当前配置'),
        node('span', 'api-source', source ? (source.selectedOptions?.[0]?.textContent?.trim() || source.value) : '读不到接口来源'),
        button('重新读取', render, 'ca-sec-btn'));
      const form = buildForm(currentConf());
      now.append(head, form.el, actions(
        button('应用到酒馆', async () => {
          setBusy(true);
          try {
            await pushToTavern(form.read());
            notice('已写入酒馆并发起连接，右上角的状态灯会显示结果。');
          } catch (error) {
            notice('应用失败：' + error.message);
          } finally {
            setBusy(false);
            render();
          }
        }, 'cw-primary'),
        button('保存为配置', () => configDialog({ ...form.read(), name: '' }, '保存当前配置'))));
      panel.append(now);

      // 已保存配置
      const saved = node('section', 'api-card');
      const savedHead = node('div', 'cw-toolbar');
      const searchInput = input('搜索名称 / 模型 / 网址…', savedQuery);
      searchInput.addEventListener('input', () => {
        savedQuery = searchInput.value;
        render();
        panel.querySelector('#api-search')?.focus();
      });
      searchInput.id = 'api-search';
      savedHead.append(node('div', 'ca-sec-title', '已保存配置 · ' + cfg.apiConfigs.length),
        searchInput,
        button('＋ 新建配置', () => multiAddDialog(), 'cw-primary'),
        button('全选', () => { sortedConfigs().filter(matchConfig).forEach(c => pickedConfigs.add(c.id)); render(); }),
        button('取消全选', () => { pickedConfigs.clear(); render(); }),
        button('导入', importConfigs),
        button('导出', exportConfigs),
        button('删除选中', removePicked, 'cw-danger'));
      const list = node('div', 'api-saved');
      const order = sortedConfigs().filter(matchConfig);
      if (!order.length) list.append(node('div', 'cw-empty', savedQuery ? '没有匹配的配置' : '还没有保存的配置'));
      order.forEach((conf, index) => {
        const row = node('div', 'api-saved-row' + (conf.fav ? ' is-fav' : ''));
        const pick = heartSwitch(pickedConfigs.has(conf.id), '选择「' + conf.name + '」');
        pick.addEventListener('change', () => { pick.checked ? pickedConfigs.add(conf.id) : pickedConfigs.delete(conf.id); });
        const star = button(conf.fav ? '已置顶' : '置顶', () => {
          const list2 = cfg.apiConfigs.map(item => item.id === conf.id ? { ...item, fav: !item.fav } : item);
          if (saveConfigs(list2)) render();
        }, conf.fav ? 'api-pin is-on' : 'api-pin');
        star.title = conf.fav ? '取消置顶' : '置顶到最前面';
        const info = node('div', 'api-saved-info');
        info.append(node('div', 'api-saved-name', conf.name),
          node('div', 'api-saved-meta', (conf.model || '未选模型') + ' · ' + hostOf(conf.url) + (conf.post ? ' · ' + postLabel(conf.post) : '')));
        const up = button('▲', () => moveConfig(conf, -1));
        up.disabled = index === 0 || !!order[index - 1]?.fav !== !!conf.fav;
        const down = button('▼', () => moveConfig(conf, 1));
        down.disabled = index === order.length - 1 || !!order[index + 1]?.fav !== !!conf.fav;
        const acts = node('div', 'api-saved-acts');
        acts.append(
          star,
          button('连接', async () => {
            setBusy(true);
            try {
              await pushToTavern(conf);
              notice('已连接到「' + conf.name + '」。');
            } catch (error) {
              notice('连接失败：' + error.message);
            } finally {
              setBusy(false);
              render();
            }
          }, 'cw-primary'),
          button('编辑', () => configDialog(conf, '编辑配置')),
          up, down,
          button('删除', async () => {
            if (!await ask('删除配置「' + conf.name + '」？')) return;
            if (saveConfigs(cfg.apiConfigs.filter(item => item.id !== conf.id))) render();
          }, 'cw-danger'));
        row.append(pick, info, acts);
        list.append(row);
      });
      saved.append(savedHead, list, node('p', 'cw-note', '收藏的配置会排在最前面；配置里的密钥保存在这台设备的浏览器里，导出的文件同样包含密钥，请不要随便外发。'));
      panel.append(saved);
    }

    async function removePicked() {
      const list = cfg.apiConfigs.filter(c => pickedConfigs.has(c.id));
      if (!list.length) { notice('请先点爱心选择配置。'); return; }
      if (!await ask('删除这 ' + list.length + ' 个配置？\n' + list.slice(0, 10).map(c => '· ' + c.name).join('\n'))) return;
      if (!saveConfigs(cfg.apiConfigs.filter(c => !pickedConfigs.has(c.id)))) return;
      pickedConfigs.clear();
      render();
    }

    function exportConfigs() {
      const picked = cfg.apiConfigs.filter(c => pickedConfigs.has(c.id));
      const list = picked.length ? picked : cfg.apiConfigs;
      if (!list.length) { notice('没有可导出的配置。'); return; }
      download('梨梨工作台_API配置.json', JSON.stringify({ type: 'pear-api-configs', version: 2, configs: list }, null, 2), 'application/json;charset=utf-8');
      notice(picked.length ? '已导出选中的 ' + picked.length + ' 个配置。' : '没有选中任何配置，已导出全部 ' + list.length + ' 个。');
    }

    async function importConfigs() {
      const files = await pickFiles('.json,application/json', true);
      if (!files.length || disposed) return;
      let count = 0;
      const next = cfg.apiConfigs.slice();
      for (const file of files) {
        try {
          const data = JSON.parse(await fileText(file));
          const list = Array.isArray(data) ? data : data?.configs;
          for (const item of Array.isArray(list) ? list : []) {
            if (!item || typeof item !== 'object') continue;
            next.push({
              id: newId(), name: String(item.name || item.model || '导入的配置'),
              url: String(item.url || ''), key: String(item.key || ''), model: String(item.model || ''),
              post: String(item.post || ''), includeBody: String(item.includeBody || ''),
              excludeBody: String(item.excludeBody || ''), includeHeaders: String(item.includeHeaders || ''),
              fav: !!item.fav
            });
            count++;
          }
        } catch (error) {
          notice('读取 ' + file.name + ' 失败：' + error.message);
        }
      }
      if (!count) { notice('文件里没有可用的配置。'); return; }
      if (!saveConfigs(next)) return;
      notice('已导入 ' + count + ' 个配置。');
      render();
    }

    function open(container) {
      panel = node('section');
      panel.id = 'api-panel';
      panel.setAttribute('aria-label', 'API 连接');
      container.append(panel);
      render();
    }
    function close() { panel?.remove(); panel = null; }
    function dispose() { disposed = true; close(); }
    return { keep: true, open, close, dispose, canLeave: async () => !busy, element: () => panel };
  }

  modules.api = createApiModule();

  modules.preset = createPresetModule();
  /* ═════════════ 🎨 酒馆美化 ═════════════ */
  function createThemeModule() {
    const COLORS = [
      ['main_text_color', '主要文本', '--SmartThemeBodyColor'],
      ['italics_text_color', '斜体文本', '--SmartThemeEmColor'],
      ['underline_text_color', '下划线文本', '--SmartThemeUnderlineColor'],
      ['quote_text_color', '引用文本', '--SmartThemeQuoteColor'],
      ['shadow_color', '阴影颜色', '--SmartThemeShadowColor'],
      ['chat_tint_color', '聊天背景', '--SmartThemeChatTintColor'],
      ['blur_tint_color', 'UI 背景', '--SmartThemeBlurTintColor'],
      ['border_color', 'UI 边框', '--SmartThemeBorderColor'],
      ['user_mes_blur_tint_color', '用户消息背景', '--SmartThemeUserMesBlurTintColor'],
      ['bot_mes_blur_tint_color', 'AI 消息背景', '--SmartThemeBotMesBlurTintColor']
    ];
    const NUMBERS = [
      ['chat_width', '页面宽度', 25, 100, 1],
      ['font_scale', '字体比例', 0.5, 1.5, 0.01],
      ['blur_strength', '模糊强度', 0, 20, 1],
      ['shadow_width', '文本阴影宽度', 0, 5, 1]
    ];
    const SORTS = [['used', '排序：最近使用'], ['edited', '排序：最近修改'], ['name', '排序：名称']];

    let panel = null, disposed = false, themes = [], current = null, editing = null, busy = false, loadError = '';
    let draft = null, draftBase = '';
    let sortMode = SORTS.some(s => s[0] === cfg.themeSort) ? cfg.themeSort : 'used';
    const bulk = { on: false, selected: new Set() };
    cfg.themeEdited = object(cfg.themeEdited);

    /* ---------- 预览图放进 IndexedDB（以前放在 localStorage，图一多就把整个工作台的设置挤到存不下） ---------- */
    const shots = new Map();
    let shotsReady = null;
    function shotDb() {
      return new Promise((resolve, reject) => {
        const req = W.indexedDB.open('pear-hub-theme-shots', 1);
        req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('shots')) req.result.createObjectStore('shots'); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || Error('IndexedDB 打不开'));
      });
    }
    async function shotTx(mode, fn) {
      const db = await shotDb();
      try {
        return await new Promise((resolve, reject) => {
          const tx = db.transaction('shots', mode);
          const result = fn(tx.objectStore('shots'));
          tx.oncomplete = () => resolve(result?.result ?? result);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error || Error('写入被中止'));
        });
      } finally { db.close(); }
    }
    async function loadShots() {
      const keys = await shotTx('readonly', s => s.getAllKeys());
      const values = await shotTx('readonly', s => s.getAll());
      shots.clear();
      (keys || []).forEach((k, i) => shots.set(String(k), values[i]));
      // 旧版存在 localStorage 里的预览图：搬过去，然后从设置里删掉，腾出空间
      const old = object(cfg.themeShots);
      const names = Object.keys(old);
      if (names.length) {
        await shotTx('readwrite', s => { for (const n of names) if (typeof old[n] === 'string') s.put(old[n], n); });
        for (const n of names) if (typeof old[n] === 'string' && !shots.has(n)) shots.set(n, old[n]);
        cfg.themeShots = {};
        saveCfg();
      }
    }
    function ensureShots() {
      if (!shotsReady) shotsReady = loadShots().catch(error => { console.warn('[梨梨工作台] 预览图读取失败', error); });
      return shotsReady;
    }
    async function putShot(name, data) { await shotTx('readwrite', s => s.put(data, name)); shots.set(name, data); }
    async function dropShot(name) { try { await shotTx('readwrite', s => s.delete(name)); } catch {} shots.delete(name); }
    async function moveShot(from, to) { const data = shots.get(from); if (!data) return; await putShot(to, data); await dropShot(from); }
    void ensureShots();

    function activeName() {
      const select = DOC.querySelector('#themes');
      return String(select?.value || context()?.powerUserSettings?.theme || '');
    }
    // 在酒馆里直接切主题也记进「最近使用」
    const onNativeChange = event => {
      if (event.target?.id !== 'themes') return;
      const name = String(event.target.value || '');
      if (!name) return;
      cfg.themeUsed[name] = Date.now();
      saveCfg();
    };
    DOC.addEventListener('change', onNativeChange, true);
    cleanups.push(() => DOC.removeEventListener('change', onNativeChange, true));

    function toHex(value) {
      const m = String(value || '').match(/rgba?\(([^)]+)\)/i);
      if (m) {
        const [r, g, b] = m[1].split(',').map(n => Math.max(0, Math.min(255, Math.round(parseFloat(n)))));
        return '#' + [r, g, b].map(n => (n || 0).toString(16).padStart(2, '0')).join('');
      }
      const hex = String(value || '').trim();
      if (/^#[0-9a-f]{3}$/i.test(hex)) return '#' + hex.slice(1).split('').map(c => c + c).join('');
      return /^#[0-9a-f]{6}/i.test(hex) ? hex.slice(0, 7) : '#ffffff';
    }
    function alphaOf(value) {
      const m = String(value || '').match(/rgba\(([^)]+)\)/i);
      if (!m) return 1;
      const parts = m[1].split(',');
      return parts.length > 3 ? Math.max(0, Math.min(1, parseFloat(parts[3]))) : 1;
    }
    function toRgba(hex, alpha) {
      const v = toHex(hex).slice(1);
      const r = parseInt(v.slice(0, 2), 16), g = parseInt(v.slice(2, 4), 16), b = parseInt(v.slice(4, 6), 16);
      return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + Number(alpha).toFixed(2) + ')';
    }

    async function load() {
      const data = await apiPost('/api/settings/get', {});
      themes = (Array.isArray(data?.themes) ? data.themes : []).filter(t => t && typeof t.name === 'string');
    }

    /* ---------- 和酒馆页面保持同步 ---------- */
    let stPower = undefined;
    async function powerModule() {
      if (stPower !== undefined) return stPower;
      try { stPower = await new W.Function('p', 'return import(p)')('/scripts/power-user.js'); }
      catch { stPower = null; }
      return stPower;
    }
    // 酒馆页面里缓存着一份主题列表；存档后不更新它，酒馆「应用」时就会用旧的那份
    async function patchClient(theme, removed = false) {
      const mod = await powerModule();
      const list = Array.isArray(mod?.themes) ? mod.themes : null;
      if (list) {
        const at = list.findIndex(t => t?.name === theme.name);
        if (removed) { if (at >= 0) list.splice(at, 1); }
        else if (at >= 0) list[at] = clone(theme);
        else list.push(clone(theme));
      }
      const select = DOC.querySelector('#themes');
      if (select) {
        const option = [...select.options].find(o => o.value === theme.name);
        if (removed) option?.remove();
        else if (!option) {
          const next = node('option', '', theme.name);
          next.value = theme.name;
          select.append(next);
        }
      }
    }
    function syncPowerUser(theme) {
      const pu = context()?.powerUserSettings;
      if (!pu) return;
      for (const [key, value] of Object.entries(theme)) {
        if (key === 'name' || !(key in pu)) continue;
        const was = pu[key];
        if (was !== null && value !== null && typeof was !== typeof value) continue;
        pu[key] = value && typeof value === 'object' ? clone(value) : value;
      }
      pu.theme = theme.name;
    }
    function applyLive(theme) {
      const root = DOC.documentElement;
      for (const [key, , varName] of COLORS) if (theme[key]) root.style.setProperty(varName, theme[key]);
      if (theme.blur_strength != null) root.style.setProperty('--blurStrength', String(theme.blur_strength));
      if (theme.shadow_width != null) root.style.setProperty('--shadowWidth', String(theme.shadow_width));
      if (theme.font_scale != null) root.style.setProperty('--fontScale', String(theme.font_scale));
      if (theme.chat_width != null) root.style.setProperty('--sheldWidth', theme.chat_width + 'vw');
      if (typeof theme.custom_css === 'string') {
        let style = DOC.getElementById('custom-style');
        if (!style) {
          style = node('style');
          style.id = 'custom-style';
          DOC.head.append(style);
        }
        style.textContent = theme.custom_css;
      }
    }

    async function saveTheme(theme) {
      if (!String(theme?.name || '').trim()) throw Error('主题名称不能为空');
      await apiPostRaw('/api/themes/save', theme);
      cfg.themeEdited[theme.name] = Date.now();
      saveCfg();
      await patchClient(theme);
    }
    async function removeTheme(name) {
      await apiPostRaw('/api/themes/delete', { name });
      delete cfg.themeUsed[name];
      delete cfg.themeEdited[name];
      cfg.themeFavs = cfg.themeFavs.filter(n => n !== name);
      saveCfg();
      await dropShot(name);
      await patchClient({ name }, true);
    }

    async function applyTheme(theme) {
      if (busy) return;
      setBusy(true);
      try {
        try { await load(); } catch {}
        const fresh = themes.find(t => t.name === theme.name) || theme;
        await patchClient(fresh);
        const select = DOC.querySelector('#themes');
        if (select) {
          select.value = fresh.name;
          select.dispatchEvent(new W.Event('input', { bubbles: true }));
          select.dispatchEvent(new W.Event('change', { bubbles: true }));
          await sleep(80);
        }
        // 再按刚读到的文件补一遍，确保颜色、CSS、宽度都是最新存的那份
        syncPowerUser(fresh);
        applyLive(fresh);
        try { context()?.saveSettingsDebounced?.(); } catch {}
        current = fresh.name;
        cfg.themeUsed[fresh.name] = Date.now();
        saveCfg();
        render();
        await dialog('🎨 美化已应用成功！\n现在使用的是「' + fresh.name + '」。');
      } catch (error) {
        notice('应用失败：' + error.message + '\n酒馆还是原来的主题。');
      } finally { setBusy(false); }
    }

    async function shrinkImage(file) {
      const url = URL.createObjectURL(file);
      try {
        const img = new W.Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = () => reject(Error('图片读取失败'));
          img.src = url;
        });
        const scale = Math.min(1, 640 / (img.naturalWidth || 640));
        const canvas = DOC.createElement('canvas');
        canvas.width = Math.round((img.naturalWidth || 420) * scale);
        canvas.height = Math.round((img.naturalHeight || 280) * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.85);
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    async function uploadShot(name) {
      const files = await pickFiles('image/*');
      if (!files.length) return;
      try {
        await putShot(name, await shrinkImage(files[0]));
        render();
      } catch (error) {
        notice('预览图保存失败：' + error.message);
      }
    }

    function sortedThemes() {
      const fav = name => cfg.themeFavs.includes(name) ? 1 : 0;
      const stamp = sortMode === 'used' ? cfg.themeUsed : sortMode === 'edited' ? cfg.themeEdited : null;
      return themes.slice().sort((a, b) => fav(b.name) - fav(a.name)
        || (stamp ? (stamp[b.name] || 0) - (stamp[a.name] || 0) : 0)
        || a.name.localeCompare(b.name, 'zh-CN'));
    }

    function toggleFav(name) {
      const previous = cfg.themeFavs.slice();
      cfg.themeFavs = cfg.themeFavs.includes(name) ? cfg.themeFavs.filter(item => item !== name) : [name, ...cfg.themeFavs];
      if (!saveCfg()) { cfg.themeFavs = previous; return; }
      render();
    }

    function card(theme) {
      const picked = bulk.selected.has(theme.name);
      const box = node('div', 'st-card' + (theme.name === current ? ' is-current' : '') + (cfg.themeFavs.includes(theme.name) ? ' is-fav' : '') + (picked ? ' is-picked' : ''));
      const pic = node('button', 'st-card-pic');
      pic.type = 'button';
      pic.title = bulk.on ? '选择「' + theme.name + '」' : '编辑「' + theme.name + '」';
      const shot = shots.get(theme.name);
      if (shot) {
        const img = node('img');
        img.alt = '';
        img.src = shot;
        pic.append(img);
      } else {
        pic.append(node('span', 'st-card-note', '♪'));
      }
      const pick = () => { picked ? bulk.selected.delete(theme.name) : bulk.selected.add(theme.name); render(); };
      pic.addEventListener('click', () => bulk.on ? pick() : openEditor(theme.name));
      const foot = node('div', 'st-card-foot');
      foot.append(node('div', 'st-card-name', theme.name));
      const acts = node('div', 'st-card-acts');
      acts.append(button('应用', () => applyTheme(theme), 'cw-primary'), button('编辑', () => openEditor(theme.name)));
      foot.append(acts);
      if (theme.name === current) box.append(node('span', 'ca-tag st-card-tag', '使用中'));
      if (bulk.on) {
        const heart = heartSwitch(picked, '选择「' + theme.name + '」');
        heart.classList.add('st-card-pick');
        heart.addEventListener('change', pick);
        box.append(pic, heart, foot);
      } else {
        const star = button(cfg.themeFavs.includes(theme.name) ? '★' : '☆', () => toggleFav(theme.name), 'ca-pin st-card-star');
        star.title = cfg.themeFavs.includes(theme.name) ? '取消收藏' : '收藏（排到最前）';
        box.append(pic, star, foot);
      }
      return box;
    }

    function renderList() {
      const bar = node('div', 'cw-toolbar');
      const sortSelect = node('select', 'st-sort');
      for (const [value, label] of SORTS) {
        const option = node('option', '', label);
        option.value = value;
        sortSelect.append(option);
      }
      sortSelect.value = sortMode;
      sortSelect.addEventListener('change', () => {
        sortMode = sortSelect.value;
        cfg.themeSort = sortMode;
        saveCfg();
        render();
      });
      bar.append(node('span', 'ca-gallery-count', '共 ' + themes.length + ' 套主题' + (current ? ' · 使用中：' + current : '')), sortSelect);
      if (bulk.on) {
        bar.append(
          button('全选', () => { themes.forEach(t => bulk.selected.add(t.name)); render(); }),
          button('取消选择', () => { bulk.selected.clear(); render(); }),
          button('删除选中（' + bulk.selected.size + '）', deleteSelected, 'cw-danger'),
          button('导出选中', exportSelected),
          button('退出批量', () => { bulk.on = false; bulk.selected.clear(); render(); }, 'cw-primary'));
      } else {
        bar.append(
          button('刷新', () => refresh()),
          button('新建（复制当前）', createFromCurrent),
          button('导入主题', importThemes),
          button('批量管理', () => { bulk.on = true; bulk.selected.clear(); render(); }));
      }
      const grid = node('div', 'st-grid');
      if (loadError) grid.append(node('div', 'cw-empty', '读取主题失败：' + loadError));
      else if (!themes.length) grid.append(node('div', 'cw-empty', '没有读到酒馆主题'));
      for (const theme of sortedThemes()) grid.append(card(theme));
      panel.append(bar, grid);
    }

    async function deleteSelected() {
      const names = [...bulk.selected].filter(n => themes.some(t => t.name === n));
      if (!names.length) { notice('请先点卡片或爱心选中要删除的主题。'); return; }
      const live = activeName();
      if (names.length >= themes.length) { notice('不能把主题全部删光，至少留一套。'); return; }
      if (!await ask('删除这 ' + names.length + ' 套主题？删除后无法恢复。\n' + names.join('\n')
        + (names.includes(live) ? '\n\n其中「' + live + '」正在使用，删掉后酒馆会保持现在的样子，下次请换一套。' : ''))) return;
      setBusy(true);
      const failed = [];
      for (const name of names) {
        try { await removeTheme(name); bulk.selected.delete(name); }
        catch (error) { failed.push(name + '（' + error.message + '）'); }
      }
      setBusy(false);
      await refresh();
      notice(failed.length ? '有 ' + failed.length + ' 套没删掉：\n' + failed.join('\n') : '已删除 ' + names.length + ' 套主题。');
    }
    function exportSelected() {
      const list = themes.filter(t => bulk.selected.has(t.name));
      if (!list.length) { notice('请先选中要导出的主题。'); return; }
      if (list.length === 1) download(list[0].name + '.json', JSON.stringify(list[0], null, 2), 'application/json;charset=utf-8');
      else download('酒馆主题-' + list.length + '套.json', JSON.stringify(list, null, 2), 'application/json;charset=utf-8');
    }

    function draftDirty() { return !!draft && JSON.stringify(draft) !== draftBase; }
    function openEditor(name) {
      const theme = themes.find(t => t.name === name);
      if (!theme) return;
      editing = name;
      draft = clone(theme);
      draftBase = JSON.stringify(draft);
      render();
      panel?.scrollTo?.(0, 0);
    }
    async function leaveEditor() {
      if (draftDirty() && !await ask('「' + editing + '」有修改还没保存，确定放弃吗？')) return false;
      editing = null; draft = null; draftBase = '';
      render();
      return true;
    }

    function colorRow(theme, key, label) {
      const row = node('div', 'st-color-row');
      const swatch = node('input');
      swatch.type = 'color';
      swatch.value = toHex(theme[key]);
      const alpha = node('input');
      alpha.type = 'range';
      alpha.min = '0';
      alpha.max = '1';
      alpha.step = '0.01';
      alpha.value = String(alphaOf(theme[key]));
      const text = input('rgba(…)', String(theme[key] ?? ''));
      const sync = () => {
        theme[key] = toRgba(swatch.value, alpha.value);
        text.value = theme[key];
        livePreview();
      };
      swatch.addEventListener('input', sync);
      alpha.addEventListener('input', sync);
      const typed = () => {
        theme[key] = text.value.trim();
        swatch.value = toHex(theme[key]);
        alpha.value = String(alphaOf(theme[key]));
        livePreview();
      };
      text.addEventListener('input', typed);
      row.append(node('span', 'st-color-label', label), swatch, alpha, text);
      return row;
    }
    function livePreview() {
      updateDirtyMark();
    }
    // 编辑页的「应用」：有没保存的修改就先问要不要保存
    async function applyFromEditor() {
      if (!draft || busy) return;
      if (draftDirty()) {
        const pick = await choose('「' + editing + '」修改过了，还没有保存。要先保存吗？', [
          ['save', '保存并应用', '把刚才的修改存进主题，再切换过去'],
          ['plain', '不保存，直接应用', '用上次保存的版本，刚才的修改留在编辑页里'],
          ['cancel', '先不应用']
        ], '🎨 修改还没保存');
        if (!pick || pick === 'cancel') return;
        if (pick === 'save' && !await saveDraft(true)) return;
      }
      const saved = themes.find(t => t.name === editing);
      if (saved) await applyTheme(saved);
    }
    function updateDirtyMark() {
      const mark = panel?.querySelector('.st-dirty');
      if (mark) mark.textContent = draftDirty() ? '有未保存的修改' : '';
    }

    function renderEditor() {
      const theme = draft;
      if (!theme) { editing = null; render(); return; }
      const bar = node('div', 'cw-toolbar');
      bar.append(button('← 返回列表', () => leaveEditor()), node('span', 'ca-page-crumb', '酒馆美化 / ' + editing),
        node('span', 'st-dirty cw-note', ''), button('应用', applyFromEditor), button('保存主题', saveDraft, 'cw-primary'));
      const page = node('div', 'st-editor');

      const top = node('section', 'ca-sec');
      const topHead = node('div', 'ca-sec-head');
      topHead.append(node('div', 'ca-sec-title', '预览图与名称'));
      const shotBox = node('div', 'st-shot');
      const shot = shots.get(editing);
      if (shot) {
        const img = node('img');
        img.src = shot;
        img.alt = '';
        shotBox.append(img);
      } else shotBox.append(node('span', 'st-card-note', '♪'));
      const nameInput = input('主题名称', editing);
      top.append(topHead, shotBox, actions(
        button('上传预览图', () => uploadShot(editing)),
        button('移除预览图', async () => { await dropShot(editing); render(); })),
        node('label', 'api-label', '名称'), nameInput,
        actions(button('改名', () => renameTheme(nameInput.value.trim()))));
      page.append(top);

      const colors = node('section', 'ca-sec');
      const colorsHead = node('div', 'ca-sec-head');
      colorsHead.append(node('div', 'ca-sec-title', '主题颜色'));
      colors.append(colorsHead);
      for (const [key, label] of COLORS) colors.append(colorRow(theme, key, label));
      page.append(colors);

      const numbers = node('section', 'ca-sec');
      const numbersHead = node('div', 'ca-sec-head');
      numbersHead.append(node('div', 'ca-sec-title', '尺寸与效果'));
      numbers.append(numbersHead);
      for (const [key, label, min, max, step] of NUMBERS) {
        const row = node('div', 'st-num-row');
        const range = node('input');
        range.type = 'range';
        range.min = String(min);
        range.max = String(max);
        range.step = String(step);
        range.value = String(theme[key] ?? min);
        const value = node('span', 'st-num-value', String(theme[key] ?? min));
        range.addEventListener('input', () => {
          theme[key] = Number(range.value);
          value.textContent = range.value;
          livePreview();
        });
        row.append(node('span', 'st-color-label', label), range, value);
        numbers.append(row);
      }
      page.append(numbers);

      const css = node('section', 'ca-sec');
      const cssHead = node('div', 'ca-sec-head');
      cssHead.append(node('div', 'ca-sec-title', '自定义 CSS'));
      const area = node('textarea', 'st-css');
      area.rows = 10;
      area.spellcheck = false;
      area.value = String(theme.custom_css ?? '');
      area.addEventListener('input', () => { theme.custom_css = area.value; livePreview(); });
      cssHead.append(button('全屏编辑', async () => {
        const next = await editText(editing + ' · 自定义 CSS', area.value);
        if (next === null) return;
        area.value = next;
        theme.custom_css = next;
        livePreview();
      }, 'ca-sec-btn'));
      css.append(cssHead, area);
      page.append(css);

      const bg = node('section', 'ca-sec');
      const bgHead = node('div', 'ca-sec-head');
      bgHead.append(node('div', 'ca-sec-title', '背景'));
      const bgGrid = node('div', 'st-bg-grid');
      bgHead.append(button('上传背景', async () => {
        const files = await pickFiles('image/*');
        if (!files.length) return;
        setBusy(true);
        try {
          await apiUpload('/api/backgrounds/upload', { avatar: files[0] });
          notice('背景已上传。');
          await paintBackgrounds(bgGrid);
        } catch (error) {
          notice('上传失败：' + error.message);
        } finally { setBusy(false); }
      }, 'ca-sec-btn'), button('刷新', () => paintBackgrounds(bgGrid), 'ca-sec-btn'));
      bg.append(bgHead, bgGrid, node('p', 'cw-note', '背景是酒馆全局设置，和主题分开保存；点一下就会立刻换。'));
      void paintBackgrounds(bgGrid);
      page.append(bg);

      page.append(actions(
        button('保存主题', saveDraft, 'cw-primary'),
        button('应用这套主题', applyFromEditor),
        button('放弃修改', () => { if (!draftDirty()) return; draft = JSON.parse(draftBase); render(); }),
        button('导出主题', () => download(editing + '.json', JSON.stringify(theme, null, 2), 'application/json;charset=utf-8')),
        button('删除主题', async () => {
          if (themes.length <= 1) { notice('这是最后一套主题，不能删。'); return; }
          if (!await ask('删除主题「' + editing + '」？删除后无法恢复。')) return;
          setBusy(true);
          try {
            await removeTheme(editing);
            editing = null; draft = null; draftBase = '';
            await refresh();
            notice('已删除。');
          } catch (error) {
            notice('删除失败：' + error.message);
          } finally { setBusy(false); }
        }, 'cw-danger')));
      panel.append(bar, page);
      updateDirtyMark();
    }

    async function saveDraft(quiet = false) {
      if (!draft || busy) return false;
      setBusy(true);
      try {
        const payload = clone(draft);
        payload.name = editing;
        await saveTheme(payload);
        const at = themes.findIndex(t => t.name === editing);
        if (at >= 0) themes[at] = clone(payload); else themes.push(clone(payload));
        draftBase = JSON.stringify(draft);
        const live = activeName() === editing;
        if (live) { syncPowerUser(payload); applyLive(payload); try { context()?.saveSettingsDebounced?.(); } catch {} }
        render();
        if (quiet !== true) notice('已保存。' + (live ? '这是正在使用的主题，已经刷新到酒馆里了。' : '\n它不是当前使用的主题，点「应用」才会生效。'));
        return true;
      } catch (error) {
        notice('保存失败：' + error.message + '\n修改还留在这里，没有丢。');
        return false;
      } finally { setBusy(false); }
    }

    async function renameTheme(next) {
      const old = editing;
      if (!next || next === old) return;
      if (themes.some(t => t.name === next)) { notice('已经有同名主题了。'); return; }
      setBusy(true);
      try {
        const payload = clone(draft);
        payload.name = next;
        await saveTheme(payload);
        const wasLive = activeName() === old;
        await apiPostRaw('/api/themes/delete', { name: old });
        await patchClient({ name: old }, true);
        await moveShot(old, next);
        for (const map of [cfg.themeUsed, cfg.themeEdited]) if (map[old]) { map[next] = map[old]; delete map[old]; }
        cfg.themeFavs = cfg.themeFavs.map(n => n === old ? next : n);
        saveCfg();
        if (wasLive) {
          const select = DOC.querySelector('#themes');
          if (select) select.value = next;
          syncPowerUser(payload);
          try { context()?.saveSettingsDebounced?.(); } catch {}
          current = next;
        }
        editing = next;
        draft = payload; draftBase = JSON.stringify(draft);
        await refresh();
        notice('已改名为「' + next + '」。');
      } catch (error) {
        notice('改名失败：' + error.message);
      } finally { setBusy(false); }
    }

    async function paintBackgrounds(grid) {
      grid.replaceChildren(node('div', 'cw-empty', '读取背景…'));
      try {
        const list = await apiPost('/api/backgrounds/all', {});
        const files = Array.isArray(list) ? list : Array.isArray(list?.images) ? list.images : [];
        grid.replaceChildren();
        for (const entry of files) {
          const file = typeof entry === 'string' ? entry : String(entry?.filename || entry?.name || '');
          if (!file) continue;
          const item = node('button', 'st-bg');
          item.type = 'button';
          item.title = file;
          const img = node('img');
          img.loading = 'lazy';
          img.alt = '';
          img.src = '/thumbnail?type=bg&file=' + encodeURIComponent(file);
          item.append(img);
          item.addEventListener('click', () => {
            const target = [...DOC.querySelectorAll('.bg_example')].find(el => el.getAttribute('bgfile') === file);
            if (target) { target.click(); return; }
            const bgEl = DOC.getElementById('bg1');
            if (bgEl) bgEl.style.backgroundImage = 'url("backgrounds/' + encodeURIComponent(file) + '")';
            notice('已临时换上这张背景；要长期保存，请在酒馆的背景菜单里再点一次。');
          });
          grid.append(item);
        }
        if (!grid.children.length) grid.append(node('div', 'cw-empty', '没有读到背景图'));
      } catch (error) {
        grid.replaceChildren(node('div', 'cw-empty', '读取背景失败：' + error.message));
      }
    }

    async function createFromCurrent() {
      const name = await dialog('新主题的名称：', 'prompt', uniqueName((current || '主题') + ' 副本', themes.map(t => t.name)));
      if (name === null || !name.trim()) return;
      if (themes.some(t => t.name === name.trim())) { notice('已经有同名主题了。'); return; }
      const base = clone(themes.find(t => t.name === current) || themes[0] || {});
      // 以酒馆此刻的真实设置为准（可能在酒馆里改过还没存）
      const pu = context()?.powerUserSettings;
      if (pu) for (const key of Object.keys(base)) if (key !== 'name' && key in pu) base[key] = clone(pu[key]);
      base.name = name.trim();
      setBusy(true);
      try {
        await saveTheme(base);
        await refresh();
        notice('已新建主题「' + base.name + '」。');
      } catch (error) {
        notice('新建失败：' + error.message);
      } finally { setBusy(false); }
    }

    async function importThemes() {
      const files = await pickFiles('.json,application/json', true);
      if (!files.length) return;
      let count = 0;
      setBusy(true);
      try {
        for (const file of files) {
          try {
            const data = JSON.parse(await fileText(file));
            for (const theme of Array.isArray(data) ? data : [data]) {
              if (!theme || typeof theme !== 'object') continue;
              let name = String(theme.name || file.name.replace(/\.json$/i, '')).trim();
              if (themes.some(t => t.name === name)) {
                const pick = await choose('已经有叫「' + name + '」的主题了。', [['over', '覆盖它'], ['copy', '另存为副本'], ['skip', '跳过']], '🎨 导入主题');
                if (!pick || pick === 'skip') continue;
                if (pick === 'copy') name = uniqueName(name, themes.map(t => t.name));
              }
              theme.name = name;
              await saveTheme(theme);
              if (!themes.some(t => t.name === name)) themes.push(theme);
              count++;
            }
          } catch (error) {
            notice('读取 ' + file.name + ' 失败：' + error.message);
          }
        }
        await refresh();
      } finally { setBusy(false); }
      if (count) notice('已导入 ' + count + ' 套主题。');
    }

    function setBusy(on) {
      busy = on;
      if (panel) panel.setAttribute('aria-busy', String(!!on));
    }

    async function refresh() {
      try {
        await Promise.all([load(), ensureShots()]);
        loadError = '';
      } catch (error) {
        loadError = error.message;
      }
      current = activeName() || current;
      if (editing && !themes.some(t => t.name === editing)) { editing = null; draft = null; draftBase = ''; }
      render();
    }

    function render() {
      if (!panel) return;
      const top = panel.scrollTop;
      panel.replaceChildren();
      if (editing && draft) renderEditor();
      else renderList();
      panel.scrollTop = top;
    }

    function open(container) {
      panel = node('section');
      panel.id = 'st-panel';
      panel.setAttribute('aria-label', '酒馆美化');
      container.append(panel);
      if (!editing) { draft = null; draftBase = ''; }
      bulk.on = false; bulk.selected.clear();
      panel.append(node('div', 'cw-empty', '读取酒馆主题…'));
      void refresh();
    }
    function close() {
      panel?.remove(); panel = null;
    }
    function dispose() { disposed = true; close(); }
    return {
      keep: true, open, close, dispose,
      canLeave: async () => !busy,
      element: () => panel
    };
  }

  modules.sttheme = createThemeModule();

  modules.worldbook = createWorldbookModule();

  /* ═════════════ 🧰 工具：正则 / 脚本 / 插件（梨梨 & 陈野 v3.6） ═════════════ */
  function createToolsModule() {
    const KINDS = [['regex', '正则'], ['script', '脚本'], ['plugin', '插件']];
    const SCOPES = [['global', '全局'], ['preset', '预设'], ['character', '角色']];
    const PLACES = [[1, '用户输入'], [2, 'AI 输出'], [3, '快捷命令'], [5, '世界书'], [6, '推理']];
    let panel = null, busy = false;
    let kind = 'regex', scope = 'global', target = '';
    let work = null, baseline = '', dirty = false, query = '', loadId = 0, loadError = '';
    let plugins = [], pluginPending = false;
    const selected = new Set();
    const open = new Set();
    const ui = {};

    const saved = object(cfg.tools);
    if (KINDS.some(k => k[0] === saved.kind)) kind = saved.kind;
    if (SCOPES.some(k => k[0] === saved.scope)) scope = saved.scope;

    function remember() {
      const t = object(cfg.tools);
      t.kind = kind; t.scope = scope;
      if (scope === 'preset') t.preset = target;
      if (scope === 'character') t.char = target;
      cfg.tools = t;
      saveCfg();
    }
    function uid() {
      try { return W.crypto.randomUUID(); } catch { return 'id-' + Date.now() + '-' + Math.floor(Math.random() * 1e6); }
    }
    function ctx() { return context(); }
    function ext() { return ctx()?.extensionSettings || {}; }
    function presetManager() {
      const m = ctx()?.getPresetManager?.('openai');
      if (!m?.getPresetList) throw Error('聊天补全预设管理器尚未就绪。');
      return m;
    }
    function presetNames() {
      try { return presetManager().getAllPresets().filter(n => n && n !== 'in_use'); } catch { return []; }
    }
    function presetInUse() {
      try { return presetManager().getSelectedPresetName() || ''; } catch { return ''; }
    }
    function presetRaw(name) {
      const data = presetManager().getPresetList();
      const index = data.preset_names?.[name];
      let raw = data.presets?.[index];
      if (typeof raw === 'string') raw = JSON.parse(raw);
      if (!raw) throw Error('预设「' + name + '」不存在，请刷新。');
      return raw;
    }
    async function writePresetExt(name, key, value) {
      const m = presetManager();
      if (typeof m.writePresetExtensionField === 'function') {
        await m.writePresetExtensionField({ name, path: key, value: clone(value) });
        return;
      }
      const data = m.getPresetList();
      const index = data.preset_names[name];
      const raw = clone(presetRaw(name));
      raw.extensions = object(raw.extensions);
      raw.extensions[key] = clone(value);
      await m.savePreset(name, raw, { skipUpdate: name !== presetInUse() });
      data.presets[index] = raw;
    }
    function characters() {
      const list = Array.isArray(ctx()?.characters) ? ctx().characters : [];
      return list.filter(c => c?.avatar).slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh'));
    }
    function liveAvatar() {
      const c = ctx();
      return c?.characters?.[c?.characterId]?.avatar || '';
    }
    function charName(avatar) {
      return characters().find(c => c.avatar === avatar)?.name || avatar;
    }
    async function readCard(avatar) {
      return apiPost('/api/characters/get', { avatar_url: avatar });
    }
    // 酒馆的合并接口不能缩短数组：先写 null 清空，再写新值；第二步失败就把原值写回去
    async function writeCardExt(avatar, key, value, previous) {
      const merge = v => apiPostRaw('/api/characters/merge-attributes', { avatar, data: { extensions: { [key]: v } } });
      await merge(null);
      try {
        await merge(value);
      } catch (error) {
        try { await merge(previous); } catch {}
        throw error;
      }
      try { await ctx()?.getCharacters?.(); } catch {}
    }

    /* ---------- 脚本树（兼容文件夹、兼容新旧两种存法） ---------- */
    function scriptSlot(extensions) {
      const th = extensions?.tavern_helper;
      if (th && !Array.isArray(th) && Array.isArray(th.scripts)) return { wrap: th, get: () => th.scripts, set: v => { th.scripts = v; } };
      if (Array.isArray(th)) {
        const pair = th.find(p => Array.isArray(p) && p[0] === 'scripts' && Array.isArray(p[1]));
        if (pair) return { wrap: th, get: () => pair[1], set: v => { pair[1] = v; } };
      }
      if (Array.isArray(extensions?.TavernHelper_scripts)) return { legacy: true, get: () => extensions.TavernHelper_scripts, set: v => { extensions.TavernHelper_scripts = v; } };
      return null;
    }
    function globalScriptSlot() {
      const e = ext();
      if (Array.isArray(e.tavern_helper?.script?.scripts)) return { obj: e.tavern_helper.script, key: 'scripts' };
      if (Array.isArray(e.TavernHelper?.script?.scriptsRepository)) return { obj: e.TavernHelper.script, key: 'scriptsRepository' };
      if (Array.isArray(e.TavernHelper?.script?.scripts)) return { obj: e.TavernHelper.script, key: 'scripts' };
      return null;
    }
    function flatScripts(tree) {
      const out = [];
      const walk = (items, folder) => {
        for (const item of items || []) {
          if (item && item.type === 'folder' && Array.isArray(item.scripts)) walk(item.scripts, item.name || '文件夹');
          else if (item && typeof item === 'object' && 'content' in item) { out.push(item); folderOf.set(item, folder || ''); }
        }
      };
      folderOf = new WeakMap();
      walk(tree, '');
      return out;
    }
    let folderOf = new WeakMap();
    function containerOf(tree, item) {
      if (tree.includes(item)) return tree;
      for (const n of tree) {
        if (n && n.type === 'folder' && Array.isArray(n.scripts)) {
          const found = containerOf(n.scripts, item);
          if (found) return found;
        }
      }
      return null;
    }
    // 能用酒馆助手接口时优先用它（会立即重载脚本）
    function helperScriptType() {
      const get = helperFn('getScriptTrees'), put = helperFn('replaceScriptTrees');
      if (!get || !put) return null;
      if (scope === 'global') return 'global';
      if (scope === 'preset' && target === presetInUse()) return 'preset';
      if (scope === 'character' && target === liveAvatar()) return 'character';
      return null;
    }

    /* ---------- 读取 / 保存 ---------- */
    async function loadWork() {
      const id = ++loadId;
      work = null; loadError = ''; dirty = false; selected.clear(); open.clear();
      paint();
      try {
        let next;
        if (kind === 'plugin') { await loadPlugins(); if (id === loadId) { paint(); void autoCheck(); } return; }
        if (!target && scope !== 'global') { work = null; paint(); return; }
        if (kind === 'regex') {
          if (scope === 'global') next = { list: clone(Array.isArray(ext().regex) ? ext().regex : []) };
          else if (scope === 'preset') next = { list: clone(presetRaw(target).extensions?.regex_scripts || []) };
          else {
            const card = await readCard(target);
            next = { list: clone(card?.data?.extensions?.regex_scripts || []), previous: card?.data?.extensions?.regex_scripts ?? [] };
          }
        } else {
          const via = helperScriptType();
          if (via) {
            try {
              const trees = await helperFn('getScriptTrees')({ type: via });
              if (Array.isArray(trees)) next = { tree: clone(trees), via };
            } catch {}
          }
          if (!next) {
            if (scope === 'global') {
              const slot = globalScriptSlot();
              if (!slot) throw Error('没有找到酒馆助手的全局脚本库，请确认酒馆助手已启用。');
              next = { tree: clone(slot.obj[slot.key]) };
            } else if (scope === 'preset') {
              const e = clone(object(presetRaw(target).extensions));
              let slot = scriptSlot(e);
              if (!slot) { e.tavern_helper = { scripts: [] }; slot = scriptSlot(e); }
              next = { tree: slot.get(), exts: e, slot };
            } else {
              const card = await readCard(target);
              const e = clone(object(card?.data?.extensions));
              let slot = scriptSlot(e);
              if (!slot) { e.tavern_helper = { scripts: [] }; slot = scriptSlot(e); }
              next = { tree: slot.get(), exts: e, slot, previous: clone(object(card?.data?.extensions)) };
            }
          }
        }
        if (id !== loadId) return;
        work = next;
        baseline = JSON.stringify(work.list || work.tree);
      } catch (error) {
        if (id !== loadId) return;
        loadError = error.message || String(error);
      }
      paint();
    }
    function items() {
      if (!work) return [];
      return kind === 'regex' ? work.list : flatScripts(work.tree);
    }
    function touch() {
      dirty = JSON.stringify(work?.list || work?.tree) !== baseline;
      paintStatus();
    }

    async function saveWork() {
      if (!work || busy || !dirty) return true;
      busy = true; paintStatus('正在保存…');
      try {
        if (kind === 'regex') {
          const list = work.list;
          for (const r of list) if (!r.id) r.id = uid();
          if (scope === 'global') {
            ext().regex = clone(list);
            ctx().saveSettingsDebounced?.();
          } else if (scope === 'preset') {
            await writePresetExt(target, 'regex_scripts', list);
          } else {
            await writeCardExt(target, 'regex_scripts', clone(list), work.previous);
            work.previous = clone(list);
          }
        } else {
          const tree = work.tree;
          for (const s of flatScripts(tree)) if (!s.id) s.id = uid();
          if (work.via) {
            await helperFn('replaceScriptTrees')(clone(tree), { type: work.via });
          } else if (scope === 'global') {
            const slot = globalScriptSlot();
            if (!slot) throw Error('没有找到全局脚本库。');
            slot.obj[slot.key] = clone(tree);
            ctx().saveSettingsDebounced?.();
          } else {
            work.slot.set(clone(tree));
            const e = work.exts;
            const key = work.slot.legacy ? 'TavernHelper_scripts' : 'tavern_helper';
            if (scope === 'preset') await writePresetExt(target, key, e[key]);
            else { await writeCardExt(target, key, clone(e[key]), work.previous?.[key]); work.previous = clone(e); }
          }
        }
        baseline = JSON.stringify(work.list || work.tree);
        dirty = false;
        const live = (scope === 'character' && target === liveAvatar()) || (scope === 'preset' && target === presetInUse()) || scope === 'global';
        notice('已保存。' + (kind === 'script' && !work.via && live ? '\n正在运行的脚本要刷新网页后才会换成新内容。' : '')
          + (kind === 'regex' && live ? '\n点「刷新聊天」就能看到新的正则效果。' : ''));
        return true;
      } catch (error) {
        notice('保存失败：' + (error.message || error));
        return false;
      } finally {
        busy = false; paint();
      }
    }
    async function confirmLeave() {
      if (!dirty) return true;
      const pick = await choose('当前「' + where() + '」有修改还没保存。', [
        ['save', '保存再继续'], ['drop', '放弃修改'], ['stay', '留在这里']
      ], '🌿 未保存的修改');
      if (pick === 'save') return saveWork();
      if (pick === 'drop') { dirty = false; return true; }
      return false;
    }
    function where() {
      const k = KINDS.find(x => x[0] === kind)[1];
      if (kind === 'plugin') return '插件';
      if (scope === 'global') return '全局' + k;
      if (scope === 'preset') return '预设「' + target + '」的' + k;
      return '角色「' + charName(target) + '」的' + k;
    }

    /* ---------- 条目操作 ---------- */
    function newRegex(name) {
      return { id: uid(), scriptName: name || '新正则', findRegex: '', replaceString: '', trimStrings: [], placement: [2],
        disabled: false, markdownOnly: true, promptOnly: false, runOnEdit: true, substituteRegex: 0, minDepth: null, maxDepth: null };
    }
    function newScript(name) {
      return { type: 'script', id: uid(), name: name || '新脚本', content: '', info: '', enabled: false, button: { enabled: true, buttons: [] }, data: {} };
    }
    const nameOf = item => kind === 'regex' ? (item.scriptName || '未命名正则') : (item.name || '未命名脚本');
    const isOn = item => kind === 'regex' ? !item.disabled : item.enabled !== false;
    const setOn = (item, on) => { if (kind === 'regex') item.disabled = !on; else item.enabled = on; };
    function removeItem(item) {
      if (kind === 'regex') { const at = work.list.indexOf(item); if (at >= 0) work.list.splice(at, 1); }
      else { const box = containerOf(work.tree, item); if (box) box.splice(box.indexOf(item), 1); }
      selected.delete(item); open.delete(item);
    }
    function addItems(list) {
      for (const item of list) {
        if (kind === 'regex') work.list.push(item); else work.tree.push(item);
      }
    }
    function move(item, delta) {
      const box = kind === 'regex' ? work.list : containerOf(work.tree, item);
      if (!box) return;
      const at = box.indexOf(item), to = at + delta;
      if (to < 0 || to >= box.length) return;
      box.splice(at, 1); box.splice(to, 0, item);
      touch(); paintList();
    }
    function normalizeImport(data) {
      const out = [];
      const take = v => {
        if (Array.isArray(v)) { v.forEach(take); return; }
        if (!v || typeof v !== 'object') return;
        if (kind === 'regex') {
          if (typeof v.findRegex === 'string' || typeof v.scriptName === 'string') out.push({ ...newRegex(v.scriptName), ...clone(v), id: uid() });
          else if (typeof v.find_regex === 'string') {
            const r = newRegex(v.script_name);
            r.findRegex = v.find_regex; r.replaceString = String(v.replace_string ?? '');
            r.disabled = v.enabled === false; out.push(r);
          } else if (Array.isArray(v.regex_scripts)) take(v.regex_scripts);
        } else {
          if (v.type === 'folder' && Array.isArray(v.scripts)) { const f = clone(v); f.id = uid(); flatScripts([f]).forEach(s => { s.id = uid(); }); out.push(f); }
          else if (typeof v.content === 'string') out.push({ ...newScript(v.name), ...clone(v), type: 'script', id: uid() });
          else if (Array.isArray(v.scripts)) take(v.scripts);
        }
      };
      take(data);
      return out;
    }
    async function importFiles() {
      const files = await pickFiles('.json,application/json', true);
      if (!files.length || !panel) return;
      let added = 0;
      for (const file of files) {
        try {
          const list = normalizeImport(JSON.parse(await fileText(file)));
          addItems(list); added += list.length;
        } catch (error) { notice('「' + file.name + '」读不出来：' + error.message); }
      }
      if (added) { touch(); paintList(); notice('导入了 ' + added + ' 条，点「保存修改」写入' + where() + '。'); }
      else notice('没有找到能导入的' + (kind === 'regex' ? '正则' : '脚本') + '。');
    }
    function exportItems(list, label) {
      if (!list.length) { notice('没有可以导出的条目。'); return; }
      const data = list.length === 1 ? list[0] : list;
      const base = kind === 'regex' ? '正则-' : '酒馆助手脚本-';
      download(base + label + '.json', JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
    }
    async function pickDestination(title) {
      const where2 = await choose(title, [['global', '全局'], ['preset', '某个预设…'], ['character', '某个角色…']], '📋 复制到');
      if (!where2) return null;
      if (where2 === 'global') return { scope: 'global', target: '' };
      if (where2 === 'preset') {
        const inUse = presetInUse();
        const name = await choose('选哪个预设？', presetNames().map(n => [n, n + (n === inUse ? '（正在使用）' : '')]), '📖 选择预设');
        return name ? { scope: 'preset', target: name } : null;
      }
      const live = liveAvatar();
      const avatar = await choose('选哪个角色？', characters().map(c => [c.avatar, (c.name || c.avatar) + (c.avatar === live ? '（正在聊天）' : '')]), '☕ 选择角色');
      return avatar ? { scope: 'character', target: avatar } : null;
    }
    async function copyTo(list) {
      if (!list.length) { notice('请先用爱心选中要复制的条目。'); return; }
      const dest = await pickDestination('把选中的 ' + list.length + ' 条复制到哪里？');
      if (!dest) return;
      const copies = list.map(item => {
        const c = clone(item); c.id = uid();
        if (c.type === 'folder') flatScripts([c]).forEach(s => { s.id = uid(); });
        return c;
      });
      if (dest.scope === scope && dest.target === target) { addItems(copies); touch(); paintList(); return; }
      const keep = { scope, target, work, baseline, dirty };
      busy = true;
      try {
        scope = dest.scope; target = dest.target;
        busy = false;
        await loadWork();
        if (loadError || !work) throw Error(loadError || '目标读取失败');
        addItems(copies); touch();
        dirty = true;
        const ok = await saveWork();
        if (!ok) throw Error('写入没有成功');
      } catch (error) {
        notice('复制失败：' + error.message);
      } finally {
        busy = false;
        ({ scope, target, work, baseline, dirty } = keep);
        paint();
      }
    }
    async function findReplace() {
      if (!work) return;
      const fields = kind === 'regex'
        ? [['scriptName', '名称', 1], ['findRegex', '查找（正则表达式）', 3], ['replaceString', '替换为', 8]]
        : [['name', '名称', 1], ['content', '脚本内容', 16], ['info', '作者备注', 4]];
      const entries = items();
      const ok = await editList({
        title: where() + ' · 查找与替换', entries, nameOf, isOn, setOn, fields,
        empty: '这里还没有条目。',
        onAdd: async () => {
          const title = await dialog('新条目的名称：', 'prompt', kind === 'regex' ? '新正则' : '新脚本');
          if (title === null) return null;
          const item = kind === 'regex' ? newRegex(title.trim()) : newScript(title.trim());
          addItems([item]);
          return item;
        },
        onRemove: item => removeItem(item)
      });
      // editList 已经直接改了条目；新增的在 onAdd 里已进入工作区，这里把 editList 追加的那份去掉
      if (kind === 'regex') work.list = work.list.filter((v, i, arr) => arr.indexOf(v) === i);
      else work.tree = work.tree.filter((v, i, arr) => arr.indexOf(v) === i);
      if (!ok) { /* 取消时也保留在工作区，与其他页一致：未保存前都能放弃 */ }
      touch(); paintList();
    }

    /* ---------- 插件 ---------- */
    async function loadPlugins() {
      const headers = ctx()?.getRequestHeaders?.() || {};
      const response = await W.fetch('/api/extensions/discover', { method: 'GET', headers });
      if (!response.ok) throw Error('读取插件列表失败：HTTP ' + response.status);
      const list = await response.json();
      const disabled = new Set(Array.isArray(ext().disabledExtensions) ? ext().disabledExtensions : []);
      plugins = await Promise.all((Array.isArray(list) ? list : []).map(async item => {
        const name = String(item?.name || item || '');
        const type = String(item?.type || 'local');
        let manifest = {};
        try {
          const r = await W.fetch('/scripts/extensions/' + name.split('/').map(encodeURIComponent).join('/') + '/manifest.json', { cache: 'no-store' });
          if (r.ok) manifest = await r.json();
        } catch {}
        const key = type === 'system' ? name : (name.startsWith('third-party/') ? name : 'third-party/' + name);
        return { name: key, short: key.replace(/^third-party\//, ''), type, manifest, on: !disabled.has(key), update: null };
      }));
      plugins.sort((a, b) => (a.type === 'system') - (b.type === 'system') || String(a.manifest.display_name || a.short).localeCompare(String(b.manifest.display_name || b.short), 'zh'));
    }
    function pluginTitle(p) { return p.manifest.display_name || p.short; }
    function setPluginOn(list, on) {
      const e = ext();
      e.disabledExtensions = Array.isArray(e.disabledExtensions) ? e.disabledExtensions : [];
      for (const p of list) {
        if (!on && /JS-Slash-Runner|tavern.?helper/i.test(p.name)) { notice('「' + pluginTitle(p) + '」是酒馆助手本身，停用后梨梨工作台也会一起停掉，这一个先跳过了。'); continue; }
        p.on = on;
        const at = e.disabledExtensions.indexOf(p.name);
        if (on && at >= 0) e.disabledExtensions.splice(at, 1);
        if (!on && at < 0) e.disabledExtensions.push(p.name);
      }
      ctx().saveSettingsDebounced?.();
      pluginPending = true;
      paint();
    }
    const pluginBody = p => ({ extensionName: p.short, global: p.type === 'global' });
    // 插件接口：出错时把酒馆返回的原因带出来，而不是只有 HTTP 500
    async function extPost(path, body) {
      const headers = ctx()?.getRequestHeaders?.() || { 'Content-Type': 'application/json' };
      const response = await W.fetch(path, { method: 'POST', headers, body: JSON.stringify(body) });
      const text = await response.text();
      if (!response.ok) throw Error((text || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 160) || ('HTTP ' + response.status));
      try { return JSON.parse(text); } catch { return text; }
    }
    let checking = false;
    async function checkOne(p) {
      p.update = 'checking';
      try {
        const r = await extPost('/api/extensions/version', pluginBody(p));
        p.update = r?.isUpToDate === false ? 'outdated' : r?.isUpToDate === true ? 'latest' : 'unknown';
        p.branch = r?.currentBranchName || '';
        p.commit = String(r?.currentCommitHash || '').slice(0, 7);
        p.remote = r?.remoteUrl || '';
        p.error = '';
      } catch (error) {
        p.update = 'error';
        p.error = error.message;
      }
    }
    // 打开插件页时后台自动检查（一次查 3 个，不卡界面）
    async function autoCheck() {
      if (checking) return;
      checking = true;
      const queue = plugins.filter(p => p.type !== 'system');
      const worker = async () => {
        while (queue.length && panel && kind === 'plugin') {
          const p = queue.shift();
          await checkOne(p);
          if (panel && kind === 'plugin') { paintList(); paintStatus(); }
        }
      };
      try { await Promise.all([worker(), worker(), worker()]); } finally { checking = false; if (panel && kind === 'plugin') paintStatus(); }
    }
    async function checkUpdates(list) {
      const third = list.filter(p => p.type !== 'system');
      if (!third.length) { notice('系统自带插件跟着酒馆一起更新，不用单独检查。'); return; }
      paintStatus('正在检查 ' + third.length + ' 个插件…');
      third.forEach(p => { p.update = 'checking'; });
      paintList();
      const queue = third.slice();
      const worker = async () => { while (queue.length) { await checkOne(queue.shift()); paintList(); } };
      await Promise.all([worker(), worker(), worker()]);
      paint();
      const n = third.filter(p => p.update === 'outdated').length;
      const bad = third.filter(p => p.update === 'error');
      notice((n ? '有 ' + n + ' 个插件可以更新，点「更新」或「全部更新」就行。' : '检查完了，都是最新的。')
        + (bad.length ? '\n\n这些检查失败（可能不是用 Git 装的，或者网络连不上 GitHub）：\n' + bad.map(p => pluginTitle(p) + '：' + p.error).join('\n') : ''));
    }
    async function updatePlugins(list) {
      const third = list.filter(p => p.type !== 'system');
      if (!third.length) { notice('没有可以更新的第三方插件。'); return; }
      if (!await ask('更新这 ' + third.length + ' 个插件？\n' + third.map(pluginTitle).join('\n') + '\n\n更新完刷新网页生效。')) return;
      busy = true;
      const done = [], same = [], failed = [];
      for (const [i, p] of third.entries()) {
        paintStatus('正在更新 ' + (i + 1) + ' / ' + third.length + '：' + pluginTitle(p));
        p.update = 'updating'; paintList();
        try {
          const r = await extPost('/api/extensions/update', pluginBody(p));
          if (r?.isUpToDate === true) same.push(pluginTitle(p));
          else done.push(pluginTitle(p) + (r?.shortCommitHash ? '（' + r.shortCommitHash + '）' : ''));
          p.update = 'latest';
          if (r?.shortCommitHash) p.commit = r.shortCommitHash;
        } catch (error) {
          p.update = 'error'; p.error = error.message;
          failed.push(pluginTitle(p) + '：' + error.message);
        }
        paintList();
      }
      busy = false;
      pluginPending = pluginPending || done.length > 0;
      paint();
      notice((done.length ? '已更新：\n' + done.join('\n') : '')
        + (same.length ? (done.length ? '\n\n' : '') + '本来就是最新：' + same.join('、') : '')
        + (failed.length ? '\n\n失败：\n' + failed.join('\n') : '')
        + (done.length ? '\n\n点「刷新网页生效」就会用上新版本。' : ''));
    }
    async function deletePlugins(list) {
      const third = list.filter(p => p.type !== 'system');
      if (!third.length) { notice('系统自带插件不能删除；请选中第三方插件。'); return; }
      if (third.some(p => /JS-Slash-Runner|tavern.?helper/i.test(p.name))) { notice('选中的插件里有酒馆助手本身，删掉它梨梨工作台就没了，已取消。'); return; }
      if (!await ask('删除这些插件？删除后无法恢复：\n' + third.map(pluginTitle).join('\n'))) return;
      busy = true; paintStatus('正在删除…');
      const failed = [];
      for (const p of third) {
        try { await extPost('/api/extensions/delete', pluginBody(p)); plugins = plugins.filter(x => x !== p); selectedPlugins.delete(p.name); }
        catch (error) { failed.push(pluginTitle(p) + '（' + error.message + '）'); }
      }
      busy = false; pluginPending = true; paint();
      notice(failed.length ? '有些没删掉：\n' + failed.join('\n') : '已删除，刷新网页后生效。');
    }
    async function installPlugin() {
      const url = await dialog('填写插件的 Git 仓库地址：', 'prompt', 'https://github.com/');
      if (!url?.trim() || !/^https?:\/\//i.test(url.trim())) return;
      const where2 = await choose('装给谁？', [['local', '只给当前用户'], ['global', '给所有用户（需要管理员）']], '🧩 安装插件');
      if (!where2) return;
      busy = true; paintStatus('正在安装…');
      try {
        const got = await extPost('/api/extensions/install', { url: url.trim(), global: where2 === 'global' });
        const info = got && typeof got === 'object' ? got : {};
        pluginPending = true;
        notice('安装好了' + (info.display_name ? '：「' + info.display_name + '」' + (info.version ? ' v' + info.version : '') : '') + '。刷新网页后生效。');
        await loadPlugins();
      } catch (error) {
        notice('安装失败：' + error.message);
      } finally { busy = false; paint(); }
    }
    const selectedPlugins = new Set();

    /* ---------- 界面 ---------- */
    function paintStatus(text) {
      if (!ui.status) return;
      if (text) { ui.status.textContent = text; return; }
      if (kind === 'plugin') {
        const on = plugins.filter(p => p.on).length;
        const old = plugins.filter(p => p.update === 'outdated').length;
        ui.status.textContent = plugins.length + ' 个插件 · 启用 ' + on + (old ? ' · ' + old + ' 个可更新' : '') + (checking ? ' · 正在检查更新…' : '') + (selectedPlugins.size ? ' · 已选 ' + selectedPlugins.size : '') + (pluginPending ? ' · 有改动，刷新网页生效' : '');
      } else {
        const list = items();
        ui.status.textContent = where() + ' · ' + list.length + ' 条 · 启用 ' + list.filter(isOn).length
          + (selected.size ? ' · 已选 ' + selected.size : '') + (dirty ? ' · 有未保存的修改' : '');
      }
      if (ui.save) { ui.save.disabled = !dirty || busy; ui.save.textContent = dirty ? '保存修改 •' : '保存修改'; }
    }

    function paint() {
      if (!panel) return;
      for (const b of ui.seg.querySelectorAll('[data-kind]')) b.setAttribute('aria-selected', String(b.dataset.kind === kind));
      paintBar();
      paintList();
      paintStatus();
    }

    function paintBar() {
      const bar = ui.bar;
      [...bar.children].forEach(c => { if (!c.classList.contains('cw-fold-btn')) c.remove(); });
      const put = (...els) => { const fold = bar.querySelector(':scope > .cw-fold-btn'); els.forEach(el => bar.insertBefore(el, fold)); };
      const search = input(kind === 'plugin' ? '搜索插件…' : '搜索名称或内容…', query);
      search.className = 'tl-search';
      search.addEventListener('input', () => { query = search.value; paintList(); paintStatus(); });
      if (kind === 'plugin') {
        const pickList = () => plugins.filter(p => selectedPlugins.has(p.name));
        put(search,
          button('刷新', () => loadWork()),
          button('全选', () => { plugins.filter(matchPlugin).forEach(p => selectedPlugins.add(p.name)); paint(); }),
          button('取消选择', () => { selectedPlugins.clear(); paint(); }),
          button('启用选中', () => pickList().length ? setPluginOn(pickList(), true) : notice('请先用爱心选中插件。')),
          button('停用选中', () => pickList().length ? setPluginOn(pickList(), false) : notice('请先用爱心选中插件。')),
          button('检查更新', () => checkUpdates(selectedPlugins.size ? pickList() : plugins)),
          button('更新选中', () => updatePlugins(pickList())),
          button('全部更新', () => {
            const old = plugins.filter(p => p.update === 'outdated');
            if (old.length) return updatePlugins(old);
            if (plugins.some(p => p.type !== 'system' && !p.update)) return notice('还没检查完更新，稍等一下再点。');
            return notice('没有需要更新的插件。');
          }, 'cw-primary'),
          button('删除选中', () => deletePlugins(pickList()), 'cw-danger'),
          button('安装插件', installPlugin),
          button('刷新网页生效', async () => {
            if (!await ask('现在刷新网页？没保存的内容会丢失。')) return;
            await sleep(1500); W.location.reload();
          }, pluginPending ? 'cw-primary' : ''));
        return;
      }
      const scopeSel = node('select', 'tl-scope');
      for (const [v, l] of SCOPES) { const o = node('option', '', l + (kind === 'regex' ? '正则' : '脚本')); o.value = v; scopeSel.append(o); }
      scopeSel.value = scope;
      scopeSel.addEventListener('change', async () => {
        const next = scopeSel.value;
        if (!await confirmLeave()) { scopeSel.value = scope; return; }
        scope = next; target = defaultTarget(); remember(); await loadWork();
      });
      put(scopeSel);
      if (scope !== 'global') {
        const targetSel = node('select', 'tl-target');
        const empty = node('option', '', scope === 'preset' ? '选择预设…' : '选择角色…');
        empty.value = '';
        targetSel.append(empty);
        if (scope === 'preset') {
          const inUse = presetInUse();
          for (const n of presetNames()) { const o = node('option', '', n + (n === inUse ? '（正在使用）' : '')); o.value = n; targetSel.append(o); }
        } else {
          const live = liveAvatar();
          for (const c of characters()) { const o = node('option', '', (c.name || c.avatar) + (c.avatar === live ? '（正在聊天）' : '')); o.value = c.avatar; targetSel.append(o); }
        }
        targetSel.value = target;
        targetSel.addEventListener('change', async () => {
          const next = targetSel.value;
          if (!await confirmLeave()) { targetSel.value = target; return; }
          target = next; remember(); await loadWork();
        });
        put(targetSel);
      }
      const chosen = () => items().filter(i => selected.has(i));
      ui.save = button('保存修改', () => saveWork(), 'cw-primary');
      put(search, ui.save,
        button('放弃修改', async () => { if (dirty && !await ask('放弃「' + where() + '」还没保存的修改？')) return; await loadWork(); }),
        button('刷新', async () => { if (!await confirmLeave()) return; await loadWork(); }),
        button('＋ 新增', async () => {
          if (!work) { notice('请先选择' + (scope === 'preset' ? '预设' : '角色') + '。'); return; }
          const title = await dialog('新' + (kind === 'regex' ? '正则' : '脚本') + '的名称：', 'prompt', kind === 'regex' ? '新正则' : '新脚本');
          if (title === null) return;
          const item = kind === 'regex' ? newRegex(title.trim()) : newScript(title.trim());
          addItems([item]); open.add(item); touch(); paintList();
          W.requestAnimationFrame(() => ui.list.lastElementChild?.scrollIntoView({ block: 'nearest' }));
        }),
        button('全选', () => { items().filter(matchItem).forEach(i => selected.add(i)); paintList(); paintStatus(); }),
        button('取消选择', () => { selected.clear(); paintList(); paintStatus(); }),
        button('启用选中', () => { const l = chosen(); if (!l.length) return notice('请先用爱心选中条目。'); l.forEach(i => setOn(i, true)); touch(); paintList(); }),
        button('停用选中', () => { const l = chosen(); if (!l.length) return notice('请先用爱心选中条目。'); l.forEach(i => setOn(i, false)); touch(); paintList(); }),
        button('删除选中', async () => {
          const l = chosen(); if (!l.length) return notice('请先用爱心选中条目。');
          if (!await ask('删除选中的 ' + l.length + ' 条？保存后才会真正写入。')) return;
          l.forEach(removeItem); touch(); paintList();
        }, 'cw-danger'),
        button('复制到…', () => copyTo(chosen())),
        button('查找替换', findReplace),
        button('导入', () => work ? importFiles() : notice('请先选择' + (scope === 'preset' ? '预设' : '角色') + '。')),
        button('导出', () => { const l = chosen(); exportItems(l.length ? l : items(), where().replace(/[「」]/g, '')); }));
      if (kind === 'regex') put(button('刷新聊天', async () => {
        try { await ctx()?.reloadCurrentChat?.(); notice('聊天已重新载入。'); } catch (error) { notice('刷新失败：' + error.message); }
      }));
    }
    function defaultTarget() {
      const t = object(cfg.tools);
      if (scope === 'preset') return presetNames().includes(t.preset) ? t.preset : presetInUse();
      if (scope === 'character') return characters().some(c => c.avatar === t.char) ? t.char : liveAvatar();
      return '';
    }
    function matchItem(item) {
      if (!query) return true;
      const q = query.toLowerCase();
      return JSON.stringify([nameOf(item), item.findRegex, item.replaceString, item.content, item.info]).toLowerCase().includes(q);
    }
    function matchPlugin(p) {
      if (!query) return true;
      return JSON.stringify([p.name, p.manifest.display_name, p.manifest.author]).toLowerCase().includes(query.toLowerCase());
    }

    function paintList() {
      const list = ui.list;
      if (!list) return;
      const top = list.scrollTop;
      list.replaceChildren();
      if (kind === 'plugin') { paintPlugins(list); list.scrollTop = top; return; }
      if (loadError) { list.append(node('div', 'cw-empty', '读取失败：' + loadError)); return; }
      if (scope !== 'global' && !target) { list.append(node('div', 'cw-empty', '先在上面选一个' + (scope === 'preset' ? '预设' : '角色') + '。')); return; }
      if (!work) { list.append(node('div', 'cw-empty', '正在读取…')); return; }
      if (kind === 'script' && scope !== 'global') {
        list.append(node('p', 'cw-note tl-hint', scope === 'character'
          ? '角色脚本需要在酒馆助手里允许这个角色的脚本运行才会生效。'
          : '预设脚本跟随预设一起导出；切换到这个预设时生效。'));
      }
      if (kind === 'regex' && scope === 'character') {
        const allowed = ext().character_allowed_regex;
        if (Array.isArray(allowed)) {
          const row = node('label', 'cw-check tl-allow');
          const sw = heartSwitch(allowed.includes(target), '允许这个角色的局部正则运行');
          sw.addEventListener('change', () => {
            const at = allowed.indexOf(target);
            if (sw.checked && at < 0) allowed.push(target);
            if (!sw.checked && at >= 0) allowed.splice(at, 1);
            ctx().saveSettingsDebounced?.();
          });
          row.append(sw, DOC.createTextNode('允许这个角色的局部正则运行（酒馆的开关，立即生效）'));
          list.append(row);
        }
      }
      const all = items();
      const shown = all.filter(matchItem);
      if (!shown.length) { list.append(node('div', 'cw-empty', all.length ? '没有匹配的条目' : '这里还没有' + (kind === 'regex' ? '正则' : '脚本') + '，点「＋ 新增」或「导入」。')); return; }
      for (const item of shown) list.append(itemCard(item));
      list.scrollTop = top;
    }

    function itemCard(item) {
      const card = node('div', 'cw-list-item tl-item' + (isOn(item) ? '' : ' is-off'));
      const head = node('div', 'cw-list-head');
      const pick = heartSwitch(selected.has(item), '选择「' + nameOf(item) + '」');
      pick.addEventListener('change', () => { pick.checked ? selected.add(item) : selected.delete(item); paintStatus(); });
      const expanded = open.has(item);
      const name = button((expanded ? '▾ ' : '▸ ') + nameOf(item), () => { expanded ? open.delete(item) : open.add(item); paintList(); }, 'cw-list-name');
      const folder = kind === 'script' ? folderOf.get(item) : '';
      const power = button(isOn(item) ? '已启用' : '已停用', () => { setOn(item, !isOn(item)); touch(); paintList(); }, 'tl-power' + (isOn(item) ? ' is-on' : ''));
      power.title = '点一下切换启用 / 停用';
      head.append(pick, name);
      if (folder) head.append(node('span', 'tl-tag', '📁 ' + folder));
      head.append(power, button('▲', () => move(item, -1), 'tl-mini'), button('▼', () => move(item, 1), 'tl-mini'));
      card.append(head);
      if (!expanded) return card;
      const body = node('div', 'cw-list-body');
      const areaField = (key, label, rows, get = () => String(item[key] ?? ''), set = v => { item[key] = v; }) => {
        const area = node('textarea');
        area.rows = rows; area.spellcheck = false; area.value = get();
        area.addEventListener('input', () => { set(area.value); touch(); });
        const fh = node('div', 'cw-list-field-head');
        fh.append(node('span', '', label), button('全屏编辑', async () => {
          const next = await editText(nameOf(item) + ' · ' + label, area.value);
          if (next === null) return;
          set(next); area.value = next; touch();
        }, 'tl-mini'));
        const box = node('label', 'cw-list-field');
        box.append(fh, area);
        return box;
      };
      if (kind === 'regex') {
        body.append(areaField('scriptName', '名称', 1, undefined, v => { item.scriptName = v; name.textContent = '▾ ' + (v || '未命名正则'); }),
          areaField('findRegex', '查找（正则表达式）', 3),
          areaField('replaceString', '替换为', 6),
          areaField('trimStrings', '修剪掉（一行一个）', 2, () => (item.trimStrings || []).join('\n'), v => { item.trimStrings = v.split('\n').filter(Boolean); }));
        const places = node('div', 'tl-checks');
        places.append(node('span', 'tl-checks-label', '作用于'));
        for (const [value, label] of PLACES) places.append(checkBox(label, (item.placement || []).includes(value), on => {
          const set = new Set(item.placement || []);
          on ? set.add(value) : set.delete(value);
          item.placement = [...set].sort((a, b) => a - b); touch();
        }));
        const flags = node('div', 'tl-checks');
        flags.append(node('span', 'tl-checks-label', '选项'));
        for (const [key, label] of [['markdownOnly', '仅格式显示'], ['promptOnly', '仅格式提示词'], ['runOnEdit', '编辑时运行']]) {
          flags.append(checkBox(label, !!item[key], on => { item[key] = on; touch(); }));
        }
        const sub = node('select');
        for (const [v, l] of [[0, '宏：不替换'], [1, '宏：原样替换'], [2, '宏：转义后替换']]) { const o = node('option', '', l); o.value = String(v); sub.append(o); }
        sub.value = String(Number(item.substituteRegex) || 0);
        sub.addEventListener('change', () => { item.substituteRegex = Number(sub.value); touch(); });
        const depth = (key, ph) => {
          const el = input(ph, item[key] === null || item[key] === undefined ? '' : String(item[key]));
          el.type = 'number'; el.className = 'tl-depth';
          el.addEventListener('input', () => { item[key] = el.value === '' ? null : Number(el.value); touch(); });
          return el;
        };
        const row = node('div', 'tl-checks');
        row.append(sub, depth('minDepth', '最小深度'), depth('maxDepth', '最大深度'));
        body.append(places, flags, row);
      } else {
        body.append(areaField('name', '名称', 1, undefined, v => { item.name = v; name.textContent = '▾ ' + (v || '未命名脚本'); }),
          areaField('content', '脚本内容', 14),
          areaField('info', '作者备注', 3));
      }
      body.append(actions(
        button('复制到…', () => copyTo([item])),
        button('导出这条', () => exportItems([item], nameOf(item))),
        button('删除这条', async () => {
          if (!await ask('删除「' + nameOf(item) + '」？保存后才会真正写入。')) return;
          removeItem(item); touch(); paintList();
        }, 'cw-danger')));
      card.append(body);
      return card;
    }
    function checkBox(label, checked, onChange) {
      const wrap = node('label', 'cw-check tl-check');
      const sw = heartSwitch(checked, label);
      sw.addEventListener('change', () => onChange(sw.checked));
      wrap.append(sw, DOC.createTextNode(label));
      return wrap;
    }

    function paintPlugins(list) {
      list.append(node('p', 'cw-note tl-hint', '酒馆的插件只有全局一种，不能按预设或角色分别开关。启用、停用、更新、删除后都要刷新网页才生效。'));
      if (loadError) { list.append(node('div', 'cw-empty', '读取失败：' + loadError)); return; }
      const shown = plugins.filter(matchPlugin);
      if (!plugins.length) { list.append(node('div', 'cw-empty', '正在读取…')); return; }
      if (!shown.length) { list.append(node('div', 'cw-empty', '没有匹配的插件')); return; }
      const typeName = { system: '系统', local: '本地', global: '全局' };
      for (const p of shown) {
        const card = node('div', 'cw-list-item tl-item' + (p.on ? '' : ' is-off'));
        const head = node('div', 'cw-list-head');
        const pick = heartSwitch(selectedPlugins.has(p.name), '选择「' + pluginTitle(p) + '」');
        pick.addEventListener('change', () => { pick.checked ? selectedPlugins.add(p.name) : selectedPlugins.delete(p.name); paintStatus(); });
        const info = node('div', 'tl-plugin-info');
        const meta = [typeName[p.type] || p.type, p.manifest.version ? 'v' + p.manifest.version : '', p.manifest.author || '',
          p.branch ? p.branch + (p.commit ? '@' + p.commit : '') : '',
          ({ outdated: '⬆ 有新版本', latest: '已是最新', error: '检查失败', checking: '检查中…', updating: '更新中…', unknown: '无法判断' })[p.update] || ''].filter(Boolean).join(' · ');
        info.append(node('div', 'tl-plugin-name', pluginTitle(p)), node('div', 'tl-plugin-meta', meta));
        if (p.update === 'error' && p.error) info.append(node('div', 'tl-plugin-meta tl-plugin-err', p.error));
        if (p.update === 'outdated') card.classList.add('is-outdated');
        const power = button(p.on ? '已启用' : '已停用', () => setPluginOn([p], !p.on), 'tl-power' + (p.on ? ' is-on' : ''));
        head.append(pick, info, power);
        const acts = node('div', 'tl-plugin-acts');
        if (p.type !== 'system') {
          acts.append(button('检查更新', () => checkUpdates([p]), 'tl-mini'),
            button('更新', () => updatePlugins([p]), 'tl-mini' + (p.update === 'outdated' ? ' cw-primary' : '')));
          const home = p.manifest.homePage || p.remote;
          if (home && /^https?:/i.test(home)) acts.append(button('主页', () => W.open(home, '_blank', 'noopener'), 'tl-mini'));
          acts.append(button('删除', () => deletePlugins([p]), 'tl-mini cw-danger'));
        }
        card.append(head);
        if (acts.children.length) card.append(acts);
        list.append(card);
      }
    }

    function openPanel(container) {
      close();
      panel = node('section');
      panel.id = 'tl-panel';
      panel.setAttribute('aria-label', '工具');
      ui.seg = node('div', 'tl-seg');
      for (const [value, label] of KINDS) {
        const b = button(label, async () => {
          if (value === kind) return;
          if (!await confirmLeave()) return;
          kind = value; query = '';
          if (kind !== 'plugin' && scope !== 'global' && !target) target = defaultTarget();
          remember(); await loadWork();
        }, 'tl-seg-btn');
        b.dataset.kind = value;
        b.setAttribute('role', 'tab');
        ui.seg.append(b);
      }
      ui.bar = node('div', 'cw-toolbar tl-bar');
      ui.list = node('div', 'tl-list');
      const footer = node('div', 'cw-footer');
      ui.status = node('span');
      footer.append(ui.status, DOC.createTextNode(' · 🧰 工具 · 梨梨工作台 v3.6 无书摘版'));
      panel.append(ui.seg, ui.bar, ui.list, footer);
      panel.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void saveWork(); }
      });
      container.append(panel);
      target = scope === 'global' ? '' : defaultTarget();
      void loadWork();
    }
    function close() {
      loadId++;
      panel?.remove();
      panel = null;
      work = null; dirty = false; selected.clear(); open.clear(); selectedPlugins.clear();
      for (const k of Object.keys(ui)) delete ui[k];
    }
    return {
      open: openPanel, close,
      canLeave: async () => !busy && confirmLeave(),
      element: () => panel
    };
  }
  modules.tools = createToolsModule();

  sharedStyle.textContent += `
:is(#api-panel,.cw-dialog) .api-key-row{display:flex!important;width:100%;min-width:0;box-sizing:border-box}
:is(#api-panel,.cw-dialog) .api-key-row>:first-child{flex:1 1 0!important;width:0!important;min-width:0!important;max-width:none!important}
:is(#api-panel,.cw-dialog) .api-key-row>button{flex:0 0 auto!important;width:auto!important}
.cw-loading{display:flex;align-items:center;justify-content:center;gap:12px;min-height:52px;padding:12px;color:var(--cw-text,inherit)}
.cw-loading[hidden]{display:none!important}
.cw-wave-dots{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:44px;height:24px}
.cw-wave-dots i{display:block;width:6px;height:6px;border-radius:50%;background:currentColor;animation:cw-wave 1.1s ease-in-out infinite;animation-delay:calc(var(--dot)*.13s)}
@keyframes cw-wave{0%,70%,100%{transform:translate(0,2px);opacity:.4}35%{transform:translate(2px,-5px);opacity:1}}
@media(prefers-reduced-motion:reduce){.cw-wave-dots i{animation:none;opacity:.7}}
#api-panel[aria-busy=true]{opacity:1!important}#api-panel[aria-busy=true] :is(input,select,textarea){opacity:.85!important}

/* ─── v3.5 功能栏收起 ─── */
:is(.cw-toolbar,.pw-head,.wb-head).cw-bar-folded{flex-wrap:nowrap!important;overflow-x:auto!important;overflow-y:hidden!important;scrollbar-width:none;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain}
:is(.cw-toolbar,.pw-head,.wb-head).cw-bar-folded::-webkit-scrollbar{display:none}
.cw-bar-folded>*{flex-shrink:0!important}
.cw-bar-folded>:is(input,select){flex:0 0 150px!important;width:150px!important;min-width:0!important;max-width:150px!important}
.cw-bar-folded>:is(.cw-note,.wb-head-note,.cw-check){white-space:nowrap;max-width:60vw;overflow:hidden;text-overflow:ellipsis;flex:0 1 auto!important}
.cw-button.cw-fold-btn{position:sticky;right:0;z-index:3;flex:0 0 auto;margin-left:auto;min-width:36px;min-height:32px;padding:4px 10px;
  border:1px solid var(--cw-border,currentColor)!important;border-radius:var(--cw-radius,0);color:inherit;font:inherit;font-weight:700;cursor:pointer;
  background:var(--cw-surface,var(--SmartThemeBlurTintColor,#222))!important;-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);box-shadow:-10px 0 12px -4px rgba(0,0,0,.35)}
:is(.cw-toolbar,.pw-head,.wb-head):not(.cw-bar-folded) .cw-fold-btn{box-shadow:none}
/* ─── v3.5 整体缩放 ─── */
#cw-hub.cw-zoomed{
  top:0!important;left:0!important;right:auto!important;bottom:auto!important;
  width:calc(100vw / var(--cw-zoom,1))!important;height:calc(100dvh / var(--cw-zoom,1))!important;
  max-width:none!important;max-height:none!important;
  transform:scale(var(--cw-zoom,1));transform-origin:0 0;
}
.cw-zoom-guard{position:fixed;left:50%;top:max(12px,env(safe-area-inset-top));transform:translateX(-50%);z-index:2147483647;
  display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;max-width:94vw;padding:10px 12px;
  font:14px/1.5 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#222;background:#fff;border:1px solid #888;box-shadow:0 8px 28px rgba(0,0,0,.35)}
.cw-zoom-guard button{font:inherit;min-height:36px;padding:4px 14px;border:1px solid #666;background:#f4f4f4;color:#222;cursor:pointer}
.cw-zoom-guard button.is-keep{background:#222;color:#fff}
/* ─── v3.6 美化批量 / 世界书排序 / 插件 ─── */
#st-panel[aria-busy=true]{cursor:progress}
#st-panel[aria-busy=true] .cw-button{pointer-events:none;opacity:.6}
#st-panel .st-card button.cw-heart.st-card-pick{position:absolute;top:6px;right:6px;margin:0;background:var(--cw-surface);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
#st-panel .st-card.is-picked{box-shadow:inset 0 0 0 2px var(--cw-border)}
#st-panel .st-dirty{white-space:nowrap}
#wb-panel .wb-onfirst{display:flex;align-items:center;gap:6px;margin:4px 0 8px;font-size:calc(13px * var(--cw-fs, 1));cursor:pointer}
#wb-panel .wb-onfirst button.cw-heart{all:unset;box-sizing:border-box;display:inline-grid;place-items:center;width:32px;height:32px;flex:0 0 32px;cursor:pointer}
#tl-panel .tl-item.is-outdated{box-shadow:inset 3px 0 0 var(--cw-border)}
#tl-panel .tl-plugin-err{white-space:normal;opacity:.85}

#cw-settings-page .cw-scale-row input[type=range]{flex:1;accent-color:var(--cw-accent)}
/* ─── v3.5 工具页 ─── */
#cw-hub-body>#tl-panel{position:relative;flex:1 1 auto;min-height:0;width:100%;display:flex;flex-direction:column;overflow:hidden}
#tl-panel .tl-seg{display:flex;gap:6px;padding:10px 16px 0;flex-shrink:0}
#tl-panel .tl-seg-btn{flex:1 1 0;min-height:36px;font-weight:600}
#tl-panel .tl-seg-btn[aria-selected=true]{background:var(--cw-accent-soft);box-shadow:inset 0 0 0 1px var(--cw-border)}
#tl-panel .tl-bar{border-top:0}
#tl-panel .tl-bar .tl-search{flex:1 1 140px}
#tl-panel .tl-bar :is(.tl-scope,.tl-target){flex:0 1 auto;min-width:110px;max-width:220px}
#tl-panel .tl-list{flex:1;min-height:0;overflow:auto;padding:10px 14px;overscroll-behavior:contain}
#tl-panel .tl-hint{margin:0 0 10px}
#tl-panel .tl-allow{margin:0 0 10px;display:flex;align-items:center;gap:6px}
#tl-panel .cw-list-name{flex:1;min-width:0;text-align:left;justify-content:flex-start;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
#tl-panel .tl-item.is-off .cw-list-name,#tl-panel .tl-item.is-off .tl-plugin-name{opacity:.6}
#tl-panel .tl-power{flex:0 0 auto;min-height:28px;padding:3px 9px;font-size:calc(12px * var(--cw-fs, 1))}
#tl-panel .tl-power.is-on{background:var(--cw-accent-soft);box-shadow:inset 0 0 0 1px var(--cw-border)}
#tl-panel .tl-mini{flex:0 0 auto;min-height:28px;min-width:30px;padding:3px 8px;font-size:calc(11px * var(--cw-fs, 1))}
#tl-panel .tl-tag{flex:0 1 auto;font-size:calc(11px * var(--cw-fs, 1));opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:30%}
#tl-panel .cw-list-field textarea{width:100%;box-sizing:border-box;resize:vertical;font:calc(12.5px * var(--cw-fs, 1))/1.6 ui-monospace,Menlo,Consolas,monospace}
#tl-panel .cw-list-field textarea[rows="1"]{min-height:0;height:auto;resize:none}
#tl-panel .tl-checks{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px}
#tl-panel .tl-checks-label{font-size:calc(12px * var(--cw-fs, 1));opacity:.75;min-width:3em}
#tl-panel .tl-check{display:inline-flex;align-items:center;gap:4px;margin:0;font-size:calc(13px * var(--cw-fs, 1))}
#tl-panel .tl-check button.cw-heart{margin-right:0}
#tl-panel .tl-depth{width:96px;flex:0 0 96px}
#tl-panel .tl-plugin-info{flex:1;min-width:0}
#tl-panel .tl-plugin-name{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#tl-panel .tl-plugin-meta{font-size:calc(11.5px * var(--cw-fs, 1));opacity:.72;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#tl-panel .tl-plugin-acts{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;padding:0 10px 10px}
@media(max-width:650px){#tl-panel .tl-seg{padding:8px 10px 0}#tl-panel .tl-list{padding:8px 10px}}
`;
  DOC.head.append(sharedStyle, sharedCustom);

  // 首次运行：把三个旧脚本的美化方案收进方案列表（只收录，不自动应用）
  if (!cfg.themesMigrated) {
    importOldThemes(true);
    cfg.themesMigrated = true;
    saveCfg();
  }


  renderEntrances();
  applyUiScale();
  installWelcomeShelf();

  observer = new W.MutationObserver(() => {
    if (disposed) return;
    const bar = DOC.querySelector('#top-settings-holder');
    const needsTop = cfg.top && bar && (!top?.isConnected || top.parentNode !== bar);
    const needsFallback = cfg.top && !bar && !fab?.isConnected;
    const needsFab = cfg.floating && !fab?.isConnected;
    const removeFallback = !cfg.floating && bar && fab;
    if (needsTop || needsFallback || needsFab || removeFallback) {
      if (fab && !fab.isConnected) fab = null;
      renderEntrances();
    }
  });
  observer.observe(DOC.body, { childList: true, subtree: true });

  W.addEventListener('resize', positionFab);
  cleanups.push(() => W.removeEventListener('resize', positionFab));

  function dispose() {
    if (disposed) return;
    disposed = true;
    observer?.disconnect();
    for (const cancel of [...dialogs.values()]) cancel();
    for (const cleanup of cleanups) cleanup();
    for (const module of Object.values(modules)) {
      try { module.close(); module.dispose?.(); } catch {}
    }
    pages.clear();
    hub?.remove();
    hub = hubBody = null;
    for (const id of [
      'cw-hub', 'cw-fab', 'cw-top', 'cw-style', 'cw-shared-style',
      'cw-shared-custom', 'ca-style', 'ca-custom-style',
      'sb-style', 'sb-custom-style'
    ]) DOC.getElementById(id)?.remove();
    window.removeEventListener('pagehide', dispose);
    if (W[OWNER]?.dispose === dispose) delete W[OWNER];
  }

  W[OWNER] = { dispose, open: openHub };
  window.addEventListener('pagehide', dispose, { once: true });
}
