(function () {
  'use strict';

  var STORAGE_KEY = 'nappeVocale.tasks.v1';

  var todoList = document.getElementById('todo-list');
  var doneList = document.getElementById('done-list');
  var emptyTodo = document.getElementById('empty-todo');
  var emptyDone = document.getElementById('empty-done');
  var todoCount = document.getElementById('todo-count');
  var doneCount = document.getElementById('done-count');
  var feedback = document.getElementById('feedback');
  var micBtn = document.getElementById('mic-btn');

  var tasks = loadTasks();
  var feedbackTimer = null;

  function loadTasks() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch (e) {
      return [];
    }
  }

  function saveTasks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (e) {
      // storage unavailable: keep working in memory
    }
  }

  function setFeedback(text) {
    if (feedbackTimer) { clearTimeout(feedbackTimer); feedbackTimer = null; }
    if (!text) {
      feedback.hidden = true;
      feedback.textContent = '';
      return;
    }
    feedback.hidden = false;
    feedback.textContent = text;
    feedbackTimer = setTimeout(function () {
      feedback.hidden = true;
      feedback.textContent = '';
    }, 6000);
  }

  function uid() {
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function checkIconSvg() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="var(--accent-ink)" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>';
  }

  function trashIconSvg() {
    return '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M6 7h12l-1 13.1a2 2 0 0 1-2 1.9H9a2 2 0 0 1-2-1.9L6 7Zm3-3h6l1 2h4v2H4V6h4l1-2Z"/></svg>';
  }

  function render() {
    var todos = tasks.filter(function (t) { return !t.done; })
      .sort(function (a, b) { return b.createdAt - a.createdAt; });
    var dones = tasks.filter(function (t) { return t.done; })
      .sort(function (a, b) { return (b.doneAt || 0) - (a.doneAt || 0); });

    todoCount.textContent = todos.length ? '(' + todos.length + ')' : '';
    doneCount.textContent = dones.length ? '(' + dones.length + ')' : '';

    emptyTodo.hidden = todos.length > 0;
    emptyDone.hidden = dones.length > 0;

    todoList.innerHTML = todos.map(renderItem).join('');
    doneList.innerHTML = dones.map(renderItem).join('');
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderItem(t) {
    var safe = escapeHtml(t.text);
    return '' +
      '<li class="task-item" data-id="' + t.id + '">' +
        '<button class="check-btn" type="button" aria-pressed="' + (t.done ? 'true' : 'false') + '" ' +
          'aria-label="' + (t.done ? 'Marquer comme à faire : ' : 'Marquer comme faite : ') + safe + '" data-action="toggle">' +
          '<span class="checkbox">' + checkIconSvg() + '</span>' +
          '<span class="task-text">' + safe + '</span>' +
        '</button>' +
        '<button class="delete-btn" type="button" aria-label="Supprimer la tâche : ' + safe + '" data-action="delete">' +
          trashIconSvg() +
        '</button>' +
      '</li>';
  }

  function onListClick(e) {
    var btn = e.target.closest('button[data-action]');
    if (!btn) return;
    var li = btn.closest('.task-item');
    if (!li) return;
    var id = li.getAttribute('data-id');
    var task = tasks.find(function (t) { return t.id === id; });
    if (!task) return;

    if (btn.dataset.action === 'toggle') {
      task.done = !task.done;
      task.doneAt = task.done ? Date.now() : null;
      saveTasks();
      render();
    } else if (btn.dataset.action === 'delete') {
      tasks = tasks.filter(function (t) { return t.id !== id; });
      saveTasks();
      render();
    }
  }

  todoList.addEventListener('click', onListClick);
  doneList.addEventListener('click', onListClick);

  // --- Voice handling -------------------------------------------------

  var CHECK_KEYWORDS = ['coche', 'coches', 'coché', 'cochee', 'cochée', 'cocher',
    'fait', 'faite', 'faits', 'faites'];

  var FILLER_WORDS = new Set([
    'coche', 'coches', 'coché', 'cochee', 'cochée', 'cocher',
    'fait', 'faite', 'faits', 'faites',
    'j', 'ai', 'jai', 'la', 'le', 'les', 'l', 'de', 'du', 'des',
    'un', 'une', 'a', 'au', 'aux', 'que', 'qu', 'est', 'ete', 'été',
    'tache', 'tâche', 'stp', 'voila', 'voilà'
  ]);

  function normalize(str) {
    return str.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9'\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokens(str) {
    var n = normalize(str);
    return n.length ? n.split(' ').filter(Boolean) : [];
  }

  function isCheckCommand(text) {
    var toks = tokens(text);
    return toks.some(function (t) { return CHECK_KEYWORDS.indexOf(t) !== -1; });
  }

  function extractRemainder(text) {
    var toks = tokens(text).filter(function (t) { return !FILLER_WORDS.has(t); });
    return toks.join(' ');
  }

  function similarity(a, b) {
    var ta = new Set(tokens(a));
    var tb = new Set(tokens(b));
    if (ta.size === 0 || tb.size === 0) return 0;
    var inter = 0;
    ta.forEach(function (t) { if (tb.has(t)) inter++; });
    var union = new Set([].concat(Array.from(ta), Array.from(tb))).size;
    var score = union ? inter / union : 0;
    var na = normalize(a), nb = normalize(b);
    if (na && nb && (na.indexOf(nb) !== -1 || nb.indexOf(na) !== -1)) {
      score += 0.3;
    }
    return score;
  }

  function findBestMatch(remainder) {
    if (!remainder) return null;
    var best = null;
    var bestScore = 0;
    tasks.forEach(function (t) {
      var s = similarity(remainder, t.text);
      if (!t.done) s += 0.05; // slight preference for not-done tasks
      if (s > bestScore) { bestScore = s; best = t; }
    });
    if (best && bestScore >= 0.32) return best;
    return null;
  }

  function handleHeard(text) {
    var trimmed = text.trim();
    if (!trimmed) {
      setFeedback("Je n'ai rien compris. Réessayez.");
      return;
    }

    if (isCheckCommand(trimmed)) {
      var remainder = extractRemainder(trimmed);
      if (!remainder) {
        setFeedback('Dites le nom de la tâche à cocher, par exemple « coche les courses ».');
        return;
      }
      var match = findBestMatch(remainder);
      if (match) {
        match.done = true;
        match.doneAt = Date.now();
        saveTasks();
        render();
        setFeedback('« ' + match.text + ' » marquée comme faite.');
      } else {
        setFeedback("Aucune tâche ressemblant à « " + remainder + " » n'a été trouvée.");
      }
      return;
    }

    var task = { id: uid(), text: trimmed, done: false, createdAt: Date.now(), doneAt: null };
    tasks.push(task);
    saveTasks();
    render();
    setFeedback('Tâche ajoutée : « ' + trimmed + ' »');
  }

  var listening = false;

  async function startListening() {
    if (listening) return;
    if (!window.creativeBoard || !creativeBoard.speech || !creativeBoard.speech.listen) {
      setFeedback("La reconnaissance vocale n'est pas disponible sur cet appareil.");
      return;
    }
    listening = true;
    micBtn.classList.add('is-listening');
    micBtn.setAttribute('aria-label', 'Écoute en cours');
    micBtn.disabled = true;
    setFeedback('Je vous écoute…');

    try {
      var said = await creativeBoard.speech.listen({ locale: 'fr-FR' });
      if (!said || !said.text) {
        setFeedback("Je n'ai rien entendu.");
      } else {
        handleHeard(said.text);
      }
    } catch (err) {
      setFeedback("La reconnaissance vocale n'a pas pu être utilisée sur cet appareil.");
    } finally {
      listening = false;
      micBtn.classList.remove('is-listening');
      micBtn.setAttribute('aria-label', 'Dicter une nouvelle tâche ou en cocher une');
      micBtn.disabled = false;
    }
  }

  micBtn.addEventListener('click', startListening);

  render();
})();
