#Requires -Version 5.1
<#
.SYNOPSIS
  Windows helper: runs vcenter_csv_inventory.py with the same argv as the Python entrypoint.

  Example (from the ansible directory):
    $env:VCENTER_CSV = "C:\path\export.csv"
    .\inventory\vcenter_csv_inventory.ps1 --list

  Override Python (optional):
    $env:ANSIBLE_INVENTORY_PYTHON = "C:\Path\python.exe"
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script = Join-Path $PSScriptRoot "vcenter_csv_inventory.py"
if (-not (Test-Path -LiteralPath $script)) {
  Write-Error "Missing inventory script: $script"
  exit 2
}

$custom = $env:ANSIBLE_INVENTORY_PYTHON
if ($custom) {
  if (-not (Test-Path -LiteralPath $custom)) {
    Write-Error "ANSIBLE_INVENTORY_PYTHON is not a valid path: $custom"
    exit 2
  }
  & $custom $script @args
  exit $LASTEXITCODE
}

$py = Get-Command "py" -ErrorAction SilentlyContinue
if ($py) {
  & py -3 $script @args
  exit $LASTEXITCODE
}

foreach ($name in @("python3", "python")) {
  $c = Get-Command $name -ErrorAction SilentlyContinue
  if ($c) {
    & $c.Path $script @args
    exit $LASTEXITCODE
  }
}

Write-Error "Python 3 not found. Install Python 3, use the 'py' launcher, or set ANSIBLE_INVENTORY_PYTHON to python.exe."
exit 127
