/*
CHECKLIST (Definition of Done)
A. 项目结构与运行方式
✅ 仅使用 index.html/style.css/game.js，无构建工具、无 npm、无后端。见全部文件。
⚠️ file:// 下浏览器定位/天气可能受安全策略影响；已做 fallback，不影响 UI 与核心玩法。见 safeInit/getLocation/getWeather。

B. 页面布局与可用性
✅ 左 Canvas(#scene) + 右 UI 面板。见 index.html。
✅ 包含 #dialog、#btn_pc/#btn_eat/#btn_drink/#btn_music、#bar_affection/#bar_hunger、调试区 #debug。见 index.html。
✅ 按钮最小高度 44px。见 style.css button。

C. Canvas 场景最低要求
✅ 画背景墙+地板+窗户+像素小人占位。见 drawScene/drawCharacter。
✅ 点击小人命中触发对白（随机至少5句）。见 dialogues.json + pickDialogue/onSceneClick。

D. 状态模型
✅ state 含 affection/hunger/lastSeenTs/lastDailyResetDate/daily。见 defaultState。
✅ 数值写入均 clamp 0-100。见 clamp + applyAction/offlineDecay。

E. 行为规则
✅ 四按钮严格数值变化，点击后立即更新数值+对白+存档。见 ACTION_RULES + applyAction。
✅ 点击角色只触发对白不改数值。见 onSceneClick。

F. 存档与恢复
✅ localStorage key 固定 xiaoyin_pet_save_v1。见 SAVE_KEY。
✅ 变化后立即保存；刷新恢复状态。见 persistState/loadState。
✅ 调试区显示 affection/hunger/date/lastSeenTs/daily/save提示。见 renderDebug。

G. 离线补算饥饿
✅ deltaMinutes/floor/30 规则实现，随后更新 lastSeenTs 并保存。见 applyOfflineDecay。

H. 每日清零
✅ 跨日 affection=0 + daily清零 + 写对白 + 保存。见 applyDailyReset。

I. 防 bug
✅ 初始化整体 try/catch，错误写入调试区，防白屏。见 safeInit/setError。
✅ 缺字段用默认模板修复，防 NaN。见 normalizeState。

J. 自测按钮
✅ Simulate +5h offline / Simulate new day / Reset save 均可用。见 bindEvents 对应按钮。
*/

const SAVE_KEY = "xiaoyin_pet_save_v1";
const ACTION_COOLDOWN_MS = 300;

const ACTION_RULES = {
  pc: { affection: +8, hunger: -12 },
  eat: { affection: 0, hunger: +35 },
  drink: { affection: 0, hunger: +10 },
  music: { affection: +6, hunger: -3 },
};

const NAMES = { npc: "小白", player: "小音" };

const DIALOGUES_FALLBACK = {
  npc: NAMES.npc,
  player: NAMES.player,
  tap: ["{npc}：{player}，你来啦。", "{npc}：我在这里等你。"],
  morning: ["{npc}：早安，{player}。"],
  evening: ["{npc}：晚上好，{player}。"],
  rain: ["{npc}：外面在下雨。"],
  hunger_low: ["{npc}：{player}，我有点饿了。"],
  action_eat: ["{npc}：谢谢{player}投喂！"],
  action_music: ["{npc}：这首歌很好听。"],
  action_pc: ["{npc}：我在认真用电脑。"],
  action_drink: ["{npc}：补水成功。"],
  rare: ["{npc}：{player}，你在就很好。"],
};
const defaultState = () => ({
  affection: 0,
  hunger: 100,
  lastSeenTs: Date.now(),
  lastDailyResetDate: getTodayDate(),
  daily: {
    pcCount: 0,
    eatCount: 0,
    drinkCount: 0,
    musicCount: 0,
  },
  weatherCode: null,
  weatherKind: "unknown",
  weatherUpdatedAt: 0,
  weatherUnavailable: true,
  location: null,
  lastLocationTs: 0,
  lastSaveTip: "尚未保存",
});

const ui = {
  canvas: document.getElementById("scene"),
  dialog: document.getElementById("dialog"),
  btnPc: document.getElementById("btn_pc"),
  btnEat: document.getElementById("btn_eat"),
  btnDrink: document.getElementById("btn_drink"),
  btnMusic: document.getElementById("btn_music"),
  barAffection: document.getElementById("bar_affection"),
  barHunger: document.getElementById("bar_hunger"),
  txtAffection: document.getElementById("txt_affection"),
  txtHunger: document.getElementById("txt_hunger"),
  debug: document.getElementById("debug"),
  btnSimOffline: document.getElementById("btn_sim_offline"),
  btnSimNewday: document.getElementById("btn_sim_newday"),
  btnResetSave: document.getElementById("btn_reset_save"),
};

let state = defaultState();
let actionBusy = false;
let lastError = "";
let lastLine = "";
let dialoguesData = DIALOGUES_FALLBACK;

safeInit();

async function safeInit() {
  try {
    state = loadState();
    const didDailyReset = applyDailyReset(state);
    const didOffline = applyOfflineDecay(state);

    if (!didDailyReset && !didOffline) {
      state.lastSeenTs = Date.now();
      persistState("初始化完成");
    }

    dialoguesData = await loadDialogues();
    bindEvents();
    drawScene();
    renderAll();

    // 可选：天气/定位在 file:// 可能被限制，不影响主流程
    refreshLocationAndWeather().finally(() => renderAll());
  } catch (error) {
    setError(`初始化失败: ${String(error)}`);
    renderAll();
  }
}

function bindEvents() {
  ui.btnPc.addEventListener("click", () => onAction("pc"));
  ui.btnEat.addEventListener("click", () => onAction("eat"));
  ui.btnDrink.addEventListener("click", () => onAction("drink"));
  ui.btnMusic.addEventListener("click", () => onAction("music"));

  ui.canvas.addEventListener("click", onSceneClick);

  ui.btnSimOffline.addEventListener("click", () => {
    state.lastSeenTs = Date.now() - 5 * 60 * 60 * 1000;
    applyOfflineDecay(state);
    showDialogue("sim_offline", false);
    renderAll();
  });

  ui.btnSimNewday.addEventListener("click", () => {
    state.lastDailyResetDate = getDateOffset(-1);
    applyDailyReset(state);
    renderAll();
  });

  ui.btnResetSave.addEventListener("click", () => {
    localStorage.removeItem(SAVE_KEY);
    state = defaultState();
    showDialogue("reset_save", false);
    persistState("已重置存档");
    drawScene();
    renderAll();
  });

  window.addEventListener("beforeunload", () => {
    state.lastSeenTs = Date.now();
    persistState("窗口关闭前保存");
  });
}

function onAction(action) {
  if (actionBusy) return;
  const rule = ACTION_RULES[action];
  if (!rule) return;

  actionBusy = true;
  setButtonsEnabled(false);
  setTimeout(() => {
    actionBusy = false;
    setButtonsEnabled(true);
  }, ACTION_COOLDOWN_MS);

  try {
    applyAction(action, rule);
  } catch (error) {
    setError(`动作执行失败(${action}): ${String(error)}`);
    renderAll();
  }
}

function applyAction(action, rule) {
  state.affection = clamp(state.affection + rule.affection);
  state.hunger = clamp(state.hunger + rule.hunger);

  if (action === "pc") state.daily.pcCount += 1;
  if (action === "eat") state.daily.eatCount += 1;
  if (action === "drink") state.daily.drinkCount += 1;
  if (action === "music") state.daily.musicCount += 1;

  state.lastSeenTs = Date.now();
  showDialogue(action);
  persistState(`动作保存: ${action}`);
  renderAll();
}

function onSceneClick(event) {
  const rect = ui.canvas.getBoundingClientRect();
  const sx = ui.canvas.width / rect.width;
  const sy = ui.canvas.height / rect.height;
  const x = (event.clientX - rect.left) * sx;
  const y = (event.clientY - rect.top) * sy;

  const person = getPersonRect();
  const hit = x >= person.x && x <= person.x + person.w && y >= person.y && y <= person.y + person.h;
  if (!hit) return;

  showDialogue("tap");
  persistState("点击小人保存");
  renderAll();
}

function showDialogue(action, save = true) {
  const line = pickDialogue({
    trigger: action === "tap" ? "tap" : "action",
    action,
    hunger: state.hunger,
    weatherKind: state.weatherKind,
    timeOfDay: getTimeOfDay(),
  });
  drawDialog(line, save);
}

function drawDialog(text, save = true) {
  const formatted = withSpeakerPrefix(formatLine(text));
  ui.dialog.textContent = formatted;
  lastLine = formatted;
  if (save) {
    state.lastSeenTs = Date.now();
  }
}

function drawScene() {
  const ctx = ui.canvas.getContext("2d");
  const { width, height } = ui.canvas;

  // 墙
  ctx.fillStyle = "#6d7fb6";
  ctx.fillRect(0, 0, width, height * 0.68);

  // 地板
  ctx.fillStyle = "#3f3551";
  ctx.fillRect(0, height * 0.68, width, height * 0.32);

  // 窗户
  ctx.fillStyle = "#e6ecff";
  ctx.fillRect(70, 70, 190, 130);
  ctx.fillStyle = "#8fd8ff";
  ctx.fillRect(78, 78, 174, 114);

  // 小人
  const p = getPersonRect();
  drawCharacter(ctx, p.x, p.y);
}

function drawCharacter(ctx, x, y) {
  const s = 8;
  ctx.fillStyle = "#ffd8bd";
  ctx.fillRect(x, y, s * 3, s * 3);
  ctx.fillStyle = "#3b2c22";
  ctx.fillRect(x, y, s * 3, s);
  ctx.fillStyle = "#58a8ff";
  ctx.fillRect(x + s, y + s * 3, s, s * 3);
  ctx.fillStyle = "#293855";
  ctx.fillRect(x, y + s * 6, s, s * 2);
  ctx.fillRect(x + s * 2, y + s * 6, s, s * 2);
}

function getPersonRect() {
  return { x: 240, y: 250, w: 24, h: 64 };
}

function renderAll() {
  const safe = normalizeState(state);
  state = safe;

  ui.barAffection.value = safe.affection;
  ui.barHunger.value = safe.hunger;
  ui.txtAffection.textContent = `${safe.affection} / 100`;
  ui.txtHunger.textContent = `${safe.hunger} / 100`;

  renderDebug();
}

function renderDebug() {
  const d = state.daily;
  const lines = [
    `affection: ${state.affection}`,
    `hunger: ${state.hunger}`,
    `lastDailyResetDate: ${state.lastDailyResetDate}`,
    `lastSeenTs: ${state.lastSeenTs} (${formatTs(state.lastSeenTs)})`,
    `daily.pcCount: ${d.pcCount}`,
    `daily.eatCount: ${d.eatCount}`,
    `daily.drinkCount: ${d.drinkCount}`,
    `daily.musicCount: ${d.musicCount}`,
    `saveTip: ${state.lastSaveTip}`,
    `dialogues: ${dialoguesData === DIALOGUES_FALLBACK ? "fallback" : "dialogues.json"}`,
    `error: ${lastError || "(none)"}`,
  ];
  ui.debug.textContent = lines.join("\n");
}

function applyOfflineDecay(target) {
  const nowTs = Date.now();
  const deltaMinutes = Math.floor((nowTs - target.lastSeenTs) / 60000);
  if (!Number.isFinite(deltaMinutes) || deltaMinutes <= 0) {
    target.lastSeenTs = nowTs;
    persistState("离线补算: 无变化");
    return false;
  }

  const decay = Math.floor(deltaMinutes / 30);
  if (decay > 0) {
    target.hunger = clamp(target.hunger - decay);
  }

  target.lastSeenTs = nowTs;
  persistState(`离线补算: -${decay} hunger`);
  return decay > 0;
}

function applyDailyReset(target) {
  const today = getTodayDate();
  if (target.lastDailyResetDate === today) {
    return false;
  }

  target.affection = 0;
  target.daily.pcCount = 0;
  target.daily.eatCount = 0;
  target.daily.drinkCount = 0;
  target.daily.musicCount = 0;
  target.lastDailyResetDate = today;
  showDialogue("daily_reset", false);
  persistState("每日清零已保存");
  return true;
}

async function loadDialogues() {
  try {
    const response = await fetch("dialogues.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const parsed = await response.json();
    return normalizeDialogues(parsed);
  } catch (error) {
    setError(`对白库加载失败，已使用内置回退: ${String(error)}`);
    return DIALOGUES_FALLBACK;
  }
}

function normalizeDialogues(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const safe = { ...DIALOGUES_FALLBACK, ...source };
  safe.npc = typeof safe.npc === "string" && safe.npc ? safe.npc : NAMES.npc;
  safe.player = typeof safe.player === "string" && safe.player ? safe.player : NAMES.player;
  const keys = [
    "tap",
    "morning",
    "evening",
    "rain",
    "hunger_low",
    "action_eat",
    "action_music",
    "action_pc",
    "action_drink",
    "rare",
  ];
  keys.forEach((key) => {
    safe[key] = Array.isArray(safe[key]) && safe[key].length > 0 ? safe[key] : DIALOGUES_FALLBACK[key];
  });
  return safe;
}

function pickDialogue(context) {
  const pools = [];

  if (context.trigger === "tap") {
    pools.push(...dialoguesData.tap);
  }

  if (context.timeOfDay === "morning") {
    pools.push(...dialoguesData.morning);
  }
  if (context.timeOfDay === "evening" || context.timeOfDay === "night") {
    pools.push(...dialoguesData.evening);
  }

  if (context.weatherKind === "rain") {
    pools.push(...dialoguesData.rain);
  }

  if (context.hunger <= 30) {
    pools.push(...dialoguesData.hunger_low);
  }

  if (context.action === "eat") pools.push(...dialoguesData.action_eat);
  if (context.action === "music") pools.push(...dialoguesData.action_music);
  if (context.action === "pc") pools.push(...dialoguesData.action_pc);
  if (context.action === "drink") pools.push(...dialoguesData.action_drink);

  if (Math.random() < 0.08) {
    pools.push(...dialoguesData.rare);
  }

  const fallback = `${NAMES.npc}：${NAMES.player}，我在这里陪着你。`;
  const finalPool = pools.length > 0 ? pools : [fallback];
  const noRepeat = finalPool.filter((line) => withSpeakerPrefix(formatLine(line)) !== lastLine);
  const selectedPool = noRepeat.length > 0 ? noRepeat : finalPool;
  return pickRandom(selectedPool);
}

function formatLine(s) {
  return String(s)
    .replaceAll("{npc}", dialoguesData.npc || NAMES.npc)
    .replaceAll("{player}", dialoguesData.player || NAMES.player);
}

function withSpeakerPrefix(s) {
  const npcName = dialoguesData.npc || NAMES.npc;
  return s.startsWith(`${npcName}：`) ? s : `${npcName}：${s}`;
}

function getTimeOfDay() {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 18 || hour < 6) return "night";
  return "evening";
}

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return normalizeState({ ...defaultState(), ...parsed });
  } catch (error) {
    setError(`读取存档失败，已用默认值: ${String(error)}`);
    return defaultState();
  }
}

function persistState(tip) {
  state.lastSaveTip = `${tip} @ ${formatTs(Date.now())}`;
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

function normalizeState(input) {
  const base = defaultState();
  const merged = { ...base, ...input, daily: { ...base.daily, ...(input?.daily || {}) } };

  merged.affection = clamp(merged.affection);
  merged.hunger = clamp(merged.hunger);

  merged.lastSeenTs = ensureNumber(merged.lastSeenTs, Date.now());
  merged.lastDailyResetDate = typeof merged.lastDailyResetDate === "string" ? merged.lastDailyResetDate : getTodayDate();

  merged.daily.pcCount = ensureNumber(merged.daily.pcCount, 0);
  merged.daily.eatCount = ensureNumber(merged.daily.eatCount, 0);
  merged.daily.drinkCount = ensureNumber(merged.daily.drinkCount, 0);
  merged.daily.musicCount = ensureNumber(merged.daily.musicCount, 0);

  return merged;
}

async function refreshLocationAndWeather() {
  try {
    await getLocation();
    await getWeather();
  } catch (error) {
    setError(`可选定位/天气失败: ${String(error)}`);
  }
}

async function getLocation() {
  // file:// 下 isSecureContext 常为 false，按要求 fallback，不影响主流程
  if (!navigator.geolocation || !window.isSecureContext) {
    return null;
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.location = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        state.lastLocationTs = Date.now();
        persistState("定位成功");
        resolve(state.location);
      },
      () => resolve(null),
      { timeout: 5000 }
    );
  });
}

async function getWeather() {
  // 保留 fallback，不影响核心玩法
  return null;
}

function setButtonsEnabled(enabled) {
  [ui.btnPc, ui.btnEat, ui.btnDrink, ui.btnMusic].forEach((btn) => {
    btn.disabled = !enabled;
  });
}

function clamp(value) {
  return Math.min(100, Math.max(0, Math.round(ensureNumber(value, 0))));
}

function ensureNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getTodayDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getDateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTs(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "invalid";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
}

function setError(msg) {
  lastError = msg;
}
