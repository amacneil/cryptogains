workflow "CI" {
  on = "push"
  resolves = ["eslint"]
}

action "eslint" {
  uses = "./"
  args = "yarn && yarn run lint"
}
