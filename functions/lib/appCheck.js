"use strict";
/**
 * Firebase App Check for the Cloud Functions.
 *
 * Rollout happens in two phases (docs/deployment.md):
 *   1. monitor — ENFORCE_APP_CHECK=false: requests without an App Check token
 *      are still served, so the Firebase console can show how much traffic is
 *      verified before anything is blocked. Invalid tokens are always rejected.
 *   2. enforce — ENFORCE_APP_CHECK=true in functions/.env: requests must carry
 *      a valid token from the ChordCrew web app.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENFORCE_APP_CHECK = void 0;
exports.appCheckAllows = appCheckAllows;
const admin = require("firebase-admin");
exports.ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';
/** Check the X-Firebase-AppCheck header of a plain HTTP (onRequest) function. */
async function appCheckAllows(token) {
    if (!token)
        return !exports.ENFORCE_APP_CHECK;
    try {
        await admin.appCheck().verifyToken(token);
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=appCheck.js.map