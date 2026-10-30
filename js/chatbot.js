import { askAssistant } from './traffic.js';
const history = [];
let activeLocation = null;
export function setChatLocation(location) { activeLocation = location; }
export function bindChat({ panel, openButton, mobileButton, closeButton, form, input, messages }) {
  const open = () => { panel.classList.add('open'); panel.setAttribute('aria-hidden', 'false'); setTimeout(() => input.focus(), 150); };
  const close = () => { panel.classList.remove('open'); panel.setAttribute('aria-hidden', 'true'); };
  openButton.addEventListener('click', open); mobileButton.addEventListener('click', open); closeButton.addEventListener('click', close);
  messages.addEventListener('click', event => { const button = event.target.closest('.suggestion'); if (button) { input.value = button.textContent; form.requestSubmit(); } });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 90)}px`; });
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', async event => {
    event.preventDefault(); const message = input.value.trim(); if (!message) return;
    input.value = ''; input.style.height = 'auto'; messages.querySelector('.chat-welcome')?.remove(); addMessage(messages, 'user', message); history.push({ role: 'user', content: message });
    const pending = addMessage(messages, 'assistant', 'Consultando información de tráfico…', true); form.querySelector('button').disabled = true;
    try { const result = await askAssistant(message, activeLocation); pending.textContent = result.answer; if (result.dataNote) { const note = document.createElement('small'); note.textContent = result.dataNote; pending.append(note); } history.push({ role: 'assistant', content: result.answer }); }
    catch (error) { pending.textContent = error.message; }
    finally { pending.classList.remove('loading-pulse'); form.querySelector('button').disabled = false; messages.scrollTop = messages.scrollHeight; }
  });
}
function addMessage(container, role, content, pending = false) { const node = document.createElement('div'); node.className = `message ${role}${pending ? ' loading-pulse' : ''}`; node.textContent = content; container.append(node); container.scrollTop = container.scrollHeight; return node; }

