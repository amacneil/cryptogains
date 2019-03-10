workflow "CI" {
  on = "push"
  resolves = ["eslint"]
}

action "lint" {
  uses = "./"
  args = "bash -c 'yarn && yarn run lint'"
}
