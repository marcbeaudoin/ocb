const STORE = 'conseiller-orange-state';
const state = { messages: [], history: [], preferences: '' };
const $ = (selector) => document.querySelector(selector);

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
    if (Array.isArray(saved.messages)) state.messages = saved.messages;
    if (Array.isArray(saved.history)) state.history = saved.history;
    if (typeof saved.preferences === 'string') state.preferences = saved.preferences;
  } catch (_) {}
}
function saveState() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (_) {}
}
function escapeText(value) { return String(value ?? '').trim(); }
function addMessage(role, text, products) {
  state.messages.push({ role, text, products: products || [] });
  saveState();
  renderConversation();
}
function safeProduct(product) {
  return {
    name: escapeText(product.name) || 'Option Orange',
    type: escapeText(product.type) || 'Sélection conseillée',
    price: escapeText(product.price) || 'À vérifier',
    rating: escapeText(product.rating) || '',
    features: Array.isArray(product.features) ? product.features.slice(0, 4).map(escapeText).filter(Boolean) : [],
    availability: escapeText(product.availability) || 'À confirmer sur Orange',
    icon: escapeText(product.icon) || '✦',
    url: /^https?:\/\//i.test(product.url || '') ? product.url : 'https://boutique.orange.fr/'
  };
}
function renderConversation() {
  const box = $('#conversation'); box.replaceChildren();
  if (!state.messages.length) {
    addWelcome(box);
    return;
  }
  state.messages.forEach((message) => {
    const bubble = document.createElement('div');
    bubble.className = 'message ' + (message.role === 'user' ? 'user' : 'assistant');
    if (message.role === 'user') bubble.textContent = message.text;
    else {
      const paragraph = document.createElement('p'); paragraph.textContent = message.text; bubble.append(paragraph);
      if (message.products && message.products.length) {
        const list = document.createElement('div'); list.className = 'recommendations';
        message.products.map(safeProduct).forEach(product => list.append(createProductCard(product)));
        bubble.append(list);
      }
    }
    box.append(bubble);
  });
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}
function addWelcome(box) {
  const bubble = document.createElement('div'); bubble.className = 'message assistant';
  const p = document.createElement('p'); p.textContent = 'Bonjour ! Je suis votre conseiller. Que cherchez-vous aujourd’hui : un mobile, un forfait, la maison connectée ou une offre adaptée à votre budget ?';
  bubble.append(p); box.append(bubble);
}
function createProductCard(product) {
  const card = document.createElement('article'); card.className = 'product-card';
  const visual = document.createElement('div'); visual.className = 'product-visual'; visual.setAttribute('aria-hidden', 'true'); visual.textContent = product.icon;
  const body = document.createElement('div'); body.className = 'product-body';
  const kicker = document.createElement('div'); kicker.className = 'product-kicker'; kicker.textContent = product.type;
  const title = document.createElement('h3'); title.textContent = product.name;
  const meta = document.createElement('div'); meta.className = 'product-meta';
  if (product.rating) meta.append('★ ' + product.rating);
  meta.append(product.availability);
  const price = document.createElement('div'); price.className = 'product-price'; price.textContent = product.price;
  if (product.features.length) { const features = document.createElement('p'); features.textContent = product.features.join(' · '); body.append(features); }
  const actions = document.createElement('div'); actions.className = 'product-actions';
  const link = document.createElement('a'); link.className = 'primary-link'; link.href = product.url; link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'Voir sur Orange';
  link.addEventListener('click', () => { state.history.unshift({ name: product.name, type: product.type, url: product.url, date: new Date().toISOString() }); state.history = state.history.slice(0, 30); saveState(); renderHistory(); });
  actions.append(link);
  body.append(kicker, title, meta, price, actions); card.append(visual, body); return card;
}
function renderHistory() {
  const list = $('#historyList'); list.replaceChildren();
  $('#historyCount').textContent = String(state.history.length); $('#historyCount').hidden = !state.history.length;
  if (!state.history.length) {
    const empty = document.createElement('div'); empty.className = 'empty-state';
    empty.innerHTML = '<div class="empty-icon">◌</div><strong>Votre carnet est encore vide</strong><p>Les produits et offres que vous consultez ici apparaîtront dans cet espace.</p>';
    list.append(empty);
  } else state.history.forEach(item => {
    const row = document.createElement('div'); row.className = 'history-item';
    const icon = document.createElement('div'); icon.className = 'history-icon'; icon.textContent = '✦';
    const copy = document.createElement('div'); copy.className = 'history-copy';
    const name = document.createElement('strong'); name.textContent = item.name;
    const date = document.createElement('small'); date.textContent = (item.type || 'Produit') + ' · ' + new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(item.date));
    copy.append(name, date); const link = document.createElement('a'); link.href = item.url; link.target = '_blank'; link.rel = 'noopener'; link.setAttribute('aria-label', 'Ouvrir ' + item.name); link.textContent = '↗'; row.append(icon, copy, link); list.append(row);
  });
  const pref = $('#preferenceBox'); pref.hidden = !state.preferences;
  if (state.preferences) { pref.replaceChildren(); const strong = document.createElement('strong'); strong.textContent = 'Préférences conservées'; const p = document.createElement('p'); p.textContent = state.preferences; pref.append(strong, p); }
}
async function askAdvisor(userText) {
  const prompt = `Tu es Conseiller Orange, un assistant d'achat en français. Aide cette personne à préciser son besoin puis propose au maximum 3 options pertinentes. Tu n'as pas accès au catalogue en temps réel dans cette conversation : n'invente jamais prix, stock, note ou lien direct. Pour chaque donnée inconnue, écris « À vérifier ». Les liens doivent rester https://boutique.orange.fr/. Si le besoin manque de précision, pose au maximum 2 questions et ne propose pas de produits. Réponds avec un ton chaleureux, concis et transparent.\n\nHistorique de la conversation :\n${state.messages.slice(-6).map(m => m.role + ': ' + m.text).join('\n')}\n\nNouveau message : ${userText}`;
  const schema = { reply: 'string', products: [{ name: 'string', type: 'string', price: 'string', rating: 'string', features: ['string'], availability: 'string', icon: 'string', url: 'string' }], preferenceToKeep: 'string' };
  try {
    const result = await window.creativeBoard.llm.ask({ prompt, system: 'Ne produis que des recommandations honnêtes. Le champ products doit être un tableau vide si tu dois d’abord poser une question.', schema });
    const answer = result && result.answer;
    let data = answer && answer.structuredContent ? answer.structuredContent : answer;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch (_) { data = { reply: data, products: [] }; } }
    if (!data || typeof data !== 'object') throw new Error('réponse vide');
    const reply = escapeText(data.reply || data.text) || 'Je n’ai pas pu formuler une réponse. Pouvez-vous préciser votre besoin ?';
    const products = Array.isArray(data.products) ? data.products.slice(0, 3) : [];
    if (data.preferenceToKeep) state.preferences = escapeText(data.preferenceToKeep);
    addMessage('assistant', reply, products); renderHistory();
  } catch (error) {
    const reason = String(error && error.message || error);
    const text = reason.includes('budget_exhausted') ? 'La limite quotidienne de questions IA est atteinte. Elle se réinitialisera demain ; vous pouvez consulter votre historique en attendant.' : 'Le conseiller est momentanément indisponible. Vérifiez que le modèle IA est configuré, puis réessayez.';
    addMessage('assistant', text, []);
  }
}
async function send(text) {
  text = escapeText(text); if (!text) return;
  addMessage('user', text); $('#messageInput').value = ''; $('#messageInput').style.height = 'auto'; $('#thinking').hidden = false;
  await askAdvisor(text); $('#thinking').hidden = true;
}
function showView(id) {
  ['advisorView', 'historyView'].forEach(view => { $('#' + view).hidden = view !== id; });
  document.querySelectorAll('.tab').forEach(tab => { const active = tab.dataset.view === id; tab.classList.toggle('active', active); if (active) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current'); });
  if (id === 'historyView') renderHistory();
}
loadState(); renderConversation(); renderHistory();
$('#composer').addEventListener('submit', e => { e.preventDefault(); send($('#messageInput').value); });
$('#messageInput').addEventListener('input', e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 110) + 'px'; });
document.querySelectorAll('.suggestion').forEach(button => button.addEventListener('click', () => send(button.dataset.prompt)));
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => showView(tab.dataset.view)));
$('#clearChat').addEventListener('click', () => { state.messages = []; saveState(); renderConversation(); $('#messageInput').focus(); });
