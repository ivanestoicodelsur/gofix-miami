# Script de prueba E2E para el backend
# Ejecutar desde la raíz del proyecto con:
# powershell -ExecutionPolicy Bypass -File .\backend\scripts\test-backend.ps1

$ErrorActionPreference = 'Stop'
$api = 'http://localhost:4000'

try {
  Write-Host "1) Login..."
  $creds = @{ email = 'gofixcompany@gmail.com'; password = 'ijrr9224' }
  $login = Invoke-RestMethod -Uri "$api/api/auth/login" -Method POST -Body ($creds | ConvertTo-Json) -ContentType 'application/json'
  $token = $login.token
  Write-Host "Token obtenido: " $token

  Write-Host "`n2) Listar services (antes):"
  $listBefore = Invoke-RestMethod -Uri "$api/api/services" -Method GET -Headers @{ Authorization = "Bearer $token" }
  $listBefore | ConvertTo-Json -Depth 5 | Write-Host

  Write-Host "`n3) Crear service de prueba..."
  $svc = @{ title = 'Script Test Service'; description = 'creado por test-backend.ps1'; price = 9.99 } | ConvertTo-Json
  $created = Invoke-RestMethod -Uri "$api/api/services" -Method POST -Headers @{ Authorization = "Bearer $token" } -Body $svc -ContentType 'application/json'
  Write-Host "Creado service id:" $created.id

  Write-Host "`n4) Crear inventario de prueba..."
  $inv = @{ sku = 'ps-sku-001'; title = 'PS Item'; description = 'test item'; quantity = 2; price = 15 } | ConvertTo-Json
  $createdInv = Invoke-RestMethod -Uri "$api/api/inventory" -Method POST -Headers @{ Authorization = "Bearer $token" } -Body $inv -ContentType 'application/json'
  Write-Host "Creado inventory id:" $createdInv.id

  Write-Host "`n5) Listar services (después):"
  $listAfter = Invoke-RestMethod -Uri "$api/api/services" -Method GET -Headers @{ Authorization = "Bearer $token" }
  $listAfter | ConvertTo-Json -Depth 5 | Write-Host

  Write-Host "`n6) Exportar inventario a CSV..."
  Invoke-RestMethod -Uri "$api/api/inventory/export" -Method GET -Headers @{ Authorization = "Bearer $token" } -UseBasicParsing -OutFile 'inventory-export.csv'
  Write-Host "CSV guardado como inventory-export.csv (primeras 10 líneas):"
  Get-Content .\inventory-export.csv -TotalCount 10 | ForEach-Object { Write-Host $_ }

  Write-Host "`n7) Limpieza: eliminar items creados..."
  Invoke-RestMethod -Uri "$api/api/services/$($created.id)" -Method DELETE -Headers @{ Authorization = "Bearer $token" }
  Invoke-RestMethod -Uri "$api/api/inventory/$($createdInv.id)" -Method DELETE -Headers @{ Authorization = "Bearer $token" }
  Write-Host "Limpieza completada."

} catch {
  Write-Host "ERROR durante la prueba:" -ForegroundColor Red
  Write-Host $_.Exception.Message
  if ($_.Exception.Response) {
    try { $_.Exception.Response.GetResponseStream() | ForEach-Object { $_ } } catch {}
  }
  exit 1
}

exit 0
