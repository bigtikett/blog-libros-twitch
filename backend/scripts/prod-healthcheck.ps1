param(
  [string]$BaseUrl = "https://www.riddleyai.com",
  [string]$Password = "bunker2026"
)

$ErrorActionPreference = "Stop"

function Invoke-Json {
  param(
    [string]$Method,
    [string]$Url,
    [hashtable]$Body = $null
  )

  if ($null -eq $Body) {
    return Invoke-RestMethod -Uri $Url -Method $Method
  }

  return Invoke-RestMethod -Uri $Url -Method $Method -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 12)
}

function Get-HeadStatus {
  param([string]$Url)
  try {
    return [int](Invoke-WebRequest -Uri $Url -Method Head -MaximumRedirection 5).StatusCode
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    if (-not $code) { $code = -1 }
    return [int]$code
  }
}

function Resolve-Url {
  param(
    [string]$Value,
    [string]$Base
  )

  if ([string]::IsNullOrWhiteSpace($Value)) { return "" }
  if ($Value -match "^https?://") { return $Value }
  if ($Value.StartsWith("/")) { return "$Base$Value" }
  return ""
}

function Get-EmbedImageUrl {
  param(
    [string]$Embed,
    [string]$Base
  )

  if ([string]::IsNullOrWhiteSpace($Embed)) { return "" }
  $m = [regex]::Match($Embed, '(?:src|href)=["'']([^"'']+)["'']', "IgnoreCase")
  if (-not $m.Success) { return "" }
  return Resolve-Url -Value $m.Groups[1].Value -Base $Base
}

$imgA = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7ZP9kAAAAASUVORK5CYII="
$imgB = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8AABQMBgT1Y5GQAAAAASUVORK5CYII="
$ts = Get-Date -Format "yyyyMMdd-HHmmss"

$report = [ordered]@{}
$failed = $false

# Health
try {
  $health = Invoke-Json -Method "Get" -Url "$BaseUrl/api/health"
  $report.health = [ordered]@{ ok = $true; service = $health.service }
} catch {
  $report.health = [ordered]@{ ok = $false; error = $_.Exception.Message }
  $failed = $true
}

# Bitacora image flow
try {
  $create = Invoke-Json -Method "Post" -Url "$BaseUrl/api/bitacora/nuevo" -Body @{
    password = $Password
    capitulo = "90"
    fecha = (Get-Date -Format "yyyy-MM-dd")
    tipo = "BITACORA"
    spoiler = "BAJO"
    titulo = "HC_BITACORA_$ts"
    descripcion = "Healthcheck bitacora"
    miniatura = "HC"
    url = "$BaseUrl/"
    miniaturaFileData = "data:image/png;base64,$imgA"
    miniaturaFileName = "hc-bitacora-a.png"
  }

  $id = $create.entry.id
  $img1 = Resolve-Url -Value $create.entry.miniatura -Base $BaseUrl

  $edit = Invoke-Json -Method "Post" -Url "$BaseUrl/api/bitacora/editar" -Body @{
    id = $id
    password = $Password
    capitulo = "91"
    fecha = (Get-Date -Format "yyyy-MM-dd")
    tipo = "BITACORA"
    spoiler = "MEDIO"
    titulo = "HC_BITACORA_EDIT_$ts"
    descripcion = "Healthcheck bitacora edit"
    miniatura = "HC2"
    url = "$BaseUrl/favoritos/bitacora.html"
    miniaturaFileData = "data:image/png;base64,$imgB"
    miniaturaFileName = "hc-bitacora-b.png"
  }

  $img2 = Resolve-Url -Value $edit.entry.miniatura -Base $BaseUrl
  $oldAfterEdit = if ($img1) { Get-HeadStatus $img1 } else { -2 }
  $newAfterEdit = if ($img2) { Get-HeadStatus $img2 } else { -2 }

  $del = Invoke-Json -Method "Post" -Url "$BaseUrl/api/bitacora/eliminar" -Body @{ id = $id; password = $Password }
  $newAfterDelete = if ($img2) { Get-HeadStatus $img2 } else { -2 }

  $report.bitacora = [ordered]@{
    create = [bool]$create.success
    edit = [bool]$edit.success
    delete = [bool]$del.success
    image1 = $img1
    image2 = $img2
    oldAfterEdit = $oldAfterEdit
    newAfterEdit = $newAfterEdit
    newAfterDelete = $newAfterDelete
  }

  if (-not $create.success -or -not $edit.success -or -not $del.success -or $newAfterEdit -ne 200 -or $newAfterDelete -ne 404) { $failed = $true }
} catch {
  $report.bitacora = [ordered]@{ error = $_.Exception.Message }
  $failed = $true
}

# Juegos image flow
try {
  $create = Invoke-Json -Method "Post" -Url "$BaseUrl/api/juegos/nuevo" -Body @{
    titulo = "HC_JUEGO_$ts"
    tituloColor = "magenta"
    badgeTexto = "HC"
    badgeColor = "cyan"
    descripcion = "Healthcheck juegos"
    vicio = 80
    progressColor = "magenta"
    plataforma = "PC"
    horas = "+1h"
    imagen = ""
    coverFileData = "data:image/png;base64,$imgA"
    coverFileName = "hc-juego-a.png"
    password = $Password
  }

  $id = $create.juego.id
  $img1 = Resolve-Url -Value $create.juego.imagen -Base $BaseUrl

  $edit = Invoke-Json -Method "Post" -Url "$BaseUrl/api/juegos/editar" -Body @{
    id = $id
    password = $Password
    titulo = "HC_JUEGO_EDIT_$ts"
    tituloColor = "cyan"
    badgeTexto = "HC2"
    badgeColor = "green"
    descripcion = "Healthcheck juegos edit"
    vicio = 81
    progressColor = "cyan"
    plataforma = "PC"
    horas = "+2h"
    imagen = ""
    coverFileData = "data:image/png;base64,$imgB"
    coverFileName = "hc-juego-b.png"
  }

  $img2 = Resolve-Url -Value $edit.juego.imagen -Base $BaseUrl
  $oldAfterEdit = if ($img1) { Get-HeadStatus $img1 } else { -2 }
  $newAfterEdit = if ($img2) { Get-HeadStatus $img2 } else { -2 }

  $del = Invoke-Json -Method "Post" -Url "$BaseUrl/api/juegos/eliminar" -Body @{ id = $id; password = $Password }
  $newAfterDelete = if ($img2) { Get-HeadStatus $img2 } else { -2 }

  $report.juegos = [ordered]@{
    create = [bool]$create.success
    edit = [bool]$edit.success
    delete = [bool]$del.success
    image1 = $img1
    image2 = $img2
    oldAfterEdit = $oldAfterEdit
    newAfterEdit = $newAfterEdit
    newAfterDelete = $newAfterDelete
  }

  if (-not $create.success -or -not $edit.success -or -not $del.success -or $newAfterEdit -ne 200 -or $newAfterDelete -ne 404) { $failed = $true }
} catch {
  $report.juegos = [ordered]@{ error = $_.Exception.Message }
  $failed = $true
}

# Redes image flow
try {
  $marker = "HC_RED_$ts"
  $embedA = "<div data-marker='$marker'><img src='__IMAGE_PLACEHOLDER__' alt='hc'></div>"

  $create = Invoke-Json -Method "Post" -Url "$BaseUrl/api/redes/nuevo" -Body @{
    red = "instagram"
    embedHtml = $embedA
    password = $Password
    imageFileData = "data:image/png;base64,$imgA"
    imageFileName = "hc-red-a.png"
  }

  $all = Invoke-Json -Method "Get" -Url "$BaseUrl/api/redes"
  $post = @($all.instagram | Where-Object { "$($_.embedHtml)" -match [regex]::Escape($marker) })[0]
  $id = $post.id
  $img1 = Get-EmbedImageUrl -Embed $post.embedHtml -Base $BaseUrl

  $edit = Invoke-Json -Method "Post" -Url "$BaseUrl/api/redes/editar/instagram/$id" -Body @{
    embedHtml = "<div data-marker='${marker}_E'><img src='__IMAGE_PLACEHOLDER__' alt='hc2'></div>"
    password = $Password
    imageFileData = "data:image/png;base64,$imgB"
    imageFileName = "hc-red-b.png"
  }

  $img2 = Get-EmbedImageUrl -Embed $edit.post.embedHtml -Base $BaseUrl
  $oldAfterEdit = if ($img1) { Get-HeadStatus $img1 } else { -2 }
  $newAfterEdit = if ($img2) { Get-HeadStatus $img2 } else { -2 }

  $del = Invoke-Json -Method "Delete" -Url "$BaseUrl/api/redes/eliminar/instagram/$id" -Body @{ password = $Password }
  $newAfterDelete = if ($img2) { Get-HeadStatus $img2 } else { -2 }

  $report.redes = [ordered]@{
    create = [bool]$create.success
    edit = [bool]$edit.success
    delete = [bool]$del.success
    image1 = $img1
    image2 = $img2
    oldAfterEdit = $oldAfterEdit
    newAfterEdit = $newAfterEdit
    newAfterDelete = $newAfterDelete
  }

  if (-not $create.success -or -not $edit.success -or -not $del.success -or $newAfterEdit -ne 200 -or $newAfterDelete -ne 404) { $failed = $true }
} catch {
  $report.redes = [ordered]@{ error = $_.Exception.Message }
  $failed = $true
}

# Entrevistas create/delete flow
try {
  $create = Invoke-Json -Method "Post" -Url "$BaseUrl/api/entrevistas/nuevo" -Body @{
    nombre = "HC_ENT_$ts"
    obra = "OBRA"
    squad = "WRITER"
    level = 1
    resumen = "Healthcheck entrevistas"
    socialUser = "@hc"
    socialUrl = "https://tiktok.com"
    colorNombre = "warning"
    colorObra = "primary"
    colorResena = "white"
    colorSocial = "cyan"
    videoUrl = "dQw4w9WgXcQ"
    password = $Password
  }

  $id = $create.entrevista.id
  $del = Invoke-Json -Method "Post" -Url "$BaseUrl/api/entrevistas/eliminar" -Body @{ id = $id; password = $Password }

  $after = Invoke-Json -Method "Get" -Url "$BaseUrl/api/entrevistas"
  $exists = @($after | Where-Object { $_.id -eq $id }).Count -gt 0

  $report.entrevistas = [ordered]@{
    create = [bool]$create.success
    delete = [bool]$del.success
    cleaned = (-not $exists)
  }

  if (-not $create.success -or -not $del.success -or $exists) { $failed = $true }
} catch {
  $report.entrevistas = [ordered]@{ error = $_.Exception.Message }
  $failed = $true
}

$reportJson = $report | ConvertTo-Json -Depth 12
Write-Output $reportJson

if ($failed) {
  exit 1
}

exit 0
