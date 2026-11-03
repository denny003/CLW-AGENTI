# PIANO OPERATIVO DI IMPLEMENTAZIONE: CLIMAWELL COMMERCIAL HUB

## Fasi di Sviluppo

### FASE A — Fondamenta, Analisi e Modello Dati
- [x] Definizione dell'architettura disaccoppiata (`ARCHITECTURE.md`).
- [x] Creazione della struttura modulare dedicata (`OrderSender/site/commercial-hub/`).
- [ ] Predisposizione dello script PowerShell di diagnostica in sola lettura (`Test-Plus2000Environment.ps1`) per Windows Server 2019 / SRVPLUS.
- [ ] Stesura dello schema PostgreSQL Supabase (`schema.sql`) con RLS, indici e vincoli.

---

### FASE B — MVP Commercial Hub (Web App & Importatore)
- [ ] Sviluppo interfaccia web principale (`index.html`) con layout moderno e responsive:
  - Sidebar di navigazione modulare.
  - Dashboard commerciale con KPI (clienti, opportunità, offerte, stato sync).
  - Gestione Clienti arricchita (ricerca istantanea, consensi marketing WhatsApp/Email).
  - Pipeline visiva delle opportunità (funnel trattative da Nuovo Contatto a Chiuso Vinto).
  - Catalogo Prodotti e Listini.
- [ ] Creazione importatore CSV assistito (`import-csv.html`) per caricare o verificare dati prima del connettore automatico.
- [ ] Styling moderno coerente (`styles.css`) con supporto dark/light e ottimizzazione smartphone.

---

### FASE C — Connettore Locale (Climawell PLUS Sync Agent)
- [ ] Esecuzione diagnostica su SRVPLUS (192.168.1.7) con `Test-Plus2000Environment.ps1`.
- [ ] Configurazione estrazione incrementale in sola lettura:
  - Anagrafica Clienti e Contatti da `CliFor`.
  - Catalogo Articoli, Giacenze e Listini da `Articoli`, `ArticoliContGen`, `TabSct`.
  - Ordini aperti da `DocTes` (`Esavo = 'N'`) e righe da `DocRig`.
- [ ] Coda locale persistente con ritentativi automatici in caso di assenza temporanea di rete.

---

### FASE D — Comunicazioni Commerciali (WhatsApp & Brevo)
- [ ] Modulo WhatsApp Business Platform (Meta Cloud API):
  - Invio preventivi PDF con template approvati.
  - Verifica consenso opt-in del cliente.
  - Registro storico messaggi e stato consegna.
- [ ] Modulo Email Marketing (Brevo API v3):
  - Segmentazione clienti per settore e marca.
  - Invio campagne promozionali senza impattare il gateway SMTP gestionale.

---

### FASE E — Marketplace (eBay & Amazon)
- [ ] Schede prodotto per marketplace.
- [ ] Integrazione API eBay (OAuth e inventory).
- [ ] Integrazione Amazon SP-API.
- [ ] Gestione approvazione manuale prima della pubblicazione e tracciamento ordini.
