# Pester tests ship with the tool.
Describe 'main.ps1' {
    It 'returns an object with the given name' {
        $result = & "$PSScriptRoot/../main.ps1" -Name 'example'
        $result.Name | Should -Be 'example'
        $result.Status | Should -Be 'ok'
    }
}
