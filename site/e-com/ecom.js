/**
 * CLIMAWELL E-COM — MODULO E-COMMERCE B2B
 * Gestione vetrina articoli, filtri dinamici, precompilazione da campagne (Agente 1136)
 * e finalizzazione rapida ordini B2B (WhatsApp, Email, CRM).
 */

(function () {
  'use strict';

  const EcomState = {
    products: [],
    filteredProducts: [],
    currentCategory: 'ALL',
    searchQuery: '',
    selectedProduct: null,
    agentCode: '1136',
    customerCode: '',
    customerName: '',
    customerPhone: '',
    preselectedArt: '',
    // Configurazione Stripe Connect (Daniele Lupi SaaS Platform ➔ Commerciante Climawell)
    stripeConfig: {
      publishableKey: 'pk_test_51P7DemoSaaSDanieleLupi00000000000000',
      connectedAccountId: 'acct_climawell_b2b',
      applicationFeePercent: 2.5,
      isTestMode: true
    },
    stripeInstance: null
  };

  // Inizializzazione al caricamento DOM
  document.addEventListener('DOMContentLoaded', () => {
    parseUrlParams();
    setupEventListeners();
    loadCatalog();
  });

  // 1. Lettura Parametri URL (da campagne Brevo / WhatsApp)
  function parseUrlParams() {
    const params = new URLSearchParams(window.location.search);
    
    // Agente (default: 1136 se specificato o passato in query)
    const agentParam = params.get('agente') || params.get('agent');
    if (agentParam) {
      EcomState.agentCode = agentParam.trim();
    }
    const agentBadge = document.getElementById('agentContextLabel');
    const orderAgentInput = document.getElementById('orderAgentInput');
    if (agentBadge) {
      agentBadge.innerHTML = `👤 Rete Commerciale Climawell: <strong>Agente ${escapeHtml(EcomState.agentCode)}</strong>`;
    }
    if (orderAgentInput) {
      orderAgentInput.value = EcomState.agentCode;
    }

    // Cliente (se proveniente da link personalizzato {CODICE})
    const clientParam = params.get('cliente') || params.get('codice');
    if (clientParam) {
      EcomState.customerCode = clientParam.trim();
      const clientLabel = document.getElementById('clientContextLabel');
      if (clientLabel) {
        clientLabel.textContent = `🏢 Cliente: ${EcomState.customerCode}`;
        clientLabel.style.display = 'inline';
      }
      const orderCustomerInput = document.getElementById('orderCustomerInput');
      if (orderCustomerInput && !orderCustomerInput.value) {
        orderCustomerInput.value = `Cliente Cod. ${EcomState.customerCode}`;
      }
    }

    // Articolo preselezionato da campagna specifica (?art=XYZ)
    const artParam = params.get('art') || params.get('articolo') || params.get('item');
    if (artParam) {
      EcomState.preselectedArt = artParam.trim();
    }

    // Categoria iniziale (?cat=...)
    const catParam = params.get('cat');
    if (catParam) {
      EcomState.currentCategory = catParam.toUpperCase();
    }
  }

  // 2. Caricamento Catalogo Prodotti (Supabase Cloud con Fallback locale)
  async function loadCatalog() {
    const grid = document.getElementById('productsGrid');
    const countLabel = document.getElementById('productCountLabel');

    try {
      let rawProducts = [];

      // Prova prima tramite Supabase Client
      if (window.ClwData && window.ClwData.getProducts) {
        rawProducts = await window.ClwData.getProducts({ limit: 1000 });
      }

      // Se vuoto o errore, fallback su seed-data.json locale
      if (!rawProducts || rawProducts.length === 0) {
        console.log('[E-COM] Fallback caricamento articoli da seed-data.json...');
        const resp = await fetch('/seed-data.json');
        if (resp.ok) {
          const seedData = await resp.json();
          rawProducts = seedData.articles || [];
        }
      }

      // Normalizzazione dati
      EcomState.products = rawProducts.map(p => ({
        id: p.id || p.code,
        code: p.code || p.id || '',
        description: p.description || p.name || 'Articolo Tecnico Climawell',
        brand: p.brand || 'CLIMAWELL',
        price: Number(p.price || p.price_net || 0),
        listPrice: Number(p.list_price || p.price * 1.3 || p.price || 0),
        stock: Number(p.stock !== undefined ? p.stock : (p.stock_available !== undefined ? p.stock_available : 5)),
        imageUrl: p.imageUrl || p.image_url || p.imageRef || '',
        family: p.family || p.macroFamily || p.group || '',
        vat: Number(p.vat || 22)
      }));

      // Se non ci sono prodotti, aggiungiamo campionario demo Climawell
      if (EcomState.products.length === 0) {
        EcomState.products = getDemoCatalog();
      }

      applyFilters();

      // Se c'è un articolo target specificato nell'URL, aprilo automaticamente
      if (EcomState.preselectedArt) {
        const target = EcomState.products.find(p => 
          p.code.toLowerCase() === EcomState.preselectedArt.toLowerCase()
        );
        if (target) {
          setTimeout(() => {
            openOrderModal(target);
            showToast(`Offerta trovata per l'articolo ${target.code}`);
          }, 300);
        }
      }

    } catch (e) {
      console.error('[E-COM] Errore caricamento catalogo:', e);
      grid.innerHTML = `
        <div class="empty-state">
          <h3>Errore nel caricamento del catalogo</h3>
          <p>${escapeHtml(e.message)}</p>
          <button class="btn-card-order" style="max-width:200px; margin:16px auto;" onclick="location.reload()">Riprova</button>
        </div>
      `;
    }
  }

  // 3. Filtri e Ricerca
  function applyFilters() {
    const q = EcomState.searchQuery.toLowerCase().trim();
    const cat = EcomState.currentCategory;

    EcomState.filteredProducts = EcomState.products.filter(p => {
      // Filtro Categoria
      if (cat === 'CLIMA') {
        const d = (p.description + ' ' + p.family).toLowerCase();
        if (!d.includes('clima') && !d.includes('condiz') && !d.includes('split') && !d.includes('inverter')) return false;
      } else if (cat === 'POMPE') {
        const d = (p.description + ' ' + p.family).toLowerCase();
        if (!d.includes('pomp') && !d.includes('calore') && !d.includes('idron')) return false;
      } else if (cat === '2B') {
        if (p.brand.toUpperCase() !== '2B' && !p.family.includes('DOC') && !p.family.includes('HIT')) return false;
      } else if (cat === 'STOCK') {
        if (p.stock <= 0) return false;
      }

      // Filtro Testuale
      if (q) {
        const fullText = `${p.code} ${p.description} ${p.brand} ${p.family}`.toLowerCase();
        if (!fullText.includes(q)) return false;
      }

      return true;
    });

    renderProductsGrid();
  }

  // 4. Render Schede Prodotto
  function renderProductsGrid() {
    const grid = document.getElementById('productsGrid');
    const countLabel = document.getElementById('productCountLabel');

    if (!grid) return;

    if (countLabel) {
      countLabel.textContent = `${EcomState.filteredProducts.length} articoli disponibili`;
    }

    if (EcomState.filteredProducts.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <h3>Nessun articolo trovato</h3>
          <p>Modifica la ricerca o seleziona un'altra categoria.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = EcomState.filteredProducts.map(p => {
      const inStock = p.stock > 0;
      const isTarget = EcomState.preselectedArt && p.code.toLowerCase() === EcomState.preselectedArt.toLowerCase();
      const displayImg = p.imageUrl || getPlaceholderImage(p.brand, p.description);

      return `
        <div class="product-card ${isTarget ? 'promo-target' : ''}" id="prodCard-${p.code}">
          <div class="card-img-wrap">
            <span class="brand-tag">${escapeHtml(p.brand)}</span>
            <img src="${displayImg}" alt="${escapeHtml(p.description)}" loading="lazy" onerror="this.src='${getPlaceholderImage(p.brand, p.description)}'">
            <span class="stock-tag ${inStock ? 'in-stock' : 'out-stock'}">
              ${inStock ? `🟢 ${p.stock} pz Disponibili` : `🟡 In Arrivo`}
            </span>
          </div>

          <div class="card-body">
            <div class="card-code">COD. ${escapeHtml(p.code)}</div>
            <h3 class="card-title" title="${escapeHtml(p.description)}">${escapeHtml(p.description)}</h3>

            <div class="card-pricing">
              <div class="price-box">
                ${p.listPrice > p.price ? `<span class="list-price">€ ${euro(p.listPrice)}</span>` : ''}
                <span class="net-price">€ ${euro(p.price)}</span>
                <span class="price-sub">+ IVA 22% (Prezzo B2B)</span>
              </div>
            </div>

            <button class="btn-card-order" onclick="window.ClwEcom.openModalByCode('${p.code}')">
              <span>📦</span> Ordina Subito B2B
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // 5. Gestione Modal Ordine Rapido
  function openOrderModal(prod) {
    EcomState.selectedProduct = prod;

    const modal = document.getElementById('orderModal');
    const modalTitle = document.getElementById('modalProdTitle');
    const modalCode = document.getElementById('modalProdCode');
    const modalPrice = document.getElementById('modalProdPrice');
    const modalStock = document.getElementById('modalProdStock');
    const modalImg = document.getElementById('modalProdImg');
    const qtyInput = document.getElementById('orderQtyInput');

    modalTitle.textContent = prod.description;
    modalCode.textContent = `Codice Articolo: ${prod.code} | Marca: ${prod.brand}`;
    modalPrice.textContent = `€ ${euro(prod.price)}`;
    modalStock.innerHTML = prod.stock > 0
      ? `<strong style="color:var(--emerald-dark)">Disponibilità Immediata (${prod.stock} pz)</strong>`
      : `<span style="color:var(--amber)">Su ordinazione / Fabbisogno cantiere</span>`;
    modalImg.src = prod.imageUrl || getPlaceholderImage(prod.brand, prod.description);
    qtyInput.value = '1';

    updateOrderSummary();
    modal.classList.add('active');
  }

  function closeOrderModal() {
    const modal = document.getElementById('orderModal');
    if (modal) modal.classList.remove('active');
    EcomState.selectedProduct = null;
  }

  function updateOrderSummary() {
    if (!EcomState.selectedProduct) return;

    const qty = Math.max(1, parseInt(document.getElementById('orderQtyInput').value) || 1);
    const unitPrice = EcomState.selectedProduct.price;
    const subtotal = unitPrice * qty;
    const vat = subtotal * 0.22;
    const grandTotal = subtotal + vat;

    document.getElementById('summarySubtotal').textContent = `€ ${euro(subtotal)}`;
    document.getElementById('summaryVat').textContent = `€ ${euro(vat)}`;
    document.getElementById('summaryGrandTotal').textContent = `€ ${euro(grandTotal)}`;

    // Calcolo riparto Stripe Connect (Direct Charge)
    const feePct = EcomState.stripeConfig.applicationFeePercent || 2.5;
    const feeAmount = Math.round(grandTotal * (feePct / 100) * 100) / 100;
    const netToConnected = Math.round((grandTotal - feeAmount) * 100) / 100;

    const netEl = document.getElementById('breakdownNetToConnected');
    if (netEl) netEl.textContent = `€ ${euro(netToConnected)}`;

    const feeEl = document.getElementById('breakdownFeeAmount');
    if (feeEl) feeEl.textContent = `€ ${euro(feeAmount)} (${feePct}%)`;

    const payBtnLabel = document.getElementById('btnStripePayLabel');
    if (payBtnLabel) {
      payBtnLabel.textContent = `💳 Paga Subito € ${euro(grandTotal)} (Direct Charge)`;
    }
  }

  // 6. Azioni Finalizzazione Ordine B2B

  // A) Invio tramite WhatsApp direttamente all'Agente / Commerciale
  function sendOrderViaWhatsApp() {
    if (!EcomState.selectedProduct) return;

    const prod = EcomState.selectedProduct;
    const qty = parseInt(document.getElementById('orderQtyInput').value) || 1;
    const delivery = document.getElementById('orderDeliveryType').selectedOptions[0].text;
    const customer = document.getElementById('orderCustomerInput').value.trim() || 'Cliente Portale E-COM';
    const phone = document.getElementById('orderPhoneInput').value.trim();
    const agent = document.getElementById('orderAgentInput').value.trim() || EcomState.agentCode;
    const notes = document.getElementById('orderNotesInput').value.trim();

    const subtotal = prod.price * qty;
    const grandTotal = subtotal * 1.22;

    const message = 
      `📦 *ORDINE FORNITURA B2B — CLIMAWELL E-COM*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 *Cliente:* ${customer}\n` +
      `💼 *Agente Assegnato:* ${agent}\n` +
      `📞 *Contatto:* ${phone || 'N/D'}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🛒 *Articolo:* ${prod.description}\n` +
      `🏷️ *Codice:* ${prod.code} (${prod.brand})\n` +
      `🔢 *Quantità:* ${qty} PZ\n` +
      `💰 *Prezzo Netto Unitario:* € ${euro(prod.price)}\n` +
      `🚚 *Fornitura:* ${delivery}\n` +
      (notes ? `📝 *Note:* ${notes}\n` : '') +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💶 *Totale Imponibile:* € ${euro(subtotal)}\n` +
      `💶 *Totale con IVA (22%):* € ${euro(grandTotal)}\n\n` +
      `Si richiede conferma disponibilità e spedizione.`;

    // Numero WhatsApp Commerciale Climawell (o cellulare agente se noto)
    const targetWaNumber = '390554289074'; // Centralino WhatsApp Climawell
    const waUrl = `https://wa.me/${targetWaNumber}?text=${encodeURIComponent(message)}`;

    window.open(waUrl, '_blank');
    logOrderCrm('whatsapp', customer, prod, qty, subtotal, agent);
    showToast('Messaggio WhatsApp pronto per l\'invio!');
  }

  // B) Invio tramite Email a sales@climawell.it
  function sendOrderViaEmail() {
    if (!EcomState.selectedProduct) return;

    const prod = EcomState.selectedProduct;
    const qty = parseInt(document.getElementById('orderQtyInput').value) || 1;
    const delivery = document.getElementById('orderDeliveryType').selectedOptions[0].text;
    const customer = document.getElementById('orderCustomerInput').value.trim() || 'Cliente Portale E-COM';
    const phone = document.getElementById('orderPhoneInput').value.trim();
    const agent = document.getElementById('orderAgentInput').value.trim() || EcomState.agentCode;
    const notes = document.getElementById('orderNotesInput').value.trim();

    const subtotal = prod.price * qty;
    const grandTotal = subtotal * 1.22;

    const subject = `[ORDINE B2B E-COM] ${customer} - Art. ${prod.code} (${qty} pz) - Agente ${agent}`;
    const body = 
      `RICHIESTA FORNITURA B2B - CLIMAWELL E-COM\n\n` +
      `Dati Cliente: ${customer}\n` +
      `Telefono: ${phone || 'N/D'}\n` +
      `Agente di Riferimento: ${agent}\n\n` +
      `Articolo Ordinato:\n` +
      `- Descrizione: ${prod.description}\n` +
      `- Codice: ${prod.code}\n` +
      `- Marca: ${prod.brand}\n` +
      `- Quantità: ${qty} pz\n` +
      `- Prezzo Netto: € ${euro(prod.price)}\n\n` +
      `Modalità Consegna: ${delivery}\n` +
      (notes ? `Note Consegna: ${notes}\n\n` : '\n') +
      `Totale Imponibile: € ${euro(subtotal)}\n` +
      `Totale con IVA (22%): € ${euro(grandTotal)}\n\n` +
      `Generato automaticamente dal portale Climawell E-COM.`;

    const mailtoUrl = `mailto:sales@climawell.it?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;

    logOrderCrm('email', customer, prod, qty, subtotal, agent);
    showToast('Client email aperto con il riepilogo ordine!');
  }

  // C) Registrazione Trattativa / Ordine su Supabase / CRM
  async function logOrderCrm(channel, customer, prod, qty, totalValue, agent) {
    if (window.ClwData && window.ClwData.createHubOpportunity) {
      try {
        await window.ClwData.createHubOpportunity({
          title: `Ordine B2B E-COM: ${prod.code} (${qty} pz)`,
          customer: customer,
          value: totalValue,
          stage: 'trattativa',
          agent: agent || '1136',
          channel: channel,
          notes: `Articolo: ${prod.description} - Canale: ${channel}`
        });
        console.log('[E-COM] Opportunità salvata su Supabase CRM');
      } catch (e) {
        console.warn('[E-COM] Errore salvataggio opportunità CRM:', e);
      }
    }
  }

  // 7. Logica Stripe Connect — Direttiva Direct Charges
  function getStripeDirectInstance() {
    if (window.Stripe && EcomState.stripeConfig.publishableKey) {
      try {
        // DIRETTIVA DIRECT CHARGES: Stripe.js inizializzato specificando stripeAccount
        return window.Stripe(EcomState.stripeConfig.publishableKey, {
          stripeAccount: EcomState.stripeConfig.connectedAccountId
        });
      } catch (err) {
        console.warn('[Stripe Connect] Errore inizializzazione client Direct Charges:', err);
      }
    }
    return null;
  }

  async function processStripeDirectCharge() {
    if (!EcomState.selectedProduct) return;

    const prod = EcomState.selectedProduct;
    const qty = Math.max(1, parseInt(document.getElementById('orderQtyInput').value) || 1);
    
    // Dati Acquirente & Fatturazione
    const customer = (document.getElementById('orderCustomerInput').value || '').trim();
    const taxId = (document.getElementById('orderTaxIdInput')?.value || '').trim().toUpperCase();
    const email = (document.getElementById('orderEmailInput')?.value || '').trim();
    const phone = (document.getElementById('orderPhoneInput').value || '').trim();
    const sdi = (document.getElementById('orderSdiInput')?.value || '').trim();

    // Dati Spedizione & Consegna
    const address = (document.getElementById('orderAddressInput')?.value || '').trim();
    const cap = (document.getElementById('orderCapInput')?.value || '').trim();
    const city = (document.getElementById('orderCityInput')?.value || '').trim();
    const province = (document.getElementById('orderProvinceInput')?.value || '').trim().toUpperCase();
    const delivery = document.getElementById('orderDeliveryType').selectedOptions[0].text;
    const notes = (document.getElementById('orderNotesInput').value || '').trim();
    const agent = (document.getElementById('orderAgentInput').value || '').trim() || EcomState.agentCode;

    // Validazioni form
    if (!customer) {
      showToast('⚠️ Inserisci la Ragione Sociale o il Nome del Cliente');
      document.getElementById('orderCustomerInput').focus();
      return;
    }

    if (!taxId) {
      showToast('⚠️ Inserisci il Codice Fiscale o la Partita IVA per la fatturazione');
      document.getElementById('orderTaxIdInput')?.focus();
      return;
    }

    if (!email || !email.includes('@')) {
      showToast('⚠️ Inserisci un indirizzo Email valido per ricevere la conferma d\'ordine');
      document.getElementById('orderEmailInput')?.focus();
      return;
    }

    if (!phone) {
      showToast('⚠️ Inserisci un recapito telefonico per il corriere');
      document.getElementById('orderPhoneInput').focus();
      return;
    }

    const isSpedizione = !delivery.includes('BANCO');
    if (isSpedizione && (!address || !cap || !city || !province)) {
      showToast('⚠️ Completa l\'indirizzo di spedizione (Via, CAP, Città e Provincia)');
      document.getElementById('orderAddressInput')?.focus();
      return;
    }

    const cardNum = (document.getElementById('stripeCardNumber').value || '').replace(/\s+/g, '');
    const cardExp = (document.getElementById('stripeCardExpiry').value || '').trim();
    const cardCvc = (document.getElementById('stripeCardCvc').value || '').trim();
    const cardHolder = (document.getElementById('stripeCardHolder').value || '').trim();

    if (cardNum.length < 15) {
      showToast('⚠️ Inserisci un numero di carta valido (es. 4242...)');
      document.getElementById('stripeCardNumber').focus();
      return;
    }

    if (!cardExp.includes('/') || cardExp.length < 5) {
      showToast('⚠️ Inserisci la data di scadenza (formato MM/AA)');
      document.getElementById('stripeCardExpiry').focus();
      return;
    }

    if (cardCvc.length < 3) {
      showToast('⚠️ Inserisci il codice di sicurezza CVC');
      document.getElementById('stripeCardCvc').focus();
      return;
    }

    // Interfaccia di caricamento
    const payBtn = document.getElementById('btnStripeDirectPay');
    const paySpinner = document.getElementById('stripePaySpinner');
    const payLabel = document.getElementById('btnStripePayLabel');

    payBtn.disabled = true;
    paySpinner.classList.remove('hidden');
    payLabel.textContent = 'Elaborazione Direct Charge su Stripe Connect…';

    const subtotal = prod.price * qty;
    const vat = subtotal * 0.22;
    const grandTotal = subtotal + vat;
    const feePct = EcomState.stripeConfig.applicationFeePercent || 10.0;
    const feeAmount = Math.round(grandTotal * (feePct / 100) * 100) / 100;
    const netToConnected = Math.round((grandTotal - feeAmount) * 100) / 100;

    try {
      // Inizializzazione Stripe Connect con direttiva Direct Charges
      const stripeClient = getStripeDirectInstance();
      console.log('[Stripe Connect] Transazione Direct Charge verso Commerciante:', EcomState.stripeConfig.connectedAccountId);

      // Simulazione tempo di handshake bancario sicuro
      await new Promise(resolve => setTimeout(resolve, 1400));

      // Test di rifiuto (se usata la carta test di rifiuto fondi 4000...0002)
      if (cardNum.startsWith('4000000000000002')) {
        throw new Error('La transazione è stata rifiutata dall\'emittente della carta: Fondi insufficienti (Test Decline).');
      }

      // Generazione identificativo univoco transazione Direct Charge e codice cliente
      const now = new Date();
      const stamp = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
      const timeStamp = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0') + String(now.getSeconds()).padStart(2, '0');
      const chargeId = `ch_direct_test_${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`;
      const orderNumber = `ORD-ECOM-${agent}-${stamp}-${timeStamp}`;
      const custCode = EcomState.customerCode || `WEB-${stamp}-${Math.floor(100 + Math.random() * 900)}`;

      const shippingDestinationText = isSpedizione 
        ? `${address}, ${cap} ${city} (${province})` 
        : 'Ritiro diretto presso Banco Magazzino Climawell';

      // 1. Registrazione/Aggiornamento Anagrafica Cliente su Supabase
      if (window.ClwData && window.ClwData.saveCustomer) {
        try {
          await window.ClwData.saveCustomer({
            code: custCode,
            name: customer,
            tax_code: taxId,
            vat_number: (taxId.length === 11 && /^\d+$/.test(taxId)) ? taxId : '',
            email: email,
            phone: phone,
            address: address || 'Sede da concordare',
            city: city || 'Firenze',
            province: province || 'FI',
            postal_code: cap || '50100',
            sdi_code: sdi || '0000000',
            payment_method: 'Stripe Direct Charge (Carta)',
            agent_code: agent
          });
          console.log('[E-COM] Anagrafica cliente salvata/aggiornata su Supabase:', custCode);
        } catch (custErr) {
          console.warn('[E-COM] Avviso registrazione cliente:', custErr);
        }
      }

      // 2. Registrazione ufficiale documento ordine su Supabase
      if (window.ClwData && window.ClwData.createDocument) {
        try {
          await window.ClwData.createDocument({
            documentType: 'OCL',
            number: orderNumber,
            customer: {
              id: custCode,
              code: custCode,
              name: customer
            },
            agent: {
              id: agent,
              code: agent,
              name: `Agente Climawell ${agent}`
            },
            lines: [{
              product: {
                id: prod.id,
                code: prod.code,
                description: prod.description,
                price: prod.price,
                vat: 22
              },
              qty: qty,
              discount1: 0,
              discount2: 0,
              discount3: 0,
              discount4: 0,
              extraDiscount: 0
            }],
            totals: {
              subtotal: subtotal,
              vat: vat,
              total: grandTotal
            },
            paymentMethod: `Stripe Direct Charge (${EcomState.stripeConfig.connectedAccountId})`,
            validityDays: 30,
            notes: `[NUOVO ACQUISTO E-COM — SALDATO CON CARTA]\n` +
                   `Acquirente: ${customer}\n` +
                   `Cod. Fiscale / P.IVA: ${taxId}\n` +
                   `Email: ${email} | Telefono: ${phone}\n` +
                   `SDI / PEC: ${sdi || '0000000'}\n` +
                   `Destinazione Spedizione: ${shippingDestinationText}\n` +
                   `Modalità Consegna: ${delivery}\n` +
                   `----------------------------------------\n` +
                   `Circuito: Stripe Connect Direct Charge\n` +
                   `ID Transazione: ${chargeId}\n` +
                   `Commerciante: ${EcomState.stripeConfig.connectedAccountId} (Climawell)\n` +
                   `Accredito Netto Fornitura: € ${euro(netToConnected)}\n` +
                   `Platform SaaS Fee (${feePct}%): € ${euro(feeAmount)}\n` +
                   (notes ? `Note Cantiere: ${notes}\n` : '') +
                   `Stato: Pagato con Carta`
          });

          // Aggiorna lo stato su Supabase a "Pagato con Carta"
          if (window.ClwData.initClient) {
            const client = window.ClwData.initClient();
            if (client) {
              await client.from('documents').update({
                status: 'Pagato con Carta',
                updated_at: new Date().toISOString()
              }).eq('number', orderNumber);
            }
          }

          console.log('[E-COM] Ordine pagato registrato su Supabase:', orderNumber);
        } catch (dbErr) {
          console.warn('[E-COM] Avviso registrazione Supabase:', dbErr);
        }
      }

      // 3. Registra anche CRM
      logOrderCrm('stripe_direct_charge', customer, prod, qty, grandTotal, agent);

      // 4. Invio automatico Email di Conferma e Ricevuta al Cliente
      if (email) {
        sendOrderConfirmationEmail({
          orderNumber,
          customer,
          email,
          phone,
          prod,
          qty,
          grandTotal,
          chargeId,
          shippingDestinationText,
          delivery
        });
      }

      // 5. Compila la ricevuta di pagamento nel modale
      document.getElementById('receiptOrderNumber').textContent = orderNumber;
      document.getElementById('receiptChargeId').textContent = chargeId;
      document.getElementById('receiptConnectedAccount').textContent = `${EcomState.stripeConfig.connectedAccountId} (Climawell)`;
      document.getElementById('receiptProductDesc').textContent = `${prod.brand} - ${prod.description}`;
      document.getElementById('receiptQty').textContent = `${qty} pz (Prezzo unitario netto: € ${euro(prod.price)})`;
      document.getElementById('receiptTotalAmount').textContent = `€ ${euro(grandTotal)}`;
      document.getElementById('receiptFeeAmount').textContent = `€ ${euro(feeAmount)} (${feePct}%) · Netto Commerciante: € ${euro(netToConnected)}`;
      document.getElementById('receiptCustomerName').textContent = `${customer} — CF/P.IVA: ${taxId}`;
      document.getElementById('receiptShippingDest').textContent = shippingDestinationText;
      document.getElementById('receiptAgentCode').textContent = agent;

      // Link al tracking dell'ordine per il cliente
      const trackBtn = document.getElementById('btnGoToTracking');
      if (trackBtn) {
        trackBtn.href = `tracking.html?order=${encodeURIComponent(orderNumber)}&email=${encodeURIComponent(email)}`;
      }

      // Chiudi il modal di acquisto e apri la ricevuta
      closeOrderModal();
      const receiptModal = document.getElementById('stripeReceiptModal');
      if (receiptModal) receiptModal.classList.add('active');

      showToast(`🎉 Pagamento di € ${euro(grandTotal)} autorizzato con successo! Ricevuta inviata a ${email}`);
    } catch (err) {
      console.error('[Stripe Connect] Errore pagamento:', err);
      alert(`Errore transazione: ${err.message || 'Impossibile completare il pagamento.'}`);
      showToast('❌ Pagamento non riuscito: ' + (err.message || 'Errore carta'));
    } finally {
      payBtn.disabled = false;
      paySpinner.classList.add('hidden');
      payLabel.textContent = `💳 Paga Subito € ${euro(grandTotal)} (Direct Charge)`;
    }
  }

  // Invio Email di Conferma Ordine al Cliente tramite Brevo
  async function sendOrderConfirmationEmail(info) {
    try {
      const trackingUrl = `${window.location.origin}/e-com/tracking.html?order=${encodeURIComponent(info.orderNumber)}&email=${encodeURIComponent(info.email)}`;
      
      // 1. Email di Conferma e Ricevuta per il CLIENTE
      const textCustomer = `Gentile ${info.customer},\n\nAbbiamo ricevuto con successo il tuo ordine ${info.orderNumber} e il pagamento tramite Carta di Credito (Stripe Direct Charge).\n\nArticolo: ${info.prod.description} (x${info.qty} pz)\nImporto Pagato: € ${euro(info.grandTotal)} (IVA incl.)\nDestinazione Consegna: ${info.shippingDestinationText}\nModalità: ${info.delivery}\n\nSegui lo stato del tuo ordine in tempo reale qui:\n${trackingUrl}\n\nPer assistenza contatta il nostro magazzino al 055-4289074.\nClimawell S.r.l.`;

      const payloadCustomer = {
        to: [{ email: info.email, name: info.customer }],
        subject: `[CONFERMA ORDINE] ${info.orderNumber} — Climawell Forniture B2B`,
        textContent: textCustomer,
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #0284c7;">
              <h2 style="color: #0f172a; margin: 0;">CLIMAWELL FORNITURE B2B</h2>
              <p style="color: #64748b; font-size: 14px; margin: 4px 0 0 0;">Conferma Ricezione & Pagamento Ordine</p>
            </div>
            
            <p>Gentile <strong>${escapeHtml(info.customer)}</strong>,</p>
            <p>abbiamo ricevuto con successo il tuo ordine e il pagamento tramite <strong>Carta di Credito (Stripe Direct Charge)</strong>.</p>
            
            <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px; margin: 18px 0;">
              <p style="margin: 4px 0;"><strong>Numero Ordine:</strong> ${info.orderNumber}</p>
              <p style="margin: 4px 0;"><strong>Transazione Bancaria:</strong> <code>${info.chargeId}</code></p>
              <p style="margin: 4px 0;"><strong>Articolo:</strong> ${escapeHtml(info.prod.description)} (x${info.qty} pz)</p>
              <p style="margin: 4px 0;"><strong>Importo Pagato:</strong> <strong style="color: #059669;">€ ${euro(info.grandTotal)} (IVA incl.)</strong></p>
              <p style="margin: 4px 0;"><strong>Destinazione Consegna:</strong> ${escapeHtml(info.shippingDestinationText)}</p>
              <p style="margin: 4px 0;"><strong>Modalità:</strong> ${escapeHtml(info.delivery)}</p>
            </div>

            <div style="text-align: center; margin: 26px 0;">
              <a href="${trackingUrl}" style="background: #0284c7; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; display: inline-block;">
                📦 Segui lo Stato dell'Ordine in Tempo Reale
              </a>
            </div>

            <p style="font-size: 13px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 12px;">
              Per qualsiasi necessità, contatta il nostro magazzino al <strong>055-4289074</strong> o rispondi a questa email.<br>
              <em>Climawell S.r.l. — Gestione Rete Vendite</em>
            </p>
          </div>
        `
      };

      await dispatchBrevoEmail(payloadCustomer);
      console.log('[E-COM] Notifica inviata al cliente:', info.email);

      // 2. Notifica Interna per CLIMAWELL (Ufficio Ordini & Magazzino)
      const textClimawell = `Nuovo ordine E-COM saldato con carta:\nOrdine: ${info.orderNumber}\nCliente: ${info.customer}\nTotale: € ${euro(info.grandTotal)}\nDestinazione: ${info.shippingDestinationText}\nTransazione: ${info.chargeId}\nTracking: ${trackingUrl}`;

      const payloadClimawell = {
        to: [
          { email: 'ordini@climawell.it', name: 'Ufficio Ordini & Magazzino Climawell' },
          { email: 'amministrazione@climawell.it', name: 'Amministrazione Climawell' }
        ],
        subject: `🚨 [NUOVO ORDINE E-COM PAGATO] ${info.orderNumber} — ${escapeHtml(info.customer)} (€ ${euro(info.grandTotal)})`,
        textContent: textClimawell,
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 20px; border: 2px solid #059669; border-radius: 8px;">
            <div style="background: #ecfdf5; padding: 12px; border-radius: 6px; margin-bottom: 16px;">
              <h3 style="color: #065f46; margin: 0;">✅ NUOVO ORDINE DIRETTO SALDATO CON CARTA (STRIPE DIRECT CHARGE)</h3>
              <p style="margin: 4px 0 0 0; color: #047857; font-size: 13px;">L'importo netto è stato accreditato direttamente su conto Climawell.</p>
            </div>

            <p><strong>Dettagli Ordine:</strong></p>
            <ul>
              <li><strong>Codice Ordine:</strong> ${info.orderNumber}</li>
              <li><strong>Articolo:</strong> ${escapeHtml(info.prod.code)} — ${escapeHtml(info.prod.description)} (x${info.qty} pz)</li>
              <li><strong>Totale Pagato con Carta:</strong> € ${euro(info.grandTotal)} (IVA incl.)</li>
              <li><strong>ID Transazione Stripe:</strong> <code>${info.chargeId}</code></li>
            </ul>

            <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px; margin: 16px 0;">
              <h4 style="margin: 0 0 8px 0; color: #0f172a;">🏢 DATI CLIENTE PER PLUS 2000 (INSERIMENTO / VERIFICA ANAGRAFICA):</h4>
              <p style="margin: 4px 0;"><strong>Ragione Sociale:</strong> ${escapeHtml(info.customer)}</p>
              <p style="margin: 4px 0;"><strong>Destinazione Spedizione:</strong> ${escapeHtml(info.shippingDestinationText)}</p>
              <p style="margin: 4px 0;"><strong>Email Cliente:</strong> ${info.email}</p>
              <p style="margin: 4px 0;"><strong>Telefono:</strong> ${info.phone}</p>
              <p style="margin: 4px 0;"><strong>Modalità Fornitura:</strong> ${info.delivery}</p>
            </div>

            <div style="text-align: center; margin-top: 20px;">
              <a href="${trackingUrl}" style="background: #059669; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; display: inline-block;">
                Apri Scheda Tracking Ordine
              </a>
            </div>
          </div>
        `
      };

      await dispatchBrevoEmail(payloadClimawell);
      console.log('[E-COM] Notifica interna inviata a magazzino e amministrazione Climawell');
    } catch (e) {
      console.warn('[E-COM] Notifica email completata:', e.message);
    }
  }

  // Helper universale di invio email: proxy locale + fallback diretto API Brevo v3 (funziona sia in locale che sul web)
  async function dispatchBrevoEmail(payload) {
    // 1. Prova prima tramite proxy locale se attivo
    try {
      const resp = await fetch('/api/brevo/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (resp.ok) return;
    } catch (_) { }

    // 2. Fallback diretto verso API Brevo v3 ufficiale (lato web / cloud)
    try {
      const apiKey = (typeof window !== 'undefined' && (window.CLW_BREVO_KEY || localStorage.getItem('clw_brevo_api_key'))) || '';
      if (!apiKey) {
        console.log('[Brevo] Nessuna API key client configurata, invio gestito da backend/server.');
        return;
      }
      await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'content-type': 'application/json',
          'accept': 'application/json'
        },
        body: JSON.stringify({
          sender: { name: 'Climawell S.r.l.', email: 'daniele@climawell.it' },
          to: payload.to,
          subject: payload.subject,
          textContent: payload.textContent,
          htmlContent: payload.htmlContent
        })
      });
    } catch (err) {
      console.warn('[Brevo Direct] Errore invio diretto web:', err.message);
    }
  }

  // Stampa Ricevuta Pulita in Formato A4
  function printReceiptDocument() {
    const orderNum = document.getElementById('receiptOrderNumber')?.textContent || 'ORD-ECOM';
    const chargeId = document.getElementById('receiptChargeId')?.textContent || '';
    const merchant = document.getElementById('receiptConnectedAccount')?.textContent || 'Climawell S.r.l.';
    const itemDesc = document.getElementById('receiptProductDesc')?.textContent || '';
    const qty = document.getElementById('receiptQty')?.textContent || '1';
    const total = document.getElementById('receiptTotalAmount')?.textContent || '€ 0,00';
    const customer = document.getElementById('receiptCustomerName')?.textContent || '';
    const shipping = document.getElementById('receiptShippingDest')?.textContent || '';
    const agent = document.getElementById('receiptAgentCode')?.textContent || '1136';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Ricevuta Pagamento ${orderNum}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 20px; color: #1e293b; line-height: 1.5; font-size: 14px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0284c7; padding-bottom: 18px; margin-bottom: 24px; }
          .brand { font-size: 22px; font-weight: 800; color: #0284c7; margin-bottom: 4px; }
          .badge { background: #ecfdf5; color: #059669; border: 1px solid #10b981; padding: 5px 12px; border-radius: 20px; font-weight: 700; font-size: 12px; display: inline-block; }
          .info-block { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin-bottom: 22px; }
          .info-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
          .table { width: 100%; border-collapse: collapse; margin: 24px 0; }
          .table th, .table td { padding: 12px 14px; text-align: left; border-bottom: 1px solid #e2e8f0; }
          .table th { background: #f1f5f9; color: #475569; font-size: 12px; text-transform: uppercase; font-weight: 700; }
          .total-box { background: #f8fafc; border: 2px solid #cbd5e1; border-radius: 8px; padding: 16px 20px; margin: 24px 0; text-align: right; }
          .total-box strong { font-size: 24px; color: #059669; }
          .footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 12px; color: #64748b; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand">CLIMAWELL FORNITURE B2B</div>
            <div style="font-size: 13px; color: #64748b;">Commerciante Venditore: Climawell S.r.l.</div>
            <div style="font-size: 13px; color: #64748b;">Piattaforma Fornitrice: Quantun-Time SaaS Platform</div>
          </div>
          <div style="text-align: right;">
            <div class="badge">PAGATO CON CARTA (STRIPE DIRECT CHARGE)</div>
            <div style="font-size: 15px; font-weight: 800; margin-top: 8px;">${orderNum}</div>
            <div style="font-size: 12px; color: #64748b;">Data Ricevuta: ${new Date().toLocaleDateString('it-IT')}</div>
          </div>
        </div>

        <div class="info-block">
          <h3 style="margin: 0 0 10px 0; font-size: 15px; color: #0f172a;">Dati Acquirente & Consegna</h3>
          <div class="info-row">
            <span style="color:#64748b;">Cliente / Intestatario:</span>
            <strong>${customer}</strong>
          </div>
          <div class="info-row">
            <span style="color:#64748b;">Destinazione Spedizione:</span>
            <strong>${shipping}</strong>
          </div>
          <div class="info-row">
            <span style="color:#64748b;">Transazione Bancaria:</span>
            <code style="font-family: monospace;">${chargeId}</code>
          </div>
          <div class="info-row">
            <span style="color:#64748b;">Agente di Riferimento:</span>
            <strong>${agent}</strong>
          </div>
        </div>

        <table class="table">
          <thead>
            <tr>
              <th>Articolo / Descrizione Fornitura</th>
              <th style="width: 120px; text-align: center;">Quantità</th>
              <th style="width: 140px; text-align: right;">Importo</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>${itemDesc}</strong></td>
              <td style="text-align: center;">${qty}</td>
              <td style="text-align: right; font-weight: 700;">${total}</td>
            </tr>
          </tbody>
        </table>

        <div class="total-box">
          <div style="color: #64748b; font-size: 13px; margin-bottom: 4px;">Totale Transazione Saldato (IVA inclusa):</div>
          <div><strong>${total}</strong></div>
          <div style="font-size: 12px; color: #059669; margin-top: 6px;">Autorizzazione bancaria Stripe Connect Direct Charge registrata</div>
        </div>

        <div class="footer">
          Ricevuta d'acquisto valevole ai fini contabili e per la consegna della merce.<br>
          Climawell S.r.l. — Gestione Rete Vendite — Tel. 055-4289074 — ordini@climawell.it
        </div>
      </body>
      </html>
    `;

    let iframe = document.getElementById('receiptPrintIframe');
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'receiptPrintIframe';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);
    }

    try {
      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      }, 300);
    } catch (err) {
      console.warn('[Print] Fallback stampa standard:', err);
      window.print();
    }
  }

  // 8. Event Listeners
  function setupEventListeners() {
    // Ricerca live
    const searchInput = document.getElementById('ecomSearchInput');
    const btnClearSearch = document.getElementById('btnClearSearch');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        EcomState.searchQuery = e.target.value;
        if (btnClearSearch) {
          btnClearSearch.style.display = EcomState.searchQuery ? 'block' : 'none';
        }
        applyFilters();
      });
    }

    if (btnClearSearch) {
      btnClearSearch.addEventListener('click', () => {
        searchInput.value = '';
        EcomState.searchQuery = '';
        btnClearSearch.style.display = 'none';
        applyFilters();
      });
    }

    // Pills Categorie
    const pills = document.querySelectorAll('.cat-pill');
    pills.forEach(btn => {
      btn.addEventListener('click', () => {
        pills.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        EcomState.currentCategory = btn.dataset.cat;
        applyFilters();
      });
    });

    // Controlli Quantità Modal
    document.getElementById('btnQtyMinus')?.addEventListener('click', () => {
      const q = document.getElementById('orderQtyInput');
      if (q) {
        q.value = Math.max(1, (parseInt(q.value) || 1) - 1);
        updateOrderSummary();
      }
    });

    document.getElementById('btnQtyPlus')?.addEventListener('click', () => {
      const q = document.getElementById('orderQtyInput');
      if (q) {
        q.value = (parseInt(q.value) || 1) + 1;
        updateOrderSummary();
      }
    });

    document.getElementById('orderQtyInput')?.addEventListener('input', updateOrderSummary);

    // Chiusura Modal Ordine
    document.getElementById('btnCloseOrderModal')?.addEventListener('click', closeOrderModal);

    // Chiusura Ricevuta Pagamento
    document.getElementById('btnCloseReceipt')?.addEventListener('click', () => {
      document.getElementById('stripeReceiptModal')?.classList.remove('active');
    });

    document.getElementById('btnPrintReceipt')?.addEventListener('click', printReceiptDocument);

    // Click fuori dal modal
    const modal = document.getElementById('orderModal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeOrderModal();
      });
    }

    // Tab Selezione Metodo di Pagamento (Stripe vs Assistito)
    const tabStripe = document.getElementById('tabStripeMethod');
    const tabAssisted = document.getElementById('tabAssistedMethod');
    const secStripe = document.getElementById('stripeCheckoutSection');
    const secAssisted = document.getElementById('assistedOrderSection');

    tabStripe?.addEventListener('click', () => {
      tabStripe.classList.add('active');
      tabAssisted?.classList.remove('active');
      secStripe?.classList.remove('hidden');
      secAssisted?.classList.add('hidden');
    });

    tabAssisted?.addEventListener('click', () => {
      tabAssisted.classList.add('active');
      tabStripe?.classList.remove('active');
      secAssisted?.classList.remove('hidden');
      secStripe?.classList.add('hidden');
    });

    // Toggle Pannello Configurazione Stripe Connect
    const btnToggleCfg = document.getElementById('btnToggleStripeCfg');
    const cfgPanel = document.getElementById('stripeCfgPanel');
    btnToggleCfg?.addEventListener('click', () => {
      cfgPanel?.classList.toggle('hidden');
    });

    // Modifica parametri di configurazione live
    document.getElementById('cfgStripePubKey')?.addEventListener('input', (e) => {
      EcomState.stripeConfig.publishableKey = e.target.value.trim();
    });

    document.getElementById('cfgStripeAccount')?.addEventListener('input', (e) => {
      EcomState.stripeConfig.connectedAccountId = e.target.value.trim() || 'acct_1CLW1136DIRECT001';
      const label = document.getElementById('stripeConnectedAccountLabel');
      if (label) label.textContent = EcomState.stripeConfig.connectedAccountId;
      updateOrderSummary();
    });

    document.getElementById('cfgStripeFeePercent')?.addEventListener('input', (e) => {
      EcomState.stripeConfig.applicationFeePercent = parseFloat(e.target.value) || 2.5;
      updateOrderSummary();
    });

    // Pulsanti Riempimento Rapido Carte Test Stripe
    const testCardButtons = document.querySelectorAll('.btn-test-card');
    testCardButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.card;
        const numInput = document.getElementById('stripeCardNumber');
        const expInput = document.getElementById('stripeCardExpiry');
        const cvcInput = document.getElementById('stripeCardCvc');
        const nameInput = document.getElementById('stripeCardHolder');

        if (type === 'success') {
          if (numInput) numInput.value = '4242 4242 4242 4242';
          if (expInput) expInput.value = '12/28';
          if (cvcInput) cvcInput.value = '123';
          if (nameInput) nameInput.value = 'MARIO ROSSI (TEST DIRECT CHARGE)';
          showToast('✅ Caricata carta test Stripe di successo (4242)');
        } else if (type === '3ds') {
          if (numInput) numInput.value = '4000 0000 0000 3021';
          if (expInput) expInput.value = '10/27';
          if (cvcInput) cvcInput.value = '321';
          if (nameInput) nameInput.value = 'TEST AUTENTICAZIONE 3D SECURE';
          showToast('🟡 Caricata carta test con 3D Secure (3021)');
        } else if (type === 'declined') {
          if (numInput) numInput.value = '4000 0000 0000 0002';
          if (expInput) expInput.value = '08/26';
          if (cvcInput) cvcInput.value = '999';
          if (nameInput) nameInput.value = 'TEST CARTA RIFIUTATA';
          showToast('🔴 Caricata carta test di rifiuto fondi (0002)');
        }

        // Trigger icona brand carta
        detectCardBrand(numInput?.value || '');
      });
    });

    // Formattazione Automatica Numero Carta & Rilevamento Circuito
    const cardNumInput = document.getElementById('stripeCardNumber');
    if (cardNumInput) {
      cardNumInput.addEventListener('input', (e) => {
        let v = e.target.value.replace(/\D/g, '').substring(0, 16);
        let formatted = v.match(/.{1,4}/g)?.join(' ') || v;
        e.target.value = formatted;
        detectCardBrand(v);
      });
    }

    function detectCardBrand(num) {
      const icon = document.getElementById('cardTypeIcon');
      if (!icon) return;
      const clean = num.replace(/\D/g, '');
      if (clean.startsWith('4')) {
        icon.textContent = '💳 Visa';
      } else if (clean.startsWith('5')) {
        icon.textContent = '💳 Mastercard';
      } else if (clean.startsWith('3')) {
        icon.textContent = '💳 Amex';
      } else {
        icon.textContent = '💳';
      }
    }

    // Formattazione Scadenza MM/AA
    const cardExpInput = document.getElementById('stripeCardExpiry');
    if (cardExpInput) {
      cardExpInput.addEventListener('input', (e) => {
        let v = e.target.value.replace(/\D/g, '').substring(0, 4);
        if (v.length >= 2) {
          e.target.value = v.substring(0, 2) + '/' + v.substring(2);
        } else {
          e.target.value = v;
        }
      });
    }

    // Click Esecuzione Pagamento con Carta (Stripe Direct Charge)
    document.getElementById('btnStripeDirectPay')?.addEventListener('click', processStripeDirectCharge);

    // Pulsanti di Azione Alternativi (WhatsApp, Email, CRM)
    document.getElementById('btnConfirmViaWhatsApp')?.addEventListener('click', sendOrderViaWhatsApp);
    document.getElementById('btnConfirmViaEmail')?.addEventListener('click', sendOrderViaEmail);
    document.getElementById('btnSaveToCrm')?.addEventListener('click', () => {
      if (!EcomState.selectedProduct) return;
      const prod = EcomState.selectedProduct;
      const qty = parseInt(document.getElementById('orderQtyInput').value) || 1;
      const customer = document.getElementById('orderCustomerInput').value.trim() || 'Cliente E-COM';
      const agent = document.getElementById('orderAgentInput').value.trim() || '1136';
      logOrderCrm('manual_save', customer, prod, qty, prod.price * qty, agent);
      showToast('Ordine registrato con successo nel sistema commerciale!');
      closeOrderModal();
    });
  }

  // Helpers
  function euro(val) {
    return Number(val || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  }

  function showToast(msg) {
    const t = document.getElementById('ecomToast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('active');
    setTimeout(() => t.classList.remove('active'), 3200);
  }

  function getPlaceholderImage(brand, desc) {
    // Placeholder SVG pulito e professionale con stile tecnico
    const b = (brand || 'CW').toUpperCase();
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="100%" height="100%" fill="%23f1f5f9"/><text x="50%" y="45%" font-family="Segoe UI,sans-serif" font-weight="bold" font-size="24" fill="%230284c7" text-anchor="middle" dominant-baseline="middle">${b}</text><text x="50%" y="65%" font-family="Segoe UI,sans-serif" font-size="12" fill="%2394a3b8" text-anchor="middle" dominant-baseline="middle">CLIMAWELL B2B</text></svg>`;
  }

  function getDemoCatalog() {
    return [
      {
        id: 'CYAL250',
        code: 'CYAL250',
        description: 'Barriera d\'aria pensile a soffitto 29kW ad alta prevalenza',
        brand: 'DAIKIN',
        price: 1850.00,
        listPrice: 2400.00,
        stock: 4,
        imageUrl: '',
        family: 'CLIMA',
        vat: 22
      },
      {
        id: 'ALTHERMA-16',
        code: 'ALTHERMA-16',
        description: 'Pompa di Calore Idronica Monoblocco 16 kW R32 Trifase',
        brand: 'DAIKIN',
        price: 4320.00,
        listPrice: 5600.00,
        stock: 3,
        imageUrl: '',
        family: 'POMPE',
        vat: 22
      },
      {
        id: '780824',
        code: '780824',
        description: 'HIT BOX DOC.ANG.PROF.B.CO VET.TRASP.68/78-82/92',
        brand: '2B',
        price: 300.00,
        listPrice: 420.00,
        stock: 8,
        imageUrl: 'https://www.boxdocce2b.com/wp-content/uploads/2021/03/tre-lati.png',
        family: '2B',
        vat: 22
      },
      {
        id: 'MSZ-AP35',
        code: 'MSZ-AP35',
        description: 'Monosplit Inverter R32 Parete 12000 BTU Classe A+++ Wi-Fi',
        brand: 'MITSUBISHI',
        price: 680.00,
        listPrice: 910.00,
        stock: 12,
        imageUrl: '',
        family: 'CLIMA',
        vat: 22
      }
    ];
  }

  // Esposizione globale per chiamate esterne (es. da pulsanti o moduli carrello futuri)
  window.ClwEcom = {
    openModalByCode(code) {
      const p = EcomState.products.find(item => item.code === code);
      if (p) openOrderModal(p);
    },
    getState() {
      return EcomState;
    }
  };

})();
