workflow "CI" {
  on = "push"
  resolves = ["eslint"]
}

action "eslint" {
  uses = "./"
  args = "bash -c 'yarn && yarn run lint'"
}
