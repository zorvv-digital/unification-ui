/* Unification website chat widget. Embed:
 *   <script src="https://<server>/api/v1/widget.js" data-widget-key="KEY" async></script>
 * No dependencies, no build step. */
(function () {
  var script = document.currentScript || document.querySelector('script[data-widget-key]');
  if (!script) return;
  var key = script.getAttribute('data-widget-key');
  var api = script.src.replace(/\/widget\.js.*$/, '') + '/widget/' + encodeURIComponent(key);
  var storageKey = 'unification-visitor-' + key;
  var leadKey = storageKey + '-lead';
  var token = localStorage.getItem(storageKey);
  var config = null;
  var shown = {};
  var events = null;

  var css =
    '#uw-button{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border-radius:50%;border:0;background:#111827;color:#fff;' +
    'box-shadow:0 8px 24px rgba(0,0,0,.2);cursor:pointer;font-size:24px;z-index:2147483000}' +
    '#uw-panel{position:fixed;right:20px;bottom:88px;width:340px;max-width:calc(100vw - 40px);height:460px;max-height:calc(100vh - 120px);' +
    'background:#fff;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 16px 40px rgba(0,0,0,.18);display:none;flex-direction:column;' +
    'overflow:hidden;font:14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;color:#111827;z-index:2147483000}' +
    '#uw-panel.uw-open{display:flex}' +
    '#uw-head{padding:14px 16px;background:#111827;color:#fff}#uw-head b{display:block;font-size:15px}#uw-head span{font-size:12px;opacity:.8}' +
    '#uw-log{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:6px;background:#f9fafb}' +
    '.uw-msg{max-width:80%;padding:8px 12px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word}' +
    '.uw-in{align-self:flex-end;background:#111827;color:#fff;border-bottom-right-radius:4px}' +
    '.uw-out{align-self:flex-start;background:#fff;border:1px solid #e5e7eb;border-bottom-left-radius:4px}' +
    '#uw-lead{padding:10px 12px;border-top:1px solid #e5e7eb;display:none;flex-direction:column;gap:6px;background:#fff}' +
    '#uw-lead.uw-open{display:flex}#uw-lead p{margin:0;font-size:12px;color:#6b7280}' +
    '#uw-panel input{border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;font:inherit;outline:none}' +
    '#uw-panel input:focus{border-color:#111827}' +
    '#uw-form{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #e5e7eb}#uw-form input{flex:1}' +
    '#uw-panel button.uw-primary{border:0;border-radius:8px;background:#111827;color:#fff;padding:8px 12px;font:inherit;cursor:pointer}' +
    '#uw-error{color:#b91c1c;font-size:12px;padding:0 12px 8px;display:none}';

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    (children || []).forEach(function (c) { node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return node;
  }

  function call(method, path, body) {
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['X-Visitor-Token'] = token;
    return fetch(api + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Something went wrong');
        return data;
      });
    });
  }

  var style = el('style');
  style.textContent = css;
  var log = el('div', { id: 'uw-log', 'aria-live': 'polite' });
  var input = el('input', { placeholder: 'Type your message…', 'aria-label': 'Chat message', maxlength: '2000' });
  var form = el('form', { id: 'uw-form' }, [input, el('button', { type: 'submit', class: 'uw-primary' }, ['Send'])]);
  var error = el('div', { id: 'uw-error', role: 'alert' });
  var lead = el('form', { id: 'uw-lead' });
  var title = el('b', {}, ['Chat with us']);
  var panel = el('div', { id: 'uw-panel', role: 'dialog', 'aria-label': 'Chat' }, [
    el('div', { id: 'uw-head' }, [title, el('span', {}, ['We usually reply in a few minutes'])]), log, lead, error, form,
  ]);
  var button = el('button', { id: 'uw-button', 'aria-label': 'Open chat', type: 'button' }, ['💬']);

  function showError(message) {
    error.textContent = message || '';
    error.style.display = message ? 'block' : 'none';
  }

  function add(message) {
    if (message.id && shown[message.id]) return;
    if (message.id) shown[message.id] = true;
    log.appendChild(el('div', { class: 'uw-msg ' + (message.direction === 'inbound' ? 'uw-in' : 'uw-out') }, [message.content]));
    log.scrollTop = log.scrollHeight;
  }

  function listen() {
    if (events || !token) return;
    events = new EventSource(api + '/events?token=' + encodeURIComponent(token));
    events.addEventListener('message.created', function (e) { add(JSON.parse(e.data)); });
  }

  function showLeadForm() {
    if (!config || !config.lead_fields.length || localStorage.getItem(leadKey) || lead.classList.contains('uw-open')) return;
    var labels = { name: 'Your name', email: 'Email', phone: 'Phone' };
    lead.innerHTML = '';
    lead.appendChild(el('p', {}, ['Leave your details so we can get back to you:']));
    config.lead_fields.forEach(function (field) {
      lead.appendChild(el('input', { name: field, placeholder: labels[field], 'aria-label': labels[field], type: field === 'email' ? 'email' : 'text' }));
    });
    lead.appendChild(el('button', { type: 'submit', class: 'uw-primary' }, ['Save details']));
    lead.classList.add('uw-open');
  }

  lead.addEventListener('submit', function (e) {
    e.preventDefault();
    var body = {};
    Array.prototype.forEach.call(lead.querySelectorAll('input'), function (i) { if (i.value.trim()) body[i.name] = i.value.trim(); });
    call('POST', '/lead', body).then(function () {
      localStorage.setItem(leadKey, '1');
      lead.classList.remove('uw-open');
      showError('');
      add({ direction: 'outbound', content: 'Thanks, we have your details!' });
    }).catch(function (err) { showError(err.message); });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var content = input.value.trim();
    if (!content) return;
    var ready = token ? Promise.resolve() : call('POST', '/sessions').then(function (s) {
      token = s.visitor_token;
      localStorage.setItem(storageKey, token);
      listen();
    });
    ready.then(function () { return call('POST', '/messages', { content: content }); }).then(function (message) {
      input.value = '';
      showError('');
      add(message);
      showLeadForm();
    }).catch(function (err) { showError(err.message); });
  });

  button.addEventListener('click', function () {
    panel.classList.toggle('uw-open');
    if (panel.classList.contains('uw-open')) input.focus();
  });

  function start() {
    document.head.appendChild(style);
    document.body.appendChild(panel);
    document.body.appendChild(button);
    call('GET', '/config').then(function (c) {
      config = c;
      title.textContent = c.business_name;
      add({ direction: 'outbound', content: c.greeting });
      if (!token) return;
      return call('GET', '/messages').then(function (history) {
        history.forEach(add);
        if (history.length) showLeadForm();
        listen();
      }).catch(function () {
        // the saved session belongs to an old widget (e.g. the demo was reset): start fresh
        token = null;
        localStorage.removeItem(storageKey);
        localStorage.removeItem(leadKey);
      });
    }).catch(function (err) { showError(err.message); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
