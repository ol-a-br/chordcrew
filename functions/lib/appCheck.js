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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENFORCE_APP_CHECK = void 0;
exports.appCheckAllows = appCheckAllows;
const admin = __importStar(require("firebase-admin"));
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