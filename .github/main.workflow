workflow "New workflow" {
  on = "push"
  resolves = ["arjun27/lsif-action@master"]
}

action "arjun27/lsif-action@master" {
  uses = "arjun27/lsif-action@master"
}
