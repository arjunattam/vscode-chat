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
  uses = "arjun27/shaking-finger-action@patch-1"
  secrets = ["GITHUB_TOKEN"]
}
