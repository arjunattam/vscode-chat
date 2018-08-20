import { APIGatewayEvent, Callback, Context, Handler } from "aws-lambda";
import * as request from "request-promise-native";
const fs = require("fs");

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
      const response = {
        statusCode: 301,
        headers: {
          Location: `vscode://karigari.chat/redirect?token=${token}`
        }
      };

      cb(null, response);
    }
  });
};

const handleError = (error: string, cb: Callback) => {
  console.log("Running handleError:", error);

  fs.readFile("index.template.html", "utf8", (err, input) => {
    if (err) {
      console.log("fs error:", err);
    }

    const html = input.replace("{{error}}", error);
    const response = {
      statusCode: 200,
      headers: {
        "Content-Type": "text/html"
      },
      body: html
    };
    cb(null, response);
  });
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
