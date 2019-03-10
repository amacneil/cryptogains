workflow "CI" {
  on = "push"
  resolves = ["eslint"]
}

action "lint" {
  uses = "./"
  args = "./.github/lint.sh"
}
