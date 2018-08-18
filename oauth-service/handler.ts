import { APIGatewayEvent, Callback, Context, Handler } from "aws-lambda";
import * as request from "request-promise-native";

const getSlackToken = async (code: string): Promise<string> => {
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
    console.error("OAuth error:", error);
  } else {
    return access_token;
  }
};

export const redirect: Handler = (
  event: APIGatewayEvent,
  context: Context,
  cb: Callback
) => {
  const { queryStringParameters } = event;
  const { code } = queryStringParameters;
  const tokenPromise = getSlackToken(code);

  tokenPromise.then(token => {
    // Response is a redirect to vscode url
    const response = {
      statusCode: 301,
      headers: {
        Location: `vscode://karigari.chat/redirect?token=${token}`
      }
    };

    cb(null, response);
  });
};
