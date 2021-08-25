const util = require('util');
const bcrypt = require('bcrypt');

const dbAuthUtils = require('../res/relayhub-dao.js').auth;
const crypto = require("crypto");

const CLIENT_ID = process.env.CLIENT_ID;
if (!CLIENT_ID) {
    throw new Error(
        'Please define the CLIENT_ID environment variable inside .env.local'
    )
}

const CLIENT_SECRET = process.env.CLIENT_SECRET;
if (!CLIENT_SECRET) {
    throw new Error(
        'Please define the CLIENT_SECRET environment variable inside .env.local'
    )
}

async function authCallback(req, res) {
    const redirect_uris = ["https://oauth-redirect.googleusercontent.com/r/relayhub-46bcb", "https://oauth-redirect-sandbox.googleusercontent.com/r/relayhub-46bcb"];

    const provided_client_id = req.query.client_id;
    const provided_redirect_uri = req.query.redirect_uri;

    if(!redirect_uris.includes(provided_redirect_uri) || provided_client_id !== CLIENT_ID){
        return res.status(403).end();
    }

    const responseUrl = util.format(
      '%s?state=%s',
      decodeURIComponent(req.query.redirect_uri),
      req.query.state
    );
    const redirectUrl = `/login?response_url=${encodeURIComponent(responseUrl)}&client_id=${provided_client_id}`;
    return res.redirect(redirectUrl);
}

function loginPage(req, res){
    res.setHeader('Cache-Control', 's-max-age=1, stale-while-revalidate')
    res.render('login.ejs', {response_url: req.query.response_url, client_id: req.query.client_id});
}

async function authUser(req, res){
    const email = req.body.username;
    const client_id = req.body.client_id;
    const [user_id, hash] = await dbAuthUtils.getUserHash(email);

    if(user_id === false){
        res.status(401).end();
    }

    const match = await bcrypt.compare(req.body.password, hash);

    if(match) {
        const code = crypto.randomBytes(16).toString('hex');
        const redirect_uri = req.body.response_url.split("?")[0];
        await dbAuthUtils.updateAuthorizationCode(user_id, code, client_id, redirect_uri);
        const responseUrl = decodeURIComponent(req.body.response_url) + `&code=${code}`;

        return res.redirect(responseUrl);
    }else{
        res.status(401).end();
    }
}

async function tokenCallback(req, res){
    const grantType = req.query.grant_type ? req.query.grant_type : req.body.grant_type;
    const provided_client_id = req.body.client_id;
    const provided_client_secret = req.body.client_secret;

    const secondsInSixHours = 21600; // 60 * 60 * 6

    let obj, status_code = 200;
    if (grantType === 'authorization_code') {
        const auth_code = req.body.code;
        const provided_redirect_uri = req.body.redirect_uri;

        const [user_id, code_domain] = await dbAuthUtils.getAuthorizationCodeInfo(auth_code);
        if(user_id === false){
            return res.status(400).json({error: "invalid_grant"});
        }

        const [client_id, redirect_uri] = code_domain.split("$@$");
        if(provided_client_id !== client_id || provided_client_secret !== CLIENT_SECRET || provided_redirect_uri !== redirect_uri){
            status_code = 400;
            obj = {
                error: "invalid_grant"
            };
        }else{
            const access_token = "access" + "$@$" + client_id + "$@$" + user_id + "$@$" + crypto.randomBytes(16).toString('hex');
            const refresh_token = "refresh" + "$@$" + client_id + "$@$" + user_id + "$@$" + crypto.randomBytes(32).toString('hex');
            obj = {
                token_type: 'Bearer',
                access_token: access_token,
                refresh_token: refresh_token,
                expires_in: secondsInSixHours,
            };
            await dbAuthUtils.finalizeUserTokens(user_id, access_token, refresh_token);
        }
    } else if (grantType === 'refresh_token') {
        const provided_refresh_token = req.body.refresh_token;

        const [_, token_client_id, user_id, __] = provided_refresh_token.split("$@$");

        const found = await dbAuthUtils.validateRefreshToken(user_id, provided_refresh_token);
        if(! found || token_client_id !== CLIENT_ID || provided_client_id !== token_client_id || provided_client_secret !== CLIENT_SECRET){
            status_code = 400;
            obj = {
                error: "invalid_grant"
            };
        }else{
            const access_token = "access" + "$@$" + token_client_id + "$@$" + user_id + "$@$" + crypto.randomBytes(16).toString('hex');
            obj = {
                token_type: 'Bearer',
                access_token: access_token,
                expires_in: secondsInSixHours,
            };
            await dbAuthUtils.updateAccessToken(user_id, access_token);
        }
    }
    res.status(status_code)
        .json(obj);
}


exports.authCallback = authCallback;
exports.tokenCallback = tokenCallback;
exports.loginPage = loginPage;
exports.authUser = authUser;
