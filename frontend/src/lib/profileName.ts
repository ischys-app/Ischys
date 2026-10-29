/**
 * The display name shown on the Profile screen. There is no account, and iOS no
 * longer exposes the device owner's name to apps, so the user sets it themselves.
 *
 * It lives in the profiles registry (#117), on the active profile's row. The
 * owner's name used to be kept in SecureStore (`ischys.profile.name`); launch
 * copies it into the registry once (`ensureOwnerProfile`) and nothing writes
 * that key any more.
 */
import { updateProfile } from '../data/profilesRepo';
import { deriveInitials } from '../domain/profiles';
import { activeProfile, DEFAULT_NAME, profileCount, setActiveProfile } from './activeProfile';

export { DEFAULT_NAME };

/** The active profile's name (`DEFAULT_NAME` until the owner sets one). */
export function getProfileName(): string {
  return activeProfile().name;
}

/** Persist the active profile's name and initials; empty falls back to the default. */
export async function setProfileName(name: string): Promise<void> {
  const v = name.trim() || DEFAULT_NAME;
  const id = activeProfile().id;
  const initials = deriveInitials(v);
  await updateProfile(id, { name: v, initials });
  // Unless a switch landed while the write ran, show the new name at once.
  const current = activeProfile();
  if (current.id === id) setActiveProfile({ ...current, name: v, initials }, profileCount());
}

/**
 * Renames any profile, or changes its initials (Manage, P8). When it is the
 * active profile the in-memory row follows, so the tab label and avatar
 * update at once.
 */
export async function updateProfileIdentity(id: string, patch: { name?: string; initials?: string }): Promise<void> {
  await updateProfile(id, patch);
  const current = activeProfile();
  if (current.id === id) setActiveProfile({ ...current, ...patch }, profileCount());
}
