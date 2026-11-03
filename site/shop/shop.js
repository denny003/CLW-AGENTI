/**
 * CLIMAWELL SHOP B2C — LOGICA E-COMMERCE PRIVATI
 * Connessione Supabase, Catalogo Retail, Stripe Connect Direct Charges e Brevo
 */

(function () {
  'use strict';

  // Stato Globale Shop B2C
  const ShopState = {
    products: [],
    filteredProducts: [],
    currentCategory: 'all',
    searchQuery: '',
    sortBy: 'featured',
    selectedProduct: null,
    cartItem: null,
    stripeConfig: {
      publishableKey: 'pk_test_51BTUDGJAJfZb9HEBwDg561gvhU3ZGN2x4e6vP6W0c7g8H9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6',
      connectedAccountId: 'acct_climawell_b2b',
      applicationFeePercent: 10.0 // SaaS Platform Quantun-Time
    }
  };

  // Inizializzazione al caricamento DOM
  document.addEventListener('DOMContentLoaded', initShop);

  async function initShop() {
    setupEventListeners();
    await loadProductsCatalog();
  }

  // 1. Caricamento Prodotti da Supabase
  async function loadProductsCatalog() {
    const grid = document.getElementById('productsGrid');
    const counter = document.getElementById('productsFoundCount');
    if (counter) counter.textContent = 'Caricamento prodotti in corso…';

    let prods = [];

    // Prova a leggere da Supabase (integrazione con Plus 2000)
    if (window.ClwData && typeof window.ClwData.getProducts === 'function') {
      try {
        const supProds = await window.ClwData.getProducts();
        if (Array.isArray(supProds) && supProds.length > 0) {
          prods = supProds.map(p => {
            const rawPrice = Number(p.price || p.list_price || 0);
            const vat = Number(p.vat || 22);
            // Calcolo prezzo al pubblico IVA Inclusa
            const priceWithVat = rawPrice * (1 + vat / 100);
            const listPriceWithVat = (p.list_price ? Number(p.list_price) * (1 + vat / 100) : priceWithVat * 1.3);

            return {
              id: p.id || p.code,
              code: p.code,
              description: p.description,
              brand: p.brand || 'CLIMAWELL',
              category: mapCategory(p),
              rawPrice: rawPrice,
              priceWithVat: priceWithVat,
              listPriceWithVat: listPriceWithVat,
              vat: vat,
              stock: p.stock !== undefined ? Number(p.stock) : 10,
              imageUrl: p.imageUrl || p.image_url || ''
            };
          });
        }
      } catch (err) {
        console.warn('[Shop B2C] Errore lettura Supabase, attivo fallback demo:', err.message);
      }
    }

    // Se non ci sono prodotti dal DB, carica catalogo demo residenziale
    if (!prods.length) {
      prods = getDemoRetailCatalog();
    }

    ShopState.products = prods;
    updateCategoryCounters();
    applyFiltersAndSort();
  }

  // Mappatura delle categorie per consumatori
  function mapCategory(p) {
    const desc = (p.description || '').toUpperCase();
    const brand = (p.brand || '').toUpperCase();
    const fam = (p.family || p.category || '').toUpperCase();

    if (desc.includes('BARRIERA') || desc.includes('VENTIL') || fam.includes('VENTIL')) return 'ACCESSORI';
    if (desc.includes('POMPA') || desc.includes('ALTHERMA') || desc.includes('CALDAIA') || fam.includes('POMP')) return 'POMPE';
    if (desc.includes('SPLIT') || desc.includes('CLIMA') || desc.includes('INVERTER') || brand.includes('DAIKIN') || brand.includes('MITSUBISHI')) return 'CLIMA';
    if (desc.includes('BOX') || desc.includes('DOCC') || brand.includes('2B') || fam.includes('2B')) return '2B';
    if (desc.includes('ELETTROD') || desc.includes('SONDA') || desc.includes('SCHEDA') || desc.includes('VALVOLA') || desc.includes('BRUCIATORE')) return 'RICAMBI';
    return 'ACCESSORI';
  }

  // Catalogo dimostrativo ad alta conversione B2C
  function getDemoRetailCatalog() {
    return [
      {
        id: 'MSZ-AP35',
        code: 'MSZ-AP35',
        description: 'Climatizzatore Monosplit Inverter R32 12000 BTU Classe A+++ Wi-Fi Integrato',
        brand: 'MITSUBISHI ELECTRIC',
        category: 'CLIMA',
        rawPrice: 680.00,
        priceWithVat: 829.60,
        listPriceWithVat: 1150.00,
        vat: 22,
        stock: 12,
        imageUrl: ''
      },
      {
        id: 'ALTHERMA-16',
        code: 'ALTHERMA-16',
        description: 'Pompa di Calore Idronica Monoblocco 16 kW R32 per Riscaldamento & Raffrescamento',
        brand: 'DAIKIN',
        category: 'POMPE',
        rawPrice: 4320.00,
        priceWithVat: 5270.40,
        listPriceWithVat: 6800.00,
        vat: 22,
        stock: 3,
        imageUrl: ''
      },
      {
        id: '780824',
        code: '780824',
        description: 'Box Doccia Angolare Cristallo Trasparente 6mm con Trattamento Anticalcare',
        brand: '2B BOX DOCCE',
        category: '2B',
        rawPrice: 300.00,
        priceWithVat: 366.00,
        listPriceWithVat: 490.00,
        vat: 22,
        stock: 8,
        imageUrl: 'https://www.boxdocce2b.com/wp-content/uploads/2021/03/tre-lati.png'
      },
      {
        id: 'CYAL250',
        code: 'CYAL250',
        description: 'Barriera d\'Aria Pensile a Soffitto 29kW per Controllo Temperatura & Isolamento',
        brand: 'DAIKIN',
        category: 'ACCESSORI',
        rawPrice: 1850.00,
        priceWithVat: 2257.00,
        listPriceWithVat: 2900.00,
        vat: 22,
        stock: 4,
        imageUrl: ''
      },
      {
        id: '999',
        code: '999',
        description: 'Elettrodo di Accensione e Rilevazione Fiamma per Caldaia Residenziale',
        brand: 'CLIMAWELL',
        category: 'RICAMBI',
        rawPrice: 12.70,
        priceWithVat: 15.49,
        listPriceWithVat: 24.00,
        vat: 22,
        stock: 45,
        imageUrl: ''
      }
    ];
  }

  // 2. Filtri, Ricerca e Ordinamento
  function applyFiltersAndSort() {
    let list = [...ShopState.products];

    // Filtro Categoria
    if (ShopState.currentCategory !== 'all') {
      list = list.filter(p => p.category === ShopState.currentCategory);
    }

    // Filtro Ricerca
    if (ShopState.searchQuery) {
      const q = ShopState.searchQuery.toLowerCase();
      list = list.filter(p =>
        (p.code && p.code.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        (p.brand && p.brand.toLowerCase().includes(q))
      );
    }

    // Ordinamento
    if (ShopState.sortBy === 'price-asc') {
      list.sort((a, b) => a.priceWithVat - b.priceWithVat);
    } else if (ShopState.sortBy === 'price-desc') {
      list.sort((a, b) => b.priceWithVat - a.priceWithVat);
    } else if (ShopState.sortBy === 'brand') {
      list.sort((a, b) => a.brand.localeCompare(b.brand));
    }

    ShopState.filteredProducts = list;
    renderProductsGrid();
  }

  // 3. Rendering Griglia Prodotti Retail
  function renderProductsGrid() {
    const grid = document.getElementById('productsGrid');
    const empty = document.getElementById('emptyState');
    const counter = document.getElementById('productsFoundCount');

    if (!grid) return;

    if (counter) {
      counter.textContent = `${ShopState.filteredProducts.length} articoli disponibili in pronta consegna`;
    }

    if (ShopState.filteredProducts.length === 0) {
      grid.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }

    if (empty) empty.classList.add('hidden');

    grid.innerHTML = ShopState.filteredProducts.map(p => {
      const discountPct = p.listPriceWithVat > p.priceWithVat
        ? Math.round((1 - p.priceWithVat / p.listPriceWithVat) * 100)
        : 0;

      const imgPlaceholder = getProductSvg(p.brand, p.category);

      return `
        <article class="product-card" data-code="${escapeHtml(p.code)}">
          <div class="card-badge-top">
            <span class="badge-tag eco">Classe A+++</span>
            ${discountPct > 0 ? `<span class="badge-tag promo">-${discountPct}% Risparmio</span>` : ''}
          </div>

          <div class="card-image-box">
            ${p.imageUrl ? `<img src="${escapeHtml(p.imageUrl)}" alt="${escapeHtml(p.description)}" onerror="this.src='${imgPlaceholder}'">` : `<img src="${imgPlaceholder}" alt="${escapeHtml(p.description)}">`}
          </div>

          <div class="card-body">
            <div class="card-brand">${escapeHtml(p.brand)}</div>
            <h3 class="card-title">${escapeHtml(p.description)}</h3>

            <div class="card-specs">
              <span class="spec-chip">Cod: ${escapeHtml(p.code)}</span>
              <span class="spec-chip">Garanzia 2 Anni</span>
              <span class="spec-chip">Spedizione Gratuita</span>
            </div>

            <div class="card-price-section">
              ${p.listPriceWithVat > p.priceWithVat ? `
                <div class="price-list-row">
                  <span class="price-list-old">€ ${euro(p.listPriceWithVat)}</span>
                  <span class="discount-badge">-${discountPct}%</span>
                </div>
              ` : ''}

              <div class="price-retail-row">
                <span class="price-retail-big">€ ${euro(p.priceWithVat)}</span>
                <span class="price-iva-label">IVA 22% Inclusa</span>
              </div>

              <div class="stock-status">
                <span>●</span> In pronta consegna a magazzino
              </div>

              <button type="button" class="btn-buy-retail btn-open-checkout" data-code="${escapeHtml(p.code)}">
                <span>🛒 Acquista Ora</span>
              </button>
            </div>
          </div>
        </article>
      `;
    }).join('');

    // Eventi pulsanti acquisto
    document.querySelectorAll('.btn-open-checkout').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const code = btn.dataset.code;
        const prod = ShopState.products.find(x => x.code === code);
        if (prod) openCheckoutModal(prod);
      });
    });
  }

  // 4. Apertura Modal Checkout B2C
  function openCheckoutModal(prod) {
    ShopState.selectedProduct = prod;

    document.getElementById('checkoutProductTitle').textContent = `${prod.brand} — ${prod.description}`;
    document.getElementById('checkoutProductBrand').textContent = prod.brand;
    document.getElementById('checkoutProductCode').textContent = prod.code;
    document.getElementById('checkoutUnitPrice').textContent = `€ ${euro(prod.priceWithVat)} (IVA incl.)`;
    document.getElementById('checkoutQtyInput').value = 1;

    updateCheckoutSummary();

    const modal = document.getElementById('checkoutModal');
    if (modal) modal.classList.remove('hidden');
  }

  function closeCheckoutModal() {
    const modal = document.getElementById('checkoutModal');
    if (modal) modal.classList.add('hidden');
    ShopState.selectedProduct = null;
  }

  // Aggiornamento totali carrello checkout
  function updateCheckoutSummary() {
    if (!ShopState.selectedProduct) return;
    const qty = Math.max(1, parseInt(document.getElementById('checkoutQtyInput').value) || 1);
    const total = ShopState.selectedProduct.priceWithVat * qty;

    document.getElementById('summaryTotalProducts').textContent = `€ ${euro(total)}`;
    document.getElementById('summaryGrandTotal').textContent = `€ ${euro(total)}`;
    document.getElementById('btnPayLabel').textContent = `💳 Paga Subito € ${euro(total)} (Direct Charge)`;
  }

  // 5. Elaborazione Pagamento con Carta (Stripe Direct Charge per Privati)
  async function processB2cOrder() {
    if (!ShopState.selectedProduct) return;

    const prod = ShopState.selectedProduct;
    const qty = Math.max(1, parseInt(document.getElementById('checkoutQtyInput').value) || 1);

    // Dati Consumatore
    const firstName = (document.getElementById('custFirstName')?.value || '').trim();
    const lastName = (document.getElementById('custLastName')?.value || '').trim();
    const fullName = `${firstName} ${lastName}`.trim();
    const taxId = (document.getElementById('custTaxId')?.value || '').trim().toUpperCase();
    const email = (document.getElementById('custEmail')?.value || '').trim();
    const phone = (document.getElementById('custPhone')?.value || '').trim();

    // Dati Spedizione
    const address = (document.getElementById('shipAddress')?.value || '').trim();
    const cap = (document.getElementById('shipCap')?.value || '').trim();
    const city = (document.getElementById('shipCity')?.value || '').trim();
    const prov = (document.getElementById('shipProv')?.value || '').trim().toUpperCase();
    const notes = (document.getElementById('shipNotes')?.value || '').trim();

    // Dati Carta di Credito
    const cardNum = (document.getElementById('stripeCardNumber')?.value || '').replace(/\s+/g, '');
    const cardExp = (document.getElementById('stripeCardExp')?.value || '').trim();
    const cardCvc = (document.getElementById('stripeCardCvc')?.value || '').trim();

    // Validazioni consumatore
    if (!firstName || !lastName) {
      showToast('⚠️ Inserisci Nome e Cognome dell\'acquirente');
      document.getElementById('custFirstName')?.focus();
      return;
    }

    if (!taxId || taxId.length < 11) {
      showToast('⚠️ Inserisci un Codice Fiscale valido per la ricevuta/fattura');
      document.getElementById('custTaxId')?.focus();
      return;
    }

    if (!email || !email.includes('@')) {
      showToast('⚠️ Inserisci un indirizzo Email valido');
      document.getElementById('custEmail')?.focus();
      return;
    }

    if (!phone) {
      showToast('⚠️ Inserisci il cellulare per gli avvisi del corriere');
      document.getElementById('custPhone')?.focus();
      return;
    }

    if (!address || !cap || !city || !prov) {
      showToast('⚠️ Completa l\'indirizzo di spedizione (Via, CAP, Città, Provincia)');
      document.getElementById('shipAddress')?.focus();
      return;
    }

    if (cardNum.length < 15) {
      showToast('⚠️ Inserisci un numero di carta valido (es. 4242...)');
      document.getElementById('stripeCardNumber')?.focus();
      return;
    }

    // Stato di caricamento
    const payBtn = document.getElementById('btnSubmitB2cOrder');
    const spinner = document.getElementById('paySpinner');
    const payLabel = document.getElementById('btnPayLabel');

    payBtn.disabled = true;
    spinner.classList.remove('hidden');
    payLabel.textContent = 'Autorizzazione bancaria Stripe in corso…';

    const grandTotal = prod.priceWithVat * qty;
    const feePct = ShopState.stripeConfig.applicationFeePercent || 10.0;
    const feeAmount = Math.round(grandTotal * (feePct / 100) * 100) / 100;
    const netToMerchant = Math.round((grandTotal - feeAmount) * 100) / 100;

    try {
      // Simula handshake bancario sicuro
      await new Promise(resolve => setTimeout(resolve, 1300));

      // Test di rifiuto fondi se usata carta 4000...0002
      if (cardNum.startsWith('4000000000000002')) {
        throw new Error('Transazione rifiutata: fondi insufficienti sulla carta (Test Decline).');
      }

      const now = new Date();
      const stamp = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
      const timeStamp = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0') + String(now.getSeconds()).padStart(2, '0');
      const chargeId = `ch_direct_shop_${Math.random().toString(36).substring(2, 9)}${Date.now().toString(36)}`;
      const orderNumber = `ORD-SHOP-B2C-${stamp}-${timeStamp}`;
      const custCode = `PRIV-${stamp}-${Math.floor(100 + Math.random() * 900)}`;
      const fullShippingDest = `${address}, ${cap} ${city} (${prov})`;

      // 1. Registra Anagrafica Privato su Supabase (customers)
      if (window.ClwData && window.ClwData.saveCustomer) {
        try {
          await window.ClwData.saveCustomer({
            code: custCode,
            name: fullName,
            tax_code: taxId,
            email: email,
            phone: phone,
            address: address,
            city: city,
            province: prov,
            postal_code: cap,
            sdi_code: '0000000',
            payment_method: 'Stripe Direct Charge B2C (Carta)',
            agent_code: 'B2C-SHOP'
          });
          console.log('[Shop B2C] Privato registrato su Supabase:', custCode);
        } catch (cErr) {
          console.warn('[Shop B2C] Avviso anagrafica:', cErr);
        }
      }

      // 2. Registra Documento Ordine su Supabase (documents)
      if (window.ClwData && window.ClwData.createDocument) {
        try {
          await window.ClwData.createDocument({
            documentType: 'OCL',
            number: orderNumber,
            customer: {
              id: custCode,
              code: custCode,
              name: fullName
            },
            agent: {
              id: 'B2C-SHOP',
              code: 'B2C-SHOP',
              name: 'Canale Vendita Shop Consumatori'
            },
            lines: [{
              product: {
                id: prod.id,
                code: prod.code,
                description: prod.description,
                price: prod.rawPrice,
                vat: prod.vat
              },
              qty: qty,
              discount1: 0,
              discount2: 0,
              discount3: 0,
              discount4: 0,
              extraDiscount: 0
            }],
            totals: {
              subtotal: prod.rawPrice * qty,
              vat: grandTotal - (prod.rawPrice * qty),
              total: grandTotal
            },
            paymentMethod: `Stripe Direct Charge (${ShopState.stripeConfig.connectedAccountId})`,
            validityDays: 30,
            notes: `[ACQUISTO DIRETTO SHOP B2C — PRIVATO CONSUMATORE]\n` +
                   `Acquirente: ${fullName}\n` +
                   `Codice Fiscale: ${taxId}\n` +
                   `Email: ${email} | Telefono: ${phone}\n` +
                   `Destinazione Consegna: ${fullShippingDest}\n` +
                   `----------------------------------------\n` +
                   `Circuito: Stripe Connect Direct Charge\n` +
                   `ID Transazione: ${chargeId}\n` +
                   `Commerciante Venditore: Climawell S.r.l. (${ShopState.stripeConfig.connectedAccountId})\n` +
                   `Totale Incasso Lordo: € ${euro(grandTotal)} (IVA incl.)\n` +
                   `Netto Accreditato a Climawell: € ${euro(netToMerchant)}\n` +
                   `Application Fee Piattaforma SaaS (${feePct}%): € ${euro(feeAmount)}\n` +
                   (notes ? `Note Corriere: ${notes}\n` : '') +
                   `Stato: Pagato con Carta`
          });

          // Aggiorna lo stato in documents su Supabase
          if (window.ClwData.initClient) {
            const client = window.ClwData.initClient();
            if (client) {
              await client.from('documents').update({
                status: 'Pagato con Carta',
                updated_at: new Date().toISOString()
              }).eq('number', orderNumber);
            }
          }
        } catch (dbErr) {
          console.warn('[Shop B2C] Avviso salvataggio ordine:', dbErr);
        }
      }

      // 3. Invio Email di Conferma e Ricevuta al Privato e Avviso a Climawell via Brevo
      sendB2cConfirmationEmails({
        orderNumber,
        customer: fullName,
        taxId,
        email,
        phone,
        prod,
        qty,
        grandTotal,
        chargeId,
        fullShippingDest,
        notes
      });

      // 4. Popola Ricevuta a Video
      document.getElementById('recOrderNum').textContent = orderNumber;
      document.getElementById('recChargeId').textContent = chargeId;
      document.getElementById('recItemDesc').textContent = `${prod.brand} — ${prod.description}`;
      document.getElementById('recQty').textContent = `${qty} pz`;
      document.getElementById('recTotalAmount').textContent = `€ ${euro(grandTotal)}`;
      document.getElementById('recCustomerName').textContent = `${fullName} (C.F.: ${taxId})`;
      document.getElementById('recShippingDest').textContent = fullShippingDest;

      // Link al tracking
      const trackBtn = document.getElementById('btnTrackMyOrder');
      if (trackBtn) {
        trackBtn.href = `../e-com/tracking.html?order=${encodeURIComponent(orderNumber)}&email=${encodeURIComponent(email)}`;
      }

      closeCheckoutModal();
      const recModal = document.getElementById('receiptModal');
      if (recModal) recModal.classList.remove('hidden');

      showToast(`🎉 Ordine di € ${euro(grandTotal)} confermato con successo!`);
    } catch (err) {
      console.error('[Shop B2C] Errore:', err);
      alert(`Errore nel completamento dell'ordine: ${err.message || 'Controlla i dati della carta'}`);
      showToast('❌ Pagamento non riuscito: ' + (err.message || 'Errore'));
    } finally {
      payBtn.disabled = false;
      spinner.classList.add('hidden');
      payLabel.textContent = `💳 Paga e Conferma Ordine`;
    }
  }

  // 6. Invio Email Brevo (Cliente Consumatore & Magazzino Climawell)
  async function sendB2cConfirmationEmails(info) {
    try {
      const trackingUrl = `${window.location.origin}/e-com/tracking.html?order=${encodeURIComponent(info.orderNumber)}&email=${encodeURIComponent(info.email)}`;
      
      const textCustomer = `Gentile ${info.customer},\n\nGrazie per il tuo acquisto su Climawell Shop! Abbiamo ricevuto il tuo ordine ${info.orderNumber} e il pagamento tramite Carta di Credito.\n\nArticolo: ${info.prod.description} (x${info.qty} pz)\nImporto Totale Saldato: € ${euro(info.grandTotal)} (IVA 22% inclusa)\nDestinazione Spedizione: ${info.fullShippingDest}\n\nPuoi seguire la preparazione e la spedizione in tempo reale qui:\n${trackingUrl}\n\nAssistenza Clienti: 055-4289074\nClimawell S.r.l.`;

      // 1. Mail al Cliente Privato
      await dispatchBrevoEmail({
        to: [{ email: info.email, name: info.customer }],
        subject: `[CONFERMA ACQUISTO] Ordine ${info.orderNumber} — Climawell Shop`,
        textContent: textCustomer,
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <div style="text-align: center; border-bottom: 2px solid #0284c7; padding-bottom: 16px;">
              <h2 style="color: #0284c7; margin: 0;">CLIMAWELL SHOP CASA</h2>
              <p style="color: #64748b; font-size: 14px; margin: 4px 0 0 0;">Conferma Ricezione Ordine & Pagamento Sicuro</p>
            </div>

            <p style="margin-top: 20px;">Gentile <strong>${escapeHtml(info.customer)}</strong>,</p>
            <p>abbiamo ricevuto il tuo ordine e il pagamento tramite <strong>Carta di Credito (Stripe Direct Charge)</strong>.</p>

            <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px; margin: 18px 0;">
              <p style="margin: 4px 0;"><strong>Numero Ordine:</strong> ${info.orderNumber}</p>
              <p style="margin: 4px 0;"><strong>Articolo:</strong> ${escapeHtml(info.prod.description)} (x${info.qty} pz)</p>
              <p style="margin: 4px 0;"><strong>Importo Pagato:</strong> <strong style="color: #059669; font-size: 16px;">€ ${euro(info.grandTotal)} (IVA incl.)</strong></p>
              <p style="margin: 4px 0;"><strong>Destinazione Spedizione:</strong> ${escapeHtml(info.fullShippingDest)}</p>
              <p style="margin: 4px 0;"><strong>Codice Fiscale:</strong> ${escapeHtml(info.taxId)}</p>
            </div>

            <div style="text-align: center; margin: 26px 0;">
              <a href="${trackingUrl}" style="background: #0284c7; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; display: inline-block;">
                📦 Segui la Spedizione del Tuo Ordine
              </a>
            </div>

            <p style="font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 12px;">
              Per qualsiasi richiesta o informazione sulla consegna, rispondi a questa email o chiama il <strong>055-4289074</strong>.<br>
              <em>Climawell S.r.l. — Servizio Clienti</em>
            </p>
          </div>
        `
      });

      // 2. Alert Interno Magazzino Climawell
      const textClimawell = `Nuovo ordine SHOP B2C da privato:\nOrdine: ${info.orderNumber}\nCliente: ${info.customer} (CF: ${info.taxId})\nTotale: € ${euro(info.grandTotal)}\nDestinazione: ${info.fullShippingDest}\nTransazione: ${info.chargeId}\nTracking: ${trackingUrl}`;

      await dispatchBrevoEmail({
        to: [
          { email: 'ordini@climawell.it', name: 'Magazzino & Spedizioni Climawell' },
          { email: 'amministrazione@climawell.it', name: 'Amministrazione Climawell' }
        ],
        subject: `🛒 [ORDINE SHOP PRIVATO] ${info.orderNumber} — ${escapeHtml(info.customer)} (€ ${euro(info.grandTotal)})`,
        textContent: textClimawell,
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 20px; border: 2px solid #0284c7; border-radius: 8px;">
            <h3 style="color: #0284c7; margin: 0 0 10px 0;">🛒 NUOVO ACQUISTO SHOP DA PRIVATO (PAGATO CON CARTA)</h3>
            <p><strong>Articolo:</strong> ${escapeHtml(info.prod.code)} — ${escapeHtml(info.prod.description)} (x${info.qty} pz)</p>
            <p><strong>Totale Pagato:</strong> € ${euro(info.grandTotal)} (IVA incl.)</p>
            <p><strong>ID Transazione Stripe:</strong> <code>${info.chargeId}</code></p>
            
            <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; margin: 14px 0;">
              <h4 style="margin: 0 0 6px 0;">DATI PER RICEVUTA/FATTURA PLUS 2000:</h4>
              <p style="margin: 3px 0;"><strong>Nome:</strong> ${escapeHtml(info.customer)}</p>
              <p style="margin: 3px 0;"><strong>Codice Fiscale:</strong> ${escapeHtml(info.taxId)}</p>
              <p style="margin: 3px 0;"><strong>Indirizzo Consegna:</strong> ${escapeHtml(info.fullShippingDest)}</p>
              <p style="margin: 3px 0;"><strong>Telefono:</strong> ${info.phone}</p>
              <p style="margin: 3px 0;"><strong>Email:</strong> ${info.email}</p>
            </div>

            <a href="${trackingUrl}" style="background: #0284c7; color: white; padding: 10px 18px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
              Apri Scheda Tracking Ordine
            </a>
          </div>
        `
      });

    } catch (e) {
      console.warn('[Shop B2C] Notifica email completata:', e.message);
    }
  }

  // Helper universale invio Brevo (locale + fallback diretto web)
  async function dispatchBrevoEmail(payload) {
    try {
      const resp = await fetch('/api/brevo/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (resp.ok) return;
    } catch (_) { }

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
      console.warn('[Brevo Direct B2C] Errore invio diretto:', err.message);
    }
  }
  }

  // 7. Stampa Ricevuta A4 Pulita
  function printB2cReceipt() {
    const orderNum = document.getElementById('recOrderNum')?.textContent || 'ORD-SHOP';
    const chargeId = document.getElementById('recChargeId')?.textContent || '';
    const itemDesc = document.getElementById('recItemDesc')?.textContent || '';
    const qty = document.getElementById('recQty')?.textContent || '1';
    const total = document.getElementById('recTotalAmount')?.textContent || '€ 0,00';
    const customer = document.getElementById('recCustomerName')?.textContent || '';
    const shipping = document.getElementById('recShippingDest')?.textContent || '';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Ricevuta Acquisto ${orderNum}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; color: #1e293b; line-height: 1.5; font-size: 14px; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0284c7; padding-bottom: 16px; margin-bottom: 20px; }
          .brand { font-size: 22px; font-weight: 800; color: #0284c7; }
          .badge { background: #ecfdf5; color: #059669; border: 1px solid #10b981; padding: 4px 10px; border-radius: 20px; font-weight: 700; font-size: 12px; }
          .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          .table th, .table td { padding: 10px 14px; text-align: left; border-bottom: 1px solid #e2e8f0; }
          .table th { background: #f8fafc; font-size: 12px; text-transform: uppercase; color: #64748b; }
          .total-box { background: #f8fafc; border: 2px solid #cbd5e1; border-radius: 8px; padding: 16px; text-align: right; margin-top: 20px; }
          .total-box strong { font-size: 22px; color: #059669; }
          .footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 14px; font-size: 12px; color: #64748b; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand">CLIMAWELL SHOP CASA</div>
            <div style="font-size: 13px; color: #64748b;">Venditore: Climawell S.r.l. — P.IVA 01234567890</div>
            <div style="font-size: 13px; color: #64748b;">Piattaforma: Quantun-Time SaaS Platform</div>
          </div>
          <div style="text-align: right;">
            <div class="badge">PAGATO CON CARTA (STRIPE DIRECT CHARGE)</div>
            <div style="font-size: 15px; font-weight: 800; margin-top: 6px;">${orderNum}</div>
            <div style="font-size: 12px; color: #64748b;">Data: ${new Date().toLocaleDateString('it-IT')}</div>
          </div>
        </div>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 20px;">
          <h3 style="margin: 0 0 8px 0; font-size: 15px;">Dati Intestatario & Spedizione</h3>
          <p style="margin: 3px 0;"><strong>Acquirente:</strong> ${customer}</p>
          <p style="margin: 3px 0;"><strong>Indirizzo Consegna:</strong> ${shipping}</p>
          <p style="margin: 3px 0;"><strong>ID Transazione Bancaria:</strong> <code>${chargeId}</code></p>
        </div>

        <table class="table">
          <thead>
            <tr>
              <th>Articolo Ordinato</th>
              <th style="width: 100px; text-align: center;">Quantità</th>
              <th style="width: 140px; text-align: right;">Totale Pagato</th>
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
          <div style="font-size: 13px; color: #64748b;">Importo Totale Transazione (IVA 22% Inclusa):</div>
          <div><strong>${total}</strong></div>
          <div style="font-size: 12px; color: #059669; margin-top: 4px;">Transazione autorizzata tramite Stripe Connect Direct Charge</div>
        </div>

        <div class="footer">
          Ricevuta d'acquisto valevole per la garanzia legale di 24 mesi e per le detrazioni fiscali ove applicabili.<br>
          Climawell S.r.l. — Tel. 055-4289074 — ordini@climawell.it
        </div>
      </body>
      </html>
    `;

    let iframe = document.getElementById('b2cPrintIframe');
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'b2cPrintIframe';
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
    } catch (e) {
      window.print();
    }
  }

  // 8. Event Listeners
  function setupEventListeners() {
    // Ricerca live
    const searchInput = document.getElementById('shopSearchInput');
    const btnClearSearch = document.getElementById('btnClearSearch');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        ShopState.searchQuery = e.target.value.trim();
        if (btnClearSearch) {
          btnClearSearch.style.display = ShopState.searchQuery ? 'block' : 'none';
        }
        applyFiltersAndSort();
      });
    }

    if (btnClearSearch) {
      btnClearSearch.addEventListener('click', () => {
        searchInput.value = '';
        ShopState.searchQuery = '';
        btnClearSearch.style.display = 'none';
        applyFiltersAndSort();
      });
    }

    // Filtri Categorie
    document.querySelectorAll('.cat-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        ShopState.currentCategory = chip.dataset.cat;

        const title = document.getElementById('currentCategoryTitle');
        if (title) title.textContent = chip.textContent.replace(/\(\d+\)/, '').trim();

        applyFiltersAndSort();
      });
    });

    // Ordinamento
    document.getElementById('sortSelect')?.addEventListener('change', (e) => {
      ShopState.sortBy = e.target.value;
      applyFiltersAndSort();
    });

    // Reset filtri
    document.getElementById('btnResetFilters')?.addEventListener('click', () => {
      ShopState.searchQuery = '';
      ShopState.currentCategory = 'all';
      if (searchInput) searchInput.value = '';
      if (btnClearSearch) btnClearSearch.style.display = 'none';
      document.querySelectorAll('.cat-chip').forEach(c => {
        c.classList.toggle('active', c.dataset.cat === 'all');
      });
      applyFiltersAndSort();
    });

    // Modale Checkout Controlli Quantità
    document.getElementById('btnQtyMinus')?.addEventListener('click', () => {
      const inp = document.getElementById('checkoutQtyInput');
      if (inp) {
        inp.value = Math.max(1, (parseInt(inp.value) || 1) - 1);
        updateCheckoutSummary();
      }
    });

    document.getElementById('btnQtyPlus')?.addEventListener('click', () => {
      const inp = document.getElementById('checkoutQtyInput');
      if (inp) {
        inp.value = Math.max(1, (parseInt(inp.value) || 1) + 1);
        updateCheckoutSummary();
      }
    });

    document.getElementById('checkoutQtyInput')?.addEventListener('input', updateCheckoutSummary);

    // Chiusura Modali
    document.getElementById('btnCloseCheckoutModal')?.addEventListener('click', closeCheckoutModal);
    document.getElementById('btnCloseReceiptModal')?.addEventListener('click', () => {
      document.getElementById('receiptModal')?.classList.add('hidden');
    });

    // Stampa Ricevuta
    document.getElementById('btnPrintB2cReceipt')?.addEventListener('click', printB2cReceipt);

    // Invia Ordine
    document.getElementById('btnSubmitB2cOrder')?.addEventListener('click', processB2cOrder);

    // Test Cards Filler
    document.querySelectorAll('.btn-test-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.card;
        const num = document.getElementById('stripeCardNumber');
        const exp = document.getElementById('stripeCardExp');
        const cvc = document.getElementById('stripeCardCvc');
        const holder = document.getElementById('stripeCardHolder');

        if (type === 'success') {
          if (num) num.value = '4242 4242 4242 4242';
          if (exp) exp.value = '12/28';
          if (cvc) cvc.value = '123';
          if (holder) holder.value = 'MARIO ROSSI';
          showToast('✅ Caricata carta test Stripe di successo (4242)');
        } else if (type === '3ds') {
          if (num) num.value = '4000 0000 0000 3021';
          if (exp) exp.value = '10/27';
          if (cvc) cvc.value = '321';
          if (holder) holder.value = 'MARIO ROSSI (3D SECURE)';
          showToast('🟡 Caricata carta test 3D Secure (3021)');
        } else if (type === 'declined') {
          if (num) num.value = '4000 0000 0000 0002';
          if (exp) exp.value = '08/26';
          if (cvc) cvc.value = '999';
          if (holder) holder.value = 'TEST FONDI INSUFFICIENTI';
          showToast('🔴 Caricata carta test rifiuto (0002)');
        }
      });
    });

    // Rilevamento circuito carta
    document.getElementById('stripeCardNumber')?.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '').substring(0, 16);
      e.target.value = v.match(/.{1,4}/g)?.join(' ') || v;
      const icon = document.getElementById('cardBrandIcon');
      if (icon) {
        if (v.startsWith('4')) icon.textContent = '💳 Visa';
        else if (v.startsWith('5')) icon.textContent = '💳 Mastercard';
        else if (v.startsWith('3')) icon.textContent = '💳 Amex';
        else icon.textContent = '💳';
      }
    });

    // Formattazione scadenza MM/AA
    document.getElementById('stripeCardExp')?.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '').substring(0, 4);
      e.target.value = v.length >= 2 ? v.substring(0, 2) + '/' + v.substring(2) : v;
    });
  }

  function updateCategoryCounters() {
    const counts = { all: ShopState.products.length, CLIMA: 0, POMPE: 0, '2B': 0, RICAMBI: 0, ACCESSORI: 0 };
    ShopState.products.forEach(p => {
      if (counts[p.category] !== undefined) counts[p.category]++;
    });

    document.getElementById('countAll').textContent = counts.all;
    document.getElementById('countClima').textContent = counts.CLIMA;
    document.getElementById('countPompe').textContent = counts.POMPE;
    document.getElementById('countBox').textContent = counts['2B'];
    document.getElementById('countRicambi').textContent = counts.RICAMBI;
    document.getElementById('countAccessori').textContent = counts.ACCESSORI;
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
    const t = document.getElementById('shopToast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('active');
    setTimeout(() => t.classList.remove('active'), 3200);
  }

  function getProductSvg(brand, cat) {
    const b = (brand || 'CW').substring(0, 12).toUpperCase();
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="100%" height="100%" fill="%23f1f5f9"/><text x="50%" y="45%" font-family="Segoe UI,sans-serif" font-weight="bold" font-size="20" fill="%230284c7" text-anchor="middle" dominant-baseline="middle">${b}</text><text x="50%" y="65%" font-family="Segoe UI,sans-serif" font-size="12" fill="%2364748b" text-anchor="middle" dominant-baseline="middle">CLIMAWELL SHOP CASA</text></svg>`;
  }

})();
