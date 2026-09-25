"use strict";
/**
 * Team invite Cloud Functions.
 *
 * Firestore rules only let a team's owner write the team document, so every
 * membership change a non-owner makes — accepting or declining an invite —
 * runs here with the Admin SDK after the invite has been verified server-side.
 *
 *   previewInvite  { teamId, token? } → team name/owner/role for the join page
 *   acceptInvite   { teamId, token? } → adds the caller as a member
 *   declineInvite  { teamId }         → removes the caller's email invite
 *   listMyInvites  {}                 → pending email invites for the caller
 *
 * Link invites carry a random token; email invites match the caller's
 * verified Google account email.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.listMyInvites = exports.declineInvite = exports.acceptInvite = exports.previewInvite = void 0;
exports.withAccessFields = withAccessFields;
exports.findInvite = findInvite;
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const appCheck_1 = require("./appCheck");
const { HttpsError } = functions.https;
const callable = functions
    .region('europe-west1')
    .runWith({ timeoutSeconds: 30, maxInstances: 10, enforceAppCheck: appCheck_1.ENFORCE_APP_CHECK })
    .https;
/** Mirror of withAccessFields() in src/utils/teamAccess.ts — keep both in sync. */
function withAccessFields(team) {
    const roles = {};
    for (const m of team.members ?? []) {
        if (m.userId)
            roles[m.userId] = m.role;
    }
    roles[team.ownerId] = 'owner';
    const inviteEmails = [...new Set((team.invites ?? [])
            .filter(i => !i.token && i.email)
            .map(i => i.email.trim().toLowerCase()))];
    return { ...team, memberIds: Object.keys(roles), roles, inviteEmails };
}
function requireCaller(context) {
    if (!context.auth)
        throw new HttpsError('unauthenticated', 'Sign in required.');
    const token = context.auth.token;
    // Only a verified address may claim an email invite.
    const email = token.email_verified && typeof token.email === 'string' ? token.email.toLowerCase() : '';
    const displayName = typeof token.name === 'string' && token.name ? token.name : (email || 'Member');
    return { uid: context.auth.uid, email, displayName };
}
function stringArg(data, key, required) {
    const value = data?.[key];
    if (value === undefined || value === null || value === '') {
        if (required)
            throw new HttpsError('invalid-argument', `Missing ${key}.`);
        return '';
    }
    if (typeof value !== 'string' || value.length > 200) {
        throw new HttpsError('invalid-argument', `Invalid ${key}.`);
    }
    return value;
}
function isMember(team, uid) {
    return team.ownerId === uid || (team.members ?? []).some(m => m.userId === uid);
}
function findInvite(team, email, token) {
    const invites = team.invites ?? [];
    if (token)
        return invites.find(i => i.token === token);
    if (email)
        return invites.find(i => !i.token && i.email.trim().toLowerCase() === email);
    return undefined;
}
function teamRef(teamId) {
    return admin.firestore().collection('teams').doc(teamId);
}
// Same response for "no such team" and "no valid invite", so the functions
// cannot be used to probe which team IDs exist.
const invalidInvite = () => new HttpsError('not-found', 'This invite is not valid.');
exports.previewInvite = callable.onCall(async (data, context) => {
    const teamId = stringArg(data, 'teamId', true);
    const token = stringArg(data, 'token', false);
    // Holding a link token is enough to see the team name before signing in.
    const caller = context.auth ? requireCaller(context) : null;
    if (!caller && !token)
        throw new HttpsError('unauthenticated', 'Sign in required.');
    const snap = await teamRef(teamId).get();
    if (!snap.exists)
        throw invalidInvite();
    const team = snap.data();
    const alreadyMember = caller ? isMember(team, caller.uid) : false;
    const invite = findInvite(team, caller?.email ?? '', token);
    if (!invite && !alreadyMember)
        throw invalidInvite();
    return {
        teamName: team.name,
        description: team.description ?? '',
        ownerDisplayName: team.ownerDisplayName,
        memberCount: (team.members ?? []).length + 1,
        role: invite?.role ?? null,
        alreadyMember,
    };
});
exports.acceptInvite = callable.onCall(async (data, context) => {
    const caller = requireCaller(context);
    const teamId = stringArg(data, 'teamId', true);
    const token = stringArg(data, 'token', false);
    return admin.firestore().runTransaction(async (tx) => {
        const ref = teamRef(teamId);
        const snap = await tx.get(ref);
        if (!snap.exists)
            throw invalidInvite();
        const team = snap.data();
        if (isMember(team, caller.uid))
            return withAccessFields(team);
        const invite = findInvite(team, caller.email, token);
        if (!invite)
            throw invalidInvite();
        const updated = withAccessFields({
            ...team,
            members: [
                ...(team.members ?? []),
                { userId: caller.uid, email: caller.email, displayName: caller.displayName, role: invite.role },
            ],
            // Link invites are single-use; also drop any email invite for this user.
            invites: (team.invites ?? []).filter(i => i !== invite && !(caller.email && !i.token && i.email.trim().toLowerCase() === caller.email)),
            updatedAt: Date.now(),
        });
        tx.set(ref, updated);
        return updated;
    });
});
exports.declineInvite = callable.onCall(async (data, context) => {
    const caller = requireCaller(context);
    const teamId = stringArg(data, 'teamId', true);
    if (!caller.email)
        return { ok: true };
    await admin.firestore().runTransaction(async (tx) => {
        const ref = teamRef(teamId);
        const snap = await tx.get(ref);
        if (!snap.exists)
            return;
        const team = snap.data();
        const invites = (team.invites ?? []).filter(i => i.token || i.email.trim().toLowerCase() !== caller.email);
        if (invites.length === (team.invites ?? []).length)
            return;
        tx.set(ref, withAccessFields({ ...team, invites, updatedAt: Date.now() }));
    });
    return { ok: true };
});
exports.listMyInvites = callable.onCall(async (_data, context) => {
    const caller = requireCaller(context);
    if (!caller.email)
        return [];
    const snap = await admin.firestore()
        .collection('teams')
        .where('inviteEmails', 'array-contains', caller.email)
        .limit(20)
        .get();
    return snap.docs
        .map(d => d.data())
        .filter(team => !isMember(team, caller.uid))
        .map(team => ({
        teamId: team.id,
        teamName: team.name,
        ownerDisplayName: team.ownerDisplayName,
        role: findInvite(team, caller.email, '')?.role ?? 'reader',
    }));
});
//# sourceMappingURL=teams.js.map