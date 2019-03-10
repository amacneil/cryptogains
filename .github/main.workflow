workflow "New workflow" {
  on = "push"
  resolves = ["eslint"]
}

action "eslint" {
  uses = "actions/docker/cli@8cdf801b322af5f369e00d85e9cf3a7122f49108"
  runs = "make lint"
}
