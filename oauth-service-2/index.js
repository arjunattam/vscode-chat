//@ts-check
const utils = require('./utils');
const htmls = require('./htmls');
const request = require('request-promise-native');

async function getSlackToken(code) {
  const uri = "https://slack.com/api/oauth.access";
  var options = {
    uri,
    json: true,
    qs: {
      client_id: process.env.SLACK_CLIENT_ID,
      client_secret: process.env.SLACK_CLIENT_SECRET,
      code,
      // When testing locally, pass the redirect_uri to slack
      redirect_uri: "https://us-central1-eco-theater-119616.cloudfunctions.net/slackRedirect"
    }
  };

  const result = await request.get(options);
  const { ok, error, access_token, team_id } = result;

  if (!ok) {
    return { accessToken: null, error };
  } else {
    return { accessToken: access_token, teamId: team_id, error: null };
  }
}

const renderSuccess = (token, service, teamId, response) => {
  const redirect = utils.redirectUrl(token, service, teamId);
  response.set('Content-Type', 'text/html');
  response.status(200).send(
    htmls.success
      .replace(/{{redirect}}/g, redirect)
      .replace(/{{token}}/g, token)
  );
};

const renderError = (error, service, response) => {
  const issueUrl = utils.issueUrl(error, service);
  const redirect = utils.redirectError(error, service);
  response.set('Content-Type', 'text/html');
  response.status(200).send(
    htmls.error
      .replace(/{{error}}/g, error)
      .replace(/{{redirect}}/g, redirect)
      .replace(/{{issues}}/g, issueUrl)
  );
};

exports.slackRedirect = async (req, res) => {
  const { error, code } = req.query;
  if (!!code) {
    const tokenPromise = getSlackToken(code);
    tokenPromise.then(result => {
      const { accessToken, error, teamId } = result;

      if (!accessToken) {
        renderError(error, "slack", res);
      } else {
        renderSuccess(accessToken, "slack", teamId, res);
      }
    });
  } else {
    renderError(error, "slack", res);
  }
};