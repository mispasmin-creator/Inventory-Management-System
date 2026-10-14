$src = 'C:\Users\ASUS\.codex\attachments\d244e7aa-057f-4889-98a4-4054058ff033\pasted-text.txt'
$out = 'update_inventory_master_product_rate.sql'

$text = Get-Content -LiteralPath $src -Raw
$text = $text.Replace([char]160, ' ').Replace('Â', '')
$text = "__FIRM__Purab`n$text"
$text = [regex]::Replace($text, 'ye hai Purab firm ka and item_name\s+product_rate', "`n__FIRM__Rkl`nitem_name`tproduct_rate", 'IgnoreCase')
$text = [regex]::Replace($text, 'ye hai RKL Firm ka and item_name\s+product_rate', "`n__FIRM__Pmmpl`nitem_name`tproduct_rate", 'IgnoreCase')
$text = [regex]::Replace($text, 'and ye hai PMMPL ka iska bhi chahiye\.?', '', 'IgnoreCase')

$rows = New-Object System.Collections.Generic.List[string]
$firm = $null

foreach ($rawLine in ($text -split "`r?`n")) {
  $line = $rawLine.Trim()
  if ($line -eq '') { continue }
  if ($line -eq '__FIRM__Purab') { $firm = 'Purab'; continue }
  if ($line -eq '__FIRM__Rkl') { $firm = 'Rkl'; continue }
  if ($line -eq '__FIRM__Pmmpl') { $firm = 'Pmmpl'; continue }
  if ($line.ToLower().StartsWith('item_name')) { continue }
  if (-not $firm) { continue }

  $parts = $line -split "`t", 2
  $item = ($parts[0].Trim() -replace '\s+', ' ')
  if ($item -eq '') { continue }

  $rateText = ''
  if ($parts.Count -gt 1) { $rateText = $parts[1].Trim() }
  $rate = '0'
  if ($rateText -match '^([0-9]+(\.[0-9]+)?)') { $rate = $matches[1] }

  $itemSql = $item.Replace("'", "''")
  $rows.Add("    ('$firm', '$itemSql', $rate)")
}

$sql = New-Object System.Collections.Generic.List[string]
$sql.Add('ALTER TABLE public.inventory_master')
$sql.Add('ADD COLUMN IF NOT EXISTS product_rate numeric(14, 3) DEFAULT 0;')
$sql.Add('')
$sql.Add('WITH data(firm_name, item_name, product_rate) AS (')
$sql.Add('  VALUES')
for ($i = 0; $i -lt $rows.Count; $i++) {
  if ($i -eq $rows.Count - 1) { $sql.Add($rows[$i]) } else { $sql.Add($rows[$i] + ',') }
}
$sql.Add(')')
$sql.Add('INSERT INTO public.inventory_master (firm_name, item_name, product_rate)')
$sql.Add('SELECT firm_name, item_name, product_rate')
$sql.Add('FROM data')
$sql.Add('ON CONFLICT (firm_name, item_name)')
$sql.Add('DO UPDATE SET product_rate = EXCLUDED.product_rate;')
$sql.Add('')
$sql.Add('SELECT firm_name, count(*) AS rows_after_update,')
$sql.Add('       count(*) FILTER (WHERE product_rate <> 0) AS non_zero_product_rate')
$sql.Add('FROM public.inventory_master')
$sql.Add("WHERE firm_name IN ('Purab', 'Rkl', 'Pmmpl')")
$sql.Add('GROUP BY firm_name')
$sql.Add('ORDER BY firm_name;')

Set-Content -LiteralPath $out -Value ($sql -join "`r`n") -Encoding UTF8
Write-Output "Generated $out with $($rows.Count) rows"
