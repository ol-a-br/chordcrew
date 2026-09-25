import * as admin from 'firebase-admin'

admin.initializeApp()

export { ctProxy } from './ctProxy'
export { previewInvite, acceptInvite, declineInvite, listMyInvites } from './teams'
