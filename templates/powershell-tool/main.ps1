<#
.SYNOPSIS
  Canonical PowerShell automation tool. Windows/AD/structured-object work. Emit objects,
  not text. StrictMode + stop-on-error; -WhatIf for mutating actions. No hardcoded secrets.
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory = $true)]
    [string]$Name
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Tool {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Name)
    [pscustomobject]@{ Name = $Name; Status = 'ok' }
}

Invoke-Tool -Name $Name
