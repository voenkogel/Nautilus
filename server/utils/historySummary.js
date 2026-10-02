// Server-side reduction of raw status history into what the history overview
// actually renders: a fixed number of timeline buckets plus uptime/outage/
// response stats per node. Mirrors computeStats() and the UptimeTimeline
// bucketing in src/components/history so both views agree.

export const HISTORY_BUCKETS = 160;

// Bucket priority: offline > backup > online > checking > empty.
const RANK = { empty: 0, checking: 1, online: 2, backup: 3, offline: 4 };
const BY_RANK = ['empty', 'checking', 'online', 'backup', 'offline'];

export function createNodeAccumulator() {
  return {
    ranks: new Uint8Array(HISTORY_BUCKETS),
    checked: 0,
    online: 0,
    outages: 0,
    prevChecked: null,
    rtSum: 0,
    rtCount: 0,
    records: 0,
  };
}

/** Feed one row (rows for a node must arrive in timestamp order). */
export function accumulate(acc, status, timestamp, responseTime, sinceMs, nowMs) {
  acc.records++;
  if (timestamp >= sinceMs && timestamp < nowMs) {
    const bucketMs = (nowMs - sinceMs) / HISTORY_BUCKETS;
    const idx = Math.min(HISTORY_BUCKETS - 1, Math.floor((timestamp - sinceMs) / bucketMs));
    const rank = RANK[status] ?? RANK.checking;
    if (idx >= 0 && rank > acc.ranks[idx]) acc.ranks[idx] = rank;
  }
  // 'checking' is transient and 'backup' is planned downtime — neither counts
  // toward uptime or outages.
  if (status !== 'checking' && status !== 'backup') {
    acc.checked++;
    if (status === 'online') acc.online++;
    if (acc.prevChecked === 'online' && status === 'offline') acc.outages++;
    acc.prevChecked = status;
  }
  if (status === 'online' && responseTime != null) {
    acc.rtSum += responseTime;
    acc.rtCount++;
  }
}

export function finalizeNode(acc) {
  return {
    buckets: Array.from(acc.ranks, r => BY_RANK[r]),
    recordCount: acc.records,
    stats: {
      uptimePercent: acc.checked ? (acc.online / acc.checked) * 100 : null,
      outageCount: acc.outages,
      avgResponseTime: acc.rtCount ? Math.round(acc.rtSum / acc.rtCount) : null,
    },
  };
}

/** Aggregate stats across several node accumulators. */
export function combineStats(accs) {
  let checked = 0, online = 0, outages = 0, rtSum = 0, rtCount = 0;
  for (const a of accs) {
    checked += a.checked; online += a.online; outages += a.outages;
    rtSum += a.rtSum; rtCount += a.rtCount;
  }
  return {
    uptimePercent: checked ? (online / checked) * 100 : null,
    outageCount: outages,
    avgResponseTime: rtCount ? Math.round(rtSum / rtCount) : null,
  };
}
