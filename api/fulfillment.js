const { smarthome } = require('actions-on-google');
const dbFulfillmentUtils = require('../res/relayhub-dao.js').fulfillment;
//const syncDevices = require('../res/devices').syncDevices;

const CLIENT_ID = process.env.CLIENT_ID;
if (!CLIENT_ID) {
    throw new Error(
        'Please define the CLIENT_ID environment variable inside .env.local'
    )
}

const smartHomeApp = smarthome({
    debug: false,
});

function getAccessToken(headers) {
    return headers.authorization.split(" ")[1];
}

//async function fulfillmentWrapper(req, res, next) {
async function fulfillmentWrapper(req, res) {
    try {
        if (req.method !== "POST")
            return res.status(405).end();

        const [authorization_type, token] = req.headers.authorization.split(" ");

        if (authorization_type.toLowerCase() !== "bearer")
            return res.status(401).end();

        const [provided_token_type, provided_client_id, provided_user_id, _] = token.split("$@$");
        if (provided_token_type !== "access" || provided_client_id !== CLIENT_ID)
            return res.status(401).end();

        const found = await dbFulfillmentUtils.validateAccessToken(provided_user_id, token);
        if (found === false)
            return res.status(401).end();

        //return smartHomeApp(req, res, next);
        smartHomeApp(req.body, req.headers)
            .then((resp) => res.status(resp.status).json(resp.body))

    } catch {
        return res.status(400).end();
    }
}

smartHomeApp.onSync(async (body, headers) => {
    const token = getAccessToken(headers);
    const user_id = token.split("$@$")[2];

    //await dbFulfillmentUtils.setSyncDevices(user_id, syncDevices[user_id]);
    const devices = await dbFulfillmentUtils.getSyncDevices(user_id);
    await dbFulfillmentUtils.setUserAppliances(user_id, devices);

    return {
        requestId: body.requestId,
        payload: {
            agentUserId: user_id,
            devices: devices
        },
    };
});


smartHomeApp.onQuery(async (body, headers) => {
    const token = getAccessToken(headers);
    const user_id = token.split("$@$")[2];
    const queriedDevices = body.inputs[0].payload.devices.map(d => d.id);
    /*
        const payload = {
            devices: {id: states},
        };
        queriedDevices = [{id: "id", customData: {} }]
    */
    const appliances = await dbFulfillmentUtils.getUserAppliances(user_id);
    const payload = {
        devices: {},
    };

    for (const device_id of queriedDevices) {
        const device_states = {};
        Object.values(appliances[device_id]).forEach(s => Object.assign(device_states, s))
        payload.devices[device_id] = device_states;
    }

    return {
        requestId: body.requestId,
        payload: payload,
    };
});

smartHomeApp.onExecute((body, headers) => {
    // EXECUTE requests should be handled by local fulfillment
    return {
        requestId: body.requestId,
        payload: {
            commands: body.inputs[0].payload.commands.map((command) => {
                /*
                  console.warn(`Cloud fallback for ${command.execution[0].command}.`,
                  `EXECUTE received for device ids: ${command.devices.map((device) => device.id)}.`);
                */
                return {
                    ids: command.devices.map((device) => device.id),
                    status: 'ERROR',
                    errorCode: 'actionNotAvailable',
                    debugString: `Ensure devices are locally identified.`,
                };
            }),
        },
    };
});

smartHomeApp.onDisconnect(async (body, headers) => {
    const token = getAccessToken(headers);
    const user_id = token.split("$@$")[2];

    await dbFulfillmentUtils.deleteUserTokens(user_id);
    await dbFulfillmentUtils.deleteUserAppliances(user_id);

    return {};
  });

module.exports = fulfillmentWrapper;