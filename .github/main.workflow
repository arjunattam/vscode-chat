workflow "LSIF workflow" {
  resolves = ["arjun27/lsif-action@master"]
  on = "push"
}

action "arjun27/lsif-action@master" {
  uses = "arjun27/lsif-action@master"
}

workflow "Testing fork builds" {
  on = "pull_request"
  resolves = ["post gif on fail"]
}

action "post gif on fail" {
  uses = "jessfraz/shaking-finger-action@master"
  secrets = ["GITHUB_TOKEN"]
}
