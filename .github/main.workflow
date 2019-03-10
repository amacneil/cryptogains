workflow "New workflow" {
  on = "push"
  resolves = ["lint"]
}

action "lint" {
  uses = "./"
  args = "yarn run lint"
}
