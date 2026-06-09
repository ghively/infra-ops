#!/usr/bin/env bats
# bats tests ship with the tool.

@test "runs with a name" {
  run bash "${BATS_TEST_DIRNAME}/../main.sh" --name example
  [ "$status" -eq 0 ]
  [[ "$output" == *"running for example"* ]]
}
