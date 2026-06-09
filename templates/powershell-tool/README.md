# PowerShell tool

Canonical PowerShell automation tool; `scripts/validate-structure.js --type powershell-tool`
enforces it.

## Files

- `main.ps1` — `[CmdletBinding(SupportsShouldProcess)]`, `Set-StrictMode`, stop-on-error, emits objects
- `tests/` — `Pester` tests

## Usage

```powershell
./main.ps1 -Name example
Invoke-Pester tests/
```
