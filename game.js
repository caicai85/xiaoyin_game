/*
CHECKLIST（Definition of Done 对照）
A. ✅ 项目结构与运行：仅 index.html/style.css/game.js；纯原生前端，file:// 可运行（无 npm/后端）。位置：index.html + game.js 顶层初始化。
B. ✅ 页面布局与可用性：左 canvas(#scene) + 右 UI 面板；包含 #dialog、4 按钮、2 进度条、#debug；按钮 min-height 44px。位置：index.html, style.css。
C. ✅ Canvas 场景最低要求：墙体/地板/窗户/像素小人；支持点击小人命中并随机对白（>=5句）。位置：drawScene(), isInsideCharacter(), onSceneClick().
D. ✅ 状态模型字段：affection/hunger/lastSeenTs/lastDailyResetDate/daily.*Count；写入前统一 clamp。位置：DEFAULT_STATE, sanitizeState(), clamp().
E. ✅ 行为规则：4 按钮严格数值变化 + 对白 + 立即保存；点击角色仅对白不改数值。位置：bindEvents() 内 4 按钮处理、onSceneClick().
F. ✅ 存档恢复：固定 key xiaoyin_pet_save_v1；每次变化/补算/日清零后保存；刷新可恢复；调试区显示关键字段与保存时间。位置：SAVE_KEY, saveState(), renderDebug().
G. ✅ 离线补算饥饿：启动时 deltaMinutes/floor/30 分钟 -1；补算后更新 lastSeenTs 并保存。位置：applyOfflineDecay().
H. ✅ 每日清零：跨日本地日期变化则 affection=0、daily清零、更新日期、写对白并保存。位置：applyDailyResetIfNeeded().
I. ✅ 防 bug：初始化总 try/catch 防白屏；按钮/流程使用 sanitizeState 防 NaN 缺字段。位置：init() 及 safeAction() + sanitizeState().
J. ✅ 内置自测按钮：Simulate +5h offline / Simulate new day / Reset save。位置：bindEvents() 调试按钮。
*/

(() => {
  const SAVE_KEY = 'xiaoyin_pet_save_v1';
  const DIALOG_LIMIT = 8;

  const DEFAULT_STATE = {
    affection: 0,
    hunger: 60,
    lastSeenTs: Date.now(),
    lastDailyResetDate: getTodayLocalDate(),
    daily: {
      pcCount: 0,
      eatCount: 0,
      drinkCount: 0,
      musicCount: 0,
    },
    dialogHistory: ['小音：你好呀，今天也一起度过吧～'],
  };

  const characterRect = { x: 480, y: 255, w: 48, h: 96 };
  const characterLines = [
    '小音：你点到我啦～',
    '小音：今天的天空颜色真好看。',
    '小音：想不想一起听歌？',
    '小音：我会一直在这里等你。',
    '小音：戳戳我会害羞的！',
    '小音：别忘了照顾好我哦～',
  ];

  const el = {
    canvas: null,
    ctx: null,
    dialog: null,
    barAffection: null,
    barHunger: null,
    debug: null,
    btnPc: null,
    btnEat: null,
    btnDrink: null,
    btnMusic: null,
    btnSimOffline: null,
    btnSimDay: null,
    btnResetSave: null,
  };

  let state = { ...DEFAULT_STATE };
  let lastSaveMessage = '尚未保存';
  let initError = '';

  function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function getTodayLocalDate() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function toReadable(ts) {
    const d = new Date(ts);
    return Number.isFinite(d.getTime()) ? d.toLocaleString() : 'Invalid Date';
  }

  function sanitizeState(raw) {
    const merged = {
      ...DEFAULT_STATE,
      ...(raw || {}),
      daily: {
        ...DEFAULT_STATE.daily,
        ...((raw && raw.daily) || {}),
      },
      dialogHistory: Array.isArray(raw && raw.dialogHistory) ? raw.dialogHistory.slice(-DIALOG_LIMIT) : DEFAULT_STATE.dialogHistory.slice(),
    };

    merged.affection = clamp(merged.affection, 0, 100);
    merged.hunger = clamp(merged.hunger, 0, 100);
    merged.lastSeenTs = Number.isFinite(Number(merged.lastSeenTs)) ? Number(merged.lastSeenTs) : Date.now();
    merged.lastDailyResetDate = typeof merged.lastDailyResetDate === 'string' ? merged.lastDailyResetDate : getTodayLocalDate();

    merged.daily.pcCount = Math.max(0, Number(merged.daily.pcCount) || 0);
    merged.daily.eatCount = Math.max(0, Number(merged.daily.eatCount) || 0);
    merged.daily.drinkCount = Math.max(0, Number(merged.daily.drinkCount) || 0);
    merged.daily.musicCount = Math.max(0, Number(merged.daily.musicCount) || 0);

    return merged;
  }

  function pushDialog(text) {
    state.dialogHistory.push(text);
    state.dialogHistory = state.dialogHistory.slice(-DIALOG_LIMIT);
    renderDialog();
  }

  function saveState(reason = 'state-change') {
    state = sanitizeState(state);
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    lastSaveMessage = `已保存(${reason}) @ ${new Date().toLocaleTimeString()}`;
    renderDebug();
  }

  function loadState() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      state = sanitizeState(DEFAULT_STATE);
      return;
    }
    try {
      state = sanitizeState(JSON.parse(raw));
    } catch (err) {
      state = sanitizeState(DEFAULT_STATE);
      initError = `存档损坏，已重置：${String(err)}`;
    }
  }

  function applyDailyResetIfNeeded() {
    const today = getTodayLocalDate();
    if (state.lastDailyResetDate !== today) {
      state.affection = 0;
      state.daily.pcCount = 0;
      state.daily.eatCount = 0;
      state.daily.drinkCount = 0;
      state.daily.musicCount = 0;
      state.lastDailyResetDate = today;
      pushDialog('新的一天开始啦，小音～');
      saveState('daily-reset');
    }
  }

  function applyOfflineDecay(nowTs = Date.now()) {
    const deltaMinutes = Math.floor((nowTs - state.lastSeenTs) / 60000);
    const decay = Math.max(0, Math.floor(deltaMinutes / 30));
    state.hunger = clamp(state.hunger - decay, 0, 100);
    state.lastSeenTs = nowTs;
    saveState('offline-decay');
  }

  function drawScene() {
    const { ctx, canvas } = el;
    if (!ctx || !canvas) return;

    // wall
    ctx.fillStyle = '#d9ebff';
    ctx.fillRect(0, 0, canvas.width, 250);

    // floor
    ctx.fillStyle = '#eed9b7';
    ctx.fillRect(0, 250, canvas.width, 150);

    // window
    ctx.fillStyle = '#9ec9ff';
    ctx.fillRect(70, 45, 150, 110);
    ctx.strokeStyle = '#6c93d4';
    ctx.lineWidth = 4;
    ctx.strokeRect(70, 45, 150, 110);
    ctx.beginPath();
    ctx.moveTo(145, 45);
    ctx.lineTo(145, 155);
    ctx.moveTo(70, 100);
    ctx.lineTo(220, 100);
    ctx.stroke();

    // pixel character placeholder
    const x = characterRect.x;
    const y = characterRect.y;
    ctx.fillStyle = '#293862';
    ctx.fillRect(x + 12, y + 8, 24, 24); // head/hair block
    ctx.fillStyle = '#ffd4b0';
    ctx.fillRect(x + 16, y + 12, 16, 16); // face block
    ctx.fillStyle = '#6e89d8';
    ctx.fillRect(x + 10, y + 34, 28, 34); // body block
    ctx.fillStyle = '#2b3558';
    ctx.fillRect(x + 10, y + 68, 10, 24); // leg L
    ctx.fillRect(x + 28, y + 68, 10, 24); // leg R

    ctx.strokeStyle = '#222';
    ctx.strokeRect(characterRect.x, characterRect.y, characterRect.w, characterRect.h);
  }

  function isInsideCharacter(px, py) {
    return (
      px >= characterRect.x &&
      px <= characterRect.x + characterRect.w &&
      py >= characterRect.y &&
      py <= characterRect.y + characterRect.h
    );
  }

  function onSceneClick(event) {
    const rect = el.canvas.getBoundingClientRect();
    const scaleX = el.canvas.width / rect.width;
    const scaleY = el.canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    if (isInsideCharacter(x, y)) {
      const line = characterLines[Math.floor(Math.random() * characterLines.length)];
      pushDialog(line);
      renderDebug();
    }
  }

  function renderDialog() {
    if (!el.dialog) return;
    el.dialog.innerHTML = state.dialogHistory.map((line) => `<div>${line}</div>`).join('');
    el.dialog.scrollTop = el.dialog.scrollHeight;
  }

  function renderBars() {
    el.barAffection.value = clamp(state.affection, 0, 100);
    el.barHunger.value = clamp(state.hunger, 0, 100);
  }

  function renderDebug() {
    if (!el.debug) return;
    const lines = [
      `affection: ${state.affection}`,
      `hunger: ${state.hunger}`,
      `lastDailyResetDate: ${state.lastDailyResetDate}`,
      `lastSeenTs: ${state.lastSeenTs} (${toReadable(state.lastSeenTs)})`,
      `daily.pcCount: ${state.daily.pcCount}`,
      `daily.eatCount: ${state.daily.eatCount}`,
      `daily.drinkCount: ${state.daily.drinkCount}`,
      `daily.musicCount: ${state.daily.musicCount}`,
      `save: ${lastSaveMessage}`,
    ];
    if (initError) lines.push(`error: ${initError}`);
    el.debug.textContent = lines.join('\n');
  }

  function renderAll() {
    drawScene();
    renderDialog();
    renderBars();
    renderDebug();
  }

  function applyAction(actionName, fn) {
    fn();
    state = sanitizeState(state);
    saveState(actionName);
    renderAll();
  }

  function safeAction(name, fn) {
    return () => {
      try {
        fn();
      } catch (err) {
        initError = `[${name}] ${String(err)}`;
        renderDebug();
      }
    };
  }

  function resetToDefault() {
    localStorage.removeItem(SAVE_KEY);
    state = sanitizeState(DEFAULT_STATE);
    state.lastSeenTs = Date.now();
    pushDialog('存档已清空，已恢复默认状态。');
    saveState('reset-save');
    renderAll();
  }

  function bindEvents() {
    el.canvas.addEventListener('click', safeAction('scene-click', onSceneClick));

    el.btnPc.addEventListener('click', safeAction('btn_pc', () => {
      applyAction('btn_pc', () => {
        state.affection += 8;
        state.hunger -= 12;
        state.daily.pcCount += 1;
        pushDialog('小音：和你一起玩电脑真开心！');
      });
    }));

    el.btnEat.addEventListener('click', safeAction('btn_eat', () => {
      applyAction('btn_eat', () => {
        state.hunger += 35;
        state.daily.eatCount += 1;
        pushDialog('小音：好耶，吃饱饱～');
      });
    }));

    el.btnDrink.addEventListener('click', safeAction('btn_drink', () => {
      applyAction('btn_drink', () => {
        state.hunger += 10;
        state.daily.drinkCount += 1;
        pushDialog('小音：补水成功，状态更好啦。');
      });
    }));

    el.btnMusic.addEventListener('click', safeAction('btn_music', () => {
      applyAction('btn_music', () => {
        state.affection += 6;
        state.hunger -= 3;
        state.daily.musicCount += 1;
        pushDialog('小音：这首歌让我更喜欢你了。');
      });
    }));

    el.btnSimOffline.addEventListener('click', safeAction('btn_sim_offline', () => {
      state.lastSeenTs = Date.now() - 5 * 60 * 60 * 1000;
      saveState('simulate-5h-set');
      applyOfflineDecay(Date.now());
      pushDialog('调试：已模拟离线 5 小时并执行补算。');
      renderAll();
    }));

    el.btnSimDay.addEventListener('click', safeAction('btn_sim_day', () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const y = yesterday.getFullYear();
      const m = String(yesterday.getMonth() + 1).padStart(2, '0');
      const d = String(yesterday.getDate()).padStart(2, '0');
      state.lastDailyResetDate = `${y}-${m}-${d}`;
      saveState('simulate-new-day-set');
      applyDailyResetIfNeeded();
      renderAll();
    }));

    el.btnResetSave.addEventListener('click', safeAction('btn_reset_save', resetToDefault));
  }

  function initRefs() {
    el.canvas = document.getElementById('scene');
    el.ctx = el.canvas.getContext('2d');
    el.dialog = document.getElementById('dialog');
    el.barAffection = document.getElementById('bar_affection');
    el.barHunger = document.getElementById('bar_hunger');
    el.debug = document.getElementById('debug');
    el.btnPc = document.getElementById('btn_pc');
    el.btnEat = document.getElementById('btn_eat');
    el.btnDrink = document.getElementById('btn_drink');
    el.btnMusic = document.getElementById('btn_music');
    el.btnSimOffline = document.getElementById('btn_sim_offline');
    el.btnSimDay = document.getElementById('btn_sim_day');
    el.btnResetSave = document.getElementById('btn_reset_save');
  }

  function init() {
    try {
      initRefs();
      loadState();
      applyDailyResetIfNeeded();
      applyOfflineDecay(Date.now());
      bindEvents();
      renderAll();
    } catch (err) {
      const debug = document.getElementById('debug');
      if (debug) {
        debug.textContent = `初始化失败：${String(err)}`;
      }
    }
  }

  init();
})();
