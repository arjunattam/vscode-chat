# Oauth redirection service

## Running locally

```
npm start
```

## Deployment

```
gcloud functions deploy slackRedirect --set-env-vars SLACK_CLIENT_ID=<VALUE>,SLACK_CLIENT_SECRET=<VALUE> --runtime nodejs10 --trigger-http
```
