const { google } = require('googleapis');
const dbUtils = require("../res/relayhub-dao").fulfillment;

const GOOGLE_APPLICATION_JSON_CREDENTIALS = process.env.GOOGLE_APPLICATION_JSON_CREDENTIALS;

if (!GOOGLE_APPLICATION_JSON_CREDENTIALS) {
    throw new Error(
        'Please define the GOOGLE_APPLICATION_JSON_CREDENTIALS environment variable inside .env.local'
    )
}

const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/homegraph'],
    credentials: JSON.parse(GOOGLE_APPLICATION_JSON_CREDENTIALS)
});

const homegraph = google.homegraph({
    version: 'v1',
    auth: auth
});

async function requestSyncWrapper(req, res) {
    try {
        if (req.method !== "POST" && req.method !== "GET")
            return res.status(405).end();

        const [authorization_type, token] = req.headers.authorization.split(" ");

        if (authorization_type.toLowerCase() !== "bearer")
            return res.status(401).end();

        const provided_user_id = token.split("$@$")[2];
        const found = await dbUtils.validateAccessToken(provided_user_id, token);
        if (found === false)
            return res.status(401).end();

        await requestSync(req, res);

    } catch (err){
        console.log(err);
        return res.status(400).end();
    }
}

function getAccessToken(headers) {
    return headers.authorization.split(" ")[1];
}

async function requestSync(req, res){
    const token = getAccessToken(req.headers);
    const user_id = token.split("$@$")[2];


        homegraph.devices.requestSync({
            requestBody: {
                agentUserId: user_id
            }
        })
        .then((resp) => res.json(resp.data))
        .catch((err) => res.status(err.code).json(err.errors));
}

module.exports = requestSyncWrapper;
