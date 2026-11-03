// Offerte Agenti — Supabase Cloud & Plus 2000 Integration
let AGENTS = [];
let agentById = {};
let hierarchy = {};
let products = [], clients = [], dataMeta = {}, items = [], catalogLimit = 80;
let companyProfile = {
  companyName: 'Climawell',
  displayName: 'Climawell',
  vatNumber: '04732490489',
  taxCode: '04732490489',
  address: 'Via delle Tre Pietre 2/C',
  postalCode: '50149',
  city: 'Firenze',
  province: 'FI',
  country: 'Italia',
  email: 'info@climawell.it',
  pec: '',
  phone: '055-4289074',
  website: 'www.climawell.it',
  sdiCode: '0000000',
  iban: '',
  logoFileName: '',
  footerText: '',
  legalNotes: '',
  currency: 'EUR',
  defaultVat: 22,
  offerValidityDays: 30,
  ordersEmail: 'info@climawell.it'
};

let documentType = new URLSearchParams(location.search).get('type') === 'order' ? 'order' : 'offer';
const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const num = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = value => String(value ?? '').trim();
const normalized = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const toNumber = value => {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const decimal = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const n = Number(decimal);
  return Number.isFinite(n) ? n : 0;
};
const lineDiscountMultiplier = item => {
  const ds = item.discounts || [0, 0, 0, 0];
  const baseMult = ds.reduce((m, d) => m * (1 - (Number(d) || 0) / 100), 1);
  const extra = (Number(item.extraDiscount) || 0) / 100;
  return baseMult * (1 - extra);
};

const effectiveDiscount = (itemOrDs, extra = 0) => {
  if (itemOrDs && typeof itemOrDs === 'object' && !Array.isArray(itemOrDs)) {
    return 100 * (1 - lineDiscountMultiplier(itemOrDs));
  }
  const ds = Array.isArray(itemOrDs) ? itemOrDs : [];
  const base = ds.reduce((m, d) => m * (1 - (Number(d) || 0) / 100), 1);
  return 100 * (1 - (base * (1 - (Number(extra) || 0) / 100)));
};

const lineNet = item => (Number(item.product?.price) || 0) * (Number(item.qty) || 0) * lineDiscountMultiplier(item) * (1 + (Number(item.markup) || 0) / 100);

const discountLabel = item => {
  const parts = (item.discounts || []).map(d => Number(d) ? `${num.format(d)}%` : null).filter(Boolean);
  if (Number(item.extraDiscount)) parts.push(`${num.format(item.extraDiscount)}% extra`);
  if (Number(item.markup)) parts.push(`+${num.format(item.markup)}% ric.`);
  return parts.join(' + ') || '0%';
};

let currentUser = null;

function normalizeAgentCode(val) {
  if (!val) return '';
  const s = String(val).trim().toUpperCase();
  const m = s.match(/(?:AG|AGENTE)?\s*0*(\d+)/i);
  if (m) {
    const n = parseInt(m[1], 10);
    return `AG${n < 10 ? '0' + n : n}`;
  }
  return s;
}

async function checkUserSession() {
  try {
    const res = await fetch('/api/session', { headers: { accept: 'application/json' }, cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data && data.user) {
        currentUser = data.user;
        try { localStorage.setItem('oa_session_user', JSON.stringify(currentUser)); } catch {}
        return currentUser;
      }
    }
  } catch {}
  try {
    const cached = localStorage.getItem('oa_session_user');
    if (cached) currentUser = JSON.parse(cached);
  } catch {}
  return currentUser;
}

const currentRole = () => {
  if (currentUser && currentUser.role === 'agent') {
    return normalizeAgentCode(currentUser.agentCode) || 'AG01';
  }
  return $('roleSelect')?.value || (AGENTS[0]?.id || 'AG01');
};

const currentAgentId = () => currentRole().replace('AREA_', '');
const currentAgent = () => {
  const agId = currentAgentId();
  if (agentById[agId]) return agentById[agId];
  if (currentUser && currentUser.role === 'agent') {
    return {
      id: agId,
      name: currentUser.name || 'Agente',
      role: 'Agente',
      discountLimit: 40
    };
  }
  return AGENTS[0] || { id: 'AG01', name: 'Agente', role: 'Agente', discountLimit: 40 };
};

const maxAllowedDiscount = (product) => {
  const agLimit = currentAgent()?.discountLimit != null ? Number(currentAgent().discountLimit) : 40;
  const prodLimit = product.maxDiscount != null ? Number(product.maxDiscount) : 100;
  return Math.min(prodLimit, agLimit > 0 ? agLimit : 100);
};

const nowLabel = iso => iso ? new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)) : '—';

// IndexedDB Local Storage for Offline-First Capability
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('offerte-agenti', 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('data')) db.createObjectStore('data');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('data').objectStore('data').get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('data', 'readwrite');
    tx.objectStore('data').put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function loadData() {
  // Step 0: Lettura immediata da cache locale per reattività istantanea dell'interfaccia
  try {
    const [cachedAg, cachedComp, cachedData] = await Promise.all([
      dbGet('agents-data').catch(() => null),
      dbGet('company-profile').catch(() => null),
      dbGet('dataset').catch(() => null)
    ]);
    if (cachedAg && cachedAg.agents && cachedAg.agents.length) {
      AGENTS = cachedAg.agents;
      agentById = Object.fromEntries(AGENTS.map(a => [a.id, a]));
      hierarchy = cachedAg.hierarchy || hierarchy;
      roleOptions();
    }
    if (cachedComp) {
      companyProfile = { ...companyProfile, ...cachedComp };
      renderCompanyProfile();
    }
    if (cachedData && cachedData.clients && cachedData.clients.length) {
      clients = cachedData.clients;
    }
  } catch (_) {}

  // Step 1: Priorità assoluta a Supabase (Database ufficiale Climawell & Plus 2000)
  if (window.ClwData && window.ClwData.isConfigured()) {
    try {
      // Carica in parallelo Agenti, Clienti e Profilo Aziendale (veloci e leggeri)
      const [supAg, supCust, supComp] = await Promise.all([
        window.ClwData.getAgents(),
        window.ClwData.getCustomers(),
        window.ClwData.getCompany()
      ]);

      if (supAg && supAg.length > 0) {
        AGENTS = supAg.map(a => ({
          id: a.code,
          code: a.code,
          name: a.name,
          role: a.role === 'admin' ? 'Amministrazione' : (a.role === 'capo_area' ? 'Capo area' : 'Agente'),
          head: a.role === 'capo_area',
          discountLimit: Number(a.discount_limit) || 60,
          email: a.email || '',
          phone: a.phone || ''
        }));
        agentById = Object.fromEntries(AGENTS.map(a => [a.id, a]));
        hierarchy = {};
        await dbSet('agents-data', { agents: AGENTS, hierarchy }).catch(() => {});
        try { localStorage.setItem('oa_cached_agents', JSON.stringify(AGENTS)); } catch (_) {}
        roleOptions();
      }

      if (supCust && supCust.length > 0) {
        clients = supCust.map(c => ({
          id: c.code,
          code: c.code,
          name: c.name,
          agent: c.agent_code,
          agentId: c.agent_code,
          address: c.address || '',
          city: c.city || '',
          province: c.province || '',
          postalCode: c.postal_code || '',
          phone: c.phone || c.mobile || '',
          email: c.email || '',
          vat: c.vat_number || '',
          taxCode: c.tax_code || '',
          sdi: c.sdi_code || '0000000',
          payment: c.payment_method || 'Ri.Ba. 60 gg. f.m.',
          iban: c.iban || ''
        }));
      }

      if (supComp) {
        companyProfile = {
          ...companyProfile,
          companyName: supComp.company_name || 'Climawell',
          displayName: supComp.display_name || 'Climawell',
          vatNumber: supComp.vat_number || '',
          taxCode: supComp.tax_code || '',
          address: supComp.address || '',
          postalCode: supComp.postal_code || '',
          city: supComp.city || '',
          province: supComp.province || '',
          country: supComp.country || 'Italia',
          email: supComp.email || '',
          phone: supComp.phone || '',
          website: supComp.website || '',
          sdiCode: supComp.sdi_code || '0000000',
          footerText: supComp.footer_text || ''
        };
        await dbSet('company-profile', companyProfile).catch(() => {});
        renderCompanyProfile();
      }

      dataMeta = {
        generatedAt: new Date().toISOString(),
        source: 'Supabase PostgreSQL (Plus 2000)',
        articleCount: products.length,
        clientCount: clients.length,
        agentCount: AGENTS.length
      };
      await dbSet('dataset', { meta: dataMeta, articles: products, clients }).catch(() => {});
      return;
    } catch (supErr) {
      console.warn('[Supabase] Errore caricamento in offer-app, fallback su cache locale:', supErr);
    }
  }

  // Step 2: Caricamento da cache locale IndexedDB (offline)
  const [cachedData, cachedComp, cachedAg] = await Promise.all([
    dbGet('dataset').catch(() => null),
    dbGet('company-profile').catch(() => null),
    dbGet('agents-data').catch(() => null)
  ]);

  if (cachedData) {
    if (!products.length) products = cachedData.articles || [];
    if (!clients.length) clients = cachedData.clients || [];
    dataMeta = cachedData.meta || {};
  }
  if (cachedComp) companyProfile = { ...companyProfile, ...cachedComp };
  if (cachedAg && !AGENTS.length) {
    // Rispetta i filtri agenti attivi anche da cache
    AGENTS = (cachedAg.agents || []).filter(a => a.attivo !== false && a.active !== false);
    agentById = Object.fromEntries(AGENTS.map(a => [a.id, a]));
    hierarchy = cachedAg.hierarchy || hierarchy;
  }

  // Step 3: Fallback to seed-data if cache was completely empty
  if (!products.length || !clients.length || !AGENTS.length) {
    try {
      const res = await fetch('/seed-data.json');
      if (res.ok) {
        const seed = await res.json();
        if (!products.length) products = seed.articles || [];
        if (!clients.length) clients = seed.clients || [];
        if (!AGENTS.length && seed.agents) {
          AGENTS = seed.agents;
          hierarchy = seed.hierarchy || hierarchy;
        }
        if (seed.company && !companyProfile.companyName) {
          companyProfile = { ...companyProfile, ...seed.company };
        }
        dataMeta = seed.meta || dataMeta;
      }
    } catch (e) {}
  }

  // Final indexing
  agentById = Object.fromEntries(AGENTS.map(a => [a.id, a]));
}

async function loadCompanyProfile() {
  await loadData();
  renderCompanyProfile();
}

function companyAddressLine() {
  return [companyProfile.address, [companyProfile.postalCode, companyProfile.city, companyProfile.province].filter(Boolean).join(' ')].filter(Boolean).join(' - ');
}

function companyContactLine() {
  return [
    [companyProfile.phone && `Tel. ${companyProfile.phone}`, companyProfile.vatNumber && `P. IVA ${String(companyProfile.vatNumber).replace(/^"|"$/g, '')}`].filter(Boolean).join(' · '),
    companyProfile.email
  ].filter(Boolean).join(' · ');
}

function renderCompanyProfile() {
  $('companyName').textContent = companyProfile.companyName || companyProfile.displayName || 'Climawell';
  $('companyAddress').textContent = companyAddressLine() || 'Via delle Tre Pietre 2/C - 50149 Firenze (FI)';
  $('companyContacts').textContent = companyContactLine() || 'Tel. 055-4289074 · P. IVA 04732490489 · info@climawell.it';
  const validity = `${Number(companyProfile.offerValidityDays) || 30} giorni`;
  if ([...$('validity').options].some(o => o.value === validity)) $('validity').value = validity;
}

function roleOptions() {
  const user = currentUser;
  const userRole = user?.role || (user ? 'agent' : 'admin');
  const userAgentCode = normalizeAgentCode(user?.agentCode || '');
  const userSwitch = document.querySelector('.user-switch');

  // 1. SE L'UTENTE È UN AGENTE: NASCONDE IL MENU E BLOCCA LA VISTA OPERATIVA SULL'AGENTE STESSO!
  if (user && userRole === 'agent') {
    let myAgent = AGENTS.find(a => normalizeAgentCode(a.id) === userAgentCode || normalizeAgentCode(a.code) === userAgentCode);
    if (!myAgent && user.name) {
      myAgent = AGENTS.find(a => (a.name || '').toLowerCase() === user.name.toLowerCase());
    }
    const myId = myAgent?.id || userAgentCode || 'AG01';
    const myName = myAgent?.name || user.name || 'Agente';

    $('roleSelect').innerHTML = `<option value="${myId}">${myId.replace('AG', 'Agente ')} · ${esc(myName)}</option>`;
    $('roleSelect').value = myId;
    $('roleSelect').style.display = 'none';

    if (userSwitch) {
      const label = userSwitch.querySelector('label');
      if (label) label.style.display = 'none';
      let badge = userSwitch.querySelector('.user-badge-fixed');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'user-badge-fixed';
        userSwitch.appendChild(badge);
      }
      badge.innerHTML = `👤 <strong>${esc(myName)}</strong> (${myId.replace('AG', 'Agente ')})`;
    }

    localStorage.setItem('offer-role', myId);

    if ($('assignedAgent')) {
      $('assignedAgent').innerHTML = `<option value="${myId}">${myId.replace('AG', 'Agente ')} · ${esc(myName)}</option>`;
      $('assignedAgent').value = myId;
      $('assignedAgent').disabled = true;
    }
    return;
  }

  // 2. SE L'UTENTE È UN CAPO AREA: VEDE SOLO SE STESSO E GLI AGENTI ASSEGNATI
  if (user && userRole === 'area_head') {
    const myId = userAgentCode || 'AG01';
    const myAgent = agentById[myId] || { id: myId, name: user.name || 'Capo area' };
    const subAgentIds = hierarchy[myId] || [];

    let html = `<option value="AREA_${myId}">Capo area · ${esc(myAgent.name)}</option>`;
    html += `<option value="${myId}">${myId.replace('AG', 'Agente ')} · ${esc(myAgent.name)} (I miei clienti)</option>`;
    subAgentIds.forEach(subId => {
      const subAg = agentById[subId];
      if (subAg) {
        html += `<option value="${subAg.id}">${subAg.id.replace('AG', 'Agente ')} · ${esc(subAg.name)}</option>`;
      }
    });

    $('roleSelect').innerHTML = html;
    $('roleSelect').style.display = '';

    if (userSwitch) {
      const label = userSwitch.querySelector('label');
      if (label) label.style.display = '';
      const badge = userSwitch.querySelector('.user-badge-fixed');
      if (badge) badge.remove();
    }

    const current = localStorage.getItem('offer-role');
    if (current && [...$('roleSelect').options].some(o => o.value === current)) {
      $('roleSelect').value = current;
    } else {
      $('roleSelect').value = `AREA_${myId}`;
    }

    if ($('assignedAgent')) {
      $('assignedAgent').disabled = false;
      let assignHtml = `<option value="${myId}">${myId.replace('AG', 'Agente ')} · ${esc(myAgent.name)}</option>`;
      subAgentIds.forEach(subId => {
        const subAg = agentById[subId];
        if (subAg) assignHtml += `<option value="${subAg.id}">${subAg.id.replace('AG', 'Agente ')} · ${esc(subAg.name)}</option>`;
      });
      $('assignedAgent').innerHTML = assignHtml;
    }
    return;
  }

  // 3. SE L'UTENTE È AMMINISTRATORE: VEDE TUTTI I CLIENTI E PUÒ SELEZIONARE QUALSIASI AGENTE
  const current = localStorage.getItem('offer-role') || 'ADMIN';
  const heads = AGENTS.filter(a => a.head || (hierarchy[a.id] && hierarchy[a.id].length > 0));

  let html = '<option value="ADMIN">Amministrazione · tutti i clienti</option>';
  heads.forEach(h => {
    html += `<option value="AREA_${h.id}">Capo area · ${esc(h.name)}</option>`;
  });
  html += AGENTS.map(a => {
    const label = a.id.startsWith('AG') ? a.id.replace('AG', 'Agente ') : `Agente ${a.id}`;
    return `<option value="${a.id}">${label} · ${esc(a.name)}</option>`;
  }).join('');

  $('roleSelect').innerHTML = html;
  $('roleSelect').style.display = '';

  if (userSwitch) {
    const label = userSwitch.querySelector('label');
    if (label) label.style.display = '';
    const badge = userSwitch.querySelector('.user-badge-fixed');
    if (badge) badge.remove();
  }

  if ([...$('roleSelect').options].some(o => o.value === current)) {
    $('roleSelect').value = current;
  } else {
    $('roleSelect').value = 'ADMIN';
  }

  if ($('assignedAgent')) {
    $('assignedAgent').disabled = false;
    $('assignedAgent').innerHTML = AGENTS.map(a => {
      const label = a.id.startsWith('AG') ? a.id.replace('AG', 'Agente ') : `Agente ${a.id}`;
      return `<option value="${a.id}">${label} · ${esc(a.name)}</option>`;
    }).join('');
  }
}

function visibleAgentIds() {
  const role = currentRole();
  if (role === 'ADMIN') return null;
  if (role.startsWith('AREA_')) {
    const id = currentAgentId();
    return new Set([id, ...(hierarchy[id] || [])]);
  }
  return new Set([role]);
}

function visibleClients() {
  const allowed = visibleAgentIds();
  if (!allowed) return clients;

  const allowedSet = new Set();
  allowed.forEach(id => {
    if (id) {
      const s = String(id).trim();
      allowedSet.add(s);
      allowedSet.add(normalizeAgentCode(s));
      const numOnly = s.replace(/\D/g, '');
      if (numOnly) allowedSet.add(numOnly);
    }
  });

  return clients.filter(c => {
    const agId = String(c.agentId || c.agent || c.agent_code || '').trim();
    const srcId = String(c.sourceAgent || '').trim();
    const agNorm = normalizeAgentCode(agId);
    const srcNorm = normalizeAgentCode(srcId);
    const agNum = agId.replace(/\D/g, '');
    const srcNum = srcId.replace(/\D/g, '');

    return allowedSet.has(agId) || allowedSet.has(agNorm) || (agNum && allowedSet.has(agNum))
        || allowedSet.has(srcId) || allowedSet.has(srcNorm) || (srcNum && allowedSet.has(srcNum));
  });
}

function findClient(id) {
  return clients.find(c => String(c.id) === String(id));
}

function customerData() {
  return findClient($('customerSelect').value) || { name: '', city: '', address: '', province: '', postalCode: '', id: '' };
}

function renderCustomers(preferred = '') {
  const current = preferred || $('customerSelect').value, role = currentRole(), visible = visibleClients();
  const filterText = ($('customerSearchInput')?.value || '').trim().toLowerCase();

  let filtered = visible;
  if (filterText) {
    filtered = visible.filter(c => {
      const code = String(c.id || c.code || '').toLowerCase();
      const name = String(c.name || '').toLowerCase();
      const city = String(c.city || '').toLowerCase();
      const tax = String(c.tax || c.vat || '').toLowerCase();
      return code.includes(filterText) || name.includes(filterText) || city.includes(filterText) || tax.includes(filterText);
    });
  }

  const badge = $('customerFilterBadge');
  const clearBtn = $('clearCustomerSearchBtn');
  if (filterText) {
    if (badge) {
      badge.textContent = `${filtered.length} di ${visible.length}`;
      badge.classList.remove('hidden');
    }
    if (clearBtn) clearBtn.classList.remove('hidden');
  } else {
    if (badge) badge.classList.add('hidden');
    if (clearBtn) clearBtn.classList.add('hidden');
  }

  const placeholderText = filterText 
    ? (filtered.length ? `-- Trovati ${filtered.length} clienti --` : '-- Nessun cliente trovato --')
    : 'Seleziona un cliente…';

  $('customerSelect').innerHTML = `<option value="">${placeholderText}</option>` + filtered.map(c => {
    const codeTag = c.id ? `[${esc(c.id)}] ` : '';
    const cityTag = c.city ? ` — ${esc(c.city)}` : '';
    const adminTag = role === 'ADMIN' ? (c.agentId !== 'UNASSIGNED' ? ` · ${esc(agentById[c.agentId]?.name || c.sourceAgent)}` : ' · non assegnato') : '';
    return `<option value="${esc(c.id)}">${codeTag}${esc(c.name)}${cityTag}${adminTag}</option>`;
  }).join('');

  if ([...$('customerSelect').options].some(o => o.value === String(current))) {
    $('customerSelect').value = String(current);
  } else if (filterText && filtered.length === 1) {
    // Se c'è una sola corrispondenza, selezionala all'istante
    $('customerSelect').value = String(filtered[0].id);
  }

  const agentRole = role.startsWith('AG');
  $('assignedAgent').disabled = agentRole;
  if (agentRole) $('assignedAgent').value = role;
  showCustomer();
}

function showCustomer() {
  const c = customerData();
  if (!c.name) {
    $('customerDetails').classList.add('hidden');
    return;
  }

  // Pre-imposta il pagamento concordato del cliente se presente in anagrafica
  if (c.payment) {
    const paySelect = $('payment');
    const existingOpt = [...paySelect.options].find(o => o.value.toLowerCase() === c.payment.toLowerCase() || o.text.toLowerCase() === c.payment.toLowerCase());
    if (existingOpt) {
      paySelect.value = existingOpt.value;
      $('customPaymentInput')?.classList.add('hidden');
    } else {
      paySelect.value = '__custom__';
      if ($('customPaymentInput')) {
        $('customPaymentInput').value = c.payment;
        $('customPaymentInput').classList.remove('hidden');
      }
    }
  }

  const extraBadges = [];
  if (c.payment) extraBadges.push(`Pagamento: ${c.payment}`);
  if (c.sdi) extraBadges.push(`SDI: ${c.sdi}`);
  if (c.iban) extraBadges.push(`IBAN: ${c.iban}`);
  if (c.bank) extraBadges.push(`Banca: ${c.bank}`);
  const extraSpan = extraBadges.length > 0 ? `<span>${esc(extraBadges.join(' · '))}</span>` : '';
  $('customerDetails').innerHTML = `<strong>${esc(c.name)}</strong><span>${esc([c.address, [c.postalCode, c.city, c.province].filter(Boolean).join(' ')].filter(Boolean).join(' · '))}</span><span>${esc([c.phone, c.mobile, c.email].filter(Boolean).join(' · ') || 'Contatti non disponibili')}</span>${extraSpan}`;
  $('customerDetails').classList.remove('hidden');
  persistOffer();
}

function unique(field, source = products) {
  return [...new Set(source.map(p => clean(p[field])).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it', { numeric: true }));
}

function fillSelect(id, label, values) {
  const old = $(id).value;
  $(id).innerHTML = `<option value="">${label}</option>` + values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  if (values.includes(old)) $(id).value = old;
}

function updateFilters(changed = '') {
  if (!changed) fillSelect('sectorFilter', 'Tutti i settori', unique('sector'));
  const sector = $('sectorFilter').value, bySector = sector ? products.filter(p => p.sector === sector) : products;
  fillSelect('macroFilter', 'Tutte le macrofamiglie', unique('macroFamily', bySector));
  const macro = $('macroFilter').value, byMacro = bySector.filter(p => !macro || p.macroFamily === macro);
  fillSelect('familyFilter', 'Tutte le famiglie', unique('family', byMacro));
  const family = $('familyFilter').value, byFamily = byMacro.filter(p => !family || p.family === family);
  fillSelect('brandFilter', 'Tutte le marche', unique('brand', byFamily));
}

function catalogMatches() {
  const f = { sector: $('sectorFilter').value, macroFamily: $('macroFilter').value, family: $('familyFilter').value, brand: $('brandFilter').value };
  return products.filter(p => Object.entries(f).every(([k, v]) => !v || p[k] === v));
}

function renderCatalog() {
  const matches = catalogMatches(), shown = matches.slice(0, catalogLimit);
  $('catalogGrid').innerHTML = shown.map(p => {
    let photoHtml;
    if (p.imageUrl && (p.imageUrl.startsWith('http://') || p.imageUrl.startsWith('https://'))) {
      photoHtml = `<img src="${esc(p.imageUrl)}" alt="${esc(p.description)}" loading="lazy" onerror="this.parentElement.innerHTML='<small>FOTO NON DISPONIBILE</small>'">`;
    } else if (p.imageRef) {
      photoHtml = `<small>${esc(p.imageRef.split('\\').pop())}</small>`;
    } else {
      photoHtml = '<small>FOTO NON DISPONIBILE</small>';
    }
    return `<button type="button" class="catalog-card" data-catalog-code="${esc(p.code)}"><div class="product-photo">${photoHtml}</div><div class="catalog-info"><strong>${esc(p.code)}</strong><span>${esc(p.description)}</span><small>${esc([p.brand, p.macroFamily, p.family].filter(Boolean).join(' · '))}</small><b>${euro.format(p.price)}</b></div></button>`;
  }).join('') || '<div class="empty-state">Nessun articolo con questi filtri</div>';
  $('loadMoreCatalog').classList.toggle('hidden', shown.length >= matches.length);
  $('loadMoreCatalog').textContent = `Mostra altri (${matches.length - shown.length})`;
  document.querySelectorAll('[data-catalog-code]').forEach(b => b.onclick = () => {
    addProduct(b.dataset.catalogCode);
    toast('Articolo aggiunto all’offerta');
  });
}

let remoteProductSearchTimer = null;

function renderProductButtons(list) {
  $('productResults').innerHTML = list.map(p => `<button class="product-result" data-code="${esc(p.code)}"><span><strong>${esc(p.description)}</strong><small>${esc(p.code)} · ${esc([p.brand, p.macroFamily, p.family].filter(Boolean).join(' · '))} · disp. ${num.format(p.stock)}</small></span><span class="result-price">${euro.format(p.price)}</span></button>`).join('') || '<div class="empty-state">Nessun articolo trovato</div>';
  $('productResults').classList.remove('hidden');
  document.querySelectorAll('.product-result').forEach(b => b.onclick = () => addProduct(b.dataset.code));
}

function sortProductResults(list, q) {
  return list.sort((a, b) => {
    const aCode = normalized(a.code);
    const bCode = normalized(b.code);
    if (aCode === q && bCode !== q) return -1;
    if (bCode === q && aCode !== q) return 1;
    if (aCode.startsWith(q) && !bCode.startsWith(q)) return -1;
    if (bCode.startsWith(q) && !aCode.startsWith(q)) return 1;
    return (Number(b.stock) || 0) - (Number(a.stock) || 0);
  });
}

function renderProducts(query = '') {
  const q = normalized(query);
  const rawFound = q ? products.filter(p => normalized([p.code, p.description, p.brand, p.group, p.sector, p.macroFamily, p.family].join(' ')).includes(q)) : products;
  const found = sortProductResults(rawFound, q).slice(0, 60);
  renderProductButtons(found);

  // Ricerca in tempo reale su Supabase per articoli oltre il blocco iniziale (es. MS230)
  if (q && q.length >= 2 && window.ClwData && window.ClwData.isConfigured()) {
    clearTimeout(remoteProductSearchTimer);
    remoteProductSearchTimer = setTimeout(async () => {
      try {
        const remote = await window.ClwData.getProducts({ search: query.trim(), limit: 30 });
        if (remote && remote.length) {
          let added = false;
          for (const rp of remote) {
            const formatted = {
              id: rp.code,
              code: rp.code,
              description: rp.description,
              brand: rp.brand || '',
              sector: rp.sector || '',
              macroFamily: rp.macro_family || '',
              family: rp.family || '',
              group: [rp.brand, rp.sector, rp.macro_family, rp.family].filter(Boolean).join(' · '),
              price: Number(rp.price) || 0,
              um: rp.um || 'PZ',
              stock: Number(rp.stock_qty) || 0,
              location: rp.primary_location || '',
              barcode: rp.barcode || '',
              vat: Number(rp.vat) || 22,
              maxDiscount: Number(rp.max_discount) || 60,
              imageUrl: rp.image_url || '',
              imageRef: rp.image_ref || '',
              image: rp.image_url || ''
            };
            const existingIdx = products.findIndex(p => p.code === rp.code);
            if (existingIdx >= 0) {
              products[existingIdx] = formatted;
            } else {
              products.push(formatted);
              added = true;
            }
          }
          const updated = products.filter(p => normalized([p.code, p.description, p.brand, p.group, p.sector, p.macroFamily, p.family].join(' ')).includes(q)).slice(0, 60);
          if (updated.length) renderProductButtons(updated);
        }
      } catch (e) {
        console.warn('Errore ricerca remota:', e);
      }
    }, 200);
  }
}

function addProduct(code) {
  const product = products.find(p => p.code === code);
  if (!product) return;
  const existingIdx = items.findIndex(i => i.product?.code === code);
  if (existingIdx >= 0) {
    items[existingIdx].qty += 1;
    const it = items.splice(existingIdx, 1)[0];
    items.unshift(it); // Porta l'articolo ri-selezionato in cima alla lista
  } else {
    items.unshift({ id: crypto.randomUUID(), product, qty: 1, discounts: [0, 0, 0, 0], extraDiscount: 0, markup: 0 }); // Inserisce in cima
  }
  $('productSearch').value = '';
  $('productResults').classList.add('hidden');
  renderOffer();
}

function totals() {
  const list = items.reduce((s, i) => s + (Number(i.product.price) || 0) * (Number(i.qty) || 0), 0);
  const net = items.reduce((s, i) => s + lineNet(i), 0);
  const vat = items.reduce((s, i) => s + lineNet(i) * (i.product.vat || 22) / 100, 0);
  return { list, net, vat, grand: net + vat };
}

function renderOffer() {
  $('emptyState').classList.toggle('hidden', items.length > 0);
  $('itemCount').textContent = `${items.length} ${items.length === 1 ? 'articolo' : 'articoli'}`;

  $('itemsList').innerHTML = items.map(it => {
    const eff = effectiveDiscount(it);
    const maxLimit = maxAllowedDiscount(it.product);
    const valid = eff <= maxLimit + 0.0001;

    return `<tr class="${valid ? '' : 'invalid-row'}"><td class="product-cell"><strong title="${esc(it.product.description)}">${esc(it.product.code)} · ${esc(it.product.description)}</strong><small>${esc([it.product.brand, it.product.macroFamily, it.product.family].filter(Boolean).join(' · '))} · Disp. ${num.format(it.product.stock)} · Max sc. ${maxLimit}% · IVA ${it.product.vat || 22}%</small></td><td class="col-qty"><span class="cell-label">Q.tà</span><input aria-label="Quantità" type="number" min="0.01" step="0.01" value="${it.qty}" data-id="${it.id}" data-field="qty"></td><td class="col-price"><span class="cell-label">Listino</span><input aria-label="Listino" class="readonly" value="${num.format(it.product.price)}" readonly></td>${it.discounts.map((d, n) => `<td class="col-sc"><span class="cell-label">Sc. ${n + 1}</span><input aria-label="Sconto ${n + 1}" type="number" min="0" max="100" step="0.1" value="${d}" data-id="${it.id}" data-discount="${n}"></td>`).join('')}<td class="col-extra"><span class="cell-label">Sc. Extra</span><input aria-label="Sconto Extra" type="number" min="-100" max="100" step="0.1" value="${it.extraDiscount || 0}" data-id="${it.id}" data-field="extraDiscount" class="extra-discount-input" title="Sconto Extra (Plus 2000) - accetta anche valori negativi"></td><td class="col-ric"><span class="cell-label">Ricarico</span><input aria-label="Ricarico" type="number" min="0" max="100" step="0.1" value="${it.markup}" data-id="${it.id}" data-field="markup"></td><td class="net-cell"><span class="cell-label">Netto</span><div class="net-val-wrap">${euro.format(lineNet(it))}<small class="${valid ? '' : 'bad'}">eq. ${num.format(eff)}%${valid ? '' : ' !'}</small></div></td><td class="col-remove"><button class="compact-remove" data-remove="${it.id}" aria-label="Rimuovi">×</button></td></tr>`;
  }).join('');

  document.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => {
    items = items.filter(i => i.id !== b.dataset.remove);
    renderOffer();
  });
  document.querySelectorAll('[data-field]').forEach(inp => inp.onchange = () => {
    const it = items.find(i => i.id === inp.dataset.id);
    if (it) {
      if (inp.dataset.field === 'extraDiscount') {
        it.extraDiscount = Math.max(-100, Math.min(100, Number(inp.value) || 0));
      } else {
        it[inp.dataset.field] = Math.max(0, Number(inp.value) || 0);
      }
    }
    renderOffer();
  });
  document.querySelectorAll('[data-discount]').forEach(inp => inp.onchange = () => {
    const it = items.find(i => i.id === inp.dataset.id);
    if (it) it.discounts[Number(inp.dataset.discount)] = Math.min(100, Math.max(0, Number(inp.value) || 0));
    renderOffer();
  });
  updateTotals();
  persistOffer();
}

function updateTotals() {
  const t = totals();
  const invalid = items.some(i => effectiveDiscount(i) > maxAllowedDiscount(i.product) + 0.0001);

  $('listTotal').textContent = euro.format(t.list);
  $('discountTotal').textContent = (t.net - t.list > 0 ? '+ ' : '') + euro.format(t.net - t.list);
  $('netTotal').textContent = euro.format(t.net);
  $('vatTotal').textContent = euro.format(t.vat);
  $('grandTotal').textContent = euro.format(t.grand);
  if ($('stickyGrandTotal')) {
    $('stickyGrandTotal').textContent = euro.format(t.grand);
  }
  const v = $('validationStatus');
  v.className = 'validation ' + (invalid ? 'bad' : items.length ? 'ok' : 'neutral');
  v.textContent = invalid ? 'Correggere gli sconti fuori dal limite autorizzato' : items.length ? 'Offerta pronta per invio, PDF ed Excel' : 'Inserisci almeno un articolo';
}

function currentPaymentValue() {
  const p = $('payment');
  if (!p) return '';
  if (p.value === '__custom__') {
    return $('customPaymentInput')?.value.trim() || 'Da concordare';
  }
  return p.value;
}

function persistOffer() {
  localStorage.setItem('offer-demo', JSON.stringify({
    items,
    customer: $('customerSelect').value,
    notes: $('notes').value,
    validity: $('validity').value,
    payment: currentPaymentValue(),
    shipping: $('shipping').value,
    role: currentRole()
  }));
}

let editingOriginOffer = '';

async function restoreOffer() {
  try {
    const params = new URLSearchParams(location.search);
    const targetDoc = params.get('revision') || params.get('edit') || editingOriginOffer;

    const d = JSON.parse(localStorage.getItem('offer-demo') || 'null');
    if (d && d.originOfferNumber) editingOriginOffer = d.originOfferNumber;
    if (d && Array.isArray(d.items) && d.items.length > 0) {
      items = d.items.map(i => {
        const existingProd = products.find(p => p.code === i.product?.code);
        return {
          product: existingProd || i.product || { code: 'N/A', description: 'Articolo', price: 0, vat: 22 },
          qty: Number(i.qty) || 1,
          discounts: i.discounts || [0, 0, 0, 0],
          extraDiscount: Number(i.extraDiscount || i.discount_extra || i.extra_discount) || 0,
          markup: Number(i.markup) || 0
        };
      });
    }

    // Se items è ancora vuoto e abbiamo un numero documento target, carichiamo le righe da Supabase!
    if (items.length === 0 && targetDoc && window.ClwData && typeof window.ClwData.getDocumentLines === 'function') {
      try {
        const supLines = await window.ClwData.getDocumentLines(targetDoc);
        if (supLines && supLines.length > 0) {
          items = supLines.map(l => {
            const existingProd = products.find(p => p.code === l.product_code);
            return {
              product: existingProd || {
                code: l.product_code,
                description: l.description,
                price: Number(l.list_price) || 0,
                vat: Number(l.vat) || 22,
                brand: l.brand || '',
                location: l.location || '',
                stock: 99
              },
              qty: Number(l.quantity) || 1,
              discounts: [
                Number(l.discount_1) || 0,
                Number(l.discount_2) || 0,
                Number(l.discount_3) || 0,
                Number(l.discount_4) || 0
              ],
              extraDiscount: Number(l.discount_extra || l.extra_discount || l.extraDiscount) || 0,
              markup: 0
            };
          });
        }
      } catch (err) {
        console.warn('[Supabase] Errore recupero righe in restoreOffer:', err);
      }
    }

    if (d) {
      if (d.role && [...$('roleSelect').options].some(o => o.value === d.role)) $('roleSelect').value = d.role;
      $('notes').value = d.notes || '';
      $('validity').value = d.validity || '30 giorni';
      if (d.payment) {
        const paySelect = $('payment');
        const existingOpt = [...paySelect.options].find(o => o.value.toLowerCase() === d.payment.toLowerCase() || o.text.toLowerCase() === d.payment.toLowerCase());
        if (existingOpt) {
          paySelect.value = existingOpt.value;
          $('customPaymentInput')?.classList.add('hidden');
        } else {
          paySelect.value = '__custom__';
          if ($('customPaymentInput')) {
            $('customPaymentInput').value = d.payment;
            $('customPaymentInput').classList.remove('hidden');
          }
        }
      }
      if (d.shipping) $('shipping').value = d.shipping;
      let targetClient = d.customer;
      if (d.customerName) {
        const match = visibleClients().find(c => (c.name && c.name.toLowerCase() === d.customerName.toLowerCase()) || String(c.id) === String(d.customer));
        if (match) targetClient = match.id;
      }
      renderCustomers(targetClient || '');
    }
  } catch (err) {
    console.warn('Errore restoreOffer:', err);
  }
}

function updateRoleView() {
  const role = currentRole(), agent = currentAgent();
  localStorage.setItem('offer-role', role);
  $('agentIdentity').textContent = role === 'ADMIN' ? 'Amministrazione' : role.startsWith('AREA_') ? `Capo area · ${agent.name}` : `${agent.id.replace('AG', 'Agente ')} · ${agent.name}`;
  const isAdmin = currentUser?.role === 'admin' || (role === 'ADMIN' && !currentUser);
  document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', !isAdmin));
  renderCustomers();
  persistOffer();
  $('offerCode').textContent = offerNumber();
}

function toast(message) {
  const t = $('toast');
  t.textContent = message;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2600);
}

function canExport(strict = false) {
  if (strict && !items.length) {
    toast('Inserisci almeno un articolo');
    return false;
  }
  const over = items.find(i => effectiveDiscount(i.discounts) > maxAllowedDiscount(i.product) + 0.0001 && (!i.extraDiscount || i.extraDiscount <= 0));
  if (over) {
    toast(`Correggi gli sconti base che superano il limite autorizzato su ${over.product.code}`);
    return false;
  }
  return true;
}

function offerNumber() {
  const role = currentAgentId();
  const storage = documentType === 'order' ? 'order-numbers' : 'offer-numbers';
  const saved = JSON.parse(localStorage.getItem(storage) || '{}');
  if (!saved[role]) {
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
    saved[role] = `${documentType === 'order' ? 'ORD' : 'OFF'}-${role}-${stamp}`;
    localStorage.setItem(storage, JSON.stringify(saved));
  }
  return saved[role];
}

function buildPrintOffer() {
  const c = customerData();
  const t = totals();
  const agent = currentAgent();
  const label = documentType === 'order' ? 'ORDINE' : 'OFFERTA';
  const compEmail = companyProfile.email || 'info@climawell.it';
  const gdprClause = `Informativa Privacy (Reg. UE 2016/679): I dati personali sono trattati per finalità contrattuali e precontrattuali ex art. 6(1)(b) GDPR. Per diritti (artt. 15-22 GDPR) consultare /privacy.html o scrivere a ${compEmail}.`;
  const baseLegal = esc(companyProfile.legalNotes || `I prezzi sono riservati al cliente intestatario e validi per il periodo indicato. L'${documentType === 'order' ? 'ordine' : 'offerta'} non costituisce conferma definitiva.`);
  
  const tableRows = items.length
    ? items.map(i => {
        const netUnit = i.qty ? (lineNet(i) / i.qty) : (i.product.price || 0);
        return `<tr>
          <td class="code">${esc(i.product.code)}</td>
          <td class="desc">${esc(i.product.description)}</td>
          <td class="num">${num.format(i.qty)}</td>
          <td class="num"><strong>${euro.format(netUnit)}</strong></td>
          <td class="num"><strong>${euro.format(lineNet(i))}</strong></td>
          <td class="num">${i.product.vat || 22}%</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="6" style="text-align:center; padding:12px; color:#64748b; font-style:italic;">(Nessun articolo inserito)</td></tr>`;

  $('printOffer').innerHTML = `<div class="print-sheet">
    <div class="print-parties">
      <div class="print-party">
        <label>AGENTE / AZIENDA</label>
        <strong class="party-name">${esc(companyProfile.companyName || companyProfile.displayName || 'Climawell')}</strong>
        <div class="party-details">
          ${esc(companyAddressLine())}<br>
          ${esc(companyContactLine())}<br>
          <strong>Agente:</strong> ${esc(agent.name || 'Amministrazione')}
        </div>
      </div>
      <div class="print-party">
        <label>SPETT.LE CLIENTE</label>
        <strong class="party-name">${esc(c.name || 'Cliente da selezionare')}</strong>
        <div class="party-details">
          ${esc([c.address, c.postalCode, c.city, c.province].filter(Boolean).join(' · ')) || 'Indirizzo non specificato'}<br>
          ${esc([c.vat ? 'P.IVA: ' + c.vat : '', c.taxCode ? 'C.F.: ' + c.taxCode : '', c.phone, c.email].filter(Boolean).join(' · '))}
        </div>
      </div>
    </div>
    <div class="print-title-row">
      <h1>${label}</h1>
      <strong>${offerNumber()}</strong>
    </div>
    <table class="print-commerce">
      <tr>
        <td><span>Data</span>${new Date().toLocaleDateString('it-IT')}</td>
        <td><span>Pagamento</span>${esc(currentPaymentValue())}</td>
        <td><span>Spedizione</span>${esc($('shipping').value)}</td>
        <td><span>Validità</span>${esc($('validity').value)}</td>
      </tr>
    </table>
    <table class="print-lines">
      <thead>
        <tr>
          <th class="code">Codice</th>
          <th class="desc">Descrizione</th>
          <th class="qty num">Q.tà</th>
          <th class="price num">Prezzo Netto</th>
          <th class="total num">Totale</th>
          <th class="vat num">IVA</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
    <div class="print-bottom">
      <div class="print-notes-dense">
        <strong>NOTE E CONDIZIONI</strong>
        <p>${esc($('notes').value || companyProfile.legalNotes || 'Prezzi IVA esclusa salvo diversa indicazione. Disponibilità e tempi di consegna da confermare.')}</p>
      </div>
      <div class="print-totals-dense">
        <div><span>Imponibile</span><strong>${euro.format(t.net)}</strong></div>
        <div><span>IVA</span><strong>${euro.format(t.vat)}</strong></div>
        <div><span>TOTALE ${documentType === 'order' ? 'ORDINE' : 'OFFERTA'}</span><strong>${euro.format(t.grand)}</strong></div>
      </div>
    </div>
    <div class="print-legal-dense">
      <div style="margin-bottom: 1.5mm;">${baseLegal}</div>
      <div style="font-size: 6.2pt; color: #475569; line-height: 1.3;">${gdprClause}</div>
    </div>
  </div>`;
}

function exportExcel() {
  if (!canExport(false)) return;
  const c = customerData(), t = totals(), agent = currentAgent();
  const label = documentType === 'order' ? 'ORDINE' : 'OFFERTA';
  const numDoc = offerNumber();

  if (typeof XLSX !== 'undefined') {
    const data = [
      [`${label} CLIENTE`, numDoc],
      ['Data', new Date().toLocaleDateString('it-IT')],
      ['Agente', `${agent.name || ''} (${agent.id || ''})`],
      ['Azienda', companyProfile.companyName || companyProfile.displayName || 'Climawell'],
      ['Sede / Contatti', [companyAddressLine(), companyContactLine()].filter(Boolean).join(' - ')],
      ['Cliente', c.name || 'Cliente da selezionare'],
      ['Indirizzo', [c.address, c.postalCode, c.city, c.province].filter(Boolean).join(' ')],
      ['P.IVA / CF', c.vat || c.taxCode || ''],
      ['Condizione Pagamento', currentPaymentValue()],
      ['Spedizione', $('shipping')?.value || 'Franco destino'],
      ['Validità', $('validity')?.value || '30 giorni'],
      [],
      ['Codice Articolo', 'Descrizione', 'Marca', 'Quantità', 'Listino (€)', 'Sconto 1 %', 'Sconto 2 %', 'Sconto 3 %', 'Sconto 4 %', 'Sconto Extra %', 'Ricarico %', 'Sconto Equiv. %', 'Totale Netto (€)', 'IVA %']
    ];

    if (!items.length) {
      data.push(['(Nessun articolo inserito)', '', '', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 22]);
    } else {
      items.forEach(i => {
        data.push([
          i.product.code || '',
          i.product.description || '',
          i.product.brand || '',
          Number(i.qty) || 0,
          Number(i.product.price) || 0,
          Number(i.discounts[0]) || 0,
          Number(i.discounts[1]) || 0,
          Number(i.discounts[2]) || 0,
          Number(i.discounts[3]) || 0,
          Number(i.extraDiscount) || 0,
          Number(i.markup) || 0,
          Number(effectiveDiscount(i).toFixed(2)),
          Number(lineNet(i).toFixed(2)),
          Number(i.product.vat || 22)
        ]);
      });
    }

    data.push([]);
    data.push(['', '', '', '', '', '', '', '', '', '', '', 'Totale Imponibile (€):', Number(t.net.toFixed(2)), '']);
    data.push(['', '', '', '', '', '', '', '', '', '', '', 'Totale IVA (€):', Number(t.vat.toFixed(2)), '']);
    data.push(['', '', '', '', '', '', '', '', '', '', '', `TOTALE ${label} (€):`, Number(t.grand.toFixed(2)), '']);

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [
      { wch: 18 },
      { wch: 42 },
      { wch: 16 },
      { wch: 10 },
      { wch: 12 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 12 },
      { wch: 10 },
      { wch: 16 },
      { wch: 16 },
      { wch: 8 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, label === 'ORDINE' ? 'Ordine' : 'Offerta');
    try {
      XLSX.writeFile(wb, `${label}_${numDoc}.xlsx`);
    } catch (errXlsx) {
      console.warn('XLSX.writeFile failed, using Blob fallback:', errXlsx);
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const dlUrl = URL.createObjectURL(blob);
      const dlLink = document.createElement('a');
      dlLink.href = dlUrl;
      dlLink.download = `${label}_${numDoc}.xlsx`;
      document.body.appendChild(dlLink);
      dlLink.click();
      setTimeout(() => {
        document.body.removeChild(dlLink);
        URL.revokeObjectURL(dlUrl);
      }, 200);
    }
    toast('File Excel (.xlsx) scaricato con successo');
  } else {
    // Fallback CSV formattato con punto e virgola e UTF-8 BOM compatibile con Excel italiano
    const csvRows = [
      `"${label} CLIENTE";"${numDoc}"`,
      `"Data";"${new Date().toLocaleDateString('it-IT')}"`,
      `"Agente";"${(agent.name || '').replace(/"/g, '""')}"`,
      `"Cliente";"${(c.name || '').replace(/"/g, '""')}"`,
      `"Indirizzo";"${([c.address, c.city].filter(Boolean).join(' ')).replace(/"/g, '""')}"`,
      '',
      '"Codice";"Descrizione";"Marca";"Quantità";"Listino";"Sconto 1";"Sconto 2";"Sconto 3";"Sconto 4";"Sconto Extra";"Ricarico";"Sconto Equivalente";"Totale Netto";"IVA %"'
    ];
    items.forEach(i => {
      csvRows.push([
        `"${(i.product.code || '').replace(/"/g, '""')}"`,
        `"${(i.product.description || '').replace(/"/g, '""')}"`,
        `"${(i.product.brand || '').replace(/"/g, '""')}"`,
        String(i.qty).replace('.', ','),
        String(i.product.price).replace('.', ','),
        String(i.discounts[0] || 0).replace('.', ','),
        String(i.discounts[1] || 0).replace('.', ','),
        String(i.discounts[2] || 0).replace('.', ','),
        String(i.discounts[3] || 0).replace('.', ','),
        String(i.extraDiscount || 0).replace('.', ','),
        String(i.markup || 0).replace('.', ','),
        effectiveDiscount(i).toFixed(2).replace('.', ','),
        lineNet(i).toFixed(2).replace('.', ','),
        String(i.product.vat || 22)
      ].join(';'));
    });
    csvRows.push('');
    csvRows.push(`"";"";"";"";"";"";"";"";"";"";"";"Totale Imponibile:";"${t.net.toFixed(2).replace('.', ',')}"`);
    csvRows.push(`"";"";"";"";"";"";"";"";"";"";"";"Totale IVA:";"${t.vat.toFixed(2).replace('.', ',')}"`);
    csvRows.push(`"";"";"";"";"";"";"";"";"";"";"";"TOTALE ${label}:";"${t.grand.toFixed(2).replace('.', ',')}"`);

    const blob = new Blob(['\ufeff', csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${label}_${numDoc}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('File CSV Excel scaricato');
  }
}

function submissionPayload() {
  const c = customerData(), t = totals(), agent = currentAgent(), number = offerNumber();
  const rawRepo = window.companyConfig?.repository?.spreadsheetId;
  const repoId = (rawRepo && rawRepo.length >= 20 && !rawRepo.includes('1mnW')) ? rawRepo : '1Hi1Nppj4szI4UwfSeC632KkpF0dEQjqxnIVIenn-Fjc';
  const base = {
    id: localStorage.getItem(`submission-${number}`) || crypto.randomUUID(),
    spreadsheetId: repoId,
    repositorySpreadsheetId: repoId,
    originOfferId: editingOriginOffer || undefined,
    agentCode: agent.id,
    agentName: agent.name,
    customerId: c.id,
    customerName: c.name,
    total: t.grand,
    payload: {
      company: { ...companyProfile },
      payment: currentPaymentValue(),
      shipping: $('shipping').value,
      validity: $('validity').value,
      notes: $('notes').value,
      customerAddress: c.address || '',
      customerCity: c.city || '',
      customerPostalCode: c.postalCode || '',
      customerProvince: c.province || '',
      customerVat: c.vatNumber || c.taxCode || '',
      customerEmail: c.email || '',
      sdi: c.sdi || '',
      iban: c.iban || '',
      bank: c.bank || '',
      originOfferId: editingOriginOffer || undefined,
      revisionOf: editingOriginOffer || undefined,
      lines: items.map(i => ({
        code: i.product.code,
        caId: i.product.id || '',
        description: i.product.description,
        um: i.product.um || 'PZ',
        quantity: i.qty,
        listPrice: i.product.price,
        discounts: i.discounts,
        extraDiscount: Number(i.extraDiscount) || 0,
        extra_discount: Number(i.extraDiscount) || 0,
        markup: i.markup,
        net: lineNet(i),
        vat: i.product.vat || 22
      }))
    }
  };
  return documentType === 'order' ? { ...base, orderNumber: number } : { ...base, offerNumber: number };
}

async function readApiResponse(response) {
  const text = await response.text();
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try { return text ? JSON.parse(text) : {}; } catch { throw new Error('Risposta del servizio non leggibile. Riprova tra poco.'); }
  }
  if (response.status === 401 || response.status === 403 || response.redirected || /^\s*<!doctype|^\s*<html/i.test(text)) {
    throw new Error('Sessione scaduta o accesso non autorizzato.');
  }
  throw new Error(`Servizio non disponibile (${response.status}).`);
}

async function sendSubmission(payload) {
  // Con Supabase attivo, la registrazione primaria e ufficiale avviene tramite window.ClwData.createDocument
  if (window.ClwData && window.ClwData.isConfigured()) {
    return { ok: true, source: 'Supabase' };
  }
  return { ok: true, local: true };
}

async function submitOffer() {
  if (!canExport()) return;
  const c = customerData();
  if (!c.name) {
    toast('Seleziona il cliente prima dell’invio');
    return;
  }
  if (currentRole() === 'ADMIN') {
    toast('Seleziona la vista operativa di un agente prima dell’invio');
    return;
  }
  const payload = submissionPayload();
  $('submitBtn').disabled = true;
  $('submitBtn').textContent = 'Registrazione su Supabase…';

  // 1. Inserimento prioritario su Supabase (PostgreSQL Cloud Climawell)
  if (window.ClwData && window.ClwData.isConfigured()) {
    try {
      await window.ClwData.createDocument({
        documentType: documentType === 'order' ? 'OCL' : 'OFC',
        number: offerNumber(),
        customer: c,
        agent: currentAgent(),
        lines: items,
        totals: totals(),
        paymentMethod: currentPaymentValue(),
        validityDays: parseInt($('validity').value, 10) || 30,
        notes: $('notes').value
      });
      toast(`✅ ${documentType === 'order' ? 'Ordine' : 'Offerta'} ${offerNumber()} registrato su Supabase!`);
    } catch (supErr) {
      console.warn('[Supabase] Errore inserimento documento:', supErr);
    }
  }

  // Pulisce il numero di bozza salvato per l'agente e la bozza corrente così il prossimo documento ha numero univoco
  try {
    const storageKey = documentType === 'order' ? 'order-numbers' : 'offer-numbers';
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    delete saved[currentAgentId()];
    localStorage.setItem(storageKey, JSON.stringify(saved));
    localStorage.removeItem('offer-demo');
    localStorage.removeItem('offer-editing-info');
  } catch (cleanErr) {
    console.warn('Errore pulizia bozza locale:', cleanErr);
  }

  if (!navigator.onLine) {
    const outbox = JSON.parse(localStorage.getItem('offer-outbox') || '[]');
    if (!outbox.some(o => o.id === payload.id)) outbox.push({ ...payload, documentType });
    localStorage.setItem('offer-outbox', JSON.stringify(outbox));
    toast(`${documentType === 'order' ? 'Ordine' : 'Offerta'} registrato in locale`);
    setTimeout(() => location.href = '/', 900);
    return;
  }

  setTimeout(() => location.href = '/', 800);
}

async function flushOutbox() {
  const outbox = JSON.parse(localStorage.getItem('offer-outbox') || '[]');
  if (!outbox.length) return;
  const pending = [];
  for (const payload of outbox) {
    try {
      if (window.ClwData && window.ClwData.isConfigured()) {
        const c = { id: payload.customerCode || payload.customerId, name: payload.customerName };
        const ag = { id: payload.agentCode, name: payload.agentName };
        await window.ClwData.createDocument({
          documentType: payload.documentType === 'order' ? 'OCL' : 'OFC',
          number: payload.number || payload.id,
          customer: c,
          agent: ag,
          lines: payload.items || [],
          totals: payload.totals || {},
          paymentMethod: payload.payment || '',
          validityDays: payload.validityDays || 30,
          notes: payload.notes || ''
        });
      }
    } catch {
      pending.push(payload);
    }
  }
  localStorage.setItem('offer-outbox', JSON.stringify(pending));
  if (!pending.length) toast('Pratiche in coda sincronizzate con Supabase');
}

function parseCsv(text) {
  const first = text.split(/\r?\n/, 1)[0] || '';
  const counts = { ';': (first.match(/;/g) || []).length, ',': (first.match(/,/g) || []).length, '\t': (first.match(/\t/g) || []).length };
  const delimiter = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (ch === '"' && quoted && next === '"') { cell += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === delimiter && !quoted) { row.push(cell); cell = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell);
      if (row.some(v => v !== '')) rows.push(row);
      row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = (rows.shift() || []).map(normalized);
  return rows.map(r => Object.fromEntries(headers.map((h, i) => [h, clean(r[i])])));
}

const pick = (row, ...keys) => {
  for (const key of keys) {
    const value = row[normalized(key)];
    if (value !== undefined && value !== '') return value;
  }
  return '';
};

function normalizeArticles(rows) {
  return rows.map((r, index) => ({
    id: pick(r, 'CaId') || String(index + 1),
    code: pick(r, 'CodiceArticolo', 'Ca', 'Codice') || pick(r, 'CaId'),
    description: pick(r, 'Descrizione', 'DesArt') || pick(r, 'Q_UBI_ART_DesTab'),
    sector: pick(r, 'Settore', 'JSettore'),
    macroFamily: pick(r, 'Macrofamiglia', 'JMacroFamiglia', 'Macro famiglia'),
    family: pick(r, 'Famiglia', 'JFamiglia'),
    brand: pick(r, 'Marca') || pick(r, 'Q_MARCHE_DesTab'),
    group: pick(r, 'Ubicazione', 'JUbiArt', 'Q_UBI_ART_DesTab'),
    price: toNumber(pick(r, 'Prezzo', 'QT_prezzo_Pz', 'Listino')),
    stock: toNumber(pick(r, 'Giacenza (QtEsi)', 'QtEsi', 'Giacenza', 'Disponibilita')),
    imageRef: pick(r, 'URL-immagine', 'URL-immagine ', 'Disegno'),
    discountCode: pick(r, 'JScontoVen'),
    unit: pick(r, 'Unita di Misura', 'Unità di Misura', 'Um') || 'NR',
    status: pick(r, 'Jstato prodotto', 'JStato'),
    maxDiscount: Math.min(100, Math.max(0, toNumber(pick(r, 'ScReale', 'Sconto massimo')) || 100)),
    vat: toNumber(pick(r, 'IVA')) || 22
  })).filter(p => p.code && p.description);
}

function agentIdForSource(source) {
  return AGENTS.find(a => normalized(a.source || a.name || a.code) === normalized(source))?.id || 'UNASSIGNED';
}

function normalizeClients(rows) {
  return rows.map((r, index) => {
    const source = pick(r, 'Agente');
    return {
      id: pick(r, 'Codice') || String(index + 1),
      name: pick(r, 'Ragione sociale', 'Cliente'),
      activityCode: pick(r, 'Cod.Att.'),
      activity: pick(r, 'Attivita'),
      sourceAgent: source,
      agentId: agentIdForSource(source),
      address: pick(r, 'Indirizzo'),
      postalCode: pick(r, 'Cap'),
      city: pick(r, 'Citta'),
      province: pick(r, 'Pv', 'Provincia'),
      phone: pick(r, 'Telefono'),
      mobile: pick(r, 'Cellulare'),
      email: pick(r, 'E-mail', 'Email'),
      pec: pick(r, 'PEC', 'Pec'),
      payment: pick(r, 'Pagamento', 'CondizionePagamento'),
      priceList: pick(r, 'Listino', 'CodiceListino'),
      vatNumber: pick(r, 'PartitaIva', 'PIva'),
      fiscalCode: pick(r, 'CodiceFiscale', 'CodFisc')
    };
  }).filter(c => c.id && c.name);
}

async function readImport(input, type) {
  const file = input.files[0];
  if (!file) return null;
  const rows = parseCsv(await file.text());
  return type === 'articles' ? normalizeArticles(rows) : normalizeClients(rows);
}

function renderDataDialog() {
  $('articleDataCount').textContent = products.length.toLocaleString('it-IT');
  $('clientDataCount').textContent = clients.length.toLocaleString('it-IT');
  $('dataUpdatedAt').textContent = nowLabel(dataMeta.generatedAt);
  $('agentMapList').innerHTML = AGENTS.map((a, index) => `<label class="agent-map-row"><span><strong>${a.id.replace('AG', 'Agente ')}</strong>${esc(a.name)}${a.head ? ' · capo area' : ''}</span>${index ? `<input type="checkbox" data-area-member="${a.id}" ${(hierarchy[AGENTS[0]?.id] || []).includes(a.id) ? 'checked' : ''}>` : '<small>Include sempre i propri clienti</small>'}</label>`).join('');
}

async function applyImports(event) {
  event.preventDefault();
  $('importStatus').textContent = 'Elaborazione in corso…';
  try {
    const [newArticles, newClients] = await Promise.all([
      readImport($('articleImport'), 'articles'),
      readImport($('clientImport'), 'clients')
    ]);
    if (AGENTS[0]) {
      hierarchy[AGENTS[0].id] = [...document.querySelectorAll('[data-area-member]:checked')].map(el => el.dataset.areaMember);
      localStorage.setItem('offer-hierarchy', JSON.stringify(hierarchy));
    }
    if (newArticles && newArticles.length) products = newArticles;
    if (newClients && newClients.length) clients = newClients;
    if (newArticles || newClients) {
      dataMeta = {
        ...dataMeta,
        generatedAt: new Date().toISOString(),
        articleCount: products.length,
        clientCount: clients.length,
        articleSource: newArticles ? $('articleImport').files[0].name : dataMeta.articleSource,
        clientSource: newClients ? $('clientImport').files[0].name : dataMeta.clientSource
      };
      await dbSet('dataset', { meta: dataMeta, articles: products, clients });
    }
    updateFilters();
    renderCustomers();
    renderDataDialog();
    $('importStatus').textContent = newArticles || newClients ? `Aggiornamento completato: ${products.length.toLocaleString('it-IT')} articoli e ${clients.length.toLocaleString('it-IT')} clienti.` : 'Gerarchia aggiornata.';
    toast(newArticles || newClients ? 'Dati aggiornati sul dispositivo' : 'Gerarchia agenti aggiornata');
  } catch (error) {
    console.error(error);
    $('importStatus').textContent = 'Il file non è leggibile. Verifica che sia un CSV UTF-8.';
  }
}

function bindEvents() {
  $('productSearch').onfocus = e => renderProducts(e.target.value);
  $('productSearch').oninput = e => renderProducts(e.target.value);
  document.addEventListener('click', e => {
    if (!e.target.closest('.product-picker')) $('productResults').classList.add('hidden');
  });

  $('customerSelect').onchange = showCustomer;

  // Ricerca rapida cliente istantanea
  if ($('customerSearchInput')) {
    $('customerSearchInput').oninput = () => renderCustomers($('customerSelect').value);
    $('customerSearchInput').onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if ($('customerSelect').options.length > 1) {
          $('customerSelect').selectedIndex = 1;
          showCustomer();
          $('productSearch')?.focus();
        }
      }
    };
  }
  if ($('clearCustomerSearchBtn')) {
    $('clearCustomerSearchBtn').onclick = () => {
      $('customerSearchInput').value = '';
      renderCustomers();
      $('customerSearchInput').focus();
    };
  }
  $('roleSelect').onchange = updateRoleView;
  $('catalogBtn').onclick = () => {
    $('catalogPanel').classList.remove('hidden');
    catalogLimit = 80;
    renderCatalog();
  };
  $('closeCatalog').onclick = () => $('catalogPanel').classList.add('hidden');
  ['sectorFilter', 'macroFilter', 'familyFilter', 'brandFilter'].forEach(id => $(id).onchange = () => {
    catalogLimit = 80;
    updateFilters(id);
    renderCatalog();
  });
  $('loadMoreCatalog').onclick = () => {
    catalogLimit += 80;
    renderCatalog();
  };
  ['validity', 'shipping'].forEach(id => $(id).addEventListener('change', persistOffer));
  $('payment').addEventListener('change', async () => {
    if ($('payment').value === '__custom__') {
      $('customPaymentInput')?.classList.remove('hidden');
      $('customPaymentInput')?.focus();
    } else {
      $('customPaymentInput')?.classList.add('hidden');
    }
    persistOffer();

    // Se è selezionato un cliente esistente, aggiorna la sua condizione di pagamento in anagrafica
    const c = customerData();
    const newPay = currentPaymentValue();
    if (c && c.id && newPay && newPay !== '__custom__') {
      c.payment = newPay;
      const idx = clients.findIndex(x => String(x.id) === String(c.id));
      if (idx >= 0) clients[idx].payment = newPay;
      await dbSet('dataset', { meta: dataMeta, articles: products, clients }).catch(() => {});
      fetch('/api/customers/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: c.id, payment: newPay })
      }).catch(e => console.warn('Sync pagamento cliente fallito:', e));
    }
  });

  $('customPaymentInput')?.addEventListener('input', persistOffer);
  $('customPaymentInput')?.addEventListener('blur', async () => {
    persistOffer();
    const c = customerData();
    const newPay = currentPaymentValue();
    if (c && c.id && newPay && newPay !== '__custom__') {
      c.payment = newPay;
      const idx = clients.findIndex(x => String(x.id) === String(c.id));
      if (idx >= 0) clients[idx].payment = newPay;
      await dbSet('dataset', { meta: dataMeta, articles: products, clients }).catch(() => {});
      fetch('/api/customers/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: c.id, payment: newPay })
      }).catch(e => console.warn('Sync pagamento personalizzato fallito:', e));
    }
  });

  $('notes').oninput = persistOffer;
  $('saveBtn').onclick = () => {
    persistOffer();
    toast('Bozza salvata sul dispositivo');
  };
  $('excelBtn').onclick = exportExcel;
  $('printBtn').onclick = () => {
    if (!canExport(false)) return;
    buildPrintOffer();
    window.print();
  };
  $('submitBtn').onclick = submitOffer;

  const mobileToggle = $('mobileMenuToggle');
  const mobileDropdown = $('mobileMenuDropdown');
  if (mobileToggle && mobileDropdown) {
    mobileToggle.onclick = (e) => {
      e.stopPropagation();
      mobileDropdown.classList.toggle('hidden');
    };
    document.addEventListener('click', (e) => {
      if (!mobileDropdown.contains(e.target) && e.target !== mobileToggle) {
        mobileDropdown.classList.add('hidden');
      }
    });
  }
  if ($('dataBtnMobile')) {
    $('dataBtnMobile').onclick = () => $('dataBtn').click();
  }
  if ($('mobileStickySaveBtn')) {
    $('mobileStickySaveBtn').onclick = () => $('saveBtn').click();
  }
  if ($('mobileStickySubmitBtn')) {
    $('mobileStickySubmitBtn').onclick = () => $('submitBtn').click();
  }
  $('newCustomerBtn').onclick = () => $('customerDialog').showModal();
  $('confirmCustomer').onclick = async e => {
    e.preventDefault();
    const name = $('newCustomerName').value.trim();
    const city = $('newCustomerCity').value.trim();
    const address = $('newCustomerAddress').value.trim();
    const tax = ($('newCustomerTax')?.value || '').trim();
    const sdi = ($('newCustomerSdi')?.value || '').trim();
    const email = ($('newCustomerEmail')?.value || '').trim();
    const phone = ($('newCustomerPhone')?.value || '').trim();
    const mobile = ($('newCustomerMobile')?.value || '').trim();
    const payment = ($('newCustomerPayment')?.value || '').trim();
    const iban = ($('newCustomerIban')?.value || '').trim().replace(/\s+/g, '');
    const bank = ($('newCustomerBank')?.value || '').trim();
    const agentId = $('assignedAgent')?.value || currentAgentId() || 'AG01';
    if (!name || !city) {
      alert('Inserire almeno la ragione sociale e la città del cliente');
      return;
    }

    const btn = $('confirmCustomer');
    const prevText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Salvataggio su Supabase…';

    let savedCustomer = null;
    try {
      if (window.ClwData && window.ClwData.isConfigured()) {
        savedCustomer = await window.ClwData.saveCustomer({
          name,
          city,
          address,
          tax,
          sdi,
          email,
          phone,
          mobile,
          payment,
          iban,
          bank,
          agentId
        });
      }
    } catch (err) {
      console.warn('Errore salvataggio remoto cliente, uso fallback locale:', err);
    } finally {
      btn.disabled = false;
      btn.textContent = prevText;
    }

    if (!savedCustomer) {
      savedCustomer = {
        id: `LOCAL-${Date.now()}`,
        code: `LOCAL-${Date.now()}`,
        name,
        city,
        address,
        agentId,
        sourceAgent: agentById[agentId]?.name || agentId,
        phone,
        mobile,
        email,
        sdi,
        iban,
        bank,
        payment,
        vatNumber: tax,
        taxCode: tax,
        postalCode: '',
        province: '',
        activity: 'Cliente',
        activityCode: ''
      };
      toast('Cliente salvato in locale');
    }

    if (savedCustomer) {
      const existingIdx = clients.findIndex(c => String(c.id) === String(savedCustomer.id) || (c.name && c.name.toLowerCase() === savedCustomer.name.toLowerCase()));
      if (existingIdx >= 0) {
        clients[existingIdx] = savedCustomer;
      } else {
        clients.push(savedCustomer);
      }
      renderCustomers(savedCustomer.id);
      $('customerDialog').close();
      $('customerForm').reset();
      await dbSet('dataset', { meta: dataMeta, articles: products, clients }).catch(() => {});
      toast(`Cliente "${savedCustomer.name}" salvato su Supabase e assegnato`);
    }
  };
  $('dataBtn').onclick = async () => {
    await loadData();
    renderCompanyProfile();
    renderDataDialog();
    $('dataDialog').showModal();
    toast('Dati sincronizzati con Supabase');
  };
  $('applyImport').onclick = applyImports;

  const applyExtraBtn = $('applyGlobalExtraBtn');
  if (applyExtraBtn) {
    applyExtraBtn.onclick = () => {
      if (!items.length) {
        toast('Inserisci almeno un articolo per impostare lo sconto extra');
        return;
      }
      const currentVal = items[0]?.extraDiscount || 0;
      const input = prompt('Percentuale Sconto Extra da applicare a tutte le righe (può essere anche negativo, es. -3 o 5):', currentVal);
      if (input !== null && input.trim() !== '') {
        const val = Math.min(100, Math.max(-100, Number(input.replace(',', '.')) || 0));
        items.forEach(i => i.extraDiscount = val);
        renderOffer();
        toast(`Sconto extra (${val}%) applicato a tutti gli articoli`);
      }
    };
  }
}

async function start() {
  const params = new URLSearchParams(location.search);
  const revParam = params.get('revision') || params.get('edit');
  documentType = params.get('type') === 'order' ? 'order' : 'offer';

  if (revParam) {
    documentType = 'offer';
    editingOriginOffer = revParam;
    const isRev = !params.get('edit');
    $('documentTitle').textContent = isRev ? 'REVISIONE OFFERTA' : 'MODIFICA OFFERTA';
    $('grandLabel').textContent = 'TOTALE OFFERTA';
    $('submitBtn').textContent = isRev ? 'Registra revisione su Supabase' : 'Aggiorna offerta su Supabase';
    document.title = isRev ? `Revisione ${revParam}` : `Modifica ${revParam}`;

    // Calcola il nuovo numero di revisione progressivo
    const base = revParam.replace(/-R\d+$/i, '');
    let revIdx = 1;
    const m = revParam.match(/-R(\d+)$/i);
    if (m) revIdx = parseInt(m[1], 10) + 1;
    const nextRevNum = isRev ? `${base}-R${revIdx}` : revParam;

    const savedNumbers = JSON.parse(localStorage.getItem('offer-numbers') || '{}');
    const roleId = currentAgentId();
    savedNumbers[roleId] = nextRevNum;
    localStorage.setItem('offer-numbers', JSON.stringify(savedNumbers));
  } else {
    $('documentTitle').textContent = documentType === 'order' ? 'ORDINE CLIENTE' : 'OFFERTA CLIENTE';
    $('grandLabel').textContent = documentType === 'order' ? 'TOTALE ORDINE' : 'TOTALE OFFERTA';
    $('submitBtn').textContent = documentType === 'order' ? 'Invia ordine' : 'Invia offerta';
    document.title = documentType === 'order' ? 'Nuovo ordine' : 'Nuova offerta';
  }

  $('documentDate').value = new Date().toLocaleDateString('it-IT');

  if (params.get('new') === '1' && !revParam) {
    localStorage.removeItem('offer-demo');
    localStorage.removeItem(documentType === 'order' ? 'order-numbers' : 'offer-numbers');
  }

  bindEvents();

  // Popolamento sincrono immediato da cache locale per non lasciare MAI la tendina agenti o il profilo aziendale vuoti
  try {
    const cachedAg = JSON.parse(localStorage.getItem('oa_cached_agents') || 'null');
    if (cachedAg && Array.isArray(cachedAg) && cachedAg.length) {
      AGENTS = cachedAg;
      agentById = Object.fromEntries(AGENTS.map(a => [a.id, a]));
    }
  } catch (_) {}
  try { roleOptions(); } catch (_) {}
  try { renderCompanyProfile(); } catch (_) {}

  $('syncLabel').textContent = 'Connessione a Supabase Live…';

  try {
    await checkUserSession();
    await loadData();
    roleOptions();
    updateFilters();
    await restoreOffer();
    if (params.get('client')) {
      const qClient = decodeURIComponent(params.get('client')).trim().toLowerCase();
      const match = visibleClients().find(c => (c.name || '').toLowerCase().includes(qClient));
      if (match) {
        $('customerSelect').value = String(match.id);
        showCustomer();
      }
    }
    updateRoleView();
    renderOffer();
    renderCatalog();
    renderCompanyProfile();

    if (revParam) {
      let banner = $('revisionBanner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'revisionBanner';
        banner.style.cssText = 'background:#eff6ff; border:1px solid #bfdbfe; color:#1e40af; padding:10px 14px; border-radius:8px; margin: 12px 0; font-size:.88rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;';
        const container = document.querySelector('.main-head') || $('app');
        if (container && container.parentNode) {
          container.parentNode.insertBefore(banner, container.nextSibling);
        }
      }
      const mPlus = revParam.match(/-BANCO-(\d+)/i);
      const plusNote = mPlus ? ` <span style="background:#dbeafe; color:#0369a1; padding:2px 8px; border-radius:4px; font-weight:750; font-size:.78rem; margin-left:6px; border:1px solid #bfdbfe;">📋 Plus: OFC ${mPlus[1]}/2026</span>` : '';
      banner.innerHTML = `
        <div>
          <strong>✏️ Revisione Offerta:</strong> Stai lavorando sui dati dell'offerta originale <code>${esc(revParam)}</code>${plusNote}.
          <div style="font-size:.78rem; color:#2563eb; margin-top:2px;">Tutti gli articoli sono stati ricaricati. Puoi aggiungerne altri dal catalogo, variare quantità o prezzi, e ristampare o confermare.</div>
        </div>
        <a href="/index.html" class="btn secondary" style="padding:4px 10px; font-size:.78rem; text-decoration:none;">Torna al Registro</a>
      `;
    }

    $('syncLabel').textContent = navigator.onLine ? '🟢 Supabase Live' : 'Modalità offline';
    $('offerCode').textContent = offerNumber();
  } catch (error) {
    console.error(error);
    $('syncLabel').textContent = 'Errore caricamento dati';
    toast(error.message || 'Impossibile caricare l’archivio dati');
  }
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { scope: '/' });
window.addEventListener('offline', () => {
  $('syncLabel').textContent = 'Modalità offline';
  toast('Sei offline: dati e bozze restano disponibili');
});
window.addEventListener('online', () => {
  $('syncLabel').textContent = '🟢 Supabase Live';
  toast('Connessione ripristinata');
  flushOutbox();
});

start();
if (navigator.onLine) flushOutbox();
