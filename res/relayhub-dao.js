const { ObjectId } = require('mongodb');
const dot = require('mongo-dot-notation')

const clientPromise = require('../lib/mongodb-client');

const MONGODB_DB = process.env.MONGODB_DB;

if (!MONGODB_DB) {
    throw new Error(
        'Please define the MONGODB_DB environment variable inside .env.local'
    )
}

async function getDB() {
    const cl = await clientPromise;
    return cl.db(MONGODB_DB);
}

async function getUserHash(email) {
    const db = await getDB();

    const user = await db.collection("users").findOne({ email: email });

    return user ? [user._id.valueOf(), user.hash] : [false, false];
}

async function updateAuthorizationCode(user_id, code, client_id, redirect_uri) {
    const db = await getDB();

    return db.collection("users").updateOne(
        { _id: ObjectId(user_id) },
        {
            $set: {
                authorization_code: code,
                authorization_domain: `${client_id}$@$${redirect_uri}`,
                authorization_date: new Date
            }
        }
    );
}

async function getAuthorizationCodeInfo(code) {
    const db = await getDB();

    const user = await db.collection("users").findOne({ authorization_code: code });

    return user ? [user._id.valueOf(), user.authorization_domain] : [false, false];

}

async function finalizeUserTokens(user_id, access_token, refresh_token) {
    const db = await getDB();

    return db.collection("users").updateOne(
        { _id: ObjectId(user_id) },
        {
            $set: {
                refresh_token: refresh_token,
                access_token: access_token,
                access_date: new Date,
                report_state: true
            },
            $unset: {
                authorization_code: "",
                authorization_domain: "",
                authorization_date: ""
            }

        }
    );
}

async function validateRefreshToken(user_id, refresh_token) {
    const db = await getDB();

    const user = await db.collection("users").findOne(
        {
            _id: ObjectId(user_id),
            refresh_token: refresh_token
        }
    );

    return user ? true : false;
}

async function updateAccessToken(user_id, access_token) {
    const db = await getDB();

    return db.collection("users").updateOne(
        { _id: ObjectId(user_id) },
        {
            $set: {
                access_token: access_token,
                access_date: new Date
            }
        }
    );
}


async function validateAccessToken(user_id, access_token) {
    const db = await getDB();

    const user = await db.collection("users").findOne(
        {
            _id: ObjectId(user_id),
            access_token: access_token
        }
    );

    return user ? true : false;
}

async function getSyncDevices(user_id) {
    const db = await getDB();

    const entry = await db.collection("sync_devices").findOne(
        {
            _id: ObjectId(user_id)
        }
    );

    return entry ? entry.devices : false;
}

async function setSyncDevices(user_id, devices) {
    const db = await getDB();

    return db.collection("sync_devices").updateOne(
        { _id: ObjectId(user_id) },
        {
            $set: {
                devices: devices,
            }
        }
    );
}

function prepareUserAppliances(devices) {
    const appliances = devices.reduce((accum, dev) => {
        accum[dev.id] = {};

        dev.traits.forEach((trait) => {
            switch (trait) {
                case 'action.devices.traits.OnOff':
                    accum[dev.id].OnOff = { on: false };
                    break;
                case 'action.devices.traits.Brightness':
                    accum[dev.id].Brightness = { brightness: 0 };
                    break;
                case 'action.devices.traits.StartStop':
                    accum[dev.id].StartStop = { isRunning: false };
                    break;
                default:
                    break;
            }
        });

        return accum;
    }, {});

    return appliances;
}

async function getUserAppliances(user_id) {
    const db = await getDB();

    const entry = await db.collection("appliances").findOne(
        { _id: ObjectId(user_id) }
    );

    return entry ? entry.appliances : {};
}


async function setUserAppliances(user_id, devices) {
    const appliances = prepareUserAppliances(devices);

    const db = await getDB();

    return db.collection("appliances").updateOne(
        { _id: ObjectId(user_id) },
        {
            $set: {
                appliances: appliances,
            }
        },
        {
            upsert: true
        }
    );
}

async function deleteUserTokens(user_id) {
    const db = await getDB();

    return db.collection("users").updateOne(
        { _id: ObjectId(user_id) },
        {
            $set: {
                report_state: false
            },
            $unset: {
                refresh_token: "",
                access_token: "",
                access_date: "",
                authorization_code: "",
                authorization_domain: "",
                authorization_date: ""
            }
        }
    );
}

async function deleteUserAppliances(user_id) {
    const db = await getDB();

    return db.collection("appliances").deleteOne(
        { _id: ObjectId(user_id) }
    );
}

async function getUserReportStateInfo(user_id){
    const db = await getDB();
    const user = await db.collection("users").findOne(
        {
            _id: ObjectId(user_id),
        }
    );

    return user ? [user.device_jwt_psk, user.report_state] : [false, false];
}

async function updateUserAppliancesStates(user_id, updates){
    const db = await getDB();

    const instructions = dot.flatten({appliances: updates});
    const filter = Object.keys(updates).reduce((accum, id) => {
        accum[`appliances.${id}`] = { $exists: true};
        return accum;
    }, {_id: ObjectId(user_id), appliances: { $exists: true}});

    // FIXME: update not done if at least one id is not existing
    const result = await db.collection("appliances").updateOne(
        filter,
        instructions
    );

    return result.matchedCount === 1 ? true : false;
}

exports.fulfillment = {};
exports.fulfillment.validateAccessToken = validateAccessToken;
exports.fulfillment.setSyncDevices = setSyncDevices;
exports.fulfillment.getSyncDevices = getSyncDevices;
exports.fulfillment.getUserAppliances = getUserAppliances;
exports.fulfillment.setUserAppliances = setUserAppliances;
exports.fulfillment.deleteUserTokens = deleteUserTokens;
exports.fulfillment.deleteUserAppliances = deleteUserAppliances;
exports.fulfillment.getUserReportStateInfo = getUserReportStateInfo;
exports.fulfillment.updateUserAppliancesStates = updateUserAppliancesStates;

exports.auth = {};
exports.auth.getUserHash = getUserHash;
exports.auth.updateAuthorizationCode = updateAuthorizationCode;
exports.auth.getAuthorizationCodeInfo = getAuthorizationCodeInfo;
exports.auth.finalizeUserTokens = finalizeUserTokens;
exports.auth.validateRefreshToken = validateRefreshToken;
exports.auth.updateAccessToken = updateAccessToken;

