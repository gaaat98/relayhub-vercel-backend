const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;


if (!MONGODB_URI) {
    throw new Error(
        'Please define the MONGODB_URI environment variable inside .env.local'
    )
}

let client;
let clientPromise;

if (process.env.NODE_ENV === "development") {
    // In development mode, use a global variable so that the value
    // is preserved across module reloads caused by HMR (hot module replacement).
    if (!global._mongoClientPromise) {
        client = new MongoClient(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
        global._mongoClientPromise = client.connect();
    }
    clientPromise = global._mongoClientPromise;
} else {
    // In production mode, it's best to not use a global variable.
    client = new MongoClient(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    clientPromise = client.connect()
}




module.exports = clientPromise;
