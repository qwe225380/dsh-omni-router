'use strict'

function paginate(items, pageSize, page) {
  const start = (page - 1) * pageSize
  // BUG: off-by-one — the last page should include items up to items.length,
  // not items.length - 1.
  const end = Math.min(start + pageSize, items.length - 1)
  return items.slice(start, end)
}

module.exports = { paginate }