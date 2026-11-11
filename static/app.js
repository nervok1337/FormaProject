"use strict";

const form = document.querySelector("#business-form");
const founders = document.querySelector("#founders");
const errorBox = document.querySelector("#form-error");
const resultPanel = document.querySelector("#result-panel");
const resultView = document.querySelector("#recommendation");
let lastResult = null;
let lastProfile = null;
let pending = false;

const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[character]));
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;

function navigate() {
  const selected = ["pick", "compare", "about"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "pick";
  document.querySelectorAll(".view").forEach(view => { view.hidden = view.id !== selected; });
  document.querySelectorAll(".nav-link").forEach(link => {
    const active = link.hash === `#${selected}`;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  document.title = `${{pick:"Форма — начало вашего бизнеса", compare:"Сравнение форм бизнеса — Форма", about:"Как работает подбор — Форма"}[selected]}`;
  window.scrollTo({top: 0, behavior: "instant"});
}
window.addEventListener("hashchange", navigate);
navigate();

function getProfile() {
  const values = Object.fromEntries(new FormData(form));
  values.founders = Number(values.founders);
  return values;
}

function syncStepper() {
  document.querySelector("#minus").disabled = Number(founders.value) <= 1;
  document.querySelector("#plus").disabled = Number(founders.value) >= 10000;
}

function markStale() {
  errorBox.hidden = true;
  syncStepper();
  if (!lastResult) return;
  const stale = JSON.stringify(getProfile()) !== lastProfile;
  const notice = document.querySelector("#stale-notice");
  if (notice) notice.hidden = !stale;
  document.querySelector("#download-result").disabled = stale;
}

form.addEventListener("input", markStale);
form.addEventListener("change", markStale);
document.querySelector("#minus").addEventListener("click", () => {founders.value = Math.max(1, (Number(founders.value) || 1) - 1); markStale();});
document.querySelector("#plus").addEventListener("click", () => {founders.value = Math.min(10000, (Number(founders.value) || 1) + 1); markStale();});
syncStepper();

function renderResult(result) {
  document.querySelector("#empty-state").hidden = true;
  resultView.hidden = false;
  const reasons = result.reasons.map(reason => `<li>${icon("check")}<span>${escapeHTML(reason)}</span></li>`).join("");
  const benefits = result.benefits.map(benefit => `<li>${icon("check")}<span>${escapeHTML(benefit)}</span></li>`).join("");
  const alternatives = result.alternatives.map(alternative => `<div class="alternative"><strong>${escapeHTML(alternative.name)}</strong><small>${alternative.available ? "можно рассмотреть" : "не соответствует запросу"}</small><p>${escapeHTML(alternative.note)}</p></div>`).join("");
  resultView.innerHTML = `<div class="result-badge">${icon("check")} Рекомендуем для вашей идеи</div>
    <p id="stale-notice" class="stale-notice" hidden>Параметры изменились. Нажмите «Подобрать форму», чтобы обновить результат.</p>
    <h2 class="result-name">${escapeHTML(result.name)}</h2><h3 class="result-title">${escapeHTML(result.title)}</h3>
    <p class="result-description">${escapeHTML(result.description)}</p>
    <div class="result-metrics"><div><span>Уставный капитал</span><strong>${escapeHTML(result.capital)}</strong></div><div><span>Владельцы</span><strong>${escapeHTML(result.founders)}</strong></div></div>
    <h3 class="result-section-title">Почему эта форма подходит</h3><ul class="reason-list">${reasons}</ul>
    <div class="result-caution"><strong>Что важно учесть</strong>${escapeHTML(result.caution)}</div>
    <details class="result-details"><summary>Преимущества и налоги</summary><p>Основные преимущества</p><ul class="reason-list">${benefits}</ul><p><strong>Налоговые режимы.</strong> ${escapeHTML(result.taxes)}</p></details>
    <details class="result-details"><summary>Альтернативные варианты</summary>${alternatives}</details>
    <details class="result-details"><summary>Что делать дальше</summary><p>1. Выбрать ОКВЭД и проверить лицензии и ограничения деятельности.<br>2. Уточнить налоговый режим, расходы и обязательные платежи.<br>3. Согласовать доли, управление и документы с партнёрами.<br>4. Подготовить заявление на регистрацию; для АО — также документы по акциям.</p><p>${escapeHTML(result.notice)}</p><a href="https://www.nalog.gov.ru/rn77/yul/interest/reg_yl/register/" target="_blank" rel="noopener noreferrer" class="inline-link">Регистрация бизнеса на сайте ФНС ↗</a></details>
    <div class="result-actions"><button type="button" class="secondary-button" id="download-result">${icon("download")} Сохранить результат</button><a href="#compare" class="secondary-button">Сравнить формы ${icon("arrow")}</a></div>`;
  document.querySelector("#download-result").addEventListener("click", downloadResult);
  resultPanel.classList.remove("is-updated");
  void resultPanel.offsetWidth;
  resultPanel.classList.add("is-updated");
}

async function calculate() {
  if (pending || !form.reportValidity()) return;
  pending = true;
  errorBox.hidden = true;
  const button = document.querySelector("#submit-button");
  const example = document.querySelector("#example-button");
  button.disabled = true;
  example.disabled = true;
  button.querySelector("span").textContent = "Подбираем вашу форму…";
  resultPanel.classList.add("is-loading");
  resultPanel.setAttribute("aria-busy", "true");
  const profile = getProfile();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch("/api/recommend", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(profile), signal:controller.signal});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Не удалось подобрать форму");
    lastResult = data;
    lastProfile = JSON.stringify(profile);
    renderResult(data);
    markStale();
    if (window.innerWidth <= 760) resultPanel.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block:"start"});
  } catch (error) {
    errorBox.textContent = error.name === "AbortError" ? "Сервер не ответил вовремя. Попробуйте ещё раз." : error.message === "Failed to fetch" ? "Нет связи с приложением. Убедитесь, что Python-сервер запущен." : error.message;
    errorBox.hidden = false;
  } finally {
    clearTimeout(timeout);
    pending = false;
    button.disabled = false;
    example.disabled = false;
    button.querySelector("span").textContent = "Подобрать форму";
    resultPanel.classList.remove("is-loading");
    resultPanel.removeAttribute("aria-busy");
  }
}

form.addEventListener("submit", event => {event.preventDefault(); calculate();});
form.addEventListener("reset", event => {
  if (pending) {event.preventDefault(); return;}
  lastResult = null;
  lastProfile = null;
  resultView.hidden = true;
  resultView.innerHTML = "";
  document.querySelector("#empty-state").hidden = false;
  errorBox.hidden = true;
  setTimeout(syncStepper, 0);
});

document.querySelector("#example-button").addEventListener("click", () => {
  if (pending) return;
  form.elements.activity.value = "it";
  form.querySelector('[name="scale"][value="small"]').checked = true;
  founders.value = 2;
  form.elements.investment.value = "partners";
  form.querySelector('[name="risk"][value="limited"]').checked = true;
  syncStepper();
  calculate();
});

function downloadResult() {
  if (!lastResult || JSON.stringify(getProfile()) !== lastProfile) return;
  const result = lastResult;
  const profile = Object.entries(result.profile).map(([label,value]) => `${label}: ${value}`).join("\n");
  const alternatives = result.alternatives.map(item => `${item.name}: ${item.note}`).join("\n");
  const text = `ФОРМА — РЕКОМЕНДАЦИЯ ДЛЯ ВАШЕГО БИЗНЕСА\n\n${profile}\n\nРекомендуем: ${result.name} — ${result.title}\n${result.description}\n\nУставный капитал: ${result.capital}\nВладельцы: ${result.founders}\n\nПочему подходит:\n${result.reasons.map(reason => "• " + reason).join("\n")}\n\nПреимущества:\n${result.benefits.map(benefit => "• " + benefit).join("\n")}\n\nВажно: ${result.caution}\n\nНалоги: ${result.taxes}\n\nАльтернативы:\n${alternatives}\n\nСледующие шаги:\n1. Выбрать ОКВЭД, проверить лицензии и ограничения.\n2. Проверить условия налоговых режимов.\n3. Подготовить корпоративные документы и заявление.\n\n${result.notice}\n\nИсточники: ФНС России, 14-ФЗ (ст. 2, 7, 14), 208-ФЗ (ст. 2, 7, 26).\nhttps://www.nalog.gov.ru/rn77/ip/interest/reg_ip/\nhttps://www.nalog.gov.ru/rn77/yul/interest/reg_yl/register/\nhttps://www.consultant.ru/document/cons_doc_LAW_17819/\nhttps://www.consultant.ru/document/cons_doc_LAW_8743/\nБазовые сведения проверены 11.11.2026.\n`;
  const url = URL.createObjectURL(new Blob(["\ufeff" + text], {type:"text/plain;charset=utf-8"}));
  const link = document.createElement("a");
  link.href = url;
  link.download = `forma-${result.key}.txt`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const toast = document.querySelector("#toast");
  toast.textContent = "Рекомендация сохранена в текстовый файл";
  toast.hidden = false;
  setTimeout(() => {toast.hidden = true;}, 3500);
}
