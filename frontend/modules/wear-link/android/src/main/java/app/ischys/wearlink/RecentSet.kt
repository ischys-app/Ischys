package app.ischys.wearlink

/**
 * Remembers the last few things seen, to tell a repeat from a first sighting.
 *
 * A queued Watch action can be handed over twice: by the Data Layer as it
 * syncs, and by the sweep the app makes when it opens. Whichever comes second
 * must do nothing — a finish applied twice would end the next workout too.
 *
 * Bounded, so a process that lives for weeks does not grow; the two sightings
 * of one item are moments apart, never `capacity` items apart.
 */
internal class RecentSet(private val capacity: Int = 64) {
  private val seen = LinkedHashSet<String>()

  /** True the first time `key` is given, false on a repeat. */
  @Synchronized
  fun add(key: String): Boolean {
    if (!seen.add(key)) return false
    if (seen.size > capacity) seen.remove(seen.first())
    return true
  }
}
