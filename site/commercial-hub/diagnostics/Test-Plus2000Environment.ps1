<#
.SYNOPSIS
    Strumento Diagnostico in SOLA LETTURA per Windows Server 2019 / SRVPLUS
    Progetto: Climawell Commercial Hub
    
.DESCRIPTION
    Rileva l'ambiente di sistema, i driver ODBC/OLEDB, le istanze di database
    e lo stato di accessibilità agli archivi di PLUS2000 senza eseguire
    alcuna scrittura o modifica al sistema.
#>

$ErrorActionPreference = "Continue"
$reportPath = Join-Path $PSScriptRoot "Plus2000_Diagnostic_Report.txt"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "🔍 CLIMAWELL COMMERCIAL HUB - DIAGNOSTICA IN SOLA LETTURA" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$report = @()
$report += "DIAGNOSTICA AMBIENTE PLUS2000 - " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
$report += "Host: " + $env:COMPUTERNAME + " | Utente: " + $env:USERNAME
$report += "----------------------------------------------------------"

# 1. Informazioni Sistema Operativo
Write-Host "`n[1/6] Verifica Sistema Operativo e Architettura..." -ForegroundColor Yellow
$os = Get-CimInstance Win32_OperatingSystem
$report += "`n[1. SISTEMA OPERATIVO]"
$report += "OS: " + $os.Caption + " (" + $os.Version + ")"
$report += "Architettura: " + $os.OSArchitecture
$report += "Memoria Totale: " + [math]::Round($os.TotalVisibleMemorySize / 1MB, 2) + " GB"

# 2. Servizi Database & Gestionali Rilevati
Write-Host "[2/6] Rilevamento Servizi Database Attivi..." -ForegroundColor Yellow
$report += "`n[2. SERVIZI DATABASE RILEVATI]"
$dbServices = Get-Service | Where-Object { 
    $_.Name -match "SQL|MSSQL|Firebird|Pervasive|Postgre|MySQL" -or 
    $_.DisplayName -match "SQL|PLUS|Gosoft" 
}
if ($dbServices) {
    foreach ($svc in $dbServices) {
        $line = " - " + $svc.Name + " (" + $svc.DisplayName + ") -> " + $svc.Status
        Write-Host $line -ForegroundColor Green
        $report += $line
    }
} else {
    $report += " Nessun servizio database esplicito trovato tra i processi primari."
}

# 3. Driver ODBC e DSN Installati
Write-Host "[3/6] Censimento Driver ODBC e DSN di Sistema..." -ForegroundColor Yellow
$report += "`n[3. DRIVER ODBC & DSN]"
$odbcDrivers = Get-OdbcDriver -Platform "All" -ErrorAction SilentlyContinue
if ($odbcDrivers) {
    $report += "Driver disponibili:"
    foreach ($drv in $odbcDrivers) {
        $report += " - " + $drv.Name + " [" + $drv.Platform + "]"
    }
}
$dsnList = Get-OdbcDsn -Platform "All" -ErrorAction SilentlyContinue
if ($dsnList) {
    $report += "`nDSN Configurati:"
    foreach ($dsn in $dsnList) {
        $line = " - DSN: " + $dsn.Name + " (" + $dsn.DriverName + ") [" + $dsn.Platform + "] Tipo: " + $dsn.DsnType
        Write-Host $line -ForegroundColor White
        $report += $line
    }
} else {
    $report += " Nessun DSN ODBC di sistema configurato."
}

# 4. Verifica Connettività Rete e Porte
Write-Host "[4/6] Controllo Porte Database Standard (1433, 3050)..." -ForegroundColor Yellow
$report += "`n[4. TEST APERTURA PORTE LOCALI]"
$portsToTest = @(1433, 3050, 5432)
foreach ($p in $portsToTest) {
    $tcp = Test-NetConnection -ComputerName "127.0.0.1" -Port $p -WarningAction SilentlyContinue
    $line = " - Porta " + $p + ": " + ($tcp.TcpTestSucceeded ? "APERTA (IN ASCOLTO)" : "NON ATTIVA")
    $report += $line
}

# 5. Verifica Percorsi Condivisi Pluswin
Write-Host "[5/6] Controllo Percorso Condiviso Pluswin..." -ForegroundColor Yellow
$report += "`n[5. PERCORSI CONDIVISI & ARCHIVI]"
$candidatePaths = @(
    "\\Srvplus\ddlan\Pluswin\",
    "C:\ddlan\Pluswin\",
    "D:\ddlan\Pluswin\",
    "C:\PlusWin\"
)
foreach ($path in $candidatePaths) {
    if (Test-Path $path) {
        $line = " - Percorso RILEVATO: " + $path
        Write-Host $line -ForegroundColor Green
        $report += $line
    }
}

# 6. Riepilogo & Salvataggio Report
Write-Host "[6/6] Salvataggio Report Diagnostico..." -ForegroundColor Yellow
$report | Out-File -FilePath $reportPath -Encoding utf8
Write-Host "`n✅ Diagnostica completata con successo!" -ForegroundColor Green
Write-Host "Report salvato in: $reportPath" -ForegroundColor White
Write-Host "Nessuna modifica è stata effettuata ai dati o alla configurazione aziendale." -ForegroundColor Cyan
