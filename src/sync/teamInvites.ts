/**
 * Client wrappers for the team invite Cloud Functions (functions/src/teams.ts).
 * Accepting or declining an invite changes team membership, which the
 * Firestore rules only allow the team owner to do directly — so these flows
 * go through server-side functions that verify the invite first.
 */

import { getFunctions, httpsCallable } from 'firebase/functions'
import { app } from '@/firebase'
import type { Team } from '@/types'

const REGION = 'europe-west1'

export interface InvitePreview {
  teamName: string
  description: string
  ownerDisplayName: string
  memberCount: number
  role: 'contributor' | 'reader' | null
  alreadyMember: boolean
}

export interface PendingInvite {
  teamId: string
  teamName: string
  ownerDisplayName: string
  role: 'contributor' | 'reader'
}

async function call<Req, Res>(name: string, data: Req): Promise<Res> {
  if (!app) throw new Error('Firebase not configured')
  const fn = httpsCallable<Req, Res>(getFunctions(app, REGION), name)
  return (await fn(data)).data
}

export function previewInvite(teamId: string, token?: string): Promise<InvitePreview> {
  return call('previewInvite', { teamId, token: token || undefined })
}

/** Joins the team; returns the updated team document for the local database. */
export function acceptInvite(teamId: string, token?: string): Promise<Team> {
  return call('acceptInvite', { teamId, token: token || undefined })
}

export function declineInvite(teamId: string): Promise<{ ok: boolean }> {
  return call('declineInvite', { teamId })
}

export function listMyInvites(): Promise<PendingInvite[]> {
  return call('listMyInvites', {})
}
