#!/usr/bin/env pwsh
# One-command installer for Omni Router (Windows / PowerShell).
# Usage: ./install.ps1 [-Force]

param(
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$scriptArgs = @()
if ($Force) { $scriptArgs += '--force' }
node (Join-Path $root 'scripts/install-preset.mjs') @scriptArgs