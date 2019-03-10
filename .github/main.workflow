workflow "CI" {
  on = "push"
  resolves = ["lint"]
}

action "lint" {
  uses = "./"
  args = "./.github/lint.sh"
}
