# oauth-service

This is a serverless app to handle OAuth redirection for the Slack Chat extension, and it is deployed on AWS Lambda.

To deploy a new version of this service, run

```
serverless deploy --verbose
```

To test this service locally, run

```
serverless offline start
```

This service requires the `env.yml` file with the SLACK_CLIENT_ID and SLACK_CLIENT_SECRET keys.

## Custom domain

The oauth service runs on a custom domain ([vscode.chat](https://vscode.chat)), configured with the [serverless-domain-manager](https://github.com/amplify-education/serverless-domain-manager) plugin.

The following command needs to run before a new deploy if there are any changes to the yml, wrt function route definitions.

```
serverless create_domain
```
