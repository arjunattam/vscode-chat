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
