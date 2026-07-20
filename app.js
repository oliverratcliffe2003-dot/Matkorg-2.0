(() => {
  'use strict';

  const recipes = window.MATKORG_RECIPES || [];
  const pricing = window.MATKORG_PRICES || { meta: {}, products: {} };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const storageKey = 'var-matkorg-v3';
  const defaultState = { cart: {}, have: {}, favorites: [] };
  let state = loadState();
  let selectedServings = Object.fromEntries(recipes.map(recipe => [recipe.id, recipe.servings || 2]));
  let activeFilter = 'alla';
  let modalRecipe = null;
  let toastTimer;

  const emailRecipients = {
    oliver: 'oliverratcliffe2003@gmail.com',
    isabella: 'isabellapanici@icloud.com'
  };

  function loadState() {
    try {
      return { ...defaultState, ...JSON.parse(localStorage.getItem(storageKey) || '{}') };
    } catch {
      return structuredClone(defaultState);
    }
  }

  function save() {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[character]));
  }

  function formatNumber(number) {
    return Number.isInteger(number)
      ? String(number)
      : String(Math.round(number * 100) / 100).replace('.', ',');
  }

  function formatAmount(amount, unit) {
    const number = Math.round(amount * 100) / 100;
    if (unit === 'ml' && number >= 1000) return `${formatNumber(number / 1000)} l`;
    if (unit === 'g' && number >= 1000) return `${formatNumber(number / 1000)} kg`;
    return `${formatNumber(number)} ${unit}`;
  }

  function formatSek(value, maximumFractionDigits = 1) {
    return new Intl.NumberFormat('sv-SE', {
      style: 'currency',
      currency: 'SEK',
      minimumFractionDigits: 0,
      maximumFractionDigits
    }).format(value);
  }

  function parseMinutes(time) {
    const match = String(time).match(/(\d+)/);
    return match ? Number(match[1]) : 99;
  }

  function servingsText(number) {
    return `${number} portion${number === 1 ? '' : 'er'}`;
  }

  function ingredientKey(ingredient) {
    return `${ingredient.name.toLocaleLowerCase('sv')}|${ingredient.unit}`;
  }

  function priceEntry(name) {
    return pricing.products?.[String(name).toLocaleLowerCase('sv')] || null;
  }

  function itemPriceInfo(item) {
    const entry = priceEntry(item.name);
    if (!entry) return null;
    if (entry.free) {
      return { entry, packages: 0, averageTotal: 0, chainTotals: {} };
    }
    const coverage = Number(entry.covers?.[item.unit]);
    if (!Number.isFinite(coverage) || coverage <= 0) return null;
    const packages = Math.max(1, Math.ceil((item.amount - 1e-9) / coverage));
    const chainTotals = Object.fromEntries(
      Object.entries(entry.chains || {}).map(([chain, price]) => [chain, packages * price])
    );
    return {
      entry,
      packages,
      averageTotal: packages * entry.average,
      chainTotals
    };
  }

  function priceLine(item) {
    const info = itemPriceInfo(item);
    if (!info) return '<small class="price-missing">Pris saknas</small>';
    if (info.entry.free) return '<small class="price-free">Kranvatten · 0 kr</small>';

    const chains = Object.entries(pricing.meta?.chains || {}).map(([key, label]) => {
      const packagePrice = info.entry.chains?.[key];
      return `<span><b>${escapeHtml(label)}</b>${formatSek(packagePrice)} / ${escapeHtml(info.entry.label)}</span>`;
    }).join('');

    const totalText = info.packages > 1
      ? `${info.packages} förp. · cirka ${formatSek(info.averageTotal)}`
      : `cirka ${formatSek(info.entry.average)} / ${info.entry.label}`;

    return `<div class="item-price">
      <strong>${escapeHtml(totalText)}</strong>
      <details class="price-details">
        <summary>Jämför kedjor</summary>
        <div class="chain-price-grid">${chains}</div>
        ${info.entry.note ? `<p>${escapeHtml(info.entry.note)}</p>` : ''}
      </details>
    </div>`;
  }

  function estimateItems(items, excludedHave = false) {
    const totals = { average: 0 };
    for (const chain of Object.keys(pricing.meta?.chains || {})) totals[chain] = 0;

    items.forEach(item => {
      if (excludedHave && state.have[item.key]) return;
      const info = itemPriceInfo(item);
      if (!info) return;
      totals.average += info.averageTotal;
      for (const chain of Object.keys(pricing.meta?.chains || {})) {
        totals[chain] += info.chainTotals[chain] || 0;
      }
    });
    return totals;
  }

  function estimateRecipe(recipe, portions) {
    const factor = portions / (recipe.servings || 2);
    const items = recipe.ingredients.map(ingredient => ({
      ...ingredient,
      amount: ingredient.amount * factor
    }));
    return estimateItems(items).average;
  }

  function aggregate() {
    const totals = new Map();
    Object.entries(state.cart).forEach(([id, portions]) => {
      const recipe = recipes.find(item => item.id === id);
      if (!recipe) return;
      const factor = portions / (recipe.servings || 2);
      recipe.ingredients.forEach(ingredient => {
        const key = ingredientKey(ingredient);
        const current = totals.get(key) || {
          name: ingredient.name,
          unit: ingredient.unit,
          amount: 0,
          key
        };
        current.amount += ingredient.amount * factor;
        totals.set(key, current);
      });
    });
    return [...totals.values()].sort((a, b) => a.name.localeCompare(b.name, 'sv'));
  }

  function renderRecipes() {
    const query = $('#search').value.trim().toLocaleLowerCase('sv');
    const favorites = new Set(state.favorites || []);
    const visible = recipes.filter(recipe => {
      const haystack = [
        recipe.name,
        recipe.category,
        recipe.description,
        ...recipe.ingredients.map(ingredient => ingredient.name)
      ].join(' ').toLocaleLowerCase('sv');
      const matchesQuery = !query || haystack.includes(query);
      let matchesFilter = true;
      if (activeFilter === 'favoriter') matchesFilter = favorites.has(recipe.id);
      else if (activeFilter === 'snabbt') matchesFilter = parseMinutes(recipe.time) <= 30;
      else if (activeFilter !== 'alla') matchesFilter = recipe.category === activeFilter;
      return matchesQuery && matchesFilter;
    });

    $('#recipeGrid').innerHTML = visible.map(cardTemplate).join('');
    $('#resultCount').textContent = `${visible.length} av ${recipes.length} recept`;
    $('#emptySearch').classList.toggle('hidden', visible.length !== 0);
  }

  function cardTemplate(recipe) {
    const portions = selectedServings[recipe.id] || recipe.servings || 2;
    const favorite = (state.favorites || []).includes(recipe.id);
    const estimate = estimateRecipe(recipe, portions);
    return `<article class="recipe-card">
      <div class="card-image">
        <img src="${escapeHtml(recipe.image)}" alt="${escapeHtml(recipe.imageAlt || recipe.name)}" loading="lazy">
        <button class="favorite ${favorite ? 'active' : ''}" data-favorite="${recipe.id}" type="button" aria-label="${favorite ? 'Ta bort från' : 'Lägg till i'} favoriter" aria-pressed="${favorite}">${favorite ? '♥' : '♡'}</button>
      </div>
      <div class="card-content">
        <div class="card-meta"><span>${escapeHtml(recipe.category)}</span><span>⏱ ${escapeHtml(recipe.time)}</span></div>
        <h3>${escapeHtml(recipe.name)}</h3>
        <p>${escapeHtml(recipe.description)}</p>
        <p class="card-price" id="price-${recipe.id}">Ungefär ${formatSek(estimate)} för ${portions} port.</p>
        <div class="card-controls">
          <div class="stepper" aria-label="Antal portioner">
            <button data-card-minus="${recipe.id}" type="button" aria-label="Minska portioner">−</button>
            <b id="servings-${recipe.id}">${portions} port.</b>
            <button data-card-plus="${recipe.id}" type="button" aria-label="Öka portioner">+</button>
          </div>
          <div class="card-actions">
            <button class="details-button" data-details="${recipe.id}" type="button">Recept</button>
            <button class="add-button" data-add="${recipe.id}" type="button">Lägg till</button>
          </div>
        </div>
      </div>
    </article>`;
  }

  function updateCard(id) {
    const servingsElement = $(`#servings-${CSS.escape(id)}`);
    const priceElement = $(`#price-${CSS.escape(id)}`);
    const recipe = recipes.find(item => item.id === id);
    const portions = selectedServings[id];
    if (servingsElement) servingsElement.textContent = `${portions} port.`;
    if (priceElement && recipe) priceElement.textContent = `Ungefär ${formatSek(estimateRecipe(recipe, portions))} för ${portions} port.`;
  }

  function addToCart(id, portions = selectedServings[id]) {
    state.cart[id] = (state.cart[id] || 0) + portions;
    save();
    renderCart();
    toast(`${recipes.find(recipe => recipe.id === id).name} lades till`);
  }

  function toggleFavorite(id) {
    const favorites = new Set(state.favorites || []);
    favorites.has(id) ? favorites.delete(id) : favorites.add(id);
    state.favorites = [...favorites];
    save();
    renderRecipes();
  }

  function renderBasketPriceSummary(items) {
    const container = $('#basketPriceSummary');
    if (!container) return;
    const activeItems = items.filter(item => !state.have[item.key]);
    if (!activeItems.length) {
      container.innerHTML = '<p>Alla varor är markerade som hemma.</p>';
      return;
    }
    const totals = estimateItems(items, true);
    const chainRows = Object.entries(pricing.meta?.chains || {}).map(([key, label]) =>
      `<div><span>${escapeHtml(label)}</span><b>${formatSek(totals[key], 0)}</b></div>`
    ).join('');
    container.innerHTML = `<div class="basket-average">
        <span>Uppskattat Göteborgssnitt</span>
        <strong>${formatSek(totals.average, 0)}</strong>
      </div>
      <div class="basket-chain-grid">${chainRows}</div>
      <small>Avser jämförbara normalprisförpackningar. Kampanjer, medlemspris och butiksskillnader är inte inräknade.</small>`;
  }

  function renderCart() {
    const entries = Object.entries(state.cart).filter(([, number]) => number > 0);
    const portions = entries.reduce((sum, [, number]) => sum + number, 0);
    $('#cartCount').textContent = portions;
    $('#emptyCart').classList.toggle('hidden', entries.length > 0);
    $('#cartContent').classList.toggle('hidden', entries.length === 0);

    $('#cartMeals').innerHTML = entries.map(([id, number]) => {
      const recipe = recipes.find(item => item.id === id);
      if (!recipe) return '';
      return `<div class="cart-row">
        <img src="${escapeHtml(recipe.image)}" alt="">
        <div><strong>${escapeHtml(recipe.name)}</strong><small>${servingsText(number)}</small></div>
        <div class="mini-actions">
          <div class="mini-stepper"><button data-cart-minus="${id}" type="button">−</button><b>${number}</b><button data-cart-plus="${id}" type="button">+</button></div>
          <button class="trash" data-remove="${id}" type="button" aria-label="Ta bort">🗑️</button>
        </div>
      </div>`;
    }).join('');

    const items = aggregate();
    $('#shoppingList').innerHTML = items.map(item => {
      const have = Boolean(state.have[item.key]);
      const safeKey = encodeURIComponent(item.key);
      return `<div class="shop-row ${have ? 'have' : ''}">
        <input id="have-${safeKey}" type="checkbox" data-have="${safeKey}" ${have ? 'checked' : ''}>
        <div class="shop-main">
          <label for="have-${safeKey}"><strong>${escapeHtml(item.name)}</strong><small>${formatAmount(item.amount, item.unit)}</small></label>
          ${priceLine(item)}
        </div>
        <span class="shop-status">${have ? 'Hemma' : 'Att köpa'}</span>
      </div>`;
    }).join('');

    $('#itemCount').textContent = `${items.filter(item => !state.have[item.key]).length} varor`;
    renderBasketPriceSummary(items);

    const disabled = entries.length === 0;
    ['emailOliver', 'emailIsabella', 'emailBoth', 'copyList', 'copyShareLink', 'printList'].forEach(id => {
      const button = $(`#${id}`);
      if (button) button.disabled = disabled;
    });
    if (disabled) setEmailState(false, 'Lägg till minst ett recept för att skicka listan.', '');
  }

  function openCart(scrollToEmail = false) {
    $('#cartOverlay').classList.add('open');
    $('#cartOverlay').setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      (scrollToEmail ? $('#emailSection') : $('[data-close-cart]')).focus?.();
      if (scrollToEmail) $('#emailSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }

  function closeCart() {
    $('#cartOverlay').classList.remove('open');
    $('#cartOverlay').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function openRecipe(id) {
    modalRecipe = recipes.find(recipe => recipe.id === id);
    if (!modalRecipe) return;
    $('#modalImage').src = modalRecipe.image;
    $('#modalImage').alt = modalRecipe.imageAlt || modalRecipe.name;
    $('#modalTag').textContent = `${modalRecipe.category} · ${modalRecipe.time}`;
    $('#modalTitle').textContent = modalRecipe.name;
    $('#modalDescription').textContent = modalRecipe.description;
    $('#modalServingLabel').textContent = `(${modalRecipe.servings} portioner)`;
    $('#modalIngredients').innerHTML = modalRecipe.ingredients.map(ingredient => {
      const info = itemPriceInfo(ingredient);
      const price = info && !info.entry.free ? `ca ${formatSek(info.entry.average)} / ${info.entry.label}` : (info ? '0 kr' : 'pris saknas');
      return `<li><span>${formatAmount(ingredient.amount, ingredient.unit)} ${escapeHtml(ingredient.name.toLocaleLowerCase('sv'))}</span><small>${escapeHtml(price)}</small></li>`;
    }).join('');
    $('#modalBasics').innerHTML = `<strong>Basvaror:</strong> ${escapeHtml(modalRecipe.basics)}`;
    $('#modalSteps').innerHTML = modalRecipe.steps.map(step => `<li>${escapeHtml(step)}</li>`).join('');
    $('#modalCredit').textContent = modalRecipe.credit || '';
    $('#modalAdd').textContent = `Lägg till ${modalRecipe.servings} portioner · ca ${formatSek(estimateRecipe(modalRecipe, modalRecipe.servings))}`;
    $('#recipeOverlay').classList.add('open');
    $('#recipeOverlay').setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeRecipe() {
    $('#recipeOverlay').classList.remove('open');
    $('#recipeOverlay').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function toast(message) {
    clearTimeout(toastTimer);
    $('#toast').textContent = message;
    $('#toast').classList.add('show');
    toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 1900);
  }

  function buildShareUrl() {
    if (!/^https?:$/.test(location.protocol)) return '';
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify({ cart: state.cart, have: state.have }))))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${location.origin}${location.pathname}#cart=${encoded}`;
  }

  function readSharedCart() {
    const match = location.hash.match(/^#cart=([A-Za-z0-9_-]+)$/);
    if (!match) return;
    try {
      const padded = match[1].replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((match[1].length + 3) % 4);
      const data = JSON.parse(decodeURIComponent(escape(atob(padded))));
      if (data.cart) {
        state.cart = data.cart;
        state.have = data.have || {};
        save();
      }
    } catch (error) {
      console.warn('Kunde inte läsa delad varukorg', error);
    }
  }

  function buildShoppingText() {
    const entries = Object.entries(state.cart).filter(([, number]) => number > 0);
    const items = aggregate();
    const active = items.filter(item => !state.have[item.key]);
    const home = items.filter(item => state.have[item.key]);
    const totals = estimateItems(items, true);
    const lines = [
      'VÅR MATKORG – INKÖPSLISTA',
      '',
      'MATRÄTTER',
      ...entries.map(([id, number]) => `• ${recipes.find(recipe => recipe.id === id)?.name || id}: ${servingsText(number)}`),
      '',
      'ATT KÖPA',
      ...active.map(item => {
        const info = itemPriceInfo(item);
        const price = info ? ` – ca ${formatSek(info.averageTotal)}` : '';
        return `☐ ${item.name}: ${formatAmount(item.amount, item.unit)}${price}`;
      }),
      '',
      `UPPSKATTAT GÖTEBORGSSNITT: ${formatSek(totals.average, 0)}`
    ];
    if (home.length) lines.push('', 'REDAN HEMMA', ...home.map(item => `✓ ${item.name}: ${formatAmount(item.amount, item.unit)}`));
    const url = buildShareUrl();
    if (url) lines.push('', 'Öppna samma varukorg:', url);
    lines.push('', 'Priserna är uppskattade normalpriser och kan skilja sig mellan butiker och kampanjer.');
    return lines.join('\n');
  }

  function setEmailState(sending, message = '', kind = '') {
    ['emailOliver', 'emailIsabella', 'emailBoth'].forEach(id => {
      const button = $(`#${id}`);
      if (button) button.disabled = sending || Object.keys(state.cart).length === 0;
    });
    const status = $('#sendStatus');
    status.textContent = message;
    status.className = `send-status ${kind}`.trim();
  }

  async function emailList(mode) {
    if (!Object.keys(state.cart).length) {
      toast('Lägg först ett recept i varukorgen');
      return;
    }
    if (!/^https?:$/.test(location.protocol)) {
      setEmailState(false, 'Direktmejl fungerar efter att sidan publicerats på GitHub Pages.', 'error');
      toast('Publicera sidan först');
      return;
    }
    let to = emailRecipients.oliver;
    let cc = '';
    let recipientName = 'Oliver';
    if (mode === 'isabella') {
      to = emailRecipients.isabella;
      recipientName = 'Isabella';
    }
    if (mode === 'both') {
      cc = emailRecipients.isabella;
      recipientName = 'Oliver och Isabella';
    }
    const formData = new FormData();
    formData.append('_subject', 'Vår Matkorg – inköpslista');
    formData.append('_template', 'box');
    formData.append('_captcha', 'false');
    if (cc) formData.append('_cc', cc);
    formData.append('Mottagare', recipientName);
    formData.append('Inköpslista', buildShoppingText());
    formData.append('Skickad från', location.href);
    setEmailState(true, `Skickar till ${recipientName}…`, 'sending');
    try {
      const response = await fetch(`https://formsubmit.co/ajax/${to}`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: formData
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || (result.success !== undefined && result.success !== true && result.success !== 'true')) {
        throw new Error(result.message || 'E-posttjänsten svarade med ett fel.');
      }
      setEmailState(false, `Skickat till ${recipientName}. Första gången kan ett aktiveringsmejl behöva godkännas.`, 'success');
      toast(`Skickat till ${recipientName}`);
    } catch (error) {
      console.error(error);
      setEmailState(false, 'Det gick inte att skicka. Kontrollera internetanslutningen och FormSubmit-aktiveringen.', 'error');
      toast('Kunde inte skicka mejlet');
    }
  }

  async function copyText(text, success) {
    try {
      await navigator.clipboard.writeText(text);
      toast(success);
    } catch {
      prompt('Kopiera texten:', text);
    }
  }

  document.addEventListener('click', event => {
    const target = event.target.closest('button,[data-close-cart],[data-close-recipe]');
    if (!target) return;
    if (target.id === 'openCart') openCart();
    else if (target.id === 'openEmail') openCart(true);
    else if (target.matches('[data-close-cart]')) closeCart();
    else if (target.matches('[data-close-recipe]')) closeRecipe();
    else if (target.dataset.favorite) toggleFavorite(target.dataset.favorite);
    else if (target.dataset.cardMinus) {
      selectedServings[target.dataset.cardMinus] = Math.max(1, selectedServings[target.dataset.cardMinus] - 1);
      updateCard(target.dataset.cardMinus);
    } else if (target.dataset.cardPlus) {
      selectedServings[target.dataset.cardPlus] = Math.min(20, selectedServings[target.dataset.cardPlus] + 1);
      updateCard(target.dataset.cardPlus);
    } else if (target.dataset.add) addToCart(target.dataset.add);
    else if (target.dataset.details) openRecipe(target.dataset.details);
    else if (target.dataset.cartMinus) {
      const id = target.dataset.cartMinus;
      state.cart[id] -= 1;
      if (state.cart[id] <= 0) delete state.cart[id];
      save(); renderCart();
    } else if (target.dataset.cartPlus) {
      const id = target.dataset.cartPlus;
      state.cart[id] = Math.min(40, state.cart[id] + 1);
      save(); renderCart();
    } else if (target.dataset.remove) {
      delete state.cart[target.dataset.remove];
      save(); renderCart();
    } else if (target.id === 'clearCart') {
      state.cart = {}; state.have = {}; save(); renderCart();
    } else if (target.id === 'modalAdd' && modalRecipe) {
      addToCart(modalRecipe.id, modalRecipe.servings); closeRecipe(); openCart();
    } else if (target.id === 'emailOliver') emailList('oliver');
    else if (target.id === 'emailIsabella') emailList('isabella');
    else if (target.id === 'emailBoth') emailList('both');
    else if (target.id === 'copyList') copyText(buildShoppingText(), 'Inköpslistan kopierades');
    else if (target.id === 'copyShareLink') {
      const url = buildShareUrl();
      url ? copyText(url, 'Delningslänken kopierades') : toast('Publicera sidan för en delningslänk');
    } else if (target.id === 'printList') window.print();
    else if (target.dataset.filter) {
      activeFilter = target.dataset.filter;
      $$('.filter').forEach(button => button.classList.toggle('active', button === target));
      renderRecipes();
    }
  });

  document.addEventListener('change', event => {
    if (event.target.dataset.have) {
      const key = decodeURIComponent(event.target.dataset.have);
      state.have[key] = event.target.checked;
      save();
      renderCart();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeCart();
      closeRecipe();
    }
  });

  $('#search').addEventListener('input', renderRecipes);
  const priceDate = $('#priceDate');
  if (priceDate && pricing.meta?.updated) {
    priceDate.textContent = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'long' }).format(new Date(`${pricing.meta.updated}T12:00:00`));
  }
  readSharedCart();
  renderRecipes();
  renderCart();

  window.__MATKORG_TEST__ = { recipes, pricing, aggregate, buildShoppingText, estimateItems };
})();
