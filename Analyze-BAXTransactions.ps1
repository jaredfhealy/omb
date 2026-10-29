param([string]$CsvPath)

$csv = Import-Csv -Path $CsvPath
$baxRows = @($csv | Where-Object { $_.Symbol -like "*BAX*" })

Write-Host "BAX TRANSACTION ANALYSIS" -ForegroundColor Cyan
Write-Host "=========================" -ForegroundColor Cyan
Write-Host ""

if ($baxRows.Count -eq 0) {
    Write-Host "No BAX transactions found" -ForegroundColor Red
    exit
}

Write-Host "Found $($baxRows.Count) BAX transactions" -ForegroundColor Green
Write-Host ""

Write-Host "Actions found:" -ForegroundColor Yellow
$baxRows | Group-Object -Property Action | ForEach-Object {
    Write-Host "  $($_.Name): $($_.Count)"
}
Write-Host ""

$totalBuyShares = 0
$totalSellShares = 0  
$totalAssignedShares = 0
$totalBuyAmount = 0

$baxRows | ForEach-Object {
    $action = $_.Action
    $qty = [double]($_.Quantity -replace '[,]', '')
    $amt = [double]($_.Amount -replace '[\$,]', '')
    $sym = $_.Symbol
    
    if ($action -eq "Buy" -and $sym -eq "BAX") {
        $totalBuyShares += $qty
        $totalBuyAmount += [Math]::Abs($amt)
    }
    elseif ($action -like "*Sell*" -and $sym -eq "BAX") {
        $totalSellShares += $qty
    }
    elseif ($action -eq "Assigned") {
        $totalAssignedShares += $qty
    }
}

Write-Host "SHARE SUMMARY:" -ForegroundColor Yellow
Write-Host "  Buy:      $totalBuyShares shares for `$$totalBuyAmount"
Write-Host "  Sell:     $totalSellShares shares"
Write-Host "  Assigned: $totalAssignedShares shares"
Write-Host ""

$outstanding = $totalBuyShares + $totalAssignedShares - $totalSellShares
Write-Host "Outstanding: $outstanding (= $totalBuyShares + $totalAssignedShares - $totalSellShares)" -ForegroundColor Green
Write-Host ""

Write-Host "STOCK TRANSACTIONS:" -ForegroundColor Cyan
$baxRows | Where-Object { $_.Symbol -eq "BAX" } | Sort-Object { [datetime]$_.Date } | ForEach-Object {
    Write-Host "$($_.Date) | $($_.Action) | Qty: $($_.Quantity) | $($_.Amount)"
}

Write-Host ""
Write-Host "OPTION TRANSACTIONS:" -ForegroundColor Cyan
$baxRows | Where-Object { $_.Symbol -ne "BAX" } | Sort-Object { [datetime]$_.Date } | ForEach-Object {
    Write-Host "$($_.Date) | $($_.Action) | $($_.Symbol)"
}

Write-Host ""
if ($outstanding -eq 1000) {
    Write-Host "RESULT: PASS (1000 shares)" -ForegroundColor Green
} else {
    Write-Host "RESULT: $outstanding shares (expected 1000)" -ForegroundColor Yellow
}
