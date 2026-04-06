/**
 * TeamJoinPage — handles invite links of the form /join/:teamId?token=ABC
 *
 * Flow:
 * 1. Load team from Firestore (public enough to read if you have the link)
 * 2. If user is not signed in → show sign-in prompt
 * 3. Validate the token against team.invites[].token
 * 4. Accept: add user to team.members[], remove the invite, sync
 * 5. Navigate to /library
 */

import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { Music2, Users, Check, AlertCircle } from 'lucide-react'
import { firestore, firebaseConfigured } from '@/firebase'
import { useAuth } from '@/auth/AuthContext'
import { db } from '@/db'
import { Button } from '@/components/shared/Button'
import type { Team, TeamMember } from '@/types'

type Status = 'loading' | 'needs-login' | 'ready' | 'joining' | 'joined' | 'invalid' | 'already-member' | 'no-firebase'

export default function TeamJoinPage() {
  const { teamId } = useParams<{ teamId: string }>()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const navigate = useNavigate()
  const { user, signInWithGoogle } = useAuth()

  const [status, setStatus] = useState<Status>('loading')
  const [team, setTeam] = useState<Team | null>(null)
  const [signingIn, setSigningIn] = useState(false)

  useEffect(() => {
    if (!firebaseConfigured || !firestore || !teamId) {
      setStatus('no-firebase')
      return
    }
    loadTeam()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, user])

  const loadTeam = async () => {
    if (!firestore || !teamId) return
    setStatus('loading')
    try {
      const snap = await getDoc(doc(firestore, 'teams', teamId))
      if (!snap.exists()) { setStatus('invalid'); return }
      const remote = snap.data() as Team
      setTeam(remote)

      if (!user) { setStatus('needs-login'); return }

      // Check already a member
      const isMember = remote.ownerId === user.id ||
        remote.members.some(m => m.userId === user.id || m.email === user.email)
      if (isMember) { setStatus('already-member'); return }

      // Validate token or email-based invite
      const invite = token
        ? remote.invites.find(i => i.token === token)
        : remote.invites.find(i => i.email === user.email)

      if (!invite) { setStatus('invalid'); return }

      setStatus('ready')
    } catch {
      setStatus('invalid')
    }
  }

  const handleSignIn = async () => {
    setSigningIn(true)
    try {
      await signInWithGoogle()
      // useEffect will re-run after user updates
    } catch {
      // ignore
    } finally {
      setSigningIn(false)
    }
  }

  const handleJoin = async () => {
    if (!user || !team || !firestore) return
    setStatus('joining')

    const invite = token
      ? team.invites.find(i => i.token === token)
      : team.invites.find(i => i.email === user.email)

    if (!invite) { setStatus('invalid'); return }

    const newMember: TeamMember = {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      role: invite.role,
    }

    const updated: Team = {
      ...team,
      members: [...team.members, newMember],
      invites: team.invites.filter(i => i.token !== token && i.email !== user.email),
      updatedAt: Date.now(),
    }

    try {
      // Write to Firestore
      await setDoc(doc(firestore, 'teams', team.id), updated)
      // Persist locally
      await db.teams.put(updated)
      setStatus('joined')
      setTimeout(() => navigate('/library'), 2000)
    } catch {
      setStatus('ready') // allow retry
    }
  }

  return (
    <div className="min-h-screen bg-surface-0 flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">

        {/* Logo */}
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="w-14 h-14 rounded-2xl bg-chord/10 border border-chord/20 flex items-center justify-center">
            <Music2 size={28} className="text-chord" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">ChordCrew</h1>
        </div>

        {/* States */}
        {(status === 'loading' || status === 'joining') && (
          <div className="text-center text-ink-muted text-sm flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-chord border-t-transparent rounded-full animate-spin" />
            {status === 'joining' ? 'Joining team…' : 'Loading…'}
          </div>
        )}

        {status === 'no-firebase' && (
          <div className="bg-surface-1 rounded-xl p-5 text-center space-y-2">
            <AlertCircle size={24} className="text-amber-400 mx-auto" />
            <p className="text-sm text-ink-muted">Invite links require Firebase to be configured.</p>
          </div>
        )}

        {status === 'invalid' && (
          <div className="bg-surface-1 rounded-xl p-5 text-center space-y-3">
            <AlertCircle size={24} className="text-red-400 mx-auto" />
            <p className="text-sm font-medium">This invite link is no longer valid.</p>
            <p className="text-xs text-ink-muted">It may have been revoked or already used. Ask the team owner to send a new invite.</p>
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>Go to ChordCrew</Button>
          </div>
        )}

        {status === 'already-member' && team && (
          <div className="bg-surface-1 rounded-xl p-5 text-center space-y-3">
            <Check size={24} className="text-green-400 mx-auto" />
            <p className="text-sm font-medium">You're already in <span className="text-chord">{team.name}</span>.</p>
            <Button variant="primary" size="sm" onClick={() => navigate('/library')}>Open Library</Button>
          </div>
        )}

        {(status === 'needs-login' || status === 'ready' || status === 'joined') && team && (
          <div className="bg-surface-1 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-chord/10 flex items-center justify-center">
                <Users size={20} className="text-chord" />
              </div>
              <div>
                <p className="text-xs text-ink-faint">You're invited to join</p>
                <p className="font-semibold">{team.name}</p>
                {team.description && <p className="text-xs text-ink-muted">{team.description}</p>}
              </div>
            </div>

            <div className="text-xs text-ink-muted space-y-1">
              <p>Invited by <span className="text-ink">{team.ownerDisplayName}</span></p>
              <p>{team.members.length + 1} member{team.members.length !== 0 ? 's' : ''}</p>
            </div>

            {status === 'needs-login' && (
              <div className="space-y-2">
                <p className="text-xs text-ink-muted">Sign in with Google to join this team.</p>
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={handleSignIn}
                  disabled={signingIn}
                >
                  <GoogleIcon />
                  {signingIn ? 'Signing in…' : 'Sign in with Google'}
                </Button>
              </div>
            )}

            {status === 'ready' && (
              <Button variant="primary" className="w-full" onClick={handleJoin}>
                <Users size={15} />
                Join team
              </Button>
            )}

            {status === 'joined' && (
              <div className="flex items-center gap-2 text-green-400 text-sm justify-center">
                <Check size={16} />
                Joined! Redirecting…
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  )
}
