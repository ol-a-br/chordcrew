import { initializeApp } from 'firebase-admin/app'

initializeApp()

export { ctProxy } from './ctProxy'
export { previewInvite, acceptInvite, declineInvite, listMyInvites } from './teams'
