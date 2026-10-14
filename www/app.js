// ===================== 基础工具 =====================
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const avatarHtml = c => (c.avatar || '').startsWith('data:')
  ? `<img src="${c.avatar}">`
  : esc(c.avatar || '🙂');

const STORE_KEY = 'mx.v2';
const DEFAULT_SETTINGS = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  temperature: '0.9',   // 留空则不发送该参数（某些模型不支持自定义）
  maxRecent: 20,        // 每次带入的原始消息条数（短期记忆）
  summaryTrigger: 40,   // 超过这个条数，较早的消息压缩进摘要（长期记忆）
};
const WB_LIMIT = 3000;  // 世界书单次注入的最大字数
const PROFILE_FIELDS = [
  ['gender', '性别'], ['age', '年龄'], ['mbti', 'MBTI'], ['job', '身份/职业'],
  ['appearance', '外貌'], ['personality', '性格'], ['speech', '说话风格'],
  ['background', '经历背景'], ['relation', '与用户的关系'], ['extra', '其他设定'],
];
const SHORT_FIELDS = ['gender', 'age', 'mbti', 'job'];

// ===================== 状态 =====================
function freshState() {
  const id = uid();
  return {
    settings: { ...DEFAULT_SETTINGS },
    user: { name: '我', persona: '' },
    chars: [{
      id, name: '林序', avatar: '☕',
      greeting: '你来啦。今天还是老样子吗？',
      profile: {
        gender: '男', age: '25', mbti: 'INTJ', job: '街角咖啡店店主',
        appearance: '', personality: '话不多，细心，会记住客人的口味。',
        speech: '语气温和、句子偏短，偶尔冷幽默。', background: '',
        relation: '用户常去的咖啡店的熟客，有一点暧昧但不急。', extra: '',
      },
    }],
    worldbook: [{
      id: uid(), name: '城市背景', scope: 'global', keys: '', constant: true, enabled: true,
      content: '这是一座常年多雨的小城，街道湿滑，人们习惯随身带伞。',
    }],
    chats: {},
  };
}

function loadState() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) {}
  if (!s) return freshState();
  s.settings = { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
  s.user = s.user || { name: '我', persona: '' };
  s.chars = s.chars || [];
  s.worldbook = s.worldbook || [];
  s.chats = s.chats || {};
  return s;
}

let S = loadState();
function save() { localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
const getChar = id => S.chars.find(c => c.id === id);
function getChat(id) {
  if (!S.chats[id]) S.chats[id] = { messages: [], summary: '', unread: 0, lastTs: 0 };
  return S.chats[id];
}

// ===================== 导航 =====================
let route = { name: 'home' };
let stack = [];
let busy = false;
let busyId = null;
let pendingAvatar = null;

function go(name, params = {}) { stack.push(route); route = { name, ...params }; render(); }
function back() { route = stack.pop() || { name: 'home' }; render(); }
function home() { stack = []; route = { name: 'home' }; render(); }

const VIEWS = {
  home: vHome, chats: vChats, chat: vChat, contacts: vContacts,
  editor: vEditor, worldbook: vWorldbook, wbeditor: vWbEditor,
  settings: vSettings, data: vData,
};

function render() {
  const v = VIEWS[route.name](route);
  $('title').textContent = v.title || '';
  $('back').style.visibility = route.name === 'home' ? 'hidden' : 'visible';
  $('right').innerHTML = v.right || '';
  $('screen').className = 'screen' + (route.name === 'chat' ? ' chat' : '');
  $('screen').innerHTML = v.html;
  if (v.after) v.after();
}

// ===================== 页面 =====================
function vHome() {
  const unread = Object.values(S.chats).reduce((a, c) => a + (c.unread || 0), 0);
  const apps = [
    ['chats', '信息', '💬', unread],
    ['contacts', '通讯录', '👥', 0],
    ['worldbook', '世界书', '📖', 0],
    ['settings', '设置', '⚙️', 0],
  ];
  return {
    title: '心语手机',
    html: `<div class="grid">${apps.map(([r, n, i, b]) =>
      `<div class="app" onclick="go('${r}')"><div class="icon">${i}${b ? `<span class="badge">${b}</span>` : ''}</div><div>${n}</div></div>`
    ).join('')}</div>`,
  };
}

function vChats() {
  const list = [...S.chars].sort((a, b) => (getChat(b.id).lastTs || 0) - (getChat(a.id).lastTs || 0));
  if (!list.length) return { title: '信息', html: '<div class="empty">还没有角色，去通讯录新建一个吧</div>' };
  return {
    title: '信息',
    html: list.map(c => {
      const ch = getChat(c.id);
      const last = ch.messages.filter(m => m.role !== 'system').slice(-1)[0];
      const preview = last ? last.content.split('\n')[0] : (c.greeting || '');
      return `<div class="item">
        <div class="av clickable" onclick="go('chat',{id:'${c.id}'})">${avatarHtml(c)}</div>
        <div class="meta" onclick="go('chat',{id:'${c.id}'})">
          <div class="name">${esc(c.name)}</div>
          <div class="prev">${esc(preview)}</div>
        </div>
        ${ch.unread ? `<span class="dot">${ch.unread}</span>` : ''}
      </div>`;
    }).join(''),
  };
}

function vChat({ id }) {
  const c = getChar(id);
  if (!c) return { title: '', html: '<div class="empty">角色不存在</div>' };
  const chat = getChat(id);
  chat.unread = 0;
  if (!chat.messages.length && c.greeting) {
    chat.messages.push({ role: 'assistant', content: c.greeting, ts: Date.now() });
    save();
  }
  const msgs = chat.messages.map(m => {
    if (m.role === 'system') return `<div class="tip">${esc(m.content)}</div>`;
    if (m.role === 'user') return `<div class="row me"><div class="bubble">${esc(m.content)}</div></div>`;
    // 助手消息按换行拆成多条气泡，更像手机聊天
    return m.content.split('\n').filter(s => s.trim()).map((line, i) =>
      `<div class="row"><div class="mini">${i === 0 ? avatarHtml(c) : ''}</div><div class="bubble">${esc(line)}</div></div>`
    ).join('');
  }).join('');
  const typing = busy && busyId === id
    ? `<div class="row"><div class="mini">${avatarHtml(c)}</div><div class="bubble dim">对方正在输入…</div></div>` : '';
  return {
    title: c.name,
    right: `<button class="ghost" onclick="go('editor',{id:'${id}'})">资料</button>`,
    html: `<div class="chatlog" id="log">${msgs}${typing}</div>
      <div class="inputbar">
        <button class="ghost" title="让TA主动发一条消息" onclick="proactive('${id}')" ${busy ? 'disabled' : ''}>📩</button>
        <textarea id="inp" rows="1" placeholder="输入消息"></textarea>
        <button class="send" onclick="sendMsg('${id}')" ${busy ? 'disabled' : ''}>发送</button>
      </div>`,
    after() {
      const log = $('log'); log.scrollTop = log.scrollHeight;
      $('inp').onkeydown = e => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendMsg(id); }
      };
    },
  };
}

function vContacts() {
  const rows = S.chars.map(c => `<div class="item">
      <div class="av clickable" onclick="go('chat',{id:'${c.id}'})">${avatarHtml(c)}</div>
      <div class="meta" onclick="go('chat',{id:'${c.id}'})">
        <div class="name">${esc(c.name)}</div>
        <div class="prev">${esc(c.profile?.job || c.profile?.relation || '')}</div>
      </div>
      <button class="ghost" onclick="go('editor',{id:'${c.id}'})">编辑</button>
    </div>`).join('');
  return {
    title: '通讯录',
    right: `<button class="ghost" onclick="go('editor',{})">+ 新建</button>`,
    html: rows || '<div class="empty">还没有角色</div>',
  };
}

function vEditor({ id }) {
  const c = id ? getChar(id) : { name: '', avatar: '🙂', greeting: '', profile: {} };
  const p = c.profile || {};
  pendingAvatar = null;
  const fields = PROFILE_FIELDS.map(([k, n]) => SHORT_FIELDS.includes(k)
    ? `<label>${n}<input id="p_${k}" value="${esc(p[k])}"></label>`
    : `<label>${n}<textarea id="p_${k}" rows="2">${esc(p[k])}</textarea></label>`
  ).join('');
  const emojiVal = c.avatar && !c.avatar.startsWith('data:') ? c.avatar : '';
  return {
    title: id ? '编辑角色' : '新建角色',
    html: `<div class="form">
      <label>头像
        <div class="avrow">
          <div class="av" id="avprev">${avatarHtml(c)}</div>
          <input id="av_emoji" value="${esc(emojiVal)}" placeholder="输入 emoji，如 ☕">
          <input type="file" accept="image/*" onchange="pickAvatar(this)">
        </div>
      </label>
      <label>名字<input id="c_name" value="${esc(c.name)}"></label>
      <label>开场白（第一次进入聊天时TA会先说）<textarea id="c_greeting" rows="2">${esc(c.greeting)}</textarea></label>
      <h4>角色档案</h4>
      ${fields}
      <div class="btns">
        <button class="send" onclick="saveChar(${id ? `'${id}'` : 'null'})">保存</button>
        ${id ? `<button class="ghost" onclick="clearChat('${id}')">清空聊天</button>
                <button class="danger" onclick="delChar('${id}')">删除角色</button>` : ''}
      </div>
    </div>`,
  };
}

function vWorldbook() {
  const rows = S.worldbook.map(e => `<div class="item clickable" onclick="go('wbeditor',{id:'${e.id}'})">
      <div class="av wb">📖</div>
      <div class="meta">
        <div class="name">${esc(e.name || '未命名')}${e.enabled ? '' : '<span class="tag">已停用</span>'}</div>
        <div class="prev">${esc(scopeName(e.scope))} · ${e.constant ? '常驻' : esc(e.keys || '无关键词')}</div>
      </div>
    </div>`).join('');
  return {
    title: '世界书',
    right: `<button class="ghost" onclick="go('wbeditor',{})">+ 新建</button>`,
    html: `<div class="hint">世界书用来给角色补充背景设定。"常驻"条目每次都会注入；其余条目只有关键词出现在最近对话里时才注入。</div>`
      + (rows || '<div class="empty">还没有条目</div>'),
  };
}

function scopeName(s) {
  if (s === 'global') return '全局';
  const c = getChar(s);
  return c ? c.name : '已删除角色';
}

function vWbEditor({ id }) {
  const e = id
    ? S.worldbook.find(x => x.id === id)
    : { name: '', scope: 'global', keys: '', constant: false, enabled: true, content: '' };
  const opts = [['global', '全局（所有角色）'], ...S.chars.map(c => [c.id, '仅 ' + c.name])]
    .map(([v, n]) => `<option value="${v}" ${e.scope === v ? 'selected' : ''}>${esc(n)}</option>`).join('');
  return {
    title: id ? '编辑条目' : '新建条目',
    html: `<div class="form">
      <label>条目名<input id="w_name" value="${esc(e.name)}" placeholder="如：雨城的规矩"></label>
      <label>作用范围<select id="w_scope">${opts}</select></label>
      <label>触发关键词（逗号分隔）<input id="w_keys" value="${esc(e.keys)}" placeholder="如：咖啡,雨伞"></label>
      <label class="chk"><input type="checkbox" id="w_const" ${e.constant ? 'checked' : ''}> 常驻（每次都注入，不看关键词）</label>
      <label class="chk"><input type="checkbox" id="w_en" ${e.enabled ? 'checked' : ''}> 启用</label>
      <label>内容<textarea id="w_content" rows="8" placeholder="写世界观、地点、规则、角色之间的关系等">${esc(e.content)}</textarea></label>
      <div class="btns">
        <button class="send" onclick="saveWb(${id ? `'${id}'` : 'null'})">保存</button>
        ${id ? `<button class="danger" onclick="delWb('${id}')">删除</button>` : ''}
      </div>
    </div>`,
  };
}

function vSettings() {
  const s = S.settings;
  return {
    title: '设置',
    html: `<div class="form">
      <h4>模型接口（OpenAI 格式）</h4>
      <label>Base URL<input id="s_url" value="${esc(s.baseUrl)}" placeholder="https://api.openai.com/v1"></label>
      <label>API Key<input id="s_key" type="password" value="${esc(s.apiKey)}" placeholder="sk-..."></label>
      <label>模型名<input id="s_model" value="${esc(s.model)}" placeholder="gpt-4o-mini"></label>
      <label>Temperature（留空则不发送该参数）<input id="s_temp" value="${esc(s.temperature)}"></label>
      <label>保留的原始消息条数<input id="s_recent" type="number" value="${s.maxRecent}"></label>
      <label>超过多少条时压缩为摘要<input id="s_trigger" type="number" value="${s.summaryTrigger}"></label>
      <div class="btns">
        <button class="send" onclick="saveSettings()">保存设置</button>
        <button class="ghost" onclick="testApi()">测试连接</button>
      </div>
      <h4>我的资料</h4>
      <label>我的名字<input id="u_name" value="${esc(S.user.name)}"></label>
      <label>我的设定（会告诉角色你是谁）<textarea id="u_persona" rows="3">${esc(S.user.persona)}</textarea></label>
      <div class="btns"><button class="send" onclick="saveUser()">保存我的资料</button></div>
      <h4>数据</h4>
      <div class="btns">
        <button class="ghost" onclick="go('data')">备份 / 导入</button>
        <button class="danger" onclick="clearAll()">清空全部数据</button>
      </div>
      <p class="hint">API Key 只保存在本机（App 的本地存储）中，不会上传到其他地方。</p>
    </div>`,
  };
}

function vData() {
  return {
    title: '备份与导入',
    html: `<div class="form">
      <p class="hint">下面是全部数据的 JSON。复制保存即可备份；在新设备粘贴后点"导入"即可恢复（会覆盖当前数据）。</p>
      <textarea id="dataBox" rows="18" style="font-family:monospace;font-size:12px">${esc(JSON.stringify(S, null, 2))}</textarea>
      <div class="btns">
        <button class="send" onclick="importData()">导入覆盖</button>
        <button class="ghost" onclick="copyData()">复制</button>
      </div>
    </div>`,
  };
}

// ===================== 角色 / 世界书 操作 =====================
function pickAvatar(input) {
  const f = input.files[0];
  if (!f) return;
  const img = new Image();
  const url = URL.createObjectURL(f);
  img.onload = () => {
    const s = 128;
    const cv = document.createElement('canvas');
    cv.width = cv.height = s;
    const k = Math.max(s / img.width, s / img.height);
    const w = img.width * k, h = img.height * k;
    cv.getContext('2d').drawImage(img, (s - w) / 2, (s - h) / 2, w, h);
    pendingAvatar = cv.toDataURL('image/jpeg', 0.85);
    $('avprev').innerHTML = `<img src="${pendingAvatar}">`;
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

function saveChar(id) {
  const name = $('c_name').value.trim();
  if (!name) return alert('请填写名字');
  const profile = {};
  PROFILE_FIELDS.forEach(([k]) => profile[k] = $('p_' + k).value.trim());
  const old = id ? getChar(id) : null;
  const emoji = $('av_emoji').value.trim();
  const avatar = pendingAvatar || emoji || old?.avatar || '🙂';
  const data = { name, avatar, greeting: $('c_greeting').value.trim(), profile };
  if (old) Object.assign(old, data);
  else S.chars.push({ id: uid(), ...data });
  pendingAvatar = null;
  save();
  back();
}

function delChar(id) {
  if (!confirm('删除这个角色？它的聊天记录和专属世界书也会一起删除。')) return;
  S.chars = S.chars.filter(c => c.id !== id);
  delete S.chats[id];
  S.worldbook = S.worldbook.filter(e => e.scope !== id);
  save();
  home();
}

function clearChat(id) {
  if (!confirm('清空和这个角色的全部聊天记录？')) return;
  S.chats[id] = { messages: [], summary: '', unread: 0, lastTs: 0 };
  save();
  back();
}

function saveWb(id) {
  const content = $('w_content').value.trim();
  if (!content) return alert('内容不能为空');
  const data = {
    name: $('w_name').value.trim(),
    scope: $('w_scope').value,
    keys: $('w_keys').value.trim(),
    constant: $('w_const').checked,
    enabled: $('w_en').checked,
    content,
  };
  if (id) Object.assign(S.worldbook.find(x => x.id === id), data);
  else S.worldbook.push({ id: uid(), ...data });
  save();
  back();
}

function delWb(id) {
  if (!confirm('删除这个世界书条目？')) return;
  S.worldbook = S.worldbook.filter(x => x.id !== id);
  save();
  back();
}

// ===================== 设置 操作 =====================
function saveSettings(silent) {
  S.settings.baseUrl = $('s_url').value.trim() || DEFAULT_SETTINGS.baseUrl;
  S.settings.apiKey = $('s_key').value.trim();
  S.settings.model = $('s_model').value.trim() || DEFAULT_SETTINGS.model;
  S.settings.temperature = $('s_temp').value.trim();
  S.settings.maxRecent = parseInt($('s_recent').value, 10) || 20;
  S.settings.summaryTrigger = parseInt($('s_trigger').value, 10) || 40;
  save();
  if (!silent) alert('已保存');
}

function saveUser() {
  S.user.name = $('u_name').value.trim() || '我';
  S.user.persona = $('u_persona').value.trim();
  save();
  alert('已保存');
}

async function testApi() {
  saveSettings(true);
  try {
    const r = await llm([{ role: 'user', content: '请只回复两个字：连通' }]);
    alert('连接成功：' + r);
  } catch (e) {
    alert('连接失败：' + e.message);
  }
}

function copyData() {
  const b = $('dataBox');
  b.select();
  document.execCommand('copy');
  alert('已选中并复制');
}

function importData() {
  let obj;
  try { obj = JSON.parse($('dataBox').value); } catch (e) { return alert('JSON 格式不对'); }
  if (!obj || !Array.isArray(obj.chars)) return alert('不是有效的备份');
  localStorage.setItem(STORE_KEY, JSON.stringify(obj));
  S = loadState();
  home();
  alert('导入成功');
}

function clearAll() {
  if (!confirm('确定清空全部数据（包括角色、世界书、聊天和 API 设置）？')) return;
  S = freshState();
  save();
  home();
}

// ===================== 对话核心 =====================
async function llm(messages, temperature) {
  const { baseUrl, apiKey, model } = S.settings;
  if (!apiKey) throw new Error('还没填 API Key，请到「设置」里填写');
  const body = { model, messages };
  const t = temperature ?? parseFloat(S.settings.temperature);
  if (!isNaN(t)) body.temperature = t;
  const r = await fetch(baseUrl.replace(/\/+$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify(body),
  });
  let j = {};
  try { j = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error(j.error?.message || ('HTTP ' + r.status));
  const text = j.choices?.[0]?.message?.content;
  if (!text) throw new Error('接口返回为空');
  return text.trim();
}

function matchWorldbook(ch, text) {
  const out = [];
  let total = 0;
  for (const e of S.worldbook) {
    if (!e.enabled || !e.content) continue;
    if (e.scope !== 'global' && e.scope !== ch.id) continue;
    const keys = (e.keys || '').split(/[,，、\s]+/).filter(Boolean);
    const hit = e.constant || keys.some(k => text.includes(k));
    if (!hit) continue;
    if (total + e.content.length > WB_LIMIT) break;
    total += e.content.length;
    out.push(`- ${e.name ? e.name + '：' : ''}${e.content}`);
  }
  return out.join('\n');
}

function buildSystem(ch, summary, scanText) {
  const p = ch.profile || {};
  const userName = S.user.name || '用户';
  const now = new Date().toLocaleString('zh-CN', { hour12: false });
  const lines = [];
  lines.push(`你正在进行一场角色扮演聊天。你的身份是「${ch.name}」，对话对象是「${userName}」。请完全代入角色，用符合角色身份的口吻回复。`);
  lines.push('【回复规则】像真人发微信一样说话；每次回复1到3条短消息，用换行分隔；不要写旁白、括号动作或心理描写；不要提及自己是AI或模型；不要替用户做决定或替用户说话。');
  lines.push(`【当前时间】${now}`);
  const prof = PROFILE_FIELDS.filter(([k]) => p[k]).map(([k, n]) => `${n}：${p[k]}`).join('\n');
  lines.push(`【角色设定】\n${ch.name}\n${prof}`);
  if (S.user.persona) lines.push(`【用户设定】\n${userName}：${S.user.persona}`);
  const wb = matchWorldbook(ch, scanText);
  if (wb) lines.push(`【世界书（背景设定，请遵守）】\n${wb}`);
  if (summary) lines.push(`【你们之前聊天的摘要】\n${summary}`);
  return lines.join('\n\n');
}

async function compress(cid) {
  const ch = getChar(cid), chat = getChat(cid);
  const real = chat.messages.filter(m => m.role !== 'system');
  const keep = S.settings.maxRecent;
  const old = real.slice(0, -keep);
  if (!old.length) return;
  const transcript = old.map(m => `${m.role === 'user' ? (S.user.name || '用户') : ch.name}：${m.content}`).join('\n');
  chat.summary = await llm([
    { role: 'system', content: '你是对话摘要助手。把已有摘要和新对话合并成一段不超过300字的中文摘要，保留重要事实、约定、用户偏好和关系变化。只输出摘要本身。' },
    { role: 'user', content: `已有摘要：\n${chat.summary || '（无）'}\n\n新对话：\n${transcript}` },
  ], 0.3);
  chat.messages = real.slice(-keep);
}

async function callChat(cid, userText, hidden) {
  const ch = getChar(cid), chat = getChat(cid);
  if (userText) chat.messages.push({ role: 'user', content: userText, ts: Date.now() });
  chat.lastTs = Date.now();
  busy = true; busyId = cid;
  save(); render();
  try {
    const recent = chat.messages.filter(m => m.role !== 'system');
    const history = recent.slice(-S.settings.maxRecent).map(m => ({ role: m.role, content: m.content }));
    const scanText = recent.slice(-6).map(m => m.content).join('\n') + '\n' + (userText || '');
    const msgs = [{ role: 'system', content: buildSystem(ch, chat.summary, scanText) }, ...history];
    if (hidden) msgs.push({ role: 'user', content: hidden });
    const reply = await llm(msgs);
    chat.messages.push({ role: 'assistant', content: reply, ts: Date.now() });
    chat.lastTs = Date.now();
    if (route.name !== 'chat' || route.id !== cid) chat.unread = (chat.unread || 0) + 1;
    if (recent.length + 1 > S.settings.summaryTrigger) await compress(cid);
  } catch (e) {
    chat.messages.push({ role: 'system', content: '发送失败：' + e.message, ts: Date.now() });
  } finally {
    busy = false; busyId = null;
    save(); render();
  }
}

function sendMsg(id) {
  const inp = $('inp');
  const t = inp.value.trim();
  if (!t || busy) return;
  inp.value = '';
  callChat(id, t, null);
}

function proactive(id) {
  if (busy) return;
  callChat(id, null, '请你现在主动给用户发一条消息（符合当前时间和你们的关系，比如问候、分享日常、或延续之前的话题）。不要提及这是被要求的。');
}

// ===================== 启动 =====================
function tick() {
  const d = new Date();
  $('clock').textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
setInterval(tick, 10000);
tick();
render();
