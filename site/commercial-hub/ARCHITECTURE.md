# ARCHITETTURA DI SISTEMA: CLIMAWELL COMMERCIAL HUB

## 1. Visione d'Insieme
Il **Climawell Commercial Hub** è un modulo autonomo progettato per centralizzare le operazioni commerciali, di marketing (WhatsApp Business, Brevo/Email), CRM (pipeline opportunità, funnel di vendita) e marketplace (eBay, Amazon SP-API) di Climawell S.r.l.

Il sistema è strutturato secondo un'architettura disaccoppiata a 3 livelli:

```
[ Gosoft PLUS2000 ] (SRVPLUS - LAN Aziendale 192.168.1.7)
       │
       ▼ (ODBC / SQL Server nativo in sola lettura)
[ Climawell PLUS Sync Agent ] (Servizio Windows Locale)
       │
       ▼ (HTTPS REST / RPC sicure con API Key)
[ Supabase Cloud Database ] (PostgreSQL, Auth, RLS, Storage)
       ▲
       │ (Frontend Web App & Edge Functions)
[ Climawell Commercial Hub ] (Web App PC, Tablet, Smartphone)
```

---

## 2. Principi Fondamentali
1. **Integrità del Gestionale Legacy**: PLUS2000 rimane la sola fonte di verità per contabilità, fatturazione, giacenze fiscali e anagrafiche base. Il connettore opera in modalità strettamente **READ-ONLY**.
2. **Indipendenza Gateway SMTP**: Il gateway SMTP esistente su Google Workspace utilizzato da PLUS2000 per le fatture e comunicazioni contabili non viene toccato. Le campagne marketing utilizzano esclusivamente le API transazionali di Brevo e WhatsApp Cloud API di Meta.
3. **Isolamento Modulare**: Il Commercial Hub risiede in una cartella dedicata (`commercial-hub/`) all'interno dell'ecosistema OrderSender, con risorse CSS, JS e viste indipendenti.
4. **Sicurezza e GDPR**:
   - Supabase Service Role Key utilizzata esclusivamente server-side.
   - Row Level Security (RLS) applicata a tutte le tabelle.
   - Gestione granulare dei consensi (opt-in separato per WhatsApp e Newsletter).

---

## 3. Componenti di Dettaglio

### A. Plus2000 & LAN (Livello On-Premise)
- **Host**: SRVPLUS (Windows Server 2019, IP: `192.168.1.7`).
- **Database**: Microsoft SQL Server / ODBC (Archivi `DocTes`, `DocRig`, `CliFor`, `Articoli`, `ArticoliContGen`, `TabSct`).
- **Sync Agent**: Servizio Windows Python/C# a basso impatto che legge le variazioni e genera payload delta verso Supabase.

### B. Supabase Cloud (Livello Dati & Backend)
- **Database Engine**: PostgreSQL 15+.
- **Tabelle Chiave**:
  - `companies`, `users`, `user_roles`: multi-utenza e permessi.
  - `customers`, `customer_contacts`, `consent_records`: anagrafiche arricchite e consensi privacy.
  - `products`, `inventory`, `price_lists`: catalogo commerciale unificato.
  - `commercial_opportunities`, `pipeline_stages`, `customer_activities`: modulo CRM.
  - `whatsapp_messages`, `campaigns`, `email_messages`: tracciamento comunicazioni.
  - `marketplace_listings`, `marketplace_orders`: schede e vendite eBay/Amazon.
  - `sync_jobs`, `sync_logs`: telemetria del connettore locale.

### C. Commercial Hub Web App (Livello Frontend)
- **Interfaccia**: Single Page Application responsive modulare, utilizzabile sia su workstation desktop in ufficio sia su tablet e smartphone da parte dei commerciali.
- **Integrazioni Esterne**:
  - **Meta WhatsApp Cloud API**: invio offerte in PDF e messaggi commerciali con template approvati.
  - **Brevo API v3**: invio newsletter promozionali e tracciamento aperture/clic.
  - **Amazon SP-API / eBay Trading API**: predisposizione flussi marketplace.
