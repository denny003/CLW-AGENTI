# 🛒 Climawell Shop Casa — Modulo E-Commerce B2C (Privati & Consumatori)

## 📌 Panoramica del Modulo
Il modulo **Climawell Shop Casa** (`OrderSender/shop/`) è l'ambiente e-commerce dedicato alla vendita diretta a **clienti privati e consumatori finali**.

Mentre il modulo `e-com/` è riservato al commercio all'ingrosso per installatori (B2B, con prezzi netti, SDI e codici agente), questo modulo offre un'esperienza d'acquisto retail completa:
1. **Prezzi al Pubblico IVA 22% Inclusa**: Nessuna ambiguità per il consumatore privato, con indicazione del prezzo di listino e del risparmio percentuale.
2. **Garanzia Legale 24 Mesi & Fattura/Ricevuta con Codice Fiscale**: Conformità alle normative del Codice del Consumo e predisposizione per detrazioni fiscali / conto termico.
3. **Checkout Diretto Semplificato**: Nome, Cognome, Codice Fiscale, Indirizzo di consegna a domicilio, Email e Telefono per il corriere.
4. **Stripe Connect Direct Charges**: Transazione bancaria sicura con accredito diretto su conto Climawell (`acct_climawell_b2b`) e trattenuta automatica dell'Application Fee per la piattaforma SaaS (**Quantun-Time / Daniele Lupi**).
5. **Notifiche & Tracking**: Invio automatico della ricevuta d'acquisto via Brevo e collegamento diretto alla dashboard di tracking ordine (`../e-com/tracking.html`).

---

## 🗂️ Struttura dei File
- `index.html`: Vetrina online retail per privati, filtri categorie, ricerca in tempo reale, modale di acquisto rapido con carta di credito e ricevuta post-vendita.
- `styles.css`: Stili responsive specifici per e-commerce B2C (palette residenziale, badge di fiducia, pulsanti ad alta conversione).
- `shop.js`: Logica di lettura del catalogo da Supabase (`getProducts`), calcolo IVA, checkout, registrazione cliente `PRIV-...` e ordine `ORD-SHOP-B2C-...` in Supabase, invio email Brevo e stampa ricevuta A4.

---

## 🚀 Come Testare Localmente
Il modulo è accessibile all'indirizzo:
👉 **`http://localhost:3000/shop/`**
