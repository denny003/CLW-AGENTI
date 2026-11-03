# Climawell E-COM — Modulo E-Commerce B2B

Questo modulo è dedicato alla funzione di **Vetrina e Ordini Rapidi B2B** per la rete vendita e i clienti Climawell.
È progettato come componente indipendente, alloggiato nella propria cartella `e-com/`, per facilitare l'estensione futura e mantenere il codice isolato e manutenibile.

---

## 🎯 Obiettivi e Flusso Operativo

1. **Destinazione delle Campagne Promozionali**:
   * I link inviati via **Brevo Email** o **WhatsApp** dal Commercial Hub puntano a questo modulo:
     `http://localhost:3000/e-com/?agente=1136&cliente={CODICE}&art={ARTICOLO}`
   * La pagina riconosce l'agente (es. **`1136`**), il cliente e apre/evidenzia direttamente l'articolo in promozione.

2. **Modalità di Ordine & Pagamento B2B**:
   * 💳 **Pagamento Istantaneo con Carta di Credito (Stripe Connect — Direct Charges)**:
     - Configurato secondo la direttiva **Direct Charges** di Stripe Connect.
     - L'incasso avviene direttamente a favore dell'Account Connesso venditore (`stripeAccount: acct_...`).
     - Calcolo e detrazione automatica dell'Application Fee per la piattaforma Climawell.
     - Supporto nativo per **Stripe Test Mode** con compilazione rapida delle carte di test (4242 per successo, 3021 per 3DS, 0002 per rifiuto fondi).
     - Rilascio ricevuta transazione e registrazione immediata dell'ordine pagato su Supabase Cloud.
   * 💬 **WhatsApp Agente**: Genera un messaggio precompilato e strutturato verso il commerciale Climawell o l'Agente 1136.
   * ✉️ **Email Amministrazione**: Invia la richiesta d'ordine a `sales@climawell.it` e in copia all'agente.
   * 💾 **Supabase / CRM**: Registra l'opportunità e l'ordine direttamente nel database cloud per essere lavorata in Gestione Ordini / PLUS2000.

3. **Architettura dei File**:
   * `index.html`: Struttura del portale B2B con ricerca in tempo reale, filtri categorie, banner promozionale, tab Stripe Direct Charges e modale ricevuta bancaria.
   * `styles.css`: Stili dedicati responsive (Desktop, Tablet, Mobile) in linea con il brand Climawell e styling del box carta di credito.
   * `ecom.js`: Logica di lettura da Supabase (`getProducts`), gestione filtri, calcolo totali, inizializzazione client Stripe.js con opzione `{ stripeAccount }`, elaborazione pagamenti test, emissione ricevuta e salvataggio DB.

---

## 💳 Specifiche Tecniche Stripe Direct Charges (Architettura SaaS)

In questa architettura:
* **Piattaforma SaaS (Daniele Lupi / futura azienda software)**: è l'account principale **Stripe Platform**. Fornisce la suite (OrderSender, Modulo E-COM, Commercial Hub) e incassa l'**Application Fee** (es. 2.5% o canone).
* **Commerciante (Climawell S.r.l. / concessionario venditore)**: è l'**Account Connesso (`stripeAccount: acct_climawell_b2b`)**. È il venditore effettivo della merce, incassa direttamente il ricavato delle vendite sul proprio conto bancario e gestisce la fatturazione.
* **Cliente**: l'acquirente (installatore B2B o privato) che effettua l'acquisto.

Nella direttiva **Direct Charges**:
1. Il client inizializza Stripe.js specificando l'account del commerciante:
   ```javascript
   const stripe = Stripe(publishableKeySaaS, {
     stripeAccount: 'acct_climawell_b2b' // Commerciante venditore
   });
   ```
2. L'onere della transazione e l'incasso competono direttamente al commerciante venditore (**Climawell**).
3. La piattaforma SaaS (**Daniele Lupi**) preleva automaticamente l'`application_fee_amount` parametrabile (es. 2.5%) ad ogni transazione.
4. L'ordine viene registrato su Supabase con stato `"Pagato con Carta"` e note dettagliate con `chargeId` e dati di riparto per la contabilità.
