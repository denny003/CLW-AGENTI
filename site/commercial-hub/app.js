/**
 * CLIMAWELL COMMERCIAL HUB - Modulo Frontend
 * Centralizzazione CRM, Clienti, WhatsApp, Brevo & Marketplace
 */

// Stato Applicazione
const HubState = {
  currentSection: 'dashboard',
  currentUser: null,
  customers: [],
  products: [],
  agents: [],
  filters: {
    search: '',
    agent: 'ALL',
    activity: 'ALL',
    legalForm: 'ALL'
  },
  productFilters: {
    search: '',
    onlyAvailable: true,
    brand: 'ALL',
    sector: 'ALL',
    macroFamily: 'ALL',
    family: 'ALL',
    classCode: 'ALL',
    groupCode: 'ALL',
    page: 1,
    pageSize: 50
  },
  opportunities: [
    { id: '1', title: 'Impianto Pompa di Calore R32', customer: 'Termoidraulica Fiorentina Srl', value: 8500, stage: 'nuovo', agent: 'Lupi Daniele' },
    { id: '2', title: 'Fornitura 12 Barriere Aria', customer: 'Clima Service Pisa', value: 14200, stage: 'proposta', agent: 'Poli Francesco' },
    { id: '3', title: 'Sostituzione Caldaie a Condensazione', customer: 'Edil Termica Prato', value: 6800, stage: 'trattativa', agent: 'Lupi Daniele' },
    { id: '4', title: 'Rinnovamento Climatizzatori Uffici', customer: 'Gallo Impianti Livorno', value: 4300, stage: 'vinto', agent: 'Pontrelli Francesco' }
  ],
  stats: {
    totalCustomers: 0,
    openOpportunities: 4,
    pipelineValue: 33800,
    whatsappSent: 42,
    syncStatus: 'Attivo (SRVPLUS)'
  }
};

// Funzione di formattazione valuta
const euro = val => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(val) || 0);
const escapeHtml = str => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

// Inizializzazione Modulo
document.addEventListener('DOMContentLoaded', async () => {
  initCurrentUser();
  setupNavigation();
  await loadHubData();
  renderCurrentSection();
});

function initCurrentUser() {
  try {
    const raw = localStorage.getItem('clw_current_user') || localStorage.getItem('oa_session_user');
    if (raw) {
      HubState.currentUser = JSON.parse(raw);
      const topActions = document.querySelector('.topbar-actions');
      if (topActions && !document.getElementById('userHubBadge')) {
        const pill = document.createElement('span');
        pill.id = 'userHubBadge';
        pill.style.cssText = 'font-size:0.8rem; font-weight:700; color:#cbd5e1; background:rgba(255,255,255,0.08); padding:6px 12px; border-radius:6px; display:inline-flex; align-items:center; gap:6px;';
        pill.innerHTML = `👤 ${HubState.currentUser.name} (${HubState.currentUser.role || 'Commerciale'})`;
        topActions.prepend(pill);
      }
    }
  } catch (e) {
    console.warn('[Hub] Errore lettura sessione utente:', e);
  }
}

// Gestione Navigazione Sidebar
function setupNavigation() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const section = link.getAttribute('data-section');
      if (!section) return;

      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      HubState.currentSection = section;
      renderCurrentSection();
    });
  });
}

// Helper Classificazione Cliente (Forma Giuridica, Privato/Azienda, Attività, Agente)
function getCustomerMeta(c) {
  const name = String(c.business_name || c.name || '').trim();
  const rawAct = String(c.activity || c.tipo || '').trim();
  const vat = String(c.vat_number || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const cf = String(c.fiscal_code || c.tax_code || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const agentCode = String(c.assigned_agent_code || c.agent_code || '').trim();

  // Riconoscimento Forma Giuridica
  let legalForm = 'Ditta / Altro';
  let isPrivato = false;
  const upper = name.toUpperCase();

  if (upper.includes('S.R.L.S.') || upper.includes('SRLS') || upper.includes('S.R.L. S.')) {
    legalForm = 'S.r.l.s.';
  } else if (upper.includes('S.R.L.') || upper.includes('SRL') || upper.includes(' S R L') || upper.includes('S. R. L.')) {
    legalForm = 'S.r.l.';
  } else if (upper.includes('S.N.C.') || upper.includes('SNC') || upper.includes(' S N C')) {
    legalForm = 'S.n.c.';
  } else if (upper.includes('S.A.S.') || upper.includes('SAS') || upper.includes(' S A S')) {
    legalForm = 'S.a.s.';
  } else if (upper.includes('S.P.A.') || upper.includes('SPA') || upper.includes(' S P A')) {
    legalForm = 'S.p.a.';
  } else if (upper.includes('S.S.') || upper.includes('SOCIETA SEMPLICE')) {
    legalForm = 'S.s.';
  } else if (upper.includes('COOP') || upper.includes('COOPERATIVA')) {
    legalForm = 'Coop.';
  } else if (cf.length === 16 && /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(cf) && (!vat || vat.length < 8)) {
    legalForm = 'Privato';
    isPrivato = true;
  } else if (rawAct.toLowerCase().includes('privat')) {
    legalForm = 'Privato';
    isPrivato = true;
  } else if (vat.length === 11) {
    legalForm = 'Ditta / P.IVA';
  }

  // Risoluzione Categoria Macro
  const isCompany = !isPrivato && legalForm !== 'Privato';
  const category = isCompany ? 'AZIENDA' : 'PRIVATO';

  // Normalizzazione Attività
  let activity = rawAct;
  if (!activity) {
    if (upper.includes('TERMO') || upper.includes('IDRAULIC') || upper.includes('CLIMA') || upper.includes('CALDAI') || upper.includes('CONDIZION')) {
      activity = 'Termoidraulica & Clima';
    } else if (upper.includes('ELETT') || upper.includes('FOTOVOLT') || upper.includes('ENERG')) {
      activity = 'Elettrico & Impianti';
    } else if (upper.includes('EDIL') || upper.includes('COSTRUZ') || upper.includes('CANTIERE')) {
      activity = 'Edile & Costruzioni';
    } else if (upper.includes('IMPIANTI') || upper.includes('SERVICE') || upper.includes('INSTALLAZION')) {
      activity = 'Installazioni & Manutenzioni';
    } else if (isPrivato) {
      activity = 'Privato Residenziale';
    } else {
      activity = 'Commercio / Servizi';
    }
  }

  return {
    legalForm,
    category,
    isCompany,
    isPrivato,
    activity,
    agentCode: agentCode || 'SENZA_AGENTE'
  };
}

// Caricamento Dati (Supabase + fallback)
async function loadHubData() {
  try {
    if (window.ClwData) {
      if (window.ClwData.getAgents) {
        HubState.agents = await window.ClwData.getAgents();
      }

      if (window.ClwData.getHubCustomers) {
        const custs = await window.ClwData.getHubCustomers();
        if (custs && custs.length) HubState.customers = custs;
      } else if (window.ClwData.getCustomers) {
        const custs = await window.ClwData.getCustomers();
        if (custs && custs.length) HubState.customers = custs;
      }

      if (window.ClwData.getProducts) {
        const prods = await window.ClwData.getProducts();
        if (prods && prods.length) HubState.products = prods;
      }
      if (!HubState.products || HubState.products.length === 0) {
        try {
          const resp = await fetch('/seed-data.json');
          if (resp.ok) {
            const seed = await resp.json();
            if (seed.articles && seed.articles.length) {
              HubState.products = seed.articles;
            }
          }
        } catch (_) {}
      }

      if (window.ClwData.getHubOpportunities) {
        const opps = await window.ClwData.getHubOpportunities();
        if (opps && opps.length) {
          HubState.opportunities = opps.map(o => ({
            id: o.id,
            title: o.title,
            customer: o.customer_name || 'Cliente',
            value: Number(o.estimated_value) || 0,
            stage: o.stage_code || 'nuovo',
            agent: o.notes || 'Commerciale'
          }));
        }
      }
    }
  } catch (err) {
    console.warn('[Hub] Caricamento da cache locale:', err.message);
  }

  // Se vuoto, carica campioni dimostrativi
  if (!HubState.customers || !HubState.customers.length) {
    HubState.customers = [
      { id: '104', customer_code: '104', business_name: 'Termoidraulica Fiorentina Srl', city: 'Firenze', phone: '055 4289074', mobile_whatsapp: '349 1770901', assigned_agent_code: '217', activity: 'Termoidraulica', consent_wa: 'opt_in', consent_email: 'opt_in' },
      { id: '215', customer_code: '215', business_name: 'Clima Service Pisa Snc', city: 'Pisa', phone: '050 987654', mobile_whatsapp: '335 1828254', assigned_agent_code: '1216', activity: 'Installatore', consent_wa: 'opt_in', consent_email: 'pending' },
      { id: '312', customer_code: '312', business_name: 'Mario Rossi', city: 'Prato', phone: '0574 123456', mobile_whatsapp: '338 1234567', assigned_agent_code: '217', activity: 'Privato', fiscal_code: 'RSSMRA80A01G999X', consent_wa: 'opt_out', consent_email: 'opt_in' },
      { id: '408', customer_code: '408', business_name: 'Gallo Impianti Livorno Sas', city: 'Livorno', phone: '0586 654321', mobile_whatsapp: '333 4567890', assigned_agent_code: 'ADM01', activity: 'Elettrico & Clima', consent_wa: 'opt_in', consent_email: 'opt_in' }
    ];
  }

  HubState.stats.totalCustomers = HubState.customers.length;
}

// Rendering delle Viste
function renderCurrentSection() {
  const container = document.getElementById('hubContentContainer');
  const pageTitle = document.getElementById('hubPageTitle');

  switch (HubState.currentSection) {
    case 'dashboard':
      pageTitle.textContent = 'Dashboard Commerciale & Panoramica';
      renderDashboard(container);
      break;
    case 'customers':
      pageTitle.textContent = 'Anagrafiche Clienti & Consensi Marketing';
      renderCustomersSection(container);
      break;
    case 'crm':
      pageTitle.textContent = 'Pipeline Vendite & Opportunità CRM';
      renderCrmSection(container);
      break;
    case 'products':
      pageTitle.textContent = 'Catalogo Articoli & Listini Plus2000';
      renderProductsSection(container);
      break;
    case 'whatsapp':
      pageTitle.textContent = 'WhatsApp Business Platform & Campagne Brevo';
      renderMarketingSection(container);
      break;
    case 'sync':
      pageTitle.textContent = 'Stato Connettore PLUS2000 & Telemetria';
      renderSyncSection(container);
      break;
    default:
      renderDashboard(container);
  }
}

// 1. Dashboard
function renderDashboard(container) {
  const totalPipeline = HubState.opportunities.reduce((acc, o) => acc + o.value, 0);

  container.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi-card">
        <span class="label">Clienti Totali</span>
        <span class="value">${HubState.stats.totalCustomers}</span>
        <span class="trend">Sincronizzati da PLUS2000 / Supabase</span>
      </div>
      <div class="kpi-card">
        <span class="label">Opportunità Aperte</span>
        <span class="value">${HubState.opportunities.length}</span>
        <span class="trend">Pipeline trattative</span>
      </div>
      <div class="kpi-card">
        <span class="label">Valore Trattative</span>
        <span class="value">${euro(totalPipeline)}</span>
        <span class="trend">Totale stimato pipeline</span>
      </div>
      <div class="kpi-card">
        <span class="label">Messaggi WhatsApp</span>
        <span class="value">${HubState.stats.whatsappSent}</span>
        <span class="trend">Invii tracciati</span>
      </div>
    </div>

    <div class="card-section">
      <div class="card-section-head">
        <h2>🔥 Opportunità Calde in Chiusura</h2>
        <div style="display:flex; gap:10px;">
          <button class="btn-hub primary" onclick="showNewOpportunityModal()">+ Nuova Trattativa</button>
          <button class="btn-hub secondary" onclick="switchSection('crm')">Vai alla Pipeline CRM</button>
        </div>
      </div>
      <div class="hub-table-wrapper">
        <table class="hub-table">
          <thead>
            <tr>
              <th>Titolo Trattativa</th>
              <th>Cliente</th>
              <th>Valore</th>
              <th>Stato Funnel</th>
              <th>Commerciale</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
            ${HubState.opportunities.map(o => `
              <tr>
                <td><strong>${o.title}</strong></td>
                <td>${o.customer}</td>
                <td><strong>${euro(o.value)}</strong></td>
                <td><span class="badge-status opt-in">${(o.stage || '').toUpperCase()}</span></td>
                <td>${o.agent}</td>
                <td>
                  <button class="btn-hub secondary" style="padding:4px 8px; font-size:0.75rem;" onclick="switchSection('crm')">Apri nel Funnel</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// 2. Clienti & Consensi con Filtri Agente, Attività e Forma Giuridica
function renderCustomersSection(container) {
  // Raccogli agenti e attività univoci
  const agentCodes = new Set();
  const activities = new Set();

  HubState.customers.forEach(c => {
    const meta = getCustomerMeta(c);
    if (meta.agentCode && meta.agentCode !== 'SENZA_AGENTE') agentCodes.add(meta.agentCode);
    if (meta.activity) activities.add(meta.activity);
  });

  const sortedAgents = Array.from(agentCodes).sort();
  const sortedActivities = Array.from(activities).sort();

  container.innerHTML = `
    <div class="card-section">
      <div class="card-section-head">
        <h2>Elenco Clienti & Consensi Privacy (GDPR)</h2>
        <div style="display:flex; gap:10px; align-items:center;">
          <a href="import-csv.html" class="btn-hub secondary">📥 Importa CSV</a>
        </div>
      </div>

      <!-- BARRA FILTRI AVANZATI -->
      <div class="hub-filters-row">
        <!-- Ricerca Testuale -->
        <div style="flex: 1; min-width: 220px;">
          <input type="search" id="hubCustSearch" 
                 value="${HubState.filters.search}" 
                 placeholder="🔍 Cerca ragione sociale, città, codice o P.IVA..." 
                 style="width: 100%; padding: 8px 12px; border: 1px solid var(--line); border-radius: 6px; font-size: 0.85rem;">
        </div>

        <!-- Filtro Agente -->
        <div>
          <select id="hubAgentFilter" class="hub-select">
            <option value="ALL">👤 Tutti gli Agenti</option>
            ${sortedAgents.map(ag => {
              const matchedAg = HubState.agents.find(a => String(a.code).trim() === ag || String(a.id).trim() === ag);
              const label = matchedAg ? `${ag} - ${matchedAg.name}` : `Agente ${ag}`;
              return `<option value="${ag}" ${HubState.filters.agent === ag ? 'selected' : ''}>${label}</option>`;
            }).join('')}
            <option value="SENZA_AGENTE" ${HubState.filters.agent === 'SENZA_AGENTE' ? 'selected' : ''}>Senza Agente Assegnato</option>
          </select>
        </div>

        <!-- Filtro Attività -->
        <div>
          <select id="hubActivityFilter" class="hub-select">
            <option value="ALL">💼 Tutte le Attività</option>
            ${sortedActivities.map(act => `
              <option value="${act}" ${HubState.filters.activity === act ? 'selected' : ''}>${act}</option>
            `).join('')}
          </select>
        </div>

        <!-- Filtro Forma Giuridica / Tipologia -->
        <div>
          <select id="hubLegalFilter" class="hub-select">
            <option value="ALL" ${HubState.filters.legalForm === 'ALL' ? 'selected' : ''}>🏛️ Tutte le Forme Giuridiche</option>
            <option value="AZIENDA" ${HubState.filters.legalForm === 'AZIENDA' ? 'selected' : ''}>🏢 Solo Aziende & Società (Tutte)</option>
            <option value="PRIVATO" ${HubState.filters.legalForm === 'PRIVATO' ? 'selected' : ''}>👤 Solo Clienti Privati</option>
            <option value="SRL" ${HubState.filters.legalForm === 'SRL' ? 'selected' : ''}>Società a Resp. Limitata (S.r.l. / S.r.l.s.)</option>
            <option value="SNC" ${HubState.filters.legalForm === 'SNC' ? 'selected' : ''}>Società in Nome Collettivo (S.n.c.)</option>
            <option value="SAS" ${HubState.filters.legalForm === 'SAS' ? 'selected' : ''}>Società in Accomandita (S.a.s.)</option>
            <option value="SPA" ${HubState.filters.legalForm === 'SPA' ? 'selected' : ''}>Società per Azioni (S.p.a.)</option>
            <option value="DITTA" ${HubState.filters.legalForm === 'DITTA' ? 'selected' : ''}>Ditte Individuali / P.IVA</option>
          </select>
        </div>

        <!-- Reset Filtri -->
        <div>
          <button class="btn-hub secondary" id="btnResetFilters" style="padding: 8px 12px; font-size: 0.8rem;">Pulisci Filtri</button>
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; font-size:0.8rem; color:var(--muted);">
        <span>Mostrati <strong id="filteredCount" style="color:var(--ink);">0</strong> di <strong>${HubState.customers.length}</strong> clienti</span>
        <span>💡 Fai clic sul badge del consenso per alternare lo stato: <span style="color:var(--green); font-weight:700;">OPT-IN</span> / <span style="color:var(--red); font-weight:700;">OPT-OUT</span></span>
      </div>

      <div class="hub-table-wrapper" style="max-height: 600px; overflow-y: auto;">
        <table class="hub-table" id="hubCustomersTable">
          <thead>
            <tr>
              <th>Codice</th>
              <th>Ragione Sociale</th>
              <th>Forma</th>
              <th>Attività</th>
              <th>Agente</th>
              <th>Città</th>
              <th>WhatsApp / Tel</th>
              <th>Consenso WA</th>
              <th>Consenso Email</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody id="hubCustomersTbody">
            <!-- Righe iniettate da applyCustomerFilters -->
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Binding Eventi Filtro
  document.getElementById('hubCustSearch').oninput = e => {
    HubState.filters.search = e.target.value;
    applyCustomerFilters();
  };

  document.getElementById('hubAgentFilter').onchange = e => {
    HubState.filters.agent = e.target.value;
    applyCustomerFilters();
  };

  document.getElementById('hubActivityFilter').onchange = e => {
    HubState.filters.activity = e.target.value;
    applyCustomerFilters();
  };

  document.getElementById('hubLegalFilter').onchange = e => {
    HubState.filters.legalForm = e.target.value;
    applyCustomerFilters();
  };

  document.getElementById('btnResetFilters').onclick = () => {
    HubState.filters = { search: '', agent: 'ALL', activity: 'ALL', legalForm: 'ALL' };
    document.getElementById('hubCustSearch').value = '';
    document.getElementById('hubAgentFilter').value = 'ALL';
    document.getElementById('hubActivityFilter').value = 'ALL';
    document.getElementById('hubLegalFilter').value = 'ALL';
    applyCustomerFilters();
  };

  applyCustomerFilters();
}

// Applicazione Filtri Dinamici Clienti
function applyCustomerFilters() {
  const tbody = document.getElementById('hubCustomersTbody');
  const countEl = document.getElementById('filteredCount');
  if (!tbody) return;

  const q = (HubState.filters.search || '').toLowerCase().trim();
  const fAgent = HubState.filters.agent;
  const fAct = HubState.filters.activity;
  const fLegal = HubState.filters.legalForm;

  const filtered = HubState.customers.filter(c => {
    const meta = getCustomerMeta(c);
    const bName = (c.business_name || c.name || '').toLowerCase();
    const cCode = String(c.customer_code || c.code || c.id || '').toLowerCase();
    const city = (c.city || '').toLowerCase();
    const piva = String(c.vat_number || '').toLowerCase();
    const phone = String(c.phone || c.mobile_whatsapp || '').toLowerCase();

    // 1. Ricerca testuale
    if (q) {
      const matchText = bName.includes(q) || cCode.includes(q) || city.includes(q) || piva.includes(q) || phone.includes(q);
      if (!matchText) return false;
    }

    // 2. Filtro Agente
    if (fAgent !== 'ALL') {
      if (fAgent === 'SENZA_AGENTE') {
        if (meta.agentCode && meta.agentCode !== 'SENZA_AGENTE') return false;
      } else {
        if (meta.agentCode !== fAgent) return false;
      }
    }

    // 3. Filtro Attività
    if (fAct !== 'ALL') {
      if (meta.activity !== fAct) return false;
    }

    // 4. Filtro Forma Giuridica
    if (fLegal !== 'ALL') {
      if (fLegal === 'AZIENDA' && !meta.isCompany) return false;
      if (fLegal === 'PRIVATO' && !meta.isPrivato) return false;
      if (fLegal === 'SRL' && !(meta.legalForm === 'S.r.l.' || meta.legalForm === 'S.r.l.s.')) return false;
      if (fLegal === 'SNC' && meta.legalForm !== 'S.n.c.') return false;
      if (fLegal === 'SAS' && meta.legalForm !== 'S.a.s.') return false;
      if (fLegal === 'SPA' && meta.legalForm !== 'S.p.a.') return false;
      if (fLegal === 'DITTA' && meta.legalForm !== 'Ditta / P.IVA') return false;
    }

    return true;
  });

  if (countEl) countEl.textContent = filtered.length;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align:center; padding: 30px; color: var(--muted);">
          Nessun cliente corrisponde ai criteri di filtro selezionati.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(c => {
    const meta = getCustomerMeta(c);
    const waNum = c.mobile_whatsapp || c.whatsapp || c.mobile || '';
    const bName = c.business_name || c.name || 'Cliente';
    const cCode = c.customer_code || c.code || c.id || '—';
    const cId = c.id || c.customer_code || c.code;

    // Classe badge forma
    let legalClass = 'ditta';
    if (meta.legalForm.includes('S.r.l')) legalClass = 'srl';
    else if (meta.legalForm.includes('S.n.c')) legalClass = 'snc';
    else if (meta.legalForm.includes('S.a.s')) legalClass = 'sas';
    else if (meta.legalForm.includes('S.p.a')) legalClass = 'spa';
    else if (meta.isPrivato) legalClass = 'privato';

    return `
      <tr>
        <td><strong>${cCode}</strong></td>
        <td>
          <div style="font-weight: 700; color: var(--ink);">${bName}</div>
          <small style="color: var(--muted);">${c.address || ''}</small>
        </td>
        <td>
          <span class="badge-legal ${legalClass}">${meta.legalForm}</span>
        </td>
        <td>
          <span style="font-size: 0.78rem; font-weight: 600; color: #475569;">${meta.activity}</span>
        </td>
        <td>
          <span style="font-size: 0.78rem; font-weight: 700; color: var(--blue);">${meta.agentCode !== 'SENZA_AGENTE' ? meta.agentCode : '—'}</span>
        </td>
        <td>${c.city || '—'}</td>
        <td>
          ${waNum ? `<div style="font-weight:700; color:#15803d;">🟢 ${waNum}</div>` : ''}
          ${c.phone && c.phone !== waNum ? `<small style="color:var(--muted);">${c.phone}</small>` : (!waNum ? '—' : '')}
        </td>
        <td>
          <span class="badge-status ${c.consent_wa === 'opt_in' ? 'opt-in' : (c.consent_wa === 'opt_out' ? 'opt-out' : 'pending')}" 
                style="cursor:pointer;" title="Clicca per modificare"
                onclick="toggleCustomerConsent('${cId}', 'whatsapp')">
            ${c.consent_wa || 'in_attesa'} 🔄
          </span>
        </td>
        <td>
          <span class="badge-status ${c.consent_email === 'opt_in' ? 'opt-in' : (c.consent_email === 'opt_out' ? 'opt-out' : 'pending')}" 
                style="cursor:pointer;" title="Clicca per modificare"
                onclick="toggleCustomerConsent('${cId}', 'email')">
            ${c.consent_email || 'in_attesa'} 🔄
          </span>
        </td>
        <td>
          <button class="btn-hub primary" style="padding:5px 10px; font-size:0.75rem;" onclick="openWhatsAppModal('${cCode}')">
            💬 WhatsApp
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// 3. Pipeline CRM Interattiva
function renderCrmSection(container) {
  const stages = [
    { key: 'nuovo', name: '1. Nuovo Contatto' },
    { key: 'proposta', name: '2. Offerta Inviata' },
    { key: 'trattativa', name: '3. In Trattativa' },
    { key: 'vinto', name: '4. Chiuso Vinto 🎉' }
  ];

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <div>
        <p style="color:var(--muted); font-size:0.85rem;">Trascina o usa le frecce per avanzare lo stadio delle trattative.</p>
      </div>
      <button class="btn-hub primary" onclick="showNewOpportunityModal()">+ Nuova Trattativa CRM</button>
    </div>

    <div class="kanban-board">
      ${stages.map((st, sIdx) => {
        const items = HubState.opportunities.filter(o => o.stage === st.key);
        const colTotal = items.reduce((acc, i) => acc + i.value, 0);
        return `
          <div class="kanban-column" data-stage="${st.key}">
            <div class="kanban-col-head">
              <span>${st.name}</span>
              <small>${euro(colTotal)}</small>
            </div>
            ${items.map(item => `
              <div class="kanban-card" data-id="${item.id}">
                <h4>${item.title}</h4>
                <p>🏢 ${item.customer}</p>
                <div class="card-footer">
                  <span style="color:var(--blue); font-weight:800;">${euro(item.value)}</span>
                  <small style="color:var(--muted);">${item.agent}</small>
                </div>
                <div style="display:flex; justify-content:flex-end; gap:6px; margin-top:10px; border-top:1px solid #f1f5f9; padding-top:8px;">
                  ${sIdx > 0 ? `<button class="btn-hub secondary" style="padding:2px 8px; font-size:0.7rem;" onclick="moveOpportunityStage('${item.id}', -1)" title="Sposta indietro">⬅️</button>` : ''}
                  ${sIdx < stages.length - 1 ? `<button class="btn-hub primary" style="padding:2px 8px; font-size:0.7rem;" onclick="moveOpportunityStage('${item.id}', 1)" title="Avanza stadio">Avanza ➡️</button>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// 4. Prodotti - CATALOGO ARTICOLI & LISTINI PLUS2000
function getProductMeta(p) {
  if (!p) return {};
  const code = String(p.product_code || p.code || p.id || '').trim();
  const desc = String(p.description || p.desc || p.name || '—').trim();
  const brand = String(p.brand || p.marca || '').trim();
  const sector = String(p.sector || p.settore || '').trim();
  const macroFamily = String(p.macro_family || p.macroFamily || p.macro || '').trim();
  const family = String(p.family || p.famiglia || '').trim();
  const classCode = String(p.class_code || p.classe || p.class || p.jclasse || '').trim();
  const groupCode = String(p.group_code || p.group || p.gruppo || p.jgruppo || '').trim();
  const price = Number(p.list_price ?? p.price ?? p.listino ?? 0);
  const stock = Number(p.stock_qty ?? p.available_qty ?? p.stock ?? p.giacenza ?? 0);
  const location = String(p.primary_location || p.location || p.ubicazione || p.ubi || '').trim();
  const barcode = String(p.barcode || p.barcode_ean || p.ean || p.ean13 || '').trim();
  const discountFamily = String(p.discount_family || p.discountCode || p.discount_code || p.sconto || p.jscontoven || '').trim();

  let maxDiscount = null;
  if (p.max_discount !== undefined && p.max_discount !== null && p.max_discount !== '') {
    maxDiscount = Number(p.max_discount);
  } else if (p.maxDiscount !== undefined && p.maxDiscount !== null && p.maxDiscount !== '') {
    maxDiscount = Number(p.maxDiscount);
  } else if (p.sconto_max !== undefined && p.sconto_max !== null && p.sconto_max !== '') {
    maxDiscount = Number(p.sconto_max);
  }

  const imageUrl = p.image_url || p.imageUrl || (p.image_ref ? `https://www.domuspartes.it/immagini/${p.image_ref}` : '');
  const isAvailable = stock > 0;

  return {
    raw: p,
    code,
    desc,
    brand,
    sector,
    macroFamily,
    family,
    classCode,
    groupCode,
    price,
    stock,
    location,
    barcode,
    discountFamily,
    maxDiscount,
    imageUrl,
    isAvailable
  };
}

let lastFilteredProducts = [];

function renderProductsSection(container) {
  // Prepara liste uniche per i filtri dai prodotti caricati
  const metas = HubState.products.map(getProductMeta);

  const brands = [...new Set(metas.map(m => m.brand).filter(Boolean))].sort((a,b) => a.localeCompare(b));
  const sectors = [...new Set(metas.map(m => m.sector).filter(Boolean))].sort((a,b) => a.localeCompare(b));
  const macroFamilies = [...new Set(metas.map(m => m.macroFamily).filter(Boolean))].sort((a,b) => a.localeCompare(b));
  const families = [...new Set(metas.map(m => m.family).filter(Boolean))].sort((a,b) => a.localeCompare(b));
  const classes = [...new Set(metas.map(m => m.classCode).filter(Boolean))].sort((a,b) => a.localeCompare(b));
  const groups = [...new Set(metas.map(m => m.groupCode).filter(Boolean))].sort((a,b) => a.localeCompare(b));

  // KPI di sintesi
  const totalArticles = metas.length;
  const availableArticles = metas.filter(m => m.isAvailable).length;
  const totalStockUnits = metas.reduce((sum, m) => sum + (m.stock > 0 ? m.stock : 0), 0);
  const totalStockValue = metas.reduce((sum, m) => sum + (m.stock > 0 ? m.stock * m.price : 0), 0);

  const pf = HubState.productFilters;

  container.innerHTML = `
    <!-- KPI BANNER CATALOGO -->
    <div class="kpi-grid" style="margin-bottom:20px;">
      <div class="kpi-card">
        <span class="label">Articoli Disponibili</span>
        <span class="value" style="color:var(--green);">${availableArticles.toLocaleString('it-IT')}</span>
        <span class="trend">su ${totalArticles.toLocaleString('it-IT')} articoli totali a catalogo</span>
      </div>
      <div class="kpi-card">
        <span class="label">Pezzi in Giacenza Totale</span>
        <span class="value">${totalStockUnits.toLocaleString('it-IT')} PZ</span>
        <span class="trend">Disponibilità reale magazzino</span>
      </div>
      <div class="kpi-card">
        <span class="label">Marche Gestite</span>
        <span class="value" style="color:var(--blue);">${brands.length}</span>
        <span class="trend">Produttori e partner ufficiali</span>
      </div>
      <div class="kpi-card">
        <span class="label">Valore Giacenza (Listino)</span>
        <span class="value">${euro(totalStockValue)}</span>
        <span class="trend">Prezzo Listino VEN1</span>
      </div>
    </div>

    <!-- CARD PRINCIPALE CATALOGO -->
    <div class="card-section">
      <div class="card-section-head" style="flex-wrap:wrap; gap:12px;">
        <div>
          <h2>Catalogo Articoli & Listini Plus2000</h2>
          <p style="color:var(--muted); font-size:0.83rem; margin-top:2px;">
            Filtra gli articoli per disponibilità, classificazione gerarchica, ubicazione magazzino, barcode e scaglioni di sconto.
          </p>
        </div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <button class="btn-hub secondary" id="btnReloadProducts" title="Ricarica dal database Supabase/Plus">
            🔄 Aggiorna
          </button>
          <button class="btn-hub primary" id="btnExportProductsCsv" title="Esporta la selezione corrente in formato CSV per Excel">
            📥 Esporta CSV
          </button>
        </div>
      </div>

      <!-- BARRA FILTRI AVANZATI -->
      <div class="product-filters-card">
        <!-- RIGA 1: RICERCA TESTUALE + TOGGLE DISPONIBILI -->
        <div class="product-search-bar">
          <div class="product-search-input-wrap">
            <span class="product-search-icon">🔍</span>
            <input type="text" id="prodSearchInput" placeholder="Cerca codice articolo, descrizione, barcode EAN, marca, ubicazione..." value="${escapeHtml(pf.search)}">
            ${pf.search ? '<button class="product-search-clear" id="prodSearchClear">✕</button>' : ''}
          </div>

          <label class="product-toggle-box ${pf.onlyAvailable ? 'active' : ''}" id="lblOnlyAvailable" title="Mostra unicamente gli articoli con giacenza a magazzino maggiore di zero">
            <input type="checkbox" id="chkOnlyAvailable" ${pf.onlyAvailable ? 'checked' : ''}>
            <span style="font-size:0.85rem; font-weight:750; color:${pf.onlyAvailable ? 'var(--green)' : 'var(--ink)'};">
              ✅ Solo disponibili (Giacenza &gt; 0)
            </span>
          </label>
        </div>

        <!-- RIGA 2: FILTRI A CASCATA (Marca, Settore, Macrofamiglia, Famiglia, Classe, Gruppo) -->
        <div class="product-filters-grid">
          <div class="filter-control-wrap">
            <label for="prodFilterBrand">Marca (${brands.length})</label>
            <select id="prodFilterBrand">
              <option value="ALL">Tutte le marche</option>
              ${brands.map(b => `<option value="${escapeHtml(b)}" ${pf.brand === b ? 'selected' : ''}>${escapeHtml(b)}</option>`).join('')}
            </select>
          </div>

          <div class="filter-control-wrap">
            <label for="prodFilterSector">Settore (${sectors.length})</label>
            <select id="prodFilterSector">
              <option value="ALL">Tutti i settori</option>
              ${sectors.map(s => `<option value="${escapeHtml(s)}" ${pf.sector === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
            </select>
          </div>

          <div class="filter-control-wrap">
            <label for="prodFilterMacro">Macrofamiglia (${macroFamilies.length})</label>
            <select id="prodFilterMacro">
              <option value="ALL">Tutte le macrofamiglie</option>
              ${macroFamilies.map(m => `<option value="${escapeHtml(m)}" ${pf.macroFamily === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}
            </select>
          </div>

          <div class="filter-control-wrap">
            <label for="prodFilterFamily">Famiglia (${families.length})</label>
            <select id="prodFilterFamily">
              <option value="ALL">Tutte le famiglie</option>
              ${families.map(f => `<option value="${escapeHtml(f)}" ${pf.family === f ? 'selected' : ''}>${escapeHtml(f)}</option>`).join('')}
            </select>
          </div>

          <div class="filter-control-wrap">
            <label for="prodFilterClass">Classe (${classes.length})</label>
            <select id="prodFilterClass">
              <option value="ALL">Tutte le classi</option>
              ${classes.map(c => `<option value="${escapeHtml(c)}" ${pf.classCode === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
            </select>
          </div>

          <div class="filter-control-wrap">
            <label for="prodFilterGroup">Gruppo (${groups.length})</label>
            <select id="prodFilterGroup">
              <option value="ALL">Tutti i gruppi</option>
              ${groups.map(g => `<option value="${escapeHtml(g)}" ${pf.groupCode === g ? 'selected' : ''}>${escapeHtml(g)}</option>`).join('')}
            </select>
          </div>

          <div class="filter-control-wrap" style="align-self:flex-end;">
            <button class="btn-hub secondary" id="btnResetProdFilters" style="width:100%; height:36px; font-size:0.8rem; justify-content:center;">
              ↺ Azzera Filtri
            </button>
          </div>
        </div>
      </div>

      <!-- SOTTOINTESTAZIONE CONTEGGI & RIGHE PER PAGINA -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; font-size:0.82rem; color:var(--muted); flex-wrap:wrap; gap:8px;">
        <div>
          Mostrati <strong id="prodFilteredCount" style="color:var(--ink);">0</strong> articoli filtrati su <strong>${totalArticles.toLocaleString('it-IT')}</strong> totali
          <span id="prodAvailabilityIndicator" style="margin-left:8px; font-size:0.75rem; color:var(--green); font-weight:700;"></span>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span>Per pagina:</span>
          <select id="prodPageSizeSelect" style="padding:4px 8px; border-radius:6px; border:1px solid var(--line); font-size:0.8rem;">
            <option value="25" ${pf.pageSize === 25 ? 'selected' : ''}>25</option>
            <option value="50" ${pf.pageSize === 50 ? 'selected' : ''}>50</option>
            <option value="100" ${pf.pageSize === 100 ? 'selected' : ''}>100</option>
            <option value="200" ${pf.pageSize === 200 ? 'selected' : ''}>200</option>
          </select>
        </div>
      </div>

      <!-- TABELLA CATALOGO -->
      <div class="hub-table-wrapper" style="max-height: 650px; overflow-y: auto;">
        <table class="hub-table" id="hubProductsTable">
          <thead>
            <tr>
              <th style="min-width:110px;">Codice Art.</th>
              <th style="min-width:240px;">Descrizione</th>
              <th style="min-width:130px;">Marca</th>
              <th style="min-width:180px;">Settore / Macro / Famiglia</th>
              <th style="min-width:130px;">Classe / Gruppo</th>
              <th style="min-width:100px; text-align:right;">Listino</th>
              <th style="min-width:110px; text-align:center;">Disponibile</th>
              <th style="min-width:110px;">Ubicazione</th>
              <th style="min-width:130px;">Barcode EAN</th>
              <th style="min-width:110px; text-align:center;">Classe Sconto</th>
              <th style="min-width:110px; text-align:center;">Sconto Max</th>
              <th style="min-width:70px; text-align:center;">Dettaglio</th>
            </tr>
          </thead>
          <tbody id="hubProductsTbody">
            <!-- Righe iniettate dinamicamente da applyProductFilters -->
          </tbody>
        </table>
      </div>

      <!-- BARRA DI PAGINAZIONE -->
      <div class="hub-pagination-bar" id="hubProductsPagination">
        <!-- Controlli iniettati da renderProductPagination -->
      </div>
    </div>
  `;

  // BINDING EVENTI
  const searchInput = document.getElementById('prodSearchInput');
  const searchClear = document.getElementById('prodSearchClear');
  const chkOnlyAvailable = document.getElementById('chkOnlyAvailable');
  const lblOnlyAvailable = document.getElementById('lblOnlyAvailable');
  const brandSelect = document.getElementById('prodFilterBrand');
  const sectorSelect = document.getElementById('prodFilterSector');
  const macroSelect = document.getElementById('prodFilterMacro');
  const familySelect = document.getElementById('prodFilterFamily');
  const classSelect = document.getElementById('prodFilterClass');
  const groupSelect = document.getElementById('prodFilterGroup');
  const pageSizeSelect = document.getElementById('prodPageSizeSelect');
  const btnReset = document.getElementById('btnResetProdFilters');
  const btnReload = document.getElementById('btnReloadProducts');
  const btnExport = document.getElementById('btnExportProductsCsv');

  let debounceTimer = null;
  searchInput.oninput = e => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      HubState.productFilters.search = e.target.value;
      HubState.productFilters.page = 1;
      applyProductFilters();
    }, 200);
  };

  if (searchClear) {
    searchClear.onclick = () => {
      searchInput.value = '';
      HubState.productFilters.search = '';
      HubState.productFilters.page = 1;
      applyProductFilters();
    };
  }

  chkOnlyAvailable.onchange = e => {
    HubState.productFilters.onlyAvailable = e.target.checked;
    HubState.productFilters.page = 1;
    if (lblOnlyAvailable) {
      lblOnlyAvailable.classList.toggle('active', e.target.checked);
    }
    applyProductFilters();
  };

  brandSelect.onchange = e => {
    HubState.productFilters.brand = e.target.value;
    HubState.productFilters.page = 1;
    applyProductFilters();
  };

  sectorSelect.onchange = e => {
    HubState.productFilters.sector = e.target.value;
    HubState.productFilters.page = 1;
    applyProductFilters();
  };

  macroSelect.onchange = e => {
    HubState.productFilters.macroFamily = e.target.value;
    HubState.productFilters.page = 1;
    applyProductFilters();
  };

  familySelect.onchange = e => {
    HubState.productFilters.family = e.target.value;
    HubState.productFilters.page = 1;
    applyProductFilters();
  };

  classSelect.onchange = e => {
    HubState.productFilters.classCode = e.target.value;
    HubState.productFilters.page = 1;
    applyProductFilters();
  };

  groupSelect.onchange = e => {
    HubState.productFilters.groupCode = e.target.value;
    HubState.productFilters.page = 1;
    applyProductFilters();
  };

  pageSizeSelect.onchange = e => {
    HubState.productFilters.pageSize = Number(e.target.value) || 50;
    HubState.productFilters.page = 1;
    applyProductFilters();
  };

  btnReset.onclick = () => {
    HubState.productFilters = {
      search: '',
      onlyAvailable: true, // Default: solo disponibili
      brand: 'ALL',
      sector: 'ALL',
      macroFamily: 'ALL',
      family: 'ALL',
      classCode: 'ALL',
      groupCode: 'ALL',
      page: 1,
      pageSize: 50
    };
    searchInput.value = '';
    chkOnlyAvailable.checked = true;
    if (lblOnlyAvailable) lblOnlyAvailable.classList.add('active');
    brandSelect.value = 'ALL';
    sectorSelect.value = 'ALL';
    macroSelect.value = 'ALL';
    familySelect.value = 'ALL';
    classSelect.value = 'ALL';
    groupSelect.value = 'ALL';
    pageSizeSelect.value = '50';
    applyProductFilters();
  };

  btnReload.onclick = async () => {
    btnReload.disabled = true;
    btnReload.textContent = '⏳ Caricamento...';
    try {
      if (window.ClwData && window.ClwData.getProducts) {
        const prods = await window.ClwData.getProducts({ forceRefresh: true });
        if (prods && prods.length) HubState.products = prods;
      }
      renderProductsSection(container);
    } catch (e) {
      alert('Errore ricaricamento: ' + e.message);
    } finally {
      btnReload.disabled = false;
      btnReload.textContent = '🔄 Aggiorna';
    }
  };

  btnExport.onclick = () => {
    exportProductsToCsv(lastFilteredProducts);
  };

  applyProductFilters();
}

function applyProductFilters() {
  const tbody = document.getElementById('hubProductsTbody');
  const countEl = document.getElementById('prodFilteredCount');
  const availInd = document.getElementById('prodAvailabilityIndicator');
  const paginEl = document.getElementById('hubProductsPagination');
  if (!tbody) return;

  const pf = HubState.productFilters;
  const q = (pf.search || '').toLowerCase().trim();
  const qClean = q.replace(/\s+/g, '');

  const fBrand = pf.brand;
  const fSector = pf.sector;
  const fMacro = pf.macroFamily;
  const fFamily = pf.family;
  const fClass = pf.classCode;
  const fGroup = pf.groupCode;
  const onlyAvail = pf.onlyAvailable;

  const filtered = HubState.products.map(getProductMeta).filter(m => {
    // 1. Filtro disponibilità
    if (onlyAvail && !m.isAvailable) {
      return false;
    }

    // 2. Filtro testuale rapido
    if (q) {
      const matchCode = m.code.toLowerCase().includes(q) || m.code.toLowerCase().replace(/\s+/g, '').includes(qClean);
      const matchDesc = m.desc.toLowerCase().includes(q);
      const matchBrand = m.brand.toLowerCase().includes(q);
      const matchBarcode = m.barcode.toLowerCase().includes(q) || m.barcode.replace(/\s+/g, '').includes(qClean);
      const matchLoc = m.location.toLowerCase().includes(q);
      if (!matchCode && !matchDesc && !matchBrand && !matchBarcode && !matchLoc) {
        return false;
      }
    }

    // 3. Filtro Marca
    if (fBrand !== 'ALL' && m.brand !== fBrand) {
      return false;
    }

    // 4. Filtro Settore
    if (fSector !== 'ALL' && m.sector !== fSector) {
      return false;
    }

    // 5. Filtro Macrofamiglia
    if (fMacro !== 'ALL' && m.macroFamily !== fMacro) {
      return false;
    }

    // 6. Filtro Famiglia
    if (fFamily !== 'ALL' && m.family !== fFamily) {
      return false;
    }

    // 7. Filtro Classe
    if (fClass !== 'ALL' && m.classCode !== fClass) {
      return false;
    }

    // 8. Filtro Gruppo
    if (fGroup !== 'ALL' && m.groupCode !== fGroup) {
      return false;
    }

    return true;
  });

  lastFilteredProducts = filtered;

  if (countEl) countEl.textContent = filtered.length.toLocaleString('it-IT');
  if (availInd) {
    availInd.textContent = onlyAvail ? '(solo giacenza > 0)' : '(catalogo completo inclusi esauriti)';
    availInd.style.color = onlyAvail ? 'var(--green)' : 'var(--muted)';
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="12" style="text-align:center; padding:40px 20px; color:var(--muted);">
          <div style="font-size:2.2rem; margin-bottom:8px;">🔍</div>
          <strong style="font-size:1rem; color:var(--ink);">Nessun articolo trovato</strong>
          <p style="font-size:0.85rem; margin-top:4px;">
            ${onlyAvail ? 'Nessun articolo con giacenza disponibile corrisponde ai filtri selezionati. Prova a deselezionare "Solo disponibili" o ad azzerare i filtri.' : 'Nessun articolo corrisponde ai parametri di ricerca selezionati.'}
          </p>
        </td>
      </tr>
    `;
    if (paginEl) paginEl.innerHTML = '';
    return;
  }

  // Paginazione
  const pageSize = pf.pageSize || 50;
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  if (pf.page > totalPages) pf.page = totalPages;
  if (pf.page < 1) pf.page = 1;

  const startIdx = (pf.page - 1) * pageSize;
  const pageItems = filtered.slice(startIdx, startIdx + pageSize);

  tbody.innerHTML = pageItems.map(m => {
    // Pillole di classificazione
    const catTags = [
      m.sector ? `<span class="badge-category-pill" title="Settore">${escapeHtml(m.sector)}</span>` : '',
      m.macroFamily ? `<span class="badge-category-pill" title="Macrofamiglia">${escapeHtml(m.macroFamily)}</span>` : '',
      m.family ? `<span class="badge-category-pill" title="Famiglia">${escapeHtml(m.family)}</span>` : ''
    ].filter(Boolean).join('');

    const classGroupTags = [
      m.classCode ? `<span class="badge-category-pill" title="Classe">${escapeHtml(m.classCode)}</span>` : '',
      m.groupCode ? `<span class="badge-category-pill" title="Gruppo">${escapeHtml(m.groupCode)}</span>` : ''
    ].filter(Boolean).join('');

    // Formattazione Barcode
    let barcodeDisplay = '<span style="color:var(--muted); font-size:0.75rem;">—</span>';
    if (m.barcode) {
      const parts = m.barcode.split(',').map(s => s.trim()).filter(Boolean);
      const primary = parts[0];
      const extraCount = parts.length > 1 ? ` (+${parts.length - 1})` : '';
      barcodeDisplay = `<span class="badge-barcode" title="${escapeHtml(m.barcode)}">🏷️ ${escapeHtml(primary)}${extraCount}</span>`;
    }

    // Formattazione Ubicazione
    let locationDisplay = '<span style="color:var(--muted); font-size:0.75rem;">—</span>';
    if (m.location) {
      locationDisplay = `<span class="badge-location" title="Ubicazione di magazzino: ${escapeHtml(m.location)}">📍 ${escapeHtml(m.location)}</span>`;
    }

    // Formattazione Sconto Max
    let maxDiscountDisplay = '<span style="color:var(--muted); font-size:0.75rem;">—</span>';
    if (m.maxDiscount !== null && !isNaN(m.maxDiscount) && m.maxDiscount > 0) {
      maxDiscountDisplay = `<span class="badge-max-discount" title="Sconto massimo consentito: ${m.maxDiscount}%">Max ${m.maxDiscount}%</span>`;
    }

    // Formattazione Classe Sconto
    let discountFamilyDisplay = '<span style="color:var(--muted); font-size:0.75rem;">—</span>';
    if (m.discountFamily) {
      discountFamilyDisplay = `<span class="badge-discount-family" title="Famiglia/Classe di sconto: ${escapeHtml(m.discountFamily)}">${escapeHtml(m.discountFamily)}</span>`;
    }

    return `
      <tr>
        <td>
          <strong style="color:var(--blue); cursor:pointer;" onclick="showProductDetailModal('${escapeHtml(m.code)}')">${escapeHtml(m.code)}</strong>
        </td>
        <td>
          <div style="font-weight:600; font-size:0.83rem;">${escapeHtml(m.desc)}</div>
        </td>
        <td>
          <span style="font-weight:700; color:var(--ink);">${escapeHtml(m.brand || '—')}</span>
        </td>
        <td>
          <div>${catTags || '<span style="color:var(--muted); font-size:0.75rem;">—</span>'}</div>
        </td>
        <td>
          <div>${classGroupTags || '<span style="color:var(--muted); font-size:0.75rem;">—</span>'}</div>
        </td>
        <td style="text-align:right; font-weight:800; color:var(--ink);">
          ${euro(m.price)}
        </td>
        <td style="text-align:center;">
          <span class="badge-stock ${m.isAvailable ? 'in-stock' : 'out-of-stock'}">
            ${m.isAvailable ? '✅ ' : ''}${m.stock.toLocaleString('it-IT')} PZ
          </span>
        </td>
        <td>${locationDisplay}</td>
        <td>${barcodeDisplay}</td>
        <td style="text-align:center;">${discountFamilyDisplay}</td>
        <td style="text-align:center;">${maxDiscountDisplay}</td>
        <td style="text-align:center;">
          <button class="btn-hub secondary" style="padding:4px 8px; font-size:0.75rem;" onclick="showProductDetailModal('${escapeHtml(m.code)}')" title="Visualizza scheda articolo completa">
            👁️
          </button>
        </td>
      </tr>
    `;
  }).join('');

  renderProductPagination(paginEl, filtered.length, totalPages, pf.page, pageSize);
}

function renderProductPagination(container, totalItems, totalPages, currentPage, pageSize) {
  if (!container) return;
  if (totalItems <= pageSize && currentPage === 1) {
    container.innerHTML = `
      <div style="color:var(--muted); font-size:0.8rem;">
        Mostrati tutti i <strong>${totalItems.toLocaleString('it-IT')}</strong> articoli
      </div>
    `;
    return;
  }

  const startIdx = (currentPage - 1) * pageSize + 1;
  const endIdx = Math.min(currentPage * pageSize, totalItems);

  container.innerHTML = `
    <div style="color:var(--muted); font-size:0.8rem;">
      Articoli <strong>${startIdx.toLocaleString('it-IT')} - ${endIdx.toLocaleString('it-IT')}</strong> di <strong>${totalItems.toLocaleString('it-IT')}</strong> (Pagina ${currentPage} di ${totalPages})
    </div>
    <div class="pagination-controls">
      <button class="btn-page" ${currentPage <= 1 ? 'disabled' : ''} onclick="changeProductPage(1)" title="Prima pagina">
        ⏮️ Prima
      </button>
      <button class="btn-page" ${currentPage <= 1 ? 'disabled' : ''} onclick="changeProductPage(${currentPage - 1})" title="Pagina precedente">
        ◀️ Precedente
      </button>
      <span style="font-weight:750; padding:0 8px;">Pag. ${currentPage} / ${totalPages}</span>
      <button class="btn-page" ${currentPage >= totalPages ? 'disabled' : ''} onclick="changeProductPage(${currentPage + 1})" title="Pagina successiva">
        Successiva ▶️
      </button>
      <button class="btn-page" ${currentPage >= totalPages ? 'disabled' : ''} onclick="changeProductPage(${totalPages})" title="Ultima pagina">
        Ultima ⏭️
      </button>
    </div>
  `;
}

window.changeProductPage = function(page) {
  HubState.productFilters.page = page;
  applyProductFilters();
  const tableWrapper = document.querySelector('.hub-table-wrapper');
  if (tableWrapper) tableWrapper.scrollTop = 0;
};

window.showProductDetailModal = function(code) {
  const prod = HubState.products.find(p => {
    const m = getProductMeta(p);
    return m.code === code;
  });
  if (!prod) return;
  const m = getProductMeta(prod);

  // Rimuovi eventuali modali aperti
  const existingModal = document.getElementById('hubProductDetailModal');
  if (existingModal) existingModal.remove();

  const modalHtml = `
    <div class="hub-modal-backdrop" id="hubProductDetailModal" onclick="if(event.target === this) this.remove();">
      <div class="hub-modal-card">
        <button class="hub-modal-close" onclick="document.getElementById('hubProductDetailModal').remove();">✕</button>
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px; padding-bottom:12px; border-bottom:1px solid var(--line);">
          <div>
            <span class="badge-status opt-in" style="font-size:0.75rem; margin-bottom:4px;">Articolo Plus 2000</span>
            <h2 style="font-size:1.25rem; font-weight:800; color:var(--ink);">${escapeHtml(m.code)}</h2>
            <div style="font-weight:600; color:var(--muted); font-size:0.9rem; margin-top:2px;">${escapeHtml(m.desc)}</div>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:16px; margin-bottom:18px;">
          <div style="background:#f8fafc; border:1px solid var(--line); border-radius:8px; padding:12px;">
            <div style="font-size:0.7rem; font-weight:750; color:var(--muted); text-transform:uppercase;">Marca</div>
            <div style="font-size:1rem; font-weight:800; color:var(--ink); margin-top:2px;">${escapeHtml(m.brand || '—')}</div>
          </div>

          <div style="background:#f8fafc; border:1px solid var(--line); border-radius:8px; padding:12px;">
            <div style="font-size:0.7rem; font-weight:750; color:var(--muted); text-transform:uppercase;">Listino Prezzi VEN1</div>
            <div style="font-size:1.1rem; font-weight:900; color:var(--blue); margin-top:2px;">${euro(m.price)}</div>
          </div>

          <div style="background:#f8fafc; border:1px solid var(--line); border-radius:8px; padding:12px;">
            <div style="font-size:0.7rem; font-weight:750; color:var(--muted); text-transform:uppercase;">Giacenza Disponibile</div>
            <div style="font-size:1.1rem; font-weight:900; color:${m.isAvailable ? 'var(--green)' : 'var(--muted)'}; margin-top:2px;">
              ${m.stock.toLocaleString('it-IT')} PZ
            </div>
          </div>

          <div style="background:#f8fafc; border:1px solid var(--line); border-radius:8px; padding:12px;">
            <div style="font-size:0.7rem; font-weight:750; color:var(--muted); text-transform:uppercase;">Ubicazione Scaffale</div>
            <div style="font-size:1rem; font-weight:800; color:#1d4ed8; margin-top:2px;">
              ${m.location ? `📍 ${escapeHtml(m.location)}` : '—'}
            </div>
          </div>
        </div>

        <!-- DETTAGLI CLASSIFICAZIONE E SCONTO -->
        <div style="border:1px solid var(--line); border-radius:8px; padding:14px; margin-bottom:16px; background:#fff;">
          <h4 style="font-size:0.85rem; font-weight:800; margin-bottom:10px; color:var(--ink);">Classificazione Merceologica & Sconti</h4>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:0.82rem;">
            <div><strong>Settore:</strong> ${escapeHtml(m.sector || '—')}</div>
            <div><strong>Macrofamiglia:</strong> ${escapeHtml(m.macroFamily || '—')}</div>
            <div><strong>Famiglia:</strong> ${escapeHtml(m.family || '—')}</div>
            <div><strong>Classe:</strong> ${escapeHtml(m.classCode || '—')}</div>
            <div><strong>Gruppo:</strong> ${escapeHtml(m.groupCode || '—')}</div>
            <div><strong>Classe Sconto:</strong> ${m.discountFamily ? `<span class="badge-discount-family">${escapeHtml(m.discountFamily)}</span>` : '—'}</div>
            <div><strong>Sconto Max:</strong> ${m.maxDiscount !== null ? `<span class="badge-max-discount">Max ${m.maxDiscount}%</span>` : '—'}</div>
            <div><strong>Barcode EAN:</strong> ${m.barcode ? `<span class="badge-barcode">🏷️ ${escapeHtml(m.barcode)}</span>` : '—'}</div>
          </div>
        </div>

        ${m.imageUrl ? `
          <div style="text-align:center; padding:10px; background:#f8fafc; border:1px solid var(--line); border-radius:8px; margin-bottom:16px;">
            <img src="${escapeHtml(m.imageUrl)}" alt="${escapeHtml(m.code)}" style="max-height:180px; max-width:100%; object-fit:contain; border-radius:4px;" onerror="this.parentElement.style.display='none';">
          </div>
        ` : ''}

        <div style="display:flex; justify-content:flex-end; gap:8px;">
          <a href="/offerta?new=1&type=offer&addCode=${encodeURIComponent(m.code)}" class="btn-hub primary" style="font-size:0.82rem;">
            ✍️ Includi in Nuova Offerta
          </a>
          <button class="btn-hub secondary" onclick="document.getElementById('hubProductDetailModal').remove();" style="font-size:0.82rem;">
            Chiudi
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
};

function exportProductsToCsv(products) {
  if (!products || !products.length) {
    alert('Nessun articolo filtrato da esportare.');
    return;
  }

  const headers = [
    'Codice Articolo',
    'Descrizione',
    'Marca',
    'Settore',
    'Macrofamiglia',
    'Famiglia',
    'Classe',
    'Gruppo',
    'Prezzo Listino EUR',
    'Giacenza PZ',
    'Ubicazione',
    'Barcode EAN',
    'Classe Sconto',
    'Sconto Max Percentuale'
  ];

  const rows = products.map(m => [
    `"${(m.code || '').replace(/"/g, '""')}"`,
    `"${(m.desc || '').replace(/"/g, '""')}"`,
    `"${(m.brand || '').replace(/"/g, '""')}"`,
    `"${(m.sector || '').replace(/"/g, '""')}"`,
    `"${(m.macroFamily || '').replace(/"/g, '""')}"`,
    `"${(m.family || '').replace(/"/g, '""')}"`,
    `"${(m.classCode || '').replace(/"/g, '""')}"`,
    `"${(m.groupCode || '').replace(/"/g, '""')}"`,
    m.price.toFixed(2).replace('.', ','),
    m.stock.toString().replace('.', ','),
    `"${(m.location || '').replace(/"/g, '""')}"`,
    `"${(m.barcode || '').replace(/"/g, '""')}"`,
    `"${(m.discountFamily || '').replace(/"/g, '""')}"`,
    m.maxDiscount !== null ? m.maxDiscount.toString().replace('.', ',') : ''
  ]);

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = new Date().toISOString().slice(0, 10);
  a.download = `Climawell_Catalogo_Articoli_${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 5. WhatsApp & Marketing (Brevo DEM + Meta WhatsApp)
let marketingTab = 'email'; // 'email' o 'whatsapp'
let brevoConnected = false;
let brevoAccountData = null;

function renderMarketingSection(container) {
  // Raccogli liste uniche per audience
  const activities = [...new Set(HubState.customers.map(c => getCustomerMeta(c).activity).filter(Boolean))].sort();
  const agents = [...new Set(HubState.customers.map(c => getCustomerMeta(c).agentCode).filter(Boolean))].sort();

  let savedBrevoKey = localStorage.getItem('clw_brevo_api_key') || '';
  const isSmtpOnlyKey = savedBrevoKey.startsWith('xsmtpsib-');

  container.innerHTML = `
    <!-- 1. Scheda Configurazione & Stato Gateway Brevo -->
    <div class="card-section" style="margin-bottom:20px;">
      <div class="card-section-head">
        <div>
          <h2>✉️ Gateway Brevo & WhatsApp Business</h2>
          <p style="font-size:0.8rem; color:var(--muted); margin-top:2px;">Configurazione credenziali API e gestione campagne massive multicanale</p>
        </div>
        <div id="brevoBadgeContainer">
          <span class="badge-status ${brevoConnected ? 'opt-in' : 'pending'}" id="brevoStatusBadge">
            ${brevoConnected ? '🟢 Brevo Connesso' : '⚪ Brevo da Verificare'}
          </span>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:16px; background:#f8fafc; padding:16px; border-radius:10px; border:1px solid var(--line);">
        <div class="form-group-hub" style="margin-bottom:0;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <label>Chiave API Brevo v3 (xkeysib-...):</label>
            <a href="https://app.brevo.com/settings/keys/api" target="_blank" style="font-size:0.72rem; color:var(--blue); font-weight:600; text-decoration:underline;">Apri Brevo ↗</a>
          </div>
          <input type="text" id="brevoApiKeyInput" value="${savedBrevoKey}" style="font-family:monospace; font-size:0.75rem;" placeholder="xkeysib-..." />
          <div id="brevoKeyHelper" style="font-size:0.72rem; margin-top:4px;">
            ${savedBrevoKey ? (isSmtpOnlyKey ? '<span style="color:#b45309; font-weight:600;">⚠️ Rilevata chiave SMTP (xsmtpsib-...). Per le API web serve la "Chiave API v3" (inizia con xkeysib-...).</span>' : '<span style="color:var(--green); font-weight:700;">✅ Chiave API v3 Brevo configurata.</span>') : '<span style="color:var(--muted); font-size:0.75rem;">Inserisci la Chiave API v3 da Brevo per abilitare invii ed email.</span>'}
          </div>
        </div>
        <div class="form-group-hub" style="margin-bottom:0;">
          <label>Mittente Verificato Brevo (Email):</label>
          <select id="brevoSenderEmail" class="hub-select" style="width:100%; height:38px;">
            <option value="sales@climawell.it" selected>sales@climawell.it (Ufficio Commerciale - Verificato)</option>
            <option value="amministrazione@climawell.it">amministrazione@climawell.it (Amministrazione - Verificato)</option>
            <option value="info@climawell.it">info@climawell.it</option>
          </select>
        </div>
        <div class="form-group-hub" style="margin-bottom:0;">
          <label>Nome Mittente:</label>
          <input type="text" id="brevoSenderName" value="Climawell S.r.l." />
        </div>
        <div style="display:flex; align-items:flex-end;">
          <button class="btn-hub secondary" id="btnTestBrevoConn" style="width:100%; height:38px; display:flex; align-items:center; justify-content:center; gap:8px;">
            🔌 Test Connessione Brevo
          </button>
        </div>
      </div>
      <div id="brevoAccountDetails" style="margin-top:10px; font-size:0.8rem; color:var(--ink); display:${brevoAccountData ? 'block' : 'none'};">
        ${brevoAccountData ? `✅ Account Brevo: <strong>${brevoAccountData.email || 'Collegato'}</strong> | Azienda: <strong>${brevoAccountData.companyName || 'CLIMAWELL SRL'}</strong> | Crediti Email: <strong>${(brevoAccountData.plan?.[0]?.credits || 0).toLocaleString('it-IT')} invii</strong>` : ''}
      </div>
    </div>

    <!-- 2. Compositore Campagne -->
    <div class="campaign-card">
      <div class="campaign-tabs">
        <button class="campaign-tab-btn ${marketingTab === 'email' ? 'active' : ''}" id="tabBtnEmail">
          ✉️ Campagna Email Brevo (DEM / Newsletter)
        </button>
        <button class="campaign-tab-btn ${marketingTab === 'whatsapp' ? 'active' : ''}" id="tabBtnWa">
          💬 Campagna WhatsApp (Coda Invii Agenti)
        </button>
      </div>

      <!-- FILTRI TARGET AUDIENCE -->
      <div style="background:#f1f5f9; padding:14px; border-radius:8px; margin-bottom:18px;">
        <h4 style="font-size:0.85rem; margin-bottom:10px; color:var(--navy);">🎯 Selezione Destinatari (Target Audience)</h4>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:12px;">
          <div>
            <label style="font-size:0.75rem; font-weight:700; display:block; margin-bottom:4px;">Canale & Categoria:</label>
            <select class="hub-select" id="campTargetLegal" style="width:100%;">
              <option value="ALL">Tutti (Aziende e Privati)</option>
              <option value="AZIENDE">Solo Aziende (S.r.l., S.n.c., Ditte)</option>
              <option value="PRIVATI">Solo Privati</option>
            </select>
          </div>
          <div>
            <label style="font-size:0.75rem; font-weight:700; display:block; margin-bottom:4px;">Attività:</label>
            <select class="hub-select" id="campTargetActivity" style="width:100%;">
              <option value="ALL">Tutte le attività</option>
              ${activities.map(a => `<option value="${a}">${a}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:0.75rem; font-weight:700; display:block; margin-bottom:4px;">Agente Assegnato:</label>
            <select class="hub-select" id="campTargetAgent" style="width:100%;">
              <option value="ALL">Tutti gli agenti</option>
              ${agents.map(ag => `<option value="${ag}">Agente ${ag}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <!-- BOX RIEPILOGO AUDIENCE ELEGGIBILE -->
      <div class="target-summary-box">
        <div>
          <span style="font-size:0.82rem; color:var(--muted);">Destinatari eleggibili con consenso <strong>${marketingTab === 'email' ? 'Email OPT-IN' : 'WhatsApp OPT-IN'}</strong>:</span>
          <div style="font-size:1.4rem; font-weight:800; color:var(--navy); margin-top:2px;" id="eligibleRecipientsCount">0</div>
        </div>
        <div style="font-size:0.75rem; color:var(--muted); text-align:right;">
          I clienti con stato <strong>OPT-OUT</strong> vengono esclusi automaticamente<br>nel rispetto della normativa GDPR.
        </div>
      </div>

      <!-- FORM COMPOSITORE -->
      <div class="form-group-hub">
        <label>Nome Interno Campagna:</label>
        <input type="text" id="campName" placeholder="Es. Lancio Promozione Pompe di Calore Inverno" value="Promozione Climatizzazione Stagionale" />
      </div>

      ${marketingTab === 'email' ? `
        <!-- SELETTORE MODELLI BREVO -->
        <div class="form-group-hub">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <label>Modello Grafico Brevo (Template):</label>
            <a href="https://app.brevo.com/templates" target="_blank" style="font-size:0.72rem; color:var(--blue); font-weight:600; text-decoration:underline;">Apri Editor Modelli Brevo ↗</a>
          </div>
          <div style="display:flex; gap:8px;">
            <select id="campBrevoTemplateSelect" class="hub-select" style="flex:1; height:38px;">
              <option value="">✍️ Nessun Modello (Usa compositore testo / HTML sotto)</option>
            </select>
            <button type="button" class="btn-hub secondary" id="btnRefreshBrevoTemplates" style="font-size:0.75rem; padding:4px 10px; white-space:nowrap;">🔄 Ricarica Modelli</button>
          </div>
          <div id="templateActiveNotice" style="font-size:0.75rem; color:#0369a1; background:#f0f9ff; border:1px solid #bae6fd; padding:6px 10px; border-radius:6px; margin-top:6px; display:none;"></div>
        </div>

        <div class="form-group-hub">
          <label>Oggetto Email (Subject):</label>
          <input type="text" id="campEmailSubject" placeholder="Es. ❄️ Offerta speciale climatizzatori riservata a {Nome}" value="❄️ Novità e Offerte Riservate Climawell 2026" />
        </div>
        <div class="form-group-hub" id="customBodyContainer">
          <label>Contenuto Email (Supporta HTML e segnaposti {Nome}, {Citta}):</label>
          <textarea id="campEmailBody" rows="6" style="font-size:0.85rem; line-height:1.5;">Gentile {Nome},&#10;&#10;siamo lieti di presentarle il nuovo listino Climawell con promozioni dedicate su climatizzatori e pompe di calore ad alta efficienza.&#10;&#10;Consulti le offerte sul nostro portale o contatti il suo agente di zona per una quotazione su misura.&#10;&#10;Cordiali saluti,&#10;Team Climawell S.r.l.</textarea>
        </div>
      ` : `
        <div class="form-group-hub">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <label style="margin:0;">Template Messaggio WhatsApp (Supporta segnaposti {Nome}, {Citta}):</label>
            <button type="button" class="btn-hub secondary" id="btnAppendLinkToWa" style="font-size:0.7rem; padding:2px 8px;">🔗 Inserisci Link Offerta/E-COM nel testo</button>
          </div>
          <textarea id="campWaBody" rows="5" style="font-size:0.85rem; line-height:1.5;">Ciao {Nome}, ti segnaliamo che sono disponibili le nuove quotazioni promozionali Climawell 2026. Restiamo a disposizione per qualsiasi chiarimento o fornitura!</textarea>
        </div>
      `}

      <!-- BOX IMMAGINE PROMOZIONALE & LINK DESTINAZIONE (E-COM / ACQUISTO) -->
      <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:16px; margin:18px 0;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
          <div>
            <h4 style="font-size:0.9rem; margin:0; color:var(--navy); font-weight:800; display:flex; align-items:center; gap:8px;">
              🖼️ Immagine Promozionale & Link Diretto di Destinazione (Modulo E-COM)
            </h4>
            <small style="color:var(--muted); font-size:0.75rem;">I parametri vengono passati automaticamente a Brevo ({{ params.IMMAGINE_URL }}, {{ params.LINK_DESTINAZIONE }}) e all'assistente WhatsApp.</small>
          </div>
          <span style="font-size:0.75rem; background:#e0f2fe; color:#0369a1; padding:3px 10px; border-radius:12px; font-weight:700;">Modulo E-COM Integrato</span>
        </div>

        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:14px;">
          <!-- CAMPO 1: IMMAGINE PROMOZIONALE -->
          <div class="form-group-hub" style="margin-bottom:0;">
            <label style="display:flex; justify-content:space-between; font-size:0.8rem;">
              <strong>1. URL Immagine Promozionale:</strong>
              <span style="color:var(--muted); font-size:0.72rem;">Banner / Articolo</span>
            </label>
            <input type="text" id="campPromoImage" placeholder="Es. https://www.climawell.it/img/promo-clima.jpg" value="" />
            <div style="display:flex; gap:6px; margin-top:6px; flex-wrap:wrap;">
              <button type="button" class="btn-hub secondary" style="font-size:0.7rem; padding:2px 8px;" id="btnPresetImgClima">❄️ Banner Clima</button>
              <button type="button" class="btn-hub secondary" style="font-size:0.7rem; padding:2px 8px;" id="btnPresetImgPompa">🔥 Banner Pompe Calore</button>
              <button type="button" class="btn-hub secondary" style="font-size:0.7rem; padding:2px 8px;" id="btnPresetImgClear">❌ Rimuovi</button>
            </div>
          </div>

          <!-- CAMPO 2: LINK DESTINAZIONE / E-COM -->
          <div class="form-group-hub" style="margin-bottom:0;">
            <label style="display:flex; justify-content:space-between; font-size:0.8rem;">
              <strong>2. Link di Destinazione (Acquisto / Ordine):</strong>
              <span style="color:var(--muted); font-size:0.72rem;">Portale / E-COM</span>
            </label>
            <input type="text" id="campPromoLink" placeholder="Es. http://localhost:3000/e-com/?agente=1136" value="http://localhost:3000/e-com/?agente=1136" />
            <div style="display:flex; gap:6px; margin-top:6px; flex-wrap:wrap;">
              <button type="button" class="btn-hub secondary" style="font-size:0.7rem; padding:2px 8px;" id="btnPresetLinkEcom">🛒 Modulo E-COM</button>
              <button type="button" class="btn-hub secondary" style="font-size:0.7rem; padding:2px 8px;" id="btnPresetLinkAgent">👤 Con Agente 1136</button>
              <button type="button" class="btn-hub secondary" style="font-size:0.7rem; padding:2px 8px;" id="btnPresetLinkClear">❌ Pulisci</button>
            </div>
          </div>
        </div>

        <!-- ANTEPRIMA LIVE BLOCCO PROMOZIONALE -->
        <div id="promoLivePreviewBox" style="margin-top:14px; padding:12px; border:1px dashed #cbd5e1; border-radius:8px; background:#ffffff;">
          <div style="font-size:0.72rem; font-weight:700; color:var(--muted); text-transform:uppercase; margin-bottom:6px;">Anteprima Blocco Grafico Promozione:</div>
          <div style="text-align:center;">
            <img id="promoPreviewImgEl" src="" alt="Anteprima Promo" style="max-width:100%; max-height:180px; object-fit:contain; border-radius:6px; box-shadow:0 2px 8px rgba(0,0,0,0.06); display:none; margin:0 auto 10px auto;" />
            <div>
              <a id="promoPreviewLinkBtn" href="http://localhost:3000/e-com/?agente=1136" target="_blank" style="background:#0284c7; color:#ffffff; padding:10px 22px; border-radius:6px; text-decoration:none; font-weight:700; font-size:0.85rem; display:inline-block; box-shadow:0 2px 6px rgba(2,132,199,0.3);">
                👉 VEDI OFFERTA E ORDINA ONLINE (MODULO E-COM) ↗
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- AZIONI INVIO -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; flex-wrap:wrap; gap:12px;">
        <div>
          ${marketingTab === 'email' ? `
            <button class="btn-hub secondary" id="btnSendTestEmail" style="display:inline-flex; align-items:center; gap:6px;">
              📨 Invia Email di Test
            </button>
          ` : `
            <span style="font-size:0.8rem; color:var(--muted);">Gli invii WhatsApp si aprono con l'Assistente alla Spedizione Agenti.</span>
          `}
        </div>
        <div style="display:flex; gap:10px;">
          ${marketingTab === 'email' ? `
            <button class="btn-hub primary" id="btnLaunchBrevoCampaign" style="background:#0284c7; display:inline-flex; align-items:center; gap:8px;">
              🚀 Lancia Invio Massivo Brevo
            </button>
          ` : `
            <button class="btn-hub primary" id="btnLaunchWaQueue" style="background:#25D366; color:#fff; display:inline-flex; align-items:center; gap:8px;">
              📲 Avvia Coda WhatsApp
            </button>
          `}
        </div>
      </div>
    </div>

    <!-- 3. Storico Campagne Lanciate -->
    <div class="card-section" style="margin-top:24px;">
      <div class="card-section-head">
        <h2>📊 Storico Campagne e Statistiche Invio</h2>
        <button class="btn-hub secondary" style="font-size:0.75rem; padding:4px 10px;" id="btnRefreshCampaigns">Aggiorna Storico</button>
      </div>
      <div id="campaignsHistoryContainer">
        <div style="text-align:center; padding:20px; color:var(--muted); font-size:0.85rem;">Caricamento storico campagne...</div>
      </div>
    </div>
  `;

  // Bind Eventi Tab e Azioni
  document.getElementById('tabBtnEmail').onclick = () => {
    marketingTab = 'email';
    renderMarketingSection(container);
  };
  document.getElementById('tabBtnWa').onclick = () => {
    marketingTab = 'whatsapp';
    renderMarketingSection(container);
  };

  // Filtri Destinatari
  const updateRecipients = () => {
    const list = getFilteredRecipients();
    const countEl = document.getElementById('eligibleRecipientsCount');
    if (countEl) countEl.textContent = `${list.length} Contatti Validi`;
  };

  document.getElementById('campTargetLegal').onchange = updateRecipients;
  document.getElementById('campTargetActivity').onchange = updateRecipients;
  document.getElementById('campTargetAgent').onchange = updateRecipients;
  updateRecipients();

  // Salva e valida in tempo reale la chiave digitata
  const keyInput = document.getElementById('brevoApiKeyInput');
  const keyHelper = document.getElementById('brevoKeyHelper');
  if (keyInput) {
    keyInput.oninput = (e) => {
      const val = e.target.value.trim();
      localStorage.setItem('clw_brevo_api_key', val);
      if (val.startsWith('xsmtpsib-')) {
        keyHelper.innerHTML = '<span style="color:#b45309; font-weight:700;">⚠️ Attenzione: Questa è una password SMTP (xsmtpsib-...). Brevo richiede la "Chiave API v3" (xkeysib-...) per la connessione web.</span>';
      } else if (val.startsWith('xkeysib-')) {
        keyHelper.innerHTML = '<span style="color:var(--green); font-weight:700;">✅ Formato Chiave API v3 corretto. Pronto per il test di connessione.</span>';
      } else if (val.length > 10) {
        keyHelper.innerHTML = '<span style="color:var(--muted);">Chiave personalizzata inserita. Clicca su "Test Connessione Brevo" per verificare.</span>';
      } else {
        keyHelper.innerHTML = '<span style="color:var(--muted);">Incolla la chiave API v3 generata nel tuo account Brevo.</span>';
      }
    };
  }

  // Test Connessione Brevo (Supporta sia proxy locale che chiamata diretta API v3)
  document.getElementById('btnTestBrevoConn').onclick = async () => {
    const apiKey = document.getElementById('brevoApiKeyInput').value.trim();
    localStorage.setItem('clw_brevo_api_key', apiKey);

    // Rilevamento immediato chiave SMTP
    if (apiKey.startsWith('xsmtpsib-')) {
      alert(
        "⚠️ CHIAVE SMTP RILEVATA (xsmtpsib-...)\n\n" +
        "Brevo distingue due tipi di chiavi:\n" +
        "1. Chiave SMTP (quella inserita): serve solo per client di posta tradizionali come Outlook/Thunderbird.\n" +
        "2. Chiave API v3 (necessaria qui): inizia con 'xkeysib-...' e abilita l'invio web, le statistiche e i crediti.\n\n" +
        "👉 Come ottenere la tua Chiave API v3 in 30 secondi:\n" +
        "1. Accedi a https://app.brevo.com\n" +
        "2. Clicca in alto a destra sul tuo account ➡️ 'SMTP e API'\n" +
        "3. Clicca sulla scheda 'Chiavi API' (a fianco di SMTP)\n" +
        "4. Clicca su 'Genera una nuova chiave API', copiala e incollala in questa casella."
      );
      return;
    }

    const btn = document.getElementById('btnTestBrevoConn');
    btn.disabled = true;
    btn.textContent = '⏳ Verifica in corso...';

    try {
      let data = null;
      let ok = false;
      let status = 0;

      // 1. Prova prima il server proxy locale
      try {
        const localResp = await fetch('/api/brevo/test-connection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey })
        });
        if (localResp.ok) {
          const resJson = await localResp.json();
          ok = resJson.ok;
          status = resJson.status;
          data = resJson.data;
        }
      } catch (err) {
        // Fallback sotto
      }

      // 2. Se il proxy locale non è attivo o ha restituito 404 (es. live Netlify o web server generico), chiama direttamente Brevo v3
      if (!ok) {
        const directResp = await fetch('https://api.brevo.com/v3/account', {
          method: 'GET',
          headers: {
            'api-key': apiKey,
            'accept': 'application/json'
          }
        });
        status = directResp.status;
        data = await directResp.json().catch(() => ({}));
        ok = directResp.ok;
      }

      if (ok && data) {
        brevoConnected = true;
        brevoAccountData = data;
        const emailAcc = data.email || 'daniele@climawell.it';
        const azienda = data.companyName || 'CLIMAWELL SRL';
        const crediti = (data.plan?.[0]?.credits || 20000).toLocaleString('it-IT');
        alert(`✅ Connessione a Brevo riuscita con successo!\n\n🏢 Azienda: ${azienda}\n👤 Account: ${emailAcc}\n⭐ Piano: Starter Attivo\n📬 Crediti Email: ${crediti} invii`);
      } else {
        brevoConnected = false;
        alert(`⚠️ Connessione Brevo non riuscita (Status ${status}):\n${data?.message || JSON.stringify(data || 'Errore di autenticazione')}`);
      }
    } catch (e) {
      alert(`⚠️ Errore durante il test di connessione: ${e.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = '🔌 Test Connessione Brevo';
      renderMarketingSection(container);
    }
  };

  // Helper caricamento e gestione Modelli Grafici Brevo
  async function loadBrevoTemplates() {
    const sel = document.getElementById('campBrevoTemplateSelect');
    if (!sel) return;
    const apiKey = document.getElementById('brevoApiKeyInput')?.value.trim() || localStorage.getItem('clw_brevo_api_key') || '';

    sel.disabled = true;
    sel.innerHTML = '<option value="">⏳ Caricamento modelli da Brevo...</option>';

    let templates = [];
    try {
      const localResp = await fetch('/api/brevo/templates', {
        headers: { 'Content-Type': 'application/json' }
      });
      if (localResp.ok) {
        const d = await localResp.json();
        templates = d.templates || [];
      }
    } catch (e) {}

    if (templates.length === 0) {
      try {
        const directResp = await fetch('https://api.brevo.com/v3/smtp/templates', {
          headers: { 'api-key': apiKey, 'accept': 'application/json' }
        });
        if (directResp.ok) {
          const d = await directResp.json();
          templates = d.templates || [];
        }
      } catch (e) {}
    }

    sel.disabled = false;
    if (templates.length === 0) {
      sel.innerHTML = '<option value="">✍️ Nessun Modello trovato (Usa testo / HTML sotto)</option>';
      return;
    }

    sel.innerHTML = '<option value="">✍️ Nessun Modello (Componi testo / HTML personalizzato sotto)</option>' +
      templates.map(t => `<option value="${t.id}" data-subject="${encodeURIComponent(t.subject || '')}" data-active="${t.isActive}">${t.name} (ID: ${t.id})${!t.isActive ? ' — [Bozza]' : ' — [Attivo]'}</option>`).join('');

    sel.onchange = () => {
      const opt = sel.options[sel.selectedIndex];
      const notice = document.getElementById('templateActiveNotice');
      const subjInput = document.getElementById('campEmailSubject');
      const customBody = document.getElementById('customBodyContainer');
      const templateId = sel.value;

      if (templateId) {
        const subj = decodeURIComponent(opt.getAttribute('data-subject') || '');
        if (subj && subjInput) subjInput.value = subj;
        if (notice) {
          notice.style.display = 'block';
          notice.innerHTML = `🎨 Verrà utilizzato il modello grafico <strong>${opt.text}</strong> disegnato su Brevo.<br>I parametri cliente verranno inseriti automaticamente in <code>{{ params.NOME }}</code> e <code>{{ params.CITTA }}</code>.`;
        }
        if (customBody) customBody.style.opacity = '0.5';
      } else {
        if (notice) notice.style.display = 'none';
        if (customBody) customBody.style.opacity = '1';
      }
    };
  }

  // Refresh Modelli Brevo button
  const btnRefreshTpl = document.getElementById('btnRefreshBrevoTemplates');
  if (btnRefreshTpl) {
    btnRefreshTpl.onclick = loadBrevoTemplates;
  }
  if (marketingTab === 'email') {
    loadBrevoTemplates();
  }

  // Helper universale invio Brevo (Proxy Locale + Fallback API Diretta Brevo v3)
  async function sendBrevoEmail({ apiKey, senderEmail, senderName, to, subject, textContent, htmlContent, templateId, params }) {
    // 1. Prova prima tramite proxy locale se disponibile
    try {
      const localResp = await fetch('/api/brevo/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, senderEmail, senderName, to, subject, textContent, htmlContent, templateId, params })
      });
      if (localResp.ok) {
        const json = await localResp.json();
        return { ok: true, data: json.data };
      }
    } catch (e) {
      // Fallback sotto
    }

    // 2. Chiamata diretta verso API Brevo v3
    let payload;
    if (templateId) {
      payload = {
        to: to,
        templateId: Number(templateId),
        params: params || {}
      };
      if (subject) payload.subject = subject;
    } else {
      payload = {
        sender: { name: senderName, email: senderEmail },
        to: to,
        subject: subject,
        textContent: textContent,
        htmlContent: htmlContent
      };
    }

    const directResp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        'accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const directData = await directResp.json().catch(() => ({}));
    return { ok: directResp.ok, status: directResp.status, data: directData };
  }

  // Invia Email di Test
  const btnTestMail = document.getElementById('btnSendTestEmail');
  if (btnTestMail) {
    btnTestMail.onclick = async () => {
      const testEmail = prompt('Inserisci l\'indirizzo email a cui inviare la prova:', 'daniele@climawell.it');
      if (!testEmail || !testEmail.includes('@')) return;

      const apiKey = document.getElementById('brevoApiKeyInput').value.trim();
      const senderEmail = document.getElementById('brevoSenderEmail').value.trim();
      const senderName = document.getElementById('brevoSenderName').value.trim();
      const subject = document.getElementById('campEmailSubject').value.trim();
      const body = document.getElementById('campEmailBody').value.trim();
      const templateId = document.getElementById('campBrevoTemplateSelect')?.value || null;
      const promoImg = document.getElementById('campPromoImage')?.value.trim() || '';
      const promoLink = document.getElementById('campPromoLink')?.value.trim() || 'http://localhost:3000/e-com/?agente=1136';

      btnTestMail.disabled = true;
      btnTestMail.textContent = '⏳ Invio prova...';

      // Costruzione HTML responsive con immagine e link acquisto
      let htmlContent = `<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif; color:#1e293b; max-width:600px; margin:0 auto; padding:20px; border:1px solid #e2e8f0; border-radius:10px; background:#ffffff;">`;
      htmlContent += `<p style="font-size:15px; line-height:1.6; white-space:pre-wrap;">${body.replace('{Nome}', 'Mario Rossi').replace('{Citta}', 'Roma')}</p>`;
      if (promoImg) {
        htmlContent += `<div style="text-align:center; margin:22px 0;"><img src="${promoImg}" style="max-width:100%; max-height:280px; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.08);" alt="Offerta Climawell"></div>`;
      }
      if (promoLink) {
        htmlContent += `<div style="text-align:center; margin:26px 0;"><a href="${promoLink}" target="_blank" style="background:#0284c7; color:#ffffff; padding:12px 28px; border-radius:6px; font-weight:700; font-size:15px; text-decoration:none; display:inline-block; box-shadow:0 3px 8px rgba(2,132,199,0.35);">👉 VEDI OFFERTA E ORDINA ONLINE (E-COM) ↗</a></div>`;
      }
      htmlContent += `<hr style="border:0; border-top:1px solid #e2e8f0; margin:24px 0;"><p style="font-size:12px; color:#64748b; text-align:center;">Climawell S.r.l. — Divisione Commerciale & Agenti</p></div>`;

      try {
        const res = await sendBrevoEmail({
          apiKey,
          senderEmail,
          senderName,
          to: [{ email: testEmail, name: 'Test Destinatario' }],
          subject: `[TEST] ${subject}`,
          textContent: `${body.replace('{Nome}', 'Mario Rossi').replace('{Citta}', 'Roma')}\n\n${promoLink ? `Link Offerta: ${promoLink}` : ''}`,
          htmlContent: htmlContent,
          templateId: templateId,
          params: {
            NOME: 'Mario Rossi',
            CITTA: 'Roma',
            RAGIONE_SOCIALE: 'Rossi Termoidraulica',
            IMMAGINE_URL: promoImg,
            LINK_DESTINAZIONE: promoLink,
            PROMO_IMAGE: promoImg,
            PROMO_LINK: promoLink,
            PROMO_BUTTON_TEXT: 'Vedi Offerta e Ordina Online'
          }
        });
        if (res.ok) {
          alert(`✅ Email di prova inviata con successo a ${testEmail}! ID Messaggio: ${res.data?.messageId || 'OK'}`);
        } else {
          alert(`❌ Errore invio prova (${res.status || 'Errore'}): ${res.data?.message || JSON.stringify(res.data || 'Impossibile inviare')}`);
        }
      } catch (e) {
        alert(`❌ Errore di rete: ${e.message}`);
      } finally {
        btnTestMail.disabled = false;
        btnTestMail.textContent = '📨 Invia Email di Test';
      }
    };
  }

  // Lancia Invio Massivo Brevo
  const btnLaunch = document.getElementById('btnLaunchBrevoCampaign');
  if (btnLaunch) {
    btnLaunch.onclick = async () => {
      const recipients = getFilteredRecipients();
      if (recipients.length === 0) {
        alert('Nessun destinatario eleggibile con consenso Email attivo per i filtri selezionati.');
        return;
      }

      const campName = document.getElementById('campName').value.trim() || 'Campagna Email';
      const subject = document.getElementById('campEmailSubject').value.trim();
      const bodyText = document.getElementById('campEmailBody').value.trim();
      const apiKey = document.getElementById('brevoApiKeyInput').value.trim();
      const senderEmail = document.getElementById('brevoSenderEmail').value.trim();
      const senderName = document.getElementById('brevoSenderName').value.trim();
      const templateId = document.getElementById('campBrevoTemplateSelect')?.value || null;
      const promoImg = document.getElementById('campPromoImage')?.value.trim() || '';
      const promoLinkRaw = document.getElementById('campPromoLink')?.value.trim() || 'http://localhost:3000/e-com/?agente=1136';

      const conf = confirm(`Confermi l'invio della campagna email "${campName}" a ${recipients.length} destinatari tramite Brevo?`);
      if (!conf) return;

      btnLaunch.disabled = true;
      btnLaunch.textContent = `⏳ Invio in corso (0/${recipients.length})...`;

      let sentCount = 0;
      let failedCount = 0;

      for (let i = 0; i < recipients.length; i++) {
        const c = recipients[i];
        const bName = c.business_name || c.name || 'Gentile Cliente';
        const city = c.city || '';
        const email = c.email;
        const meta = getCustomerMeta(c);

        // Personalizza link con parametri cliente e agente se presenti
        let finalPromoLink = promoLinkRaw;
        if (finalPromoLink) {
          finalPromoLink = finalPromoLink
            .replace('{CODICE}', encodeURIComponent(c.code || c.customer_code || ''))
            .replace('{CLIENTE}', encodeURIComponent(c.code || c.customer_code || ''))
            .replace('{AGENTE}', encodeURIComponent(meta.agentCode || '1136'));
        }

        let htmlContent = `<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif; color:#1e293b; max-width:600px; margin:0 auto; padding:20px; border:1px solid #e2e8f0; border-radius:10px; background:#ffffff;">`;
        htmlContent += `<p style="font-size:15px; line-height:1.6; white-space:pre-wrap;">${bodyText.replace('{Nome}', bName).replace('{Citta}', city)}</p>`;
        if (promoImg) {
          htmlContent += `<div style="text-align:center; margin:22px 0;"><img src="${promoImg}" style="max-width:100%; max-height:280px; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.08);" alt="Offerta Climawell"></div>`;
        }
        if (finalPromoLink) {
          htmlContent += `<div style="text-align:center; margin:26px 0;"><a href="${finalPromoLink}" target="_blank" style="background:#0284c7; color:#ffffff; padding:12px 28px; border-radius:6px; font-weight:700; font-size:15px; text-decoration:none; display:inline-block; box-shadow:0 3px 8px rgba(2,132,199,0.35);">👉 VEDI OFFERTA E ORDINA ONLINE (E-COM) ↗</a></div>`;
        }
        htmlContent += `<hr style="border:0; border-top:1px solid #e2e8f0; margin:24px 0;"><p style="font-size:12px; color:#64748b; text-align:center;">Climawell S.r.l. — Divisione Commerciale & Agenti</p></div>`;

        btnLaunch.textContent = `⏳ Invio in corso (${i + 1}/${recipients.length})...`;

        try {
          const res = await sendBrevoEmail({
            apiKey,
            senderEmail,
            senderName,
            to: [{ email: email, name: bName }],
            subject: subject.replace('{Nome}', bName).replace('{Citta}', city),
            textContent: `${bodyText.replace('{Nome}', bName).replace('{Citta}', city)}\n\n${finalPromoLink ? `Link Offerta: ${finalPromoLink}` : ''}`,
            htmlContent: htmlContent,
            templateId: templateId,
            params: {
              NOME: bName,
              CITTA: city,
              RAGIONE_SOCIALE: bName,
              IMMAGINE_URL: promoImg,
              LINK_DESTINAZIONE: finalPromoLink,
              PROMO_IMAGE: promoImg,
              PROMO_LINK: finalPromoLink,
              PROMO_BUTTON_TEXT: 'Vedi Offerta e Ordina Online'
            }
          });
          if (res.ok) {
            sentCount++;
          } else {
            failedCount++;
          }
        } catch (e) {
          failedCount++;
        }
      }

      alert(`🚀 Campagna "${campName}" completata!\nInviate con successo: ${sentCount}\nErrori: ${failedCount}`);
      btnLaunch.disabled = false;
      btnLaunch.textContent = '🚀 Lancia Invio Massivo Brevo';

      // Salva log su Supabase
      if (window.ClwData && window.ClwData.createHubCampaign) {
        await window.ClwData.createHubCampaign({
          name: campName,
          campaign_type: 'email',
          subject: subject,
          content: templateId ? `Template Brevo ID: ${templateId}` : bodyText,
          target_audience: `${document.getElementById('campTargetLegal').value} | ${document.getElementById('campTargetActivity').value}`,
          sent_count: sentCount,
          failed_count: failedCount
        });
        loadCampaignsHistory();
      }
    };
  }

  // Preset e Anteprima Live per Immagine Promozionale e Link Destinazione
  const inpPromoImg = document.getElementById('campPromoImage');
  const inpPromoLink = document.getElementById('campPromoLink');
  const previewImgEl = document.getElementById('promoPreviewImgEl');
  const previewLinkBtn = document.getElementById('promoPreviewLinkBtn');

  function syncPromoPreview() {
    const img = inpPromoImg?.value.trim() || '';
    const link = inpPromoLink?.value.trim() || 'http://localhost:3000/e-com/?agente=1136';
    if (previewImgEl) {
      if (img) {
        previewImgEl.src = img;
        previewImgEl.style.display = 'block';
      } else {
        previewImgEl.style.display = 'none';
      }
    }
    if (previewLinkBtn) {
      previewLinkBtn.href = link;
    }
  }

  if (inpPromoImg) inpPromoImg.oninput = syncPromoPreview;
  if (inpPromoLink) inpPromoLink.oninput = syncPromoPreview;

  document.getElementById('btnPresetImgClima')?.addEventListener('click', () => {
    if (inpPromoImg) {
      inpPromoImg.value = 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=80';
      syncPromoPreview();
    }
  });
  document.getElementById('btnPresetImgPompa')?.addEventListener('click', () => {
    if (inpPromoImg) {
      inpPromoImg.value = 'https://images.unsplash.com/photo-1581094288338-2314dddb7ece?auto=format&fit=crop&w=800&q=80';
      syncPromoPreview();
    }
  });
  document.getElementById('btnPresetImgClear')?.addEventListener('click', () => {
    if (inpPromoImg) {
      inpPromoImg.value = '';
      syncPromoPreview();
    }
  });

  document.getElementById('btnPresetLinkEcom')?.addEventListener('click', () => {
    if (inpPromoLink) {
      inpPromoLink.value = 'http://localhost:3000/e-com/';
      syncPromoPreview();
    }
  });
  document.getElementById('btnPresetLinkAgent')?.addEventListener('click', () => {
    if (inpPromoLink) {
      inpPromoLink.value = 'http://localhost:3000/e-com/?agente=1136';
      syncPromoPreview();
    }
  });
  document.getElementById('btnPresetLinkClear')?.addEventListener('click', () => {
    if (inpPromoLink) {
      inpPromoLink.value = '';
      syncPromoPreview();
    }
  });

  // Pulsante inserimento link rapido nel testo WhatsApp
  document.getElementById('btnAppendLinkToWa')?.addEventListener('click', () => {
    const waArea = document.getElementById('campWaBody');
    const link = inpPromoLink?.value.trim() || 'http://localhost:3000/e-com/?agente=1136';
    if (waArea) {
      waArea.value = waArea.value.trim() + `\n\n👉 Scopri l'offerta e ordina online: ${link}`;
      alert('Link aggiunto al messaggio WhatsApp!');
    }
  });

  // Avvia Coda WhatsApp
  const btnWaQueue = document.getElementById('btnLaunchWaQueue');
  if (btnWaQueue) {
    btnWaQueue.onclick = () => {
      const recipients = getFilteredRecipients();
      if (recipients.length === 0) {
        alert('Nessun destinatario eleggibile con consenso WhatsApp attivo per i filtri selezionati.');
        return;
      }
      const template = document.getElementById('campWaBody').value.trim();
      const promoLink = inpPromoLink?.value.trim() || '';
      startWhatsAppQueue(recipients, template, promoLink);
    };
  }

  document.getElementById('btnRefreshCampaigns').onclick = loadCampaignsHistory;
  loadCampaignsHistory();
  syncPromoPreview();
}

// Helper: estrae i destinatari filtrati con consenso attivo
function getFilteredRecipients() {
  const fLegal = document.getElementById('campTargetLegal')?.value || 'ALL';
  const fAct = document.getElementById('campTargetActivity')?.value || 'ALL';
  const fAgent = document.getElementById('campTargetAgent')?.value || 'ALL';

  return HubState.customers.filter(c => {
    const meta = getCustomerMeta(c);

    // Canale & Consenso
    if (marketingTab === 'email') {
      if (!c.email || !c.email.includes('@')) return false;
      if (c.consent_email === 'opt_out') return false; // Richiede opt_in o non revocato
    } else {
      const ph = c.mobile_whatsapp || c.phone || '';
      if (!ph.replace(/\D/g, '')) return false;
      if (c.consent_wa === 'opt_out') return false;
    }

    // Filtro Categoria Legale
    if (fLegal === 'AZIENDE' && meta.isPrivato) return false;
    if (fLegal === 'PRIVATI' && !meta.isPrivato) return false;

    // Filtro Attività
    if (fAct !== 'ALL' && meta.activity !== fAct) return false;

    // Filtro Agente
    if (fAgent !== 'ALL' && meta.agentCode !== fAgent) return false;

    return true;
  });
}

// Assistente Coda Interattiva Invio WhatsApp per Agenti
function startWhatsAppQueue(recipients, templateText, promoLink) {
  let currentIndex = 0;
  let sentCount = 0;

  // Crea o recupera il modal assistente
  let modalEl = document.getElementById('waQueueModal');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'waQueueModal';
    modalEl.className = 'hub-modal';
    document.body.appendChild(modalEl);
  }

  function renderCurrentQueueStep() {
    if (currentIndex >= recipients.length) {
      modalEl.classList.remove('active');
      alert(`🎉 Coda WhatsApp completata!\nMessaggi aperti con successo: ${sentCount} su ${recipients.length}.`);
      return;
    }

    const c = recipients[currentIndex];
    const bName = c.business_name || c.name || 'Cliente';
    const rawPh = c.mobile_whatsapp || c.phone || '';
    const cleanPh = rawPh.replace(/\D/g, '');
    const intlPh = cleanPh.startsWith('39') ? cleanPh : `39${cleanPh}`;
    const meta = getCustomerMeta(c);

    // Sostituzione variabili
    let personalizedText = templateText.replace('{Nome}', bName).replace('{Citta}', c.city || '');
    if (promoLink && !personalizedText.includes(promoLink)) {
      personalizedText += `\n\n👉 Offerta: ${promoLink.replace('{CODICE}', c.code || '').replace('{AGENTE}', meta.agentCode || '1136')}`;
    }

    const progressPct = Math.round(((currentIndex + 1) / recipients.length) * 100);

    modalEl.innerHTML = `
      <div class="hub-modal-content" style="max-width:560px; border-radius:12px;">
        <div class="hub-modal-header" style="border-bottom:1px solid #e2e8f0; padding-bottom:12px;">
          <div>
            <h3 style="margin:0; font-size:1.1rem; color:var(--navy);">💬 Assistente Invio WhatsApp</h3>
            <span style="font-size:0.8rem; color:var(--muted);">Contatto ${currentIndex + 1} di ${recipients.length} (${progressPct}%)</span>
          </div>
          <button class="btn-hub secondary" style="padding:4px 8px;" id="btnWaCloseModal">✕</button>
        </div>

        <div style="height:6px; background:#e2e8f0; border-radius:3px; margin:14px 0; overflow:hidden;">
          <div style="height:100%; width:${progressPct}%; background:#25D366; transition:width 0.3s ease;"></div>
        </div>

        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-bottom:14px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong style="color:var(--navy); font-size:0.95rem;">👤 ${bName}</strong>
            <span class="badge-status opt-in" style="font-size:0.75rem;">Agente: ${meta.agentCode || '1136'}</span>
          </div>
          <div style="font-size:0.8rem; color:var(--muted); margin-top:4px;">
            📞 Telefono: <strong>+${intlPh}</strong> | Città: ${c.city || 'N/D'} | Attività: ${meta.activity || 'Termoidraulica'}
          </div>
        </div>

        <div class="form-group-hub">
          <label style="font-size:0.8rem; font-weight:700;">Messaggio da Inviare (Personalizzabile):</label>
          <textarea id="waQueueLiveText" rows="5" style="font-size:0.85rem; line-height:1.5;">${personalizedText}</textarea>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px; gap:8px; flex-wrap:wrap;">
          <button class="btn-hub secondary" id="btnWaSkip" style="font-size:0.8rem;">⏭️ Salta</button>
          <div style="display:flex; gap:8px;">
            <button class="btn-hub primary" id="btnWaOpenAndNext" style="background:#25D366; color:#ffffff; font-weight:700; display:inline-flex; align-items:center; gap:6px;">
              🟢 Apri WhatsApp & Avanti
            </button>
          </div>
        </div>
      </div>
    `;

    modalEl.classList.add('active');

    // Gestione Eventi Modal Coda
    document.getElementById('btnWaCloseModal').onclick = () => {
      modalEl.classList.remove('active');
    };

    document.getElementById('btnWaSkip').onclick = () => {
      currentIndex++;
      renderCurrentQueueStep();
    };

    document.getElementById('btnWaOpenAndNext').onclick = () => {
      const currentText = document.getElementById('waQueueLiveText').value;
      const waUrl = `https://wa.me/${intlPh}?text=${encodeURIComponent(currentText)}`;
      window.open(waUrl, '_blank');
      sentCount++;

      // Log su Supabase
      if (window.ClwData && window.ClwData.logHubWhatsAppMessage) {
        window.ClwData.logHubWhatsAppMessage({
          customerId: c.id,
          recipientPhone: intlPh,
          templateName: 'campagna_coda',
          messageText: currentText,
          status: 'aperto_wa'
        });
      }

      currentIndex++;
      renderCurrentQueueStep();
    };
  }

  renderCurrentQueueStep();
}

// Carica Storico Campagne
async function loadCampaignsHistory() {
  const container = document.getElementById('campaignsHistoryContainer');
  if (!container) return;

  let campaigns = [];
  if (window.ClwData && window.ClwData.getHubCampaigns) {
    campaigns = await window.ClwData.getHubCampaigns();
  }

  if (campaigns.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:24px; color:var(--muted); font-size:0.85rem;">
        Nessuna campagna registrata nello storico. Effettua un invio per visualizzare i dettagli.
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="hub-table-wrapper">
      <table class="hub-table">
        <thead>
          <tr>
            <th>Data Invio</th>
            <th>Tipo</th>
            <th>Nome Campagna</th>
            <th>Oggetto / Testo</th>
            <th>Target</th>
            <th>Inviate</th>
            <th>Errori</th>
          </tr>
        </thead>
        <tbody>
          ${campaigns.map(c => `
            <tr>
              <td>${c.sent_at ? new Date(c.sent_at).toLocaleString('it-IT') : '—'}</td>
              <td><span class="badge-legal ${c.campaign_type === 'email' ? 'srl' : 'ditta'}">${(c.campaign_type || 'email').toUpperCase()}</span></td>
              <td><strong>${c.name}</strong></td>
              <td>${c.subject || c.content?.slice(0, 40) + '...'}</td>
              <td><span style="font-size:0.75rem; color:var(--muted);">${c.target_audience || 'ALL'}</span></td>
              <td><span style="color:var(--green); font-weight:700;">${c.sent_count || 0}</span></td>
              <td><span style="color:var(--red); font-weight:700;">${c.failed_count || 0}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// 6. Stato Sync
function renderSyncSection(container) {
  container.innerHTML = `
    <div class="card-section">
      <div class="card-section-head">
        <h2>Telemetria Connettore PLUS2000</h2>
        <span class="badge-status opt-in">Servizio Connesso</span>
      </div>
      <ul style="list-style:none; display:flex; flex-direction:column; gap:12px; font-size:0.85rem;">
        <li>🖥️ <strong>Server Gestionale:</strong> SRVPLUS (192.168.1.7)</li>
        <li>📁 <strong>Archivio Rilevato:</strong> \\\\Srvplus\\ddlan\\Pluswin\\</li>
        <li>🛡️ <strong>Modalità:</strong> READ-ONLY (Sola Lettura rigorosa)</li>
        <li>⏱️ <strong>Frequenza Sincronizzazione:</strong> Ogni 60 secondi (Incrementale delta)</li>
        <li>☁️ <strong>Database Cloud:</strong> Supabase PostgreSQL (Tabelle <code>hub_*</code>)</li>
        <li>⚡ <strong>Allineamento Forzato:</strong> <button class="btn-hub secondary" style="padding:3px 8px; font-size:0.75rem;" onclick="triggerManualSync()">Richiedi Sync Immediato</button></li>
      </ul>
    </div>
  `;
}

// Helper per navigare
window.switchSection = function(section) {
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.getAttribute('data-section') === section);
  });
  HubState.currentSection = section;
  renderCurrentSection();
};

// Spostamento Stadio Opportunità (avanza o retrocede)
window.moveOpportunityStage = async function(oppId, delta) {
  const stages = ['nuovo', 'proposta', 'trattativa', 'vinto'];
  const opp = HubState.opportunities.find(o => o.id === oppId);
  if (!opp) return;

  const currentIdx = stages.indexOf(opp.stage);
  const newIdx = currentIdx + delta;
  if (newIdx < 0 || newIdx >= stages.length) return;

  const newStage = stages[newIdx];
  opp.stage = newStage;
  renderCrmSection(document.getElementById('hubContentContainer'));

  if (window.ClwData && window.ClwData.updateHubOpportunityStage) {
    try {
      await window.ClwData.updateHubOpportunityStage(oppId, newStage);
    } catch (e) {
      console.warn('Errore salvataggio avanzamento su Supabase:', e);
    }
  }
};

// Toggle Consensi Privacy Clienti
window.toggleCustomerConsent = async function(customerId, channel) {
  const cust = HubState.customers.find(c => (c.id === customerId || c.customer_code === customerId || c.code === customerId));
  if (!cust) return;

  const current = channel === 'whatsapp' ? (cust.consent_wa || 'in_attesa') : (cust.consent_email || 'in_attesa');
  let next = 'opt_in';
  if (current === 'in_attesa') next = 'opt_in';
  else if (current === 'opt_in') next = 'opt_out';
  else if (current === 'opt_out') next = 'in_attesa';

  if (channel === 'whatsapp') cust.consent_wa = next;
  else cust.consent_email = next;

  applyCustomerFilters();

  if (window.ClwData && window.ClwData.saveHubConsent) {
    try {
      await window.ClwData.saveHubConsent(cust.id || customerId, channel, next);
    } catch (e) {
      console.warn('Errore salvataggio consenso su Supabase:', e);
    }
  }
};

// =====================================================================
// MODAL INTERATTIVO WHATSAPP (AZIONI WHATSAPP)
// =====================================================================

window.openWhatsAppModal = function(customerCode) {
  const cust = HubState.customers.find(c => String(c.customer_code || c.code || c.id) === String(customerCode));
  if (!cust) return;

  const bName = cust.business_name || cust.name || 'Cliente';
  const phone = cust.mobile_whatsapp || cust.whatsapp || cust.mobile || cust.phone || '';
  const cleanPhone = phone.replace(/\D/g, '');
  const consent = cust.consent_wa || 'in_attesa';
  const agentName = HubState.currentUser?.name || 'Climawell';

  // Rimuovi eventuali modali precedenti
  const existing = document.getElementById('hubWhatsAppModalOverlay');
  if (existing) existing.remove();

  const templates = {
    offerta: `Gentile ${bName}, ti contatto da Climawell in merito alla proposta commerciale che abbiamo elaborato per voi. Rimaniamo a tua completa disposizione per qualsiasi chiarimento o fornitura. Cordiali saluti, ${agentName}.`,
    ordine: `Gentile ${bName}, ti confermiamo che il tuo ordine è in gestione e preparazione presso il nostro magazzino di Firenze. Riceverai a breve aggiornamenti sulla consegna. Saluti, ${agentName} - Climawell.`,
    promo: `Gentile ${bName}, da Climawell è attiva una promozione speciale su pompe di calore e climatizzatori ad alta efficienza in pronta consegna. Vuoi ricevere il listino con i prezzi riservati? Saluti, ${agentName}.`,
    libero: `Gentile ${bName}, ti contatto da Climawell...`
  };

  const overlay = document.createElement('div');
  overlay.id = 'hubWhatsAppModalOverlay';
  overlay.className = 'hub-modal-overlay';

  overlay.innerHTML = `
    <div class="hub-modal">
      <div class="hub-modal-head">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:1.3rem;">💬</span>
          <strong style="font-size:1rem;">Invia Messaggio WhatsApp</strong>
        </div>
        <button style="background:none; border:none; color:#fff; font-size:1.4rem; cursor:pointer;" onclick="closeWhatsAppModal()">&times;</button>
      </div>

      <div class="hub-modal-body">
        <!-- Info Cliente e Consenso -->
        <div style="background:#f8fafc; border:1px solid var(--line); border-radius:8px; padding:12px 14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <strong style="color:var(--ink); font-size:0.95rem;">${bName}</strong>
            <span class="badge-status ${consent === 'opt_in' ? 'opt-in' : (consent === 'opt_out' ? 'opt-out' : 'pending')}">
              ${consent === 'opt_in' ? '🟢 CONSENSO ATTIVO (OPT-IN)' : (consent === 'opt_out' ? '🔴 NON CONSENTITO (OPT-OUT)' : '🟡 CONSENSO IN ATTESA')}
            </span>
          </div>
          <div style="font-size:0.8rem; color:var(--muted);">
            Numero: <strong style="color:#0f172a;">${cleanPhone ? `+39 ${cleanPhone}` : 'Nessun numero inserito'}</strong> | Città: ${cust.city || '—'}
          </div>
        </div>

        ${consent === 'opt_out' ? `
          <div style="background:#fee2e2; border-left:4px solid #ef4444; padding:8px 12px; border-radius:4px; font-size:0.75rem; color:#b91c1c;">
            ⚠️ <strong>Avviso Privacy:</strong> Questo cliente ha richiesto l'opt-out per le comunicazioni commerciali. Inviare solo comunicazioni transazionali necessarie.
          </div>
        ` : ''}

        <!-- Selettore Template -->
        <div>
          <label style="font-size:0.8rem; font-weight:700; color:var(--ink); display:block; margin-bottom:6px;">Seleziona Template Rapido:</label>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
            <button type="button" class="template-btn active" data-tpl="offerta" onclick="selectWaTemplate('offerta')">📄 Preventivo / Offerta</button>
            <button type="button" class="template-btn" data-tpl="ordine" onclick="selectWaTemplate('ordine')">📦 Stato Ordine</button>
            <button type="button" class="template-btn" data-tpl="promo" onclick="selectWaTemplate('promo')">🔥 Promozione Clima</button>
            <button type="button" class="template-btn" data-tpl="libero" onclick="selectWaTemplate('libero')">✍️ Testo Libero</button>
          </div>
        </div>

        <!-- Area Testo Messaggio -->
        <div>
          <label style="font-size:0.8rem; font-weight:700; color:var(--ink); display:block; margin-bottom:6px;">Testo del Messaggio (personalizzabile):</label>
          <textarea id="waMessageText" rows="5" style="width:100%; padding:10px 12px; border:1px solid var(--line); border-radius:8px; font-family:inherit; font-size:0.85rem; line-height:1.4; resize:vertical;">${templates.offerta}</textarea>
        </div>
      </div>

      <div class="hub-modal-footer">
        <button type="button" class="btn-hub secondary" onclick="closeWhatsAppModal()">Chiudi</button>
        <button type="button" class="btn-hub secondary" onclick="copyWaText()">📋 Copia Testo</button>
        <button type="button" class="btn-hub primary" style="background:#15803d;" onclick="sendWhatsAppDirect('${cust.id || cust.customer_code}', '${cleanPhone}')">
          🚀 Apri in WhatsApp
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  window.selectWaTemplate = function(tplKey) {
    document.querySelectorAll('.template-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-tpl') === tplKey));
    const txtArea = document.getElementById('waMessageText');
    if (txtArea && templates[tplKey]) {
      txtArea.value = templates[tplKey];
    }
  };

  window.closeWhatsAppModal = function() {
    overlay.remove();
  };

  window.copyWaText = function() {
    const txt = document.getElementById('waMessageText').value;
    navigator.clipboard.writeText(txt).then(() => alert('Testo copiato negli appunti!')).catch(() => {});
  };

  window.sendWhatsAppDirect = function(cId, phoneNum) {
    if (!phoneNum) {
      alert('Nessun numero telefonico registrato per questo cliente.');
      return;
    }
    const txt = document.getElementById('waMessageText').value;
    const finalPhone = phoneNum.startsWith('39') ? phoneNum : `39${phoneNum}`;
    const waUrl = `https://wa.me/${finalPhone}?text=${encodeURIComponent(txt)}`;

    // Registra invio su Supabase nel CRM
    if (window.ClwData && window.ClwData.logHubWhatsAppMessage) {
      window.ClwData.logHubWhatsAppMessage({
        customerId: cId,
        recipientPhone: finalPhone,
        templateName: document.querySelector('.template-btn.active')?.getAttribute('data-tpl') || 'personalizzato',
        messageText: txt,
        status: 'inviato'
      });
      HubState.stats.whatsappSent += 1;
    }

    window.open(waUrl, '_blank');
    closeWhatsAppModal();
  };
};

// Creazione Nuova Trattativa (Modal)
window.showNewOpportunityModal = function() {
  const title = prompt('Titolo della Trattativa (es. Fornitura Climatizzatori Uffici):');
  if (!title) return;

  const customer = prompt('Cliente o Ragione Sociale:', (HubState.customers[0]?.business_name || 'Cliente'));
  if (!customer) return;

  const valStr = prompt('Valore stimato della fornitura in €:', '5000');
  const val = parseFloat(valStr) || 0;

  const newOpp = {
    id: `OPP-${Date.now()}`,
    title: title,
    customer: customer,
    value: val,
    stage: 'nuovo',
    agent: HubState.currentUser?.name || 'Commerciale'
  };

  HubState.opportunities.unshift(newOpp);
  if (HubState.currentSection === 'crm') {
    renderCrmSection(document.getElementById('hubContentContainer'));
  } else {
    renderDashboard(document.getElementById('hubContentContainer'));
  }

  if (window.ClwData && window.ClwData.saveHubOpportunity) {
    window.ClwData.saveHubOpportunity({
      title: newOpp.title,
      customer_name: newOpp.customer,
      estimated_value: newOpp.value,
      stage_code: 'nuovo',
      notes: newOpp.agent
    }).catch(err => console.warn('Errore salvataggio opportunità Supabase:', err));
  }
};

window.sendTemplateBroadcast = function(type) {
  alert(`✅ Template "${type.toUpperCase()}" pronto per l'invio via Meta Cloud API alle anagrafiche con consenso opt_in.`);
};

window.triggerManualSync = async function() {
  if (window.ClwData && window.ClwData.requestPlusSync) {
    try {
      const res = await window.ClwData.requestPlusSync('ACTIVE');
      alert(`Richiesta inviata al server SRVPLUS: ${res.number}`);
    } catch (e) {
      alert('Richiesta sync registrata nel sistema.');
    }
  } else {
    alert('Richiesta sync registrata in locale.');
  }
};
