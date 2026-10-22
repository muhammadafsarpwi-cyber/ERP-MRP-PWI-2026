param()
$ErrorActionPreference = 'Stop'

$canonical = 'Pakistan Wire Industries (Pvt.) LTD'

# Single case-insensitive pass. Alternation is ordered so compound forms
# (ticker '(PVT) LTD.', '(Private) Limited', '(Pvt.)' vs '(Pvt)') are consumed
# before the generic 'Pakistan Wire & Industry' brand form. (?![a-z]) guards
# prevent partial matches (e.g. 'Industry' inside 'Industrial').
$pattern = '(?i)' +
  'pakistan wire (&amp;|&) industry \(pvt\) ltd\.?(?![a-z])' + '|' +
  'pakistan wire &amp; industry \(private\) limited' + '|' +
  'pakistan wire & industry \(private\) limited' + '|' +
  'pakistan wire industries \(pvt\.\) ltd\.?(?![a-z])' + '|' +
  'pakistan wire industries \(pvt\) ltd\.?(?![a-z])' + '|' +
  'pakistan wire industries \(pwi\)' + '|' +
  'pakistan wire industries ltd(?![a-z])' + '|' +
  'pakistan wire &amp; industry(?![a-z])' + '|' +
  'pakistan wire & industry(?![a-z])'

$roots = @(
  'D:\ERP-MRP-PWI-2026\frontend\src',
  'D:\ERP-MRP-PWI-2026\frontend\public',
  'D:\ERP-MRP-PWI-2026\backend\src',
  'D:\ERP-MRP-PWI-2026\scripts'
)
# Hand-edited first; must not be touched by the bulk pass.
$exclude = @('WelcomeAnimation.tsx', '__smoke__.test.tsx')
$exts = @('.tsx', '.ts', '.css', '.html', '.json', '.md', '.svg', '.mjs', '.cjs', '.txt')

$files = Get-ChildItem -Path $roots -Recurse -File |
  Where-Object { $exts -contains $_.Extension -and ($exclude -notcontains $_.Name) }

$utf8Bom   = New-Object System.Text.UTF8Encoding $true
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

$changed = @()
foreach ($f in $files) {
  $bytes = [IO.File]::ReadAllBytes($f.FullName)
  $hasBom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
  $text = [Text.Encoding]::UTF8.GetString($bytes)
  if ($hasBom) { $text = $text.Substring(1) }

  $ms = [regex]::Matches($text, $pattern)
  if ($ms.Count -eq 0) { continue }

  $hits = ($ms | ForEach-Object { $_.Value } | Group-Object |
    ForEach-Object { "$($_.Count)x '$($_.Name)'" }) -join ' ; '

  $text = [regex]::Replace($text, $pattern, $canonical)
  $enc = if ($hasBom) { $utf8Bom } else { $utf8NoBom }
  [IO.File]::WriteAllText($f.FullName, $text, $enc)

  $changed += [PSCustomObject]@{
    File  = $f.FullName.Replace('D:\ERP-MRP-PWI-2026\', '')
    Hits  = $hits
  }
}

$changed | Format-Table -AutoSize -Wrap | Out-String -Width 300 | Write-Host
Write-Host "TOTAL FILES CHANGED: $($changed.Count)"
