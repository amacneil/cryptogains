workflow "CI" {
  on = "push"
  resolves = ["lint"]
}

action "lint" {
  uses = "./"
  args = "yarn run lint"
}
