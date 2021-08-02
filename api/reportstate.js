const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');

const jwt = require('jsonwebtoken');

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

async function reportStateWrapper(req, res) {
    try {
        if (req.method !== "POST")
            return res.status(405).end();

        const [authorization_type, token] = req.headers.authorization.split(" ");

        if (authorization_type.toLowerCase() !== "bearer")
            return res.status(401).end();

        const payload = jwt.decode(token);
        const user_id = payload.user_id;
        const [PSK_JWT, rs] = await dbUtils.getUserReportStateInfo(user_id);

        try {
            jwt.verify(token, PSK_JWT);

            // TODO: reactivate time checks
            //const currentTime = Date.now() / 1000;
            //const commandDate = payload.d;
            // expiration time set to 10 seconds
            //console.info("JWT REMAINING TIME: ", currentTime - commandDate);
            /*
            if (currentTime > commandDate + 10 || currentTime < commandDate) {
                console.error("JWT TIME NO GOOD: ", currentTime - commandDate)
                throw 'Jwt is Expired/Suspicious/Flooding!'
            }*/
        } catch (err) {
            console.error(err);
            return res.status(401).end();
        }

        res.report_state = rs;
        res.payload = payload;
        await reportState(req, res);

    } catch (err) {
        console.log(err);
        return res.status(400).end();
    }
}

async function reportState(req, res) {
    const payload = res.payload;
    const user_id = payload.user_id;
    const data = payload.u;

    const updates = {};
    data.forEach(u => {
        updates[u.id] = u.cmd;
    });

    const done = await dbUtils.updateUserAppliancesStates(user_id, updates);
    if (!done)
        return res.status(400).json({ error: "Update failed, check device ids" });

    if (!res.report_state)
        return res.status(200).end();

    // extracting only states from update
    const states = {}
    for (const device_id in updates) {
        const device_states = {};
        Object.values(updates[device_id]).forEach(s => Object.assign(device_states, s))
        states[device_id] = device_states;
    }

    await homegraph.devices.reportStateAndNotification({
        requestBody: {
            agentUserId: user_id,
            requestId: uuidv4(),
            payload: {
                devices: {
                    states: states
                }
            }
        }
    })
    .then((resp) => res.json(resp.data))
    .catch((err) => res.status(err.code).json(err.errors));
}


module.exports = reportStateWrapper;