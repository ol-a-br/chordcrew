"use strict";
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
exports.listMyInvites = exports.declineInvite = exports.acceptInvite = exports.previewInvite = exports.ctProxy = void 0;
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
var ctProxy_1 = require("./ctProxy");
Object.defineProperty(exports, "ctProxy", { enumerable: true, get: function () { return ctProxy_1.ctProxy; } });
var teams_1 = require("./teams");
Object.defineProperty(exports, "previewInvite", { enumerable: true, get: function () { return teams_1.previewInvite; } });
Object.defineProperty(exports, "acceptInvite", { enumerable: true, get: function () { return teams_1.acceptInvite; } });
Object.defineProperty(exports, "declineInvite", { enumerable: true, get: function () { return teams_1.declineInvite; } });
Object.defineProperty(exports, "listMyInvites", { enumerable: true, get: function () { return teams_1.listMyInvites; } });
//# sourceMappingURL=index.js.map