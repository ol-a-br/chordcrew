import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { onSnapshot, doc as fsDoc } from 'firebase/firestore'
import { ArrowLeft, Crown, UserPlus, Trash2, ChevronDown, Link2, Share2, Mail, Copy, Check as CheckIcon, Pencil } from 'lucide-react'
import { db, generateId } from '@/db'
import { syncTeam } from '@/sync/firestoreSync'
import { firestore, firebaseConfigured } from '@/firebase'
import { Button } from '@/components/shared/Button'
import { useAuth } from '@/auth/AuthContext'
import type { Team, TeamMember, TeamInvite, TeamMemberRole } from '@/types'

const APP_BASE_URL = 'https://chordcrew.app'

function generateToken(): string {
  const arr = new Uint8Array(18)
  crypto.getRandomValues(arr)
  return btoa(String.fromCharCode(...arr)).replace(/[+/=]/g, c => ({ '+': '-', '/': '_', '=': '' }[c] ?? c))
}

const roleLabelKey = (role: TeamMemberRole) => `teams.roleLabel.${role}`

export default function TeamDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t } = useTranslation()

  const [editingInfo, setEditingInfo] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'contributor' | 'reader'>('contributor')
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [showSharePanel, setShowSharePanel] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [generatingLink, setGeneratingLink] = useState(false)
  const [shareInvite, setShareInvite] = useState<TeamInvite | null>(null)

  const team = useLiveQuery(() => id ? db.teams.get(id) : undefined, [id])

  // Real-time Firestore listener: keep local Dexie up to date when other members
  // change the team (e.g. accept invites, role changes). This lets the owner see
  // invite acceptances without needing to manually sync.
  useEffect(() => {
    if (!id || !firebaseConfigured || !firestore) return
    const unsub = onSnapshot(fsDoc(firestore, 'teams', id), async snap => {
      if (!snap.exists()) return
      const remote = snap.data() as Team
      // Only update if remote is newer than local
      const local = await db.teams.get(id)
      if (!local || remote.updatedAt > local.updatedAt) {
        await db.teams.put(remote)
      }
    })
    return unsub
  }, [id])

  if (team === undefined) return <div className="p-8 text-ink-muted">{t('common.loading')}</div>
  if (!team) return <div className="p-8 text-ink-muted">{t('teamDetail.notFound')}</div>

  const isOwner = team.ownerId === user?.id
  const myRole: TeamMemberRole = isOwner ? 'owner' :
    (team.members.find(m => m.userId === user?.id || m.email === user?.email)?.role ?? 'reader')

  const saveTeam = async (updated: Team) => {
    await db.teams.put(updated)
    if (firebaseConfigured) {
      try { await syncTeam(updated) } catch { /* will retry on next sync */ }
    }
  }

  const startEditInfo = () => {
    setEditName(team.name)
    setEditDesc(team.description ?? '')
    setEditingInfo(true)
  }

  const saveInfo = async () => {
    const name = editName.trim()
    if (!name) return
    const updated: Team = {
      ...team,
      name,
      description: editDesc.trim() || undefined,
      updatedAt: Date.now(),
    }
    await saveTeam(updated)
    setEditingInfo(false)
  }

  const handleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase()
    if (!email || !email.includes('@')) { setInviteError(t('teamDetail.invalidEmail')); return }
    if (team.ownerId === user?.id && email === user.email) { setInviteError(t('teamDetail.thatsYou')); return }
    if (team.members.some(m => m.email === email)) { setInviteError(t('teamDetail.alreadyMember')); return }
    if (team.invites.some(i => i.email === email)) { setInviteError(t('teamDetail.alreadyInvited')); return }

    const invite: TeamInvite = { email, role: inviteRole, invitedAt: Date.now() }
    const updated: Team = {
      ...team,
      invites: [...team.invites, invite],
      updatedAt: Date.now(),
    }
    await saveTeam(updated)
    setInviteEmail('')
    setInviteError('')
    setShowInviteForm(false)
  }

  const handleRevokeInvite = async (email: string, token?: string) => {
    const updated: Team = {
      ...team,
      invites: team.invites.filter(i =>
        token ? i.token !== token : i.email !== email
      ),
      updatedAt: Date.now(),
    }
    await saveTeam(updated)
    if (shareInvite?.token === token) setShareInvite(null)
  }

  const generateInviteLink = async (role: 'contributor' | 'reader') => {
    if (!team) return
    setGeneratingLink(true)
    const token = generateToken()
    const invite: TeamInvite = {
      email: '',        // link-based invite has no email restriction
      role,
      invitedAt: Date.now(),
      token,
    }
    const updated: Team = {
      ...team,
      invites: [...team.invites, invite],
      updatedAt: Date.now(),
    }
    await saveTeam(updated)
    setShareInvite(invite)
    setShowSharePanel(true)
    setGeneratingLink(false)
  }

  const getInviteUrl = (inv: TeamInvite) =>
    `${APP_BASE_URL}/join/${team!.id}?token=${inv.token}`

  const copyLink = async (url: string) => {
    await navigator.clipboard.writeText(url)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  const shareViaWhatsApp = (url: string) => {
    const text = encodeURIComponent(t('teamDetail.whatsAppMessage', { team: team?.name, url }))
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  const shareViaEmail = (url: string) => {
    const subject = encodeURIComponent(t('teamDetail.emailSubject', { team: team?.name }))
    const body = encodeURIComponent(t('teamDetail.emailBody', { team: team?.name, url, name: user?.displayName }))
    window.open(`mailto:?subject=${subject}&body=${body}`)
  }

  const shareViaNative = async (url: string) => {
    if (!navigator.share) return
    await navigator.share({
      title: t('teamDetail.shareTitle', { team: team?.name }),
      text: t('teamDetail.shareText', { team: team?.name }),
      url,
    })
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm(t('teamDetail.removeMemberConfirm'))) return
    const updated: Team = {
      ...team,
      members: team.members.filter(m => m.userId !== memberId),
      updatedAt: Date.now(),
    }
    await saveTeam(updated)
  }

  const handleChangeRole = async (memberId: string, role: 'contributor' | 'reader') => {
    const updated: Team = {
      ...team,
      members: team.members.map(m => m.userId === memberId ? { ...m, role } : m),
      updatedAt: Date.now(),
    }
    await saveTeam(updated)
  }

  const handleDeleteTeam = async () => {
    if (!confirm(t('teamDetail.deleteConfirm', { team: team.name }))) return
    await db.teams.delete(team.id)
    navigate('/teams')
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/teams')} className="text-ink-muted hover:text-ink">
          <ArrowLeft size={18} />
        </button>

        {editingInfo ? (
          <div className="flex-1 space-y-1.5">
            <input
              autoFocus
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveInfo(); if (e.key === 'Escape') setEditingInfo(false) }}
              className="w-full bg-surface-2 border border-chord/40 rounded-lg px-3 py-1.5 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-chord/60"
            />
            <input
              value={editDesc}
              onChange={e => setEditDesc(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setEditingInfo(false) }}
              placeholder={t('teams.descriptionPlaceholder')}
              className="w-full bg-surface-2 border border-surface-3 rounded-lg px-3 py-1.5 text-xs text-ink-muted focus:outline-none focus:ring-1 focus:ring-chord/60"
            />
            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={saveInfo} disabled={!editName.trim()}>{t('common.save')}</Button>
              <Button variant="ghost" size="sm" onClick={() => setEditingInfo(false)}>{t('common.cancel')}</Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-w-0 group">
            <div className="flex items-center gap-1.5">
              <h1 className="text-lg font-semibold truncate">{team.name}</h1>
              {isOwner && (
                <button
                  onClick={startEditInfo}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-ink-faint hover:text-ink p-0.5 shrink-0"
                  title={t('teamDetail.editInfo')}
                >
                  <Pencil size={13} />
                </button>
              )}
            </div>
            {team.description && <p className="text-xs text-ink-muted">{team.description}</p>}
          </div>
        )}

        {!editingInfo && isOwner && (
          <div className="flex gap-2 shrink-0">
            <Button variant="primary" size="sm" onClick={() => setShowSharePanel(v => !v)}>
              <Share2 size={14} />
              {t('teamDetail.shareLink')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowInviteForm(v => !v)}>
              <UserPlus size={14} />
              {t('teamDetail.byEmail')}
            </Button>
          </div>
        )}
      </div>

      {/* Share invite link panel */}
      {showSharePanel && isOwner && (
        <div className="bg-surface-1 rounded-xl p-4 space-y-4 border border-chord/20">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">{t('teamDetail.inviteViaLink')}</h2>
            <button onClick={() => setShowSharePanel(false)} className="text-ink-faint hover:text-ink text-xs">✕</button>
          </div>
          <p className="text-xs text-ink-muted">
            {t('teamDetail.linkHint')}
          </p>

          {!shareInvite ? (
            <div className="space-y-2">
              <p className="text-xs text-ink-faint">{t('teamDetail.chooseRole')}</p>
              <div className="flex gap-2">
                <Button
                  variant="primary" size="sm"
                  onClick={() => generateInviteLink('contributor')}
                  disabled={generatingLink}
                  className="flex-1"
                >
                  {t('teamDetail.generateContributorLink')}
                </Button>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => generateInviteLink('reader')}
                  disabled={generatingLink}
                  className="flex-1"
                >
                  {t('teamDetail.generateReaderLink')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 bg-surface-2 rounded-lg px-3 py-2">
                <Link2 size={13} className="text-ink-faint shrink-0" />
                <span className="flex-1 text-xs text-ink-muted truncate font-mono">
                  {getInviteUrl(shareInvite)}
                </span>
                <button
                  onClick={() => copyLink(getInviteUrl(shareInvite!))}
                  className="shrink-0 text-xs flex items-center gap-1 text-chord hover:text-chord/80 transition-colors"
                >
                  {linkCopied ? <CheckIcon size={13} /> : <Copy size={13} />}
                  {linkCopied ? t('setlistDetail.copied') : t('teamDetail.copy')}
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => shareViaWhatsApp(getInviteUrl(shareInvite!))}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] text-xs hover:bg-[#25D366]/20 transition-colors"
                >
                  <WhatsAppIcon />
                  WhatsApp
                </button>
                <button
                  onClick={() => shareViaEmail(getInviteUrl(shareInvite!))}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-surface-2 border border-surface-3 text-ink-muted text-xs hover:bg-surface-3 transition-colors"
                >
                  <Mail size={14} />
                  {t('teamDetail.email')}
                </button>
                {typeof navigator.share === 'function' && (
                  <button
                    onClick={() => shareViaNative(getInviteUrl(shareInvite!))}
                    className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-surface-2 border border-surface-3 text-ink-muted text-xs hover:bg-surface-3 transition-colors"
                  >
                    <Share2 size={14} />
                    {t('teamDetail.share')}
                  </button>
                )}
              </div>

              <button
                onClick={() => setShareInvite(null)}
                className="text-xs text-ink-faint hover:text-ink-muted w-full text-center py-1"
              >
                {t('teamDetail.differentLink')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Invite form */}
      {showInviteForm && isOwner && (
        <div className="bg-surface-1 rounded-xl p-4 space-y-3 border border-chord/20">
          <h2 className="text-sm font-medium">{t('teamDetail.inviteByEmail')}</h2>
          <div className="flex gap-2">
            <input
              autoFocus
              type="email"
              value={inviteEmail}
              onChange={e => { setInviteEmail(e.target.value); setInviteError('') }}
              onKeyDown={e => { if (e.key === 'Enter') handleInvite(); if (e.key === 'Escape') setShowInviteForm(false) }}
              placeholder="name@example.com"
              className="flex-1 bg-surface-2 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-chord/50"
            />
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value as 'contributor' | 'reader')}
              className="bg-surface-2 text-sm rounded-lg px-2 py-2 border border-surface-3 focus:outline-none"
            >
              <option value="contributor">{t('teams.roleLabel.contributor')}</option>
              <option value="reader">{t('teams.roleLabel.reader')}</option>
            </select>
          </div>
          {inviteError && <p className="text-xs text-red-400">{inviteError}</p>}
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={handleInvite}>{t('teamDetail.sendInvite')}</Button>
            <Button variant="ghost" size="sm" onClick={() => setShowInviteForm(false)}>{t('common.cancel')}</Button>
          </div>
          <p className="text-xs text-ink-faint">
            {t('teamDetail.inviteHint')}
          </p>
        </div>
      )}

      {/* Members */}
      <section>
        <h2 className="text-xs text-ink-faint uppercase tracking-wider mb-2">{t('teamDetail.members')}</h2>
        <div className="bg-surface-1 rounded-xl divide-y divide-surface-3">
          {/* Owner row */}
          <MemberRow
            displayName={team.ownerDisplayName}
            email={team.ownerEmail}
            role="owner"
            isOwner={isOwner}
            isCurrentUser={team.ownerId === user?.id}
            canManage={false}
            onChangeRole={() => {}}
            onRemove={() => {}}
          />
          {/* Other members */}
          {team.members.map(member => (
            <MemberRow
              key={member.userId}
              displayName={member.displayName}
              email={member.email}
              role={member.role}
              isOwner={isOwner}
              isCurrentUser={member.userId === user?.id}
              canManage={isOwner && member.userId !== user?.id}
              onChangeRole={role => handleChangeRole(member.userId, role)}
              onRemove={() => handleRemoveMember(member.userId)}
            />
          ))}
        </div>
      </section>

      {/* Pending invites */}
      {team.invites.length > 0 && (
        <section>
          <h2 className="text-xs text-ink-faint uppercase tracking-wider mb-2">{t('teamDetail.pendingInvites')}</h2>
          <div className="bg-surface-1 rounded-xl divide-y divide-surface-3">
            {team.invites.map((invite, i) => (
              <div key={invite.token ?? invite.email ?? i} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  {invite.token ? (
                    <div className="text-sm text-ink-muted flex items-center gap-1.5">
                      <Link2 size={12} className="shrink-0" />
                      {t('teamDetail.linkInvite')}
                    </div>
                  ) : (
                    <div className="text-sm font-mono truncate">{invite.email}</div>
                  )}
                  <div className="text-xs text-ink-faint">{t(roleLabelKey(invite.role))} · {new Date(invite.invitedAt).toLocaleDateString()}</div>
                </div>
                {isOwner && (
                  <button
                    onClick={() => handleRevokeInvite(invite.email, invite.token)}
                    className="p-1.5 text-ink-faint hover:text-red-400 rounded"
                    title={t('teamDetail.revokeInvite')}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Role guide */}
      <section>
        <h2 className="text-xs text-ink-faint uppercase tracking-wider mb-2">{t('teamDetail.roles')}</h2>
        <div className="bg-surface-1 rounded-xl px-4 py-3 space-y-1.5 text-xs text-ink-muted">
          {(['owner', 'contributor', 'reader'] as const).map(r => (
            <p key={r}><span className="text-ink font-medium">{t(roleLabelKey(r))}</span> — {t(`teamDetail.roleInfo.${r}`)}</p>
          ))}
        </div>
      </section>

      {/* My role (if not owner) */}
      {!isOwner && (
        <div className="text-xs text-ink-faint text-center">
          {t('teamDetail.yourRole')} <span className="text-ink">{t(roleLabelKey(myRole))}</span>
        </div>
      )}

      {/* Danger zone */}
      {isOwner && (
        <section>
          <h2 className="text-xs text-ink-faint uppercase tracking-wider mb-2">{t('teamDetail.dangerZone')}</h2>
          <div className="bg-surface-1 rounded-xl px-4 py-3 space-y-3">
            <p className="text-xs text-ink-muted">{t('teamDetail.deleteHint')}</p>
            <Button variant="danger" size="sm" onClick={handleDeleteTeam}>
              <Trash2 size={14} />
              {t('teamDetail.deleteTeam')}
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}

// ─── Member row component ─────────────────────────────────────────────────────

interface MemberRowProps {
  displayName: string
  email: string
  role: TeamMemberRole
  isOwner: boolean
  isCurrentUser: boolean
  canManage: boolean
  onChangeRole: (role: 'contributor' | 'reader') => void
  onRemove: () => void
}

function MemberRow({ displayName, email, role, isCurrentUser, canManage, onChangeRole, onRemove }: MemberRowProps) {
  const { t } = useTranslation()
  const [showMenu, setShowMenu] = useState(false)

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-7 h-7 rounded-full bg-chord/20 flex items-center justify-center text-chord text-xs font-bold shrink-0">
        {displayName[0]?.toUpperCase() ?? '?'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm flex items-center gap-1.5">
          {displayName}
          {isCurrentUser && <span className="text-xs text-ink-faint">{t('teamDetail.you')}</span>}
          {role === 'owner' && <Crown size={11} className="text-chord shrink-0" />}
        </div>
        <div className="text-xs text-ink-faint truncate">{email}</div>
      </div>
      {canManage ? (
        <div className="relative">
          <button
            onClick={() => setShowMenu(v => !v)}
            className="flex items-center gap-1 text-xs text-ink-muted hover:text-ink bg-surface-2 border border-surface-3 rounded px-2 py-1"
          >
            {t(roleLabelKey(role))}
            <ChevronDown size={11} />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 bg-surface-2 border border-surface-3 rounded-lg shadow-xl py-1 min-w-[120px]">
                {(['contributor', 'reader'] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => { onChangeRole(r); setShowMenu(false) }}
                    className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-surface-3 ${role === r ? 'text-chord' : 'text-ink'}`}
                  >
                    {t(roleLabelKey(r))}
                  </button>
                ))}
                <hr className="border-surface-3 my-1" />
                <button
                  onClick={() => { onRemove(); setShowMenu(false) }}
                  className="block w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-surface-3"
                >
                  {t('teamDetail.remove')}
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <span className="text-xs text-ink-faint px-2 py-1">{t(roleLabelKey(role))}</span>
      )}
    </div>
  )
}

function WhatsAppIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.127 1.528 5.856L.057 23.885a.5.5 0 0 0 .614.614l6.115-1.498A11.932 11.932 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.894 0-3.668-.523-5.178-1.432l-.37-.219-3.832.938.962-3.74-.24-.386A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
    </svg>
  )
}
