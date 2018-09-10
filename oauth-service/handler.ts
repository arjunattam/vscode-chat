import { APIGatewayEvent, Callback, Context, Handler } from "aws-lambda";
import * as request from "request-promise-native";
import {
  parseQueryParams,
  getIssueUrl,
  getRedirect,
  getRedirectError
} from "./utils";
import errorHtml from "./html/error.template.html";
import successHtml from "./html/success.template.html";
import homeHtml from "./html/home.template.html";

interface TokenAPIResponse {
  accessToken: string;
  expiresIn?: Date;
  refreshToken?: string;
  error: string;
}

const getSlackToken = async (code: string): Promise<TokenAPIResponse> => {
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
    return { accessToken: null, error };
  } else {
    return { accessToken: access_token, error: null };
  }
};

const getDiscordToken = async (code: string): Promise<TokenAPIResponse> => {
  const uri = "https://discordapp.com/api/v6/oauth2/token";
  var options = {
    uri,
    method: "POST",
    formData: {
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code
    }
  };

  try {
    const result = await request.post(options);
    const parsed = JSON.parse(result);
    var t = new Date();
    t.setSeconds(t.getSeconds() + parsed.expires_in);
    return {
      accessToken: parsed.access_token,
      expiresIn: t,
      refreshToken: parsed.refresh_token,
      error: null
    };
  } catch (error) {
    return { accessToken: null, error: error.message };
  }
};

const renderSuccess = (token: string, service: string, cb: Callback) => {
  const redirect = getRedirect(token, service);
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
};

const renderError = (error: string, service: string, cb: Callback) => {
  const issueUrl = getIssueUrl(error, service);
  const redirect = getRedirectError(error, service);
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

export const slackRedirect: Handler = (
  event: APIGatewayEvent,
  context: Context,
  cb: Callback
) => {
  const { error, code } = parseQueryParams(event);

  if (!!code) {
    const tokenPromise = getSlackToken(code);
    tokenPromise.then(result => {
      const { accessToken, error } = result;

      if (!accessToken) {
        renderError(error, "slack", cb);
      } else {
        renderSuccess(accessToken, "slack", cb);
      }
    });
  }

  if (!!error) {
    renderError(error, "slack", cb);
  }
};

export const discordRedirect: Handler = (
  event: APIGatewayEvent,
  context: Context,
  cb: Callback
) => {
  const { error, code } = parseQueryParams(event);

  if (!!code) {
    const tokenPromise = getDiscordToken(code);
    tokenPromise.then(result => {
      const { accessToken, error } = result;

      if (!accessToken) {
        renderError(error, "discord", cb);
      } else {
        renderSuccess(accessToken, "discord", cb);
      }
    });
  }

  if (!!error) {
    renderError(error, "discord", cb);
  }
};

export const home: Handler = (
  event: APIGatewayEvent,
  context: Context,
  cb: Callback
) => {
  const response = {
    statusCode: 200,
    headers: {
      "Content-Type": "text/html"
    },
    body: homeHtml
  };
  cb(null, response);
};
