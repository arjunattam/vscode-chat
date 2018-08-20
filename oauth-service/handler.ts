import { APIGatewayEvent, Callback, Context, Handler } from "aws-lambda";
import * as request from "request-promise-native";
import errorHtml from "./error.template.html";
import successHtml from "./success.template.html";

interface APIResponse {
  token: string;
  error: string;
}

const getSlackToken = async (code: string): Promise<APIResponse> => {
  const uri = "https://slack.com/api/oauth.access";
  var options = {
    uri,
    json: true,
    qs: {
      client_id: process.env.SLACK_CLIENT_ID,
      client_secret: process.env.SLACK_CLIENT_SECRET,
      code
    }
  };
  const result = await request.get(options);
  const { ok, error, access_token } = result;

  if (!ok) {
    return { token: null, error };
  } else {
    return { token: access_token, error: null };
  }
};

const handleSuccess = (code: string, cb: Callback) => {
  const tokenPromise = getSlackToken(code);
  tokenPromise.then((result: APIResponse) => {
    // Redirect to native vscode uri
    const { token, error } = result;

    if (!token) {
      handleError(error, cb);
    } else {
      const redirect = `vscode://karigari.chat/redirect?token=${token}`;
      const response = {
        statusCode: 200,
        headers: {
          "Content-Type": "text/html"
        },
        body: successHtml
          .replace(/{{redirect}}/g, redirect)
          .replace(/{{token}}/g, token)
      };

      cb(null, response);
    }
  });
};

const handleError = (error: string, cb: Callback) => {
  console.log("Running handleError:", error);
  const encode = encodeURIComponent;
  const title = `[oauth-service] Sign in with Slack failed: ${error}`;
  const body = `- Extension version:\n- VS Code version:`;
  const baseUrl = "https://github.com/karigari/vscode-chat/issues/new/";
  const issueUrl = `${baseUrl}?title=${encode(title)}&body=${encode(body)}`;
  const redirect = `vscode://karigari.chat/error?msg=${error}`;
  const response = {
    statusCode: 200,
    headers: {
      "Content-Type": "text/html"
    },
    body: errorHtml
      .replace(/{{error}}/g, error)
      .replace(/{{redirect}}/g, redirect)
      .replace(/{{issues}}/g, issueUrl)
  };
  cb(null, response);
};

export const redirect: Handler = (
  event: APIGatewayEvent,
  context: Context,
  cb: Callback
) => {
  const { queryStringParameters } = event;
  const { code, error } = queryStringParameters;

  if (!!code) {
    handleSuccess(code, cb);
  }

  if (!!error) {
    handleError(error, cb);
  }
};
