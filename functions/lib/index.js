"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listMyInvites = exports.declineInvite = exports.acceptInvite = exports.previewInvite = exports.ctProxy = void 0;
const admin = require("firebase-admin");
admin.initializeApp();
var ctProxy_1 = require("./ctProxy");
Object.defineProperty(exports, "ctProxy", { enumerable: true, get: function () { return ctProxy_1.ctProxy; } });
var teams_1 = require("./teams");
Object.defineProperty(exports, "previewInvite", { enumerable: true, get: function () { return teams_1.previewInvite; } });
Object.defineProperty(exports, "acceptInvite", { enumerable: true, get: function () { return teams_1.acceptInvite; } });
Object.defineProperty(exports, "declineInvite", { enumerable: true, get: function () { return teams_1.declineInvite; } });
Object.defineProperty(exports, "listMyInvites", { enumerable: true, get: function () { return teams_1.listMyInvites; } });
//# sourceMappingURL=index.js.map